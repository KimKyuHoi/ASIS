import { defineDict, getLanguage } from '../../shared/i18n/language';

/**
 * GIF 스튜디오 main 쪽 문구 (창 제목·다이얼로그). 이 기능에서만 쓰여서
 * i18n/strings.ts 대신 기능 폴더에 둔다 — tMain() 과 같은 언어 store 를 읽는다.
 */
const gifStudioMainStrings = defineDict({
  ko: {
    windowTitle: 'ASIS — GIF 스튜디오',
    openDialogTitle: 'GIF 또는 영상 열기',
    mediaFilterName: 'GIF 및 영상',
    saveDialogTitle: 'GIF 저장',
    gifFilterName: 'GIF 이미지',
    unsupportedFormat: (ext: string) => `GIF 스튜디오가 지원하지 않는 형식입니다: ${ext}`,
    cannotOverwriteSource: '열려 있는 원본 파일 위에는 저장할 수 없습니다. 다른 이름을 골라 주세요.',
    replaceMessage: '편집 중인 GIF를 닫고 새 파일을 열까요?',
    replaceDetail: '저장하지 않은 녹화와 주석은 사라지고, 진행 중인 내보내기는 취소됩니다.',
    replaceDetailKeepNew: '[지금 편집 계속]을 고르면 새 녹화는 버리지 않고 저장 폴더에 GIF로 저장합니다.',
    replaceOpen: '새 파일 열기',
    replaceKeep: '지금 편집 계속',
    ffmpegUnavailable: 'GIF 변환기(ffmpeg)를 실행할 수 없습니다. ASIS를 다시 설치해 주세요.',
    ffmpegStep: {
      export: 'GIF 만들기',
      preview: '미리보기 준비',
      filmstrip: '구간 썸네일 만들기',
    },
    ffmpegFailed: (step: string) => `${step}에 실패했습니다. 자세한 내용은 로그를 확인해 주세요.`,
    notAFile: (name: string) => `파일이 아닙니다: ${name}`,
    unreadableMedia: (name: string) => `영상 길이나 해상도를 읽을 수 없습니다: ${name}`,
    invalidOptions: 'GIF 설정 값이 올바르지 않습니다. 값을 확인한 뒤 다시 시도해 주세요.',
    recordingKept: (path: string) => `새 녹화를 저장했습니다: ${path}`,
    mediaChanged: '내보내는 사이 열린 파일이 바뀌어 내보내기를 취소했습니다. 다시 시도해 주세요.',
    closeConfirmTitle: '저장하지 않은 편집이 있습니다',
    closeConfirmBody: '창을 닫으면 프레임에 넣은 주석이 사라집니다.',
    discardAndClose: '저장하지 않고 닫기',
    cancel: '취소',
    recordingKeepFailed: (path: string) =>
      `새 녹화를 저장 폴더에 옮기지 못했습니다. 임시 파일은 그대로 있습니다: ${path}`,
  },
  en: {
    windowTitle: 'ASIS — GIF Studio',
    openDialogTitle: 'Open a GIF or Video',
    mediaFilterName: 'GIFs and Videos',
    saveDialogTitle: 'Save GIF',
    gifFilterName: 'GIF Image',
    unsupportedFormat: (ext: string) => `GIF Studio doesn't support this format: ${ext}`,
    cannotOverwriteSource: "Can't save over the open source file. Choose a different name.",
    replaceMessage: 'Close the GIF you are editing and open the new file?',
    replaceDetail: 'The unsaved recording and annotations will be lost, and any export in progress will be canceled.',
    replaceDetailKeepNew: 'If you choose Keep Editing, the new recording is saved to your save folder instead of being discarded.',
    replaceOpen: 'Open New File',
    replaceKeep: 'Keep Editing',
    ffmpegUnavailable: "Couldn't run the GIF converter (ffmpeg). Please reinstall ASIS.",
    ffmpegStep: {
      export: 'Creating the GIF',
      preview: 'Preparing the preview',
      filmstrip: 'Creating trim thumbnails',
    },
    ffmpegFailed: (step: string) => `${step} failed. See the log for details.`,
    notAFile: (name: string) => `Not a file: ${name}`,
    unreadableMedia: (name: string) => `Couldn't read the duration or size of ${name}`,
    invalidOptions: 'Some GIF settings are invalid. Check the values and try again.',
    recordingKept: (path: string) => `Saved the new recording: ${path}`,
    mediaChanged: 'The open file changed while exporting, so the export was canceled. Please try again.',
    closeConfirmTitle: 'You have unsaved edits',
    closeConfirmBody: 'Closing the window discards the annotations you added to frames.',
    discardAndClose: 'Close Without Saving',
    cancel: 'Cancel',
    recordingKeepFailed: (path: string) =>
      `Couldn't move the new recording to your save folder. The temporary file is still at: ${path}`,
  },
});

export function tGifStudio(): (typeof gifStudioMainStrings)['ko'] {
  return gifStudioMainStrings[getLanguage()];
}
