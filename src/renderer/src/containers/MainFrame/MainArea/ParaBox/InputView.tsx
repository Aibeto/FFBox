import { computed, defineComponent, ref } from 'vue';
import BoxedDropdownInput from '@renderer/components/DropdownInput/BoxedDropdownInput.vue';
import BoxedNormalInput from '@renderer/components/NormalInput/BoxedNormalInput.vue';
import BoxedSwitch from '@renderer/components/Switch/BoxedSwitch.vue';
import Button from '@renderer/components/Button/Button';
import InputAutoSize from '@renderer/components/InputAutoSize/InputAutoSize.vue';
import { durationFixer, durationValidator } from '../../../../components/validatorAndFixer';
import { hwaccels, generator } from '@common/params/formats'
import { useAppStore } from '@renderer/stores/appStore';
import IconDelete from '@renderer/assets/×.svg?component';
import style from './InputView.module.less';

interface Props {}

const InputView = defineComponent((props: Props) => {
	const appStore = useAppStore();
	const editingIndex = ref();
	const centerDrager = ref<HTMLDivElement>();
	const centerDraggerPos = ref(50);

	// 在一个输入文件都没有的情况下，应该编辑默认输入
	const editingInput = computed(() => appStore.globalParams.input.files[editingIndex.value]);

	// 往尾部新增一个空白项
	const extendedFiles = computed(() => (
		appStore.globalParams.input.files.concat({
			filePath: '',
			begin: '',
			end: '',
			custom: '',
			hwaccel: '',
			realtime: false,
		})
	));

	const listContainerStyle = computed(() => extendedFiles.value.length >= 11 ? " --itemPadding: 0 8px " : " --itemPadding: 4px 8px ")

	const handleCenterDraggerDragStart = (event: MouseEvent | TouchEvent) => {
		const mainAreaRect = centerDrager.value.parentElement.getBoundingClientRect();
		const inElementX = (event as MouseEvent).offsetX ?? (event as TouchEvent).touches[0].offsetX;	// 鼠标在元素内的 X
		// 添加鼠标事件捕获
		let handleMouseMove = (event: Partial<MouseEvent | TouchEvent>) => {
			const mouseX = (event as MouseEvent).pageX ?? (event as TouchEvent).touches[0].pageX;	// 鼠标在窗口内的 X
			let listPercent = (mouseX - inElementX + 8) / mainAreaRect.width;
			listPercent = Math.min(Math.max(listPercent, 0.2), 0.8);
			centerDraggerPos.value = listPercent * 100;
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
	const handleDetailChange = (sName: string, value: any) => {
		// @ts-ignore
		appStore.globalParams.input.files[editingIndex.value][sName] = value;
		appStore.applyParameters();
	};
	const handleDetailApplyToAll = (index: number) => {
		const files = appStore.globalParams.input.files;
		for (let i = 0; i < files.length; i++) {
			files[i].begin = files[index].begin;
			files[i].end = files[index].end;
			files[i].hwaccel = files[index].hwaccel;
			files[i].realtime = files[index].realtime;
			files[i].custom = files[index].custom;
		}	
	};
	const handleFileNameChange = (index: number, value: string) => {
		if (value === extendedFiles.value[index].filePath) {
			return;	// 没有修改
		}
		if (index === extendedFiles.value.length - 1) {
			if (value) {
				// 新增文件
				appStore.globalParams.input.files.push({
					filePath: value,
					begin: '',
					end: '',
					custom: '',
					hwaccel: '',
					realtime: false,
				});
			}
		} else {
			if (value) {
				// 修改文件
				appStore.globalParams.input.files[index].filePath = value;
			} else {
				// 删除文件
				appStore.globalParams.input.files.splice(index, 1);
			}
		}
		appStore.applyParameters();
	};
	const handleFileNameKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowUp' && editingIndex.value !== 0) {
			editingIndex.value--;
		} else if (event.key === 'ArrowDown' && editingIndex.value !== extendedFiles.value.length - 1) {
			editingIndex.value++;
		}
	};
	const handleFileDelete = (index: number) => {
		appStore.globalParams.input.files.splice(index, 1);
		appStore.applyParameters();
	};

	return () => (
		<div class={style.container}>
			<div class={style.left} style={{ width: `${centerDraggerPos.value}%`}}>
				<div class={style.title}>输入列表</div>
				<div class={style.listContainer} style={listContainerStyle.value}>
					{extendedFiles.value.map((file, index) => (
						<div class={`${style.listItem} ${editingIndex.value === index ? style.listItemSelected : ''}`} onClick={() => editingIndex.value = index}>
							{file.filePath !== '' && (
								<button class={style.delete} aria-label="删除输入文件" onClick={() => handleFileDelete(index)}>
									<IconDelete />
								</button>
							)}
							{editingIndex.value === index ? (
								<InputAutoSize
									value={file.filePath}
									onBlur={(value) => handleFileNameChange(index, value)}
									onPressEnter={(value) => handleFileNameChange(index, value)}
									onKeyDown={handleFileNameKeyDown}
								/>
							) : (
								<span
									style={file.filePath !== '' ? {} : { opacity: 0.5 }}
								>
									{file.filePath || '【拖入】或【点击填入】新文件'}
								</span>
							)}
						</div>
					))}
				</div>
			</div>
			<div class={style.dragger} style={{ left: `${centerDraggerPos.value}%`}} ref={centerDrager} onMousedown={handleCenterDraggerDragStart} onTouchstart={handleCenterDraggerDragStart} />
			<div class={style.right} style={{ width: `${100 - centerDraggerPos.value}%`}}>
				{editingInput.value ? (<>
					<BoxedDropdownInput title="硬件解码" text={editingInput.value.hwaccel} list={hwaccels} onChange={(value: string) => handleDetailChange('hwaccel', value)} />
					<BoxedNormalInput title="剪辑起点" value={editingInput.value.begin} onChange={(value: string) => handleDetailChange('begin', value)} validator={durationValidator} inputFixer={durationFixer} />
					<BoxedNormalInput title="剪辑终点" value={editingInput.value.end} onChange={(value: string) => handleDetailChange('end', value)} validator={durationValidator} inputFixer={durationFixer} />
					<BoxedSwitch title="限制一倍速" checked={editingInput.value.realtime} onChange={(value: boolean) => handleDetailChange('realtime', value)} />
					<BoxedNormalInput title="自定义参数" value={editingInput.value.custom} onChange={(value: string) => handleDetailChange('custom', value)} long={true} />
					<div style={{ margin: '12px' }}>
						<Button onClick={() => handleDetailApplyToAll(editingIndex.value)}>
							应用参数到全部输入
						</Button>
					</div>

				</>) : <div>请选择一个输入文件</div>}
			</div>
		</div>
	);
}, {
	props: [],
});

export default InputView;
