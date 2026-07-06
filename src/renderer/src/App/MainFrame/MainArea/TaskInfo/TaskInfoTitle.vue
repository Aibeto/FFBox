<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { UITask } from '@renderer/types';
import RockerSwitch from '@renderer/components/RockerSwitch/RockerSwitch.vue';

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
	if (props.fallbackToGloabl && !props.task.runs[runIndex.value].cmdData) return `第 ${runIndex.value} 次未运行，当前显示已扫描的媒体信息`
	return `第 ${runIndex.value} 次运行`;
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
		<RockerSwitch
			v-if="runLabel"
			:label="runLabel"
			size="s"
			:disabled-left="runIndex <= 1"
			:disabled-right="runIndex >= (props.task?.runs.length ?? 0) - 1"
			@left="goPrev"
			@right="goNext"
		/>
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
	}
</style>