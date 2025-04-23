<script setup lang="ts">
import { useTooltip } from '@renderer/common/tooltipUtil';
import Checkbox from '@renderer/components/Checkbox/Checkbox.vue';
import { watch } from 'vue';

const props = defineProps<{
    title: string;
	description?: string;
	long?: boolean;
	optional?: boolean;
	hasValue?: boolean;
	onEnabledChange?: (checked: boolean) => any;
}>();
</script>

<template>
    <div class="controlBox" :style="{ minWidth: props.long ? 'calc(100% - 28px)' : '210px' }">
		<Checkbox v-if="props.optional" :checked="props.hasValue" @change="props.onEnabledChange" />
		<div class="controlBox-title" v-bind="props.description ? useTooltip(props.description) : undefined" :style="{ opacity: props.optional && hasValue === false ? 0.5 : 1 }">
			{{ props.title }}
		</div>
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
