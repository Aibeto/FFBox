<script setup lang="ts">
import { computed } from 'vue';
import { Permission } from '@common/types';
import { useAppStore } from '@renderer/stores/appStore';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import { showServerConfig } from '@renderer/bizComponents/ServerConfig';
import { showServerUserConfig } from '@renderer/bizComponents/ServerUserConfig';
import { showServerCacheInfo } from '@renderer/bizComponents/ServerCacheInfo';
import RadioList, { Props as RadioListProps } from '@renderer/components/RadioList/RadioList.vue';
import Slider from '@renderer/components/Slider/Slider.vue';
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
const autoHideCoarseSliderList: RadioListProps['list'] = [
	{ value: true, caption: '自动隐藏' },
	{ value: false, caption: '常驻显示' },
];

const currentServiceStatus = computed(() => {
	if (appStore.currentServer?.entity.status === ServiceBridgeStatus.Connected) {
		return 'ok';
	}
	return 'disconnected';
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
				<span>任务列表粗调滑块</span>
				<RadioList :list="autoHideCoarseSliderList" :value="appStore.frontendSettings.autoHideCoarseSlider" @change="(value) => handleSettingChange('autoHideCoarseSlider', value)" />
			<span v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')">任务列表性能优化</span>
			<RadioList v-bind="useTooltip(i11n.frontend.settings.useVirtualTaskListDesc, 't')" :list="useVirtualTaskListList" :value="appStore.frontendSettings.useVirtualTaskList" @change="(value) => handleSettingChange('useVirtualTaskList', value)" />
			<span v-bind="useTooltip(i11n.frontend.settings.infiniteScrollThresholdDesc, 't')">任务列表无限滚动启用阈值</span>
			<Slider
				v-bind="useTooltip(i11n.frontend.settings.infiniteScrollThresholdDesc, 't')"
				:value="appStore.frontendSettings.taskListInfiniteScrollThreshold"
				:min="100"
				:max="1000"
				:tags="[[100, '100'], [200, '200'], [300, '300'], [500, '500'], [750, '750'], [1000, '1000']]"
				:adsorption="(v) => [100, 150, 200, 300, 500, 750, 1000].reduce((a, b) => Math.abs(v - a) < Math.abs(v - b) ? a : b)"
				:valueToDisplay="(v) => `${v} 个任务`"
				:onChange="(value) => handleSettingChange('taskListInfiniteScrollThreshold', value)"
			/>
			<span v-bind="useTooltip(i11n.frontend.settings.pageSizeDesc, 't')">任务列表缓冲区大小</span>
			<Slider
				v-bind="useTooltip(i11n.frontend.settings.pageSizeDesc, 't')"
				:value="appStore.frontendSettings.taskListPageSize"
				:min="30"
				:max="1000"
				:tags="[[50, '50'], [100, '100'], [200, '200'], [300, '300'], [500, '500'], [750, '750'], [1000, '1000']]"
				:adsorption="(v) => [30, 50, 100, 200, 300, 500, 750, 1000].reduce((a, b) => Math.abs(v - a) < Math.abs(v - b) ? a : b)"
				:valueToDisplay="(v) => `${v} 个任务`"
				:onChange="(value) => handleSettingChange('taskListPageSize', value)"
			/>
		</div>
		<div class="configArea">
			<p>{{ appStore.currentServer?.data.name }} 转码服务相关设置请到以下页面配置</p>
			<p v-if="currentServiceStatus === 'disconnected'">连接转码服务器后方可设置</p>
			<div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
				<Button :disabled="currentServiceStatus !== 'ok' || !appStore.currentServer?.entity.permissions.includes(Permission.ServerSettings)" size="large" @click="showServerConfig(appStore.currentServer!.data.id)">转码服务设置</Button>
				<Button :disabled="currentServiceStatus !== 'ok' || !appStore.currentServer?.entity.permissions.includes(Permission.UserManagement)" size="large" @click="showServerUserConfig(appStore.currentServer!.data.id)">用户配置</Button>
				<Button :disabled="currentServiceStatus !== 'ok' || !appStore.currentServer?.entity.permissions.includes(Permission.CacheManagement)" size="large" @click="showServerCacheInfo(appStore.currentServer!.data.id)">缓存信息</Button>
			</div>
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