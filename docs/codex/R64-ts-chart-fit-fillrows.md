# R64 — 월별 TS 현황 차트 높이를 처리단계에 맞춤 + TS 목록 탭 이동 시 10줄 고정

대상: `src/components/charts/TsTrendCard.tsx`, `src/components/data-table/DataTable.tsx`, `src/routes/TS.tsx`.

---

## 항목 1 — "월별 TS 현황" 카드 높이를 "처리 단계"에 맞춰 위로 축소

현재 차트 카드가 처리단계보다 커서 하단을 맞추려고 처리단계를 늘렸다.
반대로 **차트 영역을 유연(flex)하게 만들어 카드 높이를 처리단계 높이에 맞춘다**(차트가 위로 당겨져 짧아짐).

**`src/components/charts/TsTrendCard.tsx`**
- 최상위 `Reveal`에 `className="h-full"` 부여.
- `Card`에 `h-full` 추가(기존 `overflow-hidden` 유지).
- `CardContent`(`p-5 sm:p-6`)에 `flex flex-col h-full` 추가.
- 헤더 블록과 KPI 타일 그리드는 고정(그대로). 그 사이 여백만 기존대로.
- 차트 래퍼 `<div className="mt-5">`(차트를 감싼 div) → `<div className="mt-5 flex-1 min-h-0">`.
- 차트 컴포넌트(`TsTrendChart`)의 루트 `className="h-[25rem] w-full"` → `className="h-full min-h-[12rem] w-full"`.
  - `ResponsiveContainer height="100%"`는 그대로(부모 flex-1 높이를 채움).

**`src/routes/TS.tsx`**
- 좌측 그리드 아이템을 늘어나게: `<div className="min-w-0 xl:col-span-2">` → `<div className="flex min-w-0 xl:col-span-2">` (자식 카드가 셀 높이를 채우도록). 또는 그대로 두되 TsTrendCard가 `h-full`이면 grid stretch로 채워짐 — 빌드 후 좌우 카드 하단이 실제로 일치하는지 확인.
- 우측 `TsStagePanel`은 현행 유지(h-full). 결과적으로 **행 높이는 처리단계 콘텐츠 높이가 기준**이 되고, 차트가 그 높이에 맞춰 축소된다.

> 목표: 좌(월별 TS 현황)·우(처리 단계) 카드의 상단·하단 라인이 모두 일치하고, 차트는 처리단계 높이에 맞게 비율이 조정되어 표시된다. (차트가 너무 납작해지지 않도록 `min-h-[12rem]` 하한.)

---

## 항목 2 — TS 목록: 탭 이동 시에도 10줄 유지(빈 줄 채움) + 열 너비 고정

행이 10개 미만인 탭(예: 등록 0건, 처리중 5건)에서도 **항상 10줄 높이**를 유지해 표 높이·열 레이아웃이 흔들리지 않게 한다. 열 너비는 이미 `table-fixed`+저장으로 고정되지만, 줄 수 변동으로 인한 레이아웃 점프를 없앤다.

**`src/components/data-table/DataTable.tsx`** — opt-in prop 추가(기본 false, 다른 화면 영향 없음).
- props에 `fillToPageSize?: boolean` 추가(구조/기본값 destructure).
- 본문에서, `paginate && fillToPageSize`일 때 현재 페이지 렌더 후 **부족한 줄 수만큼 빈 행을 추가**해 항상 `rowsPerPage`개 줄이 렌더되게 한다:
  - `const fillerCount = paginate && fillToPageSize ? Math.max(0, rowsPerPage - pageRows.length) : 0`
  - 데이터 행 렌더 뒤에 filler 행 추가:
    ```tsx
    {fillerCount > 0 ? Array.from({ length: fillerCount }).map((_, i) => (
      <TableRow key={`__filler-${i}`} aria-hidden="true" className="pointer-events-none">
        {enableSelection ? <TableCell className="px-3">{" "}</TableCell> : null}
        {columns.map((column) => (
          <TableCell key={column.id} className={cn("whitespace-nowrap px-3", resizableColumns && "overflow-hidden text-ellipsis", column.className)}>{" "}</TableCell>
        ))}
      </TableRow>
    )) : null}
    ```
    - 빈 셀에 ` `(nbsp)를 넣어 데이터 행과 **동일한 줄 높이** 유지.
  - `pageRows.length === 0`인 경우(예: 등록 0건 탭)에는 기존 `emptyMessage` 행 대신 **filler 10줄**만 보이도록 한다: 즉 `fillToPageSize`가 true면 "표시할 데이터가 없습니다" 빈행 렌더를 건너뛰고 filler로 채운다. (`pageRows.length ? ... : (fillToPageSize ? null : <emptyMessage row/>)` 형태로 분기.)
- 그 외 로직(정렬·페이지네이션·리사이즈)은 변경 금지.

**`src/routes/TS.tsx`**
- `DataTable`에 `fillToPageSize` 추가(이미 `pageSize={10} resizableColumns storageKey="ts-list-v2"`).
  ```tsx
  <DataTable ... pageSize={10} resizableColumns storageKey="ts-list-v2" fillToPageSize ... />
  ```

> 결과: 전체/등록/처리중/완료 어느 탭이든 표는 항상 10줄 높이, 열 너비는 고정 유지(사용자 리사이즈·Rows per page 변경 전까지). 탭 전환 시 레이아웃 점프 없음.

---

## 검증
- `npm run build`(tsc + vite) 통과.
- `/ts`: 좌 "월별 TS 현황" 카드 하단이 우 "처리 단계" 카드 하단과 일치(차트가 처리단계 높이에 맞게 축소).
- 목록: 등록(0)·처리중(5)·완료(63)·전체(68) 어떤 탭이든 10줄 높이 유지, 열 너비 변동 없음.
- 다른 화면(홈 등)·다른 DataTable 사용처 회귀 없음(fillToPageSize 미전달).

## 절대 금지
- `src/data/ts-seed.ts` 수정 금지. DataTable은 지정된 opt-in만 추가(기존 로직 불변). git commit/reset/checkout 금지. 실데이터 로그 금지.
