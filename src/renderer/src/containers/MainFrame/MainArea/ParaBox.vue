<script setup lang="ts">
import { computed, ref } from 'vue';
import { getFFmpegParaArray } from '@common/getFFmpegParaArray';
import { useAppStore } from '@renderer/stores/appStore';
import ShortcutView from './ParaBox/ShortcutView';
import InputView from './ParaBox/InputView';
import EffectView from './ParaBox/EffectView';
import VcodecView from './ParaBox/VcodecView';
import AcodecView from './ParaBox/AcodecView';
import MuxView from './ParaBox/MuxView';
import IconSidebarFavorite from '@renderer/assets/mainArea/paraBox/parabox_favorite.svg?component';
import IconSidebarInput from '@renderer/assets/mainArea/paraBox/parabox_input.svg?component';
import IconSidebarVideo from '@renderer/assets/mainArea/paraBox/parabox_video.svg?component';
import IconSidebarAudio from '@renderer/assets/mainArea/paraBox/parabox_audio.svg?component';
import IconSidebarEffect from '@renderer/assets/mainArea/paraBox/parabox_effect.svg?component';
import IconSidebarOutput from '@renderer/assets/mainArea/paraBox/parabox_output.svg?component';
import IconUpArrow from '@renderer/assets/mainArea/paraBox/uparrow.svg?component';
import DropdownInput from '@renderer/components/DropdownInput/DropdownInput.vue';

const appStore = useAppStore();
const sidebarIcons = [IconSidebarFavorite, IconSidebarInput, IconSidebarEffect, IconSidebarVideo, IconSidebarAudio, IconSidebarOutput];
const sidebarTexts = ['快捷', '输入', '滤镜', '视频', '音频', '封装'];
const sidebarColors = computed(() => 
	appStore.frontendSettings.colorTheme === 'themeLight'
		? ['hwb(45 0% 5%)', 'hwb(195 0% 10%)', 'hwb(315 10% 5%)', 'hwb(285 10% 0%)', 'hwb(120 0% 20%)', 'hwb(0 30% 0%)']
		: ['hwb(45 0% 5%)', 'hwb(195 5% 5%)', 'hwb(315 20% 5%)', 'hwb(285 25% 0%)', 'hwb(120 0% 15%)', 'hwb(0 30% 0%)']
);
const deviderRef = ref<Element>(null);
const animationName = ref('animationLeft');
const editingOutputIndex = ref(0);

const outputSelectionList = computed(() => appStore.globalParams.outputs.map((output, index) => ({
	type: 'normal' as const,
	value: `输出 ${index}`,
	label: `输出 ${index}`
})));

const globalParamsText = computed(() => {
	try {
		const globalparamsArray = getFFmpegParaArray(appStore.globalParams);
		return ['ffmpeg', ...globalparamsArray].join(' ');
	} catch (e) {
		console.error(e);
		return '异常';
	}
});

const handleDragStart = (event: MouseEvent | TouchEvent) => {
	// event.preventDefault();
	const deviderRect = deviderRef.value.getBoundingClientRect();	// 列表元素的 rect
	const mainAreaRect = (appStore.componentRefs['MainArea'] as Element).getBoundingClientRect();	// 列表元素的 rect
	const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
	// const inElementY = (event as MouseEvent).offsetY || (event as TouchEvent).touches[0].offsetY;	// 鼠标在元素内的 Y
	const inElementY = mouseY - deviderRect.top;	// 不直接用 offsetY 的原因是，鼠标所在的元素不一定是 devider
	// 添加鼠标事件捕获
	let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
		const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
		let listPercent = (mouseY - mainAreaRect.top - inElementY) / mainAreaRect.height;
		listPercent = Math.min(Math.max(listPercent, 0), 1);
		appStore.draggerPos = listPercent;
	}
	let handleMouseUp = () => {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('touchmove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
		window.removeEventListener('touchend', handleMouseUp);
	}
	window.addEventListener('mousemove', handleMouseMove);
	window.addEventListener('touchmove', handleMouseMove);
	window.addEventListener('mouseup', handleMouseUp);
	window.addEventListener('touchend', handleMouseUp);
};
const handleParaButtonClicked = (index: number) => {
	animationName.value = index < appStore.paraSelected ? 'animationLeft' : 'animationRight';
	appStore.paraSelected = index;
}

const handleOutputSelectionListChange = (value: string) => {
	console.log(value);
	const match = value.match(/^输出 (\d+)$/);
	if (match) {
		const index = Number(match[1]);
		if (Number.isInteger(index) && index >= 0 && index < appStore.globalParams.outputs.length) {
			editingOutputIndex.value = index;
		}
	}
};

const getButtonColorStyle = (index: number) => ({ color: appStore.paraSelected === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

</script>

<template>
	<div class="parabox">
		<div class="upper" :style="{ height: appStore.showGlobalParams ? '64px' : undefined }">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<div class="buttons" @mousedown="handleDragStart" @touchstart="handleDragStart">
					<button v-for="index in [0, 1, 2]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
					<div v-if="appStore.globalParams.outputs.length > 1 || true" class="outputSelection">
						<DropdownInput :list="outputSelectionList" :text="`输出 ${editingOutputIndex}`" @change="handleOutputSelectionListChange" />
					</div>
					<button v-for="index in [3, 4, 5]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
				</div>
				<button class="showGlobalButton" @mousedown="appStore.showGlobalParams = !appStore.showGlobalParams" aria-label="展示全局参数开关">
					<span>全局参数</span>
					<IconUpArrow :style="{ transform: appStore.showGlobalParams ? undefined : 'rotate(-180deg)' }" />
				</button>
			</div>
			<div class="globalparam" :style="{ opacity: appStore.showGlobalParams ? 1 : 0 }">
				<textarea readonly aria-label="全局参数" :value="globalParamsText"></textarea>
			</div>
		</div>
		<div class="lower">
			<transition :name="animationName">
				<ShortcutView v-if="appStore.paraSelected == 0" />
			</transition>
			<transition :name="animationName">
				<InputView v-if="appStore.paraSelected == 1" />
			</transition>
			<transition :name="animationName">
				<EffectView v-if="appStore.paraSelected == 2" />
			</transition>
			<transition :name="animationName">
				<VcodecView v-if="appStore.paraSelected == 3" :editingOutputIndex="editingOutputIndex" />
			</transition>
			<transition :name="animationName">
				<AcodecView v-if="appStore.paraSelected == 4" :editingOutputIndex="editingOutputIndex" />
			</transition>
			<transition :name="animationName">
				<MuxView v-if="appStore.paraSelected == 5" :editingOutputIndex="editingOutputIndex" />
			</transition>
		</div>
	</div>
</template>

<style lang="less">
	.parabox  {
		position: absolute;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 28px;
		// height: 40%;
		background-color: hwb(var(--bg94));
		box-shadow: 0px 0px 8px hwb(0 0% 100% / 0.05), // 远距离上阴影
					0px 1px 1px hwb(0 100% 0% / 0.25) inset; // 内部上阴影
		overflow: hidden;
		// 切换动画（向左）
		.animationLeft-enter-from {
			/* z-index: 0; */
			opacity: 0;
			transform: translateX(-30px);
		}
		.animationLeft-enter-active, .animationLeft-leave-active {
			transition: opacity 0.3s, transform 0.5s cubic-bezier(0.2, 1.25, 0.3, 1);
		}
		.animationLeft-enter-to, .animationLeft-leave-from {
			/* z-index: 1; */
			opacity: 1;
			transform: translateX(0);
		}
		.animationLeft-leave-active {
			transition: opacity 0.3s, transform 0.3s cubic-bezier(0.5, 0, 1, 1);
		}
		.animationLeft-leave-to {
			opacity: 0;
			transform: translateX(30px);
		}
		// 切换动画（向右）
		.animationRight-enter-from {
			/* z-index: 0; */
			opacity: 0;
			transform: translateX(30px);
		}
		.animationRight-enter-active, .animationRight-leave-active {
			transition: opacity 0.3s, transform 0.5s cubic-bezier(0.2, 1.25, 0.3, 1);
		}
		.animationRight-enter-to, .animationRight-leave-from {
			/* z-index: 1; */
			opacity: 1;
			transform: translateX(0);
		}
		.animationRight-leave-active {
			transition: opacity 0.3s, transform 0.3s cubic-bezier(0.5, 0, 1, 1);
		}
		.animationRight-leave-to {
			opacity: 0;
			transform: translateX(-30px);
		}
		.upper {
			position: relative;
			height: 30px;
			flex: 0 0 auto;
			background-color: hwb(var(--bg97));
			box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.02), // 远距离下阴影
						0px -2px 1px -1px rgba(0, 0, 0, 0.1) inset; // 内部下阴影
			overflow: hidden;
			transition: height 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
			.devider {
				cursor: ns-resize;
				.buttons {
					height: 28px;
					overflow: hidden;
					display: flex;
					justify-content: center;
					align-items: center;
					.outputSelection {
						// display: inline-block;
						width: 72px;
						cursor: initial;
					}
					button {
						// display: inline-block;
						text-align: center;
						width: 80px;
						height: 28px;
						padding: 0;
						background-color: transparent;
						border: none;
						transition: width 0.3s ease;
						&:hover {
							background-color: hwb(var(--hoverLightBg) / 0.5);
							box-shadow: 0 0 4px 2px hwb(var(--hoverShadow) / 0.05);
						}
						&:active {
							background-color: transparent;
							box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
										0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
							transform: translateY(0.25px);
						}
						svg {
							width: 24px;
							height: 24px;
							vertical-align: middle;
							filter: var(--paraBoxButtonDropFilterSvg);
						}
						span {
							display: inline-block;
							width: 32px;
							vertical-align: -4.5px;
							padding-left: 4px;
							letter-spacing: 2px;
							white-space: nowrap;
							overflow: hidden;
							transition: width 0.3s ease, padding 0.3s ease;
							filter: var(--paraBoxButtonDropFilterText);
						}
						@media only screen and (max-width: 600px) {
							width: 50px;
							span {
								// display: none;
								width: 0px;
								padding: 0px;
							}
						}
					}
				}
				.showGlobalButton {
					position: absolute;
					top: 0;
					right: 0;
					width: 40px;
					height: 28px;
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 0;
					background-color: transparent;
					border: none;
					transition: width 0.3s ease;
					&:hover {
						background-color: hwb(var(--hoverLightBg) / 0.5);
						box-shadow: 0 0 4px 2px hwb(var(--hoverShadow) / 0.05);
					}
					&:active {
						background-color: transparent;
						box-shadow: 0 0 2px 1px hwb(var(--hoverShadow) / 0.05), // 外部阴影
									0 6px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
						transform: translateY(0.25px);
					}
					span {
						position: relative;
						display: inline-block;
						width: 0px;
						margin-right: 0px;
						letter-spacing: 1px;
						top: -0.5px;
						white-space: nowrap;
						overflow: hidden;
						color: #777;
						transition: width 0.3s ease, padding 0.3s ease;
						filter: var(--paraBoxButtonDropFilterText);
					}
					svg {
						width: 20px;
						height: 20px;
						color: #777;
						transition: transform 0.4s cubic-bezier(0.2, 1.4, 0.65, 1);
					}
					@media only screen and (min-width: 960px) {
						width: 120px;
						span {
							width: 62px;
							margin-right: 8px;
						}
					}
				}
			}
			.globalparam {
				position: absolute;
				top: 30px;
				left: 6px;
				right: 6px;
				height: 30px;
				box-sizing: border-box;
				transition: opacity 0.2s ease;
				textarea {
					border: none;
					background: hwb(var(--bg96) / 0.6);
					outline: none;
					box-sizing: border-box;
					width: 100%;
					height: 100%;
					resize: none;
					color: var(--33);
					font-family: Consolas,monaco,"Noto Mono","黑体","苹方-简","苹方",Roboto;
					font-weight: 400;
					font-size: 12px;
					line-height: 13px; // 52 / 4
					border-radius: 0 2px 2px 0;
					box-shadow: 0 0 1px 1px hwb(0 0% 100% / 0.05), // 外部阴影
								0 3px 6px hwb(0 0% 100% / 0.02) inset; // 内部凹陷阴影
					&:hover {
						background: hwb(var(--bg97) / 0.8);
						box-shadow: 0 0 1px 1px hwb(210deg 0% 0% / 0.5), // 外部阴影
									0 3px 6px hwb(0 0% 100% / 0.02) inset; // 内部凹陷阴影
					}
				}
			}
		}
		.lower {
			position: relative;
			height: 100%;
		}
	}

</style>