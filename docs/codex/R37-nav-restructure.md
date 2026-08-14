# R37 — 사이드바 내비게이션 재편 (Development 하위 정리 · 명칭 영문화 · 그룹 재배치)

대상: `src/routes/route-config.ts`(내비 구조·라우트 타이틀), `src/components/layout/AppSidebar.tsx`(펼침 로직 일반화), 일부 페이지 헤더 하드코딩(`src/routes/Study.tsx`, `src/routes/Warehouse.tsx`).

라우팅 경로(`path`)는 **바꾸지 않는다**(기존 화면 그대로 재사용). 이번 작업은 **메뉴 구조·라벨·타이틀 재편**이다.

---

## 목표 내비 트리 (최종형)

그룹과 항목을 아래로 재구성한다. (그룹 라벨은 제안값이며 유지)

1. **개요**
   - HOME → `/`
2. **개발**
   - DEVELOPMENT → `/development`  *(children 없음. 이 페이지 = 기존 Overview 화면)*
   - **DD MASTER** → `/development/workspace`  *(children 보유)*
     - EU → `/development/eu`
     - SEASON → `/development/season`
     - CORE → `/development/core`
     - PROJECT → `/development/project`
   - WAREHOUSE → `/warehouse`
3. **기술 · 분석**
   - TROUBLE SHOOTING → `/ts`
   - FABRIC STUDY → `/study`
   - RDDA REPORT → `/rdda`
   - FABRIC ANALYSIS → `/fabric-analysis`
4. **트렌드 · 일정**
   - FABRIC TREND → `/trend/fabric`
   - PORTFOLIO → `/trend/portfolio`
   - PROCESS INNOVATION → `/process-innovation`
   - CALENDAR → `/calendar`
5. **시스템**
   - DATA → `/sync`
   - SETTING → `/setting`

### 사용자 요구 매핑(근거)
- **Overview를 Development 메인으로, "Overview" 항목 삭제**: 기존 DEVELOPMENT의 children에서 `{label:"Overview", path:"/development"}` 제거. DEVELOPMENT는 children 없는 단일 항목이 되고 `/development`(= 기존 Overview 화면)로 직접 이동. (라우팅상 이미 `/development`가 Overview이므로 화면 이동 없음, 메뉴만 정리.)
- **DD 마스터 → DD MASTER 영문화 + 메인 카테고리화 + 하위 EU/SEASON/CORE/PROJECT**: `DD MASTER`를 `개발` 그룹의 독립 항목으로 올리고 `path:"/development/workspace"`, children으로 EU/SEASON/CORE/PROJECT(경로 그대로)를 붙인다.
- **TS 관리 → TROUBLE SHOOTING** (2번)
- **STUDY 과제 → FABRIC STUDY** (3번)
- **샘플 창고 → WAREHOUSE, DD MASTER 바로 아래 배치** (4번): `개발` 그룹에서 DD MASTER 다음 항목으로 WAREHOUSE 배치.
- 표 반영 추가분: RDDA REPORT·FABRIC ANALYSIS를 `기술 · 분석` 그룹으로, CALENDAR를 `트렌드 · 일정` 그룹으로 이동. `데이터 상태` → `DATA`로 라벨 변경.

---

## Task 1 — `route-config.ts` 내비 그룹 재작성

`navigationGroups`를 위 목표 트리대로 재구성한다.
- DEVELOPMENT 항목의 `children` 제거.
- DD MASTER 신규 항목 추가(`label:"DD MASTER"`, `path:"/development/workspace"`, `children:[EU, SEASON, CORE, PROJECT]`). 아이콘은 lucide에서 적절한 것(예: `LayoutGrid` 또는 `Table`/`Sheet`) import해 사용.
- WAREHOUSE: 라벨 `"샘플 창고"` → `"WAREHOUSE"`, 위치를 `개발` 그룹 DD MASTER 아래로.
- TROUBLE SHOOTING(구 TS 관리), FABRIC STUDY(구 STUDY 과제): 라벨 변경 후 `기술 · 분석` 그룹으로.
- RDDA REPORT, FABRIC ANALYSIS: `기술 · 분석` 그룹으로 이동(라벨 유지).
- CALENDAR: `트렌드 · 일정` 그룹으로 이동.
- DATA: 라벨 `"데이터 상태"` → `"DATA"`, `시스템` 그룹.
- 아이콘은 기존 매핑 최대한 유지(Wrench=TROUBLE SHOOTING, BookOpenCheck=FABRIC STUDY, ClipboardList=RDDA, Microscope=FABRIC ANALYSIS, Waves=FABRIC TREND, Layers3=PORTFOLIO, Workflow=PROCESS INNOVATION, CalendarDays=CALENDAR, Settings=SETTING, Boxes=WAREHOUSE). DATA 아이콘은 `Database` 등으로 교체 가능.

### `routeDefinitions` 타이틀/서브타이틀 갱신(= Topbar 표시명)
Topbar가 `routeDefinitions`에서 `pathname` 매칭으로 타이틀/서브타이틀을 찾는다. 다음을 갱신:
- `/development/workspace` title `"DEVELOPMENT · DD 마스터"` → `"DD MASTER"`.
- `/development/eu|season|core|project` title `"DEVELOPMENT · EU"` 등 → 일관되게 `"DD MASTER · EU"` 등으로(선택이지만 권장).
- `/ts` title `"TS 관리"` → `"TROUBLE SHOOTING"`.
- `/study` title `"STUDY 과제"` → `"FABRIC STUDY"`.
- `/warehouse` title `"샘플 창고 관리"` → `"WAREHOUSE"`.
- `/sync` title `"데이터 상태"` → `"DATA"`.
- (선택) `/rdda` 서브타이틀에 "월별 현황", `/fabric-analysis` 서브타이틀에 "조직도 분석 프로그램" 취지 반영.

---

## Task 2 — `AppSidebar.tsx` 펼침 로직 일반화 (다중 부모 지원 + 정확한 active/exact 매칭)

현재 하위 메뉴 펼침이 단일 `developmentOpen`/`developmentActive`(= `pathname.startsWith("/development")`)로 하드코딩되어 있고, children 링크 `end`·aria-label이 DEVELOPMENT 전용이다. 이를 **항목별로 일반화**한다.

- **펼침 상태를 항목별로**: `const [openMap, setOpenMap] = useState<Record<string, boolean>>({})` 같은 형태로 `item.path`를 키로 관리. 토글 시 해당 키만 반전.
- **부모 active 판정(항목별)**: 해당 item이 active인지 = `pathname === item.path || item.children.some((c) => pathname === c.path)`. (구 `startsWith("/development")` 제거 — 이제 `/development`(Overview)는 DEVELOPMENT 단일 항목이고, DD MASTER는 `/development/workspace` 및 하위만 active여야 함.)
- **기본 펼침**: 마운트/경로변경 시 active인 부모는 자동 펼침(open)되게 한다(현재 위치의 상위 그룹이 열려 보이도록). 예: `openMap[item.path] ?? isParentActive(item)`.
- **aria-label 동적화**: `"DEVELOPMENT 하위 메뉴"` → `` `${item.label} 하위 메뉴` ``.
- **children NavLink `end`**: `end={child.path === "/development"}` → children은 모두 정확 매칭이면 되므로 `end` 상시 적용(또는 각 child 정확 매칭). 특히 `/development/workspace`가 active일 때 DD MASTER child만 활성.
- **DEVELOPMENT 단일 링크 exact**: DEVELOPMENT는 children이 없어졌으니 `SidebarLink`로 렌더된다. `/development`가 `/development/workspace` 등 하위에서도 활성으로 뜨지 않도록 **정확 매칭(`end`)** 을 적용한다. `SidebarLink`의 `end` 규칙을 `item.path === "/" || item.path === "/development"`(또는 children 없고 다른 항목의 접두어가 되는 경로) 로 확장하거나, DEVELOPMENT에 한해 exact 처리.
- 접힘(collapsed) 상태 동작·스타일·애니메이션(grid-rows 트랜지션 등)은 기존 그대로 유지하되 위 일반화만 반영.

---

## Task 3 — 페이지 헤더 하드코딩 명칭 정리
- `src/routes/Study.tsx`: `PageHeader title="STUDY 과제"` → `"FABRIC STUDY"`.
- `src/routes/Warehouse.tsx`: `PageHeader title="SAMPLE WAREHOUSE"` → `"WAREHOUSE"`.
- TS 화면은 별도 PageHeader 타이틀 하드코딩이 없으면 Topbar(routeDefinitions) 갱신으로 충분 — 확인 후 필요시에만 수정.
- DD MASTER 시트의 PageHeader가 이미 `"DD MASTER"`인지 확인(그렇다면 유지).

---

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후 확인).
- **라우팅 경로 변경 금지**(기존 화면 유지). 데이터/store/derive 로직 변경 금지.
- 사이드바 접힘/펼침·모바일 동작·활성 하이라이트가 모든 그룹에서 정상인지 육안 확인(특히 DD MASTER 펼침·EU/SEASON/CORE/PROJECT active, DEVELOPMENT는 `/development`에서만 active).
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R37-last.txt`에 남기고 변경 파일·펼침 일반화 방식·잔여 이슈를 기록.
