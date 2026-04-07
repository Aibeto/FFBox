<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, StyleValue } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel } from '@common/types';
import { formatTimeToFFmpegStyle, parseTimeString } from '@common/utils';
import { PreviewStreamDecoder, PreviewDecoderConfig, BufferInfo } from '@renderer/logic/PreviewStreamDecoder';
import { ServiceBridge } from '@renderer/bridges/serviceBridge';
import { durationValidator, durationFixer } from '@renderer/components/validatorAndFixer';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import IconUpArrow from '../ParaBox/uparrow.svg?component';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, taskId: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], taskId: [...appStore.selectedTask][0], count: appStore.selectedTask.size }
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
	if (event.button === 1) {
		// 中键：视区拖拽
		event.preventDefault();

		const scrollArea = event.currentTarget as HTMLElement;
		panState.value = {
			active: true,
			startX: event.pageX,
			startViewBegin: viewBegin.value,
			startViewEnd: viewEnd.value,
		};

		scrollArea.style.cursor = 'grabbing';

		// 中键拖拽监听
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
		const handleScrollAreaMouseUp = (event: MouseEvent) => {
			if (event.button !== 1) return;

			panState.value.active = false;
			const scrollArea = document.querySelector('.cutOperator .scrollArea') as HTMLElement | null;
			if (scrollArea) {
				scrollArea.style.cursor = 'col-resize';
			}
			window.removeEventListener('mousemove', handleScrollAreaMouseMove);
			window.removeEventListener('mouseup', handleScrollAreaMouseUp);
		};
		window.addEventListener('mousemove', handleScrollAreaMouseMove);
		window.addEventListener('mouseup', handleScrollAreaMouseUp);
	} else if (event.button === 0) {
		// 左键：进度拖拽
		event.preventDefault();
		isProgressDragging.value = true;

		// 直接计算鼠标位置对应的时间
		const scrollArea = event.currentTarget as HTMLElement;
		const rect = scrollArea.getBoundingClientRect();
		const mouseXRatio = (event.pageX - rect.left) / rect.width;
		const viewRange = viewEnd.value - viewBegin.value;
		const clickedTime = viewBegin.value + mouseXRatio * viewRange;

		playbackPosition.value = Math.max(0, Math.min(duration.value, clickedTime));
		seekToPosition(playbackPosition.value);

		// 左键进度拖拽监听
		const handleProgressMouseMove = (event: MouseEvent) => {
			if (!isProgressDragging.value) return;

			const scrollArea = document.querySelector('.cutOperator .scrollArea');
			if (!scrollArea) return;

			const rect = scrollArea.getBoundingClientRect();
			const mouseXRatio = (event.pageX - rect.left) / rect.width;
			const viewRange = viewEnd.value - viewBegin.value;
			const newTime = Math.max(0, Math.min(duration.value, viewBegin.value + mouseXRatio * viewRange));

			playbackPosition.value = newTime;
			seekToPosition(newTime);
		};
		const handleProgressMouseUp = () => {
			isProgressDragging.value = false;
			window.removeEventListener('mousemove', handleProgressMouseMove);
			window.removeEventListener('mouseup', handleProgressMouseUp);
		};
		window.addEventListener('mousemove', handleProgressMouseMove);
		window.addEventListener('mouseup', handleProgressMouseUp);
	}
};

// #endregion

// #region 进度控制

// 进度控制状态
const playbackPosition = ref(0);  // 独立的播放位置（秒）
const isProgressDragging = ref(false);  // 左键拖拽进度状态

// 帧数据
const allFrames = computed(() => {
	return selectedStream.value?.before?.streams?.[0]?.frames || [];
});

// 关键帧列表（仅 I 帧）
const keyFrames = computed(() => {
	return allFrames.value.filter((f) => f.type === 'I').sort((a, b) => a.pts_time - b.pts_time);
});

// 统一的 seek 操作
const seekToPosition = async (time: number) => {
	if (!previewDecoder.value || !videoRef.value) return;
	const bufferInfo = previewDecoder.value.getBufferInfo();
	if (time >= bufferInfo.start && time <= bufferInfo.end) {
		videoRef.value.currentTime = time;  // 在缓冲范围内直接设置
		playbackPosition.value = time;
		console.log(`跳转到 ${time} 在缓冲区 ${bufferInfo.start} ~ ${bufferInfo.end} 内`);
	} else {
		if (bufferInfo.end === 0) debugger;
		console.log(`跳转到 ${time} 🚫缓冲区 ${bufferInfo.start} ~ ${bufferInfo.end} 内，调用 seekTo 方法`);
		bufferLoading.value = true;
		try {
			await previewDecoder.value.restart(time);
		} catch (e) {
			console.error('[CutOperator] Seek 失败', e);
		}
		bufferLoading.value = false;
	}
};

// 当前帧：使用二分法查找 playbackPosition 对应的帧（处理浮点误差）
const currentFrame = computed(() => {
	const frames = allFrames.value;
	if (frames.length === 0) return null;

	const time = playbackPosition.value;
	const floatPrecisionOffset = 0.0000001;

	// 二分查找：找到 pts_time <= time 的最大帧
	let left = 0, right = frames.length - 1;
	while (left < right) {
		const mid = Math.ceil((left + right) / 2);
		if (frames[mid].pts_time <= time + floatPrecisionOffset) {
			left = mid;	// 目标在中间点偏右侧的位置，或者正好是此处
		} else {
			right = mid - 1;
		}
	}

	// 验证结果：确保找到的帧确实在时间范围内（AI 写的，怪怪的）
	const foundFrame = frames[left];
	// 如果时间超出最后一帧，返回最后一帧
	// if (left === frames.length - 1 && time > foundFrame.pts_time + 0.1) {
	// 	return foundFrame;
	// }
	return foundFrame;
});

// 进度指示器位置样式
const progressIndicatorStyle = computed(() => {
	const viewRange = viewEnd.value - viewBegin.value;
	if (viewRange <= 0) return { left: '0%' };
	const leftPercent = ((playbackPosition.value - viewBegin.value) / viewRange) * 100;
	return { left: `${Math.max(0, Math.min(100, leftPercent))}%` };
});

// 播放控制方法
// 播放/暂停切换
const togglePlayPause = () => {
	if (!videoRef.value) return;

	if (!videoRef.value.paused) {
		videoRef.value.pause();
	} else {
		// 检查当前位置是否在缓冲范围内
		// if (!previewDecoder.value?.isCurrentTimeInBuffer()) {
		// 	// 需要先 seek
		// 	seekToPosition(playbackPosition.value);
		// }
		seekToPosition(playbackPosition.value);
		videoRef.value.play();
	}
};

// 查找前一个关键帧
const findPrevKeyFrame = (currentTime: number): number | null => {
	const kfs = keyFrames.value;
	if (kfs.length === 0) return null;

	for (let i = kfs.length - 1; i >= 0; i--) {
		if (kfs[i].pts_time < currentTime - 0.01) {  // 添加小阈值避免找到当前帧
			return kfs[i].pts_time;
		}
	}
	return null;
};

// 查找后一个关键帧
const findNextKeyFrame = (currentTime: number): number | null => {
	const kfs = keyFrames.value;
	if (kfs.length === 0) return null;

	for (let i = 0; i < kfs.length; i++) {
		if (kfs[i].pts_time > currentTime + 0.01) {  // 添加小阈值避免找到当前帧
			return kfs[i].pts_time;
		}
	}
	return null;
};

// 上一帧：跳转到 currentFrame 的前一帧
const seekToPrevFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const frame = currentFrame.value;
	if (!frame || frame.n <= 0) return;

	const prevFrame = allFrames.value[frame.n - 1];
	if (prevFrame) {
		playbackPosition.value = prevFrame.pts_time;
		await seekToPosition(prevFrame.pts_time);
	}
};

// 下一帧：跳转到 currentFrame 的后一帧
const seekToNextFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const frame = currentFrame.value;
	if (!frame || frame.n >= allFrames.value.length - 1) return;

	const nextFrame = allFrames.value[frame.n + 1];
	if (nextFrame) {
		playbackPosition.value = nextFrame.pts_time;
		await seekToPosition(nextFrame.pts_time);
	}
};

// 上一关键帧
const seekToPrevKeyFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const prevKfTime = findPrevKeyFrame(playbackPosition.value);
	if (prevKfTime !== null) {
		playbackPosition.value = prevKfTime;
		await seekToPosition(prevKfTime);
	}
};

// 下一关键帧
const seekToNextKeyFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const nextKfTime = findNextKeyFrame(playbackPosition.value);
	if (nextKfTime !== null) {
		playbackPosition.value = nextKfTime;
		await seekToPosition(nextKfTime);
	}
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
	const kFrames = keyFrames.value.filter((f) => f.pts_time >= viewBegin.value && f.pts_time <= viewEnd.value);
	if (!kFrames || kFrames.length === 0) {
		// 无帧信息时绘制提示文字
		ctx.fillStyle = '#666';
		ctx.font = '12px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(framesLoading.value ? '正在加载帧信息...' : '无关键帧信息', keyFramesCanvasWidth.value / 2, keyFramesCanvasHeight.value / 2);
		return;
	}

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
	if (kFrames.length / keyFramesCanvasWidth.value < 0.1) {
		ctx.strokeStyle = '#8886';
		ctx.lineWidth = keyFramesCanvasWidth.value / (kFrames.length + 10) * 0.02;
		// console.log('lineWidth', ctx.lineWidth);
		ctx.setLineDash([4, 4]);
		ctx.fillStyle = '#8888';
		ctx.font = '10px Bahnschrift,Calibri,\"SF Electrotome\",Avenir';
		for (const frame of kFrames) {
			const percent = (frame.pts_time - viewBegin.value) / viewRange;
			const x = CANVAS_PADDING + percent * drawWidth;
	
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 60);
			ctx.stroke();
	
			if (kFrames.length / keyFramesCanvasWidth.value < 0.01) {	// 平均至少 100px 绘制一个标签
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

// 调用后端加载帧信息
const fetchFrameInfo = async () => {
	if (!selectedTasks.value.task || framesLoading.value) return;

	const frames = selectedStream.value?.before?.streams?.[0]?.frames;
	framesLoading.value = false;
	if (frames?.length > 0) return;  // 已有帧信息

	framesLoading.value = true;
	try {
		await appStore.currentServer.entity.getMediaFrameInfo(selectedTasks.value.taskId, 0, 0);
	} catch (err) {
		console.error('加载帧信息失败:', err);
	} finally {
		framesLoading.value = false;
	}
};

// 监听视区和帧数据变化，重绘关键帧 canvas
watch([viewBegin, viewEnd, () => selectedStream.value?.before?.streams?.[0]?.frames], drawKeyFrames);

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

// #region 视频预览解码器

const videoRef = ref<HTMLVideoElement>(null);
const previewDecoder = ref<PreviewStreamDecoder | null>(null);
const videoPlaying = ref(false);
const videoCurrentTime = ref(0);
const bufferInfo = ref<BufferInfo>({ start: 0, end: 0, duration: 0 });
const bufferLoading = ref(false);

// 初始化预览解码器
const initPreviewDecoder = async () => {
	console.log('[CutOperator] initPreviewDecoder');
	if (!videoRef.value || !selectedTasks.value.task) return;

	// 检查服务器连接
	const entity = appStore.currentServer?.entity;
	if (!entity) {
		console.warn('[CutOperator] No server connection available');
		return;
	}

	// 销毁旧实例
	if (previewDecoder.value) {
		await previewDecoder.value.destroy();
		previewDecoder.value = null;
	}

	// 获取 taskId
	const taskId = [...appStore.selectedTask][0];

	// 创建新实例
	const config: PreviewDecoderConfig = {
		taskId,
		startTime: inputBegin.value,
		bufferSec: 20,
		server: entity as ServiceBridge,
	};

	previewDecoder.value = new PreviewStreamDecoder(config);

	// 设置事件回调
	previewDecoder.value.onBufferUpdate = (info: BufferInfo) => {
		bufferInfo.value = info;
	};

	previewDecoder.value.onStreamError = (error: Error) => {
		console.error('[CutOperator] Preview stream error:', error);
	};

	// previewDecoder.value.onSeekRequired = (newTime: number) => {
	// 	// currentTime 超出缓冲范围，需要重建
	// 	if (!previewDecoder.value || !videoRef.value) return;

	// 	console.log(`[CutOperator] Seek required to ${newTime.toFixed(2)}s`);

	// 	bufferLoading.value = true;
	// 	try {
	// 		await previewDecoder.value.seekTo(newTime, videoRef.value);
	// 		bufferLoading.value = false;
	// 	} catch (e) {
	// 		console.error('[CutOperator] Seek failed:', e);
	// 		bufferLoading.value = false;
	// 	}
	// };

	try {
		bufferLoading.value = true;
		await previewDecoder.value.initialize(videoRef.value);
		bufferLoading.value = false;

		// 设置初始播放位置
		videoRef.value.currentTime = inputBegin.value;
	} catch (e) {
		console.error('[CutOperator] Failed to initialize preview decoder:', e);
		bufferLoading.value = false;
	}
};

// 视频时间更新处理
const handleVideoTimeUpdate = () => {
	if (videoRef.value) {
		videoCurrentTime.value = videoRef.value.currentTime + previewDecoder.value.config.startTime;
	}
};

// 视频等待缓冲
const handleVideoWaiting = () => {
	bufferLoading.value = true;
	videoPlaying.value = false;
};

// 视频开始播放
const handleVideoPlaying = () => {
	bufferLoading.value = false;
	videoPlaying.value = true;
};
// 视频暂停播放
const handleVideoPaused = () => {
	videoPlaying.value = false;
};

// 视频播放结束
const handleVideoEnded = () => {
	videoPlaying.value = false;
};

// 监听任务变化，初始化/销毁解码器
watch(() => selectedTasks.value.task, async (newTask, oldTask) => {
	if (newTask) {
		// 任务切换时延迟初始化解码器
		setTimeout(() => {
			initPreviewDecoder();
		}, 1000);
	} else {
		// 无任务时销毁解码器
		if (previewDecoder.value) {
			await previewDecoder.value.destroy();
			previewDecoder.value = null;
		}
	}
}, { immediate: true });

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
	
	inputBegin.value = ib;
	inputEnd.value = ie;
	outputBegin.value = ib + ob;
	outputEnd.value = ib + oe;
};


// 监听任务变化
watch(() => selectedTasks.value.task, () => {
	updateSelectionFromParams();
	playbackPosition.value = 0;
	// 视区
	viewBegin.value = 0;
	viewEnd.value = duration.value;
	// 关键帧
	fetchFrameInfo();
	setTimeout(() => {
		updateKeyFrameCanvasSize();
	}, 0);
}, { immediate: true });

// 播放进度同步：播放时同步 playbackPosition 到 video.currentTime
watch([videoPlaying, videoCurrentTime], ([playing, currentTime]) => {
	if (playing && !isProgressDragging.value) {
		playbackPosition.value = currentTime;
	}
});

onMounted(() => {
	if (keyFramesCanvasRef.value?.parentElement) {
		resizeObserver = new ResizeObserver(updateKeyFrameCanvasSize);
		resizeObserver.observe(keyFramesCanvasRef.value.parentElement);
	}
});
onUnmounted(async () => {
	if (resizeObserver) {
		resizeObserver.disconnect();
	}
	if (previewDecoder.value) {
		await previewDecoder.value.destroy();
		previewDecoder.value = null;
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
				<video ref="videoRef"
					@timeupdate="handleVideoTimeUpdate"
					@waiting="handleVideoWaiting"
					@playing="handleVideoPlaying"
					@pause="handleVideoPaused"
					@ended="handleVideoEnded"
					class="previewVideo"
					controls
				></video>
				<!-- 悬浮控件盒 -->
				<div class="controlsOverlay" v-show="!isProgressDragging && !bufferLoading">
					<div class="controlsBox">
						<button class="controlBtn" @click="seekToPrevKeyFrame" title="上一关键帧" :disabled="!findPrevKeyFrame(playbackPosition)">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h2v12H4zm4 6l6 4.5V7.5z"/></svg>
						</button>
						<button class="controlBtn" @click="seekToPrevFrame" title="上一帧" :disabled="!currentFrame || currentFrame.n <= 0">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
						</button>
						<button class="controlBtn controlBtnPlay" @click="togglePlayPause" title="播放/暂停">
							<svg v-if="videoPlaying" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
							<svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
						</button>
						<button class="controlBtn" @click="seekToNextFrame" title="下一帧" :disabled="!currentFrame || currentFrame.n >= allFrames.length - 1">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zm-9.5 6l8.5-6v12z"/></svg>
						</button>
						<button class="controlBtn" @click="seekToNextKeyFrame" title="下一关键帧" :disabled="!findNextKeyFrame(playbackPosition)">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 6l-6 4.5v9l6-4.5V6zm4 0h2v12h-2V6z"/></svg>
						</button>
					</div>
					<div class="timeDisplay">
						{{ formatTimeToFFmpegStyle(playbackPosition) }} (#{{ currentFrame.n }}) / {{ formatTimeToFFmpegStyle(duration) }}
					</div>
				</div>
				<div class="bufferIndicator" v-if="bufferLoading">
					<span>缓冲中...</span>
				</div>
			</div>
			<div v-else style="flex: 1"></div>
			<div class="timelineArea" v-if="selectedTasks.task">
				<canvas ref="keyFramesCanvasRef"></canvas>
				<div class="scrollArea" @wheel.prevent="handleScrollAreaWheel" @mousedown="handleScrollAreaMouseDown">
					<!-- 进度指示器 -->
					<div class="progressIndicator" :style="progressIndicatorStyle"></div>
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
				position: relative;
				.previewVideo {
					width: 100%;
					height: 100%;
					object-fit: contain;
				}
				.bufferIndicator {
					position: absolute;
					top: 50%;
					left: 50%;
					transform: translate(-50%, -50%);
					background: rgba(0, 0, 0, 0.7);
					padding: 8px 16px;
					border-radius: 4px;
					color: #fff;
					font-size: 14px;
					pointer-events: none;
				}
				.controlsOverlay {
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					padding: 12px;
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 8px;
					background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent 80%);
					opacity: 0.7;
					transition: opacity 0.3s ease;
					&:hover {
						opacity: 1;
					}
					.controlsBox {
						display: flex;
						gap: 4px;
						background: rgba(30, 30, 30, 0.7);
						padding: 6px 12px;
						border-radius: 20px;
						backdrop-filter: blur(8px);
						.controlBtn {
							width: 28px;
							height: 28px;
							display: flex;
							justify-content: center;
							align-items: center;
							background: transparent;
							border: none;
							color: #fff;
							cursor: pointer;
							border-radius: 50%;
							transition: background 0.2s ease, transform 0.1s ease;
							&:hover:not(:disabled) {
								background: rgba(255, 255, 255, 0.15);
							}
							&:active:not(:disabled) {
								background: rgba(255, 255, 255, 0.25);
								transform: scale(0.95);
							}
							&:disabled {
								opacity: 0.4;
								cursor: not-allowed;
							}
							svg {
								width: 18px;
								height: 18px;
							}
						}
						.controlBtnPlay {
							width: 36px;
							height: 36px;
							background: rgba(80, 80, 80, 0.6);
							margin: 0 4px;
							svg {
								width: 22px;
								height: 22px;
							}
							&:hover:not(:disabled) {
								background: rgba(100, 100, 100, 0.7);
							}
						}
					}
					.timeDisplay {
						font-size: 13px;
						color: rgba(255, 255, 255, 0.9);
						font-family: Bahnschrift, 'SF Mono', 'Consolas', monospace;
						text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
						letter-spacing: 0.5px;
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
					cursor: col-resize;
					.progressIndicator {
						position: absolute;
						top: 0;
						bottom: 0;
						width: 2px;
						background: #f44;
						transform: translateX(-50%);
						z-index: 10;

						&::before {
							content: '';
							position: absolute;
							top: 50%;
							left: 50%;
							transform: translate(-50%, -50%);
							width: 8px;
							height: 8px;
							background: #f44;
							border-radius: 50%;
							opacity: 0;
							transition: opacity 0.2s ease, transform 0.2s ease;
						}

						&:hover::before {
							opacity: 1;
							transform: translate(-50%, -50%) scale(1.5);
						}
					}
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
