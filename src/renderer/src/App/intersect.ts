// directives/intersect.ts
import { Directive } from 'vue'

type Props = { onChange?: (entry: IntersectionObserverEntry, customProps: any) => void, options?: IntersectionObserverInit }

let observer: IntersectionObserver | null = null;
const mapElementToProps = new WeakMap<Element, Props>();

// 创建或返回 observer 全局单例
function ensureObserver(options?: IntersectionObserverInit) {
  if (observer) return observer;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const props = mapElementToProps.get(entry.target)
      if (props?.onChange) props.onChange(entry, (entry.target as any).dataset)
    }
  }, options);
  return observer;
}

export const intersect: Directive<Element, Props> = {
  mounted(element, binding) {
    const props: Props = binding.value ?? {};
    mapElementToProps.set(element, props);
    const observer = ensureObserver(props.options);
    observer.observe(element);
  },
//   updated(el, binding) {
//     // 当指令绑定的 value 改变时，更新存储的回调/id
//     const props: Value = binding.value ?? {}
//     observed.set(el, props)
//     // 如果你需要更改 observer 的 options，通常需要重新创建 observer —— 这里不自动处理
//   },
  unmounted(el) {
    mapElementToProps.delete(el);
    if (observer) observer.unobserve(el);
  }
}
