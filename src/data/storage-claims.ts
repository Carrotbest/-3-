import { deleteField, doc, runTransaction, serverTimestamp, type FieldValue } from "firebase/firestore"

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
  const patch: Record<string, FieldValue> = { updatedAt: serverTimestamp() }
  numbers.forEach((no) => { patch[`claims.${no.trim()}`] = deleteField() })
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    tx.update(ref, patch)
  })
}
