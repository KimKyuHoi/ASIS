import { defineDict } from '../../i18n/lib/define-dict';

export type ToolSpec = {
  icon: string
  name: string
  shortcut?: string
  summary: string
  details: string[]
};

export type Shortcut = { keys: string; action: string };

export type Permission = { name: string; use: string };

/** 어노테이션 도구 — FEATURE.md / README 기준. 단축키는 README 단축키 표를 따른다. */
export const ANNOTATION_TOOLS = defineDict<ToolSpec[]>({
  ko: [
    {
      icon: '↖',
      name: '선택',
      shortcut: 'V',
      summary: '그려진 요소를 선택·이동·변형',
      details: [
        '그려진 모든 도형과 요소를 클릭해 선택할 수 있다.',
        '사각형·원·화살표 등 도형은 크기 조절과 회전이 가능하다.',
        '블러를 선택하면 블러 강도를 6단계로 조정할 수 있다.',
        '하이라이트를 선택하면 색상을 바꿀 수 있다.',
      ],
    },
    {
      icon: '▭',
      name: '사각형',
      shortcut: 'R',
      summary: '영역을 사각형으로 강조',
      details: ['색상 변경을 지원한다.', '선택 후 회전·크기 조절이 가능하다.'],
    },
    {
      icon: '○',
      name: '원',
      shortcut: 'O',
      summary: '영역을 원/타원으로 강조',
      details: ['색상 변경을 지원한다.', '선택 후 회전·크기 조절이 가능하다.'],
    },
    {
      icon: '→',
      name: '화살표',
      shortcut: 'A',
      summary: '방향과 지점을 가리키기',
      details: [
        '색상 변경과 회전을 지원한다.',
        'Shift 를 누른 채 그리면 45° 단위로 각도가 스냅된다.',
      ],
    },
    {
      icon: '✏',
      name: '펜',
      shortcut: 'P',
      summary: '자유롭게 손그림',
      details: ['굵기를 6단계로 설정할 수 있다.', '색상 변경이 가능하다.'],
    },
    {
      icon: '🖍',
      name: '하이라이트',
      shortcut: 'H',
      summary: '형광펜처럼 덧칠',
      details: ['기본 색상은 노란색이다.', '색상 변경이 가능하다.'],
    },
    {
      icon: '🌫',
      name: '블러',
      shortcut: 'B',
      summary: '민감 정보 가리기',
      details: ['블러 강도를 6단계 형태로 조정할 수 있다.'],
    },
    {
      icon: 'T',
      name: '텍스트',
      shortcut: 'T',
      summary: '설명 문구 입력',
      details: [
        '선택하면 기본 텍스트 박스가 나타난다.',
        '박스를 클릭해 원하는 문구를 키보드로 입력한다.',
        '색상 팔레트로 글자 색을 바꿀 수 있다.',
      ],
    },
  ],
  en: [
    {
      icon: '↖',
      name: 'Select',
      shortcut: 'V',
      summary: 'Select, move, and transform elements',
      details: [
        'Click any shape or element you drew to select it.',
        'Rectangles, circles, arrows, and other shapes can be resized and rotated.',
        'Select a blur to adjust its strength across six levels.',
        'Select a highlight to change its color.',
      ],
    },
    {
      icon: '▭',
      name: 'Rectangle',
      shortcut: 'R',
      summary: 'Highlight an area with a rectangle',
      details: ['Supports color changes.', 'Rotate and resize it after selecting.'],
    },
    {
      icon: '○',
      name: 'Circle',
      shortcut: 'O',
      summary: 'Highlight an area with a circle or ellipse',
      details: ['Supports color changes.', 'Rotate and resize it after selecting.'],
    },
    {
      icon: '→',
      name: 'Arrow',
      shortcut: 'A',
      summary: 'Point to a direction or spot',
      details: [
        'Supports color changes and rotation.',
        'Hold Shift while drawing to snap the angle to 45° increments.',
      ],
    },
    {
      icon: '✏',
      name: 'Pen',
      shortcut: 'P',
      summary: 'Draw freehand',
      details: ['Set the stroke width across six levels.', 'Supports color changes.'],
    },
    {
      icon: '🖍',
      name: 'Highlight',
      shortcut: 'H',
      summary: 'Paint over like a marker',
      details: ['Yellow by default.', 'Supports color changes.'],
    },
    {
      icon: '🌫',
      name: 'Blur',
      shortcut: 'B',
      summary: 'Hide sensitive information',
      details: ['Adjust the blur strength across six levels.'],
    },
    {
      icon: 'T',
      name: 'Text',
      shortcut: 'T',
      summary: 'Add a caption',
      details: [
        'A default text box appears when you pick the tool.',
        'Click the box and type whatever you want.',
        'Change the text color from the palette.',
      ],
    },
  ],
});

/** 캡처·결과물 등 도구 외 핵심 기능. README "그 외" 섹션 + 랜딩 기존 기능 카드 기준. */
export const WORKFLOW_FEATURES = defineDict<ToolSpec[]>({
  ko: [
    {
      icon: '⌥',
      name: '글로벌 단축키 캡처',
      shortcut: '⌥ Space',
      summary: '어느 앱에서든 즉시 캡처',
      details: [
        '앱을 전환하지 않고 단축키 한 번으로 영역 캡처를 시작한다.',
        '캡처 직후 곧바로 어노테이션 에디터가 열린다.',
      ],
    },
    {
      icon: '◎',
      name: 'Color Picker',
      summary: '픽셀 단위 색상 추출',
      details: [
        '영역 선택 중 화면의 어떤 색이든 돋보기로 확대해 확인한다.',
        'HEX·RGB·HSL 형식을 지원하며 값을 클립보드로 복사할 수 있다.',
      ],
    },
    {
      icon: '📌',
      name: 'Pin to Screen',
      summary: '캡처를 화면 위에 고정',
      details: ['어노테이션한 이미지를 항상 위에 띄워 참고하며 다른 작업을 계속한다.'],
    },
    {
      icon: '🎬',
      name: 'GIF 녹화',
      summary: '영역을 선택해 바로 GIF로',
      details: ['선택한 화면 영역을 GIF로 녹화·내보내기 한다.'],
    },
    {
      icon: '🖥',
      name: '다중 디스플레이',
      summary: '여러 모니터 완벽 지원',
      details: ['모니터가 여러 대인 환경에서도 정확한 좌표로 캡처한다.'],
    },
    {
      icon: '📋',
      name: '클립보드 복사 / 히스토리',
      summary: '바로 붙여넣기 · 세션 이력',
      details: [
        '결과 이미지를 클립보드로 복사해 어디든 바로 붙여넣는다.',
        '세션 중 복사·핀한 캡처를 트레이 메뉴에서 다시 불러온다.',
      ],
    },
  ],
  en: [
    {
      icon: '⌥',
      name: 'Global Shortcut Capture',
      shortcut: '⌥ Space',
      summary: 'Capture instantly from any app',
      details: [
        'Start a region capture with a single shortcut, without switching apps.',
        'The annotation editor opens the moment you capture.',
      ],
    },
    {
      icon: '◎',
      name: 'Color Picker',
      summary: 'Pick colors pixel by pixel',
      details: [
        'Magnify any color on screen while selecting a region.',
        'Supports HEX, RGB, and HSL, and copies the value to your clipboard.',
      ],
    },
    {
      icon: '📌',
      name: 'Pin to Screen',
      summary: 'Keep a capture on top',
      details: ['Float an annotated image on top as a reference while you keep working.'],
    },
    {
      icon: '🎬',
      name: 'GIF Recording',
      summary: 'Select an area, get a GIF',
      details: ['Record and export the selected screen region as a GIF.'],
    },
    {
      icon: '🖥',
      name: 'Multi-Display',
      summary: 'Full support for multiple monitors',
      details: ['Captures with accurate coordinates even across several monitors.'],
    },
    {
      icon: '📋',
      name: 'Clipboard Copy / History',
      summary: 'Paste anywhere · session history',
      details: [
        'Copy the result image to your clipboard and paste it anywhere.',
        'Reopen captures you copied or pinned during the session from the tray menu.',
      ],
    },
  ],
});

export const SHORTCUTS = defineDict<Shortcut[]>({
  ko: [
    { keys: '⌥ Space', action: '캡처 시작' },
    { keys: 'V', action: '선택 도구' },
    { keys: 'R', action: '사각형' },
    { keys: 'O', action: '원' },
    { keys: 'A', action: '화살표' },
    { keys: 'P', action: '펜' },
    { keys: 'H', action: '하이라이트' },
    { keys: 'B', action: '블러' },
    { keys: 'T', action: '텍스트' },
    { keys: '⌘ Z', action: '실행 취소' },
    { keys: '⌘ ⇧ Z', action: '다시 실행' },
    { keys: 'Delete', action: '선택 요소 삭제' },
    { keys: 'ESC', action: '캡처 취소' },
  ],
  en: [
    { keys: '⌥ Space', action: 'Start capture' },
    { keys: 'V', action: 'Select tool' },
    { keys: 'R', action: 'Rectangle' },
    { keys: 'O', action: 'Circle' },
    { keys: 'A', action: 'Arrow' },
    { keys: 'P', action: 'Pen' },
    { keys: 'H', action: 'Highlight' },
    { keys: 'B', action: 'Blur' },
    { keys: 'T', action: 'Text' },
    { keys: '⌘ Z', action: 'Undo' },
    { keys: '⌘ ⇧ Z', action: 'Redo' },
    { keys: 'Delete', action: 'Delete selection' },
    { keys: 'ESC', action: 'Cancel capture' },
  ],
});

export const PERMISSIONS = defineDict<Permission[]>({
  ko: [
    { name: '화면 녹화', use: '캡처 및 GIF 녹화' },
    { name: '손쉬운 사용 (Accessibility)', use: 'UI 자동 감지' },
  ],
  en: [
    { name: 'Screen Recording', use: 'Capture and GIF recording' },
    { name: 'Accessibility', use: 'Automatic UI detection' },
  ],
});
