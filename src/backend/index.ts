import { getSingleArgvValue } from '@common/utils';
import { FFBoxService } from './FFBoxService';
import { version } from '@common/constants';
import { log } from './utils';
import { NotificationLevel } from '@common/types';
import webuiServer from './webuiServer';

let service: FFBoxService;
const helpText = `
Options:
  -?, -h, --help        显示 FFBoxService 帮助文档
  --port [number]       指定监听端口
  --webuiPort [number]  同时启动一个静态资源服务器以使用 webUI。请确保工作路径/程序路径下有 webUI/index.html 文件
  --loglevel [0|3|5|6]  信息显示级别（无|错误|事件|调试）
`;

process.on('uncaughtException', (err) => {
	log.error('发生未捕获异常，以下为错误信息');
	console.error(err);
	if (service) {
		service.setNotification(-1, '服务器发生未捕获异常。如果您发现了该异常的复现规律，欢迎向 FFBox 作者报告 issue🙇', NotificationLevel.error);
	}
});

console.log(`FFBoxService 版本 ${version} - FFBox 服务端程序`);
console.log(`\x1b[2m如需帮助，请使用 --help 参数\x1b[0m`);

if (['-h', '-?', '--help'].some((t) => getSingleArgvValue(t))) {
	console.log(helpText);
} else {
	service = new FFBoxService();
	service.on('serverError', () => {
		process.exit();
	});
	service.on('serverClose', () => {
		process.exit();
	});

	const webuiPort = getSingleArgvValue('--webuiPort');
	if (webuiPort) {
		webuiServer.start(+webuiPort);
	}
}
