import { defineDict } from '../../../shared/i18n/language';

/** 스크롤 캡처 컨트롤 바의 사용자 노출 문자열. */
export const scrollCaptureStrings = defineDict({
  ko: {
    hudLabel: '스크롤 캡처',
    hudLabelAuto: '자동 스크롤 캡처',
    choosePrompt: '어느 쪽으로?',
    up: '↑ 위로',
    upTitle: '위로 자동 스크롤 — 직접 스크롤해도 됩니다',
    down: '↓ 아래로',
    downTitle: '아래로 자동 스크롤 — 직접 스크롤해도 됩니다',
    rec: 'REC',
    stitching: '이어붙이는 중…',
    stitchingCount: (n: number) => `${n}장 합성`,
    progress: (n: number, h: number) => `${n}장 · ${h}px`,
    progressWithGaps: (n: number, h: number, gaps: number) => `${n}장 · ${h}px · 끊김 ${gaps}`,
    howToAuto:
      '고른 방향(↑/↓) 끝까지 자동으로 스크롤하며 찍고, 끝에 닿으면 저절로 이어붙입니다. 중간에 정지(Enter 또는 단축키)를 누르면 거기까지 이어붙입니다. 마우스를 움직이거나 직접 스크롤하면 자동은 멈추고, 스크롤한 만큼 계속 찍습니다.',
    howTo:
      '원하는 만큼 스크롤하세요. 스크롤한 만큼 이어붙입니다. 너무 빠르면 이어붙이지 못한 구간(끊김)이 생기니, 그때는 조금 되돌렸다가 다시 내려 주세요. 다 되면 정지(Enter 또는 단축키).',
    cancelTitle: '취소 (ESC)',
    cancel: '취소',
    stopTitle: '정지 (Enter)',
    stop: '정지',
  },
  en: {
    hudLabel: 'Scrolling capture',
    hudLabelAuto: 'Auto scrolling capture',
    choosePrompt: 'Which way?',
    up: '↑ Up',
    upTitle: 'Auto-scroll up — you can also scroll yourself',
    down: '↓ Down',
    downTitle: 'Auto-scroll down — you can also scroll yourself',
    rec: 'REC',
    stitching: 'Stitching…',
    stitchingCount: (n: number) => `Merging ${n} images`,
    progress: (n: number, h: number) => `${n} shots · ${h}px`,
    progressWithGaps: (n: number, h: number, gaps: number) => `${n} shots · ${h}px · ${gaps} gaps`,
    howToAuto:
      "Scrolls to the end in the direction you picked (↑/↓) and stitches when it gets there. Press Stop (Enter or the shortcut) to stitch what's captured so far. Move the mouse or scroll yourself to take over — capture keeps going as you scroll.",
    howTo:
      "Scroll as far as you like — everything you scroll past is stitched. Scrolling too fast can leave gaps; if that happens, scroll back a little and continue. Press Stop (Enter or the shortcut) when you're done.",
    cancelTitle: 'Cancel (ESC)',
    cancel: 'Cancel',
    stopTitle: 'Stop (Enter)',
    stop: 'Stop',
  },
});
