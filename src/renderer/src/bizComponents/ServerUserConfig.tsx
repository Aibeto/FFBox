import { defineComponent, onMounted, ref } from "vue";
import CryptoJS from 'crypto-js';
import { randomString } from "@common/utils";
import { Permission, UserConfig } from "@common/types";
import type { Server } from "@renderer/types";
import { useAppStore } from "@renderer/stores/appStore";
import { useTooltip } from "@renderer/common/tooltipUtil";
import Button, { ButtonType } from '@renderer/components/Button/Button';
import InputAutoSize from '@renderer/components/InputAutoSize/InputAutoSize.vue';
import Msgbox from "@renderer/components/Msgbox/Msgbox";
import Popup from "@renderer/components/Popup/Popup";
import Checkbox from "@renderer/components/Checkbox/Checkbox.vue";
import css from './ServerUserConfig.module.less';

const permissionLabels: Record<Permission, string> = {
	[Permission.UserManagement]: '用户管理',
	[Permission.ServerSettings]: '转码服务设置',
	[Permission.CacheManagement]: '缓存管理',
	[Permission.FileSystem]: '远程文件系统',
};

export function showServerUserConfig(serverId: string) {
	let compFuncs: any;
	const appStore = useAppStore();
	(document.activeElement as any)?.blur();
	Msgbox({
		container: document.body,
		title: '用户配置',
		content: <Comp exportFunctions={(fs) => compFuncs = fs} serverId={serverId} />,
		buttons: [
			...(useAppStore().servers.find((s) => s.data.id === serverId)?.entity.permissions.includes(Permission.UserManagement) ? [
				{ text: '保存', role: 'confirm' as const, type: ButtonType.Primary, callback: async () => {
					const result = await compFuncs.exportData();
					const { users } = result;
					const server = appStore.servers.find((server) => server.data.id === serverId) as Server;
					try {
						await server.entity.setUsers(users);
						Popup({ message: '用户配置已保存。若修改了自身权限，需重新登录才能生效。' });
					} catch (e: any) {
						Popup({ message: `保存失败：${e.message || '权限不足或网络错误'}`, level: 'warning' as any });
					}
				} },
			] : []),
			{ text: '取消', role: 'cancel' },
		]
	});
}

interface P {
	serverId: string;
	exportFunctions: (fs: any) => void;
}
const Comp = defineComponent((props: P) => {
	const usersValue = ref<UserConfig[]>([]);
	const editingLineIndex = ref<number>(NaN);
	const editingAttr = ref<'username' | 'passkey' | undefined>();

	const exports = {
		exportData: async () => {
			return {
				users: JSON.parse(JSON.stringify(usersValue.value)),
			};
		}
	};

	const handleEdit = (lineIndex: number, attr: 'username' | 'passkey') => {
		const user = usersValue.value[lineIndex];
		if (attr === 'username') {
			if (!user.username) {
				// 管理员空账号
				return;
			}
			editingLineIndex.value = lineIndex;
			editingAttr.value = 'username';
		} else if (attr === 'passkey') {
			editingLineIndex.value = lineIndex;
			editingAttr.value = 'passkey';
		}
	};

	const handleBlur = (lineIndex: number, attr: 'username' | 'passkey', value: string) => {
		const user = usersValue.value[lineIndex];
		if (attr === 'username') {
			user.username = value || user.username;
		} else if (attr === 'passkey') {
			user.passkey = value.length ? CryptoJS.SHA256(value).toString() : '';
		}
		editingLineIndex.value = NaN;
		editingAttr.value = undefined;
	};

	const handleDelete = (lineIndex: number) => {
		usersValue.value.splice(lineIndex, 1);
	};

	const handleAddUser = () => {
		usersValue.value.push({
			username: randomString(6),
			passkey: '',
			permissions: [],	// 新用户默认无权限
		});
	};

	const handleTogglePermission = (lineIndex: number, permission: Permission) => {
		const user = usersValue.value[lineIndex];
		// if (!user.username) {
		// 	// 管理员空账号不允许修改权限
		// 	return;
		// }
		const idx = user.permissions.indexOf(permission);
		if (idx >= 0) {
			user.permissions.splice(idx, 1);
		} else {
			user.permissions.push(permission);
		}
	};

	onMounted(() => {
		props.exportFunctions(exports);
		(async () => {
			const server = useAppStore().servers.find((server) => server.data.id === props.serverId) as Server;
			const currentUsers: UserConfig[] = await server.entity.getUsers();
			usersValue.value = currentUsers;
		})();
	});

	return () => (
		<div class={css.serverUserConfig}>
			<table>
				<colgroup>
					<col style="width: 120px" />
					<col style="width: 70px" />
					<col style="width: auto" />
					<col style="width: 60px" />
				</colgroup>
				<thead>
					<tr>
						<th>用户名</th>
						<th>密码</th>
						<th>权限</th>
						<th>操作</th>
					</tr>
				</thead>
				<tbody>
					{usersValue.value.map((user, lineIndex) => (
						<tr>
							{editingLineIndex.value === lineIndex && editingAttr.value === 'username' ? (
								<td>
									<InputAutoSize
										value={user.username}
										onBlur={(value: string) => handleBlur(lineIndex, 'username', value)}
									/>
								</td>
							) : (
								user.username ? (
									<td class={css.editable} onClick={() => handleEdit(lineIndex, 'username')}>{user.username}</td>
								) : (
									<td><font {...useTooltip('仅在本地模式下可以空账号登录。空账号即为管理员', 't')} style={{ opacity: 0.5 }}>（管理员）</font></td>
								)
							)}
							{editingLineIndex.value === lineIndex && editingAttr.value === 'passkey' ? (
								<td>
									<InputAutoSize
										value=""
										onBlur={(value: string) => handleBlur(lineIndex, 'passkey', value)}
									/>
								</td>
							) : (
								<td onClick={() => handleEdit(lineIndex, 'passkey')}>
									{user.passkey ? <a class={css.editable}>更改</a> : <a class={css.editable}>　+　</a>}
								</td>
							)}
							<td class={css.permissionCell}>
									{Object.values(Permission).map((perm) => (
										<Button size="small" type={ButtonType.NoBg} disabled={user.username === ''} onClick={() => handleTogglePermission(lineIndex, perm)}>
											<Checkbox checked={user.permissions.includes(perm)} />
											{permissionLabels[perm]}
										</Button>
									))}
							</td>
							<td>
								{user.username ? <a class={css.editable} onClick={() => handleDelete(lineIndex)}>删除</a> : ''}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<Button onClick={() => handleAddUser()}>添加用户</Button>
		</div>
	);
}, { props: ['serverId', 'exportFunctions'] });
