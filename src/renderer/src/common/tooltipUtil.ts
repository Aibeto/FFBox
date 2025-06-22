import { StyleValue } from 'vue';
import Tooltip from '@renderer/components/Tooltip/Tooltip';
import styles from './tooltipUtil.module.less';

export function useTooltip(content: string, position?: 'br' | 't' | 'tl' | 'mtl') {
	return {
		onmouseenter: (e: MouseEvent) => {
			const rect = e.target.getBoundingClientRect();
			let style: StyleValue;
			switch (position) {
				case 'mtl':	// 鼠标左上方
					style = { top: `${e.pageY}px`, right: `${window.innerWidth - e.pageX}px` };
					break;
				case 't':	// 组件上方
					style = { bottom: `${window.innerHeight - rect.top}px`, left: `${rect.left + rect.width / 2}px`, transform: `translateX(-50%)` };
					break;
				case 'tl':	// 组件上左方
					style = { bottom: `${window.innerHeight - rect.top}px`, left: `${rect.left}px` };
					break;
				case 'br':	// 组件下右侧
				default:
					style = { top: `${rect.top + rect.height}px`, right: `${window.innerWidth - rect.right}px` };
					break;
			}
			Tooltip.show({ content, style, class: styles.smallTip });
		},
		onmouseleave: (e: MouseEvent) => {
			Tooltip.hide();
		},
	};
}
