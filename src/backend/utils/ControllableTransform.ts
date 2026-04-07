import { Transform, TransformCallback } from 'stream';

interface ControllableTransformOptions {
	highWaterMark?: number;		// 缓存上限（字节），默认 1MB
	batchMode?: boolean;		// 是否启用组装模式，默认 false
}

/**
 * 可控制的 Transform 流
 * 步进模式：每次发送一批数据后等待，收到 continue 确认后发送下一批
 *
 * 支持两种模式：
 * - 逐块模式（batchMode=false，默认）：每个 FFmpeg chunk 到来都发送出去然后等待
 * - 组装模式（batchMode=true）：持续接收数据并组装，达到 highWaterMark 或流结束时发送
 */
export class ControllableTransform extends Transform {
	private pendingChunk: Buffer | null = null;
	private pendingCallback: TransformCallback | null = null;
	private highWaterMark: number;

	// 组装模式：当前批次累积的数据
	private batchBuffer: Buffer[] = [];
	private batchBytes: number = 0;

	// 步进模式配置
	private batchMode: boolean;		// 是否启用组装模式

	// 步进模式：等待前端 continue 确认
	private waitingForContinue: boolean = false;

	// 流状态信息
	public stats = {
		bytesReceived: 0,
		bytesSent: 0,
		bytesBuffered: 0,
		batchBytes: 0,
		waitingForContinue: false,
	};

	constructor(options: ControllableTransformOptions = {}) {
		super({
			highWaterMark: options.highWaterMark || 1000 * 1000,  // 默认 1MB
		});
		this.highWaterMark = options.highWaterMark || 1000 * 1000;
		this.batchMode = options.batchMode || false;
	}

	/**
	 * Transform 实现：步进模式
	 */
	_transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
		console.log(`[ControllableTransform] 接收到数据，大小 ${chunk.length}，模式 ${this.batchMode ? '组装' : '逐块'}`);
		this.stats.bytesReceived += chunk.length;

		// 如果正在等待 continue 确认，缓存数据并暂停上游
		if (this.waitingForContinue) {
			this.pendingChunk = chunk;
			this.stats.bytesBuffered = chunk.length;
			console.log(`[ControllableTransform] 等待中，缓存数据 ${chunk.length} 字节`);
			this.pendingCallback = callback;
			return;
		}

		if (this.batchMode) {
			// 组装模式：累积数据到批次缓冲区
			this.batchBuffer.push(chunk);
			this.batchBytes += chunk.length;
			this.stats.batchBytes = this.batchBytes;
			console.log(`[ControllableTransform] 累积批次，当前 ${this.batchBytes} 字节`);

			// 达到阈值时发送批次并暂停上游
			if (this.batchBytes >= this.highWaterMark) {
				this.flushBatch();
				this.pendingCallback = callback;
			} else {
				// 未达阈值，继续接收
				callback();
			}
		} else {
			// 逐块模式：直接发送并暂停上游
			this.push(chunk);
			this.stats.bytesSent += chunk.length;
			this.waitingForContinue = true;
			this.stats.waitingForContinue = true;
			console.log(`[ControllableTransform] 逐块发送，等待 continue`);
			this.pendingCallback = callback;
		}
	}

	/**
	 * 流结束时的处理
	 */
	_flush(callback: TransformCallback): void {
		// 组装模式：如果有剩余数据，发送出去
		if (this.batchMode && this.batchBytes > 0) {
			console.log(`[ControllableTransform] 流结束，发送剩余批次 ${this.batchBytes} 字节`);
			this.flushBatch();
		}
		callback();
	}

	/**
	 * 发送累积的批次数据
	 */
	private flushBatch(): void {
		if (this.batchBuffer.length === 0) return;

		// 合并所有 buffer
		const combined = Buffer.concat(this.batchBuffer);
		this.push(combined);
		this.stats.bytesSent += combined.length;

		console.log(`[ControllableTransform] 发送批次，大小 ${combined.length}，等待 continue 确认`);

		// 清空批次缓冲区
		this.batchBuffer = [];
		this.batchBytes = 0;
		this.stats.batchBytes = 0;

		// 等待 continue
		this.waitingForContinue = true;
		this.stats.waitingForContinue = true;
	}

	/**
	 * 前端确认发送下一批数据
	 */
	continueStream(): void {
		console.log(`[ControllableTransform] 收到 continue，缓存 ${this.pendingChunk?.length ?? 0} 字节，等待 ${this.waitingForContinue}`);
		this.waitingForContinue = false;
		this.stats.waitingForContinue = false;

		// 组装模式：如果有缓存数据，先处理缓存
		if (this.batchMode && this.pendingChunk) {
			// 将缓存数据加入批次缓冲区
			this.batchBuffer.push(this.pendingChunk);
			this.batchBytes += this.pendingChunk.length;
			this.stats.batchBytes = this.batchBytes;
			this.pendingChunk = null;
			this.stats.bytesBuffered = 0;

			// 如果达到阈值，发送批次并等待
			if (this.batchBytes >= this.highWaterMark) {
				this.flushBatch();
				// 发送后继续等待，不调用 callback（上游保持暂停）
				return;
			}

			// 未达阈值，恢复上游流动继续累积
			if (this.pendingCallback) {
				const cb = this.pendingCallback;
				this.pendingCallback = null;
				cb();
			}
			return;
		}

		// 逐块模式：如果有缓存数据，发送一个并等待
		if (this.pendingChunk) {
			this.push(this.pendingChunk);
			this.stats.bytesSent += this.pendingChunk.length;
			this.stats.bytesBuffered = 0;

			// 发送后再次等待，不调用 callback（上游保持暂停）
			this.waitingForContinue = true;
			this.stats.waitingForContinue = true;
			console.log(`[ControllableTransform] 发送缓存数据，大小 ${this.pendingChunk.length}，等待 continue`);
			this.pendingChunk = null;
			return;
		}

		// 缓存为空，恢复上游流动
		if (this.pendingCallback) {
			const cb = this.pendingCallback;
			this.pendingCallback = null;
			cb();
		}
	}

	/**
	 * 获取当前状态
	 */
	getStats(): typeof this.stats {
		return { ...this.stats };
	}

	/**
	 * 清空缓存并重置状态
	 */
	reset(): void {
		this.pendingChunk = null;
		this.pendingCallback = null;
		this.batchBuffer = [];
		this.batchBytes = 0;
		this.waitingForContinue = false;
		this.stats.bytesBuffered = 0;
		this.stats.batchBytes = 0;
		this.stats.waitingForContinue = false;
	}
}