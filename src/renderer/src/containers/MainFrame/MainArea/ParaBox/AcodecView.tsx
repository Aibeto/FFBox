import { computed, FunctionalComponent } from 'vue';
import { acodecsList, volSlider, ACodecDetail } from '@common/params/acodecs';
import { getMenuItemByValue } from '@common/menu';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import { useAppStore } from '@renderer/stores/appStore';
import style from './index.module.less';

interface Props {}

const AcodecView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();

	const acodec = computed(() => {
		const acodecName = appStore.globalParams.audio.acodec;
		return (getMenuItemByValue(acodecsList, acodecName) as any)?.extra as ACodecDetail;
	});
	// 根据当前选择的码率控制器显示具体使用何种 slider
	const rateControlSlider = computed(() => {
		const rList = acodec.value?.rateControl || [];
		if (!rList.length) {
			return null;
		}
		const sName_ratecontrol = appStore.globalParams.audio.ratecontrol
		let index = rList.findIndex((item) => item.value === sName_ratecontrol);
		// 切换编码器后没有原来的码率控制模式了
		if (index == -1) {
			index = 0
			appStore.globalParams.video.ratecontrol = rList[0].value;
			appStore.applyParameters();
		}
		const slider = rList[index];
		let title;
		switch (slider.value) {
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
			// 更改 acodec 后检查子组件的设置
			for (const parameter of (acodec.value?.parameters || [])) {
				if (parameter.mode === 'combo') {
					const defaultValue = parameter.default ?? parameter.items[0].value;
					console.log(`参数 ${parameter.parameter} 重置为默认值或首项：${defaultValue}`);
					appStore.globalParams.audio.detail[parameter.parameter] = defaultValue;
					appStore.applyParameters();
				} else if (parameter.mode == 'slider') {
					const defaultValue = parameter.default ?? ((parameter.max ?? 1) + (parameter.min ?? 0)) / 2;
					console.log(`参数 ${parameter.parameter} 重置为默认值或中间值：${defaultValue}`);	// 假定所有 string 类的 slider 都必须定义 default
					appStore.globalParams.audio.detail[parameter.parameter] = defaultValue;
					appStore.applyParameters();
				}
			}
		}
	};
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.audio.detail[sName] = value;
		appStore.applyParameters();
	};
	return (
		<div class={style.container}>
			<BoxedDropdownInput title="音频编码器" text={appStore.globalParams.audio.acodec} list={acodecsList} onChange={(value: string) => handleChange('acodec', value)} />
			{['禁用', 'copy'].indexOf(appStore.globalParams.audio.acodec) === -1 && (
				<>
					{(acodec.value?.rateControl || []).length ? (
						<BoxedDropdownInput title="码率控制" text={appStore.globalParams.audio.ratecontrol} list={acodec.value.rateControl} onChange={(value: string) => handleChange('ratecontrol', value)} />
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
					{(acodec.value?.parameters || []).map((parameter) => {
						if (parameter.mode === 'slider') {
							return (
								<BoxedSlider
									title={parameter.display}
									description={parameter.description}
									value={appStore.globalParams.audio.detail[parameter.parameter]}
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
									text={appStore.globalParams.audio.detail[parameter.parameter]}
									list={parameter.items}
									onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
								/>
							);
						}
					})}
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
		</div>
	);
};

export default AcodecView;
