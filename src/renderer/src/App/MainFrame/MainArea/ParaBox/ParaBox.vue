<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getFFmpegParaArray } from '@common/getFFmpegParaArray';
import { useAppStore } from '@renderer/stores/appStore';
import ShortcutView from './ShortcutView';
import InputView from './InputView';
import EffectView from './EffectView';
import VcodecView from './VcodecView';
import AcodecView from './AcodecView';
import MuxView from './MuxView';
import DropdownInput from '@renderer/components/DropdownInput/DropdownInput.vue';
import useLowerDividerDrag from '../useLowerDevider';
import IconSidebarFavorite from './parabox_favorite.svg?component';
import IconSidebarInput from './parabox_input.svg?component';
import IconSidebarVideo from './parabox_video.svg?component';
import IconSidebarAudio from './parabox_audio.svg?component';
import IconSidebarEffect from './parabox_effect.svg?component';
import IconSidebarOutput from './parabox_output.svg?component';
import IconUpArrow from './uparrow.svg?component';

const appStore = useAppStore();
const sidebarIcons = [IconSidebarFavorite, IconSidebarInput, IconSidebarEffect, IconSidebarVideo, IconSidebarAudio, IconSidebarOutput];
const sidebarTexts = ['快捷', '输入', '滤镜', '视频', '音频', '封装'];
const sidebarColors = computed(() => 
	appStore.frontendSettings.colorTheme === 'themeLight'
		? ['hwb(45 0% 5%)', 'hwb(195 0% 10%)', 'hwb(315 10% 5%)', 'hwb(285 10% 0%)', 'hwb(120 0% 20%)', 'hwb(0 30% 0%)']
		: ['hwb(45 0% 5%)', 'hwb(195 5% 5%)', 'hwb(315 20% 5%)', 'hwb(285 25% 0%)', 'hwb(120 0% 15%)', 'hwb(0 30% 0%)']
);
const { deviderRef, handleDeviderDragStart } = useLowerDividerDrag();
const animationName = ref('animationLeft');
const editingOutputIndex = ref(0);
const showGlobalParams = ref(true);

const outputSelectionList = computed(() => appStore.globalParams.outputs.map((output, index) => ({
	type: 'normal' as const,
	value: `输出 ${index}`,
	label: `输出 ${index}`
})));

const globalParamsText = computed(() => {
	try {
		const globalparamsArray = getFFmpegParaArray({ outputParams: appStore.globalParams, withQuotes: true, taskId: '[任务 ID]' as any, taskIndex: '[任务序号]' as any });
		return ['ffmpeg', ...globalparamsArray].join(' ');
	} catch (e) {
		console.error(e);
		return '异常';
	}
});

const handleParaButtonClicked = (index: number) => {
	animationName.value = index < appStore.paraSelected ? 'animationLeft' : 'animationRight';
	appStore.paraSelected = index;
}

const handleOutputSelectionListChange = (value: string) => {
	const match = value.match(/^输出 (\d+)$/);
	if (match) {
		const index = Number(match[1]);
		if (Number.isInteger(index) && index >= 0 && index < appStore.globalParams.outputs.length) {
			editingOutputIndex.value = index;
		}
	}
};

const handleForceRefresh = () => {
	const current = appStore.paraSelected;
	appStore.paraSelected = undefined as any;
	setTimeout(() => {
		appStore.paraSelected = current;
	}, 120);
}

const getButtonColorStyle = (index: number) => ({ color: appStore.paraSelected === index ? sidebarColors.value[index] : 'hwb(0 50% 50%)' });

watch(() => appStore.globalParams.outputs.length, () => {
	if (editingOutputIndex.value >= appStore.globalParams.outputs.length) {
		editingOutputIndex.value = 0;
	}
});

onMounted(() => {
	window.addEventListener('finished-fetch-codecs', handleForceRefresh);
});
onUnmounted(() => {
	window.removeEventListener('finished-fetch-codecs', handleForceRefresh);
});

</script>

<template>
	<div class="parabox">
		<div class="upper" :style="{ height: showGlobalParams ? '64px' : undefined }">
			<div class="devider" :ref="(el) => deviderRef = el as Element">
				<div class="buttons" @mousedown="handleDeviderDragStart" @touchstart="handleDeviderDragStart">
					<button v-for="index in [0, 1, 2]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
					<transition name="outputSelectAnim">
						<div v-if="appStore.globalParams.outputs.length > 1" class="outputSelection">
							<DropdownInput :list="outputSelectionList" :text="`输出 ${editingOutputIndex}`" @change="handleOutputSelectionListChange" />
						</div>
					</transition>
					<button v-for="index in [3, 4, 5]" :key="index" :aria-label="sidebarTexts[index] + '参数'" @click="handleParaButtonClicked(index)">
						<component :is="sidebarIcons[index]" :style="getButtonColorStyle(index)" />
						<span :style="getButtonColorStyle(index)">{{ sidebarTexts[index] }}</span>
					</button>
				</div>
				<button class="showGlobalButton" @mousedown="showGlobalParams = !showGlobalParams" aria-label="展示全局参数开关">
					<span>全局参数</span>
					<IconUpArrow :style="{ transform: showGlobalParams ? undefined : 'rotate(-180deg)' }" />
				</button>
			</div>
			<div class="globalparam" :style="{ opacity: showGlobalParams ? 1 : 0 }">
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
				<EffectView v-if="appStore.paraSelected == 2" :editingOutputIndex="editingOutputIndex" :onEditingOutputIndexChange="(index) => editingOutputIndex = index" />
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
		width: 100%;
		height: 100%;
		// min-height: 28px;
		display: flex;
		flex-direction: column;
		background-color: hwb(var(--bg94));
		overflow: hidden;
		// 切换动画（向左）
		.animationLeft-enter-from {
			/* z-index: 0; */
			opacity: 0;
			transform: translateX(-30px);
		}
		.animationLeft-enter-active {
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
		.animationRight-enter-active {
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
						width: 72px;
						transition: width cubic-bezier(0.2, 1.2, 0.5, 1) 0.4s;
						cursor: initial;
						&>* {
							overflow: hidden;
						}
					}
					.outputSelectAnim-enter-from, .outputSelectAnim-leave-to {
						width: 0px;
					}
					.outputSelectAnim-enter-active {
						transition: width cubic-bezier(0.2, 1.5, 0.5, 1) 0.5s;
					}
					.outputSelectAnim-leave-active {
						transition: width ease 0.4s;
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
			isolation: isolate;
		}
	}

</style>