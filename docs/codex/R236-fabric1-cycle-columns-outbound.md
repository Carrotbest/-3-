# R236 1팀 창고: 채번 되감기, 열 재구성, 반출 이력 팝업

상태: 미착수

## 배경과 확정 규칙 (2026-09-22 사용자 확정)

1. **채번 대역**
   - 3팀: 1000~7999를 돈다. 7999 다음은 **1000**이다(지금 코드는 1로 되감는다. 이것을 바꾼다). 수동 입력 검사는 지금처럼 1~7999를 받는다. 1000 미만 옛 번호가 남아 있어서다.
   - 1팀: 8000~9999를 돈다. 9999 다음은 **8000**이다. 지금 코드는 상한 없이 순증한다. 이것을 바꾼다.
2. **1팀은 빈 번호를 채우지 않는다.** 1팀 대장은 8437~8979 구간에 이미 소진된 번호 241개가 비어 있다. 3팀식 빈자리 메우기를 쓰면 새 입고가 8438, 8439처럼 옛 구멍으로 들어간다. 1팀은 "마지막 입고 번호 다음부터 순서대로"만 한다. 지금 창고보관 중인 번호만 건너뛴다.
3. **1팀 이력 탭**은 3팀과 같은 용도와 사용법이다. 이미 `TAB_ORDER_TEAM1`에 있다. 손대지 않는다.
4. **1팀 범위에서 원단을 더블클릭하면 반출 이력 팝업만 뜬다.** 원단 상세는 뜨지 않는다. 팝업은 두 경로로 연다: FL 칸 더블클릭, 행 머리 아이콘.
5. **1팀 열 구성은 1팀 엑셀 순서를 따른다.** 고정 4열(R&D No., 재고, 입고확인, Rack No.) 뒤에 대장 그룹 하나만 둔다.

## 파일별 조치

### 1. `src/data/fabric-ledger.ts`

- 88~91행 근처 상수를 이렇게 바꾼다.
  ```ts
  export const STORAGE_NO_MAX = 7999
  /** 3팀 되감기 시작 번호. 7999 다음은 1000이다(2026-09-22). */
  export const STORAGE_NO_WRAP = 1000
  /** 1팀 대역. 8000~9999를 돌고 9999 다음은 8000이다(2026-09-22). */
  export const FABRIC1_STORAGE_NO_MIN = 8000
  export const FABRIC1_STORAGE_NO_MAX = 9999
  ```
- `warehouseSequenceStart(numbers)`와 `warehouseOrderKey(item, start)`에 선택 인자 `range: { min: number; max: number }`를 더한다. 기본값은 `{ min: 1, max: STORAGE_NO_MAX }`로, **3팀 호출부 결과가 지금과 똑같아야 한다.** 식 안의 `STORAGE_NO_MAX`는 주기 길이 `range.max - range.min + 1` 기준으로 바꾼다. 1팀은 `{ min: FABRIC1_STORAGE_NO_MIN, max: FABRIC1_STORAGE_NO_MAX }`로 부른다.

### 2. `src/routes/Warehouse.tsx` — `nextStorageNumbers` (256행~)

- **1팀 분기(265~269행)를 교체한다.** 현재 코드:
  ```ts
  if (scope === "team1") {
    // 1팀은 되감지 않는다. 마지막 번호 다음부터 계속 올린다. 상한이 없다.
    const last = Math.max(FABRIC1_STORAGE_NO_MIN - 1, ...[...used])
    for (let candidate = last + 1; picked.length < count; candidate += 1) take(candidate)
    return picked
  }
  ```
  새 동작:
  - 프론티어는 3팀과 같이 `status === "WAREHOUSE"`이고 `intakeAt`이 있는 항목 중 가장 늦은 입고일의 번호다. 없으면 창고보관 번호 최댓값, 그것도 없으면 `FABRIC1_STORAGE_NO_MIN - 1`이다.
  - 빈자리 메우기(3팀의 band 단계)는 **하지 않는다.**
  - `frontier + 1`부터 `FABRIC1_STORAGE_NO_MAX`까지 `take`, 모자라면 `FABRIC1_STORAGE_NO_MIN`부터 `frontier`까지 `take`. 그래도 모자라면(대역 2000개가 다 찬 경우) 더 뽑지 않고 반환한다. 호출부가 개수 부족을 오류로 알린다. 호출부에 그 처리가 없으면 입고 저장 전에 `"1팀 R&D No. 대역(8000~9999)이 모두 사용 중입니다."`로 막는다.
- **입고일 동점 처리(두 팀 공통).** 한 번에 여러 건을 입고하면 `intakeAt`이 같다. 지금은 `.at(-1)`이 배열 순서로 아무거나 고른다. 가장 늦은 `intakeAt`과 같은 항목들을 모아, 그 번호들로 `warehouseSequenceStart(nums, range)`를 구하고 `warehouseOrderKey`가 가장 큰 번호를 프론티어로 삼는다. 9998, 9999, 8000이 한 묶음이면 8000이 프론티어다.
- **3팀 되감기(303행).** `for (let candidate = 1; ...)`를 `for (let candidate = STORAGE_NO_WRAP; ...)`로 바꾼다. 주석도 "7999 를 넘기면 1000 부터 되감는다"로 고친다. band 계산(292행 `candidate >= 1`)은 그대로 둔다.

### 3. `src/routes/Warehouse.tsx` — 번호 검사 두 곳 (898행, 1304행)

- `okTeam1`을 `/^\d{4}$/` 이고 `FABRIC1_STORAGE_NO_MIN <= num <= FABRIC1_STORAGE_NO_MAX`로 바꾼다.
- 오류 문구: `R&D No. 는 8000부터 9999 사이여야 합니다.` (상수로 조립)
- 3팀 검사와 문구는 그대로 둔다.
- 1916행 입고 창 안내문의 "빠진 번호를 먼저 메우고 마지막 번호 다음으로 이어 갑니다." 뒤에 오는 되감기 설명이 있으면 "7999 다음은 1000부터"로 맞춘다. 이 창은 3팀 전용이다.

### 4. `src/routes/Warehouse.tsx` — 1팀 창고보관 정렬 (697~699행)

현재 1팀은 번호 오름차순이다. 되감은 뒤 8000번대 새 원단이 맨 위로 올라온다. 3팀과 같이 `warehouseOrderKey(item, start, FABRIC1_RANGE)`로 정렬한다. `start`는 1팀 창고보관 번호로 구한 `warehouseSequenceStart(..., FABRIC1_RANGE)`다. 646행 `sequenceStart` 옆에 1팀용 `useMemo`를 하나 더 둔다. 파일 안에 `const FABRIC1_RANGE = { min: FABRIC1_STORAGE_NO_MIN, max: FABRIC1_STORAGE_NO_MAX }`를 한 번 정의해 같이 쓴다.

### 5. `src/routes/Warehouse.tsx` — 1팀 열 구성

`COLUMN_GROUPS` 아래에 1팀 전용 그룹을 새로 만든다. 고정 그룹은 `COLUMN_GROUPS[0]`(key `"fixed"`)을 그대로 재사용한다.

```ts
// 1팀 열은 1팀 엑셀 순서를 따른다(2026-09-22). No., R&D Number, 위치, 폐기는 고정 열과 탭이 대신한다.
const TEAM1_COLUMN_GROUPS: readonly WarehouseGroup[] = [
  COLUMN_GROUPS[0],
  { key: "ledger", label: "대장", color: "var(--chart-1)", columns: [
    { id: "flNo", label: "Ref. No", width: 100 },
    { id: "color", label: "Color", width: 104 },
    { id: "supplier", label: "공급처", width: 150 },
    { id: "construction", label: "Construction", width: 124 },
    { id: "content", label: "Content", width: 200 },
    { id: "actualWidth", label: "Width (INCH)", width: 88 },
    { id: "actualWeight", label: "Weight (G/M2)", width: 92 },
    { id: "priceYd", label: "Price ($/YD)", width: 88 },
    { id: "priceLb", label: "Price ($/LB)", width: 88 },
    { id: "owner", label: "입고담당자", width: 88 },
    { id: "requestDate", label: "입고 요청일", width: 88 },
    { id: "note", label: "Remark", width: 200 },
  ] },
]
```

- 710~711행 `scopeGroups` 계산을 `teamScope === "team1" ? TEAM1_COLUMN_GROUPS : COLUMN_GROUPS.map(3팀에서 FABRIC1_ONLY_COLUMNS 제외)`로 바꾼다. 3팀 결과는 지금과 같아야 한다.
- 이어지는 `visibleGroups`의 고정 열 필터(탭별 rackNo 등)는 그대로 적용된다.
- 열 헤더, 필터 목록, 복사가 `column.label`을 그룹에서 읽는지 본다. `COLUMN_GROUPS`를 직접 다시 훑어 라벨을 찾는 곳이 있으면 `scopeGroups`를 보게 바꾼다. 1팀에서 `owner`가 "Developer"로 뜨면 안 된다.
- `WarehouseColumnId` 타입에 위 id가 모두 이미 있다. 새 id를 만들지 않는다.
- "공급처" 라벨을 "완사입 업체"로 짓지 않는다. GD 자체 공장도 들어간다.

### 6. `src/routes/Warehouse.tsx` — 반출 이력 팝업 여는 경로

팝업은 이미 있다(1889행 `Dialog open={Boolean(outboundHistoryItem)}`, 상태 `outboundHistoryKey`). **여는 곳만 없다.** 새 팝업을 만들지 않는다.

- **셀 더블클릭(1624행 `onDoubleClick`).** 지금:
  ```ts
  if (canEditScope && column.id === "stock" && tab !== "HISTORY") { setOutboundHistoryKey(null); openAction("STOCK", [item]) }
  else if (editable) setEditCell({ row: item.key, col: column.id })
  else openDetail(item.key)
  ```
  1팀 범위에서는:
  - `column.id === "flNo"`면 언제나 `setOutboundHistoryKey(item.key)`
  - 재고 칸과 편집 가능 칸(R&D No., Rack No.)은 지금 동작을 유지한다.
  - 나머지 칸은 `openDetail` 대신 `setOutboundHistoryKey(item.key)`
  - 3팀 범위는 한 글자도 바뀌지 않는다.
  - `openDetail` 첫머리의 `suppressClickRef` 검사를 반출 이력 경로에도 똑같이 적용한다(드래그 직후 더블클릭 오작동 방지).
- **행 머리 아이콘.** 1597행 체크박스가 든 `div` 안, 체크박스 오른쪽에 1팀 범위에서만 작은 아이콘 버튼을 둔다. lucide `History` 아이콘, `size-3.5`, `aria-label="반출 이력"`, `title="반출 이력"`. `onClick`에서 `event.stopPropagation()` 후 `setOutboundHistoryKey(item.key)`. `onMouseDown`에서도 `stopPropagation`해 행 드래그가 시작되지 않게 한다. 행 머리 칸과 헤더(1565행) 너비가 아이콘 때문에 모자라면 1팀일 때만 넓힌다. sticky `left` 계산(`fixedLeft`)이 그 너비를 쓰면 같이 맞춘다.
- **팝업 내용.** 제목 `반출 이력`, 설명에 `storageNoLabel(item)`과 FL을 함께 쓴다. 빈 목록이면 표 대신 `반출 기록이 없습니다.` 한 줄을 보인다(지금 빈 tbody면 그렇게 바꾼다). 표 아래에 입고 yds, 누적 반출, 잔량 한 줄 요약을 둔다(`item.yds`, `item.outboundTotal`, `item.balance`, 값이 null이면 `-`). 두 팀 공통으로 적용해도 된다.
- **원단 상세 접근.** 1팀 더블클릭에서 상세가 빠지므로 셀 우클릭 메뉴(`cellMenu`, "복사", "선택 해제"가 있는 메뉴)에 1팀 범위에서만 `원단 상세` 항목을 더한다. 우클릭한 행의 `openDetail(key)`를 부른다.

### 7. `CLAUDE.md`

창고 절 채번 규칙 3번의 "7999를 넘기면 1부터 되감는다."를 "7999를 넘기면 1000부터 되감는다(2026-09-22)."로 고친다. 그 아래에 한 줄을 더한다:
"- 1팀 채번은 8000~9999를 돌고 9999 다음은 8000이다. **빈자리를 메우지 않는다.** 1팀 대장은 이미 소진된 번호로 구멍이 많아 메우면 새 입고가 옛 구멍으로 들어간다. 창고보관 중인 번호만 건너뛴다(R236)."
`fabric-ledger.ts`의 `FABRIC1_STORAGE_NO_MIN` 옛 주석("상한 없이 순증하고 되감지 않는다")도 1번 조치대로 바꾼다.

## 하지 말 것

- 3팀 채번의 빈자리 메우기, band 계산, 점유 판정(`occupiedStorageNumbers`)을 바꾸지 마라. 바꾸는 것은 되감기 시작 번호(1000)와 입고일 동점 처리뿐이다.
- 이력 번호를 점유로 세지 마라(R233에서 그렇게 했다가 R235에서 되돌렸다).
- 1팀 행을 FL 원장이나 RDDA 집계에 넣지 마라.
- 1팀 이력 탭, 입고 확인, 출고 버튼 조건을 바꾸지 마라.
- 새 팝업 컴포넌트를 만들지 마라. 1889행 팝업을 쓴다.
- `rackNo`를 다루는 override 생성 코드를 건드리지 마라.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라.
- public/data 아래 JSON을 열지 마라.
- 외부 자격증명이 필요한 명령은 돌리지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.

## 성공 기준

- `npm run build`가 오류 없이 끝난다.
- 3팀 `warehouseSequenceStart`/`warehouseOrderKey` 호출부는 인자를 더하지 않았고 결과가 같다.
- 1팀 입고 등록에서 제안 번호가 창고보관 최신 번호 다음이고, 9999 다음이 8000이다.
