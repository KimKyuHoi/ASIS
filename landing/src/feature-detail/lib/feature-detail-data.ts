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

/**
 * 주석 에디터 도구 — 순서·기본 키는 앱의 src/shared/editor-hotkeys.ts(EDITOR_TOOLS,
 * DEFAULT_EDITOR_HOTKEYS)를 따른다. 키는 환경설정에서 바꾸거나 해제할 수 있다.
 */
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
        '우클릭 메뉴로 맨 앞·앞·뒤·맨 뒤로 순서를 바꾼다.',
      ],
    },
    {
      icon: '▭',
      name: '사각형',
      shortcut: 'R',
      summary: '영역을 사각형으로 강조',
      details: ['색상·두께·선 스타일을 바꿀 수 있다.', '선택 후 회전·크기 조절이 가능하다.'],
    },
    {
      icon: '○',
      name: '원',
      shortcut: 'O',
      summary: '영역을 원/타원으로 강조',
      details: ['색상·두께·선 스타일을 바꿀 수 있다.', '선택 후 회전·크기 조절이 가능하다.'],
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
      icon: '╱',
      name: '직선',
      shortcut: 'L',
      summary: '화살촉 없는 선 긋기',
      details: ['실선·점선·도트·긴 파선·일점쇄선 5가지 선 스타일을 고를 수 있다.'],
    },
    {
      icon: '✏',
      name: '펜',
      shortcut: 'P',
      summary: '자유롭게 손그림',
      details: ['두께와 색상을 바꿀 수 있다.'],
    },
    {
      icon: 'T',
      name: '텍스트',
      shortcut: 'T',
      summary: '설명 문구 입력',
      details: [
        '클릭한 자리에 텍스트 상자가 생기고 바로 입력한다.',
        '폰트·크기·정렬·줄간격·색상을 바꿀 수 있다.',
      ],
    },
    {
      icon: '①',
      name: '번호',
      shortcut: 'S',
      summary: '순서를 숫자 마커로 표시',
      details: ['클릭할 때마다 다음 번호가 찍혀 순서를 설명하기 좋다.'],
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
      summary: '민감 정보 흐리게 가리기',
      details: ['블러 강도를 조정할 수 있다.'],
    },
    {
      icon: '▦',
      name: '모자이크',
      shortcut: 'M',
      summary: '민감 정보를 픽셀 블록으로 가리기',
      details: ['블록 크기를 조정할 수 있다.'],
    },
    {
      icon: '⌫',
      name: '지우개',
      shortcut: 'E',
      summary: '그린 요소를 클릭해 지우기',
      details: ['클릭한 도형을 지운다. 선택 후 Delete 로도 지울 수 있다.'],
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
        'Rectangles, ellipses, arrows, and other shapes can be resized and rotated.',
        'Right-click to bring it to the front, forward, backward, or to the back.',
      ],
    },
    {
      icon: '▭',
      name: 'Rectangle',
      shortcut: 'R',
      summary: 'Highlight an area with a rectangle',
      details: ['Change its color, width, and line style.', 'Rotate and resize it after selecting.'],
    },
    {
      icon: '○',
      name: 'Ellipse',
      shortcut: 'O',
      summary: 'Highlight an area with a circle or ellipse',
      details: ['Change its color, width, and line style.', 'Rotate and resize it after selecting.'],
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
      icon: '╱',
      name: 'Line',
      shortcut: 'L',
      summary: 'Draw a line without an arrowhead',
      details: ['Pick from five line styles: solid, dashed, dotted, long dash, and dash-dot.'],
    },
    {
      icon: '✏',
      name: 'Pen',
      shortcut: 'P',
      summary: 'Draw freehand',
      details: ['Change its width and color.'],
    },
    {
      icon: 'T',
      name: 'Text',
      shortcut: 'T',
      summary: 'Add a caption',
      details: [
        'Click anywhere to drop a text box and start typing.',
        'Change the font, size, alignment, line height, and color.',
      ],
    },
    {
      icon: '①',
      name: 'Number',
      shortcut: 'S',
      summary: 'Mark the order with numbered markers',
      details: ['Each click places the next number — handy for walking through steps.'],
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
      summary: 'Blur out sensitive information',
      details: ['Adjust the blur strength.'],
    },
    {
      icon: '▦',
      name: 'Mosaic',
      shortcut: 'M',
      summary: 'Pixelate sensitive information',
      details: ['Adjust the block size.'],
    },
    {
      icon: '⌫',
      name: 'Eraser',
      shortcut: 'E',
      summary: 'Click what you drew to remove it',
      details: ['Removes the shape you click. You can also select one and press Delete.'],
    },
  ],
});

/** 캡처·녹화·결과물 기능. 앱 트레이 메뉴(src/main/tray.ts)·환경설정(src/main/settings.ts) 기준. */
export const WORKFLOW_FEATURES = defineDict<ToolSpec[]>({
  ko: [
    {
      icon: '⌘',
      name: '캡처',
      summary: '영역 · 윈도우 · 전체화면 · 지연',
      details: [
        '어느 앱에서든 전역 단축키나 메뉴 막대에서 바로 시작한다.',
        '지연 캡처는 카운트다운 시간을 1~10초로 정한다.',
        '캡처 직후 주석 에디터가 열린다. 끄면 바로 클립보드로 복사한다.',
      ],
    },
    {
      icon: '🖥',
      name: '다중 디스플레이',
      summary: '전체화면 캡처 범위 선택',
      details: [
        '커서가 있는 화면만, 또는 모든 화면을 배치대로 이은 한 장 중에서 고른다.',
        '모니터가 여러 대여도 영역 선택은 정확한 좌표로 동작한다.',
      ],
    },
    {
      icon: '🎬',
      name: '화면 · GIF 녹화',
      summary: '영역을 골라 영상 또는 GIF로',
      details: [
        '녹화 중에는 영역 바깥에 테두리가 표시되고, 결과물에는 들어가지 않는다.',
        'GIF 녹화 후 동작: GIF 스튜디오에서 편집(기본) · 파일로 저장 · 클립보드에 바로 복사.',
        'GIF 프레임 속도를 환경설정에서 정한다.',
      ],
    },
    {
      icon: '🎞',
      name: 'GIF 스튜디오',
      summary: '프레임별 주석 · 영상 → GIF',
      details: [
        '프레임마다 주석을 그리고, 앞뒤·선택 구간·모든 프레임에 복사한다.',
        '구간 자르기, 크기·속도·FPS·품질, 반복 횟수·바운스를 정해 내보낸다.',
        'GIF와 MOV · MP4 · M4V · WebM · AVI · MKV 영상을 열 수 있다.',
        '.gif 파일을 ASIS 뷰어로 바로 연다(기본 앱으로 연결).',
      ],
    },
    {
      icon: '📜',
      name: '스크롤 캡처',
      summary: '직접 스크롤한 만큼 한 장으로',
      details: [
        '영역을 고른 뒤 직접 스크롤하면, 정지할 때 겹침을 맞춰 긴 이미지로 잇는다.',
        '고정 헤더·푸터가 있는 페이지도 겹침을 찾아 정렬한다.',
      ],
    },
    {
      icon: '🧭',
      name: '스텝 가이드',
      summary: '클릭 단계를 공유용 HTML로',
      details: [
        '녹화 중 클릭할 때마다 화면이 한 단계로 쌓인다.',
        '편집 창에서 제목·설명·단계별 안내 문구를 고치고, 순서를 바꾸거나 단계를 지운다.',
        '단계마다 주석을 그린다. 클릭한 곳에는 빨간 동그라미가 기본으로 들어간다.',
        '결과는 HTML 파일 하나 — 받은 사람은 브라우저로 바로 연다.',
      ],
    },
    {
      icon: '📌',
      name: '화면에 핀',
      summary: '캡처·클립보드 이미지를 항상 위에',
      details: [
        '클릭 통과로 고정하면 핀 아래 창을 그대로 조작한다.',
        '메뉴 막대에서 클릭 통과 해제·모든 핀 닫기, 핀 기본 투명도 설정.',
      ],
    },
    {
      icon: '📏',
      name: '화면 자',
      summary: '크기와 간격 재기',
      details: ['화면 위 요소의 치수와 간격을 픽셀 단위로 잰다.'],
    },
    {
      icon: '📋',
      name: '복사 · 저장 · 히스토리',
      summary: '바로 붙여넣기 · 폴더 저장 · 최근 캡처',
      details: [
        '⌘C 로 결과 이미지를 클립보드에 복사하고, 폴더 저장은 ~/Pictures/ASIS(변경 가능).',
        '캡처 히스토리에서 앱을 켜 둔 동안의 캡처를 최근 50개까지 다시 연다.',
      ],
    },
  ],
  en: [
    {
      icon: '⌘',
      name: 'Capture',
      summary: 'Area · Window · Full screen · Delayed',
      details: [
        'Start from any app with a global shortcut or the menu bar.',
        'Set the delayed-capture countdown anywhere from 1 to 10 seconds.',
        'The annotation editor opens right after a capture — or turn it off to copy straight to the clipboard.',
      ],
    },
    {
      icon: '🖥',
      name: 'Multiple Displays',
      summary: 'Choose the full-screen scope',
      details: [
        'Capture just the screen under the cursor, or every screen stitched together as arranged.',
        'Area selection uses accurate coordinates across monitors.',
      ],
    },
    {
      icon: '🎬',
      name: 'Screen & GIF Recording',
      summary: 'Record an area as a video or a GIF',
      details: [
        'A border marks the recorded area while you record, and it never shows up in the result.',
        'After a GIF recording: edit in GIF Studio (default), save to a file, or copy to the clipboard.',
        'Set the GIF frame rate in Settings.',
      ],
    },
    {
      icon: '🎞',
      name: 'GIF Studio',
      summary: 'Frame-by-frame annotation · Video to GIF',
      details: [
        'Annotate individual frames and copy them to neighboring frames, a selection, or every frame.',
        'Trim, then export with your choice of size, speed, FPS, quality, loop count, and bounce.',
        'Opens GIFs and MOV, MP4, M4V, WebM, AVI, and MKV videos.',
        'Opens .gif files in the ASIS viewer (registered as the default app).',
      ],
    },
    {
      icon: '📜',
      name: 'Scrolling Capture',
      summary: 'Everything you scroll, in one image',
      details: [
        'Pick an area and scroll yourself; when you stop, the overlaps are matched into one long image.',
        'Lines up pages with sticky headers and footers too.',
      ],
    },
    {
      icon: '🧭',
      name: 'Step Guide',
      summary: 'Turn your clicks into a shareable HTML guide',
      details: [
        'Every click during recording becomes a step.',
        'Edit the title, description, and each caption; reorder or delete steps.',
        'Annotate each step — a red circle marks where you clicked by default.',
        'The result is a single HTML file that opens in any browser.',
      ],
    },
    {
      icon: '📌',
      name: 'Pin to Screen',
      summary: 'Keep captures and clipboard images on top',
      details: [
        'Lock a pin with click-through to keep using the windows underneath.',
        'Turn off click-through or close all pins from the menu bar; set the default pin opacity.',
      ],
    },
    {
      icon: '📏',
      name: 'Screen Ruler',
      summary: 'Measure sizes and gaps',
      details: ['Measures on-screen elements and the gaps between them in pixels.'],
    },
    {
      icon: '📋',
      name: 'Copy · Save · History',
      summary: 'Paste anywhere · Save to a folder · Recent captures',
      details: [
        'Press ⌘C to copy the result; folder saves go to ~/Pictures/ASIS (configurable).',
        'Capture History reopens up to the 50 most recent captures while the app is running.',
      ],
    },
  ],
});

export const SHORTCUTS = defineDict<Shortcut[]>({
  ko: [
    // 전역 캡처 단축키는 환경설정에서 바꾸거나 끌 수 있어 여기 고정 표기하지 않는다.
    // 아래는 에디터 창 안의 키 — 도구 키(V~E)도 환경설정에서 바꿀 수 있다.
    { keys: 'V', action: '선택' },
    { keys: 'R', action: '사각형' },
    { keys: 'O', action: '원' },
    { keys: 'A', action: '화살표' },
    { keys: 'L', action: '직선' },
    { keys: 'P', action: '펜' },
    { keys: 'T', action: '텍스트' },
    { keys: 'S', action: '번호' },
    { keys: 'H', action: '하이라이트' },
    { keys: 'B', action: '블러' },
    { keys: 'M', action: '모자이크' },
    { keys: 'E', action: '지우개' },
    { keys: '⌘ C', action: '이미지 복사' },
    { keys: '⌘ S', action: '다른 이름으로 저장' },
    { keys: '⌘ Z', action: '실행 취소' },
    { keys: '⌘ ⇧ Z', action: '다시 실행' },
    { keys: '+ / − / ⌘ 0', action: '확대 / 축소 / 원래 크기' },
    { keys: 'Delete', action: '선택 요소 삭제' },
    { keys: 'ESC', action: '에디터 닫기' },
  ],
  en: [
    { keys: 'V', action: 'Select' },
    { keys: 'R', action: 'Rectangle' },
    { keys: 'O', action: 'Ellipse' },
    { keys: 'A', action: 'Arrow' },
    { keys: 'L', action: 'Line' },
    { keys: 'P', action: 'Pen' },
    { keys: 'T', action: 'Text' },
    { keys: 'S', action: 'Number' },
    { keys: 'H', action: 'Highlight' },
    { keys: 'B', action: 'Blur' },
    { keys: 'M', action: 'Mosaic' },
    { keys: 'E', action: 'Eraser' },
    { keys: '⌘ C', action: 'Copy image' },
    { keys: '⌘ S', action: 'Save as' },
    { keys: '⌘ Z', action: 'Undo' },
    { keys: '⌘ ⇧ Z', action: 'Redo' },
    { keys: '+ / − / ⌘ 0', action: 'Zoom in / out / actual size' },
    { keys: 'Delete', action: 'Delete selection' },
    { keys: 'ESC', action: 'Close the editor' },
  ],
});

export const PERMISSIONS = defineDict<Permission[]>({
  ko: [
    { name: '화면 녹화', use: '캡처 · 화면/GIF 녹화 · 스크롤 캡처' },
    { name: '손쉬운 사용 (Accessibility)', use: 'UI 자동 감지 · 화면 자 요소 측정 · 스텝 가이드 클릭 감지' },
  ],
  en: [
    { name: 'Screen Recording', use: 'Capture, screen/GIF recording, scrolling capture' },
    { name: 'Accessibility', use: 'Automatic UI detection, ruler element measurement, step guide click detection' },
  ],
});
