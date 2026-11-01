import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
// 두 모듈은 import 가 없는 순수 TS 라 Node 의 타입 제거 실행으로 바로 불러온다.
import {
  compareVersions,
  decideReleaseNotesAnnouncement,
  type AnnounceInput,
} from '../src/main/patch-notes/announce.ts';
import { parseInline, parseMarkdown } from '../src/renderer/patch-history/lib/markdown.ts';

const base: AnnounceInput = {
  current: '0.8.0',
  lastSeen: '0.7.4',
  firstInstall: false,
  packaged: true,
  hasNotes: true,
};

test('compareVersions: v 접두사·자리수·누락 자리', () => {
  assert.ok(compareVersions('v0.8.0', '0.7.4') > 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.equal(compareVersions('0.8', '0.8.0'), 0);
  assert.ok(compareVersions('0.8.0', '') > 0);
});

test('업그레이드 + 노트 있음 → 띄우고 현재 버전 기록', () => {
  assert.deepEqual(decideReleaseNotesAnnouncement(base), { show: true, record: '0.8.0' });
});

test('업그레이드 + 노트 없음 → 띄우지 않고 기록만', () => {
  assert.deepEqual(decideReleaseNotesAnnouncement({ ...base, hasNotes: false }), {
    show: false,
    record: '0.8.0',
  });
});

test('기록 전 버전에서 올라온 기존 사용자(lastSeen 빈 값) → 업그레이드로 본다', () => {
  assert.deepEqual(decideReleaseNotesAnnouncement({ ...base, lastSeen: '' }), {
    show: true,
    record: '0.8.0',
  });
});

test('첫 설치 → 띄우지 않고 현재 버전 기록', () => {
  assert.deepEqual(
    decideReleaseNotesAnnouncement({ ...base, lastSeen: '', firstInstall: true }),
    { show: false, record: '0.8.0' },
  );
});

test('같은 버전 재실행 → 아무것도 안 함', () => {
  assert.deepEqual(decideReleaseNotesAnnouncement({ ...base, lastSeen: '0.8.0' }), {
    show: false,
    record: null,
  });
});

test('다운그레이드 → 띄우지도 기록하지도 않음', () => {
  assert.deepEqual(decideReleaseNotesAnnouncement({ ...base, lastSeen: '0.9.0' }), {
    show: false,
    record: null,
  });
});

test('dev(비패키징) → 아무것도 안 함', () => {
  assert.deepEqual(
    decideReleaseNotesAnnouncement({ ...base, current: '39.2.0', packaged: false }),
    { show: false, record: null },
  );
});

test('parseInline: 굵게·코드·링크·일반 글자', () => {
  assert.deepEqual(parseInline('a **b** `c` [d](https://e.f) g'), [
    { kind: 'text', text: 'a ' },
    { kind: 'strong', text: 'b' },
    { kind: 'text', text: ' ' },
    { kind: 'code', text: 'c' },
    { kind: 'text', text: ' ' },
    { kind: 'link', text: 'd', href: 'https://e.f' },
    { kind: 'text', text: ' g' },
  ]);
});

test('parseMarkdown: 제목·목록·문단·구분선', () => {
  const blocks = parseMarkdown('## 새 기능\n\n- 하나\n- 둘\n  이어짐\n\n---\n문단\n줄');
  assert.deepEqual(blocks, [
    { kind: 'heading', level: 2, children: [{ kind: 'text', text: '새 기능' }] },
    {
      kind: 'list',
      items: [
        [{ kind: 'text', text: '하나' }],
        [
          { kind: 'text', text: '둘' },
          { kind: 'text', text: ' ' },
          { kind: 'text', text: '이어짐' },
        ],
      ],
    },
    { kind: 'rule' },
    { kind: 'paragraph', children: [{ kind: 'text', text: '문단 줄' }] },
  ]);
});

test('parseMarkdown: changelogen 본문 형태', () => {
  const blocks = parseMarkdown(
    '# Changelog\n\n\n## v0.7.4...v0.7.4\n\n[compare changes](https://github.com/KimKyuHoi/ASIS/compare/v0.7.4...v0.7.4)\n',
  );
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], {
    kind: 'heading',
    level: 1,
    children: [{ kind: 'text', text: 'Changelog' }],
  });
  assert.deepEqual(blocks[2], {
    kind: 'paragraph',
    children: [
      {
        kind: 'link',
        text: 'compare changes',
        href: 'https://github.com/KimKyuHoi/ASIS/compare/v0.7.4...v0.7.4',
      },
    ],
  });
});

test('parseMarkdown: HTML 은 글자 그대로 남는다', () => {
  assert.deepEqual(parseMarkdown('<img src=x onerror=alert(1)>'), [
    { kind: 'paragraph', children: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }] },
  ]);
});

test('release-notes/: 버전마다 ko·en 쌍이 있고 제목·목록으로 파싱된다', () => {
  const dir = path.join(import.meta.dirname, '..', 'release-notes');
  const re = /^(\d+\.\d+\.\d+)\.(ko|en)\.md$/;
  const byVersion = new Map<string, Set<string>>();
  for (const name of fs.readdirSync(dir)) {
    const m = re.exec(name);
    if (!m) continue;
    const langs = byVersion.get(m[1]) ?? new Set<string>();
    langs.add(m[2]);
    byVersion.set(m[1], langs);
    const blocks = parseMarkdown(fs.readFileSync(path.join(dir, name), 'utf8'));
    assert.ok(blocks.some((b) => b.kind === 'heading'), `${name}: 제목 없음`);
    assert.ok(blocks.some((b) => b.kind === 'list'), `${name}: 목록 없음`);
    assert.ok(!blocks.some((b) => b.kind === 'heading' && b.level === 1), `${name}: # 버전 제목은 쓰지 않는다`);
  }
  assert.ok(byVersion.size > 0, 'release-notes/ 에 노트가 없음');
  for (const [version, langs] of byVersion) {
    assert.deepEqual([...langs].sort(), ['en', 'ko'], `${version}: ko·en 둘 다 필요`);
  }
});
