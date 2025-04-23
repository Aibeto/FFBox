import { computed, FunctionalComponent } from 'vue';
import { vcodecsList, resolution, framerate, VCodecDetail } from '@common/params/vcodecs';
import { getMenuItemByValue } from '@common/menu';
import { useAppStore } from '@renderer/stores/appStore';
import { framerateValidator, numberValidator } from '../../../../components/validatorAndFixer';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import style from './index.module.less';

interface Props {}

const VcodecView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();

	const vcodec = computed(() => {
		const vcodecName = appStore.globalParams.video.vcodec;
		return (getMenuItemByValue(vcodecsList, vcodecName) as any)?.extra as VCodecDetail;
	});
	// 根据当前选择的码率控制器显示具体使用何种 slider
	const rateControlSlider = computed(() => {
		const rList = vcodec.value?.rateControl || [];
		if (!rList.length) {
			return null;
		}
		const rateControlName = appStore.globalParams.video.ratecontrol;
		let index = rList.findIndex((item) => item.value === rateControlName);
		// 切换编码器后没有原来的码率控制模式了
		if (index == -1) {
			index = 0;
			appStore.globalParams.video.ratecontrol = rList[0].value;
			appStore.applyParameters();
		}
		const slider = rList[index];
		let title;
		switch (slider.value) {
			case 'CRF':
				title = 'CRF'
				break;
			case 'CQP':
				title = 'QP 参数'
				break;
			case 'CBR': case 'ABR':
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
		appStore.globalParams.video[sName] = value;
		appStore.applyParameters();
		if (sName == 'vcodec') {
			appStore.checkAndApplyCodecDefaults({ video: true });
		}
	};
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.video.detail[sName] = value;
		appStore.applyParameters();
	};

	const renderDetailParameters = (optional: boolean) => (
		(vcodec.value?.parameters || []).filter((parameter) => optional ? parameter.optional : !parameter.optional).map((parameter) => {
			if (parameter.mode === 'slider') {
				return (
					<BoxedSlider
						title={parameter.display}
						description={parameter.description}
						value={appStore.globalParams.video.detail[parameter.parameter]}
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
						text={appStore.globalParams.video.detail[parameter.parameter]}
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
						checked={appStore.globalParams.video.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						onChange={(value: boolean) => handleDetailChange(parameter.parameter, value)}
					/>
				);
			} else if (parameter.mode === 'text') {
				return (
					<BoxedNormalInput
						title={parameter.display}
						description={parameter.description}
						value={appStore.globalParams.video.detail[parameter.parameter]}
						onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						validator={parameter.type === 'int' ? numberValidator.integer : (parameter.type === 'float' ? numberValidator : undefined)}
					/>
				);
			}
			return null;
		})
	);

	// console.log(vcodec.value?.parameters);
	return (
		<div class={style.container}>
			<BoxedDropdownInput title="视频编码器" text={appStore.globalParams.video.vcodec} list={vcodecsList} onChange={(value: string) => handleChange('vcodec', value)} />
			{['禁用', 'copy'].indexOf(appStore.globalParams.video.vcodec) === -1 && (
				<>
					<BoxedDropdownInput title="分辨率" text={appStore.globalParams.video.resolution} list={resolution} onChange={(value: string) => handleChange('resolution', value)} />
					<BoxedDropdownInput title="输出帧速" text={appStore.globalParams.video.framerate} list={framerate} validator={framerateValidator} onChange={(value: string) => handleChange('framerate', value)} />
					{(vcodec.value?.rateControl || []).length ? (
						<BoxedDropdownInput title="码率控制" text={appStore.globalParams.video.ratecontrol} list={vcodec.value.rateControl} onChange={(value: string) => handleChange('ratecontrol', value)} />
					) : null}
					{rateControlSlider.value && (
						<BoxedSlider
							title={rateControlSlider.value.title}
							value={appStore.globalParams.video.ratevalue}
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
				</>
			)}
			<BoxedNormalInput title="自定义参数" value={appStore.globalParams.video.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
			{(vcodec.value?.parameters || []).filter((parameter) => parameter.optional).length && (
				<>
					<div class={style.belowDetail}>以下为从 ffmpeg 中获取的详细参数</div>
					{renderDetailParameters(true)}
				</>
			) || null}
		</div>
	);
};

export default VcodecView;
