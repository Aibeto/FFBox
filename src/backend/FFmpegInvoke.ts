// const utils = require('../common/utils.js');
// import from 或者 require 然后 . 引用都行
// const selectString  = utils.selectString;
// const replaceString = utils.replaceString;
// const scanf = utils.scanf;
import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { spawnInvoker } from '@common/spawnInvoker';
import { selectString, replaceString, scanf, TypedEventEmitter } from '@common/utils';
import { log } from './utils';
import osBridge from './osBridge';

interface InputInfoString {
	format?: string;
	duration?: string;
	vcodec?: string;
	acodec?: string;
	vresolution?: string;
	vframerate?: string;
	vbitrate?: string;
	abitrate?: string;
	bitrate?: string;
}

interface FFmpegInvokerEvent {
	data: (arg: { content: string }) => void;
	status: (arg: { frame: number; fps: number; q: number; size: number; time: number; bitrate: number; speed: number }) => void;
	version: (arg: { content?: string }) => void;
	metadata: (arg: { content: InputInfoString }) => void;
	finished: () => void; 	// 正常完成任务退出时触发
	escaped: () => void; 	// 非正常退出时触发
	closed: () => void; 	// 任何情况进程结束都触发
	pending: (arg: { content: string }) => void;
	critical: (arg: { content: Set<string> }) => void;
	warning: (arg: { content: string }) => void;
}

export class FFmpeg extends (EventEmitter as new () => TypedEventEmitter<FFmpegInvokerEvent>) {
	private process: ChildProcess | null;
	private getSingleMsg: boolean; // 非转码任务，数据显示完即退出
	private status: -1 | 0 | 1; // -1：已结束或将要结束；0：暂停；1：正在运行
	private sm: number; // 状态机状态码，详见下方说明
	private requireStop: boolean; // 如果请求提前停止，那就不触发 finished 事件
	private errors: Set<string>; // 发生 critical 则不触发 finished 事件，因某些错误（如外存不足）会由多个部件同时报告，所以这里用 Set
	private input: InputInfoString;
	private stdoutBuffer: string;

	/**
	 * @param mode 0: 直接执行 ffmpeg　1: 检测 ffmpeg 版本　２：多媒体文件信息读取
	 */
	constructor(path = 'ffmpeg', mode: 0 | 1 | 2 = 0, params?: Array<string>) {
		super();
		log.info('启动 ffmpeg：', (params || []).join(', '));
		spawnInvoker(path, params, {
			detached: false,
			// shell: mode == 1 ? true : false,	// 使用命令行以获得“'ffmpeg' 不是内部或外部命令，也不是可运行的程序”这样的提示
			shell: false,
			// encoding: 'utf8',
		})
			.then((_process) => {
				this.process = _process;
				this.mountSpawnEvents();
			})
			.catch((reason) => {
				log.error(reason);
				this.emit('version', {});
			});
		this.process = null;

		this.getSingleMsg = mode ? true : false;
		this.status = 1;
		this.sm = 0;
		this.requireStop = false;
		this.errors = new Set();
		this.input = {
			format: undefined,
			duration: undefined,
			bitrate: undefined,
			vcodec: undefined,
			vbitrate: undefined,
			vresolution: undefined,
			vframerate: undefined,
			acodec: undefined,
			abitrate: undefined,
		};
		this.stdoutBuffer = '';
	}
	mountSpawnEvents(): void {
		this.process!.stdout!.on('data', (data) => {
			this.stdoutProcessing(data);
		});
		this.process!.stderr!.on('data', (data) => {
			this.stdoutProcessing(data);
		});
		this.process!.on('close', () => {
			setTimeout(() => {
				this.emit('closed');
				// 如果 status 为 -1，说明进程退出的部分操作已在其他地方进行过，此处不再次触发 escaped 事件
				if (this.status !== -1) {
					this.emit('escaped');
					this.status = -1;
				}
				this.status = -1;
			}, 100);
		});
	}
	stdoutProcessing(data: string): void {
		this.stdoutBuffer += data.toString();
		this.dataProcessing();
	}
	/**
	 * FFmpeg 传回的数据处理总成
	 */
	dataProcessing(): void {
		const newLinePos = this.stdoutBuffer.indexOf('\n') >= 0 ? this.stdoutBuffer.indexOf('\n') : this.stdoutBuffer.indexOf(`\r`);
		if (newLinePos < 0) {
			// 一行没接收完
			return;
		}
		const thisLine = this.stdoutBuffer.slice(0, newLinePos);
		this.stdoutBuffer = this.stdoutBuffer.slice(newLinePos + 1);

		// console.log(thisLine);
		this.emit('data', { content: thisLine });

		/**
		 * sm 说明：
		 * 0：复位状态		1：正在读取容器格式		2：正在读取视频流		3：正在读取音频流		4：正在读取流映射
		 */
		switch (this.sm) {
			case 0:
				if (thisLine.includes('frame=')) {
					// 🔵 status（有视频）
					// const l_status = scanf(thisLine, `frame=%d fps=%f q=%f (L)size=%dkB time=%d:%d:%d.%d bitrate=%dkbits/s speed=%dx`);
					const l_status = thisLine.match(/(\d+([.|:]?\d*)*)|(N\/A)/g)!;
					const time = l_status[4].match(/\d+/g)!;	// 有小概率为 NaN
					this.emit('status', {
						frame: parseInt(l_status[0]),
						fps: parseInt(l_status[1]),
						q: parseFloat(l_status[2]),
						size: parseInt(l_status[3]),
						time: time ? parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]) + parseInt(time[3]) * 0.01 : NaN,
						bitrate: parseFloat(l_status[5]),
						speed: parseFloat(l_status[6]),
					});
				} else if (thisLine.includes('size=')) {
					// 🔵 status（无视频）
					// const l_status = scanf(thisLine, `size=%dkB time=%d:%d:%d.%d bitrate=%dkbits/s speed=%dx`);
					const l_status = thisLine.match(/(\d+([.|:]?\d*)*)|(N\/A)/g)!;
					const time = l_status[1].match(/\d+/g)!;	// 有小概率为 NaN
					this.emit('status', {
						frame: NaN,
						fps: NaN,
						q: NaN,
						size: parseInt(l_status[0]),
						time: time ? parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]) + parseInt(time[3]) * 0.01 : NaN,
						bitrate: parseFloat(l_status[2]),
						speed: parseFloat(l_status[3]),
					});
				} else if (thisLine.includes('Input #')) {
					// ⚪ metadata：获得媒体信息
					const format = selectString(thisLine, ', ', ', from', 0).text;
					switch (format) {
						case 'avi':
							this.input.format = 'AVI';
							break;
						case 'flv':
							this.input.format = 'FLV';
							break;
						case 'mov,mp4,m4a,3gp,3g2,mj2':
							this.input.format = 'MP4';
							break;
						case 'asf':
							this.input.format = 'WMV';
							break;
						case 'matroska,webm':
							// 有可能是 MKV 或 webm，具体判断放在下面
							this.input.format = 'MKV';
							break;
						default:
							this.input.format = format;
							break;
					}
					this.sm = 1; // 转入其他状态进行处理
				} else if (thisLine.includes('video:')) {
					setTimeout(() => {
						// 避免存储空间已满时也会产生 finished								// 🔵 finish
						if (!this.requireStop && this.errors.size == 0) {
							this.emit('finished');
							this.status = -1;
						}
					}, 100);
				} else if (thisLine.includes('Conversion failed')) {
					// 🔵 critical：错误终止并结束
					this.emit('critical', { content: this.errors });
					this.status = -1;
				} else if (thisLine.includes(`'ffmpeg'`)) {
					// 🔵 version（Windows）：'ffmpeg' 不是内部或外部命令，也不是可运行的程序
					this.emit('version', {});
					this.status = -1;
				} else if (thisLine.includes('not found')) {
					// 🔵 version（Linux）：/bin/sh: 1: ffmpeg: not found
					this.emit('version', {});
					this.status = -1;
				} else if (thisLine.includes('No such file or directory')) {
					// 🔵 critical：No such file or directory
					this.errors.add('不是一个文件。');
					this.emit('critical', { content: this.errors });
					this.status = -1;
				} else if (thisLine.includes('[') && thisLine.includes('@')) {
					// ⚪ demuxer/decoder/encoder/muxer 等发来的信息
					// const sender = scanf(thisLine, '[%s @ %s]', ']')[1];
					const msg = thisLine.slice(thisLine.indexOf(']') + 2);
					// 已识别的消息判断为 critical 放入 critical 列表，其余的 emit error 信息
					if (false) {
					} else if (msg.includes('OpenEncodeSessionEx failed: out of memory (10)')) {
						this.errors.add('内存或显存不足。');
					} else if (msg.includes('No NVENC capable devices found')) {
						this.errors.add('没有可用的 NVIDIA 硬件编码设备。');
					} else if (msg.includes('Failed setup for format cuda: hwaccel initialisation returned error')) {
						this.emit('warning', { content: '硬件解码器发生错误，将使用软件解码。' });
					} else if (msg.includes('DLL amfrt64.dll failed to open')) {
						this.errors.add('AMD 编码器初始化失败。');
					} else if (msg.includes('CreateComponent(AMFVideoEncoderVCE_AVC) failed')) {
						this.errors.add('AMD 编码器初始化失败。');
					} else if (msg.includes('codec not currently supported in container')) {
						// 例：[mp4 @ 000001d2146edf00] Could not find tag for codec ansi in stream #0, codec not currently supported in container
						this.errors.add(`容器不支持编码“${selectString(msg, 'for codec ', ' in stream', 0).text}”，请尝试更换容器（格式）或编码。`);
					} else if (msg.includes('unknown codec')) {
						// 例：[mov,mp4,m4a,3gp,3g2,mj2 @ 000002613bc8c540] Could not find codec parameters for stream 0 (Video: none (HEVC / 0x43564548), none, 2560x1440, 24211 kb/s): unknown codec
						this.errors.add('文件中的某些编码无法识别。');
					} else if (msg.includes('Starting second pass: moving the moov atom to the beginning of the file')) {
						this.emit('pending', { content: '正在移动文件信息到文件头' });
					}
				} else if (thisLine.includes('ffmpeg version')) {
					// 🔵 version：找到 ffmpeg，并读出版本，需要放在读取文件信息后，也要放在“Conversion”后。注意有时候 version 后会附带网址，所以以空格作为结束
					if (this.getSingleMsg) {
						this.emit('version', { content: selectString(thisLine, 'version ', ' ', 0).text });
						this.status = -1;
					}
				} else if (thisLine.includes('Error while opening encoder for output stream')) {
					// ⚪ error：例：Error initializing output stream 0:0 -- Error while opening encoder for output stream #0:0 - maybe incorrect parameters such as bit_rate, rate, width or height
					this.errors.add('输出参数设置有误。');
				} else if (thisLine.includes('Invalid data found when processing input')) {
					// 🔵 critical：Invalid data found when processing input
					this.errors.add('输入文件无法识别。');
					this.emit('critical', { content: this.errors });
					this.status = -1;
				} else if (thisLine.includes('Permission denied')) {
					// 🔵 critical：Permission denied
					this.errors.add('权限不足，无法操作。');
					this.emit('critical', { content: this.errors });
					this.status = -1;
				} else if (thisLine.includes('No space left on device')) {
					// 🔵 error：多种部件发来的 No space left on device
					this.errors.add('外存不足。');
				}
				break;
			case 1:
				if (false) {
				} else if (thisLine.includes('Stream mapping:')) {
					this.sm = 4;
				} else if (thisLine.includes('At least one output file must be specified')) {
					this.stdoutBuffer += '\n'; // 为了进行下一次状态机，需要加一行
					this.sm = 4;
				} else if (thisLine.includes('Duration:')) {
					const f = scanf(thisLine, 'Duration: %d:%d:%d, start: %d, bitrate: %d kb/s');
					this.input.duration = f[0] * 3600 + f[1] * 60 + f[2] + '';
					this.input.bitrate = f[4];
				} else if (thisLine.includes('Stream ') && thisLine.includes('Video')) {
					// 先把括号里的逗号去掉
					let front = 0,
						rear = 0;
					let _thisLine = thisLine;
					while ((front = _thisLine.indexOf('(', front)) != -1) {
						rear = thisLine.indexOf(')', front);
						_thisLine = replaceString(_thisLine, ',', '/', front, rear);
						front = rear;
					}
					// 读取视频行
					let video_paraline = '',
						currentPos = 0;
					({ text: video_paraline, pos: currentPos } = selectString(_thisLine, 'Video: '));
					const video_paraItems = video_paraline.split(', ');
					this.input.vcodec = video_paraItems[0];
					if (this.input.vcodec.indexOf('(') != -1) {
						this.input.vcodec = this.input.vcodec.slice(0, this.input.vcodec.indexOf('(') - 1);
					}
					// video_pixelfmt = video_paraItems[1];
					this.input.vresolution = video_paraItems[2];
					if (this.input.vresolution.indexOf('[') != -1) {
						this.input.vresolution = this.input.vresolution.slice(0, this.input.vresolution.indexOf(' ['));
					}
					this.input.vbitrate = video_paraItems.find((element) => element.includes('kb/s'));
					this.input.vbitrate = this.input.vbitrate == undefined ? undefined : this.input.vbitrate.slice(0, -5);
					this.input.vframerate = video_paraItems.find((element) => element.includes('fps'));
					this.input.vframerate = this.input.vframerate == undefined ? undefined : this.input.vframerate.slice(0, -4);
					// if (this.input.format == "matroska,webm") {
					// 	if (this.input.vcodec == "h264" || this.input.vcodec == "hevc") {
					// 		// webm 容器不能容纳这两种，所以假定为 MKV
					// 		format_display = "MKV";
					// 	} else if (this.input.vcodec == "vp9" || this.input.vcodec == "vp8") {
					// 		// 但如果视频编码是 VP 系列，容器更有可能是 webm
					// 		format_display = "webm";
					// 	} else {
					// 		format_display = "(MKV)";
					// 		pushMsg(filename + "：FFmpeg 暂无法判断该文件格式为 MKV 或为 webm。")
					// 	}
					// }
				} else if (thisLine.includes('Stream ') && thisLine.includes('Audio')) {
					// 先把括号里的逗号去掉
					let front = 0,
						rear = 0;
					let _thisLine = thisLine;
					while ((front = thisLine.indexOf('(', front)) != -1) {
						rear = thisLine.indexOf(')', front);
						_thisLine = replaceString(_thisLine, ',', '/', front, rear);
						front = rear;
					}
					// 读取音频行
					let audio_paraline = '',
						currentPos = 0;
					({ text: audio_paraline, pos: currentPos } = selectString(_thisLine, 'Audio: '));
					const audio_paraItems = audio_paraline.split(', ');
					this.input.acodec = audio_paraItems[0];
					if (this.input.acodec.indexOf('(') != -1) {
						this.input.acodec = this.input.acodec.slice(0, this.input.acodec.indexOf('(') - 1);
					}
					// audio_samplerate = audio_paraItems.find((element) => {return element.indexOf('Hz') != -1;});
					// audio_samplerate = audio_samplerate == undefined ? undefined : audio_samplerate.slice(0, -3);
					this.input.abitrate = audio_paraItems.find((element) => {
						return element.includes('kb/s');
					});
					if (this.input.abitrate != undefined) {
						if (this.input.abitrate.includes('(')) {
							this.input.abitrate = this.input.abitrate.slice(0, this.input.abitrate.indexOf('(') - 1);
						}
						this.input.abitrate = this.input.abitrate.slice(0, -5);
					}
				} else if (thisLine.includes('[') && thisLine.includes('@')) {
					// ⚪ demuxer/decoder/encoder/muxer 等发来的信息
					// const sender = scanf(thisLine, '[%s @ %s]', ']')[1];
					const msg = thisLine.slice(thisLine.indexOf(']') + 2);
					// 已识别的消息判断为 critical 放入 critical 列表，其余的 emit error 信息
					if (false) {
					} else if (msg.includes('Unable to find a suitable output format')) {
						// 例：[NULL @ 00000250d7ab1040] Unable to find a suitable output format for '童可可 - 小光芒_converted.MP0'
						this.errors.add('容器设置有误。');
					}
				} else if (thisLine.includes('Unknown encoder')) {
					// 🔵 critical：Unknown encoder
					this.errors.add(`无法识别的输出编码“${selectString(thisLine, "'", "'", 0).text}”。`);
					this.emit('critical', { content: this.errors });
					this.status = -1;
				} else if (thisLine.includes('Invalid argument')) {
					// 🔵 critical：Invalid argument
					this.errors.add('参数有误。');
					this.emit('critical', { content: this.errors });
					this.status = -1;
				}
				break;

			case 2:
			case 3:
				// 暂时不需要
				this.sm = 0;
				break;
			case 4: // 是时候返回编码信息啦
				if (this.input.vcodec == undefined && this.input.abitrate) {
					this.input.abitrate = this.input.bitrate;
				}
				if (this.input.acodec == undefined && this.input.vbitrate) {
					this.input.vbitrate = this.input.bitrate;
				}
				this.emit('metadata', { content: this.input });
				if (this.getSingleMsg) {
					this.status = -1;
				}
				this.sm = 0;
				break;
		}
		this.dataProcessing(); // 可以把整个函数都 while (true)，为了节省空间，就改用递归了
	}
	kill(callback: () => void): void {
		if (!this.process) {
			return;
		}
		this.addListener('closed', callback);
		this.process.kill();
	}
	forceKill(callback: () => void): void {
		if (!this.process) {
			return;
		}
		this.requireStop = true;
		this.status = -1;
		switch (process.platform) {
			case 'win32':
				spawn('taskkill', ['/F', '/PID', this.process.pid + ''], {
					detached: false,
					shell: false,
				});
				break;
			case 'linux':
			case 'darwin':
				spawn('kill', ['-KILL', this.process.pid! + ''], {
					detached: false,
					shell: false,
				});
				break;
			default:
		}
		this.addListener('closed', callback);
	}
	exit(callback: () => void): void {
		if (!this.process) {
			return;
		}
		if (this.status == 0) {
			this.resume();
		}
		this.requireStop = true;
		this.addListener('closed', () => {
			this.status = -1;
		});
		this.addListener('closed', callback);
		this.process.stdin!.write('q');
	}
	pause(): void {
		if (!this.process) {
			return;
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(true, this.process.pid!);
				break;
			case 'linux':
			case 'darwin':
				spawn('kill', ['-STOP', this.process.pid! + ''], {
					detached: false,
					shell: false,
				});
				break;
			default:
		}
		this.status = 0;
	}
	resume(): void {
		if (!this.process) {
			return;
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(false, this.process.pid!);
				break;
			case 'linux':
			case 'darwin':
				spawn('kill', ['-CONT', this.process.pid! + ''], {
					detached: false,
					shell: false,
				});
				break;
			default:
		}
		this.status = 1;
	}
	sendKey(key: string): void {
		if (!this.process) {
			return;
		}
		this.process.stdin!.write(key);
	}
	sendSig(str: number): void {
		if (!this.process) {
			return;
		}
		this.process.kill(str);
	}
}
