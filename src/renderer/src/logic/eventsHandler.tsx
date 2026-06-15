import nodeBridge from '@renderer/bridges/nodeBridge';
import { FFmpegInfo, FFmpegProgress, Notification, Task, TaskStatus, WorkingStatus } from '@common/types';
import { Server, UITask } from '@renderer/types';
import { getInitialUITask, mergeTaskFromService } from '@common/utils';
import { dashboardTimer } from '@renderer/common/dashboardCalc';
import { useAppStore } from '../stores/appStore';
import { getLimitaion } from './limitaions';
import Popup from '@renderer/components/Popup/Popup';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import { ButtonType } from '@renderer/components/Button/Button';
import ImageExitConfirm from '@renderer/assets/cartoons/exitConfirm.svg';

// #region server events

export function handleFFmpegInfo(server: Server, info: FFmpegInfo) {
	server.data.ffmpegInfo = info;
};
export function handleStatusUpdate(server: Server, workingStatus: 'start' | 'stop' | 'pause') {
	const serverData = server.data;
	serverData.workingStatus = workingStatus === 'start' ? WorkingStatus.running : WorkingStatus.idle;
	if (workingStatus === 'stop') {
		nodeBridge.flashFrame(true);
	}
};
export function handleTasklistUpdate(server: Server, data: { added?: { taskId: number; index: number }[]; removed?: { taskId: number }[]; totalCount: number }) {
	const 这 = useAppStore();
	const serverData = server.data;

	// 更新总数
	serverData.totalCount = data.totalCount;

	// 处理删除
	if (data.removed) {
		for (const { taskId } of data.removed) {
			这.selectedTask.delete(taskId);
			const arrayIndex = serverData.taskIdToIndex.get(taskId);
			if (arrayIndex !== undefined) {
				const removedGlobalIndex = serverData.tasks[arrayIndex].taskIndex;
				serverData.tasks.splice(arrayIndex, 1);
				serverData.taskIdToIndex.delete(taskId);
				// 修正被 splice 影响的后续元素的数组索引
				for (const [id, idx] of serverData.taskIdToIndex) {
					if (idx > arrayIndex) {
						serverData.taskIdToIndex.set(id, idx - 1);
					}
				}
				// 修正被删除任务之后的任务的全局序号
				for (const task of serverData.tasks) {
					if (task.taskIndex > removedGlobalIndex) {
						task.taskIndex--;
					}
				}
			}
		}
		// 删除后重新计算缓冲区边界
		if (serverData.tasks.length > 0) {
			serverData.bufferStart = serverData.tasks[0].taskIndex!;
			serverData.bufferEnd = serverData.tasks[serverData.tasks.length - 1].taskIndex! + 1;
		} else {
			serverData.bufferStart = 0;
			serverData.bufferEnd = 0;
		}
	}

	// 处理新增
	if (data.added) {
		let hasOutsideBuffer = false;
		for (const { taskId, index } of data.added) {
			// 检查新增任务是否落在当前缓冲区范围内
			if (index >= serverData.bufferStart && index < serverData.bufferEnd) {
				const uiTask = getInitialUITask(taskId, '');
				uiTask.taskIndex = index;
				// 按全局序号找到正确的插入位置
				let insertPos = serverData.tasks.length;
				for (let i = 0; i < serverData.tasks.length; i++) {
					if (serverData.tasks[i].taskIndex! > index) {
						insertPos = i;
						break;
					}
				}
				serverData.tasks.splice(insertPos, 0, uiTask);
				// 修正被 splice 影响的后续元素的索引
				for (const [id, idx] of serverData.taskIdToIndex) {
					if (idx >= insertPos) {
						serverData.taskIdToIndex.set(id, idx + 1);
					}
				}
				serverData.taskIdToIndex.set(taskId, insertPos);
				// 更新缓冲区边界
				serverData.bufferEnd++;
				// 异步获取完整任务数据
				setTimeout(() => {
					这.updateTask(server, taskId);
				}, 20);
			} else {
				hasOutsideBuffer = true;
			}
		}
		// 如果新任务落在缓冲区外，刷新缓冲区（以当前第一个可见任务为参考点，保持用户视图位置）
		if (hasOutsideBuffer) {
			const firstTask = serverData.tasks[0];
			const refIndex = firstTask ? firstTask.taskIndex! : 0;
			这.updateTaskList(server, refIndex);
		}
	}

	// 处理缓冲区越界：任务删除后 totalCount 可能小于 bufferEnd
	if (serverData.bufferEnd > serverData.totalCount) {
		// 重新计算缓冲区，以当前第一个可见任务为参考
		const firstTask = serverData.tasks[0];
		const firstVisibleGlobalIndex = firstTask ? firstTask.taskIndex! : 0;
		这.updateTaskList(server, Math.min(firstVisibleGlobalIndex, Math.max(0, serverData.totalCount - 1)));
	}
};
/**
 * 更新整个 task
 * 通过广播事件收到的 task 有可能是不完整的，不包含 cmdData，mergeTaskFromService 只会进行 Object.assign，不会清空
 */
export function handleTaskUpdate(server: Server, id: number, content: Task) {
	const serverData = server.data;
	const arrayIndex = serverData.taskIdToIndex.get(id);
	if (arrayIndex === undefined) {
		// 本地缓冲区不存在此任务，忽略
		return;
	}
	const localTask = serverData.tasks[arrayIndex];
	const task = mergeTaskFromService(localTask, content);
	serverData.tasks[arrayIndex] = task;
	// Object.assign(serverData.tasks[id], task);
	// timer 相关处理（开始运行时添加定时器，结束或暂停运行时取消定时器）
	if (task.status === TaskStatus.running && !task.dashboardTimer) {
		task.dashboardTimer = setInterval(dashboardTimer, 50, task) as any;
		if (task.progressLog.time.length <= 1) {
			task.dashboard_smooth = {
				progress: 0,
				bitrate: 0,
				speed: 0,
				time: 0,
				frame: 0,
				size: 0,
			}
		}
	} else if (task.status !== TaskStatus.running && task.dashboardTimer) {
		clearInterval(task.dashboardTimer);
		task.dashboardTimer = NaN;
	}
	// 进度条相关处理
	if (task.status === TaskStatus.finished || task.status === TaskStatus.error) {
		task.dashboard.progress = 1;
		task.dashboard_smooth.progress = 1;
	} else if (task.status === TaskStatus.idle) {
		task.dashboard.progress = 0;
		task.dashboard_smooth.progress = 0;
	}
	// serverData.tasks = Object.assign({}, serverData.tasks);
};
/**
 * 增量更新 cmdData
 */
export function handleCmdUpdate(server: Server, id: number, content: string, append: boolean) {
	const arrayIndex = server.data.taskIdToIndex.get(id);
	if (arrayIndex === undefined) return;
	let task = server.data.tasks[arrayIndex];
	if (append) {
		task.cmdData += content;
	} else {
		task.cmdData = content;
	}
};
/**
 * 增量更新 progressLog
 */
export function handleProgressUpdate(server: Server, id: number, time: number, status: FFmpegProgress | undefined, functionLevel: number) {
	const arrayIndex = server.data.taskIdToIndex.get(id);
	if (arrayIndex === undefined) return;
	const task = server.data.tasks[arrayIndex];
	if (status) {
		for (const parameter of ['time', 'frame', 'size']) {
			const _parameter = parameter as 'time' | 'frame' | 'size';
			task.progressLog[_parameter].push([time, status[_parameter]]);
		}
	} else {
		task.progressLog = {
			time: [],
			frame: [],
			size: [],
			lastStarted: time,
			elapsed: 0,
			lastPaused: time,
		};
	}
	// server.data.tasks[id].progressLog = progressLog;
	if (functionLevel < 50 && task.progressLog.time.length > 0) {
		if (task.progressLog.time.slice(-1)[0][1] > 671) {
			server.entity.trailLimit_stopTranscoding(id, 'media');
			return;
		}
	}
	const maxWorkingDuration = getLimitaion('maxWorkingDuration');
	if (task.progressLog.time.length > 0) {
		if (task.progressLog.elapsed + new Date().getTime() / 1000 - task.progressLog.lastStarted > maxWorkingDuration) {
			server.entity.trailLimit_stopTranscoding(id, 'working');
			return;
		}
	}
};
/**
 * 增量更新 notifications
 */
export function handleNotificationUpdate(server: Server, notificationId: number, notification?: Notification) {
	const 这 = useAppStore();
	if (notification) {
		server.data.notifications[notificationId] = notification;
		const serverNameString = 这.servers.length > 1 ? `${server.data.name}：` : '';
		Popup({
			message: serverNameString + notification.content,
			level: notification.level,
		});
		这.setUnreadNotifationCount();
	} else {
		delete server.data.notifications[notificationId];
	}
};

// #endregion

// #region ipc events

export function handleCloseConfirm() {
	const 这 = useAppStore();
	const localServer = 这.localServer;
	function readyToClose () {
		nodeBridge.ipcRenderer?.send('exitConfirm');
		setTimeout(() => {
			nodeBridge.ipcRenderer?.send('close');
		}, 0);
	}
	// getQueueTaskCount 拷贝自 FFBoxService
	function getQueueTaskCount(server: Server) {
		let count: number = 0;
		for (const task of server.data.tasks) {
			if (task && [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(task.status)) {
				count++;
			}
		}
		return count;
	}
	if (!localServer) {
		readyToClose();
	} else {
		let queueTaskCount = getQueueTaskCount(localServer as any);
		if (queueTaskCount > 0) {
			Msgbox({
				container: document.body,
				// container: containerRef.value,
				image: <ImageExitConfirm />,
				title: '要退出吗？',
				content: <>本地服务器还有 {queueTaskCount} 个任务未完成<br />如果 FFBox 服务器是由客户端启动的，退出将会强制停止任务哦～</>,
				buttons: [
					{ text: '退退退', callback: readyToClose, type: ButtonType.Danger, role: 'confirm' },
					{ text: '再等等', role: 'cancel' },
				]
			})
		} else {
			readyToClose();
		}
	}
}

// #endregion
