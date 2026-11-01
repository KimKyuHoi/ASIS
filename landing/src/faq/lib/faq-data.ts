import { defineDict } from '../../i18n/lib/define-dict';

export type FaqEntry = { q: string; a: string };

/** 정적 FAQ — 검증된 사실만 담는다(라이선스·지원 OS·기여·캡처 시작·언어·단축키·GIF). */
export const FAQ_ENTRIES = defineDict<FaqEntry[]>({
  ko: [
    {
      q: '무료인가요?',
      a: '네. ASIS는 무료이며 MIT 라이선스 오픈소스입니다.',
    },
    {
      q: '어떤 macOS에서 동작하나요?',
      a: 'macOS 13 Ventura 이상에서 동작하며 Apple Silicon(M1/M2/M3/M4)과 Intel Mac을 모두 지원합니다.',
    },
    {
      q: '오픈소스에 기여하고 싶어요',
      a: '현재 기여 부분은 계획이 없습니다. 추후 기여 가능성이 생길 경우 공지 드리겠습니다.',
    },
    {
      q: '캡처는 어떻게 시작하나요?',
      a: '어느 앱에서든 전역 단축키나 메뉴 막대의 ASIS 아이콘에서 캡처를 시작할 수 있습니다. 단축키는 환경설정에서 확인·변경할 수 있고, 캡처 직후 주석 에디터가 열립니다.',
    },
    {
      q: '영어로도 쓸 수 있나요?',
      a: '네. 첫 실행 때 한국어와 English 중에서 고르고, 이후에도 환경설정의 언어 항목에서 언제든 바꿀 수 있습니다.',
    },
    {
      q: '단축키가 다른 앱과 겹쳐요',
      a: '환경설정에서 각 단축키를 다른 키로 바꾸거나 해제할 수 있습니다. 에디터 도구 키(V·R·O …)도 따로 바꿀 수 있고, "왼손 배치 적용" 버튼으로 모든 기능을 키보드 왼쪽에 한 번에 배치할 수도 있습니다.',
    },
    {
      q: 'GIF를 저장하지 않고 바로 붙여넣고 싶어요',
      a: '환경설정의 "GIF 녹화 후"를 "클립보드에 바로 복사"로 바꾸면 녹화가 끝나는 즉시 클립보드에 담깁니다. 파일 붙여넣기를 지원하는 곳에서는 움직이는 GIF 그대로 붙여넣어집니다.',
    },
  ],
  en: [
    {
      q: 'Is it free?',
      a: 'Yes. ASIS is free and open source under the MIT license.',
    },
    {
      q: 'Which versions of macOS does it run on?',
      a: 'It runs on macOS 13 Ventura or later and supports both Apple Silicon (M1/M2/M3/M4) and Intel Macs.',
    },
    {
      q: "I'd like to contribute to the project",
      a: "There are no plans for outside contributions right now. We'll post an announcement here if that changes.",
    },
    {
      q: 'How do I start a capture?',
      a: 'Start a capture from any app with a global shortcut or from the ASIS icon in the menu bar. You can check and change shortcuts in Settings, and the annotation editor opens right after the capture.',
    },
    {
      q: 'Is ASIS available in English?',
      a: 'Yes. Pick English or Korean on first launch, and switch any time from the language option in Settings.',
    },
    {
      q: 'A shortcut clashes with another app',
      a: 'In Settings you can remap or disable each shortcut. Editor tool keys (V, R, O …) can be changed separately, and the "Apply Left-Hand Layout" button places every feature on the left side of the keyboard at once.',
    },
    {
      q: 'Can I paste a GIF without saving it first?',
      a: 'Set "After GIF Recording" to "Copy to clipboard" in Settings and the GIF lands on your clipboard as soon as you stop recording. Anywhere that accepts pasted files gets the animated GIF as is.',
    },
  ],
});
