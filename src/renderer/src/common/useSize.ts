import { ref, watch, onBeforeUnmount, type Ref, type MaybeRefOrGetter, toValue } from 'vue';

/**
 * 监听元素尺寸变化，返回响应式的 width / height。
 *
 * @param target 要监听的元素 ref 或 getter（可以是 null，元素就绪后自动开始监听）
 * @returns `{ width, height }` 响应式引用
 *
 * @example
 * ```ts
 * const el = ref<HTMLElement>();
 * const { width, height } = useSize(el);
 * ```
 */
export function useSize(target: MaybeRefOrGetter<HTMLElement | null | undefined>) {
	const width = ref(0);
	const height = ref(0);

	let observer: ResizeObserver | null = null;
	let currentEl: HTMLElement | null = null;

	function observe(el: HTMLElement | null | undefined) {
		// 清理旧的
		if (observer && currentEl) {
			observer.unobserve(currentEl);
		}
		currentEl = el ?? null;
		if (!currentEl) return;

		if (!observer) {
			observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const box = entry.borderBoxSize?.[0];
					if (box) {
						width.value = box.inlineSize;
						height.value = box.blockSize;
					} else {
						// fallback
						const rect = currentEl!.getBoundingClientRect();
						width.value = rect.width;
						height.value = rect.height;
					}
				}
			});
		}
		observer.observe(currentEl);
		// 立即同步一次
		const rect = currentEl.getBoundingClientRect();
		width.value = rect.width;
		height.value = rect.height;
	}

	// 当 target 变化时重新观察
	const stop = watch(
		() => toValue(target),
		(el) => observe(el),
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		stop();
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	});

	return { width, height };
}
