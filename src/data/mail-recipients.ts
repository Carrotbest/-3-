import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"

import { auth, db } from "./firebase"
import { EMAIL_PATTERN, type MailAddress } from "./mail-draft"

/**
 * 창고 입고 요청 메일의 고정 수신자. 공개 저장소라 주소와 이름을 코드에 넣지 않고 Firestore에 둔다.
 *
 * 문서는 `state/mailRecipients` 하나다. 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로
 * 화면 데이터와 섞이지 않는다. 규칙상 승인 사용자는 쓸 수 있지만 편집 화면은 소유자에게만 보인다.
 */
const RECIPIENT_DOC = ["state", "mailRecipients"] as const

const cleanList = (value: unknown): MailAddress[] => Array.isArray(value)
  ? value
    .map((entry) => ({ name: String((entry as MailAddress)?.name ?? "").trim(), email: String((entry as MailAddress)?.email ?? "").trim() }))
    .filter((entry) => EMAIL_PATTERN.test(entry.email))
  : []

export async function loadInboundRecipients(): Promise<MailAddress[]> {
  const snap = await getDoc(doc(db, ...RECIPIENT_DOC))
  return snap.exists() ? cleanList(snap.data().inbound) : []
}

export async function saveInboundRecipients(list: readonly MailAddress[]): Promise<MailAddress[]> {
  const inbound = cleanList(list)
  await setDoc(doc(db, ...RECIPIENT_DOC), {
    inbound,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email ?? "",
  }, { merge: true })
  return inbound
}
