import CryptoJS from 'crypto-js';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import fs from 'fs';
import fsPromise from 'fs/promises';
import { utimes } from 'utimes';
import path from 'path';
import { ServiceTask, Task, TaskStatus, OutputParams, FFBoxServiceEvent, Notification, NotificationLevel, FFmpegProgress, WorkingStatus, FFBoxServiceInterface, FFmpegInfo, EncoderDetail, FFmpegCodecDetail, FFmpegFilterDetail, FFmpegMuxerDetail, FFmpegDemuxerDetail, Frame } from '@common/types';
import { TaskList } from './TaskList';
import i11n from '@common/i11n/i11n';
import { genTaskOutputFiles, getFFmpegParaArray } from '@common/getFFmpegParaArray';
import localConfig from '@common/localConfig';
import { parseFFmpegCodecsToCodecsList, parseFFmpegMuDeMuxersToList } from '@common/params/parser';
import { getInitialServiceTask, TypedEventEmitter, replaceOutputParams, randomString, getOutputDuration, parseTimeString, getOutputFileTime } from '@common/utils';
import { getMachineId, log } from './utils';
import { FFmpeg } from './FFmpegInvoke';
import { webhookManager } from './utils/webhookManager';

export interface FFBoxServerEvent {
	serverReady: () => void;
	serverError: (arg: { error: Error }) => void;
	serverClose: () => void;
}

export class FFBoxService extends (EventEmitter as new () => TypedEventEmitter<FFBoxServiceEvent & FFBoxServerEvent>) implements FFBoxServiceInterface {
	public taskList: TaskList = new TaskList();
	public workingStatus: WorkingStatus = WorkingStatus.idle;
	public ffmpegPath = '';
	public ffprobePath = '';
	public ffmpegInfo: FFmpegInfo = { version: '', scanning: false, videoEncodersCount: 0, audioEncodersCount: 0, filtersCount: 0, muxersCount: 0, demuxersCount: 0 };
	public ffmpegCodecs: { video: FFmpegCodecDetail[], audio: FFmpegCodecDetail[]; } | null = null;
	public ffmpegFormats: { muxer: FFmpegMuxerDetail[], demuxer: FFmpegDemuxerDetail[]; } | null = null;
	public ffmpegFilters: FFmpegFilterDetail[] = [];
	public notifications: Notification[] = [];
	private latestNotificationId = 0;
	public functionLevel = 20;
	public machineId: string | undefined;
	// 设置部分
	private maxThreads = 1;
	private customFFmpegPath: string | undefined = undefined;
	private preserveUnfinishedTasks = true;
	private deleteFinishedTasks = false;
	// 帧扫描状态跟踪：key = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`
	private frameScanStatus: Map<string, {
		status: 'scanning' | 'completed' | 'stopped';
		type: 'fast' | 'full';
		promise?: Promise<Frame[]>;
		process?: ChildProcess;
		frames?: Frame[];
	}> = new Map();
	// 缩略图缓存跟踪：key = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`
	private thumbnailCache: Map<string, {
		status: 'generating' | 'completed' | 'stopped';
		promise?: Promise<Buffer>;
		process?: ChildProcess;
		data?: Buffer;
		contentType?: string;
		params: {
			width: number;
			height: number;
			density: 'H' | 'M';
		};
	}> = new Map();

	constructor() {
		super();
		log.info('正在初始化 FFBox 服务。');
		setTimeout(async () => {
			this.initActivationInfo();
			await this.initSettings();
			webhookManager.load();
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
		const lastStatusTasks = await localConfig.get('lastStatus.tasks') as { taskName: string; after: OutputParams; }[];
		if (preserveUnfinishedTasks) {
			try {
				if (lastStatusTasks.length) {
					this.setNotification(undefined, `服务器上次退出时有未完成任务 ${lastStatusTasks.length} 个，正在重新添加到任务列表`, NotificationLevel.info);
				}
				log.info(`正在恢复上次退出时未完成的 ${lastStatusTasks.length} 个任务`);
				for (const task of lastStatusTasks) {
					this.taskAdd(task.taskName, task.after);
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

		this.deleteFinishedTasks = await localConfig.get('service.deleteFinishedTasks') === true ? true : false;
	}

	/**
	 * 检测 ffmpeg 版本，并 emit ffmpegInfo
	 * @emits ffmpegInfo
	 */
	public async initFFmpeg(): Promise<void> {
		function resolveFFmpegPaths(inputPath: string): { ffmpegPath: string; ffprobePath: string } {
			const ext = process.platform === 'win32' ? '.exe' : '';
			let isDir = false;
			try {
				isDir = fs.statSync(inputPath).isDirectory();
			} catch {
				if (!path.extname(inputPath) && fs.existsSync(inputPath + ext)) {
					// 无扩展名但加上 .exe 后存在，则视为文件（Windows 的 spawn 会自动补全 .exe）
					isDir = false;
				} else {
					// 路径不存在时，启发式判断：无扩展名则视为目录
					isDir = !path.extname(inputPath);
				}
			}
			if (isDir) {
				return {
					ffmpegPath: path.join(inputPath, `ffmpeg${ext}`),
					ffprobePath: path.join(inputPath, `ffprobe${ext}`),
				};
			} else {
				const ffmpegPath = path.extname(inputPath) ? inputPath : inputPath + ext;
				return {
					ffmpegPath,
					ffprobePath: path.join(path.dirname(ffmpegPath), `ffprobe${ext}`),
				};
			}
		}
				
		if (this.customFFmpegPath) {
			log.info(`已手动指定 ffmpeg 路径为 ${this.customFFmpegPath}，检查版本。`);
			const resolved = resolveFFmpegPaths(this.customFFmpegPath);
			this.ffmpegPath = resolved.ffmpegPath;
			this.ffprobePath = resolved.ffprobePath;
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
			const resolved = resolveFFmpegPaths(this.ffmpegPath);
			this.ffmpegPath = resolved.ffmpegPath;
			this.ffprobePath = resolved.ffprobePath;
		}
		const ffmpeg = new FFmpeg(this.ffmpegPath, 1);
		ffmpeg.on('version', async ({ content }) => {
			if (content) {
				this.ffmpegInfo.version = content;
				const lastFFmpegVersion = await localConfig.get('ffmpegInfo.version');
				if (lastFFmpegVersion === content) {
					try {
						const storedFFmpegInfo = await localConfig.get('ffmpegInfo') as any;
						this.ffmpegInfo.audioEncodersCount = storedFFmpegInfo.audioEncodersCount ?? 0;
						this.ffmpegInfo.videoEncodersCount = storedFFmpegInfo.videoEncodersCount ?? 0;
						this.ffmpegInfo.muxersCount = storedFFmpegInfo.muxersCount ?? 0;
						this.ffmpegInfo.demuxersCount = storedFFmpegInfo.demuxersCount ?? 0;
						this.ffmpegInfo.filtersCount = storedFFmpegInfo.filtersCount ?? 0;
						this.ffmpegCodecs = {
							video: JSON.parse(storedFFmpegInfo.videoCodecs),
							audio: JSON.parse(storedFFmpegInfo.audioCodecs),
						};
						this.ffmpegFormats = {
							muxer: JSON.parse(storedFFmpegInfo.muxers),
							demuxer: JSON.parse(storedFFmpegInfo.demuxers),
						};
						this.ffmpegFilters = JSON.parse(storedFFmpegInfo.filters) || [];
						log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。已从缓存中加载编码器和滤镜。`);
						this.emitFFmpegInfo();
					} catch (error) {
						log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。缓存中的编码器和滤镜不可用，即将获取编码器信息。`);
						setTimeout(() => {
							this.getFFmpegCodecsAndFilters();
						}, 100);							
					}
				} else {
					log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。即将获取编码器信息。`);
					setTimeout(() => {
						this.getFFmpegCodecsAndFilters();
					}, 100);
				}
			} else {
				this.ffmpegInfo.version = '';
				this.emitFFmpegInfo();
			}
		});
		setTimeout(() => {
			if (!this.ffmpegInfo.version) {
				log.error(`在检查 ffmpeg 版本时，ffmpeg 成功启动，但 stdio 中没有接收到任何消息。重试。`);
				this.initFFmpeg();
			}
		}, 1500);
	}

	public async getFFmpegCodecsAndFilters(): Promise<void> {
		this.ffmpegInfo.scanning = true;
		this.emitFFmpegInfo();
		await new Promise((resolve, reject) => {
			// 获取 codecs
			const ffmpeg = new FFmpeg(this.ffmpegPath, 3, ['-codecs']);
			ffmpeg.on('codecs', async (codecsResult) => {
				if (!codecsResult) { debugger; throw 'ub'; }
				log.info(`编码器概览扫描完成，支持视频编码 ${codecsResult.videoCodecs.length} 个、音频编码 ${codecsResult.audioCodecs.length} 个。即将扫描详细信息。`);
				console.log(codecsResult);
				const videoFinalResult: FFmpegCodecDetail[] = [];
				const audioFinalResult: FFmpegCodecDetail[] = [];
				let videoEncodersCount = 0;
				let audioEncodersCount = 0;
				for (const codec of codecsResult.videoCodecs) {
					const encoderNames = codec.encoders.length ? codec.encoders : [codec.name];
					const encoderDetails: (EncoderDetail & { name: string; })[] = [];
					videoEncodersCount += encoderNames.length;
					for (const encoderName of encoderNames) {
						// console.log(`正在读取 ${codec.name} ${encoder}`);
						await new Promise((resolve, _) => {
							const ffmpeg2 = new FFmpeg(this.ffmpegPath, 3, ['-hide_banner', '-h', `encoder=${encoderName}`]);
							ffmpeg2.on('codecs', (_, codecResult) => {
								// console.log(codecResult);
								encoderDetails.push({ name: encoderName, ...codecResult! });
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
				log.info('视频编码器扫描结果', videoFinalResult);
				this.ffmpegInfo.videoEncodersCount = videoEncodersCount;
				this.emitFFmpegInfo();
				for (const codec of codecsResult.audioCodecs) {
					const encoderNames = codec.encoders.length ? codec.encoders : [codec.name];
					const encoderDetails: (EncoderDetail & { name: string; })[] = [];
					audioEncodersCount += encoderNames.length;
					for (const encoderName of encoderNames) {
						// console.log(`正在读取 ${codec.name} ${encoder}`);
						await new Promise((resolve, _) => {
							const ffmpeg2 = new FFmpeg(this.ffmpegPath, 3, ['-hide_banner', '-h', `encoder=${encoderName}`]);
							ffmpeg2.on('codecs', (_, codecResult) => {
								// console.log(codecResult);
								encoderDetails.push({ name: encoderName, ...codecResult! });
								resolve(0);
							});
						});
					}
					audioFinalResult.push({
						name: codec.name,
						description: codec.description,
						encoders: encoderDetails,
					});
				}
				log.info('音频编码器扫描结果', audioFinalResult);
				this.ffmpegInfo.audioEncodersCount = audioEncodersCount;
				this.emitFFmpegInfo();
				this.ffmpegCodecs = { video: videoFinalResult, audio: audioFinalResult };
				parseFFmpegCodecsToCodecsList(this.ffmpegCodecs);
				resolve(0);
			});
		});
		await new Promise((resolve, reject) => {
			// 获取 muxers/demuxers
			const ffmpeg = new FFmpeg(this.ffmpegPath, 4, ['-formats']);
			ffmpeg.on('formats', async (formatsResult) => {
				if (!formatsResult) { debugger; throw 'ub'; }
				log.info(`格式概览扫描完成，支持复用器 ${formatsResult.muxers.length} 个、解复用器 ${formatsResult.demuxers.length} 个。即将扫描详细信息。`);
				console.log(formatsResult);
				const muxerFinalResult: FFmpegMuxerDetail[] = [];
				const demuxerFinalResult: FFmpegDemuxerDetail[] = [];
				for (const muxer of formatsResult.muxers) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 4, ['-hide_banner', '-h', `muxer=${muxer.name}`]);
						ffmpeg2.on('formats', (_, formatResult) => {
							if (!formatResult) { debugger; throw 'ub'; }
							muxerFinalResult.push({
								name: muxer.name,
								description: muxer.description,
								extensions: formatResult.commonExtensions || [],
								defaultVideoCodec: formatResult.defaultVideoCodec,
								defaultAudioCodec: formatResult.defaultAudioCodec,
								options: formatResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('复用器扫描结果', muxerFinalResult);
				this.ffmpegInfo.muxersCount = muxerFinalResult.length;
				this.emitFFmpegInfo();
				for (const demuxer of formatsResult.demuxers) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 4, ['-hide_banner', '-h', `demuxer=${demuxer.name}`]);
						ffmpeg2.on('formats', (_, formatResult) => {
							if (!formatResult) { debugger; throw 'ub'; }
							demuxerFinalResult.push({
								name: demuxer.name,
								description: demuxer.description,
								extensions: formatResult.commonExtensions || [],
								isDevice: demuxer.isDevice,
								options: formatResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('解复用器扫描结果', demuxerFinalResult);
				this.ffmpegInfo.demuxersCount = demuxerFinalResult.length;
				this.emitFFmpegInfo();
				this.ffmpegFormats = { muxer: muxerFinalResult, demuxer: demuxerFinalResult };
				parseFFmpegMuDeMuxersToList(this.ffmpegFormats);
				resolve(0);
			});
		});
		await new Promise((resolve, reject) => {
			// 获取 filters
			const ffmpeg = new FFmpeg(this.ffmpegPath, 5, ['-filters']);
			ffmpeg.on('filters', async (filtersResult) => {
				if (!filtersResult) { debugger; throw 'ub'; }
				log.info(`滤镜概览扫描完成，支持滤镜 ${filtersResult.length} 个。即将扫描详细信息。`);
				console.log(filtersResult);
				const result: FFmpegFilterDetail[] = [];
				for (const filter of filtersResult) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 5, ['-hide_banner', '-h', `filter=${filter.name}`]);
						ffmpeg2.on('filters', (_, codecResult) => {
							if (!codecResult) { debugger; throw 'ub'; }
							result.push({
								name: filter.name,
								description: filter.description,
								inputType: filter.inputType,
								outputType: filter.outputType,
								options: codecResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('滤镜扫描结果', result);
				this.ffmpegFilters = result;
				this.ffmpegInfo.scanning = false;
				this.ffmpegInfo.filtersCount = result.length;
				this.emitFFmpegInfo();
				resolve(0);
			});	
		});
		localConfig.set('ffmpegInfo', {
			version: this.ffmpegInfo.version,
			audioEncodersCount: this.ffmpegInfo.audioEncodersCount,
			videoEncodersCount: this.ffmpegInfo.videoEncodersCount,
			muxersCount: this.ffmpegInfo.muxersCount,
			demuxersCount: this.ffmpegInfo.demuxersCount,
			filtersCount: this.ffmpegInfo.filtersCount,
			videoCodecs: JSON.stringify(this.ffmpegCodecs!.video),
			audioCodecs: JSON.stringify(this.ffmpegCodecs!.audio),
			muxers: JSON.stringify(this.ffmpegFormats!.muxer),
			demuxers: JSON.stringify(this.ffmpegFormats!.demuxer),
			filters: JSON.stringify(this.ffmpegFilters),
		});
	}

	/**
	 * 向所有客户端更新当前 ffmpeg 版本
	 * @emits ffmpegInfo
	 */
	private emitFFmpegInfo(): void {
		this.emit('ffmpegInfo', this.ffmpegInfo);
	}

	/**
	 * 计算总进度并发送 statusUpdate
	 * @param workingStatus 队列状态变化时携带，仅状态变化时传入
	 * @emits statusUpdate
	 */
	private emitStatusUpdate(workingStatus?: 'start' | 'stop' | 'pause'): void {
		let totalTime = 0.000001;
		let totalProcessedTime = 0;
		// TODO 仅统计运行中的任务进度，考虑对每个状态维护一个 Set，判断 Set 中有无此任务 id
		for (const task of this.taskList.getSnapshot()) {
			if (!task.before[0]?.duration || [TaskStatus.idle].includes(task.status)) {
				continue;
			}
			const outputDuration = getOutputDuration(task as any);
			if (outputDuration <= 0) continue;
			totalTime += outputDuration;

			let taskProgress: number;
			if (task.status === TaskStatus.finished || task.status === TaskStatus.error) {
				taskProgress = 1;
			} else if (task.status === TaskStatus.running || task.status === TaskStatus.paused) {
				const currentTime = task.progressLog.time.length > 0
					? task.progressLog.time[task.progressLog.time.length - 1][1]
					: 0;
				taskProgress = Math.max(0, Math.min(1, currentTime / outputDuration));
			} else {
				taskProgress = 0;
			}
			totalProcessedTime += taskProgress * outputDuration;
		}
		const progress = isNaN(totalProcessedTime / totalTime) ? 0 : totalProcessedTime / totalTime;
		this.emit('statusUpdate', { workingStatus, progress });
	}

	/**
	 * 向所有客户端更新单个任务
	 * @param id 任务 id
	 * @param task 直接传入 task 可减少一次内存查找
	 */
	private emitTaskUpdate(id: number, task?: ServiceTask): void {
		const _task = task || this.taskList.getById(id);
		if (_task) {
			this.emit('taskUpdate', {
				taskId: id,
				task: {
					id: _task.id,
					taskName: _task.taskName,
					before: _task.before,
					after: _task.after,
					paraArray: _task.paraArray,
					status: _task.status,
					progressLog: _task.progressLog,
					// cmdData: _task.cmdData,
					errorInfo: _task.errorInfo,
					outputFiles: _task.outputFiles,
				} as any,
			});
		}
	}

	/**
	 * 新增任务
	 * @param isRemote 该值由 uiBridge 传入，前端无法指定
	 * @emits tasklistUpdate
	 */
	public taskAdd(taskName: string, outputParams: OutputParams, isRemote?: boolean): Promise<number> {
		const maxTaskCount = this.functionLevel < 40 ? 66 : this.functionLevel < 60 ? 99 : Number.MAX_SAFE_INTEGER;
		if (this.taskList.count() >= maxTaskCount) {
			this.setNotification(
				undefined,
				i11n.service.功能限制_任务数上限(maxTaskCount, false),
				NotificationLevel.warning,
			);
			return;
		}

		const firstFilePath = outputParams.input.files?.[0]?.filePath;
		const task = getInitialServiceTask(-1, taskName, outputParams);	// id 由 taskList.add 分配
		const id = this.taskList.add(task);

		// 更新命令行参数
		const taskIndex = this.taskList.getIndexById(id);
		if (isRemote) {
			task.outputFiles = genTaskOutputFiles(task.after, ``, { taskId: id, taskIndex });
			task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles, taskId: id, taskIndex });
			task.status = TaskStatus.initializing;
			task.remoteTask = true;
		} else {
			task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, taskId: id, taskIndex });
			if (firstFilePath?.length) {
				this.getFileMetadata(id, task);
			}
		}

		log.info(`[任务 ${id}] 新增任务：${taskName}（${firstFilePath ? '单输入普通任务' : '多输入/网络任务'}）。`);
		this.emit('tasklistUpdate', { added: [{ taskId: id, index: this.taskList.count() - 1 }], removed: [], totalCount: this.taskList.count() });

		webhookManager.triggerTaskEvent('task.created', id, { taskId: id, task }).catch(() => {});
		webhookManager.triggerGlobalEvent('tasklist.added', { taskId: id, task }).catch(() => {});

		return Promise.resolve(id);
	}

	/**
	 * 新增任务时调用 FFmpeg 获取输入文件信息、文件时间（仅本地模式在此处读取时间，远程模式在 mergeUploaded 接收时间）
	 */
	private getFileMetadata(id: number, task: ServiceTask): Promise<any>[] {
		// FFmpeg 读取媒体信息
		log.info(`[任务 ${id}] 读取输入媒体信息。`);
		const filePromises = (task.after.input.files || []).map((file, inputIndex) => {
			const filePath = file.filePath;
			if (!filePath) return Promise.resolve(0);
			const realFilePath = task.remoteTask ? `${os.tmpdir()}/FFBoxUploadCache/${filePath}` : filePath;
			const promise1 = new Promise((resolve) => {
				const ffmpeg = new FFmpeg(this.ffmpegPath, 2, ['-hide_banner', '-i', realFilePath, '-f', 'null']);
				ffmpeg.on('data', ({ content }) => {
					this.setCmdText(id, content);
				});
				ffmpeg.on('metadata', ({ content }) => {
					task.before[inputIndex] = { ...task.before[inputIndex], ...content[0] };	// 目前的逻辑是即使是多输入也是逐个输入跑 metadata
					resolve(0);
				});
			})
			const promise2 = new Promise(async (resolve) => {
				if (!task.remoteTask) {
					try {
						await fsPromise.access(realFilePath, fs.constants.R_OK);
						const { atime, birthtime, mtime } = fs.statSync(realFilePath);
						task.before[inputIndex] = {
							...task.before[inputIndex],
							accessTime: atime.getTime(),
							createTime: birthtime.getTime(),
							modifyTime: mtime.getTime(),
						};
					} catch {}
					resolve(0);
				}
				resolve(0);
	
			});
			return new Promise((resolve) => {
				Promise.allSettled([promise1, promise2]).then(() => resolve(0));
			})
		});

		Promise.allSettled(filePromises).then(() => this.emitTaskUpdate(id, task));
		return filePromises;
	}

	/**
	 * 对于远程文件，上传完成后调用此函数合并文件
	 * 前端无论检查到已缓存还是未缓存都使用相同的参数调用。前端和后端各自判断文件是否已上传过。若使用过，前端不再上传，后端不再进行分片读取合并
	 * @param fileBaseName 文件名参数不包含 hash，仅用于作为 input.files[].filePath 最终文件名的一部分供用户识别。相同 hash 但文件名不同的话，服务器会保留多份
	 * @param inputName 在新建任务上传文件之前，或添加输入文件上传之前，hash 尚未得知，因此前端应发起修改输入参数的调用，生成这个上传文件的一个临时占位符。上传完毕后，往 inputName 传入生成的占位符，以便后端将其替换为真实文件名
	 * @emits taskUpdate
	 */
	public async mergeUploaded(id: number, hashs: string[], fileBaseName: string, inputName: string, fileTime?: { accessTime: number, createTime: number, modifyTime: number }): Promise<void> {
		const task = this.taskList.getById(id);
		if (!task) {
			// 上传完成之前删除了任务
			return;
		}
		const uploadDir = os.tmpdir() + '/FFBoxUploadCache'; // 文件上传目录
		const concatedHash = CryptoJS.enc.Utf8.parse(hashs.join(''));
		const fileHash = CryptoJS.SHA1(concatedHash).toString();
		const destName = `${fileBaseName}⬝${fileHash}`;
		const destPath = `${uploadDir}/${destName}`;
		let fileExists = false;
		try {
			await fs.accessSync(destPath, fs.constants.R_OK);	
			fileExists = true;
		} catch (error) {}
		if (!fileExists) {
			// 将分片合并为一个文件（无论分片数量均会执行此逻辑，因此即使 1 个分片，最终文件名也是按分片 hash 的 hash 命名）
			fs.writeFile(destPath, '', (err) => {
				if (err) {
					this.setNotification(id, task.taskName + '：合并文件写入失败', NotificationLevel.error);
					return;
				}
				for (const hash of hashs) {
					const source = uploadDir + '/' + hash;
					fs.appendFileSync(destPath, fs.readFileSync(source) as any);
					fs.rmSync(source);
				}
			});
		}
		// 将 inputName 占位符改成 destName 真实文件名
		const inputIndex = task.after.input.files.findIndex((file) => file.filePath === inputName);
		if (inputIndex >= 0) {
			task.after.input.files[inputIndex].filePath = destName;	// 远程任务隐藏目录结构，运行时才 override 输入参数
			// 记录由前端传过来的文件时间（远程文件时间不能由后端读取，而是由前端传入）
			if (fileTime) {
				task.before[inputIndex] = {
					accessTime: fileTime.accessTime,
					createTime: fileTime.createTime,
					modifyTime: fileTime.modifyTime,
				} as any;	// 看看这样会不会出 bug
			}
		}
		task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles, taskId: id, taskIndex: this.taskList.getIndexById(id) });
		this.setNotification(id, `任务「${task.taskName}」输入文件「${fileBaseName}」上传完成`, NotificationLevel.info);
		this.emitTaskUpdate(id, task);
	}

	/**
	 * 切换任务状态的初始化或待命状态
	 */
	public async setUploadStatus(id: number, isUploading: boolean): Promise<void> {
		const task = this.taskList.getById(id)!;
		if (isUploading && task.status === TaskStatus.idle) {
			task.status = TaskStatus.initializing;
			this.emitTaskUpdate(id, task);
		} else if (!isUploading && task.status === TaskStatus.initializing) {
			task.status = TaskStatus.idle;
			this.emitTaskUpdate(id, task);
			setTimeout(() => {
				this.getFileMetadata(id, task);
			}, 150);	// 正常顺序是 mergeUploaded -> setUploadStatus，但函数并不等待而是接连调用，再考虑网络因素，稍微等待再 getFileMetadata 可避免输入文件名还没改过来就进行信息读取
		}
	}

	/**
	 * 获取、清除指定目录的缓存大小和文件数量（不递归）
	 */
	public async getCacheInfo(needDelete: boolean) {
		const uploadDir = path.join(os.tmpdir(), 'FFBoxUploadCache');
		const downloadDir = path.join(os.tmpdir(), 'FFBoxDownloadCache');
		let uploadSize = 0, uploadCount = 0;
		let downloadSize = 0, downloadCount = 0;
		try {
			const uploadFiles = await fs.promises.readdir(uploadDir);
			for (const file of uploadFiles) {
				const filePath = path.join(uploadDir, file);
				const stat = await fs.promises.stat(filePath);
				if (stat.isFile()) {
					uploadSize += stat.size;
					uploadCount++;
					if (needDelete) await fs.promises.unlink(filePath);
				}
			}
		} catch (err) {
			log.error(err);	// ENOENT 不存在
		}
		try {
			const downloadFiles = await fs.promises.readdir(downloadDir);
			for (const file of downloadFiles) {
				const filePath = path.join(downloadDir, file);
				const stat = await fs.promises.stat(filePath);
				if (stat.isFile()) {
					downloadSize += stat.size;
					downloadCount++;
					if (needDelete) await fs.promises.unlink(filePath);
				}
			}
		} catch (err) {
			log.error(err);
		}
		return { uploadCount, uploadSize, downloadCount, downloadSize };
	}

	/**
	 * 【initializing / idle / idle_queued / finished / error】 => 【deleted】
	 * @param id 任务 id
	 * @emits tasklistUpdate
	 */
	public async taskDelete(id: number): Promise<void> {
		const task = this.taskList.getById(id);
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
		this.taskList.remove(id);

		// 清理帧扫描状态（同时停止正在进行的扫描）
		for (const [key, scan] of this.frameScanStatus) {
			if (key.startsWith(`${id}_`)) {
				if (scan.status === 'scanning') {
					scan.status = 'stopped';
					scan.process?.kill();
				}
				this.frameScanStatus.delete(key);
			}
		}
		// 清理缩略图缓存
		for (const [key, cache] of this.thumbnailCache) {
			if (key.startsWith(`${id}_`)) {
				if (cache.status === 'generating') {
					cache.status = 'stopped';
					cache.process?.kill();
				}
				this.thumbnailCache.delete(key);
			}
		}

		this.emit('tasklistUpdate', { added: [], removed: [{ taskId: id }], totalCount: this.taskList.count() });
		// TODO 如果任务输出路径中用到了 taskIndex，后面的序号都会变
		webhookManager.triggerTaskEvent('task.deleted', id, { taskId: id });
		webhookManager.triggerGlobalEvent('tasklist.removed', { taskId: id });
	}

	/**
	 * 启动单个任务
	 * 【idle / idle_queued / error】 => 【running】 => 【finished / error】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskStart(id: number): Promise<void> {
		const task = this.taskList.getById(id);
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
		// const filePath = task.after.input.files[0].filePath!; // 需要上传完成，状态为 TASK_STOPPED 时才能开始任务，因此 filePath 非空
		let newFFmpeg: FFmpeg;
		const taskIndex = this.taskList.getIndexById(id);
		if (task.remoteTask) {
			newFFmpeg = new FFmpeg(
				this.ffmpegPath,
				0,
				getFFmpegParaArray({ outputParams: task.after, inputDir: `${os.tmpdir()}/FFBoxUploadCache`, overrideFilePaths: task.outputFiles.map((fileBaseName) => `${os.tmpdir()}/FFBoxDownloadCache/${fileBaseName}`), taskId: id, taskIndex })
			);
		} else {
			task.outputFiles = genTaskOutputFiles(task.after, undefined, { taskId: id, taskIndex });	// 本地任务的 outputFiles 在任务开始时才生成，而远程任务则是在添加和修改参数时就刷新
			newFFmpeg = new FFmpeg(this.ffmpegPath, 0, getFFmpegParaArray({ outputParams: task.after, taskId: id, taskIndex }));
		}
		newFFmpeg.on('closed', async (errorCode, runningResult) => {
			if (errorCode) {
				const errorMessages = newFFmpeg.messages.filter((message) => message.type === 'error').map((message) =>
					`\n${message.sender ? `【${message.sender}】` : ''}${message.translatedMessage ?? message.message}`
				);
				if (runningResult === 'failed') {
					log.error(`[任务 ${id}] 出错：${task.taskName}。`);
					this.setNotification(
						id,
						'任务「' + task.taskName + '」转码失败。' + errorMessages,
						NotificationLevel.error,
					);
				} else if (task.status == TaskStatus.stopping) {
					this.setNotification(id, '任务「' + task.taskName + '」已强制结束。', NotificationLevel.warning);
				} else {
					log.error(`[任务 ${id}] 异常终止：${task.taskName}。`);
					this.setNotification(id, '任务「' + task.taskName + '」异常终止。' + errorMessages, NotificationLevel.error);
				}
				task.status = TaskStatus.error;

				webhookManager.triggerTaskEvent('task.error', id, { taskId: id, task: task as any, error: errorMessages.join('\n') });
			} else {
				if (task.status !== TaskStatus.stopping) {
					log.info(`[任务 ${id}] 完成：${task.taskName}。`);
					const hasTimeError: string[] = [];
					// 对每个输出文件进行时间修改。但暂不支持多输入，会按第一个输入进行修改
					for (let i = 0; i < (task.remoteTask ? 0 : task.after.outputs.length); i++) {
						const output = task.after.outputs[i];
						const mux = output.mux;
						const outputFilePath = task.outputFiles[i];
						if (mux.keepFileTime) {
							try {
								// 如果输入文件不可读取，或者 utimes 失败，或者 FFBox 无法正确计算文件时间，都会产生 hasTimeError
								const { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, i);
								if (ok) {
									log.info(`[任务 ${id}] 将按照首个输入文件的时间修改任务时间。新创建时间 ${new Date(createTime || 0).toISOString()}；新修改时间 ${new Date(modifyTime || 0).toISOString()}；新访问时间 ${new Date(accessTime || 0).toISOString()}。`);
									await utimes(outputFilePath, { btime: createTime, mtime: modifyTime, atime: accessTime });
								} else {
									hasTimeError.push(i + 1 + '');
								}
							} catch (error) {
								hasTimeError.push(i + 1 + '');
							}
						}
					}
					task.status = TaskStatus.finished;
					task.progressLog.elapsed = new Date().getTime() / 1000 - task.progressLog.lastStarted;
					if (hasTimeError.length) {
						this.setNotification(id, `任务「${task.taskName}」已转码完成，但修改第 ${hasTimeError.join(' ')} 个文件时间失败。`, NotificationLevel.warning);
					} else {
						this.setNotification(id, `任务「${task.taskName}」已转码完成`, NotificationLevel.ok);
					}

					webhookManager.triggerTaskEvent('task.completed', id, { taskId: id, task: task as any });

					if (this.deleteFinishedTasks) {
						setTimeout(() => {
							this.taskDelete(id);
						}, 0);
					}
				} else {
					this.setNotification(id, '任务「' + task.taskName + '」已正常中止。', NotificationLevel.warning);
				}
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
			this.trailLimit_checkIsMediaWorkingTimeExceeded(id, task);
			this.emit('progressUpdate', {
				taskId: id,
				time,
				status,
			});
			this.emitStatusUpdate();
			webhookManager.triggerTaskEvent('task.progress', id, { taskId: id, progress: status });
		});
		newFFmpeg.on('data', ({ content }) => {
			this.setCmdText(id, content);
		});
		// newFFmpeg.on('error', ({ error }) => {
		// 	task.errorInfo.push(error.description);
		// });
		newFFmpeg.on('warning', (warning) => {
			this.setNotification(id, task.taskName + '：' + warning.content, NotificationLevel.warning);
		});
		for (const parameter of ['time', 'frame', 'size']) {
			const _parameter = parameter as 'time' | 'frame' | 'size';
			task.progressLog[_parameter].push([new Date().getTime() / 1000 - task.progressLog.lastStarted, 0]);
		}
		task.ffmpeg = newFFmpeg;
		this.emitTaskUpdate(id, task);

		webhookManager.triggerTaskEvent('task.started', id, { taskId: id, task });

		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emitStatusUpdate('start');
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
		this.storeUnfinishedTask();
	}

	/**
	 * 将单个任务进入排队状态（不会启动调度系统改变当前的执行/暂停状态）
	 * 【idle / paused】 => 【idle_queued / paused_queued】 => 【running】
	 * @param id 
	 */
	public async taskReady(id: number): Promise<void> {
		const task = this.taskList.getById(id);
		if (!task) {
			log.error(`[任务 ${id}] 准备启动：任务不存在！`);
			return;
		}
		if (!([TaskStatus.idle, TaskStatus.paused].includes(task.status))) {
			log.error(`[任务 ${id}] 准备启动：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 准备启动。`);
		}
		if (task.status === TaskStatus.idle) {
			task.status = TaskStatus.idle_queued;
		} else if (task.status === TaskStatus.paused) {
			task.status = TaskStatus.paused_queued;
		}
		this.emitTaskUpdate(id, task);
	}

	/**
	 * 暂停单个任务
	 * 【running / paused_queued】 => 【paused】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskPause(id: number): Promise<void> {
		const task = this.taskList.getById(id);
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

		webhookManager.triggerTaskEvent('task.paused', id, { taskId: id, task: task as any });

		this.queueAssign();
	}

	/**
	 * 继续执行单个任务
	 * 【paused / paused_queued】 => 【running】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskResume(id: number): Promise<void> {
		const task = this.taskList.getById(id);
		if (!task) {
			log.error(`[任务 ${id}] 继续：任务不存在！`);
			return;
		}
		if (!([TaskStatus.paused, TaskStatus.paused_queued].includes(task.status))) {
			log.error(`[任务 ${id}] 继续：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 继续。`);
		}
		if (this.trailLimit_checkIsMediaWorkingTimeExceeded(id, task)) {
			task.status = TaskStatus.paused;
			this.emitTaskUpdate(id, task);
			return;
		}

		task.status = TaskStatus.running;
		const nowRealTime = new Date().getTime() / 1000;
		task.progressLog.lastStarted = nowRealTime;
		task.ffmpeg!.resume();
		this.emitTaskUpdate(id, task);

		webhookManager.triggerTaskEvent('task.resumed', id, { taskId: id, task: task as any });

		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emitStatusUpdate('start');
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
	}

	/**
	 * 重置任务（收尾/强行，根据状态决定）
	 * 【paused / paused_queued / stopping / finished / error】 => 【idle】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskReset(id: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const task = this.taskList.getById(id);
			if (!task) {
				log.error(`[任务 ${id}] 重置：任务不存在！`);
				reject('任务不存在');
				return;
			}
			if ([TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running].includes(task.status)) {
				// 暂停状态下重置或运行状态下达到限制停止工作
				log.info(`[任务 ${id}] 重置——软停止。`);
				task.status = TaskStatus.stopping;
				task.ffmpeg!.exit(() => {
					task.status = TaskStatus.idle;
					task.ffmpeg = null;
					this.emitTaskUpdate(id, task);
					resolve();
					this.queueAssign();
					this.storeUnfinishedTask();
				});
			} else if (task.status === TaskStatus.stopping) {
				// 正在停止状态下强制重置
				log.info(`[任务 ${id}] 重置——硬停止。`);
				task.status = TaskStatus.stopping;
				task.ffmpeg!.forceKill(() => {
					task.status = TaskStatus.idle;
					task.ffmpeg = null;
					this.emitTaskUpdate(id, task);
					resolve();
					this.queueAssign();
					this.storeUnfinishedTask();
				});
			} else if ([TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
				// 完成状态下或队列中仍未开始状态下重置
				log.info(`[任务 ${id}] 重置到初始状态。`);
				task.status = TaskStatus.idle;
				resolve();
				this.queueAssign();
			} else {
				log.error(`[任务 ${id}] 重置：任务当前状态为 ${task.status}，操作不合法！`);
				reject('操作不合法');
			}
			this.emitTaskUpdate(id, task);
		});
	}

	private storeUnfinishedTask(): void {
		if (!this.preserveUnfinishedTasks) {
			return;
		}
		const tasks: { taskName: string; after: OutputParams; }[] = [];
		const snapshot = this.taskList.getSnapshot();
		for (const task of snapshot) {
			// 未开始或者排队的任务不需要存储
			if ([TaskStatus.initializing, TaskStatus.idle, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
				break;
			}
			tasks.push({
				taskName: task.taskName,
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
	private queueAssign(dontStop?: boolean): number {
		if (this.workingStatus === WorkingStatus.running) {
			const snapshot = this.taskList.getSnapshot();
			let runningCount = snapshot.reduce((prev, curr) => curr.status === TaskStatus.running ? prev + 1 : prev, 0);
			const maxThreads = Math.min(this.maxThreads, this.functionLevel < 20 ? 4 : this.functionLevel < 35 ? 6 : this.functionLevel < 50 ? 9 : this.functionLevel < 70 ? 99 : 256);
			for (const task of snapshot) {
				if (runningCount >= maxThreads) {
					break;
				}
				if (task.status === TaskStatus.idle_queued) {
					this.taskStart(task.id);
					runningCount++;
				}
				if (task.status === TaskStatus.paused_queued) {
					this.taskResume(task.id);
					// @ts-ignore
					if (task.status === TaskStatus.running) runningCount++;
				}
			}
			if (!dontStop && runningCount === 0) {
				this.workingStatus = WorkingStatus.idle;
				this.emitStatusUpdate('stop');
				webhookManager.triggerGlobalEvent('queue.paused', { timestamp: Date.now() });
			}
			return runningCount;
		}
		return 0;
	}

	/**
	 * 开始处理队列
	 * 首先通过 queueAssign 将【空闲_已排队】【已暂停_已排队】的任务启动，然后将所有【空闲】【已暂停】的任务进入【空闲_已排队】【已暂停_已排队】状态，再次调用 queueAssign 进行任务安排
	 * 也就是优先启动已排队的任务，再将空闲任务加入排队
	 */
	public async queueStart(): Promise<void> {
		this.workingStatus = WorkingStatus.running;
		this.queueAssign(true);
		const snapshot = this.taskList.getSnapshot();
		for (const task of snapshot) {
			if (task.status === TaskStatus.idle) {
				task.status = TaskStatus.idle_queued;
			} else if (task.status === TaskStatus.paused) {
				task.status = TaskStatus.paused_queued;
			}
		}
		const runningCount = this.queueAssign();
		if (runningCount) {
			this.emitStatusUpdate('start');
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
		const snapshot2 = this.taskList.getSnapshot();
		for (const task of snapshot2) {
			if ([TaskStatus.idle_queued, TaskStatus.paused_queued].includes(task.status)) {
				this.emitTaskUpdate(task.id, task);
			}
		}
	}

	/**
	 * 暂停处理队列，将所有【正在运行】的任务暂停、【空闲_已排队】的任务重置
	 */
	public async queuePause(): Promise<void> {
		if (this.workingStatus === WorkingStatus.running) {
			this.emitStatusUpdate('pause');
			webhookManager.triggerGlobalEvent('queue.paused', { timestamp: Date.now() });
		}
		this.workingStatus = WorkingStatus.idle;
		const snapshot = this.taskList.getSnapshot();
		for (const task of snapshot) {
			if ([TaskStatus.running, TaskStatus.paused_queued].includes(task.status)) {
				this.taskPause(task.id);
			} else if (task.status === TaskStatus.idle_queued) {
				this.taskReset(task.id);
			}
		}
	}

	/**
	 * 删除相应通知
	 * @emits taskUpdate
	 */
	public async deleteNotification(notificationId: number): Promise<void> {
		delete this.notifications[notificationId];
		this.emit('notificationUpdate', { notificationId });
		// 此事件不需要触发 Webhook
	}

	/**
	 * 批量设置任务的输出参数，将算出的 paraArray 通过 taskUpdate 传回（这样对性能不太好）
	 * @param ids 任务 ID 列表
	 * @param params 统一的输出参数配置
	 * @param fullyReplace 是否全量替换（true 为单个任务修改，false 为批量修改）
	 * @emits taskUpdate
	 */
	public async setParameters(ids: number[], params: OutputParams, fullyReplace: boolean): Promise<void> {
		for (const id of ids) {
			const task = this.taskList.getById(id)!;
			task.after = replaceOutputParams(params, task.after, fullyReplace);
			const taskIndex = this.taskList.getIndexById(id);
			if (task.remoteTask) {
				task.outputFiles = genTaskOutputFiles(task.after, ``, { taskId: id, taskIndex });
				task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles, taskId: id, taskIndex });
			} else {
				task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, taskId: id, taskIndex });
			}
			this.emitTaskUpdate(id, task);
		}
	}

	private cmdUpdateThrottleTimers: Map<number, { start: number, timer: number }> = new Map();
	/**
	 * 收到 cmd 内容通用回调
	 * @param id 任务 id
	 * @param content 文本
	 * @param append 附加到末尾，默认 true
	 */
	private setCmdText(id: number, content: string, append = true): void {
		const task = this.taskList.getById(id)!;
		if (!append) {
			task.cmdData = content;
		} else {
			if (content.length) {
				// 若前面没结尾换行符，则先插入一个 \n，再插入内容
				if (task.cmdData.slice(-1) !== '\n' && task.cmdData.length) {
					content = '\n' + content;
				}
				task.cmdData += content;
			} else {
				// 空行
				content = '\n';
				task.cmdData += content;
			}
		}
		if (!append) {
			// 清空事件不走 throttle
			this.emit('cmdUpdate', { taskId: id, content, append });
			clearTimeout(this.cmdUpdateThrottleTimers.get(id)?.timer);
			this.cmdUpdateThrottleTimers.delete(id);
			return;
		}
		const throttleTimer = this.cmdUpdateThrottleTimers.get(id);
		// 第一次直接发送，记录发送后的起点，并添加计时器
		// 后续发送时，计时器未消失，则无需动作，等待计时器结束
		// 计时器结束时，如果有新消息，则发送从起点开始的消息，否则不动作
		if (!throttleTimer) {
			this.emit('cmdUpdate', { taskId: id, content, append });

			const start = task.cmdData.length;
			const timerFunc = () => {
				const newContent = task.cmdData.slice(start);
				if (newContent.length) {
					this.emit('cmdUpdate', {
						taskId: id,
						content: task.cmdData.slice(start),
						append,
					});
				}
				this.cmdUpdateThrottleTimers.delete(id);
			};
			this.cmdUpdateThrottleTimers.set(id, { start, timer: setTimeout(timerFunc, 120) as any })
		}
	}

	/**
	 * 任务通知，emit 事件并存储到任务中
	 * @param taskId
	 * @param content
	 * @param level
	 */
	public setNotification(taskId: number | undefined, content: string, level: NotificationLevel): void {
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
		webhookManager.triggerGlobalEvent('notification', { notificationId, notification });
		this.notifications[notificationId] = notification;
	}

	// #region 任务区段查询与批量复制

	/**
	 * 任务区段查询：返回 [offset, offset+size) 范围内的任务列表或 ID 列表
	 */
	public async getTaskList(offset: number, size: number): Promise<Task[]>;
	public async getTaskList(offset: number, size: number, idOnly: true): Promise<number[]>;
	public async getTaskList(offset: number, size: number, idOnly?: boolean): Promise<Task[] | number[]> {
		if (idOnly) {
			return this.taskList.getRangeIds(offset, size);
		}
		return this.taskList.getRange(offset, size);
	}

	/**
	 * 将指定全局偏移处的任务复制指定次数
	 */
	public async superDuplicate(index: number, count: number): Promise<void> {
		const task = this.taskList.getByOffset(index);
		if (!task) {
			log.error(`superDuplicate：偏移 ${index} 处无任务！`);
			return;
		}
		for (let i = 0; i < count; i++) {
			await this.taskAdd(task.taskName, task.after);
		}
	}

	// #endregion

	private activate(activationCode: string): boolean {
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

	private trailLimit_checkIsMediaWorkingTimeExceeded(id: number, task: ServiceTask): boolean {
		const progressLog = task.progressLog;
		if (this.functionLevel < 50) {
			if (progressLog.time[progressLog.time.length - 1][1] > 671) {
				this.trailLimit_stopTranscoding(id, 'media');
				return true;
			}
		}
		const maxWorkingDuration = this.functionLevel < 45 ? 671 : 40271;
		if (progressLog.elapsed + new Date().getTime() / 1000 - progressLog.lastStarted > maxWorkingDuration) {
			this.trailLimit_stopTranscoding(id, 'working');
			return true;
		}
		return false;
	}

	public async trailLimit_stopTranscoding(id: number, reason: 'media' | 'working', byFrontend = false): Promise<void> {
		const task = this.taskList.getById(id)!;
		if (task.status === TaskStatus.running) {
			this.setNotification(
				id,
				i11n.service.功能限制_暂停转码(task.taskName, byFrontend, reason),
				NotificationLevel.warning,
			);
			this.taskPause(id);
		} else if ([TaskStatus.paused, TaskStatus.paused_queued].includes(task.status)) {
			this.setNotification(
				id,
				i11n.service.功能限制_不能继续(task.taskName, byFrontend, reason, task.ffmpeg!.process!.pid!),
				NotificationLevel.warning,
			);
		}
	}

	/**
	 * 扫描指定视频流的帧信息
	 * @param id 任务 ID
	 * @param fileIndex 输入文件索引（对应 Task.before[fileIndex]）
	 * @param videoStreamIndex 视频流索引（第 n 个 type 为 video 的 stream）
	 * @param type 扫描类型：'fast' 快速扫描（ffprobe）、'full' 完整扫描（ffmpeg）、'stop' 停止扫描
	 */
	public async getMediaFrameInfo(id: number, fileIndex: number, videoStreamIndex: number, type: 'fast' | 'full' | 'stop' = 'fast'): Promise<Frame[]> {
		const task = this.taskList.getById(id);
		if (!task) {
			log.error(`[任务 ${id}] 获取帧信息：任务不存在！`);
			return [];
		}
		const inputInfo = task.before[fileIndex];
		if (!inputInfo) {
			log.error(`[任务 ${id}] 获取帧信息：输入文件索引 ${fileIndex} 不存在！`);
			return [];
		}
		const videoStreams = inputInfo.streams.filter(s => s.type === 'Video');
		const targetStream = videoStreams[videoStreamIndex];
		if (!targetStream) {
			log.error(`[任务 ${id}] 获取帧信息：视频流索引 ${videoStreamIndex} 不存在！`);
			return [];
		}
		const filePath = task.after.input.files?.[fileIndex]?.filePath;
		if (!filePath) {
			log.error(`[任务 ${id}] 获取帧信息：输入文件路径为空！`);
			return [];
		}

		// 停止扫描
		if (type === 'stop') {
			for (const [key, scan] of this.frameScanStatus) {
				if (key.startsWith(`${id}_`) && scan.status === 'scanning') {
					scan.status = 'stopped';
					scan.process?.kill();
					log.info(`[任务 ${id}] 停止帧扫描：${key}`);
				}
			}
			return [];
		}

		// 检查扫描状态
		const scanKey = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`;
		const existingScan = this.frameScanStatus.get(scanKey);
		if (existingScan) {
			if (existingScan.status === 'scanning' && existingScan.promise) {
				return existingScan.promise;	// 正在扫描，等待完成
			}
			// if (existingScan.status === 'stopped') {
			// 	return [];	// 正在停止，不启动新扫描
			// }
			if (existingScan.status === 'completed') {
				if (type === 'fast' || existingScan.type === 'full') {
					return existingScan.frames || [];	// 快速扫描已完成 或 已完成完整扫描 → 返回缓存
				}
				// 请求 full 但只有 fast → 继续执行完整扫描覆盖
			}
		}

		const realFilePath = task.remoteTask ? `${os.tmpdir()}/FFBoxUploadCache/${filePath}` : filePath;
		const streamIndex = inputInfo.streams.indexOf(targetStream);	// 该 stream 在原始 streams 数组中的索引（用于 -map）

		if (type === 'fast') {
			// 快速扫描
			log.info(`[任务 ${id}] 开始快速帧扫描：${realFilePath}`);

			if (!this.ffprobePath) {
				log.error(`[任务 ${id}] 快速帧扫描失败：ffprobe 路径未配置。`);
				this.setNotification(id, `任务「${task.taskName}」快速帧扫描失败：ffprobe 未找到`, NotificationLevel.error);
				return [];
			}

			const process = spawn(this.ffprobePath, [
				'-v', 'error',
				'-show_packets',
				'-select_streams', `${streamIndex}`,
				'-show_entries', 'packet=pts_time,flags',
				'-of', 'json',
				realFilePath,
			]);

			let stdout = '';
			process.stdout!.on('data', (data) => { stdout += data.toString(); });
			process.stderr!.on('data', (data) => { log.dev(`[任务 ${id}] ffprobe stderr:`, data.toString()); });

			const scanPromise = new Promise<Frame[]>((resolve, reject) => {
				process.on('close', (code) => {
					if (this.frameScanStatus.get(scanKey)?.status === 'stopped') {
						this.frameScanStatus.delete(scanKey);
						log.info(`[任务 ${id}] 快速帧扫描已停止。`);
						resolve([]);
						return;
					}
					if (code !== 0) {
						this.frameScanStatus.delete(scanKey);
						log.error(`[任务 ${id}] 快速帧扫描失败，退出码：${code}`);
						this.setNotification(id, `任务「${task.taskName}」快速帧扫描失败`, NotificationLevel.error);
						reject(code);
						return;
					}
					try {
						const output = JSON.parse(stdout);
						const packets = output.packets as { flags: string; pts_time: string }[] | undefined;
						if (!Array.isArray(packets)) {
							log.error(`[任务 ${id}] ffprobe 输出格式异常：packets 不是数组`);
							this.frameScanStatus.delete(scanKey);
							reject(new Error('ffprobe output format error'));
							return;
						}
						const frames = packets
							.map((p, index) => ({
								n: index,
								pts_time: parseFloat(p.pts_time),
								type: (p.flags?.[0] === 'K' ? 'I' : 'P') as 'I' | 'P',
							}))
							.filter((f) => !Number.isNaN(f.pts_time));
						log.info(`[任务 ${id}] 快速帧扫描完成，共 ${frames.length} 帧。`);
						this.frameScanStatus.set(scanKey, { status: 'completed', type: 'fast', frames });
						resolve(frames);
					} catch (e) {
						this.frameScanStatus.delete(scanKey);
						log.error(`[任务 ${id}] ffprobe JSON 解析失败: ${e}`);
						reject(e);
					}
				});
			});

			this.frameScanStatus.set(scanKey, { status: 'scanning', type: 'fast', promise: scanPromise, process });
			return scanPromise;
		} else {
			// 完整扫描
			log.info(`[任务 ${id}] 开始完整帧扫描：${realFilePath}`);

			// 构造 FFmpeg 命令
			const ffmpeg = new FFmpeg(this.ffmpegPath, 6, [
				'-hide_banner',
				'-nostats',
				'-hwaccel', 'auto',
				'-i', realFilePath,
				'-map', `0:${streamIndex}`,
				'-vf', 'scale=h=160:w=-1:flags=neighbor,showinfo',
				'-f', 'null',
				'-'
			]);

			ffmpeg.on('frameInfo', ({ frames }) => {
				const existing = this.frameScanStatus.get(scanKey);
				if (existing) {
					existing.frames = frames;
				}
				log.info(`[任务 ${id}] 完整帧扫描完成，共 ${frames.length} 帧。`);
			});

			// 创建扫描 Promise 并记录状态
			const scanPromise = new Promise<Frame[]>((resolve, reject) => {
				ffmpeg.on('closed', (errorCode, runningResult) => {
					if (this.frameScanStatus.get(scanKey)?.status === 'stopped') {
						this.frameScanStatus.delete(scanKey);
						log.info(`[任务 ${id}] 完整帧扫描已停止。`);
						resolve([]);
						return;
					}
					if (errorCode || runningResult === 'failed') {
						this.frameScanStatus.delete(scanKey); // 失败时删除状态，允许重试
						log.error(`[任务 ${id}] 完整帧扫描失败。`);
						this.setNotification(id, `任务「${task.taskName}」帧扫描失败`, NotificationLevel.error);
						reject(errorCode);
					} else {
						const completedScan = this.frameScanStatus.get(scanKey);
						if (completedScan) {
							completedScan.status = 'completed';
							completedScan.type = 'full';
						}
						resolve(completedScan?.frames || []);
					}
				});
			});

			this.frameScanStatus.set(scanKey, { status: 'scanning', type: 'full', promise: scanPromise });
			return scanPromise;
		}
	}

	/**
	 * 获取缩略图视频流（缓存版本）
	 * @param id 任务ID
	 * @param width 请求宽度（可选，默认 768，最大 768）
	 * @param height 请求高度（可选，默认 768，最大 768）
	 * @param density 密度模式 'H' 或 'M'（可选，默认 'M'）
	 * @returns 返回包含流和内容类型的对象
	 */
	public async getThumbnailStream(id: number, fileIndex: number, videoStreamIndex: number, width?: number, height?: number, density?: 'H' | 'M'): Promise<{ stream: import('stream').PassThrough; contentType: string }> {
		const task = this.taskList.getById(id);
		if (!task) {
			throw new Error(`Task ${id} not found`);
		}

		const filePath = task.after.input.files[fileIndex]?.filePath;
		if (!filePath) {
			throw new Error('No input file');
		}

		const realFilePath = task.remoteTask
			? `${os.tmpdir()}/FFBoxUploadCache/${filePath}`
			: filePath;

		// 参数处理（与 uiBridge.ts 保持一致）
		const MAX_DIM = 768;
		let thumbW = width || MAX_DIM;
		let thumbH = height || MAX_DIM;
		// 确保不超过最大限制
		if (thumbW > MAX_DIM || thumbH > MAX_DIM) {
			const scale = Math.min(MAX_DIM / thumbW, MAX_DIM / thumbH);
			thumbW = Math.round(thumbW * scale);
			thumbH = Math.round(thumbH * scale);
		}
		// 确保为偶数（libx264 要求）
		thumbW = thumbW % 2 === 0 ? thumbW : thumbW - 1;
		thumbH = thumbH % 2 === 0 ? thumbH : thumbH - 1;

		const thumbDensity = density || 'M';
		const duration = task.before?.[0]?.duration || 0;
		const interval = thumbDensity === 'H'
			? Math.max(duration * 0.001, 1)	// 最多生成 1000 个缩略图帧，最小帧间隔 1s
			: Math.max(duration * 0.002, 2);	// 最多生成 500 个缩略图帧，最小帧间隔 2s

		const cacheKey = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`;
		let matchedCache = this.thumbnailCache.get(cacheKey);

		// 检查参数是否匹配：请求参数 ≤ 缓存参数
		if (
			matchedCache &&
			thumbW <= matchedCache.params.width &&
			thumbH <= matchedCache.params.height &&
			(thumbDensity === 'M' || matchedCache.params.density === 'H')
		) {} else {
			matchedCache = undefined;
		}

		if (matchedCache) {
			if (matchedCache.status === 'completed' && matchedCache.data) {
				// 返回缓存数据
				const stream = new (require('stream').PassThrough)();
				stream.end(matchedCache.data);
				return {
					stream,
					contentType: matchedCache.contentType || 'video/mp4'
				};
			} else if (matchedCache.status === 'generating' && matchedCache.promise) {
				// 正在生成中，等待完成
				let data: Buffer<ArrayBufferLike>;
				const stream = new (require('stream').PassThrough)();
				try {
					data = await matchedCache.promise;
					stream.end(data);
				} catch (e) {}
				return {
					stream,
					contentType: matchedCache.contentType || 'video/mp4'
				};
			}
			// stopped 状态或其他情况，继续重新生成
		}

		// 开始新的生成
		const ffmpegArgs = [
			'-skip_frame', 'nokey',
			'-i', realFilePath,
			'-vf', `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${interval})',scale=${thumbW}:${thumbH}`,
			'-vsync', 'vfr',
			'-c:v', 'libx264',
			'-preset', 'ultrafast',
			'-crf', '24',
			'-g', '1',
			'-an',
			'-movflags', '+frag_keyframe+empty_moov+default_base_moof',
			'-f', 'mp4',
			'-',
		];
		log.dev(`[任务 ${id}] 缩略图流 ffmpeg 启动，分辨率 ${thumbW}×${thumbH}，最低帧间隔 ${interval}`, ffmpegArgs.join(' '));

		// 创建流收集器
		const PassThrough = require('stream').PassThrough;
		const passThrough = new PassThrough();
		const chunks: Buffer[] = [];

		passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));

		// 启动 FFmpeg 进程
		const ffmpegProc = spawn(this.ffmpegPath, ffmpegArgs);

		// 设置缓存项
		const cacheItem = {
			status: 'generating',
			data: null,
			params: {
				width: thumbW,
				height: thumbH,
				density: thumbDensity,
			},
			contentType: 'video/mp4'
		} as any;

		// 创建 Promise
		const generationPromise = new Promise<Buffer>((resolve, reject) => {
			ffmpegProc.stdout.pipe(passThrough);

			ffmpegProc.on('error', (err: Error) => {
				log.error(`[任务 ${id}] 缩略图流 ffmpeg 错误`, err);
				this.thumbnailCache.delete(cacheKey);
				resolve(null);
			});

			ffmpegProc.on('close', (code: number) => {
				if (code === 0) {
					// 生成成功，缓存数据
					const finalData = Buffer.concat(chunks);
					cacheItem.data = finalData;
					cacheItem.status = 'completed';
					log.info(`[任务 ${id}] 缩略图生成完成，大小 ${finalData.length} 字节`);
					resolve(finalData);
				} else {
					// 生成失败
					log.warn(`[任务 ${id}] 缩略图生成中断，退出码 ${code}`);
					this.thumbnailCache.delete(cacheKey);
					resolve(null);
				}
			});

			passThrough.on('close', () => {
				// 客户端断开连接
				if (ffmpegProc.exitCode === null) {
					log.info(`[任务 ${id}] 缩略图生成中断或结束`);
					// FFmpeg 仍在运行，杀死进程
					ffmpegProc.kill();
					cacheItem.status = 'stopped';
				}
			});
		});

		// 存储到缓存
		this.thumbnailCache.set(cacheKey, {
			...cacheItem,
			promise: generationPromise,
			process: ffmpegProc
		});

		// 返回流供客户端使用
		return {
			stream: passThrough,
			contentType: 'video/mp4'
		};
	}
}
