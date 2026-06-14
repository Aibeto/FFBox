/**
 * 计算刻度线的间隔
 * 
 * @param total 数据的总数或总长度
 * @param viewWidth 视区的长度或宽度
 * @param isClockUnit 是否使用时钟单位模式（产生 1,2,5,10,15,30,60 的序列）
 * @param threshold 刻度线间隔的最小阈值，默认为 100
 * @param min 最小单位，默认为 1
 * @returns 返回计算出的合适缩放单位
 */
export const getScaleUnit = (total: number, viewWidth: number, isClockUnit = false, threshold = 100, min = 1) => {
	if (total <= 0) {
		return min;
	}
	let currentScale = min;
	let step = 0;
	while (viewWidth / (total / currentScale) < threshold) {	// 如果按当前 scale 分割后产出的刻度线间隔不足阈值，那么降低密度
		if (isClockUnit) {
			currentScale *= [2, 2.5, 2, 1.5, 2, 2][step % 6];	// 1 2 5 10 15 30 60
		} else {
			currentScale *= [2, 2.5, 2][step % 3];	// 1 2 5 10
		}
		step++;
	}
	return currentScale;
};
