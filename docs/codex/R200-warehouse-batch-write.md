# R200 — 창고 일괄 처리 중 쓰기 유실과 지연 해결

상태: 미착수. 원인 규명 완료. 설계 확정됨. 이 문서대로만 구현한다.

## 증상

창고 보관 탭에서 24건을 체크해 `입고 확인`을 누르면 일부만 확인 처리된다.
남은 건을 다시 체크해 두세 번 돌려야 전부 확인된다. 다른 일괄 동작(폐기, 소진, 되돌리기)도 같다.

## 원인 (코드에서 확인함. 브라우저 재현은 하지 않았다)

### 원인 1 — 전송 완료 후 되쓰기가 뒤 건을 덮는다

`src/routes/Warehouse.tsx`의 일괄 동작은 건마다 `applyFabricAction`을 `await`하는 루프다.
`applyFabricAction`은 매번 store 전체를 읽어 새 배열을 만들고 `saveCache`를 부른다.
`saveCache`(`src/data/cache.ts`)는 IndexedDB 저장까지만 기다리고 `firestorePush`는 기다리지 않는다.
따라서 루프가 앞서 도는 동안 전송 1~N번이 뒤에서 진행된다.

`src/data/firestore-sync.ts`의 `pushCacheNow` 끝부분:

```ts
    if (merged !== value) {
      setAppState(normalizeLoadedRecords({ [key]: merged } as AppStatePatch))
      void saveCacheLocal(key, merged)
    }
```

- `value`는 **그 전송이 시작될 때의 배열 스냅샷**이다. 지금 store 값보다 뒤처져 있을 수 있다.
- `merged !== value`는 **항상 참**이다. `mergeKeyed`(`src/data/sync-merge.ts`)는 바뀐 것이 없어도
  늘 새 배열을 만들어 돌려주므로 참조가 같을 수 없다.

그래서 3번 전송이 끝나는 순간, 루프가 10번째를 돌고 있어도 store가 3건짜리 스냅샷으로 되감긴다.
11번째는 그 위에 얹히므로 4~10번 이벤트가 배열에서 빠진다.
`confirmedAt`은 저장된 값이 아니라 `fabricEvents`를 접어서 만드는 값이라
(`src/data/fabric-ledger.ts:512~533`), 빠진 건은 다시 미확인으로 보인다.

같은 함수가 2026-09-10에도 손실 사고를 냈다(R121, 병합 방향이 뒤집혀 있던 건).
**이 함수를 고칠 때는 이 문서에 적힌 부분만 고친다.** 병합 방향과 기준선 갱신은 건드리지 마라.

### 원인 2 — 건마다 전체 배열을 두 번씩 저장한다

24건이면 `fabricOverrides`와 `fabricEvents`를 각각 24번, 합쳐 48번 통째로 저장한다.
저장 한 번마다 IndexedDB 커넥션을 새로 열고 닫으며, Firestore로는 배열 전체를 JSON으로 만들어
20만 자 청크로 나눠 batch commit 한다. `fabricEvents`는 이 앱에서 가장 큰 배열이다.

---

# 수정 1 — 창고 동작 일괄 저장

## 1-1. `src/store/useAppStore.ts` — `applyFabricActions` 신설

현재 `applyFabricAction`(879행부터 1018행 `}`까지) **전체를 아래로 교체한다.**
기존 함수는 새 배치 함수를 한 건으로 부르는 껍데기로 남긴다. 호출부는 그대로 동작한다.

```ts
/**
 * 여러 건의 창고 동작을 한 번에 저장한다.
 *
 * 건마다 applyFabricAction 을 부르면 그만큼 전체 배열 저장과 Firestore 전송이 반복되고,
 * 전송이 끝나며 돌아오는 되쓰기가 아직 저장 중인 뒤 건을 덮어 일부만 처리된다(R200).
 * 오버라이드와 이벤트를 메모리에서 모두 접은 뒤 한 번만 쓴다.
 *
 * 중간에 검증 오류가 나면 아무것도 저장되지 않는다. 배열을 다 만든 뒤에 쓰기 때문이다.
 */
export async function applyFabricActions(inputs: ReadonlyArray<ApplyFabricActionInput>): Promise<void> {
  if (!inputs.length) return
  const state = useAppStore.getState()
  const beforeEvents = state.fabricEvents
  const occurredAt = new Date().toISOString()

  // 같은 배치 안에서 앞 건의 결과를 뒤 건이 본다. 키가 겹쳐도 어긋나지 않는다.
  const overrideMap = new Map(state.fabricOverrides.map((item) => [item.key, item]))
  const outboundTotals = new Map<string, number>()
  state.fabricEvents.forEach((event) => {
    if (event.action !== "OUTBOUND" || typeof event.qty !== "number" || !Number.isFinite(event.qty) || event.qty <= 0) return
    outboundTotals.set(event.fabricKey, (outboundTotals.get(event.fabricKey) ?? 0) + event.qty)
  })

  const newEvents: FabricLedgerEvent[] = []
  const touched: string[] = []
  let records = state.records

  for (const input of inputs) {
    const actor = input.actor?.trim() || "관리자"
    const previous = overrideMap.get(input.fabricKey)
    const yds = input.yds === undefined
      ? previous?.yds
      : Number.isFinite(input.yds) && input.yds >= 0 ? input.yds : undefined
    if (input.yds !== undefined && yds === undefined) throw new Error("보유 재고는 0 이상의 숫자여야 합니다.")

    const qty = input.qty === undefined
      ? undefined
      : Number.isFinite(input.qty) && input.qty > 0 ? input.qty : undefined
    if (input.action === "OUTBOUND" && qty === undefined) throw new Error("출고 수량은 0보다 커야 합니다.")
    const recipient = input.to?.trim()
    if (input.action === "OUTBOUND" && !recipient) throw new Error("출고 수령자를 입력해야 합니다.")

    const previousOutboundTotal = outboundTotals.get(input.fabricKey) ?? 0
    const outboundTotal = previousOutboundTotal + (input.action === "OUTBOUND" ? qty ?? 0 : 0)
    // 잔량이 0이 되어도 소진 완료로 옮길지는 사용자가 정한다. 기본은 옮긴다.
    const autoExhaust = input.autoExhaust !== false
    const shouldAutoExhaust = autoExhaust && (input.action === "OUTBOUND" || (input.yds !== undefined && input.action !== "RESTORE" && input.action !== "DISPOSE"))
    const resolvedToStatus = shouldAutoExhaust && isFabricBalanceExhausted(yds, outboundTotal)
      ? "EXHAUSTED"
      : input.action === "OUTBOUND"
        ? previous?.status ?? input.fromStatus
        : input.toStatus
    const selectedDate = input.date?.trim()
    const selectedDateValue = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? new Date(`${selectedDate}T12:00:00`) : null
    const eventOccurredAt = selectedDateValue && !Number.isNaN(selectedDateValue.getTime()) ? selectedDateValue.toISOString() : occurredAt

    const override: FabricLedgerOverride = {
      key: input.fabricKey,
      status: resolvedToStatus,
      // 입고 대기로 내려가면 채번을 취소한다. 그 번호는 다시 쓸 수 있게 풀린다.
      // 되돌리기(UNRECEIVE)든 이력에서의 복구(RESTORE)든 도착 상태가 기준이다.
      storageNo: resolvedToStatus === "READY" ? undefined : input.storageNo?.trim() || previous?.storageNo,
      // 같은 이유로 보유 재고도 비운다. 남겨 두면 입고한 적 없는 행에 재고가 붙어 있게 된다.
      yds: resolvedToStatus === "READY" || input.clearYds ? undefined : yds,
      // rack 칸은 창고보관 상태에서만 차지한다. 입고확인·재고수정·출고는 그대로 두고, 창고를 떠나면(폐기·소진·입고 취소) 칸을 비운다.
      rackNo: resolvedToStatus === "WAREHOUSE" ? previous?.rackNo : undefined,
      note: input.note?.trim() || previous?.note,
      // 원단 상세에서 고친 값은 창고 동작(입고·확인·출고 등)과 무관하다. 그대로 물려준다.
      fields: previous?.fields,
      updatedAt: occurredAt,
      updatedBy: actor,
    }
    if (!overrideMap.has(input.fabricKey) || !touched.includes(input.fabricKey)) touched.push(input.fabricKey)
    overrideMap.set(input.fabricKey, override)
    if (input.action === "OUTBOUND") outboundTotals.set(input.fabricKey, outboundTotal)

    newEvents.push({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fabricKey: input.fabricKey,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: resolvedToStatus,
      occurredAt: eventOccurredAt,
      recordedAt: occurredAt,
      actor,
      note: input.note?.trim() || "",
      storageNo: input.storageNo?.trim() || previous?.storageNo,
      qty,
      to: recipient,
      division: input.division?.trim() || undefined,
      reason: input.reason?.trim() || undefined,
    })

    if (input.action === "COMPLETE" && input.recordIdentity) {
      records = records.map((record) => recordIdentity(record) === input.recordIdentity
        ? { ...record, devStatus: "완료", stage: "완료", receivedDate: record.receivedDate || occurredAt.slice(0, 10) }
        : record)
    }
  }

  const touchedSet = new Set(touched)
  // 새 값이 앞에 온다. 한 건짜리 옛 동작과 같은 순서다.
  const fabricOverrides = [
    ...touched.map((key) => overrideMap.get(key)!),
    ...state.fabricOverrides.filter((item) => !touchedSet.has(item.key)),
  ]
  const fabricEvents = [...newEvents].reverse().concat(state.fabricEvents)

  setAppState({ fabricOverrides, fabricEvents, records })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
    records === state.records ? Promise.resolve() : saveCache("records", records),
  ])
  void logAction({ kind: "warehouse", screen: "warehouse", changes: diffFabricEvents(beforeEvents, useAppStore.getState().fabricEvents) })
}

export async function applyFabricAction(input: ApplyFabricActionInput): Promise<void> {
  await applyFabricActions([input])
}
```

`touched` 처리 한 줄이 헷갈리면 아래로 대신 써도 된다. 결과는 같다.

```ts
    if (!touched.includes(input.fabricKey)) touched.push(input.fabricKey)
```

## 1-2. `src/routes/Warehouse.tsx` — 루프 여섯 개를 한 번 호출로

41행 import에 `applyFabricActions`와 타입 `ApplyFabricActionInput`을 더한다.

```ts
import { addManualIntake, updateManualIntake, applyDisposalRoundCompletion, applyFabricAction, applyFabricActions, confirmWarehouseBaseline, removeFabricRows, saveDisposalRounds, saveFabricRackNo, saveFabricRackNos, useAppStore, type ApplyFabricActionInput } from "@/store/useAppStore"
```

아래 여섯 군데를 바꾼다. **`STOCK`과 `OUTBOUND` 분기는 한 건짜리라 그대로 둔다.**

### RECEIVE (739~741행)

```ts
        for (const [index, item] of actionItems.entries()) {
          await applyFabricAction({ fabricKey: item.key, action: "RECEIVE", fromStatus: "READY", toStatus: "WAREHOUSE", storageNo: assigned[index], yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })
        }
```

바꾼다.

```ts
        await applyFabricActions(actionItems.map((item, index) => ({ fabricKey: item.key, action: "RECEIVE" as const, fromStatus: "READY" as const, toStatus: "WAREHOUSE" as const, storageNo: assigned[index], yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })))
```

### UNRECEIVE (747~750행)

```ts
        await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "UNRECEIVE" as const, fromStatus: "WAREHOUSE" as const, toStatus: "READY" as const, note: "입고 대기로 되돌림" })))
```

### CONFIRM (763~766행)

```ts
        await applyFabricActions(targets.filter((item) => item.status === "WAREHOUSE" && !item.confirmedAt).map((item) => ({ fabricKey: item.key, action: "CONFIRM" as const, fromStatus: "WAREHOUSE" as const, toStatus: "WAREHOUSE" as const, storageNo: item.storageNo, note: "창고 실물 입고 확인" })))
```

그 아래 `await saveFabricRackNos(rackEntries)` 줄과 주석은 그대로 둔다.

### UNCONFIRM (R199에서 넣은 분기)

```ts
        await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE" && item.confirmedAt).map((item) => ({ fabricKey: item.key, action: "UNCONFIRM" as const, fromStatus: "WAREHOUSE" as const, toStatus: "WAREHOUSE" as const, storageNo: item.storageNo, note: "실물 입고 확인 취소" })))
```

### DISPOSE

```ts
        await applyFabricActions(actionItems.filter((item) => item.status === "READY" || item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "DISPOSE" as const, fromStatus: item.status, toStatus: "DISPOSED" as const, storageNo: item.storageNo, reason: disposalReason, note: `폐기: ${disposalReason}` })))
```

`if (!disposalReason) throw ...` 줄은 그대로 앞에 둔다.

### EXHAUST

```ts
        await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "EXHAUST" as const, fromStatus: item.status, toStatus: "EXHAUSTED" as const, storageNo: item.storageNo, note: "수동 소진 완료" })))
```

### RESTORE (813~826행)

`restoreStatus`는 건마다 다시 정해지고 마지막 값이 `setTab`에 쓰인다. 그 동작을 그대로 지킨다.
루프에서 입력만 모으고 저장은 한 번 한다.

```ts
        let restoreStatus: "READY" | "WAREHOUSE" = actionDialog.restoreTo ?? "WAREHOUSE"
        const restoreInputs: ApplyFabricActionInput[] = []
        for (const item of actionItems) {
          if (item.status !== "EXHAUSTED" && item.status !== "DISPOSED") continue
          if (!actionDialog.restoreTo) {
            const disposedEvent = fabricEvents.find((event) => event.fabricKey === item.key && event.action === "DISPOSE")
            restoreStatus = item.status === "DISPOSED" && disposedEvent?.fromStatus === "READY" ? "READY" : "WAREHOUSE"
          }
          // 입고 대기는 채번 전 상태다. 그쪽으로 되돌리면 R&D No.와 재고를 함께 푼다.
          restoreInputs.push({
            fabricKey: item.key, action: "RESTORE", fromStatus: item.status, toStatus: restoreStatus,
            storageNo: restoreStatus === "WAREHOUSE" ? item.storageNo : undefined,
            note: restoreStatus === "READY" ? "입고 대기로 되돌림" : "창고 보관으로 되돌림",
          })
        }
        await applyFabricActions(restoreInputs)
        setChecked(new Set())
        setTab(restoreStatus)
```

---

# 수정 2 — 전송 완료 후 되쓰기 조건

## `src/data/firestore-sync.ts` `pushCacheNow`

현재(110~117행 부근):

```ts
    // 병합 결과가 내 화면과 다르면(팀원의 변경이 섞였으면) 화면에도 반영한다.
    if (merged !== value) {
      setAppState(normalizeLoadedRecords({ [key]: merged } as AppStatePatch))
      void saveCacheLocal(key, merged)
    }
```

바꾼다.

```ts
    // 병합 결과가 내 화면과 다르면(팀원의 변경이 섞였으면) 화면에도 반영한다.
    //
    // 단, 전송이 도는 사이 내가 또 저장했으면 되쓰지 않는다.
    // value 는 전송을 시작할 때의 스냅샷이라 지금 store 값보다 뒤처져 있고,
    // 그대로 넣으면 그 사이에 저장한 건들이 배열에서 빠진다.
    // (창고에서 24건을 한 번에 확인 처리하면 일부만 처리되던 원인. R200)
    // 건너뛰어도 잃는 것은 없다. 최신 값은 곧 다음 전송에서 병합되고,
    // 팀원의 변경분은 이 커밋이 부르는 onSnapshot 이 따로 내려 준다.
    const current = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
    if (current !== value) return
    // 참조가 아니라 내용으로 비교한다. mergeKeyed 는 바뀐 것이 없어도 늘 새 배열을 만들어
    // merged !== value 가 항상 참이 된다.
    if (JSON.stringify(merged) === JSON.stringify(value)) return
    setAppState(normalizeLoadedRecords({ [key]: merged } as AppStatePatch))
    void saveCacheLocal(key, merged)
```

**이 함수에서 다른 곳은 손대지 마라.** 특히 `const remote = mergeIdOf(key) ? lastRemote.get(key) : undefined`와
`baseline`·`lastRemote` 갱신은 그대로 둔다. 병합 방향을 뒤집었다가 저장이 통째로 사라진 사고가 있었다(R121).
`applySnapshot`도 손대지 마라.

---

# 수정 3 — IndexedDB 커넥션 재사용

지금은 저장·조회 때마다 `indexedDB.open` 으로 커넥션을 새로 열고 `close()` 로 닫는다.
커넥션 하나를 만들어 재사용한다.

## 3-1. `src/data/cache.ts` `openCacheDatabase` 교체

현재:

```ts
export function openCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) request.result.createObjectStore(ATTACHMENT_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("캐시를 열 수 없습니다."))
  })
}
```

바꾼다.

```ts
/**
 * 커넥션 하나를 열어 재사용한다. 예전에는 저장·조회마다 열고 닫아서,
 * 창고 일괄 처리처럼 저장이 연달아 나가는 자리에서 그 비용이 그대로 지연이 됐다(R200).
 * 닫히거나 버전이 바뀌면 캐시를 비워 다음 호출이 다시 연다.
 */
let cacheDatabase: Promise<IDBDatabase> | null = null

export function openCacheDatabase(): Promise<IDBDatabase> {
  if (cacheDatabase) return cacheDatabase
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) request.result.createObjectStore(ATTACHMENT_STORE_NAME)
    }
    request.onsuccess = () => {
      const database = request.result
      // 다른 탭이 버전을 올리거나 브라우저가 커넥션을 끊으면 이 커넥션은 더 못 쓴다.
      database.onclose = () => { if (cacheDatabase === opening) cacheDatabase = null }
      database.onversionchange = () => {
        if (cacheDatabase === opening) cacheDatabase = null
        database.close()
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error ?? new Error("캐시를 열 수 없습니다."))
  })
  // 열기에 실패하면 다음 호출이 다시 시도할 수 있게 캐시를 비운다.
  opening.catch(() => { if (cacheDatabase === opening) cacheDatabase = null })
  cacheDatabase = opening
  return cacheDatabase
}
```

## 3-2. `database.close()` 호출 전부 제거

커넥션을 공유하므로 쓰고 나서 닫으면 안 된다. 아래 여덟 군데의 `finally { database.close() }` 블록을 없앤다.
`try`는 지우고 본문만 남기거나, `try/finally` 자체를 지우고 본문을 그대로 두면 된다.

| 파일 | 함수 |
|---|---|
| `src/data/cache.ts` | `saveCacheLocal`, `loadCache`, `loadAllCache`, `clearCache` |
| `src/data/attachments.ts` | `saveAttachment`(35행 부근), `getAttachmentBlob`, `deleteAttachment` |

`transactionDone` 과 각 트랜잭션 로직은 그대로 둔다.

---

## 하지 말 것

- `src/data/sync-merge.ts`의 `mergeKeyed`를 고치지 마라.
- `firestore-sync.ts`의 `applySnapshot`, `wouldWipeLocalData`, `pushCache`의 직렬화 체인,
  `baseline`·`lastRemote` 갱신을 고치지 마라. 수정 2에 적힌 되쓰기 블록만 바꾼다.
- `confirmWarehouseBaseline`, `applyDisposalRoundCompletion`, `removeFabricRows`, `saveFabricRackNos` 는
  이미 일괄 저장 형태다. 고치지 마라.
- `ApplyFabricActionInput` 인터페이스에 필드를 더하거나 빼지 마라.
- `applyFabricAction` 을 쓰는 다른 화면(`src/routes/FabricDetail.tsx:235`)은 고치지 마라.
  껍데기 함수가 남아 있어 그대로 동작한다.
- 전송 디바운스는 이번 범위가 아니다. 넣지 마라.
- 커밋하거나 푸시하지 마라.

## 검증

`npm run build` 한 번만. 다른 검증은 하지 마라.

성공 기준: 빌드 통과, `git status --short`에 아래 네 파일이 추가로 M 으로 보인다.

```
 M src/data/attachments.ts
 M src/data/cache.ts
 M src/data/firestore-sync.ts
 M src/store/useAppStore.ts
 M src/routes/Warehouse.tsx
```

워킹트리에는 R198·R199의 커밋되지 않은 변경이 이미 있다. 되돌리지 마라.
`Warehouse.tsx`와 `useAppStore.ts`는 그 변경 위에 이어서 고치는 파일이다.
