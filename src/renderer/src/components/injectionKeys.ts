import { InjectionKey, Ref } from 'vue';

/** 主题名称，如 'themeLight'、'themeDark' */
export const colorThemeKey: InjectionKey<Ref<string>> = Symbol('colorTheme');
/** 是否使用 IEC 单位（如 MiB vs MB） */
export const useIECKey: InjectionKey<Ref<boolean>> = Symbol('useIEC');
