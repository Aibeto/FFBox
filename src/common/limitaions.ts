export function getLimitaion(type: 'maxMediaDuration' | 'maxWorkingDuration' | 'maxUploadSizeGB' | 'maxTaskListCount' | 'maxThreads' | 'maxFilterNodeCount', functionLevel: number): number {
	switch (type) {
		case 'maxMediaDuration':
			return functionLevel < 50 ? 671 : undefined;
		case 'maxWorkingDuration':
			return functionLevel < 45 ? 671 : 40271;
		case 'maxUploadSizeGB':
			return functionLevel < 15 ? 1 : functionLevel < 25 ? 4 : functionLevel < 45 ? 10 : functionLevel < 65 ? 32 : 1024;
		case 'maxTaskListCount':
			return functionLevel < 20 ? 20 : functionLevel < 35 ? 99 : functionLevel < 50 ? 256 : functionLevel < 65 ? 66666 : functionLevel < 70 ? 10000000 : 11111111;
		case 'maxThreads':
			return functionLevel < 20 ? 4 : functionLevel < 30 ? 6 : functionLevel < 40 ? 9 : functionLevel < 70 ? 99 : 256;
		case 'maxFilterNodeCount':
			return functionLevel < 20 ? 20 : functionLevel < 40 ? 66 : functionLevel < 60 ? 99 : 999;
		default:
			break;
	}
}
