# Folder Structure — 도메인 기준 분할 + 내부 5종 규칙

## Rule

### 1) 최상위 — **도메인** 으로 나눈다

기능(feature) 단위가 아니라 **도메인** 단위로 1차 폴더를 자른다.
도메인 폴더는 자기 내부에 아래 다섯 종류의 하위 폴더만 가진다.

```
<domain>/
  component/
  hook/
  lib/
  types/
  asset/
```

도메인 폴더의 이름은 kebab-case (예: `dashboard/`, `capture-history/`).

### 2) 내부 규칙

| 하위 폴더    | 무엇을 두는가                                                                          | 네이밍         |
| ------------ | -------------------------------------------------------------------------------------- | -------------- |
| `component/` | 도메인의 UI 컴포넌트. 코드 스플리팅이 필요한 단위는 **하위 폴더 + `index`** 로 나눈다. | **PascalCase** |
| `hook/`      | 컴포넌트의 비즈니스 로직 / state 관련 훅                                               | **camelCase**  |
| `lib/`       | 외부 라이브러리 설정, 유틸 함수, 비즈니스 로직과 직접 관련 없는 **순수 함수**          | **kebab-case** |
| `types/`     | 도메인·컴포넌트의 타입 정의                                                            | kebab-case     |
| `asset/`     | 이미지, 폰트, 스타일                                                                   | kebab-case     |

### 3) `component/` 의 코드 스플리팅 기준

- 단일 파일로 충분한 컴포넌트 → `component/Foo.tsx` 하나.
- 내부에 부속 컴포넌트가 여러 개라면 → `component/Foo/index.tsx` + `component/Foo/Bar.tsx` … 처럼 **PascalCase 폴더 + `index`** 로 묶는다.
- 하위 폴더 안에서도 도메인 단위로 더 쪼개진다면 동일한 5종 구조를 재귀적으로 따른다 (필요할 때만).

## ❌ 안 좋은 예

```
src/renderer/dashboard/
  DashboardPage.tsx        # ❌ component/ 안에 두지 않음
  useDashboardData.ts      # ❌ hook/ 안에 두지 않음
  formatNumber.ts          # ❌ lib/ 안에 두지 않음
  Sidebar/
    sidebar.tsx            # ❌ 폴더 PascalCase 인데 파일은 camelCase
```

```
src/renderer/
  components/              # ❌ 도메인 무관한 공용 components/ 폴더
  hooks/
  utils/
```

## ✅ 좋은 예

```
src/renderer/dashboard/
  component/
    index.tsx              # 도메인 entry
    Header.tsx
    Sidebar/
      index.tsx
      MenuItem.tsx
  hook/
    useDashboardData.ts
    useSidebarToggle.ts
  lib/
    format-number.ts
    chart-config.ts
  types/
    dashboard.ts
  asset/
    icon-pin.svg
    dashboard.css
```

## Why

- **도메인 중심**: 화면/기능이 늘어나도 import 경로가 도메인을 따라 안정적이다.
  공용 `components/`·`utils/` 가 부풀어 오르며 무엇이 어디 속하는지 흐려지는
  현상을 막는다.
- **5종 고정**: 한 도메인 폴더 안에서 무엇이 어디 있는지 예측 가능하다.
  새 파일을 둘 자리를 고민하지 않게 한다.
- **네이밍 분리**: PascalCase (component) / camelCase (hook) / kebab-case (lib·
  types·asset) 로 파일만 봐도 역할이 드러난다.
- **`index` 분리**: 단일 파일이면 PascalCase 한 개, 여러 부속이 생기면 같은
  이름의 PascalCase **폴더 + `index`** 로 자연스럽게 승격된다 — import 경로가
  바뀌지 않는다.

## 적용 범위

- 신규로 추가하는 도메인 폴더부터 강제.
- 기존 폴더(`src/renderer/editor`, `selection`, `recorder` 등) 는 점진 마이그
  레이션. 새 파일을 추가할 때 이 구조에 맞춰 자리를 만든다.
- `src/main/` (Electron main process) 는 renderer 의 5종 규칙(component/hook/
  lib/types/asset) 대상이 아니다 — UI 가 없는 인프라 계층이라 그 분류가 안
  맞는다. 대신 **기능(feature) 단위로 폴더를 나눈다**:
  - 여러 파일로 구성되거나 독립적으로 찾아볼 일이 있는 기능은 kebab-case
    폴더로 묶는다 (예: `capture/`, `scroll-capture/`, `step-guide/`,
    `time-machine/`, `video/`, `ocr/`, `patch-notes/`).
  - 앱 전역에서 공유되는 코어 인프라(`index.ts`, `settings.ts`,
    `shortcuts.ts`, `tray.ts`, `menu.ts`, `permissions.ts`,
    `captureHistory.ts`, `updateChecker.ts`, `runProcess.ts`,
    `windowsInfo.ts` 등)와 모든 `BrowserWindow` lifecycle 매니저를 모으는
    `windows/` 는 최상위에 그대로 둔다 — 이들은 특정 기능에 속하지 않거나
    (`runProcess`, `windowsInfo`), 이미 "윈도우 매니저" 라는 자체 그룹으로
    묶여 있어(`windows/`) 기능별로 재분산하면 오히려 찾기 어려워진다.
  - 폴더 안 파일 네이밍은 renderer 의 kebab-case 강제를 따르지 않는다 —
    main 은 클래스/함수 파일이 대부분이라 기존처럼 camelCase 유지
    (예: `step-guide/stepGuide.ts`, `time-machine/timeMachine.ts`).

## 자동 적용

ESLint로 강제하기 어렵다 — PR 리뷰의 영역.
보조 가능한 도구가 필요하면 `eslint-plugin-boundaries` 또는 단순 `ls`
스크립트로 도메인 폴더의 하위 폴더 화이트리스트를 검사할 수 있다 (향후 검토).
