import { SingleProgressLog, TaskStatus } from '@common/types';
import { getOutputDuration } from '@common/utils';
import { Server, ServerData, UITask } from '@renderer/types';

// #region 全局 dashboardTimer

// 模块级全局 timer：同时最多一个，遍历所有 server 中正在运行的任务更新 dashboard
let globalTimer: ReturnType<typeof setInterval> | undefined;
const activeServers = new Set<Server>();
let paused = false;

/**
 * 向全局 timer 注册/注销一个 server
 * 在 handleStatusUpdate 中根据 workingStatus 调用
 */
export function registerServerForDashboard(server: Server, workingStatusCommit: 'start' | 'stop') {
	if (workingStatusCommit === 'start') {
		activeServers.add(server);
	} else {
		activeServers.delete(server);
	}
	assignTimer();
}

/**
 * 节能逻辑统一入口：页面不可见时直接卸载定时器；
 * 恢复可见且仍有活跃服务器时重新挂载定时器。
 * 由 App.vue 的 visibilitychange 监听调用。
 */
export function setDashboardTimerPaused(_paused: boolean): void {
	paused = _paused;
	assignTimer();
}

function assignTimer() {
	if (globalTimer && (paused || activeServers.size === 0)) {
		clearInterval(globalTimer);
		globalTimer = undefined;
	} else if (!globalTimer && !paused && activeServers.size > 0) {
		globalTimer = setInterval(updateDashboard, 50);
	}
}

/**
 * 全局 timer tick：遍历所有已注册 server 的正在运行的任务，更新其 dashboard
 */
function updateDashboard() {
	for (const server of activeServers) {
		for (const task of server.data.tasks) {
			if (task.status === TaskStatus.running) updateTaskDashboard(task);
		}
	}
}

// #endregion

/**
 * 用于 dashboardTimer
 * 通过线性加权移动平均获取数值变化的速率（k 值）
 */
// function getKbyLWMA_obj(sampleCount: number, xFactorName: string, yFactorsName: Array<string>, data: Array<any>): Array<number> {
// 	let deltaXFactorSum = 0;
// 	let deltaYFactorsSum = Array(yFactorsName.length).fill(0);
// 	// 对于数据，在区间 [data.length - sampleCount, data.length - 1] 内，其权重在 [1, sampleCount] 之间递增
// 	// 因为采样数可能大于总样本数，所以倒序遍历，先计算最大的权重（index 最大），直到无法继续计算
// 	for (let weight = sampleCount, index = data.length - 1; index > 0 && weight > 0; weight--, index--) {
// 		deltaXFactorSum += weight * (data[index][xFactorName] - data[index - 1][xFactorName]);
// 		yFactorsName.forEach((factorName, i) => {
// 			deltaYFactorsSum[i] += weight * (data[index][factorName] - data[index - 1][factorName]);
// 		});
// 	}
// 	// 分子分母都有 totalWeight，所以消了，因此算式里就没有 totalWeight 出现
// 	return yFactorsName.map((factorName, i) => {
// 		return deltaYFactorsSum[i] / deltaXFactorSum;
// 	})
// }

/**
 * 用于 dashboardTimer
 * 通过加权移动平均获取数值变化的速率（k 值）
 * 理想：权重取决于当前较新样本与最新样本的时间间隔：2.5s - 间隔。如果较新样本的时间间隔大于 2.5s，且已经有至少 2 个间隔样本，结束计算，更旧的数据将被忽略
 * 　　　这样设计的目的是：较频繁更新的数据使用更多的样本数，更平滑；较不频繁更新的数据使用较少的样本数，更及时
 * 　　　**但是**，理想很美好，现实并非。当数据更新频繁，高于 ffmpeg 日志报告速度，此时本身就够平滑；不频繁时，数据本身就不平滑。
 * 因此，这里并非是真的按 sampleCount 的次数计算
 */
function getKbyLWMA(data: SingleProgressLog): { K: number, sampleCount: number } {
	// xFactor：时间　yFactor：参数值
	let deltaXFactorSum = 0;
	let deltaYFactorSum = 0;
	// 对于数据，在区间 [data.length - sampleCount, data.length - 1] 内，其权重在 [1, sampleCount] 之间递增
	// 因为采样数可能大于总样本数，所以倒序遍历，先计算最大的权重（index 最大），直到无法继续计算
	let sampleCount = 0;
	for (let index = data.length - 1; index > 0; index--) {
		// const weight = Math.max(2.5 - (data[data.length - 1][0] - data[index][0]), 0);
		// if (weight <= 0 && index <= data.length - 3) break;
		const weight = (index + 1) / data.length;
		deltaXFactorSum += weight * (data[index][0] - data[index - 1][0]);
		deltaYFactorSum += weight * (data[index][1] - data[index - 1][1]);

		const weightIdeal = Math.max(2.5 - (data[data.length - 1][0] - data[index][0]), 0);
		if (weightIdeal > 0) sampleCount++;	// 尽管真实的 sampleCount 固定，这里依然返回理想的 sampleCount，用于确定平滑系数
		// sampleCount++;
	}
	// console.log('sampleCount:', sampleCount);
	// 分子分母都有 totalWeight，所以消了，因此算式里就没有 totalWeight 出现
	return {
		K: deltaYFactorSum / deltaXFactorSum,
		sampleCount,	// 间隔的样本数（不是点的样本数）
	};
}

/**
 * 对单个数据计算数据变化速率（k）和初值（b），获得该数据在指定时间的预估值（current）
 * 将对整个数组进行采样。因此如果要限定采样长度，先对数组进行裁剪处理
 * 如果不需要取 currentValue，那么 elapsedTime 可以传任意值
 */
export function calcDashboard(progressLog: SingleProgressLog, elapsedTime: number) {
	const { K, sampleCount } = getKbyLWMA(progressLog);
	const B = progressLog[progressLog.length - 1][1] - K * progressLog[progressLog.length - 1][0];	// b = y - k * x
	// const systime = new Date().getTime() / 1000;
	const currentValue = elapsedTime * K + B;
	return { K, B, currentValue, sampleCount };
}

/**
 * 计算单个任务的 dashboard 更新函数，根据计算结果原地修改 progress 和 progress_smooth
 * 由全局 timer 调用
 */
export function updateTaskDashboard(task: UITask) {
	// 找到当前正在运行的 run（从后往前找第一个 running 状态的），若无则使用最新条目
	const activeRun = task.runs[task.runs.length - 1];
	const progressLog = activeRun.progressLog;
	if (progressLog.time.length <= 1) {
		// 任务刚开始，重置 smooth 数据
		activeRun.dashboard_smooth = {
			progress: 0, bitrate: 0, speed: 0, time: 0, frame: 0, size: 0,
		};
	}
	if (progressLog.time.length <= 2) {
		// 任务刚开始时显示的数据不准确
		return;
	}

	// 去除没有发生数据变化的数据，保留最近 5 条数据的样本数（4 条间隔）
	const lastNDeduplicatedLogTime: SingleProgressLog = [];
	const lastNDeduplicatedLogFrame: SingleProgressLog = [];
	const lastNDeduplicatedLogSize: SingleProgressLog = [];
	for (let i = progressLog.time.length - 1, count = 0; i > 0 && count < 5; i--) {
		// 需要时间和尺寸都有变化的情况下才放一条尺寸数据，除非尺寸一直为 0（无输出文件）
		if (
			progressLog.time[i][1] !== progressLog.time[i - 1][1] &&
			(progressLog.size[i][1] !== progressLog.size[i - 1][1] || progressLog.size[i][1] === 0)
		) {
			lastNDeduplicatedLogSize.unshift(progressLog.size[i]);
			count++;
		}
	}
	for (let i = progressLog.time.length - 1, count = 0; i > 0 && count < 5; i--) {
		// 需要时间有变化的情况下才放一条时间、帧数据
		if (progressLog.time[i][1] !== progressLog.time[i - 1][1]) {
			lastNDeduplicatedLogTime.unshift(progressLog.time[i]);
			lastNDeduplicatedLogFrame.unshift(progressLog.frame[i]);
			count++;
		}
	}

	const elapsedTime = new Date().getTime() / 1000 - activeRun.lastStarted + activeRun.elapsed;
	const { K: frameK, B: frameB, currentValue: currentFrame, sampleCount: frameSampleCount } = calcDashboard(lastNDeduplicatedLogFrame, elapsedTime);
	const { K: timeK, B: timeB, currentValue: currentTime, sampleCount: timeSampleCount } = calcDashboard(lastNDeduplicatedLogTime, elapsedTime);
	const { K: sizeK, B: sizeB, currentValue: currentSize, sampleCount: sizeSampleCount } = calcDashboard(lastNDeduplicatedLogSize, elapsedTime);
	// console.log("frameK: " + frameK + ", timeK: " + timeK + ", sizeK: " + sizeK);
	// console.log("currentFrame: " + currentFrame + ", currentTime: " + currentTime + ", currentSize: " + currentSize);

	// 任务进度计算
	let progress: number;
	if (task.before[0].duration !== -1) {
		progress = currentTime / getOutputDuration(task);
		progress = isNaN(progress) || progress === Infinity || progress < 0 ? 0 : progress;
	} else {
		progress = 0;
	}

	// 进度细节计算
	// const afterFramerate = task.after.outputs[0]?.video.framerate === '不改变' ? task.before[0].vframerate : +task.after.outputs[0]?.video.framerate;
	if (progress < 0.999) {
		activeRun.dashboard = {
			progress,
			bitrate: (sizeK / timeK) * 8,
			// speed: frameK / afterFramerate || timeK,	// 如果可以读出帧速，或者输出的是视频，用帧速算 speed 更准确；否则用时间算 speed
			speed: timeK,
			time: currentTime,
			frame: currentFrame,
			size: currentSize,
		};

		// 平滑处理，且依据权重数放缩平滑系数。系数越高，数据越及时
		let { bitrate, speed, time, frame, size } = activeRun.dashboard_smooth;
		const [
			progressSmooth,
			bitrateSmooth,
			speedSmooth,
			timeSmooth,
			frameSmooth,
			sizeSmooth,
		] = [
			0.3 * (timeSampleCount / 4),
			0.2 * (sizeSampleCount / 4) * (timeSampleCount / 4),
			0.4 * (timeSampleCount / 4),
			0.3 * (timeSampleCount / 4),
			0.3 * (frameSampleCount / 4),
			0.1 * (sizeSampleCount / 4),
		];
		// if (activeRun.dashboard.bitrate < 0) debugger;
		progress = progress * (1 - progressSmooth) + activeRun.dashboard.progress * progressSmooth;
		bitrate  = bitrate * (1 - bitrateSmooth) + activeRun.dashboard.bitrate * bitrateSmooth;
		speed    = speed * (1 - speedSmooth) + activeRun.dashboard.speed * speedSmooth;
		time     = time * (1 - timeSmooth) + activeRun.dashboard.time * timeSmooth;
		frame    = frame * (1 - frameSmooth) + activeRun.dashboard.frame * frameSmooth;
		size    = size * (1 - sizeSmooth) + activeRun.dashboard.size * sizeSmooth;
		// TaskItem 中剩余时间的计算与 speed 和 time 相关
		if (isNaN(bitrate) || bitrate == Infinity) { bitrate = 0 }
		if (isNaN(speed)) { speed = 0 }
		if (isNaN(time)) { time = 0 }
		if (isNaN(frame)) { frame = 0 }
		if (isNaN(size)) { size = 0 }
		activeRun.dashboard_smooth = { ...activeRun.dashboard_smooth, progress, bitrate, speed, time, frame, size };
	} else {
		// 进度满了就别更新了
		activeRun.dashboard.progress = 1;
	}
	// task.progress_smooth = Object.assign({}, task.progress_smooth);
}
