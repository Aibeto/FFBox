import EventEmitter from 'events';
import { reactive } from 'vue';
import CryptoJS from 'crypto-js';
import { Server, UploadChunk, UploadFile } from '@renderer/types';
import nodeBridge from '@renderer/bridges/nodeBridge';
import HashWorker from './transferHashWorker2?worker';
import { useAppStore } from '../stores/appStore';

const globalTaskWorkingCounts: {[key: string]: number} = {};

export class SingleTaskScheduler extends EventEmitter {
	public concurrency: number;
	public taskName?: string;	// 指定 taskName 后，任务的 concurrency 计算将不仅限于单个 SingleTaskScheduler 实例，而是在全局共享同名的 concurrency
	public task: (singleTaskscheduler: this) => Promise<any>;
	private _workingCount: number;
	private _working: boolean;
	private _count: number;		// 运行计数，第一次从 0 开始

	constructor(params: { concurrency: number, taskName: string, task: (singleTaskscheduler: SingleTaskScheduler) => Promise<any> }) {
		super();
		Object.assign(this, params);
		this._workingCount = 0;
		this._working = false;
		this._count = 0;
	}

	get workingCount() { return this._workingCount }
	get working() { return this._working }
	get count() { return this._count }

	// 检查是否有资源，若有则开始任务（主动开始/上一轮运行完毕/随时添加 concurrency 等情况都可以调用）
	public async start() {
		this._working = true;
		let currentWorkingCount = this._workingCount;
		if (this.taskName) {
			const globalWorkingCount = globalTaskWorkingCounts[this.taskName] || 0;
			currentWorkingCount = Math.max(currentWorkingCount, globalWorkingCount);
		}
		if (currentWorkingCount < this.concurrency) {
			if (this.taskName) globalTaskWorkingCounts[this.taskName] = (globalTaskWorkingCounts[this.taskName] || 0) + 1;
			this._workingCount++;

			setTimeout(() => {				
				this.task(this).then(async () => {
					this._workingCount--;
					// await new Promise((r) => setTimeout(r, 100));
					if (this.taskName) globalTaskWorkingCounts[this.taskName] = globalTaskWorkingCounts[this.taskName] - 1;
	
					if (this._working) {
						this.start();			// 任务运行完成后，检查运行状态，然后运行下一轮
					} else if (!this._workingCount) {
						this.emit('allDone');	// 已停止工作，且没有其他任务，即为全部完成
					}
				}).catch(() => {
					// 任务失败即不再继续后续任务，剩余所有任务均执行 workingCount-- 后，最后一个完成的检查到 workingCount === 0 即停止
					this._workingCount--;
					if (this.taskName) globalTaskWorkingCounts[this.taskName] = globalTaskWorkingCounts[this.taskName] - 1;
					this._working = false;
					if (!this._workingCount) {
						this.emit('allDone');	// 已停止工作，且没有其他任务，即为全部完成
					}
				});
	
				this._count++;						// 任务开始后计数 +1（一定会在 finally 前进行）
				if (this._working) this.start();	// 任务开始后马上检查并发数是否足以进行下一轮
			}, 0);
		}
	}
}

/**
 * 添加一个上传任务。文件大小读出后将立刻返回
 * 完成上传后此函数将自动调用 mergeUploaded，需要传入在上传前生成的占位符 inputName
 */
export async function addUploadTask(server: Server, input: string | File, taskId: number, fileName: string, inputName: string) {
	let fileSize = 0;
	if (typeof input === 'string') {
		const stats = await nodeBridge.getLocalFileStats(input);
		if (stats) {
			fileSize = stats.size;
		}
	} else {
		fileSize = input.size;
	}
	if (fileSize === 0) {
		throw new Error('无法获取文件大小，上传失败');
	}
	const file: UploadFile = reactive({
		taskId,
		fileName,
		chunks: [],
		url: typeof input === 'string' ? input : undefined,
		blob: typeof input === 'string' ? undefined : input,
		size: fileSize,
		status: 'waiting',
	});

	const segment = fileSize < 1 * 1000 * 1000 * 1000 ? 4 * 1000 * 1000 : 20 * 1000 * 1000;	// 小文件使用小分段，便于控制续传；大文件使用大分段，提高性能。但不能用太大的分段，否则在校验阶段会 OOM
	// 基础信息收集完成，返回 file，剩余校验和上传工作在 timeout 后进行
	setTimeout(async () => {
		const appStore = useAppStore();
		server.entity.setUploadStatus(taskId, true);

		// 对每个分片进行文件读取，若读取错误则直接退出
		file.status = 'reading';
		const readDoneChunkIndexes: number[] = [];	// 供下一轮 hash 进行消费
		let readDone = false;
		const ts1 = new SingleTaskScheduler({
			concurrency: 1,
			taskName: 'readFile',
			task: async (sts) => {
				// 利用 sts.count 可以方便地通过运行次序知道自己应该读取哪一块，但这个值要在函数开始时马上存下来，否则会变
				const taskIndex = sts.count;
				const offset = taskIndex * segment;
				const chunkSize = Math.min(segment, fileSize - offset);
				if (chunkSize <= 0) {
					throw '读取任务即将结束';
				}
				let buffer: ArrayBuffer;
				const chunk: UploadChunk = {
					file,
					abortController: new AbortController(),
					buffer: undefined,
					status: 'reading',
					tryCount: 0,
					transferred: 0,
					size: chunkSize,
					hash: undefined,
				};
				file.chunks[taskIndex] = chunk;
				if (typeof input === 'string') {
					buffer = (await nodeBridge.getLocalFileChunk(input, offset, chunkSize)).buffer as ArrayBuffer;
				} else {
					const blob = input.slice(offset, offset + chunkSize);
					buffer = (await blob.arrayBuffer()) as any;
				}
				chunk.buffer = buffer;
				chunk.status = 'hashing';	// 其实是等待 hashing
				readDoneChunkIndexes.push(taskIndex);
			},
		});
		file.readTask = ts1;
		ts1.on('allDone', () => { readDone = true; console.log('读取全部完成') });
		ts1.start();

		// 根据 CPU 数量划分成若干个 worker 任务
		file.status = 'hashing';
		const cpuCount = navigator.hardwareConcurrency / 2 || 4;
		const workers = new Array(cpuCount).fill(0).map(() => new HashWorker());
		const workerRunningList = new Array(cpuCount).fill(false);

		// 通过 task 为 worker 分配任务
		const hashDoneChunkIndexes: number[] = [];	// 供下一轮 upload 进行消费
		// let hashDone = false;
		const ts2 = new SingleTaskScheduler({
			concurrency: cpuCount,
			taskName: 'hashFile',
			task: async (sts) => {
				if (!readDoneChunkIndexes.length) {
					if (readDone) {
						throw '哈希计算即将结束'
					} else {
						await new Promise((resolve) => setTimeout(resolve, 150));	// read 步骤还没读完，转锁
						return;
					}
				}
				// 检查哪个 worker 空闲，检查还没 hash 的任务，然后发送给 worker，等待其完成
				const idleWorkerIndex = workerRunningList.findIndex((isRunning) => !isRunning);
				const notHashedIndex = readDoneChunkIndexes.shift();
				if (idleWorkerIndex >= 0 && notHashedIndex >= 0) {
					const worker = workers[idleWorkerIndex];
					workerRunningList[idleWorkerIndex] = true;	
					await new Promise((resolve, reject) => {
						worker.onmessage = (event) => {
							file.chunks[notHashedIndex].hash = event.data.hash;
							// console.log(`【${fileName}】【${notHashedIndex}】hash 已计算：${event.data.hash}`);
							file.chunks[notHashedIndex].buffer = event.data.buffer;	// buffer 还回来
							workerRunningList[idleWorkerIndex] = false;	
							hashDoneChunkIndexes.push(notHashedIndex);
							resolve(0);
						}
						worker.onerror = (error) => {
							reject(`【${notHashedIndex}】哈希计算错误`);
						}
						worker.postMessage({ index: notHashedIndex, buffer: file.chunks[notHashedIndex].buffer }, [file.chunks[notHashedIndex].buffer]);
					});
				} else {
					debugger;	// 转锁应当在上面完成，出现在此处不合理
					await new Promise((resolve) => setTimeout(resolve, 150));	// read 步骤还没读完，转锁
				}

			}
		})
		file.hashTask = ts2;
		ts2.start();
		// 等待所有 hash 完成
		await new Promise((resolve) => {
			ts2.on('allDone', () => {
				workers.forEach((worker) => worker.terminate());
				// hashDone = true;
				resolve(0);
			});
		});

		// 获取到所有分片后，拼接 hash 并检查
		const concatedHash = CryptoJS.enc.Utf8.parse(file.chunks.map(c => c.hash).join(''));
		const fileHash = CryptoJS.SHA1(concatedHash).toString();
		const response = await fetch(`http://${server.entity.ip}:${server.entity.port}/upload/check/`, {
			method: 'post',
			body: JSON.stringify({
				hashs: [`${fileName}⬝${fileHash}`],	// 与服务器 mergeUploaded 的文件名逻辑保持相同
			}),
			headers: new Headers({
				'Content-Type': 'application/json'
			}),
		});
		const responseText = await response.text();
		let content = JSON.parse(responseText) as number[];
		if (content[0] % 2) {
			console.log(fileName, '已缓存');
			server.entity.mergeUploaded(taskId, file.chunks.map((chunk) => chunk.hash), fileName, inputName);
			const taskUpdateHandler = (arg: { taskId: number }) => {
				if (arg.taskId === taskId) {
					server.entity.off('taskUpdate', taskUpdateHandler);
					if (appStore.selectedTask.has(taskId)) appStore.applySelectedTask();
				}
			};
			server.entity.on('taskUpdate', taskUpdateHandler);
			for (const chunk of file.chunks) {
				chunk.buffer = undefined;		// 释放内存
				chunk.transferred = chunk.size;	// 显示上呈现完成状态
			}
			file.status = 'finished';
			file.readTask = undefined;
			file.hashTask = undefined;
			file.uploadTask = undefined;
			const hasOtherUploadTask = server.data.uploadFiles.some((uploadItem) => uploadItem.taskId === taskId && uploadItem.readTask);
			if (!hasOtherUploadTask) {
				server.entity.setUploadStatus(taskId, false);
			}
		} else {
			console.log(fileName, '未缓存');
			// 运行到此时，虽然代码逻辑上不保证本地 tasklist 一定有此任务，但正常操作下 tasklist update 一早就到达了，而且用户也不会在上传开始前删除任务
			// 若未缓存则对各个分片进行上传。若出错则重试
			const ts3 = new SingleTaskScheduler({
				concurrency: 1,
				taskName: 'uploadFile',
				task: async (sts) => {
					const chunkIndex = sts.count;
					if (chunkIndex>= file.chunks.length) {
						throw '上传任务即将结束';
					}
					const chunk = file.chunks[chunkIndex];
					let tryCount = 0;
					while (tryCount++ < 3) {
						chunk.status = 'uploading';
						chunk.transferred = 0;
						try {
							await new Promise((resolve) => {
								const form = new FormData();
								form.append('name', chunk.hash);
								// form.append('file', file);
								const file_blob = new Blob([chunk.buffer]);
								form.append('file', file_blob, chunk.hash);
								const xhr = new XMLHttpRequest;
								xhr.upload.addEventListener('progress', (event) => {
									// let progress = event.loaded / event.total;
									// const transferred = task.transferProgressLog.transferred;
									// transferred.push([new Date().getTime() / 1000 - lastStarted, event.loaded]);
									chunk.transferred = event.loaded;
								}, false);
								xhr.onreadystatechange = () =>{
									if (xhr.readyState !== 0) {
										if (xhr.status >= 400 && xhr.status < 500) {
											throw new Error('网络请求故障');
										} else if (xhr.status >= 500 && xhr.status < 600) {
											throw new Error('服务器故障');
										}
									}
								};
								xhr.onload = () => {
									console.log(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】发送完成`);
									chunk.buffer = undefined; // 释放内存
									resolve(0);
								};
								xhr.onabort = () => {
									throw new Error('paused');
								};
								xhr.open('post', `http://${server.entity.ip}:${server.entity.port}/upload/file/`, true);
								// xhr.setRequestHeader('Content-Type', 'multipart/form-data');
								xhr.send(form);
							});
							chunk.status = 'finished';
							chunk.transferred = chunk.size;
							break;	// 离开重试循环
						} catch (e) {
							if (e.message === 'paused') {
								chunk.status = 'paused';
								file.status = 'paused';
								console.log(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】上传暂停`);
								throw `【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】${e.message}，上传暂停`;
							} else {
								chunk.status = 'error';
								file.status = 'error';
								console.log(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】上传失败`);
								throw `【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】${e.message}，上传失败`;
							}
						}
					}
					if (chunk.status !== 'finished') {
						file.status = 'error';
						throw `【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】分片上传失败，放弃上传`;
					}
				}
			});
			file.uploadTask = ts3;
			ts3.on('allDone', () => {
				if (file.chunks.every((chunk) => chunk.status === 'finished')) {
					// 全部上传完成
					console.log(`【${file.fileName}】文件上传完成`);
					file.status = 'finished';
					server.entity.mergeUploaded(file.taskId, file.chunks.map((chunk) => chunk.hash), file.fileName, inputName);
					const taskUpdateHandler = (arg: { taskId: number }) => {
						if (arg.taskId === taskId) {
							server.entity.off('taskUpdate', taskUpdateHandler);
							if (appStore.selectedTask.has(taskId)) appStore.applySelectedTask();
						}
					};
					server.entity.on('taskUpdate', taskUpdateHandler);
					file.status = 'finished';
					file.readTask = undefined;
					file.hashTask = undefined;
					file.uploadTask = undefined;
					const hasOtherUploadTask = server.data.uploadFiles.some((uploadItem) => uploadItem.taskId === taskId && uploadItem.readTask);
					if (!hasOtherUploadTask) {
						server.entity.setUploadStatus(taskId, false);
					}
				}
			});
			ts3.start();
		}
	}, 0);
	return file;
}

export function pauseUploadTask(file: UploadFile) {

}
