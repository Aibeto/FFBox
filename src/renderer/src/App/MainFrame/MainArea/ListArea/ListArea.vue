<script setup lang="tsx">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import { NotificationLevel, Task } from '@common/types';
import { getOutputFileBaseName } from '@common/params/formats';
import { getOutputFileTime } from '@common/utils';
import { useScrollStop } from './useScrollStop';
import CoarseSlider from './CoarseSlider.vue';
import { showAddTaskPrompt, showOpenFilePrompt } from '@renderer/components/misc/AddTasks';
import Popup from '@renderer/components/Popup/Popup';
import { TaskItem } from './TaskItem/TaskItem';
import showMenu from '@renderer/components/Menu/Menu';
import ImageNoffmpeg from './noffmpeg.svg?component';

const appStore = useAppStore();

const taskListRef = ref<HTMLDivElement>();
const listContainerRef = ref<HTMLElement>(null!);	// 列表的滚动容器

// #region 列表内操作（任务、其他 UI）

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

const selectedTask_last = ref(-1);	// Shift 选择锚点，存储任务 ID，-1 表示无锚点

const handleTaskClicked = async (event: MouseEvent, id: number) => {
	let currentSelection = new Set(appStore.selectedTask);
	if (event.shiftKey) {
		// Shift 跨区选择
		if (selectedTask_last.value !== -1) {
			const anchorId = selectedTask_last.value;
			const server = appStore.currentServer;
			// current 一定在缓冲区中（用户刚点击了它），anchor 可能不在
			const anchorBufferIndex = server?.data.taskIdToIndex.get(anchorId);
			const currentGlobalIndex = server?.data.tasks[server.data.taskIdToIndex.get(id)!]?.taskIndex;
			if (anchorBufferIndex !== undefined && currentGlobalIndex !== undefined && server) {
				// anchor 也在缓冲区中，直接取缓冲区范围内的任务
				const minIdx = Math.min(anchorBufferIndex, server.data.taskIdToIndex.get(id)!);
				const maxIdx = Math.max(anchorBufferIndex, server.data.taskIdToIndex.get(id)!);
				for (let i = minIdx; i <= maxIdx; i++) {
					currentSelection.add(server.data.tasks[i].id);
				}
			} else if (currentGlobalIndex !== undefined && server) {
				// anchor 不在缓冲区，从后端查询 anchor 的全局序号
				let anchorGlobalIndex: number | null;
				try {
					anchorGlobalIndex = await server.entity.getTaskIndex(anchorId);
				} catch {
					anchorGlobalIndex = null;
				}
				if (anchorGlobalIndex !== null) {
					const minOffset = Math.min(anchorGlobalIndex, currentGlobalIndex);
					const maxOffset = Math.max(anchorGlobalIndex, currentGlobalIndex);
					const response = await server.entity.getTaskList(minOffset, maxOffset - minOffset + 1, true);
					for (const taskId of response.taskIds) {
						currentSelection.add(taskId);
					}
				} else {
					// 锚点无效，只选当前
					currentSelection.clear();
					currentSelection.add(id);
				}
			}
		} else {
			// 无锚点，只选当前
			currentSelection.clear();
			currentSelection.add(id);
		}
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
	selectedTask_last.value = id;
	appStore.selectedTask = new Set([...currentSelection]);
	appStore.isAllSelected = false;
	appStore.applySelectedTask();
};

const handleTaskBatchContextMenu = (event: MouseEvent) => {
	showMenu({
		menu: [
			{ type: 'normal', label: `已选中 ${appStore.selectedTask.size} 个任务`, value: 'description', disabled: true },
			{ type: 'separator',  },
			{ type: 'normal', icon: <span>▶️</span>, label: '立即开始', value: '立即开始选中任务', tooltip: '马上启动所选任务的编码（仅对未启动、排队开始、排队继续任务有效）', onClick: () => {
				appStore.currentServer?.entity.taskStart([...appStore.selectedTask]);
			} },
			{ type: 'normal', icon: <span>⏳</span>, label: '排队开始', value: '排队开始选中任务', tooltip: '将所选任务置入准备状态（对未启动任务置入排队开始状态，对已暂停任务置入排队继续状态）', onClick: () => {
				appStore.currentServer?.entity.taskReady([...appStore.selectedTask]);
			} },
			{ type: 'normal', icon: <span>⏹️</span>, label: '停止或重置', value: '停止或重置选中任务', tooltip: '对正在运行任务进行软停止，对正在停止任务进行硬停止，对已停止、已完成、出错任务置入未开始状态', onClick: () => {
				appStore.currentServer?.entity.taskReset([...appStore.selectedTask]);
			} },
			{ type: 'normal', icon: <span>🗑️</span>, label: '删除', value: '删除选中任务', tooltip: '对未开始、上传中任务进行删除操作（对其他状态任务无效）', onClick: () => {
				appStore.deleteTasks([...appStore.selectedTask]);
			} },
			...(appStore.currentServer?.entity.ip !== 'localhost' ? [
				{ type: 'normal' as const, icon: <span>⬇️</span>, label: '下载输出文件', value: '下载输出文件', tooltip: '将所有已完成任务输出文件下载到指定文件夹\n。输出文件取决于当前界面上显示的运行次序。', onClick: async () => {
					if (!appStore.currentServer) { debugger; throw 'ub'; }
					const entity = appStore.currentServer.entity;
					const data = appStore.currentServer.data;
					// 构建 taskRunEntries：缓冲区内的任务带上 selectedRunIndex，缓冲区外的不带（后端默认取最后一个 run）
					const taskRunEntries = [...appStore.selectedTask].map((taskId) => {
						const idx = data.taskIdToIndex.get(taskId);
						const entry: { taskId: number; runIndex?: number } = { taskId };
						if (idx !== undefined) entry.runIndex = data.tasks[idx].selectedRunIndex;
						return entry;
					});
					// 调用后端接口获取所有任务的输出文件信息
					const result = await entity.getTaskOutputFiles(taskRunEntries);
					if (nodeBridge.env === 'electron') {
						const downloadList = [];
						for (const item of result) {
							for (const [s_index, filePath] of Object.entries(item.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(item.after.outputs[+s_index].mux, { fileName: item.taskName, taskId: item.taskId, taskIndex: item.taskIndex, runIndex: item.runIndex, outputIndex: +s_index });
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								let fileTime = undefined;
								const output = item.after.outputs[+s_index];
								const mux = output.mux;
								if (mux.keepFileTime && item.before) {
									const pseudoTask = { before: item.before } as Task;
									let { accessTime, createTime, modifyTime, ok } = getOutputFileTime(pseudoTask, +s_index);
									fileTime = { accessTime, createTime, modifyTime };
								}
								downloadList.push({ url, finalFileBaseName: newFileBaseName, fileTime });
								appStore.downloadMap.set(url, data.id);
							}
						}
						nodeBridge.ipcRenderer?.send('downloadFiles', { sessionId: entity.sessionId, files: downloadList });
					} else {
						for (const item of result) {
							for (const [s_index, filePath] of Object.entries(item.outputFiles)) {
								const newFileBaseName = getOutputFileBaseName(item.after.outputs[+s_index].mux, { fileName: item.taskName, taskId: item.taskId, taskIndex: item.taskIndex, runIndex: item.runIndex, outputIndex: +s_index });
								const url = `http://${entity.ip}:${entity.port}/download/${filePath}`;
								const elem = document.createElement('a');
								elem.href = `${url}?fileBaseName=${newFileBaseName}`;
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

// #endregion

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

// 浮标与自动隐藏
const coarseSize = ref<'full' | 'small' | 'hidden'>('hidden');
let scrollSmallOrHideTimer: ReturnType<typeof setTimeout> | null = null;	// 滚动后缩小或隐藏浮标的定时器
let scrollDistanceTimer: ReturnType<typeof setTimeout> | null = null;	// 滚动距离累计清零、粗调恢复全范围显示定时器
let scrollDistance = 0;	// 累计滚动距离（像素）
const realtimeRange = ref<[number, number] | null>(null);	// 实时可见范围（滚动时更新，显示在浮标上）

const autoHide = computed(() => appStore.frontendSettings.autoHideCoarseSlider);

// 任务数较少时不显示粗调
const showCoarseScrollbar = computed(() => {
	const server = appStore.currentServer;
	if (!server) return false;
	return server.data.totalCount >= appStore.frontendSettings.taskListInfiniteScrollThreshold;
});

const scrollDistanceTimerCallback = () => {
	// 滚动距离累计清零
	// console.log('滚动距离清零');
	lastScrollTop = listContainerRef.value.scrollTop;
	scrollDistance = 0;
	scrollDistanceTimer = null;
	// 粗调恢复全范围显示
	realtimeRange.value = null;
}

function scheduleCoarseSmallOrHide() {
	clearTimeout(scrollSmallOrHideTimer ?? 0);
	scrollSmallOrHideTimer = null;
	scrollSmallOrHideTimer = setTimeout(() => {
		coarseSize.value = autoHide.value ? 'hidden' : 'small';
		scrollSmallOrHideTimer = null;
	}, 2500);
}

function clearAllTimers() {
	realtimeRange.value = null;
	clearTimeout(scrollSmallOrHideTimer ?? 0);
	scrollSmallOrHideTimer = null;
	clearTimeout(scrollDistanceTimer ?? 0);
	scrollDistanceTimer = null;
}

onBeforeUnmount(() => {
	clearAllTimers();
});

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
		} else if (lastEl) {
			break;	// 遇到第一个不可见元素，退出循环
		}
	}
	if (firstIndex !== undefined && lastEl) {
		const lastIndex = parseInt(lastEl.dataset.taskindex ?? '');
		const elBottom = lastEl.offsetTop + lastEl.offsetHeight;
		return { firstIndex, lastIndex, distanceFirstElementToScrollTop: distanceFirstElementToScrollTop!, distanceLastElementToScrollBottom: scrollBottom - elBottom };
	}
	return { firstIndex: 0, lastIndex: 0, distanceFirstElementToScrollTop: 0, distanceLastElementToScrollBottom: 0 };
}

// update 反应即时变化，change 则在松手时触发。但实际上松手时得到的 start end 就是传进去的 start end
const handleCoarseSliderUpdate = (start: number, end: number) => {
	coarseStart.value = start;
	coarseEnd.value = end;
	clearTimeout(scrollDistanceTimer ?? 0);
	scrollDistanceTimer = null;
	scrollDistanceTimerCallback();
};
const handleCoarseSliderChange = (start: number, end: number) => {
	if (!appStore.currentServer) return;
	console.log('粗调跳转', start, '~', end);
	fetchingListPreventAnimation.value = true;
	isPassiveScrolling.value = true;

	// 跳转后，传入 start/end 作为可见范围，updateTaskList 内部会按缓冲区大小进行数据更新
	appStore.updateTaskList(start, end, false).then(() => {
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

// 监听任务总数变化，同步粗调滚动条范围。实际上不需要这个监听，因为任务总数变化时，会触发 handleScrollStop，就会自动触发 getVisibleRange 同步范围
// watch(() => appStore.currentServer?.data.totalCount, (newTotal) => {
// 	if (!newTotal) return;
// 	const range = getVisibleRange();
// 	if (range) {
// 		coarseStart.value = range.firstIndex;
// 		coarseEnd.value = range.lastIndex;
// 	}
// });

watch(() => appStore.frontendSettings.taskListPageSize, (newPageSize) => {
	const range = getVisibleRange();
	if (!range) return;
	isPassiveScrolling.value = true;
	fetchingListPreventAnimation.value = true;

	// 传入首尾可见任务的 index，updateTaskList 内部会按缓冲区大小进行数据更新
	appStore.updateTaskList(range.firstIndex, range.lastIndex, true).then(() => {
		setTimeout(() => {
			fetchingListPreventAnimation.value = false;
			isPassiveScrolling.value = false;	// scrollTop 变化后才打开这个锁
		}, 0);
	});

	// 同步粗调滚动条
	coarseStart.value = range.firstIndex;
	coarseEnd.value = range.lastIndex;
});

// 粗调面板鼠标进入时，显示浮标并且不消失
function handleCoarsePanelMouseEnter() {
	coarseSize.value = 'full';
	clearAllTimers();
}
// 粗调面板鼠标离开时，延时后隐藏或缩小浮标
function handleCoarsePanelMouseLeave() {
	scheduleCoarseSmallOrHide();
}
// 粗调面板浮标开始拖拽时，显示浮标并且不消失
function handleCoarseBuoyPointerdown() {
	coarseSize.value = 'full';
	clearAllTimers();
}

let realtimeRangeThrottleLastTime = 0;
let lastScrollTop = 0;
function handleListScroll() {
	if (!showCoarseScrollbar.value) return;	// 无限滚动未启用时，不响应滚动停止事件

	const now = Date.now();
	if (coarseSize.value === 'full') {
		// 浮标较大时，每次都更新实时范围
		const range = getVisibleRange();
		if (range) {
			realtimeRange.value = [range.firstIndex, range.lastIndex];
		}
	} else if (now - realtimeRangeThrottleLastTime > 100) {
		// 浮标不可见时，节流更新
		realtimeRangeThrottleLastTime = now;
		const range = getVisibleRange();
		if (range) {
			realtimeRange.value = [range.firstIndex, range.lastIndex];
		}
	}

	const delta = Math.abs(listContainerRef.value.scrollTop - lastScrollTop);
	lastScrollTop = listContainerRef.value.scrollTop;
	if (delta > 0) {
		scrollDistance += delta;
		clearTimeout(scrollDistanceTimer ?? 0);
		scrollDistanceTimer = setTimeout(scrollDistanceTimerCallback, 750);

		// 滚动距离超过阈值，短暂显示局部范围，并且若自动隐藏为开，暂时显示小浮标
		// console.log('滚动距离', delta, scrollDistance);
		if (scrollDistance > 1200) {	// 这个值可以设得比较大，因为滚动现在不止是用户在滚，程序也在不断改列表，会导致滚动量加大很多
			if (coarseSize.value === 'hidden') {
				coarseSize.value = 'small';
			}
			scheduleCoarseSmallOrHide();
		}
	}
}

/**
 * 滚动停止处理：获取视口中的首尾任务，计算新缓冲区，拉取数据，居中滚动
 */
 const handleScrollStop = () => {
	if (!appStore.currentServer) return;
	if (!showCoarseScrollbar.value) return;	// 无限滚动未启用时，不响应滚动停止事件

	const range = getVisibleRange();
	if (!range) return;

	const requestId = ++latestRequestId.value;	// 递增 id

	if (coarseStart.value === range.firstIndex && coarseEnd.value === range.lastIndex) return;	// 原地滚动，不请求
	console.log(coarseStart.value, coarseEnd.value, '->', range.firstIndex, range.lastIndex, range.distanceLastElementToScrollBottom);

	// 若不作以下处理，列表拉到靠近头部或尾部时，会触发 2 次拉列表请求，这是因为处在头/尾时，即使真正的列表前/后有更多任务，前端并没有对应的 DOM，导致 range 会计算少一两个任务
	// 因此当滚动到顶或底时进行一个缓冲区调整。这里的 8 是任务列表上下边距，但底边距实际上要比这大很多，甚至会出现多 2 个任务的情况（跟 dropfilesdiv 尺寸有关），为简便起见这里只加 1 个任务
	if (range.distanceFirstElementToScrollTop < 8) range.firstIndex = Math.max(0, range.firstIndex - 1);
	if (range.distanceLastElementToScrollBottom > 8) range.lastIndex += 1;

	// 数据更新且 DOM 渲染后，居中滚动。由于浏览器自带 Scroll Anchoring，任务列表更新后无论是前面还是后面的 DOM 数量有变动，浏览器都会保持可见位置不变，因此大多数情况不需要处理
	// 需要处理的是滚动位置接近头部的情况。浏览器会认为用户就想要固定在顶部，这时候就需要手动处理一下。
	const initialScrollTop = listContainerRef.value.scrollTop;
	if (initialScrollTop <= 1) {
		listContainerRef.value.scrollTop += 1;
	}
	fetchingListPreventAnimation.value = true;
	// isPassiveScrolling.value = true;	// 理论上要设这个锁，但实测会影响滚动到头部时的继续滚动，所以暂时不用

	// 传入首尾可见任务的 index，增量拉取：仅拉取缓冲区前后缺失的部分
	appStore.updateTaskList(range.firstIndex, range.lastIndex, false).then(() => {
		if (requestId !== latestRequestId.value) return;	// 若已有更新的请求，不处理
		setTimeout(() => {
			fetchingListPreventAnimation.value = false;
			if (initialScrollTop <= 1) {
				listContainerRef.value.scrollTop -= 1;
			}
			// setTimeout(() => {
			// 	isPassiveScrolling.value = false;	// scrollTop 变化后才打开这个锁
			// }, 0);
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
	onScroll: handleListScroll,
});

// #endregion

</script>

<template>
	<div class="listarea" :class="{ 'listarea--with-panel': showCoarseScrollbar && !autoHide }" ref="listContainerRef">
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
					@click="handleTaskClicked($event, task.id)"
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
					@click="handleTaskClicked($event, task.id)"
					@batchContextMenu="handleTaskBatchContextMenu"
				/>
			</TransitionGroup>
		</div>
		<div
			v-if="appStore.currentServer?.data.ffmpegInfo.version"
			class="dropfilesdiv"
			@click="appStore.selectedTask = new Set(); appStore.isAllSelected = false; appStore.taskSelectionModified = false;"
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
	<div
		class="coarse-panel"
		:class="{
			'coarse-panel-visible': coarseSize !== 'hidden' || (showCoarseScrollbar && !autoHide),
		}"
		@mouseenter="handleCoarsePanelMouseEnter"
		@mouseleave="handleCoarsePanelMouseLeave"
	>
		<CoarseSlider
			v-if="showCoarseScrollbar"
			:total="appStore.currentServer!.data.totalCount"
			:start="coarseStart"
			:end="coarseEnd"
			:buoySize="coarseSize === 'full' ? 'full' : 'small'"
			:customBuoyText="realtimeRange ? Math.round((realtimeRange[0] + realtimeRange[1]) / 2) + '' : undefined"
			@update="handleCoarseSliderUpdate"
			@change="handleCoarseSliderChange"
			@buoyPointerdown="handleCoarseBuoyPointerdown"
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
		flex: 1;
		padding: 8px 0;
		overflow-y: auto;
		&.listarea--with-panel {
			padding-right: 30px;
		}
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
	.coarse-panel {
		position: absolute;
		top: 16px;
		right: 20px;
		bottom: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.25s ease;
		&.coarse-panel-visible {
			opacity: 1;
			pointer-events: auto;
		}
	}
</style>
