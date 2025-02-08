<script setup lang="ts">
import { computed, onMounted, ref, useCssModule } from 'vue';
import CryptoJS from 'crypto-js';
import { NotificationLevel } from '@common/types';
import { ServiceBridgeStatus } from "@renderer/bridges/serviceBridge";
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';
import Button, { ButtonType } from '@renderer/components/Button/Button';
import IconGithub from '@renderer/assets/menuCenter/sponsorCenter/github.svg?component';
import IconGitee from '@renderer/assets/menuCenter/sponsorCenter/gitee.svg?component';
import IconKoFi from '@renderer/assets/menuCenter/sponsorCenter/ko-fi.svg?component';
import IconAfdian from '@renderer/assets/menuCenter/sponsorCenter/afdian.png';
import ImageAlipay from '@renderer/assets/menuCenter/sponsorCenter/alipay.png';
import ImageWechatpay from '@renderer/assets/menuCenter/sponsorCenter/wechatpay.svg?url';
import ImageQQpay from '@renderer/assets/menuCenter/sponsorCenter/qqpay.png';
import Popup from '@renderer/components/Popup/Popup';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import Tooltip from '@renderer/components/Tooltip/Tooltip';

const appStore = useAppStore();
const style = useCssModule();

const qr_alipayredenvelop = ref<HTMLCanvasElement>();
const qr_alipay = ref<HTMLCanvasElement>();
const qr_wechatpay = ref<HTMLCanvasElement>();
const qr_qqpay = ref<HTMLCanvasElement>();
const activateCode = ref('');
const envelopPressed = ref(false);
const envelopNum = ref(-2);

const envelopStyle = computed(() => {
	if (envelopPressed.value) {
		return {
			transform: 'scale(0.95)',
		}
	}
});

const jumpToGithub = () => nodeBridge.jumpToUrl('https://github.com/ttqftech/FFBox');
const jumpToGitee = () => nodeBridge.jumpToUrl('https://gitee.com/ttqf/FFBox');
const jumpToKoFi = () => nodeBridge.jumpToUrl('https://ko-fi.com/N4N26F2WR');
const jumpToAfdian = () => nodeBridge.jumpToUrl('https://afdian.com/a/ttqftech');
const jumpToAutoSponsorProxy = () => nodeBridge.jumpToUrl('http://ffbox.ttqf.tech/AutoSponsorProxy.html');

// 传入 HexEditor 从第一个像素开始的内容，需要 4 位灰度色 bmp，反向行序
// 传入二维码大小
function getQR (hexString: string, size: number, linesize: number): string[][] {
	let QRstring = hexString.replace(/ /g, '');
	let QRcode: string[][] = [];
	for (let i = 0; i < size; i++) {
		QRcode[i] = [];
		for (let j = 0; j < size; j++) {
			let pos = i * linesize + j;
			QRcode[i][j] = QRstring[pos];
		}
	}
	return QRcode;
}

function alipayRedEnvelopQR() {
	return getQR(`00 00 00 0F 00 FF F0 FF 00 F0 00 FF 0F 00 00 00 00 00 0F FF 0F FF FF 0F FF 0F 00 0F F0 F0 F0 0F 0F 0F FF FF 00 00 0F 00 0F 00 0F 0F 0F F0 0F 00 FF 00 00 F0 0F 0F 00 0F 00 00 0F 00 0F 00 0F 0F FF F0 00 F0 F0 F0 F0 FF FF 0F 00 0F 00 00 0F 00 0F 00 0F 0F 00 FF FF 00 F0 0F F0 FF 0F 0F 00 0F 00 00 0F FF 0F FF FF 0F FF F0 FF 00 FF 0F FF FF FF 0F FF FF 00 00 00 00 00 00 00 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 00 00 00 00 00 FF FF FF FF FF FF 00 00 F0 00 0F FF FF FF 0F FF FF FF F0 00 FF FF FF FF F0 0F F0 FF 0F 00 00 00 0F 0F FF 0F 0F 0F 00 00 F0 00 F0 00 F0 FF FF 0F 00 00 F0 FF 00 0F F0 FF 0F 00 F0 00 00 0F 00 0F 00 0F 0F 0F 0F 00 FF 00 FF 0F 00 00 F0 0F F0 00 00 0F 00 0F 0F F0 0F 00 FF F0 00 F0 F0 FF 0F 0F 00 0F F0 00 F0 00 F0 00 FF 00 0F 0F F5 55 55 55 F0 FF FF 00 00 F0 00 00 F0 00 F0 00 00 FF 0F 0F 64 44 44 44 4F F0 FF 00 00 FF 00 00 F0 00 F0 00 00 00 FF 0F 54 44 F6 44 40 0F FF F0 0F F0 F0 00 FF 00 FF 00 FF FF F0 FF 5F 6F FF 4F 3F 00 0F 00 F0 FF F0 00 F0 00 F0 00 00 00 F0 F0 64 4E 4C 44 4F F0 FF FF 0F 0F 00 00 0F FF 0F FF FF FF FF 0F 64 4F 5F 44 4F 00 00 0F FF 0F F0 00 F0 FF F0 FF 0F 00 0F 00 64 44 44 44 40 00 F0 00 0F F0 00 00 F0 FF F0 FF F0 FF F0 F0 64 44 44 44 4F 0F 00 FF 0F 0F F0 00 FF 0F FF 0F F0 00 0F F0 F4 44 44 44 FF 0F 0F F0 00 F0 F0 00 00 00 00 00 F0 FF FF 0F 1F FF 11 FF 1F FF F0 00 0F 00 F0 00 0F 0F 0F 0F FF 0F 0F 00 00 0F 0F 00 00 00 0F FF FF F0 F0 00 0F 0F 0F 0F 00 FF F0 00 FF 0F FF FF 0F 00 FF F0 00 0F 00 00 00 FF 00 FF 0F 0F 00 FF 00 F0 FF 0F 00 FF 00 00 00 FF 00 00 FF FF FF FF FF FF 0F 00 FF 0F F0 F0 0F F0 0F FF 00 F0 00 00 00 00 00 00 00 0F F0 0F 00 F0 FF F0 00 F0 0F 0F 0F FF F0 00 0F FF 0F FF FF 0F 0F FF F0 FF 0F FF FF FF 0F FF 00 0F F0 00 0F 00 0F 00 0F 0F FF 00 00 F0 FF FF 00 FF 00 00 0F F0 F0 00 0F 00 0F 00 0F 0F FF 0F F0 FF FF 00 00 0F FF F0 0F 00 F0 00 0F 00 0F 00 0F 0F FF 00 00 FF FF F0 FF 00 0F FF 0F 00 00 00 0F FF 0F FF FF 0F F0 F0 0F FF F0 F0 FF FF F0 00 FF 0F F0 00 00 00 00 00 00 0F F0 FF F0 FF F0 00 FF 00 00 F0 F0 00 F0 00 00 00 00 00`, 33, 33 + 7);
}
function alipayQR () {
	return getQR(`00 00 00 0F 00 F0 FF 0F FF 00 0F FF F0 FF 0F 00 0F 00 00 00 00 00 0F FF 0F FF FF 0F 0F FF 0F F0 00 F0 0F 00 F0 00 0F 0F FF 0F FF FF 00 00 0F 00 0F 00 0F 0F 0F 0F 0F 0F F0 F0 0F 00 00 F0 0F FF 0F 0F 00 0F 00 00 0F 00 0F 00 0F 0F F0 0F F0 F0 F0 0F FF 0F 0F 00 0F 0F FF 0F 00 0F 00 00 0F 00 0F 00 0F 0F FF 0F 00 F0 FF 0F 0F 0F F0 FF FF F0 0F 0F 00 0F 00 00 0F FF 0F FF FF 0F 0F F0 F0 FF FF F0 0F 0F 00 F0 FF 0F FF 0F FF FF 00 00 00 00 00 00 00 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 00 00 00 00 00 FF FF FF FF FF FF 00 FF F0 F0 0F 0F FF F0 FF 00 FF F0 0F FF FF FF F0 00 FF 00 FF 00 0F 0F 00 00 00 FF F0 0F FF FF 00 00 F0 FF 00 00 FF 00 00 00 0F FF 0F FF F0 FF 00 0F F0 FF 0F 00 FF 0F 0F 0F 00 F0 0F 00 0F 00 F0 00 00 FF 00 FF FF 00 F0 0F FF 00 00 00 FF 0F F0 00 F0 0F 00 F0 FF F0 F0 00 F0 FF F0 FF 00 F0 F0 F0 00 FF 0F FF F0 00 F0 00 0F F0 0F F0 00 F0 F0 00 F0 FF F0 FF 00 0F 00 0F 0F 00 0F F0 0F FF F0 FF 00 F0 F0 FF F0 00 00 00 FF F0 FF F0 00 FF FF 00 F0 00 F0 0F F0 FF FF F0 F0 FF 0F F0 0F FF 00 00 F0 00 F0 00 FF 00 FF 0F F0 F0 F0 FF 0F F0 0F F0 0F 00 F0 F0 F0 FF F0 00 0F 0F 0F 0F 0F F0 00 FF 00 F0 0F 0F 0F F0 F0 00 FF F0 0F 0F 00 FF F0 00 F0 00 F0 00 F0 00 FF F0 0F FF 00 00 FF 0F 0F 00 F0 F0 F0 F0 F0 00 00 00 00 FF 00 FF FF FF FF FF FF 0F 0F FF DF FF FF 0F 00 00 0F 00 00 F0 00 00 FF F0 FF F0 F0 0F FF 0F 00 F0 FF B4 07 FF 0F F0 F0 FF 0F 0F 00 FF F0 00 F0 00 F0 00 00 F0 0F 0F 0F FF FF 8D D5 F8 FF F0 F0 0F 0F 0F 00 F0 F0 00 F0 00 F0 00 FF 00 FF F0 F0 0F 0E 29 B3 9E FF F0 0F FF FF FF 00 00 F0 00 F0 F0 F0 F0 00 FF F0 F0 F0 FF 0F CD 4F FB 00 0F FF 00 00 00 F0 00 00 00 00 FF 00 FF 0F 00 F0 00 F0 F0 FF F2 DF 5F FF 00 00 0F 00 FF FF 0F F0 00 F0 00 F0 00 0F FF 0F 0F F0 FF 0F FF 7B FF F0 00 0F 00 0F 00 F0 0F F0 00 FF F0 FF F0 FF 00 00 0F 00 00 00 00 F0 FF F0 00 F0 00 FF F0 FF FF 00 00 F0 F0 F0 F0 0F FF FF 00 FF 00 F0 00 0F F0 0F 0F 00 00 F0 00 00 FF 00 00 0F 0F 0F 0F FF 0F 0F FF FF 0F 0F F0 F0 00 00 F0 0F 0F 0F 00 FF F0 F0 00 F0 0F F0 0F 00 F0 00 0F FF 00 0F 00 00 F0 FF F0 FF 00 00 00 00 FF 00 00 FF F0 FF F0 FF 00 00 FF 00 F0 0F F0 00 0F 0F 00 F0 00 0F 0F F0 00 F0 00 0F 0F 0F 0F 0F FF FF 0F FF 00 FF F0 FF F0 FF 00 00 FF F0 F0 0F 0F 00 00 0F 00 0F 00 00 00 F0 00 FF 0F 00 FF 0F FF FF 0F FF 0F 00 0F F0 F0 F0 00 0F F0 0F F0 00 FF FF F0 FF 00 FF 0F 0F 0F 0F FF 0F 0F F0 00 FF F0 F0 00 0F FF 0F FF FF 00 F0 00 0F 0F 00 FF F0 0F 0F FF 00 FF 00 00 0F 0F F0 00 FF FF FF FF FF FF 00 00 F0 00 0F FF FF F0 FF FF FF F0 0F FF 00 FF 00 00 00 00 00 00 00 0F FF FF FF 00 F0 FF F0 FF 0F F0 0F 00 0F 0F 0F 0F FF FF 0F FF 0F FF FF 0F F0 0F 00 0F FF F0 FF 0F F0 00 0F F0 0F FF 00 FF F0 00 0F 00 0F 00 0F 0F 00 0F 0F 00 FF 0F 00 0F 00 F0 0F 0F 00 00 00 00 00 00 0F 00 0F 00 0F 0F 00 FF 0F 0F 0F F0 00 0F F0 0F F0 FF 00 F0 FF F0 00 00 0F 00 0F 00 0F 0F 0F FF 0F FF 00 F0 00 0F FF 00 F0 F0 F0 00 00 F0 F0 00 0F FF 0F FF FF 0F F0 00 00 FF 0F F0 F0 0F 0F F0 FF 0F 0F 0F 0F F0 F0 00 00 00 00 00 00 0F FF F0 FF F0 0F F0 F0 00 F0 F0 F0 FF FF F0 00 FF F5 89 F7 00 00 00`, 41, 41 + 7);
}
function wechatpayQR () {
	return getQR(`00 00 00 0F FF F0 0F F0 FF 00 00 FF 0F F0 0F 00 00 00 07 00 0F FF FF 0F F0 F0 0F FF FF 00 F0 00 00 FF FF 0F FF FF 00 00 0F 00 0F 0F F0 FF 00 00 FF FF FF F0 FF FF FF 0F 00 0F 00 00 0F 00 0F 0F F0 FF FF F0 F0 00 00 0F 0F F0 0F 0F 00 0F 00 00 0F 00 0F 0F 00 F0 F0 F0 00 F0 0F 00 FF F0 0F 0F 00 0F 00 00 0F FF FF 0F F0 00 0F 0F F0 00 0F 0F FF 00 0F 0F FF FF 00 00 00 00 00 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 00 00 00 00 00 FF FF FF FF 00 00 00 FF FF 00 0F FF 00 F0 FF FF FF FF F0 00 FF 00 FF 00 0F F0 FF 00 F0 0F F0 F0 F0 FF 00 0F 0F FF F0 00 00 FF F0 FF 00 00 0F 0F 0F F0 00 0F FF FF FF 0F FF F0 00 00 0F 00 F0 0F F0 F0 FF 0F 0F 0F F0 0F 00 FF FF F0 F0 FF 00 00 0F F0 FF FF 0F F0 F0 00 0F 00 F0 FF 00 F0 F0 0F FF FF F0 00 00 FF FF 0F F0 F0 FF 0F 0F 0F 0F 00 F0 00 0F 0F F0 00 00 00 0F F0 00 F0 F0 FF FF 00 FF 00 FF FF FF 0F F0 FF 0F F0 F0 00 F0 00 0F 00 00 00 F0 FF FF FF FF F0 FF 0F FF FF 0F FF F0 00 F0 FF 0F F0 0F 0F 00 FF FF FF FF F0 0F FF F0 F0 F0 00 F0 00 F0 FF 0F 0F FF FF F0 FF FF FF FF FF F0 FF 00 FF 0F 00 F0 00 F0 00 F0 FF F0 0F 00 FF F7 55 FF FF F0 FF 0F FF F0 0F F0 00 00 F0 F0 0F 0F 00 F0 FF FA B8 FF FF 00 F0 0F 00 F0 00 00 00 0F 0F F0 F0 0F F0 FF FF FF CF FF FF F0 FF 0F 00 00 00 00 00 00 F0 F0 0F FF 00 FF FF FF FF FF FF 00 FF FF F0 F0 0F 00 00 FF 0F FF FF 0F FF 0F FF FF FF FF EF 0F FF 0F 0F 00 FF F0 00 0F 00 FF 0F 0F F0 00 FF FF FF FC F8 F0 00 FF F0 F0 0F F0 00 0F FF F0 F0 0F 00 FF 0F F0 F0 FE DA 0F 00 0F FF FF F0 00 00 FF 00 00 0F 0F 00 F0 F0 0F FF 00 00 0F F0 0F F0 FF F0 00 00 FF 0F 0F F0 F0 0F F0 0F 00 F0 0F 00 FF 0F F0 F0 F0 F0 F0 00 F0 FF 00 0F 0F FF F0 FF FF F0 00 0F FF F0 FF F0 0F F0 F0 00 0F 0F F0 FF 0F 00 00 00 00 0F 00 0F 0F 00 00 F0 FF 0F 00 00 FF F0 F0 00 0F F0 0F F0 00 F0 F0 F0 00 0F 00 00 00 0F F0 00 FF FF FF FF 0F 0F F0 FF 00 FF 00 00 F0 FF 0F FF 00 0F 00 00 00 00 00 0F 0F F0 F0 FF F0 0F 0F 0F FF 00 0F 0F 0F 00 00 00 0F FF FF 0F F0 00 0F 0F FF F0 FF 0F 00 00 0F FF 00 F0 00 00 0F 00 0F 0F F0 0F 0F 0F 0F 0F F0 FF FF FF 00 00 00 F0 F0 00 0F 00 0F 0F 0F F0 0F 0F 0F F0 F0 F0 FF F0 FF F0 FF F0 00 00 0F 00 0F 0F 00 FF 00 FF 00 0F F0 F0 0F F0 F0 00 0F 00 FF F0 0F FF FF 0F FF FF 0F FF 00 F0 0F 00 FF FF 0F FF F0 00 00 00 00 00 00 0F F0 FF FF 00 F0 0F F0 FF 00 00 00 F0 FF F0 00 00 00 00`, 37, 37 + 3);
}
function qqpayQR () {
	return getQR(`00 00 00 0F F0 00 0F FF F0 FF FF F0 F0 F0 00 0F FF FF 0F 00 00 00 00 00 0F FF FF 0F 0F 00 00 0F F0 F0 F0 00 0F 0F 0F F0 0F F0 FF 0F FF FF 00 00 0F 00 0F 0F F0 F0 F0 FF FF 00 F0 FF F0 FF 00 00 00 F0 FF 0F 00 0F 08 08 0F 00 0F 0F 00 FF F0 FF 00 0F 00 00 FF 00 FF 0F FF F0 0F 0F 00 0F 08 08 0F 00 0F 0F F0 00 FF F0 FF F0 00 00 0F FF FF 00 FF 00 0F 0F 00 0F 00 00 0F FF FF 0F 0F 0F 0F FF 00 0F 0F FF 0F 0F F0 F0 FF FF FF 0F FF FF 08 08 00 00 00 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 0F 00 00 00 00 00 FF FF FF FF FF F0 F0 F0 FF F0 0F FF 0F 00 00 0F 00 F0 FF FF FF FF F8 08 00 00 0F 00 0F F0 FF F0 0F 0F 00 00 0F F0 F0 00 FF F0 F0 F0 F0 F0 F8 08 F0 FF 0F F0 00 0F 00 00 FF FF F0 F0 F0 FF F0 0F FF F0 00 FF FF F0 00 00 FF F0 F0 00 00 F0 0F FF F0 FF F0 FF 00 0F F0 F0 0F 0F FF 00 F0 00 F0 00 F0 00 00 F0 00 F0 00 00 0F 00 FF F0 00 F0 FF 00 00 F0 F0 F0 00 0F F0 00 0F 00 0F 0F 0F 00 00 F0 00 00 F0 00 00 FF F0 0F FF 00 00 F0 FF F0 F0 00 FF FF FF F0 00 F0 0F FF FF F0 FF FF F0 FF FF 00 0F F0 0F FF FF 00 F0 00 00 F0 FF 0F 00 00 0F FF F0 0F 0F F0 0F FF F0 F0 F0 0F 00 0F FF 00 F8 08 0F 00 00 FF 00 0F F0 00 F0 00 FF F0 00 F0 00 0F 00 FF FF 0F 00 00 F0 00 FF 0F 0F 0F FF 00 FF FF 00 00 00 F0 0F FF FF 00 FF FF F0 FF F0 F0 00 00 00 F0 F0 FF F0 FF FF 00 FF 00 F0 FF 00 F0 FF 00 F0 FF 00 F0 0F F0 08 08 00 F0 F0 0F 00 0F 0F FF F0 0F 0F F0 0F 0F FF FF F0 00 FF 0F 00 00 F8 08 0F FF 0F FF 00 F0 00 FF F0 0F FF F0 0F F0 00 00 00 00 FF FF F0 0F F8 08 00 F0 00 00 00 FF F0 F0 00 0F 00 00 0F 00 FF 0F FF F0 00 00 00 F0 F0 00 F0 FF 0F FF 00 0F 0F FF F0 FF 05 A6 00 FF FF 00 FF F0 0F FF 0F 0F F8 08 0F 00 0F 0F 00 0F 00 F0 0F 00 0B B9 0F FF 00 FF 00 00 0F 0F 00 F0 F0 00 0F F0 0F FF 0F 0F F0 FF FF FF 0F 5F 00 00 00 FF 0F 0F 0F FF 0F 00 F0 00 00 0F 00 00 0F FF 0F F0 FF 00 00 00 00 FF F0 F0 F0 0F 00 00 00 FF F0 00 00 0F 0F F0 F0 F0 F0 0F F0 F0 0F 00 0F FF 00 00 0F FF 00 0F FF 00 00 00 0F 0F F0 00 0F 0F F0 FF F0 0F 00 FF F0 0F 00 F0 F0 00 00 FF 00 00 F8 08 0F 00 FF FF FF F0 F0 FF FF 0F 00 00 0F FF 0F F0 0F F0 FF FF F0 0F F8 08 FF FF FF 00 F0 0F 00 F0 0F 00 0F FF 0F 00 FF 0F FF 0F FF F0 00 FF 00 00 00 F0 FF FF 00 00 00 F0 FF F0 F0 F0 0F F0 0F 00 FF FF 00 F0 FF F0 F8 08 F0 00 0F 00 0F F0 0F 0F FF FF 00 0F FF 0F 00 F0 00 0F F0 FF FF F0 F0 00 0F FF 0F FF F0 FF FF F0 FF 0F FF FF 00 00 0F 00 00 F0 FF 00 0F 0F F8 08 FF F0 00 0F 00 00 00 F0 0F 00 00 FF 00 0F F0 F0 FF 0F 00 F0 0F FF F8 08 00 0F 0F FF F0 0F 0F F0 FF F0 F0 00 00 FF 00 00 0F FF 0F FF F0 0F 08 08 FF FF 0F 00 00 00 0F FF F0 0F F0 F0 FF 00 F0 F0 00 00 00 FF F0 00 F8 08 F0 00 0F FF F0 0F 00 FF FF F0 00 00 00 F0 0F F0 0F 00 F0 FF 00 00 08 08 0F F0 0F 00 0F F0 FF FF 00 0F 00 00 00 FF F0 0F F0 0F 00 00 0F 00 F8 08 FF FF FF FF 0F F0 00 00 FF F0 0F FF 0F F0 0F 00 F0 FF 0F FF 00 F0 00 00 00 00 00 0F 0F 00 F0 FF F0 00 0F 0F 00 0F F0 F0 F0 00 0F 0F 00 FF F0 00 0F FF FF 0F F0 0F 00 FF 00 0F 0F FF 00 00 0F 0F 0F 0F 0F FF 0F 00 08 08 0F 00 0F 0F 0F 0F 0F FF 0F 0F 00 00 00 FF F0 0F FF 0F 00 00 0F F0 00 00 0F 00 0F 0F 0F 00 FF F0 F0 F0 F0 F0 0F F0 00 00 FF F0 F0 00 00 F0 F0 00 0F 00 0F 0F 0F FF F0 F0 FF 00 F0 00 F0 00 F0 F0 00 00 0F 0F FF 0F 00 00 0F FF FF 0F 00 F0 FF 00 00 0F 0F F0 FF 00 0F 00 0F F0 F0 FF 0F 0F F0 00 00 00 00 0F 0F 00 F0 FF 0F 00 F0 0F 00 F0 FF 00 F0 00 FF 0F 0F F0 F8 08 00 00`, 45, 45 + 3);
}

const paintQRcode2canvas = (canvas: HTMLCanvasElement, QRcode: string[][]) => {
	let width = 144 * window.devicePixelRatio;
	let height = 144 * window.devicePixelRatio;
	canvas.setAttribute('width', width + '');
	canvas.setAttribute('height', height + '');
	let ctx = canvas.getContext('2d')!;
	
	// 绘制背景色
	ctx.fillStyle = '#FF0000';
	ctx.strokeStyle = '#FF0000';
	ctx.fillRect(0, 0, width, height);

	// 绘制二维码
	let size = QRcode.length;
	let d = width / size;
	for (let i = 0; i < size; i++) {
		for (let j = 0; j < size; j++) {
			ctx.fillStyle = '#' + QRcode[i][j] + QRcode[i][j] + QRcode[i][j];
			ctx.fillRect(Math.floor(j * d), Math.floor(i * d), Math.floor((j+1)) * d - Math.floor(j * d), Math.floor((i+1) * d) - Math.floor(i * d));
		}
	}
};

const handleEnvelopMouseDown = (event: MouseEvent) => {
	envelopPressed.value = true;
	if (event.button === 2 && envelopNum.value < 0) {
		// 右键两次启动计数
		envelopNum.value += 1;
	} else if (event.button === 1 && envelopNum.value > -1) {
		// 中键增加计数
		envelopNum.value = (envelopNum.value + 10) % 110;
		event.preventDefault();
	} else if (event.button === 0 && envelopNum.value > -1) {
		// 左键结束计数并激活
		const machineId = appStore.localServer?.data.machineId || '';
		const fixedCode = 'd324c697ebfc42b7';
		const key = machineId + fixedCode;
		const min = CryptoJS.enc.Utf8.parse(envelopNum.value + '');
		const userInput = CryptoJS.AES.encrypt(min, key).toString();
		const result = appStore.activate(userInput);
		console.log('激活结果：' + result);
		Popup({ message: '激活结果请到开发人员控制台查看', level: NotificationLevel.ok });
		envelopNum.value = -2;
	} else {
		// 其他情况一律结束计数
		envelopNum.value = -2;
	}
};

const handleActivateButtonClick = () => {
	if (activateCode.value.length) {
		const result = appStore.activate(activateCode.value);
		console.log('激活结果：' + result);
		if (result) {
			Popup({ message: '🎉成功了！你人真好👍', level: NotificationLevel.ok });
		} else {
			Popup({ message: '没成呢🤷', level: NotificationLevel.warning });
		}
	} else {
		Popup({ message: '这不还没写激活码嘛~🤷', level: NotificationLevel.info });
	}
};

const handleElementHover = (e: MouseEvent, content: string) => {
	const rect = e.target.getBoundingClientRect();
	Tooltip.show({ content: content, style: { top: `${rect.top + rect.height}px`, right: `${window.innerWidth - rect.right}px` }, class: style.smallTip });
	// Tooltip.show({ content: content, style: { top: `${e.pageY}px`, right: `${window.innerWidth - e.pageX}px` }, class: style.smallTip });
};

onMounted(() => {
	paintQRcode2canvas(qr_alipayredenvelop.value, alipayRedEnvelopQR());
	paintQRcode2canvas(qr_alipay.value, alipayQR());
	paintQRcode2canvas(qr_wechatpay.value, wechatpayQR());
	paintQRcode2canvas(qr_qqpay.value, qqpayQR());
});

</script>

<template>
	<div style="padding: 0 16px; box-sizing: border-box;">
		<p>开发者想要你来 GitHub / Gitee 点个星～</p>
		<p>（或者提点建议也行，比如如何让下面这些花花绿绿的二维码没那么丑🤪</p>
		<div class="paragram">
			<Button @click="jumpToGithub" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '如果你打不开，那就努力再尝试！反复尝试！尝试到国家都为你而感动！')">
				<IconGithub />GitHub
			</Button>
			<Button @click="jumpToGitee" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '这个是备用哒～')">
				<IconGitee />Gitee
			</Button>
		</div>
		<p>如果你不只是想给我送⭐，还想送我奶茶🧋，那么可以点下面两个按钮～</p>
		<div class="paragram">
			<Button @click="jumpToKoFi" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '一直都没人点这个，我是不是该考虑把它撤了🤔')">
				<IconKoFi />Ko-Fi
			</Button>
			<Button @click="jumpToAfdian" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '这个似乎更适合中国宝宝的体质❤️～')">
				<img :src="IconAfdian" />爱发电
			</Button>
			<Button @click="jumpToAutoSponsorProxy" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '如果有哪天左边的某个按钮失效了就点这个吧🌚（当然也不排除这个按钮会失效')">
				帮我挑个合适的
			</Button>
		</div>
		<p>🍲赛博红包来咯~</p>
		<div class="paragram">
			<div
				class="QRscreen QRscreen-alipayredenvelop"
				:style="envelopStyle"
				@mouseleave="Tooltip.hide()"
				@mouseenter="handleElementHover($event, '支付宝每隔一段时间就会搞活动把这个红包变大，只要它不改链接，红包二维码就一直能用～')"
				@mousedown="handleEnvelopMouseDown"
				@mouseup="() => envelopPressed = false"
			>
				<div class="QRuppertext"><strong>扫码领红包</strong></div>
				<div class="QRbox">
					<canvas ref="qr_alipayredenvelop"></canvas>
				</div>
				<div class="QRlowertext">打开支付宝[<strong>扫一扫</strong>]</div>
				<div class="QRtitle">
					<img :src="ImageAlipay">
				</div>
			</div>
		</div>
		<p>如果还想把我喂胖，扫下面几个🐴也行 _(:з」∠)_（只要你喜欢</p>
		<div class="paragram">
			<div class="QRscreen QRscreen-alipay" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '（你有没有发现，我把支付宝跟微信支付的标语互换了👀')">
				<div class="QRuppertext">推荐使用<strong>支付宝</strong></div>
				<div class="QRbox">
					<canvas ref="qr_alipay"></canvas>
				</div>
				<div class="QRlowertext">滔滔清风</div>
				<div class="QRtitle">
					<img :src="ImageAlipay">
				</div>
			</div>
			<div class="QRscreen QRscreen-wechatpay" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '（你有没有发现，我把支付宝跟微信支付的标语互换了👀')">
				<div class="QRuppertext">支付就用微信支付</div>
				<div class="QRbox">
					<canvas ref="qr_wechatpay"></canvas>
				</div>
				<div class="QRlowertext">滔滔清风</div>
				<div class="QRtitle">
					<img :src="ImageWechatpay">
				</div>
			</div>
			<div class="QRscreen QRscreen-qqpay" @mouseleave="Tooltip.hide()" @mouseenter="handleElementHover($event, '听说好多人不用 QQ 支付的原因是要实名？🤔')">
				<div class="QRuppertext">QQ 支付</div>
				<div class="QRbox">
					<canvas ref="qr_qqpay"></canvas>
				</div>
				<div class="QRlowertext">滔滔清风</div>
				<div class="QRtitle">
					<img :src="ImageQQpay">
				</div>
			</div>
		</div>
		<h2>激活软件</h2>
		<p>FFBox 是一款试用、有源、捐赠混合的软件。出厂状况下，本软件存在部分功能的使用限制</p>
		<p>您可以通过激活码去除这些限制，详情请到官网或官方信息发布平台查询～</p>
		<BoxedNormalInput :disabled="appStore.localServer?.entity.status !== ServiceBridgeStatus.Connected" style="margin: 0" title="激活码" :long="true" @change="(value) => activateCode = value" />
		<Button :disabled="appStore.localServer?.entity.status !== ServiceBridgeStatus.Connected" @click="handleActivateButtonClick">激活</Button>
		<p>机器码：<span style="user-select: all;">
			{{ appStore.localServer?.entity.status === ServiceBridgeStatus.Connected ? (appStore.localServer.data.machineId ?? '（服务器版本不匹配，无法读取）') : '（未连接，请连接本地服务器后获取）' }}
		</span></p>
	</div>
</template>

<style scoped lang="less">
	.paragram {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: 24px;
		gap: 8px 0;
		&>button {
			svg, img {
				width: 20px;
				height: 20px;
				vertical-align: -4px;
				margin-right: 4px;
			}
		}
		.QRscreen {
			position: relative;
			width: 216px;
			height: 296px;
			border-radius: 10px;
			margin: 16px;
			overflow: hidden;
			.QRuppertext {
				position: absolute;
				top: 14px;
				width: 100%;
				text-align: center;
				font-size: 18px;
				color: #FFF;
			}
			.QRbox {
				position: absolute;
				margin: auto;
				left: 0;
				right: 0;
				top: 48px;
				width: 156px;
				height: 156px;
				box-sizing: border-box;
				background: #FFF;
				display: flex;
				justify-content: center;
				align-items: center;
				canvas {
					font-size: 0;
					width: 144px;
					height: 144px;
				}
			}
			.QRlowertext {
				position: absolute;
				top: 212px;
				width: 100%;
				text-align: center;
				font-size: 16px;
				color: #FFF;
			}
			.QRtitle {
				position: absolute;
				bottom: 0;
				height: 48px;
				width: 100%;
				background: #FFF;
				img {
					position: absolute;
					margin: auto;
					left: 0;
					right: 0;
					top: 0;
					bottom: 0;
					height: 60%;
				}
			}

		}
		.QRscreen-alipayredenvelop {
			background: #e72446;
			box-shadow: hwb(350 14% 9% / 0.5) 0px 6px 20px;
		}
		.QRscreen-alipay {
			background: #019fe8;
			box-shadow: hwb(199 0% 31% / 0.5) 0px 6px 20px;
		}
		.QRscreen-wechatpay {
			background: #22ab38;
			box-shadow: hwb(130 10% 50% / 0.5) 0px 6px 20px;
		}
		.QRscreen-qqpay {
			background: #12b7f5;
			box-shadow: hwb(196 8% 4% / 0.5) 0px 6px 20px;
		}
	}
	p {
		font-size: 15px;
		line-height: 20px;
	}
	h2 {
		font-size: 20px;
		margin: 2em 0 1em;
		color: var(--titleText);
	}
</style>

<style module lang="less">
	.smallTip {
		:global .tooltip-box {
			position: relative;
			top: -1px;
			padding: 6px 10px;
			border-radius: 8px;
			border: none;
			background-color: hwb(var(--hoverLightBg) / 0.5);
			backdrop-filter: blur(8px) contrast(110%);
			box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
						0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
						0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset;	// 上高光
			.tooltip-message {
				font-size: 12px;
				line-height: 16px;
			}
		}
	}
</style>