import type { AppState } from "../store/useAppStore"

const DB_NAME = "fabric-rnd-cache"
const DB_VERSION = 1
const STORE_NAME = "parsed"
export const CACHE_KEYS = ["records", "completed", "meta", "study", "studyFiles", "rdda", "fabricAnalysis", "ts", "orgMembers", "materials", "materialsManual", "materialDiagnostics"] as const
export type CacheKey = (typeof CACHE_KEYS)[number]

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("캐시를 열 수 없습니다."))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("캐시 작업에 실패했습니다."))
    transaction.onabort = () => reject(transaction.error ?? new Error("캐시 작업이 취소되었습니다."))
  })
}

/** 파싱 결과는 이 PC의 브라우저 IndexedDB에만 저장되며 git이나 서버로 전송되지 않는다. */
export async function saveCache<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(value, key)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function loadAllCache(): Promise<Partial<AppState>> {
  if (typeof indexedDB === "undefined") return {}
  const database = await openDatabase()
  try {
    const entries = await Promise.all(CACHE_KEYS.map((key) => new Promise<[CacheKey, unknown]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve([key, request.result])
      request.onerror = () => reject(request.error ?? new Error("캐시를 읽을 수 없습니다."))
    })))
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as Partial<AppState>
  } finally {
    database.close()
  }
}

export async function clearCache(): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).clear()
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}
