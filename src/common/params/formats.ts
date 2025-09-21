import { getMenuItemByValue, MenuItem, NarrowedMenuItem } from "@common/menu";
import { OutputParams_mux, OutputParams_input } from "../types";
import { Parameter } from "./parameter";

export interface Demuxer {
	isDevice: boolean;
	parameters?: Parameter[];
}
export interface Muxer {
	// commonExtensions?: string[];	// 一个 muxer 可能对应多个扩展名。此时格式中的 value 应表达为 拓展 (muxer)
	mineType?: string;
	defaultVideoCodec?: string;
	defaultAudioCodec?: string;
	parameters?: Parameter[];
}

export interface Hwaccel extends NarrowedMenuItem {
	hwaccel: string;
}

export const builtInDemuxers: MenuItem[] = [
	{
		type: 'normal',
		value: '自动',
		label: '自动',
		tooltip: '根据输入路径自动选择解复用器。ffmpeg 将自动识别本地文件/网络路径等',
	},
	// {
	// 	type: 'normal',
	// 	value: 'concat',
	// 	label: '媒体拼接',
	// 	tooltip: '将若干个视频/音频拼接成一个文件。',
	// },
];

export const allDemuxers: MenuItem<Muxer>[] = [];

export const builtInMuxers: MenuItem<Muxer>[] = [
	{
		type: 'normal',
		value: '无',
		label: '无',
		tooltip: '不输出文件，转码完成即丢弃',
	},
	{ type: 'separator' },
	{
		type: 'submenu',
		label: '视频',
		subMenu: [
			{
				type: 'normal',
				value: 'mp4',
				label: 'MP4',
				tooltip: 'MP4 即 MPEG-4 Part 14 是一种标准的数字多媒体容器格式，是 ISO/IEC 14496 标准第 14 部分定义的官方文件格式（另有 .m4v、.m4a 等兼容格式）。\n默认视频编码器：h264\n默认音频编码器：aac',
			},
			{
				type: 'normal',
				value: 'mkv (matroska)',
				label: 'MKV',
				tooltip: 'MKV 即 Matroska Video File 是一种开放源代码的多媒体封装格式（另有 .mka、.mks 分别表示音频文件和字幕文件），其最大的特点是能容纳多种类型的影像编码、音频编码、字幕流。\n默认视频编码器：h264\n默认音频编码器：vorbis',
			},
			{
				type: 'normal',
				value: 'mov (mp4)',
				label: 'MOV',
				tooltip: 'MOV 为 QuickTime Movie 的文件扩展名。QuickTime 是 MP4 的前身，由苹果公司开发。\n默认视频编码器：h264\n默认音频编码器：aac',
			},
			{
				type: 'normal',
				value: 'flv',
				label: 'FLV',
				tooltip: 'FLV 即 Flash Video，是一种应用在 SWF 中的网络视频格式，用作流媒体格式。其继任者为 F4V。\n默认视频编码器：flv1\n默认音频编码器：mp3',
			},
			{
				type: 'normal',
				value: 'ts (mpegts)',
				label: 'TS',
				tooltip: 'TS 即 MPEG2-TS 传输流（MPEG-2 Transport Stream；又称 MPEG-TS、MTS、TS）是一种传输和存储包含视频、音频与通信协议各种数据的标准格式，用于数字电视广播系统，定义于 ISO/IEC 13818 标准第 1 部分。\n默认视频编码器：mpeg2video\n默认音频编码器：mp2',
			},
			{
				type: 'normal',
				value: '3gp',
				label: '3GP',
				tooltip: '3GP 是 MP4 的一种简化版本，减少了存储空间和较低的带宽需求，让手机上有限的存储空间可以使用。\n默认视频编码器：h263\n默认音频编码器：amr_nb',
			},
			{
				type: 'normal',
				value: 'rm',
				label: 'RM (RealMedia)',
				tooltip: 'RM 是 RealMedia 的文件扩展名（另有使用动态比特率的格式 .rmvb 和最新格式 .rmhd）。RealVideo 是由 RealNetworks 于 1997 年开发的一种专用视频压缩格式，定位为应用于网络视频播放的格式。\n默认视频编码器：rv10\n默认音频编码器：ac3',
			},
			{
				type: 'normal',
				value: 'wmv (asf)',
				label: 'WMV',
				tooltip: 'WMV 即 Windows Media Video 是微软公司开发的一组数字影片编解码格式的通称（另有 .asf 扩展名），它是 Windows Media 架构下的一部分。\n默认视频编码器：msmpeg4v3\n默认音频编码器：wmav2',
			},
			{
				type: 'normal',
				value: 'avi',
				label: 'AVI',
				tooltip: 'AVI 即 Audio Video Interleave 是由微软在 1992 年推出的一种多媒体文件格式。\n默认视频编码器：mpeg4\n默认音频编码器：mp3',
			},
			{
				type: 'normal',
				value: 'dvd',
				label: 'DVD',
				tooltip: '（另有 .vob 扩展名）\n默认视频编码器：mpeg2video\n默认音频编码器：mp2',
			},
			{
				type: 'normal',
				value: 'h264',
				label: 'h264',
				tooltip: 'h.264 裸流',
			},
			{
				type: 'normal',
				value: 'hevc',
				label: 'hevc',
				tooltip: 'hevc 裸流',
			},
		],
	},
	{
		type: 'submenu',
		label: '音频',
		subMenu: [
			{
				type: 'normal',
				value: 'aac (adts)',
				label: 'AAC',
				tooltip: 'AAC（Advanced Audio Coding）是一种有损音频压缩格式，作为 MP3 的继任者在音质和压缩效率方面更具优势。ADTS 是其常见的封装格式，用于流式传输。\n默认音频编码器：aac',
			},
			{
				type: 'normal',
				value: 'opus',
				label: 'OPUS',
				tooltip: 'Opus 是一种开放、免专利费的音频编码格式，特别适用于语音和实时通信，由 IETF 标准化，支持从低比特率语音到高质量音乐的广泛应用。\n默认音频编码器：libopus',
			},
			{
				type: 'normal',
				value: 'ogg',
				label: 'OGG',
				tooltip: 'OGG 是一个开放容器格式，由 Xiph.Org 基金会开发，常用于封装 Vorbis、Opus 等音频流，也支持视频流如 Theora。\n默认音频编码器：libvorbis',
			},
			{
				type: 'normal',
				value: 'mp3',
				label: 'MP3',
				tooltip: 'MP3（MPEG-1 Audio Layer III）是一种古老且被广泛使用的有损音频压缩格式。\n默认音频编码器：libmp3lame',
			},
			{
				type: 'normal',
				value: 'mp2',
				label: 'MP2',
				tooltip: 'MP2（MPEG-1 Audio Layer II）广泛用于广播和数字电视音频传输，尽管被 MP3 取代于消费市场，但在专业领域仍有使用。\n默认音频编码器：mp2',
			},
			{
				type: 'normal',
				value: 'ac3',
				label: 'AC3',
				tooltip: 'AC-3（Dolby Digital）是杜比实验室开发的音频压缩技术，广泛用于 DVD、数字电视、电影音轨等场景，支持多声道环绕音频。\n默认音频编码器：ac3',
			},
			{
				type: 'normal',
				value: 'flac',
				label: 'FLAC',
				tooltip: 'FLAC（Free Lossless Audio Codec）是一种无损音频压缩格式，可以在保持原始音质的同时有效减小文件体积，常用于音乐存档和高保真音频播放。\n默认音频编码器：flac',
			},
			{
				type: 'normal',
				value: 'dts',
				label: 'DTS',
				tooltip: 'DTS（Digital Theater Systems）是一种用于影院及家庭影院的音频压缩技术，支持高质量多声道音频，但相较 AC3 通用性略低。\n默认音频编码器：dca',
			},
			{
				type: 'normal',
				value: 'amr',
				label: 'AMR',
				tooltip: 'AMR（Adaptive Multi-Rate）是一种音频压缩格式，优化用于语音编码，在移动通信中应用广泛。\n默认音频编码器：libopencore_amrnb',
			},
		],
	},
	{
		type: 'submenu',
		label: '图像（静态）',
		tooltip: '输出单张静态图像或图像序列\n该系列格式使用 ffmpeg 的 image2 复用器，通过文件扩展名判断输出格式。它支持众多图像格式，包括部分并没有在文档中列出来的格式，如 apng 和 webp\n若想输出单张图像（截取第一帧），请使用 -frames:v 1 参数\n若想输出图像序列，请在文件名中包含如 %03d 这样的格式化占位符',
		subMenu: [
			{
				type: 'normal',
				value: 'bmp (image2)',
				label: 'BMP',
				tooltip: 'BMP（Bitmap）是一种由微软开发的通常为不压缩的图像格式，文件体积较大。',
			},
			{
				type: 'normal',
				value: 'jpg (image2)',
				label: 'JPG/JPEG',
				tooltip: 'JPEG 是由联合图像专家小组（Joint Photographic Experts Group）于 1992 年发布的一种针对照片影像而广泛使用的有损压缩标准方法，是万维网上最普遍的用来存储和传输照片的格式。它并不适合于线条绘图和其他文字或图标的图形。',
			},
			{
				type: 'normal',
				value: 'png (image2)',
				label: 'PNG',
				tooltip: 'PNG（Portable Network Graphics）是一种无损压缩的图像格式，支持透明通道，常用于图标和网页元素。',
			},
			{
				type: 'normal',
				value: 'tif (image2)',
				label: 'TIF/TIFF',
				tooltip: 'TIFF（Tagged Image File Format）是一种灵活的图像格式，支持无损和有损压缩，广泛用于出版印刷和图像处理领域。',
			},
			{
				type: 'normal',
				value: 'avif (image2)',
				label: 'AVIF',
				tooltip: 'AVIF（AV1 Image File Format）是一种基于 AV1 编码的视频图像格式，具备更高压缩效率和更好的视觉质量，支持透明通道和 HDR。',
			},
			{
				type: 'normal',
				value: 'apng (image2)',
				label: 'APNG',
				tooltip: 'APNG 是对 PNG 的扩展，支持帧动画，同时保留了 PNG 的无损性和透明通道，兼容性较好。',
			},
			{
				type: 'normal',
				value: 'webp (image2)',
				label: 'WEBP',
				tooltip: 'WebP 是由 Google 开发的衍生自 VP8 的现代图像格式，支持有损和无损压缩、透明通道和动画，广泛用于网页图片。',
			},
			{
				type: 'normal',
				value: 'gif (image2)',
				label: 'GIF',
				tooltip: 'GIF（Graphics Interchange Format）是一种古老的支持帧动画的图像格式，采用调色板和无损压缩，适用于简单动画或图像，曾在万维网上被广泛使用，但由于空间和质量原因，现已不常见。',
			},
		],
	},
	{
		type: 'submenu',
		label: '图像（动态）',
		tooltip: '该系列包含一些支持动态图像的格式\n（如果您的输入本身就是静态图像，或者指定了单帧，那么 ffmpeg 也没法帮您变成会动的☺️）',
		subMenu: [
			{
				type: 'normal',
				value: 'apng',
				label: 'APNG',
				tooltip: 'APNG 是对 PNG 的扩展，支持帧动画，同时保留了 PNG 的无损性和透明通道，兼容性较好。',
			},
			{
				type: 'normal',
				value: 'avif',
				label: 'AVIF',
				tooltip: 'AVIF（AV1 Image File Format）是一种基于 AV1 编码的视频图像格式，具备更高压缩效率和更好的视觉质量，支持透明通道和 HDR。',
			},
			{
				type: 'normal',
				value: 'gif',
				label: 'GIF',
				tooltip: 'GIF（Graphics Interchange Format）是一种古老的支持帧动画的图像格式，采用调色板和无损压缩，适用于简单动画或图像，曾在万维网上被广泛使用，但由于空间和质量原因，现已不常见。',
			},
			{
				type: 'normal',
				value: 'webp',
				label: 'WEBP',
				tooltip: 'WebP 是由 Google 开发的衍生自 VP8 的现代图像格式，支持有损和无损压缩、透明通道和动画，广泛用于网页图片。',
			},
		],
	},
];

export const allMuxers: MenuItem<Muxer>[] = [];

export const hwaccels: Hwaccel[] = [
	{
		type: 'normal',
		value: '不使用',
		label: '不使用',
		tooltip: '不使用硬件解码。',
		hwaccel: '-',
	},
	{
		type: 'normal',
		value: '自动',
		label: '自动',
		tooltip: '自动选择硬件解码器。',
		hwaccel: 'auto',
	},
	{
		type: 'normal',
		value: 'dxva2',
		label: 'dxva2',
		tooltip: 'Direct-X Video Acceleration API 2 - Windows 和 Xbox360 上的通用硬件解码器，支持包括 H.264, MPEG-2, VC-1, WMV 3 在内的视频解码。（解码所用的设备与您的主显示器连接的 GPU 有关）',
		hwaccel: 'dxva2',
	},
	{
		type: 'normal',
		value: 'd3d11va',
		label: 'd3d11va',
		tooltip: 'd3d11va',
		hwaccel: 'd3d11va',
	},
	{
		type: 'normal',
		value: 'cuda',
		label: 'cuda',
		tooltip: 'NVIDIA 显卡的 cuda 解码器。',
		hwaccel: 'cuda',
	},
	{
		type: 'normal',
		value: 'cuvid',
		label: 'cuvid/nvenc',
		tooltip: 'NVIDIA 显卡的专用视频解码器。',
		hwaccel: 'cuvid',
	},
	{
		type: 'normal',
		value: 'qsv',
		label: 'qsv',
		tooltip: 'Intel 显卡的 Quick Sync Video 解码。',
		hwaccel: 'qsv',
	},
]

export const keepMeatadataList: NarrowedMenuItem[] = [
	{
		type: 'normal',
		value: false,
		label: '无',
	},
	{
		type: 'normal',
		value: 'map',
		label: 'map metadata',
		tooltip: '该方式主要用于保留大多数标签、描述信息，如创建时间、作者信息、编码器信息等元数据',
	},
	{
		type: 'normal',
		value: 'movflags',
		label: 'move flags',
		tooltip: '该方式主要用于某些特定元数据，如对于 MP4/MOV 容器，FFmpeg 将内部 metadata 映射为 QuickTime 的 udta 元数据',
	},
	{
		type: 'normal',
		value: 'both',
		label: '两者',
	},
];

export const keepFileTimeList: NarrowedMenuItem[] = [
	{
		type: 'normal',
		value: false,
		label: '无',
	},
	{
		type: 'normal',
		value: 'original',
		label: '原样复制文件时间',
		tooltip: '输出文件的创建时间、修改时间、访问时间将从输入文件的时间原样复制',
	},
	{
		type: 'normal',
		value: 'autoShift',
		label: '复制修正后的文件时间（依创建时间）',
		tooltip: '输出文件的创建时间、修改时间将以创建时间为基准，按照剪裁位置自动调整后进行修改',
	},
	{
		type: 'normal',
		value: 'fixCTbyMTandShift',
		label: '复制修正后的文件时间（依修改时间）',
		tooltip: '输出文件的创建时间、修改时间将以修改时间为基准，按照剪裁位置自动调整后进行修改，用于修复拷贝后创建时间丢失的问题',
	},
	{
		type: 'normal',
		value: 'fixByFilenameAndShift',
		label: '根据文件名修正新文件时间',
		tooltip: '用于修复文件时间丢失的问题，将通过识别文件名中的时间作为创建时间（按当前系统时区），根据剪裁位置自动调整后进行修改\n仅支持年月日时分秒顺序',
	},
];

/**
 * 获取输出参数的命令行（对每个输出均需调用一次）
 */
export function getMuxFFmpegParam(muxParams: OutputParams_mux, filedir: string, fileName: string, withQuotes = false, overrideFilePath: string) {
	let ret = [];
	if (muxParams.format.length && muxParams.format !== '无') {
		let formatItem = getMenuItemByValue(builtInMuxers, muxParams.format) as any;
		if (!formatItem) {
			formatItem = getMenuItemByValue(allMuxers, muxParams.format) as any;
		}
		let extension;
		if (formatItem) {
			const match = (formatItem.value as string).match(/(.+) \((.+)\)/);
			extension = match?.[1] ?? muxParams.format;
			let needExplicitMuxer = false;
			if (match?.[2] && (getMenuItemByValue(builtInMuxers, match[1]) || getMenuItemByValue(allMuxers, match[1]))) {
				needExplicitMuxer = true;
			}
			if (!muxParams.filePath.includes('[fileext]') || needExplicitMuxer) {
				// 指定格式但没扩展名的情况下，或者在格式列表里具有不带括号的同名复用器（比如 image2 中的各种重名复用器），需要手动指定 muxer
				ret.push('-f');
				ret.push(match?.[2] ?? muxParams.format);	// -f 后需要指定的是 muxer 而不是扩展名，除非扩展名和 muxer 一致
			}
			const formatDetail = (formatItem.extra) as Muxer;
			for (const parameter of formatDetail?.parameters || []) {
				if (parameter.optional && muxParams.detail[parameter.parameter] === undefined) {
					continue;
				}
				if (parameter.mode === 'combo') {
					if (muxParams.detail[parameter.parameter] != '默认' && muxParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(muxParams.detail[parameter.parameter]);
					}
				} else if (parameter.mode == 'slider') {
					ret.push('-' + parameter.parameter);
					const floatValue = muxParams.detail[parameter.parameter];
					const value = parameter.valueToParam ? parameter.valueToParam(floatValue) : floatValue;
					ret.push(value);
				} else if (parameter.mode === 'switch') {
					if (muxParams.detail[parameter.parameter] !== undefined) {
						ret.push('-' + parameter.parameter);
						ret.push(muxParams.detail[parameter.parameter]);
					}
				} else if (parameter.mode === 'text') {
					if (muxParams.detail[parameter.parameter] && muxParams.detail[parameter.parameter] != '默认' && muxParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(muxParams.detail[parameter.parameter]);
					}
				}
			}
		} else {
			// 用户手动输入的格式
			extension = muxParams.format;
			if (!muxParams.filePath.includes('[fileext]')) {
				ret.push('-f');
				ret.push(muxParams.format);
			}
		}
		if (muxParams.moveflags) {
			ret.push('-movflags')
			ret.push('+faststart')
		}
		if (muxParams.begin) {
			ret.push('-ss')
			ret.push(muxParams.begin)
		}
		if (muxParams.end) {
			ret.push('-to')
			ret.push(muxParams.end)
		}
		if (muxParams.keepMetadata) {
			if (muxParams.keepMetadata === 'map') {
				ret.push('-map_metadata');
				ret.push('0');
			} else if (muxParams.keepMetadata === 'movflags') {
				ret.push('-movflags');
				ret.push('use_metadata_tags');
			} else if (muxParams.keepMetadata === 'both') {
				ret.push('-map_metadata');
				ret.push('0');
				ret.push('-movflags');
				ret.push('use_metadata_tags');
			}
		}
		let outputFilePath;
		if (overrideFilePath) {
			outputFilePath = overrideFilePath;
		} else {
			outputFilePath = muxParams.filePath;
			outputFilePath = outputFilePath.replace(/\[filedir\]/g, filedir);
			outputFilePath = outputFilePath.replace(/\[filename\]/g, fileName);
			outputFilePath = outputFilePath.replace(/\[fileext\]/g, extension);
		}
		if (withQuotes) {
			outputFilePath = '"' + outputFilePath + '"';
		}
		ret.push(outputFilePath);
	} else {
		ret.push('-f')
		ret.push('null')
		ret.push('-');	// 这个就相当于输出文件名了，以这个或者输出文件名为分割，下一个输出文件可以接在后面
		// ret.push('-benchmark')   // 可有可无
	}
	if (muxParams.custom) {
		ret.push(...muxParams.custom.split(' '));
	}
	return ret;
}
/**
 * 获取输入参数的命令行（全局唯一）
 */
export function getInputFFmpegParam(inputParams: OutputParams_input, withQuotes = false, inputDir?: string) {
	let ret = [];
	const quoteStr = withQuotes ? `"` : '';
	// 确保至少有一个输入
	const files = inputParams.files.length ? inputParams.files : [{
		filePath: '[输入文件路径]',
		begin: '',
		end: '',
		custom: '',
		hwaccel: '',
		realtime: false,
	}];
	for (const file of files) {
		if (file.demuxer && file.demuxer !== '自动') {
			ret.push('-f');
			ret.push(file.demuxer);
		}
		// custom 参数（字符串直接拆分）
		if (file.custom) {
			ret.push(...file.custom.split(' '));
		}	
		// hwaccel 参数
		if (file.hwaccel && file.hwaccel !== '不使用') {
			ret.push('-hwaccel');
			let hwaccel = hwaccels.find((item) => item.value === file.hwaccel)?.hwaccel;
			ret.push(hwaccel);
		}
		// realtime 参数
		if (file.realtime) {
			ret.push('-re');
		}
		// 输入裁剪参数（放在 -i 前）
		if (file.begin) {
			ret.push('-ss');
			ret.push(file.begin);
		}
		if (file.end) {
			ret.push('-to');
			ret.push(file.end);
		}
		// 输入路径
		ret.push('-i');
		ret.push(quoteStr + (inputDir ? `${inputDir}/` : '') + file.filePath + quoteStr);
	}
	return ret;
}

/**
 * 获取不包含目录信息的输出文件名
 * 用于前端在下载时恢复输出文件名信息
 */
export function getOutputFileBaseName(muxParams: OutputParams_mux, fileName: string) {
	let extension = '';

	if (muxParams.format?.length && muxParams.format !== '无') {
		let formatItem = getMenuItemByValue(builtInMuxers, muxParams.format);
		if (!formatItem) {
			formatItem = getMenuItemByValue(allMuxers, muxParams.format);
		}
		extension = formatItem ? (formatItem.value as string).match(/(.+) \(.+\)/)?.[1] || formatItem.value : muxParams.format;
	}

	let outputFilePath = muxParams.filePath;
	outputFilePath = outputFilePath.replace(/\[filedir\]/g, '');
	outputFilePath = outputFilePath.replace(/\[filename\]/g, fileName);
	outputFilePath = outputFilePath.replace(/\[fileext\]/g, extension);
	outputFilePath = outputFilePath.replace(/^[/\\]+/, "");	// 去除开头斜杠
	return outputFilePath;
}
