import { ServiceTask } from '@common/types';
import { TaskBlock } from './TaskBlock';

/**
 * 任务列表管理器
 * 封装分块链表 + 数组结构，对外提供任务的增删查接口
 * FFBoxService 中所有对任务集合的操作（非单任务业务逻辑）均应通过此类完成
 */
export class TaskList {
	private taskIdToTask: Map<number, ServiceTask> = new Map();
	private taskIdToBlock: Map<number, TaskBlock> = new Map();
	private firstBlock: TaskBlock | null = null;
	private lastBlock: TaskBlock | null = null;
	private nextTaskId: number = 0;	// 任务的下一个自增 id
	private nextBlockId: number = 0;	// 块的下一个自增 id
	private readonly blockSize: number;

	constructor(blockSize: number = 1000) {
		this.blockSize = blockSize;
	}

	/**
	 * 添加任务，自动分配 id 并存入分块结构
	 * @returns 分配的任务 id
	 */
	add(task: ServiceTask): number {
		const taskId = this.nextTaskId++;
		task.id = taskId;
		this.taskIdToTask.set(taskId, task);

		// 将 taskId 添加到合适的块中（满块则创建新块）
		if (!this.lastBlock || this.lastBlock.size >= this.blockSize) {
			// 计算新块的 firstTaskIndex
			const firstTaskIndexInNextBlock = this.lastBlock ? this.lastBlock.firstTaskIndex + this.lastBlock.size : 0;
			const newBlock = new TaskBlock(this.nextBlockId++, firstTaskIndexInNextBlock);
			if (this.lastBlock) {
				// 前面的块满了，创建新块
				newBlock.prev = this.lastBlock;
				this.lastBlock.next = newBlock;
				// 每 10 块维护跳转指针
				if (newBlock.blockId % 10 === 0) {
					// 找到 10 块前的块
					let prev10Block: TaskBlock | null = this.lastBlock;
					for (let i = 1; i < 10 && prev10Block; i++) {
						prev10Block = prev10Block.prev;
					}
					if (prev10Block) {
						prev10Block.next10 = newBlock;
						newBlock.prev10 = prev10Block;
					}
				}
			} else {
				// 第一个块，直接赋值
				this.firstBlock = newBlock;
			}
			this.lastBlock = newBlock;
		}
		this.lastBlock.addTask(taskId);
		this.taskIdToBlock.set(taskId, this.lastBlock);
		
		return taskId;
	}

	/**
	 * 按 id 移除任务
	 * @returns 是否成功移除
	 */
	remove(taskId: number): boolean {
		if (!this.taskIdToTask.has(taskId)) {
			return false;
		}

		// 从块中移除 taskId，并更新后续块的 firstTaskIndex
		const block = this.taskIdToBlock.get(taskId);
		if (block) {
			block.removeTask(taskId);
			this.taskIdToBlock.delete(taskId);
			// 更新后续块的 firstTaskIndex
			let nextBlock = block.next;
			while (nextBlock) {
				nextBlock.firstTaskIndex--;
				nextBlock = nextBlock.next;
			}			
		}
		
		this.taskIdToTask.delete(taskId);
		return true;
	}

	/**
	 * 按 id 查找任务
	 */
	getById(id: number): ServiceTask | undefined {
		return this.taskIdToTask.get(id);
	}

	/**
	 * 按全局偏移查找任务
	 */
	getByOffset(offset: number): ServiceTask | undefined {
		// 根据全局偏移定位所在块
		let block = this.firstBlock;
		while (block) {
			if (offset >= block.firstTaskIndex && offset < block.firstTaskIndex + block.size) {
				break;
			}
			block = block.next;
		}

		if (block) {
			const localIndex = offset - block.firstTaskIndex;
			const taskId = block.getTaskAt(localIndex);
			if (taskId === undefined) return undefined;
			return this.taskIdToTask.get(taskId);
		}
	}

	/**
	 * 任务区段查询（仅 ID）：返回 [offset, offset+size) 范围内的任务 ID 列表
	 */
	getRangeIds(offset: number, size: number): number[] {
		const result: number[] = [];
		let remaining = size;
		let currentBlock = this.firstBlock;
		// 跳到包含 offset 的块
		while (currentBlock && currentBlock.firstTaskIndex + currentBlock.size <= offset) {
			currentBlock = currentBlock.next;
		}
		if (!currentBlock) return result;
		let localIndex = offset - currentBlock.firstTaskIndex;
		while (remaining > 0 && currentBlock) {
			while (localIndex < currentBlock.size && remaining > 0) {
				const taskId = currentBlock.getTaskAt(localIndex);
				if (taskId !== undefined) result.push(taskId);
				localIndex++;
				remaining--;
			}
			currentBlock = currentBlock.next;
			localIndex = 0;
		}
		return result;
	}

	/**
	 * 任务区段查询：返回 [offset, offset+size) 范围内的任务列表
	 */
	getRange(offset: number, size: number): ServiceTask[] {
		return this.getRangeIds(offset, size)
			.map(id => this.taskIdToTask.get(id))
			.filter((t): t is ServiceTask => t !== undefined);
	}

	/**
	 * 返回所有任务的有序快照列表（按插入顺序）
	 * 适用于遍历场景，避免在循环中逐条调用 getById
	 */
	getSnapshot(): ServiceTask[] {
		const result: ServiceTask[] = [];
		let block = this.firstBlock;
		while (block) {
			for (const taskId of block.taskIds) {
				const task = this.taskIdToTask.get(taskId);
				if (task) result.push(task);
			}
			block = block.next;
		}
		return result;
	}

	/**
	 * 返回所有任务 id 的有序列表
	 */
	getSnapshotIds(): number[] {
		const result: number[] = [];
		let block = this.firstBlock;
		while (block) {
			for (const taskId of block.taskIds) {
				result.push(taskId);
			}
			block = block.next;
		}
		return result;
	}

	/**
	 * 任务总数
	 */
	count(): number {
		return this.taskIdToTask.size;
	}

	/**
	 * 是否包含指定 id 的任务
	 */
	has(id: number): boolean {
		return this.taskIdToTask.has(id);
	}

	/**
	 * 按任务 id 查询其全局序号
	 * @returns 全局序号，若不存在则返回 -1
	 */
	getIndexById(id: number): number {
		const block = this.taskIdToBlock.get(id);
		if (!block) return -1;
		const localIndex = block.taskIdToListIndex.get(id);
		if (localIndex === undefined) return -1;
		return block.firstTaskIndex + localIndex;
	}
}
