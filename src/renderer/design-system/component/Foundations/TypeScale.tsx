import type { JSX } from 'react';
import '../../asset/foundations.css';

const STEPS: { token: string; weight: string; use: string }[] = [
  { token: '--text-title1', weight: '--weight-bold', use: '빈 화면 제목' },
  { token: '--text-title2', weight: '--weight-semibold', use: '창 제목 (큰 창)' },
  { token: '--text-title3', weight: '--weight-semibold', use: 'Titlebar·섹션 제목' },
  { token: '--text-body', weight: '--weight-regular', use: '본문·컨트롤 (기본)' },
  { token: '--text-callout', weight: '--weight-regular', use: 'HUD·툴팁·키캡' },
  { token: '--text-subhead', weight: '--weight-regular', use: '힌트·배지' },
  { token: '--text-footnote', weight: '--weight-regular', use: '캡션 (최소 크기)' },
];

/** macOS 텍스트 스타일 크기 — 굵기는 크기마다 하나로 고정해 위계를 단순하게 둔다. */
export function TypeScale(): JSX.Element {
  return (
    <table className="ds-found-table">
      <tbody>
        {STEPS.map((step) => (
          <tr key={step.token}>
            <td>
              <span
                style={{ fontSize: `var(${step.token})`, fontWeight: `var(${step.weight})` }}
              >
                캡처한 화면을 한눈에 Capture
              </span>
            </td>
            <td>
              <code>{step.token}</code>
              <br />
              <code>{step.weight}</code>
            </td>
            <td>{step.use}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
