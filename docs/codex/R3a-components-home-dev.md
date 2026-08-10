# 작업지시 R3a — 공용 부품 + HOME·DEVELOPMENT 화면

전제: `docs/REACT_REBUILD.md` 읽기. R0(셸)·R2(로직 이식) 완료. `node_modules` 설치됨.
검증은 `npx tsc --noEmit` + `npm run build` (오프라인 동작).

## 먼저 읽을 것

- `src/store/useAppStore.ts` — 상태 훅. `useAppStore()` 로 records/ts/study/rdda/meta 등 접근.
- `src/data/schema.ts`, `src/data/derive.ts` — 타입과 집계 함수. **집계는 여기 함수를 쓴다. 화면에서 다시 계산하지 마라.**
- `src/data/format.ts` — 날짜·숫자 표기.
- `src/components/ui/*` — shadcn 컴포넌트(card·table·badge·tabs·button·input·checkbox·dropdown-menu·select).
- `src/routes/PlaceholderPage.tsx`, `src/routes/route-config.ts` — 기존 라우트 연결 방식.

## 1. 공용 부품 (src/components/) — 이게 모든 화면의 토대다

레퍼런스 스크린샷을 그대로 재현한다. 색은 **shadcn 토큰/차트 변수만** 쓴다(임의 hex 금지).

### `charts/` (Recharts 래퍼) — `import` 는 `recharts`
- **`Sparkline.tsx`** — 작은 라인(축·격자 없음). KPI 카드용. props: `data:number[]`, `tone`.
- **`AreaCard.tsx`** — 면적 차트. 오렌지(`--chart-1`)+틸(`--chart-2`) 그라디언트 fill. props: title, subtitle, data, series[].
- **`BarCard.tsx`** — 막대. 단일/그룹(오렌지·틸 페어), `stacked` 옵션.
- **`DonutCard.tsx`** — 도넛(가운데 총합 숫자). 색은 `--chart-1..5`.
- 모든 차트: `ResponsiveContainer`, 툴팁, 다크모드에서 축·격자색이 `--border`/`--muted-foreground` 따라가게.
  차트 색은 `getComputedStyle(document.documentElement).getPropertyValue('--chart-N')` 로 읽어 주입.

### `dashboard/`
- **`StatCard.tsx`** — 레퍼런스 KPI 카드. 구성: 좌상단 아이콘+라벨, 우상단 info(ⓘ tooltip),
  큰 숫자, 하위 캡션("Since last week" 류), 하단 행에 `Details` + 증감%(상승 초록↑/하락 빨강↓) + `Sparkline`.
  props: `{ icon, label, value, caption, deltaPct, spark:number[], info? }`.
- **`SectionCard.tsx`** — 제목+부제+우측 액션 슬롯을 가진 Card 래퍼(차트/표를 담는 큰 카드).

### `data-table/DataTable.tsx` — 레퍼런스 테이블 재현
- 제네릭. props: `columns`, `rows`, `getRowId`, `enableSelection?`, `pageSize?`, `toolbar?`.
- 헤더: 정렬 토글(aria-sort), 좌측 체크박스 열(전체선택), 행 체크박스.
- 하단: `Rows per page` select + `Page X of N` + 이전/다음 화살표(pagination).
- 셀 렌더는 `columns[i].cell?(row)` 로 위임(배지·버튼 넣을 수 있게).
- 넘칠 때 표만 가로 스크롤(`overflow-x-auto`), 페이지 본문은 안 밀리게.
- **DOM 을 MutationObserver 로 감시하지 마라.** 셀 커스텀은 `cell` 렌더 함수로만.
- **`StatusBadge.tsx`** — 상태 문자열 → shadcn Badge. 매핑:
  완료/Active/Success → 초록 계열, 지연/Suspended/Failed → 빨강(destructive),
  진행/Processing/Invited → 회색(secondary), 신규/New → 파랑 계열(outline+텍스트색).

## 2. HOME (`src/routes/Home.tsx`) — 레퍼런스 Dashboard 1 레이아웃

- **PageHeader**: 제목 "대시보드", 부제, 우측 액션(`동기화 상태` outline 버튼, `주간보고 복사` primary).
- **탭 pill**: 개요 / 분석(비활성 placeholder 가능).
- **StatCard 4장** (derive 기반):
  진행 중 개발 / 이번 주 완료 / 납기 임박 / 지연. 값은 `kpis(records)`. 스파크라인은 임의 추세 배열로.
- **AreaCard**: "개발 진행 추이" — `rdda.monthly` 의 registered/pickup 을 오렌지·틸 면적으로.
- **DonutCard 또는 BarCard**: 카테고리 분포(SEASON/CORE/EU/PROJECT) — `countBy` 또는 직접 집계.
- **하단 좌우**: 좌 = 내 담당/납기 임박 목록(작은 표 또는 리스트), 우 = 최근 알림 + 주간보고 2줄(`weeklyLines`) 복사 버튼.
- 레퍼런스처럼 카드 그리드로 촘촘하게. 여백·라운드·그림자는 shadcn 기본(Card)대로.

## 3. DEVELOPMENT (`src/routes/Development.tsx`) — 목록 중심

- 서브 라우트 `#/development`, `/development/:sub` (overview/eu/season/core/project).
  `sub` 로 카테고리 필터. 기존 로직(`filteredRecords` 개념)은 derive/schema 참고해 재현.
- **StatCard 4장**: 전체/진행/임박/지연 (현재 필터 기준 `kpis`).
- **탭 pill**: 목록 / 보드 / 타임라인. 우선 **목록**만 DataTable 로 완성하고, 보드·타임라인은 다음 묶음(R3b)에서.
  지금은 두 탭에 "다음 단계에서 제공" placeholder 를 둔다.
- **툴바**: 검색 input + 필터 select(시즌·카테고리·Buyer·담당·공정단계) + 초기화 버튼. 옵션은 데이터에서 추출.
- **DataTable**: 컬럼은 schema `DEFAULT_COLUMNS` + 상태 배지 열(`statusOf`). 행 클릭 → 우측 상세 시트
  (shadcn `sheet` 가 없으면 `npx shadcn add sheet` 대신 지금 있는 것으로 우측 고정 패널을 만들고 보고).
  상세엔 16개 항목 전부 + 원본 시트·행(`_src`).
  **shadcn `sheet` 는 이미 설치돼 있다**(`src/components/ui/sheet.tsx`). 우측 상세는 이걸 쓴다.

## 하지 말 것

- 집계 재계산(무조건 derive 사용), 임의 hex 색, 새 npm 설치(막힘·필요시 보고).
- routes 외 store/data 수정. 2·3차 화면.

## 검증

`npx tsc --noEmit` 통과, `npm run build` 성공. 브라우저 확인은 하지 마라.

## 보고
```
DONE: <파일>
COMPONENTS: <만든 공용 부품>
BUILD: <tsc/build>
NOTES: <sheet 등 부족 컴포넌트, 판단 필요 지점>
```
커밋하지 마라.
