<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);

const centerDraggerPos = ref(50);

const handleCenterDraggerDragStart = (event: MouseEvent | TouchEvent) => {
	const draggerRect = event.target.getBoundingClientRect();
	const mainAreaRect = event.target.parentElement.getBoundingClientRect();
	const inElementX = ((event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX) - draggerRect.x;	// 鼠标在元素内的 X
	// 添加鼠标事件捕获
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		const mouseX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;	// 鼠标在窗口内的 X
		let listPercent = (mouseX - inElementX + 8) / mainAreaRect.width;
		listPercent = Math.min(Math.max(listPercent, 0.2), 0.8);
		centerDraggerPos.value = listPercent * 100;
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

</script>

<template>
	<div class="mediaInfo">
		<div class="title">{{ selectedTasks.count === 0 ? '您未选择任务' : selectedTasks.task.taskName }}</div>
		<div class="container">
            <div class="left" :style="{ width: `${centerDraggerPos}%` }">
				<div class="title">
					输入文件信息<span style="opacity: 0.5; font-size: 0.7em;">当前 FFBox 版本仅支持单输入文件的信息显示</span>
				</div>
				<div class="listContainer">
				</div>
			</div>
			<div class="dragger" :style="{ left: `${centerDraggerPos}%` }" @mousedown="handleCenterDraggerDragStart($event)" @touchstart="handleCenterDraggerDragStart($event)" />
			<div class="right" :style="{ width: `${100 - centerDraggerPos}%`}">
				<div class="title">输出文件信息</div>
				<div class="listContainer">
				</div>
			</div>

		</div>
	</div>
</template>

<style lang="less" scoped>
	.mediaInfo {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		.title {
			font-size: 14px;
			padding: 4px;
		}
		.container {
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: center;
			font-size: 14px;
            &>.left, &>.right {
				height: 100%;
				box-sizing: border-box;
				padding: 10px 12px;
				text-align: left;
				// outline: red 1px solid;
				.title {
					height: 24px;
					display: flex;
					justify-content: space-between;
					align-items: center;
					white-space: nowrap;
					overflow: hidden;
					.right {
						flex: 0 1 auto;
						display: flex;
						justify-content: space-between;
						align-items: center;
						white-space: nowrap;
					}
				}

			}
			.dragger {
				height: 100%;
				width: 16px;
				display: flex;
				justify-content: center;
				align-items: center;
				margin: 0 -8px;
				z-index: 1;	// 为了防止被 .right 遮住
				cursor: ew-resize;
				// outline: green 1px solid;
				&::after {
					content: '';
					height: calc(100% - 24px);
					width: 4px;
					// background-color: hwb(var(--opposite80)  / 0.2);
					border-radius: 2px;
					background-color: hwb(var(--hoverLightBg) / 0.5);
					box-shadow: 0.5px 1px 4px hwb(var(--hoverShadow) / 0.2),    // 阴影（写在最前面，渲染时最后渲染）
								0 0 0.5px 1.5px hwb(var(--hoverLightBg)), // 斜坡，其中扩展半径是斜坡长度，模糊半径是斜坡底的缓坡
								0 1px 1px 0px hwb(var(--highlight) / 0.5) inset;	// 上高光
					pointer-events: none;
				}
			}
        }
	}
</style>