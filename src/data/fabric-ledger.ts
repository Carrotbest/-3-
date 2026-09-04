import type {
  CompletedSample,
  DevRecord,
  FabricLedgerEvent,
  FabricLedgerOverride,
  FabricLedgerStatus,
} from "./schema"

export interface FabricLedgerOutbound {
  to: string
  division?: string
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
  intakeAt: string
  /** 창고팀이 실물을 확인한 시각. 대장에서 셀을 회색으로 칠하던 표시를 기록으로 남긴 것이다. */
  confirmedAt: string
  lastMovedAt: string
  lastOutbound: FabricLedgerOutbound | null
  sourceOrder: number | null
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

export function fabricLedgerKey(flNo: string, styleNo: string, fallback = "", storageNo = ""): string {
  const storage = normalized(storageNo)
  if (storage) return `rnd:${storage}`
  const fl = normalized(flNo)
  if (fl) return `fl:${fl}`
  const style = normalized(styleNo)
  if (style) return `style:${style}`
  return `source:${fallback}`
}

function fabricIdentities(storageNo: string, flNo: string, styleNo: string): string[] {
  const identities: string[] = []
  const storage = normalized(storageNo)
  const fl = normalized(flNo)
  const style = normalized(styleNo)
  if (storage) identities.push(`rnd:${storage}`)
  if (fl) identities.push(`fl:${fl}`)
  if (style) identities.push(`style:${style}`)
  return identities
}

function isClosedHistorySample(sample: CompletedSample): boolean {
  const sheet = normalized(sample.sourceSheet ?? "")
  return sheet.includes("소진완료") || sheet.includes("폐기")
}

function closedHistoryBaseKey(sample: CompletedSample): string {
  const values = [
    sample.sourceSheet ?? "",
    sample.storageNo ?? "",
    sample.flNo,
    sample.styleNo,
    sample.season,
    sample.buyer,
  ].map(normalized)
  return `history:${values.map((value) => `${value.length}:${value}`).join("|")}`
}

function recordIdentity(record: DevRecord): string {
  return `${record._src.sheet}::${record._src.row}`
}

export function fabricRecordIdentity(record: DevRecord | null): string | undefined {
  return record ? recordIdentity(record) : undefined
}

function statusFromRecord(record: DevRecord): FabricLedgerStatus {
  return String(record.tech?.sampleDates?.yds ?? "").trim() ? "READY" : "DEVELOPING"
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
    key: fabricLedgerKey(record.flNo, record.styleNo, recordIdentity(record)),
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
    intakeAt: "",
    confirmedAt: "",
    lastMovedAt: "",
    lastOutbound: null,
    sourceOrder: null,
    record,
    sample: null,
  }
}

function emptyFromSample(sample: CompletedSample, index: number): FabricLedgerItem {
  return {
    key: fabricLedgerKey(sample.flNo, sample.styleNo, `${sample.sourceSheet ?? "sample"}::${index}`, sample.storageNo ?? ""),
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
    intakeAt: "",
    confirmedAt: "",
    lastMovedAt: "",
    lastOutbound: null,
    sourceOrder: index,
    record: null,
    sample,
  }
}

function mergeSample(target: FabricLedgerItem, sample: CompletedSample, index: number): FabricLedgerItem {
  const sampleStatus = statusFromSample(sample)
  const statusUpgrades = statusRank[sampleStatus] > statusRank[target.status]
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
    status: statusUpgrades ? sampleStatus : target.status,
    sourceSheet: sample.sourceSheet || target.sourceSheet,
    note: target.note || sample.process.remark,
    // 항목은 자기가 표시되는 시트의 자리에 앉아야 한다. 상태가 올라가면 그 행의 순서를 따라간다.
    // 그러지 않으면 현황과 창고보관에 같은 R&D No.로 걸친 건이 창고보관 맨 앞으로 튀어 오른다.
    sourceOrder: statusUpgrades ? index : target.sourceOrder ?? index,
    sample: target.sample ?? sample,
  }
}

function mergeRecord(target: FabricLedgerItem, record: DevRecord): FabricLedgerItem {
  const recordStatus = statusFromRecord(record)
  return {
    ...target,
    styleNo: record.styleNo || target.styleNo,
    flNo: record.flNo || target.flNo,
    season: record.season || target.season,
    category: record.category || target.category,
    buyer: record.buyer || target.buyer,
    owner: record.owner || target.owner,
    planner: record.planner || target.planner,
    construction: record.construction || target.construction,
    weight: record.weight || target.weight,
    color: record.color || target.color,
    dyeing: record.dyeing || target.dyeing,
    requestDate: record.requestDate || target.requestDate,
    dueDate: record.dueDate || target.dueDate,
    completedAt: record.receivedDate || target.completedAt,
    status: statusRank[recordStatus] > statusRank[target.status] ? recordStatus : target.status,
    note: record.note || target.note,
    record: target.record ?? record,
  }
}

/** R&D No.를 실물 식별자로 우선해 DD와 샘플관리대장을 병합하고 웹 변경 상태를 마지막에 적용한다. */
export function buildFabricLedger(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  overrides: readonly FabricLedgerOverride[],
  fabricEvents: readonly FabricLedgerEvent[] = [],
): FabricLedgerItem[] {
  const items = new Map<string, FabricLedgerItem>()
  const identityIndex = new Map<string, string>()
  const closedHistoryKeyCounts = new Map<string, number>()

  const registerIdentities = (item: FabricLedgerItem, rowIdentities: readonly string[]) => {
    fabricIdentities(item.storageNo, item.flNo, item.styleNo).concat(rowIdentities).forEach((identity) => {
      if (!identityIndex.has(identity)) identityIndex.set(identity, item.key)
    })
  }

  const resolveKey = (storageNo: string, flNo: string, styleNo: string, fallback: string): string => {
    const directKey = fabricLedgerKey(flNo, styleNo, fallback, storageNo)
    const directMatch = identityIndex.get(directKey)
    if (directMatch) return directMatch

    // R&D No.가 있는 행은 같은 FL이나 Style의 다른 실물에 흡수하지 않는다.
    if (normalized(storageNo)) return directKey

    const fl = normalized(flNo)
    const style = normalized(styleNo)
    return (fl ? identityIndex.get(`fl:${fl}`) : undefined)
      ?? (style ? identityIndex.get(`style:${style}`) : undefined)
      ?? directKey
  }

  samples.forEach((sample, index) => {
    if (isClosedHistorySample(sample)) {
      const baseKey = closedHistoryBaseKey(sample)
      const occurrence = (closedHistoryKeyCounts.get(baseKey) ?? 0) + 1
      closedHistoryKeyCounts.set(baseKey, occurrence)
      // 같은 값 조합이 겹칠 때만 #2부터 순번을 붙여, 행 이동에는 안정적이면서 모든 행을 보존한다.
      const historyKey = occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`
      const item = { ...emptyFromSample(sample, index), key: historyKey, sourceOrder: index }
      items.set(historyKey, item)
      // 종료 이력은 다른 항목과 병합되지 않도록 완성된 자기 key만 등록하고 FL/Style은 색인하지 않는다.
      identityIndex.set(historyKey, historyKey)
      return
    }

    const fallback = `${sample.sourceSheet ?? "sample"}::${index}`
    const storageNo = sample.storageNo ?? ""
    const matchedKey = resolveKey(storageNo, sample.flNo, sample.styleNo, fallback)
    const existing = items.get(matchedKey)
    const item = existing ? mergeSample(existing, sample, index) : emptyFromSample(sample, index)
    items.set(matchedKey, item)
    // R&D No.가 key여도 FL을 함께 등록해야 뒤의 DD 레코드가 같은 항목을 찾는다.
    registerIdentities(item, fabricIdentities(storageNo, sample.flNo, sample.styleNo))
  })

  records.forEach((record) => {
    const fallback = recordIdentity(record)
    const matchedKey = resolveKey("", record.flNo, record.styleNo, fallback)
    const existing = items.get(matchedKey)
    const item = existing ? (existing.record ? existing : mergeRecord(existing, record)) : emptyFromRecord(record)
    items.set(matchedKey, item)
    registerIdentities(item, fabricIdentities("", record.flNo, record.styleNo))
  })

  // 현재 key가 아니면 예전 fl:/style: key를 색인으로 해석해 기존 웹 기록을 이어 붙인다.
  const resolveStoredKey = (key: string): string | undefined => items.has(key) ? key : identityIndex.get(key)
  const overrideMap = new Map<string, FabricLedgerOverride>()
  overrides.forEach((override) => {
    const itemKey = resolveStoredKey(override.key)
    if (itemKey) overrideMap.set(itemKey, override)
  })
  const outboundMap = new Map<string, FabricLedgerOutbound[]>()
  const intakeMap = new Map<string, string>()
  const confirmMap = new Map<string, string>()
  fabricEvents.forEach((event) => {
    const itemKey = resolveStoredKey(event.fabricKey)
    if (!itemKey) return
    if (event.action === "RECEIVE") {
      const previous = intakeMap.get(itemKey) ?? ""
      if (event.occurredAt > previous) intakeMap.set(itemKey, event.occurredAt)
    }
    if (event.action === "CONFIRM") {
      const previous = confirmMap.get(itemKey) ?? ""
      if (event.occurredAt > previous) confirmMap.set(itemKey, event.occurredAt)
    }
    // 창고를 떠나거나 되돌아오면 실물 확인은 무효가 된다. 다시 확인받아야 한다.
    if (event.action === "RESTORE" || event.action === "DISPOSE" || event.action === "EXHAUST" || event.action === "UNRECEIVE") confirmMap.delete(itemKey)
    if (event.action !== "OUTBOUND" || typeof event.qty !== "number" || !Number.isFinite(event.qty) || event.qty <= 0) return
    const current = outboundMap.get(itemKey) ?? []
    current.push({ to: event.to?.trim() || "미입력", division: event.division?.trim() || undefined, qty: event.qty, date: event.occurredAt })
    outboundMap.set(itemKey, current)
  })

  return [...items.values()].map((item) => {
    const override = overrideMap.get(item.key)
    const yds = validYds(override?.yds)
    const outbound = (outboundMap.get(item.key) ?? []).sort((left, right) => right.date.localeCompare(left.date))
    const outboundTotal = outbound.reduce((sum, event) => sum + event.qty, 0)
    const balance = yds === null ? null : yds - outboundTotal
    const intakeAt = intakeMap.get(item.key) ?? ""
    const confirmedAt = confirmMap.get(item.key) ?? ""
    const lastOutbound = outbound[0] ?? null
    // 반출이 없으면 입고일로, 입고 이력도 없으면 빈 문자열로 유지한다.
    const lastMovedAt = lastOutbound?.date ?? intakeAt
    const merged = override ? {
      ...item,
      status: override.status,
      storageNo: override.storageNo ?? item.storageNo,
      note: override.note ?? item.note,
      updatedAt: override.updatedAt,
      updatedBy: override.updatedBy,
    } : item
    return { ...merged, yds, outbound, outboundTotal, balance, intakeAt, confirmedAt, lastMovedAt, lastOutbound }
  }).sort((left, right) => {
    const statusComparison = statusRank[left.status] - statusRank[right.status]
    if (statusComparison) return statusComparison

    if (left.sourceOrder !== null || right.sourceOrder !== null) {
      if (left.sourceOrder === null) return 1
      if (right.sourceOrder === null) return -1
      const sourceOrderComparison = left.sourceOrder - right.sourceOrder
      if (sourceOrderComparison) return sourceOrderComparison
    } else {
      const leftDate = left.updatedAt || left.completedAt || left.requestDate
      const rightDate = right.updatedAt || right.completedAt || right.requestDate
      const dateComparison = leftDate.localeCompare(rightDate)
      if (dateComparison) return dateComparison
    }

    return left.styleNo.localeCompare(right.styleNo, "ko-KR", { numeric: true })
  })
}
