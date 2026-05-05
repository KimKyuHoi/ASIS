# React Compiler — 수동 메모이제이션 금지

## Rule

다음을 사용하지 않는다:

- `useMemo`
- `useCallback`
- `React.memo` / `memo`

## Why

이 프로젝트는 React 19 + React Compiler를 쓴다. Compiler가 컴파일 시점에 필요한
메모이제이션을 자동 삽입하므로, 수동 memo는 중복일 뿐이며 deps 배열 관리·디버깅
비용만 발생한다. Compiler 출력이 정답이고, 사람이 손대지 않는다.

## ESLint

`no-restricted-syntax` 가 사용을 차단한다. 위반 시 명시적 에러 메시지 표시.

```text
useMemo는 사용하지 않는다 — React Compiler가 자동 메모이제이션을 처리한다.
```

## 예외

없음. 정말로 필요한 케이스가 발견되면 PR에서 의논 후 룰을 갱신한다.
