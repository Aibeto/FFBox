import { ref, watch, onUnmounted, type Ref } from 'vue';

interface UseScrollStopOptions {
	targetRef: Ref<HTMLElement | null>;
	delay?: number;
	disabledRef?: Ref<boolean>;
	onScrollStop: () => void;
}

/**
 * 滚动停止检测 composable
 * 当目标元素停止滚动指定时间后触发回调。
 * 支持两种滚动模式：
 * - 被动滚动（鼠标滚轮/键盘方向键）：停止后 delay 触发
 * - 主动拖动（触屏/鼠标拖动滚动条）：停止后若指针仍按下则等松开再触发
 */
export function useScrollStop(options: UseScrollStopOptions) {
	const { targetRef, delay = 50, disabledRef, onScrollStop } = options;

	const isScrolling = ref(false);
	let scrollTimer: ReturnType<typeof setTimeout> | null = null;
	let pointerIsDown = false;
	let needsPointerUp = false;
	let boundTarget: HTMLElement | null = null;

	const handleScrollOrWheel = () => {
		if (disabledRef?.value) {
			console.log('scroll 触发，但禁用本次响应');
			return;
		}
		console.log('scroll 触发');
		isScrolling.value = true;
		needsPointerUp = false;
		if (scrollTimer !== null) {
			clearTimeout(scrollTimer);
		}
		scrollTimer = setTimeout(() => {
			scrollTimer = null;
			if (pointerIsDown) {
				// 指针仍按下，等松开后再触发
				needsPointerUp = true;
				console.log('延时完毕，指针未松开');
			} else {
				// 指针未按下，立即触发
				isScrolling.value = false;
				console.log('延时完毕 scrollStop 触发');
				onScrollStop();
			}
		}, delay);
	};

	const handlePointerDown = () => {
		pointerIsDown = true;

		const handlePointerUp = () => {
			window.removeEventListener('mouseup', handlePointerUp);
			window.removeEventListener('touchend', handlePointerUp);
			pointerIsDown = false;
			if (needsPointerUp) {
				console.log('指针已松开 scrollStop 触发');
				needsPointerUp = false;
				if (scrollTimer !== null) {
					clearTimeout(scrollTimer);
					scrollTimer = null;
				}
				isScrolling.value = false;
				onScrollStop();
			}
		};
		window.addEventListener('mouseup', handlePointerUp);
		window.addEventListener('touchend', handlePointerUp);
	};

	const bind = (el: HTMLElement | null) => {
		if (boundTarget) {
			boundTarget.removeEventListener('scroll', handleScrollOrWheel);
			boundTarget.removeEventListener('wheel', handleScrollOrWheel);
			boundTarget.removeEventListener('pointerdown', handlePointerDown);
		}
		boundTarget = el;
		if (el) {
			el.addEventListener('scroll', handleScrollOrWheel, { passive: true });
			el.addEventListener('wheel', handleScrollOrWheel, { passive: true });
			el.addEventListener('pointerdown', handlePointerDown);
		}
	};

	// 自动绑定：当 targetRef 变化时重新绑定
	watch(targetRef, (newEl) => {
		bind(newEl);
	}, { immediate: true });

	onUnmounted(() => {
		bind(null); // 解绑
		if (scrollTimer !== null) {
			clearTimeout(scrollTimer);
		}
	});

	return { isScrolling };
}
