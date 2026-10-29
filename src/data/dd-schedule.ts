/**
 * DD MASTER 공정 일정의 확정 목표(baseline)와 변경 이력.
 *
 * **왜 `records`가 아니라 별도 컬렉션인가.** 동기화 병합이 행 전체 단위다(`sync-merge.ts`).
 * 내 행이 기준선과 다르면 내 행 전체가 원격 행을 이기므로, 팀원이 같은 행의 다른 칸을
 * 고치는 것만으로 남이 확정한 baseline이 사라진다. 권위값은 여기 고정 ID 문서에 둔다.
 *
 * **왜 `auditLog`가 아닌가.** 거기는 보관이 90일이다. 개발 건은 그보다 오래 간다.
 *
 * **실패를 삼키지 않는다.** `audit.logAction`은 실패해도 조용히 넘어간다. 일정 이력은
 * 그러면 안 된다. 날짜만 바뀌고 이력이 빠지면 근거 없는 지연과 구별이 안 된다.
 * 여기 함수들은 성공 여부를 돌려주고 부르는 쪽이 사용자에게 알린다.
 */
import { collection, doc, getDoc, getDocs, limit as fsLimit, orderBy, query, runTransaction, setDoc, where } from "firebase/firestore"

import { db, auth } from "./firebase"
import { currentUserCanEditKey, currentUserCanWrite } from "./auth"
import type { DevRecord } from "./schema"

const BASELINE_COLLECTION = "scheduleBaseline"
const LOG_COLLECTION = "scheduleLog"

export type DdProcess = "yarn" | "knitting" | "dyeing" | "finishing"
export const DD_PROCESSES: readonly DdProcess[] = ["yarn", "knitting", "dyeing", "finishing"]

/** 값이 없는 공정은 키를 아예 뺀다. Firestore가 undefined 값을 가진 키를 거부한다(R340). */
export type DdProcessDates = Partial<Record<DdProcess, string>>

/** 일정을 뒤로 미룬 사유. 여덟 개로 닫혀 있다. 2026-10-29 박향근 확정. */
export type DdDelayReason =
  | "yarnLate" | "knittingLate" | "dyeingLate" | "finishingLate"
  | "shippingLate" | "approvalWait" | "internalReview" | "other"

export const DD_DELAY_REASON_LABEL: Record<DdDelayReason, string> = {
  yarnLate: "원사 입고 지연",
  knittingLate: "편직처 일정 지연",
  dyeingLate: "염색 일정 지연",
  finishingLate: "가공 일정 지연",
  shippingLate: "발송 지연",
  approvalWait: "컬러나 처방 승인 대기",
  internalReview: "사내 검토 지연",
  other: "기타",
}

/** 확정 목표. 개발 건 1건당 하나이고 다시 쓰이지 않는다. */
export interface DdScheduleBaseline {
  rowKey: string
  process: DdProcessDates
  dueDate: string
  /** 확정 당시의 원사 실적일. 나중에 원사 실적을 정정해도 이 값은 그대로 둔다. */
  yarnActualDate: string
  confirmedAt: string
  confirmedBy: string
  confirmedByName: string
}

/** 일정 한 칸이 바뀐 사건 1건. */
export interface DdScheduleChange {
  id: string
  /** 문서 ID와 같다. 재시도해도 같은 값을 써서 중복 기록을 막는다. */
  opId: string
  rowKey: string
  field: "dueDate" | DdProcess
  before: string
  after: string
  /** 며칠 밀렸나. 앞당기면 음수다. 집계할 때 다시 계산하지 않으려고 저장한다. */
  days: number
  /** 뒤로 미룬 경우에만 받는다. 비어 있으면 사유 미입력이다. */
  reasonCode: DdDelayReason | ""
  memo: string
  at: string
  by: string
  name: string
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; reason: "exists" | "denied" | "failed" }

/**
 * 개발 건의 고정 문서 ID. 병합 식별자(`_src.sheet::row`)와 같은 기준이다.
 * 그 값이 바뀌면 병합도 같이 깨지므로 새 기준을 만들지 않는다.
 *
 * 시트 이름에 `/`가 들어갈 수 있어 그대로는 문서 ID로 못 쓴다. 조각마다 인코딩한다.
 * 앞에 `r_`를 붙이는 것은 Firestore가 예약한 `__...__` 형태를 피하려는 것이다.
 */
export function scheduleRowKey(record: DevRecord): string {
  return `r_${encodeURIComponent(record._src.sheet)}__${record._src.row}`
}

const actorName = (): string => {
  const user = auth.currentUser
  return user?.displayName?.trim() || user?.email?.split("@")[0] || "알 수 없음"
}

const canWriteSchedule = (): boolean => currentUserCanWrite() && currentUserCanEditKey("records")

/** 값이 있는 공정만 남긴다. 빈 문자열과 undefined는 키째로 뺀다. */
function compactDates(input: DdProcessDates): DdProcessDates {
  const out: DdProcessDates = {}
  DD_PROCESSES.forEach((key) => {
    const value = String(input[key] ?? "").trim()
    if (value) out[key] = value
  })
  return out
}

/** 두 날짜의 일 수 차이. 못 읽으면 0이다. */
export function dayGap(before: string, after: string): number {
  const a = Date.parse(`${String(before).trim().slice(0, 10)}T00:00:00`)
  const b = Date.parse(`${String(after).trim().slice(0, 10)}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

/** 확정 목표를 읽는다. 없으면 null. 조회 실패도 null이지만 그것을 미확정으로 읽지 마라. */
export async function fetchScheduleBaseline(rowKey: string): Promise<DdScheduleBaseline | null> {
  try {
    const snapshot = await getDoc(doc(db, BASELINE_COLLECTION, rowKey))
    return snapshot.exists() ? (snapshot.data() as DdScheduleBaseline) : null
  } catch {
    return null
  }
}

/**
 * 공정 목표를 확정한다. **이미 있으면 덮지 않고 `exists`로 돌려준다.**
 * 트랜잭션 안에서 존재를 확인하고 없을 때만 쓴다. 두 사람이 동시에 눌러도 하나만 선다.
 * 규칙에서도 update와 delete를 막아 두어, 여기를 우회해도 고쳐지지 않는다.
 */
export async function confirmScheduleBaseline(input: {
  rowKey: string
  process: DdProcessDates
  dueDate: string
  yarnActualDate: string
}): Promise<ConfirmResult> {
  if (!canWriteSchedule()) return { ok: false, reason: "denied" }
  const user = auth.currentUser
  const email = user?.email ?? ""
  if (!email) return { ok: false, reason: "denied" }
  const payload: DdScheduleBaseline = {
    rowKey: input.rowKey,
    process: compactDates(input.process),
    dueDate: String(input.dueDate).trim(),
    yarnActualDate: String(input.yarnActualDate).trim(),
    confirmedAt: new Date().toISOString(),
    confirmedBy: email,
    confirmedByName: actorName(),
  }
  try {
    const ref = doc(db, BASELINE_COLLECTION, input.rowKey)
    return await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref)
      if (snapshot.exists()) return { ok: false, reason: "exists" } as ConfirmResult
      tx.set(ref, payload)
      return { ok: true } as ConfirmResult
    })
  } catch {
    return { ok: false, reason: "failed" }
  }
}

/**
 * 일정 변경 1건을 남긴다. **성공 여부를 돌려준다.**
 * 부르는 쪽이 실패를 사용자에게 알려야 한다. 조용히 삼키면 날짜만 바뀌고 근거가 빈다.
 */
export async function appendScheduleChange(input: {
  rowKey: string
  field: "dueDate" | DdProcess
  before: string
  after: string
  reasonCode?: DdDelayReason | ""
  memo?: string
  /** 재시도해도 같은 값을 넘긴다. 문서 ID가 되어 중복 기록을 막는다. */
  opId: string
}): Promise<boolean> {
  if (!canWriteSchedule()) return false
  const email = auth.currentUser?.email ?? ""
  if (!email) return false
  const payload = {
    opId: input.opId,
    rowKey: input.rowKey,
    field: input.field,
    before: String(input.before ?? "").trim(),
    after: String(input.after ?? "").trim(),
    days: dayGap(input.before ?? "", input.after ?? ""),
    reasonCode: input.reasonCode ?? "",
    memo: String(input.memo ?? "").trim(),
    at: new Date().toISOString(),
    by: email,
    name: actorName(),
  }
  try {
    // 규칙이 create만 허용하므로 같은 opId로 두 번 쓰면 두 번째가 거부된다. 그게 의도다.
    await setDoc(doc(db, LOG_COLLECTION, input.opId), payload)
    return true
  } catch {
    return false
  }
}

/** 한 개발 건의 일정 변경 이력. 최신이 앞이다. */
export async function listScheduleChanges(rowKey: string, max = 50): Promise<DdScheduleChange[]> {
  try {
    const snapshot = await getDocs(query(
      collection(db, LOG_COLLECTION),
      where("rowKey", "==", rowKey),
      orderBy("at", "desc"),
      fsLimit(max),
    ))
    return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DdScheduleChange, "id">) }))
  } catch {
    return []
  }
}
