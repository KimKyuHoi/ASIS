import type { JSX, ReactNode } from 'react';
import { cx } from '../lib/cx';
import '../asset/group.css';

type GroupProps = {
  /** 섹션 제목 — 문장형 대소문자(macOS 관례). 대문자+자간 스타일은 쓰지 않는다. */
  title?: string;
  /** 그룹 아래 설명 */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** System Settings 의 둥근 묶음. 안에 <Row> 를 쌓는다. */
export function Group({ title, footer, children, className }: GroupProps): JSX.Element {
  return (
    <section className={cx('ds-group', className)}>
      {title === undefined ? null : <h2 className="ds-group__title">{title}</h2>}
      <div className="ds-group__body">{children}</div>
      {footer === undefined ? null : <div className="ds-group__footer">{footer}</div>}
    </section>
  );
}

type RowProps = {
  /** 생략하면 children 이 행 전체를 쓴다 — 체크박스처럼 자기 라벨을 가진 컨트롤용. */
  label?: ReactNode;
  hint?: ReactNode;
  /** 오른쪽 컨트롤의 id — 라벨 클릭이 컨트롤로 간다. */
  htmlFor?: string;
  children?: ReactNode;
};

/** 왼쪽 라벨(+힌트), 오른쪽 컨트롤. */
export function Row({ label, hint, htmlFor, children }: RowProps): JSX.Element {
  if (label === undefined) return <div className="ds-row">{children}</div>;
  return (
    <div className="ds-row">
      <div className="ds-row__text">
        {htmlFor === undefined ? (
          <span className="ds-row__label">{label}</span>
        ) : (
          <label className="ds-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        )}
        {hint === undefined ? null : <span className="ds-row__hint">{hint}</span>}
      </div>
      {children === undefined ? null : <div className="ds-row__control">{children}</div>}
    </div>
  );
}
