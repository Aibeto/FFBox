<script setup lang="ts">
import { computed, onMounted, ref, useCssModule } from 'vue';
import Button, { ButtonType } from '../../components/Button/Button';
import Tooltip from '../../components/Tooltip/Tooltip';
import IconGithub from '../../assets/menuCenter/sponsorCenter/github.svg?component';
import IconGitee from '../../assets/menuCenter/sponsorCenter/gitee.svg?component';
import IconKoFi from '../../assets/menuCenter/sponsorCenter/ko-fi.svg?component';
import IconAfdian from '../../assets/menuCenter/sponsorCenter/afdian.png';
import ImageAlipay from '../../assets/menuCenter/sponsorCenter/alipay.png';
import ImageWechatpay from '../../assets/menuCenter/sponsorCenter/wechatpay.svg?url';
import ImageQQpay from '../../assets/menuCenter/sponsorCenter/qqpay.png';

const style = useCssModule();

const qr_alipayredenvelop = ref<HTMLCanvasElement>();
const qr_alipay = ref<HTMLCanvasElement>();
const qr_wechatpay = ref<HTMLCanvasElement>();
const qr_qqpay = ref<HTMLCanvasElement>();

const jumpToGithub = () => window.open('https://github.com/ttqftech/FFBox', '_blank');
const jumpToGitee = () => window.open('https://gitee.com/ttqf/FFBox', '_blank');
const jumpToKoFi = () => window.open('https://ko-fi.com/N4N26F2WR', '_blank');
const jumpToAfdian = () => window.open('https://afdian.com/a/ttqftech');

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

const handleElementHover = (e: MouseEvent, content: string) => {
	const rect = (e.target as any).getBoundingClientRect();
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
		</div>
		<p>🍲赛博红包来咯~</p>
		<div class="paragram">
			<div
				class="QRscreen QRscreen-alipayredenvelop"
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
		<p>如果您不愿奶茶被平台抽掉一口，那就用下面 3 个🙃</p>
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
	</div>
</template>

<style scoped lang="less">
	.paragram {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: 24px;
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