import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"

import { db, auth } from "./firebase"
import { CACHE_KEYS, saveCacheLocal, setFirestorePush, type CacheKey } from "./cache"
import { currentUserIsOwner } from "./auth"
import { setAppState, useAppStore, type AppState, type AppStatePatch } from "../store/useAppStore"
import type { TsRecord } from "./sample"
import { isTsWellFormed } from "./ts-health"

const COLLECTION = "state"
// Firestore 문자열 필드 한도는 약 1,048,487바이트. 한글(UTF-8 3바이트) 최악을 감안해
// 200,000자(≈최대 600KB)로 잘라 한 문서에 담는다.
const CHUNK_CHARS = 200_000

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

/** 소유자로 로그인한 경우에만 값을 Firestore로 반영한다(청크 분할·원자적 배치). */
async function pushCache<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  if (!currentUserIsOwner()) return
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
  lastChunkCount.set(key, chunks.length)
  try {
    await batch.commit()
  } catch (error) {
    // 읽기 전용 사용자의 쓰기 거부 등은 조용히 무시(로컬 상태는 유지).
    console.warn("[firestore-sync] push 실패:", (error as Error)?.message ?? error)
  }
}

const CACHE_KEY_SET = new Set<string>(CACHE_KEYS)
// 모든 캐시 키를 팀 공유 대상으로 실시간 반영한다(TS 포함).
const SKIP_SYNC_KEYS = new Set<string>()

/**
 * 아직 중앙에 시딩되지 않은(또는 잘못 비워진) 원격 값으로
 * 화면에 떠 있는 로컬 실데이터를 지우지 않는다.
 * 원격이 빈 배열인데 로컬에 데이터가 있으면 해당 키는 건너뛴다.
 */
function wouldWipeLocalData(key: CacheKey, value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 0) return false
  const local = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
  return Array.isArray(local) && local.length > 0
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
      ;(patch as Record<string, unknown>)[key] = value
      void saveCacheLocal(key as CacheKey, value)
      changed = true
    } catch {
      // 파싱 실패 시 해당 키는 건너뛴다.
    }
  })

  if (changed) setAppState(patch)
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
  setFirestorePush(pushCache)
  return new Promise<void>((resolve) => {
    let resolved = false
    unsubscribe = onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const remoteKeys = applySnapshot(snap.docs)
        void autoSeedMissingKeys(remoteKeys)
        if (!resolved) {
          resolved = true
          resolve()
        }
      },
      (error) => {
        console.warn("[firestore-sync] 구독 오류:", error?.message ?? error)
        if (!resolved) {
          resolved = true
          resolve()
        }
      },
    )
  })
}

/**
 * 소유자가 현재 화면의 모든 데이터를 중앙 서버(Firestore)로 한 번에 올린다.
 * 로그인 직후 기존 데이터를 팀에 공유(초기 시딩)하거나 강제 재동기화할 때 사용.
 */
export async function pushAllToFirestore(): Promise<{ pushed: number }> {
  if (!currentUserIsOwner()) throw new Error("편집 권한이 있는 소유자만 올릴 수 있습니다.")
  const state = useAppStore.getState()
  let pushed = 0
  for (const key of CACHE_KEYS) {
    await pushCache(key, state[key])
    pushed += 1
  }
  return { pushed }
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
  lastChunkCount.clear()
}
