<script setup lang="ts">
interface Props {
	label?: string;
    size?: 's' | 'm';
	disabledLeft?: boolean;
	disabledRight?: boolean;
	onLeft?: () => any;
	onRight?: () => any;
}

const props = defineProps<Props>();

const goLeft = () => {
	if (props.disabledLeft) return;
	props.onLeft?.();
};
const goRight = () => {
	if (props.disabledRight) return;
	props.onRight?.();
};
</script>

<template>
	<div :class="['rockerSwitch', props.size ?? 's']">
		<div class="buttonWrapper">
			<button class="arrow arrowLeft" :disabled="disabledLeft" @click="goLeft">◀</button>
			<button class="arrow arrowRight" :disabled="disabledRight" @click="goRight">▶</button>
		</div>
		<span class="label"><slot>{{ label }}</slot></span>
	</div>
</template>

<style lang="less" scoped>
	.rockerSwitch {
		position: relative;
		// height: 取决于尺寸;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		isolation: isolate;
		opacity: 0.7;
		.buttonWrapper {
			position: absolute;
			width: 100%;
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: stretch;
			z-index: -1;
			-webkit-mask-image: linear-gradient(to right, black 25%, transparent 50%, black 75%);
		}
		.arrow {
			flex: 1 1 auto;
			// height: 取决于尺寸;
			margin: 0 4px;
			border: none;
			background: none;
			color: inherit;
			border-radius: 4px;
			// font-size: 取决于尺寸;
			line-height: 1;
			&:hover:not(:disabled) {
				background-color: hwb(var(--bg99) / 0.4);
				box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.2),
							0 4px 2px -2px hwb(var(--highlight) / 0.5) inset;
			}
			&:active:not(:disabled) {
				box-shadow: 0 0px 1px hwb(var(--hoverShadow) / 0.2),
							0 20px 15px -10px hwb(var(--hoverShadow) / 0.15) inset;
				transform: translateY(0.25px);
			}
			&:disabled {
				opacity: 0.3;
				cursor: default;
			}
			&.arrowLeft {
				text-align: left;
			}
			&.arrowRight {
				text-align: right;
			}
		}
		.label {
			// font-size: 取决于尺寸;
			pointer-events: none;
			// padding: 取决于尺寸;
		}
		&.s {
			height: 30px;
			.arrow {
				height: 22px;
				font-size: 12px;
			}
			.label {
				font-size: 12px;
				padding: 0 26px;
			}
		}
        &.m {
            height: 35px;
			.arrow {
				height: 26px;
				font-size: 13.5px;
			}
			.label {
				font-size: 13.5px;
				padding: 0 30px;
			}
        }
	}
</style>