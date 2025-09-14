import { useAppStore } from './appStore';

export function getLimitaion(type: 'maxMediaDuration' | 'maxWorkingDuration' | 'maxUploadSizeGB' | 'maxTaskListCount' | 'maxThreads' | 'maxFilterNodeCount', functionLevel?: number): number {
	const appStore = useAppStore();
	const n = functionLevel !== undefined ? functionLevel : appStore.functionLevel;
	switch (type) {
		case 'maxMediaDuration': case 'maxWorkingDuration':
			return n < 50 ? 671 : undefined;
		case 'maxUploadSizeGB':
			return n < 15 ? 1 : n < 45 ? 4 : n < 55 ? 10 : undefined;
		case 'maxTaskListCount':
			return n < 20 ? 20 : n < 40 ? 66 : n < 60 ? 99 : undefined;
		case 'maxThreads':
			return n < 20 ? 4 : n < 35 ? 6 : n < 55 ? 9 : n < 70 ? 99 : undefined;
		case 'maxFilterNodeCount':
			return n < 20 ? 20 : n < 40 ? 66 : n < 60 ? 99 : undefined;
		default:
			break;
	}
}
