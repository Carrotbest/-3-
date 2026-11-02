# R381 — 출고 취소를 3팀에 열고, 소진에서 복구하면 출고 기간을 끝낸다

상태: 미착수. 두 건 모두 원인 규명이 끝났고 바꿀 코드가 아래에 그대로 있다. R379, R380의 후속이다.

2026-11-02 박향근 확정. 배경은 **재가공 반출 후 재입고**다. 창고에 있던 원단을 재가공하려고 전량 반출하면 잔량이 0이 되어 자동 소진으로 이력에 간다. 재가공을 마치고 같은 R&D No.로 다시 들어오는데, 이력에서 「창고 보관으로」 복구하면 출고 합계가 그대로 남아 잔량이 0이다. 그 상태에서 수량을 실제 값으로 고치면 `고친 값 − 출고 합계 ≤ 0`이 되어 **자동 소진이 다시 걸리고 행이 이력으로 넘어간다.**

R379는 화면과 저장이 서로 다른 출고 합계를 보던 것을 맞췄을 뿐이라 이 경로를 덮지 못한다. 이 경로는 양쪽이 같은 값을 본다.

---

## A. 출고 취소를 3팀에도 연다

나갔던 원단이 돌아온 상황의 정식 경로가 「출고 취소」(UNOUTBOUND)다. 번호가 유지되고 출고 합계가 제대로 돌아온다. 그런데 권한이 `outbound`라 창고팀만 쓸 수 있어서 실무자가 복구 쪽으로 돌아가게 된다.

**출고 등록(OUTBOUND)은 창고팀 그대로 두고 취소만 연다.** R380에서 세운 "되돌리는 동작은 `restore`, 처분과 등록은 제 규칙" 구분을 그대로 따른다.

### A-1. `src/data/warehouse-policy.ts` 22~23행

현재

```ts
    case "outbound":
      return settlement ? null : "출고 등록과 출고 취소는 창고팀만 할 수 있습니다. 출고 요청 메일을 보내 주세요."
```

교체

```ts
    case "outbound":
      return settlement ? null : "출고 등록은 창고팀만 할 수 있습니다. 출고 요청 메일을 보내 주세요."
```

### A-2. `src/data/warehouse-policy.ts` 의 `restore` 주석과 문구

현재

```ts
    // 되돌리는 동작은 창고팀도 한다(R379, R380, 2026-11-02 박향근 지시). 이력에서의 복구,
    // 목록 숨김 해제, 입고 취소가 모두 여기에 든다. 실물을 쥔 쪽이 잘못 들어간 건을 그 자리에서
    // 되돌릴 수 있어야 한다는 요구다. 입고 취소는 R379에서 3팀으로 뒀다가 같은 날 바뀌었다.
    // lifecycle 에 남는 것은 폐기와 소진뿐이다. 그 둘은 처분이라 3팀 판단이다.
    // **되돌리기와 처분을 다시 한 규칙으로 합치지 말 것.**
    case "restore":
      if (settlement) return null
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 복구는 1팀과 창고팀만 할 수 있습니다."
        : "복구와 입고 대기로 되돌리기는 원단 R&D팀(3팀)과 창고팀만 할 수 있습니다."
```

교체

```ts
    // 되돌리는 동작은 3팀과 창고팀이 함께 한다(R379, R380, R381, 2026-11-02 박향근 지시).
    // 이력에서의 복구, 목록 숨김 해제, 입고 취소, 출고 취소가 모두 여기에 든다. 실물을 쥔 쪽과
    // 개발을 쥔 쪽 어느 쪽이든 잘못 들어간 건을 그 자리에서 되돌릴 수 있어야 한다는 요구다.
    // 출고 취소는 재가공 반출 후 재입고의 정식 경로라 3팀이 못 쓰면 복구로 우회하게 된다.
    // lifecycle 에 남는 것은 폐기와 소진, outbound 에 남는 것은 출고 등록뿐이다.
    // **되돌리기를 처분이나 등록과 다시 한 규칙으로 합치지 말 것.**
    case "restore":
      if (settlement) return null
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 복구는 1팀과 창고팀만 할 수 있습니다."
        : "복구, 입고 대기로 되돌리기, 출고 취소는 원단 R&D팀(3팀)과 창고팀만 할 수 있습니다."
```

### A-3. `src/store/useAppStore.ts` 1535~1536행

현재

```ts
    if (input.action === "OUTBOUND" || input.action === "UNOUTBOUND") rules.push("outbound")
    if (input.action === "DISPOSE" || input.action === "EXHAUST") rules.push("lifecycle")
    if (input.action === "RESTORE" || input.action === "UNRECEIVE") rules.push("restore")
```

교체

```ts
    if (input.action === "OUTBOUND") rules.push("outbound")
    if (input.action === "DISPOSE" || input.action === "EXHAUST") rules.push("lifecycle")
    if (input.action === "RESTORE" || input.action === "UNRECEIVE" || input.action === "UNOUTBOUND") rules.push("restore")
```

### A-4. `src/routes/Warehouse.tsx` 2042행과 2052행

그 두 줄에서만 `guardedAction("outbound"` 를 `guardedAction("restore"` 로 바꾼다. **`openAction("UNOUTBOUND", ...)` 를 여는 버튼 둘뿐이다.** 출고 확정(`openAction("OUTBOUND", ...)`)을 여는 버튼은 `outbound` 그대로 둔다.

---

## B. 소진에서 창고 보관으로 복구하면 출고 기간을 끝낸다

소진은 나갈 것이 다 나갔다는 뜻이고, 거기서 창고 보관으로의 복구는 다시 들어왔다는 뜻이다. 새 재고 기간으로 본다.

### B-1. `src/data/fabric-ledger.ts` 694~698행

현재

```ts
    if (event.toStatus === "READY") {
      outboundMap.delete(itemKey)
      intakeMap.delete(itemKey)
      intakeByMap.delete(itemKey)
    }
```

교체(기존 블록은 그대로 두고 **아래 블록을 바로 뒤에 더한다**)

```ts
    if (event.toStatus === "READY") {
      outboundMap.delete(itemKey)
      intakeMap.delete(itemKey)
      intakeByMap.delete(itemKey)
    }
    // 소진에서 창고 보관으로 되돌리는 것은 나갔던 원단이 돌아왔다는 뜻이다(R381, 2026-11-02
    // 박향근 확정). 재가공 때문에 전량 반출했다가 같은 번호로 다시 들어오는 경우가 그것이다.
    // 출고 기간을 거기서 끝내고 0부터 다시 센다. 그러지 않으면 복구 직후 잔량이 0이라
    // 보유 재고를 고치는 순간 자동 소진이 다시 걸려 그 행이 이력으로 넘어간다.
    // 입고 시각과 등록자는 지우지 않는다. 번호와 입고 기록이 그대로 살아 있기 때문이다.
    // **폐기(DISPOSED)에서의 복구는 여기 들지 않는다.** 폐기는 출고와 무관하다.
    if (event.action === "RESTORE" && event.fromStatus === "EXHAUSTED" && event.toStatus === "WAREHOUSE") {
      outboundMap.delete(itemKey)
    }
```

**저장 쪽은 고칠 것이 없다.** R379에서 `applyFabricActions`가 원장이 낸 `item.outboundTotal`을 받게 바꿨으므로 이 변경이 자동 소진 판정까지 그대로 간다. 저장 쪽에 같은 조건을 또 쓰지 말 것.

### 하지 말 것

- 출고 기록(`OUTBOUND` 이벤트)을 지우거나 취소 표시하지 말 것. 원단 상세의 이력이 비어 버린다. 여기서 비우는 것은 집계용 `outboundMap` 하나다.
- 폐기에서의 복구에 같은 조건을 걸지 말 것.
- `intakeMap`, `intakeByMap`을 같이 비우지 말 것. 입고일과 등록자가 사라지면 `storageNo` 권한 판정(`intakeByEmail`)이 깨진다.
- 자동 소진 자체를 끄지 말 것. 출고로 잔량이 0이 되면 소진으로 넘기는 것은 맞는 동작이다.
- `isFabricBalanceExhausted` 의 `<= 0` 을 건드리지 말 것.

---

## C. `CLAUDE.md`

「창고」 절의 R379·R380 항목 바로 아래에 다음 두 줄을 더한다.

```
  - **출고 취소도 3팀이 한다**(R381, 2026-11-02 박향근 확정). `restore` 규칙으로 옮겼고 `outbound` 에는 출고 등록만 남았다. 재가공 반출 후 재입고의 정식 경로가 출고 취소인데 창고팀 전용이라 3팀이 복구로 우회하고 있었다. 출고 등록을 함께 열지 말 것. 출고는 창고팀이 실물을 내보내며 남기는 기록이다.
  - **소진에서 창고 보관으로 복구하면 출고 기간이 끝난다**(R381). `buildFabricLedger` 가 `RESTORE` + `fromStatus EXHAUSTED` + `toStatus WAREHOUSE` 를 만나면 그 원단의 `outboundMap` 을 비운다. 재가공으로 전량 반출해 소진된 원단이 같은 번호로 돌아오는 경우다. **이 초기화가 없으면 복구 직후 잔량이 0이라 보유 재고를 고치는 순간 자동 소진이 다시 걸려 행이 이력으로 넘어간다.** 입고 시각과 등록자는 지우지 않는다. `storageNo` 권한이 `intakeByEmail` 을 본다. **폐기에서의 복구에는 걸지 않는다.** 폐기는 출고와 무관하다. 저장 쪽은 R379로 이미 원장 값을 받으므로 같은 조건을 두 곳에 쓰지 말 것.
```

---

## 검증

`npm run build` 한 번. `git status --short` 로 `src/data/warehouse-policy.ts`, `src/data/fabric-ledger.ts`, `src/store/useAppStore.ts`, `src/routes/Warehouse.tsx`, `CLAUDE.md` 다섯만 바뀌었는지 본다. 화면 확인은 박향근이 한다.
