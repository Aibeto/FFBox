<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UploadFile } from '@renderer/types';
import { useAppStore } from '@renderer/stores/appStore';
import { useTooltip } from '@renderer/common/tooltipUtil';
import IconUpArrow from '../Parabox/uparrow.svg?component';
import Checkbox from '@renderer/components/Checkbox/Checkbox.vue';

const appStore = useAppStore();
const deviderRef = ref<Element>(null);

const task = computed(() => appStore.currentServer?.data.tasks[appStore.showTaskInfo]);

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

</script>

<template>
	<div class="transferCenter" :data-color_theme="appStore.frontendSettings.colorTheme">
		<div class="upper">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<div class="buttons" @mousedown="handleDragStart" @touchstart="handleDragStart">
					<h2>任务信息</h2>
				</div>
				<button class="showGlobalButton" @click="appStore.showTaskInfo = undefined" aria-label="任务信息面板开关">
					<span>返回参数</span>
					<IconUpArrow :style="{ transform: 'rotate(-90deg)' }" />
				</button>
			</div>
		</div>
		<div class="lower">
		</div>
	</div>
</template>

<style lang="less" scoped>
	.transferCenter {
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
						font-size: 16px;
						font-weight: 500;
						text-align: center;
						color: var(--titleText);

					}
				}
				.showGlobalButton {
					position: absolute;
					top: 0;
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
						margin-right: 0px;
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
					@media only screen and (min-width: 960px) {
						width: 120px;
						span {
							width: 62px;
							margin-right: 8px;
						}
					}
				}
			}
		}
		.lower {
		}
	}

</style>
