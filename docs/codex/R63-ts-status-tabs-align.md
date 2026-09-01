# R63 — TS: 카드 하단 정렬 · 처리단계 좌우배치(전체 추가) · 목록 탭 · 페이지 10행 고정

대상: `src/routes/TS.tsx` 한 파일. 그 외 변경 금지.

---

## 항목 1 — "월별 TS 현황" 카드와 "처리 단계" 카드 하단 라인 정렬
현재 2컬럼 그리드(`grid gap-4 xl:grid-cols-3`, 412행 근방)에서 우측 처리단계 카드가 더 짧아 하단이 안 맞는다.
- 처리단계 카드가 좌측 차트 카드 높이에 맞춰 **늘어나 하단 라인이 일치**하도록 한다.
- 방법: `TsStagePanel`의 최상위 `Reveal`에 `className="h-full"` 부여 + 내부 `Card`도 `h-full`(이미 있으면 유지), `CardContent`를 `flex flex-1 flex-col`로 만들어 내용이 세로로 채워지게 한다. (그리드 셀은 기본 stretch이므로 h-full 체인만 이으면 하단이 맞는다.)
- 좌측 `<div className="min-w-0 xl:col-span-2">`는 그대로(차트가 행 높이를 정의).

---

## 항목 2 — 처리 단계: 도넛 ↔ 리스트 좌우 배치 + '전체' 추가(4줄)
`TsStagePanel`(55~ 행 근방)을 아래로 개편:
- **좌우 배치**: 도넛 그래프(좌) + 단계 리스트(우)를 가로로. 예:
  ```tsx
  <CardContent className="flex flex-1 flex-col">
    <div className="flex flex-1 items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">{/* 도넛 + 중앙 총합 */}</div>
      <ol className="min-w-0 flex-1 space-y-2" aria-label="TS 처리 단계">{/* 4줄 */}</ol>
    </div>
  </CardContent>
  ```
  (좁은 폭에서 겹치면 `flex-col sm:flex-row` 등으로 반응형 처리 가능.)
- **리스트 4줄**: `전체 / 등록 / 처리중 / 완료`.
  - 데이터: `[{ state: null, label: "전체", count: total, caption: "모든 요청", dot: "bg-[var(--muted-foreground)]" }, { state: "등록", label:"등록", count: counts.received, caption:"새 요청 확인", dot: TS_STATE_DOT.등록 }, { state:"처리중", ..., dot: TS_STATE_DOT.처리중 }, { state:"완료", ..., dot: TS_STATE_DOT.완료 }]`.
  - 각 줄 클릭 시 `onSelect(state)` — **토글이 아니라 지정**(전체=null 설정). `active = activeState === state`(전체 줄은 `activeState === null`).
  - 스타일은 기존 단계 버튼과 동일(선택 시 primary 톤, 좌측 색 닷, 라벨+caption, 우측 count 뱃지).
- `TsStagePanel` props의 `onSelect` 시그니처를 `(state: TsState | null) => void`로 변경. TS.tsx 호출부: `onSelect={setActiveState}`(그대로 지정).
- 도넛은 기존 recharts PieChart 유지(등록/처리중/완료 3색, 중앙 총합).

---

## 항목 3 — TS 목록에 상태 탭(전체/등록/처리중/완료), 기본 전체
- import 추가: `import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"`. 상수 `const ALL = "전체"`.
- `DataTable`의 `toolbar`에 **좌측 상태 탭 + 우측 검색** 배치:
  ```tsx
  toolbar={(
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <Tabs value={activeState ?? ALL} onValueChange={(v) => setActiveState(v === ALL ? null : v as TsState)}>
        <TabsList aria-label="TS 상태 필터">
          {[ALL, ...TS_STATES].map((s) => <TabsTrigger key={s} value={s}>{s}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <Input className="lg:max-w-sm" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Subject · 요청자 · 담당 · 의뢰 내용 검색" aria-label="TS 목록 검색" />
    </div>
  )}
  ```
- 탭과 처리단계 패널은 **동일한 `activeState`**를 공유(둘 중 어느 쪽을 눌러도 목록·탭·패널이 함께 반영).
- **항상 전체 먼저**: `activeState` 초기값 `null`(=전체) 유지 → 페이지 진입 시 전체 탭 활성.

---

## 항목 4 — 페이지 10행 고정 + 탭 전환 시 열 너비 고정
- `DataTable`의 `pageSize={20}` → **`pageSize={10}`**. (DataTable은 마운트 시 `rowsPerPage=pageSize`로 시작하므로 페이지 진입마다 10행.)
- **열 너비는 탭을 바꿔도 변하지 않아야 한다**: 현재 `resizableColumns`는 최초 1회만 측정(measuredRef) 후 `table-fixed`+저장 너비로 고정되므로, 탭 전환(행 내용 변화)에도 너비가 재계산되지 않는다. 이 동작을 **유지**한다(추가 변경 없이 확인만). 사용자가 직접 리사이즈하거나 Rows per page를 바꾸기 전까지 너비 고정.
  - 단, 열 구성이 R60에서 바뀌어 localStorage(`datatable-widths:ts-list`)에 옛 열 키가 남아있을 수 있다. 안전하게 **storageKey를 `ts-list-v2`로 변경**해 새 열 구성 기준으로 재측정·저장되게 한다.

---

## 검증
- `npm run build`(tsc + vite) 통과.
- `/ts`: 좌 "월별 TS 현황"과 우 "처리 단계" 카드의 **하단 라인이 일치**.
- 처리 단계: 도넛(좌) + 리스트(우) 좌우 배치, 리스트 4줄(전체/등록/처리중/완료). 각 줄·목록 탭 클릭이 서로 동기화되어 목록 필터.
- 목록 상단에 전체/등록/처리중/완료 탭, 진입 시 전체 활성. 페이지당 10행.
- 탭 전환 시 열 너비 변동 없음(사용자 리사이즈·행수 변경 전까지 고정).
- 홈 등 다른 화면 회귀 없음.

## 절대 금지
- `src/data/ts-seed.ts`·`DataTable.tsx` 로직 변경 금지(TS.tsx만; storageKey 값 변경은 TS.tsx의 prop에서). git commit/reset/checkout 금지. 실데이터 로그 금지.
