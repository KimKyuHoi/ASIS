import { useState, type JSX } from 'react';
import { contrastRatio, wcagGrade, type WcagGrade } from '../../lib/contrast';
import { CONTRAST_PAIRS, type ContrastPair } from '../../lib/contrast-pairs';
import { resolveColor } from '../../lib/resolve-color';
import { Badge } from '../Badge';
import '../../asset/foundations.css';

type Measured = ContrastPair & { ratio: number; grade: WcagGrade };

const measure = (scope: HTMLElement): Measured[] =>
  CONTRAST_PAIRS.map((pair) => {
    const backdrop = pair.backdrop === undefined ? undefined : resolveColor(scope, pair.backdrop);
    const fg = resolveColor(scope, pair.fg);
    const ratio = contrastRatio(fg, resolveColor(scope, pair.bg), backdrop);
    return { ...pair, ratio, grade: wcagGrade(ratio, pair.kind) };
  });

const KIND_LABEL = { 'text': '텍스트 4.5', 'large-text': '큰 글자 3', 'ui': 'UI 3' } as const;

const toneOf = (row: Measured): 'success' | 'warning' | 'danger' => {
  if (row.grade !== 'fail') return 'success';
  return row.expectFail === undefined ? 'danger' : 'warning';
};

const gradeLabel = (row: Measured): string => {
  if (row.grade !== 'fail') return row.grade;
  return row.expectFail === undefined ? '미달' : '예외';
};

/**
 * 렌더된 외형(라이트/다크 판) 안에서 토큰 쌍을 실제로 풀어 WCAG 대비를 잰다.
 * 측정은 마운트 직후 한 번 — 외형이 바뀌면 Storybook 데코레이터가 다시 마운트한다.
 */
export function ContrastTable(): JSX.Element {
  const [rows, setRows] = useState<Measured[] | null>(null);
  const attach = (node: HTMLTableElement | null): void => {
    if (node && rows === null) setRows(measure(node));
  };
  return (
    <table ref={attach} className="ds-found-table" data-testid="contrast-table">
      <thead>
        <tr>
          <th scope="col">전경 / 배경</th>
          <th scope="col">용도</th>
          <th scope="col">기준</th>
          <th scope="col">대비</th>
          <th scope="col">결과</th>
        </tr>
      </thead>
      <tbody>
        {(rows ?? []).map((row) => (
          <tr key={`${row.fg}|${row.bg}|${row.backdrop ?? ''}`} data-grade={row.grade}>
            <td>
              <code>{row.fg}</code>
              <br />
              <code>{row.bg}</code>
            </td>
            <td>
              {row.use}
              {row.expectFail === undefined ? null : <p className="ds-found-note">{row.expectFail}</p>}
            </td>
            <td>{KIND_LABEL[row.kind]}</td>
            <td className="tabular">{row.ratio.toFixed(2)}:1</td>
            <td>
              <Badge tone={toneOf(row)}>{gradeLabel(row)}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
