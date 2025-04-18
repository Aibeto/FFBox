import { FFmpegCodecDetail } from '@common/types';
import { ACodecDetail, acodecsList } from './acodecs';
import { VCodecDetail, vcodecsList } from './vcodecs';
import { MenuItem } from '@renderer/components/Menu/Menu';
import { getMenuItemByValue } from '@common/menu';
import { Parameter } from './parameter';

export function parseFFmpegCodecsToCodecsList(input: { video: FFmpegCodecDetail[], audio: FFmpegCodecDetail[] }) {
	// if (output.audio.type !== 'submenu' || output.video.type !== 'submenu') {
	// 	debugger;	// output 中应填入“全部可用编码”的 submenu 项
	// }
	const 全部可用编码 = vcodecsList[vcodecsList.length - 1] as Extract<MenuItem, { type: 'submenu' }>;
	const refreshButton = 全部可用编码.subMenu[全部可用编码.subMenu.length - 1];
	全部可用编码.subMenu = [];
	for (const iVideo of input.video) {
		const menuItem: MenuItem<VCodecDetail> = {
			type: 'submenu',
			label: iVideo.name,
			tooltip: iVideo.description,
			subMenu: iVideo.encoders.map((encoder) => ({
				type: 'normal',
				value: encoder.name,
				label: encoder.name,
				extra: (() => {
					// 对每款编码器进行参数扫描组装
					const parameters: Parameter[] = [];
					// 如果有预置编码器，那么进行 append
					const outsideItem = getMenuItemByValue(vcodecsList, encoder.name) as any;
					const outsideDetail = (outsideItem?.extra) as VCodecDetail;
					if (outsideDetail) {
						parameters.push(...outsideDetail.parameters);
					}
					for (const option of encoder.options) {
						if (false) {
						} else if (['string', 'dictionary'].includes(option.type)) {
							parameters.push({
								parameter: option.name,
								display: option.name,
								description: option.description,
								mode: 'text',
								default: option.default as string,
							});
						} else if (option.type === 'boolean') {
							parameters.push({
								parameter: option.name,
								display: option.name,
								description: option.description,
								mode: 'switch',
								default: option.default as boolean,
							});
						} else if (option.type === 'flags') {
							parameters.push({
								parameter: option.name,
								display: option.name,
								description: option.description,
								mode: 'combo',
								items: option.options.map((option) => ({
									type: 'normal',
									value: option.value as string,
									label: option.value as string,
								})),
								default: option.default,
							});
						} else if (option.type === 'int') {
							/**
							 * int 类型具有最多的目的
							 * 如果是间距为 1 的等差数列，可以认为是挡位调节（如 preset）（适用 slider），也有可能是枚举（如 tune）（适用 dropdownInput，但无法识别这种情况，所以也使用 slider）
							 * 如果不等差，基本可以认定是枚举（如 level）（适用 dropdownInput）
							 * 如果没有选项，有可能是可调节范围（如 max_b_frames (from -1 to 3) (default -1)）（适用 slider），或者是别的（如 b-bias (from INT_MIN to INT_MAX) (default INT_MIN)）(适用 NormalInput)
							 */
							if (option.options) {
								const options = option.options;
								const isEqualDiff = options.map((o) => +o.value).every((option, index, array) => index === 0 || Math.abs(option - array[index - 1]) === 1);
								if (isEqualDiff) {
									const min = Math.min(+options[0].value, +options[options.length - 1].value);
									const max = Math.max(+options[0].value, +options[options.length - 1].value);
									parameters.push({
										parameter: option.name,
										display: option.name,
										description: option.description,
										mode: 'slider',
										min, max,
										tags: new Map([...options.map((option) => [+option.value, option.name] as [number, string])]),
										sliderMode: 'number',
										default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
										adsorption: 'int',
									})									
								} else {
									parameters.push({
										parameter: option.name,
										display: option.name,
										description: option.description,
										mode: 'combo',
										items: option.options.map((option) => ({
											type: 'normal',
											value: option.value,
											label: option.name,
											tooltip: option.description,
										})),
										default: option.default,
									});
								}
							} else {
								if (Math.abs(option.max - option.min) < 1000) {
									parameters.push({
										parameter: option.name,
										display: option.name,
										description: option.description,
										mode: 'slider',
										min: option.min,
										max: option.max,
										tags: new Map(),
										sliderMode: 'number',
										default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
										adsorption: 'int',
									});
								} else {
									parameters.push({
										parameter: option.name,
										display: option.name,
										description: option.description,
										mode: 'text',
										type: 'int',
										default: option.default + '',
									});
								}
							}
						} else if (option.type === 'float') {
							if (Math.abs(option.max - option.min) < 1000) {
								parameters.push({
									parameter: option.name,
									display: option.name,
									description: option.description,
									mode: 'slider',
									min: option.min,
									max: option.max,
									tags: new Map(),
									sliderMode: 'number',
									default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
								});
							} else {
								parameters.push({
									parameter: option.name,
									display: option.name,
									description: option.description,
									mode: 'text',
									type: 'int',
									default: option.default + '',
								});
							}						
						}
					}
					// 如果有预置编码器，那么在 return 结果之前把预置编码的参数也替换掉
					if (outsideDetail) {
						outsideDetail.parameters = parameters;
					}
					return { rateControl: [] as any[], parameters };
				})(),
			})),
		}
		全部可用编码.subMenu.push(menuItem);
	}
	全部可用编码.subMenu.push({ type: 'separator' });
	全部可用编码.subMenu.push(refreshButton);
	// console.log(vcodecsList);
}
