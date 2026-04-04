<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import { ServiceBridgeStatus } from '@renderer/bridges/serviceBridge';
import nodeBridge from '@renderer/bridges/nodeBridge';
import ListArea from './ListArea/ListArea.vue';
import ParaBox from './ParaBox/ParaBox.vue';
import TransferCenter from './TransferCenter/TransferCenter.vue';
import TaskInfo from './TaskInfo/TaskInfo.vue';
import CutOperator from './CutOperator/CutOperator.vue';
import DragFilesOverlay from './DragFilesOverlay/DragFilesOverlay.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import ImageDisconnected from './disconnect.svg?component';
import ImageLoading from '@renderer/assets/loading.svg?component';
import { MenuItem } from '@common/menu';

const appStore = useAppStore();

interface ServerInfo {
	ip: string;
	port: string;
	username: string;
	password: string;
};

/**
 * 生命周期  status    name     行为
 * 初始化    init     未连接    登录窗
 * 连接中  connecting 未连接    登录窗
 * 失败      init     未连接    登录窗
 * 成功    connected   ip       正常
 * 掉线       dis      ip   正常 + 掉线提示
 * 重连中 reconnecting ip   正常 + 掉线重连提示
 */
const ip = ref('127.0.0.1');
const port = ref('33269');
const username = ref('');
const password = ref('');
const draggingCount = ref(0);

const loginBoxVisible = computed(() => [ServiceBridgeStatus.Idle, ServiceBridgeStatus.Connecting].includes(appStore.currentServer?.entity.status));
const isConnecting = computed(() => [ServiceBridgeStatus.Connecting, ServiceBridgeStatus.Reconnecting].includes(appStore.currentServer?.entity.status));
const isDisconnected = computed(() => [ServiceBridgeStatus.Disconnected, ServiceBridgeStatus.Reconnecting].includes(appStore.currentServer?.entity.status));

const serversList = ref<MenuItem<ServerInfo>[]>([]);

watch(() => appStore.currentServer?.entity.ip, (newValue, oldValue) => {
	if (newValue === 'localhost') {
		// 切到 entity.ip === 'localhost'（本地服务器）时候，输入框固定为 'localhost'
		ip.value = 'localhost';
	} else if (ip.value === 'localhost') {
		// 切到非本地服务器的时候，输入框分配一个不是 'localhost' 的值
		ip.value = '127.0.0.1';
	}
}, { immediate: true });

const refreshList = async () => {
	try {
		const newServersList = (await nodeBridge.localStorage.get('serversInfo') as ServerInfo[]).map((info) => ({
			type: 'normal' as const,
			value: `${info.ip}:${info.port}${info.username ? `@${info.username}` : ''}`,
			label: `${info.ip}:${info.port}${info.username ? `@${info.username}` : ''}`,
			extra: info,	// 解析时直接 parse value 也行，但为方便起见就用 extra
		})) as MenuItem<ServerInfo>[];
		if (newServersList.length) {
			newServersList.push(...[
				{ type: 'separator' as const },
				{ type: 'submenu' as const, label: '清除记录', subMenu: [
					...newServersList.map((menuItem: any) => (
						{ ...menuItem, label: `删除 ${menuItem.value}`, onClick: () => {
							console.log(menuItem);
							const item = menuItem.extra;
							const newServersInfo = serversList.value.map((server) => server.type === 'normal' && server.extra).filter((i) => i);
							let sameInfoIndex = newServersInfo.findIndex((info) => info.ip === item.ip && info.port === item.port && info.username === item.username);
							if (sameInfoIndex >= 0) {
								newServersInfo.splice(sameInfoIndex, 1);
								nodeBridge.localStorage.set('serversInfo', newServersInfo);
								setTimeout(() => {
									refreshList();
								}, 100);
							}
						} }
					)),
				] },
			]);
		} else {
			newServersList.push({ type: 'normal' as const, value: 'empty', label: '没有历史记录', disabled: true });
		}
		serversList.value = newServersList;
	} catch (error) {
		return;
	}
}

const ipInputFixer = (value: string) => {
	// 非本地服务器标签页不可输入 localhost
	if ((appStore.currentServer?.entity.ip || appStore.currentServer.entity.ip !== 'localhost') && value === 'localhost') {
		return '127.0.0.1';
	} else {
		return value;
	}
};

const handleConnectClicked = () => {
	if (!ip.value.length || isNaN(Number(port.value))) {
		return;
	}
	appStore.initializeServer(appStore.currentServerId, ip.value, Number(port.value), username.value, password.value).then(() => {
		// 检查是否新增或修改
		let changed = false;
		const newServersInfo = serversList.value.map((server) => server.type === 'normal' && server.extra).filter((i) => i);
		let sameInfo = newServersInfo.find((info) => info.ip === ip.value && info.port === port.value && info.username === username.value);
		if (sameInfo) {
			if (sameInfo.password !== password.value) {
				sameInfo.password = password.value;
				changed = true;
			}
		} else {
			newServersInfo.push({ ip: ip.value, port: port.value, username: username.value, password: password.value });
			changed = true;
		}
		if (changed) {
			// 有变化则写盘然后刷新
			nodeBridge.localStorage.set('serversInfo', newServersInfo);
			setTimeout(() => {
				refreshList();
			}, 100);
		}
	});
};
const handleReconnectClicked = async () => {
	if (location.href.startsWith('file') && appStore.currentServer.entity.ip === 'localhost') {
		nodeBridge.startService();
	}
	appStore.reConnectServer(appStore.currentServerId);
};

const handleIpInputChange = (value: string) => {
	ip.value = value;
	const item = serversList.value.find((server) => server.type === 'normal' && server.value === value) as Extract<MenuItem<ServerInfo>, { type: 'normal' }>;
	if (item) {
		setTimeout(() => {
			ip.value = item.extra.ip;
			port.value = item.extra.port;
			username.value = item.extra.username;
			password.value = item.extra.password;
		}, 0);
	}
}

const handleDragEnter = () => {
	draggingCount.value++;
	appStore.showDragFilesOverlay = true;
};
const handleDragLeave = () => {
	if (draggingCount.value <= 1) {
		appStore.showDragFilesOverlay = false;
		draggingCount.value = 0;
	} else {
		draggingCount.value--;
	}
};
const handleDrop = () => {
	draggingCount.value = 0;
	appStore.showDragFilesOverlay = false;
};

onMounted(() => {
	refreshList();
});

</script>

<template>
	<div
		class="mainarea"
		:ref="(el) => appStore.componentRefs['MainArea'] = (el as Element)"
		@dragover="(e) => e.preventDefault()"
		@dragenter="handleDragEnter"
		@dragleave="handleDragLeave"
		@drop="handleDrop"
	>
		<div class="upperArea" :style="{ height: `${appStore.draggerPos * 100}%`, position: 'relative' }">
			<!-- 登录窗口 -->
			<div class="loginArea" v-if="loginBoxVisible">
				<Transition name="bganimate" appear>
					<div v-if="loginBoxVisible" class="loginBackground" />
				</Transition>
				<Transition name="boxanimate" appear>
					<div
						v-if="loginBoxVisible"
						class="loginBox"
					>
						<h2>连接服务器</h2>
						<div class="box">
							<div>
								<BoxedDropdownInput title="IP" :text="ip" :disabled="ip === 'localhost'" :inputFixer="ipInputFixer" @change="handleIpInputChange" @enter="handleConnectClicked" :list="serversList" />
								<BoxedNormalInput title="端口" :value="port" @change="port = $event" @enter="handleConnectClicked" />
							</div>
							<div>
								<BoxedNormalInput title="用户名" :value="username" @change="username = $event" @enter="handleConnectClicked" />
								<BoxedNormalInput title="密码" type="password" :value="password" @change="password = $event" @enter="handleConnectClicked" />
							</div>
						</div>
						<div class="buttonBox">
							<Button
								:type="ButtonType.Primary"
								size="large"
								:disabled="appStore.currentServer?.entity.status === ServiceBridgeStatus.Connecting"
								@click="handleConnectClicked"
							>
								连接
							</Button>
						</div>
					</div>
				</Transition>
			</div>
			<!-- 正常区域 -->
			<ListArea v-if="!loginBoxVisible && appStore.currentServer" />
			<!-- 掉线区域 -->
			<div class="disconnectArea" v-if="isDisconnected">
				<Transition name="bganimate" appear>
					<div v-if="isDisconnected" class="disconnectBackground" />
				</Transition>
				<Transition name="boxanimate" appear>
					<div
						v-if="isDisconnected"
						class="disconnectBox"
					>
						<div class="box">
							<h2>服务器掉线了……</h2>
							<div class="svg" v-if="appStore.currentServer?.entity.status === ServiceBridgeStatus.Disconnected">
								<ImageDisconnected style="animation: none;" />
							</div>
							<div class="svg" v-if="isConnecting">
								<ImageLoading style="width: 120px;" />
							</div>
						</div>
						<div class="buttonBox">
							<Button
								:type="ButtonType.Primary"
								size="large"
								:disabled="isConnecting"
								@click="handleReconnectClicked"
							>
								重试
							</Button>
						</div>
					</div>
				</Transition>
			</div>
		</div>
		<div class="lowerArea" :style="{ height: `${(1 - appStore.draggerPos) * 100}%` }">
			<Transition name="paraboxanim">
				<ParaBox v-if="!appStore.showTransferCenter && appStore.showTaskInfo === undefined && !appStore.showCutOperator" />
			</Transition>
			<Transition name="paraboxanim">
				<TransferCenter v-if="appStore.showTransferCenter && !appStore.showCutOperator" />
			</Transition>
			<Transition name="paraboxanim">
				<TaskInfo v-if="appStore.showTaskInfo !== undefined && !appStore.showCutOperator" />
			</Transition>
			<Transition name="paraboxanim">
				<CutOperator v-if="appStore.showCutOperator !== undefined" />
			</Transition>
		</div>
		<DragFilesOverlay />
	</div>
</template>

<style scoped lang="less">
	.mainarea {
		position: relative;
		width: 100%;
		// height: 24px;
		background-color: hwb(var(--bg92));
		flex: 1 1 auto;
		overflow: hidden;
		.upperArea {
			.loginArea, .disconnectArea {
				overflow: hidden;
				@keyframes bganimation {
					from {
						opacity: 0;
					}
					to {
						opacity: 1;
					}
				}
				.bganimate-enter-active {
					animation: bganimation ease-out 0.3s;
				}
				.bganimate-leave-active {
					animation: bganimation ease-out 0.2s reverse;
				}
				.boxanimate-enter-from {
					transform: scale(1.1);
					opacity: 0;
				}
				.boxanimate-enter-active {
					transition: transform cubic-bezier(0.33, 1, 1, 1) 0.3s, opacity linear 0.2s;
				}
				.boxanimate-enter-to, .boxanimate-leave-from {
					transform: scale(1);
					opacity: 1;
				}
				.boxanimate-leave-active {
					transition: all linear 0.2s;
				}
				.boxanimate-leave-to {
					transform: scale(0.9);
					opacity: 0;
				}			
			}
			.loginArea {
				height: 100%;
				.loginBackground {
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					will-change: opacity;
				}
				.loginBox {
					display: flex;
					flex-direction: column;
					justify-content: center;
					align-items: center;
					height: 100%;
					.box {
						&>div {
							display: flex;
							justify-content: center;
							align-items: center;
						}
						padding-right: 20px;
						border-radius: 8px;
						background-color: hwb(var(--bg97) / 0.8);
						box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
									0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
									0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
									0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
						will-change: transform, opacity;
						transition: transform cubic-bezier(0.33, 1, 1, 1) 0.3s, opacity linear 0.2s;
					}
					.buttonBox {
						margin: 24px 24px;
					}
				}
			}
			.disconnectArea {
				position: absolute;
				left: 0;
				top: 0;
				right: 0;
				bottom: 0;
				.disconnectBackground {
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					backdrop-filter: blur(2px);
					background-color: hwb(var(--bg95) / 0.6);
				}
				.disconnectBox {
					position: relative;
					display: flex;
					flex-direction: column;
					justify-content: center;
					align-items: center;
					height: 100%;
					.box {
						display: flex;
						flex-direction: column;
						justify-content: center;
						align-items: center;
						width: 400px;
						border-radius: 8px;
						background-color: hwb(var(--bg97) / 0.8);
						box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
									0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
									0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
									0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
						will-change: transform, opacity;
						transition: transform cubic-bezier(0.33, 1, 1, 1) 0.3s, opacity linear 0.2s;
						@keyframes rotation {
							from {
								transform: rotate(0deg);
							}
							to {
								transform: rotate(360deg);
							}
						}
						.svg {
							height: 160px;
							text-align: center;
							svg {
								width: auto;
								height: 100%;
								color: #66666699;
								animation: rotation 1s steps(8) infinite;
							}
						}
					}
					.buttonBox {
						margin: 24px 24px;
					}
				}
			}
			// .ListArea
		}
		// .ParaBox
		.paraboxanim-enter-from, .paraboxanim-leave-to {
			transform: translateY(30px);
			opacity: 0;
		}
		.paraboxanim-enter-active {
			transition: opacity 0.3s, transform 0.6s cubic-bezier(0.2, 1.3, 0.3, 1);
			// transition: transform 0.5s cubic-bezier(0.1, 1.2, 0.5, 1), opacity 0.2s ease-out;
		}
		.paraboxanim-leave-active {
			transition: opacity 0.3s, transform 0.3s cubic-bezier(0.5, 0, 1, 1);
		}
		.lowerArea {
			position: absolute;
			bottom: 0;
			width: 100%;
			min-height: 28px;
			// overflow: hidden;
			&>div {
				position: absolute;
				top: 0;
				box-shadow: 0px 0px 8px hwb(0 0% 100% / 0.05), // 远距离上阴影
							0px 1px 1px hwb(0 100% 0% / 0.25) inset; // 内部上阴影
			}
		}
	}

</style>