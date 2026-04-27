/**
 * 已使用模型的用量计算算法
 */
type ModelPrice = {
	modelKey: string; // provider:model_id
	inputMultiplyer: number; // 输入乘数
	outputMultiplyer: number; // 输出乘数
}[];

export interface AIModelOption {
	key: string;
	provider: string;
	modelId: string;
	modelName: string;
	label: string;
}

interface ResponseKeywordMessage {
	keywords: string[];
	message: string;
	warning?: boolean;	// 是否显示黄色字体，默认 false
	once?: boolean;	// 是否只显示一次，默认 false
}
type RequestKeywordMessage = ResponseKeywordMessage & { forbid: boolean };

interface ResponseResponseKeywordLink {
	keywords: string[];
	urls?: string[];
	blank?: boolean;	// 是否新标签打开，网页版默认 true，PC 版无论如何为 true
	execute?: string[];	// 执行程序
}
type RequestResponseKeywordLink = ResponseResponseKeywordLink & { needContinue?: boolean };	// continue 表示匹配到后是否继续向 API 发送消息，默认 true

export interface AIChatMessage {
	role: 'user' | 'ai' | 'aiErr' | 'aiInfo';
	text: string;
	time?: Date;
	refers?: string[];
	expense?: number;
	actions?: { label: string; url: string }[];
}

/**
 * 整体配置对象类型
 */
interface AISearchConfig {
	chatUrl?: string;
	conversationStatusUrl?: string;
	modelPrice?: ModelPrice;
	modelOptions?: AIModelOption[];
	requestKeywordLink?: RequestResponseKeywordLink[];	// 请求关键词匹配到则打开一个链接
	responseKeywordLink?: ResponseResponseKeywordLink[];	// 响应关键词匹配到则打开一个链接
	requestKeywordSystemMessage?: RequestKeywordMessage[];	// 请求关键词匹配到则显示一条系统消息
	responseKeywordSystemMessage?: ResponseKeywordMessage[];	// 响应关键词匹配到则显示一条系统消息
	tokenLimit?: { day?: number; week?: number; total?: number };
	tokenLimitMessage?: { day?: string; week?: string; total?: string };
	maxInputLength?: number;
	initialPlaceholders?: string[];
	initialPlaceholderInterval?: number;
	maxRounds?: number;
	maxRoundsMessage?: string;
	titleName?: string;
	initMsgbox?: string;	// 第一次打开聊天窗时的弹窗
	initSystemMessage?: AIChatMessage;	// 第一次打开聊天窗和重置对话时显示一条系统消息
	invalidReply?: string;	// AI 检测到非法内容不予回答时显示一条系统消息
}

export default AISearchConfig;
