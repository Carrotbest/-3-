# R228 롤 원단 R 표기와 창고팀 자료 재정비

## 상태

미착수. R224~R235가 커밋(effa3d3)까지 끝나 있다. **그 작업을 되돌리거나 다시 만들지 마라.** 아래 줄 번호는 그 커밋 기준으로 다시 잡은 값이다.

2026-09-21 정산관리팀(창고팀) 미팅에서 나온 요구를 옮긴 것이다. A와 B는 별개 주제지만 같은 화면(`/warehouse`)과 같은 데이터 흐름이라 한 번에 한다.

## 배경 사실 (조사로 확인한 것. 다시 조사하지 마라)

1. **자동 소진은 `EXHAUST` 이벤트를 만들지 않는다.** `useAppStore.ts:1054-1059`에서 출고로 잔량이 0이 되면 `action`은 `"OUTBOUND"`인 채로 `toStatus`만 `"EXHAUSTED"`가 된다. 지금 `warehouse-export.ts:49`의 `OUTBOUND_DONE_ACTIONS`는 `EXHAUST`, `DISPOSE`, `RESTORE`만 보므로 **출고로 소진된 원단은 창고팀 자료에 영영 잡히지 않는다.** 실제 사례가 R&D No. 1242다. 이름만 바꿔서는 안 고쳐진다.
2. **집계가 현재 상태를 보지 않는다.** 지금은 이벤트 이력만 훑는다. 그래서 입고했다가 되돌린 R&D No. 1317, 1318이 요약 입고 목록에 남았다. 되돌리기(Ctrl+Z, `undoFabricEntry`)는 이벤트를 배열에서 지우지만, 입고 취소(`UNRECEIVE`)·복구(`RESTORE`)·출고 취소(`UNOUTBOUND`)는 기록을 남기는 방식이라 이력만 보면 판정이 어긋난다.
3. `collectWarehouseExport` 호출부(`Warehouse.tsx:492`)는 원장은 `scopedLedger`(3팀만)를 주는데 이벤트는 `fabricEvents` 전량을 준다. 현재 상태를 원장에서 대조하면 1팀(8000번대) 건은 자동으로 빠진다. 8000번대 집계는 이번 범위가 아니다.
4. `FabricLedgerOverride`에 표시용 플래그를 더할 때는 `rackNo`와 같은 함정이 있다. **override를 새로 만드는 곳에서 값을 물려주지 않으면 창고 동작마다 값이 지워진다.** 생성 지점은 `useAppStore.ts`의 833, 932, 973, 1063, 1190 다섯 곳이다.

---

# 파트 A. 롤 원단 R 표기

창고팀이 롤 원단을 실물로 찾을 때 번호만으로는 구분이 안 된다. **채번 규칙은 그대로 두고 표시만 `R`을 붙인다.** 저장 값은 숫자 문자열 그대로다.

표기 형식은 접미 `R`이다. `0123` → `0123R`. 괄호를 쓰지 않는다. 옛 샘플관리대장에 이미 같은 모양이 들어가 있다.

## A-1. 저장 필드

`src/data/schema.ts` `FabricLedgerOverride`(388행 `rackNo?: string`) 아래로 추가한다.

```ts
  /** 롤 원단 표시. 채번에는 영향이 없고 화면·자료 표기에만 R을 붙인다. */
  roll?: boolean
```

`src/data/fabric-ledger.ts` `FabricLedgerItem`(73행 `rackNo?: string`) 아래로 추가한다.

```ts
  /** 롤 원단 표시. 원단별 상태(override)에만 저장한다. */
  roll?: boolean
```

`src/data/fabric-ledger.ts` 698행 `rackNo: override.rackNo,` 다음 줄에 `roll: override.roll,`을 넣는다.

## A-2. 표시 함수

`src/data/fabric-ledger.ts`의 `storageNumberOf`(95행) 바로 위에 넣는다.

```ts
/**
 * 화면과 창고팀 자료에 찍는 R&D No. 표기. 롤 원단은 뒤에 R이 붙는다.
 * 저장 값(`storageNo`)은 숫자 문자열 그대로다. 채번·정렬·중복 검사에 이 함수를 쓰지 마라.
 */
export function storageNoLabel(item: Pick<FabricLedgerItem, "storageNo" | "roll">): string {
  const value = (item.storageNo ?? "").trim()
  if (!value || !item.roll) return value
  return /r$/i.test(value) ? value : `${value}R`
}
```

## A-3. 물려주기 (빠뜨리면 동작마다 표기가 지워진다)

`src/store/useAppStore.ts`의 override 생성 다섯 곳에 `roll`을 더한다. 값은 모두 `previous?.roll`이다. **창고를 떠나도 표기는 유지한다.** 이력에서 복구하면 그대로 살아 있어야 한다.

| 위치 | 함수 | 넣을 값 |
|---|---|---|
| 833행 `overrides.push({` | `applyDisposalRoundCompletion` | `roll: previous?.roll,` |
| 932행 `const override: FabricLedgerOverride = {` | `saveFabricFields` | `roll: previous?.roll,` |
| 973행 `const next: FabricLedgerOverride = {` | `saveFabricRackNos` | `roll: previous?.roll,` |
| 1063행 `const override: FabricLedgerOverride = {` | `applyFabricActions` | `roll: input.roll ?? previous?.roll,` |
| 1190행 `const overrides: FabricLedgerOverride[] = entries.map` | `removeFabricRows` | `roll: previous?.roll,` |

`ApplyFabricActionInput`에 `roll?: boolean`을 더한다(입고 등록에서만 쓴다).

## A-4. 저장 함수

`src/store/useAppStore.ts` `saveFabricRackNos`(961-1000행) 바로 아래에 같은 모양으로 만든다. 한 번에 여러 건을 저장하는 이유도 같다.

```ts
/**
 * 선택한 원단의 롤 표기를 한 번에 켜고 끈다.
 * 원단마다 따로 저장하면 앞 저장을 뒤 저장이 덮어쓰므로 새 배열을 한 번만 만든다.
 */
export async function saveFabricRolls(entries: ReadonlyArray<{ item: FabricLedgerItem; roll: boolean }>): Promise<number> {
```

본문은 `saveFabricRackNos`를 그대로 따르되 바뀌는 값만 `roll`이다. 건너뛰기 조건은 `if ((previous?.roll ?? false) === roll) continue`, 저장 값은 `roll: roll || undefined`, 그리고 `rackNo: previous?.rackNo`를 물려준다. 작업 이력(`logAction`)은 남기지 않는다(`saveFabricRackNos`와 같다).

## A-5. 입고 등록 창 체크박스

`src/routes/Warehouse.tsx`

- 587행 `receiveYds` 상태 옆에 더한다. `const [receiveRolls, setReceiveRolls] = useState<Record<string, boolean>>({})`
- `closeActionDialog`에서 다른 입력값을 비우는 자리에 `setReceiveRolls({})`를 같이 넣는다.
- 1905행 RECEIVE 다이얼로그 본문. 각 행의 `보유 yds (옵션)` 입력 칸 아래에 체크박스를 붙인다. 격자는 `grid-cols-[minmax(0,1fr)_9rem]`이므로 오른쪽 칸 안에 넣는다.

```tsx
<label className="mt-1 flex items-center gap-1.5 text-xs"><Checkbox checked={receiveRolls[item.key] === true} onCheckedChange={(value) => setReceiveRolls((current) => ({ ...current, [item.key]: value === true }))} aria-label={`${item.styleNo || item.flNo || "원단"} 롤 원단`} /><span>롤 원단</span></label>
```

- 926행 `RECEIVE` 처리에서 `applyFabricActions`에 넘기는 각 입력에 `roll: receiveRolls[item.key] === true`를 더한다.
- 1905행 안내 문장 끝에 한 문장을 더한다. `롤 원단은 체크하면 번호 뒤에 R이 붙습니다. 채번은 그대로입니다.`

## A-6. 창고보관 탭 토글 버튼

`src/routes/Warehouse.tsx` 1746행에서 시작하는 첫 묶음(입고 확인 / 입고 확인 취소) 안, `입고 확인 취소` 버튼 뒤에 넣는다. 새 묶음을 만들지 마라(R226에서 정리한 줄이다).

```tsx
<Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} title="선택한 원단의 R&D No. 뒤에 R을 붙이거나 뗍니다. 채번은 바뀌지 않습니다." onClick={() => void toggleRollMark()}>롤 표기</Button>
```

`toggleRollMark`는 `commitStorageNo`(1296행) 근처에 둔다.

```ts
/** 선택 전부가 롤이면 끄고, 하나라도 아니면 켠다. */
const toggleRollMark = async () => {
  if (!selectedRows.length) return
  const next = !selectedRows.every((item) => item.roll)
  const changed = await saveFabricRolls(selectedRows.map((item) => ({ item, roll: next })))
  setSelectionNotice(changed ? `롤 표기를 ${next ? "켰습니다" : "껐습니다"}. ${changed}건.` : "바뀐 건이 없습니다.")
}
```

## A-7. 표기를 적용할 곳

`storageNoLabel(item)`으로 바꾼다. **아래 목록만 바꾼다. 다른 곳을 찾아다니지 마라.**

| 파일 | 위치 | 비고 |
|---|---|---|
| `src/routes/Warehouse.tsx` | 1093행 `if (id === "storageNo")` 셀 | 표 본문 |
| `src/routes/Warehouse.tsx` | 995행 `R&D No. ${item.storageNo || "미지정"}` | 출고 확정 오류 문구 |
| `src/routes/Warehouse.tsx` | 1903 DialogDescription, 1917, 1980, 1987 | 다이얼로그 표시 |
| `src/data/inbound-request-mail.ts` | 19행 표 칸 | 제목(31행)은 그대로 둔다 |
| `src/data/outbound-request-mail.ts` | 34행 표 칸 | 제목(47행)은 그대로 둔다 |
| `src/components/warehouse/OutboundRequestMailDialog.tsx` | 135행 표 칸 | 화면 미리보기 |
| `src/data/warehouse-export.ts` | 요약 목록과 LIST의 R&D No. | 파트 B에서 함께 고친다 |

메일 제목의 `storageNoSummary`는 번호를 범위로 접는 함수라 R이 섞이면 깨진다. **제목에는 R을 붙이지 마라.**

폐기 라운드(`DisposalRoundPanel.tsx`, `disposal-round.ts`)는 이번에 건드리지 않는다. 라운드 스냅샷에 저장된 문자열이라 표기를 섞으면 지난 라운드와 어긋난다.

---

# 파트 B. 창고팀 자료 (`src/data/warehouse-export.ts`)

## B-1. 시트를 셋만 남긴다

남길 것: `요약`, `LIST`, `주차 집계`.
없앨 것: **일자별(`MM.DD`) 시트 전부**, `데이터`, `창고보관 현황`.

창고팀이 일자별로 집계하려고 만들던 시트라 요약만 있으면 된다고 확인했다.

- `buildLookupSheet`, `buildStockSheet`, `STOCK_COLUMNS`, `WarehouseStockRow`, `collectWarehouseExport`의 `stock` 계산, `totals.stockCount`를 지운다.
- `buildWarehouseWorkbook` 안 `data.days.forEach((day) => movementSheet(...))` 줄(222행)을 지운다.
- `WarehouseDayRows`와 `data.days`를 없애고 `WarehouseExportData`를 아래로 바꾼다. 일자별 시트가 사라지면 날짜별로 나눠 담을 이유가 없다.

```ts
export interface WarehouseMovementRow {
  storageNo: string
  date: string
}

export interface WarehouseExportData {
  from: string
  to: string
  inbound: WarehouseMovementRow[]
  outboundDone: WarehouseMovementRow[]
  list: WarehouseListRow[]
  totals: { inbound: number; outboundDone: number; listCount: number; inboundYds: number; disposedYds: number }
}
```

- `movementSheet`의 `blankRows` 매개변수를 지우고 요약 기준인 빈 줄 1줄로 고정한다. 요약 시트 한 번만 부른다.
- `src/routes/Warehouse.tsx` 1844행 문구를 `입고 {n}건 · 소진/폐기 {n}건 · 출고요청 {n}건`으로 바꾼다. 창고보관 건수는 뺀다.

**LIST 시트와 `주차 집계` 시트의 서식·행 위치·열 너비는 그대로 둔다.** 창고팀이 시트째 복사해 붙이는 자리다.

## B-2. 최종 확정건만 집계한다

`collectWarehouseExport`의 집계 규칙을 바꾼다. 47-49행의 `INBOUND_ACTIONS`, `OUTBOUND_DONE_ACTIONS`와 77-105행의 `lastInbound`/`lastOutboundDone`/`push`를 아래 규칙으로 갈아엎는다.

**이벤트 훑기** (기간 밖 이력까지 봐야 뒤에 취소된 건을 걸러낼 수 있다. `ordered` 정렬은 그대로 쓴다.)

```
const DONE_STATUS = new Set(["EXHAUSTED", "DISPOSED"])

for (const event of ordered) {
  const storageNo = (event.storageNo ?? "").trim()
  if (!storageNo) continue
  // 입고 대기로 내려가거나 목록에서 빠지면 그 원단의 입고·완료 판정을 모두 지운다.
  if (event.toStatus === "READY" || event.toStatus === "REMOVED") {
    lastInbound.delete(storageNo); lastDone.delete(storageNo); continue
  }
  // 입고일은 RECEIVE가 기준이다. CONFIRM은 RECEIVE 기록이 없는 대장 이관 건만 채운다.
  if (event.action === "RECEIVE") lastInbound.set(storageNo, event)
  else if (event.action === "CONFIRM" && !lastInbound.has(storageNo)) lastInbound.set(storageNo, event)
  // 완료 판정은 action이 아니라 도착 상태로 본다. 출고로 잔량이 0이 되어
  // 자동 소진된 건은 action이 OUTBOUND인 채 toStatus만 EXHAUSTED다(R&D No. 1242).
  if (DONE_STATUS.has(event.toStatus)) lastDone.set(storageNo, event)
  else lastDone.delete(storageNo)
}
```

**현재 상태로 한 번 더 거른다.** 되돌리기·취소로 상태가 돌아간 건(R&D No. 1317, 1318)을 여기서 떨어뜨린다.

```
const itemByNo = new Map(ledger.filter((item) => item.storageNo.trim()).map((item) => [item.storageNo.trim(), item]))
const INBOUND_STATUS = new Set(["WAREHOUSE", "EXHAUSTED", "DISPOSED"])
```

- 입고 행: `lastInbound`의 건 중 `itemByNo`에 있고 그 `status`가 `INBOUND_STATUS`에 들며 `occurredAt` 날짜가 기간 안인 것.
- 소진·폐기 행: `lastDone`의 건 중 `itemByNo`에 있고 그 `status`가 `EXHAUSTED` 또는 `DISPOSED`이며 `occurredAt` 날짜가 기간 안인 것.
- 원장(`scopedLedger`)에 없는 번호는 그대로 빠진다. 8000번대 1팀 건이 섞이지 않는 근거다.
- 정렬은 지금과 같다. 날짜 오름차순, 같으면 번호 오름차순(`numeric: true`).
- LIST(전산출고 요청)의 집계 규칙은 **그대로 둔다.** `canceledOutboundIds`로 취소분을 이미 뺀다.

## B-3. 수량 합계

`totals`에 두 값을 넣는다. 소수점은 `Math.round(값 * 100) / 100`으로 정리한다.

- `inboundYds` = 위 입고 행에 해당하는 원장 항목의 `yds` 합. `null`은 0으로 센다.
- `disposedYds` = 소진·폐기 행 중 **현재 상태가 `DISPOSED`인 건만**의 `Math.max(0, item.balance ?? 0)` 합. 소진(`EXHAUSTED`)은 세지 않는다. 다 써서 나간 원단이라 폐기 수량이 아니다.

## B-4. 요약 시트 문구와 수량 열

`movementSheet` 안이다.

- 195행 머리 배열을 `["부서명", "입고", "RND 소진/폐기 건", "입고 yds", "폐기 yds"]`로 바꾼다. 같은 `put(3, i + 2, ...)` 규칙이라 E·F 열로 자연히 늘어난다. **B~D 열의 자리와 서식은 그대로다.**
- 197-198행 아래에 값 두 칸을 더한다. 0이면 `null`로 비워 둔다(기존 건수 칸과 같은 규칙).

```ts
put(4, 5, data.totals.inboundYds || null, { size: 11, numFmt: "#,##0.##" })
put(4, 6, data.totals.disposedYds || null, { size: 11, numFmt: "#,##0.##" })
```

- `sheet.getColumn(6).width = 14.75`를 180행 옆에 더한다(5열은 이미 20.75다. 그대로 둔다).
- 218행 블록 제목 `"RND 출고 완료 현황"`을 `"RND 소진/폐기 현황"`으로 바꾼다. 날짜 머리 `"폐기일자"`는 그대로 둔다.
- 목록의 R&D No. 값(211행 `storageCell(entry.storageNo)`)과 LIST의 R&D No.(240행)는 `storageCell(storageNoLabel(item))`로 바꾼다. 원장 항목은 `itemByNo`에서 찾는다. 원장에 없으면 번호 문자열 그대로 쓴다.

`storageCell`은 숫자로 읽히면 숫자 셀로 넣는 함수다. R이 붙은 번호는 문자열 셀이 된다. 의도한 동작이다.

---

## 하지 말 것

- R224~R227 변경을 되돌리거나 다시 만들지 마라.
- 채번 로직(`nextStorageNumbers`, `occupiedStorageNumbers`, `storageNumberOf`, `warehouseOrderKey`)에 `roll`이나 `storageNoLabel`을 끌어들이지 마라. 번호는 숫자 그대로다.
- LIST 시트와 `주차 집계` 시트의 열 이름, 열 너비, 행 위치, 색을 바꾸지 마라.
- 폐기 라운드(`disposal-round.ts`, `DisposalRoundPanel.tsx`)와 RDDA 쪽은 건드리지 마라.
- 8000번대(1팀) 집계를 새로 만들지 마라. 이번 범위가 아니다.
- 별도의 "출고 누계" 내려받기 버튼을 만들지 마라. 요약과 주차 집계가 맞으면 필요 없다고 확인했다.
- `public/data` 아래 JSON을 열지 마라.

## 검증

`npm run build` 한 번. `git status --short`로 지시서에 적힌 파일 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `warehouse-export.ts`에 `일자별`·`데이터`·`창고보관 현황` 시트를 만드는 코드가 남아 있지 않다.
3. `OUTBOUND_DONE_ACTIONS` 상수가 사라지고, 완료 판정이 `toStatus` 기준이다.
4. `useAppStore.ts`의 override 생성 다섯 곳 모두에 `roll`이 들어가 있다.
