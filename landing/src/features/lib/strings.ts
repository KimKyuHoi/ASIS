import { defineDict } from '../../i18n/lib/define-dict';

type FeatureText = {
  title: string
  desc: string
  detail: string
};

type FeaturesStrings = {
  eyebrow: string
  title: string
  sub: string
  /** 6개 기능 카드 텍스트. 순서는 features/component 의 시각 요소 순서와 1:1. */
  items: FeatureText[]
  /** 데코용 목업 안의 라벨들. */
  visuals: {
    annoToolLabels: string[]
    annoShapeText: string
    pinWindowTitle: string
    pinText: string
    pinBadge: string
    colorCopy: string
    historyHeader: string
    historyCount: string
  }
};

export const FEATURES_STRINGS = defineDict<FeaturesStrings>({
  ko: {
    eyebrow: '기능',
    title: 'ASIS로 할 수 있는 것들',
    sub: '캡처부터 공유까지, 한 번의 단축키로.',
    items: [
      {
        title: '글로벌 단축키',
        desc: '어느 앱에서든 즉시 캡처',
        detail:
          '어느 앱에서든 단축키 한 번으로 영역·전체화면·윈도우 캡처를 즉시 실행합니다. 앱을 전환할 필요가 없습니다.',
      },
      {
        title: '인라인 어노테이션',
        desc: '10가지 도구로 직접 설명',
        detail:
          '화살표·사각형·원·펜·텍스트·번호마커·지우개·하이라이트·블러·모자이크 10가지 도구로 캡처 위에 바로 그립니다.',
      },
      {
        title: 'Pin to Screen',
        desc: '캡처를 화면 위에 고정',
        detail:
          '어노테이션한 이미지를 항상 위에 띄워 참고 자료로 사용하면서 다른 작업을 계속할 수 있습니다.',
      },
      {
        title: 'GIF 녹화',
        desc: '영역을 선택해 바로 GIF로',
        detail:
          '영역을 선택해 시퀀스 GIF 또는 영상 GIF로 녹화하고 바로 저장합니다. 긴 설명 대신 GIF 하나로 전달하세요.',
      },
      {
        title: 'Color Picker',
        desc: '픽셀 단위 색상 추출',
        detail:
          '영역 선택 중 화면의 어떤 색이든 픽셀 단위로 확대·확인·복사할 수 있습니다. HEX·RGB·HSL 모두 지원합니다.',
      },
      {
        title: '캡처 히스토리',
        desc: '세션 내 캡처 이력 관리',
        detail: '세션 중 복사하거나 핀한 캡처를 트레이 메뉴에서 바로 다시 불러올 수 있습니다.',
      },
    ],
    visuals: {
      annoToolLabels: [
        '선택',
        '사각형',
        '원',
        '화살표',
        '텍스트',
        '펜',
        '컬러',
        '모자이크',
        '블러',
        '번호',
      ],
      annoShapeText: '중요 버그',
      pinWindowTitle: '캡처 · 고정됨',
      pinText: '수정 요청',
      pinBadge: '항상 위에 표시',
      colorCopy: '복사',
      historyHeader: '캡처 히스토리',
      historyCount: '6개',
    },
  },
  en: {
    eyebrow: 'Features',
    title: 'What you can do with ASIS',
    sub: 'From capture to sharing, all in a single shortcut.',
    items: [
      {
        title: 'Global Shortcut',
        desc: 'Capture instantly from any app',
        detail:
          'Trigger a region, full-screen, or window capture from any app with a single shortcut — no app switching required.',
      },
      {
        title: 'Inline Annotation',
        desc: 'Explain it with ten tools',
        detail:
          'Draw right on your capture with arrows, rectangles, circles, pen, text, number markers, eraser, highlight, blur, and mosaic — ten tools in all.',
      },
      {
        title: 'Pin to Screen',
        desc: 'Keep a capture on top',
        detail:
          'Float an annotated image above everything else and keep it handy as a reference while you keep working.',
      },
      {
        title: 'GIF Recording',
        desc: 'Select an area, get a GIF',
        detail:
          'Select a region, record it as a sequence or video GIF, and save it right away. Send one GIF instead of a long explanation.',
      },
      {
        title: 'Color Picker',
        desc: 'Pick colors pixel by pixel',
        detail:
          'Zoom into any color on screen while selecting a region, then read and copy it. HEX, RGB, and HSL are all supported.',
      },
      {
        title: 'Capture History',
        desc: 'Manage captures in your session',
        detail: 'Reopen any capture you copied or pinned during the session, right from the tray menu.',
      },
    ],
    visuals: {
      annoToolLabels: [
        'Select',
        'Rectangle',
        'Circle',
        'Arrow',
        'Text',
        'Pen',
        'Color',
        'Mosaic',
        'Blur',
        'Number',
      ],
      annoShapeText: 'Critical bug',
      pinWindowTitle: 'Capture · Pinned',
      pinText: 'Fix requested',
      pinBadge: 'Always on top',
      colorCopy: 'Copy',
      historyHeader: 'Capture History',
      historyCount: '6 items',
    },
  },
});
