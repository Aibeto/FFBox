import { computed, defineComponent, onBeforeUnmount, ref, Transition, watch, onMounted, StyleValue } from 'vue';
import { TaskStatus, TransferStatus } from '@common/types';
import { UITask } from '@renderer/types'
import { getVideoRateControlParam } from '@common/params/vcodecs';
import { getAudioRateControlParam } from '@common/params/acodecs';
import { useAppStore } from '@renderer/stores/appStore';
import Tooltip from '@renderer/components/Tooltip/Tooltip';
import showMenu from '@renderer/components/Menu/Menu';
import { showProgressInfo } from '@renderer/components/misc/ProgressInfo';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { getOutputDuration, stringifyTimeValue } from '@common/utils';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import IconIdle from '@renderer/assets/mainArea/taskStatus/idle.svg';
import IconIdleQueued from '@renderer/assets/mainArea/taskStatus/idle_queued.svg';
import IconRunning from '@renderer/assets/mainArea/taskStatus/running.svg';
import IconPaused from '@renderer/assets/mainArea/taskStatus/paused.svg';
import IconPausedQueued from '@renderer/assets/mainArea/taskStatus/paused_queued.svg';
import IconStopping from '@renderer/assets/mainArea/taskStatus/stopping.svg';
import IconFinished from '@renderer/assets/mainArea/taskStatus/finished.svg';
import IconError from '@renderer/assets/mainArea/taskStatus/error.svg';
import IconRightArrow from '@renderer/assets/mainArea/swap_right.svg';
import style from './TaskItem.module.less';

interface Props {
	task: UITask;
	id: number;
	selected?: boolean;
	shouldHandleHover?: boolean;	// 如果正在多选，或者单选但选的不是自己，那么不响应悬浮
	onClick?: (event: MouseEvent) => any;
}

export const TaskItem = defineComponent((props: Props) => {
	const appStore = useAppStore();
	const settings = appStore.taskViewSettings;

	// #region 预先计算以减少下方计算量

	const outputDuration = computed(() => getOutputDuration(props.task));

	// #endregion

	// #region 参数

	const beforeBitrateFilter = (kbps: number) => {
		if (isNaN(kbps)) {
			return '读取中';
		} else {
			const bps = kbps * 1000;
			if (window.frontendSettings.useIEC) {
				if (bps >= 10 * 1024 ** 2) {
					return (bps / 1024 ** 2).toFixed(1) + ' Mibps';
				} else {
					return (bps / 1024).toFixed(0) + ' kibps';
				}
			} else {
				if (bps >= 10 * 1000 ** 2) {
					return (bps / 1000 ** 2).toFixed(1) + ' Mbps';
				} else {
					return (bps / 1000).toFixed(0) + ' kbps';
				}
			}
		}
	};
	const durationBefore = computed(() => stringifyTimeValue(props.task.before.duration));
	const durationAfter = computed(() => stringifyTimeValue(outputDuration.value));
	const smpteBefore = computed(() => props.task.before.vresolution && props.task.before.vframerate ? `${props.task.before.vresolution.replace('<br />', '×')}@${props.task.before.vframerate}` : '-');
	const videoRateControlValue = computed(() => getVideoRateControlParam(props.task.after.outputs[0]?.video)?.value);
	const audioRateControlValue = computed(() => getAudioRateControlParam(props.task.after.outputs[0]?.audio)?.value);
	const videoRateControl = computed(() => (videoRateControlValue.value === '-' ? '' : `@${props.task.after.outputs[0]?.video.ratecontrol} ${videoRateControlValue.value}`));
	const audioRateControl = computed(() => (audioRateControlValue.value === '-' ? '' : `@${props.task.after.outputs[0]?.audio.ratecontrol} ${audioRateControlValue.value}`));
	const videoInputBitrate = computed(() => props.task.before.vbitrate > 0 ? `@${beforeBitrateFilter(props.task.before.vbitrate)}` : '');
	const audioInputBitrate = computed(() => props.task.before.abitrate > 0 ? `@${beforeBitrateFilter(props.task.before.abitrate)}` : '');

	// #endregion

	// #region 仪表盘

	const graphBitrateFilter = (kbps: number) => {
		const bps = kbps * 1000;
		if (window.frontendSettings.useIEC) {
			if (bps >= 10 * 1024 ** 2) {
				return (bps / 1024 ** 2).toFixed(1) + ' M';
			} else {
				return (bps / 1024 ** 2).toFixed(2) + ' M';
			}
		} else {
			if (bps >= 10 * 1000 ** 2) {
				return (bps / 1000 ** 2).toFixed(1) + ' M';
			} else {
				return (bps / 1000 ** 2).toFixed(2) + ' M';
			}
		}
	};
	const graphBitrate = computed(() => graphBitrateFilter(props.task.dashboard_smooth.bitrate));
	const speedFilter = (value: number) => {
		if (value < 10) {
			return value.toFixed(2) + ' ×';
		} else {
			return value.toFixed(1) + ' ×';
		}
	};
	const graphSpeed = computed(() => speedFilter(props.task.dashboard_smooth.speed));
	const timeFilter = (value: number, withDecimal = true) => {
		let left = value;
		let hour = Math.floor(left / 3600); left -= hour * 3600;
		let minute = Math.floor(left / 60); left -= minute * 60;
		let second = left;
		if (hour) {
			return `${hour}:${minute.toString().padStart(2, '0')}:${second.toFixed(0).toString().padStart(2, '0')}`;
		} else if (minute) {
			return `${minute}:${withDecimal ? second.toFixed(1).padStart(4, '0') : second.toFixed(0).padStart(2, '0')}`;
		} else {
			return withDecimal ? second.toFixed(2) : `${second.toFixed(0)} s`;
		}
	};
	const graphTime = computed(() => timeFilter(props.task.dashboard_smooth.time));
	const graphLeftTime = computed(() => {
		if (props.task.transferStatus === 'normal') {
			const totalDuration = outputDuration.value;
			if (props.task.dashboard_smooth.speed > 0) {
				const needTime = totalDuration / props.task.dashboard_smooth.speed;
				const remainTime = (totalDuration - props.task.dashboard_smooth.time) / totalDuration * needTime;	// 剩余进度比例 * 全进度耗时
				return timeFilter(remainTime, false);
			}
		} else {
			const totalSize = props.task.transferProgressLog.total;
			if (props.task.dashboard_smooth.transferSpeed > 0) {
				const needTime = totalSize / props.task.dashboard_smooth.transferSpeed;
				const remainTime = (totalSize - props.task.dashboard_smooth.transferred) / totalSize * needTime;	// 剩余进度比例 * 全进度耗时
				return timeFilter(remainTime, false);
			}
		}
		return '-';
	});
	const graphSizeFilter = (kB: number) => {
		const B = kB * 1000;
		if (window.frontendSettings.useIEC) {
			if (B >= 10 * 1024 ** 3) {
				return (B / 1024 ** 3).toFixed(1) + ' GiB';
			} else if (B >= 1024 ** 3) {
				return (B / 1024 ** 3).toFixed(2) + ' GiB';
			} else if (B >= 100 * 1024 ** 2) {
				return (B / 1024 ** 2).toFixed(0) + ' MiB';
			} else if (B >= 10 * 1024 ** 2) {
				return (B / 1024 ** 2).toFixed(1) + ' MiB';
			} else {
				return (B / 1024 ** 2).toFixed(2) + ' MiB';
			}
		} else {
			if (B >= 10 * 1000 ** 3) {
				return (B / 1000 ** 3).toFixed(1) + ' GB';
			} else if (B >= 1000 ** 3) {
				return (B / 1000 ** 3).toFixed(2) + ' GB';
			} else if (B >= 100 * 1000 ** 2) {
				return (B / 1000 ** 2).toFixed(0) + ' MB';
			} else if (B >= 10 * 1000 ** 2) {
				return (B / 1000 ** 2).toFixed(1) + ' MB';
			} else {
				return (B / 1000 ** 2).toFixed(2) + ' MB';
			}
		}
	};
	const graphSize = computed(() => graphSizeFilter(props.task.dashboard_smooth.size));
	const transferSpeedFilter = (Bps: number) => {
		if (window.frontendSettings.useIEC) {
			if (Bps >= 100 * 1024 ** 2) {
				return (Bps / 1024 ** 2).toFixed(0) + ' MiB';
			} else if (Bps >= 10 * 1024 ** 2) {
				return (Bps / 1024 ** 2).toFixed(1) + ' MiB';
			} else if (Bps >= 1024 ** 2) {
				return (Bps / 1024 ** 2).toFixed(2) + ' MiB';
			} else {
				return (Bps / 1024).toFixed(0) + ' KiB';
			}
		} else {
			if (Bps >= 100 * 1000 ** 2) {
				return (Bps / 1000 ** 2).toFixed(0) + ' MB';
			} else if (Bps >= 10 * 1000 ** 2) {
				return (Bps / 1000 ** 2).toFixed(1) + ' MB';
			} else if (Bps >= 1000 ** 2) {
				return (Bps / 1000 ** 2).toFixed(2) + ' MB';
			} else {
				return (Bps / 1000).toFixed(0) + ' KB';
			}
		}
	};
	const graphTransferSpeed = computed(() => transferSpeedFilter(props.task.dashboard_smooth.transferSpeed));
	const graphTransferred = computed(() => graphSizeFilter(props.task.dashboard_smooth.transferred / 1000));

	/** 圆环 style 部分
	 *  计算方式：(log(数值) / log(底，即每增长多少倍数为一格) + 数值为 1 时偏移多少格) / 格数
	 *  　　　或：(log(数值 / 想要以多少作为最低值) / log(底，即每增长多少倍数为一格)) / 格数
	 */
	const graphBitrateStyle = computed(() => {
		let value = Math.log(props.task.dashboard_smooth.bitrate / 62.5) / Math.log(8) / 4;		// 62.5K, 500K, 4M, 32M, 256M
		value = Math.min(Math.max(value, 0), 1);
		return `background: conic-gradient(var(--primaryColor) 0%, var(--primaryColor) ${value * 75}%, hwb(var(--opposite80) / 0.1) ${value * 75}%, hwb(var(--opposite80) / 0.1) 75%, transparent 75%)`;
	});
	const graphSpeedStyle = computed(() => {
		let value = Math.log(props.task.dashboard_smooth.speed / 0.04) / Math.log(5) / 6;			// 0.04, 0.2, 1, 5, 25, 125, 625
		value = Math.min(Math.max(value, 0), 1);
		return `background: conic-gradient(var(--primaryColor) 0%, var(--primaryColor) ${value * 75}%, hwb(var(--opposite80) / 0.1) ${value * 75}%, hwb(var(--opposite80) / 0.1) 75%, transparent 75%)`;
	});
	const graphTransferSpeedStyle = computed(() => {
		let value = Math.log(props.task.dashboard_smooth.transferSpeed / 62500) / Math.log(10) / 4;	// 62.5K, 500K, 4M, 32M, 256M, 512M, 1024M
		value = Math.min(Math.max(value, 0), 1);
		return `background: conic-gradient(var(--primaryColor) 0%, var(--primaryColor) ${value * 75}%, hwb(var(--opposite80) / 0.1) ${value * 75}%, hwb(var(--opposite80) / 0.1) 75%, transparent 75%)`;
	});

	const overallProgress = computed(() => props.task.transferStatus === 'normal' ? props.task.dashboard_smooth.progress : props.task.dashboard_smooth.transferred / props.task.transferProgressLog.total);
	// const overallProgress = { value: 0.99 };
	const overallProgressDescription = computed(() => ['转码进度', '上传进度', '下载进度'][['normal', 'uploading', 'downloading'].indexOf(props.task.transferStatus)] );

	// #endregion

	// #region 其他样式

	const showDashboard = computed(() => [TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finishing].includes(props.task.status) || props.task.transferStatus !== TransferStatus.normal);
	const dashboardType = computed(() => showDashboard ? (props.task.transferStatus !== TransferStatus.normal ? 'transfer' : 'convert') : 'none');

	const taskNameStyle = computed(() => {
		const width = (() => {
			if (windowWidth.value >= 920) {
				let shrinkSpace = 80;
				shrinkSpace += [0, 13 + 96, 13 + 96 + 14 + 120 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.audio)];
				shrinkSpace += [0, 13 + 96, 13 + 96 + 14 + 120 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.video)];
				shrinkSpace += [0, 13 + 88, 13 + 88 + 14 + 88 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.smpte)];
				shrinkSpace += [0, 13 + 36, 13 + 36 + 14 + 36 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.format)];
				shrinkSpace += [0, 13 + 64, 13 + 64 + 14 + 64 ][['none', 'input', 'all'].indexOf(settings.paramsVisibility.duration)];
				if (showDashboard.value) {
					shrinkSpace = Math.max(shrinkSpace, 720);
				}
				return `max(calc(100% - ${shrinkSpace}px), 64px)`;
			} else {
				return 'calc(100% - 188px)';
			}
		})();
		return {
			...(showDashboard.value && windowWidth.value >= 920 ? {} : { maxHeight: '26px', '-webkit-line-clamp': 1 }),
			width,
			...(!showDashboard.value ? { fontSize: '16px', lineHeight: '23px' } : {}),	// 不显示 dashboard 时不允许文字放大
			...(props.shouldHandleHover ? { pointerEvents: 'all' } : undefined),
		};
	}) as any;

	const deleteButtonBackgroundPositionX = computed(() => {
		switch (props.task.status) {
			case TaskStatus.idle:
				return '0px';	// 删除按钮
			case TaskStatus.paused_queued: case TaskStatus.running:
				return '-100%';	// 暂停按钮
			case TaskStatus.idle_queued: case TaskStatus.paused: case TaskStatus.stopping: case TaskStatus.finishing: case TaskStatus.finished: case TaskStatus.error:
				return '-200%';	// 重置按钮
		}
		return '';
	});

	/** 整个任务项的高度，包括上下 margin */
	const taskHeight = computed(() => {
		let height = 4;
		height += settings.showParams ? 24 : 0;
		height += showDashboard.value ? 72 : 0;
		height += settings.showCmd ? 64 : 0;
		height = Math.max(24, height);
		return height;
	});

	const taskBackgroundStyle = computed(() => {
		if (props.selected) {
			return {
				background: 'hwb(var(--menuItemHovered))',
				border: 'hwb(var(--menuItemSelected)) 1px solid',
			};
		} else {
			return {};
		}
	});

	const taskBackgroundProgressStyle = computed(() => {
		const taskProgress = (props.task.dashboard_smooth.progress) * 100 + '%';
		const transferProgress = (props.task.dashboard_smooth.transferred / props.task.transferProgressLog.total) * 100 + '%';
		return {
			green: { width: taskProgress, opacity: [TaskStatus.running, TaskStatus.finishing].includes(props.task.status) ? 1 : 0},
			yellow: { width: taskProgress, opacity: [TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping].includes(props.task.status) ? 1 : 0},
			gray: { width: taskProgress, opacity: [TaskStatus.finished, TaskStatus.idle].includes(props.task.status) ? 1 : 0},
			red: { width: taskProgress, opacity: props.task.status === TaskStatus.error ? 1 : 0},
			blue: { width: transferProgress, opacity: props.task.transferStatus === 'normal' ? 0 : 1 },
		} as { [key: string]: StyleValue };
	});

	const taskStatusIcon = computed(() => (
		[
			[TaskStatus.idle, <IconIdle />],
			[TaskStatus.idle_queued, <IconIdleQueued />],
			[TaskStatus.running, <IconRunning />],
			[TaskStatus.paused, <IconPaused />],
			[TaskStatus.paused_queued, <IconPausedQueued />],
			[TaskStatus.stopping, <IconStopping />],
			[TaskStatus.finished, <IconFinished />],
			[TaskStatus.error, <IconError />],
		].map(([taskStatus, icon]) => (
			<Transition
				leaveFromClass={style['statusIconAnimation-leave-from']}
				leaveToClass={style['statusIconAnimation-leave-to']}
				leaveActiveClass={style['statusIconAnimation-leave-active']}
				enterFromClass={style['statusIconAnimation-enter-from']}
				enterToClass={style['statusIconAnimation-enter-to']}
				enterActiveClass={style['statusIconAnimation-enter-active']}
			>
				{props.task.status === taskStatus ? icon : null}
			</Transition>
		))
	));

	// #endregion

	// #region 体验优化

	const cmdRef = ref<HTMLTextAreaElement>(null);
	const cmdText = computed(() => settings.cmdDisplay === 'input' ? ['ffmpeg', ...props.task.paraArray].join(' ') : props.task.cmdData);
	watch(() => props.task.cmdData, () => {
		const elem = cmdRef.value;
		if (elem) {
			const scrollBottom = elem?.scrollTop + elem.getBoundingClientRect().height;
			if (elem.scrollHeight - scrollBottom < 1) {
				setTimeout(() => {
					elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
				}, 0);
			}
		}
	});
	watch(() => settings.cmdDisplay, (value) => {
		const elem = cmdRef.value;
		if (value === 'output' && elem) {
			setTimeout(() => {
				elem.scrollTo(0, Number.MAX_SAFE_INTEGER);
			}, 0);
		}
	})

	const taskNameRef = ref<HTMLDivElement>(null);
	const paramAreaRef = ref<HTMLDivElement>(null);
	// 监听窗口宽度变化
	const windowWidth = ref(0);
	const windowWidthListener = ref<() => void>(() => {
		windowWidth.value = window.innerWidth;
	});
	onMounted(() => {
		window.addEventListener('resize', windowWidthListener.value);
		windowWidthListener.value();
	});
	onBeforeUnmount(() => {
		window.removeEventListener('resize', windowWidthListener.value);
	});

	// #endregion

	// #region 操作响应

	const handleTaskMouseEnter = (event: MouseEvent) => {
		if (props.task.status === TaskStatus.finished) {
			Tooltip.show({
				content: `双击以${appStore.currentServer.entity.ip === 'localhost' ? '打开' : '下载'}输出文件`,
				style: {
					right: `calc(100vw - ${event.pageX}px)`,
					top: `${event.pageY}px`,
				},
			})
		}
	};

	const handleTaskDblClicked = (event: MouseEvent) => {
		const serverName = appStore.currentServer.data.name;
		const bridge = appStore.currentServer.entity;
		if (props.task.status === TaskStatus.finished && props.task.transferStatus === TransferStatus.normal) {
			if (appStore.currentServer.entity.ip === 'localhost') {
				for (const file of props.task.outputFiles) {
					nodeBridge.openFile(`"${file}"`);
				}
			} else {
				for (const file of props.task.outputFiles) {
					const url = `http://${bridge.ip}:${bridge.port}/download/${file}`;
					if (nodeBridge.env === 'electron') {
						nodeBridge.ipcRenderer?.send('downloadFile', { url, serverName, taskId: props.id });
						appStore.downloadMap.set(url, { serverId: appStore.currentServer.data.id, taskId: props.id });
					} else {
						const elem = document.createElement('a');
						elem.href = url;
						elem.click();
					}
				}
			}
			Tooltip.hide();
		}
	};

	const handleTaskContextMenu = (event: MouseEvent) => {
		showMenu({
			menu: [
				{ type: 'normal', label: props.task.fileBaseName, value: '状态', disabled: true,
					icon: [<IconIdle />, <IconIdleQueued />, <IconRunning />, <IconPaused />, <IconPausedQueued />, <IconStopping />, <IconFinished />, <IconError />][
						[TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].indexOf(props.task.status)
					],
					tooltip: ['状态：空闲', '状态：空闲（等待开始）', '状态：运行中', '状态：已暂停', '状态：已暂停（等待恢复）', '状态：正在停止', '状态：已完成', '状态：出错'][
						[TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.running, TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].indexOf(props.task.status)
					],
				},
				{ type: 'separator' },
				...([TaskStatus.idle, TaskStatus.idle_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>▶️</span>, label: props.task.status === TaskStatus.idle ? '开始转码' : '立即开始转码', value: '开始', onClick: () => { appStore.currentServer.entity.taskStart(props.id) } },
				] : []),
				...([TaskStatus.running, TaskStatus.paused_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>⏸️</span>, label: props.task.status === TaskStatus.running ? '暂停转码' : '保持暂停', value: '暂停', onClick: () => { appStore.currentServer.entity.taskPause(props.id) } },
				] : []),
				...([TaskStatus.paused, TaskStatus.paused_queued].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>▶️</span>, label: props.task.status === TaskStatus.paused ? '继续转码' : '立即继续转码', value: '继续', onClick: () => { appStore.currentServer.entity.taskResume(props.id) } },
				] : []),
				...([TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>⏹️</span>, label: '软停止转码', value: '停止', onClick: () => { appStore.currentServer.entity.taskReset(props.id) } },
				] : []),
				...([TaskStatus.stopping].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🛑</span>, label: '硬停止转码', value: '硬停止', onClick: () => { appStore.currentServer.entity.taskReset(props.id) } },
				] : []),
				...([TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🔙</span>, label: '重置任务', value: '重置', onClick: () => { appStore.currentServer.entity.taskReset(props.id) } },
				] : []),
				...([TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(props.task.status) ? [
					{ type: 'normal' as const, icon: <span>🗑️</span>, label: '删除任务', value: '停止', onClick: () => { appStore.currentServer.entity.taskDelete(props.id) } },
				] : []),
				{ type: 'normal' as const, icon: <span>➕</span>, label: '复制任务', value: '复制任务', onClick: () => {
					const entity = appStore.currentServer.entity;
					if (entity?.status === ServiceBridgeStatus.Connected) {
						entity.taskAdd(props.task.fileBaseName, props.task.after);
					}
				} },
				...(![TaskStatus.idle, TaskStatus.idle_queued].includes(props.task.status) ? [
					{ type: 'separator' as const },
					{ type: 'normal' as const, icon: <span>📈</span>, label: '查看图表', value: '查看图表', onClick: () => showProgressInfo(props.task, props.id, 'progress') },
				] : []),
			],
			type: 'action',
			triggerRect: { xMin: event.pageX - 110, xMax: event.pageX + 110, yMin: event.pageY, yMax: event.pageY },
		})
	};

	const handlePauseNremove = (event: MouseEvent) => {
		event.stopPropagation();
		const entity = appStore.currentServer.entity;
		let task = props.task;
		if ([TaskStatus.running, TaskStatus.paused_queued].includes(task.status)) {
			entity.taskPause(props.id);
		} else if ([TaskStatus.idle_queued, TaskStatus.paused, TaskStatus.stopping, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
			entity.taskReset(props.id);
		} else if (task.status === TaskStatus.idle || task.status === TaskStatus.initializing) {
			entity.taskDelete(props.id);
		}
	};

	const handleParaAreaMouseEnter = (event: MouseEvent) => {
		const paramAreaPos = paramAreaRef.value.getBoundingClientRect();
		const position = window.innerWidth >= 920 ? { right: `${Math.min(window.innerWidth - event.pageX, window.innerWidth - 400)}px`, top: `${paramAreaPos.top}px` } : { right: '48px', top: `${paramAreaPos.top}px` };
		const firstOutput = props.task.after.outputs[0]
		Tooltip.show({
			content: <span>
				时长：{durationBefore.value} → {durationAfter.value}<br />
				容器：{props.task.before.format} → {firstOutput.mux.format}<br />
				规格：{smpteBefore.value} → {firstOutput.video.resolution}@{firstOutput.video.framerate}<br />
				视频：{props.task.before.vcodec}{videoInputBitrate.value} → {firstOutput.video.vcodec}{videoRateControl.value}<br />
				音频：{props.task.before.acodec}{audioInputBitrate.value} → {firstOutput.audio.acodec}{audioRateControl.value}<br />
			</span>,
			style: position,
			class: style.paraAreaTip,
		});
	};

	const handleTaskNameMouseEnter = (event: MouseEvent) => {
		const taskNamePos = taskNameRef.value.getBoundingClientRect();
		const position = { left: `44px`, top: `${taskNamePos.top}px`, maxWidth: `calc(100% - 88px)` };
		Tooltip.show({
			content: props.task.fileBaseName ?? '读取中',
			style: position,
			class: style.taskNameTip,
		});
	};

	// #endregion

	return () => (
		<div class={style.taskWrapper1} onClick={props.onClick}>
			<div class={style.taskWrapper2}>
				<div
					class={style.task}
					style={{ height: `${taskHeight.value}px` }}
					data-color_theme={appStore.frontendSettings.colorTheme}
					onMouseenter={handleTaskMouseEnter}
					onMouseleave={() => Tooltip.hide()}
					onDblclick={handleTaskDblClicked}
					onContextmenu={handleTaskContextMenu}
				>
					<div class={style.backgroundWhite} style={taskBackgroundStyle.value} />
					<div>
						<div class={`${style.backgroundProgress} ${style.progressGreen}`} style={taskBackgroundProgressStyle.value.green} />
						<div class={`${style.backgroundProgress} ${style.progressYellow}`} style={taskBackgroundProgressStyle.value.yellow} />
						<div class={`${style.backgroundProgress} ${style.progressGray}`} style={taskBackgroundProgressStyle.value.gray} />
						<div class={`${style.backgroundProgress} ${style.progressRed}`} style={taskBackgroundProgressStyle.value.red} />
						<div class={`${style.backgroundProgress} ${style.progressBlue}`} style={taskBackgroundProgressStyle.value.blue} />
					</div>
					<div class={style.previewIcon} style={{ bottom: settings.showCmd ? '66px' : undefined}}>
						{taskStatusIcon.value}
					</div>
					<div
						class={style.taskName}
						style={taskNameStyle.value}
						ref={taskNameRef}
						onMouseenter={handleTaskNameMouseEnter}
						onMouseleave={() => Tooltip.hide()}
					>
						{props.task.fileBaseName ?? '读取中'}
					</div>
					{settings.showParams && (
						<div
							class={style.paraArea}
							style={{ maxWidth: windowWidth.value >= 920 ? 'calc(100% - 128px)' : 'calc(0% + 120px)', pointerEvents: props.shouldHandleHover ? 'all' : undefined }}
							ref={paramAreaRef}
							onMouseenter={handleParaAreaMouseEnter}
							onMouseleave={() => Tooltip.hide()}
						>
							{props.task.after.input.files.length === 1 && props.task.after.outputs.length === 1 ? (
								windowWidth.value >= 920 ? (
									<>
										{/* 时间 */}
										<div class={style.divider}><div></div></div>
										<div class={style.durationBefore}>{durationBefore.value}</div>
										{settings.paramsVisibility.duration === 'all' && (
											<>
												<div class={style.durationTo}><IconRightArrow /></div>
												<div class={style.durationAfter}>{durationAfter.value}</div>
											</>
										)}
										{/* 容器 */}
										<div class={style.divider}><div></div></div>
										<div class={style.formatBefore}>{props.task.before.format}</div>
										{settings.paramsVisibility.format === 'all' && (
											<>
												<div class={style.formatTo}><IconRightArrow /></div>
												<div class={style.formatAfter}>{props.task.after.outputs[0].mux.format}</div>
											</>
										)}
										{/* 分辨率码率 */}
										{settings.paramsVisibility.smpte !== 'none' && (
											<>
												<div class={style.divider}><div></div></div>
												<div class={style.smpteBefore}>{smpteBefore.value}</div>
												{settings.paramsVisibility.smpte === 'all' && (
													<>
														<div class={style.smpteTo}><IconRightArrow /></div>
														<div class={style.smpteAfter}>{props.task.after.outputs[0].video.resolution}@{props.task.after.outputs[0].video.framerate}</div>
													</>
												)}
											</>
										)}
										{/* 视频 */}
										{settings.paramsVisibility.video !== 'none' && (
											<>
												<div class={style.divider}><div></div></div>
												<div class={style.videoBefore}>{props.task.before.vcodec}{videoInputBitrate.value}</div>
												{settings.paramsVisibility.video === 'all' && (
													<>
														<div class={style.videoTo}><IconRightArrow /></div>
														<div class={style.videoAfter}>{props.task.after.outputs[0].video.vcodec}{videoRateControl.value}</div>
													</>
												)}
											</>
										)}
										{/* 音频 */}
										{settings.paramsVisibility.audio !== 'none' && (
											<>
												<div class={style.divider}><div></div></div>
												<div class={style.audioBefore}>{props.task.before.acodec}{audioInputBitrate.value}</div>
												{settings.paramsVisibility.audio === 'all' && (
													<>
														<div class={style.audioTo}><IconRightArrow /></div>
														<div class={style.audioAfter}>{props.task.after.outputs[0].audio.acodec}{audioRateControl.value}</div>
													</>
												)}
											</>
										)}
									</>
								) : (
									<>
										{/* 预设 */}
										<div class={style.divider}><div></div></div>
										<div class={style.videoBefore}>{props.task.after.extra?.presetName === undefined ? '查看配置' : props.task.after.extra.presetName || '自定义配置'}</div>
									</>
								)
							) : (
								<>
									<div class={style.divider}><div></div></div>
									<div class={style.videoBefore}>{`${props.task.after.input.files.length} 个输入，${props.task.after.outputs.length} 个输出`}</div>
								</>
							)}
						</div>
					)}
					<Transition enterActiveClass={style['dashboardTrans-enter-active']} leaveActiveClass={style['dashboardTrans-leave-active']}>
						{showDashboard.value && (
							<div class={style.dashboardArea} style={{ pointerEvents: props.shouldHandleHover ? 'all' : undefined }}>
								{dashboardType.value === 'convert' ? (
									<>
										<div class={style.linearGraphItems} onClick={() => showProgressInfo(props.task, props.id, 'progress')}>
											<div class={style.linearGraphItem}>
												<span class={style.data}>{ graphTime.value }</span>
												<span class={style.description}>时间</span>
											</div>
											<div class={style.linearGraphItem}>
												<span class={style.data}>{ props.task.dashboard_smooth.frame.toFixed(0) }</span>
												<span class={style.description}>帧</span>
											</div>
										</div>
										<div class={style.roundGraphItem} onClick={() => showProgressInfo(props.task, props.id, 'bitrate')}>
											<div class={style.ring} style={graphBitrateStyle.value}></div>
											<span class={style.data}>{ graphBitrate.value }</span>
											<span class={style.description}>码率</span>
										</div>
										<div class={style.roundGraphItem} onClick={() => showProgressInfo(props.task, props.id, 'speed')}>
											<div class={style.ring} style={graphSpeedStyle.value}></div>
											<span class={style.data}>{ graphSpeed.value }</span>
											<span class={style.description}>速度</span>
										</div>
										<div class={style.textItem} onClick={() => showProgressInfo(props.task, props.id, 'size')}>
											<span class={style.data}>{ graphSize.value }</span>
											<span class={style.description}>输出大小</span>
										</div>
									</>
								) : (
									<>
										<div class={style.roundGraphItem} onClick={() => showProgressInfo(props.task, props.id, 'transferSpeed')}>
											<div class={style.ring} style={graphTransferSpeedStyle.value}></div>
											<span class={style.data}>{ graphTransferSpeed.value }</span>
											<span class={style.description}>传输秒速</span>
										</div>
										<div class={style.textItem} onClick={() => showProgressInfo(props.task, props.id, 'transferProgress')}>
											<span class={style.data}>{graphTransferred.value}</span>
											<span class={style.description}>传输总量</span>
										</div>
									</>
								)}
								<div class={style.textItem} onClick={() => showProgressInfo(props.task, props.id, dashboardType.value === 'convert' ? 'progress' : 'transferProgress')}>
									<span class={style.data}>{ graphLeftTime.value }</span>
									<span class={style.description}>预计剩余时间</span>
								</div>
								<div class={style.textItem} onClick={() => showProgressInfo(props.task, props.id, dashboardType.value === 'convert' ? 'progress' : 'transferProgress')}>
									<span class={`${style.data} ${style.dataLarge}`}>{ overallProgress.value === 1 ? '🆗' : `${(overallProgress.value * 100).toFixed(1)}%` }</span>
									<span class={style.description}>{ overallProgressDescription.value }</span>
								</div>
							</div>
						)}
					</Transition>
					{settings.showCmd && (
						<div class={style.cmdArea} style={{ top: `${(settings.showParams ? 1 : 0) * 24 + (showDashboard.value ? 1 : 0) * 72 + 2}px` }}>
							<div class={style.margin}>
								<div class={style.switch}>
									<button
										class={`${style.item} ${settings.cmdDisplay === 'input' ? style.itemSelected : ''}`}
										onMousedown={() => settings.cmdDisplay = 'input'}
									>
										输入
									</button>
									<button
										class={`${style.item} ${settings.cmdDisplay === 'output' ? style.itemSelected : ''}`}
										onMousedown={() => settings.cmdDisplay = 'output'}
									>
										输出
									</button>
								</div>
								<div class={style.code}>
									<textarea
										aria-label="任务命令行"
										readonly
										value={cmdText.value}
										ref={cmdRef}
									/>
								</div>
							</div>
						</div>
					)}
					<div class={style.vline} style={{ bottom: settings.showCmd ? '66px' : undefined}}><div></div></div>
					<button aria-label='重置或删除任务' class={style.button} style={{ bottom: settings.showCmd ? '64px' : undefined}} onClick={handlePauseNremove}>
						<div style={{ backgroundPositionX: deleteButtonBackgroundPositionX.value }}></div>
					</button>
				</div>
			</div>
		</div>

	);
}, {
	props: ['task', 'id', 'selected', 'shouldHandleHover', 'onClick'],
});
