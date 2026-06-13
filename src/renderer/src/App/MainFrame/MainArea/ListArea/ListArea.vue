<script setup lang="tsx">
import { computed, ref, watch } from 'vue';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel } from '@common/types';
import { UITask } from '@renderer/types';
import { getOutputFileBaseName } from '@common/params/formats';
import { getOutputFileTime } from '@common/utils';
import { useScrollStop } from './useScrollStop';
import CoarseSlider from './CoarseSlider';
import { showAddTaskPrompt, showOpenFilePrompt } from '@renderer/components/misc/AddTasks';
import Popup from '@renderer/components/Popup/Popup';
import { TaskItem } from './TaskItem/TaskItem';
import showMenu from '@renderer/components/Menu/Menu';
import ImageNoffmpeg from './noffmpeg.svg?component';

const appStore = useAppStore();

const selectedTask_last = ref(-1);
const taskListRef = ref<HTMLDivElement>();
const listContainerRef = ref<HTMLElement>(null!);	// 列表的滚动容器

const debugLauncher = (() => {
	let clickSpeedCounter = 0;
	let clickSpeedTimer = 0;
	let clickSpeedTimerStatus = false;
	return function (event: MouseEvent) {
		if (event.button !== 2) {
			return;
		}
		clickSpeedCounter += 20;
		if (clickSpeedCounter > 100) {
			Popup({
			    message: '打开开发者工具',
			    level: NotificationLevel.info
			});
			console.log('打开开发者工具');
			nodeBridge.openDevTools();
			clickSpeedCounter = 0;
			clearInterval(clickSpeedTimer);
			clickSpeedTimerStatus = false;
		} else if (clickSpeedTimerStatus == false) {
			clickSpeedTimerStatus = true;
			clickSpeedTimer = setInterval(() => {
				// console.log(clickSpeedCounter)
				if (clickSpeedCounter == 0) {
					clearInterval(clickSpeedTimer);
					clickSpeedTimerStatus = false;
				}
				clickSpeedCounter -= 1;
			}, 70) as any as number;
		}
	}
})();

const handleTaskClicked = (event: MouseEvent, id: number, index: number) => {
	let currentSelection = new Set(appStore.selectedTask);
	// TODO 应该直接用后端的 taskIndex 而不是可见的 index
	if (event.shiftKey) {
		// if (selectedTask_last.value !== -1) {		// 之前没选东西，现在选一堆
		// 	currentSelection.clear();
		// 	const minIndex = Math.min(selectedTask_last.value, index);
		// 	const maxIndex = Math.max(selectedTask_last.value, index);
		// 	for (let i = minIndex; i <= maxIndex; i++) {	// 对 taskOrder 里指定区域项目进行选择
		// 		currentSelection.add(tasks.value[i].id);
		// 		// if (taskArray.has(id)) {	// 如果任务未被删除
		// 		// 	currentSelection.add(i);
		// 		// }
		// 	}
		// } else {							// 之前没选东西，现在选第一个
		// 	currentSelection = new Set([id]);
		// }
	} else if (event.ctrlKey == true || navigator.platform.indexOf('Mac') >= 0 && event.metaKey == true) {
		if (currentSelection.has(id)) {
			currentSelection.delete(id);
		} else {
			currentSelection.add(id);
		}
	} else {
		currentSelection.clear();
		currentSelection.add(id);
	}
	selectedTask_last.value = index;
	// this.selectedTask = new Set([...this.selectedTask])	// 更新自身的引用值以触发 computed: taskSelected
	appStore.selectedTask = new Set([...currentSelection]);
	appStore.applySelectedTask();
};

const handleTaskBatchContextMenu = (event: MouseEvent) => {
	showMenu({
		menu: [
			{ type: 'normal', label: `已选中 ${appStore.selectedTask.size} 个任务`, value: 'description', disabled: true },
			{ type: 'separator',  },
			{ type: 'normal', icon: <span>▶️</span>, label: '立即开始', value: '立即开始选中任务', tooltip: '马上启动所选任务的编码（仅对未启动、排队开始、排队继续任务有效）', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer?.entity.taskStart(taskId);
				}
			} },
			{ type: 'normal', icon: <span>⏳</span>, label: '排队开始', value: '排队开始选中任务', tooltip: '将所选任务置入准备状态（对未启动任务置入排队开始状态，对已暂停任务置入排队继续状态）', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer?.entity.taskReady(taskId);
				}
			} },
			{ type: 'normal', icon: <span>⏹️</span>, label: '停止或重置', value: '停止或重置选中任务', tooltip: '对正在运行任务进行软停止，对正在停止任务进行硬停止，对已停止、已完成、出错任务置入未开始状态', onClick: () => {
				for (const taskId of appStore.selectedTask) {
					appStore.currentServer?.entity.taskReset(taskId);
				}
			} },
			{ type: 'normal', icon: <span>🗑️</span>, label: '删除', value: '删除选中任务', tooltip: '对未开始、上传中任务进行删除操作（对其他状态任务无效）', onClick: () => {
				appStore.deleteTasks([...appStore.selectedTask]);
			} },
			...(appStore.currentServer?.entity.ip !== 'localhost' ? [
				{ type: 'normal' as const, icon: <span>⬇️</span>, label: '下载输出文件', value: '下载输出文件', tooltip: '将所有已完成任务输出文件下载到指定文件夹', onClick: () => {
					if (!appStore.currentServer) { debugger; throw 'ub'; }
					const entity = appStore.currentServer.entity;
					const data = appStore.currentServer.data;
					const tasks = [...appStore.selectedTask].map((taskId) => {
						const idx = data.taskIdToIndex.get(taskId);
						return idx !== undefined ? data.tasks[idx] : undefined;
					}).filter(Boolean) as UITask[];
					if (nodeBridge.env === 'electron') {
						const downloadList = [];
						for (const task of tasks) {
							for (const [s_index, filePath] of Object.entries(task.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(task.after.outputs[+s_index].mux, task.taskName);
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								let fileTime = undefined;
								const output = task.after.outputs[+s_index];
								const mux = output.mux;
								if (mux.keepFileTime) {
									let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, +s_index);
									fileTime = { accessTime, createTime, modifyTime };
								}
								downloadList.push({ url, finalFileBaseName: newFileBaseName, fileTime });
								appStore.downloadMap.set(url, data.id);
							}							
						}
						nodeBridge.ipcRenderer?.send('downloadFiles', { sessionId: entity.sessionId, files: downloadList });
					} else {
						for (const task of tasks) {
							for (const [s_index, filePath] of Object.entries(task.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(task.after.outputs[+s_index].mux, task.taskName);
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								const elem = document.createElement('a');
								elem.href = `${url}?fileBaseName=${newFileBaseName}`;	// 目前只对浏览器环境添加此参数控制响应的 header。electron 环境会涉及 encodeURI 的操作，因此较方便的做法是分开处理
								elem.click();
							}
						}
					}
				} },
			] : []),
		],
		type: 'action',
		triggerRect: { xMin: event.pageX - 110, xMax: event.pageX + 110, yMin: event.pageY, yMax: event.pageY },
	})
};

const handleDownloadFFmpegClicked = () => {
	nodeBridge.jumpToUrl('https://ffmpeg.org/download.html');
};

// 新任务加入，滚动到底
// TODO 需要额外检查现在的可视范围，不只是 scrollTop
// watch(() => tasks.value.length, (newValue, oldValue) => {
// 	if (newValue > oldValue) {
// 		const elem = taskListRef.value!.parentElement!;
// 		const elemHeight = elem.getBoundingClientRect().height;
// 		if (elem.scrollTop + elemHeight > elem.scrollHeight - elemHeight * 1) {
// 			elem.scrollTop = elem.scrollHeight - elem.getBoundingClientRect().height;
// 		}
// 	}
// });

// #region 仿虚拟列表（条件渲染）

// const heightList = computed(() => Object.entries(appStore.currentServer.data.tasks).map(([s_id, task]) => {
// 	const settings = appStore.taskViewSettings;
// 	const uploadFiles = appStore.currentServer.data.uploadFiles.filter((uploadFile) => uploadFile.taskId === +s_id);
// 	const isUploading = uploadFiles.length > 0 && task.status === TaskStatus.initializing;
// 	const showDashboard = [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(task.status) || isUploading;
// 	let height = 4;
// 	height += settings.showParams ? 24 : 0;
// 	height += showDashboard ? 72 : 0;
// 	height += settings.showCmd ? 64 : 0;
// 	height = Math.max(24, height);
// 	return height;
// }));

const handleEntry = (entry: IntersectionObserverEntry, dataset: any) => {
	isVisible.value.set(+dataset.index, entry.isIntersecting);
}
const intersectProps = computed(() => ({ onChange: handleEntry, options: {  } }));
const isVisible = ref(new Map<number, boolean>());	// index -> boolean

// #endregion

// #region 无限滚动

const latestRequestId = ref(0);	// 自增 id。若列表刷新过程中再次请求刷新，只保留最新请求的结果
const isPassiveScrolling = ref(false);	// 粗调完成后，会进行一次滚动位置修正（滚动条居中）。修正过程中，此值被打开，避免重复触发滚动停止检测。
const fetchingListPreventAnimation = ref(false);	// 列表刷新过程中，此值被打开，避免任务项的进出动画

// 粗调滚动条（范围滑动条）
const coarseStart = ref(0);	// 可见范围起始 index
const coarseEnd = ref(0);	// 可见范围结束 index

/**
 * 用 DOM 方法找到当前视口中最上/最下任务的全局序号
 * index 来源：元素的 data-taskindex 属性（由 UITask.taskIndex 写入）
 * 若视口中没有可见任务，返回 { firstIndex: 0, lastIndex: 0, distanceFirstElementToScrollTop: 0 }
 * distanceFirstElementToScrollTop 正数：滚过了，第一个元素的头比视口顶部更上（不滚到顶的大多数情况）；负数：第一个元素的头头比视口顶部更下
 * distanceLastElementToScrollBottom 正数：滚过了，最后一个元素的尾比视口底部更上（滚到底的情况）；负数：最后一个元素的尾比视口底部更下
 */
function getVisibleRange(): { firstIndex: number; lastIndex: number; distanceFirstElementToScrollTop: number; distanceLastElementToScrollBottom: number } | undefined {
	const container = listContainerRef.value;
	if (!container) return;
	const scrollTop = container.scrollTop;
	const scrollBottom = scrollTop + container.clientHeight;
	const taskElements = taskListRef.value?.children;
	if (!taskElements || taskElements.length === 0) return;

	let firstIndex: number | undefined;
	let lastEl: HTMLElement | undefined;
	let distanceFirstElementToScrollTop: number | undefined;
	// 循环每个元素，遇到第一个出现的就记录为 firstIndex，一直记录 lastIndex 直到后面的不出现
	for (let i = 0; i < taskElements.length; i++) {
		const el = taskElements[i] as HTMLElement;
		const taskIndex = parseInt(el.dataset.taskindex ?? '');
		if (isNaN(taskIndex)) continue;
		const elTop = el.offsetTop;
		const elBottom = elTop + el.offsetHeight;
		if (elBottom > scrollTop && elTop < scrollBottom) {
			if (firstIndex === undefined) {
				distanceFirstElementToScrollTop = scrollTop - elTop;
				firstIndex = taskIndex;
			}
			lastEl = el;
		}
	}
	if (firstIndex && lastEl) {
		const lastIndex = parseInt(lastEl.dataset.taskindex ?? '');
		const elBottom = lastEl.offsetTop + lastEl.offsetHeight;
		return { firstIndex, lastIndex, distanceFirstElementToScrollTop: distanceFirstElementToScrollTop!, distanceLastElementToScrollBottom: scrollBottom - elBottom };
	}
	return { firstIndex: 0, lastIndex: 0, distanceFirstElementToScrollTop: 0, distanceLastElementToScrollBottom: 0 };
}

/**
 * 滚动停止处理：获取视口中的首尾任务，计算新缓冲区，拉取数据，居中滚动
 */
const handleScrollStop = () => {
	if (!appStore.currentServer) return;

	const range = getVisibleRange();
	if (!range) return;

	const requestId = ++latestRequestId.value;	// 递增 id

	if (coarseStart.value === range.firstIndex && coarseEnd.value === range.lastIndex) return;	// 原地滚动，不请求
	console.log(coarseStart.value, coarseEnd.value, '->', range.firstIndex, range.lastIndex, range.distanceLastElementToScrollBottom);

	// 若不作以下处理，列表拉到靠近头部或尾部时，会触发 2 次拉列表请求，这是因为处在头/尾时，即使真正的列表前/后有更多任务，前端并没有对应的 DOM，导致 range 会计算少一两个任务
	// 因此当滚动到顶或底时进行一个缓冲区调整。这里的 8 是任务列表上下边距，但底边距实际上要比这大很多，甚至会出现多 2 个任务的情况（跟 dropfilesdiv 尺寸有关），为简便起见这里只加 1 个任务
	if (range.distanceFirstElementToScrollTop < 8) range.firstIndex -= 1;
	if (range.distanceLastElementToScrollBottom > 8) range.lastIndex += 1;

	// 数据更新且 DOM 渲染后，居中滚动。由于浏览器自带 Scroll Anchoring，任务列表更新后无论是前面还是后面的 DOM 数量有变动，浏览器都会保持可见位置不变，因此大多数情况不需要处理
	// 需要处理的是滚动位置接近头部的情况。浏览器会认为用户就想要固定在顶部，这时候就需要手动处理一下。
	const initialScrollTop = listContainerRef.value.scrollTop;
	if (initialScrollTop <= 1) {
		listContainerRef.value.scrollTop += 1;
	}
	fetchingListPreventAnimation.value = true;
	// 传入首尾可见任务的 index，updateTaskList 内部会头 -100 、尾 +100 进行数据更新
	appStore.updateTaskList(appStore.currentServer, range.firstIndex, range.lastIndex).then(() => {
		if (requestId !== latestRequestId.value) return;	// 若已有更新的请求，不处理
		// centerScroll(range.firstIndex, range.lastIndex);	// 会导致检测到 scroll 事件，触发 handleScrollStop
		setTimeout(() => {
			fetchingListPreventAnimation.value = false;
			if (initialScrollTop <= 1) {
				listContainerRef.value.scrollTop -= 1;
			}
		}, 0);
	});

	// 同步粗调滚动条
	coarseStart.value = range.firstIndex;
	coarseEnd.value = range.lastIndex;
};

// 滚动停止检测
const { isScrolling } = useScrollStop({
	targetRef: listContainerRef,
	disabledRef: isPassiveScrolling,
	onScrollStop: handleScrollStop,
});

/**
 * 粗调滑动条值变化（拖动中实时更新，不加载数据）
 */
const handleCoarseSliderUpdateStart = (val: number) => {
	coarseStart.value = val;
};
const handleCoarseSliderUpdateEnd = (val: number) => {
	coarseEnd.value = val;
};

/**
 * 粗调滑动条松手（加载数据）
 */
const handleCoarseSliderChange = ({ start, end }: { start: number; end: number }) => {
	if (!appStore.currentServer) return;
	console.log('粗调跳转', start, '~', end);
	fetchingListPreventAnimation.value = true;
	isPassiveScrolling.value = true;

	// 跳转后，传入 start/end 作为可见范围，updateTaskList 内部会头 -100 、尾 +100
	appStore.updateTaskList(appStore.currentServer, start, end).then(() => {
		// 数据更新且 DOM 渲染后，居中滚动
		setTimeout(() => {
			const container = listContainerRef.value;
			const taskList = taskListRef.value;
			if (container && taskList) {
				const targetIndex = Math.round((start + end) / 2);
				const children = taskList.children;
				isPassiveScrolling.value = true;
				for (let i = 0; i < children.length; i++) {
					const el = children[i] as HTMLElement;
					const taskIndex = parseInt(el.dataset.taskindex ?? '');
					if (taskIndex === targetIndex) {
						const elCenter = el.offsetTop + el.offsetHeight / 2;
						const containerCenter = container.clientHeight / 2;
						container.scrollTop = elCenter - containerCenter;
						break;
					}
				}
			}
			fetchingListPreventAnimation.value = false;
			isPassiveScrolling.value = false;
		}, 0);
	});
};

/**
 * 监听任务总数变化，同步粗调滚动条范围
 */
watch(() => appStore.currentServer?.data.totalCount, (newTotal) => {
	if (!newTotal) return;
	const range = getVisibleRange();
	if (range) {
		coarseStart.value = range.firstIndex;
		coarseEnd.value = range.lastIndex;
	}
});

/**
 * 计算粗调滚动条是否可见
 */
const showCoarseScrollbar = computed(() => {
	return appStore.currentServer && appStore.currentServer.data.totalCount > 11;
});

// #endregion

</script>

<template>
	<div class="listarea" ref="listContainerRef">
		<div class="tasklist" ref="taskListRef">
			<TransitionGroup :name="fetchingListPreventAnimation ? '' : 'tasklistTrans'">
				<TaskItem
					v-for="task in appStore.frontendSettings.useVirtualTaskList ? appStore.currentServer?.data.tasks || [] : []"
					v-intersect="intersectProps"
					:key="task.id"
					:task="task"
					:id="task.id"
					:index="task.taskIndex ?? 0"
					:show="isVisible.get((task.taskIndex ?? 0) - 2) || isVisible.get((task.taskIndex ?? 0) + 2) || isVisible.get(task.taskIndex ?? 0) || false"
					:selected="appStore.selectedTask.has(task.id)"
					:should-handle-hover="true"
					@click="handleTaskClicked($event, task.id, task.taskIndex)"
					@batchContextMenu="handleTaskBatchContextMenu"
				/>
				<TaskItem
					v-for="task in appStore.frontendSettings.useVirtualTaskList ? [] : appStore.currentServer?.data.tasks || []"
					:key="task.id"
					:task="task"
					:id="task.id"
					:index="task.taskIndex ?? 0"
					:show="true"
					:selected="appStore.selectedTask.has(task.id)"
					:should-handle-hover="true"
					@click="handleTaskClicked($event, task.id, task.taskIndex)"
					@batchContextMenu="handleTaskBatchContextMenu"
				/>
			</TransitionGroup>
		</div>
		<div
			v-if="appStore.currentServer?.data.ffmpegInfo.version"
			class="dropfilesdiv"
			@click="appStore.selectedTask = new Set(); appStore.taskSelectionModified = false;"
			@mousedown="debugLauncher($event)"
			@dblclick="nodeBridge.env === 'electron' ? showAddTaskPrompt() : showOpenFilePrompt().then((fileList) => appStore.addTasks(fileList))"
		>
			<div class="dropfilesimage" :class="false ? 'imgDragging' : 'imgNormal'" />
		</div>
		<div v-if="!appStore.currentServer?.data.ffmpegInfo.version" class="noffmpeg">
			<div class="box">
				<ImageNoffmpeg />
				<div class="right">
					<h2>FFmpeg 依赖缺失</h2>
					<p class="smallTip">请按以下步骤解决问题：</p>
					<div style="height: 12px" />
					<p>1. 在<a @click="handleDownloadFFmpegClicked"> FFmpeg 官网</a>下载适用于 <span>{{ appStore.currentServer?.data.os || '对应操作系统' }}</span> 的程序</p>
					<p v-if="['Windows', 'unknown'].includes(appStore.currentServer?.data.os!)">　　2.1. 选择一：将 ffmpeg 可执行文件所在路径放至于环境变量中</p>
					<p v-if="['MacOS', 'Linux'].includes(appStore.currentServer?.data.os!)">　　2.1. 选择一：将 ffmpeg 可执行文件放入 /usr/local/bin</p>
					<p v-if="['Windows', 'Linux', 'unknown'].includes(appStore.currentServer?.data.os!)">　　2.2. 选择二：将 ffmpeg 可执行文件放入 FFBox 可执行程序相同目录</p>
					<p v-if="appStore.currentServer?.data.os === 'MacOS'">　　2.2. 选择二：将 ffmpeg 可执行文件放入 {{ appStore.currentServer?.data.isSandboxed ? 'FFBox.app/Contents/Resources' : 'FFBoxService 可执行程序相同目录' }}</p>
					<div style="height: 4px" />
					<p>完成以上操作后，重启{{ appStore.currentServer?.entity.ip === 'localhost' ? '本软件' : ' FFBoxService ' }}即可开始使用</p>
					<div style="height: 12px" />
				</div>
			</div>
		</div>
	</div>
	<!-- 粗调滚动条：范围滑动条，悬浮在列表父节点底部 -->
	<div class="coarse-scrollbar" v-if="showCoarseScrollbar">
		<CoarseSlider
			:total="appStore.currentServer!.data.totalCount"
			:start="coarseStart"
			:end="coarseEnd"
			@update:start="handleCoarseSliderUpdateStart"
			@update:end="handleCoarseSliderUpdateEnd"
			@change="handleCoarseSliderChange"
		/>
	</div>
</template>

<style scoped lang="less">
	.listarea {
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		padding: 8px 0;
		overflow-y: auto;
		.tasklist {
			margin-bottom: 14px;
			.tasklistTrans-enter-from {
				--height: 0px !important;
				margin-bottom: 0;
				opacity: 0;
				// transition: all 3s ease, opacity 0.3s linear;	// 进场动画在这里控制 var 无效，需要在子节点直接控制变换的属性
			}
			.tasklistTrans-leave-to {
				--height: 0px !important;
				margin-bottom: 0;
				opacity: 0;
				filter: blur(4px) contrast(150%);
				transform: scale(0.6, 0.8);
				transition: all 0.3s cubic-bezier(0.0, 0.9, 0.1, 1), opacity 0.3s linear, filter 0.3s ease-in, transform 0.3s cubic-bezier(0.5, 0, 1, 1);	// 但是离场动画是有效的
			}
			.tasklistTrans-enter-to, .tasklistTrans-leave-from {
			}
		}
		.dropfilesdiv {
			display: flex;
			width: 100%;
			min-height: 80px;
			flex-grow: 1;
			.dropfilesimage {
				background-size: contain;
				background-position: center;
				background-repeat: no-repeat;
				margin: auto;
				width: 100%;
				max-height: 200px;
				height: 100%;
			}
			.imgNormal {
				background-image: url(./drop_files.svg);
			}
			// .imgDragging {
			// 	background-image: url(./drop_files_ok.svg);
			// }
		}
		.noffmpeg {
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: center;
			align-items: center;
			.box {
				border-radius: 8px;
				background-color: hwb(var(--bg97) / 0.8);
				box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
							0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
							0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
							0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
				display: flex;
				justify-content: center;
				align-items: center;
				width: 720px;
				text-align: left;
				transition: all 0.3s ease-in-out;
				@media only screen and (max-width: 760px) {
					width: 660px;
				}
				svg {
					width: 120px;
					height: auto;
					padding-right: 24px;
					transition: all 0.3s ease-in-out;
					@media only screen and (max-width: 680px) {
						width: 0;
						padding-right: 0;
					}
				}
				.right {
					padding: 0 12px;
					h2 {
						font-size: 20px;
						color: var(--titleText);
					}
					.smallTip {
						margin-top: -16px;
						font-size: 13px;
					}
					p {
						font-size: 15px;
						margin-block-start: 0.5em;
						margin-block-end: 0.5em;
					}
					a {
						color: var(--titleText);
						cursor: pointer;
					}
				}
			}
		}
	}
	.coarse-scrollbar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 28px;
		display: flex;
		align-items: center;
		padding: 0 16px;
		z-index: 10;
	}
</style>
