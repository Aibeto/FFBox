/**
 * 协作式任务让出管理器
 * 用法：
 * 在循环中调用 yieldManager.yield()，即可让出事件循环，让其他任务先执行。
 * 通过 yieldManager.kill() 可以中止某类型的任务，实现在循环里 break 的效果，但一定要在允许中止的任务上使用 try catch，然后在 catch 里用 break。
 *
 * 设计思路：
 * - 各种大循环中每 N 次迭代调用 yield(type)，创建 Promise 并 await
 * - Promise 被存入队列，在下一个宏任务中 shift 出来 resolve
 * - kill(type) 标记某类型的所有 pending yield，下次 shift 时 throw 而非 resolve
 * - 通过 setTimeout(resolve, clearanceTime) 让出事件循环，无需 performance.now 时间检查
 *
 * 用法：
 * ```
 * const ym = new YieldManager();
 *
 * // 低优任务
 * async function scan() {
 *   for (let i = 0; i < items.length; i++) {
 *     if (i % 10 === 0) await ym.yield('metadataScan');
 *     // 处理 item...
 *   }
 * }
 *
 * // 高优任务：先干掉低优
 * async function queueStart() {
 *   ym.kill((metadata) => metadata.type === 'queuePause');     // 中止暂停
 *   for (let i = 0; i < items.length; i++) {
 *     if (i % 10 === 0) await ym.yield('queueStart');
 *     // 处理 item...
 *   }
 * }
 * ```
 */

const clearanceTime = 0;	// 净空时间（让给 js 主线程做其他事的时间，若非调试需要一般是 0）

interface YieldItemMetadata {
	type: string;
	taskIds?: Set<number>;
}

export class YieldManager {
	private flushTimer: number | null = null;
	public pendingList: { metadata: YieldItemMetadata; resolve: () => void; reject: (reason?: any) => void; killed: boolean }[] = [];

	/**
	 * 让出事件循环
	 * @param metadata 任务类型标识（用于按类型中止）
	 * @throws 当该类型被 kill 后，下次 shift 时抛出 YieldKilledError
	 */
	yield(metadata: YieldItemMetadata): Promise<void> {
		// console.log('入队', metadata, this.pendingList);
		return new Promise<void>((resolve, reject) => {
			this.pendingList.push({ metadata, resolve, reject, killed: false });

			if (!this.flushTimer) {
				this.flushTimer = setTimeout(() => this.flushSingleTask(), clearanceTime) as any;
			}
		});
	}

	/**
	 * 中止指定类型的所有 pending yield
	 * 被中止的 yield 在下次 flush 时 throw YieldKilledError
	 */
	kill(filter: (metadata: YieldItemMetadata) => boolean): void {
		const list = this.pendingList.filter((entry) => filter(entry.metadata));
		for (const entry of list) {
			entry.killed = true;
		}
	}

	private flushSingleTask(): void {
		this.flushTimer = null;

		const task = this.pendingList.shift();
		if (task?.killed) {
			// console.log('出队（中断）', task?.metadata, this.pendingList);
			task.reject(new YieldKilledError());
		} else {
			// console.log('出队（正常）', task?.metadata, this.pendingList);
			task?.resolve();
		}
		if (this.pendingList.length > 0) {
			this.flushTimer = setTimeout(() => this.flushSingleTask(), clearanceTime) as any;
		}
	}
}

/**
 * 当 yield 被 kill 后抛出的错误
 */
export class YieldKilledError extends Error {
	constructor(message: string = '任务被中断') {
		super(message);
		this.name = 'YieldKilledError';
	}
}
