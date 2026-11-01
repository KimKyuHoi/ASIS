/**
 * 새 버전 공지(변경 이력 자동 표시) 판정 — Electron·설정 저장소 무관한 순수 함수.
 *
 * import 가 없는 모듈로 둔다: tests/release-notes.test.mts 가 Node 의
 * 타입 제거 실행으로 이 파일을 직접 import 해 검증한다.
 */

/** semver 의 major.minor.patch 비교. 앞의 `v` 는 무시. a > b 면 양수, 같으면 0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type AnnounceInput = {
  /** app.getVersion(). */
  current: string;
  /** 설정의 lastSeenReleaseNotes. '' = 아직 기록 없음(이 기능 이전 버전에서 올라옴 포함). */
  lastSeen: string;
  /** 첫 설치 — 이번 실행 전 lastLaunchedVersion 이 '' 였다. */
  firstInstall: boolean;
  /**
   * 패키징된 앱인가. dev 는 package.json 에 version 이 없어(태그 빌드 때 주입)
   * app.getVersion() 이 Electron 버전을 돌려준다 — 비교 자체가 무의미하다.
   */
  packaged: boolean;
  /** current 버전의 번들 노트(ko·en)가 있는가. */
  hasNotes: boolean;
};

export type AnnounceDecision = {
  /** 변경 이력 창을 자동으로 띄운다. */
  show: boolean;
  /** lastSeenReleaseNotes 에 새로 저장할 값. null = 저장값 그대로 둔다. */
  record: string | null;
};

/**
 * 앱 시작 시 새 버전 공지를 띄울지, 무엇을 기록할지 정한다.
 *
 *  - dev(비패키징): 아무것도 하지 않는다.
 *  - 첫 설치: 띄우지 않고 현재 버전만 기록 — 온보딩과 겹치지 않게.
 *  - 같은 버전: 아무것도 하지 않는다.
 *  - 다운그레이드: 띄우지도 기록하지도 않는다 — 다시 올라갈 때 이미 본 노트를 또 띄우지 않는다.
 *  - 업그레이드: 기록하고, 그 버전 노트가 있을 때만 띄운다(노트 없는 패치 릴리스는 조용히).
 */
export function decideReleaseNotesAnnouncement(input: AnnounceInput): AnnounceDecision {
  if (!input.packaged) return { show: false, record: null };
  if (input.firstInstall) return { show: false, record: input.current };
  // lastSeen '' 은 '0.0.0' 으로 비교된다 — 기록 전 버전에서 올라온 기존 사용자는 업그레이드로 본다.
  const diff = compareVersions(input.current, input.lastSeen);
  if (diff <= 0) return { show: false, record: null };
  return { show: input.hasNotes, record: input.current };
}
