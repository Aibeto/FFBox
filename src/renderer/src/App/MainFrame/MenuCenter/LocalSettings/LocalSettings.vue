<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import { showServerConfig } from '@renderer/components/misc/ServerConfig';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';
import Button from '@renderer/components/Button/Button';
import { useTooltip } from '@renderer/common/tooltipUtil';
import i11n from '@common/i11n/i11n';

const appStore = useAppStore();

const dataRadixList: RadioListProps['list'] = [
	{ value: false, caption: '1000 进制 (SI)' },
	{ value: true, caption: '1024 进制 (IEC)' },
];
const colorThemeList: RadioListProps['list'] = [
	{ value: 'themeLight', caption: '浅色' },
	{ value: 'themeDark', caption: '深色' },
];
const progressModeList: RadioListProps['list'] = [
	{ value: '预测实时值', disabled: true },
	{ value: 'ffmpeg 真实值', disabled: true },
];
const aiDisabledList: RadioListProps['list'] = [
	{ value: false, caption: '可用时启用' },
	{ value: true, caption: '不用' },
];
const useVirtualTaskListList: RadioListProps['list'] = [
	{ value: true, caption: '启用仿虚拟列表（强优化）' },
	{ value: false, caption: 'VDOM 完全渲染（弱优化）' },
];

const localServiceStatus = computed(() => {
	if (appStore.servers[0]?.entity.ip === 'localhost') {
		if (appStore.servers[0].entity.status === ServiceBridgeStatus.Connected) {
			return 'ok';
		}
		return 'disconnected';
	}
	return 'notlocal';
});

const handleSettingChange = (key: keyof typeof appStore.frontendSettings, value: any) => {
	(appStore.frontendSettings[key] as any) = value;
	appStore.applyFrontendSettings(true);
};

</script>

<template>
	<div class="localSettings">
		<div class="gridArea">
			<span>数据量进制和词头</span>
			<RadioList :list="dataRadixList" :value="appStore.frontendSettings.useIEC" @change="(value) => handleSettingChange('useIEC', value)" />
			<span>颜色主题</span>
			<RadioList :list="colorThemeList" :value="appStore.frontendSettings.colorTheme" @change="(value) => handleSettingChange('colorTheme', value)" />
			<!-- <span>进度显示模式</span>
			<RadioList :list="progressModeList" value="预测实时值" /> -->
			<span>AI 帮助功能</span>
			<RadioList :list="aiDisabledList" :value="appStore.frontendSettings.aiDisabled" @change="(value) => handleSettingChange('aiDisabled', value)" />
			<span v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')">任务列表性能优化</span>
			<RadioList v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')" :list="useVirtualTaskListList" :value="appStore.frontendSettings.useVirtualTaskList" @change="(value) => handleSettingChange('useVirtualTaskList', value)" />
		</div>
		<div class="configArea">
			<p>转码服务相关设置请到“服务器配置”页面配置</p>
			<p v-if="localServiceStatus === 'disconnected'">连接本地服务器后方可设置</p>
			<p v-if="localServiceStatus === 'notlocal'">仅支持在本地模式下进行服务器配置</p>
			<Button :disabled="localServiceStatus !== 'ok'" size="large" @click="showServerConfig(appStore.servers[0].data.id)">服务器配置</Button>
		</div>
	</div>
</template>

<style lang="less">
	.localSettings {
		font-size: 15px;
		.gridArea {
			width: 100%;
			display: grid;
			grid-template-columns: calc(20% + 50px) calc(50% + 50px);
			justify-content: center;
			align-items: center;
			&>span {
				font-size: 15px;
			}
			.radioList {
				flex-direction: row;
				min-height: unset;
			}
		}
		.configArea {
			margin-top: 2em;
		}
	}
</style>