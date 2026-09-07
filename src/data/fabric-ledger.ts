import type {
  CompletedSample,
  DevRecord,
  FabricLedgerEvent,
  FabricLedgerOverride,
  FabricLedgerStatus,
} from "./schema"
import { WEB_INTAKE_SHEET } from "./schema"

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
  /**
   * 원단 상세가 쓰는 실무 값 묶음. DD tech와 대장 원문에서 끌어오고,
   * 대장 전용 행은 override.fields로 덮어쓴다. 키 목록은 FABRIC_FIELD_IDS다.
   */
  fields: Record<string, string>
}

/** 원단 상세에서 보고 고치는 값. 앞 15개는 원장 본문 필드, 뒤는 DD tech·대장 원문에서 온 실무 값이다. */
export const FABRIC_FIELD_IDS = [
  "styleNo", "flNo", "season", "category", "buyer", "owner", "planner",
  "construction", "weight", "color", "dyeing", "requestDate", "dueDate", "completedAt", "note",
  "yarnDetail", "millYarn", "millKnitting", "millDyeing", "millFinishing",
  "fds", "yds", "review", "passFail", "actualWidth", "actualWeight", "shrinkageLength", "shrinkageWidth",
] as const
export type FabricFieldId = (typeof FABRIC_FIELD_IDS)[number]

/** 원장 본문에 그대로 얹히는 필드. 나머지는 fields 안에만 산다. */
const CORE_FIELD_IDS = new Set<string>([
  "styleNo", "flNo", "season", "category", "buyer", "owner", "planner",
  "construction", "weight", "color", "dyeing", "requestDate", "dueDate", "completedAt", "note",
])

const numberText = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : ""

/** DD tech와 대장 원문에서 실무 값을 모은다. DD가 있으면 DD가 먼저다. */
function deriveFields(item: FabricLedgerItem): Record<string, string> {
  const tech = item.record?.tech
  const sample = item.sample
  const shrinkage = sample?.inhouse?.shrinkagePct
  const shrinkagePair = shrinkage && typeof shrinkage === "object" ? shrinkage : null
  const shrinkageFlat = typeof shrinkage === "number" ? shrinkage : null
  const mills = tech?.mills
  const ledgerMills = sample?.ledger?.mills
  return {
    yarnDetail: tech?.yarnDetail || sample?.ledger?.yarnDetail || "",
    // 대장의 sample.process는 공정 Status(완료일)다. 업체명이 아니므로 여기에 쓰지 않는다.
    // 대장 업체명은 ledger.mills에 들어 있다.
    millYarn: mills?.yarn || ledgerMills?.yarn || "",
    millKnitting: mills?.knitting || ledgerMills?.knitting || "",
    millDyeing: mills?.dyeing || ledgerMills?.dyeing || "",
    millFinishing: mills?.finishing || ledgerMills?.finishing || "",
    fds: tech?.sampleDates?.fds || "",
    yds: tech?.sampleDates?.yds || "",
    review: tech?.review || "",
    passFail: tech?.passFail || "",
    actualWidth: numberText(tech?.actual?.width ?? sample?.inhouse?.widthCm),
    actualWeight: numberText(tech?.actual?.weight ?? sample?.inhouse?.weightGsm),
    shrinkageLength: numberText(tech?.actual?.shrinkageLength ?? shrinkagePair?.length ?? shrinkageFlat),
    shrinkageWidth: numberText(tech?.actual?.shrinkageWidth ?? shrinkagePair?.width),
  }
}

/** override.fields의 원장 본문 필드를 항목에 얹는다. 대장 전용 행의 수정본이 목록에도 보이게 한다. */
function applyCoreFieldOverrides(item: FabricLedgerItem, patch: Record<string, string>): FabricLedgerItem {
  const next: Record<string, unknown> = { ...item }
  Object.entries(patch).forEach(([id, value]) => {
    if (!CORE_FIELD_IDS.has(id)) return
    if (id === "weight") {
      const parsed = Number(value)
      next.weight = value.trim() && Number.isFinite(parsed) ? parsed : ""
      return
    }
    next[id] = value
  })
  return next as unknown as FabricLedgerItem
}

export const FABRIC_STATUS_META: Record<FabricLedgerStatus, { label: string; description: string; tone: string }> = {
  DEVELOPING: { label: "개발 진행", description: "DD에서 개발이 진행 중인 원단", tone: "bg-sky-500" },
  READY: { label: "입고 대기", description: "개발 완료 후 창고 입고를 기다리는 원단", tone: "bg-amber-500" },
  WAREHOUSE: { label: "창고 보관", description: "넘버링 후 창고에 보관 중인 원단", tone: "bg-emerald-500" },
  EXHAUSTED: { label: "소진 완료", description: "사용이 완료되어 재고가 없는 원단", tone: "bg-slate-500" },
  DISPOSED: { label: "폐기", description: "관리자 판단으로 폐기된 원단", tone: "bg-rose-500" },
  REMOVED: { label: "삭제됨", description: "창고 목록에서 숨긴 원단", tone: "bg-slate-400" },
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

/**
 * FL이 없는 DD 행의 원장 key.
 * Style No.로 묶으면 옵션이 다른 별개 원단이 한 항목에 뭉쳐 뒤 행이 통째로 사라진다.
 * 행 번호를 쓰지 않아 DD를 다시 올려 행이 밀려도 같은 항목을 가리킨다.
 */
function ddRowBaseKey(record: DevRecord): string {
  const values = [
    record.owner,
    record.styleNo,
    record.season,
    record.color,
    record.construction,
    String(record.weight ?? ""),
    record.dyeing,
    record.opt,
  ].map(normalized)
  return `dd:${values.map((value) => `${value.length}:${value}`).join("|")}`
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
  // 입고 대기는 DD MASTER 내 YDS 날짜만 만든다(statusFromRecord).
  // 대장 '현황' 시트 행은 여기로 올리지 않는다. 창고에서 직접 추가한 행만 예외다.
  if (sample.sourceSheet === WEB_INTAKE_SHEET) return "READY"
  return "DEVELOPING"
}

const statusRank: Record<FabricLedgerStatus, number> = {
  DEVELOPING: 0,
  READY: 1,
  WAREHOUSE: 2,
  EXHAUSTED: 3,
  DISPOSED: 4,
  REMOVED: 5,
}

/** 직접 등록 행은 배열 위치가 아니라 자기 id로 식별한다. 대장을 다시 올려 행 인덱스가 바뀌어도 기존 기록을 찾는다. */
function sampleFallback(sample: CompletedSample, index: number): string {
  return sample.sourceSheet === WEB_INTAKE_SHEET && sample.id ? sample.id : `${sample.sourceSheet ?? "sample"}::${index}`
}

function emptyFromRecord(record: DevRecord, key: string): FabricLedgerItem {
  return {
    key,
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
    fields: {},
  }
}

function emptyFromSample(sample: CompletedSample, index: number): FabricLedgerItem {
  return {
    key: fabricLedgerKey(sample.flNo, sample.styleNo, sampleFallback(sample, index), sample.storageNo ?? ""),
    styleNo: sample.styleNo,
    flNo: sample.flNo,
    season: sample.season,
    category: sample.category,
    buyer: sample.buyer,
    owner: sample.owner,
    planner: sample.ledger?.planner ?? "",
    construction: sample.construction,
    weight: sample.inhouse.weightGsm ?? "",
    color: sample.ledger?.color ?? "",
    dyeing: sample.ledger?.dyeingSide ?? "",
    requestDate: sample.requestDate ?? "",
    dueDate: sample.ledger?.dueDate ?? "",
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
    fields: {},
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

/**
 * 창고는 샘플관리대장 미러다. 대장 값이 기준이고 DD는 대장 칸이 비었을 때만 채운다.
 * buildFabricLedger가 target에 record가 없을 때만 이 함수를 부른다. 즉 target은 항상 대장에 먼저 존재한 행이다.
 * Style/#은 DD의 'Style No.'(record.styleNo)가 아니다. 그 칸에는 원본 FL이 들어 있어
 * 그대로 쓰면 Style 자리에 FL 번호가 보인다. 대장 Style/#에 대응하는 DD 값은 'GD#/SA#'(gdNo, saNo)다.
 */
function mergeRecord(target: FabricLedgerItem, record: DevRecord): FabricLedgerItem {
  const recordStatus = statusFromRecord(record)
  return {
    ...target,
    styleNo: target.styleNo || record.gdNo || record.saNo,
    flNo: target.flNo || record.flNo,
    season: target.season || record.season,
    category: target.category || record.category,
    buyer: target.buyer || record.buyer,
    owner: target.owner || record.owner,
    planner: target.planner || record.planner,
    construction: target.construction || record.construction,
    weight: target.weight || record.weight,
    color: target.color || record.color,
    dyeing: target.dyeing || record.dyeing,
    requestDate: target.requestDate || record.requestDate || "",
    dueDate: target.dueDate || record.dueDate,
    completedAt: target.completedAt || record.receivedDate || "",
    status: statusRank[recordStatus] > statusRank[target.status] ? recordStatus : target.status,
    note: target.note || record.note,
    record: target.record ?? record,
  }
}

/** R&D No.를 실물 식별자로 우선해 DD와 샘플관리대장을 병합하고 웹 변경 상태를 마지막에 적용한다. */
export function buildFabricLedger(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  overrides: readonly FabricLedgerOverride[],
  fabricEvents: readonly FabricLedgerEvent[] = [],
  /** 목록에서 숨긴(REMOVED) 항목까지 돌려준다. 숨김 기록을 정리하거나 되살릴 때만 쓴다. */
  options: { includeRemoved?: boolean } = {},
): FabricLedgerItem[] {
  const items = new Map<string, FabricLedgerItem>()
  const identityIndex = new Map<string, string>()
  const closedHistoryKeyCounts = new Map<string, number>()
  const ddRowKeyCounts = new Map<string, number>()

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

    const fallback = sampleFallback(sample, index)
    const storageNo = sample.storageNo ?? ""
    const matchedKey = resolveKey(storageNo, sample.flNo, sample.styleNo, fallback)
    const existing = items.get(matchedKey)
    const item = existing ? mergeSample(existing, sample, index) : emptyFromSample(sample, index)
    items.set(matchedKey, item)
    // R&D No.가 key여도 FL을 함께 등록해야 뒤의 DD 레코드가 같은 항목을 찾는다.
    registerIdentities(item, [
      ...fabricIdentities(storageNo, sample.flNo, sample.styleNo),
      `source:${sample.sourceSheet ?? "sample"}::${index}`,
    ])
  })

  records.forEach((record) => {
    const fallback = recordIdentity(record)
    // DD의 'Style No.'는 대장의 Style/#과 뜻이 다르고 원본 FL이 들어 있어 보조 식별자로 쓰면 다른 행에 붙는다.
    // 그래서 DD 레코드는 FL로만 대장에 붙인다. FL이 없는 행은 각자 한 항목이며 서로 묶이지 않는다.
    let matchedKey: string
    if (normalized(record.flNo)) {
      matchedKey = resolveKey("", record.flNo, "", fallback)
    } else {
      const baseKey = ddRowBaseKey(record)
      // 값이 완전히 같은 행이 겹칠 때만 #2부터 순번을 붙여 모든 행을 보존한다.
      const occurrence = (ddRowKeyCounts.get(baseKey) ?? 0) + 1
      ddRowKeyCounts.set(baseKey, occurrence)
      matchedKey = occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`
    }
    const existing = items.get(matchedKey)
    const item = existing ? (existing.record ? existing : mergeRecord(existing, record)) : emptyFromRecord(record, matchedKey)
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
  // 재고는 시간 순으로 쌓아야 하므로 오래된 기록부터 훑는다.
  // 배열 순서를 쓰면 안 된다. 팀 공유 병합이 새 기록을 배열 끝으로 보내 최신 기록이 가장 오래된 것으로 뒤집힌다.
  // 출고 날짜는 사용자가 과거로 고를 수 있으므로 표시용 occurredAt이 아니라 기록 시각을 기준으로 한다.
  const eventOrder = (event: FabricLedgerEvent): string => event.recordedAt || event.occurredAt
  ;[...fabricEvents].sort((left, right) => eventOrder(left).localeCompare(eventOrder(right))).forEach((event) => {
    const itemKey = resolveStoredKey(event.fabricKey)
    if (!itemKey) return
    // 입고 대기로 되돌리면 그 원단의 재고 기간이 끝난다. 다음 입고부터 다시 센다.
    // 기록 자체는 지우지 않으므로 원단 상세의 이력에는 그대로 남는다.
    if (event.action === "UNRECEIVE") {
      outboundMap.delete(itemKey)
      intakeMap.delete(itemKey)
    }
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
    // 대장 전용 행은 상세에서 고친 값이 override.fields에 쌓인다. 본문 필드에 얹고 실무 값도 덮어쓴다.
    const patched = override?.fields ? applyCoreFieldOverrides(merged, override.fields) : merged
    const stocked = { ...patched, yds, outbound, outboundTotal, balance, intakeAt, confirmedAt, lastMovedAt, lastOutbound }
    return { ...stocked, fields: { ...deriveFields(stocked), ...(override?.fields ?? {}) } }
  }).filter((item) => options.includeRemoved || item.status !== "REMOVED").sort((left, right) => {
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
