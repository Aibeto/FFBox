<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import NormalInput from './NormalInput.vue';

interface Props {
	title: string;
	value?: string;
	long?: boolean;
	disabled?: boolean;
	placeholder?: string;
	validator?: (value: string) => string;
	inputFixer?: (value: string) => string;
	onChange?: (value: string) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title" :long="$props.long">
        <NormalInput v-bind="$props" />
    </ControlBox>
</template>
