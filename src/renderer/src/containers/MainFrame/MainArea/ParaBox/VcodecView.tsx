import { computed, FunctionalComponent } from 'vue';
import { vcodecsList, resolution, framerate, VCodecDetail } from '@common/params/vcodecs';
import { getMenuItemByValue } from '@common/menu';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import { framerateValidator } from '../../../../components/validatorAndFixer';
import { useAppStore } from '@renderer/stores/appStore';
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
			// 更改 vcodec 后检查子组件的设置
			for (const parameter of (vcodec.value?.parameters || [])) {
				if (parameter.mode === 'combo') {
					const defaultValue = parameter.default ?? parameter.items[0].value;
					console.log(`参数 ${parameter.parameter} 重置为默认值或首项：${defaultValue}`);
					appStore.globalParams.video.detail[parameter.parameter] = defaultValue;
					appStore.applyParameters();
				} else if (parameter.mode == 'slider') {
					const defaultValue = parameter.default ?? ((parameter.max ?? 1) + (parameter.min ?? 0)) / 2;
					console.log(`参数 ${parameter.parameter} 重置为默认值或中间值：${defaultValue}`);	// 假定所有 string 类的 slider 都必须定义 default
					appStore.globalParams.video.detail[parameter.parameter] = defaultValue;
					appStore.applyParameters();
				}
			}
		}
	};
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.video.detail[sName] = value;
		appStore.applyParameters();
	};
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
					{(vcodec.value?.parameters || []).map((parameter) => {
						if (parameter.mode === 'slider') {
							return (
								<BoxedSlider
									title={parameter.display}
									description={parameter.description}
									value={appStore.globalParams.video.detail[parameter.parameter]}
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
									text={appStore.globalParams.video.detail[parameter.parameter] + ''}
									list={parameter.items}
									onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
								/>
							);
						}
					})}
				</>
			)}
			<BoxedNormalInput title="自定义参数" value={appStore.globalParams.video.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
		</div>
	);
};

export default VcodecView;
