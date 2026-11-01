import { defineDict, getLanguage } from '../../shared/i18n/language';

/**
 * 스텝 가이드 문서(내보낸 HTML)와 그 안의 편집 UI 문구.
 *
 * 문구 관례 — Scribe·Tango·Windows 단계 레코더처럼 단계 하나 = "동작 + 대상" 한 문장.
 *   - 번호는 문장에 넣지 않는다(문서 CSS counter 가 매긴다 → 순서 바꿔도 번호가 안 꼬임).
 *   - 좌표("(812, 440) 위치 클릭") 는 읽는 사람에게 의미가 없다 → 마커가 가리키는 곳을 말로 지시.
 *   - 앱 이름은 문장이 아니라 단계 위의 작은 칩으로 분리한다(Steps Recorder 의 "in 'Notepad'" 대응).
 *
 * 공유 i18n(src/main/i18n/strings.ts)이 아니라 이 도메인 안에 둔다 — 문서 산출물 전용이라
 * 다른 화면이 쓰지 않고, 문구를 고칠 때 이 파일 하나만 보면 되도록.
 */

/** 마지막 글자가 한글 음절이면 받침 유무, 아니면 null(판단 불가).
 *  한글 음절 = U+AC00 + (초성×21 + 중성)×28 + 종성 — 종성 인덱스 0 이 받침 없음. */
function hasFinalConsonant(text: string): boolean | null {
  const last = text.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자는 읽는 소리가 정해져 있다 — 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 은 받침.
  if (/[0-9]/.test(last)) return '013678'.includes(last);
  return null;
}

/** 한국어 목적격 조사가 붙은 '"라벨"을/를'. 판단 불가(영문 등)면 '"라벨" 항목을' 로 우회한다
 *  — "을(를)" 병기보다 읽기 자연스럽고, 영어 발음 추정으로 틀릴 일도 없다. */
function koObject(label: string): string {
  const batchim = hasFinalConsonant(label);
  if (batchim === null) return `"${label}" 항목을`;
  return `"${label}"${batchim ? '을' : '를'}`;
}

const guideCopy = defineDict({
  ko: {
    defaultTitle: (app: string | null) => (app ? `${app} 단계별 가이드` : '단계별 가이드'),
    eyebrow: '단계별 가이드',
    /** 문서 상단 "N단계" — 편집 런타임이 단계 삭제 시 {n} 을 치환한다. */
    countTemplate: '{n}단계',
    createdAt: (date: string) => `${date} 작성`,
    captionLabel: (label: string) => `${koObject(label)} 클릭합니다.`,
    captionPoint: '표시된 위치를 클릭합니다.',
    captionGif: '아래 화면의 동작을 따라 합니다.',
    stepAlt: (order: number) => `${order}단계 화면`,
    footer: 'ASIS로 만든 가이드',
    titlePlaceholder: '가이드 제목',
    descriptionPlaceholder: '이 가이드로 무엇을 할 수 있는지 한두 문장으로 적어 주세요.',
    captionPlaceholder: '이 단계에서 할 일을 적어 주세요.',
    notePlaceholder: '부연 설명 (선택)',
    edit: '편집',
    editTitle: '문구를 고치고 단계를 정리합니다',
    editingHint: '글자를 눌러 바로 고칠 수 있어요. 빈 설명은 저장할 때 숨겨집니다.',
    save: '저장',
    saveTitle: '수정한 내용을 HTML 파일로 저장합니다 (⌘S)',
    done: '보기 모드',
    doneTitle: '받는 사람이 보게 될 모습으로 확인합니다',
    moveUp: '위로',
    moveDown: '아래로',
    remove: '삭제',
    removeConfirm: '이 단계를 삭제할까요?',
    fileFallback: '가이드',
    // ASIS 편집 창(main) 전용.
    editorWindowTitle: '단계별 가이드 편집',
    saveFailedNotice: '가이드를 저장하지 못했습니다. 다른 위치를 골라 다시 시도해 주세요.',
    guideTooLarge: '단계가 너무 많아 파일 하나로 저장할 수 없습니다. 단계를 줄인 뒤 다시 저장해 주세요.',
    clickHelperMissing: '클릭 감지 도구를 찾지 못해 스텝 가이드를 시작할 수 없습니다. 앱을 다시 설치해 주세요.',
    clickDetectionStopped: '클릭 감지가 중단되어 스텝 가이드 녹화를 멈췄습니다. 손쉬운 사용 권한을 확인해 주세요.',
    editorOpenFailed: (message: string) => `가이드 편집 창을 열지 못했습니다: ${message}`,
    unsavedTitle: '저장하지 않은 수정 사항이 있습니다',
    unsavedDetail: '창을 닫으면 지금까지 고친 내용이 사라집니다.',
    unsavedDiscard: '저장하지 않고 닫기',
    unsavedCancel: '취소',
    saveDialogTitle: '가이드 저장',
    htmlFilterName: 'HTML 문서',
  },
  en: {
    defaultTitle: (app: string | null) => (app ? `${app}: step-by-step guide` : 'Step-by-step guide'),
    eyebrow: 'Step-by-step guide',
    countTemplate: '{n} steps',
    createdAt: (date: string) => `Created ${date}`,
    captionLabel: (label: string) => `Click "${label}".`,
    captionPoint: 'Click the highlighted spot.',
    captionGif: 'Follow the motion shown below.',
    stepAlt: (order: number) => `Screen for step ${order}`,
    footer: 'Made with ASIS',
    titlePlaceholder: 'Guide title',
    descriptionPlaceholder: 'Describe in a sentence or two what this guide helps with.',
    captionPlaceholder: 'Describe what to do in this step.',
    notePlaceholder: 'Extra note (optional)',
    edit: 'Edit',
    editTitle: 'Fix the wording and tidy up the steps',
    editingHint: 'Click any text to change it. Empty notes are hidden when saved.',
    save: 'Save',
    saveTitle: 'Save your changes as an HTML file (⌘S)',
    done: 'Preview',
    doneTitle: 'See it the way readers will',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Delete',
    removeConfirm: 'Delete this step?',
    fileFallback: 'guide',
    editorWindowTitle: 'Edit step-by-step guide',
    saveFailedNotice: "Couldn't save the guide. Try choosing a different location.",
    guideTooLarge: 'This guide has too many steps to fit in one file. Remove some steps and save again.',
    clickHelperMissing: "Couldn't find the click detection helper, so the step guide can't start. Please reinstall the app.",
    clickDetectionStopped: 'Click detection stopped, so step guide recording ended. Please check Accessibility permission.',
    editorOpenFailed: (message: string) => `Couldn't open the guide editor: ${message}`,
    unsavedTitle: 'You have unsaved changes',
    unsavedDetail: 'Closing this window discards your edits.',
    unsavedDiscard: 'Close without saving',
    unsavedCancel: 'Cancel',
    saveDialogTitle: 'Save guide',
    htmlFilterName: 'HTML document',
  },
});

export type GuideCopy = (typeof guideCopy)['ko'];

export function tGuide(): GuideCopy {
  return guideCopy[getLanguage()];
}
