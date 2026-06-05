import { FunctionalComponent, ref, VNodeRef, computed } from 'vue';
import { NotificationLevel } from '@common/types';
import { version } from '@common/constants';
import { useAppStore } from '@renderer/stores/appStore';
import RadioList from '@renderer/components/RadioList/RadioList.vue';
import Popup from '@renderer/components/Popup/Popup';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import Button from '@renderer/components/Button/Button';
import Checkbox from '@renderer/components/Checkbox/Checkbox.vue';
import nodeBridge from '@renderer/bridges/nodeBridge';
import css from './ShortcutView.module.less';

interface Props {}

interface PresetImportExportItem {
	name: string;
	checked: boolean;
}

const ShortcutView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();
	const containerRef = ref<VNodeRef>(null);
	const exportPresets = ref<PresetImportExportItem[]>([]);

	const radioListList = computed(() => [
		{ value: '默认配置' },
		...appStore.availablePresets.map((name) => ({
			value: name.replaceAll('．', '.'),
			editable: true,
			deletable: true,
		})),
		{ value: '', editable: true },
	]);
	// 存储在 localStorage 以及 appStore 的 presetName 都是已转义的，只有交给 RadioList 作显示和编辑的时候进行反转义

	const handleExport = async () => {
		const exportPresets = appStore.availablePresets.map((name) => ({
			name: name.replaceAll('．', '.'),
			checked: true,
		}));

		Msgbox({
			title: '导出预设配置',
			content: (
				<div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto' }}>
					{exportPresets.map((preset, index) => (
						<div key={index} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
							<Checkbox checked={preset.checked} onChange={(checked) => preset.checked = checked} />
							<span style={{ marginLeft: '8px' }}>{preset.name}</span>
						</div>
					))}
				</div>
			),
			buttons: [
				{ text: '取消', role: 'cancel' },
				{
					text: '导出',
					role: 'confirm',
					callback: async () => {
						const selectedPresets = exportPresets.filter(p => p.checked);
						if (selectedPresets.length === 0) {
							Popup({ message: '请至少选择一个预设', level: NotificationLevel.warning });
							return;
						}

						// 构建导出数据
						const presetsData: any[] = [];
						for (const preset of selectedPresets) {
							const secureName = preset.name.replaceAll('.', '．');
							const params = await nodeBridge.localStorage.get(`presets.${secureName}`);
							if (params) {
								presetsData.push({
									name: preset.name,
									params,
								});
							}
						}

						const exportData = {
							FFBoxPresetVersion: version,
							createdAt: new Date().toISOString(),
							presets: presetsData,
						};
						const defaultFileName = `FFBox_Presets_${new Date().toISOString().slice(0, 10)}.json`;
						const success = await nodeBridge.saveFile(exportData, defaultFileName);
						if (success) {
							Popup({ message: '预设配置导出成功', level: NotificationLevel.ok });
						} else {
							Popup({ message: '导出失败', level: NotificationLevel.error });
						}
					},
				},
			],
		});
	};

	const handleImport = async () => {
		try {
			const content = await nodeBridge.readFile();
			if (!content) {
				return;
			}
			const importData = JSON.parse(content);
			if (!importData.presets || !Array.isArray(importData.presets)) {
				Popup({ message: '无效的预设配置文件', level: NotificationLevel.error });
				return;
			}

			const importPresets = importData.presets.map((p: any) => ({
				name: p.name || '未知预设',
				checked: true,
			}));
			const existingPresets = new Set(appStore.availablePresets.map((name) => name.replaceAll('．', '.')));

			Msgbox({
				title: '导入预设配置',
				content: (
					<div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto' }}>
						{importPresets.map((preset, index) => (
							<div key={index} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
								<Checkbox checked={preset.checked} onChange={(checked) => preset.checked = checked} />
								<span style={{ marginLeft: '8px' }}>{preset.name}</span>
								{existingPresets.has(preset.name.replaceAll('．', '.')) && (
									<span style={{ marginLeft: '8px', fontStyle: 'italic', opacity: 0.5 }}>(覆盖现有)</span>
								)}
							</div>
						))}
						{importData.FFBoxPresetVersion && (
							<p style={{ marginTop: '8px', fontSize: '12px', opacity: 0.5 }}>
								来源版本：FFBox {importData.FFBoxPresetVersion}
							</p>
						)}
					</div>
				),
				buttons: [
					{ text: '取消', role: 'cancel' },
					{
						text: '导入',
						role: 'confirm',
						callback: async () => {
							const selectedPresets = importPresets.value.filter(p => p.checked);
							if (selectedPresets.length === 0) {
								Popup({ message: '请至少选择一个预设', level: NotificationLevel.warning });
								return false;
							}

							let importedCount = 0;
							for (const selected of selectedPresets) {
								const presetData = importData.presets.find((p: any) => p.name === selected.name);
								if (presetData && presetData.params) {
									const secureName = selected.name.replaceAll('.', '．');
									await nodeBridge.localStorage.set(`presets.${secureName}`, presetData.params);
									importedCount++;
								}
							}

							appStore.loadPresetList();
							Popup({ message: `成功导入 ${importedCount} 个预设`, level: NotificationLevel.ok });
						},
					},
				],
			});
		} catch (error) {
			Popup({ message: `导入失败：${error}`, level: NotificationLevel.error });
		}
	};

	return (
		<div class={css.container} ref={containerRef}>
			<div class={css.presets}>
				<RadioList
					list={radioListList.value}
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
			<div class={css.controlBox}>
				<Button onClick={handleExport}>💾导出配置</Button>
				<Button onClick={handleImport}>📂导入配置</Button>
			</div>
		</div>
	);
};

export default ShortcutView;