<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Task, TaskStatus } from '@common/types';
import { formatTimeToFFmpegStyle, getOutputFileTime, getTimeString } from '@common/utils';
import { getOutputFileBaseName } from '@common/params/formats';
import { useTooltip } from '@renderer/common/tooltipUtil';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import Popup from '@renderer/components/Popup/Popup';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0
	? { task: undefined, count: 0 }
	: { task: appStore.currentServer.data.tasks[[...appStore.selectedTask][0]], count: appStore.selectedTask.size }
);

const centerDraggerPos = ref(50);

const openFile = (task: Task, filePath: string, outputIndex?: number) => {
	const entity = appStore.currentServer.entity;
	if ([TaskStatus.finished, TaskStatus.error].includes(task.status)) {
		if (entity.ip === 'localhost') {
			nodeBridge.openFile(`"${filePath}"`);
		} else {
			const newFileBaseName = getOutputFileBaseName(task.after.outputs[outputIndex].mux, task.taskName);
			const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
			if (nodeBridge.env === 'electron') {
				let fileTime = undefined;
				const output = task.after.outputs[outputIndex];
				const mux = output.mux;
				if (mux.keepFileTime) {
					let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, outputIndex);
					fileTime = { accessTime, createTime, modifyTime };
				}
				nodeBridge.ipcRenderer?.send('downloadFile', { url, sessionId: entity.sessionId, finalFileBaseName: newFileBaseName, fileTime });
				appStore.downloadMap.set(url, appStore.currentServer.data.id);
			} else {
				const elem = document.createElement('a');
				elem.href = `${url}?fileBaseName=${newFileBaseName}`;	// 目前只对浏览器环境添加此参数控制响应的 header。electron 环境会涉及 encodeURI 的操作，因此较方便的做法是分开处理
				elem.click();
			}
		}
	} else {
		Popup({ message: `转码完成后才可以${entity.ip === 'localhost' ? '打开' : '下载'}输出文件哦` })
	}
};

const getOutputFileTimeString = (task: Task, index: number, type: 'createTime' | 'modifyTime') => {
	const result = getOutputFileTime(task, index);
	if (result.ok) {
		return getTimeString(new Date(result[type]));
	} else {
		return '不改变';
	}
}

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
		<div class="container" :data-color_theme="appStore.frontendSettings.colorTheme">
            <div class="left" :style="{ width: `${centerDraggerPos}%` }">
				<div class="title">
					输入文件信息<span style="opacity: 0.5; font-size: 0.7em;">当前 FFBox 版本仅支持单输入任务的文件信息显示</span>
				</div>
				<div class="listContainer">
					<button class="node inputNode" v-if="selectedTasks.task">
						<div class="groups">
							<div class="group">
								<div class="infoBlock">
									<h4>格式</h4>
									<p>{{ selectedTasks.task.before.format }}</p>
								</div>
								<div class="infoBlock">
									<h4>时长</h4>
									<p>{{ formatTimeToFFmpegStyle(selectedTasks.task.before.duration) }}</p>
								</div>
							</div>
							<div class="group">
								<div class="infoBlock">
									<h4>视频编码</h4>
									<p>{{ selectedTasks.task.before.vcodec }}</p>
								</div>
								<div class="infoBlock">
									<h4>视频尺寸</h4>
									<p>{{ selectedTasks.task.before.vresolution }}</p>
								</div>
								<div class="infoBlock">
									<h4>视频帧率</h4>
									<p>{{ selectedTasks.task.before.vframerate }}</p>
								</div>
								<div class="infoBlock">
									<h4>视频码率</h4>
									<p>{{ selectedTasks.task.before.vbitrate }} kbps</p>
								</div>
							</div>
							<div class="group">
								<div class="infoBlock">
									<h4>音频编码</h4>
									<p>{{ selectedTasks.task.before.acodec }}</p>
								</div>
								<div class="infoBlock">
									<h4>音频码率</h4>
									<p>{{ selectedTasks.task.before.abitrate }} kbps</p>
								</div>
							</div>
							<div class="group">
								<div class="infoBlock">
									<h4>创建时间</h4>
									<p>{{ getTimeString(new Date(selectedTasks.task.before.createTime)) }}</p>
								</div>
								<div class="infoBlock">
									<h4>修改时间</h4>
									<p>{{ getTimeString(new Date(selectedTasks.task.before.modifyTime)) }}</p>
								</div>
							</div>
						</div>
					</button>
				</div>
			</div>
			<div class="dragger" :style="{ left: `${centerDraggerPos}%` }" @mousedown="handleCenterDraggerDragStart($event)" @touchstart="handleCenterDraggerDragStart($event)" />
			<div class="right" :style="{ width: `${100 - centerDraggerPos}%`}">
				<div class="title">输出文件信息</div>
				<div class="listContainer">
					<button
						class="node outputNode"
						v-if="selectedTasks.task"
						v-for="(outputFile, index) in selectedTasks.task.outputFiles"
						@click="openFile(selectedTasks.task, outputFile, index)"
						v-bind="useTooltip(appStore.currentServer.entity.ip === 'localhost' ? '点击打开输出文件' : '点击下载输出文件', 'tr')"
					>
						<div class="fileName">{{ outputFile }}</div>
						<div class="groups">
							<div class="group">
								<div class="infoBlock">
									<h4>创建时间</h4>
									<p>{{ getOutputFileTimeString(selectedTasks.task, index, 'createTime') }}</p>
								</div>
							</div>
							<div class="group">
								<div class="infoBlock">
									<h4>修改时间</h4>
									<p>{{ getOutputFileTimeString(selectedTasks.task, index, 'modifyTime') }}</p>
								</div>
							</div>
						</div>
					</button>
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
		&>.title {
			font-size: 14px;
			padding: 4px;
			margin-bottom: -8px;
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
				.listContainer {
					.node {
						width: 100%;
						border: none;
						color: inherit;
						background: linear-gradient(180deg, hwb(var(--bg99)), hwb(var(--bg94)));
						border-radius: 8px;
						padding: 12px;
						font-family: inherit;
					}
					.inputNode, .outputNode {
						.fileName {
							font-size: 14px;
							font-weight: 500;
							margin: 0 0 8px;
							overflow: hidden;
							text-overflow: ellipsis;
						}
						.groups {
							display: flex;
							justify-content: stretch;
							overflow: auto;
							margin: 0 -8px;
							.group {
								flex: 1 1 auto;
								padding: 0 8px;
								&:not(.group:last-child) {
									border-right: hwb(0 50% 50% / 0.2) 1px solid;
								}
								.infoBlock {
									h4 {
										font-size: 10px;
										font-weight: 500;
										opacity: 0.7;
										margin: 0;
									}
									&:last-child p {
										margin-bottom: 0;
									}
									p {
										font-size: 13px;
										margin: 4px 0 8px 0;
									}
								}
							}
						}
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
		.container[data-color_theme="themeLight"] {
			.listContainer .node {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:hover {
					box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
								0 0 0 0.5px hwb(var(--highlight)) inset,	// 包边
								0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
				}
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
								0 8px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
				}
			}
		}
		.container[data-color_theme="themeDark"] {
			.listContainer .node {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 0 0 0.5px hwb(var(--highlight) / 0.5) inset,	// 包边
							0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
				&:hover {
					box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
								0 0 0 0.75px hwb(var(--highlight)) inset,	// 包边
								0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
				}
				&:active {
					box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
								0 8px 12px hwb(var(--hoverShadow) / 0.4) inset; // 内部凹陷阴影
				}
			}
		}
	}
</style>