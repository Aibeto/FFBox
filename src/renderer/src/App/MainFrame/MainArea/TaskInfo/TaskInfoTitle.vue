<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { UITask } from '@renderer/types';

const props = defineProps<{
	task: UITask | undefined;
	fallbackToGloabl?: boolean;
}>();

const appStore = useAppStore();

const runIndex = computed(() => {
	if (!props.task) return 1;
	return props.task.selectedRunIndex;
});

const titleText = computed(() => {
	if (!props.task) return '您未选择任务';
	return props.task.taskName;
});

const runLabel = computed(() => {
	if (!props.task) return '';
	if (props.task.runs.length <= 2) return '';	// 只有 mediaInfo + 1 个 run 时不显示
	if (props.fallbackToGloabl && !props.task.runs[runIndex.value].cmdData) return `（第 ${runIndex.value} 次未运行，当前显示已扫描的媒体信息）`
	return `（第 ${runIndex.value} 次运行）`;
});

const canGoPrev = computed(() => runIndex.value > 1);
const canGoNext = computed(() => props.task ? runIndex.value < props.task.runs.length - 1 : false);

const goPrev = () => {
	if (!props.task || !canGoPrev.value) return;
	props.task.selectedRunIndex = runIndex.value - 1;
	appStore.applySelectedTask();
};
const goNext = () => {
	if (!props.task || !canGoNext.value) return;
	props.task.selectedRunIndex = runIndex.value + 1;
	appStore.applySelectedTask();
};
</script>

<template>
	<div class="taskInfoTitle">
		<span class="title">{{ titleText }}</span>
		<div v-if="runLabel" class="runInfo">
			<div class="buttonWrapper">
				<button class="arrow arrowLeft" :disabled="runIndex.value <= 1" @click="goPrev">◀</button>
				<button class="arrow arrowRight" :disabled="runIndex.value >= props.task.runs.length - 1" @click="goNext">▶</button>
			</div>
			<span class="runLabel">{{ runLabel }}</span>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.taskInfoTitle {
		flex: 0 0 auto;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		.title {
			flex: 0 1 auto;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.runInfo {
			position: relative;
			flex: 0 0 auto;
			height: 26px;
			// width: 140px;
			display: flex;
			align-items: center;
			justify-content: center;
			isolation: isolate;
			// outline: red 1px solid;
			.buttonWrapper {
				position: absolute;
				width: 100%;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: stretch;
				z-index: -1;
				-webkit-mask-image: linear-gradient(to right, black 25%, transparent 50%, black 75%);
			}
			opacity: 0.7;
			.arrow {
				// outline: blue 1px solid;
				flex: 1 1 auto;
				height: 22px;
				// width: 30px;
				margin: 0 4px;
				border: none;
				background: none;
				color: inherit;
				border-radius: 4px;
				font-size: 12px;
				line-height: 1;
				&:hover:not(:disabled) {
					background-color: hwb(var(--bg99) / 0.4);
					box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
								0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
				}
				&:active:not(:disabled) {
					box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
								0 20px 15px -10px hwb(var(--hoverShadow) / 0.15) inset;
					transform: translateY(0.25px);
				}
				&:disabled {
					opacity: 0.3;
					cursor: default;
				}
				&.arrowLeft {
					text-align: left;
				}
				&.arrowRight {
					text-align: right;
				}
			}
			.runLabel {
				font-size: 12px;
				pointer-events: none;
				padding: 0 22px;;
			}
		}
	}
</style>
