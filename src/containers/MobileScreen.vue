<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '../stores/appStore';
import Changelog from './MenuCenter/Changelog.vue';
import DownloadPanel from './MenuCenter/DownloadPanel.vue';
import SponsorPanel from './MenuCenter/SponsorPanel.vue';
import Terms from './MenuCenter/Terms.vue';
import Faq from './MenuCenter/Faq.vue';
import IconSidebarUpdate from '../assets/menuCenter/update2.svg?component';
import IconSidebarDownload from '../assets/menuCenter/download.svg?component';
import IconSidebarSponsor from '../assets/menuCenter/sponsor.svg?component';
import IconSidebarTerm from '../assets/menuCenter/term.svg?component';
import IconSidebarFaq from '../assets/menuCenter/faq.svg?component';

const appStore = useAppStore();

const sidebarIcons = [IconSidebarUpdate, IconSidebarDownload, IconSidebarSponsor, IconSidebarTerm, IconSidebarFaq];
const sidebarTexts = ['更新说明', '下载地址', '支持作者', '使用条款', '猜你想问'];
const sidebarColors = computed(() => 
	appStore.colorTheme === 'themeLight'
		? ['hwb(20 20% 0%)', 'hwb(120 0% 20%)', 'hwb(315 0% 0%)', 'hwb(35 10% 10%)', 'hwb(180 10% 35%)']
		: ['hwb(20 5% 5%)', 'hwb(120 0% 15%)', 'hwb(315 20% 5%)', 'hwb(35 10% 20%)', 'hwb(180 10% 40%)']
);
const animationName = ref('animationUp');

const getButtonColorStyle = (index: number) => ({ color: appStore.selectedPanelIndex === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

const handleParaButtonClicked = (index: number) => {
	animationName.value = index < appStore.selectedPanelIndex ? 'animationUp' : 'animationDown';
	appStore.selectedPanelIndex = index;
}

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
	}
};

onMounted(() => appStore.selectedPanelIndex = -1);

</script>

<template>
	<div class="nav">
		<div class="buttons">
			<button v-for="index in [0, 1, 2, 3, 4]" :key="index" :aria-label="sidebarTexts[index]" @click="handleParaButtonClicked(index)">
				<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
				<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
			</button>
		</div>
	</div>
	<div class="container">
		<h1 class="title">{{ sidebarTexts[appStore.selectedPanelIndex] }}</h1>
		<div class="content">
			<Transition :name="animationName">
				<div v-if="appStore.selectedPanelIndex === -1" class="intro">
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
					<img class="screenshot" v-if="appStore.colorTheme === 'themeLight'" src="../assets/软件截图_中_浅色_完整.webp" />
					<img class="screenshot" v-if="appStore.colorTheme === 'themeDark'" src="../assets/软件截图_中_深色_完整.webp" />
				</div>
			</Transition>
			<Transition :name="animationName">
				<Changelog v-if="appStore.selectedPanelIndex === 0" />
			</Transition>
			<Transition :name="animationName">
				<DownloadPanel v-if="appStore.selectedPanelIndex === 1" />
			</Transition>
			<Transition :name="animationName">
				<SponsorPanel v-if="appStore.selectedPanelIndex === 2" />
			</Transition>
			<Transition :name="animationName">
				<Terms v-if="appStore.selectedPanelIndex === 3" />
			</Transition>
			<Transition :name="animationName">
				<Faq v-if="appStore.selectedPanelIndex === 4" />
			</Transition>
		</div>
	</div>
</template>

<style scoped lang="less">
	.nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 60px;
		background-color: hwb(var(--bg97));
		box-shadow: 0px 0px 8px hwb(0 0% 100% / 0.05), // 远距离上阴影
					0px 1px 1px hwb(0 100% 0% / 0.25) inset; // 内部上阴影
		overflow: hidden;
		z-index: 1;
		.buttons {
			text-align: center;
			padding: 2px;
			button {
				display: inline-flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				gap: 4px;
				width: calc(15% + 20px);
				height: 56px;
				padding: 0;
				background-color: transparent;
				border: none;
				border-radius: 8px;
				&:hover {
					background-color: hwb(var(--hoverLightBg) / 0.4);
					// box-shadow: 0px 2px 2px rgba(127,127,127,0.5);
					// box-shadow: 0 0 4px 2px hwb(0 0% 100% / 0.05);
					box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
								0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.15),
								0 1px 0.5px 0px hwb(var(--hoverLightBg)) inset;	// 上高光
				}
				&:active {
					background-color: transparent;
					box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
								0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
					transform: translateY(0.25px);
				}
				svg {
					display: inline-block;
					width: 24px;
					height: 24px;
					margin: 0 2px 0 4px;
					vertical-align: middle;
					filter: var(--paraBoxButtonDropFilterSvg);
				}
				span {
					display: inline-block;
					width: 80px;
					vertical-align: -4.5px;
					padding-left: 4px;
					letter-spacing: 2px;
					white-space: nowrap;
					overflow: hidden;
					transition: width 0.3s ease, padding 0.3s ease;
					filter: var(--paraBoxButtonDropFilterSvg);
				}
				// @media only screen and (max-width: 600px) {
				// 	width: 50px;
				// 	span {
				// 		// display: none;
				// 		width: 0px;
				// 		padding: 0px;
				// 	}
				// }
			}
		}
	}
	.container {
		margin: 80px 8px 80px;
		-webkit-app-region: none;
		.title {
			font-size: 22px;
			text-align: center;
			color: var(--titleText);
		}
		.content {
			::-webkit-scrollbar {
				width: 10px;
				background: transparent;
			}
			::-webkit-scrollbar-thumb {
				border-radius: 10px;
				background: rgba(128, 128, 128, 0.2);
			}
			::-webkit-scrollbar-track {
				border-radius: 10px;
				background: rgba(128, 128, 128, 0.1);
			}
		}
		.intro {
			text-align: center;
			.title-1 {
				width: 368px;
				margin-top: calc(20vh - 150px);
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
			.screenshot {
				margin-top: 40px;
				width: 90%;
				border-radius: 1%;
				box-shadow: 0 6px 16px hwb(0 0% 100% / 0.2);
			}
		}
	}

	// 切换动画（向上）
	.animationUp-enter-from {
		/* z-index: 0; */
		opacity: 0;
		// transform: translateY(-30px);
	}
	.animationUp-enter-active, .animationUp-leave-active {
		transition: opacity 0.003s, transform 0.005s cubic-bezier(0.2, 1.25, 0.3, 1);
	}
	.animationUp-enter-to, .animationUp-leave-from {
		/* z-index: 1; */
		opacity: 1;
		// transform: translateY(0);
	}
	.animationUp-leave-active {
		transition: opacity 0.003s, transform 0.003s cubic-bezier(0.5, 0, 1, 1);
	}
	.animationUp-leave-to {
		opacity: 0;
		// transform: translateY(30px);
	}
	// 切换动画（向下）
	.animationDown-enter-from {
		/* z-index: 0; */
		opacity: 0;
		// transform: translateY(30px);
	}
	.animationDown-enter-active, .animationDown-leave-active {
		transition: opacity 0.003s, transform 0.005s cubic-bezier(0.2, 1.25, 0.3, 1);
	}
	.animationDown-enter-to, .animationDown-leave-from {
		/* z-index: 1; */
		opacity: 1;
		// transform: translateY(0);
	}
	.animationDown-leave-active {
		transition: opacity 0.003s, transform 0.003s cubic-bezier(0.5, 0, 1, 1);
	}
	.animationDown-leave-to {
		opacity: 0;
		// transform: translateY(-30px);
	}

</style>