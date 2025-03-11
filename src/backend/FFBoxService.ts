import CryptoJS from 'crypto-js';
import { EventEmitter } from 'events';
import os from 'os';
import fs from 'fs';
import fsPromise from 'fs/promises';
import path from 'path';
import { ServiceTask, TaskStatus, OutputParams, FFBoxServiceEvent, Notification, NotificationLevel, FFmpegProgress, WorkingStatus, FFBoxServiceInterface } from '@common/types';
import { getFFmpegParaArray, getFFmpegParaArrayOutputPath } from '@common/getFFmpegParaArray';
import { generator as fGenerator } from '@common/params/formats';
import { defaultParams } from '@common/defaultParams';
import localConfig from '@common/localConfig';
import { getInitialServiceTask, convertAnyTaskToTask, TypedEventEmitter, replaceOutputParams, randomString } from '@common/utils';
import { getMachineId, log } from './utils';
import { FFmpeg, EncoderDetail } from './FFmpegInvoke';
import UIBridge from './uiBridge';

export interface FFBoxServerEvent {
	serverReady: () => void;
	serverError: (arg: { error: Error }) => void;
	serverClose: () => void;
}

export class FFBoxService extends (EventEmitter as new () => TypedEventEmitter<FFBoxServiceEvent & FFBoxServerEvent>) implements FFBoxServiceInterface {
	public tasklist: ServiceTask[] = [];
	private latestTaskId = 0;
	public workingStatus: WorkingStatus = WorkingStatus.idle;
	private ffmpegVersion = '';
	private ffmpegPath = '';
	private globalTask: ServiceTask;
	public notifications: Notification[] = [];
	private latestNotificationId = 0;
	private functionLevel = 20;
	public machineId: string;
	// 设置部分
	private maxThreads = 1;
	private customFFmpegPath: string;
	private preserveUnfinishedTasks = true;

	constructor() {
		super();
		log.info('正在初始化 FFBox 服务。');
		this.globalTask = getInitialServiceTask('');
		this.tasklist[-1] = this.globalTask;
		setTimeout(async () => {
			this.initActivationInfo();
			this.initUIBridge();
			await this.initSettings();
			// this.initFFmpeg();	// 在 initSetting 中已调用
		}, 0);
	}

	private async initActivationInfo() {
		this.machineId = getMachineId();
		const activationCode = await localConfig.get('userInfo.activationCode') as string;
		let result;
		if (activationCode) {
			result = this.activate(activationCode);
		}
		log.info(activationCode ? (result ? '已读取激活信息' : '激活信息无效') : '未读取到激活信息');
	}

	/**
	 * 从本地存储初始化设置
	 */
	public async initSettings(): Promise<void> {
		this.globalTask.after = defaultParams;
		const currentMaxThreads = (await localConfig.get('service.maxThreads') as number) || 1;
		this.maxThreads = currentMaxThreads;
		log.info(`设定最大同时运行任务数为 ${this.maxThreads}`);

		const customFFmpegPath = await localConfig.get('service.customFFmpegPath');
		// 发生了变更，或者初始化时 ffmpegPath 为空（如果之前已经初始化过，那么 customFFmpegPath 两者之一不为空）
		if (this.customFFmpegPath !== customFFmpegPath || !this.ffmpegPath && !customFFmpegPath) {
			this.customFFmpegPath = customFFmpegPath as any || undefined;
			this.initFFmpeg();
		}
		this.customFFmpegPath = customFFmpegPath as any || undefined;

		const preserveUnfinishedTasks = await localConfig.get('service.preserveUnfinishedTasks') === false ? false : true;
		const lastStatusTasks = await localConfig.get('lastStatus.tasks') as { fileBaseName: string; after: OutputParams; }[];
		if (preserveUnfinishedTasks) {
			try {
				if (lastStatusTasks.length) {
					this.setNotification(-1, `服务器上次退出时有未完成任务 ${lastStatusTasks.length} 个，正在重新添加到任务列表`, NotificationLevel.info);
				}
				log.info(`正在恢复上次退出时未完成的 ${lastStatusTasks.length} 个任务`);
				for (const task of lastStatusTasks) {
					this.taskAdd(task.fileBaseName, task.after);
				}
				await localConfig.set('lastStatus.tasks', []);
			} catch (error) {}
		} else {
			try {
				if (lastStatusTasks.length) {
					await localConfig.set('lastStatus.tasks', []);
				}
			} catch (error) {}
		}
	}

	/**
	 * 初始化服务器
	 */
	private initUIBridge(): void {
		UIBridge.init(this);
		UIBridge.listen();
	}

	/**
	 * 检测 ffmpeg 版本，并 emit ffmpegVersion
	 * @emits ffmpegVersion
	 */
	public async initFFmpeg(): Promise<void> {
		if (this.customFFmpegPath) {
			log.info(`已手动指定 ffmpeg 路径为 ${this.customFFmpegPath}，检查版本。`);
			this.ffmpegPath = this.customFFmpegPath;
		} else {
			log.info('检查 FFmpeg 路径和版本。');
			this.ffmpegPath = 'ffmpeg';
			if (process.platform === 'darwin') {
				await fsPromise.access(path.join(process.execPath, '../ffmpeg'), fs.constants.X_OK).then((result) => {
					// 【程序目录】沙箱运行模式，service 与 ffmpeg 处在同一层级（此时 execPath 就是 FFBox.app 所在的绝对路径）
					this.ffmpegPath = path.join(process.execPath, '../ffmpeg');
				}).catch(() => {});
				await fsPromise.access('/usr/local/bin/ffmpeg', fs.constants.X_OK).then((result) => {
					// 【系统目录】macOS 只允许用户往 /usr/local/bin/ 放东西（而不能是 /usr/bin/），且此种情况下需要完整路径才能引用
					this.ffmpegPath = '/usr/local/bin/ffmpeg';
				}).catch(() => {});
			}
			if (process.platform === 'linux') {
				await fsPromise.access(path.join(process.execPath, '../ffmpeg'), fs.constants.X_OK).then((result) => {
					// 【程序目录】deb 沙箱运行模式。service 与 ffmpeg 处在同一目录（此时 execPath 是 /opt/FFBox/FFBoxService，cwd 是 /home/[用户名]）
					this.ffmpegPath = path.join(process.execPath, '../ffmpeg');
				}).catch(() => {});
				await fsPromise.access(path.join(process.cwd(), 'ffmpeg'), fs.constants.X_OK).then((result) => {
					// 【程序目录】AppImage 沙箱运行模式，读取 .AppImage 同级目录（此时 execPath 是 /tmp/.mount_FFBox_[hash]/FFBoxService，cwd 就是终端的 pwd）
					this.ffmpegPath = path.join(process.cwd(), 'ffmpeg');
				}).catch(() => {});
				// 【系统目录】Linux 下 /usr/local/bin/ 和 /usr/bin/ 里的东西均能被直接引用，包括终端执行和沙箱执行，因此此处不需要进行处理
				// console.log('路径', process.execPath, process.cwd(), __dirname, this.ffmpegPath);
				// this.ffmpegVersion = `路径 ${process.execPath}, ${process.cwd()}, ${__dirname}, ${this.ffmpegPath}`;
			}
		}
		const ffmpeg = new FFmpeg(this.ffmpegPath, 1);
		ffmpeg.on('data', ({ content }) => {
			this.setCmdText(-1, content);
		});
		ffmpeg.on('version', ({ content }) => {
			if (content) {
				this.ffmpegVersion = content;
			} else {
				this.ffmpegVersion = '';
			}
			log.info('FFmpeg 路径和版本检查完毕。', this.ffmpegPath, this.ffmpegVersion);
			this.emitFFmpegVersion();
			setTimeout(() => {
				// this.getFFmpegCodecs();
			}, 100);
		});
	}

	public async getFFmpegCodecs(): Promise<void> {
		const ffmpeg = new FFmpeg(this.ffmpegPath, 3, ['-codecs']);
		ffmpeg.on('codecs', async (codecsResult) => {
			log.info(`编码器扫描完成，支持视频编码 ${codecsResult.videoCodecs.length} 个、音频编码 ${codecsResult.audioCodecs.length} 个`);
			console.log(codecsResult);
			const videoFinalResult: {
				name: string;
				description: string;
				encoders: (EncoderDetail & { name: string; })[];
			}[] = [];
			for (const codec of codecsResult.videoCodecs) {
				const encoderNames = codec.encoders.length ? codec.encoders : ['default'];
				const encoderDetails: (EncoderDetail & { name: string; })[] = [];
				for (const encoderName of encoderNames) {
					// console.log(`正在读取 ${codec.name} ${encoder}`);
					await new Promise((resolve, reject) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 3, ['-hide_banner', '-h', `encoder=${encoderName === 'default' ? codec.name : encoderName}`]);
						ffmpeg2.on('codecs', (_, codecResult) => {
							// console.log(codecResult);
							encoderDetails.push({ name: encoderName, ...codecResult });
							resolve(0);
						});
					});
				}
				videoFinalResult.push({
					name: codec.name,
					description: codec.description,
					encoders: encoderDetails,
				});
			}
			debugger;
		});
		
	}

	/**
	 * 向所有客户端更新当前 ffmpeg 版本
	 * @emits ffmpegVersion
	 */
	public emitFFmpegVersion(): void {
		this.emit('ffmpegVersion', { content: this.ffmpegVersion });
	}

	/**
	 * 向所有客户端更新单个任务
	 * @param id 任务 id
	 * @param task 直接传入 task 可减少一次内存查找
	 */
	private emitTaskUpdate(id: number, task?: ServiceTask): void {
		const _task = task || this.tasklist[id];
		if (_task) {
			this.emit('taskUpdate', {
				taskId: id,
				task: convertAnyTaskToTask(_task),
			});
		}
	}

	/**
	 * 新增任务
	 * @emits tasklistUpdate
	 */
	public taskAdd(taskName: string, outputParams: OutputParams): Promise<number> {
		const id = this.latestTaskId++;
		// 目前只处理单输入的情况
		const filePath = outputParams.input.files[0].filePath;
		log.info(`[任务 ${id}] 新增任务：${taskName}（${filePath ? '本地' : '网络'}）。`);
		const task = getInitialServiceTask(taskName, outputParams);
		this.tasklist[id] = task;

		// 更新命令行参数

		if (filePath && filePath.length) {
			task.paraArray = getFFmpegParaArray(task.after, true);
			// 本地文件直接获取媒体信息
			this.getFileMetadata(id, task, filePath);
		} else {
			task.outputFile = fGenerator.getOutputPathRemote(task.after.output, `${new Date().getTime()}${randomString(3)}`);
			task.paraArray = getFFmpegParaArray(task.after, true, undefined, undefined, task.outputFile);
			// 网络文件等待上传完成后再另行调用获取媒体信息
			task.status = TaskStatus.initializing;
			task.remoteTask = true;
		}

		this.emit('tasklistUpdate', { content: Object.keys(this.tasklist).map(Number) });
		return Promise.resolve(id);
	}

	/**
	 * 新增任务时调用 FFmpeg 获取输入文件信息
	 * 多输入任务不调用此函数
	 */
	private getFileMetadata(id: number, task: ServiceTask, filePath: string): void {
		// FFmpeg 读取媒体信息
		log.info(`[任务 ${id}] 读取输入媒体信息。`);
		const ffmpeg = new FFmpeg(this.ffmpegPath, 2, ['-hide_banner', '-i', filePath, '-f', 'null']);
		ffmpeg.on('data', ({ content }) => {
			this.setCmdText(id, content);
		});
		ffmpeg.on('metadata', ({ content: input }) => {
			task.before.format = input.format || '-';
			task.before.duration = parseInt(input.duration || '-1');
			task.before.vcodec = input.vcodec || '-';
			task.before.vresolution = (input.vresolution && input.vresolution.replace('x', '<br />')) || '-';
			task.before.vbitrate = parseInt(input.vbitrate || '-1');
			task.before.vframerate = parseInt(input.vframerate || '-1');
			task.before.acodec = input.acodec || '-';
			task.before.abitrate = parseInt(input.abitrate || '-1');
			this.emitTaskUpdate(id, task);
		});
		ffmpeg.on('closed', (errorCode, errors, runningResult) => {
			this.setNotification(id, filePath + '：' + [...errors].join(''), NotificationLevel.warning);
			setTimeout(() => {
				this.taskDelete(id);
			}, 100);
		});
	}

	/**
	 * 对于远程文件，上传完成后调用此函数合并文件
	 * @emits taskUpdate
	 */
	public mergeUploaded(id: number, hashs: Array<string>): void {
		const task = this.tasklist[id];
		if (!task) {
			// 上传完成之前删除了任务
			return;
		}
		const uploadDir = os.tmpdir() + '/FFBoxUploadCache'; // 文件上传目录
		const destPath = uploadDir + '/' + task.fileBaseName;
		task.after.input.files[0].filePath = uploadDir + '/' + hashs[0]; // 暂时不做多输入功能，默认文件 0
		if (hashs.length > 1) {
			// 目前不做分片功能，此处永假
			fs.writeFile(destPath, '', (err) => {
				if (err) {
					this.setNotification(id, task.fileBaseName + '：合并文件写入失败', NotificationLevel.error);
					return;
				}
				for (const hash of hashs) {
					const source = uploadDir + '/' + hash;
					fs.appendFileSync(destPath, fs.readFileSync(source));
					fs.rmSync(source);
				}
			});
		}
		task.status = TaskStatus.idle;
		this.getFileMetadata(id, task, task.after.input.files[0].filePath || '');
		task.paraArray = getFFmpegParaArray(task.after, true, undefined, undefined, task.outputFile);
		this.setNotification(id, `任务「${task.fileBaseName}」输入文件上传完成`, NotificationLevel.info);
		this.emitTaskUpdate(id, task);
	}

	/**
	 * 【initializing / idle / idle_queued / finished / error】 => 【deleted】
	 * @param id 任务 id
	 * @emits tasklistUpdate
	 */
	public taskDelete(id: number): void {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 删除：任务不存在！`);
			return;
		}
		if (!task || !([TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(task.status))) {
			log.error(`[任务 ${id}] 删除：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 删除任务。`);
		}
		task.status = TaskStatus.deleted;
		delete this.tasklist[id];
		this.emit('tasklistUpdate', { content: Object.keys(this.tasklist).map(Number) });
	}

	/**
	 * 启动单个任务
	 * 【idle / idle_queued / error】 => 【running】 => 【finished / error】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskStart(id: number): void {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 启动：任务不存在！`);
			return;
		}
		if (!([TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.error].includes(task.status))) {
			log.error(`[任务 ${id}] 启动：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 启动。`);
		}
		task.status = TaskStatus.running;
		task.progressLog = {
			time: [],
			frame: [],
			size: [],
			lastStarted: new Date().getTime() / 1000,
			elapsed: 0,
			lastPaused: new Date().getTime() / 1000,
		};
		this.emit('progressUpdate', {
			taskId: id,
			time: new Date().getTime() / 1000,
		});
		this.setCmdText(id, '', false);
		if (this.functionLevel < 50) {
			const videoParam = task.after.video;
			if (videoParam.ratecontrol === 'ABR' || videoParam.ratecontrol === 'CBR') {
				const ratevalue = videoParam.ratevalue as number;
				if (ratevalue > 0.75 || ratevalue < 0.25) {
					this.setNotification(
						id,
						`任务「${task.fileBaseName}」设置的视频码率已被限制<br/>` +
							'💔您的用户等级在 ABR/CBR 模式下的视频码率仅支持 500Kbps ~ 32Mbps<br/>' +
							'✅您可进行软件激活以解锁功能限制，或直接使用 FFmpeg 进行进阶操作',
						NotificationLevel.warning,
					);
					videoParam.ratevalue = ratevalue > 0.75 ? 0.75 : 0.25;
				}
			}
		}
		// const filePath = task.after.input.files[0].filePath!; // 需要上传完成，状态为 TASK_STOPPED 时才能开始任务，因此 filePath 非空
		let newFFmpeg: FFmpeg;
		if (task.remoteTask) {
			newFFmpeg = new FFmpeg(this.ffmpegPath, 0, getFFmpegParaArray(task.after, false, undefined, undefined, `${os.tmpdir()}/FFBoxDownloadCache/${task.outputFile}`));
		} else {
			task.outputFile = getFFmpegParaArrayOutputPath(task.after);
			newFFmpeg = new FFmpeg(this.ffmpegPath, 0, getFFmpegParaArray(task.after, false));
		}
		newFFmpeg.on('closed', (errorCode, errors, runningResult) => {
			if (errorCode) {
				if (runningResult === 'failed') {
					log.error(`[任务 ${id}] 出错：${task.fileBaseName}。`);
					this.setNotification(id, '任务「' + task.fileBaseName + '」转码失败。' + [...errors].join('') + '请在命令行输出面板查看详细原因。', NotificationLevel.error);
				} else {
					log.error(`[任务 ${id}] 异常终止：${task.fileBaseName}。`);
					this.setNotification(id, '任务「' + task.fileBaseName + '」异常终止。请在命令行输出面板查看详细原因。', NotificationLevel.error);
				}
				task.status = TaskStatus.error;
			} else {
				log.info(`[任务 ${id}] 完成：${task.fileBaseName}。`);
				task.status = TaskStatus.finished;
				task.progressLog.elapsed = new Date().getTime() / 1000 - task.progressLog.lastStarted;
				this.setNotification(id, `任务「${task.fileBaseName}」已转码完成`, NotificationLevel.ok);
			}
			this.emitTaskUpdate(id, task);
			this.queueAssign();
			this.storeUnfinishedTask();		
		});
		newFFmpeg.on('status', (status: FFmpegProgress) => {
			const progressLog = task.progressLog;
			const time = new Date().getTime() / 1000 - progressLog.lastStarted + progressLog.elapsed;
			for (const parameter of ['time', 'frame', 'size']) {
				const _parameter = parameter as 'time' | 'frame' | 'size';
				progressLog[_parameter].push([time, status[_parameter]]);
			}
			if (this.functionLevel < 50) {
				if (progressLog.time[progressLog.time.length - 1][1] > 671 || progressLog.elapsed + new Date().getTime() / 1000 - progressLog.lastStarted > 671) {
					this.trailLimit_stopTranscoding(id);
					return;
				}
			}
			this.emit('progressUpdate', {
				taskId: id,
				time,
				status,
			});
		});
		newFFmpeg.on('data', ({ content }) => {
			this.setCmdText(id, content);
		});
		// newFFmpeg.on('error', ({ error }) => {
		// 	task.errorInfo.push(error.description);
		// });
		newFFmpeg.on('warning', (warning) => {
			this.setNotification(id, task.fileBaseName + '：' + warning.content, NotificationLevel.warning);
		});
		for (const parameter of ['time', 'frame', 'size']) {
			const _parameter = parameter as 'time' | 'frame' | 'size';
			task.progressLog[_parameter].push([new Date().getTime() / 1000 - task.progressLog.lastStarted, 0]);
		}
		task.ffmpeg = newFFmpeg;
		this.emitTaskUpdate(id, task);
		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emit('workingStatusUpdate', { value: 'start' });
		}
		this.storeUnfinishedTask();
	}

	/**
	 * 暂停单个任务
	 * 【running / paused_queued】 => 【paused】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskPause(id: number): void {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 暂停：任务不存在！`);
			return;
		}
		if (!task.ffmpeg) {
			// ffmpeg 已退出，不应调用 pause
			log.error(`[任务 ${id}] 暂停：操作不合法！`);
			return;
		}
		if (!([TaskStatus.running, TaskStatus.paused_queued].includes(task.status))) {
			log.error(`[任务 ${id}] 暂停：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 暂停。`);
		}
		task.status = TaskStatus.paused;
		task.ffmpeg!.pause();
		task.progressLog.lastPaused = new Date().getTime() / 1000;
		task.progressLog.elapsed += task.progressLog.lastPaused - task.progressLog.lastStarted;
		this.emitTaskUpdate(id, task);
		this.queueAssign();
	}

	/**
	 * 继续执行单个任务
	 * 【paused / paused_queued】 => 【running】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskResume(id: number): void {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 继续：任务不存在！`);
			return;
		}
		if (!([TaskStatus.paused, TaskStatus.paused_queued].includes(task.status))) {
			log.error(`[任务 ${id}] 继续：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 继续。`);
		}
		task.status = TaskStatus.running;
		const nowRealTime = new Date().getTime() / 1000;
		task.progressLog.lastStarted = nowRealTime;
		task.ffmpeg!.resume();
		this.emitTaskUpdate(id, task);
		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emit('workingStatusUpdate', { value: 'start' });
		}
	}

	/**
	 * 重置任务（收尾/强行，根据状态决定）
	 * 【paused / paused_queued / stopping / finished / error】 => 【idle】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskReset(id: number): void {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 重置：任务不存在！`);
			return;
		}
		if ([TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running].includes(task.status)) {
			// 暂停状态下重置或运行状态下达到限制停止工作
			log.info(`[任务 ${id}] 重置——软停止。`);
			task.status = TaskStatus.stopping;
			task.ffmpeg!.exit(() => {
				task.status = TaskStatus.idle;
				task.ffmpeg = null;
				this.emit('taskUpdate', {
					taskId: id,
					task: convertAnyTaskToTask(task),
				});
				this.queueAssign();
				this.storeUnfinishedTask();
			});
		} else if (task.status === TaskStatus.stopping) {
			// 正在停止状态下强制重置
			log.info(`[任务 ${id}] 重置——硬停止。`);
			task.status = TaskStatus.idle;
			task.ffmpeg!.forceKill(() => {
				task.ffmpeg = null;
				this.emit('taskUpdate', {
					taskId: id,
					task: convertAnyTaskToTask(task),
				});
				this.queueAssign();
				this.storeUnfinishedTask();
			});
		} else if ([TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
			// 完成状态下或队列中仍未开始状态下重置
			log.info(`[任务 ${id}] 重置到初始状态。`);
			task.status = TaskStatus.idle;
			this.queueAssign();
		} else {
			log.error(`[任务 ${id}] 重置：任务当前状态为 ${task.status}，操作不合法！`);
		}
		this.emitTaskUpdate(id, task);
	}

	private storeUnfinishedTask(): void {
		if (!this.preserveUnfinishedTasks) {
			return;
		}
		const tasks: { fileBaseName: string; after: OutputParams; }[] = [];
		for (const [id, task] of Object.entries(this.tasklist)) {
			// 未开始或者排队的任务不需要存储
			if ([TaskStatus.initializing, TaskStatus.idle, TaskStatus.finished, TaskStatus.error].includes(task.status) || id === '-1') {
				break;
			}
			tasks.push({
				fileBaseName: task.fileBaseName,
				after: task.after,
			});
		}
		clearTimeout((global as any).saveStatusTimer);
		(global as any).saveStatusTimer = setTimeout(() => {
			localConfig.set('lastStatus.tasks', tasks);
			log.info(`任务状态已保存。`, tasks);
		}, 700);
	}

	/**
	 * 分配队列任务，每当任务状态更新时都应调用此函数
	 * 如果当前 workingStatus 为 running，那么挑选处于【空闲_已排队】【已暂停_已排队】的任务进入【正在运行】状态，直到【正在运行】的数量达到最大
	 * 如果安排完成后【正在运行】的任务数量依然为 0，说明所有任务均已处理完毕，workingStatus 进入 idle 状态
	 * @returns 当前正在运行的任务数
	 */
	private queueAssign(): number {
		if (this.workingStatus === WorkingStatus.running) {
			let runningCount = Object.values(this.tasklist).reduce((prev, curr) => curr.status === TaskStatus.running ? prev + 1 : prev, 0);
			for (const [id, task] of Object.entries(this.tasklist)) {
				if (runningCount >= this.maxThreads || id === '-1') {
					break;
				}
				if (task.status === TaskStatus.idle_queued) {
					this.taskStart(+id);
					runningCount++;
				}
				if (task.status === TaskStatus.paused_queued) {
					this.taskResume(+id);
					runningCount++;
				}
			}
			if (runningCount === 0) {
				this.workingStatus = WorkingStatus.idle;
				this.emit('workingStatusUpdate', { value: 'stop' });
			}
			return runningCount;
		}
		return 0;
	}

	/**
	 * 开始处理队列，将所有【空闲】【已暂停】的任务进入【空闲_已排队】【已暂停_已排队】状态，并调用 queueAssign 进行任务安排
	 */
	public queueStart(): void {
		this.workingStatus = WorkingStatus.running;
		for (const [id, task] of Object.entries(this.tasklist)) {
			if (id === '-1') {
				continue;
			}
			if (task.status === TaskStatus.idle) {
				task.status = TaskStatus.idle_queued;
			} else if (task.status === TaskStatus.paused) {
				task.status = TaskStatus.paused_queued;
			}
		}
		const runningCount = this.queueAssign();
		if (runningCount) {
			this.emit('workingStatusUpdate', { value: 'start' });
		}
		for (const [id, task]of Object.entries(this.tasklist)) {
			if (id !== '-1' && [TaskStatus.idle_queued, TaskStatus.paused_queued].includes(task.status)) {
				this.emitTaskUpdate(+id);
			}
		}
	}

	/**
	 * 暂停处理队列，将所有【正在运行】的任务暂停、【空闲_已排队】的任务重置
	 */
	public queuePause(): void {
		if (this.workingStatus === WorkingStatus.running) {
			this.emit('workingStatusUpdate', { value: 'pause' });
		}
		this.workingStatus = WorkingStatus.idle;
		for (const [id, task] of Object.entries(this.tasklist)) {
			if (id === '-1') {
				continue;
			}
			if ([TaskStatus.running, TaskStatus.paused_queued].includes(task.status)) {
				this.taskPause(+id);
			} else if (task.status === TaskStatus.idle_queued) {
				this.taskReset(+id);
			}
		}
	}

	/**
	 * 删除相应通知
	 * @emits taskUpdate
	 */
	public deleteNotification(notificationId: number): void {
		delete this.notifications[notificationId];
		this.emit('notificationUpdate', { notificationId });
	}

	/**
	 * 批量设置任务的输出参数，将算出的 paraArray 通过 taskUpdate 传回（这样对性能不太好）
	 * @emits taskUpdate
	 *
	 */
	public setParameter(ids: Array<number>, param: OutputParams): void {
		for (const id of ids) {
			const task = this.tasklist[id];
			task.after = replaceOutputParams(param, task.after);
			const filePath = task.after.input.files[0].filePath;
			if (task.remoteTask) {
				// 如果修改了输出格式，需要重新计算 outputFile
				task.outputFile = fGenerator.getOutputPathRemote(task.after.output, `${new Date().getTime()}${randomString(3)}`);
				task.paraArray = getFFmpegParaArray(task.after, true, undefined, undefined, task.outputFile);
			} else {
				task.paraArray = getFFmpegParaArray(task.after, true);
			}
			this.emitTaskUpdate(id);
		}
	}

	/**
	 * 收到 cmd 内容通用回调
	 * @param id 任务 id
	 * @param content 文本
	 * @param append 附加到末尾，默认 true
	 */
	private setCmdText(id: number, content: string, append = true): void {
		const task = this.tasklist[id];
		if (!append) {
			task.cmdData = content;
		} else {
			if (content.length) {
				if (task.cmdData.slice(-1) !== '\n' && task.cmdData.length) {
					task.cmdData += '\n';
				}
				task.cmdData += content;
			}
		}
		this.emit('cmdUpdate', {
			taskId: id,
			content,
			append,
		});
	}

	/**
	 * 任务通知，emit 事件并存储到任务中
	 * @param taskId
	 * @param content
	 * @param level
	 */
	public setNotification(taskId: number, content: string, level: NotificationLevel): void {
		const notificationId = this.latestNotificationId++;
		const notification = {
			time: new Date().getTime(),
			taskId,
			content,
			level,
		};
		this.emit('notificationUpdate', {
			notificationId,
			notification,
		});
		this.notifications[notificationId] = notification;
	}

	public activate(activationCode: string): boolean {
		const fixedCode = 'd324c697ebfc42b7';
		const key = this.machineId + fixedCode;
		const decrypted = CryptoJS.AES.decrypt(activationCode, key);
		const decryptedString = CryptoJS.enc.Utf8.stringify(decrypted);
		if (parseInt(decryptedString).toString() === decryptedString) {
			this.functionLevel = parseInt(decryptedString);
			return true;
		} else {
			return false;
		}
	}

	public trailLimit_stopTranscoding(id: number, byFrontend = false): void {
		const task = this.tasklist[id];
		this.setNotification(
			id,
			`任务「${task.fileBaseName}」转码达到时长上限了${byFrontend ? '（前端）' : '（后端）'}<br/>` +
				'💔您的用户等级最高支持 11:11 的媒体时长和 11:11 的处理耗时<br/>' +
				'✅您可进行软件激活以解锁功能限制，或直接使用 FFmpeg 进行进阶操作',
			NotificationLevel.error,
		);
		task.status = TaskStatus.stopping;
		task.ffmpeg!.exit(() => {
			task.status = TaskStatus.error;
			task.ffmpeg = null;
			this.emit('taskUpdate', {
				taskId: id,
				task: convertAnyTaskToTask(task),
			});
			this.queueAssign();
		});
	}
}
