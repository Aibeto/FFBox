<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useAppStore } from '../stores/appStore';
import Button, { ButtonType } from '../components/Button/Button';
import Popup from '../components/Popup/Popup';
import Msgbox from '../components/Msgbox/Msgbox';
import MenuCenter from './MenuCenter.vue';
import MobileScreen from './MobileScreen.vue';
import IconPointOut from '../assets/warnings/pointOut.svg?component';

const appStore = useAppStore();

const windowWidth = ref(0);
const bigDownloadButtonZoomValue = ref(1);
const showBigDownloadButton = ref(false);

const FFBoxTopWrapperStyle = computed(() => {
	if (appStore.showMenuCenter) {
		return {
			top: `calc(10vh + 40px)`,
		};
	} else {
		return {
			top: 'calc(0vh + 450px)',
		};
	}
});

const handleTopBarButtonClicked = (index: number) => {
	if (index === 0) {
		// 更新说明
		appStore.showMenuCenter = 2;
		appStore.selectedPanelIndex = 0;
	} else if (index === 1) {
		// 开发日志
		window.open('https://github.com/ttqftech/FFBox/blob/4.0%2B/日志.md', '_blank');
	} else if (index === 2) {
		// 使用条款
		appStore.showMenuCenter = 2;
		appStore.selectedPanelIndex = 3;
	} else if (index === 3) {
		// 网页版
		if (!appStore.termsAgreed) {
			Popup({
				message: '请先同意条款后再使用～',
			});
			appStore.showMenuCenter = 2;
			appStore.selectedPanelIndex = 3;
		} else {
			Msgbox({
				image: h(IconPointOut),
				title: '您将要使用一个尚未完善的网页版～',
				content: h('div', ['4.4 版本尚未对网页运行进行针对性优化，因此网页版只能用于体验功能，可能无法正常使用', h('br'), '同时，建议自行部署以获得更佳体验～']),
				buttons: [
					{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open('./online', '__blank') && true },
				]
			});
		}
	} else if (index === 4) {
		// 下载
		appStore.showMenuCenter = 2;
		appStore.selectedPanelIndex = 1;
		showBigDownloadButton.value = false;
	}
};

onMounted(async () => {
	const sleep = (ms: number) => new Promise((r) => setTimeout(() => r, ms));

	// 窗口大小变更监听
	const listener = () => {
		windowWidth.value = document.body.clientWidth;
		bigDownloadButtonZoomValue.value = document.body.clientWidth / window.innerHeight < 180 / 160 ? document.body.clientWidth / 180 * 0.8 : window.innerHeight / 160 * 0.8;
	}
	listener();
	window.addEventListener('resize', listener);

	// 浏览器检查
	// if (navigator.userAgent.includes('Firefox')) {
	// 	Popup({ message: 'Firefox 浏览器在浏览本页的时候，可能会出现部分元素缩放不正常的现象' });
	// 	sleep(1);
	// 	Popup({ message: '如影响到浏览，烦请更换 Chromium 内核的浏览器～' });
	// }
})

</script>

<template>
	<div class="mainFrame" :data-color_theme="appStore.colorTheme">
		<div class="topBar">
			<a class="nav" style="float: left;" href="http://www.ttqf.tech/" title="滔滔清风科技馆主页（七年没更新，没啥东西看的）" onclick="alert('七年没更新，没啥东西看的')">
				<div class="ttqftechlogo"></div>
			</a>
			<a class="nav" style="float: right;" href="https://github.com/ttqftech/FFBox/" target="_blank" title="FFBox GitHub 主页">
				<svg height="40" width="40" viewBox="0 0 16 16" version="1.1" style="fill: #333;"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
			</a>
			<a class="nav" style="float: right;" href="https://gitee.com/ttqf/FFBox" target="_blank" title="FFBox Gitee 主页">
				<img height="40" width="40" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNjI4Njk5NTExMTgyIiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjU1MSIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48ZGVmcz48c3R5bGUgdHlwZT0idGV4dC9jc3MiPjwvc3R5bGU+PC9kZWZzPjxwYXRoIGQ9Ik01MTIgMTAyNEMyMjkuMjQ4IDEwMjQgMCA3OTQuNzUyIDAgNTEyUzIyOS4yNDggMCA1MTIgMHM1MTIgMjI5LjI0OCA1MTIgNTEyLTIyOS4yNDggNTEyLTUxMiA1MTJ6IG0yNTkuMTY4LTU2OC44OTZoLTI5MC43NTJhMjUuMjggMjUuMjggMCAwIDAtMjUuMjggMjUuMjhsLTAuMDMyIDYzLjIzMmMwIDEzLjk1MiAxMS4yOTYgMjUuMjggMjUuMjggMjUuMjhoMTc3LjAyNGEyNS4yOCAyNS4yOCAwIDAgMSAyNS4yOCAyNS4yOHYxMi42NGE3NS44NCA3NS44NCAwIDAgMS03NS44NCA3NS44NGgtMjQwLjIyNGEyNS4yOCAyNS4yOCAwIDAgMS0yNS4yOC0yNS4yOHYtMjQwLjE5MmE3NS44NCA3NS44NCAwIDAgMSA3NS44NC03NS44NGgzNTMuOTJhMjUuMjggMjUuMjggMCAwIDAgMjUuMjgtMjUuMjhsMC4wNjQtNjMuMmEyNS4zMTIgMjUuMzEyIDAgMCAwLTI1LjI4LTI1LjMxMkg0MTcuMTg0YTE4OS42MzIgMTg5LjYzMiAwIDAgMC0xODkuNjMyIDE4OS42djM1My45NTJjMCAxMy45NTIgMTEuMzI4IDI1LjI4IDI1LjI4IDI1LjI4aDM3Mi45MjhhMTcwLjY1NiAxNzAuNjU2IDAgMCAwIDE3MC42NTYtMTcwLjY1NnYtMTQ1LjM3NmEyNS4yOCAyNS4yOCAwIDAgMC0yNS4yOC0yNS4yOHoiIHAtaWQ9IjU1MiIgZmlsbD0iI2Q5MDAxMyI+PC9wYXRoPjwvc3ZnPg==" alt="">
			</a>
		</div>
		<div v-if="windowWidth >= 640" class="firstScreen">
			<div class="lrCenter">
				<img class="title-1" src="../assets/软件图标v1.0.png" alt="FFBox 图标" width="368" height="184" />
				<div class="actions">
					<button @click="handleTopBarButtonClicked(0)">更新说明</button>
					<div class="seperator"></div>
					<button @click="handleTopBarButtonClicked(1)" class="涩话草坪">涩话草坪</button>
					<div class="seperator"></div>
					<button @click="handleTopBarButtonClicked(2)">使用条款</button>
				</div>
				<div class="versionInfo">
					<div>版本：4.4&nbsp;&nbsp;(2025-05-01)</div>
				</div>
			</div>
			<div class="FFBox-topWrapper" :style="FFBoxTopWrapperStyle">
				<div class="FFBox-wrapper">
					<img v-if="appStore.colorTheme === 'themeLight' && windowWidth < 1000" src="../assets/软件截图_小_浅色.webp" />
					<img v-if="appStore.colorTheme === 'themeDark' && windowWidth < 1000" src="../assets/软件截图_小_深色.webp" />
					<img v-if="appStore.colorTheme === 'themeLight' && windowWidth >= 1000 && windowWidth < 1320" src="../assets/软件截图_中_浅色.webp" />
					<img v-if="appStore.colorTheme === 'themeDark' && windowWidth >= 1000 && windowWidth < 1320" src="../assets/软件截图_中_深色.webp" />
					<img v-if="appStore.colorTheme === 'themeLight' && windowWidth >= 1320" src="../assets/软件截图_大_浅色.webp" />
					<img v-if="appStore.colorTheme === 'themeDark' && windowWidth >= 1320" src="../assets/软件截图_大_深色.webp" />
					<div class="FFBox">
						<button @click="handleTopBarButtonClicked(3)" class="startbutton startbutton2 startbutton-cyan">🌐网页版</button>
						<button @click="handleTopBarButtonClicked(4)" class="startbutton startbutton1 startbutton-green">⬇️下载</button>
						<MenuCenter />
					</div>
				</div>
			</div>
		</div>
		<div v-else class="mobileScreen">
			<MobileScreen />
		</div>
		<div class="bigDownloadButton" v-if="showBigDownloadButton">
			<div class="mask"></div>
			<div class="box" :style="{ zoom: bigDownloadButtonZoomValue }">
				<p class="line1">上面那么大个按钮找不到<br />倒要来这找小按钮🤣</p>
				<button @click="handleTopBarButtonClicked(3)" class="startbutton startbutton-green">⬇️下载</button>
				<p>嗱，够唔够大啊？</p>
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	/* 顶栏自适应 */
	@media only screen and (max-width: 1079.9px) {
		.topBar {
			width: 100%;
		}
	}
	@media only screen and (min-width: 1080px) {
		.topBar {
			padding-left: calc(30% - 300px);
			padding-right: calc(30% - 300px);
		}
	}
	@media only screen and (max-width: 599.9px) {
		.ttqftechlogo {
			width: 40px;
		}
	}
	@media only screen and (min-width: 600px) {
		.ttqftechlogo {
			width: 240px;
		}
	}

	/* FFBox 自适应（小：640~999，使用 600　中：1000~1320，使用 960　大：1320~，使用 1280） */
	@media only screen and (max-width: 999.9px) {
		.FFBox-wrapper {
			width: 600px;
		}
		.FFBox {
			width: 598px;
		}
	}
	@media only screen and (min-width: 1000px) and (max-width: 1319.9px) {
		.FFBox-wrapper {
			width: 960px;
		}
		.FFBox {
			width: 958px;
		}
	}
	@media only screen and (min-width: 1320px) {
		.FFBox-wrapper {
			width: 1280px;
		}
		.FFBox {
			width: 1278px;
		}
	}

	/* 固定布局项——顶栏 */
	.topBar {
		position: fixed;
		top: 0;
		width: 100%;
		height: 80px;
		box-sizing: border-box;
		background-color: hwb(var(--bg94) / 0.8);
		z-index: 10;
		.nav {
			display: inline-block;
			height: 80px;
			transform: translateY(-4px);
			padding: 0px 16px;
			opacity: 0.95;
			color: inherit;
			transition: transform 0.2s ease, background 0.2s ease;
			&:hover {
				transform: translateY(0px);
				background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0));
			}
			&>* {
				height: 40px;
				line-height: 40px;
				margin-top: 24px;
			}
		}
		.ttqftechlogo {
			background-image: url(../assets/ttqftechlogo.png);
			background-repeat: no-repeat;
			background-size: cover;
		}
	}
	.firstScreen {
		position: relative;
		// height: calc(100vh + 64px);
		// max-height: 1280px;
		height: 100vh;
		overflow: hidden;
		isolation: isolate;
		.lrCenter {
			text-align: center;
			.title-1 {
				width: 368px;
				margin-top: 160px;
			}
			.actions {
				display: flex;
				justify-content: center;
				align-items: center;
				isolation: isolate;
				button {
					padding: 6px 14px 6px 18px;
					letter-spacing: 4px;
					color: var(--66);
					background: none;
					border-radius: 6px;
					border: 1px solid transparent;
					z-index: 1;
					transition: all 0.1s linear;
					&:hover {
						border-top: 1px solid rgba(0, 0, 0, 0.1);
						border-left: 1px solid rgba(0, 0, 0, 0.1);
						border-right: 1px solid rgba(0, 0, 0, 0.1);
						border-bottom: 1px solid rgba(0, 0, 0, 0.2);
						background-color: hwb(var(--bg100));
						color: var(--primaryColor);
						transition: all 0.5s cubic-bezier(0.1, 2.5, 0.3, 1);
						cursor: pointer;
					}
				}
				.seperator {
					display: inline-block;
					width: 1px;
					height: 16px;
					margin: 0 -1px;
					background-color: #777;
				}
			}
			.versionInfo {
				margin-top: 12px;
				div {
					display: inline-block;
					padding: 12px 80px 0;
					color: var(--66);
					border-top: 1px solid hwb(var(--opposite80) / 0.5);
					font-size: 12px;
					opacity: 0.7;
				}
			}
		}
		.FFBox-topWrapper {
			position: absolute;
			width: 100%;
			transition: top 1.0s cubic-bezier(0.6, 0.2, 0.3, 1) 0.1s;
			.FFBox-wrapper {
				position: absolute;
				height: 800px;
				max-height: calc(90vh - 40px);
				left: 0;
				right: 0;
				margin: auto;
				box-shadow: 0 10px 28px hwb(0 0% 100% / 0.3);
				border-radius: 8px;
				overflow: hidden;
				&>img {
					position: absolute;
					width: 100%;
				}
				.FFBox {
					position: absolute;
					left: 1px;
					top: 1px;
					height: calc(100% - 2px);
					border-radius: 8px;
					text-align: center;
					overflow: hidden;
					.startbutton {
						position: absolute;
						top: 46px;
						width: 120px;
						height: 36px;
						text-align: center;
						line-height: 36px;
						font-size: 20px;
						letter-spacing: 4px;
						text-indent: 2px;
						color: #FFF;
						text-shadow: 0px 1px 1px rgba(0, 0, 0, 0.5);
						border-radius: 10px;
						border: none;
						outline: none;
						cursor: pointer;
						&:hover:before {
							position: absolute;
							left: 0;
							content: "";
							width: 100%;
							height: 100%;
							border-radius: 10px;
							background: -webkit-linear-gradient(-90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
						}
					}
					.startbutton1 {
						right: 16px;
					}
					.startbutton2 {
						right: 160px;
						width: 140px;
					}
				}
			}
		}
	}
	.bigDownloadButton {
		position: fixed;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #00000077;
		z-index: 5;
		.box {
			width: 180px;
			height: 160px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			border-radius: 8px;
			background-color: hwb(var(--bg97) / 0.8);
			box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
						0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
						0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
						0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
			text-align: center;
			.line1 {
				font-size: 10px;
			}
			.startbutton {
				position: relative;
				width: 120px;
				height: 36px;
				text-align: center;
				line-height: 36px;
				font-size: 20px;
				letter-spacing: 4px;
				text-indent: 2px;
				color: #FFF;
				text-shadow: 0px 1px 1px rgba(0, 0, 0, 0.5);
				border-radius: 10px;
				border: none;
				outline: none;
				cursor: pointer;
				&:hover:before {
					position: absolute;
					left: 0;
					content: "";
					width: 100%;
					height: 100%;
					border-radius: 10px;
					background: -webkit-linear-gradient(-90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
				}
			}

		}
	}

	// 主题
	.mainFrame[data-color_theme="themeLight"] {
		.涩话草坪 {
			color: hsl(120, 40%, 40%) !important;
		}
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 40% 10%), hwb(120 20% 20%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(120 10% 40%), hwb(120 20% 20%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(120 40% 10%);
			}
		}
		.startbutton-cyan {
			background: linear-gradient(180deg, hwb(180 20% 15%), hwb(180 10% 30%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(180 20% 15%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(180 10% 40%), hwb(180 10% 30%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(180 40% 10%);
			}
		}
	}
	.mainFrame[data-color_theme="themeDark"] {
		.涩话草坪 {
			color: hsl(120, 40%, 65%) !important;
		}
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 20% 10%), hwb(120 10% 30%));
			box-shadow: 0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(120 5% 50%), hwb(120 10% 30%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(120 20% 10%);
			}
		}
		.startbutton-cyan {
			background: linear-gradient(180deg, hwb(180 15% 10%), hwb(180 10% 35%));
			box-shadow: 0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(180 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(180 5% 50%), hwb(180 10% 35%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(180 15% 10%);
			}
		}
	}

</style>