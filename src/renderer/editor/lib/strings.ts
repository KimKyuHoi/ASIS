import { defineDict } from '../../../shared/i18n/language';

/**
 * 어노테이션 에디터 도메인의 UI 문자열 사전 (ko/en).
 *
 * 렌더 경로에서는 `const t = editorStrings[useLanguage()]` 로 읽어 언어 변경 시
 * 자동 리렌더된다. 보간이 필요한 값은 함수로 정의한다 (예: colorLabel(c)).
 *
 * 대상: 화면에 렌더되는 라벨·버튼·툴팁(title/aria-label)·placeholder·토스트.
 * 비대상: 주석·console 로그·사용자에게 노출되지 않는 throw new Error.
 */
export const editorStrings = defineDict({
  ko: {
    // Toolbar — 도구 버튼 라벨 (Tool 종류별)
    tool: {
      select: '선택',
      rect: '사각형',
      ellipse: '원',
      arrow: '화살표',
      line: '직선',
      pen: '펜',
      text: '텍스트',
      step: '번호',
      highlight: '하이라이트',
      blur: '블러',
      mosaic: '모자이크',
      eraser: '지우개',
    },
    // Toolbar — 선 스타일 라벨 (DashStyle 종류별)
    dashStyle: {
      'solid': '실선',
      'dashed': '점선',
      'dotted': '도트',
      'long-dash': '긴 파선',
      'dash-dot': '일점쇄선',
    },
    // Toolbar — 색상/슬라이더/액션 라벨·툴팁
    toolbar: {
      colorLabel: (c: string): string => `색상 ${c}`,
      customColor: '커스텀 색상',
      blur: '블러',
      blurValue: (r: number): string => `블러 ${r}px`,
      block: '블록',
      blockValue: (bs: number): string => `블록 ${bs}px`,
      font: '폰트',
      fontChange: '폰트 변경',
      size: '크기',
      alignLeft: '왼쪽 정렬',
      alignCenter: '가운데 정렬',
      alignRight: '오른쪽 정렬',
      lineHeight: '줄간격',
      lineHeightValue: (h: number): string => `줄간격 × ${h}`,
      strokeWidthLabel: (w: number): string => `두께 ${w}px`,
      lineLabel: '선',
      dashAriaLabel: (label: string): string => `선 스타일 ${label}`,
      undo: '실행 취소',
      redo: '다시 실행',
      attachImage: '이미지 첨부 (드롭 · ⌘V 도 가능)',
      pin: '화면에 핀 — 위에 떠있는 윈도우로 박아두기',
      saveFolder: '폴더에 저장 — ~/Pictures/ASIS/ 에 자동 저장 (⌘S 는 다른 이름으로 저장)',
      crop: '자르기',
      zoomOut: '축소 (-)',
      zoomReset: '원래 크기로 (⌘0)',
      zoomIn: '확대 (+)',
      cancel: '취소',
      copy: '복사',
    },
    // TextEditor — 인라인 편집 placeholder
    textEditor: {
      placeholder: '텍스트 입력',
    },
    // Shape — 빈 텍스트 도형의 캔버스 기본 표시
    shape: {
      defaultText: '텍스트',
    },
    // Editor — 토스트·컨텍스트 메뉴·로딩
    editor: {
      savedTitle: '저장했습니다',
      saveFailedTitle: '저장하지 못했습니다',
      saveFailedHint: '저장 폴더의 권한과 남은 공간을 확인해 주세요.',
      bringToFront: '맨 앞으로',
      bringForward: '앞으로',
      sendBackward: '뒤로',
      sendToBack: '맨 뒤로',
      loading: '캡처를 불러오는 중…',
    },
    // 크롭 모드 안내 막대
    crop: {
      hintEmpty: '남길 영역을 드래그하세요',
      hintAdjust: '핸들로 조정 · Enter 적용 · Esc 취소',
      size: (w: number, h: number): string => `${w} × ${h}`,
      apply: '적용',
      cancel: '취소',
    },
  },
  en: {
    tool: {
      select: 'Select',
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      arrow: 'Arrow',
      line: 'Line',
      pen: 'Pen',
      text: 'Text',
      step: 'Number',
      highlight: 'Highlight',
      blur: 'Blur',
      mosaic: 'Mosaic',
      eraser: 'Eraser',
    },
    dashStyle: {
      'solid': 'Solid',
      'dashed': 'Dashed',
      'dotted': 'Dotted',
      'long-dash': 'Long dash',
      'dash-dot': 'Dash-dot',
    },
    toolbar: {
      colorLabel: (c: string): string => `Color ${c}`,
      customColor: 'Custom color',
      blur: 'Blur',
      blurValue: (r: number): string => `Blur ${r}px`,
      block: 'Block',
      blockValue: (bs: number): string => `Block ${bs}px`,
      font: 'Font',
      fontChange: 'Change font',
      size: 'Size',
      alignLeft: 'Align left',
      alignCenter: 'Align center',
      alignRight: 'Align right',
      lineHeight: 'Line height',
      lineHeightValue: (h: number): string => `Line height × ${h}`,
      strokeWidthLabel: (w: number): string => `Width ${w}px`,
      lineLabel: 'Line',
      dashAriaLabel: (label: string): string => `Line style ${label}`,
      undo: 'Undo',
      redo: 'Redo',
      attachImage: 'Attach image (drop · ⌘V)',
      pin: 'Pin to screen — keep it floating on top',
      saveFolder: 'Save to folder — auto-saved to ~/Pictures/ASIS/ (⌘S to save as)',
      crop: 'Crop',
      zoomOut: 'Zoom out (-)',
      zoomReset: 'Actual size (⌘0)',
      zoomIn: 'Zoom in (+)',
      cancel: 'Cancel',
      copy: 'Copy',
    },
    textEditor: {
      placeholder: 'Enter text',
    },
    shape: {
      defaultText: 'Text',
    },
    editor: {
      savedTitle: 'Saved',
      saveFailedTitle: "Couldn't save",
      saveFailedHint: 'Check the save folder permissions and free space.',
      bringToFront: 'Bring to front',
      bringForward: 'Bring forward',
      sendBackward: 'Send backward',
      sendToBack: 'Send to back',
      loading: 'Loading capture…',
    },
    crop: {
      hintEmpty: 'Drag to choose the area to keep',
      hintAdjust: 'Drag handles to adjust · Enter to apply · Esc to cancel',
      size: (w: number, h: number): string => `${w} × ${h}`,
      apply: 'Apply',
      cancel: 'Cancel',
    },
  },
});
