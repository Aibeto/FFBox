<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, StyleValue } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { Frame } from '@common/types';
import { formatTimeToFFmpegStyle, parseTimeString } from '@common/utils';
import { PreviewStreamDecoder, PreviewDecoderConfig, BufferInfo } from '@renderer/App/MainFrame/MainArea/CutOperator/PreviewStreamDecoder';
import { ServiceBridge } from '@renderer/bridges/serviceBridge';
import { durationValidator, durationFixer } from '@renderer/components/validatorAndFixer';
import { useTooltip } from '@renderer/common/tooltipUtil';
import showMenu, { MenuItem } from '@renderer/components/Menu/Menu';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import IconUpArrow from '../ParaBox/uparrow.svg?component';
import IconPrevFrame from './PrevFrame.svg?component';
import IconPrevKeyFrame from './PrevKeyFrame.svg?component';
import IconNextFrame from './NextFrame.svg?component';
import IconNextKeyFrame from './NextKeyFrame.svg?component';
import IconHelp from './Help.svg?component';
import IconSettings from './Settings.svg?component';
import IconX from '@renderer/assets/×.svg?component';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, taskId: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], taskId: [...appStore.selectedTask][0], count: appStore.selectedTask.size }
);
const params = computed(() => ({
	input: appStore.globalParams.input.files[0],
	mux: appStore.globalParams.outputs[0].mux,
}));

const duration = computed(() => selectedTasks.value?.task?.before[0].duration || 0);
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

		const scrollArea = event.currentTarget as HTMLElement;
		const rect = scrollArea.getBoundingClientRect();

		// 左键进度拖拽监听
		const handleProgressMouseMove = (event: MouseEvent) => {
			if (!isProgressDragging.value) return;

			// 直接计算鼠标位置对应的时间
			const mouseXRatio = (event.pageX - rect.left) / rect.width;
			const viewRange = viewEnd.value - viewBegin.value;
			const clickedTime = viewBegin.value + mouseXRatio * viewRange + 0.01;	// 暂不计算下一个帧在哪里，这种情况会导致帧一定出现在指针左侧，所以添加 0.01 秒舒服一点
			const newTime = Math.max(0, Math.min(duration.value, clickedTime));

			// 修正到帧边界
			const { time: snappedTime2, frameIndex: frameIndex2 } = snapTimeToFrame(newTime);
			playbackPosition.value = snappedTime2;
			currentFrameIndex.value = frameIndex2;
			seekToPosition(snappedTime2, frameIndex2);
		};
		const handleProgressMouseUp = () => {
			isProgressDragging.value = false;
			window.removeEventListener('mousemove', handleProgressMouseMove);
			window.removeEventListener('mouseup', handleProgressMouseUp);
		};
		window.addEventListener('mousemove', handleProgressMouseMove);
		window.addEventListener('mouseup', handleProgressMouseUp);
		handleProgressMouseMove(event);
	}
};

// #endregion

// #region 进度控制

// 进度控制状态：秒和帧双主控
const playbackPosition = ref(0);  // 播放位置（秒）
const currentFrameIndex = ref(-1);  // 当前帧索引（-1 表示无帧信息）
const isProgressDragging = ref(false);  // 左键拖拽进度状态

// 帧数据
const frameData = ref<Frame[]>([]);
const allFrames = computed(() => frameData.value);

// 是否为视频（有帧信息）
const isVideo = computed(() => allFrames.value.length > 0);

// 关键帧列表（仅 I 帧）
const keyFrames = computed(() => allFrames.value.filter((f) => f.type === 'I').sort((a, b) => a.pts_time - b.pts_time));

// 视野内的关键帧列表
const visibleKeyFrames = computed(() => {
	const vb = viewBegin.value, ve = viewEnd.value;
	return keyFrames.value.filter((f) => f.pts_time >= vb && f.pts_time <= ve);
});

// 二分法查找时间对应的帧索引（返回 pts_time <= time 的最大帧索引）
const findFrameByTime = (time: number): number => {
	const frames = allFrames.value;
	if (frames.length === 0) return -1;

	const floatPrecisionOffset = 0.0000001;
	let left = 0, right = frames.length - 1;
	while (left < right) {
		const mid = Math.ceil((left + right) / 2);
		if (frames[mid].pts_time <= time + floatPrecisionOffset) {
			left = mid;
		} else {
			right = mid - 1;
		}
	}
	return left;
};

// 将时间修正到帧边界（视频时修正，音频时不修正）
const snapTimeToFrame = (time: number): { time: number; frameIndex: number } => {
	if (!isVideo.value) {
		return { time, frameIndex: -1 };
	}
	const frameIndex = findFrameByTime(time);
	const snappedTime = allFrames.value[frameIndex]?.pts_time ?? time;
	return { time: snappedTime, frameIndex };
};

// 根据帧索引设置进度（用于上一帧/下一帧操作）
const setPositionByFrameIndex = async (frameIndex: number) => {
	if (frameIndex < 0 || frameIndex >= allFrames.value.length) return;
	const frame = allFrames.value[frameIndex];
	playbackPosition.value = frame.pts_time;
	currentFrameIndex.value = frameIndex;
	await seekToPosition(frame.pts_time, frameIndex);
};

// 统一的 seek 操作（time 应已修正到帧边界）
const seekToPosition = async (time: number, frameIndex: number = -1) => {
	if (!previewDecoder.value || !videoRef.value) return;
	const bufferInfo = previewDecoder.value.getBufferInfo();
	if (time >= bufferInfo.start && time < bufferInfo.end - 0.00001) {
		videoRef.value.currentTime = time - previewDecoder.value.config.startTime + 0.00001;  // 在缓冲范围内直接设置（由于 video 同理不计算下一个帧在哪里，直接定在指定点的话由于浮点误差会有一定概率落在前一帧，所以要加一点点时间）
		playbackPosition.value = time;
		currentFrameIndex.value = frameIndex >= 0 ? frameIndex : findFrameByTime(time);
		// console.log(`跳转到 ${time.toFixed(3)} (#${currentFrameIndex.value}) 在缓冲区 ${bufferInfo.start} ~ ${bufferInfo.end} 内`);
	} else {
		console.log(`跳转到 ${time.toFixed(3)} 不在缓冲区 ${bufferInfo.start} ~ ${bufferInfo.end}，重建预览`);
		bufferLoading.value = true;
		try {
			await previewDecoder.value.restart(time);
			currentFrameIndex.value = frameIndex >= 0 ? frameIndex : findFrameByTime(time);
		} catch (e) {
			console.error('[CutOperator] Seek 失败', e);
		}
		bufferLoading.value = false;
	}
};

// 进度指示器位置样式
const progressIndicatorStyle = computed(() => {
	const viewRange = viewEnd.value - viewBegin.value;
	if (viewRange <= 0) return { left: '-100%' };
	const leftPercent = ((playbackPosition.value - viewBegin.value) / viewRange) * 100;
	return { left: `${leftPercent}%` };
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

// 查找前一个关键帧（返回帧索引）
const findPrevKeyFrameIndex = (currentFrameIdx: number): number | null => {
	const kfs = keyFrames.value;
	if (kfs.length === 0) return null;

	for (let i = kfs.length - 1; i >= 0; i--) {
		if (kfs[i].n < currentFrameIdx) {
			return kfs[i].n;
		}
	}
	return null;
};

// 查找后一个关键帧（返回帧索引）
const findNextKeyFrameIndex = (currentFrameIdx: number): number | null => {
	const kfs = keyFrames.value;
	if (kfs.length === 0) return null;

	for (let i = 0; i < kfs.length; i++) {
		if (kfs[i].n > currentFrameIdx) {
			return kfs[i].n;
		}
	}
	return null;
};

// 上一帧：跳转到 currentFrame 的前一帧
const seekToPrevFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	if (currentFrameIndex.value <= 0) return;
	await setPositionByFrameIndex(currentFrameIndex.value - 1);
};

// 下一帧：跳转到 currentFrame 的后一帧
const seekToNextFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	if (currentFrameIndex.value < 0 || currentFrameIndex.value >= allFrames.value.length - 1) return;
	await setPositionByFrameIndex(currentFrameIndex.value + 1);
};

// 上一关键帧
const seekToPrevKeyFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const prevKfIndex = findPrevKeyFrameIndex(currentFrameIndex.value);
	if (prevKfIndex !== null) {
		await setPositionByFrameIndex(prevKfIndex);
	}
};

// 下一关键帧
const seekToNextKeyFrame = async () => {
	if (videoPlaying.value) videoRef.value?.pause();

	const nextKfIndex = findNextKeyFrameIndex(currentFrameIndex.value);
	if (nextKfIndex !== null) {
		await setPositionByFrameIndex(nextKfIndex);
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

		// 计算时间对应的像素位置（相对于 scrollArea）
		const timeToPixelX = (time: number, scrollAreaWidth: number): number => {
			const viewRange = viewEnd.value - viewBegin.value;
			return ((time - viewBegin.value) / viewRange) * scrollAreaWidth;
		};

		// 关键帧贴附：以 SNAP_THRESHOLD_PX 为边界贴合视野内的关键帧
		const SNAP_THRESHOLD_PX = 10;
		const snapToKeyFrameIfClose = (targetTime: number, scrollAreaWidth: number): number => {
			if (!isVideo.value) return targetTime;

			const vkfs = visibleKeyFrames.value;
			if (vkfs.length === 0) return targetTime;

			// 计算目标时间对应的像素位置
			const targetPixelX = timeToPixelX(targetTime, scrollAreaWidth);

			// 查找最近的关键帧（像素距离）
			for (const kf of vkfs) {
				const kfPixelX = timeToPixelX(kf.pts_time, scrollAreaWidth);
				const pixelDistance = Math.abs(targetPixelX - kfPixelX);

				if (pixelDistance <= SNAP_THRESHOLD_PX) {
					// 贴附到关键帧
					return kf.pts_time;
				}
			}

			return targetTime;
		};

		// 计算新时间并修正到帧边界 + 关键帧贴附
		const applySnaps = (rawTime: number): number => {
			// 先修正到帧边界
			const { time: frameSnapped } = snapTimeToFrame(rawTime);
			if (snapToKeyFrame.value && keyFramesCanvasWidth.value / (visibleKeyFrames.value.length + 10) * 0.02 >= 0.5) {
				// 如果关键帧贴合开启，且关键帧密度足够（线条宽度 >= 0.5），再尝试贴附关键帧
				return snapToKeyFrameIfClose(frameSnapped, rect.width);
			} else {
				return frameSnapped;
			}
		};

		switch (dragState.value.type) {
			case 'inputBegin':
				// startTime: inputBegin
				// endTime: outputEnd（无视）
				const newIB = applySnaps(Math.max(0, Math.min(dragState.value.startTime + deltaTime, inputEnd.value - 0.1)));
				inputBegin.value = newIB;
				outputBegin.value = Math.max(newIB, outputBegin.value);
				break;
			case 'inputEnd':
				// startTime: outputBegin（无视）
				// endTime: inputEnd
				const newIE = applySnaps(Math.max(inputBegin.value + 0.1, Math.min(dragState.value.endTime + deltaTime, duration.value)));
				inputEnd.value = newIE;
				outputEnd.value = Math.min(outputEnd.value, newIE);
				break;
			case 'inputBody':
				// startTime: inputBegin
				// endTime: inputEnd
				const inputLength = dragState.value.endTime - dragState.value.startTime;
				let newInputBegin = applySnaps(Math.max(0, Math.min(dragState.value.startTime + deltaTime, duration.value - inputLength)));
				inputBegin.value = newInputBegin;
				inputEnd.value = newInputBegin + inputLength;
				break;
			case 'outputBegin':
				// startTime: outputBegin
				// endTime: outputEnd（无视）
				const newOB = applySnaps(Math.max(inputBegin.value, Math.min(dragState.value.startTime + deltaTime, outputEnd.value - 0.1)));
				outputBegin.value = newOB;
				break;
			case 'outputEnd':
				// startTime: outputBegin（无视）
				// endTime: outputEnd
				const newOE = applySnaps(Math.max(outputBegin.value + 0.1, Math.min(inputEnd.value, dragState.value.endTime + deltaTime)));
				outputEnd.value = newOE;
				break;
			case 'outputBody':
				// startTime: outputBegin
				// endTime: outputEnd
				const outputLength = dragState.value.endTime - dragState.value.startTime;
				let newOutputBegin = applySnaps(Math.max(inputBegin.value, Math.min(inputEnd.value - outputLength, dragState.value.startTime + deltaTime)));
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
	const kFrames = visibleKeyFrames.value;
	if (!allFrames.value?.length && framesLoading.value) {
		// 无帧信息时绘制提示文字
		ctx.fillStyle = '#666';
		ctx.font = '12px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('正在加载帧信息...', keyFramesCanvasWidth.value / 2, keyFramesCanvasHeight.value / 2);
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
	if (showKeyFrameLabels.value && kFrames.length / keyFramesCanvasWidth.value < 0.1) {
		ctx.strokeStyle = showTimeScale.value ? '#8886' : '#888C';
		ctx.lineWidth = keyFramesCanvasWidth.value / (kFrames.length + 10) * 0.02;
		// console.log('lineWidth', ctx.lineWidth);
		ctx.setLineDash([4, 4]);
		ctx.fillStyle = showTimeScale.value ? '#8888' : '#888';
		ctx.font = '10px Bahnschrift,Calibri,"SF Electrotome",Avenir';
		for (const frame of kFrames) {
			const percent = (frame.pts_time - viewBegin.value) / viewRange;
			const x = CANVAS_PADDING + percent * drawWidth;

			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 60);
			ctx.stroke();

			// 若没有时间刻度：直接绘画标签；否则绘制标签的条件是平均至少间隔 100px
			if (!showTimeScale.value || kFrames.length / keyFramesCanvasWidth.value < 0.01) {
				ctx.fillText(`${timeFilter(frame.pts_time)} #${frame.n}`, x, 66);
			}
		}
	}

	// 绘制时间刻度和标签
	if (showTimeScale.value) {
		const textStrokeColor = getComputedStyle(document.body).getPropertyValue('--33').trim() || '#888';
		ctx.strokeStyle = textStrokeColor + '6';
		ctx.lineWidth = 1;
		ctx.setLineDash([]);
		ctx.fillStyle = textStrokeColor;
		ctx.font = '10px 华文中宋 black';
		const timeUnit = getScaleUnit(viewRange, drawWidth, true, 50, 1);
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

	// 绘制缓冲指示器
	const start = CANVAS_PADDING + (bufferInfo.value.start - viewBegin.value) / viewRange * drawWidth;
	const end = CANVAS_PADDING + (bufferInfo.value.end - viewBegin.value) / viewRange * drawWidth;
	ctx.strokeStyle = '#EA3';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(start, 0);
	ctx.lineTo(end, 0);
	ctx.stroke();
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
const fetchFrameInfo = async (type?: 'fast' | 'full' | 'stop') => {
	if (!selectedTasks.value.task || framesLoading.value) return;

	const frames = allFrames.value;
	if (frames?.length > 0 && !type) return;  // 已有帧信息且非手动触发（TODO 完整信息的用处暂未确定，因此触发逻辑也暂未确定）

	framesLoading.value = true;
	try {
		const result = await appStore.currentServer.entity.getMediaFrameInfo(selectedTasks.value.taskId, 0, 0, type || 'fast');
		frameData.value = result;
	} catch (err) {
		console.error('加载帧信息失败:', err);
	} finally {
		framesLoading.value = false;
	}
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
const handleInputClear = () => {
	params.value.input.begin = '';
	params.value.input.end = '';
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
const handleOutputClear = () => {
	params.value.mux.begin = '';
	params.value.mux.end = '';
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
		quality: previewQuality.value,
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

// 视频时间更新处理（修正到帧边界）
const handleVideoTimeUpdate = () => {
	if (videoRef.value && previewDecoder.value) {
		const rawTime = videoRef.value.currentTime + previewDecoder.value.config.startTime + 0.00001;	// video 的进度显示似乎会落后一点点，导致修正到前一个帧去了
		// 修正到帧边界
		const { time: snappedTime, frameIndex } = snapTimeToFrame(rawTime);
		videoCurrentTime.value = snappedTime;
		// 只有不在拖拽时才同步
		if (!isProgressDragging.value) {
			playbackPosition.value = snappedTime;
			currentFrameIndex.value = frameIndex;
		}
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

// #region 缩略图

const thumbnailVideoRef = ref<HTMLVideoElement>(null);

const thumbnailVisible = ref(false);
const thumbnailHoverTime = ref(0);
const thumbnailAbortController = ref<AbortController | null>(null);
const thumbnailIsBuffered = ref(false);	// 指示 UI 当前悬停时间是否在缓冲范围内
const thumbnailBufferEnd = ref(0);

// 计算缩略图渲染尺寸（最大 280x280，考虑 dpi 和视频宽高比）
const computeThumbnailSize = (): { width: number; height: number } => {
	const MAX_SIZE = 280;
	const dpr = window.devicePixelRatio || 1;
	const resolution = selectedTasks.value.task?.before?.[0]?.streams?.[0]?.resolution;
	let aspectRatio = 16 / 9;  // 默认宽高比
	if (resolution) {
		const match = resolution.match(/^(\d+)x(\d+)$/);
		if (match) {
			aspectRatio = parseInt(match[1]) / parseInt(match[2]);
		}
	}
	// 按宽高比在 MAX_SIZE 内计算渲染尺寸（逻辑像素）
	let w: number, h: number;
	if (aspectRatio >= 1) {
		w = MAX_SIZE;
		h = Math.round(MAX_SIZE / aspectRatio);
	} else {
		h = MAX_SIZE;
		w = Math.round(MAX_SIZE * aspectRatio);
	}
	// 实际渲染给后端的物理像素尺寸
	const physW = Math.round(w * dpr);
	const physH = Math.round(h * dpr);
	// 确保为偶数
	return {
		width: physW % 2 === 0 ? physW : physW - 1,
		height: physH % 2 === 0 ? physH : physH - 1,
	};
};

const initThumbnailStream = async () => {
	thumbnailAbortController.value?.abort();

	if (!thumbnailVideoRef.value || !selectedTasks.value.task) return;
	const thumbnailVideo = thumbnailVideoRef.value;
	const entity = appStore.currentServer?.entity as ServiceBridge;
	if (!entity) return;
	const taskId = [...appStore.selectedTask][0];

	const abortController = new AbortController();
	thumbnailAbortController.value = abortController;

	const mediaSource = new MediaSource();
	thumbnailVideo.src = URL.createObjectURL(mediaSource);

	// 计算渲染分辨率并作为参数传给后端
	const { width: thumbW, height: thumbH } = computeThumbnailSize();

	mediaSource.addEventListener('sourceopen', async () => {
		let sourceBuffer: SourceBuffer;
		try {
			sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
			sourceBuffer.mode = 'segments'; // fMP4 使用 segments 模式
		} catch (e) {
			return;
		}

		let response: Response;
		try {
			response = await entity.fetchHttp(`/api/v1/tasks/${taskId}/thumbnail-stream?width=${thumbW}&height=${thumbH}`, abortController.signal);
		} catch (e) {
			return;
		}

		const reader = response.body!.getReader();
		const appendNext = async () => {
			// 作为 updateend 的回调，首先根据上一次 appendBuffer 的结果计算当前已缓冲范围
			const buffered = thumbnailVideo.buffered;
			let bufferEnd = 0;
			for (let i = 0; i < buffered.length; i++) {
				if (buffered.start(i) <= bufferEnd) {
					bufferEnd = Math.max(bufferEnd, buffered.end(i));
				} else {
					break;
				}
			}
			thumbnailBufferEnd.value = bufferEnd;

			let result: ReadableStreamReadResult<Uint8Array>;
			try {
				result = await reader.read();
			} catch (e) {
				return;
			}
			if (result.done) {
				if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
					mediaSource.endOfStream();
				}
				return;
			}
			// await new Promise(resolve => setTimeout(resolve, 1000));
			// console.log(result.value.length);
			sourceBuffer.appendBuffer(result.value);
		};
		sourceBuffer.addEventListener('updateend', appendNext);
		appendNext();
	});
};

// thumbnailTooltip 使用相对定位（基于时间坐标比例），不使用固定像素 x
const thumbnailTooltipPositionStyle = computed(() => {
	const viewRange = viewEnd.value - viewBegin.value;
	if (viewRange <= 0) return {};
	const ratio = (thumbnailHoverTime.value - viewBegin.value) / viewRange;
	// 限制在 0~100% 范围内，防止超出两端
	const clampedRatio = Math.max(0, Math.min(1, ratio));
	return {
		left: `${clampedRatio * 100}%`,
	};
});

// 监听任务变化，初始化/销毁解码器
watch(() => selectedTasks.value.task, async (newTask, oldTask) => {
	if (newTask) {
		// 任务切换时延迟初始化解码器
		setTimeout(() => {
			initThumbnailStream();
		}, 1000);
	} else {
		thumbnailAbortController.value?.abort();
		thumbnailAbortController.value = null;
	}
}, { immediate: true });

const handleScrollAreaMouseMove = (event: MouseEvent) => {
	if (panState.value.active || isProgressDragging.value) return;
	thumbnailVisible.value = true;
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	const ratio = (event.clientX - rect.left) / rect.width;
	const hoverTime = viewBegin.value + ratio * (viewEnd.value - viewBegin.value);
	thumbnailHoverTime.value = Math.max(0, Math.min(duration.value, hoverTime));
	if (thumbnailVideoRef.value) {
		const video = thumbnailVideoRef.value;
		const time = thumbnailHoverTime.value;

		// 检查当前时间点是否在缓冲范围内
		// let isBuffered = false;
		// const buffered = video.buffered;
		// for (let i = 0; i < buffered.length; i++) {
		// 	if (time >= buffered.start(i) && time < buffered.end(i)) {
		// 		isBuffered = true;
		// 		break;
		// 	}
		// }

		// thumbnailIsBuffered.value = isBuffered;
		// if (isBuffered) {
		if (time <= thumbnailBufferEnd.value) {
			thumbnailIsBuffered.value = true;
			video.currentTime = time;
		} else {
			thumbnailIsBuffered.value = false;
			// video.pause();	// 超出缓冲范围，暂停（video 透明度通过 CSS 控制）
		}
	}
};

const handleScrollAreaMouseLeave = () => {
	thumbnailVisible.value = false;
};

// #endregion

// #region 帮助和设置

// 设置状态
const showTimeScale = ref(true);  // 显示时间坐标
const showKeyFrameLabels = ref(true);  // 显示关键帧标签
const snapToKeyFrame = ref(true);  // 关键帧贴合

// 获取默认画质：localhost 时默认 H，否则 XL
const getDefaultQuality = (): 'H' | 'M' | 'L' | 'XL' => {
	const serverIp = appStore.currentServer?.entity?.ip;
	if (serverIp === 'localhost' || serverIp === '127.0.0.1') {
		return 'H';
	}
	return 'XL';
};
const previewQuality = ref<'H' | 'M' | 'L' | 'XL' | 'XXL'>(getDefaultQuality());  // 画质

// 帮助内容（FFmpeg 时间裁剪说明）
const helpContent = `\
# 时间裁剪（切割）操作预览器
**注意：**视频预览仅供参考，实际裁切位置会依其他参数而改变，预览窗口输出并不代表最终结果。

【输入切割/输出切割】：输出切割 = 在输入切割的基础上再次切割。一般情况下，二选一单独使用即可。
*这是 FFmpeg 的设计。别的软件可能不会给你两个切割选项，但 FFBox 为您原样呈现 :-)*

【切割位置可能跟实际略有偏差】：在 copy 编码时，切割会从关键帧位置开始。如果您要精确切割，请从关键帧开始，或重新编码。

【画质选项】：预览画面中的图像并非由 FFBox 前端直接解码，而是从后端实时重编码而来。若预览卡顿，您可通过降低画质来缓解此现象。
*此画质选项并不影响输出文件。*

【缓冲】：时间轴的上方以黄色横条显示当前已缓冲的预览。缓冲区内拖动进度条能快速响应。
有时会发生缓冲区尾部持续消除的现象。这是 chromium 内核的默认行为，FFBox 无法干预。您可降低画质以减轻这种现象。\
`;

// 显示设置菜单
const handleShowSettings = (event: MouseEvent) => {
	const target = event.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();

	const changeQuality = (newQuality: 'H' | 'M' | 'L' | 'XL' | 'XXL') => {
		previewQuality.value = newQuality;
		if (previewDecoder.value && selectedTasks.value.task) {
			previewDecoder.value.restart(playbackPosition.value, undefined, newQuality);
		}
	}
	const menuItems: MenuItem[] = [
		{ type: 'checkbox', value: 'showTimeScale', checked: showTimeScale.value, label: '显示时间坐标', onClick: () => {
			showTimeScale.value = !showTimeScale.value;
			drawKeyFrames();
		} },
		{ type: 'checkbox', value: 'showKeyFrameLabels', checked: showKeyFrameLabels.value, label: '显示关键帧', onClick: () => {
			showKeyFrameLabels.value = !showKeyFrameLabels.value;
			if (!showKeyFrameLabels.value) {
				snapToKeyFrame.value = false;
			}
			drawKeyFrames();
		} },
		{ type: 'checkbox', value: 'snapToKeyFrame', checked: snapToKeyFrame.value, label: '关键帧贴合', disabled: !showKeyFrameLabels.value, onClick: () => snapToKeyFrame.value = !snapToKeyFrame.value },
		{ type: 'separator' },
		{ type: 'checkbox', value: 'fullFrameScan', checked: false, disabled: true, label: '完整帧扫描', tooltip: '使用 ffmpeg 逐帧解码扫描\n包含 YUV 统计数据，速度较慢\n此功能未有实际意义，暂未开放', onClick: () => {
			fetchFrameInfo('full');
		} },
		{ type: 'separator' },
		{ type: 'submenu', label: '预览画质', subMenu: [
			{ type: 'radio', value: 'H', checked: previewQuality.value === 'H', label: '高', onClick: () => changeQuality('H') },
			{ type: 'radio', value: 'M', checked: previewQuality.value === 'M', label: '中', onClick: () => changeQuality('M') },
			{ type: 'radio', value: 'L', checked: previewQuality.value === 'L', label: '低', onClick: () => changeQuality('L') },
			{ type: 'radio', value: 'XL', checked: previewQuality.value === 'XL', label: '很低', tooltip: '分辨率减半\n（服务器编码性能较差时可选用）', onClick: () => changeQuality('XL') },
			{ type: 'radio', value: 'XXL', checked: previewQuality.value === 'XXL', label: '超低', tooltip: '分辨率减至四分之一\n（服务器编码性能较差时可选用）', onClick: () => changeQuality('XXL') },
		] },
	];

	showMenu({
		menu: menuItems,
		type: 'select',
		selectedValue: null,
		triggerRect: { xMin: rect.left, yMin: rect.bottom, xMax: rect.right, yMax: rect.bottom },
	});
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

	inputBegin.value = ib;
	inputEnd.value = ie;
	outputBegin.value = ib + ob;
	outputEnd.value = ib + oe;
};


// 监听任务变化
watch(() => selectedTasks.value.task, () => {
	updateSelectionFromParams();
	playbackPosition.value = 0;
	currentFrameIndex.value = allFrames.value.length > 0 ? 0 : -1;
	// 视区
	viewBegin.value = 0;
	viewEnd.value = duration.value;
	// 关键帧
	fetchFrameInfo();
	setTimeout(() => {
		updateKeyFrameCanvasSize();
	}, 0);
}, { immediate: true });

// 监听视区、帧数据变化、缓冲区变化，重绘关键帧 canvas
watch([viewBegin, viewEnd, () => allFrames.value, () => bufferInfo.value], drawKeyFrames);

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
	thumbnailAbortController.value?.abort();
	thumbnailAbortController.value = null;
});

</script>

<template>
	<div class="cutOperator">
		<div class="upper">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<button class="leftButton" @click="appStore.closeCutOperator()" aria-label="切割操作面板开关">
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
				></video>
				<!-- 顶部悬浮时间（thumbnailTooltip 显示时出现） -->
				<div class="topTimeDisplay">
					<Transition name="timeDisplayTrans">
						<div class="timeDisplayWrapper" v-show="thumbnailVisible">
							{{ formatTimeToFFmpegStyle(playbackPosition) }} (#{{ currentFrameIndex >= 0 ? currentFrameIndex : '-' }}) / {{ formatTimeToFFmpegStyle(duration) }}
						</div>
					</Transition>
				</div>
				<!-- 悬浮控件盒 -->
				<div class="controlsOverlay">
					<div class="timeDisplay">
						<Transition name="timeDisplayTrans">
							<div class="timeDisplayWrapper" v-show="!thumbnailVisible">
								{{ formatTimeToFFmpegStyle(playbackPosition) }} (#{{ currentFrameIndex >= 0 ? currentFrameIndex : '-' }}) / {{ formatTimeToFFmpegStyle(duration) }}
							</div>
						</Transition>
					</div>
					<div class="controlsBox">
						<button class="controlBtn" v-bind="useTooltip(helpContent, 't')" title="帮助">
							<IconHelp />
						</button>
						<button class="controlBtn" @click="seekToPrevKeyFrame" v-bind="useTooltip('上一关键帧', 't')" title="上一关键帧" :disabled="currentFrameIndex <= 0">
							<IconPrevKeyFrame />
						</button>
						<button class="controlBtn" @click="seekToPrevFrame" v-bind="useTooltip('上一帧', 't')" title="上一帧" :disabled="currentFrameIndex <= 0">
							<IconPrevFrame />
						</button>
						<button class="controlBtn controlBtnPlay" @click="togglePlayPause" v-bind="useTooltip('播放/暂停', 't')" title="播放/暂停">
							<svg v-if="videoPlaying" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
							<svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
						</button>
						<button class="controlBtn" @click="seekToNextFrame" v-bind="useTooltip('下一帧', 't')" title="下一帧" :disabled="currentFrameIndex < 0 || currentFrameIndex >= allFrames.length - 1">
							<IconNextFrame />
						</button>
						<button class="controlBtn" @click="seekToNextKeyFrame" v-bind="useTooltip('下一关键帧', 't')" title="下一关键帧" :disabled="!findNextKeyFrameIndex(currentFrameIndex)">
							<IconNextKeyFrame />
						</button>
						<button class="controlBtn" @click="handleShowSettings" v-bind="useTooltip('设置', 't')" title="设置">
							<IconSettings />
						</button>
					</div>
				</div>
				<div class="bufferIndicator" v-if="bufferLoading">
					<span>缓冲中...</span>
				</div>
			</div>
			<div v-else style="flex: 1"></div>
			<div class="timelineArea" v-if="selectedTasks.task">
				<canvas ref="keyFramesCanvasRef"></canvas>
				<div class="scrollArea" @wheel.prevent="handleScrollAreaWheel" @mousedown="handleScrollAreaMouseDown" @mousemove="handleScrollAreaMouseMove" @mouseleave="handleScrollAreaMouseLeave">
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
					<!-- 缩略图 tooltip：相对定位在时间坐标上 -->
					<Transition name="thumbnailTrans">
						<div class="flowThumbnail" v-show="thumbnailVisible" :style="thumbnailTooltipPositionStyle">
							<div class="thumbnailTime">{{ formatTimeToFFmpegStyle(thumbnailHoverTime) }}</div>
							<div class="thumbnailLoadingText">缩略图加载中 {{ (thumbnailBufferEnd / duration * 100).toFixed(0) }}%</div>
							<video ref="thumbnailVideoRef" muted preload="auto" :class="{ transparent: !thumbnailIsBuffered }"></video>
						</div>
					</Transition>
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
					<button class="clear" @click="handleInputClear">
						<IconX />
					</button>
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
					<button class="clear" @click="handleOutputClear">
						<IconX />
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="less" scoped>
	@property --controlsOpacity {
		syntax: '<number>';
		inherits: true;
		initial-value: 1;
	}
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
				background: #000E;
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
				.topTimeDisplay {
					position: absolute;
					top: 8px;
					left: 50%;
					transform: translateX(-50%);
					font-size: 14px;
					color: hwb(0 100% 0% / 0.9);
					font-family: Bahnschrift, 'SF Mono', 'Consolas', monospace;
					text-shadow: 0 1px 3px hwb(0 0% 100% / 0.8);
					letter-spacing: 0.5px;
					pointer-events: none;
				}
				// topTimeDisplay 和 controlsOverlay timeDisplay 共用的 transition
				.timeDisplayTrans-enter-active, .timeDisplayTrans-leave-active {
					transition: opacity 0.3s ease, transform 0.3s ease;
				}
				.timeDisplayTrans-enter-from, .timeDisplayTrans-leave-to {
					opacity: 0;
					transform: translateY(-6px);
				}
				.timeDisplayTrans-enter-to, .timeDisplayTrans-leave-from {
					opacity: 1;
					transform: translateY(0);
				}
				.controlsOverlay {
					position: absolute;
					bottom: 0;
					left: 0;
					right: 0;
					padding: 12px;
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 8px;
					// background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent 80%);
					// opacity: 0.9;
					&:hover {
						.controlsBox {
							opacity: 1;
							transition: opacity 0.3s ease;
						}
						.timeDisplay {
							opacity: 0.9;
							transform: translateY(0);
							transition: all 0.3s ease;
						}
					}
					.timeDisplay {
						font-size: 14px;
						color: hwb(0 100% 0% / 0.9);
						font-family: Bahnschrift, 'SF Mono', 'Consolas', monospace;
						text-shadow: 0 1px 3px hwb(0 0% 100% / 0.8);
						letter-spacing: 0.5px;
						opacity: 0.7;
						transform: translateY(60px);
						transition: all 1s cubic-bezier(0.3, 0, 0.1, 1) 2s;
					}
					.controlsBox {
						display: flex;
						align-items: center;
						gap: 4px;
						background: hwb(0 15% 85% / 0.5);
						padding: 6px 12px;
						border-radius: 20px;
						backdrop-filter: contrast(1.25) blur(6px);
						opacity: 0.0;
						transition: opacity 2s ease 1s;
						.controlBtn {
							width: 32px;
							height: 32px;
							display: flex;
							justify-content: center;
							align-items: center;
							background: transparent;
							border: none;
							padding: 0;
							color: #FFF;
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
								width: 20px;
								height: 20px;
							}
						}
						.controlBtnPlay {
							width: 36px;
							height: 36px;
							background: hwb(0 30% 70% / 0.7);
							margin: 0 4px;
							svg {
								width: 22px;
								height: 22px;
							}
							&:hover:not(:disabled) {
								background: hwb(0 35% 65% / 0.9);
							}
						}
					}
				}
			}
			.timelineArea {
				height: 72px;
				width: 100%;
				position: relative;
				background: hwb(var(--bg96));
				// overflow: hidden;
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
					.flowThumbnail {
						position: absolute;
						bottom: 100%;
						transform: translateX(-50%);
						pointer-events: none;
						// z-index: 1000;
						// display: flex;
						// flex-direction: column;
						// align-items: center;
						// gap: 4px;
						border-radius: 4px;
						border: 1px solid rgba(255, 255, 255, 0.3);
						background: hwb(0 15% 85% / 0.5);
						backdrop-filter: contrast(1.25) blur(6px);
						box-shadow: 0 4px 8px hwb(var(--hoverShadow) / 0.1);
						isolation: isolate;
						.thumbnailTime {
							position: absolute;
							top: 8px;
							left: 50%;
							font-size: 13px;
							color: hwb(0 100% 0% / 0.9);
							font-family: Bahnschrift, 'SF Mono', 'Consolas', monospace;
							text-shadow: 0 1px 3px hwb(0 0% 100% / 0.8);
							letter-spacing: 0.5px;
							background: hwb(0 0% 100% / 0.5);
							padding: 2px 8px;
							border-radius: 4px;
							transform: translateX(-50%);
							z-index: 2;
						}
						.thumbnailLoadingText {
							position: absolute;
							width: 100%;
							height: 100%;
							display: flex;
							justify-content: center;
							align-items: center;
							color: #FFF;
							z-index: -1;
						}
						video {
							display: block;
							max-width: 280px;
							max-height: 280px;
							border-radius: 3px;
							transition: opacity 0.2s ease;
							&.transparent {
								opacity: 0;
							}
						}
					}
					.thumbnailTrans-enter-active, .thumbnailTrans-leave-active {
						transition: opacity 0.2s ease, transform 0.2s ease;
					}
					.thumbnailTrans-enter-from, .thumbnailTrans-leave-to {
						opacity: 0;
						transform: translateX(-50%) translateY(6px);
					}
					.thumbnailTrans-enter-to, .thumbnailTrans-leave-from {
						opacity: 1;
						transform: translateX(-50%) translateY(0);
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
					padding: 0 16px 0 20px;
					display: flex;
					align-items: center;
					gap: 12px;
					border-radius: 12px;
					// border: 1.5px solid hwb(var(--highlight));
					background-color: hwb(var(--hoverLightBg) / 0.15);
					box-shadow: 0 4px 12px hwb(var(--opposite) / 0.05),	// 外发光
								0 0 1px 1px hwb(var(--opposite) / 0.1) inset;	// 内边缘
					:deep(.controlBox) {
						width: 180px;
						flex: 1 1 auto;
						margin: 0;
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
					.clear {
						width: 24px;
						height: 24px;
						border: none;
						outline: none;
						background: none;
						padding: 0;
						display: flex;
						justify-content: center;
						align-items: center;
						opacity: 0.5;
						border-radius: 4px;
						&:hover {
							box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
										0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
						}
						&:active {
							box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
										0 15px 20px -10px hwb(var(--hoverShadow) / 0.15) inset;
							transform: translateY(0.25px);
						}
						svg {
							fill: var(--33);
						}
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