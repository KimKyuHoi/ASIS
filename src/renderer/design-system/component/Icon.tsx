import type { JSX } from 'react';

/**
 * 최소 아이콘 세트 — SF Symbols 느낌의 1.5px 선 아이콘. 16×16 그리드.
 * 장식용이라 항상 aria-hidden. 의미는 감싸는 컨트롤의 aria-label 이 전달한다.
 */
const PATHS = {
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3.5 8.5l3 3 6-7',
  chevron: 'M4 6l4 4 4-4',
  gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  crop: 'M4.5 1.5v10h10M1.5 4.5h10v10',
  pen: 'M10.5 2.5l3 3-8 8H2.5v-3z',
  rect: 'M2.5 3.5h11v9h-11z',
  arrow: 'M3 13L13 3M7 3h6v6',
  text: 'M3 3.5h10M8 3.5V13',
  record: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3z',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  photo: 'M2.5 3.5h11v9h-11zM2.5 10l3-3 3 3 2-2 3 3',
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 16 }: IconProps): JSX.Element {
  return (
    <svg
      className="ds-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
