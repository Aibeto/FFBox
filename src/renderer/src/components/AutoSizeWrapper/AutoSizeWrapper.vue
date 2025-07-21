<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount, nextTick, computed, StyleValue } from 'vue'

interface Props {
	useResizeObserver?: boolean;
	style?: (size: { width: number; height: number }) => StyleValue;
	onResize?: (size: { width: number; height: number }) => void;
}

const props = defineProps<Props>();

const containerRef = ref<HTMLElement>();
const width = ref(0);
const height = ref(0);
let resizeObserver: ResizeObserver | null = null;

const updateSize = () => {
	if (!containerRef.value) return;
	const rect = containerRef.value.firstElementChild.getBoundingClientRect();
	width.value = rect.width;
	height.value = rect.height;
	props.onResize?.({ width: width.value, height: height.value });
};

onMounted(async () => {
	await nextTick();
	updateSize();
	if (props.useResizeObserver && containerRef.value) {
		resizeObserver = new ResizeObserver(() => updateSize());
		resizeObserver.observe(containerRef.value.firstElementChild);
	}
});

onBeforeUnmount(() => {
	if (resizeObserver && containerRef.value) {
		resizeObserver.unobserve(containerRef.value.firstElementChild);
	}
});

const computedStyle = computed(() => props.style?.({ width: width.value, height: height.value }) || {});

</script>

<template>
	<div :style="computedStyle" ref="containerRef">
		<div>
			<slot />
		</div>
	</div>
</template>
