import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"

import { db, auth } from "./firebase"
import { CACHE_KEYS, saveCacheLocal, setFirestorePush, type CacheKey } from "./cache"
import { currentUserIsOwner, currentUserCanWrite, currentUserCanEditKey } from "./auth"
import { mergeKeyed, mergeKeyedByList, occurrenceIds } from "./sync-merge"
import { normalizeLoadedRecords, setAppState, useAppStore, type AppState, type AppStatePatch } from "../store/useAppStore"
import type { TsRecord } from "./sample"
import { isTsWellFormed } from "./ts-health"

const COLLECTION = "state"
// Firestore 문자열 필드 한도는 약 1,048,487바이트. 한글(UTF-8 3바이트) 최악을 감안해
// 200,000자(≈최대 600KB)로 잘라 한 문서에 담는다.
const CHUNK_CHARS = 200_000

// 여러 사람이 동시에 건드리는 키만 3-way 병합한다. 나머지는 원격 값을 그대로 쓴다.
const MERGE_IDS: Record<string, (item: never) => string> = {
  records: (item: { _src: { sheet: string; row: number } }) => `${item._src.sheet}::${item._src.row}`,
  fabricOverrides: (item: { key: string }) => item.key,
  fabricEvents: (item: { id: string }) => item.id,
  requests: (item: { reqId: string }) => item.reqId,
  requestBoards: (item: { boardId: string }) => item.boardId,
  requestArchive: (item: { archiveId: string }) => item.archiveId,
  disposalRounds: (item: { roundId: string }) => item.roundId,
  rddaSnapshots: (item: { weekId: string }) => item.weekId,
  rddaReports: (item: { monthId: string }) => item.monthId,
}

/**
 * 목록 문맥이 있어야 id가 서는 병합 키(R240).
 *
 * 샘플대장(completed)의 옛 대장 행은 id가 `rnd:번호`라 같은 id가 현황, 창고보관, 소진완료, 폐기 시트와
 * 여러 채번 주기에 되풀이된다(2026-09-22 실측 5,497행 중 401그룹 740행). id 하나로 병합하면 겹친 행이
 * 서로를 지운다. 그래서 `시트|id|같은 값 중 몇 번째`로 id를 세운다. 1팀 입고, 웹 등록 행은 id가 고유라
 * 늘 `|1`이고, 새 행은 목록 끝에 붙으므로 옛 행의 순번을 밀지 않는다.
 */
const LIST_MERGE_IDS: Record<string, (list: readonly unknown[]) => string[]> = {
  completed: (list) => occurrenceIds(list as readonly ({ sourceSheet?: string; id?: string } | null)[],
    (item) => `${item?.sourceSheet ?? ""}|${item?.id ?? ""}`),
}

/** 이 키들은 화면에서 통째로 비울 일이 없다. 병합 결과가 비면 사고로 보고 쓰지 않는다. */
const NEVER_EMPTY_KEYS = new Set<string>(["records", "completed", "fabricOverrides", "fabricEvents"])

/** 이 클라이언트가 마지막으로 본 원격 값. 병합 기준선이다. */
const baseline = new Map<string, unknown[]>()
/** 스냅샷으로 받은 최신 원격 값. 로컬 적용 여부와 무관하게 항상 갱신한다. */
const lastRemote = new Map<string, unknown[]>()
/** 키별 전송 직렬화. 같은 키의 쓰기가 겹치지 않게 한다. */
const pushChains = new Map<string, Promise<void>>()

/**
 * 첫 스냅샷을 받을 때까지 전송을 미룬다. 기준선 없이 올리면 이 PC에 남은 옛 캐시가
 * 팀원이 지운 항목을 되살리거나 팀원이 넣은 항목을 덮는다.
 */
let initialSync: Promise<void> = Promise.resolve()
let releaseInitialSync: (() => void) | null = null

function mergeIdOf(key: string): ((item: unknown) => string) | null {
  const fn = (MERGE_IDS as Record<string, ((item: unknown) => string) | undefined>)[key]
  return fn ?? null
}

function isMergeKey(key: string): boolean {
  return Boolean(mergeIdOf(key)) || key in LIST_MERGE_IDS
}

/**
 * 병합 대상 키이고 양쪽 다 배열일 때만 병합한다. 아니면 원격 값을 돌려준다.
 * `base`를 넘기지 않으면 이 클라이언트의 기준선을 쓴다.
 */
function mergeForKey(key: string, mine: unknown, theirs: unknown, base: unknown[] | null = baseline.get(key) ?? null): unknown {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return theirs
  const listIds = LIST_MERGE_IDS[key]
  if (listIds) return mergeKeyedByList(base, mine, theirs, listIds)
  const idOf = mergeIdOf(key)
  if (!idOf) return theirs
  return mergeKeyed(base, mine, theirs, idOf)
}

// 각 키의 마지막으로 알려진 청크 수(오래된 청크 정리에 사용). 스냅샷/푸시로 갱신된다.
const lastChunkCount = new Map<string, number>()

function metaRef(key: string) {
  return doc(db, COLLECTION, key)
}
function chunkRef(key: string, index: number) {
  return doc(db, COLLECTION, `${key}__${index}`)
}

function splitChunks(text: string): string[] {
  if (text.length === 0) return [""]
  const chunks: string[] = []
  for (let start = 0; start < text.length; start += CHUNK_CHARS) {
    chunks.push(text.slice(start, start + CHUNK_CHARS))
  }
  return chunks
}

/** 소유자 또는 승인된 팀원이 값을 Firestore로 반영한다(청크 분할·원자적 쓰기). */
async function pushCache<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  if (!currentUserCanWrite()) return
  // 화면 권한이 읽기면 중앙에 올리지 않고 화면 값을 마지막 중앙 값으로 되돌린다(R217).
  if (!currentUserCanEditKey(key)) { revertBlockedKey(key); return }
  if (SKIP_SYNC_KEYS.has(key)) return
  const previousChain = pushChains.get(key) ?? Promise.resolve()
  const chained = previousChain
    .then(() => initialSync)
    .then(() => pushCacheNow(key, value))
    .then(() => markPushSucceeded(key), (error) => handlePushFailure(key, error))
  pushChains.set(key, chained)
  return chained
}

async function pushCacheNow<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  if (isMergeKey(key)) return pushMergedNow(key, value)
  // **병합 키가 아니면 합치지 않고 내 값을 그대로 올린다.**
  // mergeForKey 는 병합 대상이 아닐 때 theirs 를 돌려주는데, 쓰기 방향에서 theirs 는 원격 값이다.
  // 그대로 쓰면 방금 저장한 것이 빠진 예전 원격 값을 다시 올리고, 그 스냅샷이 내 화면을 덮어
  // 저장이 통째로 사라진다(2026-09-10 TROUBLE SHOOTING 신규 등록이 목록에 안 뜨던 사고).
  const json = JSON.stringify(value ?? null)
  const chunks = splitChunks(json)
  const batch = writeBatch(db)
  batch.set(metaRef(key), {
    n: chunks.length,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser?.email ?? auth.currentUser?.uid ?? "unknown",
    ts: serverTimestamp(),
  })
  chunks.forEach((c, i) => batch.set(chunkRef(key, i), { c }))
  const previous = lastChunkCount.get(key) ?? 0
  for (let i = chunks.length; i < previous; i += 1) batch.delete(chunkRef(key, i))
  await batch.commit()
  lastChunkCount.set(key, chunks.length)
  if (Array.isArray(value)) {
    baseline.set(key, value as unknown[])
    lastRemote.set(key, value as unknown[])
  }
}

/**
 * 병합 키 저장. 서버의 지금 값을 트랜잭션 안에서 읽어 병합한 뒤 쓴다(R240).
 *
 * 예전에는 마지막으로 받은 스냅샷(lastRemote)과 병합해 서버 문서를 통째로 덮었다. 팀원이 방금 쓴 값이
 * 아직 스냅샷으로 안 왔으면 그 값이 빠진 채 서버를 덮었고, 팀원 화면은 다음 스냅샷에서 그 항목을
 * "원격에서 지워졌다"로 읽어 스스로 지웠다. 두 사람이 몇 초 안에 저장하면 한 건이 사라졌다.
 * 트랜잭션은 읽은 문서가 커밋 전에 바뀌면 다시 읽고 다시 병합한다. 그래서 겹쳐 써도 빠지는 항목이 없다.
 *
 * `mine`과 `base`는 실행 시점의 화면 값과 기준선을 한 쌍으로 잡는다. 대기열에서 기다리는 사이 스냅샷이
 * 기준선을 새로 바꿨는데 대기 중이던 예전 값을 올리면, 그 사이 팀원이 넣은 항목을 내가 지운 것으로 읽는다.
 * 병합 키의 저장은 모두 `setAppState` 직후 같은 값으로 부르므로 화면 값이 곧 최신 저장 값이다.
 */
async function pushMergedNow<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  const stored = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
  const mine = Array.isArray(stored) ? stored : value
  if (!Array.isArray(mine)) return
  const base = baseline.get(key) ?? null
  const by = auth.currentUser?.email ?? auth.currentUser?.uid ?? "unknown"
  const { merged, count } = await runTransaction(db, async (tx) => {
    const meta = await tx.get(metaRef(key))
    const previousCount = meta.exists() ? Number(meta.data().n ?? 0) : 0
    let theirs: unknown
    if (meta.exists()) {
      const parts = await Promise.all(Array.from({ length: previousCount }, (_, index) => tx.get(chunkRef(key, index))))
      let json = ""
      for (const part of parts) {
        // 청크가 빠진 채로 병합하면 서버 값을 잘린 배열로 알고 덮는다. 쓰지 않고 멈춘다.
        if (!part.exists()) throw new Error(`${key} 청크가 비어 있어 저장을 멈췄습니다.`)
        json += String(part.data().c ?? "")
      }
      theirs = JSON.parse(json)
    }
    // 기준선이 없으면(첫 스냅샷 실패, 새 키) 빈 기준선으로 합친다. 서버 항목은 하나도 빼지 않는다.
    const next = Array.isArray(theirs) ? mergeForKey(key, mine, theirs, base ?? []) as unknown[] : mine
    if (NEVER_EMPTY_KEYS.has(key) && next.length === 0 && Array.isArray(theirs) && theirs.length > 0) {
      throw new Error(`${key} 병합 결과가 비어 저장을 멈췄습니다.`)
    }
    const chunks = splitChunks(JSON.stringify(next))
    tx.set(metaRef(key), { n: chunks.length, updatedAt: new Date().toISOString(), updatedBy: by, ts: serverTimestamp() })
    chunks.forEach((c, index) => tx.set(chunkRef(key, index), { c }))
    for (let index = chunks.length; index < previousCount; index += 1) tx.delete(chunkRef(key, index))
    return { merged: next, count: chunks.length }
  })
  // 쓰인 값이 곧 원격 값이다. 다음 병합의 기준선으로 올린다.
  lastChunkCount.set(key, count)
  baseline.set(key, merged)
  lastRemote.set(key, merged)
  lastRemoteValue.set(key, merged)
  // 병합 결과가 내 화면과 다르면(팀원의 변경이 섞였으면) 화면에도 반영한다.
  // 전송이 도는 사이 내가 또 저장했으면 되쓰지 않는다. 그 저장이 곧 다음 전송에서 다시 병합된다.
  const current = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
  if (current !== stored) return
  // 참조가 아니라 내용으로 비교한다. 병합은 바뀐 것이 없어도 늘 새 배열을 만든다.
  if (JSON.stringify(merged) === JSON.stringify(current)) return
  setAppState(normalizeLoadedRecords({ [key]: merged } as AppStatePatch))
  void saveCacheLocal(key, merged as AppState[K])
}

/**
 * 전송 실패. 로컬 값은 그대로 두고 잠시 뒤 지금 화면 값으로 다시 보낸다.
 * 예전에는 조용히 버렸다. 새로 고치면 첫 스냅샷이 로컬을 원격 값으로 바꾸므로, 못 올린 저장은 그때 사라졌다.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const retryAttempts = new Map<string, number>()
const failingKeys = new Set<string>()
const retryTimers = new Set<ReturnType<typeof setTimeout>>()

function notifySync(type: "fabric:sync-failed" | "fabric:sync-recovered", detail: Record<string, unknown>): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(type, { detail }))
}

function markPushSucceeded(key: string): void {
  retryAttempts.delete(key)
  if (failingKeys.delete(key)) notifySync("fabric:sync-recovered", { key })
}

function handlePushFailure(key: CacheKey, error: unknown): void {
  console.warn("[firestore-sync] push 실패:", key, (error as Error)?.message ?? error)
  const attempt = retryAttempts.get(key) ?? 0
  const final = (error as { code?: string })?.code === "permission-denied" || attempt >= RETRY_DELAYS_MS.length
  failingKeys.add(key)
  notifySync("fabric:sync-failed", { key, final })
  if (final) {
    retryAttempts.delete(key)
    return
  }
  retryAttempts.set(key, attempt + 1)
  const timer = setTimeout(() => {
    retryTimers.delete(timer)
    const current = (useAppStore.getState() as unknown as Record<string, unknown>)[key] as AppState[CacheKey]
    void pushCache(key, current)
  }, RETRY_DELAYS_MS[attempt])
  retryTimers.add(timer)
}

const CACHE_KEY_SET = new Set<string>(CACHE_KEYS)
// 모든 캐시 키를 팀 공유 대상으로 실시간 반영한다.
// 샘플관리대장(completed)도 포함한다. 저장소의 아카이브는 값이 비었을 때만 채우는
// 씨앗이고, 팀이 실제로 공유하는 원천은 여기다.
const SKIP_SYNC_KEYS = new Set<string>()

/**
 * 아직 중앙에 시딩되지 않은(또는 잘못 비워진) 원격 값으로
 * 화면에 떠 있는 로컬 실데이터를 지우지 않는다.
 * 원격이 빈 배열인데 로컬에 데이터가 있으면 해당 키는 건너뛴다.
 */
function wouldWipeLocalData(key: CacheKey, value: unknown): boolean {
  const local = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
  // null·undefined는 중앙에 올라와서는 안 되는 값이다(pushCache가 값이 비었을 때만 만든다).
  // 예전에 이 값이 그대로 내려와 completed를 null로 만들었고, 그걸 for...of로 도는
  // 파생 계산이 예외를 던져 화면이 통째로 백지가 됐다. 배열 자리에는 절대 넣지 않는다.
  if (value === null || value === undefined) return Array.isArray(local)
  if (!Array.isArray(value) || value.length > 0) return false
  return Array.isArray(local) && local.length > 0
}

/** 마지막으로 받은 중앙 값. 읽기 권한 사용자가 화면에서 바꾼 값을 되돌릴 때 쓴다. */
const lastRemoteValue = new Map<string, unknown>()

function revertBlockedKey(key: CacheKey): void {
  if (lastRemoteValue.has(key)) {
    const value = lastRemoteValue.get(key) as AppState[CacheKey]
    setAppState(normalizeLoadedRecords({ [key]: value } as AppStatePatch))
    void saveCacheLocal(key, value)
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("fabric:readonly-blocked", { detail: { key } }))
}

/**
 * 스냅샷 전체에서 각 키의 값을 재조립해 store와 로컬 캐시에 반영한다.
 * 중앙에 존재하는 키 목록을 돌려준다(최초 시딩 판단에 사용).
 */
function applySnapshot(docs: { id: string; data: () => Record<string, unknown> }[]): Set<string> {
  const metas = new Map<string, number>()
  const chunks = new Map<string, Map<number, string>>()

  for (const d of docs) {
    const id = d.id
    const sep = id.lastIndexOf("__")
    const suffix = sep >= 0 ? id.slice(sep + 2) : ""
    if (sep >= 0 && /^\d+$/.test(suffix)) {
      const key = id.slice(0, sep)
      const index = Number(suffix)
      if (!chunks.has(key)) chunks.set(key, new Map())
      chunks.get(key)!.set(index, String(d.data().c ?? ""))
    } else {
      metas.set(id, Number(d.data().n ?? 0))
    }
  }

  const patch: AppStatePatch = {}
  let changed = false

  metas.forEach((n, key) => {
    if (!CACHE_KEY_SET.has(key)) return
    if (SKIP_SYNC_KEYS.has(key)) return
    lastChunkCount.set(key, n)
    const parts = chunks.get(key)
    if (!parts || parts.size < n) return // 아직 일부 청크 미수신 — 다음 스냅샷을 기다린다.
    let json = ""
    for (let i = 0; i < n; i += 1) {
      const c = parts.get(i)
      if (c === undefined) return
      json += c
    }
    try {
      const value = JSON.parse(json) as AppState[CacheKey]
      lastRemoteValue.set(key, value)
      if (wouldWipeLocalData(key as CacheKey, value)) return
      // 중앙에 구버전 파서가 만든 낡은 TS가 남아 있을 수 있다.
      // 그 값이 정상 데이터를 덮지 않도록 막고, 소유자면 정상 로컬 값으로 중앙을 고쳐 쓴다.
      if (key === "ts") {
        const incoming = (value ?? []) as TsRecord[]
        const local = useAppStore.getState().ts
        if (!isTsWellFormed(incoming) && isTsWellFormed(local)) {
          if (currentUserIsOwner()) void pushCache("ts", local)
          return
        }
      }
      // 아직 안 올라간 내 편집이 스냅샷에 지워지지 못하게 병합한다.
      const localValue = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
      const nextValue = mergeForKey(key, localValue, value) as AppState[CacheKey]
      // 기준선은 병합 결과가 아니라 원격 값이다. 내 편집은 아직 원격에 없다.
      if (Array.isArray(value)) {
        lastRemote.set(key, value as unknown[])
        baseline.set(key, value as unknown[])
      }
      if (JSON.stringify(nextValue) === JSON.stringify(localValue)) return
      ;(patch as Record<string, unknown>)[key] = nextValue
      void saveCacheLocal(key as CacheKey, nextValue)
      changed = true
    } catch {
      // 파싱 실패 시 해당 키는 건너뛴다.
    }
  })

  if (changed) setAppState(normalizeLoadedRecords(patch))
  return new Set(metas.keys())
}

let autoSeedDone = false

/**
 * 소유자 첫 로그인 시, 중앙에 아직 없는 키만 현재 화면 데이터로 자동 시딩한다.
 * 이미 중앙에 있는 키는 건드리지 않으므로 팀 데이터를 덮어쓸 위험이 없다.
 * (이 자동 시딩이 없으면 소유자가 "중앙에 올리기"를 누르기 전까지 팀원은 빈 화면을 본다.)
 */
async function autoSeedMissingKeys(remoteKeys: Set<string>): Promise<void> {
  if (autoSeedDone || !currentUserIsOwner()) return
  autoSeedDone = true
  const state = useAppStore.getState()
  for (const key of CACHE_KEYS) {
    if (SKIP_SYNC_KEYS.has(key)) continue
    if (remoteKeys.has(key)) continue
    const value = state[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    await pushCache(key, value)
  }
}

let unsubscribe: Unsubscribe | null = null
let started = false

/**
 * 로그인 후 호출: 쓰기 훅 등록 + Firestore 실시간 구독 시작.
 * 첫 스냅샷이 도착하면 resolve되어, 데모/로컬 대신 중앙 데이터를 화면에 반영한다.
 */
export function startStateSync(): Promise<void> {
  if (started) return Promise.resolve()
  started = true
  // 첫 스냅샷이 기준선을 세울 때까지 전송을 붙잡아 둔다. 전송 훅보다 먼저 만든다.
  initialSync = new Promise<void>((release) => { releaseInitialSync = release })
  const openGate = () => {
    releaseInitialSync?.()
    releaseInitialSync = null
  }
  setFirestorePush(pushCache)
  return new Promise<void>((resolve) => {
    let resolved = false
    unsubscribe = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const remoteKeys = applySnapshot(snap.docs)
        openGate()
        void autoSeedMissingKeys(remoteKeys)
        if (!resolved) {
          resolved = true
          resolve()
        }
      },
      (error) => {
        console.warn("[firestore-sync] 구독 오류:", error?.message ?? error)
        // 구독이 실패해도 전송을 영영 막지는 않는다. 저장은 트랜잭션이 서버 값과 합친다.
        openGate()
        if (!resolved) {
          resolved = true
          resolve()
        }
      },
    )
  })
}

/** 저장 방식. SETTING 데이터 보호 탭이 보여 준다(R241). */
export function syncModeOf(key: string): "merge" | "replace" {
  return isMergeKey(key) ? "merge" : "replace"
}

/** 지금 서버 반영이 실패해 재시도 중이거나 끝내 실패한 키. */
export function getFailingSyncKeys(): string[] {
  return [...failingKeys]
}

/** 키별 서버 meta 문서(n, updatedAt, updatedBy)만 읽는다. 청크는 읽지 않는다. */
export async function readStateMetas(keys: readonly string[]): Promise<Record<string, { n: number; updatedAt: string; updatedBy: string } | null>> {
  const entries = await Promise.all(keys.map(async (key) => {
    const snap = await getDoc(metaRef(key))
    if (!snap.exists()) return [key, null] as const
    const data = snap.data()
    return [key, { n: Number(data.n ?? 0), updatedAt: String(data.updatedAt ?? ""), updatedBy: String(data.updatedBy ?? "") }] as const
  }))
  return Object.fromEntries(entries)
}

/** 로그아웃 시 호출: 구독 해제 + 쓰기 훅 제거. */
export function stopStateSync(): void {
  setFirestorePush(null)
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  started = false
  autoSeedDone = false
  releaseInitialSync?.()
  releaseInitialSync = null
  initialSync = Promise.resolve()
  retryTimers.forEach((timer) => clearTimeout(timer))
  retryTimers.clear()
  retryAttempts.clear()
  failingKeys.clear()
  lastChunkCount.clear()
  baseline.clear()
  lastRemote.clear()
  pushChains.clear()
}
