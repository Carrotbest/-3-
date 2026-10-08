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
