import Http from 'http';
import Koa from 'koa';
import koaStatic from 'koa-static';
import koaMount from 'koa-mount';
import fs from 'fs';
import fsPromise from 'fs/promises';
import path from 'path';
import { log } from './utils';

let server: Http.Server | null;
let koa: Koa | null;

const webuiServer = {
    async start(port: number): Promise<void> {
        let uploadDir = '';
		// 工作路径/webUI，生产环境 exe 路径/webUI（开发环境会指向用于执行的 nodejs），Windows/Linux/macOS 文件夹模式环境 resources，开发环境路径（通过 vscode 指向 app 文件夹）（开发环境为真实路径，打包后 Windows C:\snapshot\FFBox\app，Linux/macOS /snapshot/FFBox/app）
        for (const p of [path.join(process.cwd(), 'webUI'), path.join(process.execPath, '../webUI'), path.join(process.execPath, '../resources/app/app/renderer'), path.join(path.dirname(__dirname), 'renderer')]) {
            // console.log('测试路径', path.join(p, 'index.html'));
            await fsPromise.access(path.join(p, 'index.html'), fs.constants.R_OK).then((result) => {
                uploadDir = p;
            }).catch(() => {});
        }

		if (uploadDir) {
			log.info('【webUI】静态资源路径', uploadDir)
		} else {
			log.error('【webUI】无法找到 webUI 文件夹，请确保工作路径/程序路径下有 webUI/index.html 文件')
			return;
		}

        koa = new Koa();

		// 初始化响应头和响应码
		koa.use(async (ctx, next) => {
			// console.log('收到请求。', ctx.request.url);
			ctx.response.set('Access-Control-Allow-Origin', '*');
			ctx.response.set('Access-Control-Allow-Headers', 'Content-Type');
			ctx.response.set('Access-Control-Allow-Methods', 'GET');
			try {
				await next();
			} catch (err) {
				console.log(err);
			}
		});

		// 下载资源响应
		const staticServer = koaStatic(uploadDir);
		koa.use(koaMount('/', staticServer));

		server = Http.createServer(koa.callback());
		server.listen(port);
        server.on('error', (err: any) => {
			log.error('【webUI】发生错误', err)
		});
        server.on('listening', () => {
			log.info(`【webUI】成功在 ${port} 端口部署静态资源服务`)
		});
	},

    stop() {
        server.close();
    },

    getStatus() {
        return server.listening;
    },
};

export default webuiServer;
