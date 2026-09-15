import { createBlankDevRecord, isCompletedFlNo } from "@/data/dd-workflow"
import { daysLeft, toDate } from "@/data/format"
import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"

export const normalizeStyleKey = (value: string): string =>
  value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")

export function linkedLineIds(records: readonly DevRecord[]): Set<string> {
  return new Set(records.flatMap((record) => record.tech?.requestLink?.lineId ? [record.tech.requestLink.lineId] : []))
}

export interface RequestLinkTarget { style: RequestStyle; option: RequestOption }

export function requestLinkIndex(requests: readonly RequestStyle[]): Map<string, RequestLinkTarget> {
  const index = new Map<string, RequestLinkTarget>()
  requests.forEach((style) => style.options.forEach((option) => {
    if (option.lineId) index.set(option.lineId, { style, option })
  }))
  return index
}

export function resolveRequestLink(index: Map<string, RequestLinkTarget>, record: DevRecord): RequestLinkTarget | "missing" | null {
  const link = record.tech?.requestLink
  if (!link) return null
  const target = index.get(link.lineId)
  return target?.style.reqId === link.reqId ? target : "missing"
}

export interface LinkPair { rowId: string; optId: string | null }

const rowIdOf = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`
const numericOrder = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

export function defaultLinkPairs(rows: readonly DevRecord[], style: RequestStyle, blockedLineIds: ReadonlySet<string>): LinkPair[] {
  const sortedRows = rows.map((row, index) => ({ row, index }))
    .sort((a, b) => numericOrder(a.row.opt) - numericOrder(b.row.opt) || a.index - b.index)
  const available = style.options.map((option, index) => ({ option, index }))
    .filter(({ option }) => !option.lineId || !blockedLineIds.has(option.lineId))
    .sort((a, b) => a.option.no - b.option.no || a.index - b.index)
    .map(({ option }) => option)
  const used = new Set<string>()
  const pairs = new Map<string, LinkPair>()
  sortedRows.forEach(({ row }) => {
    const current = style.options.find((option) => option.lineId && option.lineId === row.tech?.requestLink?.lineId && !blockedLineIds.has(option.lineId))
    if (current) { used.add(current.optId); pairs.set(rowIdOf(row), { rowId: rowIdOf(row), optId: current.optId }) }
  })
  sortedRows.forEach(({ row }) => {
    const rowId = rowIdOf(row)
    if (pairs.has(rowId)) return
    const option = available.find((item) => !used.has(item.optId))
    if (option) used.add(option.optId)
    pairs.set(rowId, { rowId, optId: option?.optId ?? null })
  })
  return sortedRows.map(({ row }) => pairs.get(rowIdOf(row))!)
}

export function applyRequestLinks(records: readonly DevRecord[], style: RequestStyle, pairs: readonly LinkPair[], fillEmpty: boolean): { next: DevRecord[]; linked: number } {
  const pairByRow = new Map(pairs.map((pair) => [pair.rowId, pair.optId]))
  let linked = 0
  const next = records.map((record) => {
    const rowId = rowIdOf(record)
    if (!pairByRow.has(rowId)) return record
    const optId = pairByRow.get(rowId)
    if (optId === null) {
      if (record.tech?.requestLink?.reqId !== style.reqId) return record
      const { requestLink: _removed, ...tech } = record.tech
      return { ...record, tech }
    }
    const option = style.options.find((item) => item.optId === optId)
    if (!option?.lineId) return record
    linked += 1
    const filled = fillEmpty ? {
      buyer: record.buyer || style.brand,
      planner: record.planner || style.requester,
      color: record.color || option.color,
      dyeing: record.dyeing || option.dyeingMethod,
      note: record.note || option.remark,
      construction: record.construction || option.construction || "",
      weight: record.weight === "" ? option.weight ?? "" : record.weight,
    } : {}
    return {
      ...record,
      ...filled,
      tech: {
        ...record.tech,
        ...(fillEmpty ? { yarnDetail: record.tech?.yarnDetail || option.yarnDetail } : {}),
        requestLink: { reqId: style.reqId, lineId: option.lineId },
      },
    }
  })
  return { next, linked }
}

export function removeRequestLinks(records: readonly DevRecord[], rowIds: ReadonlySet<string>): { next: DevRecord[]; removed: number } {
  let removed = 0
  const next = records.map((record) => {
    if (!rowIds.has(rowIdOf(record)) || !record.tech?.requestLink) return record
    removed += 1
    const { requestLink: _removed, ...tech } = record.tech
    return { ...record, tech }
  })
  return { next, removed }
}

export type HelperStatus = "auto" | "review" | "none"

export interface HelperGroup {
  /** normalizeStyleKey(styleNo) */
  styleKey: string
  /** 대표 표기(첫 행) */
  styleNo: string
  /** 이 Style No.의 미연결 DD 행. opt 순 */
  rows: DevRecord[]
  /** normalizeStyleKey(garmentNo)가 같은 요청 스타일 */
  candidates: RequestStyle[]
  status: HelperStatus
  reason: string
}

const HELPER_EXCLUDED_STATUS = /^(DROP|REJECT)$/

/**
 * 연결 도우미 후보. 짝 규칙은 defaultLinkPairs 하나를 쓰고 여기서는 묶음과 판정만 한다.
 * auto는 후보가 1개이고 그 후보의 미연결 옵션 수가 DD 행 수와 같을 때만이다.
 * Garment No.와 Style No.가 다른 예외가 있어 그 밖의 경우는 사람이 짝을 확인한다.
 */
export function buildLinkHelperGroups(records: readonly DevRecord[], requests: readonly RequestStyle[]): HelperGroup[] {
  const linked = linkedLineIds(records)
  const rowsByKey = new Map<string, DevRecord[]>()
  records.forEach((record) => {
    const styleNo = record.styleNo.trim()
    if (!styleNo || record.tech?.requestLink) return
    if (HELPER_EXCLUDED_STATUS.test(String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase())) return
    const key = normalizeStyleKey(styleNo)
    const group = rowsByKey.get(key)
    if (group) group.push(record)
    else rowsByKey.set(key, [record])
  })
  const requestsByKey = new Map<string, RequestStyle[]>()
  requests.forEach((style) => {
    const key = normalizeStyleKey(style.garmentNo)
    if (!key) return
    const group = requestsByKey.get(key)
    if (group) group.push(style)
    else requestsByKey.set(key, [style])
  })
  const rank: Record<HelperStatus, number> = { auto: 0, review: 1, none: 2 }
  return [...rowsByKey].map(([styleKey, rows]): HelperGroup => {
    const sortedRows = [...rows].sort((a, b) => numericOrder(a.opt) - numericOrder(b.opt))
    const candidates = requestsByKey.get(styleKey) ?? []
    const base = { styleKey, styleNo: sortedRows[0].styleNo.trim(), rows: sortedRows, candidates }
    if (!candidates.length) return { ...base, status: "none", reason: "같은 Garment No. 요청 없음" }
    if (candidates.length > 1) return { ...base, status: "review", reason: `요청 후보 ${candidates.length}개` }
    const free = candidates[0].options.filter((option) => !option.lineId || !linked.has(option.lineId)).length
    return free === sortedRows.length
      ? { ...base, status: "auto", reason: "옵션 수 일치" }
      : { ...base, status: "review", reason: `요청 옵션 ${free}개 · DD 행 ${sortedRows.length}개` }
  }).sort((a, b) => rank[a.status] - rank[b.status] || a.styleNo.localeCompare(b.styleNo, "ko-KR", { numeric: true }))
}

export function ensureRequestLineIds(requests: readonly RequestStyle[]): { next: RequestStyle[]; changed: boolean } {
  let changed = false
  const next = requests.map((style) => {
    if (style.options.every((option) => option.lineId)) return style
    changed = true
    return {
      ...style,
      options: style.options.map((option) => option.lineId ? option : { ...option, lineId: crypto.randomUUID() }),
    }
  })
  return { next, changed }
}

export interface RequestCandidate {
  style: RequestStyle
  total: number
  unlinked: number
  exact: boolean
}

export function requestCandidates(
  requests: readonly RequestStyle[],
  records: readonly DevRecord[],
  styleNo: string,
  query: string,
  includeLinked: boolean,
): RequestCandidate[] {
  const linked = linkedLineIds(records)
  const needle = query.trim().toLocaleLowerCase("ko-KR")
  const styleKey = normalizeStyleKey(styleNo)
  return requests
    .filter((style) => !needle || [style.garmentNo, style.brand, style.chart, style.developer]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(needle)))
    .map((style) => ({
      style,
      total: style.options.length,
      unlinked: style.options.filter((option) => !option.lineId || !linked.has(option.lineId)).length,
      exact: Boolean(styleKey) && normalizeStyleKey(style.garmentNo) === styleKey,
    }))
    .filter((candidate) => includeLinked || candidate.unlinked > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact)
      || Date.parse(b.style.updatedAt) - Date.parse(a.style.updatedAt))
}

export function requestToIntakeRecords(style: RequestStyle, options: readonly RequestOption[]): DevRecord[] {
  return options.flatMap((option) => {
    if (!option.lineId) return []
    const record = createBlankDevRecord(style.developer)
    return [{
      ...record,
      styleNo: style.garmentNo,
      buyer: style.brand,
      owner: style.developer,
      planner: style.requester,
      color: option.color,
      dyeing: option.dyeingMethod,
      note: option.remark,
      construction: option.construction ?? "",
      weight: option.weight ?? "",
      tech: {
        ...record.tech,
        yarnDetail: option.yarnDetail,
        requestLink: { reqId: style.reqId, lineId: option.lineId },
      },
    }]
  })
}

export type RequestDdTone = "none" | "progress" | "late" | "received" | "done" | "hold" | "drop"

export interface RequestDdStatus {
  tone: RequestDdTone
  /** 화면 문구 */
  label: string
  /** 대표 DD 행 */
  record?: DevRecord
  rowId?: string
  /** 유효 FL#일 때만 */
  flNo?: string
  /** 같은 lineId에 연결된 DD 행이 2개 이상일 때 나머지 수 */
  extra: number
}

export function ddRecordsByLineId(records: readonly DevRecord[]): Map<string, DevRecord[]> {
  const byLine = new Map<string, DevRecord[]>()
  records.forEach((record) => {
    const lineId = record.tech?.requestLink?.lineId
    if (!lineId) return
    const group = byLine.get(lineId)
    if (group) group.push(record)
    else byLine.set(lineId, [record])
  })
  return byLine
}

const shortDate = (value: unknown): string => {
  const date = toDate(value)
  return date ? `${date.getMonth() + 1}/${date.getDate()}` : ""
}

/**
 * FABRIC REQUEST 옵션 줄에 보여 줄 DD 상태. 요청 쪽에는 저장하지 않고 매번 records에서 계산한다.
 * 화면 완료(유효 FL#)와 실물 도착(Received date)을 합치지 않는다. 완료여도 수취일이 있으면 함께 적는다.
 */
export function requestDdStatus(byLine: Map<string, DevRecord[]>, option: RequestOption, today = new Date()): RequestDdStatus {
  const rows = option.lineId ? byLine.get(option.lineId) ?? [] : []
  if (!rows.length) return { tone: "none", label: "미연결", extra: 0 }
  const record = rows.find((row) => isCompletedFlNo(row.flNo))
    ?? rows.find((row) => String(row.receivedDate ?? "").trim())
    ?? rows[0]
  const base = { record, rowId: rowIdOf(record), extra: rows.length - 1 }
  const status = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  if (status === "DROP" || status === "REJECT") return { ...base, tone: "drop", label: status }
  if (status === "HOLD" || status === "보류") return { ...base, tone: "hold", label: "HOLD" }
  const received = shortDate(record.receivedDate)
  if (isCompletedFlNo(record.flNo)) {
    return { ...base, tone: "done", label: received ? `완료 · 수취 ${received}` : "완료", flNo: String(record.flNo).replace(/\s+/g, "").toUpperCase() }
  }
  if (received) return { ...base, tone: "received", label: `원단 수취 ${received}` }
  const left = daysLeft(record.dueDate, today)
  const stage = record.stage || "접수"
  if (left !== null && left < 0) return { ...base, tone: "late", label: `지연 D+${Math.abs(left)} · ${stage}` }
  return { ...base, tone: "progress", label: `진행 · ${stage}` }
}
