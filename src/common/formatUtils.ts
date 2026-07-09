/**
 * 秒数 → 时间格式化
 * @param seconds 秒数（可带小数）
 * @param style 格式化风格，描述"用途"而非"实现"：
 *   - `'display'`: 人类可读，带精度信息 — `H:MM:SS / M:SS.c / s.cc`【TaskItem.graphTime、CutOperator 关键帧】
 *   - `'compact'`: 人类可读，紧凑 — `H:MM:SS / M:SS / "X s"`【TaskItem.graphLeftTime、ProgressLog X 轴、SponsorPanel 限制时长】
 *   - `'ffmpeg'` : 补零机器格式 — `HH:MM:SS.xx`（可直接作为 FFmpeg 参数）
 */
export function formatTime(seconds: number, style: 'display' | 'compact' | 'ffmpeg'): string {
	// NaN / -1 视作"未知时长"
	if (isNaN(seconds) || seconds === -1) {
		return '时长未知';
	}

	const hour = Math.floor(seconds / 3600);
	const minute = Math.floor((seconds - hour * 3600) / 60);
	const second = seconds - hour * 3600 - minute * 60;

	if (style === 'ffmpeg') {
		// HH:MM:SS.xx — 全程补零，2 位小数，FFmpeg 可直接解析
		return ('0' + hour).slice(-2) + ':' + ('0' + minute).slice(-2) + ':' + ('0' + second.toFixed(2)).slice(-5);
	}

	// 以下为人类可读风格（不补零）
	if (hour) {
		return `${hour}:${minute.toString().padStart(2, '0')}:${second.toFixed(0).toString().padStart(2, '0')}`;
	} else if (minute) {
		if (style === 'compact') {
			return `${minute}:${second.toFixed(0).padStart(2, '0')}`;
		}
		return `${minute}:${second.toFixed(1).padStart(4, '0')}`;
	} else {
		if (style === 'compact') {
			return `${second.toFixed(0)} s`;
		}
		return second.toFixed(2);
	}
}

/**
 * 传入 ffmpeg 支持的时间格式（如 HH:MM:SS.xx 或 M:SS.xx 或 xxx.xx），返回秒数（如格式错误则返回 -1）
 */
export function parseTime(timeString: string): number {
	if (timeString === 'N/A') {
		return -1;
	}
	let exp: RegExpExecArray | null;
	if (exp = /^(\d+):([0-5]?[0-9]):([0-5]?[0-9])(.\d+)?$/.exec(timeString)) {
		// (时):(分):(秒)(.小)
		const hour = Number(exp[1]);
		const minute = Number(exp[2]);
		const second = Number(exp[3]);
		const mili = Number(exp[4] ?? '0');
		if (minute >= 60 || second >= 60) {
			return -1;
		}
		return hour * 3600 + minute * 60 + second + Number(mili);
	} else if (exp = /^([0-5]?[0-9]):([0-5]?[0-9])(.\d+)?$/.exec(timeString)) {
		// (分):(秒)(.小)
		const minute = Number(exp[1]);
		const second = Number(exp[2]);
		const mili = Number(exp[3] ?? '0');
		if (minute >= 60 || second >= 60) {
			return -1;
		}
		return minute * 60 + second + Number(mili);
	} else if (/^(\d+)(.\d+)?$/.test(timeString)) {
		// (秒)(.小)
		return Number(timeString);
	}
	return -1;
}

/**
 * 将字节大小转换为人类可读数字
 */
export function formatSize(B: number, useIEC?: boolean) {
	if (useIEC) {
		if (B >= 10 * 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(1) + ' GiB';
		} else if (B >= 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(2) + ' GiB';
		} else if (B >= 100 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(0) + ' MiB';
		} else if (B >= 10 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(1) + ' MiB';
		} else {
			return (B / 1024 ** 2).toFixed(2) + ' MiB';
		}
	} else {
		if (B >= 10 * 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(1) + ' GB';
		} else if (B >= 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(2) + ' GB';
		} else if (B >= 100 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(0) + ' MB';
		} else if (B >= 10 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(1) + ' MB';
		} else {
			return (B / 1000 ** 2).toFixed(2) + ' MB';
		}
	}
}

/**
 * 码率（bit/s）格式化
 * 规则：以 10 Mibps/Mbps 为界，2 档切换
 *   - `>= 10 * unit^2` → x.x Mibps/Mbps
 *   - `<  10 * unit^2` → x kibps/kbps
 */
export function formatBitrate(bps: number, useIEC: boolean): string {
	const unit = useIEC ? 1024 : 1000;
	if (bps >= 10 * unit ** 2) {
		return (bps / unit ** 2).toFixed(1) + ' ' + (useIEC ? 'Mibps' : 'Mbps');
	} else {
		return (bps / unit).toFixed(0) + ' ' + (useIEC ? 'kibps' : 'kbps');
	}
}

/**
 * 传输速率（Byte/s）格式化
 * 规则：以 10 MiBps/MBps 为界，2 档切换
 */
export function formatTransferRate(Bps: number, useIEC: boolean): string {
	const unit = useIEC ? 1024 : 1000;
	if (Bps >= 10 * unit ** 2) {
		return (Bps / unit ** 2).toFixed(1) + ' ' + (useIEC ? 'MiBps' : 'MBps');
	} else {
		return (Bps / unit).toFixed(0) + ' ' + (useIEC ? 'kiBps' : 'kBps');
	}
}

/**
 * 以对象方式调用所有格式工具：
 *   formatUtils.time(seconds, style)   // 原 formatDuration，含 formatTimeToFFmpegStyle(style='ffmpeg') 功能
 *   formatUtils.parseTime(timeString)  // 原 parseTimeString
 *   formatUtils.size(B, useIEC)
 *   formatUtils.bitrate(bps, useIEC)
 *   formatUtils.transferRate(Bps, useIEC)
 */
export default {
	time: formatTime,
	parseTime: parseTime,
	size: formatSize,
	bitrate: formatBitrate,
	transferRate: formatTransferRate,
};
