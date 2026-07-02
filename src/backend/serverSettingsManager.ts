import localConfig from '@common/localConfig';
import { ServerSettingsData } from '@common/types';

const defaultSettings: ServerSettingsData = {
	maxThreads: 1,
	customFFmpegPath: '',
	preserveUnfinishedTasks: true,
	deleteFinishedTasks: false,
};

export class ServerSettingsManager {
	private cached: ServerSettingsData = { ...defaultSettings };

	/**
	 * 同步获取当前缓存的配置（需先调用过 refresh()）
	 */
	get(): ServerSettingsData {
		return this.cached;
	}

	/**
	 * 从磁盘刷新缓存
	 */
	async refresh(): Promise<ServerSettingsData> {
		const raw = await localConfig.get('service') as Partial<ServerSettingsData> | undefined;
		this.cached = {
			maxThreads: raw?.maxThreads ?? defaultSettings.maxThreads,
			customFFmpegPath: raw?.customFFmpegPath ?? defaultSettings.customFFmpegPath,
			preserveUnfinishedTasks: raw?.preserveUnfinishedTasks !== false,
			deleteFinishedTasks: raw?.deleteFinishedTasks === true,
		};
		return this.cached;
	}

	/**
	 * 写入配置（合并写入），同时更新缓存
	 */
	async setSettings(settings: Partial<ServerSettingsData>): Promise<void> {
		const current = await localConfig.get('service') as Record<string, any> || {};
		await localConfig.set('service', { ...current, ...settings });
		// 直接更新缓存，无需再从磁盘读取
		this.cached = { ...this.cached, ...settings };
	}
}
