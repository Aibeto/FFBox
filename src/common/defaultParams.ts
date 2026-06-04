import { OutputParams } from '@common/types';

export const defaultParams: OutputParams = {
	input: {
		files: [{
			filePath: '[输入文件路径]',
			demuxer: '自动',
		}],
	},
	filter: {
		nodes: [],
		lines: [],
	},
	outputs: [
		{
			video: {
				vcodec: 'libx265',
				resolution: '不改变',
				framerate: '不改变',
				ratecontrol: 'CRF',
				detail: {
					crf: 24,
				},
			},
			audio: {
				acodec: 'copy',
				ratecontrol: 'CBR',
				detail: {},
			},
			mux: {
				format: 'mp4',
				moveflags: false,
				filePath: '[filedir]/[filename]_converted.[fileext]',
				begin: '',
				end: '',
				detail: {},
			},
		}
	],
	extra: {
		presetName: '默认配置',
	}
};
