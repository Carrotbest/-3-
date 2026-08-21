import { collection, doc, onSnapshot, serverTimestamp, updateDoc, type Unsubscribe } from "firebase/firestore"

import { auth, db } from "./firebase"
import { normalizeScreenPermissions, type ScreenPermissions } from "./screen-permissions"

export type ManagedUserStatus = "pending" | "approved" | "rejected"

export interface ManagedUser {
  uid: string
  email: string
  name: string | null
  status: ManagedUserStatus
  screenPermissions: ScreenPermissions
  requestedAt: string | null
}

const STATUS_ORDER: Record<ManagedUserStatus, number> = { pending: 0, approved: 1, rejected: 2 }

/** 전체 가입자의 승인 상태와 화면 권한을 실시간 구독한다(소유자 전용). */
export function listenManagedUsers(onData: (users: ManagedUser[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "users"),
    (snap) => {
      const users = snap.docs.map((d) => {
        const data = d.data() as {
          email?: string
          name?: string | null
          status?: string
          screenPermissions?: unknown
          requestedAt?: { toDate?: () => Date }
        }
        const status: ManagedUserStatus = data.status === "approved"
          ? "approved"
          : data.status === "rejected" ? "rejected" : "pending"
        return {
          uid: d.id,
          email: data.email ?? "",
          name: data.name ?? null,
          status,
          screenPermissions: normalizeScreenPermissions(data.screenPermissions),
          requestedAt: data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : null,
        }
      })
      users.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        || (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""))
      onData(users)
    },
    () => onData([]),
  )
}

export async function approveUser(uid: string, screenPermissions: ScreenPermissions): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    screenPermissions,
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.email ?? "owner",
  })
}

export async function updateUserScreenPermissions(uid: string, screenPermissions: ScreenPermissions): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    screenPermissions,
    permissionsUpdatedAt: serverTimestamp(),
    permissionsUpdatedBy: auth.currentUser?.email ?? "owner",
  })
}

export async function rejectUser(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "rejected",
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.email ?? "owner",
  })
}
