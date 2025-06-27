import { computed, defineComponent, h, onMounted, onUnmounted, ref } from 'vue'; // defineComponent 的主要功能是提供类型检查
import { FFmpegFilterDetail, FilterLine, FilterNode } from '@common/types';
import { associateNodesAndDetails, associateNodesAndLines, filtersList } from '@common/params/filter';
import { useAppStore } from '@renderer/stores/appStore';
import { useTooltip } from "@renderer/common/tooltipUtil";
import { randomString } from '@common/utils';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { numberValidator } from '@renderer/components/validatorAndFixer';
import { showLocalLibrary } from '@renderer/components/misc/LocalLibrary';
import showMenu, { MenuItem } from '@renderer/components/Menu/Menu';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import NormalInput from '@renderer/components/NormalInput/NormalInput.vue';
import DropdownInput from '@renderer/components/DropdownInput/DropdownInput.vue';
import style from './EffectView.module.less';
import Msgbox from '@renderer/components/Msgbox/Msgbox';

const RenameLinePanel = defineComponent((props: { line: FilterLine, isInput: boolean, originalValue: string, exportFunctions: (fs: any) => void }) => {
	const inputValue = ref<string>('');
	const mediaTypeValue = ref<string>('');
	const mediaIndexValue = ref<string>('');

	const exports = {
		exportData: async () => {
			return {
				input: inputValue.value,
				mediaType: mediaTypeValue.value,
				mediaIndex: mediaIndexValue.value,
			};
		}
	};

	onMounted(() => {
		props.exportFunctions(exports);
		if (props.isInput) {
			const splitted = props.originalValue.split(':');
			mediaTypeValue.value = splitted[1];
			mediaIndexValue.value = splitted[2] ?? '';
		} else {
			inputValue.value = props.originalValue;
		}
	});

	return () => props.isInput ? (
		<div class={style.renamePanel}>
			<DropdownInput
				text={mediaTypeValue.value}
				list={[ { type: 'normal', value: 'v', label: '视频' }, { type: 'normal', value: 'a', label: '音频' } ]}
				validator={(value) => ['v', 'a'].includes(value) ? undefined : '错误' }
				onChange={(value) => mediaTypeValue.value = value}
			/>
			<NormalInput value={mediaIndexValue.value} onChange={(value) => mediaIndexValue.value = value} validator={numberValidator.integerEmptyable} placeholder="流编号（不填则代表第一个）" />
		</div>
	) : (
		<div class={style.renamePanel}>
			<NormalInput value={inputValue.value} onChange={(value) => inputValue.value = value} />
		</div>
	)
}, {
	props: ['line', 'isInput', 'originalValue', 'exportFunctions'],
});

interface Props {
	editingOutputIndex: number;
}

const EffectView = defineComponent((props: Props) => {
	const appStore = useAppStore();
	const dragger1Pos = ref(20);
	const dragger2Pos = ref(80);
	const filterText = ref('');
	const canvasOffset = ref([0, 0]);	// 默认情况下，画面的 [0, 0] 显示在画布中心，此处表示画布级别（缩放前）的偏移量
	const canvasScale = ref(1);
	const canvasRef = ref<HTMLDivElement>();
	const creatingLine = ref<Partial<FilterLine>>();

	const filterParams = computed(() => appStore.globalParams.filter);

	// 滤镜列表搜索过滤结果
	const filteredFilterList = computed(() => filterText.value.length ? filtersList.filter((filter) => filter.name.includes(filterText.value)) : filtersList);

	// 画布变换
	const canvasTransform = computed(() => {
		if (!canvasRef.value) {
			return '';
		}
		// const transformX = centerOffset.value[0] + canvasSize.value[0] / 2;
		// const transformY = centerOffset.value[1] + canvasSize.value[1] / 2;
		const transformX = canvasOffset.value[0];
		const transformY = canvasOffset.value[1];
		// console.log(Math.round(transformX), Math.round(transformY), canvasScale.value.toFixed(3));
		return `scale(${canvasScale.value}) translate(${transformX}px, ${transformY}px)`;
	});

	const nodes = computed(() => filterParams.value.nodes);

	const lines = computed(() => {
		return [...filterParams.value.lines, creatingLine.value].filter(o => o);
	});

	// 重置为初始节点
	const initNodes = () => {
		filterParams.value.nodes = [
			...appStore.globalParams.input.files.map((file, index) => ({
				id: index,
				name: `in_${index}`,
				params: {},
				x: -240,
				y: -30 + index * 60,
			})),
			...new Array(appStore.globalParams.outputs.length).fill({}).map((_, index) => ({
				id: index + appStore.globalParams.input.files.length,
				name: `out_${index}`,
				params: {},
				x: 240,
				y: -30 + index * 60,
			})),
		];
		filterParams.value.lines = [];
	};

	// 坐标转换函数
	const convertPageXYtoLogicalXY = (pageX: number, pageY: number) => {
		const canvasRect = canvasRef.value.parentElement.getBoundingClientRect();

		// 获取所在点显示位置（以画布 DOM 元素中心为原点）
		const mouseX = (pageX - canvasRect.left) - canvasRect.width / 2;
		const mouseY = (pageY - canvasRect.top) - canvasRect.height / 2;

		// 获取所在点逻辑位置
		const offsetToOriginX = (mouseX - canvasOffset.value[0] * canvasScale.value) / canvasScale.value;
		const offsetToOriginY = (mouseY - canvasOffset.value[1] * canvasScale.value) / canvasScale.value;

		return [offsetToOriginX, offsetToOriginY];
	};
	const getPageXYfromEvent = (event: MouseEvent | TouchEvent) => ([
		(event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX,
		(event as MouseEvent).pageY ?? (event as TouchEvent).touches[0].pageY,
	]);
	const getLogicalXYfromEvent = (event: MouseEvent | TouchEvent) => {
		const pageXY = getPageXYfromEvent(event);
		return convertPageXYtoLogicalXY(pageXY[0], pageXY[1]);
	};

	// 节点端口数量和高度计算
	const getNodeInputPoints: (node: FilterNode) => { type: 'V' | 'A' | 'N' | 'U' }[] = (node) => {
		// {/* <i>如果 detail 已引用，就能知道有多少输入输出口。如果类型是动态接口数量，还需要看 prevs/nexts 的数量</i>
		// <i>输入/输出节点不会有 detail 引用，但能从 name 判断出来</i> */}
		if (node.detail) {
			if (node.detail.inputType === '|') {
				return [];
			} else if (node.detail.inputType === 'N') {
				return new Array((node.prevs ?? []).length + 1).fill(
					{ type: node.detail.inputType },
				);
			} else {
				return node.detail.inputType.split('').map((type) => ({ type }));
			}
		} else if (node.name.match(/out_\d+/)) {
			return new Array(node.prevs.filter((line) => line).length + 1).fill({ type: 'U' });
		}
		return [];
	};
	const getNodeOutputPoints: (node: FilterNode) => { type: 'V' | 'A' | 'N' | 'U' }[] = (node) => {
		// {/* <i>如果 detail 已引用，就能知道有多少输入输出口。如果类型是动态接口数量，还需要看 prevs/nexts 的数量</i>
		// <i>输入/输出节点不会有 detail 引用，但能从 name 判断出来</i> */}
		if (node.detail) {
			if (node.detail.outputType === '|') {
				return [];
			} else if (node.detail.outputType === 'N') {
				return new Array((node.nexts ?? []).length + 1).fill(
					{ type: node.detail.outputType },
				);
			} else {
				return node.detail.outputType.split('').map((type) => ({ type }));
			}
		} else if (node.name.match(/in_\d+/)) {
			return new Array(node.nexts.filter((line) => line).length + 1).fill({ type: 'U' });
		}
		return [];
	};
	const getNodeHeight = (node: FilterNode) => {
		const inCount = getNodeInputPoints(node).length;
		const outCount = getNodeOutputPoints(node).length;
		const count = Math.max(inCount, outCount);
		return count * 15 + 15;
	};

	// 计算所有 line 的 XY 坐标，仅在进入页面时算一遍
	const calcAllLineXY = () => {
		// 先将 nodes 转换为映射，方便后续查找
		const nodeMap: Record<number, FilterNode> = {};
		filterParams.value.nodes.forEach(node => {
			nodeMap[node.id] = node;
		});
		// 然后用 line 将 node 连接起来
		for (const line of filterParams.value.lines) {
			if (!line) {
				continue;
			}	
			// 找 node
			const fromNode = nodeMap[line.prevNodeId];
			const toNode = nodeMap[line.nextNodeId];
			if (!fromNode || !toNode) {
				console.warn(`滤镜线段 ${line} 连接的节点不存在：${fromNode}, ${toNode}`);
				continue;
			}
			// 计算线的位置
			const prevOutputPoints = getNodeOutputPoints(fromNode);
			const nextInputPoints = getNodeInputPoints(toNode);
			const maxPrevOutputPointsIndexHalf = (prevOutputPoints.length - 1) / 2;
			const maxNextInputPointsIndexHalf = (nextInputPoints.length - 1) / 2;
			line.prevXY = [fromNode.x + 45, fromNode.y + 15 * (line.prevNodePortIndex - maxPrevOutputPointsIndexHalf)];
			line.nextXY = [toNode.x - 45, toNode.y + 15 * (line.nextNodePortIndex - maxNextInputPointsIndexHalf)];
		}
	};
	
	// 检查坐标点是否在某个端口上（由于调用方是拉线函数，所以如果端口已被连接，就不返回端口，避免占用同一个口）
	const checkIsPointOnNode = (pageX: number, pageY: number) => {
		const [logicalX, logicalY] = convertPageXYtoLogicalXY(pageX, pageY);

		for (const node of nodes.value) {
			// 计算线的位置
			const inputPoints = getNodeInputPoints(node);
			const outputPoints = getNodeOutputPoints(node);
			const maxInputPointsIndexHalf = (inputPoints.length - 1) / 2;
			const maxOutputPointsIndexHalf = (outputPoints.length - 1) / 2;

			for (let i = 0; i < inputPoints.length; i++) {
				if (node.prevs?.[i]) {
					continue;
				}
				const portX = node.x - 45;
				const portY = node.y + 15 * (i - maxInputPointsIndexHalf);
				if (Math.abs(logicalX - portX) <= 5 && Math.abs(logicalY - portY) <= 5) {
					return { x: node.x - 45, y: node.y + 15 * (i - maxInputPointsIndexHalf), type: 'input', index: i, node };
				}
			}
			for (let i = 0; i < outputPoints.length; i++) {
				if (node.nexts?.[i]) {
					continue;
				}
				const portX = node.x + 45;
				const portY = node.y + 15 * (i - maxOutputPointsIndexHalf);
				if (Math.abs(logicalX - portX) <= 5 && Math.abs(logicalY - portY) <= 5) {
					return { x: node.x + 45, y: node.y + 15 * (i - maxOutputPointsIndexHalf), type: 'output', index: i, node };
				}
			}
		}
	};

	// 在移动节点、（可变节点的）增删节点或者增删线段时修正端口上的线的位置
	const fixNodePortPosition = (node: FilterNode) => {
		const outputPoints = getNodeOutputPoints(node);
		const inputPoints = getNodeInputPoints(node);
		const maxOutputPointsIndexHalf = (outputPoints.length - 1) / 2;
		const maxInputPointsIndexHalf = (inputPoints.length - 1) / 2;
		for (let i = 0; i < node.prevs.length; i++) {
			const line = node.prevs[i];
			if (line) {
				line.nextXY = [node.x - 45, node.y + 15 * (i - maxInputPointsIndexHalf)];
			}
		}
		for (let i = 0; i < node.nexts.length; i++) {
			const line = node.nexts[i];
			if (line) {
				line.prevXY = [node.x + 45, node.y + 15 * (i - maxOutputPointsIndexHalf)];
			}
		}
	};

	// 分割器
	const handleCenterDraggerDragStart = (event: MouseEvent | TouchEvent, n: 1 | 2) => {
		const mainAreaRect = event.target.parentElement.getBoundingClientRect();
		const inElementX = (event as MouseEvent).offsetX ?? (event as TouchEvent).touches[0].offsetX;	// 鼠标在元素内的 X
		// 添加鼠标事件捕获
		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const mouseX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;	// 鼠标在窗口内的 X
			let listPercent = (mouseX - inElementX + 8) / mainAreaRect.width;
			if (n === 1) {
				listPercent = Math.min(Math.max(listPercent, 0.01), 0.4);
				dragger1Pos.value = listPercent * 100;
			} else {
				listPercent = Math.min(Math.max(listPercent, 0.4), 0.99);
				dragger2Pos.value = listPercent * 100;
			}
		}
		let handleMouseUp = () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('touchmove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('touchend', handleMouseUp);
		}
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('touchend', handleMouseUp);
	};

	// 画布拖动
	const handleCanvasMouseDown = (event: MouseEvent | TouchEvent) => {
		event.preventDefault();
		const [mouseDownX, mouseDownY] = getPageXYfromEvent(event);
		const initialCenterOffset = [...canvasOffset.value];	// 记录初始 canvasOffset
		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const [currentX, currentY] = getPageXYfromEvent(event as any);
			const newCenterOffset = [
				initialCenterOffset[0] + (currentX - mouseDownX) / canvasScale.value,
				initialCenterOffset[1] + (currentY - mouseDownY) / canvasScale.value,
			];
			if (newCenterOffset[0] !== lastValue[0] || newCenterOffset[1] !== lastValue[1]) {
				canvasOffset.value = newCenterOffset;
				lastValue = [...newCenterOffset];
			}
		}
		const handleMouseUp = (event: MouseEvent | TouchEvent) => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		let lastValue = [...initialCenterOffset];
	}

	// 画布缩放
	const handleCanvasWheel = (event: WheelEvent) => {
		const oldScale = canvasScale.value;
		let newScale = 2 ** (0.0025 * -event.deltaY) * oldScale;
		newScale = Math.min(10, Math.max(0.1, newScale)); // 缩放倍率限制：0.1 ~ 10
		canvasScale.value = newScale;

		const canvasRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// 获取缩放点显示位置
		const mouseX = (event.pageX - canvasRect.left) - canvasRect.width / 2;
		const mouseY = (event.pageY - canvasRect.top) - canvasRect.height / 2;

		// 获取缩放点逻辑位置
		const logicalX = (mouseX - canvasOffset.value[0] * oldScale) / oldScale;
		const logicalY = (mouseY - canvasOffset.value[1] * oldScale) / oldScale;
		// console.log(mouseX, offsetToOriginX);

		// 假设画布原偏移 -10，缩放 2.0。那么画布原点会显示在 -20
		// 假设我缩放点在逻辑 50 位置，那么会显示在 80（因为逻辑位置 50 + 偏移 -10，然后乘缩放）
		// 此时将缩放提到 4.0。要想缩放后缩放点显示位置保持 80，缩放点到逻辑原点的显示距离会从 100 升到 200，得出新的原点显示位置 -120
		// 但是注意到 -120 是缩放后才获得的，现在我们需要缩放前的数字，也就得到 -30。这是新的画布偏移。
		// 因此实际算法是：已知原缩放点显示位置，另求原逻辑原点显示位置（偏移量 * 原缩放）。新的逻辑原点显示位置是 原缩放点显示位置 - 原缩放点逻辑未知 * 新缩放，得到新原点的显示位置后 / 新缩放，得到新原点的逻辑位置

		// 逻辑原点显示位置（偏移量 * 原缩放）（不用求）
		// const oldOriginDisplayX = canvasOffset.value[0] * oldScale;
		// const oldOriginDisplayY = canvasOffset.value[1] * oldScale;

		// 新的逻辑原点显示位置是 缩放点显示位置 - 原缩放点逻辑位置 * 新缩放
		const newOriginDisplayX = mouseX - logicalX * newScale;
		const newOriginDisplayY = mouseY - logicalY * newScale;

		// 新的逻辑原点逻辑位置是显示位置 / 缩放
		const newOriginX = newOriginDisplayX / newScale;
		const newOriginY = newOriginDisplayY / newScale;
		// console.log(newOriginX, oldScale, newScale);
		canvasOffset.value = [newOriginX, newOriginY];
	};

	// 节点拖动
	const handleNodeMouseDown = (event: MouseEvent | TouchEvent, node: FilterNode) => {
		event.stopImmediatePropagation();	// 防止拖动画布

		const canvasRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// 获取鼠标按下点显示位置
		const [pageX, pageY] = getPageXYfromEvent(event);
		const mouseDownX = (pageX - canvasRect.left) - canvasRect.width / 2;
		const mouseDownY = (pageY - canvasRect.top) - canvasRect.height / 2;

		// 节点原本的 xy
		const initXY = [node.x, node.y];

		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			// 获取鼠标按下点显示位置
			const [pageX, pageY] = getPageXYfromEvent(event as any);
			const mouseCurrX = (pageX - canvasRect.left) - canvasRect.width / 2;
			const mouseCurrY = (pageY - canvasRect.top) - canvasRect.height / 2;
			// 通过偏移计算出新位置
			let newX = initXY[0] + (mouseCurrX - mouseDownX) / canvasScale.value;
			let newY = initXY[1] + (mouseCurrY - mouseDownY) / canvasScale.value;
			// 取整吸附
			newX = Math.round(newX / 30) * 30;
			newY = Math.round(newY / 30) * 30;
			if (newX !== lastValue[0] || newY !== lastValue[1]) {
				node.x = newX;
				node.y = newY;
				lastValue = [newX, newY];
				fixNodePortPosition(node);
			}
		};

		const handleMouseUp = (event: MouseEvent | TouchEvent) => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		let lastValue = [node.x, node.y];
	};

	// 节点右键
	const handleNodeContextMenu = (event: MouseEvent, node: FilterNode) => {
		const handleDeleteNode = () => {
			const nodeIndex = filterParams.value.nodes.findIndex((n) => n.id === node.id);
			filterParams.value.nodes.splice(nodeIndex, 1);
			// 删除前连接线的同时，要把连接线前的节点的占用端口释放
			for (const line of node.prevs) {
				const prevNode = filterParams.value.nodes.find((node) => node.id === line.prevNodeId);
				prevNode.nexts.splice(line.prevNodePortIndex, 1);
				let needToFixPrevNodePort = prevNode.name.match(/^in_\d+$/) || ['U', 'N'].includes(prevNode.detail.outputType[0]);	// 需要修复的第一个条件是端口数量是动态的（isPrevNodeOutputOrUN）
				// 前连接线连接的节点的输出端口清除后，在其后面的端口会往前挪一位。这会导致这个端口往后的所有【线段】所记录的 portIndex 都 -1
				for (let i = line.prevNodePortIndex; i < prevNode.prevs.length; i++) {
					prevNode.nexts[i].prevNodePortIndex--;
					needToFixPrevNodePort = true;
				}
				if (needToFixPrevNodePort) {
					fixNodePortPosition(prevNode);
				}
			}
			// 删除后连接线的同时，要把连接线后的节点的占用端口释放
			for (const line of node.nexts) {
				const nextNode = filterParams.value.nodes.find((node) => node.id === line.nextNodeId);
				nextNode.prevs.splice(line.nextNodePortIndex, 1);
				let needToFixNextNodePort = nextNode.name.match(/^out_\d+$/) || ['U', 'N'].includes(nextNode.detail.inputType[0]);	// 需要修复的第一个条件是端口数量是动态的（isNextNodeOutputOrUN）
				// 后连接线连接的节点的输入端口清除后，在其后面的端口会往前挪一位。这会导致这个端口往后的所有【线段】所记录的 portIndex 都 -1
				for (let i = line.nextNodePortIndex; i < nextNode.prevs.length; i++) {
					nextNode.prevs[i].nextNodePortIndex--;
					needToFixNextNodePort = true;
				}
				if (needToFixNextNodePort) {
					fixNodePortPosition(nextNode);
				}
			}
			filterParams.value.lines = filterParams.value.lines.filter((line) => line && !(line.prevNodeId === node.id || line.nextNodeId === node.id));
		};
		const inputNodeIndexStr = node.name.match(/^in_\d+$/) ? node.name.match(/^in_(\d+)$/)[1] : undefined;
		showMenu({
			menu: [
				{ type: 'normal' as const, label: inputNodeIndexStr ? appStore.globalParams.input.files[+inputNodeIndexStr]?.filePath : node.name, value: 'nodeName', disabled: true },
				{ type: 'separator' },
				node.name.match(/^in_\d+$/)
					? { type: 'normal' as const, label: '不可删除', value: '删除节点', tooltip: '请通过输入面板调整输入文件数量，滤镜面板中不可进行此操作', disabled: true }
					: { type: 'normal' as const, label: '删除节点', value: '删除节点', onClick: handleDeleteNode },
			],
			type: 'action',
			triggerRect: { xMin: event.pageX, xMax: event.pageX, yMin: event.pageY, yMax: event.pageY },
		});
	};

	// 端点拖动创建线段
	const handlePortMouseDown = (event: MouseEvent | TouchEvent, node: FilterNode, type: 'input' | 'output', index: number) => {
		event.stopPropagation();
		const [mouseDownPageX, mouseDownPageY] = getPageXYfromEvent(event);
		const portPosition = checkIsPointOnNode(mouseDownPageX, mouseDownPageY);
		creatingLine.value = {
			prevNodeId: type === 'output' ? node.id : undefined,
			prevNodePortIndex: type === 'output' ? index : undefined,
			nextNodeId: type === 'input' ? node.id : undefined,
			nextNodePortIndex: type === 'input' ? index : undefined,
			prevXY: [portPosition.x, portPosition.y],
			nextXY: [portPosition.x, portPosition.y],
			type: (type === 'input' ? (node.detail?.inputType[index] ?? node.detail?.inputType[0]) : (node.detail?.outputType[index] ?? node.detail?.outputType[0])) as any ?? 'U',
			invisiblePort: type === 'input' ? 'prev' : 'next',
		};
		const checkValid = (destNode: FilterNode, destIndex: number) => {
			/**
			 * 当连线从起点出发
			 * 　如果起点为“U”（输入节点）、“N”（未知，不进一步校验），终点可以是任意类型。此时连线类型为终点类型
			 * 　如果起点的输入节点有类型“V”、“A”，终点只能是“U”（输出节点）、“N”（未知，不进一步校验）、对应类型。此时连线类型按起点为准
			 * 当连线从终点出发
			 * 　如果终点为“U”（输出节点）、“N”（未知，不进一步校验），起点可以是任意类型。此时连线类型为起点类型
			 * 　如果终点的输入节点有类型“V”、“A”，起点只能是“U”（输入节点）、“N”（未知，不进一步校验）、对应类型。此时连线类型按终点为准
			 */
			if (type === 'output') {
				const prevPortType = getNodeOutputPoints(node);
				const nextPortType = getNodeInputPoints(destNode);
				if (['U', 'N'].includes(prevPortType[0].type)) {
					return nextPortType[destIndex]?.type ?? nextPortType[0].type;
				} else if (['V', 'A'].includes(prevPortType[index].type)) {
					if (['U', 'N'].includes(nextPortType[destIndex].type) || prevPortType[index].type === nextPortType[destIndex].type) {
						return prevPortType[index].type;
					}
				}
			} else {
				const prevPortType = getNodeOutputPoints(destNode);
				const nextPortType = getNodeInputPoints(node);
				if (['U', 'N'].includes(nextPortType[0].type)) {
					return prevPortType[destIndex]?.type ?? prevPortType[0].type;
				} else if (['V', 'A'].includes(nextPortType[index].type)) {
					if (['U', 'N'].includes(prevPortType[destIndex].type) || prevPortType[index].type === nextPortType[destIndex].type) {
						return nextPortType[index].type;
					}
				}
			}
		};
		const handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const [currentPageX, currentPageY] = getPageXYfromEvent(event as any);
			let currentlogicalX, currentlogicalY;
			let invisiblePort: 'prev' | 'next';
			const destPort = checkIsPointOnNode(currentPageX, currentPageY);
			if (destPort && ((type === 'input' && destPort.type === 'output') || (type === 'output' && destPort.type === 'input'))) {
				const isValid = checkValid(destPort.node, destPort.index);
				if (isValid) {
					[currentlogicalX, currentlogicalY] = [destPort.x, destPort.y];
				}
			} else {
				[currentlogicalX, currentlogicalY] = getLogicalXYfromEvent(event as any);
				invisiblePort = type === 'input' ? 'prev' : 'next';
			}
			if (type === 'input') {
				creatingLine.value.prevXY = [currentlogicalX, currentlogicalY];
			} else {
				creatingLine.value.nextXY = [currentlogicalX, currentlogicalY];
			}
			creatingLine.value.invisiblePort = invisiblePort;
		};
		const handleMouseUp = (event: Partial<MouseEvent | TouchEvent>) => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('touchmove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('touchend', handleMouseUp);
			// 检查并添加连线
			const [currentPageX, currentPageY] = getPageXYfromEvent(event as any);
			const destPort = checkIsPointOnNode(currentPageX, currentPageY);
			if (destPort && ((type === 'input' && destPort.type === 'output') || (type === 'output' && destPort.type === 'input'))) {
				const isValid = checkValid(destPort.node, destPort.index);
				const prevNode = type === 'output' ? node : destPort.node;
				const prevNodePortIndex = type === 'output' ? index : destPort.index;
				const nextNode = type === 'input' ? node : destPort.node;
				const nextNodePortIndex = type === 'input' ? index : destPort.index;
				const isPrevNodeInput = prevNode.name.match(/^in_\d+$/);
				const isNextNodeOutput = nextNode.name.match(/^out_\d+$/);
				// name 处理：如果起点节点是输入节点，那么按终点节点的类型给名称，否则是随机值
				let lineName = randomString(4);
				if (isPrevNodeInput) {
					const inputIndex = prevNode.name.match(/in_(\d)+/)[1];
					const inputType = ['U', 'N'].includes(isValid) ? undefined : isValid.toLocaleLowerCase();
					lineName = `${inputIndex}${inputType ? ':' + inputType : ''}`
				}
				const newLine = {
					name: lineName,
					prevNodeId: prevNode.id,
					prevNodePortIndex,
					nextNodeId: nextNode.id,
					nextNodePortIndex,
					prevXY: type === 'output' ? creatingLine.value.prevXY : [destPort.x, destPort.y] as [number, number],
					nextXY: type === 'input' ? creatingLine.value.nextXY : [destPort.x, destPort.y] as [number, number],
					type: isValid,
				};
				// 新增线段；节点添加线段引用
				filterParams.value.lines.push(newLine);
				const newLineIndex = filterParams.value.lines.length - 1;
				if (!prevNode.nexts) {
					prevNode.nexts = [];
				}
				prevNode.nexts[prevNodePortIndex] = newLine;
				if (!nextNode.prevs) {
					nextNode.prevs = [];
				}
				nextNode.prevs[nextNodePortIndex] = newLine;
				// 对于端口位置会变化的输入/输出节点，进行位置修正
				if (isPrevNodeInput || ['U', 'N'].includes(prevNode.detail.outputType[0])) {
					fixNodePortPosition(prevNode);
				}
				if (isNextNodeOutput || ['U', 'N'].includes(nextNode.detail.inputType[0])) {
					fixNodePortPosition(nextNode);
				}
				// 如果输出直连输入，那么马上需要定义媒体类型
				if (isPrevNodeInput && isNextNodeOutput) {
					let compFuncs: any;
					Msgbox({
						container: document.body,
						title: `选择【${prevNode.name}】媒体`,
						content: <RenameLinePanel line={newLine} isInput={true} originalValue="不重要:v" exportFunctions={(fs) => compFuncs = fs} />,
						buttons: [
							{ text: '保存', role: 'confirm', type: ButtonType.Primary, callback: async () => {
								const result = await compFuncs.exportData();
								const { input, mediaType, mediaIndex } = result;
									filterParams.value.lines[newLineIndex].name = `${lineName}:${mediaType}${mediaIndex !== '' ? `:${mediaIndex}` : ''}`;
								}
							},
						]	
					});
				}
			}
			creatingLine.value = undefined;
		};
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('touchend', handleMouseUp);
	};

	// 线段右键
	const handleLineContextMenu = (event: MouseEvent, line: FilterLine) => {
		const handleDeleteLine = () => {
			const prevNode = filterParams.value.nodes.find((node) => node.id === line.prevNodeId);
			const nextNode = filterParams.value.nodes.find((node) => node.id === line.nextNodeId);
			prevNode.nexts.splice(line.prevNodePortIndex, 1);
			nextNode.prevs.splice(line.nextNodePortIndex, 1);
			// 端口清除后，在其后面的端口会往前挪一位。这会导致这个端口往后的所有【线段】所记录的 portIndex 都 -1
			let [needToFixPrevNodePort, needToFixNextNodePort] = [false, false];
			for (let i = line.prevNodePortIndex; i < prevNode.nexts.length; i++) {
				prevNode.nexts[i].prevNodePortIndex--;
				needToFixPrevNodePort = true;
			}
			for (let i = line.nextNodePortIndex; i < nextNode.prevs.length; i++) {
				nextNode.prevs[i].nextNodePortIndex--;
				needToFixNextNodePort = true;
			}
			if (needToFixPrevNodePort) {
				fixNodePortPosition(prevNode);
			}
			if (needToFixNextNodePort) {
				fixNodePortPosition(nextNode);
			}
			const index = filterParams.value.lines.findIndex((l) => l === line);
			filterParams.value.lines.splice(index, 1);
		};
		const handleRenameLine = () => {
			let compFuncs: any;
			Msgbox({
				container: document.body,
				title: inputNodeIndexStr ? `【${line.name}】修改媒体` : `【${line.name}】重命名`,
				content: <RenameLinePanel line={line} isInput={inputNodeIndexStr !== undefined} originalValue={line.name} exportFunctions={(fs) => compFuncs = fs} />,
				buttons: [
					{ text: '保存', role: 'confirm', type: ButtonType.Primary, callback: async () => {
						const result = await compFuncs.exportData();
						const { input, mediaType, mediaIndex } = result;
						if (inputNodeIndexStr) {
							line.name = `${inputNodeIndexStr}:${mediaType}${mediaIndex !== '' ? `:${mediaIndex}` : ''}`;
						} else {
							line.name = input;
						}
					} },
					{ text: '取消', role: 'cancel' },
				]	
			});
		};
		const prevNode = filterParams.value.nodes.find((node) => node.id === line.prevNodeId);
		const inputNodeIndexStr = prevNode.name.match(/^in_\d+$/) ? prevNode.name.match(/^in_(\d+)$/)[1] : undefined;
		showMenu({
			menu: [
				{
					type: 'normal' as const,
					label: inputNodeIndexStr ? `【${line.name}】修改媒体` : `【${line.name}】重命名`,
					value: 'lineName',
					tooltip: inputNodeIndexStr ? `您可通过名称手动指定输入的类型（视频/音频）以及流序号。格式为：输入编号:流类型:流编号` : `您可随意命名连线名称，这将作为 ffmpeg 用于缓存【${prevNode.name}】节点输出数据的标签名称`,
					onClick: handleRenameLine,
				},
				{ type: 'separator' },
				{ type: 'normal' as const, label: '删除连线', value: '删除连线', onClick: handleDeleteLine },
			],
			type: 'action',
			triggerRect: { xMin: event.pageX, xMax: event.pageX, yMin: event.pageY, yMax: event.pageY },
		});
	};
	const handleLineMouseEnter = (event: MouseEvent) => {
		// event.target.className = event.target.className.split(' ').concat('hover').join(' ');
		const svgTarget = event.target as SVGElement;
		// svgTrget.classList.add('hover');
		const invisiableRect = svgTarget.children[5];
		const rect = svgTarget.children[6];
		const text = svgTarget.children[7];
		if (text instanceof SVGTextElement && invisiableRect instanceof SVGRectElement && rect instanceof SVGRectElement) {
			const bbox = text.getBBox();
			invisiableRect.style.width = `${bbox.width + 12}px`;
			rect.style.width = `${bbox.width + 12}px`;
		}
	};
	const handleLineMouseLeave = (event: MouseEvent) => {
		// event.target.className = event.target.className.split(' ').filter((n) => n !== 'hover').join(' ');
		const svgTarget = event.target as SVGElement;
		if (svgTarget.children[7] instanceof SVGTextElement && svgTarget.children[6] instanceof SVGRectElement) {
			svgTarget.children[6].style.width = `0px`;
		}
	};

	const testMouseMove = (event: MouseEvent) => {
		// const isPointerOnNode = checkIsPointOnNode(event.pageX, event.pageY);
		// console.log(isPointerOnNode);
	};

	// 在工具箱中双击滤镜，则在画布当前中心放一个 node
	const handleFilterDblclick = (detail: FFmpegFilterDetail) => {
		const maxNodeId = filterParams.value.nodes.reduce((prev, curr) => curr.id > prev ? curr.id : prev, -1) ?? -1;
		const x = Math.round(-canvasOffset.value[0] / 30) * 30;
		let y = Math.round(-canvasOffset.value[1] / 30) * 30;
		const sameXNodes = filterParams.value.nodes.filter((node) => node.x === x);
		while (sameXNodes.length && sameXNodes.some((node) => node.y === y)) {
			y += 60;
		}
		filterParams.value.nodes.push({
			name: detail.name,
			x, y,
			id: maxNodeId + 1,
			params: {},
			prevs: [], nexts: [],
			detail,
		});
	};

	const jumpToFFmpegFilteringGuide = () => nodeBridge.jumpToUrl('https://trac.ffmpeg.org/wiki/FilteringGuide');
	const jumpToFFmpegFiltersDocumentation = () => nodeBridge.jumpToUrl('https://ffmpeg.org/ffmpeg-filters.html');
	const showHelp = () => showLocalLibrary('FFBox 滤镜功能使用指南');

	onMounted(() => {
		associateNodesAndLines(filterParams.value.nodes, filterParams.value.lines);
		associateNodesAndDetails(filterParams.value.nodes);
		calcAllLineXY();
	});
	// onUnmounted(() => {
	// 	resizeObserver.value.disconnect();
	// });

	return () => nodes.value.length ? (
		<div class={style.container}>
			<div class={style.toolBox} style={{ width: `${dragger1Pos.value}%`}}>
				<div class={style.search}>
					<NormalInput placeholder='输入滤镜名搜索' onChange={(value) => filterText.value = value} />
				</div>
				<div class={style.filtersList}>
					{filteredFilterList.value.map((filter) => (
						<div class={style.item} onDblclick={() => handleFilterDblclick(filter)} {...useTooltip(filter.description, 'tl')}>{filter.name}</div>
					))}
				</div>
				<div class={style.operations}>
					<Button size='small' onClick={() => showHelp()}>帮助</Button>
					<Button size='small' onClick={() => initNodes()}>重置</Button>
					<Button size='small'>添加输出</Button>
				</div>
			</div>
			<div class={style.dragger} style={{ left: `${dragger1Pos.value}%`}} onMousedown={(event) => handleCenterDraggerDragStart(event, 1)} onTouchstart={(event) => handleCenterDraggerDragStart(event, 1)} />
			<div class={style.editor}
				style={{ width: `${dragger2Pos.value - dragger1Pos.value}%`}}
				onMousedown={handleCanvasMouseDown}
				onMousemove={testMouseMove}
				onWheel={handleCanvasWheel}
				data-color_theme={appStore.frontendSettings.colorTheme}
			>
				<div class={style.center} style={{ transform: canvasTransform.value }} ref={canvasRef}>
					<div class={style.xline}></div>
					<div class={style.yline}></div>
					{nodes.value.map((node) => (
						<div
							class={style.node}
							style={{ left: `${node.x}px`, top: `${node.y}px`, height: `${getNodeHeight(node)}px` }}
							onMousedown={(event) => handleNodeMouseDown(event, node)}
							onContextmenu={(event) => handleNodeContextMenu(event, node)}
						>
							<div class={style.name}>{node.name}<br />{node.id}</div>
							<div class={style.inputList}>
								{getNodeInputPoints(node).map((point, i) => (
									<div class={style.port} data-type={point.type} onMousedown={(event) => handlePortMouseDown(event, node, 'input', i)}></div>
								))}
							</div>
							<div class={style.outputList}>
								{getNodeOutputPoints(node).map((point, i) => (
									<div class={style.port} data-type={point.type} onMousedown={(event) => handlePortMouseDown(event, node, 'output', i)}></div>
								))}
							</div>
						</div>
					))}
					{lines.value.map((line, index) => (
						<svg
							class={style.line}
							data-type={line.type}
							data-creating={line.invisiblePort ? 'T' : ''}
							onContextmenu={(event) => handleLineContextMenu(event, line as any)}
							onMouseenter={handleLineMouseEnter}
							onMouseleave={handleLineMouseLeave}
						>
							<defs>
								<filter id={`filterLineShadow_${index}`} x="-50vw" y="-50vw" width="150vw" height="150vw" filterUnits="userSpaceOnUse">
									{h('feDropShadow', { in: 'border', dx: '0', dy: '2', stdDeviation: '2', 'flood-color': 'currentColor', 'flood-opacity': '0.6', result: 'shadow' })}
								    <feComposite in="SourceGraphic" in2="shadow" operator="over" />
								</filter>
								<filter id={`filterLineTextFilter_${index}`} x="-50%" y="-50%" width="200%" height="200%">
									<feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
									<feFlood flood-color="hwb(var(--bg94))" flood-opacity="1" result="flooded" />
									<feComposite in2="expanded" operator="in" result="border" />
									<feComposite in="SourceGraphic" in2="border" operator="over" />
								</filter>
								<linearGradient id={`filterLineCircleFill_${index}`} x1="0" y1="-0.5" x2="0" y2="1">
									<stop offset="0%" stop-color="white" stop-opacity="1"/>
									<stop offset="60%" stop-color="currentColor" stop-opacity="1"/>
								</linearGradient>
							</defs>
							<line class={style.invisibleLine} x1={line.prevXY[0]} y1={line.prevXY[1]} x2={line.nextXY[0]} y2={line.nextXY[1]} />
							<line class={style.svgLine} x1={line.prevXY[0]} y1={line.prevXY[1]} x2={line.nextXY[0]} y2={line.nextXY[1]} stroke-dasharray="24 4" stroke-dashoffset="0" filter={`url(#filterLineShadow_${index})`} onClick={() => console.log('click')}>
								<animate
									attributeName="stroke-dashoffset"
									values="0;-28"
									dur="1s"
									repeatCount="indefinite"
								/>
							</line>
							{line.invisiblePort !== 'prev' && (
								<circle cx={line.prevXY[0]} cy={line.prevXY[1]} r="5" fill={`url(#filterLineCircleFill_${index})`} filter={`url(#filterLineShadow_${index})`} />
							)}
							{line.invisiblePort !== 'next' && (
								<circle cx={line.nextXY[0]} cy={line.nextXY[1]} r="5" fill={`url(#filterLineCircleFill_${index})`} filter={`url(#filterLineShadow_${index})`} />
							)}
							{line.name && (
								<>
									<rect
										class={style.invisibleRect}
										x={`${line.prevXY[0]}px`}
										y={`${line.prevXY[1]}px`}
										style={{ transform: `rotate(${Math.atan((line.nextXY[1] - line.prevXY[1]) / (line.nextXY[0] - line.prevXY[0])) * 180 / Math.PI}deg) translate(14px, -26px)`, transformOrigin: `${line.prevXY[0]}px ${line.prevXY[1]}px` }}
									/>
									<rect
										class={style.rect}
										x={`${line.prevXY[0]}px`}
										y={`${line.prevXY[1]}px`}
										style={{ transform: `rotate(${Math.atan((line.nextXY[1] - line.prevXY[1]) / (line.nextXY[0] - line.prevXY[0])) * 180 / Math.PI}deg) translate(14px, -26px)`, transformOrigin: `${line.prevXY[0]}px ${line.prevXY[1]}px` }}
									/>
									<text
										x={`${line.prevXY[0]}px`}
										y={`${line.prevXY[1]}px`}
										style={{ transform: `rotate(${Math.atan((line.nextXY[1] - line.prevXY[1]) / (line.nextXY[0] - line.prevXY[0])) * 180 / Math.PI}deg) translate(20px, -10px)`, transformOrigin: `${line.prevXY[0]}px ${line.prevXY[1]}px` }}
										filter={`url(#filterLineTextFilter_${index})`}
									>
										{line.name}
									</text>
								</>
							)}
						</svg>
					))}
				</div>
			</div>
			<div class={style.dragger} style={{ left: `${dragger2Pos.value}%`}} onMousedown={(event) => handleCenterDraggerDragStart(event, 2)} onTouchstart={(event) => handleCenterDraggerDragStart(event, 2)} />
			<div class={style.paramsBox} style={{ width: `${100 - dragger2Pos.value}%`}}>
				<div>节点</div>
				{filterParams.value.nodes.map((node) => <div>{JSON.stringify(node, undefined, '\t')}</div>)}
				<div>线段</div>
				{filterParams.value.lines.map((line) => <div>{JSON.stringify(line, undefined, '\t')}</div>)}
				<Button onClick={jumpToFFmpegFilteringGuide}>🚩 FFmpeg 滤镜指南</Button>
				<Button onClick={jumpToFFmpegFiltersDocumentation}>📖 FFmpeg 滤镜文档</Button>
			</div>
		</div>
	) : (
		<div class={style.noFilter}>
			<Button size="large" onClick={() => initNodes()}>启用功能</Button>
		</div>
	);
}, {
	props: ['editingOutputIndex'],
});

export default EffectView;
