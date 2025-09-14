import CryptoJS from 'crypto-js';

type RequestData = { buffer: Uint8Array, index: number }[];
// worker 的消息监听
self.onmessage = async (event) => {
	const list = event.data as RequestData;
	for (const item of list) {
		// 注意 CryptoJS 要转 WordArray
		let wordArray = CryptoJS.lib.WordArray.create(item.buffer as any);
		const hash = CryptoJS.SHA1(wordArray).toString();
		wordArray = undefined;	// 明确告知 V8 可以回收。不加这句虽然也能触发回收但明显更容易在校验中途 OOM
		(self as any).postMessage({ type: 'result', index: item.index, hash, buffer: item.buffer }, [ item.buffer ]);
		// await new Promise((resolve) => setTimeout(resolve, 0));
	}
	(self as any).postMessage({ type: 'finish' });
};
