import { ref } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';

export default function useLowerDividerDrag() {
	const appStore = useAppStore();

	const deviderRef = ref<Element>(null);
	const handleDeviderDragStart = (event: MouseEvent | TouchEvent) => {
		// event.preventDefault();
		const deviderRect = deviderRef.value.getBoundingClientRect();	// 列表元素的 rect
		const mainAreaRect = (appStore.componentRefs['MainArea'] as Element).getBoundingClientRect();	// 列表元素的 rect
		const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
		// const inElementY = (event as MouseEvent).offsetY || (event as TouchEvent).touches[0].offsetY;	// 鼠标在元素内的 Y
		const inElementY = mouseY - deviderRect.top;	// 不直接用 offsetY 的原因是，鼠标所在的元素不一定是 devider
		// 添加鼠标事件捕获
		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const mouseY = (event as MouseEvent).pageY || (event as TouchEvent).touches[0].pageY;	// 鼠标在窗口内的 Y
			let listPercent = (mouseY - mainAreaRect.top - inElementY) / mainAreaRect.height;
			listPercent = Math.min(Math.max(listPercent, 0), 1);
			appStore.draggerPos = listPercent;
		}
		let handleMouseUp = () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('touchmove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('touchend', handleMouseUp);
		}
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('touchend', handleMouseUp);
	};

	return { deviderRef, handleDeviderDragStart };
}
