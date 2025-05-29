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

onMounted(() => appStore.selectedPanelIndex = 0);

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