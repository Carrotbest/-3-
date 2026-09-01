import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore"

import { useAuthStore } from "./auth"
import { auth, db } from "./firebase"
import type { TrendArticle } from "./trend"

export interface TrendStarItem {
  id: string
  t: string
  o: string
  u: string
  d: string
  c: TrendArticle["c"]
  m: string
  s?: string
  x?: string
  i?: string
  at: string
}

export interface TeamTrendStars {
  uid: string
  email: string
  items: TrendStarItem[]
}

function approved(): boolean {
  const state = useAuthStore.getState()
  return state.status === "signed-in" && (state.isOwner || state.approval === "approved")
}

export function articleToStar(article: TrendArticle): TrendStarItem {
  return { id: article.id, t: article.t, o: article.o, u: article.u, d: article.d,
    c: article.c, m: article.m, s: article.s, x: article.x, i: article.i, at: new Date().toISOString() }
}

export function subscribeTeamStars(handler: (rows: TeamTrendStars[]) => void): Unsubscribe {
  if (!approved()) {
    handler([])
    return () => undefined
  }
  return onSnapshot(collection(db, "trendStars"), (snap) => {
    handler(snap.docs.map((item) => ({ uid: item.id, email: String(item.data().email ?? ""),
      items: Array.isArray(item.data().items) ? item.data().items as TrendStarItem[] : [] })))
  }, () => handler([]))
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

export function pushMyStars(items: TrendStarItem[]): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    const user = auth.currentUser
    if (!user || !approved()) return
    void setDoc(doc(db, "trendStars", user.uid), {
      email: user.email ?? user.uid,
      updatedAt: serverTimestamp(),
      items,
    }).catch(() => undefined)
  }, 1000)
}
