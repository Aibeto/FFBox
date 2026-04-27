<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { computed, onMounted, ref, watch } from 'vue';
import AISearchConfig, { AIModelOption } from './types';
import { version } from '@common/constants';
import { randomString } from '@common/utils';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import AISearch from './AISearch.vue';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import { ButtonType } from '@renderer/components/Button/Button';

const appStore = useAppStore();

const fetchedConfig = ref<AISearchConfig>();
const modelOptions = ref<AIModelOption[]>([]);
const conversationIdByProvider: Partial<Record<AIModelOption['provider'], string>> = {};
let lastUsedTime = 0;	// 若使用的日期发生变化，重置用量
let userIdv1 = '';
const tokenUsed = ref({ day: 0, week: 0, total: 0 });

const quotaUsed = computed(() => ({
	day: fetchedConfig.value?.tokenLimit?.day ? tokenUsed.value.day / fetchedConfig.value.tokenLimit.day : undefined,
	week: fetchedConfig.value?.tokenLimit?.week ? tokenUsed.value.week / fetchedConfig.value.tokenLimit.week : undefined,
	total: fetchedConfig.value?.tokenLimit?.total ? tokenUsed.value.total / fetchedConfig.value.tokenLimit.total : undefined,
}));

const getModelOption = (modelKey?: string): AIModelOption | undefined => {
	if (!modelOptions.value.length) return undefined;
	if (modelKey) {
		const matched = modelOptions.value.find((item) => item.key === modelKey);
		if (matched) return matched;
	}
	return modelOptions.value[0];
};

const checkQuota = async () => {
	const aiAssistantData = await nodeBridge.localStorage.get('aiAssistant');

	if (Number.isFinite(aiAssistantData?.tokenUsed?.day)) tokenUsed.value.day = aiAssistantData.tokenUsed.day;
	if (Number.isFinite(aiAssistantData?.tokenUsed?.week)) tokenUsed.value.week = aiAssistantData.tokenUsed.week;
	if (Number.isFinite(aiAssistantData?.tokenUsed?.total)) tokenUsed.value.total = aiAssistantData.tokenUsed.total;

	lastUsedTime = +aiAssistantData?.lastUsedTime || 0;
	const lastUsedDay = Math.floor((lastUsedTime - new Date().getTimezoneOffset() * 60000) / 86400000);
	const lastUsedWeekday = Math.floor((lastUsedDay + 3) / 7);	// 0 时间是周四
	const now = Date.now();
	const nowDay = Math.floor((now - new Date().getTimezoneOffset() * 60000) / 86400000);
	const nowWeekday = Math.floor((nowDay + 3) / 7);	// 0 时间是周四
	if (lastUsedDay !== nowDay) {
		tokenUsed.value.day = 0;
		if (lastUsedWeekday !== nowWeekday) {
			tokenUsed.value.week = 0;
		}
		nodeBridge.localStorage.set('aiAssistant.tokenUsed', tokenUsed.value);
	}
};
// 扣减使用量，只更新最后使用时间，不检查日期变化
const useQuota = async (count: number) => {
	await nodeBridge.localStorage.set('aiAssistant.lastUsedTime', Date.now());
	tokenUsed.value.day += count;
	tokenUsed.value.week += count;
	tokenUsed.value.total += count;
	await nodeBridge.localStorage.set('aiAssistant.tokenUsed', tokenUsed.value);
};

// 只有 config 加载出来才会加载 AISearch，加载 AISearch 第一次打开弹窗才会 initWindow()
const initWindow = async (modelKey?: string) => {
	if (!fetchedConfig.value) return;

	if (fetchedConfig.value.initMsgbox) {
		Msgbox({
			content: fetchedConfig.value.initMsgbox,
			buttons: [
				{ text: '我已知悉，继续', type: ButtonType.Primary },
			]
		});
	}

	const selected = getModelOption(modelKey);
	if (!selected) return;

	if (!fetchedConfig.value.chatUrl) return;

	const currentConversationId = conversationIdByProvider[selected.provider];
	const options = {
		method: 'POST',
		url: fetchedConfig.value.chatUrl,
		headers: {
			'Content-Type': 'application/json',
		},
		data: JSON.stringify({
			input: {
				prompt: '[init]',
				biz_params: {
					customModelId: selected.modelId,
					conversationId: currentConversationId,
					userIdv1,
				},
			},
			parameters: {},
			debug: {},
		}),
	};
	const res = await axios(options);
	conversationIdByProvider[selected.provider] = res.data.output.session_id;
};

const resetChat = async (modelKey?: string) => {
	const selected = getModelOption(modelKey);
	if (!selected) return;
	delete conversationIdByProvider[selected.provider];
	await initWindow(selected.key);
};

const chatAPI = async (message: string, modelKey?: string) => {
	checkQuota();
	if (fetchedConfig.value?.tokenLimit?.day && tokenUsed.value.day >= fetchedConfig.value.tokenLimit.day) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.day ?? '今日 AI 用量已达到上限');
	}
	if (fetchedConfig.value?.tokenLimit?.week && tokenUsed.value.week >= fetchedConfig.value.tokenLimit.week) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.week ?? '本周 AI 用量已达到上限');
	}
	if (fetchedConfig.value?.tokenLimit?.total && tokenUsed.value.total >= fetchedConfig.value.tokenLimit.total) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.total ?? '累计 AI 用量已达到上限');
	}

	const selected = getModelOption(modelKey);
	if (!selected) {
		return Promise.reject('暂无可用模型');
	}
	const conversationId = conversationIdByProvider[selected.provider];

	if (!fetchedConfig.value?.chatUrl) return Promise.reject('AI configuration missing');
	try {
		const res = await axios.post(
			fetchedConfig.value.chatUrl,
			{
				input: {
					prompt: message,
					...(conversationId ? { session_id: conversationId } : {}),
					biz_params: {
						customModelId: selected.modelId,
						conversationId,
						userIdv1,
					},
				},
				parameters: {},
				debug: {},
			},
			{
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);

		const resData = res.data;
		if (!conversationId) {
			conversationIdByProvider[selected.provider] = resData.output.session_id;
		}
		let usageSum = 0;
		const modelsPrice = fetchedConfig.value.modelPrice || [];
		for (const [usedModelIndex, usedModelRaw] of Object.entries(resData.usage?.models || {})) {
			const usedModel = usedModelRaw as any;
			const usedProvider = usedModel.provider || selected.provider;
			const usedModelId = usedModel.model_id || usedModelIndex;
			const usageModelKey = `${usedProvider}:${usedModelId}`;
			const multiplierConfig = modelsPrice.find((modelPrice) => modelPrice.modelKey === usageModelKey);
			if (multiplierConfig) {
				usageSum += usedModel.input_tokens * multiplierConfig.inputMultiplyer + usedModel.output_tokens * multiplierConfig.outputMultiplyer;
			} else {
				usageSum += usedModel.input_tokens + usedModel.output_tokens;
			}
		}
		useQuota(usageSum);

		return Promise.resolve({
			content: resData.output.text,
			expense: usageSum,
		});
	} catch (err) {
		console.log(err);
		if (err instanceof AxiosError) {
			if (err.response?.data) {
				const data = err.response.data;
				if (data.code === 'App.AccessDenied') {
					return Promise.reject('模型提供商拒绝了请求，请联系 FFBox 作者或更新 FFBox 解决');	// appId 错误
				} else if (data.code === 'InvalidApiKey') {
					return Promise.reject('模型提供商拒绝了请求，请联系 FFBox 作者解决');	// apiKey 错误
				} else if (data.code === 'DataInspectionFailed') {
					useQuota(500);	// 惩罚
					return Promise.reject(fetchedConfig.value.invalidReply);
				} else {
					return Promise.reject(data.message);
				}
			}
			return Promise.reject(`请求失败：${err.message}`);
		}
		return Promise.reject('请求失败：未知原因');
	}
};

const statusAPI = async (modelKey?: string) => {
	const selected = getModelOption(modelKey);
	if (!selected) return undefined;
	if (!fetchedConfig.value?.conversationStatusUrl) return undefined;

	try {
		const conversationId = conversationIdByProvider[selected.provider];
		const options = {
			url: fetchedConfig.value.conversationStatusUrl,
			method: 'POST',
			mode: 'cors',
			data: JSON.stringify({ type: 'get', conversationId }),
		};
		const result = await axios(options);
		return result.data;
	} catch {
		return undefined;
	}
};

let inited = false;
const init = async () => {
	if (inited) return;

	try {
		const configResponse = await axios.post('http://api.ffbox.ttqf.tech/v2/FFBoxAIConfig/default', { platform: 'FFBox 5.3' });
		const configData = typeof configResponse.data === 'string'
			? JSON.parse(configResponse.data)
			: configResponse.data;
		fetchedConfig.value = configData as AISearchConfig;

		modelOptions.value = fetchedConfig.value.modelOptions || [];

		checkQuota();

		userIdv1 = await nodeBridge.localStorage.get('aiAssistant.userIdv1');
		if (!userIdv1) {
			const t = new Date();
			userIdv1 = `${randomString()}|${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}|Client|${version}|${navigator.platform}|${navigator.userAgent}`;
			nodeBridge.localStorage.set('aiAssistant.userIdv1', userIdv1);
		}

		inited = true;
	} catch (error) {
		console.log('AI 帮助配置加载失败', error);
	}
};

watch(() => appStore.frontendSettings.aiDisabled, () => {
	if (!appStore.frontendSettings.aiDisabled) init();
});

onMounted(() => {
	setTimeout(() => {
		if (!appStore.frontendSettings.aiDisabled) init();
	}, 100);	// 给点时间读盘
});

</script>

<template>
	<AISearch v-if="!appStore.frontendSettings.aiDisabled"
		:enabled="fetchedConfig ? true : false"
		:chatAPI="chatAPI" :init="initWindow" :resetChat="resetChat" :statusAPI="statusAPI"
		:titleName="fetchedConfig?.titleName"
		:modelOptions="modelOptions"
		:initialPlaceholders="fetchedConfig?.initialPlaceholders" :initialPlaceholderInterval="fetchedConfig?.initialPlaceholderInterval"
		:initSystemMessage="fetchedConfig?.initSystemMessage"
		:requestKeywordSystemMessage="fetchedConfig?.requestKeywordSystemMessage" :responseKeywordSystemMessage="fetchedConfig?.responseKeywordSystemMessage"
		:requestKeywordLink="fetchedConfig?.requestKeywordLink" :responseKeywordLink="fetchedConfig?.responseKeywordLink"
		:maxInputLength="fetchedConfig?.maxInputLength"
		:maxRounds="fetchedConfig?.maxRounds" :maxRoundsMessage="fetchedConfig?.maxRoundsMessage"
		:quotaUsed="quotaUsed"
	/>
</template>
