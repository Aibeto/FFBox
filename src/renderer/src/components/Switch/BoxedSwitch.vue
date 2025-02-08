<script setup lang="ts">
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import Switch from './Switch.vue';

interface Props {
	title: string;
	checked: boolean;
	onChange?: (value: boolean) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title">
        <Switch v-bind="$props" />
    </ControlBox>
</template>
