import { ServiceBridge } from '@renderer/bridges/serviceBridge';
import { PreviewWsMessage, PreviewWsResponse } from '@common/types';

export interface PreviewDecoderConfig {
	taskId: number;
	startTime: number;		// 解码起始时间（秒）
	bufferSec: number;		// 目标缓冲时长（秒），建议 5-10 秒
	server: ServiceBridge;	// 服务器连接实例
	quality?: 'H' | 'M' | 'L' | 'XL' | 'XXL';	// 画质等级（可选，默认 H）
}

export interface BufferInfo {
	start: number;
	end: number;
	duration: number;
}

/**
 * 视频预览流解码器
 *
 * 使用 MediaSource API + WebSocket 实现流式播放（步进模式）：
 * - 后端每次发送一个 chunk 后等待，收到 continue 确认后发送下一个
 * - 前端收到数据并 appendBuffer 完成后，检查缓冲水位线
 * - 缓冲不足时发送 continue 消息，后端才发送下一个 chunk
 * - 定时器持续检查缓冲水位线，不足时发送 continue
 * - currentTime 超出缓冲范围时重新建立连接
 */
export class PreviewStreamDecoder {
	private mediaSource: MediaSource | null = null;
	private sourceBuffer: SourceBuffer | null = null;
	private videoElement: HTMLVideoElement | null = null;

	public config: PreviewDecoderConfig;
	private ws: WebSocket | null = null;
	private sessionId: string | null = null;

	// 缓冲状态
	private bufferedStartTime: number = 0;
	private bufferedEndTime: number = 0;
	private streamEnded: boolean = false;
	private isDestroying: boolean = false;	// 如果销毁时 sourceBuffer.updating，这个值会被设置为 true
	private requestId: number = 0;	// 每次 initialize 和 request 时都会 +1，用于在异步循环中判断之前的东西是否已经注销

	// SourceBuffer 操作队列
	private bufferQueue: Uint8Array[] = [];
	private isBufferProcessing: boolean = false;
	private isBufferFull: boolean = false;

	// 缓冲检查定时器
	private bufferCheckTimer: number | null = null;

	// MIME 类型（H.264 Baseline Profile）
	private mimeType: string = 'video/mp4; codecs="avc1.42E01E"';

	// 事件回调
	public onBufferUpdate?: (info: BufferInfo) => void;	// buffer 更新完成时触发
	public onStreamError?: (error: Error) => void;	// 预览请求出错时触发
	public onInsufficientSpeed?: () => void;	// 检查缓存时发现 buffer 剩余时间小于 1s 时触发

	constructor(config: PreviewDecoderConfig) {
		this.config = config;
	}

	/**
	 * 初始化解码实例
	 * @param videoElement 目标 video 元素
	 */
	async initialize(videoElement: HTMLVideoElement): Promise<void> {
		this.videoElement = videoElement;
		this.requestId++;

		// 创建 MediaSource
		this.mediaSource = new MediaSource();
		videoElement.src = URL.createObjectURL(this.mediaSource);

		// 等待 MediaSource ready
		await new Promise<void>((resolve) => {
			this.mediaSource!.addEventListener('sourceopen', () => resolve(), { once: true });
		});

		// 尝试创建 SourceBuffer
		try {
			this.sourceBuffer = this.mediaSource!.addSourceBuffer(this.mimeType);
			this.sourceBuffer.mode = 'segments'; // fMP4 使用 segments 模式
		} catch (e) {
			// 尝试其他编码格式
			console.warn('[PreviewStreamDecoder] 使用默认编码创建 SourceBuffer 失败，更改编码类型', e);
			// 尝试 H.264 Main Profile
			try {
				this.mimeType = 'video/mp4; codecs="avc1.4D401E"';
				this.sourceBuffer = this.mediaSource!.addSourceBuffer(this.mimeType);
				this.sourceBuffer.mode = 'segments';
			} catch (e2) {
				console.error('[PreviewStreamDecoder] 创建 SourceBuffer 失败', e2);
				// 整个失败
				this.mediaSource = null;
				this.sourceBuffer = null;
				this.requestId++;
				throw new Error(e2 as any);
			}
		}

		// 建立 WebSocket 连接
		await this.connectWebSocket();

		// 启动缓冲检查定时器
		this.startBufferCheckTimer();
	}

	/**
	 * 建立 WebSocket 连接
	 */
	private connectWebSocket(): Promise<void> {
		return new Promise((resolve, reject) => {
			const quality = this.config.quality ?? 'H';  // 默认高画质
			const wsUrl = `ws://${this.config.server.ip}:${this.config.server.port}/ws/preview?taskId=${this.config.taskId}&startTime=${this.config.startTime}&quality=${quality}`;
			console.log('[PreviewStreamDecoder] 连接 WebSocket:', wsUrl);

			this.ws = new WebSocket(wsUrl);
			this.ws.binaryType = 'arraybuffer';

			this.ws.onopen = () => {
				console.log('[PreviewStreamDecoder] WebSocket 连接成功');
				// 连接成功后发送 start 指令
				this.sendMessage({ type: 'start', startTime: this.config.startTime });
				resolve();
			};

			this.ws.onmessage = (event) => {
				if (typeof event.data === 'string') {
					this.handleTextMessage(JSON.parse(event.data) as PreviewWsResponse);
				} else {
					// 二进制数据 -> SourceBuffer
					this.appendToBuffer(new Uint8Array(event.data));
				}
			};

			this.ws.onerror = (event) => {
				console.error('[PreviewStreamDecoder] WebSocket 连接错误', event);
				this.onStreamError?.(new Error('WebSocket 连接错误'));
				reject(event);
			};

			this.ws.onclose = (event) => {
				console.log('[PreviewStreamDecoder] WebSocket 已关闭', event.code, event.reason);
				this.streamEnded = true;
			};
		});
	}

	/**
	 * 处理文本消息
	 */
	private handleTextMessage(message: PreviewWsResponse): void {
		switch (message.type) {
			case 'connected':
				this.sessionId = message.sessionId || null;
				console.log('[PreviewStreamDecoder] Connected', message);
				break;

			case 'started':
				this.streamEnded = false;
				console.log('[PreviewStreamDecoder] Stream started', message.startTime);
				break;

			case 'streamEnd':
				this.streamEnded = true;
				console.log('[PreviewStreamDecoder] Stream ended');
				break;

			case 'error':
				console.error('[PreviewStreamDecoder] Error', message.message);
				this.onStreamError?.(new Error(message.message || 'Unknown error'));
				break;

			case 'pong':
				// 心跳响应
				break;
		}
	}

	/**
	 * 发送消息
	 */
	private sendMessage(message: PreviewWsMessage): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	/**
	 * 发送 continue 消息（步进模式）
	 */
	private sendContinue(): void {
		this.sendMessage({ type: 'continue' });
	}

	/**
	 * 启动缓冲检查定时器
	 * 步进模式下：缓冲不足时发送 continue 消息请求下一个 chunk
	 */
	private startBufferCheckTimer(): void {
		const requestId = this.requestId;
		this.bufferCheckTimer = window.setInterval(() => {
			if (this.streamEnded || !this.ws || this.isDestroying || this.requestId !== requestId) return;

			const currentBufferSec = this.getCurrentBufferDuration();

			if (this.isBufferFull) {
				// 此前缓冲还未加入 sourceBuffer，先尝试处理之前的
				this.processBufferQueue();
			} else if (currentBufferSec < this.config.bufferSec) {
				// 缓冲不足时间时发送 continue 请求下一个 chunk
				// console.log(`[PreviewStreamDecoder] 缓冲不足 (${currentBufferSec.toFixed(2)}s)，请求下一个 chunk`);
				this.sendContinue();
			}

			// 缓冲严重不足时触发警告
			if (currentBufferSec <= 1) {
				this.onInsufficientSpeed?.();
			}
		}, 1000);
	}

	/**
	 * Append 数据到 SourceBuffer（队列模式）
	 */
	private appendToBuffer(data: Uint8Array): void {
		// 将数据加入队列
		this.bufferQueue.push(data);
		// 如果当前没有在处理，启动处理流程
		if (!this.isBufferProcessing) {
			this.processBufferQueue();
		}
	}

	/**
	 * 处理 SourceBuffer 队列
	 * 步进模式：每次 appendBuffer 完成后检查缓冲水位线，不足时发送 continue
	 */
	private async processBufferQueue(): Promise<void> {
		if (this.isBufferProcessing) return;
		this.isBufferProcessing = true;

		while (this.bufferQueue.length > 0 && !this.isDestroying) {
			const data = this.bufferQueue.shift()!;
			if (!this.sourceBuffer) break;

			// 等待 SourceBuffer 空闲
			if (this.sourceBuffer.updating) {
				await new Promise<void>((resolve) => {
					const handler = () => {
						this.sourceBuffer?.removeEventListener('updateend', handler);
						resolve();
					};
					this.sourceBuffer!.addEventListener('updateend', handler);
				});
			}

			// 检查是否在等待过程中被销毁
			if (this.isDestroying || !this.sourceBuffer) break;

			// 执行 append
			try {
				this.sourceBuffer.appendBuffer(data as any);
				this.isBufferFull = false;
				await new Promise<void>((resolve) => {
					const handler = () => {
						this.sourceBuffer?.removeEventListener('updateend', handler);
						resolve();
					};
					this.sourceBuffer!.addEventListener('updateend', handler);
				});
			} catch (e: any) {
				if (e.message.includes('The SourceBuffer is full')) {
					// console.log(`[PreviewStreamDecoder] appendBuffer 取消，缓冲已满`);
					this.bufferQueue.unshift(data);
					this.isBufferProcessing = false;
					this.isBufferFull = true;
					return;
				} else {
					// 其他错误等遇到了再说，这里先让它继续
					console.error('[PreviewStreamDecoder] appendBuffer 错误', e);
					break;
				}
			}

			// 更新缓冲范围信息
			this.updateBufferRanges();

			// 步进模式：appendBuffer 完成后检查缓冲水位线
			// 缓冲不足时立即发送 continue 请求下一个 chunk
			const currentBufferSec = this.getCurrentBufferDuration();
			if (currentBufferSec < this.config.bufferSec && !this.streamEnded) {
				// console.log(`[PreviewStreamDecoder] appendBuffer 完成，缓冲不足 (${currentBufferSec.toFixed(2)}s)，请求下一个 chunk`);
				this.sendContinue();
			}
		}

		this.isBufferProcessing = false;
	}

	/**
	 * 更新缓冲范围信息
	 */
	private updateBufferRanges(): void {
		if (!this.sourceBuffer) return;

		const buffered = this.sourceBuffer.buffered;
		if (buffered.length > 0) {
			this.bufferedStartTime = buffered.start(0);
			this.bufferedEndTime = buffered.end(buffered.length - 1);

			// 触发回调
			this.onBufferUpdate?.(this.getBufferInfo());
		}
	}

	/**
	 * 获取当前缓冲时长（相对于 currentTime）
	 */
	private getCurrentBufferDuration(): number {
		if (!this.videoElement || !this.sourceBuffer) return 0;

		const currentTime = this.videoElement.currentTime;
		const buffered = this.sourceBuffer.buffered;

		if (buffered.length === 0) return 0;

		// 找到 currentTime 所在的缓冲范围
		for (let i = 0; i < buffered.length; i++) {
			if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
				return buffered.end(i) - currentTime;
			}
		}

		return 0;	// currentTime 在缓冲范围之外
	}

	/**
	 * 检查 currentTime 是否在缓冲范围内（公开方法）
	 */
	public isCurrentTimeInBuffer(): boolean {
		if (!this.videoElement || !this.sourceBuffer) return false;

		const currentTime = this.videoElement.currentTime;
		const buffered = this.sourceBuffer.buffered;

		for (let i = 0; i < buffered.length; i++) {
			if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 获取缓冲范围信息
	 */
	public getBufferInfo(): BufferInfo {
		return {
			start: this.bufferedStartTime + this.config.startTime,
			end: this.bufferedEndTime + this.config.startTime,
			duration: this.bufferedEndTime - this.bufferedStartTime,
		};
	}

	/**
	 * 销毁解码实例
	 */
	public async destroy(): Promise<void> {
		console.log('[PreviewStreamDecoder] Destroying decoder');
		this.requestId++;
		this.isDestroying = true;

		// 停止缓冲检查定时器
		if (this.bufferCheckTimer) {
			window.clearInterval(this.bufferCheckTimer);
			this.bufferCheckTimer = null;
		}

		// 关闭 WebSocket
		if (this.ws) {
			if (this.ws.readyState === WebSocket.OPEN) {
				this.sendMessage({ type: 'stop' });
			}
			this.ws.close();
			this.ws = null;
		}

		// 清理 MediaSource
		if (this.mediaSource && this.mediaSource.readyState === 'open' && this.sourceBuffer) {
			if (this.sourceBuffer.updating) {
				await new Promise<void>((resolve) => {
					const handler = () => {
						this.sourceBuffer?.removeEventListener('updateend', handler);
						resolve();
					};
					this.sourceBuffer!.addEventListener('updateend', handler);
				});
			}
			this.mediaSource.removeSourceBuffer(this.sourceBuffer);
			this.mediaSource.endOfStream();
		}

		// 清理 video src
		if (this.videoElement) {
			try {
				URL.revokeObjectURL(this.videoElement.src);
			} catch (e) {
				// 忽略
			}
			this.videoElement.src = '';
			this.videoElement = null;
		}

		this.sourceBuffer = null;
		this.mediaSource = null;
		this.bufferedStartTime = 0;
		this.bufferedEndTime = 0;
		this.streamEnded = false;
		this.bufferQueue = [];
		this.isBufferProcessing = false;
	}

	/**
	 * 跳转到新的时间点（重建解码实例）
	 */
	public async restart(newTime: number, videoElement?: HTMLVideoElement, newQuality?: 'H' | 'M' | 'L' | 'XL' | 'XXL'): Promise<void> {
		console.log(`[PreviewStreamDecoder] 重建解码实例，开始时间 ${newTime.toFixed(2)}s${newQuality ? `，画质 ${newQuality}` : ''}`);

		this.config.startTime = newTime;
		if (newQuality) {
			this.config.quality = newQuality;
		}
		if (this.isDestroying) return;	// 上一个 destroy 完成后会继续往下跑，这个 restart 就不用继续了
		const _videoElement = videoElement || this.videoElement;
		await this.destroy();

		// 重新初始化
		await this.initialize(_videoElement!);
		this.isDestroying = false;	// 这招有效解决当 init 完成之前，又 restart 导致产生了多个请求未中断的问题
	}
}