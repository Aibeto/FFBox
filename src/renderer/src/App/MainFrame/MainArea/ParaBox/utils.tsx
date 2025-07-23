import { Parameter } from '@common/params/parameter';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import { getValidator } from '@renderer/components/validatorAndFixer';

/**
 * 此函数将 InputView、VcodecView、AcodecView、MuxView 的详细参数面板渲染集中到一个函数中
 * parameters 应当传入一个 combined 过的普通列表，而 details 应当传入由 appStore 取出的参数
 * 根据 Vue 的响应式原理，通过 .value 取出的如果是普通对象，那么不具有 Proxy；如果 .value 的值本身是从 appStore 中取出的，那么取出的值会被包一层 proxy
 */
export const renderDetailParameters = (parameters: Parameter[], details: Record<string, any>, onChange: (parameter: Parameter, value: any) => any, optional: boolean) => (
	(parameters || []).filter((parameter) => optional ? parameter.optional : !parameter.optional).map((parameter) => {
		if (parameter.mode === 'slider') {
			return (
				<BoxedSlider
					title={parameter.display}
					description={parameter.description}
					value={details[parameter.parameter]}
					optionalDefault={parameter.optional ? parameter.default : undefined}
					min={parameter.min}
					max={parameter.max}
					arrowKeyStep={parameter.arrowKeyStep}
					tags={parameter.tags}
					mode={parameter.sliderMode}
					adsorption={parameter.adsorption}
					valueToDisplay={parameter.valueToDisplay}
					onChange={(value) => onChange(parameter, value)}
				/>
			);
		} else if (parameter.mode === 'combo') {
			return (
				<BoxedDropdownInput
					title={parameter.display}
					description={parameter.description}
					text={details[parameter.parameter]}
					optionalDefault={parameter.optional ? parameter.default : undefined}
					list={parameter.items}
					onChange={(value) => onChange(parameter, value)}
				/>
			);
		} else if (parameter.mode === 'switch') {
			return (
				<BoxedSwitch
					title={parameter.display}
					description={parameter.description}
					checked={details[parameter.parameter]}
					optionalDefault={parameter.optional ? parameter.default : undefined}
					onChange={(value) => onChange(parameter, value)}
				/>
			);
		} else if (parameter.mode === 'text') {
			return (
				<BoxedNormalInput
					title={parameter.display}
					description={parameter.description}
					value={details[parameter.parameter]}
					optionalDefault={parameter.optional ? parameter.default : undefined}
					onChange={(value) => onChange(parameter, value)}
					validator={getValidator(parameter.type)}
				/>
			);
		}
		return null;
	})
);
