import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore"

import { auth, db } from "./firebase"
import { saveViewPref } from "./view-prefs"

export type MemoColor = "yellow" | "pink" | "blue"
export type MemoSize = "s" | "m" | "l"

export interface ScreenMemo {
  id: string
  path: string
  text: string
  color: MemoColor
  size: MemoSize
  x: number
  y: number
  pinned: boolean
  expiresAt: string
  uid: string
  name: string
  createdAt: unknown
  updatedAt: unknown
}

export interface MemoReply {
  id: string
  memoId: string
  text: string
  uid: string
  name: string
  createdAt: unknown
}

const MEMO_COLLECTION = "screenMemos"
const REPLY_COLLECTION = "screenMemoReplies"
const MEMO_LIMIT = 200
const REPLY_LIMIT = 300
export const REPLY_PER_MEMO = 50
export const MEMO_TEXT_MAX = 500
export const REPLY_TEXT_MAX = 300
export const MEMO_DAYS = [7, 14, 30] as const

export const MEMO_SIZES: Record<MemoSize, { w: number; h: number }> = {
  s: { w: 180, h: 170 },
  m: { w: 240, h: 230 },
  l: { w: 320, h: 300 },
}

export const MEMO_COLORS: Record<MemoColor, { bg: string; edge: string; ink: string }> = {
  yellow: { bg: "#FEF3A7", edge: "#F0DE7C", ink: "#4A3F0B" },
  pink: { bg: "#FCCFE0", edge: "#F3B4CC", ink: "#4F1030" },
  blue: { bg: "#C7E2FB", edge: "#A6CDF5", ink: "#10324F" },
}

type MemoListener = (memos: ScreenMemo[]) => void
type ReplyListener = (replies: MemoReply[]) => void
let liveMemos: ScreenMemo[] = []
let memoListeners: MemoListener[] = []
let stopMemos: (() => void) | null = null
let liveReplies: MemoReply[] = []
let replyListeners: ReplyListener[] = []
let stopReplies: (() => void) | null = null

export function subscribeScreenMemos(onChange: MemoListener): () => void {
  memoListeners.push(onChange)
  onChange(liveMemos)
  if (!stopMemos) {
    const recent = query(collection(db, MEMO_COLLECTION), orderBy("createdAt", "desc"), limit(MEMO_LIMIT))
    stopMemos = onSnapshot(recent, (snapshot) => {
      liveMemos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ScreenMemo)
      memoListeners.forEach((listener) => listener(liveMemos))
    }, () => {
      liveMemos = []
      memoListeners.forEach((listener) => listener(liveMemos))
    })
  }
  return () => {
    memoListeners = memoListeners.filter((entry) => entry !== onChange)
    if (memoListeners.length === 0 && stopMemos) {
      stopMemos()
      stopMemos = null
      liveMemos = []
    }
  }
}

export function subscribeMemoReplies(onChange: ReplyListener): () => void {
  replyListeners.push(onChange)
  onChange(liveReplies)
  if (!stopReplies) {
    const recent = query(collection(db, REPLY_COLLECTION), orderBy("createdAt", "desc"), limit(REPLY_LIMIT))
    stopReplies = onSnapshot(recent, (snapshot) => {
      liveReplies = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MemoReply)
      replyListeners.forEach((listener) => listener(liveReplies))
    }, () => {
      liveReplies = []
      replyListeners.forEach((listener) => listener(liveReplies))
    })
  }
  return () => {
    replyListeners = replyListeners.filter((entry) => entry !== onChange)
    if (replyListeners.length === 0 && stopReplies) {
      stopReplies()
      stopReplies = null
      liveReplies = []
    }
  }
}

export async function createMemo(input: Omit<ScreenMemo, "id" | "uid" | "createdAt" | "updatedAt">): Promise<string | null> {
  const user = auth.currentUser
  const text = input.text.trim().slice(0, MEMO_TEXT_MAX)
  if (!user || !text) return "invalid"
  try {
    await addDoc(collection(db, MEMO_COLLECTION), {
      ...input,
      text,
      uid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
}

export type MemoPatch = Partial<Pick<ScreenMemo, "text" | "color" | "size" | "x" | "y" | "pinned" | "expiresAt">>

export async function updateMemo(id: string, patch: MemoPatch): Promise<string | null> {
  const clean: Record<string, unknown> = {}
  if (typeof patch.text === "string") clean.text = patch.text.trim().slice(0, MEMO_TEXT_MAX)
  if (patch.color !== undefined) clean.color = patch.color
  if (patch.size !== undefined) clean.size = patch.size
  if (patch.x !== undefined) clean.x = Math.min(Math.max(patch.x, 0), 1)
  if (patch.y !== undefined) clean.y = Math.min(Math.max(patch.y, 0), 1)
  if (patch.pinned !== undefined) clean.pinned = patch.pinned
  if (patch.expiresAt !== undefined) clean.expiresAt = patch.expiresAt
  if (Object.keys(clean).length === 0 || clean.text === "") return "invalid"
  try {
    await updateDoc(doc(db, MEMO_COLLECTION, id), { ...clean, updatedAt: serverTimestamp() })
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
}

export async function deleteMemo(id: string): Promise<string | null> {
  try {
    await deleteDoc(doc(db, MEMO_COLLECTION, id))
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
}

export async function addReply(memoId: string, text: string, name: string): Promise<string | null> {
  const user = auth.currentUser
  const trimmed = text.trim().slice(0, REPLY_TEXT_MAX)
  if (!user || !trimmed) return "invalid"
  try {
    await addDoc(collection(db, REPLY_COLLECTION), {
      memoId,
      text: trimmed,
      uid: user.uid,
      name,
      createdAt: serverTimestamp(),
    })
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
}

export async function deleteReply(id: string): Promise<string | null> {
  try {
    await deleteDoc(doc(db, REPLY_COLLECTION, id))
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown"
  }
}

export function memoIsActive(memo: ScreenMemo, todayKey: string): boolean {
  return memo.expiresAt >= todayKey
}

export function repliesOf(replies: MemoReply[], memoId: string): MemoReply[] {
  return replies.filter((reply) => reply.memoId === memoId)
}

const HIDDEN_KEY = "memo.hidden"
const READ_KEY = "memo.read"

function readMap(key: string): Record<string, unknown> {
  if (typeof window === "undefined") return {}
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "{}")
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function hiddenMemoIds(): Record<string, true> {
  return Object.fromEntries(Object.entries(readMap(HIDDEN_KEY)).filter(([, value]) => value === true)) as Record<string, true>
}

export function setMemoHidden(id: string, hidden: boolean): void {
  const values = hiddenMemoIds()
  if (hidden) values[id] = true
  else delete values[id]
  saveViewPref(HIDDEN_KEY, values)
}

export function memoLastReadAt(id: string): number {
  const value = readMap(READ_KEY)[id]
  return typeof value === "number" ? value : 0
}

export function markMemoRead(id: string, at: number): void {
  const values = readMap(READ_KEY)
  values[id] = at
  saveViewPref(READ_KEY, values)
}

export function memoCreatedAtMillis(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("toMillis" in value)) return null
  const toMillis = (value as { toMillis?: unknown }).toMillis
  if (typeof toMillis !== "function") return null
  const millis = toMillis.call(value)
  return typeof millis === "number" ? millis : null
}
