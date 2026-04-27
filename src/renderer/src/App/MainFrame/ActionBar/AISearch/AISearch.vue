<script setup lang="ts">
import { ref, nextTick, computed, onMounted, watch } from 'vue';
import gsap from 'gsap';
import AISearchConfig, { AIChatMessage, AIModelOption } from './types';
import { getTimeString } from '@common/utils';
import { useTooltip } from '@renderer/common/tooltipUtil';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { showActivateCodeGen } from './activateCodeGen';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import GradientRect from './gradientRect.svg?skipsvgo';	// svgo 存在 bug 导致 svg 中的 id 跨 svg 产生重复，见 https://svgo.dev/docs/plugins/cleanupIds/
import IconRefresh from './refresh.svg';
import IconLoading from './loading.svg';
import IconAI from './AI.svg';
import IconX from '@renderer/assets/×.svg';

interface Props {
	enabled?: boolean;	// 是否启用并显示该组件，未定义则启用
	chatAPI?: (message: string, modelKey?: string) => Promise<{ content: string, expense?: number }>;	// 聊天 API，未定义则将在对话框中输出当前时间，出错将显示错误信息
	resetChat?: (modelKey?: string) => any;	// 点击重置对话时需要处理的副作用
	init?: (modelKey?: string) => any;	// 首次打开窗口时需要处理的副作用
	statusAPI?: (modelKey?: string) => Promise<string>;
	titleName?: string;	// 标题名，未定义则使用“FFBox AI 帮助”
	modelOptions?: AIModelOption[];
	initialPlaceholders?: string[];	// 未激活窗口时的 placeholder，未定义则使用“智能帮助”
	initialPlaceholderInterval?: number;	// 未激活窗口时的 placeholder 的轮换间隔（ms），未定义则使用 4000
	initSystemMessage?: AIChatMessage;	// 初始化窗口以及重置对话前补充一条系统信息
	requestKeywordLink?: AISearchConfig['requestKeywordLink'];	// 发送内容若出现关键字则打开一个链接
	responseKeywordLink?: AISearchConfig['responseKeywordLink'];	// 返回内容若出现关键字则则打开一个链接
	requestKeywordSystemMessage?: AISearchConfig['requestKeywordSystemMessage'];	// 发送内容若出现关键字则显示一条系统信息
	responseKeywordSystemMessage?: AISearchConfig['responseKeywordSystemMessage'];	// 返回内容若出现关键字则显示一条系统信息
	activatedPlaceholder?: string;	// 激活窗口时的 placeholder，未定义则使用“输入问题...”
	maxInputLength?: number;	// 用户输入的最大长度，未定义则 10000
	maxRounds?: number;	// 用户允许在单个对话中发送的消息回合数，未定义则无限
	maxRoundsMessage?: string;	// 用户允许在单个对话中发送的消息回合数达到上限时显示一条系统信息
	quotaUsed?: AISearchConfig['tokenLimit'];	// 用户已使用的额度，0~1，达到 1 后不允许再使用
}

const props = defineProps<Props>();

const isOpened = ref<'closed' | 'opening' | 'opened' | 'closing'>('closed');
let hasOpened = false;
const showedRequestKeywordMessage: string[] = [];
const showedResponseKeywordMessage: string[] = [];
const inputValue = ref('');
const messages = ref<AIChatMessage[]>([]);
const sessionId = ref<string | null>(null);
const loading = ref(false);
const statusText = ref('大模型处理中');
const selectedModelKey = ref<string | undefined>(undefined);

const defaultAnchorRef = ref<HTMLDivElement>(null);
const anchorRef = ref<HTMLDivElement>(null);
const textRef = ref<HTMLTextAreaElement>(null);
const messagesRef = ref<HTMLDivElement>(null);

const anchorStyle = ref<Record<string, string> | null>(null);

const openedClass = computed(() => isOpened.value === 'opening' || isOpened.value === 'opened' ? 'opened' : '');

const currentRoundsPerMax = computed(() => props.maxRounds && messages.value.filter((msg) => msg.role === 'user').length / (props.maxRounds || Number.MAX_SAFE_INTEGER));

const usageTouchedWarning = computed(() => 
	props.quotaUsed?.day >= 0.75 || props.quotaUsed?.week >= 0.75 || props.quotaUsed?.total >= 0.75 ||
	(currentRoundsPerMax.value >= 0.75)
);

const roundsSvgPiePath = computed(() => {
	const cx = 24, cy = 24, r = 20;
	const pct = currentRoundsPerMax.value;
	const startAngle = -Math.PI / 2;	// 从正上方开始
	const endAngle = startAngle + pct * 2 * Math.PI;

	const x1 = cx + r * Math.cos(startAngle);
	const y1 = cy + r * Math.sin(startAngle);
	const x2 = cx + r * Math.cos(endAngle);
	const y2 = cy + r * Math.sin(endAngle);

	const largeArcFlag = pct > 0.5 ? 1 : 0;

	if (pct >= 1) {
		// 满圆用 circle 代替，避免弧线闭合 bug
		return `M ${cx} ${cy - r}
				A ${r} ${r} 0 1 1 ${cx} ${cy + r}
				A ${r} ${r} 0 1 1 ${cx} ${cy - r}
				Z`;
	}

	return `M ${cx},${cy}
			L ${x1},${y1}
			A ${r},${r} 0 ${largeArcFlag},1 ${x2},${y2}
			Z`;
});

const openWindow = () => {
	if (!defaultAnchorRef.value) return;

	if (!hasOpened && props.init) {
		hasOpened = true;
		props.init(selectedModelKey.value);
	}

	const defaultRect = defaultAnchorRef.value.getBoundingClientRect();	// 记录默认位置
	// 按默认位置转换为 fixed 定位
	anchorStyle.value = {
		position: 'fixed',
		bottom: window.innerHeight - defaultRect.top - defaultRect.height + 'px',
		left: defaultRect.left + 'px',
		right: window.innerWidth - defaultRect.left - defaultRect.width + 'px',
		height: '32px',
		zIndex: '10',
	};

	isOpened.value = 'opening';
	const targetLeftRight = window.innerWidth * 0.30 - 100;
	const targetBottom = -40 + window.innerHeight * 0.15;
	const targetStyle = {
		position: 'fixed',
		bottom: targetBottom + 'px',
		left: targetLeftRight + 'px',
		right: targetLeftRight + 'px',
		height: '32px',
		zIndex: '10',
	}
	gsap.to(anchorStyle.value, {
		...targetStyle,
		duration: 0.7,
		ease: "power3.inOut",
		// onUpdate() {
		// 	// 强制触发响应式更新
		// 	console.log('update');
		// 	anchorStyle.value = { ...anchorStyle.value! };
		// },
		onComplete() {
			targetStyle.bottom = 'calc(-40px + 15vh)';	// 改为 CSS 能动态计算的格式
			targetStyle.left = 'calc(30vw - 100px)';
			targetStyle.right = 'calc(30vw - 100px)';
			// targetStyle.height = undefined;
			anchorStyle.value = targetStyle;
			isOpened.value = 'opened';
		}
	});
};

const closeWindow = async () => {
	const defaultRect = defaultAnchorRef.value.getBoundingClientRect();
	const currentRect = anchorRef.value.getBoundingClientRect();
	// console.log(currentRect, defaultRect);
	inputValue.value = '';
	textRef.value.value = '';
	const event = document.createEvent('HTMLEvents');
	event.initEvent('input', false, true);
	textRef.value.dispatchEvent(event);
	// 按当前位置转换为 fixed 定位
	anchorStyle.value = {
		position: 'fixed',
		bottom: window.innerHeight - currentRect.top - currentRect.height + 'px',
		left: currentRect.left + 'px',
		width: currentRect.width + 'px',
		height: '32px',
		zIndex: '10',
	};

	isOpened.value = 'closing';
	const targetStyle = {
		position: 'fixed',
		bottom: window.innerHeight - defaultRect.top - defaultRect.height + 'px',
		left: defaultRect.left + 'px',
		width: defaultRect.width + 'px',
		height: defaultRect.height + 'px',
		zIndex: '10',
	}
	gsap.to(anchorStyle.value, {
		...targetStyle,
		duration: 0.7,
		ease: "power3.inOut",
		onComplete() {
			anchorStyle.value = {};
			isOpened.value = 'closed';
		}
	});

}

const sendMessage = async () => {
	if (!inputValue.value.trim() || loading.value) return;

	// 对话轮数检查
	if (props.maxRounds) {
		if (messages.value.filter((msg) => msg.role === 'user').length > props.maxRounds) {
			messages.value.push({ role: "aiErr", text: props.maxRoundsMessage || '本轮对话发言次数已达到上限' });
			return;
		}
	}

	const userText = inputValue.value.trim();
	messages.value.push({ role: "user", text: userText, time: new Date() });
	inputValue.value = "";

	// 发送匹配关键词打开链接
	if (props.requestKeywordLink) {
		let needContinue = true;
		for (const item of props.requestKeywordLink) {
			const isContain = item.keywords.some((keyword) => userText.includes(keyword));
			if (isContain) {
				for (const url of (item.urls || [])) {
					window.open(url, '_blank');
				}
				if (item.needContinue === false) {
					needContinue = false;
				}
				for (const url of (item.execute || [])) {
					nodeBridge.spawn(url);
				}
			}
		}
		if (!needContinue) {
			return;
		}
	}
	// 发送警告词检查
	if (props.requestKeywordSystemMessage) {
		for (const item of props.requestKeywordSystemMessage) {
			const keywordIndex = item.keywords.findIndex((keyword) => userText.includes(keyword));
			if (keywordIndex >= 0) {
				const dontShowSecondTime = item.once && showedRequestKeywordMessage.includes(item.keywords[keywordIndex]);
				if (!dontShowSecondTime) {
					messages.value.push({ role: item.warning ? "aiErr" : 'aiInfo', text: item.message });
				}
				showedRequestKeywordMessage.push(item.keywords[keywordIndex]);
				if (item.forbid) {
					return;
				}
			}
		}
	}

	// 开始发送
	loading.value = true;
	if (props.chatAPI) {
		statusText.value = '呼叫大模型工作流';
		const pollingTimer = setInterval(() => {
			if (props.statusAPI) {
				props.statusAPI(selectedModelKey.value).then((result) => {
					if (result && loading.value) statusText.value = result;
				});
			}
		}, 800);
		props.chatAPI(userText, selectedModelKey.value).then((chatResult) => {
			const result = JSON.parse(chatResult.content);
			const { msg, ref, lnk, ext } = result.obj;
			const extras = (ext || '').split('&') as string[];
			const chatItem: AIChatMessage = { role: "ai", text: msg, refers: ref, actions: [], time: new Date(), expense: chatResult.expense };
			messages.value.push(chatItem);

			// 接收匹配关键词打开链接
			if (props.responseKeywordLink) {
				for (const item of props.responseKeywordLink) {
					const isContain = item.keywords.some((keyword) => msg.includes(keyword));
					if (isContain) {
						for (const url of (item.urls || [])) {
							window.open(url, item.blank === false ? '_blank' : undefined);
						}
					}
				}
			}
			// 响应警告词检查
			if (props.responseKeywordSystemMessage) {
				for (const item of props.responseKeywordSystemMessage) {
					const keywordIndex = item.keywords.findIndex((keyword) => msg.includes(keyword));
					if (keywordIndex >= 0) {
						const dontShowSecondTime = item.once && showedResponseKeywordMessage.includes(item.keywords[keywordIndex]);
						if (!dontShowSecondTime) {
							messages.value.push({ role: item.warning ? "aiErr" : 'aiInfo', text: item.message });
						}
						showedResponseKeywordMessage.push(item.keywords[keywordIndex]);
					}
				}
			}
			// 链接
			if (lnk instanceof Array) {
				for (const link of lnk) {
					if ('label' in link && 'url' in link) chatItem.actions.push(link);
				}
			}
			// 激活 1
			const matchEnd1 = /[A-Z]kn[A-Z]ui[A-Z]ev[A-Z]hr[A-Z]tg/i.exec(msg);
			const keyEnd =
				msg.match(/最终.+分/) ||
				msg.match(/((考核|测试|题目).{0,2}(通过|结束|完成))|((通过|结束|完成).{0,2}(考核|测试|题目))/) ||
				msg.includes('激活') && (msg.includes('恭喜') || msg.includes('完成了') || msg.includes('通过了') || msg.includes('成功'));
			let extraScore = undefined;
			extras.find((extra) => extra.replace(/asv1=(\d+)/, (_, content) => (extraScore = +content, '')));	// activation score v1

			if (extraScore || matchEnd1 || keyEnd) {
				let total = -1;
				const regex = /[得总]分[是为:：-\s]{0,3}(\d+(\.\d+)?)/g;
				let match1;
				// 找到文本中最高的分数
				while ((match1 = regex.exec(msg)) !== null && match1[1]) {
					if (!isNaN(+match1[1])) {
						total = +match1[1] > total ? +match1[1] : total;
					}
				}
				if (total === -1) {
					total = 15;
				} else {
					total += 1;
				}
				// 找到文本中的总分
				const matchFull = /满分[是为:：-\s]{0,3}(\d+(\.\d+)?)/.exec(msg)?.[1];
				const full = +matchFull || 40;

				total = extraScore || total;
				const finalScore = 15 + (total / full) * 50;
				console.log(`修行：${finalScore}`);
				chatItem.actions.push({ label: '生成激活码', url: `ffbox:/showActivationCodeGenMsgbox?level=${finalScore}` });

				showActivateCodeGen(Math.round(finalScore));
			}

			// 激活 2
			const matchEnd2 = /[A-Z]ae[A-Z]fv[A-Z]sw[A-Z]cg[A-Z]lr/i.exec(msg);
			let extraScoreActivated = extras.some((content) => content === 'assv1=1');	// activation score sponsored v1

			if (matchEnd2 || extraScoreActivated) {
				console.log(`修行：50`);
				chatItem.actions.push({ label: '生成激活码', url: `ffbox:/showActivationCodeGenMsgbox?level=50` });

				showActivateCodeGen(50);
			}
		}).catch((error) => {
			messages.value.push({ role: "aiErr", text: error });
		}).finally(() => {
			loading.value = false;
			clearInterval(pollingTimer);
			statusText.value = undefined;
		});
	} else {
		setTimeout(() => {
			messages.value.push({ role: "ai", text: new Date().toISOString() });
			loading.value = false;
		}, 1000);
	}
};

const resetChat = () => {
	messages.value = [];
	sessionId.value = null;
	(props.resetChat || (() => {}))(selectedModelKey.value);
	if (props.initSystemMessage) {
		setTimeout(() => {
			messages.value.push(props.initSystemMessage);
		}, 0);
	}
};

const handleActionButtonClick = (url: string) => {
	const urlObject = new URL(url);
	if (urlObject.protocol === 'ffbox:') {
		const query = new URLSearchParams(urlObject.search);
		if (urlObject.pathname === '/showActivationCodeGenMsgbox') {
			const level = +query.get('level');
			if (isFinite(level)) {
				showActivateCodeGen(level);
			}
		}
	} else {
		window.open(url);
	}
}

const handleModelChange = (event: Event) => {
	const nextModelKey = (event.target as HTMLSelectElement).value;
	if (!nextModelKey || nextModelKey === selectedModelKey.value) {
		return;
	}
	const currentOption = props.modelOptions.find((item) => item.key === selectedModelKey.value);
	const nextOption = props.modelOptions.find((item) => item.key === nextModelKey);
	selectedModelKey.value = nextModelKey;
	if (currentOption && nextOption && currentOption.provider !== nextOption.provider) {
		resetChat();
	}
};

watch(() => props.modelOptions, (newOptions) => {
	const options = newOptions || [];
	if (!options.length) {
		selectedModelKey.value = undefined;
		return;
	}
	const hasCurrent = options.some((item) => item.key === selectedModelKey.value);
	if (!hasCurrent) {
		selectedModelKey.value = options[0].key;
	}
}, { immediate: true });

let initialPlaceholderTimer: number;
const initialPlaceholderIndex = ref(0);
const initialPlaceholderText = computed(() => props.initialPlaceholders?.[initialPlaceholderIndex.value] ?? '智能帮助');
watch(() => props.initialPlaceholderInterval, () => {
	clearInterval(initialPlaceholderTimer);
	if (props.initialPlaceholderInterval) {
		initialPlaceholderTimer = setInterval(() => {
			// initialPlaceholderIndex.value = initialPlaceholderIndex.value >= (props.initialPlaceholders?.length ?? 1) - 1 ? 0 : initialPlaceholderIndex.value + 1;
			let newIndex = 0;
			do {
				newIndex = Math.floor(Math.random() * props.initialPlaceholders?.length || 1);
			} while (newIndex === initialPlaceholderIndex.value);
			initialPlaceholderIndex.value = newIndex;
		}, props.initialPlaceholderInterval) as any;
	}
}, { immediate: true });

watch(() => props.enabled, () => {
	if (props.enabled) {
		if (props.initSystemMessage) {
			messages.value.push(props.initSystemMessage);
		}
	}
}, { immediate: true });

watch(() => messages.value.length, () => {
	nextTick(() => messagesRef.value.scrollTo(0, Number.MAX_SAFE_INTEGER));
});

</script>

<template>
	<div class="defaultAnchor" ref="defaultAnchorRef" :class="props.enabled === false ? 'disabled' : ''">
		<div class="aiSearchPositionAnchor" :style="anchorStyle" ref="anchorRef">
			<transition name="panelAnim">
				<div v-show="openedClass || true" :class="['panel', openedClass]" >
					<!-- <GradientRect /> -->
					<div class="chatHeader">
						<div class="left">
							<IconAI />
							<h3>{{ props.titleName ?? 'FFBox AI 帮助' }}</h3>
							<select
								v-if="props.modelOptions.length"
								class="modelName"
								:value="selectedModelKey"
								@change="handleModelChange"
							>
								<option v-for="item in props.modelOptions" :key="item.key" :value="item.key">{{ item.label }}</option>
							</select>
							<!-- Three Concentric Progress Rings (SVG only) -->
							<div
								v-if="props.quotaUsed"
								class="usage"
								v-bind="useTooltip(`\
									${props.quotaUsed.day !== undefined ? `今日用量：${(props.quotaUsed.day * 100).toFixed(1)}%\n` : ''}\
									${props.quotaUsed.week !== undefined ? `本周用量：${(props.quotaUsed.week * 100).toFixed(1)}%\n` : ''}\
									${props.quotaUsed.total !== undefined ? `累计用量：${(props.quotaUsed.total * 100).toFixed(1)}%\n` : ''}\
									${props.maxRounds !== undefined ? `本次对话：${messages.filter((msg) => msg.role === 'user').length} / ${props.maxRounds}\n` : ''}`
								.slice(0, -1))"
							>
								<svg class="usageRing" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI 使用量">
									<defs>
										<filter id="quotaUsageBgShadow" x="-50%" y="-50%" width="200%" height="200%">
											<feDropShadow dx="0" dy="0" stdDeviation="2" :flood-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" flood-opacity="0.4"/>
										</filter>
										<filter id="quotaUsageRingShadow" x="-50%" y="-50%" width="200%" height="200%">
											<feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="hwb(var(--bg97))" flood-opacity="1"/>
										</filter>
	
										<!-- 渐变（外/中/内） -->
										<linearGradient id="gOuter" x1="0" y1="0" x2="1" y2="1">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
										<linearGradient id="gMiddle" x1="1" y1="0" x2="0" y2="1">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
										<linearGradient id="gInner" x1="0" y1="1" x2="1" y2="0">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
									</defs>
	
									<!-- 背景 -->
									<circle cx="24" cy="24" r="22" fill="hwb(var(--bg97))" filter="url(#quotaUsageBgShadow)" />
									<!-- <circle cx="24" cy="24" r="24" fill="none" stroke="#F5F7FB" stroke-width="1"/> -->
	
									<!-- 进度圆 -->
									<path
										v-if="props.maxRounds !== undefined"
										:d="roundsSvgPiePath"
										:fill="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" opacity="0.1"
									/>
	
									<!-- 外圈 -->
									<circle v-if="props.quotaUsed.day !== undefined" class="track"
										cx="24" cy="24" r="18" />
									<circle v-if="props.quotaUsed.day !== undefined" class="progress" :style="`stroke: url(#gOuter); stroke-dasharray: ${props.quotaUsed.day * 100} 100`"
										cx="24" cy="24" r="18" pathLength="100" filter="url(#quotaUsageRingShadow)" />
	
									<!-- 中圈 -->
									<circle v-if="props.quotaUsed.week !== undefined" class="track"
										cx="24" cy="24" r="13"/>
									<circle v-if="props.quotaUsed.week !== undefined" class="progress" :style="`stroke: url(#gMiddle); stroke-dasharray: ${props.quotaUsed.week * 100} 100`"
										cx="24" cy="24" r="13" pathLength="100" filter="url(#quotaUsageRingShadow)" />
	
									<!-- 内圈 -->
									<circle v-if="props.quotaUsed.total !== undefined" class="track"
										cx="24" cy="24" r="8"/>
									<circle v-if="props.quotaUsed.total !== undefined" class="progress" :style="`stroke: url(#gInner); stroke-dasharray: ${props.quotaUsed.total * 100} 100`"
										cx="24" cy="24" r="8" pathLength="100" filter="url(#quotaUsageRingShadow)" />
								</svg>
								<span class="text" v-if="usageTouchedWarning">注意用量</span>
							</div>
						</div>
						<div class="right">
							<Button @click="resetChat" :type="ButtonType.NoBg" :disabled="loading"><IconRefresh /></Button>
							<Button @click="closeWindow" :type="ButtonType.NoBg"><IconX style="height: 20px" /></Button>
						</div>
					</div>
					<div class="chatMessages" ref="messagesRef">
						<TransitionGroup name="msgAnim">
							<div v-for="(msg, idx) in messages" :key="idx" :class="['msg', msg.role]">
								<div class="msgContent">
									<!-- {{ msg.text }} -->
									<template v-for="(line, index) in msg.text.split('\n')" :key="index">
										{{ line }}<br />
									</template>
								</div>
								<div class="smallText">
									{{ [
										msg.time ? getTimeString(msg.time, false) : '',
										msg.refers?.length ? '参考来源：' + msg.refers.join('；') : '',
										msg.expense ? '算力开销：' + Math.round(msg.expense) : '',
									].filter((text) => text).join('｜') }}
									<button v-for="action in msg.actions" @click="handleActionButtonClick(action.url)">{{ action.label }}</button>
								</div>
							</div>
							<div v-if="statusText && loading" :key="messages.length" class="msg aiInfo">
								<div class="msgContent"><IconLoading class="loading" />{{ statusText }}</div>
							</div>
						</TransitionGroup>
					</div>
				</div>
			</transition>
			<div class="inputArea" :class="openedClass">
				<textarea
					type="text"
					rows="1"
					:class="openedClass"
					ref="textRef"
					v-model="inputValue"
					:placeholder="openedClass.length ? '输入问题...' : ''"
					:disabled="loading"
					:maxlength="props.maxInputLength ?? 10000"
					oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
					@focus="() => isOpened === 'closed' ? openWindow() : null"
					@keyup.enter="sendMessage"
				/>
				<div :class="['iconAI', openedClass]">
					<IconAI />
					<span>{{ initialPlaceholderText }}</span>
				</div>
				<!-- <div class="gradientTemparory"></div> -->
				<GradientRect v-if="isOpened === 'closed'" class="gradientRect" />
				<Button @click="sendMessage" :disabled="loading" :class="openedClass">🚀</Button>
				<!-- <div v-if="loading" class="loading-overlay">
					<div class="spinner"></div>
				</div> -->
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	.defaultAnchor {
		position: relative;
		height: 32px;
		transition: width 0.5s ease;
		&.disabled {
			width: 0 !important;
			overflow: hidden;
		}
		.aiSearchPositionAnchor {
			position: relative;	// 激活时由 js 改为 fixed
			height: 100%;	// 激活时由 js 控制
			.inputArea {
				position: absolute;
				bottom: 0;
				height: 32px;	// 关闭状态
				width: 100%;
				display: flex;
				align-items: stretch;
				transition: height 0.7s ease;
				-webkit-app-region: none;
				&.opened {
					// max-height: 82px;	// 打开状态
					height: unset;
				}
				textarea {
					width: 100%;
					max-height: 32px;
					box-sizing: border-box;
					padding: 8px 10px 5px;
					border: none;
					outline: none;
					border-radius: 16px;
					font-family: inherit;
					font-size: 14px;
					line-height: 19px;
					color: inherit;
					background-color: hwb(var(--bg99));
					box-shadow: 0 0 1px 0.5px hwb(var(--highlight)),
								0 1.5px 3px 0 hwb(var(--hoverShadow) / 0.2);
					overflow: auto;
					resize: none;
					transition: all 0.7s ease;
					&.opened {
						width: calc(100% - 48px);
						margin-right: 48px;
						max-height: 82px;
						height: unset;	// 自由拓展高度，直到 max-height
					}
				}
				.iconAI {
					position: absolute;
					bottom: 0;
					left: 0;
					right: 0;
					height: 32px;
					margin-right: 4px;
					display: flex;
					justify-content: center;
					align-items: center;
					gap: 8px;
					color: var(--33);
					font-size: 13px;
					opacity: 0.7;
					pointer-events: none;
					transition: opacity 0.1s linear;
					&.opened {
						opacity: 0;
					}
					svg {
						height: 32px;
					}
					span {
						max-width: calc(100% - 32px - 16px);
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
				}
				&:hover:not(&.opened) .iconAI {
					opacity: 1;
				}
				.gradientRect {
					position: absolute;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					border-radius: 16px;
					opacity: 0;
					pointer-events: none;
					box-shadow: 0 1px 0px 0px hwb(228 30% 0% / 0.3);
				}
				&:hover>svg {
					opacity: 1;
					box-shadow: 0 1px 16px 16px hwb(228 30% 0% / 0);
					transition: box-shadow 0.6s ease-out;
				}
				button {
					position: absolute;
					right: 0;
					top: 0;
					bottom: 0;
					width: 0;
					min-width: unset;
					height: 100%;
					padding: 0;
					opacity: 0;
					overflow: hidden;
					transition: width 0.7s ease, opacity 0.5s linear;
					&.opened {
						width: 40px;
						opacity: 1;
					}
				}
				.loading-overlay {
					position: absolute;
					inset: 0;
					background: rgba(255, 255, 255, 0.7);
					display: flex;
					align-items: center;
					justify-content: center;
	
					.spinner {
						width: 32px;
						height: 32px;
						border: 3px solid #ccc;
						border-top-color: #007bff;
						border-radius: 50%;
						animation: spin 1s linear infinite;
					}
				}
			}
			// .panelAnim-enter-from {
			// 	top: 0;
			// }
			// .panelAnim-enter-active {
			// 	transition: all 2s linear;
			// }
			// .panelAnim-enter-to {
			// 	top: calc(-80px - 70vh + 60px);
			// }
			.panel {
				position: absolute;
				top: 0;
				// top: calc(-80px - 70vh + 60px);
				left: -8px;
				right: -8px;
				bottom: -8px;
				border-radius: 8px;
				background-color: hwb(var(--bg97) / 0.7);
				backdrop-filter: blur(2px) contrast(110%);
				box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
						0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),	// 远阴影
						0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),	// 近阴影
						0 10px 40px -8px hwb(220 30% 0% / 0.2),
						0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
				display: flex;
				flex-direction: column;
				overflow: hidden;
				opacity: 0;
				transition: top 0.7s cubic-bezier(0.5, 0, 0.2, 1), opacity 0.3s linear 0.1s;
				-webkit-app-region: none;
				&.opened {
					opacity: 1;
					top: calc(-80px - 70vh + 60px);
					transition: top 0.7s cubic-bezier(0.8, 0, 0.2, 1) 0.1s, opacity 0.1s linear;
				}
				// svg {
				// 	position: absolute;
				// 	width: 100%;
				// 	height: 100%;
				// 	pointer-events: none;
				// }
				.chatHeader {
					display: flex;
					justify-content: space-between;
					padding: 8px 12px;
					border-bottom: 1px solid var(--77);
					background: hwb(var(--bg95));
					.left {
						display: flex;
						align-items: center;
						svg {
							height: 28px;
						}
						h3 {
							margin: 0 8px;
							font-size: 18px;
							font-weight: 500;
						}
						.modelName {
							display: inline-block;
							padding: 2px 4px;
							margin-left: 4px;
							font-size: 10px;
							border: hwb(255 50% 0% / 0.5) 1px solid;
							border-radius: 4px;
							background-color: hwb(255 50% 0% / 0.2);
							color: inherit;
							outline: none;
							max-width: 220px;
						}
						.usage {
							display: flex;
							align-items: center;
							.usageRing {
								--blue1: #5B8DEF;
								--blue2: #1AD6FF;
								--green1: #7BD88F;
								--green2: #2ED573;
								--red1: hwb(20 20% 0%);
								--red2: hwb(5 40% 5%);
								// --red1: #FAD961;
								// --red2: #F76B1C;
								margin-left: 12px;
								width: 22px;
								height: 22px;
								.track {
									fill: none;
									stroke: hwb(0 65% 35% / 0.05);
									stroke-width: 2px;
								}
								.progress {
									fill: none;
									stroke-linecap: round;
									stroke-dashoffset: 0;
									stroke-dasharray: var(--p,0) 100;
									stroke-width: 2.5px;
									transform-origin: 24px 24px;	// 方便整体旋转让起点在正上方
									transform: rotate(-90deg);
									transition: stroke-dasharray .6s ease;
									opacity: 0.5;
								}
							}
							.text {
								margin-left: 8px;
								font-size: 10px;
							}
						}
					}
					.right {
						display: flex;
						button {
							min-width: unset;
							width: 30px;
							margin: 0 0 0 2px;
							padding: 0;
							display: flex;
							justify-content: center;
							align-items: center;
							svg {
								height: 14px;
								width: auto;
							}
						}
					}
				}
				.chatMessages {
					flex: 1;
					padding: 12px 12px;
					margin-bottom: 68px;
					overflow-y: auto;
					.msgAnim-enter-from {
						opacity: 0;
						&.user>div {
							transform: scale(0.95);
							box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset !important;	// 上高光;
						}
						&.ai>div {
							transform: scale(0.9);
							box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset !important;	// 上高光;
						}
					}
					.msgAnim-enter-active {
						transition: opacity 0.1s linear, flex 10s;	// flex 是撑时长给 vue 看的
						div {
							transition: all 0.7s cubic-bezier(0.1, 2, 0.3, 1);
						}
					}
					.msgAnim-leave-to {
						opacity: 0;
						transform: scale(0.6);
					}
					.msgAnim-leave-active {
						transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(1, 0, 1, 1);
					}
					.msg {
						position: relative;
						margin-bottom: 24px;
						.msgContent {
							display: inline-block;
							max-width: 80%;
							padding: 10px 16px;
							border-radius: 8px;
							border: none;
							font-size: 14px;
							line-height: 18px;
							text-align: justify;
							opacity: 1;
							user-select: text;
							@keyframes rotation {
								from {
									transform: rotate(0deg);
								}
								to {
									transform: rotate(360deg);
								}
							}
							.loading {
								width: 18px;
								height: 18px;
								animation: rotation 1s steps(8) infinite;
								margin-right: 4px;
								vertical-align: -4px;
								color: #33aacc77;
							}
						}
						.smallText {
							position: absolute;
							top: calc(100% + 6px);
							font-size: 10px;
							opacity: 0.5;
							button {
								font-size: 10px;
							}
						}
						&.user {
							text-align: right;
							.msgContent {
								color: #fefefe;
								// background-color: hwb(210 5% 5% / 0.85);
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(210 5% 5% / 0.85) inset;	// 背景色
							}
							.smallText {
								right: 2px;
							}
						}
						&.ai, &.aiErr, &.aiInfo {
							text-align: left;
							.msgContent {
								color: var(--33);
								// background-color: hwb(var(--hoverLightBg) / 0.5);
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(var(--hoverLightBg) / 0.85) inset;	// 背景色
							}
							.smallText {
								left: 2px;
							}
						}
						&.aiErr>.msgContent {
							color: #dd8800;
							font-style: italic;
						}
						&.aiInfo>.msgContent {
							color: #33aacc;
							font-style: italic;
						}
					}
				}
			}
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
