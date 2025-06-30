import { computed, defineComponent } from 'vue';
import { vcodecsList, resolution, framerate, VCodecDetail } from '@common/params/vcodecs';
import { RateControl } from '@common/params/parameter';
import { getMenuItemByValue } from '@common/menu';
import { useAppStore } from '@renderer/stores/appStore';
import { framerateValidator, numberValidator } from '../../../../components/validatorAndFixer';
import { showLocalLibrary } from '@renderer/components/misc/LocalLibrary';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSlider from '@renderer/components/Slider/BoxedSlider.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import IconFind from '@renderer/assets/mainArea/find.svg?component';
import style from './index.module.less';

interface Props {
	editingOutputIndex: number;
}

const VcodecView = defineComponent((props: Props) => {
	const appStore = useAppStore();
	
	const videoParams = computed(() => appStore.globalParams.outputs[props.editingOutputIndex]?.video);

	const videoContainsInOutput = computed(() => {
		// 如果启用了滤镜，那么需要找到对应输出节点，并且有连线；否则默认输出一个文件
		if (appStore.globalParams.filter.nodes.length) {
			const outputNode = appStore.globalParams.filter.nodes.find((node) => node.name === `out_${props.editingOutputIndex}`);
			return outputNode?.prevs.length ? true : false;
		} else {
			return true;
		}
	});

	const vcodec = computed(() => {
		if (videoParams.value) {
			const vcodecName = videoParams.value.vcodec;
			return (getMenuItemByValue(vcodecsList, vcodecName) as any)?.extra as VCodecDetail;
		}
	});
	const rateControlList = computed(() => {
		return [
			...vcodec.value.rateControl,
			{ type: 'separator' as const },
			{
				type: 'normal' as const,
				value: 'fetchFromService',
				label: '我应调整到什么值？...',
				icon: <span>🤔</span>,
				onClick: () => showLocalLibrary('FFBox 推荐画质设定'),
			},
		];
	});
	// 根据当前选择的码率控制器显示具体使用何种 slider
	const rateControlSlider = computed(() => {
		const rList = vcodec.value?.rateControl || [];
		if (!rList.length) {
			return null;
		}
		const rateControlName = videoParams.value.ratecontrol;
		let index = rList.findIndex((item) => item.type === 'normal' && item.value === rateControlName);
		// 切换编码器后没有原来的码率控制模式了，默认设定为列表第一项
		if (index == -1) {
			index = 0;
			videoParams.value.ratecontrol = (rList[0] as any).value;
			appStore.applyParameters();
		}
		const item = rList[index] as any;
		const slider = item.extra as RateControl;
		let title;
		switch (item.value) {
			case 'CRF':
				title = 'CRF'
				break;
			case 'CQP':
				title = 'QP 参数'
				break;
			case 'CBR': case 'ABR':
				title = '码率'
				break;
			case 'Q': case 'VBR_HQ':
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
		videoParams.value[sName] = value;
		appStore.applyParameters();
		if (sName == 'vcodec') {
			appStore.checkAndApplyCodecDefaults({ video: true });
		}
	};
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		videoParams.value.detail[sName] = value;
		appStore.applyParameters();
	};

	const renderDetailParameters = (optional: boolean) => (
		(vcodec.value?.parameters || []).filter((parameter) => optional ? parameter.optional : !parameter.optional).map((parameter) => {
			if (parameter.mode === 'slider') {
				return (
					<BoxedSlider
						title={parameter.display}
						description={parameter.description}
						value={videoParams.value.detail[parameter.parameter]}
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
						text={videoParams.value.detail[parameter.parameter]}
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
						checked={videoParams.value.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						onChange={(value: boolean) => handleDetailChange(parameter.parameter, value)}
					/>
				);
			} else if (parameter.mode === 'text') {
				return (
					<BoxedNormalInput
						title={parameter.display}
						description={parameter.description}
						value={videoParams.value.detail[parameter.parameter]}
						optionalDefault={parameter.optional ? parameter.default : undefined}
						onChange={(value: string) => handleDetailChange(parameter.parameter, value)}
						validator={parameter.type === 'int' ? numberValidator.integer : (parameter.type === 'float' ? numberValidator : undefined)}
					/>
				);
			}
			return null;
		})
	);

	// console.log(vcodec.value?.parameters);
	return () => videoParams.value && videoContainsInOutput.value ? (
		<div class={style.container}>
			<BoxedDropdownInput title="视频编码器" text={videoParams.value.vcodec} list={vcodecsList} onChange={(value: string) => handleChange('vcodec', value)} />
			{['禁用', 'copy'].indexOf(videoParams.value.vcodec) === -1 && (
				<>
					<BoxedDropdownInput title="分辨率" text={videoParams.value.resolution} list={resolution} onChange={(value: string) => handleChange('resolution', value)} />
					<BoxedDropdownInput title="输出帧速" text={videoParams.value.framerate} list={framerate} validator={framerateValidator} onChange={(value: string) => handleChange('framerate', value)} />
					{(vcodec.value?.rateControl || []).length ? (
						<BoxedDropdownInput title="码率控制" text={videoParams.value.ratecontrol} list={rateControlList.value} onChange={(value: string) => handleChange('ratecontrol', value)} />
					) : null}
					{rateControlSlider.value && (
						<BoxedSlider
							title={rateControlSlider.value.title}
							value={videoParams.value.ratevalue}
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
			<BoxedNormalInput title="自定义参数" value={videoParams.value.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
			{(vcodec.value?.parameters || []).filter((parameter) => parameter.optional).length && (
				<>
					<div class={style.belowDetail}>以下为从 ffmpeg 中获取的详细参数</div>
					{renderDetailParameters(true)}
				</>
			) || null}
		</div>
	) : (
		<div class={style.noOutput}>
			<div class={style.box}>
				<IconFind />
				<div class={style.description}>
					<p>您正在编辑【输出 {props.editingOutputIndex}】的视频配置</p>
					<p>但【输出文件 {props.editingOutputIndex}】节点在滤镜图中不存在或未连接任何输入</p>
					<p>请先在“滤镜”面板中为该节点建立连线</p>
				</div>
			</div>
		</div>
	);
}, {
	props: ['editingOutputIndex'],
});

export default VcodecView;
