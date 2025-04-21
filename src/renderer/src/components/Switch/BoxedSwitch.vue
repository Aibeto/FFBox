<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import Switch from './Switch.vue';

interface Props {
	title: string;
	description?: string;
	checked: boolean;
	onChange?: (value: boolean) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title" :description="props.description">
        <Switch v-bind="$props" />
    </ControlBox>
</template>
