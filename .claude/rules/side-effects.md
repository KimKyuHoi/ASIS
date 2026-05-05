# Side effect 분류 — useEffect는 마지막 선택

## Rule

| Side effect 종류                          | 도구                   | 위치                 |
| ----------------------------------------- | ---------------------- | -------------------- |
| React state와 직접 동기화                 | `useEffect`            | 컴포넌트 / 커스텀 훅 |
| 외부 store·시스템에서 React가 상태를 읽음 | `useSyncExternalStore` | 컴포넌트 / 커스텀 훅 |
| React가 상태 안 읽음, lifecycle 독립      | **Class**              | 모듈 / main process  |

## ❌ 안 좋은 예

```tsx
// 글로벌 IPC 이벤트 구독을 useEffect로 — race·tearing 위험
function CaptureWatcher() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const handler = () => setCount((c) => c + 1)
    window.electron.on('capture:done', handler)
    return () => window.electron.off('capture:done', handler)
  }, [])
  return <div>{count}</div>
}
```

## ✅ 좋은 예

### State 동기화 → useEffect

```ts
useEffect(() => {
  document.title = `${shapes.length}개 도형`
}, [shapes.length])
```

### React가 외부 상태를 읽음 → useSyncExternalStore

```ts
// IPC 채널을 store로 감싸서 노출
const captureCount = useSyncExternalStore(ipcStore.subscribe, ipcStore.getCaptureCount)
```

### React 무관한 lifecycle → Class

```ts
// src/main/tray.ts — main process 모듈 스코프 single instance
export class TrayManager {
  private tray: Tray | null = null
  start() {
    this.tray = new Tray(icon)
    /* ... */
  }
  stop() {
    this.tray?.destroy()
    this.tray = null
  }
}
```

## Why

- `useEffect`를 외부 시스템 구독에 쓰면 tearing/race/double-fire 문제가 생긴다.
- `useSyncExternalStore`는 그 문제를 위해 설계됐고 concurrent rendering에서 안전하다.
- 진짜로 React lifecycle과 무관한 객체(Tray, GlobalShortcut, IPC manager)는
  React 안에 끌어들이지 않고 모듈 스코프 Class로 두면 lifecycle이 명확해진다.

## Class 선택 — 잘 맞는 경우와 짐이 되는 경우

판별 질문: **"이 객체를 React 없이 단위 테스트로 의미 있게 검증할 수 있는가?"**
Yes 면 Class, No (테스트 setup이 React 흉내를 잔뜩 내야 함) 면 React 안 (effect / reducer) 으로 가는 게 솔직하다.

### Class가 잘 맞는 경우

- React 데이터 흐름과 거의 무관한 외부 리소스 (Tray, globalShortcut, IPC 매니저, 캡처 파이프라인 등).
- 모듈 스코프 싱글턴이거나, 한 컴포넌트가 ref로 들고 있어도 자기 lifecycle을 가진다.
- 인스턴스가 자기 상태를 관리하고, React는 메서드 호출(켜고 끄기)과 `useSyncExternalStore` 를 통한 읽기로만 접근한다.

### Class가 오히려 짐이 되는 경우

- 인스턴스의 동작 로직 자체가 여러 props/state의 조합으로 결정될 때.
- props 변경 → `useEffect` → `instance.update(props)` 어댑터를 계속 써야 하는 흐름.
- 이 어댑터가 결국 deps와 stale closure 관리 비용을 그대로 떠안는다 — 차라리 effect 본문 + `useReducer` + 함수형 업데이터가 더 솔직하고 짧다.

## 자동 적용

ESLint로 직접 강제하기 어렵다 — PR 리뷰의 영역. `react-hooks/exhaustive-deps`는 켜져 있다.
