import localConfig from '@common/localConfig';
import { UserConfig, Permission } from '@common/types';

export class UserManager {
	/**
	 * 读取用户列表
	 */
	async getUsers(): Promise<UserConfig[]> {
		const users = await localConfig.get('service.users') as UserConfig[] | undefined;
		const allPermissions = Object.values(Permission);
		if (!users) {
			return [{ username: '', passkey: '', permissions: allPermissions }];
		}
		return users.map((user) => ({
			...user,
			permissions: user.permissions ?? allPermissions,
		}));
	}

	/**
	 * 写入用户列表
	 */
	async setUsers(users: UserConfig[]): Promise<void> {
		await localConfig.set('service.users', users);
	}

	/**
	 * 获取用户的权限列表
	 */
	async getUserPermissions(username: string): Promise<Permission[] | undefined> {
		const users = await this.getUsers();
		const user = users.find((u) => u.username === username);
		if (!user) return undefined;
		return user.permissions;
	}

	/**
	 * 检查某用户是否拥有某权限
	 */
	async hasPermission(username: string, permission: Permission): Promise<boolean> {
		const permissions = await this.getUserPermissions(username);
		if (!permissions) return false;
		return permissions.includes(permission);
	}
}