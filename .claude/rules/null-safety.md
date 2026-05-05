# Null/undefined silent failure 금지

## Rule

일어나면 안 되는 null/undefined를 `?.`나 `??`로 슬쩍 무마하지 않는다.
non-null assertion (`x!`) 도 금지 (`@typescript-eslint/no-non-null-assertion`).

## ❌ 안 좋은 예

```ts
// editor가 null이면 silently 'rect'로 fallback — 버그를 늦게 발견시킴
const editor = useStore((s) => s.editor)
const tool = editor?.activeTool ?? 'rect'
```

```ts
// element가 없을 수 있는데 ! 로 단언 — 런타임에 null pointer
const root = document.getElementById('root')!
createRoot(root).render(/* ... */)
```

```ts
// 빈 catch — 무엇이 실패했는지 사라짐
try {
  await capture()
} catch {}
```

## ✅ 좋은 예

```ts
// 실제로 null이 오면 안 되는 자리 → invariant
const editor = useStore((s) => s.editor)
if (!editor) throw new Error('editor must be initialized')
const tool = editor.activeTool
```

```ts
// 실제로 옵셔널인 자리 → 의도를 코드와 주석으로 표현
// 첫 캡처 전에는 editor가 null. 그때는 'rect'로 시작한다.
const tool = editor?.activeTool ?? 'rect'
```

```ts
// 무시해도 되는 에러는 이유를 명시
try {
  await capture()
} catch (err) {
  // 캡처 취소(ESC)는 정상 종료 — 에디터 띄우지 않고 끝낸다
  if (!isCaptureCanceled(err)) throw err
}
```

## 핵심

- "여기 null 와도 그냥 넘어가면 되는 거지?" 라고 _생각만_ 하고 `??`/`?.`를 넣지 않는다.
- 정말로 옵셔널이라면 그 의도를 주석/타입으로 드러낸다.
- 아니라면 throw — 버그는 빨리 죽는 게 빨리 고쳐진다.
