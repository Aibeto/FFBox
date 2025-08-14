<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import gsap from 'gsap';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import GradientRect from './gradientRect.svg?skipsvgo';	// svgo 存在 bug 导致 svg 中的 id 跨 svg 产生重复，见 https://svgo.dev/docs/plugins/cleanupIds/
import IconRefresh from './refresh.svg';
import IconAI from './AI.svg';
import IconX from '@renderer/assets/×.svg';

interface Props {
	enabled?: boolean;	// 是否启用并显示该组件，未定义则启用
	chatAPI?: (message: string) => Promise<string>;	// 聊天 API，未定义则将在对话框中输出当前时间，出错将显示错误信息
	titleName?: string;	// 标题名，未定义则使用“FFBox AI 帮助”
	modelName?: string;	// 显示在标题旁的模型名，未定义则不显示
	initialPlaceholders?: string[];	// 未激活窗口时的 placeholder，未定义则使用“智能帮助”
	initialPlaceholderInterval: number;	// 未激活窗口时的 placeholder 的轮换间隔（ms），未定义则使用 4000
	activatedPlaceholder?: string;	// 激活窗口时的 placeholder，未定义则使用“输入问题...”
	maxInputLength?: string;	// 用户输入的最大长度，未定义则无限
	maxRounds?: string;	// 用户允许在单个对话中发送的消息回合数，未定义则无限
	quotaUsed?: number;	// 用户已使用的额度，0~1，达到 1 后不允许再使用
}

interface Message {
	role: 'user' | 'ai';
	text: string;
}

const url = "YOUR_API_URL";
const apiKey = "YOUR_API_KEY";

const isOpened = ref<'closed' | 'opening' | 'opened' | 'closing'>('closed');
const inputValue = ref('');
const messages = ref<Message[]>([]);
const sessionId = ref<string | null>(null);
const loading = ref(false);

const defaultAnchorRef = ref<HTMLDivElement>(null);
const anchorRef = ref<HTMLDivElement>(null);
const textRef = ref<HTMLTextAreaElement>(null);

const anchorStyle = ref<Record<string, string> | null>(null);

const openedClass = computed(() => isOpened.value === 'opening' || isOpened.value === 'opened' ? 'opened' : '');

const openWindow = () => {
	if (!defaultAnchorRef.value) return;
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

	const userText = inputValue.value.trim();
	messages.value.push({ role: "user", text: userText });
	inputValue.value = "";
	loading.value = true;

	try {
		const data: any = {
			input: { prompt: userText },
			parameters: {},
			debug: {}
		};
		if (sessionId.value) {
			data.input.session_id = sessionId.value;
		}

		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(data)
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const resData = await res.json();

		// 保存 session_id
		if (!sessionId.value) {
			sessionId.value = resData.output.session_id;
		}

		messages.value.push({ role: "ai", text: resData.output.text });
	} catch (err: any) {
		messages.value.push({ role: "ai", text: `请求失败: ${err.message}` });
	} finally {
		loading.value = false;
	}
};

const clearChat = () => {
	messages.value = [];
	sessionId.value = null;
};
</script>

<template>
	<div class="defaultAnchor" ref="defaultAnchorRef">
		<div class="aiSearchPositionAnchor" :style="anchorStyle" ref="anchorRef">
			<transition name="panelAnim">
				<div v-show="openedClass || true" :class="['panel', openedClass]" >
					<!-- <GradientRect /> -->
					<div class="chatHeader">
						<div class="left">
							<IconAI />
							<h3>FFBox AI 帮助</h3>
						</div>
						<div class="right">
							<Button @click="clearChat" :type="ButtonType.NoBg"><IconRefresh /></Button>
							<Button @click="closeWindow" :type="ButtonType.NoBg"><IconX style="height: 20px" /></Button>
						</div>
					</div>
					<div class="chatMessages">
						<TransitionGroup name="msgAnim">
							<div v-for="(msg, idx) in messages" :key="idx" :class="['msg', msg.role]">
								<div>{{ msg.text }}</div>
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
					oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
					@focus="() => isOpened === 'closed' ? openWindow() : null"
					@keyup.enter="sendMessage"
				/>
				<div :class="['iconAI', openedClass]">
					<IconAI />
					智能帮助
				</div>
				<!-- <div class="gradientTemparory"></div> -->
				<GradientRect v-if="isOpened === 'closed'" class="gradientRect" />
				<Button @click="sendMessage" :disabled="loading" :class="openedClass">🚀</Button>
				<div v-if="loading" class="loading-overlay">
					<div class="spinner"></div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	.defaultAnchor {
		position: relative;
		height: 32px;
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
						0 10px 40px -8px rgba(77, 128, 255, 0.2),
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
					padding: 12px 12px 80px;
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
					.msg {
						margin-bottom: 24px;
						div {
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
						}
						&.user {
							text-align: right;
							div {
								color: #fefefe;
								// background-color: hwb(210 5% 5% / 0.85);
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(210 5% 5% / 0.85) inset;	// 背景色
							}
						}
						&.ai {
							text-align: left;
							div {
								color: var(--33);
								// background-color: hwb(var(--hoverLightBg) / 0.5);
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(var(--hoverLightBg) / 0.85) inset;	// 背景色
							}
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
