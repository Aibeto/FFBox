<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { gsap } from 'gsap';

const container = ref<HTMLDivElement>(null);
const dots = reactive([]);

// 初始化点阵
const initDots = () => {
	const spacing = 24;
	const rect = container.value.getBoundingClientRect();
	const cols = Math.floor(rect.width / spacing);
	const rows = Math.floor(rect.height / spacing);
	const initX = (rect.width - (cols - 1) * spacing) / 2 - 3;	// 算头算尾再减去原点本身半径
	const initY = (rect.height - (rows - 1) * spacing) / 2 - 3;

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			dots.push({
				x: x * spacing + initX,
				y: y * spacing + initY,
				distance: Math.max(Math.abs(x / cols - 0.5), Math.abs(y / rows - 0.5)) * 2,	// 到画面中心的比例距离
				scale: 1,
				color: 'transparent',
				opacity: 0,
				boxShadow: '0 0 0px hwb(220 25% 10% / 0)',
			});
		}
	}
};

onMounted(() => {
	initDots();
	setTimeout(() => {
		anim();
	}, 100);
});

// 处理拖拽
function anim() {
	// const rect = container.value.getBoundingClientRect();
	// const dropX = e.clientX - rect.left;
	// const dropY = e.clientY - rect.top;

	dots.forEach((dot, index) => {
		// const dx = dot.x - dropX
		// const dy = dot.y - dropY
		// const dist = Math.sqrt(dx * dx + dy * dy)
		const delay = (1 - dot.distance) * 0.2;

		// 重置点状态
		gsap.set(dot, {
			scale: 1,
			color: 'hwb(220 25% 10%)',
			opacity: 0,
			boxShadow: '0 0 0px hwb(220 25% 10% / 0)',
		});

		gsap.to(dot, {
			delay,
			duration: 0.1,
			scale: 1.4,
			color: 'hwb(220 25% 10%)',
			boxShadow: '0 0 8px hwb(220 25% 10% / 1)',
			opacity: 1,
			onComplete: () => {
				gsap.to(dot, {
					delay: delay - 0.2,	// 切掉动画开始的前 0.2s
					duration: 0.8,
					scale: 0.8 * dot.distance,
					color: 'hwb(220 25% 10%)',
					opacity: 0.3 + 0.7 * dot.distance,
					boxShadow: '0 0 2px hwb(220 25% 10% / 0)',
					ease: 'power3.inOut',
				});
			},
		});
	})
}
</script>

<template>
	<div class="container-out">
		<div class="container-in" ref="container">
			<div
				v-for="(dot, index) in dots"
				:key="index"
				class="dot"
				:style="{
					left: dot.x + 'px',
					top: dot.y + 'px',
					transform: `scale(${dot.scale})`,
					backgroundColor: dot.color,
					opacity: dot.opacity,
					boxShadow: dot.boxShadow,
				}"
			/>
		</div>
		<slot></slot>
	</div>
</template>

<style scoped>
	.container-out {
		overflow: hidden;
	}
	.container-in {
		height: 100%;
		overflow: hidden;
		margin: auto;
		border: 2px dashed var(--77);
	}
	.dot {
		position: absolute;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		pointer-events: none;
		transform-origin: center center;
	}
</style>
