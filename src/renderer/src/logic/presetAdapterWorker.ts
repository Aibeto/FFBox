// 预设适配器 Worker —— 在隔离环境中执行第三方适配器脚本
// 接收整个 JS 文件内容（字符串），通过 new Function 在 Worker 沙箱中执行
// 适配器 JS 文件必须定义 convert(data) 函数

self.onmessage = (event) => {
	const { converterScript, data } = event.data;

	if (typeof converterScript !== 'string') {
		(self as any).postMessage({ success: false, error: '转换器脚本无效' });
		return;
	}

	try {
		const convertFn = new Function('data', converterScript + '; if (typeof convert === "function") return convert(data); throw new Error("未找到 convert 函数");');
		const result = convertFn(data);
		(self as any).postMessage({ success: true, data: result });
	} catch (error) {
		(self as any).postMessage({ success: false, error: String(error) });
	}
};
