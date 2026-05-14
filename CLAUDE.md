<!--
이 파일은 Claude Code가 프로젝트 작업 시 참고하는 지침서입니다.
사용자가 직접 규칙을 작성할 자리입니다. 빈 채로 두어도 됩니다.
-->

이 프로젝트는 캡처한 파일 내부에 다양한 드로잉과 도구들을 이용하여 보다 캡처 화면을 이해하기 쉽게 나타내기 위해 만들어진 프로젝트입니다.

이 프로젝트는 아래의 룰을 따릅니다. `.claude/rules/**` 의 모든 파일을 반드시 따라야 합니다.

@.claude/rules/react-compiler.md
@.claude/rules/null-safety.md
@.claude/rules/side-effects.md
@.claude/rules/imperative-style.md
@.claude/rules/communication-tone.md
@.claude/rules/pessimistic-review.md
@.claude/rules/folder-structure.md

## React 공식 문서 참조

React API·동작·패턴에 대해 확신이 없을 때는 `docs/react/` 하위의 YAML 문서를 먼저 확인한다.

| 카테고리             | 경로                               | 주요 주제                                                      |
| -------------------- | ---------------------------------- | -------------------------------------------------------------- |
| describing-the-ui    | `docs/react/describing-the-ui/`    | 컴포넌트, JSX, props, 조건부 렌더링, 리스트, 순수성, 렌더 트리 |
| adding-interactivity | `docs/react/adding-interactivity/` | 이벤트, state, 스냅샷, 큐잉, 배열·객체 업데이트                |
| managing-state       | `docs/react/managing-state/`       | state 구조, reducer, context, 상태 보존·초기화                 |
| escape-hatches       | `docs/react/escape-hatches/`       | ref, Effect, 커스텀 훅, Effect 의존성·라이프사이클             |

각 파일은 `title / description / learn / sections / recap` 구조의 YAML이다.
