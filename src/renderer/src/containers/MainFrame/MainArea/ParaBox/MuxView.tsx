import { computed, defineComponent } from 'vue';
import { formats, keepFileTimeList, keepMeatadataList } from '@common/params/formats'
import { durationFixer, durationValidator, notEmptyValidator } from '../../../../components/validatorAndFixer';
import { useAppStore } from '@renderer/stores/appStore';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue'
import IconFind from '@renderer/assets/mainArea/find.svg?component';
import style from './index.module.less';

interface Props {
	editingOutputIndex: number;
}

const MuxView = defineComponent((props) => {
	const appStore = useAppStore();

	const muxParams = computed(() => appStore.globalParams.outputs[props.editingOutputIndex]?.mux);
	
	const outputContainsInOutput = computed(() => {
		// 如果启用了滤镜，那么需要找到对应输出节点，并且有连线；否则默认输出一个文件
		if (appStore.globalParams.filter.nodes.length) {
			const outputNode = appStore.globalParams.filter.nodes.find((node) => node.name === `out_${props.editingOutputIndex}`);
			return outputNode?.prevs.length ? true : false;
		} else {
			return true;
		}
	});

	const handleChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.output[sName] = value;
		appStore.applyParameters();
	}
	return () => muxParams.value && outputContainsInOutput.value ? (
		<div class={style.container}>
			<BoxedDropdownInput title="容器/格式" text={muxParams.value.format} list={formats} onChange={(value: string) => handleChange('format', value)} />
			<BoxedSwitch title="元数据前移" checked={muxParams.value.moveflags} onChange={(value: boolean) => handleChange('moveflags', value)} />
			<BoxedNormalInput title="剪辑起点" value={muxParams.value.begin} onChange={(value: string) => handleChange('begin', value)} validator={durationValidator} inputFixer={durationFixer} />
			<BoxedNormalInput title="剪辑终点" value={muxParams.value.end} onChange={(value: string) => handleChange('end', value)} validator={durationValidator} inputFixer={durationFixer} />
			<BoxedDropdownInput title="元数据保留" text={muxParams.value.keepMetadata || '无'} list={keepMeatadataList} onChange={(value: any) => handleChange('keepMetadata', value)} />
			<BoxedDropdownInput title="文件时间保留" description='FFBox 特色功能，对产出文件进行文件时间修改。对远程服务器任务暂不生效' text={muxParams.value.keepFileTime || '无'} list={keepFileTimeList} onChange={(value: any) => handleChange('keepFileTime', value)} />
			<BoxedNormalInput title="输出文件名" value={muxParams.value.filename} onChange={(value: string) => handleChange('filename', value)} long={true} placeholder="[filedir]：文件所在目录；[filebasename]：文件基础名；[fileext]：文件扩展名" validator={notEmptyValidator} />
			<BoxedNormalInput title="自定义参数" value={muxParams.value.custom} onChange={(value: string) => handleChange('custom', value)} long={true} />
		</div>
	) : (
		<div class={style.noOutput}>
			<div class={style.box}>
				<IconFind />
				<div class={style.description}>
					<p>您正在编辑【输出 {props.editingOutputIndex}】的封装配置</p>
					<p>但【输出文件 {props.editingOutputIndex}】节点在滤镜图中不存在或未连接任何输入</p>
					<p>请先在“滤镜”面板中为该节点建立连线</p>
				</div>
			</div>
		</div>
	);
}, {
	props: ['editingOutputIndex'],
});

export default MuxView;
