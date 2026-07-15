import { defineDict } from '../../i18n/lib/define-dict';

type DownloadStrings = {
  title: string
  sub: string
  /** "지금까지 {n}회 다운로드됨" 처럼 숫자 앞뒤 문구가 언어마다 달라 분리한다. */
  countPrefix: string
  countSuffix: string
  reqScreen: string
  reqArch: string
  reqPermission: string
  steps: string[]
};

export const DOWNLOAD_STRINGS = defineDict<DownloadStrings>({
  ko: {
    title: '지금 무료로 시작하세요',
    sub: 'MIT 라이선스 · 무료 · 오픈소스',
    countPrefix: '지금까지 ',
    countSuffix: '회 다운로드됨',
    reqScreen: 'macOS 13 Ventura 이상',
    reqArch: 'Apple Silicon & Intel',
    reqPermission: '화면 녹화 권한 필요',
    steps: [
      'DMG 파일 열기',
      'ASIS 아이콘을 Applications 폴더로 드래그',
      'Launchpad 또는 /Applications 에서 ASIS 실행',
      '화면 녹화 권한 허용',
    ],
  },
  en: {
    title: 'Get started for free',
    sub: 'MIT licensed · Free · Open source',
    countPrefix: '',
    countSuffix: ' downloads and counting',
    reqScreen: 'macOS 13 Ventura or later',
    reqArch: 'Apple Silicon & Intel',
    reqPermission: 'Screen Recording permission',
    steps: [
      'Open the DMG file',
      'Drag the ASIS icon into your Applications folder',
      'Launch ASIS from Launchpad or /Applications',
      'Grant Screen Recording permission',
    ],
  },
});
