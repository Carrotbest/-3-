import { collection, doc, onSnapshot, serverTimestamp, updateDoc, type Unsubscribe } from "firebase/firestore"

import { auth, db } from "./firebase"
import { departmentById } from "./departments"
import { accessToScreenPermissions, normalizeScreenAccess, type ScreenAccessMap } from "./screen-permissions"

export type ManagedUserStatus = "pending" | "approved" | "rejected"

export interface ManagedUser {
  uid: string
  email: string
  name: string | null
  status: ManagedUserStatus
  access: ScreenAccessMap
  department: string | null
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
          access?: unknown
          department?: string | null
          permissionsUpdatedAt?: unknown
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
          // 승인 대기인데 소유자가 아직 권한을 손대지 않았으면 신청 부서 기본값을 쓴다.
          // 신청 문서에 적힌 access를 그대로 믿지 않기 위해서다(R218).
          access: status === "pending" && !data.permissionsUpdatedAt && departmentById(data.department)
            ? { ...departmentById(data.department)!.access }
            : normalizeScreenAccess(data.access, data.screenPermissions),
          department: typeof data.department === "string" ? data.department : null,
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

export async function approveUser(uid: string, access: ScreenAccessMap, department: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    access,
    department,
    screenPermissions: accessToScreenPermissions(access),
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.email ?? "owner",
  })
}

/** 접근 수준과 부서를 저장한다. 예전 화면(라우팅)이 읽는 screenPermissions도 함께 맞춘다. */
export async function updateUserAccess(uid: string, access: ScreenAccessMap, department: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    access,
    department,
    screenPermissions: accessToScreenPermissions(access),
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
