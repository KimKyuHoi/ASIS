export type FaqEntry = { q: string; a: string };

/** 정적 FAQ — 검증된 사실만 담는다(라이선스·지원 OS·기여·캡처 시작). */
export const FAQ_ENTRIES: FaqEntry[] = [
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
    a: '어느 앱에서든 ⌥ Space 단축키로 영역 캡처를 시작할 수 있습니다. 캡처 직후 어노테이션 에디터가 열립니다.',
  },

];
