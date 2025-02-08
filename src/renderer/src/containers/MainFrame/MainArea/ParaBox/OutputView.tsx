import { FunctionalComponent } from 'vue';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue'
import { durationFixer, durationValidator, notEmptyValidator } from '../../../../components/validatorAndFixer';
import { formats, generator } from '@common/params/formats'
import { useAppStore } from '@renderer/stores/appStore';
import style from './index.module.less';

interface Props {}

const OutputView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();

	const handleChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.output[sName] = value;
		appStore.applyParameters();
	}
	return (
		<div class={style.container}>
			<BoxedDropdownInput title="容器/格式" text={appStore.globalParams.output.format} list={formats} onChange={(value: string) => handleChange('format', value)} />
			<BoxedSwitch title="元数据前移" checked={appStore.globalParams.output.moveflags} onChange={(value: boolean) => handleChange('moveflags', value)} />
			<BoxedNormalInput title="剪辑起点" value={appStore.globalParams.output.begin} onChange={(value: string) => handleChange('begin', value)} validator={durationValidator} inputFixer={durationFixer} />
			<BoxedNormalInput title="剪辑终点" value={appStore.globalParams.output.end} onChange={(value: string) => handleChange('end', value)} validator={durationValidator} inputFixer={durationFixer} />
			<BoxedNormalInput title="输出文件名" value={appStore.globalParams.output.filename} onChange={(value: string) => handleChange('filename', value)} long={true} placeholder="[filedir]：文件所在目录；[filebasename]：文件基础名；[fileext]：文件扩展名" validator={notEmptyValidator} />
			<BoxedNormalInput title="自定义参数" value={appStore.globalParams.output.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
		</div>
	);
};

export default OutputView;
