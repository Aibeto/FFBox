<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import NormalInput from './NormalInput.vue';

interface Props {
	title: string;
	description?: string;
	long?: boolean;
	value?: string;
	type?: 'text' | 'password';
	disabled?: boolean;
	placeholder?: string;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title" :description="props.description" :long="$props.long">
        <NormalInput v-bind="$props" />
    </ControlBox>
</template>
