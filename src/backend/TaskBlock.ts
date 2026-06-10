/**
 * 任务分块——TaskList 的内部数据结构
 * 每个块内维护一个 taskId 数组，块间通过双向链表连接
 * 这个结构主要是用来做索引查询的，且查询结果是 taskId，不是 Task 本体
 * 并不用于做 id 查询，因为 id 到任务是用一个全局 map。后期若有性能瓶颈可考虑改成在 Block 里存 Task 本体。
 */
export class TaskBlock {
	readonly blockId: number;
	taskIds: number[] = [];
	taskIdToListIndex: Map<number, number> = new Map();	// 用 id 查 index，好像只是用来提升 removeTask 性能，但有效性存疑，因为每次移除元素后，都要更新后续元素的索引映射
	firstTaskIndex: number;

	// 双向链表
	prev: TaskBlock | null = null;
	next: TaskBlock | null = null;

	// 每 10 块跳转指针（当前暂不实现跳转逻辑）
	prev10: TaskBlock | null = null;
	next10: TaskBlock | null = null;

	constructor(blockId: number, firstTaskIndex: number) {
		this.blockId = blockId;
		this.firstTaskIndex = firstTaskIndex;
	}

	/**
	 * 向块末尾添加一个 taskId
	 * @returns 添加后的本地索引
	 */
	addTask(taskId: number): number {
		const index = this.taskIds.length;
		this.taskIds.push(taskId);
		this.taskIdToListIndex.set(taskId, index);
		return index;
	}

	/**
	 * 从块中移除一个 taskId
	 * @returns 被移除的本地索引，若不存在则返回 undefined
	 */
	removeTask(taskId: number): number | undefined {
		const index = this.taskIdToListIndex.get(taskId);
		if (index === undefined) {
			return undefined;
		}
		// 从数组中删除
		this.taskIds.splice(index, 1);
		this.taskIdToListIndex.delete(taskId);
		// 更新后续元素的索引映射
		for (let i = index; i < this.taskIds.length; i++) {
			this.taskIdToListIndex.set(this.taskIds[i], i);
		}
		return index;
	}

	/**
	 * 获取指定本地索引处的 taskId
	 */
	getTaskAt(index: number): number | undefined {
		return this.taskIds[index];
	}

	get size(): number {
		return this.taskIds.length;
	}

	get isEmpty(): boolean {
		return this.taskIds.length === 0;
	}
}
