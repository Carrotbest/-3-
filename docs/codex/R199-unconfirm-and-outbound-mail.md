# R199 — 입고 확인 취소 버튼, 출고 요청 메일 팝업 항목 정리

상태: 미착수. 설계 확정됨. 이 문서대로만 구현한다.

서로 무관한 두 작업이다. **A와 B를 순서대로 하고, `npm run build`는 둘 다 끝낸 뒤 한 번만 돌린다.**

---

# A. 입고 확인 취소

## 배경

창고 보관 탭에서 `입고 확인`을 누르면 실물 확인 표시가 붙는다. 잘못 눌렀을 때 되돌릴 방법이 없다.
지금 확인 표시를 지우는 유일한 길은 `입고 대기로` 되돌리기인데, 그러면 채번한 R&D No.가 풀리고
보유 재고와 출고 합계까지 날아간다. 확인 표시만 지우는 동작이 필요하다.

## 확인한 구조

- `confirmedAt`은 저장된 값이 아니라 이벤트를 접어서 만든다(`src/data/fabric-ledger.ts:512~533`).
  `CONFIRM` 이벤트가 `confirmMap`에 시각을 넣고, `RESTORE`·`DISPOSE`·`EXHAUST`·`UNRECEIVE`가 지운다(531행).
- 따라서 확인만 취소하려면 **`confirmMap`을 지우는 액션을 하나 더 만든다.** 기록을 지우는 것이 아니라
  취소 기록을 덧붙이는 방식이라 기존 추가형 이력 설계와 맞는다.
- `warehouse-export.ts`의 `INBOUND_ACTIONS`(47행)에는 **넣지 않는다.** 확인만 취소한 것이지 입고 자체는
  유효하므로, 그 원단은 처음 입고한 날짜의 입고 건으로 계속 잡혀야 한다. 이 파일은 손대지 마라.

## A-1. `src/data/schema.ts` 374행

```ts
export type FabricLedgerAction = "COMPLETE" | "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "OUTBOUND" | "EXHAUST" | "DISPOSE" | "RESTORE" | "REMOVE" | "NOTE"
```

`"CONFIRM"` 뒤에 `"UNCONFIRM"`을 더한다.

```ts
export type FabricLedgerAction = "COMPLETE" | "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "UNCONFIRM" | "OUTBOUND" | "EXHAUST" | "DISPOSE" | "RESTORE" | "REMOVE" | "NOTE"
```

## A-2. `src/data/fabric-ledger.ts` 531행

현재:

```ts
    if (event.action === "RESTORE" || event.action === "DISPOSE" || event.action === "EXHAUST" || event.action === "UNRECEIVE") confirmMap.delete(itemKey)
```

바꾼다(주석 한 줄도 같이 고친다. 530행의 기존 주석 뒤에 붙인다).

```ts
    // 창고를 떠나거나 되돌아오면 실물 확인은 무효가 된다. 다시 확인받아야 한다.
    // UNCONFIRM은 잘못 누른 확인만 되돌린다. 상태·채번·재고는 그대로 두고 확인 표시만 지운다.
    if (event.action === "RESTORE" || event.action === "DISPOSE" || event.action === "EXHAUST" || event.action === "UNRECEIVE" || event.action === "UNCONFIRM") confirmMap.delete(itemKey)
```

## A-3. `src/routes/FabricDetail.tsx` `ACTION_LABELS`(12~23행)

`CONFIRM: "실물 입고 확인",` 다음 줄에 더한다.

```ts
  UNCONFIRM: "실물 확인 취소",
```

## A-4. `src/routes/Warehouse.tsx`

### A-4-1. `ActionKind`(44행)

```ts
type ActionKind = "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "DISPOSE" | "STOCK" | "OUTBOUND" | "EXHAUST" | "RESTORE" | "REMOVE"
```

`"CONFIRM"` 뒤에 `"UNCONFIRM"`을 더한다.

### A-4-2. 처리 분기

`} else if (actionDialog.kind === "REMOVE") {`(772행 부근) 바로 앞에 분기를 하나 더한다.
`CONFIRM` 분기(753행)와 같은 자리다.

```ts
      } else if (actionDialog.kind === "UNCONFIRM") {
        for (const item of actionItems) {
          if (item.status !== "WAREHOUSE" || !item.confirmedAt) continue
          await applyFabricAction({ fabricKey: item.key, action: "UNCONFIRM", fromStatus: "WAREHOUSE", toStatus: "WAREHOUSE", storageNo: item.storageNo, note: "실물 입고 확인 취소" })
        }
        setChecked(new Set())
```

건마다 부르는 것은 기존 `CONFIRM` 분기와 같다. 이 동작은 사람이 몇 건 골라서 누르는 자리라 그대로 둔다.
라운드처럼 수백 건이 한 번에 오지 않는다.

### A-4-3. 다이얼로그 제목(934~943행)

`: actionDialog?.kind === "CONFIRM" ? "실물 입고 확인"` 다음 줄에 같은 들여쓰기로 더한다.

```ts
    : actionDialog?.kind === "UNCONFIRM" ? "실물 입고 확인 취소"
```

### A-4-4. 다이얼로그 본문

1494행의 `UNRECEIVE` 안내문 다음 줄에 더한다.

```tsx
          {actionDialog?.kind === "UNCONFIRM" ? <p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.filter((item) => item.confirmedAt).length}건의 <strong>실물 확인 표시만 지웁니다.</strong> R&D No., 보유 재고, 출고 기록은 그대로 둡니다. 확인이 안 된 건은 건너뜁니다. 취소 기록은 원단 상세의 이력에 남습니다.</p> : null}
```

### A-4-5. 툴바 버튼

1361행 `입고 확인` 버튼 바로 다음 줄에 더한다. 확인된 건이 하나도 없으면 누를 수 없다.

```tsx
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.some((item) => item.confirmedAt)} title={selectedRows.some((item) => item.confirmedAt) ? "선택한 원단의 실물 확인 표시를 지웁니다" : "확인된 원단을 먼저 선택하세요."} onClick={() => openAction("UNCONFIRM", selectedRows)}><PackageX />입고 확인 취소</Button> : null}
```

`PackageX`를 lucide-react import 목록에 더한다. 알파벳 순서를 유지한다.

---

# B. 출고 요청 메일 팝업 항목 정리

## 확정된 규칙

| 항목 | 결정 |
|---|---|
| 표 항목 | `R&D No. / Rack No. / 요청(yds) / 재고(yds) / FL# / 원단 / 비고` 순서 그대로 |
| 빠지는 열 | `Style No.`, `컬러` |
| 적용 범위 | 팝업 표와 **메일 본문 표 둘 다** 같은 항목으로 바꾼다 |
| 사업부 | 라벨과 메일 본문 문구를 **부서**로 바꾼다. 필드명 `division`은 그대로 둔다 |
| 희망 컷팅일 | 창을 열 때 오늘 날짜를 채운다. **입력칸은 그대로 두고 고칠 수 있게 한다** |
| 상단 비고 | 칸과 데이터 모두 지운다. 표 안의 줄별 비고는 그대로 둔다 |

## B-1. `src/data/outbound-request-mail.ts`

### B-1-1. `OutboundRequestMeta`에서 `note` 제거

현재:

```ts
export interface OutboundRequestMeta {
  division: string
  requester: string
  /** yyyy-mm-dd */
  wantedDate: string
  note: string
}
```

바꾼다.

```ts
export interface OutboundRequestMeta {
  /** 요청 부서. 메일 본문에 "부서:"로 나간다 */
  division: string
  requester: string
  /** yyyy-mm-dd. 창을 열 때 오늘 날짜가 채워지고 사람이 고칠 수 있다 */
  wantedDate: string
}
```

### B-1-2. `OUTBOUND_REQUEST_COLUMNS` 교체

```ts
export const OUTBOUND_REQUEST_COLUMNS = ["R&D No.", "Rack No.", "요청(yds)", "재고(yds)", "FL#", "원단", "비고"] as const
```

### B-1-3. `outboundRequestRows` 교체

```ts
export function outboundRequestRows(lines: readonly OutboundRequestLine[]): string[][] {
  return lines.map((line) => {
    const stock = stockYds(line.item)
    return [
      line.item.storageNo,
      line.item.rackNo ?? "",
      line.qty.trim(),
      stock === null ? "" : String(stock),
      line.item.flNo,
      line.item.construction,
      line.note.trim(),
    ]
  })
}
```

### B-1-4. `outboundRequestHtml`의 본문 줄

현재:

```ts
  if (meta.division.trim()) rows.push(`사업부: ${meta.division.trim()}`)
```

바꾼다.

```ts
  if (meta.division.trim()) rows.push(`부서: ${meta.division.trim()}`)
```

그리고 아래 줄을 **지운다**.

```ts
  if (meta.note.trim()) rows.push(`비고: ${meta.note.trim()}`)
```

`outboundRequestSubject`는 손대지 마라.

## B-2. `src/components/warehouse/OutboundRequestMailDialog.tsx`

### B-2-1. `EMPTY_META`와 오늘 날짜 헬퍼

현재 27행:

```ts
const EMPTY_META: OutboundRequestMeta = { division: "", requester: "", wantedDate: "", note: "" }
```

바꾼다.

```ts
/** 오늘 날짜(yyyy-mm-dd). toISOString은 UTC라 한국 시간 오전 9시 전에 어제로 나온다. 현지 날짜로 만든다. */
const todayValue = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const EMPTY_META: OutboundRequestMeta = { division: "", requester: "", wantedDate: "" }
```

### B-2-2. 창 열 때 초기화

현재:

```ts
    setMeta({ ...EMPTY_META, requester: defaultRequester })
```

바꾼다.

```ts
    setMeta({ ...EMPTY_META, requester: defaultRequester, wantedDate: todayValue() })
```

### B-2-3. 상단 입력 묶음

현재 `<div className="grid gap-3 sm:grid-cols-4">` 안에 사업부·요청자·희망 컷팅일·비고 네 칸이 있다.
**비고 칸(`outbound-note`) 전체를 지우고**, 사업부 라벨을 부서로 바꾸고, 그리드를 3칸으로 줄인다.

바꾼 뒤 모습:

```tsx
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-division">부서</Label>
            <Input id="outbound-division" value={meta.division} onChange={(event) => setMeta((current) => ({ ...current, division: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-requester">요청자</Label>
            <Input id="outbound-requester" value={meta.requester} onChange={(event) => setMeta((current) => ({ ...current, requester: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-date">희망 컷팅일</Label>
            <Input id="outbound-date" type="date" value={meta.wantedDate} onChange={(event) => setMeta((current) => ({ ...current, wantedDate: event.target.value }))} />
          </div>
        </div>
```

### B-2-4. 표 머리

현재:

```tsx
                {["R&D No.", "Style No.", "FL#", "원단", "컬러", "재고(yds)", "요청(yds)", "비고"].map((head) => <th key={head} ...
```

배열 리터럴을 지우고 `OUTBOUND_REQUEST_COLUMNS`를 쓴다. 두 벌이 어긋나지 않게 한 곳만 본다.
`OUTBOUND_REQUEST_COLUMNS`는 이 파일이 이미 import하고 있다.

```tsx
                {OUTBOUND_REQUEST_COLUMNS.map((head) => <th key={head} className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-center font-normal text-[var(--muted-foreground)]">{head}</th>)}
```

### B-2-5. 표 본문 `<tr>` 교체

`requestLines.map` 안의 `<tr>` 안쪽 `<td>` 여덟 개를 아래 일곱 개로 통째로 바꾼다.
`stock`, `error`, `qtyError`, `overStock`, `setLine`은 그대로 쓴다.

```tsx
                return <tr key={line.item.key}>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{line.item.storageNo}</td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{line.item.rackNo ?? ""}</td>
                  <td className="w-24 border-b border-[var(--border)] px-2 py-1">
                    <Input aria-label={`${line.item.storageNo} 요청 수량`} inputMode="decimal" value={line.qty} onChange={(event) => setLine(line.item.key, { qty: event.target.value })} className={`h-7 text-right text-xs ${error && line.qty ? "border-[var(--destructive)]" : ""}`} />
                    {overStock(line) ? <p className="mt-0.5 text-[10px] text-[var(--warning)]">재고 초과</p> : null}
                  </td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 text-right tabular-nums">{stock === null ? "" : stock.toLocaleString("ko-KR")}</td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{line.item.flNo}</td>
                  <td className="max-w-40 truncate border-b border-[var(--border)] px-2 py-1.5" title={line.item.construction}>{line.item.construction}</td>
                  <td className="w-40 border-b border-[var(--border)] px-2 py-1">
                    <Input aria-label={`${line.item.storageNo} 비고`} value={line.note} onChange={(event) => setLine(line.item.key, { note: event.target.value })} className="h-7 text-xs" />
                  </td>
                </tr>
```

---

## 하지 말 것

- `src/data/warehouse-export.ts`를 고치지 마라. `INBOUND_ACTIONS`에 `UNCONFIRM`을 넣지 마라. 이유는 A 배경에 있다.
- `applyFabricAction` 본문을 고치지 마라. `UNCONFIRM`은 기존 경로를 그대로 탄다
  (도착 상태가 `WAREHOUSE`라 rack 칸과 재고가 그대로 유지된다).
- `OutboundRequestMeta.division` 필드 이름을 바꾸지 마라. 화면 문구만 부서로 바꾼다.
- `outboundRequestSubject`, `stockYds`, `buildEml`, `copyMailTable`을 고치지 마라.
- `InboundRequestMailDialog.tsx`는 이 작업과 무관하다. 열지 마라.
- 커밋하거나 푸시하지 마라.

## 검증

`npm run build` 한 번만. A와 B를 모두 끝낸 뒤에 돌린다.

성공 기준: 빌드 통과, `git status --short`에 아래 여섯 파일만 M으로 보인다.

```
 M src/components/warehouse/OutboundRequestMailDialog.tsx
 M src/data/fabric-ledger.ts
 M src/data/outbound-request-mail.ts
 M src/data/schema.ts
 M src/routes/FabricDetail.tsx
 M src/routes/Warehouse.tsx
```

R198에서 이미 고친 네 파일(`DisposalRoundPanel.tsx`, `disposal-round.ts`, `Warehouse.tsx`, `useAppStore.ts`)의
변경은 워킹트리에 그대로 남아 있어야 한다. **되돌리지 마라.** `Warehouse.tsx`는 두 작업이 겹치는 파일이다.
