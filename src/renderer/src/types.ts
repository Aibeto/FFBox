import { Task, Run, WorkingStatus, Notification, FFmpegInfo } from '@common/types';
import { ServiceBridge } from '@renderer/bridges/serviceBridge'
import { SingleTaskScheduler } from './logic/transferManager2';

export interface UIRun extends Run {
	dashboard: {
		progress: number;
		bitrate: number;
		speed: number;
		time: number;
		frame: number;
		size: number;	// kB
	};
	dashboard_smooth: {
		progress: number;
		bitrate: number;
		speed: number;
		time: number;
		frame: number;
		size: number;	// kB
	};
	dashboardTimer: number;
}

export interface UITask extends Omit<Task, 'runs'> {
	taskIndex: number;	// 全局序号，在 updateTaskList 获取后写入
	runs: UIRun[];
}

export interface UploadFile {
	taskId: number;
	fileBaseName: string;
	chunks: UploadChunk[];
	url?: string;	// 使用字符串输入
	blob?: File;	// 拖入文件输入
	size?: number;	// B
	status: 'waiting' | 'reading' | 'hashing' | 'uploading' | 'paused' | 'finished' | 'error';
	readTask?: SingleTaskScheduler;		// 用于暂停
	hashTask?: SingleTaskScheduler;
	uploadTask?: SingleTaskScheduler;
}
export interface UploadChunk {
	file?: UploadFile;
	abortController: AbortController;
	buffer?: ArrayBuffer;
	status: 'waiting' | 'reading' | 'hashing' | 'uploading' | 'paused' | 'finished' | 'error';
	tryCount: number;
	transferred: number;	// B
	size: number;			// B
	hash?: string;
}
export interface DownloadFile {
	url: string;
	finalFilePath?: string;
	transferred: number;	// B
	size: number;			// B
	status: 'downloading' | 'paused' | 'finished' | 'error';
}

export interface ServerData {
	id: string;			// 仅供前端一次性使用
	name: string;		// 默认为空
	nickName?: string;	// 暂不支持
	tasks: UITask[];				// 真正的数组，按全局序号顺序存储当前缓冲区的任务
	taskIdToIndex: Map<number, number>;	// taskId → tasks 数组下标，用于按 id 查找
	notifications: Notification[];
	uploadFiles: UploadFile[];
	downloadFiles: DownloadFile[];
	ffmpegInfo: FFmpegInfo;
	version?: string;
	os?: 'Windows' | 'Linux' | 'MacOS' | 'unknown';
	isSandboxed?: boolean;
	machineId?: string;
	functionLevel?: number;
	totalCount: number;		// 任务总数（来自后端）
	bufferStart: number;	// 当前缓冲区起始的全局偏移（含）
	bufferEnd: number;		// 当前缓冲区结束的全局偏移（不含）
	workingStatus: WorkingStatus;
	progress: number;	// 由后端 statusUpdate 事件推送
	asyncList: { type: string }[];	// 异步操作列表，由 asyncListUpdate 事件推送
}

export interface Server {
	data: ServerData;
	entity: ServiceBridge;
}
