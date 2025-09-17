import { reactive } from 'vue';
import CryptoJS from 'crypto-js';
import { Server, UploadChunk, UploadFile } from '@renderer/types';
import { TransferStatus } from '@common/types';
import nodeBridge from '@renderer/bridges/nodeBridge';
import HashWorker from './transferHashWorker?worker';

export async function uploadFile(server: Server, input: string | File, taskId: number, fileName: string) {
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
		// 对每个分片进行文件读取和 hash 生成，若读取错误则直接退出
		file.status = 'reading';
		for (let offset = 0; offset < fileSize; offset += segment) {
			const chunkSize = Math.min(segment, fileSize - offset);
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
			file.chunks.push(chunk);
			if (typeof input === 'string') {
				buffer = (await nodeBridge.getLocalFileChunk(input, offset, chunkSize)).buffer as ArrayBuffer;
			} else {
				const blob = input.slice(offset, offset + chunkSize);
				buffer = (await blob.arrayBuffer()) as any;
			}
			chunk.buffer = buffer;
			chunk.status = 'hashing';
		}
		// 根据 CPU 数量划分成若干个 worker 任务
		file.status = 'hashing';
		const cpuCount = navigator.hardwareConcurrency || 4;
		const taskList = new Array(cpuCount).fill(0).map(() => [] as { buffer: ArrayBuffer, index: number }[]);
		for (let i = 0; i < file.chunks.length; i++) {
			const taskIndex = i % cpuCount;
			taskList[taskIndex].push({ buffer: file.chunks[i].buffer, index: i });
		}
		// 分发到各个 worker 进行计算
		const promises = taskList.map((task, index) => new Promise((resolve, reject) => {
			const worker = new HashWorker();
			worker.onmessage = (event) => {
				if (event.data.type === 'result') {
					file.chunks[event.data.index].hash = event.data.hash;
					console.log(`【${fileName}】【${event.data.index}】hash 已计算：${event.data.hash}`);
					file.chunks[event.data.index].buffer = event.data.buffer;
				} else if (event.data.type === 'finish') {
					resolve(0);
					worker.terminate();
				}
			};
			worker.onerror = (error) => {
				reject(index);
			}
			worker.postMessage(task, [...task.map((task) => task.buffer)]);
		}));
		try {
			await Promise.all(promises);
		} catch (error) {
			console.log(fileName, '计算文件哈希时发生错误，上传失败');
			return;
		}

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
			server.entity.mergeUploaded(taskId, file.chunks.map((chunk) => chunk.hash), fileName);
			file.chunks.forEach((chunk) => chunk.buffer = undefined); // 释放内存
			file.status = 'finished';
			server.data.tasks[taskId].transferStatus = TransferStatus.normal;
		} else {
			console.log(fileName, '未缓存');
			// 运行到此时，虽然代码逻辑上不保证本地 tasklist 一定有此任务，但正常操作下 tasklist update 一早就到达了，而且用户也不会在上传开始前删除任务
			// 若未缓存则对各个分片进行上传。若出错则重试
			runUpload(server, file);
		}
	}, 0);
	return file;
}

// 初次上传和续传均调用此函数
async function runUpload(server: Server, file: UploadFile) {
	file.status = 'uploading';
	for (const [chunkIndex, chunk] of Object.entries(file.chunks)) {
		while (chunk.tryCount < 3 && chunk.status !== 'finished') {
			chunk.tryCount++;
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
			} catch (e) {
				if (e.message === 'paused') {
					chunk.status = 'paused';
					file.status = 'paused';
					console.log(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】上传暂停`);
					break;	// 离开循环，并结束后续流程，直到下一次重新调用这个上传循环
				} else {
					chunk.status = 'error';
					console.error(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】${e.message}，上传失败`);
				}
			}
		}
		if (chunk.status !== 'finished') {
			file.status = 'error';
			console.error(`【${chunk.file.fileName}】【${chunkIndex}】【${chunk.hash}】分片上传失败，放弃上传`);
			return;
		}
	}
	server.entity.mergeUploaded(file.taskId, file.chunks.map((chunk) => chunk.hash), file.fileName);
	// 全部上传完成
	file.status = 'finished';
	console.log(`【${file.fileName}】文件上传完成`);
	server.data.tasks[file.taskId].transferStatus = TransferStatus.normal;
	
}

export function pauseUpload(file: UploadFile) {
	file.status = 'paused';
	file.chunks.forEach(c => {
		if (c.status === 'uploading') {
			c.abortController.abort();
			c.status = 'paused';
		}
	});
}
