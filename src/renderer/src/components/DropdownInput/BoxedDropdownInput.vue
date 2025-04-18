<script setup lang="ts">
import { MenuItem } from '@common/menu';
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import DropdownInput from './DropdownInput.vue';

interface Props {
	title: string;
	description?: string;
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
    <ControlBox :title="props.title" :description="props.description" >
        <DropdownInput v-bind="$props" />
    </ControlBox>
</template>
