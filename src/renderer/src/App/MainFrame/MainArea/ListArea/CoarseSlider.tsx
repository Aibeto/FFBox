import { defineComponent, ref, computed, onBeforeUnmount } from 'vue';
import { JSX } from 'vue/jsx-runtime';

/**
 * 粗调范围滑动条组件
 * 一个矩形块代表可视范围，整体拖动跳转
 * 块的宽度由 end-start 和 total 决定（即视口大小决定，不可调整）
 * 块的位置由 start 决定（可拖动）
 */
export default defineComponent({
	name: 'CoarseSlider',
	props: {
		total: { type: Number, required: true },
		start: { type: Number, required: true },
		end: { type: Number, required: true },
	},
	emits: ['update:start', 'update:end', 'change'],
	setup(props, { emit }) {
		const trackRef = ref<HTMLDivElement>();
		const dragging = ref(false);
		const dragOffsetPercent = ref(0); // 指针在块内的相对位置（百分比）

		function indexToPercent(index: number): number {
			if (props.total <= 1) return 0;
			return index / (props.total - 1) * 100;
		}

		function percentToIndex(percent: number): number {
			if (props.total <= 1) return 0;
			return Math.round(percent / 100 * (props.total - 1));
		}

		function onPointerDown(e: PointerEvent) {
			if (props.total <= 1) return;
			e.preventDefault();

			const track = trackRef.value!;
			const rect = track.getBoundingClientRect();
			const clickPercent = (e.clientX - rect.left) / rect.width * 100;
			const startPercent = indexToPercent(props.start);

			// 记录指针在块内的相对偏移
			dragOffsetPercent.value = clickPercent - startPercent;
			dragging.value = true;

			(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
			document.addEventListener('pointermove', onPointerMove);
			document.addEventListener('pointerup', onPointerUp);
		}

		function onPointerMove(e: PointerEvent) {
			if (!dragging.value || !trackRef.value) return;
			const track = trackRef.value;
			const rect = track.getBoundingClientRect();
			const pointerPercent = (e.clientX - rect.left) / rect.width * 100;

			// 块的宽度百分比
			const startPercent = indexToPercent(props.start);
			const endPercent = indexToPercent(props.end);
			const blockWidth = endPercent - startPercent;

			// 新的 start 百分比 = 指针位置 - 拖拽偏移
			let newStartPercent = pointerPercent - dragOffsetPercent.value;
			// 约束：块不能超出轨道
			newStartPercent = Math.max(0, Math.min(100 - blockWidth, newStartPercent));

			const range = props.end - props.start;
			const newStart = percentToIndex(newStartPercent);
			const newEnd = newStart + range;

			// 约束到有效范围
			if (newStart >= 0 && newEnd < props.total) {
				emit('update:start', newStart);
				emit('update:end', newEnd);
			}
		}

		function onPointerUp() {
			if (dragging.value) {
				dragging.value = false;
				emit('change', { start: props.start, end: props.end });
			}
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
		}

		onBeforeUnmount(() => {
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
		});

		const startPercent = computed(() => indexToPercent(props.start));
		const endPercent = computed(() => indexToPercent(props.end));
		const blockWidth = computed(() => endPercent.value - startPercent.value);

		// 调试标签间隔
		const labelStep = computed(() => Math.max(Math.round(props.total / 50), 1));

		return () => {
			if (props.total <= 1) return <div style={{ height: '20px' }} />;

			const labels: JSX.Element[] = [];
			for (let i = 0; i < props.total; i += labelStep.value) {
				labels.push(
					<span
						key={i}
						style={{
							position: 'absolute',
							left: `${indexToPercent(i)}%`,
							top: '14px',
							transform: 'translateX(-50%)',
							fontSize: '6px',
							color: '#aaa',
							pointerEvents: 'none',
							userSelect: 'none',
							whiteSpace: 'nowrap',
						}}
					>
						{i}
					</span>
				);
			}
			if (props.total > 1 && (props.total - 1) % labelStep.value !== 0) {
				labels.push(
					<span
						key={props.total - 1}
						style={{
							position: 'absolute',
							left: '100%',
							top: '14px',
							transform: 'translateX(-50%)',
							fontSize: '6px',
							color: '#aaa',
							pointerEvents: 'none',
							userSelect: 'none',
							whiteSpace: 'nowrap',
						}}
					>
						{props.total - 1}
					</span>
				);
			}

			return (
				<div
					ref={trackRef}
					style={{
						position: 'relative',
						width: '100%',
						height: '28px',
						margin: '0',
						touchAction: 'none',
						userSelect: 'none',
					}}
					onPointerdown={onPointerDown}
				>
					{/* 轨道背景 */}
					<div
						style={{
							position: 'absolute',
							top: '6px',
							left: '0',
							right: '0',
							height: '4px',
							background: '#9994',
							borderRadius: '2px',
						}}
					/>
					{/* 可视范围矩形块 */}
					<div
						style={{
							position: 'absolute',
							top: '2px',
							left: `${startPercent.value}%`,
							width: `${blockWidth.value}%`,
							height: '12px',
							background: dragging.value ? '#3a8eef' : '#4a9eff',
							borderRadius: '3px',
							cursor: 'grab',
							transition: dragging.value ? 'none' : 'left 0.15s ease',
						}}
					/>
					{/* 调试标签 */}
					{labels}
				</div>
			);
		};
	},
});
