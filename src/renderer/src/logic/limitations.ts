import { useAppStore } from '../stores/appStore';
import { getLimitaion as getLimitaionCommon } from '@common/limitaions';

export function getLimitation(type: 'maxMediaDuration' | 'maxWorkingDuration' | 'maxUploadSizeGB' | 'maxTaskListCount' | 'maxThreads' | 'maxFilterNodeCount', functionLevel?: number): number {
	const appStore = useAppStore();
	const n = functionLevel !== undefined ? functionLevel : appStore.functionLevel;
	return getLimitaionCommon(type, n)!;
}
