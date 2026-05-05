# 비즈니스 로직 — 명령형 스타일 허용

## Rule

| 위치                                                   | 스타일                |
| ------------------------------------------------------ | --------------------- |
| 컴포넌트 함수의 **렌더 path** (JSX와 동기 계산)        | 순수/declarative 강제 |
| 컴포넌트의 **이벤트 핸들러·ref 콜백·effect 콜백** 내부 | 명령형 OK             |
| Class 내부, 모듈 함수, util, IPC 핸들러, main process  | 명령형 OK             |

## 적용 범위 — "비즈니스 로직"

- 도메인 상태 처리 (undo 스택, 도형 조작)
- 외부 시스템 통합 (캡처 파이프라인, IPC, 클립보드)
- 순수 유틸 함수 (좌표 변환, 포맷팅)
- main process 코드 전반 (Tray, Window, 인프라)

## ❌ 안 좋은 예

```tsx
// 렌더 path 안에 mutation
function Editor({ shapes }: { shapes: Shape[] }) {
  let i = 0
  while (i < shapes.length) {
    shapes[i].selected = false // ❌ 렌더 중 mutation
    i++
  }
  return <Stage>{/* ... */}</Stage>
}
```

## ✅ 좋은 예

```tsx
function Editor() {
  const shapes = useStore((s) => s.shapes)

  // ✅ 이벤트 핸들러 — 호출 시점이 렌더 외부 → 명령형 OK
  const onPointerDown = (e: PointerEvent) => {
    let i = shapes.length - 1
    while (i >= 0 && !hit(shapes[i], e)) i--
    if (i >= 0) selectShape(shapes[i].id)
  }

  // ✅ 렌더 path — declarative
  return (
    <Stage onPointerDown={onPointerDown}>
      {shapes.map((s) => (
        <Shape key={s.id} data={s} />
      ))}
    </Stage>
  )
}
```

```ts
// ✅ Class 내부 — for-of, mutation, early return 자유
class UndoStack {
  private past: Action[] = []
  push(a: Action) {
    if (this.past.length >= 100) this.past.shift()
    this.past.push(a)
  }
}

// ✅ 모듈 함수 — functional pipeline 강제 안 함. 의도 명확하면 명령형 OK
export function findHitShape(shapes: Shape[], pt: Point): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hit(shapes[i], pt)) return shapes[i]
  }
  return null
}
```

## Why

- 가독성과 의도 표현이 우선. functional pipeline을 강제하지 않는다.
- 도형 hit test, 좌표 변환, screencapture spawn 흐름 같은 imperative한 도메인은
  명령형이 더 직관적이다.
- 단, 컴포넌트 본문이 다시 호출됐을 때 같은 결과를 보장해야 하므로 렌더 path
  자체는 순수해야 한다. **이벤트 핸들러는 렌더 path가 아니다.**

## 자동 적용

ESLint로 부분적으로만 잡힌다 (`react-compiler/react-compiler` 가 일부 패턴 감지).
대부분 PR 리뷰의 영역.
