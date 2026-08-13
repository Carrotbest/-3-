# R32 — 전역 레이아웃 정리 + 사이드바 개편

## 목적
모든 화면의 상단을 정리해 콘텐츠를 위로 끌어올리고, 페이지 제목을 상단바로 이동한다.
사이드바 접힘/펼침 버튼을 로고(FABRIC R&D) 영역으로 옮기고 메뉴를 목적 기준으로 재편한다.

대상: `src/App.tsx`, `src/components/layout/Topbar.tsx`, `src/components/layout/PageHeader.tsx`,
`src/components/layout/AppSidebar.tsx`, `src/routes/route-config.ts`.
**DD 마스터 시트(`src/routes/DevelopmentMasterSheet.tsx`)는 이 작업에서 건드리지 말 것(R33에서 처리).**

---

## 1. 검색 섹션 삭제 + 상단바에 페이지 제목 배치 — `Topbar.tsx`
현재 Topbar는 (a) 사이드바 토글(Menu 아이콘) (b) 가운데 검색 입력(⌘K)으로 구성된다.

- **검색 입력 블록 전체 삭제**: `<div className="group relative max-w-md flex-1">…</div>`(Search 아이콘 + Input + `kbd ⌘K`). `useRef`/`useEffect`(⌘K 단축키), `Search`·`Input` import 도 함께 제거.
- **검색이 있던 자리에 현재 화면 제목을 표시**한다.
  - `useLocation()`으로 `pathname`을 얻고, `routeDefinitions`(`@/routes/route-config`)에서 매칭되는 정의를 찾는다.
    - 먼저 `def.path === pathname` 정확히 일치하는 항목, 없으면 `pathname.startsWith(def.path)` 중 **가장 긴 path**를 선택(중첩 라우트 대비). 없으면 제목 빈 문자열.
  - 렌더: 제목(`text-base font-semibold tracking-tight text-[var(--foreground)] truncate`) + 그 아래 부제(`text-xs text-[var(--muted-foreground)] truncate`, 값 있을 때만). 좌측 정렬, `min-w-0 flex-1`로 넘침 방지.
- **모바일 메뉴 버튼은 유지하되 데스크톱에서 숨긴다**: 기존 사이드바 토글 `<Button>`(Menu)에 `className`으로 `lg:hidden` 추가. 이 버튼은 모바일에서 닫힌 사이드바를 여는 유일한 수단이므로 **삭제 금지**. `aria-label`은 "메뉴 열기"로.
- Topbar의 `onToggleSidebar` prop 시그니처는 그대로 둔다(모바일 버튼이 계속 사용).

결과: 데스크톱 상단바 = [제목/부제]만. 모바일 상단바 = [☰ 메뉴][제목].

## 2. 데이터 출처줄 삭제 — `App.tsx`
- `<DataSourceBar />` 렌더 제거, `import { DataSourceBar }` 제거.
- `src/components/layout/DataSourceBar.tsx` 파일은 삭제하지 말고 그대로 둔다(참조만 제거). 출처 정보는 `/sync` 화면에 이미 존재한다.
- 이로써 콘텐츠가 상단바 바로 아래에서 시작한다(≈44px 상승). 추가 패딩 조정은 하지 말 것.

## 3. PageHeader에서 제목/부제 제거(액션만) — `PageHeader.tsx`
제목이 상단바로 옮겨졌으므로 페이지 내부의 중복 제목을 없앤다.
- `PageHeader`가 **액션(actions)만** 우측 정렬로 렌더하도록 변경:
  - `title` h1과 `subtitle` p를 렌더하지 않는다. props 시그니처(`title`, `subtitle?`, `actions?`)는 **그대로 유지**(호출부 12곳 수정 불필요). `title`은 접근성용으로 `<header aria-label={title}>`에만 사용.
  - `actions`가 없으면 `return null`(빈 헤더/여백 방지).
  - 있으면 `<header aria-label={title} className="mb-4 flex items-center justify-end gap-2">{actions}</header>` 형태.
- 호출하는 라우트 파일들은 수정하지 않는다.

## 4. 사이드바 접힘/펼침 버튼 이동 + 이모지 — `AppSidebar.tsx`, `App.tsx`
- `App.tsx`: `AppSidebar`에 데스크톱 접힘 토글 핸들러를 새 prop `onToggleCollapsed`로 전달한다.
  - `const toggleCollapsed = () => setSidebarCollapsed((c) => !c)` 를 만들어 전달. (기존 `handleSidebarToggle`는 Topbar 모바일 버튼용으로 유지.)
- `AppSidebar.tsx`: props에 `onToggleCollapsed: () => void` 추가.
  - 로고 헤더(`<div className="flex h-16 items-center gap-3 px-5 …">` — Avatar + FABRIC R&D 텍스트)의 **우측 가장자리**에 접힘/펼침 버튼을 배치한다.
    - 이 헤더를 `relative`로 만들고, 버튼은 `absolute right-2 top-1/2 -translate-y-1/2`(펼침 상태) 정도로 가장자리에 둔다. `collapsed`일 때는 아바타만 가운데 오므로 버튼을 `right-1`로 두거나 헤더 하단 중앙 등 항상 클릭 가능한 위치에 유지한다(off-screen 금지).
    - 데스크톱 전용: `hidden lg:flex`. 모바일 토글은 Topbar가 담당.
    - **아이콘은 lucide가 아니라 이모지**를 쓴다: 펼침(collapsed=false)일 때 `◀️`, 접힘(collapsed=true)일 때 `▶️`. `<span aria-hidden>{collapsed ? "▶️" : "◀️"}</span>` + `aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}`.
    - `onClick={onToggleCollapsed}`. 버튼 스타일은 기존 사이드바 버튼 톤(작은 정사각, hover 배경)과 맞춘다.
- 기존 DEVELOPMENT 하위 메뉴 토글(ChevronDown 버튼)은 그대로 둔다.

## 5. 메뉴 재구성(목적 기준) — `route-config.ts`
`navigationGroups`를 아래 순서/그룹으로 재편한다. **경로(path)·아이콘 import·children 구조는 유지**하고 그룹 분류/라벨/순서만 바꾼다. `routeDefinitions` 배열은 수정하지 않는다.

```
개요
  - HOME (/)
개발 업무
  - DEVELOPMENT (/development) [children: Overview, DD 마스터, EU, Season, Core, Project]
  - RDDA REPORT (/rdda)
  - FABRIC ANALYSIS (/fabric-analysis)
기술 지원
  - TS 관리 (/ts)
  - STUDY 과제 (/study)
샘플 · 일정
  - 샘플 창고 (/warehouse)
  - CALENDAR (/calendar)
트렌드 · 혁신
  - MACRO TREND (/trend/macro)
  - FABRIC TREND (/trend/fabric)
  - PORTFOLIO (/trend/portfolio)
  - PROCESS INNOVATION (/process-innovation)
시스템
  - 데이터 상태 (/sync)
  - SETTING (/setting)
```
- 각 항목의 `icon`은 기존에 쓰던 것을 그대로 유지(예: 데이터 상태=RefreshCw, SETTING=Settings 등). 새 아이콘 도입 불필요.
- DEVELOPMENT children 순서/라벨/path 유지.

---

## 검증
- `npm run build`(tsc + vite) 통과.
- 데스크톱: 상단바에 검색 없음·제목 표시, 데이터 출처줄 없음, 로고 옆 가장자리 이모지 버튼으로 사이드바 접힘/펼침 동작. 접힌 상태에서도 버튼 클릭 가능.
- 모바일(<1024px): 상단바 ☰ 버튼으로 사이드바 열림/닫힘 정상.
- 각 화면 콘텐츠가 상단바 바로 아래에서 시작하고, 페이지 내부에 중복 제목이 없다. 액션 버튼(예: HOME·창고의 업로드 버튼)은 그대로 우측에 남는다.
- 사이드바 메뉴가 새 그룹/순서로 표시된다.

## 절대 금지
- `src/routes/DevelopmentMasterSheet.tsx` 및 DD 마스터 로직 변경 금지(R33에서 처리).
- 라우트 경로(path) 변경·삭제 금지, `routeDefinitions` 변경 금지, PageHeader 호출부(라우트 파일) 수정 금지.
- 다크모드/CONSTRUCTION GUIDE 관련 되돌리기 금지(R31 상태 유지).
- git commit/reset/checkout 금지. 실제 데이터 값을 로그·문서에 남기지 말 것.
