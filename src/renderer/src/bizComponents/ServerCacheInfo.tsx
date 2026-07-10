import { defineComponent, onMounted, ref } from "vue";
import { NotificationLevel, Permission } from "@common/types";
import { Server } from "@renderer/types";
import { useAppStore } from "@renderer/stores/appStore";
import formatUtils from "@common/formatUtils";
import Button from '@renderer/components/Button/Button';
import Msgbox from "../components/Msgbox/Msgbox";
import Popup from "../components/Popup/Popup";

export function showServerCacheInfo(serverId: string) {
	(document.activeElement as any)?.blur();
	Msgbox({
		container: document.body,
		title: '服务器缓存信息',
		content: <Comp serverId={serverId} />,
		buttons: [
			{ text: '关闭', role: 'cancel' },
		]
	});
}

interface P {
	serverId: string;
}
const Comp = defineComponent((props: P) => {
	const appStore = useAppStore();
	const cacheInfo = ref<{ uploadCount: number, uploadSize: number, downloadCount: number, downloadSize: number }>();

	const handleClearCache = async () => {
		const server = appStore.servers.find((server) => server.data.id === props.serverId) as Server;
		try {
			const result = await server.entity.getCacheInfo(true);
			Popup({ message: `已清除上传缓存 ${result.uploadCount} 个文件，总计 ${formatUtils.size(result.uploadSize)}；下载缓存 ${result.downloadCount} 个文件，总计 ${formatUtils.size(result.downloadSize)}` });
			const newResult = await server.entity.getCacheInfo(false);
			cacheInfo.value = newResult;
		} catch (e: any) {
			Popup({ message: `清除失败：${e.message || '权限不足或网络错误'}`, level: NotificationLevel.error });
		}
	};

	onMounted(async () => {
		const server = appStore.servers.find((server) => server.data.id === props.serverId) as Server;
		const result = await server.entity.getCacheInfo(false);
		cacheInfo.value = result;
	});

	return () => (
		<div>
			{cacheInfo.value ? (
				<div style={{ lineHeight: '1.5em' }}>
					上传缓存：{cacheInfo.value.uploadCount} 个文件，{formatUtils.size(cacheInfo.value.uploadSize, appStore.frontendSettings.useIEC)}<br />
					下载缓存：{cacheInfo.value.downloadCount} 个文件，{formatUtils.size(cacheInfo.value.downloadSize, appStore.frontendSettings.useIEC)}
				</div>
			) : (
				<div>暂无信息</div>
			)}
			<div style={{ height: '16px' }}></div>
			{appStore.servers.find((s) => s.data.id === props.serverId)?.entity.permissions.includes(Permission.CacheManagement) ? (
				<Button onClick={() => handleClearCache()}>清除缓存</Button>
			) : (
				<Button disabled={true}>清除缓存（无权限）</Button>
			)}
		</div>
	);
}, { props: ['serverId'] });