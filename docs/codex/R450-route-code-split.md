# R450 — 화면을 쓸 때 받는다 (라우트 코드 분할)

상태: 미착수. R446 부터 R449 까지가 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

고치는 파일은 `src/App.tsx` 하나다. 다른 파일은 열지 마라.

---

## 0. 무엇이 문제인가

`src/App.tsx` 25~41행이 **모든 화면을 정적으로 불러온다.**

```ts
import { Development } from "@/routes/Development"
import { Home } from "@/routes/Home"
...
import { TrendMacro } from "@/routes/TrendMacro"
```

45행의 `Meta` 하나만 `lazy` 다.

```ts
const Meta = lazy(() => import("@/routes/Meta").then((module) => ({ default: module.Meta })))
```

그래서 HOME 만 보는 사람도 창고, 요청, 원가계산, TS, TREND 화면 코드를 전부 받는다. 지금 `index.js` 가 3.38MB(gzip 1,010KB)다.

`Meta` 가 이미 그 방식으로 잘 돌고 있다. 같은 방식을 나머지 화면에 그대로 편다.

## 1. 고칠 것

### 1-1. 정적 import 를 `lazy` 로 바꾼다 (25~41행)

**`Home` 과 `PlaceholderPage` 는 정적으로 남긴다.** `Home` 은 첫 화면이라 쪼개면 흰 화면이 한 번 더 생긴다. `PlaceholderPage` 는 작고 여러 경로가 함께 쓴다.

지우는 import 는 열다섯이다.

```
Development, Rdda, TS, TechnicalReferences, BuyerProtocols, FabricAnalysis,
CostSheets, FabricDetail, FabricRequest, Warehouse, Calendar, Setting,
Portfolio, TrendFabric, TrendMacro
```

`Meta` 선언 아래에 같은 꼴로 열다섯 줄을 만든다. 전부 이름 내보내기라 `Meta` 와 똑같은 모양이다.

```ts
const Development = lazy(() => import("@/routes/Development").then((module) => ({ default: module.Development })))
const Rdda = lazy(() => import("@/routes/Rdda").then((module) => ({ default: module.Rdda })))
const TS = lazy(() => import("@/routes/TS").then((module) => ({ default: module.TS })))
const TechnicalReferences = lazy(() => import("@/routes/TechnicalReferences").then((module) => ({ default: module.TechnicalReferences })))
const BuyerProtocols = lazy(() => import("@/routes/BuyerProtocols").then((module) => ({ default: module.BuyerProtocols })))
const FabricAnalysis = lazy(() => import("@/routes/FabricAnalysis").then((module) => ({ default: module.FabricAnalysis })))
const CostSheets = lazy(() => import("@/routes/CostSheets").then((module) => ({ default: module.CostSheets })))
const FabricDetail = lazy(() => import("@/routes/FabricDetail").then((module) => ({ default: module.FabricDetail })))
const FabricRequest = lazy(() => import("@/routes/FabricRequest").then((module) => ({ default: module.FabricRequest })))
const Warehouse = lazy(() => import("@/routes/Warehouse").then((module) => ({ default: module.Warehouse })))
const Calendar = lazy(() => import("@/routes/Calendar").then((module) => ({ default: module.Calendar })))
const Setting = lazy(() => import("@/routes/Setting").then((module) => ({ default: module.Setting })))
const Portfolio = lazy(() => import("@/routes/Portfolio").then((module) => ({ default: module.Portfolio })))
const TrendFabric = lazy(() => import("@/routes/TrendFabric").then((module) => ({ default: module.TrendFabric })))
const TrendMacro = lazy(() => import("@/routes/TrendMacro").then((module) => ({ default: module.TrendMacro })))
```

**`import { Home } from "@/routes/Home"` 와 `import { PlaceholderPage } from "@/routes/PlaceholderPage"` 는 그대로 둔다.** `routeDefinitions`, `RouteErrorBoundary`, 레이아웃 컴포넌트, 데이터 모듈 import 도 전부 그대로 둔다.

### 1-2. 받는 동안 보여 줄 화면

`MetaFallback` 바로 아래에 더한다. `MetaFallback` 은 지우지 마라.

```ts
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
      화면을 불러오는 중입니다
    </div>
  )
}
```

### 1-3. `<Routes>` 를 `Suspense` 로 감싼다

지금:

```tsx
          {canViewCurrentPath ? <RouteErrorBoundary key={pathname}><Routes>
```

```tsx
          </Routes></RouteErrorBoundary> : <ScreenAccessDenied />}
```

바꿀 것:

```tsx
          {canViewCurrentPath ? <RouteErrorBoundary key={pathname}><Suspense fallback={<RouteFallback />}><Routes>
```

```tsx
          </Routes></Suspense></RouteErrorBoundary> : <ScreenAccessDenied />}
```

**`Routes` 안의 `<Route>` 줄은 하나도 고치지 마라.** `/meta` 의 안쪽 `Suspense` 와 `MetaFallback` 도 그대로 둔다. 중첩되어도 문제없고, 가상 오피스는 저만의 안내 문구를 쓰는 편이 낫다.

`/setting` 의 `isOwnerRaw ? <Setting /> : <ScreenAccessDenied />` 도 그대로 둔다.

## 2. 이 수정으로 안 되는 것 — 시도하지 마라

**`xlsx` 는 이 수정으로 못 뺀다.** `src/store/useAppStore.ts` 가 `../data/chemical` 을 정적으로 불러오고, 그 줄기를 타고 `xlsx-parsers`, `reconcile`, `tds-loader` 가 전부 딸려 온다. 넷 모두 `import * as XLSX from "xlsx"` 다. 화면마다 store 를 쓰므로 `xlsx` 는 어차피 첫 묶음에 남는다.

- `src/store/useAppStore.ts` 를 고치지 마라.
- `src/data/chemical.ts`, `xlsx-parsers.ts`, `reconcile.ts`, `tds-loader.ts` 를 고치지 마라.
- `xlsx` import 를 동적으로 바꾸지 마라. 지금 구조에서는 이득이 없고 파서가 깨질 수 있다.
- `vite.config.ts` 의 `manualChunks` 를 건드리지 마라.
- `exceljs` 는 이미 동적이다(`src/data/dd-export.ts` 등). 그대로 둬라.

## 3. 하지 말 것

- **동작을 바꾸지 마라.** 주소를 치면 같은 화면이 뜨고, 권한 차단도 전과 같아야 한다.
- `Home` 과 `PlaceholderPage` 를 `lazy` 로 바꾸지 마라.
- `RouteErrorBoundary` 의 `key={pathname}` 를 빼지 마라.
- `HashRouter`, `LoginGate`, `HomeGate` 를 고치지 마라.
- `src/routes/*` 의 파일을 고치지 마라. 워킹트리에 R446 과 R449 변경이 들어 있다.
- 다른 파일을 고치지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 4. 성공 기준

- `npm run build` 가 통과한다(`tsc --noEmit` 포함).
- `git status --short` 에서 바뀐 파일이 `src/App.tsx` 하나 더 늘지 않는다. `src/App.tsx` 는 R446 에서 이미 바뀌어 있다. 다른 파일이 새로 뜨면 안 된다.
- `src/App.tsx` 에 `lazy(` 가 16번 나온다(`Meta` 포함).
- `import { Home }` 과 `import { PlaceholderPage }` 가 정적으로 남아 있다.
- `<Routes>` 가 `<Suspense fallback={<RouteFallback />}>` 안에 있다.
- 빌드 결과에 `dist/assets/` 아래 화면별 청크가 여럿 생긴다.

보고에 **`npm run build` 가 찍은 청크 목록을 그대로 붙여라.** `index-*.js` 의 크기가 얼마나 줄었는지 보려는 것이다. 그 밖에는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
