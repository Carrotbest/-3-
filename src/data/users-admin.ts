import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type Unsubscribe } from "firebase/firestore"

import { auth, db } from "./firebase"

export interface PendingUser {
  uid: string
  email: string
  name: string | null
  requestedAt: string | null
}

/** 승인 대기 중인 가입 신청 목록을 실시간 구독한다(소유자 전용). */
export function listenPendingUsers(onData: (users: PendingUser[]) => void): Unsubscribe {
  const q = query(collection(db, "users"), where("status", "==", "pending"))
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs.map((d) => {
        const data = d.data() as { email?: string; name?: string | null; requestedAt?: { toDate?: () => Date } }
        return {
          uid: d.id,
          email: data.email ?? "",
          name: data.name ?? null,
          requestedAt: data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : null,
        }
      })
      users.sort((a, b) => (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""))
      onData(users)
    },
    () => onData([]),
  )
}

export async function approveUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.email ?? "owner",
  })
}

export async function rejectUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "rejected",
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.email ?? "owner",
  })
}
