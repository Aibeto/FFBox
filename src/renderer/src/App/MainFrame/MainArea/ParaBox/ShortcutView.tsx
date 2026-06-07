import { FunctionalComponent, ref, VNodeRef, computed } from 'vue';
import { NotificationLevel, PresetFileJSON } from '@common/types';
import { version } from '@common/constants';
import { useAppStore } from '@renderer/stores/appStore';
import RadioList from '@renderer/components/RadioList/RadioList.vue';
import Popup from '@renderer/components/Popup/Popup';
import Msgbox from '@renderer/components/Msgbox/Msgbox';
import Button from '@renderer/components/Button/Button';
import Checkbox from '@renderer/components/Checkbox/Checkbox.vue';
import nodeBridge from '@renderer/bridges/nodeBridge';
import showMenu from '@renderer/components/Menu/Menu';
import { showPresetConverterDialog } from '@renderer/components/misc/PresetConverterDialog';
import css from './ShortcutView.module.less';

interface Props {}

const ShortcutView: FunctionalComponent<Props> = (props) => {
	const appStore = useAppStore();
	const containerRef = ref<VNodeRef>(null);

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

	// #region 导入流程

	// 弹出导入预设选择弹窗。TODO 务必确保 importData 结构正确
	const showImportPresetSelector = (importData: PresetFileJSON) => {
		const importPresets = ref(importData.presets.map((p) => ({
			name: p.name || '未知预设',
			checked: true,
		})));
		const existingPresets = new Set(appStore.availablePresets.map((name) => name.replaceAll('．', '.')));

		Msgbox({
			title: '导入预设配置',
			content: () =>(
				<div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto' }}>
					{importPresets.value.map((preset: { name: string; checked: boolean }, index: number) => (
						<div key={index} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
							<Checkbox checked={preset.checked} onChange={(checked: boolean) => preset.checked = checked} />
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
						const selectedPresets = importPresets.value.filter((p: { checked: boolean }) => p.checked);
						if (selectedPresets.length === 0) {
							Popup({ message: '请至少选择一个预设', level: NotificationLevel.warning });
							return;
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
	};

	// 导入按钮点击
	const handleImport = (event: MouseEvent) => {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		showMenu({
			menu: [
				{ type: 'normal', label: '导入自同版本 FFBox', value: 'same', tooltip: '原样导入配置，不作任何修改', onClick: async () => {
					let content: string | null;
					try {
						content = await nodeBridge.readFile();
					} catch (error) {
						Popup({ message: `读取文件失败：${error}`, level: NotificationLevel.error });
						return;
					}
					if (content == null) return;
					try {
						const importData = JSON.parse(content);
						if (!importData.presets || !Array.isArray(importData.presets)) {
							Popup({ message: '无效的预设配置文件', level: NotificationLevel.error });
							return;
						}
						showImportPresetSelector(importData);
					} catch {
						Popup({ message: '文件格式无效', level: NotificationLevel.error });
					}
				} },
				{ type: 'normal', label: '导入自不同版本或第三方软件', value: 'cross', tooltip: '从 FFBox 官网获取配置转换插件，导入转换后的配置', icon: <span>🌐</span>, onClick: async () => {
					try {
						const convertedData = await showPresetConverterDialog('import');
						if (!convertedData?.presets || !Array.isArray(convertedData.presets)) {
							Popup({ message: '数据无效', level: NotificationLevel.error });
							return;
						}
						showImportPresetSelector(convertedData);
					} catch {
						// 用户关闭弹窗或转换失败，无需处理
					}
				} },
			],
			type: 'action',
			triggerRect: { xMin: rect.left, xMax: rect.right, yMin: rect.top, yMax: rect.bottom },
		});
	};

	// #endregion
	
	// #region 导出流程

	// 弹出导出预设选择弹窗，选择后回调
	const showExportPresetSelector = (callback: (presetsData: any[]) => void) => {
		const exportPresets = ref(appStore.availablePresets.map((name) => ({
			name: name.replaceAll('．', '.'),
			checked: true,
		})));

		Msgbox({
			title: '导出预设配置',
			content: () => (
				<div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto' }}>
					{exportPresets.value.map((preset, index) => (
						<div key={index} style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
							<Checkbox checked={preset.checked} onChange={(checked: boolean) => preset.checked = checked} />
							<span style={{ marginLeft: '8px' }}>{preset.name}</span>
						</div>
					))}
				</div>
			),
			buttons: [
				{ text: '取消', role: 'cancel' },
				{
					text: '确定',
					role: 'confirm',
					callback: async () => {
						const selectedPresets = exportPresets.value.filter((p) => p.checked);
						if (selectedPresets.length === 0) {
							Popup({ message: '请至少选择一个预设', level: NotificationLevel.warning });
							return;
						}

						const presetsData: any[] = [];
						for (const preset of selectedPresets) {
							const secureName = preset.name.replaceAll('.', '．');
							const params = await nodeBridge.localStorage.get(`presets.${secureName}`);
							if (params) {
								presetsData.push({ name: preset.name, params });
							}
						}
						callback(presetsData);
					},
				},
			],
		});
	};

	// 导出按钮点击
	const handleExport = (event: MouseEvent) => {
		const saveExportData = async (exportData: any) => {
			const content = typeof exportData === 'string' ? exportData : JSON.stringify(exportData, null, '\t');
			const defaultFileName = `FFBox_Presets_${new Date().toISOString().slice(0, 10)}.json`;
			const success = await nodeBridge.saveFile(content, defaultFileName);
			if (success) {
				Popup({ message: '预设配置导出成功', level: NotificationLevel.ok });
			} else {
				Popup({ message: '导出失败', level: NotificationLevel.error });
			}
		};
		const buildExportData = (presetsData: any[]) => ({
			FFBoxPresetVersion: version,
			createdAt: new Date().toISOString(),
			systemDescription: '',
			customDescription: '',
			presets: presetsData,
		} satisfies PresetFileJSON);
		
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		showMenu({
			menu: [
				{ type: 'normal', label: '导出到同版本 FFBox', value: 'same', tooltip: '导出当前配置，不作任何修改', onClick: () => {
					showExportPresetSelector((presetsData) => {
						saveExportData(buildExportData(presetsData));
					});
				} },
				{ type: 'normal', label: '导出到不同版本或第三方软件', value: 'cross', tooltip: '从 FFBox 官网获取配置转换插件，导出转换后的配置', icon: <span>🌐</span>, onClick: () => {
					showExportPresetSelector(async (presetsData) => {
						try {
							const convertedData = await showPresetConverterDialog('export', buildExportData(presetsData));
							saveExportData(convertedData);
						} catch {
							// 用户关闭弹窗或转换失败，无需处理
						}
					});
				} },
			],
			type: 'action',
			triggerRect: { xMin: rect.left, xMax: rect.right, yMin: rect.top, yMax: rect.bottom },
		});
	};

	// #endregion

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
				<Button onClick={handleImport}>📂导入配置</Button>
				<Button onClick={handleExport}>💾导出配置</Button>
			</div>
		</div>
	);
};

export default ShortcutView;
