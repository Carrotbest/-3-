import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore"

import { auth, db } from "./firebase"
import { useAuthStore } from "./auth"

/**
 * 가상 오피스 채팅.
 *
 * `state/{key}` 청크 동기화에 넣지 않는다. 쌓이는 로그라 배열 통째 재업로드 구조에 두면
 * 편집 비용이 계속 커진다. `auditLog`와 같은 이유다. `CACHE_KEYS`에도 넣지 않는다.
 */
export interface MetaChatMessage {
  id: string
  uid: string
  name: string
  color: string
  text: string
  /** 보낸 사람이 그때 있던 방 경로. 빈 문자열이면 전체 대화다. */
  room: string
  /** serverTimestamp. 읽을 때 Timestamp. */
  createdAt: unknown
  /** 받는 사람 uid. 비어 있으면 전체에게 한 말이다. 귓속말이 아니라 지목이다. */
  to?: string
  /** 받는 사람 이름. 보낸 시점의 이름을 그대로 둔다. */
  toName?: string
}

const COLLECTION = "metaChat"
const MAX_TEXT = 200
const READ_LIMIT = 30
const LAST_READ_KEY = "fabric.chat.lastRead.v1"

export function chatCreatedAtMillis(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("toMillis" in value)) return null
  const toMillis = (value as { toMillis?: unknown }).toMillis
  if (typeof toMillis !== "function") return null
  const millis = toMillis.call(value)
  return typeof millis === "number" ? millis : null
}

/**
 * 최근 30건만 읽는다. 옛 메시지를 지우는 코드는 만들지 않는다.
 * 서버가 없어서 정리 작업을 돌릴 데가 없고, 쌓여도 읽기는 늘 30건이라 비용이 안 는다.
 */
type ChatListener = (messages: MetaChatMessage[]) => void
let liveMessages: MetaChatMessage[] = []
let listeners: ChatListener[] = []
let stopFeed: (() => void) | null = null

/**
 * 리스너는 앱 전체에 하나다. 화면마다 onSnapshot을 부르면 읽기가 화면 수만큼 늘어난다.
 * 구독자가 0이 되면 끊고, 처음 생기면 붙인다.
 */
export function subscribeMetaChat(onChange: ChatListener): () => void {
  listeners.push(onChange)
  onChange(liveMessages)
  if (!stopFeed) {
    const recent = query(collection(db, COLLECTION), orderBy("createdAt", "desc"), limit(READ_LIMIT))
    stopFeed = onSnapshot(recent, (snapshot) => {
      liveMessages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MetaChatMessage).reverse()
      listeners.forEach((listener) => listener(liveMessages))
    }, () => {
      liveMessages = []
      listeners.forEach((listener) => listener(liveMessages))
    })
  }
  return () => {
    listeners = listeners.filter((entry) => entry !== onChange)
    if (listeners.length === 0 && stopFeed) {
      stopFeed()
      stopFeed = null
      liveMessages = []
    }
  }
}

export async function sendMetaChat(
  text: string,
  room: string,
  name: string,
  color: string,
  to?: { uid: string; name: string },
): Promise<boolean> {
  const user = auth.currentUser
  const { approval, isOwner } = useAuthStore.getState()
  if (!user || (!isOwner && approval !== "approved")) return false

  const trimmed = text.trim().slice(0, MAX_TEXT)
  if (!trimmed) return false

  try {
    const message: Record<string, unknown> = {
      uid: user.uid,
      name,
      color,
      text: trimmed,
      room,
      createdAt: serverTimestamp(),
    }
    if (to) {
      message.to = to.uid
      message.toName = to.name
    }
    await addDoc(collection(db, COLLECTION), message)
    return true
  } catch {
    return false
  }
}

export function chatLastReadAt(uid: string): number {
  try {
    const values = JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? "{}") as Record<string, unknown>
    return typeof values[uid] === "number" ? values[uid] : 0
  } catch {
    return 0
  }
}

export function markChatRead(uid: string, at: number): void {
  try {
    const values = JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? "{}") as Record<string, unknown>
    values[uid] = at
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(values))
  } catch {
    // 사생활 보호 모드 등 localStorage를 쓸 수 없는 환경에서는 읽음 저장만 생략한다.
  }
}

export function unreadChatCount(messages: MetaChatMessage[], uid: string): number {
  const since = chatLastReadAt(uid)
  return messages.filter((message) => message.uid !== uid && (chatCreatedAtMillis(message.createdAt) ?? 0) > since).length
}
