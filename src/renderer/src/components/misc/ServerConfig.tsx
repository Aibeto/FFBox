import { defineComponent, onMounted, ref } from "vue";
import { Server } from "@renderer/types";
import { useAppStore } from "@renderer/stores/appStore";
import nodeBridge from "@renderer/bridges/nodeBridge";
import Inputbox from '@renderer/containers/MainFrame/MainArea/ParaBox/components/Inputbox.vue';
import Checkbox from '@renderer/containers/MainFrame/MainArea/ParaBox/components/Checkbox.vue';
import { posIntegerFixer } from "@renderer/containers/MainFrame/MainArea/ParaBox/components/validatorAndFixer";
import { ButtonType } from "../Button/Button";
import Msgbox from "../Msgbox/Msgbox";

export function showServerConfig(serverId: string) {
	let compFuncs: any;
	const appStore = useAppStore();
	Msgbox({
		container: document.body,
		title: '本地服务器配置',
		content: <Comp exportFunctions={(fs) => compFuncs = fs} serverId={serverId} />,
		buttons: [
			{ text: '好', role: 'confirm', type: ButtonType.Primary, callback: async () => {
				const result = await compFuncs.exportData();
				const { maxThreads, customFFmpegPath, preserveUnfinishedTasks } = result;
				nodeBridge.localConfig.set('service.maxThreads', maxThreads);
				nodeBridge.localConfig.set('service.customFFmpegPath', customFFmpegPath);
				nodeBridge.localConfig.set('service.preserveUnfinishedTasks', preserveUnfinishedTasks);
				const server = appStore.servers.find((server) => server.data.id === serverId) as Server;
				setTimeout(() => {
					// 留时间写盘完成后再通知服务器刷新
					server.entity.initSettings();
				}, 40);
			} },
			{ text: '取消', role: 'cancel' },
		]
	});
}

interface P {
	serverId: string;
    exportFunctions: (fs: any) => void;
}
const Comp = defineComponent((props: P) => {
	const maxThreadsValue = ref<string>();
	const customFFmpegPathValue = ref<string>();
	const preserveUnfinishedTasksValue = ref(true);

	const exports = {
		exportData: async () => {
			return {
				maxThreads: +maxThreadsValue.value,
				customFFmpegPath: customFFmpegPathValue.value,
				preserveUnfinishedTasks: preserveUnfinishedTasksValue.value,
			};
		}
	};

    onMounted(() => {
		props.exportFunctions(exports);
		(async () => {
			const currentMaxThreads = (await nodeBridge.localConfig.get('service.maxThreads') as number) || 1;
			maxThreadsValue.value = currentMaxThreads + '';
			const currentCustomFFmpegPath = await nodeBridge.localConfig.get('service.customFFmpegPath');
			customFFmpegPathValue.value = currentCustomFFmpegPath || '';
			const preserveUnfinishedTasks = await nodeBridge.localConfig.get('service.preserveUnfinishedTasks');
			preserveUnfinishedTasksValue.value = preserveUnfinishedTasks === false ? false : true;
		})();
    });

	return () => (
		<>
			<Inputbox title="同时转码数" value={maxThreadsValue.value} onChange={(value: string) => maxThreadsValue.value = value} inputFixer={posIntegerFixer} placeholder="1" />
			<Inputbox title="ffmpeg 路径" value={customFFmpegPathValue.value} onChange={(value: string) => customFFmpegPathValue.value = value} placeholder="建议留空，自动检测" />
			<Checkbox title="保留未完任务" checked={preserveUnfinishedTasksValue.value} onChange={(value: boolean) => preserveUnfinishedTasksValue.value = value} />
		</>
	);
}, { props: ['serverId', 'exportFunctions'] });
