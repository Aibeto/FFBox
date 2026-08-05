export type LimitationType = 'maxMediaDuration' | 'maxWorkingDuration' | 'maxUploadSizeGB' | 'maxTaskListCount' | 'maxThreads' | 'maxUploadListCount' | 'maxFilterNodeCount';
export type LimitationUnit = 'time' | 'GB' | 'count';

/**
 * 单条功能限制的定义。
 * - `pairs` 为数值对表，每一项形如 [functionLevel 阈值, 对应值]：
 *   当 functionLevel >= 阈值 且 < 下一项阈值时，取该值；最后一项之后值不再变化。
 * - 值为 `undefined` 表示无限制。
 * - `label` / `unit` 供展示层（如赞助面板 iframe）渲染表格使用。
 */
export interface LimitationEntry {
	type: LimitationType;
	label: string;
	unit: LimitationUnit;
	pairs: [number, number | undefined][];
}

export const limitations: LimitationEntry[] = [
	{ type: 'maxMediaDuration', label: '媒体时长上限', unit: 'time', pairs: [
		[0, 671],
		[50, undefined],
	]},
	{ type: 'maxWorkingDuration', label: '转码时长上限', unit: 'time', pairs: [
		[0, 671],
		[45, 40271],
	]},
	{ type: 'maxUploadSizeGB', label: '远程单文件上传大小上限', unit: 'GB', pairs: [
		[0, 1],
		[15, 4],
		[30, 10],
		[45, 32],
		[65, 1024],
	]},
	{ type: 'maxTaskListCount', label: '任务列表数量上限', unit: 'count', pairs: [
		[0, 20],
		[20, 99],
		[35, 256],
		[50, 2048],
		[65, 66666],
		[80, 11111111],
	]},
	{ type: 'maxThreads', label: '同时转码任务数量设定上限', unit: 'count', pairs: [
		[0, 1],
		[10, 4],
		[25, 9],
		[40, 99],
		[70, 256],
	]},
	{ type: 'maxUploadListCount', label: '上传列表数量上限', unit: 'count', pairs: [
		[0, 20],
		[25, 66],
		[55, 256],
		[75, 999],
	]},
	{ type: 'maxFilterNodeCount', label: '滤镜功能节点数量上限', unit: 'count', pairs: [
		[0, 20],
		[20, 66],
		[40, 99],
		[60, 999],
	]},
];

/**
 * 根据 functionLevel 取某项限制的当前值。
 * 在 pairs 中找到最后一个阈值 <= functionLevel 的项并返回其值。
 */
export function getLimitaion(type: LimitationType, functionLevel: number): number | undefined {
	const entry = limitations.find((e) => e.type === type);
	if (!entry || entry.pairs.length === 0) return undefined;
	let result = entry.pairs[0][1];
	for (const [threshold, value] of entry.pairs) {
		if (functionLevel >= threshold) {
			result = value;
		} else {
			break;
		}
	}
	return result;
}
