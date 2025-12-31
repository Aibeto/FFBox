import { FunctionalComponent, ref, VNodeRef } from 'vue';
import { NotificationLevel } from '@common/types';
import { useAppStore } from '@renderer/stores/appStore';
import RadioList from '@renderer/components/RadioList/RadioList.vue'
import Popup from '@renderer/components/Popup/Popup';
import css from './index.module.less';

interface Props {}

const ShortcutView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();
	const containerRef = ref<VNodeRef>(null);
	const radioListList = [
		{ value: '默认配置' },
		...appStore.availablePresets.map((name) => ({
			value: name.replaceAll('．', '.'),
			editable: true,
			deletable: true,
		})),
		{ value: '', editable: true },
	];
	// 存储在 localStorage 以及 appStore 的 presetName 都是已转义的，只有交给 RadioList 作显示和编辑的时候进行反转义
	return (
		<div class={css.container} ref={containerRef}>
			<RadioList
				list={radioListList}
				value={appStore.presetName.replaceAll('．', '.')}
				placeholder="未保存设定"
				onChange={(value) => appStore.loadPreset(`${value}`)}
				onDelete={(value) => appStore.deletePreset(`${value}`)}
				onEdit={(oldValue, newValue) => {
					if (oldValue) {
						appStore.editPreset(oldValue, newValue);
					} else if (newValue) {
						if (newValue === '默认配置') {
							Popup({
								message: '不能这样起名哦，会出 bug 的~',
								level: NotificationLevel.error,
							});
							return;
						}
						appStore.savePreset(newValue);
					}
				}}
			/>
		</div>
	);
};

export default ShortcutView;
