import { OutputParams } from '@common/types';

export const defaultParams: OutputParams = {
	input: {
		mode: 'standalone',
		hwaccel: '不使用',
		files: [],
		begin: '',
		end: '',
		realtime: false,
	},
	video: {
		vcodec: 'libx265',
		resolution: '不改变',
		framerate: '不改变',
		ratecontrol: 'CRF',
		ratevalue: 27,
		detail: {},
	},
	audio: {
		acodec: 'copy',
		ratecontrol: 'CBR/ABR',
		ratevalue: 4,
		vol: 0,
		detail: {},
	},
	output: {
		format: 'MP4',
		moveflags: false,
		filename: '[filedir]/[filebasename]_converted.[fileext]',
	},
	extra: {
		presetName: '默认配置',
	}
};
