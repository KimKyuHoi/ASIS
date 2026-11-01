import type { JSX } from 'react';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown';

type LinkHandler = (href: string) => void;

type MarkdownProps = {
  source: string;
  /** https 링크 클릭 — 창 안에서 이동하지 않고 기본 브라우저로 연다. */
  onOpenLink: LinkHandler;
};

const HEADING_TAG = { 1: 'h3', 2: 'h4', 3: 'h5' } as const;

/**
 * 변경 이력 본문 — lib/markdown 의 블록 트리를 그린다(HTML 주입 없음).
 *
 * key 는 배열 index 를 쓴다: 본문은 한 번 받은 정적 문자열이라 항목이 끼어들거나
 * 순서가 바뀌지 않고, 블록에 고유 id 가 없다.
 */
export default function Markdown({ source, onOpenLink }: MarkdownProps): JSX.Element {
  return (
    <div className="md">
      {parseMarkdown(source).map((b, i) => (
        // eslint-disable-next-line react/no-array-index-key -- 정적 본문, 순서 불변(위 주석)
        <BlockView key={i} block={b} onOpenLink={onOpenLink} />
      ))}
    </div>
  );
}

function BlockView({ block, onOpenLink }: { block: Block; onOpenLink: LinkHandler }): JSX.Element {
  if (block.kind === 'heading') {
    const Tag = HEADING_TAG[block.level];
    return (
      <Tag className={`md__h md__h${block.level}`}>
        <Inlines nodes={block.children} onOpenLink={onOpenLink} />
      </Tag>
    );
  }
  if (block.kind === 'list') {
    return (
      <ul className="md__list">
        {block.items.map((item, j) => (
          // eslint-disable-next-line react/no-array-index-key -- 정적 본문, 순서 불변
          <li key={j}>
            <Inlines nodes={item} onOpenLink={onOpenLink} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === 'paragraph') {
    return (
      <p className="md__p">
        <Inlines nodes={block.children} onOpenLink={onOpenLink} />
      </p>
    );
  }
  return <hr className="md__rule" />;
}

function Inlines({ nodes, onOpenLink }: { nodes: Inline[]; onOpenLink: LinkHandler }): JSX.Element {
  return (
    <>
      {nodes.map((n, i) => (
        // eslint-disable-next-line react/no-array-index-key -- 정적 본문, 순서 불변
        <InlineView key={i} node={n} onOpenLink={onOpenLink} />
      ))}
    </>
  );
}

function InlineView({
  node,
  onOpenLink,
}: {
  node: Inline;
  onOpenLink: LinkHandler;
}): JSX.Element | string {
  if (node.kind === 'strong') return <strong>{node.text}</strong>;
  if (node.kind === 'code') return <code className="md__code">{node.text}</code>;
  // https 가 아닌 링크(상대 경로·mailto 등)는 열지 않고 글자만 보인다 — main 도 https 만 허용.
  if (node.kind === 'link' && node.href.startsWith('https://')) {
    const { href } = node;
    return (
      <button type="button" className="md__link" title={href} onClick={() => onOpenLink(href)}>
        {node.text}
      </button>
    );
  }
  return node.text;
}
