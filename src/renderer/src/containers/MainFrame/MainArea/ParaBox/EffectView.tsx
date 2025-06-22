import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue'; // defineComponent 的主要功能是提供类型检查
import { FFmpegFilterDetail, FilterLine, FilterNode } from '@common/types';
import { associateNodesAndDetails, associateNodesAndLines, filtersList } from '@common/params/filter';
import { useAppStore } from '@renderer/stores/appStore';
import { useTooltip } from "@renderer/common/tooltipUtil";
import { randomString } from '@common/utils';
import nodeBridge from '@renderer/bridges/nodeBridge';
import showMenu, { MenuItem } from '@renderer/components/Menu/Menu';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import NormalInput from '@renderer/components/NormalInput/NormalInput.vue';
import style from './EffectView.module.less';

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

	const nodes = computed(() => {
		// 如果没有 nodes，创建用于初始展示的输入输出节点。用户创建新节点或者线的时候执行 initNodes 把输入输出节点实际创建了
		if (!filterParams.value.nodes.length) {
			return [
				...appStore.globalParams.input.files.map((file, index) => ({
					id: index,
					name: `in_${index}`,
					params: {},
					x: -300,
					y: -30 + index * 60,
				})),
				...new Array(appStore.globalParams.outputs.length).fill({}).map((_, index) => ({
					id: index + appStore.globalParams.input.files.length,
					name: `out_${index}`,
					params: {},
					x: 300,
					y: -30 + index * 60,
				})),
			]
		} else {
			return filterParams.value.nodes;
		}
	});

	const lines = computed(() => {
		return [creatingLine.value].filter(o => o);
	});

	const jumpToFFmpegFilteringGuide = () => nodeBridge.jumpToUrl('https://trac.ffmpeg.org/wiki/FilteringGuide');
	const jumpToFFmpegFiltersDocumentation = () => nodeBridge.jumpToUrl('https://ffmpeg.org/ffmpeg-filters.html');

	// 从 { nodes: [], lines: [] } 状态创建初始节点
	const initNodes = () => {
		filterParams.value.nodes = [
			...appStore.globalParams.input.files.map((file, index) => ({
				id: index,
				name: `in_${index}`,
				params: {},
				x: -300,
				y: -30 + index * 60,
			})),
			...new Array(appStore.globalParams.outputs.length).fill({}).map((_, index) => ({
				id: index + appStore.globalParams.input.files.length,
				name: `out_${index}`,
				params: {},
				x: 300,
				y: -30 + index * 60,
			})),
		];
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
			return new Array(appStore.globalParams.outputs.length + 1).fill({ type: 'U' });
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
			return new Array(appStore.globalParams.outputs.length + 1).fill({ type: 'U' });
		}
		return [];
	};
	const getNodeHeight = (node: FilterNode) => {
		const inCount = getNodeInputPoints(node).length;
		const outCount = getNodeOutputPoints(node).length;
		const count = Math.max(inCount, outCount);
		return count * 15 + 15;
	};
	const calcAllLineXY = () => {
		// 先将 nodes 转换为映射，方便后续查找
		const nodeMap: Record<number, FilterNode> = {};
		filterParams.value.nodes.forEach(node => {
			nodeMap[node.id] = node;
		});
		// 然后用 line 将 node 连接起来
		for (const line of filterParams.value.lines) {
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
	
	const checkIsPointOnNode = (pageX: number, pageY: number) => {
		const [logicalX, logicalY] = convertPageXYtoLogicalXY(pageX, pageY);

		// console.log(Math.floor(logicalX), Math.floor(logicalY));
		for (const node of nodes.value) {
			// 计算线的位置
			const inputPoints = getNodeInputPoints(node);
			const outputPoints = getNodeOutputPoints(node);
			const maxInputPointsIndexHalf = (inputPoints.length - 1) / 2;
			const maxOutputPointsIndexHalf = (outputPoints.length - 1) / 2;

			for (let i = 0; i < inputPoints.length; i++) {
				const portX = node.x - 45;
				const portY = node.y + 15 * (i - maxInputPointsIndexHalf);
				// allPorts.push({ x: node.x - 45, y: node.y + 15 * (i - maxInputPointsIndexHalf), node });
				if (Math.abs(logicalX - portX) <= 5 && Math.abs(logicalY - portY) <= 5) {
					return { x: node.x - 45, y: node.y + 15 * (i - maxInputPointsIndexHalf), type: 'input', index: i, node };
				}
			}
			for (let i = 0; i < outputPoints.length; i++) {
				const portX = node.x + 45;
				const portY = node.y + 15 * (i - maxOutputPointsIndexHalf);
				if (Math.abs(logicalX - portX) <= 5 && Math.abs(logicalY - portY) <= 5) {
					return { x: node.x + 45, y: node.y + 15 * (i - maxOutputPointsIndexHalf), type: 'output', index: i, node };
				}
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
		if (!filterParams.value.nodes.length) {
			// 此时只是用来展示的，一拖动就初始化
			initNodes();
		}
		// let target = event.target;
		// while (target && !target.className.includes('node')) {
		// 	target = target.parentElement;
		// }
		// const targetRect = target.getBoundingClientRect();
		// const inTargetX = ((event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX) - targetRect.left;
		// const inTargetY = ((event as MouseEvent).pageY ?? (event as TouchEvent).touches[0].pageY) - targetRect.top;
		// console.log(inTargetX, inTargetY);

		const canvasRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// 获取鼠标按下点显示位置
		const pageX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;
		const pageY = (event as MouseEvent).pageY ?? (event as TouchEvent).touches[0].pageY;
		const mouseDownX = (pageX - canvasRect.left) - canvasRect.width / 2;
		const mouseDownY = (pageY - canvasRect.top) - canvasRect.height / 2;

		// 节点原本的 xy
		const initXY = [node.x, node.y];

		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			// 获取鼠标按下点显示位置
			const pageX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;
			const pageY = (event as MouseEvent).pageY ?? (event as TouchEvent).touches[0].pageY;
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
			}
		}
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
		const handleDelete = () => {
			const nodeIndex = filterParams.value.nodes.findIndex((n) => n.id === node.id);
			filterParams.value.nodes.splice(nodeIndex, 1);
			filterParams.value.lines = filterParams.value.lines.filter((line) => !(line.prevNodeId === node.id || line.nextNodeId));
		}
		showMenu({
			menu: [
				{ type: 'normal' as const, label: '删除节点', value: '删除节点', onClick: handleDelete },
			],
			type: 'action',
			triggerRect: { xMin: event.pageX, xMax: event.pageX, yMin: event.pageY, yMax: event.pageY },
		})
	};

	const handlePortMouseDown = (event: MouseEvent | TouchEvent, node: FilterNode, type: 'input' | 'output', index: number) => {
		event.stopPropagation();
		const [mouseDownPageX, mouseDownPageY] = getPageXYfromEvent(event);
		const portPosition = checkIsPointOnNode(mouseDownPageX, mouseDownPageY);
		creatingLine.value = {
			name: node.name.match(/in_\d+/) ? '输入' : '输出',
			prevNodeId: type === 'output' ? node.id : undefined,
			prevNodePortIndex: type === 'output' ? index : undefined,
			nextNodeId: type === 'input' ? node.id : undefined,
			nextNodePortIndex: type === 'input' ? index : undefined,
			prevXY: [portPosition.x, portPosition.y],
			nextXY: [portPosition.x, portPosition.y],
			type: 'V',
			invisiblePort: type === 'input' ? 'prev' : 'next',
		};
		// 添加鼠标事件捕获
		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const [currentPageX, currentPageY] = getPageXYfromEvent(event as any);
			let currentlogicalX, currentlogicalY;
			let invisiblePort: 'prev' | 'next';
			const portPosition = checkIsPointOnNode(currentPageX, currentPageY);
			if (portPosition && ((type === 'input' && portPosition.type === 'output') || (type === 'output' && portPosition.type === 'input'))) {
				[currentlogicalX, currentlogicalY] = [portPosition.x, portPosition.y];
			} else {
				[currentlogicalX, currentlogicalY] = getLogicalXYfromEvent(event as any);
				invisiblePort = type === 'input' ? 'prev' : 'next';
			}
			// const currentPageX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;	// 鼠标在窗口内的 X
			// const currentPageY = (event as MouseEvent).pageY ?? (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
			if (type === 'input') {
				creatingLine.value.prevXY = [currentlogicalX, currentlogicalY];
			} else {
				creatingLine.value.nextXY = [currentlogicalX, currentlogicalY];
			}
			creatingLine.value.invisiblePort = invisiblePort;
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

	const testMouseMove = (event: MouseEvent) => {
		// const isPointerOnNode = checkIsPointOnNode(event.pageX, event.pageY);
		// console.log(isPointerOnNode);
	};

	// 在工具箱中双击滤镜，则在画布当前中心放一个 node
	const handleFilterDblclick = (detail: FFmpegFilterDetail) => {
		const maxNodeId = filterParams.value.nodes?.reduce((prev, curr) => curr.id > prev ? curr.id : prev, -1) ?? -1;
		filterParams.value.nodes.push({
			name: detail.name,
			x: -canvasOffset.value[0],
			y: -canvasOffset.value[1],
			id: maxNodeId + 1,
			params: {},
			detail,
		});
	};

	onMounted(() => {
		associateNodesAndLines(filterParams.value.nodes, filterParams.value.lines);
		associateNodesAndDetails(filterParams.value.nodes);
		calcAllLineXY();
	});
	// onUnmounted(() => {
	// 	resizeObserver.value.disconnect();
	// });

	return () => (
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
					{/* <div class={style.test} style={{ left: 0, top: 0 }}>0, 0</div>
					<div class={style.test} style={{ left: '50px', top: '100px' }}>50, 100</div>
					<div class={style.test} style={{ left: '-50px', top: '100px' }}>-50, 100</div> */}
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
					{lines.value.map((line) => (
						<svg class={style.line} data-type={line.type} data-creating={line.invisiblePort ? 'T' : ''}>
							<defs>
								<filter id="glow" x="-50vw" y="-50vw" width="150vw" height="150vw" filterUnits="userSpaceOnUse">
									<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
									<feMerge>
										<feMergeNode in="coloredBlur"/>
										<feMergeNode in="SourceGraphic"/>
									</feMerge>
								</filter>
								<linearGradient id="topHighlight" x1="0" y1="-0.5" x2="0" y2="1">
									<stop offset="0%" stop-color="white" stop-opacity="1"/>
									<stop offset="60%" stop-color="currentColor" stop-opacity="1"/>
								</linearGradient>
							</defs>
							<line x1={line.prevXY[0]} y1={line.prevXY[1]} x2={line.nextXY[0]} y2={line.nextXY[1]} stroke="currentColor" stroke-dasharray="24 4" stroke-dashoffset="0" filter="url(#glow)" onClick={() => console.log('click')}>
								<animate
									attributeName="stroke-dashoffset"
									values="0;-28"
									dur="1s"
									repeatCount="indefinite"
								/>
							</line>
							{line.invisiblePort !== 'prev' && (
								<circle cx={line.prevXY[0]} cy={line.prevXY[1]} r="5" fill="url(#topHighlight)" filter="url(#glow)" />
							)}
							{line.invisiblePort !== 'next' && (
								<circle cx={line.nextXY[0]} cy={line.nextXY[1]} r="5" fill="url(#topHighlight)" filter="url(#glow)" />
							)}
						</svg>
					))}
				</div>
			</div>
			<div class={style.dragger} style={{ left: `${dragger2Pos.value}%`}} onMousedown={(event) => handleCenterDraggerDragStart(event, 2)} onTouchstart={(event) => handleCenterDraggerDragStart(event, 2)} />
			<div class={style.paramsBox} style={{ width: `${100 - dragger2Pos.value}%`}}>
				<div>请在画布中选择节点</div>
				<div>{JSON.stringify(filterParams.value)}</div>
				<div>{JSON.stringify(creatingLine.value)}</div>
				<Button onClick={jumpToFFmpegFilteringGuide}>🚩 FFmpeg 滤镜指南</Button>
				<Button onClick={jumpToFFmpegFiltersDocumentation}>📖 FFmpeg 滤镜文档</Button>
			</div>
			{/* <div style="text-align: center;">此功能暂未开发<br />您可通过视频/音频面板中的自定义参数手动输入滤镜</div>
			<div style={{ width: '100%', margin: '1em 0' }}>
			</div> */}
		</div>
	);
}, {
	props: ['editingOutputIndex'],
});

export default EffectView;
