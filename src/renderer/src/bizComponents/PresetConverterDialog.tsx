import { defineComponent, onMounted, onBeforeUnmount, ref } from "vue";
import { version } from "@common/constants";
import { NotificationLevel, PresetFileJSON } from '@common/types';
import { runImportConverter, runExportConverter } from '@renderer/logic/presetAdapterRunner';
import Button from '@renderer/components/Button/Button';
import nodeBridge from '@renderer/bridges/nodeBridge';
import Popup from "../components/Popup/Popup";
import Msgbox from "../components/Msgbox/Msgbox";
import { useTooltip } from "@renderer/common/tooltipUtil";

interface ConverterItem {
	from: string;
	to: string;
	category: string;
	description: string;
	link: string;
}

const LIST_URLS = [
	'https://FFBox.ttqf.tech/api/v1/FFBoxPresetConverter/list.json',
	'https://api.ffbox.ttqf.tech/v2/FFBoxPresetConverter/list.json',
];
// const LIST_URLS = ['http://localhost:5500/list.json'];

/**
 * 显示预设转换器选择弹窗，内部完成脚本下载和数据转换
 * @param direction 导入或导出方向
 * @param exportData 导出模式下需要传入的待转换数据
 * @returns Promise，成功时 resolve 转换后的数据，失败或用户关闭时 reject
 */
export function showPresetConverterDialog(direction: 'import'): Promise<any>;
export function showPresetConverterDialog(direction: 'export', exportData: PresetFileJSON): Promise<any>;
export function showPresetConverterDialog(direction: 'import' | 'export', exportData?: PresetFileJSON): Promise<any> {
	return new Promise((resolve, reject) => {
		Msgbox({
			title: direction === 'import' ? '导入预设配置' : '导出预设配置',
			content: <Comp direction={direction} onSuccess={resolve} onCancel={reject} exportData={exportData} />,
			buttons: [
				{ text: '关闭', role: 'cancel' },
			],
		});
	});
}

interface Props {
	direction: 'import' | 'export';
	onSuccess: (convertedData: any) => void;
	onCancel: (reason?: any) => void;
	exportData?: PresetFileJSON;
}

const Comp = defineComponent((props: Props) => {
	const loading = ref(true);
	const error = ref<string | null>(null);
	const converters = ref<ConverterItem[]>([]);
	const downloadingIndex = ref<number | null>(null);
	const converting = ref(false);
	let settled = false;

	onBeforeUnmount(() => {
		if (!settled) {
			props.onCancel();
		}
	});

	onMounted(async () => {
		try {
			const resp = await Promise.any(LIST_URLS.map(async (url) => {
				const resp = await fetch(url);
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return resp;
			}));
			const list: ConverterItem[] = await resp.json();

			const FFBoxNVersion = 'FFBox ' + version;
			converters.value = list.filter((c) => {
				if (props.direction === 'export') {
					return buildInfo?.isDev ? FFBoxNVersion.includes(c.from) : c.from === FFBoxNVersion;
				} else if (props.direction === 'import') {
					return buildInfo?.isDev ? FFBoxNVersion.includes(c.to) : c.to === FFBoxNVersion;
				}
			});

			if (converters.value.length === 0) {
				error.value = '暂无可用的转换器';
			}
		} catch {
			error.value = '获取转换器列表失败，请检查网络连接';
		} finally {
			loading.value = false;
		}
	});

	// 选择转换器，转换后回调
	const handleSelect = async (converter: ConverterItem, index: number) => {
		downloadingIndex.value = index;
		try {
			// 下载转换器脚本
			const resp = await fetch(converter.link);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const script = await resp.text();

			let convertedData: any;
			if (props.direction === 'import') {
				// 导入：读取文件 → 用转换器处理
				let rawContent: string;
				try {
					const content = await nodeBridge.readFile();
					if (!content) {
						// 用户取消
						downloadingIndex.value = null;
						converting.value = false;
						return;
					}
					rawContent = content;
				} catch (e) {
					Popup({ message: `读取文件失败：${e}`, level: NotificationLevel.error });
					downloadingIndex.value = null;
					converting.value = false;
					return;
				}
				converting.value = true;
				convertedData = await runImportConverter(rawContent, script);
			} else {
				// 导出：用转换器处理已有的导出数据
				converting.value = true;
				convertedData = await runExportConverter(props.exportData, script);
			}

			settled = true;
			props.onSuccess(convertedData);
			downloadingIndex.value = null;
		} catch (e) {
			Popup({ message: `转换失败：${e}`, level: NotificationLevel.error });
			downloadingIndex.value = null;
			converting.value = false;
		}
	};

	return () => (
		<div style={{ maxHeight: 'calc(70vh - 80px)', overflowY: 'auto', minWidth: '280px' }}>
			{loading.value ? (
				<div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.6 }}>加载中...</div>
			) : error.value ? (
				<div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.6 }}>{error.value}</div>
			) : (
				<div>
					<p style={{ margin: '0 0 12px', fontSize: '13px', opacity: 0.7 }}>
						选择要{props.direction === 'import' ? '导入自' : '导出到'}的版本：
					</p>
					{converters.value.map((converter, index) => (
						<div key={index} style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
							<Button {...(converter.description ? useTooltip(converter.description, 't') : {})} disabled={downloadingIndex.value !== null || converting.value} onClick={() => handleSelect(converter, index)}>
								{props.direction === 'import' ? converter.from : converter.to}
								{downloadingIndex.value === index ? (converting.value ? '（转换中...）' : '（下载中...）') : ''}
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}, { props: ['direction', 'onSuccess', 'onCancel', 'exportData'] });
