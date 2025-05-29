<script setup lang="ts">
import { computed, onMounted, ref, VNodeRef } from 'vue';
import { useAppStore } from '../../stores/appStore';

const appStore = useAppStore();

const brickCount = 16;
const brickOpenState = ref(Array(brickCount).fill(false));
const brickHeight = ref(Array(brickCount).fill(0));
const brickStyle = computed(() => {
	return brickOpenState.value.map((value, index) => value 
		? { height: brickHeight.value[index] + 'px', '--titleMargin': '6px 26px', '--titleFontSize': '24px' }
		: { height: '26px', '--titleMargin': '0 20px', '--titleFontSize': '16px' }
	);
});
const contentRef = ref<HTMLDivElement[]>(Array(brickCount).map(() => null));

const handleBrickClick = (index: number) => {
	brickOpenState.value[index] = !brickOpenState.value[index];
};
const setRef = (el, i) => {
	// 单独把函数拿出来就有效，而不能直接在 template 里写
    contentRef.value[i] = el
}

onMounted(() => {
	// 计算每个 brick 的高度
	for (let i = 0; i < brickCount; i++) {
		const elemHeight = contentRef.value[i].getBoundingClientRect().height
		brickHeight.value[i] = elemHeight + 64;		
	}
})

</script>
<template>
	<div class="faqbrick-wrapper" :data-color_theme="appStore.colorTheme">
		<section class="faqbrick" @click="handleBrickClick(0)" :style="brickStyle[0]">
			<h2 class="title">为什么要做激活系统？</h2>
			<div class="content" :ref="el => setRef(el, 0)">
				<p><strong>为了让大家不要遗忘：软件不是理所应当免费的。不要忘记作者为此付出的心血。</strong></p>
				<p>我向所有无条件免费的开源项目（如 MIT 许可证）表示敬意，是你们为推进人类共同发展做出了或伟大或渺小的贡献。<br />为开源社区做贡献，或许或多或少有个人的原因，如提高自己的知名度，进而促进其他商单的达成等。但如果作者是单纯追求技术探索的喜悦，并无私地将成果分享给全世界，我再次向这样的作者和项目表示敬意🙏。</p>
				<p>FFBox 不是这样的目的，也不使用这样的许可证。FFBox 的许可证是自定的。如果通过官网下载，一定会经过至少 2 次的许可条款确认。<strong>这个许可证用于宣扬友善待人之道，并给作者保留对 FFBox 一定的控制权。</strong>从您同意了使用许可和条款开始，您就应清楚地意识到，<strong>本软件旨在弘扬人间美德。</strong>优秀的环境需要大家共建。</p>
				<p>因此，本作者对于任何抱有善意前来敲门的用户，提供激活码，或者激活秘技。</p>
				<p>我没有明说方式，这是为了给行为判定留出一些感性空间。但这种方式同样为 FFBox 留下了一些不好的声誉：部分比较着急的用户，会认为<strong>“FFBox 是套了开源的壳卖钱”</strong>，但事实上不是的。FFBox 没有定价标准，作者在发放激活方式的时候，也并不会检查捐赠记录。</p>
				<p>但我能理解出现这种问题的原因：<strong>作者没有表述清楚这么做的原因。</strong></p>
				<p>就如同原神一样，因为把各种背景故事都藏在了一般玩家不会去看的文本里，导致出现了一些“节奏”。事实上，不同玩家的区别相差甚远，有人会看角色的完整故事，有人会讨厌他在主线里犯下的罪，有人只在乎他的外观和“贱贱”的性格，从而导致了不同人对其风评相距甚远。<br />FFBox 亦是如此。如果它做得实在差，应该是不止这么点差评的。问题出在于：我的做法使大家的理解出现误差。</p>
				<p><strong>因为我有可能浪费了很多人的时间。</strong></p>
				<p>FFBox 目前的做法，我找到了相似的行为：拿到或者做出来一款/一些软件的破解版或者其他东西，打包成合集，放在 B 站或知乎上推广。要求关注后获取链接，下载完成后需要密码解压，密码需要添加客服，付费获取。也就是说：兜了一大圈，最终是收费的。<br />虽然我理解做这样的东西需要付出精力，请求一定的报酬是合理的，但这会令用惯了免费软件的中国人不爽。更不爽的是，它没有在一开始就说明这件事。</p>
				<p>因此，FFBox 在此特别写这段文本，提醒大家：<strong>未激活的 FFBox 有 11:11 的时长限制、一定的码率限制、服务器文件上传大小的限制、任务数量的限制。</strong>下个版本中，FFBox 上将会直接注明，避免浪费大家时间。</p>
			</div>
		</section>
		<div>以下不重要，可以不看</div>
		<section class="faqbrick" @click="handleBrickClick(1)" :style="brickStyle[1]">
			<h2 class="title">FFBox 跟其他转码软件有什么不同？</h2>
			<div class="content" :ref="el => setRef(el, 1)">
				<p>市面上大多数转码软件说白了就是个套壳 FFmpeg。咱这不一样，FFBox 它直接就是个壳，不给您赠送 FFmpeg。</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(2)" :style="brickStyle[2]">
			<h2 class="title">[成龙挠头.jpg]，为什么不附带 FFmpeg？</h2>
			<div class="content" :ref="el => setRef(el, 2)">
				<p>你家电脑的外存为什么满得那么快？因为你下的转码软件十有八九都给您送了个 FFmpeg，下得越多，送得越多。</p>
				<p>这好吗？这不好。那咋解决呢？Linux 的做法就很合适——先找一下你的电脑有没有 FFmpeg，有就直接用，无就先装上再用。FFBox 也是同样的思路。</p>
				<p>再者，FFmpeg 与 FFBox 具有不同的 LICENSE，因此 FFBox 不包含 FFmpeg 代码的拷贝。并且为了偷懒，咱连二进制文件也不提供～</p>
				<p><i style="opacity: 0.5;">(2025 更新)&nbsp;</i><font style="font-size: 1.5em">伸手党退散！</font></p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(3)" :style="brickStyle[3]">
			<h2 class="title">容器格式是啥？编码是啥？不会用怎么办？有教程吗？</h2>
			<div class="content" :ref="el => setRef(el, 3)">
				<p>如您所见，咱这软件连 FFmpeg 都不附带，显然就不是给新手用的呀～</p>
				<p>但是我是一定不希望放弃这部分用户的！在未来，FFBox 会推出“简易模式”，方便大家在无需过多了解视频参数的情况下轻松使用。</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(4)" :style="brickStyle[4]">
			<h2 class="title">下载链接速度好慢？冒 404 了？</h2>
			<div class="content" :ref="el => setRef(el, 4)">
				<p>由于众所周知的原因，您可以将电脑搬到境外进行下载，这样下载速度会得到明显的提升。</p>
				<p><s>我也希望我的用户具有一定的逃脱“信息茧房”的能力 ⊂( *･ω･ )⊃</s></p>
				<p><i style="opacity: 0.5;">(2025 更新)&nbsp;</i>限制用户量！</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(5)" :style="brickStyle[5]">
			<h2 class="title">FFBox 的起名有什么含义吗？</h2>
			<div class="content" :ref="el => setRef(el, 5)">
				<p>FFBox is a box of FFmpeg. This is the most accurate explanation.</p>
				<p>And, think of what FFF... means. Not so popular? Consider which day is the initial release date of FFBox.</p>
				<p>It's strange that some people have stereotypes of programmers. Griddy T-shirts, treating computer as a companion, and so on what the fuck... That's really good programmers! If he isn't, he's nerd.</p>
				<p>If you know my previous avatar you may know I'm not really a programmer. Making things on computers is just for fun.</p>
				<p>Yeah. There's a lot of fun things to do. But as you know, the green hat had kill most of my interests or to say abilities.</p>
				<p>So what the fuck just do programming... My dream has been...?</p>
				<p>Haven't you watch <i>onestop</i>? <a href="https://www.bilibili.com/video/av968582548/" target="_blank">Go watch it. </a>Parts of it were transcoded by FFBox. Totally worth a seen.</p>
				<p><i>(2024/04/01 更新)&nbsp;</i> <s><strong>其实视频转码什么的功能已经不重要了。FFBox 的 LICENSE 才是我想要做的全部功能。</strong></s></p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(6)" :style="brickStyle[6]">
			<h2 class="title">FFBox 的中文名是“丹参盒”吗？</h2>
			<div class="content" :ref="el => setRef(el, 6)">
				<s>
					<p>众所周知，如果一款软件有首选的中文名，它就大概率是不好用的软件。加水印、DPI 不适配、功能简陋，等等都有。这就是为什么我要做 FFBox，但又不给它写中文名的原因。</p>
					<p>至于标题栏上写“丹参盒”，只是因为中文的方块字形在标题栏上搭配的视觉效果比英文更和谐而已。</p>
					<p>那么如何给它写一个临时的名字呢？结合问题“FFBox 的起名有什么含义吗？”你就能看懂这个名字的妙处。</p>
				</s>
				<p>啊！原来你还记得以前我用过这名字贴到标题栏上啊！太感谢你一直以来的关注了！(●'◡'●)ﾉ♡</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(7)" :style="brickStyle[7]">
			<h2 class="title">为什么软件的体积这么大？</h2>
			<div class="content" :ref="el => setRef(el, 7)">
				<p>您使用的很多软件，比如带有首选中文名的浏览器、Visual Studio Code、飞书、QQ，甚至包括了破烂微信，它们其实都是套壳浏览器。由于技术原因，这一层套壳确实就没有办法像 FFmpeg 套壳那样避免，所以占主要体积的是浏览器。</p>
				<p>但是这个问题并非无法解决。FFBox <s>即将推出</s>远程转码管理功能，这将支持在浏览器上直接操作。</p>
				<p><strong>真的推出了！您快去用！</strong></p>
				<p>（啊，以后有空了去了解一下 webview2，毕竟我的思想其实也是尽量不要往用户的外存里放那么多份相同的东西……）</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(8)" :style="brickStyle[8]">
			<h2 class="title">这些年来，FFBox 的版本更迭都经历了什么？</h2>
			<div class="content" :ref="el => setRef(el, 8)">
				<p>1.x 版本的 FFBox，是经典的“html + css + js”前端三件套，属于初出茅庐的作品，没有工程化和模块化，一个 js 文件两千多行，逻辑是分散的，直接操作 DOM，甚至无法正确处理 FFmpeg 的状态，因此出道即瓶颈，只经历了 1.1 一个可用性改善的版本就进入了 2.x 版本的开发。</p>
				<p>1.x 版本中途很长时间没更新，因为正在制作 <a href="https://www.bilibili.com/video/av968582548/" target="_blank">onestop</a>。</p>
				<p>2.x 版本是使用 vue 2 进行工程化、模块化开发的重构作品。其模块化程度相对 1.x 版本是一个飞跃，但仍处于相当糟糕的阶段。大量控制逻辑集中在状态管理器上，总线上挤满了逻辑，相当于过度中心化的同心圆城市结构，组件分离但不独立。处于能正常开发，但走不太远的状态。因此在此处累积了 7 个版本，才进入 3.x 版本的开发。</p>
				<p>2.x 版本中途由于去了<s>著名的</s>厂工作，所以更新被搁置。不过同时也积累了在 macOS 方面的经验，使其能在 macOS 上运行，当然也吸纳了更优秀的模块化开发经验。</p>
				<p>3.x 版本分离了转码服务和 UI，即支持远程转码。改用了更佳的模块化方案，使不少组件得到独立。同时加入了 TypeScript，提供了更优秀的开发环境。但其使用的技术框架依然较旧，而且转码服务必须依托 FFBox 主进程运行，并且依然有较大量的逻辑集中在单个文件中进行，因此算是一个过渡版本。另外，此时的软件 UI 布局也已经不太支持加入太多新功能，也存在一些并不是那么好用的地方。它更有必要根据进行一次翻新改造。因此，3.0 版本刚做好，便进入 4.0 版本的开发了。</p>
				<p>3.x 版本经历了我人生的几个事件——毕业、找工作、被工作折磨。这些事件都导致了我在几个月的时间里都没有动过 FFBox 的代码。幸好，我心中仍怀有着持续完善这个软件，让它代表我的技术进步的想法。因此，它历经一年半，总算是开发完成了。</p>
				<p>4.x 版本使用了最现代的技术架构——vue 3、vite、less，靠纯自行编写实现了整个项目的开发与打包脚本，同时也彻底分离了前后端，也尝试了一些像 DirectX 那样的新奇玩意。界面上也结合了我多年以来对功能性、易用性、美观性的理解，融合了各家的习惯，设计了全新的 UI。虽然没有太多实质功能性上的更新，但各处都有不小的改变。可以说整个研发周期内是踩坑不断。我也使用了日志的形式将这些经验积累了起来，可以说它甚至比软件本身能做到的事情更为重要。它记录了我的踩坑经历、事件感慨、人生感悟……无需多言，这款软件，主打好看实用，您用便是！无需理会日志这种无人知晓的内容~</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(9)" :style="brickStyle[9]">
			<h2 class="title">有考虑过加入暗色模式吗？</h2>
			<div class="content" :ref="el => setRef(el, 9)">
				<p><i style="opacity: 0.5;">(2024/04/01 更新)&nbsp;</i><font style="font-size: 1.3em">开发好了！</font></p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(10)" :style="brickStyle[10]">
			<h2 class="title">“滤镜”模块是个装饰？</h2>
			<div class="content" :ref="el => setRef(el, 10)">
				<p>以后不是。</p>
				<p>如您所见，在 FFBox 迭代的过程中，经历了那么多次技术重构。事实上，只有将开发环境搞好，才方便去做一些复杂的功能。这些功能将会在以后被加上。</p>
				<p style="opacity: 0.5;"><i>(2024/04/01 更新)&nbsp;</i><span>预估是有点难度了。我在公司做过类似的编排组件，真的很不好搞。一段时间内这个功能是不会上线了。</span></p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(11)" :style="brickStyle[11]">
			<h2 class="title">这款软件花了这么长时间去做，能赚到钱吗？</h2>
			<div class="content" :ref="el => setRef(el, 11)">
				<p>我不关心。</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(12)" :style="brickStyle[12]">
			<h2 class="title">我好像找不到下载按钮呀？</h2>
			<div class="content" :ref="el => setRef(el, 12)">
				<!-- <p><a href="#" @click="showBigDownloadButton = true">点此下载</a></p> -->
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(13)" :style="brickStyle[13]">
			<h2 class="title">有女朋友吗？</h2>
			<div class="content" :ref="el => setRef(el, 13)">
				<p>一定程度上的母单。</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(14)" :style="brickStyle[14]">
			<h2 class="title">有联系方式吗？</h2>
			<div class="content" :ref="el => setRef(el, 14)">
				<p>(∩❛ڡ❛∩)</p>
			</div>
		</section>
		<section class="faqbrick" @click="handleBrickClick(15)" :style="brickStyle[15]">
			<h2 class="title">有……？</h2>
			<div class="content" :ref="el => setRef(el, 15)">
				<p>别问了，庄园里的小摩尔都钻进被窝里环游星空了。</p>
				<p>走吧，页面到底儿了。</p>
			</div>
		</section>
	</div>

</template>

<style scoped lang="less">
	.faqbrick-wrapper {
		padding: 8px 20px;
		box-sizing: border-box;
		.faqbrick {
			position: relative;
			padding: 8px 0;
			margin: 20px 0;
			// background-color: hwb(var(--bg98));
			background: linear-gradient(180deg, hwb(var(--bg99)), hwb(var(--bg94)));
			// box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
			border-radius: 8px;
			text-align: left;
			break-inside: avoid;
			overflow: hidden;
			transition: height 0.5s cubic-bezier(0.2, 1.25, 0.3, 1), padding 0.5s cubic-bezier(0.2, 1.25, 0.3, 1);
			.title {
				margin: var(--titleMargin);
				line-height: 1.5em;
				// font-family: "苹方 粗体", "PingFang SC", 苹方, 微软雅黑, "Segoe UI", Consolas, Avenir, Arial, Helvetica, sans-serif, 黑体;
				font-size: var(--titleFontSize);
				font-weight: 600;
				transition: all 0.5s cubic-bezier(0.2, 1.25, 0.3, 1);
			}
			.content {
				margin: 14px 26px;
				p {
					margin: 8px 0;
					// font-family: "苹方 中等", "PingFang SC", 苹方, 微软雅黑, "Segoe UI", Consolas, Avenir, Arial, Helvetica, sans-serif, 黑体;
					line-height: 1.8em;
					font-size: 14px;
					font-weight: 500;
				}
			}
		}
		&[data-color_theme="themeLight"]>.faqbrick {
			box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
						0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
			&:hover {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 0 0 0.5px hwb(var(--highlight)) inset,	// 包边
							0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
			}
			&:active {
				box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
							0 8px 12px hwb(var(--hoverShadow) / 0.1) inset; // 内部凹陷阴影
			}
		}
		&[data-color_theme="themeDark"]>.faqbrick {
			box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
						0 0 0 0.5px hwb(var(--highlight) / 0.5) inset,	// 包边
						0 1px 3px 0 hwb(var(--hoverShadow) / 0.3);	// 外部阴影
			&:hover {
				box-shadow: 0 0 1px 0.5px hwb(var(--bg99)),	// 柔和边缘
							0 0 0 0.75px hwb(var(--highlight)) inset,	// 包边
							0 1px 4px 0 hwb(var(--hoverShadow) / 0.4),	// 外部阴影
			}
			&:active {
				box-shadow: 0 0px 2px 0.5px hwb(var(--hoverShadow) / 0.15), // 外部阴影
							0 8px 12px hwb(var(--hoverShadow) / 0.4) inset; // 内部凹陷阴影
			}
		}
	}
</style>