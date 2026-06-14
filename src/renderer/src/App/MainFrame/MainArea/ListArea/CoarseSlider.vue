<script setup lang="ts">
import { ref, computed } from 'vue';
import { getScaleUnit } from '@renderer/common/utils';
import { useSize } from '@renderer/common/useSize';
import { useAppStore } from '@renderer/stores/appStore';

interface Props {
	total: number;
	start: number;
	end: number;
	buoySize: 'small' | 'full';
	customBuoyText?: string;
	onUpdate?: (start: number, end: number) => void;
	onChange?: (start: number, end: number) => void;
	onBuoyPointerdown?: (e: PointerEvent) => void;
}
const props = defineProps<Props>();
const appStore = useAppStore();

const trackRef = ref<HTMLDivElement>();
const { height: trackHeight } = useSize(trackRef);
const dragging = ref(false);

function indexToPercent(index: number): number {
	if (props.total <= 1) return 0;
	return index / (props.total - 1) * 100;
}
function percentToIndex(percent: number): number {
	if (props.total <= 1) return 0;
	return Math.round(percent / 100 * (props.total - 1));
}

const startPercent = computed(() => indexToPercent(props.start));
const endPercent = computed(() => indexToPercent(props.end));
const midValue = computed(() => Math.round((props.start + props.end) / 2));
const buoyTopPercent = computed(() => indexToPercent(Math.round((props.start + props.end) / 2)));

// initialOffsetPercent: 鼠标或触屏按下时位置在轨道上的百分比 - 初始百分比
function startDrag(e: PointerEvent, initialOffsetPercent: number) {
	if (props.total <= 1) return;
	dragging.value = true;

	function onPointerMove(e: PointerEvent) {
		if (!dragging.value || !trackRef.value) return;
		const track = trackRef.value;
		const rect = track.getBoundingClientRect();
		// 垂直模式：从上往下计算
		const pointerPercent = (e.clientY - rect.top) / rect.height * 100;

		// 块的高度百分比
		const startPercent = indexToPercent(props.start);
		const endPercent = indexToPercent(props.end);
		const blockHeight = endPercent - startPercent;

		// 新的 start 百分比 = 指针位置 - 拖拽偏移
		let newStartPercent = pointerPercent - initialOffsetPercent;
		// 约束：块不能超出轨道
		newStartPercent = Math.max(0, Math.min(100 - blockHeight, newStartPercent));

		const range = props.end - props.start;
		const newStart = percentToIndex(newStartPercent);
		const newEnd = newStart + range;
		if (newStart >= 0 && newEnd < props.total) props.onUpdate?.(newStart, newEnd);
	}
	function onPointerUp() {
		if (dragging.value) {
			dragging.value = false;
			props.onChange?.(props.start, props.end);
		}
		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
	}

	(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
	document.addEventListener('pointermove', onPointerMove);
	document.addEventListener('pointerup', onPointerUp);
}

function onPointerDown(e: PointerEvent) {
	if (props.total <= 1) return;
	e.preventDefault();

	const track = trackRef.value!;
	const rect = track.getBoundingClientRect();
	const clickPercent = (e.clientY - rect.top) / rect.height * 100;

	// 判断点击目标是否在浮标内，决定拖拽参考点
	const isBuoy = (e.target as HTMLElement).closest('.buoy');
	if (isBuoy) {
		e.stopPropagation();
		startDrag(e, clickPercent - buoyTopPercent.value);
		props.onBuoyPointerdown?.(e);
	} else {
		startDrag(e, clickPercent - indexToPercent(props.start));
	}
}

// 滚轮特殊功能：通过滚轮快速移动滑块
let wheelTimer: ReturnType<typeof setTimeout> | null = null;
const handleWheel = (e: WheelEvent) => {
	if (props.total <= 1) return;
	e.preventDefault();
	clearTimeout(wheelTimer ?? 0);
	wheelTimer = setTimeout(() => {
		wheelTimer = null;
		props.onChange?.(props.start, props.end);
	}, 200);
	if (e.deltaY > 0) {
		const newEnd = Math.round(Math.min(props.total, props.end + e.deltaY));
		props.onUpdate?.(newEnd - (props.end - props.start), newEnd);
	} else if (e.deltaY < 0) {
		const newStart = Math.round(Math.max(0, props.start + e.deltaY));
		props.onUpdate?.(newStart, newStart + (props.end - props.start));
	}
}

// 标签数据
const labels = computed(() => {
	const step = getScaleUnit(props.total, trackHeight.value || 300, false, 15);
	const result: { index: number; topPercent: number }[] = [];
	for (let i = 0; i < props.total; i += step) {
		result.push({ index: i, topPercent: indexToPercent(i) });
	}
	if (props.total > 1 && (props.total - 1) % step !== 0) {
		result.push({ index: props.total - 1, topPercent: 100 });
	}
	return result;
});

</script>

<template>
	<div v-if="total <= 1" style="width: 24px"></div>
	<div v-else ref="trackRef" class="coarseSlider" @pointerdown="onPointerDown" @wheel="handleWheel">
		<div class="trackBackground" />
		<div :class="['block', dragging ? 'noTransition' : '']" :style="{ top: startPercent + '%', height: endPercent - startPercent + '%' }" />
		<span v-for="label in labels" :key="label.index" class="label" :style="{ top: label.topPercent + '%' }">
			{{ label.index }}
		</span>
		<div
			:data-color_theme="appStore.frontendSettings.colorTheme"
			:class="['buoy', dragging ? 'noTransition' : '', buoySize]"
			:style="{ top: buoyTopPercent + '%', fontStyle: customBuoyText ? 'italic' : 'normal' }"
		>
			{{ customBuoyText ?? midValue }}
		</div>
	</div>
</template>

<style scoped lang="less">
	.coarseSlider {
		position: relative;
		width: 24px;
		height: 100%;
		margin: 0;
		touch-action: none;
		user-select: none;
		cursor: grab;
		.noTransition {
			transition: none !important;
		}
		.trackBackground {
			position: absolute;
			right: 0;
			top: 0;
			bottom: 0;
			width: 4px;
			background: #9994;
			border-radius: 2px;
		}
		.block {
			position: absolute;
			right: 0;
			width: 4px;
			border-radius: 3px;
			background-color: hwb(var(--primaryColor));
			transition: top 0.25s ease;
		}
		.label {
			position: absolute;
			right: 6px;
			text-align: right;
			transform: translateY(-50%);
			font-size: 7px;
			color: #9998;
			pointer-events: none;
			user-select: none;
			white-space: nowrap;
		}
		.buoy {
			position: absolute;
			right: 6px;
			display: flex;
			align-items: center;
			justify-content: center;
			background-color: hwb(var(--primaryColor));
			color: #fff;
			border-radius: 24px;
			font-size: 18px;
			padding: 4px 16px;
			cursor: grab;
			user-select: none;
			touch-action: none;
			white-space: nowrap;
			overflow: hidden;
			transform: translateY(-50%)	scale(1);
			transform-origin: 100% 50%;
			transition:
				top 0.25s ease,
				transform 0.3s cubic-bezier(0.2, 1, 0.3, 1),
				opacity 0.3s ease;
			pointer-events: auto;
			&.small {
				transform: translateY(-50%)	scale(0.5);
				opacity: 0.5;
			}
			&[data-color_theme="themeLight"] {
				// background: linear-gradient(180deg, hwb(210 45% 5%), hwb(210 25% 10%));
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(210 0% 100% / 0.15), // 外部阴影
								0 4px 6px hwb(210 0% 100% / 0.2) inset; // 内部凹陷阴影
				}
			}
			&[data-color_theme="themeDark"] { 
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 0 0 0.5px hwb(var(--highlight) / 0.5) inset,	// 包边
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
								0 8px 12px hwb(var(--hoverShadow) / 0.4) inset; // 内部凹陷阴影
				}
			}
		}
	}
</style>
