import { computed, FunctionalComponent } from 'vue';
import { acodecsList, volSlider, ACodecDetail } from '@common/params/acodecs';
import { RateControl } from '@common/params/parameter';
import { getMenuItemByValue } from '@common/menu';
import { useAppStore } from '@renderer/stores/appStore';
import { numberValidator } from '../../../../components/validatorAndFixer';
import { showRateControlRecommendation } from '@renderer/components/misc/RateControlRecommendation';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import style from './index.module.less';

interface Props {}

const AcodecView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();

	const acodec = computed(() => {
		const acodecName = appStore.globalParams.audio.acodec;
		return (getMenuItemByValue(acodecsList, acodecName) as any)?.extra as ACodecDetail;
	});
	const rateControlList = computed(() => {
		return [
			...acodec.value.rateControl,
			{ type: 'separator' as const },
			{
				type: 'normal' as const,
				value: 'fetchFromService',
				label: '我应调整到什么值？...',
				icon: <span>🤔</span>,
				onClick: () => showRateControlRecommendation(),
			},
		];
	});
	// 根据当前选择的码率控制器显示具体使用何种 slider
	const rateControlSlider = computed(() => {
		const rList = acodec.value?.rateControl || [];
		if (!rList.length) {
			return null;
		}
		const rateControlName = appStore.globalParams.audio.ratecontrol;
		let index = rList.findIndex((item) => item.type === 'normal' && item.value === rateControlName);
		// 切换编码器后没有原来的码率控制模式了，默认设定为列表第一项
		if (index == -1) {
			index = 0
			appStore.globalParams.video.ratecontrol = (rList[0] as any).value;
			appStore.applyParameters();
		}
		const item = rList[index] as any;
		const slider = item.extra as RateControl;
		let title;
		switch (item.value) {
			case 'CBR/ABR':
				title = '码率'
				break;
			case 'Q':
				title = '质量参数'
				break;
		}
		return {
			title,
			min: slider.min,
			max: slider.max,
			arrowKeyStep: slider.arrowKeyStep,
			tags: slider.tags,
			adsorption: slider.adsorption,
			valueToDisplay: slider.valueToDisplay,
			valueToParam: slider.valueToParam,
		};
	});

	const handleChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.audio[sName] = value;
		appStore.applyParameters();
		if (sName == 'acodec') {
			appStore.checkAndApplyCodecDefaults({ audio: true });
		}
	};
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.audio.detail[sName] = value;
		appStore.applyParameters();
	};

	const renderDetailParameters = (optional: boolean) => (
		(acodec.value?.parameters || []).filter((parameter) => optional ? parameter.optional : !parameter.optional).map((parameter) => {
			if (parameter.mode === 'slider') {
				return (
					<BoxedSlider
						title={parameter.display}
						description={parameter.description}
						value={appStore.globalParams.audio.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						min={parameter.min}
						max={parameter.max}
						arrowKeyStep={parameter.arrowKeyStep}
						tags={parameter.tags}
						mode={parameter.sliderMode}
						adsorption={parameter.adsorption}
						valueToDisplay={parameter.valueToDisplay}
						onChange={(value: number) => handleDetailChange(parameter.parameter, value)}
					/>
				);
			} else if (parameter.mode === 'combo') {
				return (
					<BoxedDropdownInput
						title={parameter.display}
						description={parameter.description}
						text={appStore.globalParams.audio.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						list={parameter.items}
						onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
					/>
				);
			} else if (parameter.mode === 'switch') {
				return (
					<BoxedSwitch
						title={parameter.display}
						description={parameter.description}
						checked={appStore.globalParams.audio.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						onChange={(value: boolean) => handleDetailChange(parameter.parameter, value)}
					/>
				);
			} else if (parameter.mode === 'text') {
				return (
					<BoxedNormalInput
						title={parameter.display}
						description={parameter.description}
						value={appStore.globalParams.audio.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
						validator={parameter.type === 'int' ? numberValidator.integer : (parameter.type === 'float' ? numberValidator : undefined)}
					/>
				);
			}
		})
	);

	// console.log(acodec.value?.parameters);
	return (
		<div class={style.container}>
			<BoxedDropdownInput title="音频编码器" text={appStore.globalParams.audio.acodec} list={acodecsList} onChange={(value: string) => handleChange('acodec', value)} />
			{['禁用', 'copy'].indexOf(appStore.globalParams.audio.acodec) === -1 && (
				<>
					{(acodec.value?.rateControl || []).length ? (
						<BoxedDropdownInput title="码率控制" text={appStore.globalParams.audio.ratecontrol} list={rateControlList.value} onChange={(value: string) => handleChange('ratecontrol', value)} />
					) : null}
					{rateControlSlider.value && (
						<BoxedSlider
							title={rateControlSlider.value.title}
							value={appStore.globalParams.audio.ratevalue}
							min={rateControlSlider.value.min}
							max={rateControlSlider.value.max}
							arrowKeyStep={rateControlSlider.value.arrowKeyStep}
							tags={rateControlSlider.value.tags}
							valueToDisplay={rateControlSlider.value.valueToDisplay}
							adsorption={rateControlSlider.value.adsorption}
							onChange={(value: number) => handleChange('ratevalue', value)}
						/>
					)}
					{renderDetailParameters(false)}
					<BoxedSlider
						title="音量"
						description='请注意新版 ffmpeg 不再支持 -vol 参数，请换用滤镜进行音量处理'
						value={appStore.globalParams.audio.vol}
						min={volSlider.min}
						max={volSlider.max}
						tags={volSlider.tags}
						valueToDisplay={volSlider.valueToDisplay}
						adsorption={volSlider.adsorption}
						onChange={(value: number) => handleChange('vol', value)}
					/>
				</>
			)}
			<BoxedNormalInput title="自定义参数" value={appStore.globalParams.audio.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
			{(acodec.value?.parameters || []).filter((parameter) => parameter.optional).length && (
				<>
					<div class={style.belowDetail}>以下为从 ffmpeg 中获取的详细参数</div>
					{renderDetailParameters(true)}
				</>
			) || null}
		</div>
	);
};

export default AcodecView;
