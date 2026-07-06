<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { SingleProgressLog, TaskStatus } from '@common/types';
import { getOutputDuration } from '@common/utils';
import { calcDashboard } from '@renderer/common/dashboardCalc';
import { getScaleUnit } from '@renderer/common/utils';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';
import RockerSwitch from '@renderer/components/RockerSwitch/RockerSwitch.vue';
import TaskInfoTitle from './TaskInfoTitle.vue';

type ChartType = 'progress' | 'size' | 'bitrate' | 'speed';

const appStore = useAppStore();
const selectedTasks = computed(() => appStore.selectedTask.size === 0 || !appStore.currentServer
	? { task: undefined, count: 0 }
	: { task: appStore.getTaskById([...appStore.selectedTask][0]), count: appStore.selectedTask.size }
);
const chartType = computed(() => (appStore.showTaskInfo?.[2] ?? 'progress') as ChartType);
const maxDensity = ref(400);

const canvasRef = ref<HTMLCanvasElement>();

const totalTime_smooth = ref(10);	// 预计转码总耗时
const totalSize_smooth = ref(1000);	// 以字节为单位的预计输出大小
const totalTransferTime_smooth = ref(10);	// 预计传输总耗时
let refreshTimer = 0;
let rendering = 0;	// 0: 空闲　1: 渲染中　2: 渲染中重复调用 render 时变为此值，当前渲染完成后马上进行下一轮渲染　　本设计暂时无用，因为代码逻辑是同步渲染

const isDark = computed(() => appStore.frontendSettings.colorTheme === 'themeDark');

const outputDuration = computed(() => selectedTasks.value.task ? getOutputDuration(selectedTasks.value.task) : 0);

// 获取当前选中的 run（使用任务的 selectedRunIndex）
const activeRun = computed(() => {
	const task = selectedTasks.value.task;
	if (!task) return undefined;
	return task.runs[task.selectedRunIndex];
});
// 获取当前选中的 run 的 progressLog
const activeProgressLog = computed(() =>  activeRun.value?.progressLog);

// 4 个 tab
const selectionList = computed(() => {
	const disableNormalChart = !selectedTasks.value.task || (activeProgressLog.value?.time.length ?? 0) <= 1;
	// const disableTransferChart = selectedTasks.value.task.transferProgressLog.transferred.length <= 1;
	return [
		{ value: 'progress', caption: '进度', disabled: disableNormalChart },
		{ value: 'size', caption: '数据量', disabled: disableNormalChart },
		{ value: 'bitrate', caption: '码率分布', disabled: disableNormalChart },
		{ value: 'speed', caption: '速度分布', disabled: disableNormalChart },
	] as RadioListProps['list']
});

// #region 数据处理

// 进度图表数据。横轴为转码时间，纵轴为进度百分比
const lowDensityProgressData = computed(() => {
	// console.time('lowDensityProgressData');
	const data: { x: number, y: number }[] = [];
	const progressLog = activeProgressLog.value;
	if (!progressLog?.time.length) return [];
	const lastTime = progressLog.time[progressLog.time.length - 1][1];
	const step = Math.max(1, (progressLog?.time.length ?? 0) / maxDensity.value / (lastTime / outputDuration.value));	// time 数据量 ÷ 最大密度 ÷ 已运行比例

	for (let f = 0; Math.round(f) < (progressLog?.time.length ?? 0); f+= step) {
		const i = Math.round(f);
		const x = progressLog.time[i][0];
		const y = progressLog.time[i][1] / outputDuration.value * 100;
		data.push({ x, y });
	}
	// console.timeEnd('lowDensityProgressData');
	return data;
});

// 尺寸图表数据。横轴为媒体时间，纵轴为尺寸
const lowDensitySizeData = computed(() => { 
	// console.time('lowDensitySizeData');
	const data: { x: number, y: number }[] = [];
	const progressLog = activeProgressLog.value;
	if (!progressLog?.size.length) return [];
	const lastTime = progressLog.time[progressLog.time.length - 1][1];
	const step = Math.max(1, (progressLog?.size.length ?? 0) / maxDensity.value / (lastTime / outputDuration.value));	// size 数据量 ÷ 最大密度 ÷ 已运行比例

	let lastSize = progressLog.size[0][1];
	for (let f = 0; Math.round(f) < progressLog.size.length; f+= step) {
		const i = Math.round(f);
		const x = progressLog.time[i][1];	// 媒体时间
		const y = progressLog.size[i][1];	// 尺寸
		if (y !== lastSize) {
			lastSize = y;
			data.push({ x, y });
		}
	}
	// console.timeEnd('lowDensitySizeData');
	return data;
});

// 码率图表数据。横轴为媒体时间两点之间的中间值，纵轴为变化尺寸/变化时间。单位为 kb/s
const lowDensityBitrateData = computed(() => { 
	// console.time('lowDensityBitrateData');
	const data: { x: number, y: number }[] = [];
	const progressLog = activeProgressLog.value;
	if (!progressLog?.size.length) return { data, maxY: 0 };
	const lastTime = progressLog.time[progressLog.time.length - 1][1];
	const step = Math.max(1, (progressLog?.size.length ?? 0) / maxDensity.value / (lastTime / outputDuration.value));	// size 数据量 ÷ 最大密度 ÷ 已运行比例

	let lastSize = progressLog.size[0][1];
	let lastMediaTime = progressLog.time[0][1];
	let maxBitrate = 0;
	for (let f = step; Math.round(f) < progressLog.size.length; f+= step) {
		const i = Math.round(f);
		if (progressLog.size[i][1] === lastSize || progressLog.time[i][1] <= lastMediaTime) continue;	// 第二个条件的原因：即使尺寸变化，时间也有可能不变，甚至倒退
		const x = (progressLog.time[i][1] + lastMediaTime) / 2;	// 中点媒体时间
		const y = (progressLog.size[i][1] - lastSize) / (progressLog.time[i][1] - lastMediaTime);	// 变化尺寸/变化时间
		if (y === Infinity) debugger;
		lastSize = progressLog.size[i][1];
		lastMediaTime = progressLog.time[i][1];
		maxBitrate = y > maxBitrate ? y : maxBitrate;
		data.push({ x, y });
	}
	// console.timeEnd('lowDensityBitrateData');
	return { data, maxY: maxBitrate };
});

const lowDensitySpeedData = computed(() => { 
	// console.time('lowDensitySpeedData');
	const data: { x: number, y: number }[] = [];
	const progressLog = activeProgressLog.value;
	if (!progressLog?.time.length) return { data, maxY: 0 };
	const lastTime = progressLog.time[progressLog.time.length - 1][1];
	const step = Math.max(1, (progressLog?.time.length ?? 0) / maxDensity.value / (lastTime / outputDuration.value));	// time 数据量 ÷ 最大密度 ÷ 已运行比例

	let lastRealTime = progressLog.time[0][0];
	let lastMediaTime = progressLog.time[0][1];
	let maxSpeed = 0;
	for (let f = step; Math.round(f) < progressLog.time.length; f+= step) {
		const i = Math.round(f);
		const x = (progressLog.time[i][1] + lastMediaTime) / 2;	// 中点媒体时间
		const y = (progressLog.time[i][1] - lastMediaTime) / (progressLog.time[i][0] - lastRealTime);	// 变化媒体时间/变化现实时间
		lastRealTime = progressLog.time[i][0];
		lastMediaTime = progressLog.time[i][1];
		maxSpeed = y > maxSpeed ? y : maxSpeed;
		data.push({ x, y });
	}
	// console.timeEnd('lowDensitySpeedData');
	return { data, maxY: maxSpeed };
});

// #endregion 数据处理

// #region 字符串 filter

const graphSizeFilter = (kB: number) => {
	const B = kB * 1000;
	if (appStore.frontendSettings?.useIEC) {
		if (B >= 10 * 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(1) + ' GiB';
		} else if (B >= 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(2) + ' GiB';
		} else if (B >= 100 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(0) + ' MiB';
		} else if (B >= 10 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(1) + ' MiB';
		} else {
			return (B / 1024 ** 2).toFixed(2) + ' MiB';
		}
	} else {
		if (B >= 10 * 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(1) + ' GB';
		} else if (B >= 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(2) + ' GB';
		} else if (B >= 100 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(0) + ' MB';
		} else if (B >= 10 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(1) + ' MB';
		} else {
			return (B / 1000 ** 2).toFixed(2) + ' MB';
		}
	}
};
const beforeBitrateFilter = (kbps: number) => {
	if (isNaN(kbps)) {
		return '读取中';
	} else {
		const bps = kbps * 1000;
		if (appStore.frontendSettings?.useIEC) {
			if (bps >= 10 * 1024 ** 2) {
				return (bps / 1024 ** 2).toFixed(1) + ' Mibps';
			} else {
				return (bps / 1024).toFixed(0) + ' kibps';
			}
		} else {
			if (bps >= 10 * 1000 ** 2) {
				return (bps / 1000 ** 2).toFixed(1) + ' Mbps';
			} else {
				return (bps / 1000).toFixed(0) + ' kbps';
			}
		}
	}
};
const transferrateFilter = (Bps: number) => {
	if (appStore.frontendSettings?.useIEC) {
		if (Bps >= 10 * 1024 ** 2) {
			return (Bps / 1024 ** 2).toFixed(1) + ' MiBps';
		} else {
			return (Bps / 1024).toFixed(0) + ' kiBps';
		}
	} else {
		if (Bps >= 10 * 1000 ** 2) {
			return (Bps / 1000 ** 2).toFixed(1) + ' MBps';
		} else {
			return (Bps / 1000).toFixed(0) + ' kBps';
		}
	}
}
const timeFilter = (value: number, withDecimal = true) => {
	let left = value;
	let hour = Math.floor(left / 3600); left -= hour * 3600;
	let minute = Math.floor(left / 60); left -= minute * 60;
	let second = left;
	if (hour) {
		return `${hour}:${minute.toString().padStart(2, '0')}:${second.toFixed(0).toString().padStart(2, '0')}`;
	} else if (minute) {
		return `${minute}:${withDecimal ? second.toFixed(1).padStart(4, '0') : second.toFixed(0).padStart(2, '0')}`;
	} else {
		return withDecimal ? second.toFixed(2) : `${second.toFixed(0)} s`;
	}
};

// #endregion

const getLastSpeedBitrate = () => {
	const progressLog = activeProgressLog.value!;

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
			// 注意这里是 [媒体时间, 尺寸]
			lastNDeduplicatedLogSize.unshift([progressLog.time[i][1], progressLog.size[i][1]]);
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
	if (!lastNDeduplicatedLogSize.length || !lastNDeduplicatedLogTime.length) return {
		speed: 0,
		bitrate: 0,
	}

	// const { K: frameK, B: frameB, currentValue: currentFrame } = calcDashboard(lastNDeduplicatedLogFrame, 0);
	const { K: timeK, B: timeB, currentValue: currentTime } = calcDashboard(lastNDeduplicatedLogTime, 0);
	const { K: sizeK, B: sizeB, currentValue: currentSize } = calcDashboard(lastNDeduplicatedLogSize, 0);
	// const afterFramerate = task.after.outputs[0]?.video.framerate === '不改变' ? task.before[0]?.vframerate : +task.after.outputs[0]?.video.framerate;
	return {
		// speed: frameK / afterFramerate || timeK,	// 媒体时间相对真实时间。如果可以读出帧速，或者输出的是视频，用帧速算 speed 更准确；否则用时间算 speed
		speed: timeK,
		bitrate: sizeK * 8,	// 尺寸变化相对媒体时间
	}
};
/** 最大时间/尺寸的计算方法是：现在已经累积的转码时长/输出尺寸 + 根据最新速度和剩余任务时长算出的预计增量 */
const getEstimatedMaxTimeSize = () => {
	const lastSpeedBitrate = getLastSpeedBitrate();
	if (lastSpeedBitrate.speed === 0 || lastSpeedBitrate.bitrate === 0) return {
		// 避免除以 0，给一个默认值
		time: 10,
		size: 1000,
	}
	const run = activeRun.value!;
	const progressLog = activeProgressLog.value!;
	const elapsedTime = run.elapsed + (run.status === TaskStatus.running ? new Date().getTime() / 1000 - run.lastStarted : 0);
	// 任务最新进度的时间和大小
	const currentTime = progressLog.time.length > 0 ? progressLog.time[progressLog.time.length - 1][1] : 0;
	const currentSize = progressLog.size.length > 0 ? progressLog.size[progressLog.size.length - 1][1] : 0;
	return {
		time: elapsedTime + (outputDuration.value - currentTime) / lastSpeedBitrate.speed,
		size: currentSize + (outputDuration.value - currentTime) * lastSpeedBitrate.bitrate * 0.125,	// size 的单位是 kB，bitrate 的单位是 kbps
	};
};

const refreshEstimatedMaxTimeSize = (instant?: boolean) => { 
	if (!activeProgressLog.value || activeProgressLog.value.time.length < 2) return;
	const latestMaxTimeSize = getEstimatedMaxTimeSize();
	if (instant) {
		totalTime_smooth.value = latestMaxTimeSize.time;
		totalSize_smooth.value = latestMaxTimeSize.size;
		return;
	} else {
		totalTime_smooth.value = totalTime_smooth.value * 0.92 + latestMaxTimeSize.time * 0.08;
		totalSize_smooth.value = totalSize_smooth.value * 0.92 + latestMaxTimeSize.size * 0.08;
	}
};

const render = () => {
	const canvasWidth = canvasRef.value!.width / window.devicePixelRatio;
	const canvasHeight = canvasRef.value!.height / window.devicePixelRatio;
	const context = canvasRef.value!.getContext('2d')!;
	const progressLog = activeProgressLog.value!;

	const task = selectedTasks.value.task;
	if (!task) {
		context.clearRect(0, 0, canvasWidth, canvasHeight);
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = isDark.value ? '#eee' : '#333'; // 字体颜色
		context.font = '14px 华文中宋';
		context.fillText('未选中任务', canvasWidth / 2, canvasHeight / 2);
		return;
	}
	// if (rendering === 1) {
	// 	rendering = 2;
	// }
	// if (rendering) {
	// 	return;
	// }
	// rendering = 1;

	// 更新横纵轴端点
	if ((progressLog?.frame.length ?? 0) >= 5 && (progressLog?.size.length ?? 0) >= 2) {
		refreshEstimatedMaxTimeSize();
	}
	
	// 绘画准备
	const horizontalMax = [totalTime_smooth.value, outputDuration.value, outputDuration.value, outputDuration.value][
		['progress', 'size', 'bitrate', 'speed'].indexOf(chartType.value)
	];
	const horizontalUnit = getScaleUnit(horizontalMax, canvasWidth, true, 70);
	let verticalMax = [100, totalSize_smooth.value, lowDensityBitrateData.value.maxY, lowDensitySpeedData.value.maxY][
		['progress', 'size', 'bitrate', 'speed'].indexOf(chartType.value)
	];
	if (verticalMax < 0.1001) verticalMax = 0.1001;
	const verticalUnit = getScaleUnit(verticalMax, canvasHeight, false, 40, chartType.value === 'speed' ? 0.01 : 1);

	context.clearRect(0, 0, canvasWidth, canvasHeight);

	// 横坐标和刻度线
	context.strokeStyle = '#77777777'; // 线颜色
	context.lineWidth = 1;
	context.textAlign = 'center';
	context.textBaseline = 'top';
	context.fillStyle = isDark.value ? '#eee' : '#333'; // 字体颜色
	context.font = '14px 华文中宋 black';
	for (let value = 0; value < horizontalMax; value += horizontalUnit) {
		const x = (value / horizontalMax) * (canvasWidth - 100) + 100;
		context.beginPath();
		context.moveTo(x, 0);
		context.lineTo(x, canvasHeight - 30);
		context.stroke();
		context.fillText(timeFilter(value, false), x, canvasHeight - 30 + 8);
	}

	// 纵坐标
	context.textAlign = 'right';
	context.textBaseline = 'middle';
	context.fillStyle = isDark.value ? '#eee' : '#333'; // 字体颜色
	context.font = '14px 华文中宋 black';
	for (let value = 0; value < verticalMax; value += verticalUnit) {
		const y = (1 - value / verticalMax) * (canvasHeight - 30);
		const displayText = [
			value + '%',
			graphSizeFilter(value),
			beforeBitrateFilter(value),
			(value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1) : value.toFixed(2)) + '×',
			value + '%',
			transferrateFilter(value)
		][
			['progress', 'size', 'bitrate', 'speed', 'transferProgress', 'transferSpeed'].indexOf(chartType.value)
		];
		context.fillText(displayText, 100 - 8, y);
	}

	// 点
	context.lineWidth = 1.5;
	if (chartType.value === 'progress') {
		const data = lowDensityProgressData.value;
		if (!data.length) return;
		context.fillStyle = '#4499EE33';
		context.strokeStyle = '#4499EE';
		context.beginPath();
		for (let i = 0; i < data.length; i++) {
			const x = (data[i].x / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - data[i].y / verticalMax) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = data[data.length - 1].x / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(100, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'size') {
		const data = lowDensitySizeData.value;
		if (!data.length) return;
		context.fillStyle = '#9955EE33';
		context.strokeStyle = '#9955EE';
		context.beginPath();
		for (let i = 0; i < data.length; i++) {
			const x = (data[i].x / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - data[i].y / verticalMax) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = data[data.length - 1].x / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(100, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'bitrate') {
		const data = lowDensityBitrateData.value.data;
		if (!data.length) return;
		context.fillStyle = '#66BB3333';
		context.strokeStyle = '#66BB33';
		context.beginPath();
		for (let i = 0; i < data.length; i++) {
			const x = (data[i].x / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - data[i].y / verticalMax) * (canvasHeight - 30);
			context.lineTo(x, y);
		}
		context.stroke();
		const lastX = data[data.length - 1].x / horizontalMax * (canvasWidth - 100) + 100;
		const firstX = data[0].x / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(firstX, canvasHeight - 30);
		context.fill();
	} else if (chartType.value === 'speed') {
		const data = lowDensitySpeedData.value.data;
		if (!data.length) return;
		context.fillStyle = '#DD884433';
		context.strokeStyle = '#DD8844';
		context.beginPath();
		for (let i = 0; i < data.length; i++) {
			const elem = data[i];
			const x = (elem.x / horizontalMax) * (canvasWidth - 100) + 100;
			const y = (1 - elem.y / verticalMax) * (canvasHeight - 30);
			if (i === 0) {
				context.moveTo(x, y);
			} else {
				context.lineTo(x, y);
			}
		}
		context.stroke();
		const lastX = data[data.length - 1].x / horizontalMax * (canvasWidth - 100) + 100;
		const firstX = data[0].x / horizontalMax * (canvasWidth - 100) + 100;
		context.lineTo(lastX, canvasHeight - 30);
		context.lineTo(firstX, canvasHeight - 30);
		context.fill();
	}
	// if (rendering === 2) {
	// 	rendering = 0;
	// 	render();
	// }
	// rendering = 0;
};

let resizeObserver: ResizeObserver | null = null;
const updateSize = () => {
	if (!canvasRef.value) return;
	const bounding = canvasRef.value.parentElement!.getBoundingClientRect();
	canvasRef.value.width = bounding.width * window.devicePixelRatio;
	canvasRef.value.height = bounding.height * window.devicePixelRatio;
	canvasRef.value.getContext('2d')!.scale(window.devicePixelRatio, window.devicePixelRatio);
	render();
};

onMounted(async () => {
	// 窗口大小变化监听
	await nextTick();
	updateSize();
	if (canvasRef.value) {
		resizeObserver = new ResizeObserver(() => updateSize());
		resizeObserver.observe(canvasRef.value.parentElement!);
	}
	// resizeListener.value = () => {
	// 	const bounding = canvasRef.value.parentElement.getBoundingClientRect();
	// 	canvasRef.value.width = bounding.width * window.devicePixelRatio;
	// 	canvasRef.value.height = bounding.height * window.devicePixelRatio;
	// 	canvasRef.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
	// };
	// window.addEventListener('resize', resizeListener.value);
	// resizeListener.value(null);

	// 刷新
	refreshTimer = setInterval(render, 50) as any;
});

onBeforeUnmount(() => {
	clearInterval(refreshTimer);
	// window.removeEventListener('resize', resizeListener.value);
	if (resizeObserver && canvasRef.value) {
		resizeObserver.unobserve(canvasRef.value.parentElement!);
	}
})

watch(() => activeProgressLog.value, () => {
	if (activeProgressLog.value) refreshEstimatedMaxTimeSize(true);
	render();
})
const handleDensityChange = (mode: '+' | '-') => {
	if (mode === '+' && maxDensity.value < (activeProgressLog.value?.time.length ?? 0)) {
		maxDensity.value *= 2;
	} else if (mode === '-') {
		maxDensity.value /= 2;
		while (maxDensity.value > 50 && maxDensity.value >= (activeProgressLog.value?.time.length ?? 0)) {
			maxDensity.value /= 2;
		}
	}
}

</script>

<template>
	<div class="ffmpegLog">
		<TaskInfoTitle :task="selectedTasks.task" />
		<div class="container">
			<div class="canvasContainer">
				<canvas ref="canvasRef" />
			</div>
			<div class="controls">
				<div class="space"></div>
				<RadioList class="radioList" :list="selectionList" :value="chartType" @change="(value) => appStore.showTaskInfo![2] = value" />
				<div class="space">
					<RockerSwitch
						v-if="true"
						class="rockerSwitch"
						size="m"
						:label="`图表密度：${maxDensity}${maxDensity >= (activeProgressLog?.time.length ?? 0) ? '（最大）' : ''}`"
						:disabled-left="maxDensity <= 50 || !activeProgressLog?.time.length"
						:disabled-right="maxDensity >= (activeProgressLog?.time.length ?? 0)"
						@left="handleDensityChange('-')"
						@right="handleDensityChange('+')"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style lang="less" scoped>
	.ffmpegLog {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		.container {
			position: relative;
			width: 100%;
			height: 100%;
			box-sizing: border-box;
			display: flex;
			flex-direction: column;
			// outline: red 1px solid;
			.canvasContainer {
				position: absolute;
				top: 0;
				left: 12px;
				right: 12px;
				bottom: 44px;
				canvas {
					width: 100%;
					height: 100%;
				}
			}
			.controls {
				position: absolute;
				bottom: 12px;
				height: 32px;
				width: 100%;
				display: flex;
				justify-content: stretch;
				.space {
					flex: 1 1 1px;
					display: flex;
					justify-content: right;
					align-items: center;
					.rockerSwitch {
						width: max-content;
						margin-right: 8px;
					}
				}
				.radioList {
					min-height: unset;
					height: 32px;
					flex-direction: row;
				}
			}
		}
	}
</style>