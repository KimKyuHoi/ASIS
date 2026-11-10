import { defineDict } from '../../i18n/lib/define-dict';

export type FaqEntry = { q: string; a: string };

/**
 * 정적 FAQ — 검증된 사실만 담는다(앱 소스·feature-detail-data 기준).
 * FAQ 페이지 화면과 FAQPage 구조화 데이터·llms.txt 가 모두 이 목록을 쓴다.
 * 앞쪽 "~하는 법" 질문은 사람들이 실제로 검색하는 문장(맥 스크롤 캡처 등)에 맞춘 것이다.
 */
export const FAQ_ENTRIES = defineDict<FaqEntry[]>({
  ko: [
    {
      q: 'ASIS는 어떤 앱인가요?',
      a: 'ASIS는 맥(macOS)용 무료 오픈소스 화면 캡처·주석 앱입니다. 영역·윈도우·전체화면 캡처, 스크롤 캡처, 화면·GIF 녹화, 스텝 가이드를 만들고, 그 위에 바로 화살표·사각형·텍스트·블러 같은 주석을 달아 클립보드로 복사하거나 화면에 핀으로 고정할 수 있습니다.',
    },
    {
      q: '맥에서 스크롤 캡처(긴 화면 캡처)는 어떻게 하나요?',
      a: 'ASIS의 스크롤 캡처를 메뉴 막대 아이콘이나 단축키로 시작하고 캡처할 영역을 고른 뒤 직접 스크롤하면 됩니다. 스크롤을 멈출 때마다 겹치는 부분을 맞춰 한 장의 긴 이미지로 이어 붙이고, 고정 헤더·푸터가 있는 페이지도 겹침을 찾아 정렬합니다.',
    },
    {
      q: '맥에서 캡처한 화면에 화살표나 블러는 어떻게 넣나요?',
      a: '캡처하면 바로 주석 에디터가 열립니다. 선택(V)·사각형(R)·원(O)·화살표(A)·직선(L)·펜(P)·텍스트(T)·번호(S)·하이라이트(H)·블러(B)·모자이크(M)·지우개(E) 12가지 도구를 한 글자 단축키로 바꿔 가며 쓰고, ⌘C로 결과 이미지를 클립보드에 복사합니다. 민감한 정보는 블러나 모자이크로 가리면 됩니다.',
    },
    {
      q: '맥 화면을 GIF로 녹화할 수 있나요?',
      a: '네. 화면·GIF 녹화로 영역을 골라 녹화하면 되고, 녹화 영역 바깥 테두리는 결과물에 들어가지 않습니다. 녹화 후에는 GIF 스튜디오에서 편집(기본)·파일로 저장·클립보드에 바로 복사 중에서 고릅니다. GIF 스튜디오에서는 프레임마다 주석을 그리고 구간 자르기, 크기·속도·FPS·품질을 정해 내보낼 수 있으며, MOV·MP4·WebM 같은 영상을 열어 GIF로 바꿀 수도 있습니다.',
    },
    {
      q: '클릭 순서대로 사용 설명서(스텝 가이드)를 만들 수 있나요?',
      a: '네. 스텝 가이드 녹화 중 클릭할 때마다 화면이 한 단계로 쌓이고, 클릭한 곳에는 빨간 동그라미가 들어갑니다. 제목·설명·단계별 문구를 고치고 단계마다 주석을 그린 뒤 HTML 파일 하나로 저장하면, 받은 사람은 브라우저로 바로 엽니다.',
    },
    {
      q: '무료인가요?',
      a: '네. ASIS는 무료이며 MIT 라이선스 오픈소스입니다.',
    },
    {
      q: '어떤 macOS에서 동작하나요?',
      a: 'macOS 13 Ventura 이상에서 동작하며 Apple Silicon(M1/M2/M3/M4)과 Intel Mac을 모두 지원합니다.',
    },
    {
      q: '어떤 권한이 필요한가요?',
      a: '화면 녹화 권한(캡처·화면/GIF 녹화·스크롤 캡처)과 손쉬운 사용 권한(UI 자동 감지·화면 자 요소 측정·스텝 가이드 클릭 감지)이 필요합니다.',
    },
    {
      q: '사용 데이터를 수집하나요?',
      a: '설치·사용자 수를 세기 위해 하루 한 번 무작위 설치 ID·앱 버전·macOS 버전만 보냅니다. 환경설정의 "익명 사용 통계 보내기"를 끄면 보내지 않습니다.',
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
      q: 'What is ASIS?',
      a: 'ASIS is a free, open-source screenshot and annotation app for macOS. It takes area, window, and full-screen captures, scrolling captures, screen and GIF recordings, and step-by-step guides, and lets you mark them up right away with arrows, boxes, text, and blur before copying them to the clipboard or pinning them on screen.',
    },
    {
      q: 'How do I take a scrolling screenshot on a Mac?',
      a: 'Start ASIS’s scrolling capture from the menu bar icon or its shortcut, select the area, and scroll yourself. Each time you stop, ASIS matches the overlap and stitches everything into one long image — it lines up pages with sticky headers and footers too.',
    },
    {
      q: 'How do I annotate a screenshot on a Mac?',
      a: 'The annotation editor opens right after each capture. Switch between 12 tools with single-key shortcuts — Select (V), Rectangle (R), Circle (O), Arrow (A), Line (L), Pen (P), Text (T), Number (S), Highlight (H), Blur (B), Mosaic (M), and Eraser (E) — then press ⌘C to copy the result. Use Blur or Mosaic to hide sensitive information.',
    },
    {
      q: 'Can I record my Mac screen as a GIF?',
      a: 'Yes. Pick an area with screen and GIF recording; the border shown around it is not included in the output. When you stop, choose to edit in GIF Studio (default), save to a file, or copy straight to the clipboard. GIF Studio lets you annotate frame by frame, trim, and set size, speed, FPS, and quality — and it can open videos such as MOV, MP4, and WebM to turn them into GIFs.',
    },
    {
      q: 'Can I make a step-by-step guide from my clicks?',
      a: 'Yes. While a step guide is recording, every click adds the screen as a new step with a red circle where you clicked. Edit the title, description, and per-step captions, annotate each step, and save it all as a single HTML file anyone can open in a browser.',
    },
    {
      q: 'Is it free?',
      a: 'Yes. ASIS is free and open source under the MIT license.',
    },
    {
      q: 'Which versions of macOS does it run on?',
      a: 'It runs on macOS 13 Ventura or later and supports both Apple Silicon (M1/M2/M3/M4) and Intel Macs.',
    },
    {
      q: 'What permissions does ASIS need?',
      a: 'Screen Recording (for captures, screen/GIF recording, and scrolling capture) and Accessibility (for automatic UI detection, ruler element measurement, and step guide click detection).',
    },
    {
      q: 'Does ASIS collect usage data?',
      a: 'To count installs and users, it sends only a random install ID, the app version, and the macOS version once a day. Turn off "Send anonymous usage statistics" in Settings to stop it.',
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
