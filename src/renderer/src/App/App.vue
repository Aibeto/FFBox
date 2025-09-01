<script setup lang="ts">
// 以下这句对全局有效
/// <reference types="vite-svg-loader" />
import { onMounted } from 'vue'
import { useAppStore } from '@renderer/stores/appStore';
import { handleDownloadStatusChange, handleDownloadProgress, handleCloseConfirm } from '@renderer/stores/eventsHandler';
import { TransferStatus } from '@common/types';
import { Server } from '@renderer/types';
import { buildNumber, version } from '@common/constants';
import { parseFFmpegCodecsToCodecsList, parseFFmpegFiltersToFiltersList, parseFFmpegMuDeMuxersToList } from '@common/params/parser';
import Popup from '@renderer/components/Popup/Popup';
import nodeBridge from '@renderer/bridges/nodeBridge';
import MainFrame from './MainFrame/MainFrame.vue';

const appStore = useAppStore();

onMounted(async () => {
	// 挂载调试变量
	if (buildInfo.isDev) {
		(window as any).appStore = appStore;
		(window as any).nodeBridge = nodeBridge;
	}

	// 初始化本地服务器
	const firstServerId = appStore.addServer();
	if (nodeBridge.env === 'electron') {
		// electron 环境自动连接 localhost
		if (location.href.startsWith('file')) {
			// 打包后的 electron 环境首先启动 service 再连接
			nodeBridge.startService().finally(() => {
				appStore.initializeServer(firstServerId, 'localhost', 33269, '', '', 3); // 4 次连接机会
			});
		} else {
			appStore.initializeServer(firstServerId, 'localhost', 33269, '', '');
		}
	}

	// 挂载退出确认
	nodeBridge.ipcRenderer?.on("exitConfirm", () => {
		const localServer = appStore.servers.find((server) => server.entity.ip === 'localhost')
		handleCloseConfirm(localServer as Server);
	});

	// 挂载下载进度指示
	nodeBridge.ipcRenderer?.on("downloadStatusChange", (event, params: { url: string, status: TransferStatus }) => {
		const { serverId, taskId } = appStore.downloadMap.get(params.url);
		const server = appStore.servers.find((server) => server.data.id === serverId);
		const task = server.data.tasks[taskId];
		// console.log("downloadStatusChange", params);
		handleDownloadStatusChange(task, params.status);
	});
	nodeBridge.ipcRenderer?.on("downloadProgress", (event, params: { url: string, loaded: number, total: number }) => {
		const { serverId, taskId } = appStore.downloadMap.get(params.url);
		const server = appStore.servers.find((server) => server.data.id === serverId);
		const task = server.data.tasks[taskId];
		handleDownloadProgress(task, params);
	});

	// 挂载主进程 console 信息回传
	nodeBridge.ipcRenderer?.on("debugMessage", (event, ...message) => {
		console.log(...message);
	});

	// 初始化或加载配置
	window.frontendSettings = {};
	appStore.loadPresetList();
	(async () => {
		const ffmpegCodecs = await nodeBridge.localStorage.get('ffmpegCodecs');
		if (ffmpegCodecs) {
			parseFFmpegCodecsToCodecsList(ffmpegCodecs);
		}
		const ffmpegFormats = await nodeBridge.localStorage.get('ffmpegFormats');
		if (ffmpegFormats) {
			parseFFmpegMuDeMuxersToList(ffmpegFormats);
		}
		const ffmpegFilters = await nodeBridge.localStorage.get('ffmpegFilters');
		if (ffmpegFilters) {
			parseFFmpegFiltersToFiltersList(ffmpegFilters);
		}

		const storedBuildNumber = await nodeBridge.localStorage.get('version.buildNumber');
		if (!storedBuildNumber || storedBuildNumber != buildNumber) {
			Popup({
				message: `欢迎使用 FFBox ${version}！`,
				level: 0,
			});
			nodeBridge.localStorage.set('version.buildNumber', buildNumber);
			appStore.checkAndApplyCodecDefaults({ video: true, audio: true });
		} else {
			const globalParams = await nodeBridge.localStorage.get('globalParams');
			appStore.globalParams = globalParams;;
		}
		appStore.frontendSettings = await nodeBridge.localStorage.get('frontendSettings') || appStore.frontendSettings;
		appStore.applyFrontendSettings(false);
	})();

	// 检查版本更新
	fetch('https://ffbox.ttqf.tech/api/v1/FFBoxVersion/latest').then(async (response) => {
		const latestVersion = await response.text();
		appStore.latestVersion = latestVersion;
	});

	setTimeout(() => {
		nodeBridge.appReady();
	}, 0);
});
</script>

<template>
	<MainFrame />
</template>

<style src="./theme.css"></style>
<style>
	html {
		overflow: hidden;
	}
	body {
		width: 100vw;
		height: 100vh;
		margin: 0;
		font-weight: 400;
        font-family: MiSans, PingFang SC, 苹方, 微软雅黑, HarmonyOS Sans, HarmonyOS Sans SC, Noto Sans S Chinese, 思源黑体, Product Sans, Segoe UI, Avenir, Arial, Consolas, Helvetica, sans-serif, 黑体;
		-webkit-font-smoothing: grayscale;
		-moz-osx-font-smoothing: grayscale;
		text-align: center;
		position: relative;
		overflow: hidden;
		user-select: none;
	}
	#app {
		height: 100vh;
		overflow: hidden;
		position: relative;
	}
</style>
