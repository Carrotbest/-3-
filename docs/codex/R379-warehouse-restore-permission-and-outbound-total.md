# R379 — 복구 권한을 창고팀에 열고, 자동 소진 판정이 원장과 같은 출고 합계를 보게 한다

상태: 미착수. 두 건 모두 원인 규명까지 끝났고 바꿀 코드가 아래에 그대로 있다.

2026-11-02 박향근 요구 두 가지다.

1. 이력 탭에서 창고 보관이나 입고 대기로 되돌리는 **복구를 창고팀도 할 수 있게** 한다.
2. 이력에서 입고 대기로 복구해 다시 입고한 원단의 **보유 재고를 고치면 그 행이 통째로 이력으로 넘어가는** 문제를 고친다.

---

## A. 복구 권한

### 지금 상태

`src/data/warehouse-policy.ts`의 `lifecycle` 규칙 하나가 폐기, 소진, 입고 취소, 복구 넷을 함께 묶어 **3팀(1팀 원단이면 1팀)만** 허용한다. 정산관리팀(창고팀)은 `confirm`과 `outbound`만 통과한다. 그래서 창고팀은 이력 탭의 「창고 보관으로」, 「입고 대기로」를 눌러도 막힌다.

### 할 것

`restore` 규칙을 새로 만들어 RESTORE만 떼어 낸다. **입고 취소(UNRECEIVE)는 `lifecycle`에 그대로 둔다.** 채번을 푸는 동작이라 성격이 다르고 박향근이 요구한 것은 복구다.

#### A-1. `src/data/warehouse-policy.ts` 10행

현재

```ts
export type WarehouseRule = "confirm" | "outbound" | "lifecycle" | "storageNo" | "yds" | "rack"
```

교체

```ts
export type WarehouseRule = "confirm" | "outbound" | "lifecycle" | "restore" | "storageNo" | "yds" | "rack"
```

#### A-2. `src/data/warehouse-policy.ts` 24~29행

현재

```ts
    case "lifecycle":
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 폐기, 소진, 복구는 1팀만 할 수 있습니다."
        : "폐기, 소진, 입고 대기로 되돌리기, 복구는 원단 R&D팀(3팀)만 할 수 있습니다."
```

교체

```ts
    case "lifecycle":
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 폐기와 소진은 1팀만 할 수 있습니다."
        : "폐기, 소진, 입고 대기로 되돌리기는 원단 R&D팀(3팀)만 할 수 있습니다."
    // 복구는 창고팀도 한다(R379, 2026-11-02 박향근 지시). 실물을 쥔 쪽이 잘못 폐기·소진된 건을
    // 그 자리에서 되돌릴 수 있어야 한다. 입고 취소(UNRECEIVE)는 채번을 푸는 동작이라
    // lifecycle 에 그대로 두고 3팀만 한다. 둘을 다시 한 규칙으로 합치지 말 것.
    case "restore":
      if (settlement) return null
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 복구는 1팀과 창고팀만 할 수 있습니다."
        : "복구는 원단 R&D팀(3팀)과 창고팀만 할 수 있습니다."
```

#### A-3. `src/store/useAppStore.ts` 1536행

현재

```ts
    if (input.action === "DISPOSE" || input.action === "EXHAUST" || input.action === "UNRECEIVE" || input.action === "RESTORE") rules.push("lifecycle")
```

교체

```ts
    if (input.action === "DISPOSE" || input.action === "EXHAUST" || input.action === "UNRECEIVE") rules.push("lifecycle")
    if (input.action === "RESTORE") rules.push("restore")
```

#### A-4. `src/routes/Warehouse.tsx` 2050행과 2051행

그 **두 줄에서만** `guardedAction("lifecycle"` 을 `guardedAction("restore"` 로 바꾼다. 2046, 2047, 2048행(소진, 폐기, 창고보관 탭의 입고 대기로)은 `lifecycle` 그대로 둔다.

2050행

```ts
        {tab === "HISTORY" && canEditScope ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => guardedAction("restore", selectedRows, () => openAction("RESTORE", selectedRows, "WAREHOUSE"))}><PackageCheck />창고 보관으로</Button> : null}
```

2051행

```ts
        {tab === "HISTORY" && canEditScope && teamScope !== "team1" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => guardedAction("restore", selectedRows, () => openAction("RESTORE", selectedRows, "READY"))}><PackageOpen />입고 대기로</Button> : null}
```

목록 숨김 해제(1411행 근처의 `action: "RESTORE"`)도 같은 `restore` 규칙을 타게 된다. 되살리기라 의도한 결과다. 그 코드는 건드리지 않는다.

---

## B. 자동 소진이 엉뚱하게 걸리는 문제

### 증상

이력에 있던 원단을 입고 대기로 복구하고 다시 창고 보관으로 입고 확정한 뒤, 「보유 재고 수정」에서 전체 수량을 고치면 **그 행이 통째로 이력(소진)으로 넘어간다.** 화면의 「보유 재고 수정」 창에는 출고 합계가 작게 떠 있어 잔량이 0이 될 이유가 없어 보인다.

### 원인(코드로 확인함)

출고 합계를 내는 곳이 **둘인데 규칙이 다르다.**

- 화면 쪽 `src/data/fabric-ledger.ts` `buildFabricLedger` 691~697행: 기록을 시간순으로 훑다가 **도착 상태가 입고 대기(`toStatus === "READY"`)인 기록을 만나면 그 원단의 출고 목록을 비운다.** 재고 기간이 끝났으니 다음 입고부터 다시 센다는 규칙이다. 「보유 재고 수정」 창의 출고 합계도 이 값이다(`Warehouse.tsx` 2227행 `actionItems[0]?.outboundTotal`).
- 저장 쪽 `src/store/useAppStore.ts` 1562~1568행: `state.fabricEvents`에서 취소되지 않은 OUTBOUND 기록을 **전부 더한다.** 입고 대기 초기화가 없다.

보유 재고 수정은 `action: "NOTE"` + `yds`로 들어가고(`Warehouse.tsx` 1109행), 1600행 `shouldAutoExhaust`가 참이 되어 1603행에서 `isFabricBalanceExhausted(yds, outboundTotal)`를 본다. 여기 쓰이는 `outboundTotal`이 **복구 이전 출고까지 포함한 값**이라, 복구를 거친 원단은 화면에 보이는 잔량이 넉넉해도 저장 시점에 `yds - outboundTotal <= 0`이 되어 `EXHAUSTED`로 넘어간다.

### 틀렸던 가설

「복구(RESTORE)가 출고 이력을 안 지워서」가 아니다. 기록은 원래 지우지 않는 설계이고 원장은 입고 대기 시점에 **세는 것만** 다시 시작한다. 그 초기화를 저장 쪽이 따라 하지 않는 것이 문제다. 이벤트를 삭제하는 방향으로 고치지 말 것.

### 할 것

저장 쪽이 원장이 낸 값을 그대로 받게 한다. 계산을 두 벌 두지 않는다.

#### B-1. `src/store/useAppStore.ts` 1550~1551행

현재

```ts
  const beforeEvents = state.fabricEvents
  const recordIds = fabricRecordIdIndex(buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true }))
```

교체(이미 만들고 버리던 원장을 변수로 잡는다. 새로 빌드하지 않는다)

```ts
  const beforeEvents = state.fabricEvents
  const fullLedger = buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true })
  const recordIds = fabricRecordIdIndex(fullLedger)
```

#### B-2. `src/store/useAppStore.ts` 1562~1568행

현재

```ts
  const outboundTotals = new Map<string, number>()
  const canceledOutbounds = canceledOutboundIds(state.fabricEvents)
  state.fabricEvents.forEach((event) => {
    if (event.action !== "OUTBOUND" || canceledOutbounds.has(event.id) || typeof event.qty !== "number" || !Number.isFinite(event.qty) || event.qty <= 0) return
    const identity = event.recordId ?? recordIdForFabricKey(state, event.fabricKey, recordIds) ?? event.fabricKey
    outboundTotals.set(identity, (outboundTotals.get(identity) ?? 0) + event.qty)
  })
```

교체

```ts
  // 출고 합계는 원장이 낸 값을 그대로 받는다(R379). 원장은 도착 상태가 입고 대기인 기록을
  // 만나면 그 원단의 출고를 0부터 다시 센다. 여기서 이벤트를 직접 더하면 그 초기화가 빠져서
  // 화면이 보여 주는 출고 합계와 자동 소진 판정이 서로 다른 숫자를 본다. 복구를 거친 원단이
  // 보유 재고를 고치는 순간 이력으로 넘어가던 원인이다. 이벤트를 다시 더하지 말 것.
  const outboundTotals = new Map<string, number>()
  const canceledOutbounds = canceledOutboundIds(state.fabricEvents)
  fullLedger.forEach((item) => {
    if (!(item.outboundTotal > 0)) return
    const identity = recordIdForFabricKey(state, item.key, recordIds) ?? item.key
    outboundTotals.set(identity, item.outboundTotal)
  })
```

`canceledOutbounds`는 아래 UNOUTBOUND 처리(1584행 근처)에서 계속 쓰므로 **지우지 말 것.**

1634행의 `if (input.action === "OUTBOUND" || input.action === "UNOUTBOUND") outboundTotals.set(ledgerIdentity, outboundTotal)`도 그대로 둔다. 한 번의 호출 안에서 출고가 여러 건 들어올 때 누적을 이어 가는 자리다.

### 하지 말 것

- 자동 소진 자체를 끄지 말 것. 출고로 잔량이 0이 되면 소진으로 넘기는 것은 맞는 동작이다.
- `isFabricBalanceExhausted`의 `<= 0`을 `< 0`으로 바꾸지 말 것. 정상 출고로 딱 떨어지는 건이 소진으로 안 넘어간다.
- `buildFabricLedger`의 `toStatus === "READY"` 초기화를 건드리지 말 것. 화면 쪽이 맞는 쪽이다.
- RESTORE나 RECEIVE 때 OUTBOUND 기록을 지우거나 취소 표시하지 말 것. 원단 상세 이력이 비어 버린다.

---

## C. `CLAUDE.md`

「창고」 절의 권한(R290) 항목 바로 아래에 다음 두 줄을 더한다.

```
  - **복구는 창고팀도 한다**(R379, 2026-11-02 박향근 지시). `restore` 규칙이 `lifecycle`에서 떨어져 나왔고 정산관리팀을 통과시킨다. 이력 탭의 「창고 보관으로」·「입고 대기로」와 목록 숨김 해제가 이 규칙이다. **입고 취소(UNRECEIVE)는 `lifecycle` 그대로 3팀이다.** 채번을 푸는 동작이라 성격이 다르다. 둘을 다시 한 규칙으로 합치지 말 것.
  - **자동 소진 판정은 원장이 낸 출고 합계를 쓴다**(R379). `applyFabricActions`가 `state.fabricEvents`의 OUTBOUND를 직접 더하던 것을 `buildFabricLedger` 결과(`item.outboundTotal`)를 받는 것으로 바꿨다. 원장은 도착 상태가 입고 대기인 기록에서 출고를 0부터 다시 세는데 저장 쪽에 그 초기화가 없어서, **이력에서 복구해 재입고한 원단은 보유 재고를 고치는 순간 잔량이 음수로 판정돼 이력(소진)으로 넘어갔다.** 화면의 「보유 재고 수정」 창은 원장 값을 보여 주므로 숫자가 멀쩡해 보이던 것이 그 때문이다. **출고 합계를 두 곳에서 따로 세지 말 것.**
```

---

## 검증

`npm run build` 한 번. `git status --short`로 위에 적은 네 파일(`src/data/warehouse-policy.ts`, `src/store/useAppStore.ts`, `src/routes/Warehouse.tsx`, `CLAUDE.md`)만 바뀌었는지 본다. 화면 확인은 박향근이 한다.

---

## R380 후속 (2026-11-02)

입고 취소(UNRECEIVE)는 창고팀도 하라는 지시가 같은 날 들어왔다. 새 권한 규칙을 만들지 않고 `restore`로 옮겼다. 규칙은 이제 되돌리는 동작(`restore`: 복구, 숨김 해제, 입고 취소)과 처분(`lifecycle`: 폐기, 소진)으로 갈린다. A 절의 "입고 취소는 lifecycle 에 그대로 둔다"는 R380에서 뒤집혔다.
