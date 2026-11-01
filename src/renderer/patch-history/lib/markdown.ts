/**
 * 변경 이력용 작은 마크다운 파서 — 의존성 없이 블록/인라인 트리만 만든다.
 *
 * 지원: `#`~`######` 제목(표시는 3단계로 접음), `-`/`*`/`+` 목록(들여쓰기는 평탄화),
 * `---` 구분선, 문단, 인라인 `**굵게**`·`` `코드` ``·`[글](주소)`.
 * HTML 문자열을 만들지 않는다 — 컴포넌트가 트리를 JSX 로 그리므로 본문에 섞인 HTML 은
 * 글자 그대로 보인다(GitHub 본문은 외부 입력).
 *
 * import 가 없는 모듈로 둔다: tests/release-notes.test.mts 가 직접 import 한다.
 */

export type Inline =
  | { kind: 'text'; text: string } |
  { kind: 'strong'; text: string } |
  { kind: 'code'; text: string } |
  { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] } |
  { kind: 'list'; items: Inline[][] } |
  { kind: 'paragraph'; children: Inline[] } |
  { kind: 'rule' };

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_RE = /^\s*[-*+]\s+(.*)$/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const INLINE_RE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    // 어느 대안이 맞았는지는 첫 글자로 가른다 — 그 대안의 캡처 그룹만 채워진다.
    const [whole, strong, code, linkText, href] = m;
    if (whole.startsWith('**')) out.push({ kind: 'strong', text: strong });
    else if (whole.startsWith('`')) out.push({ kind: 'code', text: code });
    else out.push({ kind: 'link', text: linkText, href });
    last = m.index + whole.length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: 'list', items: list });
      list = null;
    }
  };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      const [, hashes, text] = heading;
      blocks.push({
        kind: 'heading',
        level: Math.min(hashes.length, 3) as 1 | 2 | 3,
        children: parseInline(text),
      });
      continue;
    }
    // 목록보다 먼저 — `---`·`***` 는 목록 기호로도 읽히기 때문이다.
    if (RULE_RE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const item = LIST_RE.exec(line);
    if (item) {
      if (paragraph.length > 0) flush();
      list ??= [];
      list.push(parseInline(item[1]));
      continue;
    }
    // 목록 바로 아래 들여쓴 줄은 직전 항목의 이어지는 문장이다.
    if (list && /^\s+/.test(raw)) {
      const prev = list[list.length - 1];
      prev.push({ kind: 'text', text: ' ' }, ...parseInline(line.trim()));
      continue;
    }
    if (list) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
