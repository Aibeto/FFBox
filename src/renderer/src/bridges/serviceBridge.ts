import EventEmitter from 'events';
import CryptoJS from 'crypto-js';
import { getTimeString, TypedEventEmitter } from '@common/utils';
import { FFBoxServiceEvent, FFBoxServiceEventApi, FFBoxServiceFunctionApi, FFBoxServiceInterface, OutputParams } from '@common/types';

export interface ServeiceBridgeEvent {
	connected: () => void;
	disconnected: () => void;
	error: (reason: string) => void;
	message: (event: MessageEvent<any>) => void;
};

export enum ServiceBridgeStatus {
	Idle = 'Idle',
	Connecting = 'Connecting',
	Connected = 'Connected',
	Disconnected = 'Disconnected',
	Reconnecting = 'Reconnecting',
};

export class ServiceBridge extends (EventEmitter as new () => TypedEventEmitter<FFBoxServiceEvent & ServeiceBridgeEvent>) implements FFBoxServiceInterface {
	private ws: WebSocket | null = null;
	public ip: string;
	public port: number;
	public username: string;
	public password: string;
	public status = ServiceBridgeStatus.Idle;
	public sessionId?: string;
	public functionLevel: number = NaN;

	constructor(ip?: string, port?: number) {
		super();
		setTimeout(() => {
			if (ip && port) {
				this.connect(ip, port);
			}
		}, 0);
	}

	public async connect(ip?: string, port?: number, username?: string, password?: string) {
		if (ip && port) {
			this.ip = ip;
			this.port = port;
		}
		if (this.status === ServiceBridgeStatus.Idle) {
			this.status = ServiceBridgeStatus.Connecting;
		} else if (this.status === ServiceBridgeStatus.Disconnected) {
			this.status = ServiceBridgeStatus.Reconnecting;
		} else {
			return;
		}

		const finalResult = await new Promise(async (connectResult, _) => {
			/**
			 * 先查询服务器版本
			 * 如果服务器版本是 4.4 或更新，那么具有登录系统。连接后，等待服务器马上触发的 sessionId 事件（ws），此时即可通过 sessionId 登录（fetch）
			 * 旧版服务器则无需登录
			 */
			const [requestOK1, needLogin] = await new Promise<[boolean, boolean]>((resolve, reject) => {
				console.log(`serviceBridge: 正在检查服务器版本 http://${this.ip}:${this.port}/`);
				fetch(`http://${ip}:${port}/version`, { method: 'get' }).then((res) => {
					res.text().then((text) => {
						if (['3.0', '4.0', '4.1', '4.2', '4.3'].includes(text)) {
							resolve([true, false]);
						} else {
							resolve([true, true]);
						}
					}).catch(() => {
						resolve([false, false]);
					});
				}).catch((err) => {
					resolve([false, false]);
				});
			});
			if (!requestOK1) {
				this.emit('error', '连接失败：获取服务器版本失败');
				connectResult(false);
				return;
			}
	
			console.log(`serviceBridge: 正在连接服务器 ws://${this.ip}:${this.port}/`);
			let ws = new WebSocket(`ws://${this.ip}:${this.port}/`);
			this.ws = ws;
			let 这 = this;
			ws.onopen = async function (event) {
				console.log(`serviceBridge: ws://${这.ip}:${这.port}/ 服务器连接成功`, event);
				if (needLogin) {
					// 转锁 1s 等待 sessionId 返回
					for (let n = 25; n > 0; n--) {
						if (这.sessionId) {
							break;
						} else {
							await new Promise((r) => setTimeout(() => r(undefined), 40));
						}
					}
					if (!这.sessionId) {
						这.emit('error', '连接失败：服务器未及时返回 sessionId');
						ws.close();
						connectResult(false);
						return;
					}
					const [requestOK2, isUserExist, loginSuccess, functionLevel] = await new Promise<[boolean, boolean, boolean, number]>((resolve, reject) => {
						fetch(`http://${ip}:${port}/login`, {
							method: 'post',
							body: JSON.stringify({ username, passkey: CryptoJS.SHA256(password).toString(), sessionId: 这.sessionId }),
							headers: new Headers({
								'Content-Type': 'application/json'
							}),
						}).then((response) => {
							response.text().then((text) => {
								try {
									let result = JSON.parse(text);
									resolve([true, result.isUserExist, result.isSuccess, result.functionLevel]);
								} catch (e) {
									resolve([false, false, false, NaN]);
								}
							}).catch((err) => {
								resolve([false, false, false, NaN]);
							});
						}).catch((err) => {
							resolve([false, false, false, NaN]);
						});	
					});
					if (!requestOK2) {
						这.emit('error', '连接失败：登录连接失败');
						ws.close();
						connectResult(false);
						return;
					}		
					if (!isUserExist) {
						这.emit('error', '登录失败：用户名错误');
						ws.close();
						connectResult(false);
						return;
					}		
					if (!loginSuccess) {
						这.emit('error', '登录失败：密码错误');
						ws.close();
						connectResult(false);
						return;
					}
				}
	
				这.status = ServiceBridgeStatus.Connected;
				这.emit('connected');
				这.emitFFmpegInfo();
				connectResult(true);

				setTimeout(() => {
					// 这.testSendBigPackage();	// test
				}, 4000);
			}
			ws.onclose = function (event) {
				// close 事件在 error 事件后触发
				if (这.status === ServiceBridgeStatus.Connected) {
					// 掉线
					这.status = ServiceBridgeStatus.Disconnected;
				} else {
					// 未连接成功，由 onerror 处理过，这里不需处理
				}
				这.sessionId = undefined;
				这.functionLevel = NaN;
				这.emit('disconnected');
			}
			ws.onerror = function (event) {
				// console.log(`serviceBridge: ws://${这.ip}:${这.port}/ 服务器连接失败`, event);
				这.emit('error', 'Websocket 连接失败');
				return;
			}
			ws.onmessage = function (event) {
				// console.log(`serviceBridge: ws://${这.ip}:${这.port}/ 服务器发来消息`, event);
				// 这.emit('message', event);
				这.handleWsEvents(event);
			}
		});
		if (!finalResult) {
			if (this.status === ServiceBridgeStatus.Connecting) {
				// 第一次连接就失败
				this.status = ServiceBridgeStatus.Idle;
			} else if (this.status === ServiceBridgeStatus.Reconnecting) {
				// 连接后重连失败
				this.status = ServiceBridgeStatus.Disconnected;
			}
		}
	}

	public disconnect() {
		console.log(`serviceBridge: 正在断开服务器 ws://${this.ip}:${this.port}/`);
		this.ws?.close();
		this.ws = null;
		this.status = ServiceBridgeStatus.Idle;
	}

	/**
	 * 接受 service 事件入口（来自 ws.onmessage）
	 */
	private handleWsEvents(event: MessageEvent<any>) {
		let data: FFBoxServiceEventApi = JSON.parse(event.data);
		if (data.event === 'sessionId') {
			// 连接后，服务器将马上触发 sessionId 事件，此时即可使登录操作继续
			console.log(`本次登录 sessionId：${data.payload}`);
			this.sessionId = data.payload;
		} else {
			this.emit(data.event, data.payload as any);
		}
	}

	/**
	 * UI 调用 service 网络出口
	 */
	private sendWs(data: FFBoxServiceFunctionApi) {
		this.status === ServiceBridgeStatus.Connected && this.ws?.send(JSON.stringify(data));
	}

	private testSendBigPackage() {
		console.log(getTimeString(new Date()), '发送大包');
		const array = new Float32Array(512);

		for (var i = 0; i < array.length; ++i) {
			array[i] = i;
		}
	  
		this.ws?.send(array);

	}

	public initSettings() {
		let data: FFBoxServiceFunctionApi = {
			function: 'initSettings',
			args: [],
		}
		this.sendWs(data);
	}

	public initFFmpeg() {
		let data: FFBoxServiceFunctionApi = {
			function: 'initFFmpeg',
			args: [],
		}
		this.sendWs(data);
	}

	public emitFFmpegInfo() {
		let data: FFBoxServiceFunctionApi = {
			function: 'emitFFmpegInfo',
			args: [],
		}
		this.sendWs(data);
	}

	public taskAdd(fileBaseName: string, outputParams?: OutputParams): Promise<number> {
		return new Promise((resolve, reject) => {
			fetch(`http://${this.ip}:${this.port}/task`, {
				method: 'put',
				body: JSON.stringify({ fileBaseName, outputParams }),
				headers: new Headers({
					'Content-Type': 'application/json'
				}),
			}).then((response) => {
				response.text().then((text) => {
					let id = parseInt(text);
					resolve(id);
				})
			}).catch((err) => {
				reject(err);
			})
		})
	}

	public mergeUploaded(id: number, hashs: string[], fileName: string, inputName?: string) {
		let data: FFBoxServiceFunctionApi = {
			function: 'mergeUploaded',
			args: [id, hashs, fileName, inputName],
		}
		this.sendWs(data);
	}

	public setUploadStatus(id: number, isUploading: boolean) {
		let data: FFBoxServiceFunctionApi = {
			function: 'setUploadStatus',
			args: [id, isUploading],
		}
		this.sendWs(data);
	}

	public taskDelete(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'taskDelete',
			args: [id],
		}
		this.sendWs(data);
	}

	public taskStart(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'taskStart',
			args: [id],
		}
		this.sendWs(data);
	}

	public taskPause(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'taskPause',
			args: [id],
		}
		this.sendWs(data);
	}

	public taskResume(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'taskResume',
			args: [id],
		}
		this.sendWs(data);
	}

	public taskReset(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'taskReset',
			args: [id],
		}
		this.sendWs(data);
	}

	public queueStart() {
		let data: FFBoxServiceFunctionApi = {
			function: 'queueStart',
			args: [],
		}
		this.sendWs(data);
	}

	public queuePause() {
		let data: FFBoxServiceFunctionApi = {
			function: 'queuePause',
			args: [],
		}
		this.sendWs(data);
	}

	public deleteNotification(notificationId: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'deleteNotification',
			args: [notificationId],
		}
		this.sendWs(data);
	}

	public setParameters(ids: number[], params: OutputParams[]) {
		let data: FFBoxServiceFunctionApi = {
			function: 'setParameters',
			args: [ids, params],
		}
		this.sendWs(data);
	}

	public activate(activationCode: string) {
		let data: FFBoxServiceFunctionApi = {
			function: 'activate',
			args: [activationCode],
		}
		this.sendWs(data);
	}

	public trailLimit_stopTranscoding(id: number) {
		let data: FFBoxServiceFunctionApi = {
			function: 'trailLimit_stopTranscoding',
			args: [id, true],
		}
		this.sendWs(data);
	}
}
