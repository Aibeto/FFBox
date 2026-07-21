<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import { ButtonType } from '@renderer/components/Button/Button';
import { showActivateCodeGen } from './activateCodeGen';

/**
 * AISearch iframe 宿主组件。
 *
 * 架构：
 * - 本组件本身为 AISearch 内容的「定位容器」。
 *   本组件通过 `position: absolute; inset: 0;` 撑满外层容器。
 * - iframe 仍然是 100vw × 100vh 的全屏覆盖层，但其内部的 aiSearchWrapper 是由本组件向其下发自身的 getBoundingClientRect（相对父页面 viewport），iframe 据此将包装器 fixed 定位到与宿主容器重合的位置。
 *
 * 点击穿透策略：
 * - iframe 元素的 pointer-events 在 'none'（默认，空白区域可点击穿透到下方文档）和 'auto'（内容可交互）间切换。
 * - 父页面通过 mousemove 判断鼠标是否进入 iframe 上报的内容边界，进入则开启 'auto'。
 * - iframe 内容触发 mouseleave 时上报，父页面据此关闭 'auto'。
 */

const appStore = useAppStore();

interface Props {
	platform?: string;
}

const props = defineProps<Props>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const hostRef = ref<HTMLDivElement | null>(null);
const iframePointerEvents = ref<'none' | 'auto'>('none');
const lastBounds = ref<{ top: number, left: number, width: number, height: number } | null>(null);
let lastMouseX = -1;
let lastMouseY = -1;
let iframeReady = false;
let resizeObserver: ResizeObserver | null = null;

// iframe 路径：
// - 开发环境：指向 ffboxSite 中 AISearch-iframe 项目的独立 dev server（支持 HMR，需另起 `npm --prefix A:/Code/FFBoxSite/AISearch-iframe run dev`，默认端口 5175）
// - 生产环境：由 ffboxSite 提供，加载其构建产物 aiSearch/index.html（需本地运行 ffboxSite）
const iframeSrc = import.meta.env.DEV
	? 'http://localhost:5176'
	: 'http://localhost:5173/aiSearch/index.html';

const sendTheme = () => {
	if (!iframeReady) return;
	iframeRef.value?.contentWindow?.postMessage({ type: 'theme', theme: appStore.frontendSettings.colorTheme }, '*');
};
const sendPlatform = () => {
	if (!iframeReady) return;
	iframeRef.value?.contentWindow?.postMessage({ type: 'platform', platform: props.platform }, '*');
};

// 将宿主容器自身在父页面 viewport 下的 rect 下发到 iframe
const sendHostBounds = () => {
	if (!iframeReady || !hostRef.value) return;
	const rect = hostRef.value.getBoundingClientRect();
	// console.log('主→子 bounds', rect);
	iframeRef.value?.contentWindow?.postMessage({ type: 'bounds', rect }, '*');
};

watch(() => appStore.frontendSettings.colorTheme, () => {
	sendTheme();
});

const isPointInBounds = (x: number, y: number) => {
	if (!lastBounds.value) return false;
	return x >= lastBounds.value.left && x <= lastBounds.value.left + lastBounds.value.width
		&& y >= lastBounds.value.top && y <= lastBounds.value.top + lastBounds.value.height;
};

const handleMouseMove = (e: MouseEvent) => {
	lastMouseX = e.clientX;
	lastMouseY = e.clientY;
	iframePointerEvents.value = isPointInBounds(e.clientX, e.clientY) ? 'auto' : 'none';
};

// 处理 ffbox:/ 协议动作（来自 iframe 的 action 消息）
const handleAction = (url: string) => {
	try {
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
	} catch (e) {
		console.log('AISearch iframe action 解析失败', url, e);
	}
};

// 显示初始化弹窗（iframe 中无法显示 Msgbox，转发到父页面）
const showInitMsgbox = (content: string) => {
	Msgbox({
		content,
		buttons: [{ text: '我已知悉，继续', type: ButtonType.Primary }]
	});
};

const handleMessage = (event: MessageEvent) => {
	const data = event.data;
	if (!data || typeof data !== 'object') return;
	switch (data.type) {
		case 'ready':
			iframeReady = true;
			sendTheme();
			sendPlatform();
			// iframe 就绪后立即下发一次 bounds，避免首次渲染错位
			sendHostBounds();
			break;
		case 'bounds':
			lastBounds.value = data.rect;
			// console.log('子→主 bounds', lastBounds.value);
			// bounds 变化时，根据最近鼠标位置重新判定 pointer-events
			iframePointerEvents.value = isPointInBounds(lastMouseX, lastMouseY) ? 'auto' : 'none';
			break;
		case 'contentMouseLeave':
			// 鼠标离开 iframe 内容区域，关闭 pointer-events 以放行点击穿透
			iframePointerEvents.value = 'none';
			break;
		case 'action':
			handleAction(data.url);
			break;
		case 'initMsgbox':
			showInitMsgbox(data.content);
			break;
	}
};

onMounted(() => {
	window.addEventListener('message', handleMessage);
	window.addEventListener('mousemove', handleMouseMove);
	console.log('AISearch iframe host mounted');

	// 监听宿主容器尺寸变化（窗口缩放、父页面动画导致位置变更等）。
	// ResizeObserver 仅能监听到尺寸变化，位置变化需额外兜底。
	if (hostRef.value && typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(() => sendHostBounds());
		resizeObserver.observe(hostRef.value);
	}

	// 兜底：在 window resize / scroll 时重新计算（scroll 会改变父页面 viewport 下的位置）
	window.addEventListener('resize', sendHostBounds);
	window.addEventListener('scroll', sendHostBounds, true);

	// 首次挂载也主动下发一次（以防 iframe 先 ready 后 host 还未完整渲染）
	// sendHostBounds();
});

onBeforeUnmount(() => {
	window.removeEventListener('message', handleMessage);
	window.removeEventListener('mousemove', handleMouseMove);
	window.removeEventListener('resize', sendHostBounds);
	window.removeEventListener('scroll', sendHostBounds, true);
	if (resizeObserver && hostRef.value) {
		resizeObserver.unobserve(hostRef.value);
		resizeObserver.disconnect();
		resizeObserver = null;
	}
});
</script>

<template>
	<!-- 宿主容器：撑满由父页面 .center 定位的外层容器。
	     getBoundingClientRect 即代表 AISearch 内容应出现的位置与尺寸。 -->
	<div ref="hostRef" class="aiSearchHost"></div>
	<iframe
		ref="iframeRef"
		class="aiSearchIframe"
		:src="iframeSrc"
		frameborder="0"
		scrolling="no"
		:style="{ pointerEvents: iframePointerEvents }"
	></iframe>
	<div
		v-if="lastBounds"
		class="noDragOverlay"
		:style="{
			top: `${lastBounds.top}px`,
			left: `${lastBounds.left}px`,
			width: `${lastBounds.width}px`,
			height: `${lastBounds.height}px`,
		}"
	></div>
</template>

<style scoped>
	.aiSearchHost {
		/* 让宿主容器继承父页面 .center 的定位与尺寸 */
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
	}
	.aiSearchIframe {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		border: none;
		background: transparent;
	}
	.noDragOverlay {
		position: fixed;
		-webkit-app-region: no-drag;
		pointer-events: none;
		outline: red 1px dashed;
	}
</style>
