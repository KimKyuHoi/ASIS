/**
 * 토큰 감사 — renderer CSS 에서 디자인 토큰 대신 날값(hex·rgb·px·ms …)을 쓴 곳을 찾는다.
 *
 *   node src/renderer/design-system/lib/token-audit.mts            # 보고만
 *   node src/renderer/design-system/lib/token-audit.mts --strict   # error 가 있으면 exit 1
 *   node src/renderer/design-system/lib/token-audit.mts <파일|폴더>…
 *
 * Node 24 의 타입 스트리핑으로 바로 실행된다 (빌드 단계 없음).
 *
 * 날값이 정말 필요하면 같은 줄이나 바로 윗줄에 `token-ok: <이유>` 주석을 단다.
 * tokens.css 는 원시 값을 정의하는 곳이라 검사하지 않는다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_DIR = 'src/renderer';
const SKIP_FILES = new Set(['src/renderer/design-system/asset/tokens.css']);

type Severity = 'error' | 'warn';
type Rule = { id: string; severity: Severity; props: RegExp; test: (value: string) => boolean };
type Finding = { line: number; rule: string; severity: Severity; text: string };

const COLOR_PROPS = /^(color|background(-color)?|border(-[a-z]+)?-color|border(-[a-z]+)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color|column-rule-color)$/;
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(white|black|red|blue|green|gray|grey|yellow|orange|purple|pink)\b/i;

/** 속성 → 반드시 var() 를 써야 하는 값 패턴. severity 는 error / warn. */
const RULES: Rule[] = [
  { id: 'color', severity: 'error', props: COLOR_PROPS, test: (v) => COLOR_LITERAL.test(v) },
  { id: 'font-size', severity: 'error', props: /^font-size$/, test: (v) => /\d/.test(v) },
  { id: 'font-weight', severity: 'error', props: /^font-weight$/, test: (v) => /\d|bold/.test(v) },
  { id: 'font-family', severity: 'error', props: /^font-family$/, test: (v) => v !== 'TOKEN' && v !== 'inherit' },
  { id: 'line-height', severity: 'warn', props: /^line-height$/, test: (v) => /\d/.test(v) && v !== '1' },
  { id: 'radius', severity: 'error', props: /^border(-[a-z]+)*-radius$/, test: (v) => /\d*\.?\d+(px|rem|em|%)/.test(v) },
  { id: 'shadow', severity: 'error', props: /^box-shadow$/, test: (v) => v !== 'none' && /\d*\.?\d+px/.test(v) },
  { id: 'z-index', severity: 'error', props: /^z-index$/, test: (v) => /^-?\d+$/.test(v) && !['0', '1', '-1'].includes(v) },
  { id: 'duration', severity: 'error', props: /^(transition|animation)(-duration|-delay)?$/, test: (v) => /\b\d*\.?\d+m?s\b/.test(v) },
  { id: 'easing', severity: 'warn', props: /^(transition|animation)(-timing-function)?$/, test: (v) => /cubic-bezier\(/.test(v) },
  { id: 'opacity', severity: 'warn', props: /^opacity$/, test: (v) => /^0?\.\d+$/.test(v) },
  { id: 'spacing', severity: 'warn', props: /^(margin|padding|gap|row-gap|column-gap)(-[a-z]+)*$/, test: (v) => /(^|\s)([2-9]|\d{2,})px/.test(v) },
];

const DECL = /^\s*(-{0,2}[a-z][a-z-]*)\s*:\s*(.+?);?\s*$/i;

const collectCss = (target: string): string[] => {
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith('.css') ? [target] : [];
  return readdirSync(target).flatMap((name) => {
    if (name === 'node_modules') return [];
    return collectCss(join(target, name));
  });
};

const stripUrls = (value: string): string => value.replace(/url\((?:[^()]|\([^)]*\))*\)/g, 'url()');

/** var(--x) 는 토큰 참조라 검사 대상이 아니다. 중첩 var(--a, var(--b)) 도 안쪽부터 지운다. */
const stripVars = (value: string): string => {
  let out = value;
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(/var\(--[a-z0-9-]+(?:,[^()]*)?\)/gi, 'TOKEN');
  }
  return out;
};

const auditFile = (file: string): Finding[] => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const findings: Finding[] = [];
  lines.forEach((line, i) => {
    const decl = DECL.exec(line);
    if (!decl) return;
    const [, prop, rawValue] = decl;
    if (prop.startsWith('--')) return; // 도메인이 자기 지역 변수를 정의하는 줄은 값 정의라 통과
    // 첫 줄에는 윗줄이 없다 — 그때만 빈 문자열로 본다.
    const above = i > 0 ? lines[i - 1] : '';
    const allowed = /token-ok:/.test(line) || /token-ok:/.test(above);
    if (allowed) return;
    const value = stripVars(stripUrls(rawValue.replace(/\/\*.*?\*\//g, '').trim()));
    for (const rule of RULES) {
      if (rule.props.test(prop) && rule.test(value)) {
        findings.push({ line: i + 1, rule: rule.id, severity: rule.severity, text: line.trim() });
      }
    }
  });
  return findings;
};

const main = (): void => {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const targets = args.filter((a) => !a.startsWith('--'));
  const files = (targets.length > 0 ? targets : [DEFAULT_DIR])
    .flatMap((t) => collectCss(resolve(ROOT, t)))
    .filter((f) => !SKIP_FILES.has(relative(ROOT, f)));

  const totals: Record<Severity, number> = { error: 0, warn: 0 };
  const byRule: Record<string, number> = {};
  for (const file of files) {
    const findings = auditFile(file);
    if (findings.length === 0) continue;
    console.info(`\n${relative(ROOT, file)}`);
    for (const f of findings) {
      totals[f.severity] += 1;
      byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
      console.info(`  ${String(f.line).padStart(4)}  ${f.severity.padEnd(5)}  ${f.rule.padEnd(11)}  ${f.text}`);
    }
  }
  console.info(`\n파일 ${files.length}개 · error ${totals.error} · warn ${totals.warn}`);
  console.info(`규칙별: ${JSON.stringify(byRule)}`);
  if (strict && totals.error > 0) process.exit(1);
};

main();
