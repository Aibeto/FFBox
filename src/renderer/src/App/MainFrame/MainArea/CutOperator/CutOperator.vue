<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, StyleValue } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel } from '@common/types';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import { durationValidator, durationFixer } from '@renderer/components/validatorAndFixer';
import IconUpArrow from '../ParaBox/uparrow.svg?component';
import { formatTimeToFFmpegStyle, parseTimeString } from '@common/utils';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);
const selectedStream = computed(() => selectedTasks.value.task?.after.input.files.length >= 1 && appStore.globalParams.outputs.length >= 1 ? {
	before: selectedTasks.value.task.before[0],
} : undefined);
const params = computed(() => ({
	input: appStore.globalParams.input.files[0],
	mux: appStore.globalParams.outputs[0].mux,
}));

const duration = computed(() => selectedStream.value?.before.duration || 0);
let resizeObserver: ResizeObserver | null = null;

// #region divider

const deviderRef = ref<Element>(null);
const handleDragStart = (event: MouseEvent | TouchEvent) => {
	// event.preventDefault();
	const deviderRect = deviderRef.value.getBoundingClientRect();	// 列表元素的 rect
	const mainAreaRect = (appStore.componentRefs['MainArea'] as Element).getBoundingClientRect();	// 列表元素的 rect
	const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
	// const inElementY = (event as MouseEvent).offsetY || (event as TouchEvent).touches[0].offsetY;	// 鼠标在元素内的 Y
	const inElementY = mouseY - deviderRect.top;	// 不直接用 offsetY 的原因是，鼠标所在的元素不一定是 devider
	// 添加鼠标事件捕获
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
		let listPercent = (mouseY - mainAreaRect.top - inElementY) / mainAreaRect.height;
		listPercent = Math.min(Math.max(listPercent, 0), 1);
		appStore.draggerPos = listPercent;
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

// #endregion

// #region 进度区域——视区

const keyFramesCanvasRef = ref<HTMLCanvasElement>(null);

// 视区控制常量
const MIN_VIEW_RANGE = 1;  // 最小视区范围（秒）

// 视区时间（秒）
const viewBegin = ref(0);
const viewEnd = ref(0);

// 视区拖拽状态（中键拖拽）
const panState = ref<{ active: boolean; startX: number; startViewBegin: number; startViewEnd: number }>({
	active: false,
	startX: 0,
	startViewBegin: 0,
	startViewEnd: 0,
});

// 滚轮缩放视区
const handleScrollAreaWheel = (event: WheelEvent) => {
	event.preventDefault();

	const scrollArea = event.currentTarget as HTMLElement;
	const rect = scrollArea.getBoundingClientRect();

	// 计算鼠标位置对应的视区时间比例
	const mouseXRatio = (event.pageX - rect.left) / rect.width;
	const mouseTime = viewBegin.value + mouseXRatio * (viewEnd.value - viewBegin.value);

	// 计算缩放因子
	const zoomFactor = Math.pow(2, event.deltaY * 0.0025);

	// 计算新的视区范围
	const currentRange = viewEnd.value - viewBegin.value;
	const newRange = Math.max(
		MIN_VIEW_RANGE,
		Math.min(duration.value, currentRange * zoomFactor)
	);

	// 以鼠标位置为中心缩放
	const ratioBeforeMouse = (mouseTime - viewBegin.value) / currentRange;
	let newBegin = mouseTime - ratioBeforeMouse * newRange;
	let newEnd = mouseTime + (1 - ratioBeforeMouse) * newRange;

	// 边界约束
	if (newBegin < 0) {
		newBegin = 0;
		newEnd = newRange;
	}
	if (newEnd > duration.value) {
		newEnd = duration.value;
		newBegin = Math.max(0, duration.value - newRange);
	}

	viewBegin.value = newBegin;
	viewEnd.value = newEnd;
};

// 中键拖拽开始
const handleScrollAreaMouseDown = (event: MouseEvent) => {
	if (event.button !== 1) return;  // 只处理中键
	event.preventDefault();

	const scrollArea = event.currentTarget as HTMLElement;
	panState.value = {
		active: true,
		startX: event.pageX,
		startViewBegin: viewBegin.value,
		startViewEnd: viewEnd.value,
	};

	scrollArea.style.cursor = 'grabbing';
	window.addEventListener('mousemove', handleScrollAreaMouseMove);
	window.addEventListener('mouseup', handleScrollAreaMouseUp);
};

// 中键拖拽移动
const handleScrollAreaMouseMove = (event: MouseEvent) => {
	if (!panState.value.active) return;

	const scrollArea = document.querySelector('.cutOperator .scrollArea');
	if (!scrollArea) return;

	const rect = scrollArea.getBoundingClientRect();
	const deltaX = event.pageX - panState.value.startX;
	const viewRange = panState.value.startViewEnd - panState.value.startViewBegin;
	const deltaTime = -deltaX / rect.width * viewRange;  // 向右拖拽 = 视区向左移动

	let newBegin = panState.value.startViewBegin + deltaTime;
	const newEnd = newBegin + viewRange;

	// 边界约束
	if (newBegin < 0) {
		newBegin = 0;
	}
	if (newEnd > duration.value) {
		newBegin = Math.max(0, duration.value - viewRange);
	}

	viewBegin.value = newBegin;
	viewEnd.value = newBegin + viewRange;
};

// 中键拖拽结束
const handleScrollAreaMouseUp = (event: MouseEvent) => {
	if (event.button !== 1) return;

	panState.value.active = false;
	const scrollArea = document.querySelector('.cutOperator .scrollArea') as HTMLElement | null;
	if (scrollArea) {
		scrollArea.style.cursor = 'grab';
	}
	window.removeEventListener('mousemove', handleScrollAreaMouseMove);
	window.removeEventListener('mouseup', handleScrollAreaMouseUp);
};

// #endregion

// #region 进度区域——选区

// 选区时间（秒）
const inputBegin = ref(0);
const inputEnd = ref(0);
const outputBegin = ref(0);	// 输出选区开始时间（绝对时间，也就是 inputBegin + muxParams.begin）
const outputEnd = ref(0);	// 输出选区结束时间（绝对时间，也就是 inputBegin + muxParams.end）

// 选区拖拽状态
const HANDLE_WIDTH = 12;
const HANDLE_HIT_AREA = 20;
const dragState = ref<{
	type: 'inputBegin' | 'inputEnd' | 'inputBody' | 'outputBegin' | 'outputEnd' | 'outputBody' | null;
	startX: number;
	startTime: number;
	endTime: number;
}>({ type: null, startX: 0, startTime: 0, endTime: 0 });

// 选区样式
const rectEndsPosition = computed(() => {
	const viewRange = viewEnd.value - viewBegin.value;
	if (viewRange <= 0 || !duration.value) {
		return {
			input: { left: '0%', width: '100%' } satisfies StyleValue,
			output: { left: '0%', width: '100%' } satisfies StyleValue,
		};
	}

	// 输入选区
	const inputLeft = ((inputBegin.value - viewBegin.value) / viewRange) * 100;
	const inputWidth = ((inputEnd.value - inputBegin.value) / viewRange) * 100;

	// 输出选区（outputBegin/outputEnd 是绝对时间）
	const outputLeft = ((outputBegin.value - viewBegin.value) / viewRange) * 100;
	const outputWidth = ((outputEnd.value - outputBegin.value) / viewRange) * 100;

	return {
		input: { left: `${inputLeft}%`, width: `${Math.max(0, inputWidth)}%` } satisfies StyleValue,
		output: { left: `${outputLeft}%`, width: `${Math.max(0, outputWidth)}%` } satisfies StyleValue,
	};
})

// 选区拖拽：检测拖拽类型
const getDragType = (pageX: number, scrollAreaRect: DOMRect, type: 'input' | 'output'): 'inputBegin' | 'inputEnd' | 'inputBody' | 'outputBegin' | 'outputEnd' | 'outputBody' | null => {
	const mouseX = pageX - scrollAreaRect.left;
	const viewRange = viewEnd.value - viewBegin.value;

	if (type === 'input') { 
		const inputBeginX = ((inputBegin.value - viewBegin.value) / viewRange) * scrollAreaRect.width;
		const inputEndX = ((inputEnd.value - viewBegin.value) / viewRange) * scrollAreaRect.width;
		if (Math.abs(mouseX - inputBeginX) <= HANDLE_HIT_AREA) return 'inputBegin';
		if (Math.abs(mouseX - inputEndX) <= HANDLE_HIT_AREA) return 'inputEnd';
		if (mouseX >= inputBeginX + HANDLE_HIT_AREA && mouseX <= inputEndX - HANDLE_HIT_AREA) return 'inputBody';
	} else {
		const outputBeginX = ((outputBegin.value - viewBegin.value) / viewRange) * scrollAreaRect.width;
		const outputEndX = ((outputEnd.value - viewBegin.value) / viewRange) * scrollAreaRect.width;
		if (Math.abs(mouseX - outputBeginX) <= HANDLE_HIT_AREA) return 'outputBegin';
		if (Math.abs(mouseX - outputEndX) <= HANDLE_HIT_AREA) return 'outputEnd';
		if (mouseX >= outputBeginX + HANDLE_HIT_AREA && mouseX <= outputEndX - HANDLE_HIT_AREA) return 'outputBody';
	}
	return null;
};

// 选区拖拽开始（左键）
const handleSelectionMouseDown = (event: MouseEvent, selectionType: 'input' | 'output') => {
	if (event.button !== 0) return;  // 只处理左键
	event.stopPropagation();

	const scrollArea = (event.currentTarget as HTMLElement).closest('.scrollArea');
	if (!scrollArea) return;

	const rect = scrollArea.getBoundingClientRect();
	const dragType = getDragType(event.pageX, rect, selectionType);

	// 只处理当前选区类型的拖拽
	if (!dragType || !dragType.startsWith(selectionType)) return;

	event.preventDefault();

	dragState.value = {
		type: dragType,
		startX: event.pageX,
		startTime: dragType === 'inputBegin' || dragType === 'inputBody' ? inputBegin.value : outputBegin.value,
		endTime: dragType === 'inputEnd' || dragType === 'inputBody' ? inputEnd.value : outputEnd.value,
	};

	// 选区拖拽移动
	const handleSelectionMouseMove = (event: MouseEvent) => {
		if (!dragState.value.type) return;
	
		const rect = scrollArea.getBoundingClientRect();
		const deltaX = event.pageX - dragState.value.startX;
		const deltaTime = deltaX / rect.width * (viewEnd.value - viewBegin.value);
	
		switch (dragState.value.type) {
			case 'inputBegin':
				// startTime: inputBegin
				// endTime: outputEnd（无视）
				inputBegin.value = Math.max(0, Math.min(dragState.value.startTime + deltaTime, inputEnd.value - 0.1));
				outputBegin.value = Math.max(inputBegin.value, outputBegin.value);
				break;
			case 'inputEnd':
				// startTime: outputBegin（无视）
				// endTime: inputEnd
				inputEnd.value = Math.max(inputBegin.value + 0.1, Math.min(dragState.value.endTime + deltaTime, duration.value));
				outputEnd.value = Math.min(outputEnd.value, inputEnd.value);
				break;
			case 'inputBody':
				// startTime: inputBegin
				// endTime: inputEnd
				const inputLength = dragState.value.endTime - dragState.value.startTime;
				let newInputBegin = Math.max(0, Math.min(dragState.value.startTime + deltaTime, duration.value - inputLength));
				inputBegin.value = newInputBegin;
				inputEnd.value = newInputBegin + inputLength;
				break;
			case 'outputBegin':
				// startTime: outputBegin
				// endTime: outputEnd（无视）
				console.log(inputBegin.value, dragState.value.startTime + deltaTime, outputEnd.value - 0.1)
				outputBegin.value = Math.max(inputBegin.value, Math.min(dragState.value.startTime + deltaTime, outputEnd.value - 0.1));
				break;
			case 'outputEnd':
				// startTime: outputBegin（无视）
				// endTime: outputEnd
				outputEnd.value = Math.max(outputBegin.value + 0.1, Math.min(inputEnd.value, dragState.value.endTime + deltaTime));
				break;
			case 'outputBody':
				// startTime: outputBegin
				// endTime: outputEnd
				const outputLength = dragState.value.endTime - dragState.value.startTime;
				let newOutputBegin = Math.max(inputBegin.value, Math.min(inputEnd.value - outputLength, dragState.value.startTime + deltaTime));
				outputBegin.value = newOutputBegin;
				outputEnd.value = newOutputBegin + outputLength;
				break;
		}
	};
	
	// 选区拖拽结束
	const handleSelectionMouseUp = () => {
		window.removeEventListener('mousemove', handleSelectionMouseMove);
		window.removeEventListener('mouseup', handleSelectionMouseUp);
	
		// 同步到 params
		if (dragState.value.type) {
			// 输入选区
			params.value.input.begin = formatTimeToFFmpegStyle(inputBegin.value);
			params.value.input.end = formatTimeToFFmpegStyle(inputEnd.value);
			// 输出选区（相对时间）
			params.value.mux.begin = formatTimeToFFmpegStyle(outputBegin.value - inputBegin.value);
			params.value.mux.end = formatTimeToFFmpegStyle(outputEnd.value - inputBegin.value);
			appStore.applyParameters();
		}
	
		dragState.value = { type: null, startX: 0, startTime: 0, endTime: 0 };
	};
	window.addEventListener('mousemove', handleSelectionMouseMove);
	window.addEventListener('mouseup', handleSelectionMouseUp);
};

// #endregion

// #region 进度区域——关键帧画布

// Canvas 尺寸相关
const keyFramesCanvasWidth = ref(0);
const keyFramesCanvasHeight = ref(0);
const CANVAS_PADDING = 40;  // 左右两侧空白
const framesLoading = ref(false);

const drawKeyFrames = () => {
	const canvas = keyFramesCanvasRef.value;
	if (!canvas || keyFramesCanvasWidth.value <= 0 || keyFramesCanvasHeight.value <= 0) return;

	const ctx = canvas.getContext('2d');

	// 清空画布
	ctx.clearRect(0, 0, keyFramesCanvasWidth.value, keyFramesCanvasHeight.value);

	// 获取 frames 数据
	const frames = selectedStream.value?.before?.streams?.[0]?.frames;
	if (!frames || frames.length === 0) {
		// 无帧信息时绘制提示文字
		ctx.fillStyle = '#666';
		ctx.font = '12px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(framesLoading.value ? '正在加载帧信息...' : '无关键帧信息', keyFramesCanvasWidth.value / 2, keyFramesCanvasHeight.value / 2);
		return;
	}

	// 筛选视区内的关键帧
	const keyFrames = frames.filter((f) =>
		f.type === 'I' &&
		f.pts_time >= viewBegin.value &&
		f.pts_time <= viewEnd.value
	);

	// 视野参数
	const viewRange = viewEnd.value - viewBegin.value;
	const drawWidth = keyFramesCanvasWidth.value - CANVAS_PADDING * 2;

	// 来自 ProgressLog
	const timeFilter = (value: number, withDecimal = true) => {
		let left = value;
		let hour = Math.floor(left / 3600); left -= hour * 3600;
		let minute = Math.floor(left / 60); left -= minute * 60;
		let second = left;
		if (hour) {
			return `${hour}:${minute.toString().padStart(2, '0')}:${second.toFixed(0).toString().padStart(2, '0')}`;
		} else if (minute) {
			return `${minute}:${withDecimal ? second.toFixed(1).padStart(4, '0') : second.toFixed(0).padStart(2, '0')}`;
		} else {
			return withDecimal ? second.toFixed(2) : `${second.toFixed(0)} s`;
		}
	};
	const getScaleUnit = (total: number, viewWidth: number, isClockUnit = false, threshold = 100, min = 1) => {
		if (total <= 0) {
			return min;
		}
		let currentScale = min;
		let step = 0;
		while (viewWidth / (total / currentScale) < threshold) {	// 如果按当前 scale 分割后产出的刻度线间隔不足阈值，那么降低密度
			if (isClockUnit) {
				currentScale *= [2, 2.5, 2, 1.5, 2, 2][step % 6];	// 1 2 5 10 15 30 60
			} else {
				currentScale *= [2, 2.5, 2][step % 3];	// 1 2 5 10
			}
			step++;
		}
		return currentScale;
	};

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	// 绘制关键帧竖线和标签
	if (keyFrames.length / keyFramesCanvasWidth.value < 0.1) {
		ctx.strokeStyle = '#8886';
		ctx.lineWidth = keyFramesCanvasWidth.value / (keyFrames.length + 10) * 0.02;
		// console.log('lineWidth', ctx.lineWidth);
		ctx.setLineDash([4, 4]);
		ctx.fillStyle = '#8888';
		ctx.font = '10px Bahnschrift,Calibri,\"SF Electrotome\",Avenir';
		for (const frame of keyFrames) {
			const percent = (frame.pts_time - viewBegin.value) / viewRange;
			const x = CANVAS_PADDING + percent * drawWidth;
	
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 60);
			ctx.stroke();
	
			if (keyFrames.length / keyFramesCanvasWidth.value < 0.01) {	// 平均至少 100px 绘制一个标签
				ctx.fillText(`${timeFilter(frame.pts_time)} #${frame.n}`, x, 66);
			}
		}
	}

	// 绘制时间刻度和标签
	const textStrokeColor = getComputedStyle(document.body).getPropertyValue('--33').trim() || '#888';
	ctx.strokeStyle = textStrokeColor + '6';
	ctx.lineWidth = 1;
	ctx.setLineDash([]);
	ctx.fillStyle = textStrokeColor;
	ctx.font = '10px 华文中宋 black';
	const timeUnit = getScaleUnit(viewRange, drawWidth, true, 40, 1);
	const firstTimeLineTime = Math.ceil(viewBegin.value / timeUnit) * timeUnit;
	console.log(timeUnit, firstTimeLineTime, textStrokeColor);
	for (let time = firstTimeLineTime; time <= viewEnd.value; time += timeUnit) { 
		const percent = (time - viewBegin.value) / viewRange;
		const x = CANVAS_PADDING + percent * drawWidth;

		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, 60);
		ctx.stroke();

		ctx.fillText(timeFilter(time), x, 66);
	}
}

// 更新 Canvas 尺寸
const updateKeyFrameCanvasSize = () => {
	const canvas = keyFramesCanvasRef.value;
	if (!canvas) return;

	const container = canvas.parentElement;
	const rect = container.getBoundingClientRect();

	keyFramesCanvasWidth.value = rect.width;
	keyFramesCanvasHeight.value = rect.height;
	const dpr = window.devicePixelRatio || 1;

	// 设置 canvas 尺寸（高 DPI）
	canvas.width = keyFramesCanvasWidth.value * dpr;
	canvas.height = keyFramesCanvasHeight.value * dpr;
	canvas.style.zoom = `${1 / dpr}`;
	canvas.getContext('2d').scale(dpr, dpr);

	drawKeyFrames();
};

// #endregion

// #region 选取输入框

const handleInputBeginChange = (value: string) => {
	params.value.input.begin = value;
	appStore.applyParameters();
	updateSelectionFromParams();
};
const handleInputEndChange = (value: string) => {
	params.value.input.end = value;
	appStore.applyParameters();
	updateSelectionFromParams();
};
const handleOutputBeginChange = (value: string) => {
	params.value.mux.begin = value;
	appStore.applyParameters();
	updateSelectionFromParams();
};
const handleOutputEndChange = (value: string) => {
	params.value.mux.end = value;
	appStore.applyParameters();
	updateSelectionFromParams();
};

// #endregion
// 从 OutputParams 加载选区数据
const updateSelectionFromParams = () => {
	if (!selectedTasks.value.task) return;

	let ib = parseTimeString(params.value?.input.begin);
	let ie = parseTimeString(params.value?.input.end === '' ? duration.value + '' : params.value?.input.end);
	let ob = parseTimeString(params.value?.mux.begin);
	let oe = parseTimeString(params.value?.mux.end === '' ? duration.value + '' : params.value?.mux.end);

	ib = Math.max(0, Math.min(ib, duration.value));
	ie = Math.max(ib, Math.min(ie, duration.value));
	ob = Math.max(0, Math.min(ob, ie - ib));
	oe = Math.max(ob, Math.min(oe, ie - ib));
	
	console.log(ib, ie, ob, oe, duration.value);
	inputBegin.value = ib;
	inputEnd.value = ie;
	outputBegin.value = ib + ob;
	outputEnd.value = ib + oe;
};


// 加载帧信息
const fetchFrameInfo = async () => {
	if (!selectedTasks.value.task || framesLoading.value) return;

	const frames = selectedStream.value?.before?.streams?.[0]?.frames;
	if (frames && frames.length > 0) return;  // 已有帧信息

	framesLoading.value = true;
	try {
		const taskId = [...appStore.selectedTask][0];
		await appStore.currentServer.entity.getMediaFrameInfo(taskId, 0, 0);
	} catch (err) {
		console.error('加载帧信息失败:', err);
	} finally {
		framesLoading.value = false;
	}
};


// 监听任务变化
watch(() => selectedTasks.value.task, () => {
	updateSelectionFromParams();
	viewBegin.value = 0;
	viewEnd.value = duration.value;
	setTimeout(() => {
		updateKeyFrameCanvasSize();
	}, 0);
	fetchFrameInfo();
}, { immediate: true });

// 监听视区和帧数据变化，重绘 canvas
watch([viewBegin, viewEnd, () => selectedStream.value?.before?.streams?.[0]?.frames], drawKeyFrames);

onMounted(() => {
	if (keyFramesCanvasRef.value?.parentElement) {
		resizeObserver = new ResizeObserver(updateKeyFrameCanvasSize);
		resizeObserver.observe(keyFramesCanvasRef.value.parentElement);
	}
});
onUnmounted(() => {
	if (resizeObserver) {
		resizeObserver.disconnect();
	}
});

</script>

<template>
	<div class="cutOperator">
		<div class="upper">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<button class="leftButton" @click="appStore.showCutOperator = undefined" aria-label="切割操作面板开关">
					<IconUpArrow :style="{ transform: 'rotate(-90deg)' }" />
					<span>任务参数</span>
				</button>
				<div class="buttons" @mousedown="handleDragStart" @touchstart="handleDragStart">
					<h2>切割</h2>
				</div>
			</div>
		</div>
		<div class="lower">
			<div class="title">{{ selectedTasks.count === 0 ? '您未选择任务' : selectedTasks.task.taskName }}</div>
			<div class="previewArea" v-if="selectedTasks.task">
				<div class="previewPlaceholder">
					<p>视频预览区域（待实现）</p>
					<p style="font-size: 12px;">绝对选区：{{ inputBegin }}~{{ inputEnd }}, {{ outputBegin }}~{{ outputEnd }}</p>
					<p style="font-size: 12px;">视区：{{ viewBegin }}~{{ viewEnd }}</p>
				</div>
			</div>
			<div v-else style="flex: 1"></div>
			<div class="timelineArea" v-if="selectedTasks.task">
				<canvas ref="keyFramesCanvasRef"></canvas>
				<div class="scrollArea"
						@wheel.prevent="handleScrollAreaWheel"
						@mousedown="handleScrollAreaMouseDown">
					<div class="rectInput" :style="rectEndsPosition.input" @mousedown="(e) => handleSelectionMouseDown(e, 'input')">
						<div class="handle handle-left"></div>
						<div class="handle handle-right"></div>
					</div>
					<div class="rectOutput" :style="rectEndsPosition.output" @mousedown="(e) => handleSelectionMouseDown(e, 'output')">
						<div class="handle handle-left"></div>
						<div class="handle handle-right"></div>
					</div>
				</div>
			</div>
			<div class="selectionInfo">
				<div class="selectionGroup">
					<div class="selectionLabel">输入切割</div>
					<BoxedNormalInput
						title="起点"
						:value="params.input.begin"
						:onChange="(value: string) => handleInputBeginChange(value)"
						:validator="durationValidator"
						:inputFixer="durationFixer"
					/>
					<BoxedNormalInput
						title="终点"
						:value="params.input.end"
						:onChange="(value: string) => handleInputEndChange(value)"
						:validator="durationValidator"
						:inputFixer="durationFixer"
					/>
				</div>
				<div class="selectionGroup">
					<div class="selectionLabel">输出切割</div>
					<BoxedNormalInput
						title="起点"
						:value="params.mux.begin"
						:onChange="(value: string) => handleOutputBeginChange(value)"
						:validator="durationValidator"
						:inputFixer="durationFixer"
					/>
					<BoxedNormalInput
						title="终点"
						:value="params.mux.end"
						:onChange="(value: string) => handleOutputEndChange(value)"
						:validator="durationValidator"
						:inputFixer="durationFixer"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.cutOperator {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background-color: hwb(var(--bg94));
		overflow: hidden;
		.upper {
			position: relative;
			height: 30px;
			flex: 0 0 auto;
			background-color: hwb(var(--bg97));
			box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02), // 远距离下阴影
						0px -2px 1px -1px rgba(0, 0, 0, 0.1) inset; // 内部下阴影
			overflow: hidden;
			transition: height 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
			.devider {
				cursor: ns-resize;
				.buttons {
					height: 28px;
					overflow: hidden;
					display: flex;
					justify-content: center;
					align-items: center;
					h2 {
						margin: 2px 0 0;
						font-size: 17px;
						font-weight: 500;
						color: hwb(var(--primaryColor));
					}
				}
				.leftButton {
					position: absolute;
					left: 0;
					right: 0;
					width: 40px;
					height: 28px;
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 0;
					background-color: transparent;
					border: none;
					transition: width 0.3s ease;
					&:hover {
						background-color: hwb(var(--hoverLightBg) / 0.5);
						box-shadow: 0 0 4px 2px hwb(var(--hoverShadow) / 0.05);
					}
					&:active {
						background-color: transparent;
						box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
									0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
						transform: translateY(0.25px);
					}
					span {
						position: relative;
						display: inline-block;
						width: 0px;
						margin-left: 0px;
						letter-spacing: 1px;
						top: -0.5px;
						white-space: nowrap;
						overflow: hidden;
						color: #777;
						transition: width 0.3s ease, padding 0.3s ease;
						filter: var(--paraBoxButtonDropFilterText);
					}
					svg {
						width: 20px;
						height: 20px;
						color: #777;
						transition: transform 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
					}
					@media only screen and (min-width: 400px) {
						width: 120px;
						span {
							width: 62px;
							margin-left: 8px;
						}
					}
				}
			}
		}
		.lower {
			position: relative;
			width: 100%;
			height: 100%;
			isolation: isolate;
			overflow: hidden;
			display: flex;
			flex-direction: column;
			.title {
				font-size: 14px;
				padding: 4px;
			}
			.previewArea {
				flex: 1;
				display: flex;
				justify-content: center;
				align-items: center;
				background: #000;
				min-height: 0px;
				overflow: hidden;
				.previewPlaceholder {
					color: #999;
					text-align: center;
					p {
						margin: 4px 0;
					}
				}
			}
			.timelineArea {
				height: 72px;
				width: 100%;
				position: relative;
				background: hwb(var(--bg96));
				overflow: hidden;
				.scrollArea {
					position: absolute;
					top: 0;
					bottom: 0;
					left: 40px;
					right: 40px;
					overflow: visible;
					cursor: grab;
					.rectInput, .rectOutput {
						position: absolute;
						height: 24px;
						border-radius: 4px;
						box-sizing: border-box;
					}
					.rectInput {
						top: 6px;
						border: hwb(195 0% 5%) 1px solid;
						background-color: hwb(195 0% 5% / 0.5);
						cursor: move;
					}
					.rectOutput {
						top: 30px;
						border: hwb(0 30% 0%) 1px solid;
						cursor: move;
						background-color: hwb(0 30% 0% / 0.5);
					}
					.handle {
						position: absolute;
						width: 20px;
						height: 100%;
						top: 0;
						border-radius: 50%;
						cursor: ew-resize;
						&:hover {
							background-color: #FFF7;
							mix-blend-mode: color-dodge;
						}
						&.handle-left { left: -10px; }
						&.handle-right { right: -10px; }
					}
				}
				canvas {
					position: absolute;
					top: 0;
					bottom: 0;
					left: 0;
					right: 0;
				}
			}
			.selectionInfo {
				display: flex;
				justify-content: center;
				padding: 8px 16px;
				gap: 4px 32px;
				border-top: 1px solid hwb(var(--bg90));
				.selectionGroup {
					padding: 0 24px;
					display: flex;
					align-items: center;
					gap: 12px;
					border-radius: 12px;
					// border: 1.5px solid hwb(var(--highlight));
					background-color: hwb(var(--hoverLightBg) / 0.15);
					box-shadow: 0 4px 12px hwb(var(--opposite) / 0.05),	// 外发光
								0 0 1px 1px hwb(var(--opposite) / 0.1) inset;	// 内边缘
					:deep(.controlBox) {
						width: 180px !important;
						flex: 1 1 auto;
						margin: 0 !important;
						.controlBox-title {
							min-width: 50px;
						}
						.inputbox-selector {
							flex: 1 1 auto;
						}
					}
					.selectionLabel {
						flex: 0 0 auto;
						font-size: 14px;
						font-weight: 600;
						color: var(--66);
					}
				}
				@media only screen and (min-width: 761px) and (max-width: 940px) {
					& {
						zoom: 0.8;
					}
				}
				@media only screen and (max-width: 760px) {
					& {
						flex-wrap: wrap;
					}
				}
			}
		}
	}

</style>
