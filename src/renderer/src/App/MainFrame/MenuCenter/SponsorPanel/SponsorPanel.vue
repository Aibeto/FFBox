<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import CryptoJS from 'crypto-js';
import { NotificationLevel } from '@common/types';
import { ServiceBridgeStatus } from "@renderer/bridges/serviceBridge";
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import { getLimitaion } from '@common/limitaions';
import Button from '@renderer/components/Button/Button';
import Popup from '@renderer/components/Popup/Popup';
import IconLoading from '@renderer/assets/loading.svg';
import NormalInput from '@renderer/components/NormalInput/NormalInput.vue';

const appStore = useAppStore();
const frontendMachineIdOrActivateCode = ref<string | undefined>(undefined);

const iframeRef = ref<HTMLIFrameElement>();
const iframeLoading = ref(true);
const iframeLoadingPressed = ref(false);
const iframeLoadingNum = ref(-2);
const iframeFailed = ref(false);
const showAnswer = ref(false);
let iframeLoadTimer: ReturnType<typeof setTimeout> | undefined;

function onIframeLoad(event: Event) {
	iframeFailed.value = false;
	sendStateToIframe();
	startIframeLoadTimer();
}

function onIframeError() {
	if (iframeLoadTimer !== undefined) {
		clearTimeout(iframeLoadTimer);
		iframeLoadTimer = undefined;
	}
	iframeLoading.value = false;
	iframeFailed.value = true;
}

function startIframeLoadTimer() {
	iframeLoadTimer = setTimeout(() => {
		iframeLoadTimer = undefined;
		if (iframeLoading.value) {
			iframeLoading.value = false;
			iframeFailed.value = true;
		}
	}, 1000);
}

// Listen for messages from the iframe child page
const handleMessage = async (event: MessageEvent) => {
	const data = event.data;
	if (!data || !data.type) return;

	// childReady doesn't need requestId
	if (data.type === 'childReady') {
		if (iframeLoadTimer !== undefined) {
			clearTimeout(iframeLoadTimer);
			iframeLoadTimer = undefined;
		}
		iframeLoading.value = false;
		iframeFailed.value = false;
		return;
	}

	if (!data.requestId) return;

	let responseData: any = undefined;

	switch (data.type) {
		case 'jumpToUrl':
			nodeBridge.jumpToUrl(data.url);
			break;

		case 'getMachineId':
			responseData = await nodeBridge.getMachineId();
			break;

		case 'localStorageGet':
			responseData = await nodeBridge.localStorage.get(data.key);
			break;

		case 'activateFrontend':
			responseData = await appStore.activateFrontend(data.code).catch(() => false);
			break;

		case 'activateBackend':
			responseData = await appStore.activateBackend(data.code).catch(() => false);
			break;

		case 'popup':
			Popup({ message: data.message, level: data.level });
			break;

		case 'encryptAES': {
			const min = CryptoJS.enc.Utf8.parse(data.plaintext);
			responseData = CryptoJS.AES.encrypt(min, data.key).toString();
			break;
		}

		case 'getState':
			responseData = {
				functionLevel: appStore.functionLevel,
				localServerConnected: appStore.localServer?.entity.status === ServiceBridgeStatus.Connected,
				localServerFunctionLevel: appStore.localServer?.data.functionLevel,
				localServerMachineId: appStore.localServer?.data.machineId,
				env: nodeBridge.env,
				colorTheme: appStore.frontendSettings.colorTheme,
			};
			break;
	}

	// Send response back to iframe
	iframeRef.value?.contentWindow?.postMessage({
		type: 'response',
		requestId: data.requestId,
		data: responseData,
	}, '*');
};

// Build limitation table rows from limitaions.ts (single source of truth)
function formatSeconds(totalSec: number | undefined): string {
	if (totalSec === undefined) return '无限制';
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function getLimitationTableData(functionLevel: number) {
	return [
		{
			label: '媒体时长上限',
			value: formatSeconds(getLimitaion('maxMediaDuration', functionLevel)),
		},
		{
			label: '转码时长上限',
			value: formatSeconds(getLimitaion('maxWorkingDuration', functionLevel)),
		},
		{
			label: '远程单文件上传大小上限',
			value: getLimitaion('maxUploadSizeGB', functionLevel) === undefined
				? '无限制' : getLimitaion('maxUploadSizeGB', functionLevel) + 'GB',
		},
		{
			label: '任务列表数量上限',
			value: getLimitaion('maxTaskListCount', functionLevel) === undefined
				? '无限制' : String(getLimitaion('maxTaskListCount', functionLevel)),
		},
		{
			label: '同时转码任务数量设定上限',
			value: getLimitaion('maxThreads', functionLevel) === undefined
				? '无限制' : String(getLimitaion('maxThreads', functionLevel)),
		},
		{
			label: '滤镜功能节点数量上限',
			value: getLimitaion('maxFilterNodeCount', functionLevel) === undefined
				? '无限制' : String(getLimitaion('maxFilterNodeCount', functionLevel)),
		},
	];
}

// Push state updates to iframe when relevant data changes
function sendStateToIframe() {
	iframeRef.value?.contentWindow?.postMessage({
		type: 'stateUpdate',
		state: {
			functionLevel: appStore.functionLevel,
			localServerConnected: appStore.localServer?.entity.status === ServiceBridgeStatus.Connected,
			localServerFunctionLevel: appStore.localServer?.data.functionLevel,
			localServerMachineId: appStore.localServer?.data.machineId,
			env: nodeBridge.env,
			colorTheme: appStore.frontendSettings.colorTheme,
			limitationTable: getLimitationTableData(appStore.functionLevel),
		},
	}, '*');
}

watch(() => appStore.functionLevel, sendStateToIframe);
watch(() => appStore.localServer?.entity.status, sendStateToIframe);
watch(() => appStore.localServer?.data.functionLevel, sendStateToIframe);
watch(() => appStore.localServer?.data.machineId, sendStateToIframe);
watch(() => appStore.frontendSettings.colorTheme, sendStateToIframe);

onMounted(() => {
	window.addEventListener('message', handleMessage);
});

onBeforeUnmount(() => {
	window.removeEventListener('message', handleMessage);
	if (iframeLoadTimer !== undefined) {
		clearTimeout(iframeLoadTimer);
		iframeLoadTimer = undefined;
	}
});

const handleLoadingMouseDown = async (event: MouseEvent) => {
	iframeLoadingPressed.value = true;
	if (event.button === 2 && iframeLoadingNum.value < 0) {
		// 右键两次启动计数
		iframeLoadingNum.value += 1;
	} else if (event.button === 1 && iframeLoadingNum.value > -1) {
		// 中键增加计数
		iframeLoadingNum.value = (iframeLoadingNum.value + 10) % 110;
		event.preventDefault();
	} else if (event.button === 0 && iframeLoadingNum.value > -1) {
		// 左键结束计数并改为输入框显示
		frontendMachineIdOrActivateCode.value = await nodeBridge.getMachineId();
	} else {
		// 其他情况一律结束计数
		iframeLoadingNum.value = -2;
	}
};

const handleInputKeydown = async (event: KeyboardEvent) => {
	if (event.key === 'Enter') {
		const machineId = (event.target as HTMLInputElement).value || '';
		const fixedCode = 'd324c697ebfc42b7';
		const key = machineId + fixedCode;
		const min = CryptoJS.enc.Utf8.parse(iframeLoadingNum.value + '');
		const userInput = CryptoJS.AES.encrypt(min, key).toString();

		frontendMachineIdOrActivateCode.value = userInput;	// 将计算结果回填到输入框
		const frontendResult = await appStore.activateFrontend(userInput);
		const backendResult = await appStore.activateBackend(userInput);
		console.log('激活结果', frontendResult, backendResult, iframeLoadingNum.value, userInput);
		Popup({ message: '激活结果请到开发人员控制台查看', level: NotificationLevel.ok });
	}
}

</script>

<template>
	<div class="sponsorPanel">
		<iframe
			ref="iframeRef"
			src="https://ffbox.ttqf.tech/sponsorPanel/v1.html"
			@load="onIframeLoad"
			@error="onIframeError"
			:style="{ opacity: iframeLoading ? 0.3 : 1 }"
		></iframe>
		<div
			v-if="iframeLoading"
			class="loadingOverlay"
			@mousedown="handleLoadingMouseDown"
			@mouseup="() => iframeLoadingPressed = false"
			:style="{ transform: iframeLoadingPressed ? 'scale(0.95)': 'unset' }"
		>
			<IconLoading />
			<span v-if="frontendMachineIdOrActivateCode === undefined">加载中</span>
			<NormalInput v-else :value="frontendMachineIdOrActivateCode" @keydown="handleInputKeydown" @mousedown.stop="() => {}" />
		</div>
		<Transition name="fadeUp">
			<div v-if="iframeFailed" class="failureOverlay">
				<p class="lyrics">
					<span style="font-size: 4em;">🎶</span><br>如果有一天，我离你遥远，不能再和你相见<br>你是否会发觉我已经说再见
				</p>
				<Button size="large" @click="showAnswer = true">怎么办？</Button>
				<p :class="`answer ${showAnswer ? `fadeUp-enter-active` : 'fadeUp-enter-from'}`">🎶想回到过去，试着让故事继续，至少不再让你离我而去<br>纵使网络已断，FFBox 依然与你相伴。想使用“支持作者”面板，不妨回到 FFBox 5.x 版本看看？</p>
			</div>
		</Transition>
	</div>
</template>

<style lang="less" scoped>
	.sponsorPanel {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		overflow: hidden;
		isolation: isolate;
		iframe {
			position: absolute;
			top: 0;
			width: 100%;
			height: 100%;
			border: none;
			background: transparent;
		}
		.loadingOverlay {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			width: 300px;
			height: 200px;
			border-radius: 8px;
			background-color: hwb(var(--bg97) / 0.8);
			box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
						0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
						0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
						0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
			transition: opacity linear 0.2s;
			z-index: 1;
			@keyframes rotation {
				from {
					transform: rotate(0deg);
				}
				to {
					transform: rotate(360deg);
				}
			}
			svg {
				width: auto;
				height: 100px;
				color: #66666699;
				animation: rotation 1s steps(8) infinite;
			}
			&>span {
				margin: 16px 0 8px;
				font-size: 16px;
			}
			&>div {
				flex: 0 0 auto;
				width: 240px;
			}
		}
		.failureOverlay {
			position: absolute;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			text-align: center;
			z-index: 1;
			.lyrics {
				margin: 0 0 20px;
				font-size: 16px;
				line-height: 1.8;
				color: hwb(var(--fg) / 0.6);
			}
			.answer {
				margin: 22px 0;
				font-size: 14px;
				line-height: 1.8;
				color: hwb(var(--fg) / 0.4);
			}
		}
		.fadeUp-enter-active {
			transition: opacity 3s ease, transform 4s cubic-bezier(0.2, 1, 0.5, 1);
		}
		.fadeUp-enter-from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
</style>