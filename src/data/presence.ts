import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"

import { routeDefinitions } from "@/routes/route-config"

import { auth, db } from "./firebase"
import { useAuthStore } from "./auth"

export interface PresenceEntry {
  uid: string
  email: string
  /** Firebase Auth displayName. 없으면 빈 문자열. */
  name: string
  /** 현재 경로(pathname). 예: /development/workspace */
  path: string
  /** routeDefinitions의 title. 못 찾으면 빈 문자열. */
  screen: string
  /** serverTimestamp. 읽을 때 Timestamp. */
  updatedAt: unknown
  /** 본인이 고른 상태. 옛 문서에는 없다. */
  status?: PresenceStatus
  /** 본인이 고른 기분. 옛 문서에는 없다. */
  mood?: PresenceMood
  /** 가상 오피스에서 걸어갈 자리. 방 중심 기준 로컬 좌표다. */
  spot?: PresenceSpot
}

export type PresenceStatus = "focus" | "meeting" | "away" | "busy"
export type PresenceMood = "good" | "normal" | "tired" | "stuck"

export interface PresenceSpot {
  /** 이 목적지가 어느 방 것인지. presence.path와 다르면 버린다. */
  path: string
  x: number
  z: number
  /** Date.now(). serverTimestamp를 쓰지 않는다. 걷기 시작 시각을 바로 읽어야 한다. */
  at: number
}

const STALE_AFTER_MS = 150_000
let lastPresenceUid = ""

export function screenTitleOf(path: string): string {
  const route = routeDefinitions.find((definition) => definition.path === path)
    ?? [...routeDefinitions]
      .sort((left, right) => right.path.length - left.path.length)
      .find((definition) => path.startsWith(definition.path))
  return route?.title ?? ""
}

export async function writePresence(path: string): Promise<void> {
  const user = auth.currentUser
  const { approval, isOwner } = useAuthStore.getState()
  if (!user || (!isOwner && approval !== "approved")) return

  lastPresenceUid = user.uid
  try {
    await setDoc(doc(db, "presence", user.uid), {
      uid: user.uid,
      email: user.email ?? "",
      name: user.displayName ?? "",
      path,
      screen: screenTitleOf(path),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch {
    // 접속 표시는 보조 기능이므로 실패해도 본 작업을 막지 않는다.
  }
}

/**
 * 상태와 기분은 하루 몇 번만 바뀐다. 하트비트와 따로 쓰므로 쓰기가 사실상 안 는다.
 */
export async function writePresenceMood(status: PresenceStatus, mood: PresenceMood): Promise<void> {
  const user = auth.currentUser
  const { approval, isOwner } = useAuthStore.getState()
  if (!user || (!isOwner && approval !== "approved")) return
  try {
    await setDoc(doc(db, "presence", user.uid), { status, mood }, { merge: true })
  } catch {
    // 접속 표시는 보조 기능이므로 실패해도 본 작업을 막지 않는다.
  }
}

let lastSpotAt = 0
let lastSpotKey = ""
const SPOT_THROTTLE_MS = 1_500

/**
 * 목적지만 저장한다. 걸어가는 중간 과정은 각 브라우저가 그린다.
 * 위치를 주기적으로 쓰면 Firestore 읽기가 인원의 제곱으로 늘어 비용이 터진다(R320 참조).
 */
export async function writePresenceSpot(path: string, x: number, z: number): Promise<void> {
  const user = auth.currentUser
  const { approval, isOwner } = useAuthStore.getState()
  if (!user || (!isOwner && approval !== "approved")) return

  const key = `${path}|${x.toFixed(2)}|${z.toFixed(2)}`
  const now = Date.now()
  if (key === lastSpotKey) return
  if (now - lastSpotAt < SPOT_THROTTLE_MS) return
  lastSpotAt = now
  lastSpotKey = key

  try {
    await setDoc(doc(db, "presence", user.uid), {
      spot: { path, x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), at: now },
    }, { merge: true })
  } catch {
    // 접속 표시는 보조 기능이므로 실패해도 본 작업을 막지 않는다.
  }
}

export async function clearPresence(): Promise<void> {
  const uid = auth.currentUser?.uid ?? lastPresenceUid
  if (!uid) return
  try {
    await deleteDoc(doc(db, "presence", uid))
    if (lastPresenceUid === uid) lastPresenceUid = ""
  } catch {
    // 접속 표시 정리 실패는 조용히 무시한다.
  }
}

function updatedAtMillis(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("toMillis" in value)) return null
  const toMillis = (value as { toMillis?: unknown }).toMillis
  if (typeof toMillis !== "function") return null
  const millis = toMillis.call(value)
  return typeof millis === "number" ? millis : null
}

export function subscribePresence(onChange: (entries: PresenceEntry[]) => void): () => void {
  return onSnapshot(collection(db, "presence"), (snapshot) => {
    const selfUid = auth.currentUser?.uid
    const oldestAllowed = Date.now() - STALE_AFTER_MS
    const entries = snapshot.docs
      .map((item) => ({ uid: item.id, ...item.data() }) as PresenceEntry)
      .filter((entry) => entry.uid !== selfUid && (updatedAtMillis(entry.updatedAt) ?? 0) >= oldestAllowed)
      .sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email))
    onChange(entries)
  }, () => onChange([]))
}
