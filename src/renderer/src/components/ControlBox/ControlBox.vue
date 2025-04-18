<script setup lang="ts">
import { useTooltip } from '@renderer/common/tooltipUtil';

const props = defineProps<{
    title: string;
	description?: string;
	long?: boolean;
}>();
</script>

<template>
    <div class="controlBox" :style="{ minWidth: props.long ? 'calc(100% - 28px)' : '210px' }">
		<div class="controlBox-title" v-bind="props.description ? useTooltip(props.description) : undefined">{{ props.title }}</div>
        <slot></slot>
	</div>
</template>

<style>
	.controlBox {
		height: 56px;
		margin: 4px 28px 4px 20px;
        display: flex;
		justify-content: space-between;
        align-items: center;
		gap: 4px;
	}
		.controlBox-title {
			min-width: 88px;
			font-size: 14px;
			text-align: center;
		}
        &:nth-child(2) {
			flex-grow: 1;
			max-width: 40px;
		}

</style>
