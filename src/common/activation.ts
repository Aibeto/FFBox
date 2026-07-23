/**
 * FFBox 激活码模块（v2，Ed25519 签名）
 *
 * 新版激活码格式：
 *   facv2.<base64url(payloadJson)>.<base64url(ed25519Signature)>
 * payload = { m: machineId, f: functionLevel, v: velocity, t: timestampMs }
 *   - v: 流速，每 30 天衰减的 functionLevel 点数，默认 2
 * 客户端用内嵌 Ed25519 公钥验签。
 *
 * 旧版激活码（U2FsdGVkX1 开头）不再支持解密，仅做识别后通知用户升级。
 * 旧码升级功能由 v1.html（激活面板 iframe）提供，FFBox 本体不调用 API。
 */

/** 旧版激活码前缀（CryptoJS AES 默认前缀），仅用于识别 */
export const LEGACY_PREFIX = 'U2FsdGVkX1';
/** 新版激活码前缀 */
export const V2_PREFIX = 'facv2';

/** Ed25519 公钥（PEM，SPKI）。验签用。私钥仅存在于服务器。 */
export const ED25519_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAUVEmFamWRkzkfVWMNz+V9b+JcKyeKNzjRSEQBp6Pmk4=
-----END PUBLIC KEY-----`;

// 激活码版本标识（用于日后版本识别）
export type ActivationVersion = 'v2' | 'legacy' | 'unknown';

export interface ActivationPayload {
	m: string;	// machineId
	f: number;	// functionLevel（原始值，未衰减）
	v?: number;	// 流速：每 30 天衰减的点数，默认 2
	t: number;	// 生成时间（毫秒时间戳）
}

export interface ActivationVerifyResult {
	ok: boolean;
	functionLevel?: number;
	rawFunctionLevel?: number;
	velocity?: number;
	machineId?: string;
	generatedAt?: number;
	version: ActivationVersion;
}

export function isLegacyCode(code: string): boolean {
	return typeof code === 'string' && code.startsWith(LEGACY_PREFIX);
}
export function isV2Code(code: string): boolean {
	return typeof code === 'string' && code.startsWith(V2_PREFIX + '.');
}

// ==================== base64url 工具 ====================
// 浏览器与 Node 通用实现（避免依赖 Buffer / atob 差异）

function base64UrlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
	const padded = b64 + pad;
	if (typeof atob === 'function') {
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}
	return new Uint8Array(Buffer.from(padded, 'base64'));
}

function stringToBytes(s: string): Uint8Array {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(s);
	}
	return new Uint8Array(Buffer.from(s, 'utf-8'));
}

// ==================== 验签 ====================

/**
 * 验签新版激活码（Ed25519，无需 hash）。
 *
 * 三条路径（按优先级）：
 * 1. Electron 渲染进程：通过 IPC 调主进程 Node crypto（渲染进程 Web Crypto 不支持 Ed25519）
 * 2. Node 后端：直接用 crypto.verify（require('crypto') 可用）
 * 3. 浏览器：Web Crypto API（如支持 Ed25519 则用，否则失败）
 *
 * 返回值为验签是否通过。
 */
async function verifySignature(payloadB64: string, sigB64: string): Promise<boolean> {
	// 路径 1：Electron 渲染进程 → IPC 调主进程
	if (typeof window !== 'undefined' && (window as any).jsb?.ipcRenderer?.invoke) {
		try {
			return await (window as any).jsb.ipcRenderer.invoke('verifyEd25519', payloadB64, sigB64);
		} catch {
			// 落到后续路径
		}
	}

	// 路径 2：Node 后端（require 可用）
	if (typeof require === 'function') {
		try {
			const nodeCrypto = require('crypto');
			const data = Buffer.from(payloadB64, 'utf-8');
			const sig = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
			return nodeCrypto.verify(null, data, ED25519_PUBLIC_KEY_PEM, sig);
		} catch {
			return false;
		}
	}

	// 路径 3：浏览器 Web Crypto API
	if (typeof crypto !== 'undefined' && typeof (crypto as any).subtle?.verify === 'function' && typeof (crypto as any).subtle?.importKey === 'function') {
		try {
			const key = await (crypto as any).subtle.importKey(
				'spki',
				base64UrlToBytes(ED25519_PUBLIC_KEY_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
				{ name: 'Ed25519' },
				false,
				['verify'],
			);
			const signature = base64UrlToBytes(sigB64);
			const data = stringToBytes(payloadB64);
			return await (crypto as any).subtle.verify('Ed25519', key, signature, data);
		} catch {
			return false;
		}
	}

	return false;
}

/**
 * 计算流速衰减后的 functionLevel。
 * 公式：f - floor(过去天数 / 30 * velocity)，最小减到 20。
 */
export function applyVelocityDecay(rawFunctionLevel: number, velocity: number, generatedAt: number, now: number = Date.now()): number {
	const elapsedDays = (now - generatedAt) / 86400000;
	let decay = Math.floor((elapsedDays / 30) * velocity);
	decay = Math.max(0, Math.min(rawFunctionLevel - 20, decay));
	return Math.max(0, rawFunctionLevel - decay);
}

/**
 * 解析并验签激活码。
 * @param code 激活码字符串
 * @param applyVelocity 是否计算流速衰减。true 时 functionLevel 为衰减后值；false 时为原始值
 */
export async function verifyActivationCode(code: string, applyVelocity: boolean = true): Promise<ActivationVerifyResult> {
	if (typeof code !== 'string' || !code) {
		return { ok: false, version: 'unknown' };
	}

	// 旧码：不支持解密，仅识别版本
	if (isLegacyCode(code)) {
		return { ok: false, version: 'legacy' };
	}

	if (!isV2Code(code)) {
		return { ok: false, version: 'unknown' };
	}

	const parts = code.split('.');
	// facv2.payload.signature
	if (parts.length !== 3) return { ok: false, version: 'v2' };
	const [, payloadB64, sigB64] = parts;

	const ok = await verifySignature(payloadB64, sigB64);
	if (!ok) return { ok: false, version: 'v2' };

	let payload: ActivationPayload;
	try {
		// payloadB64 是 base64url 编码的 JSON，需先解码再解析
		const jsonBytes = base64UrlToBytes(payloadB64);
		const json = new (typeof TextDecoder !== 'undefined' ? TextDecoder : (require('util').TextDecoder as any))('utf-8').decode(jsonBytes);
		payload = JSON.parse(json);
	} catch {
		return { ok: false, version: 'v2' };
	}

	if (typeof payload.f !== 'number' || typeof payload.m !== 'string' || typeof payload.t !== 'number') {
		return { ok: false, version: 'v2' };
	}

	const velocity = typeof payload.v === 'number' ? payload.v : 2; // 默认流速 2
	const effectiveLevel = applyVelocity
		? applyVelocityDecay(payload.f, velocity, payload.t)
		: payload.f;

	return {
		ok: true,
		functionLevel: effectiveLevel,
		rawFunctionLevel: payload.f,
		velocity,
		machineId: payload.m,
		generatedAt: payload.t,
		version: 'v2',
	};
}
