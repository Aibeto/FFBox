<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, onRenderTracked, onRenderTriggered, onUpdated, StyleValue } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel } from '@common/types';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import { durationValidator, durationFixer } from '@renderer/components/validatorAndFixer';
import IconUpArrow from '../ParaBox/uparrow.svg?component';
import { formatTimeToFFmpegStyle, parseTimeString } from '@common/utils';

// const usedKeys = new Set();
// onRenderTracked(e => {
// 	console.log('[TRACKED]', e);
// 	usedKeys.add(String(e.key));
// })
// onRenderTriggered(e => {
// 	console.log('[TRIGGERED]', usedKeys.has(String(e.key)), e);
// 	if (usedKeys.has(String(e.key))) {
// 		console.log(`因 key=${String(e.key)} 变化而更新`);
// 	}
// })
// onUpdated(() => {
// 	console.log('[UPDATED] rendered')
// })

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

const deviderRef = ref<Element>(null);
const keyFramesCanvasRef = ref<HTMLCanvasElement>(null);

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

const duration = computed(() => selectedStream?.value.before.duration || 0);

// 选区时间（秒）
const inputBegin = ref(0);
const inputEnd = ref(0);
const outputBegin = ref(0);	// 输出选区开始时间（绝对时间，也就是 inputBegin + muxParams.begin）
const outputEnd = ref(0);	// 输出选区结束时间（绝对时间，也就是 inputBegin + muxParams.end）

// 视区时间（秒）
const viewBegin = ref(0);
const viewEnd = ref(0);

const rectEndsPosition = computed(() => {
	// TODO
	return {
		input: { left: 0 + '%', width: 100 + '%' } satisfies StyleValue,
		output: { left: 0 + '%', width: 100 + '%' } satisfies StyleValue,
	}
})

// 从 OutputParams 加载选区数据
const loadSelectionFromParams = () => {
	if (!selectedTasks.value.task) return;

	let ib = parseTimeString(params.value?.input.begin);
	let ie = parseTimeString(params.value?.input.end);
	let ob = parseTimeString(params.value?.mux.begin);
	let oe = parseTimeString(params.value?.mux.end);

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

const drawKeyFrames = () => {
	// TODO
}

// 选区变化处理
const handleInputBeginChange = (value: string) => {
	params.value.input.begin = value;
	appStore.applyParameters();
	loadSelectionFromParams();
};
const handleInputEndChange = (value: string) => {
	params.value.input.end = value;
	appStore.applyParameters();
	loadSelectionFromParams();
};
const handleOutputBeginChange = (value: string) => {
	params.value.mux.begin = value;
	appStore.applyParameters();
	loadSelectionFromParams();
};
const handleOutputEndChange = (value: string) => {
	params.value.mux.end = value;
	appStore.applyParameters();
	loadSelectionFromParams();
};

// 监听任务变化
watch(() => selectedTasks.value.task, () => {
	loadSelectionFromParams();
	viewBegin.value = 0;
	viewEnd.value = duration.value;
}, { immediate: true });

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
			<div class="previewArea">
				<div class="previewPlaceholder">
					<p>视频预览区域（待实现）</p>
					<p style="font-size: 12px; opacity: 0.6;">{{ inputBegin }}~{{ inputEnd }}, {{ outputBegin }}~{{ outputEnd }}</p>
				</div>
			</div>
			<div class="timelineArea">
				<canvas ref="keyFramesCanvasRef"></canvas>
				<div class="scrollArea">
					<div class="rectInput" :style="rectEndsPosition.input"></div>
					<div class="rectOutput" :style="rectEndsPosition.output"></div>
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
				.previewPlaceholder {
					color: #666;
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
				canvas, .scrollArea {
					position: absolute;
					top: 0;
					bottom: 0;
					left: 40px;
					right: 40px;
				}
				.scrollArea {
					overflow: visible;
					.rectInput, .rectOutput {
						position: absolute;
						height: 24px;
						border-radius: 4px;
						box-sizing: border-box;
					}
					.rectInput {
						top: 8px;
						border: hwb(195 0% 5%) 1px solid;
						background-color: hwb(195 0% 5% / 0.5);
					}
					.rectOutput {
						bottom: 8px;
						border: hwb(0 30% 0%) 1px solid;
						background-color: hwb(0 30% 0% / 0.5);
					}
				}
				.timelineCanvas {
					width: 100px;
					height: 30px;
					outline: red 1px solid;
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
						color: #666;
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
