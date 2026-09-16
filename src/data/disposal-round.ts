import { isCompletedFlNo } from "./dd-workflow"
import { STORAGE_NO_MAX, storageNumberOf, warehouseOrderKey, type FabricLedgerItem } from "./fabric-ledger"
import type { DisposalItem, DisposalRound, DisposalRoundEvent, FabricLedgerStatus } from "./schema"

const disposalStorageNumber = (item: DisposalItem): number | null => {
  const matched = item.storageNo.trim().match(/^\d{1,4}(?!\d)/)?.[0]
  return matched ? Number(matched) : null
}

export interface DisposalActor { email: string; name: string }

export function disposalEvent(
  actor: DisposalActor,
  action: DisposalRoundEvent["action"],
  fields: Partial<Omit<DisposalRoundEvent, "at" | "by" | "name" | "action">> = {},
  now = new Date().toISOString(),
): DisposalRoundEvent {
  return { at: now, by: actor.email, name: actor.name, action, ...fields }
}

export function buildDisposalItems(
  ledger: readonly FabricLedgerItem[],
  rangeFrom: number,
  rangeTo: number,
  sequenceStart: number,
): DisposalItem[] {
  const keyOf = (number: number) => number >= sequenceStart ? number - sequenceStart : number - sequenceStart + STORAGE_NO_MAX
  const lo = keyOf(rangeFrom)
  const hi = keyOf(rangeTo)
  const inRange = (key: number) => lo <= hi ? key >= lo && key <= hi : key >= lo || key <= hi
  const candidates = ledger
    .filter((item) => item.status === "WAREHOUSE" && storageNumberOf(item) !== null && inRange(keyOf(storageNumberOf(item)!)))
    .sort((left, right) => warehouseOrderKey(left, sequenceStart) - warehouseOrderKey(right, sequenceStart))
  const seen = new Set<string>()
  return candidates.map((item) => {
    const normalizedFl = item.flNo.replace(/\s/g, "").toUpperCase()
    let excluded: DisposalItem["excluded"]
    if (!isCompletedFlNo(item.flNo)) excluded = "FL 미기입"
    else if (seen.has(normalizedFl)) excluded = "FL 중복"
    else seen.add(normalizedFl)
    return {
      fabricKey: item.key,
      storageNo: item.storageNo,
      flNo: item.flNo,
      styleNo: item.styleNo,
      buyer: item.buyer,
      requester: item.planner,
      developer: item.owner,
      yarnDetail: item.fields?.yarnDetail ?? "",
      construction: item.construction,
      rackNo: item.rackNo,
      ...(excluded ? { excluded } : {}),
    }
  })
}

export const isActiveItem = (item: DisposalItem): boolean => !item.excluded || item.included === true

export type DisposalVerdict = "보관" | "폐기" | "컷팅"
export const isKept = (item: DisposalItem): boolean => item.keep ?? (item.firstPass === "보관" || item.teamKeep === true || item.decision === "keeping")
export const isCut = (item: DisposalItem): boolean => !isKept(item) && (item.swatchLow === true || (item.keep === undefined && item.decision === "컷팅"))
export const itemVerdict = (item: DisposalItem): DisposalVerdict => isKept(item) ? "보관" : isCut(item) ? "컷팅" : "폐기"

/** 최종 확정에서 창고를 떠나는 건. 보관만 창고에 남고 폐기·컷팅은 이력으로 간다. */
export const isFinalDispose = (item: DisposalItem): boolean => isActiveItem(item) && !isKept(item)

/** 폐기 사유. 창고 개별 폐기와 라운드 최종 확정이 같은 목록을 쓴다. */
export const DISPOSAL_REASONS = ["용량 초과", "품질 불량", "개발 중단"] as const
export type DisposalReason = (typeof DISPOSAL_REASONS)[number]

/** 최종 확정에서 이력으로 옮길 한 건. 창고 저장 함수에 그대로 넘긴다. */
export interface DisposalCompletionEntry {
  key: string
  storageNo: string
  fromStatus: FabricLedgerStatus
  note: string
}

export function parseMeetingPickup(text: string): { meeting: number | ""; pickup: number | "" } | null {
  const value = text.trim()
  if (!value) return { meeting: "", pickup: "" }
  const matched = value.match(/^\s*(\d*)\s*(?:\/\s*(\d*)\s*)?$/)
  if (!matched || (!matched[1] && matched[2] === undefined)) return null
  return { meeting: matched[1] ? Number(matched[1]) : "", pickup: matched[2] ? Number(matched[2]) : "" }
}

export function formatMeetingPickup(item: Pick<DisposalItem, "meeting" | "pickup">): string {
  if (item.meeting === "" && item.pickup === "") return ""
  if (item.meeting === undefined && item.pickup === undefined) return ""
  return `${item.meeting ?? ""}/${item.pickup ?? ""}`
}

export const normalizeFl = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toUpperCase()

export interface DisposalSummary {
  received: number
  excluded: number
  keeping: number
  cut: number
  dispose: number
  finalDispose: number
}

export function disposalSummary(round: DisposalRound): DisposalSummary {
  const summary: DisposalSummary = { received: round.items.length, excluded: 0, keeping: 0, cut: 0, dispose: 0, finalDispose: 0 }
  round.items.forEach((item) => {
    if (!isActiveItem(item)) { summary.excluded += 1; return }
    if (isKept(item)) summary.keeping += 1
    else if (isCut(item)) summary.cut += 1
    else summary.dispose += 1
  })
  summary.finalDispose = summary.cut + summary.dispose
  return summary
}

export type DisposalMarkTarget = "보관" | "Cutting"

export function applyListMarks(round: DisposalRound, text: string, target: DisposalMarkTarget): { round: DisposalRound; matched: number; unmatched: string[] } {
  const tokens = text.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean)
  const matchedKeys = new Set<string>()
  const unmatched: string[] = []
  tokens.forEach((token) => {
    const numeric = /^\d+$/.test(token) ? Number(token) : null
    const normalized = token.replace(/\s/g, "").toUpperCase()
    const item = round.items.find((candidate) => numeric !== null
      ? disposalStorageNumber(candidate) === numeric
      : normalized.startsWith("FL") && candidate.flNo.replace(/\s/g, "").toUpperCase() === normalized)
    if (item) matchedKeys.add(item.fabricKey)
    else unmatched.push(token)
  })
  const items = round.items.map((item) => {
    if (!matchedKeys.has(item.fabricKey)) return item
    if (target === "보관") return { ...item, keep: true }
    return { ...item, swatchLow: true }
  })
  return { round: { ...round, items }, matched: matchedKeys.size, unmatched }
}

export function lastRoundDecision(rounds: readonly DisposalRound[], fabricKey: string, exceptRoundId: string): DisposalVerdict | undefined {
  const past = rounds
    .filter((round) => round.roundId !== exceptRoundId && (round.status === "완료" || round.status === "창고 전달"))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  for (const round of past) {
    const item = round.items.find((candidate) => candidate.fabricKey === fabricKey)
    if (item) return itemVerdict(item)
  }
  return undefined
}

export function applyRddaUsage(round: DisposalRound, byFl: Map<string, { meeting: number; pickup: number }>): { round: DisposalRound; matched: number } {
  let matched = 0
  const items = round.items.map((item) => {
    const usage = byFl.get(normalizeFl(item.flNo))
    if (!usage) return item
    matched += 1
    return { ...item, ...usage }
  })
  return { round: { ...round, items }, matched }
}

export function applyKeepList(round: DisposalRound, fls: readonly string[]): { round: DisposalRound; matched: number; unmatchedFl: string[] } {
  const wanted = new Set(fls.map(normalizeFl))
  const found = new Set<string>()
  let matched = 0
  const items = round.items.map((item) => {
    const fl = normalizeFl(item.flNo)
    if (!isActiveItem(item) || !wanted.has(fl)) return item
    found.add(fl)
    matched += 1
    return { ...item, keep: true }
  })
  return { round: { ...round, items }, matched, unmatchedFl: [...wanted].filter((fl) => !found.has(fl)) }
}

export async function buildDisposalWorkbook(round: DisposalRound, kind: "rdda" | "final"): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  const active = round.items.filter(isActiveItem)
  const summary = disposalSummary(round)
  const sheet = workbook.addWorksheet(kind === "rdda" ? "RDDA 목록" : "폐기 리스트")
  if (kind === "rdda") {
    sheet.addRow(["R&D No.", "FL#", "Requester", "Developer", "Yarn Detail", "Cons.", "Rack No."])
    active.forEach((item) => sheet.addRow([disposalStorageNumber(item), item.flNo, item.requester ?? "", item.developer ?? "", item.yarnDetail ?? "", item.construction ?? "", item.rackNo ?? ""]))
  } else {
    sheet.addRow([])
    sheet.addRow([`R&D Number (${active.length})`, `FL# (${active.length})`, `keeping(${summary.keeping})`, `폐기 원단(${summary.finalDispose})`, `cutting(${summary.cut})`, "Rack No."])
    active.forEach((item) => {
      sheet.addRow([disposalStorageNumber(item), item.flNo, isKept(item) ? "o" : "", isKept(item) ? "" : item.flNo, isCut(item) ? "o" : "", item.rackNo ?? ""])
    })
  }
  const headerRow = kind === "rdda" ? 1 : 2
  sheet.getRow(headerRow).font = { bold: true }
  sheet.columns.forEach((column, index) => { column.width = index < 2 ? 16 : 14 })
  sheet.eachRow((row) => row.eachCell((cell) => { cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } } }))
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function disposalWorkbookFileName(round: DisposalRound, kind: "rdda" | "final"): string {
  return `폐기라운드_${round.title.trim().replace(/\s+/g, "_")}_${kind === "rdda" ? "RDDA목록" : "최종"}.xlsx`
}
