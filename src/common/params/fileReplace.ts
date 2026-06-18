/**
 * 输出文件路径替换上下文
 * 供 [filedir]、[filename]、[fileext]、[taskId]、[taskIndex]、[outputIndex] 等占位符使用
 */
export interface FilePathReplaceContext {
	fileDir?: string;
	fileName?: string;
	fileExt?: string;
	taskId?: number;
	taskIndex?: number;
	outputIndex?: number;
}

/**
 * 对 filePath 中的占位符进行替换
 */
export function applyFilePathReplace(filePath: string, ctx: FilePathReplaceContext): string {
	filePath = filePath.replace(/\[filedir\]/g, ctx.fileDir ?? '');
	filePath = filePath.replace(/\[filename\]/g, ctx.fileName ?? '');
	filePath = filePath.replace(/\[fileext\]/g, ctx.fileExt ?? '');
	filePath = filePath.replace(/\[taskId\]/g, ctx.taskId !== undefined ? String(ctx.taskId) : '');
	filePath = filePath.replace(/\[taskIndex\]/g, ctx.taskIndex !== undefined ? String(ctx.taskIndex) : '');
	filePath = filePath.replace(/\[outputIndex\]/g, ctx.outputIndex !== undefined ? String(ctx.outputIndex) : '');
	return filePath;
}
