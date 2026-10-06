import { addDoc, collection, doc, getDocs, limit as fsLimit, orderBy, query, updateDoc, where } from "firebase/firestore"

import type { FabricCostSheet } from "./fabric-cost"
import { auth, db } from "./firebase"
import type { BlendEntry } from "./yarn-blend"

const COLLECTION = "costSheets"

/** 계산서 한 버전. Firestore 문서 하나다. */
export interface CostSheetDoc {
  id: string
  groupId: string
  version: number
  rowKey: string
  flNo: string
  styleNo: string
  project: string
  buyer: string
  season: string
  construction: string
  color: string
  owner: string
  /** 저장 시점의 창고 R&D No. 표기. 연결이 없으면 빈 문자열. */
  storageNo?: string
  sheet: FabricCostSheet
  blend?: { labelText: string; label: BlendEntry[] }
  by: string
  at: number
  note?: string
}

export const COST_STALE_DAYS = 180

const newGroupId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export async function saveCostSheet(
  draft: Omit<CostSheetDoc, "id" | "version" | "by" | "at">,
): Promise<CostSheetDoc> {
  const groupId = draft.groupId.trim() || newGroupId()
  const versions = await listCostSheets({ groupId })
  const saved = {
    ...draft,
    groupId,
    version: Math.max(0, ...versions.map((item) => item.version)) + 1,
    by: auth.currentUser?.email ?? "",
    at: Date.now(),
  }
  const ref = await addDoc(collection(db, COLLECTION), saved)
  return { id: ref.id, ...saved }
}

export async function updateCostSheet(
  id: string,
  patch: Partial<Pick<CostSheetDoc, "sheet" | "blend" | "note">>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), patch)
}

export async function listCostSheets(filter: {
  flNo?: string
  styleNo?: string
  rowKey?: string
  groupId?: string
  limit?: number
} = {}): Promise<CostSheetDoc[]> {
  const filters = [
    ...(filter.flNo ? [where("flNo", "==", filter.flNo)] : []),
    ...(filter.styleNo ? [where("styleNo", "==", filter.styleNo)] : []),
    ...(filter.rowKey ? [where("rowKey", "==", filter.rowKey)] : []),
    ...(filter.groupId ? [where("groupId", "==", filter.groupId)] : []),
  ]
  // where 와 orderBy 를 같이 걸면 복합 색인이 필요하다. 색인은 수동 배포라 자동화하지 않는다.
  // 필터가 있을 때는 서버 정렬을 빼고 클라이언트에서 정렬한다. 한 건의 버전 수는 limit 을 넘지 않는다.
  const constraints = [...filters, ...(filters.length ? [] : [orderBy("at", "desc")]), fsLimit(filter.limit ?? 100)]
  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints))
  const docs = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CostSheetDoc, "id">) }))
  return filters.length ? docs.sort((left, right) => right.at - left.at) : docs
}

export function latestByGroup(docs: readonly CostSheetDoc[]): CostSheetDoc[] {
  const latest = new Map<string, CostSheetDoc>()
  docs.forEach((item) => {
    const current = latest.get(item.groupId)
    if (!current || item.version > current.version || (item.version === current.version && item.at > current.at)) latest.set(item.groupId, item)
  })
  return [...latest.values()].sort((left, right) => right.at - left.at)
}

export function isCostSheetStale(doc: CostSheetDoc, now = Date.now()): boolean {
  return now - doc.at > COST_STALE_DAYS * 86400000
}

export function compareCostSheets(prev: CostSheetDoc, next: CostSheetDoc): {
  label: string
  prev: number
  next: number
  diff: number
  diffPct: number
}[] {
  const values: { label: string; prev: number; next: number }[] = []
  const yarnCount = Math.max(prev.sheet.input.yarns.length, next.sheet.input.yarns.length)
  for (let index = 0; index < yarnCount; index += 1) {
    const before = prev.sheet.input.yarns[index]
    const after = next.sheet.input.yarns[index]
    values.push({ label: `원사 · ${after?.name || before?.name || index + 1}`, prev: before?.price ?? 0, next: after?.price ?? 0 })
  }
  const feeCount = Math.max(prev.sheet.input.fees.length, next.sheet.input.fees.length)
  for (let index = 0; index < feeCount; index += 1) {
    const before = prev.sheet.input.fees[index]
    const after = next.sheet.input.fees[index]
    values.push({ label: `공정 · ${after?.label || before?.label || index + 1}`, prev: before?.rate ?? 0, next: after?.rate ?? 0 })
  }
  values.push(
    { label: "Net / kg", prev: prev.sheet.result.netPerKg, next: next.sheet.result.netPerKg },
    { label: "Net KRW / yd", prev: prev.sheet.result.netKrwPerYd, next: next.sheet.result.netKrwPerYd },
  )
  return values.map((item) => ({
    ...item,
    diff: item.next - item.prev,
    diffPct: item.prev === 0 ? 0 : (item.next - item.prev) / item.prev * 100,
  }))
}
