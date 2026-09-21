# R234 채번 예약 (동시 입고 등록 충돌 방지)

## 상태

미착수. R224~R233이 워킹트리에 들어가 있고 빌드까지 통과했다. **되돌리거나 다시 만들지 마라.**

파일 하나를 새로 만들고 하나를 고친다.
- 새 파일 `src/data/storage-claims.ts`
- 수정 `src/routes/Warehouse.tsx`

`firestore.rules`는 고치지 마라. `state/{docId}`는 이미 승인 사용자에게 쓰기가 열려 있다.

## 왜 하는가

지금 R&D No.는 **각자 브라우저가 자기 화면의 원장에서 계산한다.** 두 사람이 비슷한 때 입고 등록을 누르면 둘 다 같은 번호를 보고, 저장은 원단별로 병합되므로 같은 번호를 단 원단이 두 건 생긴다. 막는 장치가 없고 경고도 없다. 실제 데이터에는 아직 중복이 없지만 시간 문제다.

이 저장소에는 아직 `runTransaction` 을 쓰는 곳이 없다. 이번이 처음이다.

## 설계

**원장이 진실이고, 예약 문서는 짧은 락이다.** 번호 대장을 따로 만들지 않는다. 그러면 원장과 어긋날 위험이 생긴다.

1. 입고 등록을 누르면 화면 규칙으로 후보 번호를 넉넉히 만든다.
2. **트랜잭션 안에서** 아직 아무도 잡지 않은 후보를 필요한 개수만큼 잡는다. 동시에 둘이 들어오면 Firestore가 직렬화해 한쪽이 재시도하고 다음 후보를 받는다.
3. 잡은 번호로 실제 입고를 저장한다.
4. 저장이 끝나면 예약을 푼다. 저장이 끝난 번호는 원장이 점유를 알려 주므로 예약이 더 필요 없다.
5. 비정상 종료로 예약이 남아도 10분이면 만료된다.

## 1. 새 파일 `src/data/storage-claims.ts`

```ts
import { deleteField, doc, runTransaction, serverTimestamp } from "firebase/firestore"

import { auth, db } from "./firebase"

/**
 * R&D No. 채번 예약. 동시에 같은 번호가 두 원단에 나가는 것을 막는 짧은 락이다.
 *
 * 번호 대장이 아니다. 진실은 원장(`buildFabricLedger`)이고 여기는 "지금 누가 집는 중"만 담는다.
 * 그래서 원장과 어긋날 수가 없다. 입고 저장이 끝나면 바로 풀고, 남더라도 TTL 로 만료된다.
 *
 * 문서는 `state/storageClaims` 하나다. 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로
 * 화면 데이터와 섞이지 않는다. **이 이름을 CACHE_KEYS 에 넣지 마라.**
 */
const CLAIM_DOC = ["state", "storageClaims"] as const

/** 예약 유효 시간. 입고 창을 열어 두고 저장까지 걸리는 시간보다 넉넉하면 된다. */
const CLAIM_TTL_MS = 10 * 60 * 1000

interface ClaimEntry {
  at: number
  by: string
}

const isLive = (entry: unknown, now: number): boolean => {
  const at = Number((entry as ClaimEntry)?.at ?? 0)
  return Number.isFinite(at) && now - at < CLAIM_TTL_MS
}

/**
 * 후보 중 아직 잡히지 않은 번호를 앞에서부터 `count` 개 잡는다.
 * 후보를 다 써도 개수를 못 채우면 던진다. 호출부가 화면을 새로 고치게 안내한다.
 */
export async function claimStorageNumbers(candidates: readonly string[], count: number): Promise<string[]> {
  if (count <= 0) return []
  const by = auth.currentUser?.email ?? ""
  return runTransaction(db, async (tx) => {
    const ref = doc(db, ...CLAIM_DOC)
    const snap = await tx.get(ref)
    const now = Date.now()
    const current = (snap.exists() ? snap.data().claims : null) ?? {}
    const taken = new Set(Object.entries(current).filter(([, entry]) => isLive(entry, now)).map(([no]) => no))

    const picked: string[] = []
    for (const candidate of candidates) {
      if (picked.length >= count) break
      const value = candidate.trim()
      if (!value || taken.has(value) || picked.includes(value)) continue
      picked.push(value)
    }
    if (picked.length < count) throw new Error("사용할 수 있는 R&D No.가 부족합니다. 화면을 새로 고친 뒤 다시 시도하세요.")

    // 만료된 예약은 이때 같이 지운다. 문서가 계속 자라지 않게 한다.
    const claims: Record<string, unknown> = {}
    Object.entries(current).forEach(([no, entry]) => { if (isLive(entry, now)) claims[no] = entry })
    picked.forEach((no) => { claims[no] = { at: now, by } })
    tx.set(ref, { claims, updatedAt: serverTimestamp() }, { merge: false })
    return picked
  })
}

/** 저장이 끝났거나 실패했을 때 예약을 푼다. 실패해도 무해하다. TTL 이 받아 준다. */
export async function releaseStorageNumbers(numbers: readonly string[]): Promise<void> {
  if (!numbers.length) return
  const ref = doc(db, ...CLAIM_DOC)
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
  numbers.forEach((no) => { patch[`claims.${no.trim()}`] = deleteField() })
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    tx.update(ref, patch)
  })
}
```

## 2. `src/routes/Warehouse.tsx`

import 줄에 더한다.

```ts
import { claimStorageNumbers, releaseStorageNumbers } from "@/data/storage-claims"
```

869행 `if (actionDialog.kind === "RECEIVE") {` 블록을 고친다. **870-886행의 번호 검사(`assigned` 계산)는 그대로 둔다.** 사람이 손으로 고친 번호를 검사하는 자리다.

`assigned` 와 `parsedYds` 가 만들어진 뒤, 893행 `rememberUndo(await applyFabricActions(...))` **앞**에 예약을 끼운다.

```tsx
        // 예약을 먼저 잡는다. 다른 사람이 같은 번호를 집고 있으면 여기서 갈린다.
        // 후보는 화면이 고른 번호를 앞에 두고, 뒤에 여유분을 붙인다.
        // 손으로 고친 번호가 남에게 잡혀 있으면 여유분에서 다른 번호가 나간다.
        const spare = nextStorageNumbers(ledger, actionItems.length + 30, teamScope)
          .map((value) => teamScope === "team3" ? String(value).padStart(4, "0") : String(value))
        let claimed: string[]
        try {
          claimed = await claimStorageNumbers([...assigned, ...spare], actionItems.length)
        } catch (error) {
          throw new Error(error instanceof Error && error.message ? error.message
            : "R&D No.를 예약하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.")
        }
        const changedNos = claimed.filter((value, index) => value !== assigned[index])
        try {
          rememberUndo(await applyFabricActions(actionItems.map((item, index) => ({ fabricKey: item.key, action: "RECEIVE" as const, fromStatus: "READY" as const, toStatus: "WAREHOUSE" as const, storageNo: claimed[index], yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) }))))
        } finally {
          // 원장에 들어갔으면 예약은 더 필요 없다. 실패했으면 번호를 다른 사람에게 돌려준다.
          void releaseStorageNumbers(claimed)
        }
        if (changedNos.length) {
          setSelectionNotice(`다른 사람이 먼저 쓴 번호가 있어 ${changedNos.join(", ")} 로 바뀌었습니다.`)
        }
```

893행의 기존 `rememberUndo(await applyFabricActions(...))` 한 줄은 위 블록 안으로 들어가 사라진다. **`storageNo: assigned[index]` 를 `claimed[index]` 로 바꾸는 것이 핵심이다.**

그 아래 이어지는 Teams 알림(895행 `notifyTeams(buildInboundCard(...))`)과 입고 요청 메일에 넘기는 번호도 `assigned` 대신 `claimed` 를 쓰도록 바꾼다. **`assigned` 를 참조하는 곳이 남아 있으면 안 된다.** 화면에 보이던 번호와 실제 저장된 번호가 갈릴 수 있다.

## 하지 말 것

- `state/storageClaims` 를 `CACHE_KEYS` 에 넣지 마라. 동기화 구독이 화면 데이터로 오해한다.
- 예약 문서에 번호 대장을 만들지 마라. 진실은 원장이다. 여기는 락이다.
- 입고 취소·숨김·수동 수정에서 예약을 건드리지 마라. 저장이 끝나면 이미 풀려 있다.
- `firestore.rules` 를 고치지 마라.
- 채번 규칙(`nextStorageNumbers`, `occupiedStorageNumbers`)을 고치지 마라. R233 에서 정한 그대로 쓴다.
- 1팀 분기를 따로 만들지 마라. 같은 예약 문서를 쓴다. 번호 대역이 달라 겹치지 않는다.

## 검증

`npm run build` 한 번. `git status --short` 로 위 두 파일 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `storageNo` 로 저장되는 값이 `claimed[index]` 다. `assigned` 를 그대로 쓰는 곳이 남아 있지 않다.
3. 저장 성공과 실패 모두에서 `releaseStorageNumbers` 가 불린다.
4. 예약 실패가 입고 등록을 막고, 메시지가 사용자에게 보인다.
