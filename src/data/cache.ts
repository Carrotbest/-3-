import type { AppState } from "../store/useAppStore"

const DB_NAME = "fabric-rnd-cache"
const DB_VERSION = 2
const STORE_NAME = "parsed"
export const ATTACHMENT_STORE_NAME = "attachments"
export const CACHE_KEYS = ["records", "completed", "meta", "study", "studyFiles", "events", "rdda", "fabricAnalysis", "ts", "orgMembers", "materials", "materialsManual", "materialDiagnostics", "fabricOverrides", "fabricEvents", "chemical", "chemicalManual", "chemicalLinks"] as const
export type CacheKey = (typeof CACHE_KEYS)[number]

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

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("캐시 작업에 실패했습니다."))
    transaction.onabort = () => reject(transaction.error ?? new Error("캐시 작업이 취소되었습니다."))
  })
}

/**
 * Firestore 실시간 동기화 훅. firestore-sync.ts가 로그인 후 등록한다.
 * 미등록(비로그인/오프라인) 상태에서는 IndexedDB 저장만 이뤄진다.
 */
let firestorePush: (<K extends CacheKey>(key: K, value: AppState[K]) => void) | null = null

export function setFirestorePush(fn: (<K extends CacheKey>(key: K, value: AppState[K]) => void) | null): void {
  firestorePush = fn
}

/** IndexedDB(이 PC 브라우저)에만 저장한다. Firestore로는 전송하지 않는다. */
export async function saveCacheLocal<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  const database = await openCacheDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(value, key)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

/**
 * 사용자의 실제 데이터 변경 저장 경로. 로컬(IndexedDB)에 저장한 뒤,
 * 소유자로 로그인했다면 Firestore 중앙 DB로도 반영(fire-and-forget)한다.
 * 데모/내장 데이터 시딩은 saveCacheLocal을 써서 Firestore로 올라가지 않게 한다.
 */
export async function saveCache<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  await saveCacheLocal(key, value)
  firestorePush?.(key, value)
}

export async function loadCache<K extends CacheKey>(key: K): Promise<AppState[K] | undefined> {
  if (typeof indexedDB === "undefined") return undefined
  const database = await openCacheDatabase()
  try {
    return await new Promise<AppState[K] | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as AppState[K] | undefined)
      request.onerror = () => reject(request.error ?? new Error("캐시를 읽을 수 없습니다."))
    })
  } finally {
    database.close()
  }
}

export async function loadAllCache(): Promise<Partial<AppState>> {
  if (typeof indexedDB === "undefined") return {}
  const database = await openCacheDatabase()
  try {
    const entries = await Promise.all(CACHE_KEYS.map((key) => new Promise<[CacheKey, unknown]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve([key, request.result])
      request.onerror = () => reject(request.error ?? new Error("캐시를 읽을 수 없습니다."))
    })))
    // null도 함께 버린다. undefined만 걸러내면 캐시나 Firestore에서 흘러든 null이
    // 배열 기본값을 덮어써서, 그 값을 for...of로 도는 파생 계산이 통째로 터진다.
    // (completed가 null이 되어 mergedFlRegistrations에서 HOME 전체가 죽은 사례가 있다.)
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== null)) as Partial<AppState>
  } finally {
    database.close()
  }
}

export async function clearCache(): Promise<void> {
  const database = await openCacheDatabase()
  try {
    const transaction = database.transaction([STORE_NAME, ATTACHMENT_STORE_NAME], "readwrite")
    transaction.objectStore(STORE_NAME).clear()
    transaction.objectStore(ATTACHMENT_STORE_NAME).clear()
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}
