<script setup lang="ts">
import type { MenuItem } from '@renderer/components/Menu/Menu';
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import DropdownInput from './DropdownInput.vue';

interface Props {
	title: string;
	text: string;
	list: MenuItem[];
	readonly?: boolean;
	deletable?: boolean;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
	onDelete?: (index: number) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title">
        <DropdownInput v-bind="$props" />
    </ControlBox>
</template>
