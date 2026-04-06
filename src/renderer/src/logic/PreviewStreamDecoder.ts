import { ServiceBridge } from '@renderer/bridges/serviceBridge';

export interface PreviewDecoderConfig {
	taskId: number;
	startTime: number;		// 解码起始时间（秒）
	bufferSec: number;		// 目标缓冲时长（秒），建议 5-10 秒
	server: ServiceBridge;	// 服务器连接实例
}

export interface BufferInfo {
	start: number;
	end: number;
	duration: number;
}

/**
 * 视频预览流解码器
 *
 * 使用 MediaSource API 实现"阻塞式"流式播放：
 * - 前端通过 ReadableStream.reader.read() 控制读取节奏
 * - 缓冲足够时暂停读取，HTTP TCP 缓冲机制提供背压
 * - currentTime 超出缓冲范围时重建解码实例
 */
export class PreviewStreamDecoder {
	private mediaSource: MediaSource | null = null;
	private sourceBuffer: SourceBuffer | null = null;
	private videoElement: HTMLVideoElement | null = null;

	public config: PreviewDecoderConfig;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private abortController: AbortController | null = null;

	// 缓冲状态
	private bufferedStartTime: number = 0;
	private bufferedEndTime: number = 0;
	private isReading: boolean = false;
	private streamEnded: boolean = false;
	private isDestroying: boolean = false;	// 如果销毁时 sourceBuffer.updating，这个值会被设置为 true
	private requestId: number = 0;	// 每次 initialize 和 request 时都会 +1，用于在异步循环中判断之前的东西是否已经注销

	// 缓冲检查定时器
	private bufferCheckTimer: number | null = null;

	// MIME 类型（H.264 Baseline Profile）
	private mimeType: string = 'video/mp4; codecs="avc1.42E01E"';

	// 事件回调
	public onBufferUpdate?: (info: BufferInfo) => void;	// buffer 更新完成时触发
	public onStreamError?: (error: Error) => void;	// 预览请求出错时触发
	// public onSeekRequired?: (newTime: number) => void;
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
				throw new Error(e2);
			}
		}

		// 启动流请求
		// await this.startStreamRequest();
		this.abortController = new AbortController();
		this.streamEnded = false;
		const url = `/api/v1/tasks/${this.config.taskId}/preview-stream?startTime=${this.config.startTime}`;
		try {
			const requestId = this.requestId;
			const response = await this.config.server.fetchStream(url);
			if (!response.ok) {
				throw new Error(`[PreviewStreamDecoder] 预览请求失败 ${response.status}`);
			}
			if (!response.body) {
				throw new Error('[PreviewStreamDecoder] 预览请求异常');
			}
			if (requestId !== this.requestId) return;
			this.reader = response.body.getReader();	// 获取 ReadableStream reader
			this.readLoop();	// 开始读取循环
		} catch (e) {
			console.error('[PreviewStreamDecoder] 预览请求出错', e);
			this.onStreamError?.(e as Error);
		}

		// 启动缓冲检查定时器
		const requestId = this.requestId;
		this.bufferCheckTimer = window.setInterval(() => {
			if (this.streamEnded || this.abortController?.signal.aborted || this.isDestroying || this.requestId !== requestId) return;

			// 剩余缓冲量不足时启动读取循环
			const currentBufferSec = this.getCurrentBufferDuration();
			if (currentBufferSec < this.config.bufferSec * 0.5 && !this.isReading) {
				console.log(`[PreviewDecoder] 剩余缓冲不足 (${currentBufferSec.toFixed(2)}s)，启动读取循环`);
				this.readLoop();
			} else if (currentBufferSec <= 1) { 
				console.log(`[PreviewDecoder] 剩余缓冲不足 1s`);
				this.onInsufficientSpeed?.();
			}
	
			// this.checkCurrentTimeInBuffer();
		}, 1000);
	}

	/**
	 * 启动读取循环（核心阻塞式控制），直到缓存足够或者读完
	 */
	private async readLoop(): Promise<void> {
		if (this.isReading || !this.reader) return;
		this.isReading = true;
		const requestId = this.requestId;

		try {
			while (!this.streamEnded && !this.abortController?.signal.aborted && this.requestId === requestId) {
				// 检查当前缓冲量，如果缓冲量已达目标，暂停读取
				const currentBufferSec = this.getCurrentBufferDuration();
				if (currentBufferSec >= this.config.bufferSec) {
					console.log(`[PreviewStreamDecoder] 剩余缓冲充足 (${currentBufferSec.toFixed(2)}s), 读取暂停`);
					this.isReading = false;
					return;
				}

				// 从流中读取数据
				const { done, value } = await this.reader.read();
				if (done) {
					this.streamEnded = true;
					console.log('[PreviewDecoder] 预览流结束');
					break;
				}
				if (this.requestId === requestId) {
					await this.appendToBuffer(value);
				}
			}
		} catch (e) {
			if ((e as Error).name !== 'AbortError') {
				console.error('[PreviewStreamDecoder] 读取循环出错', e);
			}
		}
		this.isReading = false;
	}

	/**
	 * Append 数据到 SourceBuffer
	 */
	private async appendToBuffer(data: Uint8Array): Promise<void> {
		if (!this.sourceBuffer) {
			throw new Error('[PreviewDecoder] SourceBuffer 未初始化');
		}

		// SourceBuffer 正在更新时不能 append
		if (this.sourceBuffer.updating) {
			await new Promise<void>((resolve) => {
				const handler = () => {
					// 有可能在 updateend 之前被跳转操作 destroy 了
					this.sourceBuffer?.removeEventListener('updateend', handler);
					resolve();
				};
				this.sourceBuffer.addEventListener('updateend', handler);
			});
		}
		this.sourceBuffer.appendBuffer(data);
		await new Promise<void>((resolve) => {
			const handler = () => {
				// 有可能在 updateend 之前被跳转操作 destroy 了
				this.sourceBuffer?.removeEventListener('updateend', handler);
				resolve();
			};
			this.sourceBuffer.addEventListener('updateend', handler);
		});
		this.updateBufferRanges();
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
			start: this.bufferedStartTime,
			end: this.bufferedEndTime,
			duration: this.bufferedEndTime - this.bufferedStartTime,
		};
	}

	/**
	 * 销毁解码实例
	 */
	public async destroy(): Promise<void> {
		console.log('[PreviewDecoder] Destroying decoder');
		this.requestId++;
		this.isDestroying = true;

		// 停止缓冲检查定时器
		if (this.bufferCheckTimer) {
			window.clearInterval(this.bufferCheckTimer);
			this.bufferCheckTimer = null;
		}
		if (this.abortController) {
			this.abortController.abort();	// 中断请求
			this.abortController = null;
		}
		if (this.reader) {
			this.reader.cancel();	// 关闭 reader
			this.reader = null;
		}

		// 清理 MediaSource
		if (this.mediaSource && this.mediaSource.readyState === 'open' && this.sourceBuffer) {
			// SourceBuffer 正在更新时不能 append
			if (this.sourceBuffer.updating) {
				await new Promise<void>((resolve) => {
					const handler = () => {
						// 有可能在 updateend 之前被跳转操作 destroy 了
						this.sourceBuffer?.removeEventListener('updateend', handler);
						resolve();
					};
					this.sourceBuffer.addEventListener('updateend', handler);
				});
			}
			this.mediaSource!.removeSourceBuffer(this.sourceBuffer!);
			this.mediaSource!.endOfStream();
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
		this.isReading = false;
	}

	/**
	 * 跳转到新的时间点（重建解码实例）
	 */
	public async restart(newTime: number, videoElement?: HTMLVideoElement): Promise<void> {
		console.log(`[PreviewDecoder] 重建解码实例，开始时间 ${newTime.toFixed(2)}s`);

		this.config.startTime = newTime;
		if (this.isDestroying) return;	// 上一个 destroy 完成后会继续往下跑，这个 restart 就不用继续了
		const _videoElement = videoElement || this.videoElement;
		await this.destroy();

		// 重新初始化
		await this.initialize(_videoElement);
		this.isDestroying = false;	// 这招有效解决当 init 完成之前，又 restart 导致产生了多个请求未中断的问题
	}
}