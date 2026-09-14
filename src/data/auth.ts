import { create } from "zustand"
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
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

/** 계정 설정(비밀번호·로그인 이메일 변경) 창에서 쓰는 한글 오류 문구. */
function accountActionError(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "현재 비밀번호가 맞지 않습니다."
    case "auth/weak-password":
      return "새 비밀번호가 너무 약합니다. 8자 이상으로 입력하세요."
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않습니다."
    case "auth/email-already-in-use":
      return "이미 다른 계정이 쓰는 이메일입니다."
    case "auth/too-many-requests":
      return "시도가 너무 많습니다. 잠시 후 다시 시도하세요."
    case "auth/network-request-failed":
      return "네트워크 연결을 확인한 뒤 다시 시도하세요."
    case "auth/requires-recent-login":
      return "보안을 위해 로그아웃 후 다시 로그인한 뒤 시도하세요."
    case "auth/operation-not-allowed":
      return "이 작업은 현재 허용되지 않습니다. 관리자에게 문의하세요."
    default:
      return "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요."
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

/** 민감한 계정 변경 전에 현재 비밀번호로 다시 확인한다. 오래된 로그인 세션에서도 막히지 않게 한다. */
async function reauthenticate(currentPassword: string): Promise<User> {
  const user = auth.currentUser
  if (!user?.email) throw new Error("로그인이 필요합니다.")
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
  return user
}

/** 로그인한 사용자가 자신의 비밀번호를 변경한다. 현재 비밀번호 확인 후 바꾼다. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  try {
    const user = await reauthenticate(currentPassword)
    await updatePassword(user, newPassword)
  } catch (error) {
    const code = (error as { code?: string }).code
    throw new Error(code ? accountActionError(code) : (error as Error).message)
  }
}

/**
 * 로그인 이메일 변경을 요청한다. 새 주소로 확인 링크가 가고, 링크를 누른 뒤에 실제로 바뀐다.
 * 계정 uid는 그대로라 승인 상태와 화면 권한이 유지된다. 확인 메일은 새(개인) 주소로만 간다.
 * 소유자 판정은 이메일 문자열이라 소유자 계정은 화면에서 이 기능을 잠근다.
 */
export async function requestLoginEmailChange(currentPassword: string, newEmail: string): Promise<void> {
  try {
    const user = await reauthenticate(currentPassword)
    await verifyBeforeUpdateEmail(user, newEmail.trim())
  } catch (error) {
    const code = (error as { code?: string }).code
    throw new Error(code ? accountActionError(code) : (error as Error).message)
  }
}
