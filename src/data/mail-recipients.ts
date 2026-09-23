import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"

import { auth, db } from "./firebase"
import { EMAIL_PATTERN, type MailAddress } from "./mail-draft"

/**
 * 창고 입고·출고 요청 메일의 공용 고정 수신자. 두 화면이 같은 목록 한 벌을 쓴다(2026-09-23).
 * 공개 저장소라 주소와 이름을 코드에 넣지 않고 Firestore에 둔다.
 *
 * 문서는 `state/mailRecipients` 하나다. 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로
 * 화면 데이터와 섞이지 않는다. 규칙상 승인 사용자는 쓸 수 있지만 편집 화면은 소유자에게만 보인다.
 *
 * **필드 이름 `inbound`는 그대로 둔다.** 입고 전용이던 시절에 등록한 목록을 옮기지 않기 위해서다.
 * 이름만 warehouse로 바뀌었고 저장 위치는 같다.
 */
const RECIPIENT_DOC = ["state", "mailRecipients"] as const

const cleanList = (value: unknown): MailAddress[] => Array.isArray(value)
  ? value
    .map((entry) => ({ name: String((entry as MailAddress)?.name ?? "").trim(), email: String((entry as MailAddress)?.email ?? "").trim() }))
    .filter((entry) => EMAIL_PATTERN.test(entry.email))
  : []

export async function loadWarehouseRecipients(): Promise<MailAddress[]> {
  const snap = await getDoc(doc(db, ...RECIPIENT_DOC))
  return snap.exists() ? cleanList(snap.data().inbound) : []
}

export async function saveWarehouseRecipients(list: readonly MailAddress[]): Promise<MailAddress[]> {
  const inbound = cleanList(list)
  await setDoc(doc(db, ...RECIPIENT_DOC), {
    inbound,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email ?? "",
  }, { merge: true })
  return inbound
}

export async function loadAnalysisRecipients(): Promise<MailAddress[]> {
  const snap = await getDoc(doc(db, ...RECIPIENT_DOC))
  return snap.exists() ? cleanList(snap.data().analysis) : []
}

export async function saveAnalysisRecipients(list: readonly MailAddress[]): Promise<MailAddress[]> {
  const analysis = cleanList(list)
  await setDoc(doc(db, ...RECIPIENT_DOC), {
    analysis,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email ?? "",
  }, { merge: true })
  return analysis
}
