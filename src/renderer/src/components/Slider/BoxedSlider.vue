<script setup lang="ts">
import type { SliderOptions } from '@common/params/parameter';
import ControlBox from '@renderer/components/ControlBox/ControlBox.vue';
import Slider from './Slider.vue';

interface Props {
    title: string;
	value: number | string;
	tags?: [number, string][] | Map<number, string>;
	step?: number;
	valueToText: SliderOptions['valueToText'];
	valueProcess?: SliderOptions['valueProcess'];
	stringToNumber?: SliderOptions['stringToNumber'];
	numberToParam?: SliderOptions['numberToParam'];	// 若指定 numberToParam，Slider 将认为 value 是字符串类型。使用滑块操作时，返回值将通过此函数计算出
	onChange?: (value: number | string) => any;
}

const props = defineProps<Props>();

</script>

<template>
    <ControlBox :title="props.title" :long="true">
        <Slider v-bind="$props" />
    </ControlBox>
</template>
