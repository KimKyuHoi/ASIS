/** 디자인 시스템 공용 타입. */

/** 상태 색조 — Badge·Toast 가 공유한다. */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/** <html data-appearance> 값. 'system' 은 속성을 지운 상태. */
export type Appearance = 'system' | 'light' | 'dark';

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  disabled?: boolean;
};
