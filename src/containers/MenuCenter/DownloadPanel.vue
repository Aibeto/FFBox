<script setup lang="ts">
import { h } from 'vue';
import { useAppStore } from '../../stores/appStore';
import Button, { ButtonType } from '../../components/Button/Button';
import Popup from '../../components/Popup/Popup';
import Msgbox from '../../components/Msgbox/Msgbox';
import IconNodejs from '../../assets/menuCenter/downloadPanel/nodejs.svg?component';
import IconMsi from '../../assets/menuCenter/downloadPanel/msi.svg?component';
import IconApp from '../../assets/menuCenter/downloadPanel/app.svg?component';
import IconWeb from '../../assets/menuCenter/downloadPanel/web.svg?component';
import IconZip from '../../assets/menuCenter/downloadPanel/zip.svg?component';
import IconPointOut from '../../assets/warnings/pointOut.svg?component';

const appStore = useAppStore();

const handleDownloadClick = (os: 'Windows' | 'MacOS' | 'Linux' | 'web', selection: 0 | 1 | 2) => {
	if (!appStore.termsAgreed) {
		Popup({
			message: '请先同意条款后再来下载～',
		});
		appStore.selectedPanelIndex = 3;
		return;
	}
	let url;
	switch (os) {
		case 'Windows':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/Windows_x86-64_FFBox_4.4.exe',
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/Windows_x86-64_FFBoxService+webUI_4.4.zip',
				'./directDownload/ffmpegOnekey_Windows.ps1'
			][selection];
			if (selection === 2) {
				Msgbox({
					image: h(IconPointOut),
					title: '使用说明',
					content: h('div', { style: `text-align: center` }, ['一般情况下，Windows 会对从互联网上下载的 Powershell 脚本在运行前进行询问，同意后即可运行', h('br'), '如果您的 Windows 安全设置较高，则会提示“此系统上禁止运行脚本”。您需要使用管理员身份执行 Set-ExecutionPolicy RemoteSigned 后才可运行该脚本']),
					buttons: [
						{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => {
							const a = document.createElement('a');
							a.href = url;
							a.download = 'ffmpegOnekey_Windows.ps1';
							document.body.appendChild(a);
							a.click();
							document.body.removeChild(a);
						} },
					]
				});
			} else {
				window.open(url, '__blank');
			}
			break;
		case 'MacOS':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/macOS_ARM64_FFBox_4.4.dmg',
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/macOS_ARM64_FFBoxService+webUI_4.4.zip',
			][selection];
			Msgbox({
				image: h(IconPointOut),
				title: 'macOS 使用须知',
				content: h('div', { style: `text-align: center` }, [
					'由于 macOS 应用的签名与公证要求 Apple 开发者账号，而 Apple 开发者账号要求启用账户的双重认证', h('br'),
					'FFBox 开发者并未同意此要求，故无法对 FFBox 进行签名与公证', h('br'),
					'这将会导致您在运行 FFBox 时提示“无法打开”或“已损坏”', h('br'),
					'建议参考', h('a', { href: 'https://zhuanlan.zhihu.com/p/135948430', target: '_blank' }, '此文' ), '指示进行白名单处理', h('br'),
					'另外，ffmpeg 官方下载站并未提供 ARM 架构的 ffmpeg 二进制文件', h('br'),
					'如果您在使用 ARM 架构的 macOS，您可在 ', h('a', { href: 'http://www.osxexperts.net/', target: '_blank' }, 'OSXExperts' ), ' 等网站上另行下载 ffmpeg',
				]),
				buttons: [
					{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open(url, '__blank') && true },
				]
			});
			break;
		case 'Linux':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/Linux_x86-64_FFBox_4.4.deb',
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/Linux_x86-64_FFBox_4.4.AppImage',
				'https://github.com/ttqftech/FFBox/releases/download/v4.4/Linux_x86-64_FFBoxService+webUI_4.4.zip',
			][selection];
			window.open(url, '__blank');
			break;
		case 'web':
			url = [
				'./online',
				'./FFBox_v4.4_web.zip',
			][selection];
			if (selection === 0) {
				Msgbox({
					image: h(IconPointOut),
					title: '您将要使用一个尚未完善的网页版～',
					content: h('div', { style: `text-align: center` }, ['4.4 版本尚未对网页运行进行针对性优化，因此网页版只能用于体验功能，可能无法正常使用', h('br'), '同时，建议自行部署以获得更佳体验～']),
					buttons: [
						{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open(url, '__blank') && true },
					]
				});
			} else {
				window.open(url, '__blank');
			}
			break;
		default:
			break;
	}
};

</script>

<template>
	<div class="downloadPanel">
		<h2>完整客户端<span>(含转码服务和网页版)</span></h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 0)"><IconMsi />安装包</Button>
			</div>
			<div class="os">
				<span>macOS (ARM64)</span>
				<Button size="large" @click="handleDownloadClick('MacOS', 0)"><IconApp />dmg 包</Button>
			</div>
			<div class="os">
				<span>Linux (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Linux', 0)"><IconMsi />deb 安装包</Button>
				<Button size="large" @click="handleDownloadClick('Linux', 1)"><IconApp />AppImage</Button>
			</div>
		</div>
		<h2>转码服务<span>(含网页版)</span></h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 1)"><IconZip />service + webUI</Button>
			</div>
			<div class="os">
				<span>macOS (ARM64)</span>
				<Button size="large" @click="handleDownloadClick('MacOS', 1)"><IconZip />service + webUI</Button>
			</div>
			<div class="os">
				<span>Linux (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Linux', 2)"><IconZip />service + webUI</Button>
			</div>
		</div>
		<h2>网页版</h2>
		<div class="oss">
			<div class="os">
				<Button size="large" @click="handleDownloadClick('web', 0)"><IconWeb />在线试用</Button>
			</div>
		</div>
		<h2>ffmpeg 一键安装脚本<span>(但从下载到运行脚本的操作不是一键的)</span></h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 2)"><img src="../../assets/menuCenter/downloadPanel/gyan.dev.png">gyan.dev<br/>release essentials</Button>
			</div>
		</div>
		<div style="height: 32px;"></div>
	</div>
</template>

<style scoped lang="less">
	.downloadPanel {
		padding: 0 5%;
		font-size: 14px;
		// overflow: auto;
		// font-family: "苹方 中等", "PingFang SC", 苹方, 微软雅黑, "Segoe UI", Consolas, Avenir, Arial, Helvetica, sans-serif, 黑体;
		font-weight: 500;
		text-align: left;
		p {
			margin-bottom: 4px;
		}
		h2>span {
			font-size: 0.5em;
			opacity: 0.5;
			margin-left: 1em;
		}
		.oss {
			display: flex;
			flex-wrap: wrap;
			gap: 24px;
			.os {
				width: 190px;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 16px;
				padding: 24px;
				border-radius: 12px;
				// border: 1.5px solid hwb(var(--highlight));
				background-color: hwb(var(--hoverLightBg) / 0.15);
				box-shadow: 0 4px 12px hwb(var(--opposite) / 0.05),	// 外发光
							0 0 1px 1px hwb(var(--opposite) / 0.1) inset;	// 内边缘
				span {
					font-size: 12px;
					opacity: 0.5;
				}
				button {
					letter-spacing: 0px;
					margin: 0;
					&>svg, &>img {
						width: 20px;
						height: 20px;
						vertical-align: -4px;
						margin-right: 6px;
					}
				}
			}
		}
	}
</style>