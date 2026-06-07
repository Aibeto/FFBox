// 预设转换器运行器 —— 在 WebWorker 中执行第三方转换器脚本，支持超时控制
// 转换器脚本由调用方提供（通常来自互联网下载），在 Worker 沙箱中隔离执行

import PresetAdapterWorker from './presetAdapterWorker?worker';

interface PresetConvertResult {
	success: boolean;
	data?: any;
	error?: string;
}

/**
 * 在 WebWorker 中执行转换器脚本
 * @param converterScript 转换器脚本字符串，脚本内应定义 convert(data) 或 adapter(data) 函数
 * @param data 待转换的数据
 * @param timeoutMs 超时时间（毫秒），默认 5000
 * @returns 转换后的数据
 */
function runConverterInWorker(converterScript: string, data: any, timeoutMs = 5000): Promise<any> {
	return new Promise((resolve, reject) => {
		const worker = new PresetAdapterWorker();
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				worker.terminate();
				reject(new Error('转换器执行超时'));
			}
		}, timeoutMs);

		worker.onmessage = (event: MessageEvent<PresetConvertResult>) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				worker.terminate();

				if (event.data.success) {
					resolve(event.data.data);
				} else {
					reject(new Error(event.data.error || '转换器执行失败'));
				}
			}
		};

		worker.onerror = (error) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				worker.terminate();
				reject(new Error(`转换器 Worker 异常：${error.message}`));
			}
		};

		worker.postMessage({ converterScript, data });
	});
}

/**
 * 运行导入转换器
 * @param rawContent 原始文件内容字符串
 * @param converterScript 转换器脚本字符串（已下载）
 * @returns 解析并转换后的数据对象
 */
export async function runImportConverter(rawContent: string, converterScript: string): Promise<any> {
	return runConverterInWorker(converterScript, rawContent);
}

/**
 * 运行导出转换器
 * @param exportData 原始导出数据
 * @param converterScript 转换器脚本字符串（已下载）
 * @returns 转换后的导出数据
 */
export async function runExportConverter(exportData: any, converterScript: string): Promise<any> {
	return runConverterInWorker(converterScript, exportData);
}
