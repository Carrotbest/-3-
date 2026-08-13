# R31 — CONSTRUCTION GUIDE 제거 + 다크모드 제거

브리핑 확정: CONSTRUCTION GUIDE는 데이터로 설계 제한 불가라 빼기로 함. 다크모드는 "필요 없다, 밝은 게 깔끔"이라 제거(항상 라이트).

## 1. CONSTRUCTION GUIDE 제거
- `src/routes/route-config.ts`의 `routeDefinitions`에서 CONSTRUCTION GUIDE 항목(경로 `/construction-guide`) 삭제. 사이드바가 이 목록에서 생성되면 자동으로 사라진다. 하드코딩된 참조가 있으면 함께 제거.
- `src/App.tsx`에서 해당 라우트가 `PlaceholderPage`로 매핑되는 부분은 `routeDefinitions` 기반이면 그대로 두면 되고, `IMPLEMENTED_ROUTES` 등에 하드코딩돼 있으면 정리.
- HOME의 Quick access/Trend issue 등에서 CONSTRUCTION GUIDE로 가는 링크·카드가 있으면 제거(`src/routes/Home.tsx`). 없으면 넘어간다.
- 사이드바 컴포넌트(`src/components/layout/AppSidebar.tsx`)에 CONSTRUCTION GUIDE가 하드코딩돼 있으면 삭제.

## 2. 다크모드 제거 (항상 라이트 고정)
- `src/App.tsx`: `dark` 상태·`readInitialTheme`·`THEME_STORAGE_KEY`·`document.documentElement.classList.toggle("dark", dark)` 관련 로직 제거. `document.documentElement`에 `dark` 클래스가 절대 안 붙게 한다(라이트 고정). `Topbar`에 넘기던 `dark`/`onToggleTheme` prop 제거.
- `src/components/layout/Topbar.tsx`: "다크 테마로 전환" 토글 버튼과 관련 prop 제거.
- `src/index.css`: `.dark { ... }` 토큰 오버라이드 블록은 남겨둬도 무해하지만(클래스가 안 붙으니), 깔끔히 하려면 제거해도 된다. **제거 시 다른 곳에서 `.dark` 셀렉터나 `dark:` 유틸에 의존하는 곳이 없는지 확인**하고, 있으면 라이트 기준으로 정리. 확신 없으면 `.dark` 블록은 그대로 두고 토글만 제거(더 안전).
- 코드 전반의 `dark:` Tailwind 유틸(예: 상태 칩 `dark:text-...`)은 그대로 둬도 됨(활성 안 되니 무해). 굳이 지우지 말 것.

## 검증
- 사이드바에 CONSTRUCTION GUIDE 없음. `/#/construction-guide` 직접 접근 시 홈으로 리다이렉트(기존 `*` 라우트 동작).
- 상단바에 테마 토글 버튼 없음. 새로고침해도 항상 라이트. `document.documentElement.classList`에 `dark` 없음.
- HOME·현황판·창고 등 주요 화면 라이트에서 정상.
- `npm run build` 통과.

## 절대 금지
- DD MASTER 현황판/접수 팝업/인라인 편집/창고 로직 회귀 금지.
- RDDA·HOME·TS·STUDY 기능 회귀 금지.
- `dark:` 유틸을 일괄 삭제하지 말 것(무해, 회귀 위험만 큼).
- git commit/reset/checkout 금지. 실제 데이터 값을 로그·문서에 남기지 마라.
