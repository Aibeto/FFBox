<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAppStore } from '../../stores/appStore';
import Button, { ButtonType } from '../../components/Button/Button';
import Checkbox from '../../components/Checkbox/Checkbox.vue';
import Popup from '../../components/Popup/Popup';
import Msgbox from '../../components/Msgbox/Msgbox';

type Releases = {
	tag_name: string;	// v1.0 v1.1 v2.0 v2.1 v2.2 v2.3 v2.4 v2.5 v2.6 v3.0 v4.0 v4.1 v4.2 v4.3 v4.4 v4.5
	created_at: string;
	assets: {
		name: string;	// Linux_x86-64_FFBoxService+webUI_4.5.zip
		download_count: number;
	}[];
}[];
type ProcessedRelease = {
	tag: string;
	created_at: string;
	total: number;
	osCount: { [os: string]: number };        // Windows, macOS, Linux
	osClientCount: { [os: string]: number };  // 只包含客户端的部分
};


const appStore = useAppStore();
const processedReleases = ref<ProcessedRelease[]>();
const canvas1Ref = ref();
const canvas2Ref = ref();
const canvas3Ref = ref();
const showByTimeRatio = ref(true);
const showByTimeRatioRatio = ref(1);
const showByTimeRatioTimer = ref();

const resizeListener = ref<EventListener>();

const isDark = computed(() => appStore.colorTheme === 'themeDark');

// 获取刻度线间隔
const getScaleUnit = (total: number, viewWidth: number, isClockUnit = false, threshold = 100, min = 1) => {
	if (total <= 0) {
		return min;
	}
	let currentScale = min;
	let step = 0;
	while (viewWidth / (total / currentScale) < threshold) {	// 如果按当前 scale 分割后产出的刻度线间隔不足阈值，那么降低密度
		if (isClockUnit) {
			currentScale *= [2, 2.5, 2, 1.5, 2, 2][step % 6];	// 1 2 5 10 15 30 60
		} else {
			currentScale *= [2, 2.5, 2][step % 3];	// 1 2 5 10
		}
		step++;
	}
	return currentScale;
};

const render = () => {
	if (!processedReleases.value?.length) {
		return;
	}
	// ========== 公共画布函数 ==========
	const drawChart = (ctx: CanvasRenderingContext2D, dataSeries: { label: string, values: number[], color: string, dashed?: boolean, filled?: boolean }[], tags: string[], positions: number[], unitFormatter = (v: number) => v.toFixed(0)) => {
		const canvas = ctx.canvas;
		const width = canvas.width / window.devicePixelRatio;
		const height = canvas.height / window.devicePixelRatio;
		const paddingLeft = 60;
		const paddingRight = 20;
		const paddingBottom = 20;
		const topMargin = 0;

		ctx.clearRect(0, 0, width, height);

		// 横轴
		const xStep = (width - paddingLeft - paddingRight) / (tags.length - 1);

		// 纵轴范围（自动缩放）
		const allValues = dataSeries.flatMap(ds => ds.values);
		const maxY = Math.max(...allValues) * 1.1;  // 增加一点空间
		const yStep = getScaleUnit(maxY, height, false, 40, 0.1);

		// === 画纵轴刻度 ===
		ctx.strokeStyle = '#7777';
		ctx.fillStyle = isDark.value ? '#eee' : '#333';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		ctx.font = '14px sans-serif';

		for (let yVal = 0; yVal <= maxY; yVal += yStep) {
			const y = height - paddingBottom - yVal / maxY * (height - paddingBottom - topMargin);
			ctx.beginPath();
			ctx.moveTo(paddingLeft, y);
			ctx.lineTo(width, y);
			ctx.stroke();
			ctx.fillText(unitFormatter(yVal), paddingLeft - 10, y);
		}

		// === 画横轴标签 ===
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		tags.forEach((tag, i) => {
			const x = paddingLeft + (positions ? positions[i] * (width - paddingLeft - paddingRight) : i * xStep);
			ctx.fillText(tag, x, height - paddingBottom + 8);
		});

		// === 画每条数据线 ===
		for (const series of dataSeries) {
			ctx.beginPath();
			series.values.forEach((val, i) => {
				const x = paddingLeft + (positions ? positions[i] * (width - paddingLeft - paddingRight) : i * xStep);
				const y = height - paddingBottom - val / maxY * (height - paddingBottom - topMargin);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.strokeStyle = series.color;
			ctx.lineWidth = 2;
			if (series.dashed) ctx.setLineDash([6, 4]);
			else ctx.setLineDash([]);
			ctx.stroke();

			// 填充
			if (series.filled) {
				ctx.lineTo(width - paddingRight, height - paddingBottom);
				ctx.lineTo(paddingLeft, height - paddingBottom);
				ctx.closePath();
				ctx.fillStyle = series.color.replace('rgb', 'rgba').replace(')', ', 0.2)');
				ctx.fill();
			}
		}
	};

	const tags = processedReleases.value.map(p => p.tag);
	const dates = processedReleases.value.map(p => new Date(p.created_at));
	const minTime = dates[0].getTime();
	const maxTime = dates[dates.length - 1].getTime();
	const timeSpan = maxTime - minTime;
	const positions0 = dates.map(d => (d.getTime() - minTime) / timeSpan);
	const positions1 = processedReleases.value.map((_, i) => i / (tags.length - 1));
	const positions = dates.map((_, i) => positions0[i] * showByTimeRatioRatio.value + positions1[i] * (1 - showByTimeRatioRatio.value))
	// ========== 图 1：下载量趋势 + 变化量 ==========
	const totals = processedReleases.value.map(p => p.total);
	const dailyAverages = processedReleases.value.map((p, i) => {
		const currentDate = new Date(p.created_at);
		const nextDate = new Date(i === processedReleases.value.length - 1 ? Date.now() : processedReleases.value[i + 1].created_at);
		const months = (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
		return p.total / months;
	});
	// dailyAverages.push(0); // 最后一个版本无法计算日均，补 0

	drawChart(canvas1Ref.value.getContext('2d')!, [
		{ label: '总下载量', values: totals, color: 'rgb(0,128,255)', filled: true },
		{ label: '平均月下载量', values: dailyAverages, color: 'rgb(128,128,128)', dashed: true },
	], tags, positions);

	// ========== 图 2：操作系统占比 ==========
	const osList = ['Windows', 'macOS', 'Linux'];
	const osRatios = osList.map(os => ({
		label: os,
		values: processedReleases.value.map(p => p.total ? p.osCount[os] / p.total : 0),
		color: os === 'Windows' ? 'red' : os === 'macOS' ? 'green' : 'orange',
	}));

	drawChart(canvas2Ref.value.getContext('2d')!, osRatios, tags, positions, v => (v * 100).toFixed(1) + '%');

	// ========== 图 3：客户端使用率 ==========
	const clientRatios = osList.map(os => ({
		label: os,
		values: processedReleases.value.map(p => p.osCount[os] ? p.osClientCount[os] / p.osCount[os] : 1),
		color: os === 'Windows' ? 'red' : os === 'macOS' ? 'green' : 'orange',
	}));

	drawChart(canvas3Ref.value.getContext('2d')!, clientRatios, tags, positions, v => (v * 100).toFixed(1) + '%');
}

const handleSetShowByTimeRatio = () => {
	showByTimeRatio.value = !showByTimeRatio.value;
	if (showByTimeRatioTimer.value) {
		return;
	}
	showByTimeRatioTimer.value = setInterval(() => {
		if (showByTimeRatio.value === false && showByTimeRatioRatio.value <= 0 || showByTimeRatio.value === true && showByTimeRatioRatio.value >= 1) {
			clearInterval(showByTimeRatioTimer.value);
			showByTimeRatioTimer.value = 0;
		}
		showByTimeRatioRatio.value += showByTimeRatio.value ? 0.01 : -0.01;
		render();
	}, 13);
}

onMounted(() => {
	fetch('./releases.json').then(async (res) => {
		const releases = await res.json() as Releases;
		releases.reverse();

		/**
		 * 请生成以下几个图表：
		 * 
		 * 1.
		 * 各版本下载量趋势（以折线图和低透明度填充显示）以及各版本间下载量的变化量（以虚线折线表示）。
		 * 版本号已在 releases 的 tag_name 里全部列出，你可选择直接用这个版本名列表，或是根据规律做一个查找器。
		 * 每个版本的下载量是 assets 中全部项的 download_count 总和。
		 * 
		 * 2.
		 * 操作系统占比折线图
		 * 操作系统有“Windows”、“macOS”、“Linux”，这三者会出现在 assets[].name 的字符串中。每个操作系统会出现不止一次，记得遍历整个列表计数。方法是[当前版本某系统下载量总和]/[当前版本下载量总和]
		 * Windows 操作系统有特例。name 中可能并不是出现“Windows”，而是“FFBox_Installation_”
		 * 
		 * 3.
		 * 使用客户端的占比
		 * 只要 assets.name 不包含“Service”即统计入“客户端”
		 * 对于“Windows”、“macOS”、“Linux”三个操作系统分别统计。方法是[当前版本某系统客户端下载量总和]/[当前版本某系统下载量总和]
		 */

		// 绘画所用的代码风格可以参考下文，也可以不参考，因为 horizontalMax 这些在下文是根据 type.value 选其中之一，但现在我们不要选，而是要画出所有图表

		// 上面这段是给 ChatGPT 的 prompt，如果你看到了这段注释，祝你每天开心 :-)
		// 不过后面改了点东西

		const processed: ProcessedRelease[] = [];

		for (const release of releases) {
			const osCount = { Windows: 0, macOS: 0, Linux: 0 };
			const osClientCount = { Windows: 0, macOS: 0, Linux: 0 };
			let total = 0;

			for (const asset of release.assets) {
				const name = asset.name;
				const count = asset.download_count;
				total += count;

				// 识别操作系统
				let os = '';
				if (name.includes('macOS')) os = 'macOS';
				else if (name.includes('Linux')) os = 'Linux';
				else if (name.includes('FFBox_Installation_') || name.includes('Windows')) os = 'Windows';

				if (os) {
					osCount[os] += count;
					if (!name.includes('Service')) {
						osClientCount[os] += count;
					}
				}
			}

			processed.push({
				tag: release.tag_name,
				created_at: release.created_at,
				total,
				osCount,
				osClientCount,
			});
		}
		processedReleases.value = processed;
		// console.log(releases, processed);
		render();
	});

	// 窗口大小变化监听
	resizeListener.value = () => {
		const bounding = canvas1Ref.value.parentElement.getBoundingClientRect();
		canvas1Ref.value.width = bounding.width * window.devicePixelRatio;
		canvas1Ref.value.height = bounding.height * window.devicePixelRatio;
		canvas1Ref.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
		canvas2Ref.value.width = bounding.width * window.devicePixelRatio;
		canvas2Ref.value.height = bounding.height * window.devicePixelRatio;
		canvas2Ref.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
		canvas3Ref.value.width = bounding.width * window.devicePixelRatio;
		canvas3Ref.value.height = bounding.height * window.devicePixelRatio;
		canvas3Ref.value.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
		render();
	};
	window.addEventListener('resize', resizeListener.value);
	resizeListener.value(null);
});
onUnmounted(() => {
	window.removeEventListener('resize', resizeListener.value);
	resizeListener.value = undefined;
	clearInterval(showByTimeRatioTimer.value);
})

</script>

<template>
	<div class="downloadStatistics">
		<div id="downloadStatisticsLoading" v-if="!processedReleases?.length">正在加载</div>
		<p>以下数据统计自 GitHub，每小时更新</p>
		<Button class="checkButton" @click="handleSetShowByTimeRatio">
			<Checkbox :checked="showByTimeRatio" />
			<span>按时间缩放</span>
		</Button>
		<h2>
			版本下载量
			<div>
				<i style="border-color: rgb(0,128,255); background-color: rgba(0,128,255,0.2);"></i>下载数
				<i style="border-color: gray; border-style: dashed;"></i>30 天平均下载数
			</div>
		</h2>
		<div class="canvasWrapper">
			<canvas ref="canvas1Ref" />
		</div>
		<h2>
			操作系统占比
			<div>
				<i style="border-color: red;"></i>Windows
				<i style="border-color: orange;"></i>Linux
				<i style="border-color: green;"></i>macOS
			</div>
		</h2>
		<div class="canvasWrapper">
			<canvas ref="canvas2Ref" />
		</div>
		<h2>
			客户端使用比例
			<div>
				<i style="border-color: red;"></i>Windows
				<i style="border-color: orange;"></i>Linux
				<i style="border-color: green;"></i>macOS
			</div>
		</h2>
		<div class="canvasWrapper">
			<canvas ref="canvas3Ref" />
		</div>
	</div>
</template>

<style scoped lang="less">
	.downloadStatistics {
		position: relative;
		padding: 0 5% 16px;
		text-align: left;
		font-size: 14px;
		.checkButton {
			&>div {
				vertical-align: middle;
			}
			&>span {
				margin-left: 4px;
				vertical-align: middle;
			}
		}
		h2 {
			&>div {
				display: inline-block;
				font-size: 0.5em;
				opacity: 0.5;
				margin-left: 1em;
				i {
					display: inline-block;
					width: 0.5em;
					height: 0.5em;
					margin: 0 0.3em 0 1em;
					border: red 1.5px solid;
				}
			}

		}
		.canvasWrapper {
			position: relative;
			width: calc(100% - 16px);
			height: 400px;
			canvas {
				width: 100%;
				height: 100%;
			}
		}
	}
</style>
