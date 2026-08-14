import type {
  CompletedSample,
  DevRecord,
  FabricLedgerEvent,
  FabricLedgerOverride,
  FabricLedgerStatus,
} from "./schema"

export interface FabricLedgerOutbound {
  to: string
  qty: number
  date: string
}

export interface FabricLedgerItem {
  key: string
  styleNo: string
  flNo: string
  season: string
  category: string
  buyer: string
  owner: string
  planner: string
  construction: string
  weight: number | ""
  color: string
  dyeing: string
  requestDate: string
  dueDate: string
  completedAt: string
  status: FabricLedgerStatus
  storageNo: string
  sourceSheet: string
  updatedAt: string
  updatedBy: string
  note: string
  yds: number | null
  outbound: FabricLedgerOutbound[]
  outboundTotal: number
  balance: number | null
  record: DevRecord | null
  sample: CompletedSample | null
}

export const FABRIC_STATUS_META: Record<FabricLedgerStatus, { label: string; description: string; tone: string }> = {
  DEVELOPING: { label: "개발 진행", description: "DD에서 개발이 진행 중인 원단", tone: "bg-sky-500" },
  READY: { label: "입고 대기", description: "개발 완료 후 창고 입고를 기다리는 원단", tone: "bg-amber-500" },
  WAREHOUSE: { label: "창고 보관", description: "넘버링 후 창고에 보관 중인 원단", tone: "bg-emerald-500" },
  EXHAUSTED: { label: "소진 완료", description: "사용이 완료되어 재고가 없는 원단", tone: "bg-slate-500" },
  DISPOSED: { label: "폐기", description: "관리자 판단으로 폐기된 원단", tone: "bg-rose-500" },
}

const normalized = (value: string): string => value.normalize("NFKC").replace(/\s+/g, "").toUpperCase()

const validYds = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null

/** 보유 재고가 입력된 항목만 잔량 0 이하를 자동 소진으로 판정한다. */
export function isFabricBalanceExhausted(yds: number | null | undefined, outboundTotal: number): boolean {
  return yds !== null && yds !== undefined && Number.isFinite(yds) && yds - outboundTotal <= 0
}

export function fabricLedgerKey(flNo: string, styleNo: string, fallback = ""): string {
  const fl = normalized(flNo)
  if (fl) return `fl:${fl}`
  const style = normalized(styleNo)
  if (style) return `style:${style}`
  return `source:${fallback}`
}

function recordIdentity(record: DevRecord): string {
  return `${record._src.sheet}::${record._src.row}`
}

export function fabricRecordIdentity(record: DevRecord | null): string | undefined {
  return record ? recordIdentity(record) : undefined
}

function statusFromRecord(record: DevRecord): FabricLedgerStatus {
  const explicit = String(record.devStatus ?? "").trim().toLowerCase().replace(/\s+/g, "")
  if (/^(완료|done|complete|completed)$/.test(explicit) || Boolean(record.receivedDate)) return "READY"
  return "DEVELOPING"
}

export function statusFromSample(sample: CompletedSample): FabricLedgerStatus {
  const sheet = normalized(sample.sourceSheet ?? "")
  if (sheet.includes("폐기")) return "DISPOSED"
  if (sheet.includes("소진완료") || sheet.includes("소진")) return "EXHAUSTED"
  if (sheet.includes("창고보관") || sheet.includes("창고")) return "WAREHOUSE"
  if (sheet.includes("현황")) return "READY"
  return sample.completedAt ? "READY" : "DEVELOPING"
}

const statusRank: Record<FabricLedgerStatus, number> = {
  DEVELOPING: 0,
  READY: 1,
  WAREHOUSE: 2,
  EXHAUSTED: 3,
  DISPOSED: 4,
}

function emptyFromRecord(record: DevRecord): FabricLedgerItem {
  return {
    // FL 미입력 행은 동일 Style의 옵션을 합치지 않고 DD 원본 행 단위로 유지한다.
    key: record.flNo ? fabricLedgerKey(record.flNo, "", recordIdentity(record)) : `source:${recordIdentity(record)}`,
    styleNo: record.styleNo,
    flNo: record.flNo,
    season: record.season,
    category: record.category,
    buyer: record.buyer,
    owner: record.owner,
    planner: record.planner,
    construction: record.construction,
    weight: record.weight,
    color: record.color,
    dyeing: record.dyeing,
    requestDate: record.requestDate ?? "",
    dueDate: record.dueDate,
    completedAt: record.receivedDate ?? "",
    status: statusFromRecord(record),
    storageNo: "",
    sourceSheet: record._src.sheet,
    updatedAt: "",
    updatedBy: "",
    note: record.note,
    yds: null,
    outbound: [],
    outboundTotal: 0,
    balance: null,
    record,
    sample: null,
  }
}

function emptyFromSample(sample: CompletedSample, index: number): FabricLedgerItem {
  return {
    key: fabricLedgerKey(sample.flNo, sample.styleNo, `${sample.sourceSheet ?? "sample"}::${index}`),
    styleNo: sample.styleNo,
    flNo: sample.flNo,
    season: sample.season,
    category: sample.category,
    buyer: sample.buyer,
    owner: sample.owner,
    planner: "",
    construction: sample.construction,
    weight: sample.inhouse.weightGsm ?? "",
    color: "",
    dyeing: "",
    requestDate: sample.requestDate ?? "",
    dueDate: "",
    completedAt: sample.completedAt,
    status: statusFromSample(sample),
    storageNo: sample.storageNo ?? "",
    sourceSheet: sample.sourceSheet ?? "샘플 관리 대장",
    updatedAt: "",
    updatedBy: "",
    note: sample.process.remark,
    yds: null,
    outbound: [],
    outboundTotal: 0,
    balance: null,
    record: null,
    sample,
  }
}

function mergeSample(target: FabricLedgerItem, sample: CompletedSample): FabricLedgerItem {
  const sampleStatus = statusFromSample(sample)
  return {
    ...target,
    styleNo: target.styleNo || sample.styleNo,
    flNo: target.flNo || sample.flNo,
    season: target.season || sample.season,
    category: target.category || sample.category,
    buyer: target.buyer || sample.buyer,
    owner: target.owner || sample.owner,
    construction: target.construction || sample.construction,
    weight: target.weight || sample.inhouse.weightGsm || "",
    requestDate: target.requestDate || sample.requestDate || "",
    completedAt: target.completedAt || sample.completedAt,
    storageNo: target.storageNo || sample.storageNo || "",
    status: statusRank[sampleStatus] > statusRank[target.status] ? sampleStatus : target.status,
    sourceSheet: sample.sourceSheet || target.sourceSheet,
    note: target.note || sample.process.remark,
    sample: target.sample ?? sample,
  }
}

/** DD와 샘플관리대장을 FL 우선, Style 보조 키로 병합하고 웹 변경 상태를 마지막에 적용한다. */
export function buildFabricLedger(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  overrides: readonly FabricLedgerOverride[],
  fabricEvents: readonly FabricLedgerEvent[] = [],
): FabricLedgerItem[] {
  const items = new Map<string, FabricLedgerItem>()
  const styleIndex = new Map<string, string>()

  records.forEach((record) => {
    const item = emptyFromRecord(record)
    const existing = items.get(item.key)
    if (!existing) items.set(item.key, item)
    const style = normalized(record.styleNo)
    if (style && !styleIndex.has(style)) styleIndex.set(style, item.key)
  })

  samples.forEach((sample, index) => {
    const directKey = fabricLedgerKey(sample.flNo, sample.styleNo, `${sample.sourceSheet ?? "sample"}::${index}`)
    const styleKey = normalized(sample.styleNo)
    const matchedKey = items.has(directKey) ? directKey : styleIndex.get(styleKey) ?? directKey
    const existing = items.get(matchedKey)
    items.set(matchedKey, existing ? mergeSample(existing, sample) : emptyFromSample(sample, index))
    if (styleKey && !styleIndex.has(styleKey)) styleIndex.set(styleKey, matchedKey)
  })

  const overrideMap = new Map(overrides.map((item) => [item.key, item]))
  const outboundMap = new Map<string, FabricLedgerOutbound[]>()
  fabricEvents.forEach((event) => {
    if (event.action !== "OUTBOUND" || typeof event.qty !== "number" || !Number.isFinite(event.qty) || event.qty <= 0) return
    const current = outboundMap.get(event.fabricKey) ?? []
    current.push({ to: event.to?.trim() || "미입력", qty: event.qty, date: event.occurredAt })
    outboundMap.set(event.fabricKey, current)
  })

  return [...items.values()].map((item) => {
    const override = overrideMap.get(item.key)
    const yds = validYds(override?.yds)
    const outbound = (outboundMap.get(item.key) ?? []).sort((left, right) => right.date.localeCompare(left.date))
    const outboundTotal = outbound.reduce((sum, event) => sum + event.qty, 0)
    const balance = yds === null ? null : yds - outboundTotal
    const merged = override ? {
      ...item,
      status: override.status,
      storageNo: override.storageNo ?? item.storageNo,
      note: override.note ?? item.note,
      updatedAt: override.updatedAt,
      updatedBy: override.updatedBy,
    } : item
    return { ...merged, yds, outbound, outboundTotal, balance }
  }).sort((left, right) =>
    statusRank[left.status] - statusRank[right.status]
    || (right.updatedAt || right.completedAt || right.requestDate).localeCompare(left.updatedAt || left.completedAt || left.requestDate)
    || left.styleNo.localeCompare(right.styleNo, "ko-KR", { numeric: true }),
  )
}
