import type { JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/titlebar.css';

type TitlebarProps = {
  title: string;
  /** 제목 옆 보조 정보 (파일 이름·크기 등) */
  subtitle?: ReactNode;
  /** 오른쪽 끝 동작 버튼들 */
  actions?: ReactNode;
  className?: string;
};

/**
 * titleBarStyle: 'hiddenInset' 창의 헤더. 왼쪽 80px 은 신호등 자리라 비워 두고,
 * 빈 곳은 창 드래그 영역이다. 안의 버튼·입력은 no-drag 로 클릭을 받는다.
 */
export function Titlebar({ title, subtitle, actions, className }: TitlebarProps): JSX.Element {
  return (
    <header className={cx('ds-titlebar', className)}>
      <h1 className="ds-titlebar__title">{title}</h1>
      {subtitle === undefined ? null : <span className="ds-titlebar__subtitle">{subtitle}</span>}
      {actions === undefined ? null : <div className="ds-titlebar__actions">{actions}</div>}
    </header>
  );
}
