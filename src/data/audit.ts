/**
 * 작업 이력(감사 로그)과 선택적 되돌리기.
 *
 * **셀 단위가 아니라 작업 단위로 남긴다.** 사람은 "셀 47개"가 아니라 "그 붙여넣기"를 되돌리고 싶어 한다.
 * 붙여넣기 100셀이 문서 1개라 쓰기도 1회다. 셀마다 문서를 만들면 하루 수백 건이 수천 건이 된다.
 *
 * 저장 위치는 `state/{key}`가 아니라 **별도 컬렉션 `auditLog`**다. `state`는 값이 하나만 바뀌어도
 * 배열 전체를 다시 올리는 구조라, 쌓이기만 하는 로그를 거기 두면 편집 한 번의 비용이 계속 커진다.
 * 여기는 덧붙이기 전용이라 로그가 아무리 길어도 편집당 쓰기 1회다.
 *
 * 되돌리기 전에는 반드시 충돌을 본다. 내가 되돌리려는 셀을 그 뒤에 남이 고쳤다면 건너뛴다.
 * 이게 없으면 되돌리기가 남의 작업을 지우는 새 사고가 된다.
 */
import { addDoc, collection, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore"

import { db, auth } from "./firebase"
import { currentUserCanWrite } from "./auth"
import type { DevRecord, FabricLedgerEvent, RequestStyle } from "./schema"
import type { TsRecord } from "./sample"

const COLLECTION = "auditLog"
/** 보관 기간. 조회는 이 범위만 본다. */
export const AUDIT_RETENTION_DAYS = 90
/**
 * 문서 하나에 담는 셀 변경 수 상한. Firestore 문서 한도가 1MB인데
 * 셀 1,000개가 약 142KB다. 넉넉히 잡아도 한도에 닿지 않는다.
 */
const MAX_CHANGES_PER_DOC = 2000

export type AuditScreen = "dd" | "ts" | "request" | "warehouse"
export type AuditKind = "edit" | "paste" | "fill" | "replace" | "clear" | "intake" | "upload" | "warehouse" | "revert"

/** 셀 1개의 변경. 키를 짧게 쓴다. 문서 수천 개가 쌓이므로 이름 길이가 그대로 용량이다. */
export interface AuditChange {
  /** 대상 식별자. DD는 `sheet::row`, 나머지는 각자의 고유 id. */
  k: string
  /** 필드 이름 */
  c: string
  /** 이전 값 */
  b: string
  /** 이후 값 */
  a: string
}

export interface AuditAction {
  id: string
  /** ISO 문자열. 정렬과 기간 조회 기준이다. */
  at: string
  by: string
  name: string
  kind: AuditKind
  screen: AuditScreen
  ch: AuditChange[]
}

const SCREEN_LABEL: Record<AuditScreen, string> = {
  dd: "DD MASTER",
  ts: "TROUBLE SHOOTING",
  request: "FABRIC REQUEST",
  warehouse: "WAREHOUSE",
}

const KIND_LABEL: Record<AuditKind, string> = {
  edit: "셀 편집",
  paste: "붙여넣기",
  fill: "채우기",
  replace: "일괄 치환",
  clear: "내용 지우기",
  intake: "신규 접수",
  upload: "엑셀 업로드",
  warehouse: "입출고",
  revert: "되돌리기",
}

export const auditScreenLabel = (screen: AuditScreen): string => SCREEN_LABEL[screen] ?? screen
export const auditKindLabel = (kind: AuditKind): string => KIND_LABEL[kind] ?? kind

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : typeof value === "string" ? value : String(value)

// ─────────────────────────────────────────────── 변경점 뽑기

/** DD 레코드의 식별자. 동기화 병합 키와 같은 값이다. */
const devKey = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

/** 중첩 객체를 `tech.actual.weight` 같은 평평한 키로 편다. 배열은 통째로 문자열로 본다. */
function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined) return out
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value)
    return out
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }
  out[prefix] = text(value)
  return out
}

/** 같은 식별자를 가진 두 목록을 비교해 바뀐 필드만 뽑는다. 추가·삭제도 잡는다. */
export function diffByKey<T>(
  before: readonly T[],
  after: readonly T[],
  keyOf: (item: T) => string,
): AuditChange[] {
  const prev = new Map(before.map((item) => [keyOf(item), item]))
  const next = new Map(after.map((item) => [keyOf(item), item]))
  const changes: AuditChange[] = []

  next.forEach((item, key) => {
    const old = prev.get(key)
    if (!old) {
      changes.push({ k: key, c: "*", b: "", a: "(추가)" })
      return
    }
    const flatOld = flatten(old)
    const flatNew = flatten(item)
    const fields = new Set([...Object.keys(flatOld), ...Object.keys(flatNew)])
    fields.forEach((field) => {
      const b = flatOld[field] ?? ""
      const a = flatNew[field] ?? ""
      if (b !== a) changes.push({ k: key, c: field, b, a })
    })
  })
  prev.forEach((_, key) => {
    if (!next.has(key)) changes.push({ k: key, c: "*", b: "(있음)", a: "(삭제)" })
  })
  return changes
}

export const diffDevRecords = (before: readonly DevRecord[], after: readonly DevRecord[]): AuditChange[] =>
  diffByKey(before, after, devKey)
export const diffTsRecords = (before: readonly TsRecord[], after: readonly TsRecord[]): AuditChange[] =>
  diffByKey(before, after, (item) => item.id)
export const diffRequests = (before: readonly RequestStyle[], after: readonly RequestStyle[]): AuditChange[] =>
  diffByKey(before, after, (item) => item.reqId)
export const diffFabricEvents = (before: readonly FabricLedgerEvent[], after: readonly FabricLedgerEvent[]): AuditChange[] =>
  diffByKey(before, after, (item) => item.id)

// ─────────────────────────────────────────────── 기록

const actorName = (): string => {
  const user = auth.currentUser
  return user?.displayName?.trim() || user?.email?.split("@")[0] || "알 수 없음"
}

/**
 * 작업 1건을 남긴다. 변경이 없으면 아무것도 쓰지 않는다.
 * 실패해도 던지지 않는다. 로그를 못 남겼다고 사용자의 저장이 막히면 안 된다.
 */
export async function logAction(input: {
  kind: AuditKind
  screen: AuditScreen
  changes: readonly AuditChange[]
}): Promise<void> {
  if (!input.changes.length) return
  if (!currentUserCanWrite()) return
  const user = auth.currentUser
  const base = {
    at: new Date().toISOString(),
    by: user?.email ?? user?.uid ?? "unknown",
    name: actorName(),
    kind: input.kind,
    screen: input.screen,
  }
  // 아주 큰 작업은 문서를 나눈다. 되돌릴 때는 같은 시각으로 묶여 나란히 보인다.
  for (let start = 0; start < input.changes.length; start += MAX_CHANGES_PER_DOC) {
    const slice = input.changes.slice(start, start + MAX_CHANGES_PER_DOC)
    try {
      await addDoc(collection(db, COLLECTION), { ...base, ch: slice })
    } catch {
      // 권한 없음·오프라인은 조용히 넘어간다. 원장 저장은 이미 끝났다.
      return
    }
  }
}

// ─────────────────────────────────────────────── 조회

export interface AuditQuery {
  /** ISO 날짜(yyyy-mm-dd). 이 날짜 00:00부터 */
  from?: string
  /** ISO 날짜(yyyy-mm-dd). 이 날짜 23:59:59까지 */
  to?: string
  by?: string
  screen?: AuditScreen
  max?: number
}

/** 최신순으로 읽는다. 보관 기간을 넘은 것은 조회하지 않는다. */
export async function listActions(input: AuditQuery = {}): Promise<AuditAction[]> {
  const retention = new Date(Date.now() - AUDIT_RETENTION_DAYS * 86400000).toISOString()
  const from = input.from ? `${input.from}T00:00:00.000Z` : retention
  const to = input.to ? `${input.to}T23:59:59.999Z` : new Date(Date.now() + 86400000).toISOString()
  try {
    const snapshot = await getDocs(query(
      collection(db, COLLECTION),
      where("at", ">=", from < retention ? retention : from),
      where("at", "<=", to),
      orderBy("at", "desc"),
      fsLimit(input.max ?? 300),
    ))
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<AuditAction, "id">) }))
      .filter((action) => (!input.by || action.by === input.by) && (!input.screen || action.screen === input.screen))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────── 되돌리기

export interface RevertPlanRow {
  change: AuditChange
  /** 현재 값 */
  now: string
  /** 되돌릴 수 있는가. 현재 값이 그 작업의 결과와 같을 때만 안전하다. */
  ok: boolean
}

export interface RevertPlan {
  screen: AuditScreen
  rows: RevertPlanRow[]
  applicable: number
  conflicted: number
}

/**
 * 되돌리기 계획을 세운다. **현재 값이 그 작업의 `이후 값`과 다르면 건너뛴다.**
 * 그 사이 다른 사람이 같은 칸을 고쳤다는 뜻이라, 그냥 되돌리면 그 사람 작업이 지워진다.
 *
 * `currentOf`는 화면별로 지금 값을 읽어 주는 함수다. 없는 칸이면 null을 준다.
 */
export function planRevert(
  actions: readonly AuditAction[],
  currentOf: (key: string, field: string) => string | null,
): RevertPlan[] {
  const byScreen = new Map<AuditScreen, RevertPlanRow[]>()
  // 최신 작업부터 훑어 같은 칸이 여러 번 나오면 가장 오래된 값까지 되돌린다.
  const ordered = [...actions].sort((left, right) => right.at.localeCompare(left.at))
  const seen = new Set<string>()
  for (const action of ordered) {
    const rows = byScreen.get(action.screen) ?? []
    for (const change of action.ch) {
      const cell = `${action.screen}::${change.k}::${change.c}`
      if (seen.has(cell)) {
        // 같은 칸을 더 과거로 되돌린다. 앞서 담은 행의 목표값만 낮춘다.
        const previous = rows.find((row) => row.change.k === change.k && row.change.c === change.c)
        if (previous) previous.change = { ...previous.change, b: change.b }
        continue
      }
      seen.add(cell)
      const now = currentOf(change.k, change.c)
      rows.push({ change, now: now ?? "", ok: now !== null && now === change.a })
    }
    byScreen.set(action.screen, rows)
  }
  return [...byScreen.entries()].map(([screen, rows]) => ({
    screen,
    rows,
    applicable: rows.filter((row) => row.ok).length,
    conflicted: rows.filter((row) => !row.ok).length,
  }))
}
