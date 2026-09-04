import { create } from "zustand"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth"
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"

import { auth, db } from "./firebase"
import { OWNER_EMAIL } from "./app-config"
import { createScreenPermissions, normalizeScreenPermissions, type ScreenPermissions } from "./screen-permissions"

export type AuthStatus = "loading" | "signed-out" | "signed-in"
/** 소유자는 항상 approved. 그 외는 users/{uid}.status를 따른다(문서 없으면 pending). */
export type ApprovalState = "unknown" | "pending" | "approved" | "rejected"

interface AuthState {
  status: AuthStatus
  user: User | null
  isOwner: boolean
  approval: ApprovalState
  screenPermissions: ScreenPermissions
  error: string | null
}

export const useAuthStore = create<AuthState>(() => ({
  status: "loading",
  user: null,
  isOwner: false,
  approval: "unknown",
  screenPermissions: createScreenPermissions(false),
  error: null,
}))

const ownerEmail = OWNER_EMAIL.trim().toLowerCase()
const isOwnerUser = (user: User | null): boolean =>
  !!user?.email && user.email.trim().toLowerCase() === ownerEmail

/** 앱 시작 시 한 번 호출해 로그인 + 승인 상태를 구독한다. */
export function initAuth(): void {
  let approvalUnsub: (() => void) | null = null

  onAuthStateChanged(auth, (user) => {
    approvalUnsub?.()
    approvalUnsub = null

    if (!user) {
      useAuthStore.setState({
        status: "signed-out",
        user: null,
        isOwner: false,
        approval: "unknown",
        screenPermissions: createScreenPermissions(false),
        error: null,
      })
      return
    }

    const owner = isOwnerUser(user)
    useAuthStore.setState({
      status: "signed-in",
      user,
      isOwner: owner,
      approval: owner ? "approved" : "unknown",
      screenPermissions: createScreenPermissions(owner),
      error: null,
    })

    if (owner) return
    // 팀원: 자신의 승인 상태 문서를 실시간 구독한다.
    approvalUnsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : null
        const status = data ? (data.status as string) : "pending"
        const approval: ApprovalState = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending"
        useAuthStore.setState({
          approval,
          screenPermissions: normalizeScreenPermissions(data?.screenPermissions),
        })
      },
      () => useAuthStore.setState({ approval: "pending" }),
    )
  })
}

/** 로그인한 사용자가 소유자(편집 권한)인지 여부. UI 게이팅에 사용. */
export function currentUserIsOwner(): boolean {
  return isOwnerUser(auth.currentUser)
}

/** 중앙 데이터를 쓸 수 있는 사용자인지. 소유자 또는 승인된 팀원. */
export function currentUserCanWrite(): boolean {
  if (currentUserIsOwner()) return true
  const state = useAuthStore.getState()
  return state.status === "signed-in" && state.approval === "approved"
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "Enter a valid email address."
    case "auth/user-disabled":
      return "This account has been disabled."
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The email or password is incorrect."
    case "auth/email-already-in-use":
      return "This email is already registered. Try signing in instead."
    case "auth/weak-password":
      return "Your password must be at least 6 characters."
    case "auth/too-many-requests":
      return "Too many attempts. Please try again in a moment."
    case "auth/network-request-failed":
      return "Check your network connection and try again."
    default:
      return "We could not complete the request. Please try again."
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  useAuthStore.setState({ error: null })
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch (error) {
    const message = friendlyAuthError((error as { code?: string }).code ?? "")
    useAuthStore.setState({ error: message })
    throw new Error(message)
  }
}

/** 방문자 자율 가입. 계정을 만들고 승인 대기(users/{uid}.status='pending') 문서를 남긴다. */
export async function signUp(email: string, password: string, name: string): Promise<void> {
  useAuthStore.setState({ error: null })
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    const displayName = name.trim()
    if (displayName) {
      try { await updateProfile(credential.user, { displayName }) } catch { /* 표시 이름 실패는 무시 */ }
    }
    await setDoc(doc(db, "users", credential.user.uid), {
      email: (credential.user.email ?? email.trim()).toLowerCase(),
      name: displayName || null,
      status: "pending",
      screenPermissions: createScreenPermissions(true),
      requestedAt: serverTimestamp(),
    })
  } catch (error) {
    const message = friendlyAuthError((error as { code?: string }).code ?? "")
    useAuthStore.setState({ error: message })
    throw new Error(message)
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

/** 로그인한 사용자가 자신의 비밀번호를 변경한다. */
export async function changeOwnPassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error("로그인이 필요합니다.")
  await updatePassword(auth.currentUser, newPassword)
}
