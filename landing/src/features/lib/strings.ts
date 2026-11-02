import { defineDict } from '../../i18n/lib/define-dict';

type FeatureText = {
  title: string
  desc: string
  detail: string
  /** 카드 아래 짧은 요점. 앱 트레이 메뉴·환경설정에 실제 있는 것만 적는다. */
  points: string[]
};

type CardText = { title: string; desc: string };

type CardGroup = {
  eyebrow: string
  title: string
  sub: string
  /** 순서는 features/component 의 아이콘 배열 순서와 1:1. */
  items: CardText[]
};

type FeaturesStrings = {
  eyebrow: string
  title: string
  sub: string
  /** 7개 기능 텍스트. 순서는 features/component 의 시각 요소 순서와 1:1. */
  items: FeatureText[]
  toolbox: CardGroup
  personal: CardGroup
  soon: {
    label: string
    /** 개발 중인 기능 — 출시 전이라 설명 없이 이름만 둔다. */
    items: string[]
  }
  /** 데코용 목업 안의 라벨들. */
  visuals: {
    captureModes: string[]
    captureScope: string
    /** 앱 에디터 툴바 순서(src/shared/editor-hotkeys.ts EDITOR_TOOLS)와 같다. */
    annoToolLabels: string[]
    annoShapeText: string
    recordAfter: string[]
    recordStop: string
    studioTitle: string
    studioFrame: string
    studioCopy: string
    scrollResult: string
    guideTitle: string
    guideSteps: string[]
    guideFile: string
    pinWindowTitle: string
    pinText: string
    pinBadge: string
    pinClickThrough: string
  }
};

export const FEATURES_STRINGS = defineDict<FeaturesStrings>({
  ko: {
    eyebrow: '기능',
    title: 'ASIS로 할 수 있는 것들',
    sub: '찍고, 표시하고, 녹화하고, 정리해서 공유하기까지 — 메뉴 막대의 앱 하나로.',
    items: [
      {
        title: '캡처',
        desc: '영역 · 윈도우 · 전체화면 · 지연',
        detail:
          '어느 앱에서든 단축키나 메뉴 막대에서 바로 캡처합니다. 캡처가 끝나면 주석 에디터가 열리고, 원하면 에디터 없이 바로 클립보드로 복사하게 바꿀 수 있습니다.',
        points: [
          '지연 캡처 — 카운트다운 1~10초 설정',
          '모니터가 여러 대면 전체화면 범위를 고를 수 있음: 커서가 있는 화면만 / 모든 화면을 한 장으로',
        ],
      },
      {
        title: '주석 에디터',
        desc: '12가지 도구로 바로 설명',
        detail:
          '선택·사각형·원·화살표·직선·펜·텍스트·번호·하이라이트·블러·모자이크·지우개. 도구마다 한 글자 단축키가 있고, 키는 환경설정에서 바꾸거나 끌 수 있습니다.',
        points: [
          '선 스타일 5종, 색상·두께, 텍스트 폰트·정렬·줄간격',
          '이미지 첨부(드롭 · ⌘V), 레이어 순서, 확대/축소',
        ],
      },
      {
        title: '화면 · GIF 녹화',
        desc: '녹화 영역이 화면에 표시돼요',
        detail:
          '선택한 영역을 영상이나 GIF로 녹화합니다. 녹화 중에는 영역 바깥에 테두리가 그려져 무엇이 찍히는지 바로 보이고, 테두리는 결과물에 들어가지 않습니다.',
        points: [
          'GIF 녹화 후 동작 선택 — GIF 스튜디오에서 편집 · 파일로 저장 · 클립보드에 바로 복사',
          '클립보드의 GIF는 파일 붙여넣기를 받는 곳에 움직이는 GIF 그대로 붙여넣어짐',
        ],
      },
      {
        title: 'GIF 스튜디오',
        desc: '프레임마다 주석을 그려 넣기',
        detail:
          '녹화한 GIF나 가지고 있는 GIF·영상을 열어 프레임 단위로 주석을 그리고, 구간을 잘라 원하는 크기·속도·FPS로 다시 내보냅니다.',
        points: [
          '영상 → GIF 변환 — MOV · MP4 · M4V · WebM · AVI · MKV',
          '.gif 파일을 열면 ASIS가 뷰어로 보여 줌 (기본 앱 연결)',
          '주석을 앞뒤·선택 구간·모든 프레임에 복사, 반복 횟수',
        ],
      },
      {
        title: '스크롤 캡처',
        desc: '직접 스크롤한 만큼 한 장으로',
        detail:
          '영역을 고르고 평소처럼 스크롤하세요. ASIS가 스크롤하는 동안 화면을 계속 찍어, 정지하면 겹치는 부분을 맞춰 긴 이미지 한 장으로 이어 붙입니다.',
        points: ['고정 헤더 · 푸터가 있는 페이지도 겹침을 찾아 정렬', '자동 스크롤 없이 원하는 지점에서 멈춤'],
      },
      {
        title: '스텝 가이드',
        desc: '클릭할 때마다 한 단계씩',
        detail:
          '녹화를 켜고 평소처럼 클릭하면 단계마다 화면이 쌓입니다. 끝나면 편집 창에서 제목·안내 문구를 다듬고 단계별로 주석을 그려, 공유용 HTML 파일 하나로 저장합니다.',
        points: [
          '클릭한 곳에 빨간 동그라미가 기본으로 들어감 — 옮기기·크기·색 변경 가능',
          '단계 순서 바꾸기·삭제, 받은 사람도 브라우저에서 바로 열람',
        ],
      },
      {
        title: '화면에 핀',
        desc: '캡처를 항상 위에 띄우기',
        detail:
          '주석을 단 캡처나 클립보드의 이미지를 화면 위에 띄워 두고 참고하며 작업합니다. 클릭 통과로 고정하면 핀 아래 창을 그대로 조작할 수 있습니다.',
        points: ['핀 기본 투명도 설정', '메뉴 막대에서 클릭 통과 해제 · 모든 핀 닫기'],
      },
    ],
    toolbox: {
      eyebrow: '도구 모음',
      title: '자잘하지만 매일 쓰는 것들',
      sub: '모두 메뉴 막대에서 열 수 있고, 단축키를 붙일 수 있습니다.',
      items: [
        { title: '화면 자', desc: '화면 위 요소의 크기와 간격을 픽셀 단위로 잽니다.' },
        { title: '색상 확인', desc: '영역 선택 중 돋보기로 픽셀을 확대해 HEX 값을 봅니다.' },
        { title: '캡처 히스토리', desc: '앱을 켜 둔 동안의 캡처를 최근 50개까지 다시 엽니다.' },
        { title: '클립보드를 핀으로', desc: '복사해 둔 이미지를 바로 화면 위에 띄웁니다.' },
        { title: '변경 이력', desc: '업데이트마다 무엇이 바뀌었는지 앱 안에서 확인합니다.' },
      ],
    },
    personal: {
      eyebrow: '내 방식대로',
      title: '손에 맞게 바꾸기',
      sub: '환경설정에서 바로 바꿀 수 있습니다.',
      items: [
        { title: '라이트 · 다크 모드', desc: '시스템 설정을 따르거나 라이트·다크 중 하나로 고정합니다.' },
        {
          title: '왼손 단축키 프리셋',
          desc: '모든 기능을 ⇧⌘ · ⌥⇧⌘ + 키보드 왼쪽 글자로 한 번에 배치합니다.',
        },
        { title: '단축키 바꾸기 · 끄기', desc: '전역 단축키와 에디터 도구 키를 원하는 키로 바꾸거나 해제합니다.' },
        { title: '한국어 · English', desc: '첫 실행에서 언어를 고르고, 언제든 환경설정에서 바꿉니다.' },
        { title: '에디터 없이 바로 복사', desc: '캡처 후 에디터를 띄우지 않고 클립보드로 바로 복사합니다.' },
        { title: '그 밖의 설정', desc: '저장 폴더, 캡처 완료 소리, 로그인 시 자동 시작, GIF 프레임 속도.' },
      ],
    },
    soon: {
      label: '곧 출시',
      items: ['이미지 자르기', '녹화 중 입력 표시'],
    },
    visuals: {
      captureModes: ['영역', '윈도우', '전체화면', '지연 3초'],
      captureScope: '모든 화면',
      annoToolLabels: [
        '선택',
        '사각형',
        '원',
        '화살표',
        '직선',
        '펜',
        '텍스트',
        '번호',
        '하이라이트',
        '블러',
        '모자이크',
        '지우개',
      ],
      annoShapeText: '중요 버그',
      recordAfter: ['스튜디오에서 편집', '파일로 저장', '클립보드에 복사'],
      recordStop: '정지',
      studioTitle: 'GIF 스튜디오',
      studioFrame: '프레임 12 / 48',
      studioCopy: '모든 프레임에 복사',
      scrollResult: '결과 · 1장',
      guideTitle: '팀 초대하는 방법',
      guideSteps: ['설정 열기', '멤버 탭 클릭', '초대 보내기'],
      guideFile: 'guide.html',
      pinWindowTitle: '캡처 · 고정됨',
      pinText: '수정 요청',
      pinBadge: '항상 위에 표시',
      pinClickThrough: '클릭 통과',
    },
  },
  en: {
    eyebrow: 'Features',
    title: 'What you can do with ASIS',
    sub: 'Capture, mark up, record, and package it for sharing — all from one menu bar app.',
    items: [
      {
        title: 'Capture',
        desc: 'Area · Window · Full screen · Delayed',
        detail:
          'Capture from any app with a shortcut or the menu bar. The annotation editor opens right after, or you can skip the editor and copy straight to the clipboard.',
        points: [
          'Delayed capture with a 1–10 second countdown',
          'With several monitors, choose the full-screen scope: the screen under the cursor, or every screen stitched into one image',
        ],
      },
      {
        title: 'Annotation Editor',
        desc: 'Explain it with 12 tools',
        detail:
          'Select, Rectangle, Ellipse, Arrow, Line, Pen, Text, Number, Highlight, Blur, Mosaic, and Eraser. Each tool has a single-key shortcut you can remap or turn off in Settings.',
        points: [
          'Five line styles, color and width, text font, alignment, and line height',
          'Attach images (drop or ⌘V), reorder layers, zoom in and out',
        ],
      },
      {
        title: 'Screen & GIF Recording',
        desc: 'See exactly what is being recorded',
        detail:
          'Record a selected area as a video or a GIF. While recording, a border is drawn just outside the area so you always know what is captured — and the border never ends up in the result.',
        points: [
          'Choose what happens after a GIF recording — edit in GIF Studio, save to a file, or copy to the clipboard',
          'A copied GIF pastes as an animated GIF anywhere that accepts pasted files',
        ],
      },
      {
        title: 'GIF Studio',
        desc: 'Annotate frame by frame',
        detail:
          'Open a fresh recording or any GIF or video, draw annotations on individual frames, trim it, and export again at the size, speed, and FPS you want.',
        points: [
          'Video to GIF — MOV, MP4, M4V, WebM, AVI, and MKV',
          'Open .gif files in ASIS as a viewer (registered as the default app)',
          'Copy annotations to neighboring frames, a selection, or every frame; set loop count',
        ],
      },
      {
        title: 'Scrolling Capture',
        desc: 'Everything you scroll, in one image',
        detail:
          'Pick an area and scroll as you normally would. ASIS keeps capturing while you scroll, and when you stop it lines up the overlaps and stitches one long image.',
        points: [
          'Finds the overlap even on pages with sticky headers and footers',
          'No auto-scrolling — stop wherever you want',
        ],
      },
      {
        title: 'Step Guide',
        desc: 'One step per click',
        detail:
          'Start recording and click through your task — each click becomes a step. Afterwards, polish the title and captions, annotate each step, and save it all as a single shareable HTML file.',
        points: [
          'A red circle marks each click by default — move it, resize it, or recolor it',
          'Reorder or delete steps; recipients just open it in a browser',
        ],
      },
      {
        title: 'Pin to Screen',
        desc: 'Keep a capture on top',
        detail:
          'Float an annotated capture or a clipboard image above everything else and keep working. Lock it with click-through to use the windows underneath as usual.',
        points: ['Set the default pin opacity', 'Turn off click-through or close all pins from the menu bar'],
      },
    ],
    toolbox: {
      eyebrow: 'Toolbox',
      title: 'Small things you use every day',
      sub: 'Each one lives in the menu bar and can get its own shortcut.',
      items: [
        { title: 'Screen Ruler', desc: 'Measures sizes and gaps between on-screen elements in pixels.' },
        { title: 'Color Check', desc: 'Magnifies pixels while you select an area and shows their HEX value.' },
        { title: 'Capture History', desc: 'Reopens up to the 50 most recent captures while the app is running.' },
        { title: 'Pin Clipboard Image', desc: 'Puts the image on your clipboard straight onto the screen.' },
        { title: 'Release Notes', desc: 'See what changed in each update without leaving the app.' },
      ],
    },
    personal: {
      eyebrow: 'Your way',
      title: 'Make it fit your hands',
      sub: 'All of it is a click away in Settings.',
      items: [
        { title: 'Light & Dark Mode', desc: 'Follow the system setting or stick to light or dark.' },
        {
          title: 'Left-Hand Shortcut Preset',
          desc: 'Lays out every feature on ⇧⌘ or ⌥⇧⌘ plus keys on the left side of the keyboard.',
        },
        { title: 'Remap or Disable Shortcuts', desc: 'Change or turn off global shortcuts and editor tool keys.' },
        { title: 'English & Korean', desc: 'Pick a language on first launch and switch any time in Settings.' },
        { title: 'Copy Without the Editor', desc: 'Skip the editor and copy each capture straight to the clipboard.' },
        { title: 'More Settings', desc: 'Save folder, capture sound, launch at login, and GIF frame rate.' },
      ],
    },
    soon: {
      label: 'Coming soon',
      items: ['Crop', 'Input display while recording'],
    },
    visuals: {
      captureModes: ['Area', 'Window', 'Full screen', 'Delay 3s'],
      captureScope: 'All screens',
      annoToolLabels: [
        'Select',
        'Rectangle',
        'Ellipse',
        'Arrow',
        'Line',
        'Pen',
        'Text',
        'Number',
        'Highlight',
        'Blur',
        'Mosaic',
        'Eraser',
      ],
      annoShapeText: 'Critical bug',
      recordAfter: ['Edit in Studio', 'Save to file', 'Copy to clipboard'],
      recordStop: 'Stop',
      studioTitle: 'GIF Studio',
      studioFrame: 'Frame 12 / 48',
      studioCopy: 'Copy to all frames',
      scrollResult: 'Result · 1 image',
      guideTitle: 'How to invite your team',
      guideSteps: ['Open Settings', 'Click Members', 'Send invite'],
      guideFile: 'guide.html',
      pinWindowTitle: 'Capture · Pinned',
      pinText: 'Fix requested',
      pinBadge: 'Always on top',
      pinClickThrough: 'Click-through',
    },
  },
});
