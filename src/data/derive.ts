/* derive.ts — 파생 집계
   화면에서 숫자를 다시 계산하지 않도록, 집계는 전부 여기서 한 번만 한다. */

import { daysLeft, normalizeSeason, toDate } from "./format"
import {
  CATEGORIES,
  httpsMaterialLink,
  MEMBERS,
  type DevRecord,
  type CompletedSample,
  type DevRecordFieldKey,
  type FabricAnalysisRow,
  type MaterialItem,
  type MaterialKind,
  type StudyRecord,
  type StatusKey,
} from "./schema"

export interface KpiSummary {
  total: number
  progress: number
  done: number
  late: number
  dueSoon: number
}

export interface SubpageCardStats {
  total: number
  progress: number
  due: number
  late: number
  categoryMix: Array<{ label: string; count: number; pct: number }>
  processMix: Array<{ key: string; label: string; count: number; pct: number }>
  dueBuckets: Array<{ label: string; count: number }>
  lateBuckets: Array<{ label: string; count: number }>
}

export interface LeadTimelineRow {
  record: DevRecord
  start: string
  end: string
  offsetPct: number
  widthPct: number
  progressPct: number
  state: "progress" | "due" | "late" | "done"
}

export const BOARD_STAGES = [
  { key: "yarn", label: "원사" },
  { key: "knit", label: "편직" },
  { key: "dye", label: "염색" },
  { key: "finish", label: "가공" },
  { key: "done", label: "완료" },
] as const

export type LaneUrgency = "normal" | "soon" | "danger" | "done"

/** 레인 셀 하나 = 같은 담당자·같은 공정에 있는 스타일 1개(OPT 묶음). */
export interface LaneStyleGroup {
  styleNo: string
  opts: string[]
  records: DevRecord[]
  urgency: LaneUrgency
  dayOffset: number | null
}

export interface LaneCell {
  stageKey: string
  groups: LaneStyleGroup[]
  count: number
  urgency: LaneUrgency
}

export interface LaneRow {
  owner: string
  cells: LaneCell[]
  total: number
}

export interface OwnerLaneBoard {
  rows: LaneRow[]
  stageTotals: number[]
  total: number
  /** 히트맵 농도 산출용 — 셀 count 최댓값 */
  maxCell: number
}

export interface CompletedLibraryItem {
  key: string
  styleNo: string
  flNo: string
  season: string
  category: string
  owner: string
  construction: string
  completedAt: string
  source: "DD" | "대장"
  record: DevRecord | null
  sample: CompletedSample | null
}

export interface CountDatum {
  label: string | number
  count: number
}

export interface DerivedTask extends DevRecord {
  _status: StatusKey
  _days: number | null
}

export interface DataAnomaly {
  type: string
  tone: "warn" | "crit"
  count: number
  samples: Array<Record<string, string>>
}

export interface WeeklyTsRow {
  state: string
}

export type DevType = "GD" | "국내"

export interface DevTypeSummary {
  total: number
  gd: number
  dom: number
  gdPct: number
  domPct: number
}

export interface ReceiptSummary {
  total: number
  received: number
  missing: number
  receivedPct: number
}

export type ProcessFunnelKey = "yarn" | "knitting" | "dyeing" | "finishing"

export interface ProcessFunnelDatum {
  key: ProcessFunnelKey
  label: string
  done: number
  total: number
  pct: number
}

export type OwnerProcessKey = "unreceived" | "knitting" | "dyeing" | "registration"

export interface OwnerProcessDatum {
  key: OwnerProcessKey
  label: string
  count: number
  pct: number
}

export interface OwnerDetailedDatum extends DevTypeSummary {
  id: string
  name: string
  role: string
  process: OwnerProcessDatum[]
}

export interface CategoryStyleRow {
  styleNo: string
  owners: string[]
  buyer: string
  season: string
  options: number
}

export interface CategoryOverviewDatum {
  key: (typeof CATEGORIES)[number]
  label: string
  count: number
  options: number
  pct: number
}

export interface HomeKpiDetails {
  process: Array<{ label: string; count: number }>
  weeklyDone: number[]
  weeklyTarget: number
  dueBuckets: Array<{ label: string; count: number }>
  lateBuckets: Array<{ label: string; count: number }>
}

export interface MonthlyDevelopmentDatum {
  month: string
  total: number
  gd: number
  domestic: number
  production: number
  purchase: number
  other: number
  source: "DD" | "샘플대장"
  latest: boolean
}

export interface HomeWorkSummary {
  ts: { received: number; processing: number; done: number }
  study: { missing: number; completionRate: number }
  fabric: { request: number; complete: number; connected: boolean }
  calendar: { today: number; week: number }
}

export interface ProgressCard {
  total: number
  process: ProcessFunnelDatum[]
}

export interface HomeSectionCards {
  progress: ProgressCard
  lastWeekDone: number
  thisWeekNew: number
  scheduleDueSoon: number
  scheduleLate: number
}

export interface HomeDateRange {
  from: string
  to: string
}

export interface HomeKpiRanges {
  completed: HomeDateRange
  new: HomeDateRange
}

export type HomeKpiDetailKind = "completed" | "new" | "schedule"

export interface HomeKpiDetailRow {
  record: DevRecord
  date: string
  dayOffset: number | null
  scheduleState?: "due" | "late"
}

export interface HomeKpiDetailGroups {
  completed: HomeKpiDetailRow[]
  new: HomeKpiDetailRow[]
  due: HomeKpiDetailRow[]
  late: HomeKpiDetailRow[]
}

export interface TrendCard {
  title: string
  tag: string
  date: string
  image: string
  source: string
  href: string
}

const pct = (value: number, total: number): number =>
  total ? Math.round((value / total) * 1000) / 10 : 0

const devTypeOf = (record: DevRecord): DevType => {
  const explicit = (record as DevRecord & { devType?: DevType }).devType
  if (explicit === "GD" || explicit === "국내") return explicit
  return record.gdNo ? "GD" : "국내"
}

/** GD/국내 개발 비중. 기존 TDS 레코드는 GD# 유무를 폴백으로 사용한다. */
export function devTypeSplit(records: readonly DevRecord[]): DevTypeSummary {
  let gd = 0
  let dom = 0
  for (const record of records) {
    if (devTypeOf(record) === "GD") gd++
    else dom++
  }
  return { total: records.length, gd, dom, gdPct: pct(gd, records.length), domPct: pct(dom, records.length) }
}

/** 진행중 개발 중 GD#/SA#가 legacy 개발번호 형식으로 기재된 접수 현황. */
/** DD Status 컬럼(devStatus)="진행중"인 건. DD 주간요약의 "진행중(전체)" 정의와 동일(완료·HOLD·DROP·REJECT 제외).
 *  Status 값이 없는 레코드(데모 등)는 stage/flNo 기반 statusOf 로 폴백한다. */
export const isInProgress = (record: DevRecord): boolean => {
  const status = String(record.devStatus ?? "").replace(/\s+/g, "")
  if (status) return status === "진행중"
  return statusOf(record) !== "done"
}

/** 접수 현황은 GD 개발 건에 한정한다(국내개발 제외). GD#가 legacy 개발번호 형식으로 기재되면 접수된 것으로 본다. */
export function receiptStatus(records: readonly DevRecord[]): ReceiptSummary {
  const active = records.filter((record) => isInProgress(record) && devTypeOf(record) === "GD")
  const received = active.filter((record) => /^#?\d{5}(-\d+)?/.test(record.gdNo)).length
  return {
    total: active.length,
    received,
    missing: active.length - received,
    receivedPct: pct(received, active.length),
  }
}

/** 공정 도달률. 현재 단계 이후의 공정은 아직 도달하지 않은 것으로 본다. */
export function processFunnel(records: readonly DevRecord[]): ProcessFunnelDatum[] {
  const stageOrder = ["원사", "편직", "염색", "가공", "시험", "완료"]
  const definitions: Array<{ key: ProcessFunnelKey; label: string; minimum: number }> = [
    { key: "yarn", label: "원사", minimum: 0 },
    { key: "knitting", label: "편직", minimum: 1 },
    { key: "dyeing", label: "염색", minimum: 2 },
    { key: "finishing", label: "피니쉬", minimum: 3 },
  ]
  return definitions.map((definition) => {
    const done = records.filter((record) => {
      // 실데이터(processReached)는 공정별 완료일 기준 독립 판정. 없으면(데모 등) 누적 stage 폴백.
      if (record.processReached) return record.processReached[definition.key]
      const index = stageOrder.indexOf(record.stage)
      return index >= definition.minimum
    }).length
    return {
      key: definition.key,
      label: definition.label,
      done,
      total: records.length,
      pct: pct(done, records.length),
    }
  })
}

/** 담당자별 개발 유형과 현재 공정 분포. 네 공정 그룹의 합은 담당자 총 건수와 같다. */
/** processReached 가 없는 레코드(데모 등)는 stage 문자열에서 공정 도달 여부를 유도한다. */
function reachedFromStage(stage: string): NonNullable<DevRecord["processReached"]> {
  const index = ["원사", "편직", "염색", "가공", "시험", "완료"].indexOf(stage)
  return { yarn: index >= 1, knitting: index >= 2, dyeing: index >= 3, finishing: index >= 3 }
}

export function byOwnerDetailed(records: readonly DevRecord[]): OwnerDetailedDatum[] {
  const processDefinitions: Array<{
    key: OwnerProcessKey
    label: string
    matches: (reached: NonNullable<DevRecord["processReached"]>) => boolean
  }> = [
    { key: "unreceived", label: "미접수", matches: ({ yarn }) => !yarn },
    { key: "knitting", label: "편직대기", matches: ({ yarn, knitting }) => yarn && !knitting },
    { key: "dyeing", label: "염색중", matches: ({ knitting, dyeing }) => knitting && !dyeing },
    { key: "registration", label: "등록대기", matches: ({ dyeing, finishing }) => dyeing || finishing },
  ]

  return MEMBERS.map((member) => {
    const owned = records.filter((record) => record.owner === member.name)
    const split = devTypeSplit(owned)
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      ...split,
      process: processDefinitions.map((definition) => {
        const count = owned.filter((record) => definition.matches(record.processReached ?? reachedFromStage(record.stage))).length
        return { key: definition.key, label: definition.label, count, pct: pct(count, owned.length) }
      }),
    }
  })
}

/** 카테고리 카드용 건수·OPT 수·전체 비중. */
export function categoryOverview(records: readonly DevRecord[]): CategoryOverviewDatum[] {
  return CATEGORIES.map((category) => {
    const rows = records.filter((record) => record.category === category)
    const options = new Set(rows.map((record) => `${record.styleNo}::${record.opt}`)).size
    return {
      key: category,
      label: category === "EU MARKET" ? "EU" : category,
      count: rows.length,
      options,
      pct: pct(rows.length, records.length),
    }
  })
}

/** 카테고리 카드 클릭 시 보여줄 대표 스타일 목록. 동일 Style No.는 OPT 수를 합쳐 1행으로 묶는다. */
export function categoryStyleList(
  records: readonly DevRecord[],
  category: string,
): CategoryStyleRow[] {
  const grouped = new Map<string, CategoryStyleRow>()
  for (const record of records) {
    if (record.category !== category) continue
    const key = record.styleNo || "(Style No. 미기재)"
    const current = grouped.get(key)
    if (current) {
      current.options += 1
      if (record.owner && !current.owners.includes(record.owner)) current.owners.push(record.owner)
      if (record.buyer && !current.buyer) current.buyer = record.buyer
      if (record.season && !current.season) current.season = record.season
    } else {
      grouped.set(key, {
        styleNo: key,
        owners: record.owner ? [record.owner] : [],
        buyer: record.buyer,
        season: record.season,
        options: 1,
      })
    }
  }
  return [...grouped.values()].sort((a, b) =>
    b.options - a.options || a.styleNo.localeCompare(b.styleNo, "ko-KR", { numeric: true }),
  )
}

/** 레코드 1건의 상태를 판정한다. STATUS 키를 돌려준다. */
export function statusOf(rec: DevRecord, today = new Date()): StatusKey {
  const explicit = String(rec.devStatus ?? "").trim().toLowerCase().replace(/\s+/g, "")
  if (/^(완료|done|complete|completed)$/.test(explicit)) return "done"
  if (/^(hold|보류|drop|reject)$/.test(explicit)) return "hold"
  if (rec.stage === "완료" || rec.flNo) return "done"
  const d = daysLeft(rec.dueDate, today)
  if (d === null) return "progress"
  if (d < 0) return "late"
  if (d <= 3) return "due"
  return "progress"
}

/** 서브페이지 보드에서 공통으로 쓰는 5단계 진행 위치. */
export function boardStagePosition(row: DevRecord, today = new Date()): number {
  if (statusOf(row, today) === "done") return 4
  const index = BOARD_STAGES.findIndex((item) => item.label === row.stage)
  return Math.max(0, index)
}

const LANE_URGENCY_RANK: Record<LaneUrgency, number> = {
  done: 0,
  normal: 1,
  soon: 2,
  danger: 3,
}

function laneUrgency(record: DevRecord, today: Date): LaneUrgency {
  const status = statusOf(record, today)
  if (status === "done") return "done"
  const remaining = daysLeft(record.dueDate, today)
  if (status === "late" || remaining === 0) return "danger"
  if (remaining !== null && remaining >= 1 && remaining <= 7) return "soon"
  return "normal"
}

function urgentRecordOrder(left: DevRecord, right: DevRecord, today: Date): number {
  const leftUrgency = laneUrgency(left, today)
  const rightUrgency = laneUrgency(right, today)
  const urgencyDiff = LANE_URGENCY_RANK[rightUrgency] - LANE_URGENCY_RANK[leftUrgency]
  if (urgencyDiff) return urgencyDiff
  const leftDays = leftUrgency === "done" ? null : daysLeft(left.dueDate, today)
  const rightDays = rightUrgency === "done" ? null : daysLeft(right.dueDate, today)
  if (leftDays !== null && rightDays !== null && leftDays !== rightDays) return leftDays - rightDays
  if (leftDays !== null) return -1
  if (rightDays !== null) return 1
  return String(left.opt).localeCompare(String(right.opt), "ko-KR", { numeric: true })
}

/** 담당자별 5공정 레인과 병목 히트맵에 쓰는 단일 집계. */
export function ownerLaneBoard(rows: readonly DevRecord[], today = new Date()): OwnerLaneBoard {
  const knownOwners: string[] = MEMBERS.map((member) => member.name)
  const ownerOrder = [...knownOwners]
  const ownerSet = new Set(ownerOrder)
  const ownerName = (record: DevRecord) => record.owner.trim() || "미지정"

  for (const record of rows) {
    const owner = ownerName(record)
    if (!ownerSet.has(owner)) {
      ownerSet.add(owner)
      ownerOrder.push(owner)
    }
  }

  const stageTotals = BOARD_STAGES.map(() => 0)
  const grouped = new Map<string, Array<Map<string, DevRecord[]>>>()
  for (const owner of ownerOrder) {
    grouped.set(owner, BOARD_STAGES.map(() => new Map<string, DevRecord[]>()))
  }

  for (const record of rows) {
    const owner = ownerName(record)
    const stageIndex = boardStagePosition(record, today)
    const styleNo = record.styleNo.trim() || "Style 미기재"
    const stageGroups = grouped.get(owner)![stageIndex]
    const styleRecords = stageGroups.get(styleNo)
    if (styleRecords) styleRecords.push(record)
    else stageGroups.set(styleNo, [record])
    stageTotals[stageIndex] += 1
  }

  let maxCell = 0
  const laneRows = ownerOrder.map<LaneRow>((owner) => {
    const ownerStages = grouped.get(owner)!
    const cells = ownerStages.map<LaneCell>((styleGroups, stageIndex) => {
      const groups = [...styleGroups.entries()].map<LaneStyleGroup>(([styleNo, records]) => {
        const sortedRecords = [...records].sort((left, right) => urgentRecordOrder(left, right, today))
        const urgency = sortedRecords.reduce<LaneUrgency>((highest, record) => {
          const current = laneUrgency(record, today)
          return LANE_URGENCY_RANK[current] > LANE_URGENCY_RANK[highest] ? current : highest
        }, "done")
        const activeDays = sortedRecords
          .filter((record) => laneUrgency(record, today) !== "done")
          .map((record) => daysLeft(record.dueDate, today))
          .filter((value): value is number => value !== null)
        return {
          styleNo,
          opts: sortedRecords
            .map((record) => record.opt.trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true })),
          records: sortedRecords,
          urgency,
          dayOffset: activeDays.length ? Math.min(...activeDays) : null,
        }
      }).sort((left, right) =>
        LANE_URGENCY_RANK[right.urgency] - LANE_URGENCY_RANK[left.urgency]
        || (left.dayOffset ?? Number.POSITIVE_INFINITY) - (right.dayOffset ?? Number.POSITIVE_INFINITY)
        || left.styleNo.localeCompare(right.styleNo, "ko-KR", { numeric: true }),
      )
      const count = groups.reduce((sum, group) => sum + group.records.length, 0)
      const urgency = groups.length
        ? groups.reduce<LaneUrgency>((highest, group) =>
            LANE_URGENCY_RANK[group.urgency] > LANE_URGENCY_RANK[highest] ? group.urgency : highest,
          groups[0].urgency)
        : "normal"
      maxCell = Math.max(maxCell, count)
      return { stageKey: BOARD_STAGES[stageIndex].key, groups, count, urgency }
    })
    return { owner, cells, total: cells.reduce((sum, cell) => sum + cell.count, 0) }
  })

  return { rows: laneRows, stageTotals, total: rows.length, maxCell }
}

export function kpis(records: readonly DevRecord[], today = new Date()): KpiSummary {
  let progress = 0
  let done = 0
  let late = 0
  let dueSoon = 0
  for (const record of records) {
    switch (statusOf(record, today)) {
      case "done":
        done++
        break
      case "late":
        late++
        progress++
        break
      case "due":
        dueSoon++
        progress++
        break
      default:
        progress++
    }
  }
  return { total: records.length, progress, done, late, dueSoon }
}

const FIVE_STAGE_DEFINITIONS = [
  { key: "yarn", label: "원사" },
  { key: "knitting", label: "편직" },
  { key: "dyeing", label: "염색" },
  { key: "finishing", label: "가공" },
  { key: "done", label: "완료" },
] as const

/** 서브페이지의 보드·간트에서 공통으로 쓰는 5단계 진행 위치. 시험은 가공 완료 구간으로 본다. */
function fiveStageIndex(record: DevRecord, today = new Date()): number {
  if (statusOf(record, today) === "done") return 4
  const direct = ["원사", "편직", "염색", "가공", "완료"].indexOf(record.stage)
  if (direct >= 0) return direct
  if (record.stage === "시험") return 3
  const reached = record.processReached
  if (!reached) return 0
  if (reached.finishing) return 3
  if (reached.dyeing) return 3
  if (reached.knitting) return 2
  if (reached.yarn) return 1
  return 0
}

export function subpageCardStats(
  rows: readonly DevRecord[],
  today = new Date(),
): SubpageCardStats {
  const summary = kpis(rows, today)
  const categoryCounts = new Map<string, number>()
  for (const row of rows) {
    const label = row.category || "미지정"
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1)
  }
  const categoryMix = [...categoryCounts.entries()]
    .map(([label, count]) => ({ label, count, pct: pct(count, rows.length) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko-KR"))
  const processMix = FIVE_STAGE_DEFINITIONS.map((definition, index) => {
    const count = rows.filter((row) => fiveStageIndex(row, today) === index).length
    return { ...definition, count, pct: pct(count, rows.length) }
  })
  const activeDays = rows
    .filter((row) => statusOf(row, today) !== "done")
    .map((row) => daysLeft(row.dueDate, today))
    .filter((value): value is number => value !== null)

  return {
    total: summary.total,
    progress: summary.progress,
    due: summary.dueSoon,
    late: summary.late,
    categoryMix,
    processMix,
    dueBuckets: [
      { label: "D-7~-4", count: activeDays.filter((value) => value >= 4 && value <= 7).length },
      { label: "D-3~-1", count: activeDays.filter((value) => value >= 1 && value <= 3).length },
      { label: "오늘", count: activeDays.filter((value) => value === 0).length },
    ],
    lateBuckets: [
      { label: "1~3일", count: activeDays.filter((value) => value <= -1 && value >= -3).length },
      { label: "4~7일", count: activeDays.filter((value) => value <= -4 && value >= -7).length },
      { label: "7일+", count: activeDays.filter((value) => value < -7).length },
    ],
  }
}

const localDay = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

const startOfLocalDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate())

const addLocalDays = (value: Date, days: number): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days)

/** 샘플별 접수~완료/납기 리드타임을 동일 날짜 축의 백분율 좌표로 변환한다. */
export function sampleLeadTimeline(
  rows: readonly DevRecord[],
  today = new Date(),
): { rows: LeadTimelineRow[]; minDate: string; maxDate: string; todayPct: number } {
  const normalized = rows.flatMap((record) => {
    const due = toDate(record.dueDate)
    const received = toDate(record.receivedDate)
    const requested = toDate(record.requestDate)
    const fallbackStart = due ? addLocalDays(due, -14) : startOfLocalDay(today)
    const start = startOfLocalDay(requested ?? received ?? fallbackStart)
    const stateKey = statusOf(record, today)
    const state: LeadTimelineRow["state"] = stateKey === "done"
      ? "done"
      : stateKey === "due" || stateKey === "late"
        ? stateKey
        : "progress"
    const preferredEnd = state === "done" ? (received ?? due) : due
    const endCandidate = startOfLocalDay(preferredEnd ?? received ?? addLocalDays(start, 14))
    const end = endCandidate.getTime() < start.getTime() ? start : endCandidate
    return [{ record, start, end, state }]
  })

  if (!normalized.length) return { rows: [], minDate: "", maxDate: "", todayPct: 0 }

  const minTime = Math.min(...normalized.map((item) => item.start.getTime()))
  const rawMaxTime = Math.max(...normalized.map((item) => item.end.getTime()))
  const maxTime = rawMaxTime === minTime ? addLocalDays(new Date(rawMaxTime), 1).getTime() : rawMaxTime
  const span = maxTime - minTime
  const timelineRows = normalized
    .map<LeadTimelineRow>((item) => ({
      record: item.record,
      start: localDay(item.start),
      end: localDay(item.end),
      offsetPct: ((item.start.getTime() - minTime) / span) * 100,
      widthPct: Math.max(0.8, ((item.end.getTime() - item.start.getTime()) / span) * 100),
      progressPct: (fiveStageIndex(item.record, today) + 1) * 20,
      state: item.state,
    }))
    .sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end))

  return {
    rows: timelineRows,
    minDate: localDay(new Date(minTime)),
    maxDate: localDay(new Date(maxTime)),
    todayPct: ((startOfLocalDay(today).getTime() - minTime) / span) * 100,
  }
}

/** DD 완료건의 delivery date. */
export function completionDate(record: DevRecord): string {
  return record.receivedDate || record.dueDate
}

const normalizedLibraryKey = (value: string): string =>
  value.replace(/\s+/g, "").toUpperCase()

const completedTimestamp = (value: string): number =>
  toDate(value)?.getTime() ?? Number.NEGATIVE_INFINITY

/** DD 완료건과 샘플관리대장 아카이브를 병합한다. 동일 건은 DD를 정본으로 유지한다. */
export function completedLibrary(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  today = new Date(),
): CompletedLibraryItem[] {
  const items: CompletedLibraryItem[] = []
  const ddByPrimary = new Map<string, CompletedLibraryItem>()
  const ddByFl = new Map<string, CompletedLibraryItem>()
  const ddByStyle = new Map<string, CompletedLibraryItem>()
  const archiveByPrimary = new Map<string, CompletedLibraryItem>()

  for (const record of records) {
    if (statusOf(record, today) !== "done") continue
    const flKey = normalizedLibraryKey(record.flNo)
    const styleKey = normalizedLibraryKey(record.styleNo)
    const primary = flKey ? `fl:${flKey}` : styleKey ? `style:${styleKey}` : `dd:${record._src.sheet}:${record._src.row}`
    if (ddByPrimary.has(primary)) continue
    const item: CompletedLibraryItem = {
      key: primary,
      styleNo: record.styleNo,
      flNo: record.flNo,
      season: record.season,
      category: record.category,
      owner: record.owner,
      construction: record.construction,
      completedAt: completionDate(record),
      source: "DD",
      record,
      sample: null,
    }
    ddByPrimary.set(primary, item)
    if (flKey) ddByFl.set(flKey, item)
    if (styleKey && !ddByStyle.has(styleKey)) ddByStyle.set(styleKey, item)
    items.push(item)
  }

  samples.forEach((sample, index) => {
    const flKey = normalizedLibraryKey(sample.flNo)
    const styleKey = normalizedLibraryKey(sample.styleNo)
    const ddMatch = (flKey ? ddByFl.get(flKey) : undefined) ?? (styleKey ? ddByStyle.get(styleKey) : undefined)
    if (ddMatch) {
      ddMatch.sample ??= sample
      ddMatch.styleNo ||= sample.styleNo
      ddMatch.flNo ||= sample.flNo
      ddMatch.season ||= sample.season
      ddMatch.category ||= sample.category
      ddMatch.owner ||= sample.owner
      ddMatch.construction ||= sample.construction
      ddMatch.completedAt ||= sample.completedAt
      return
    }

    const primary = flKey ? `fl:${flKey}` : styleKey ? `style:${styleKey}` : `archive:${index}`
    const existing = archiveByPrimary.get(primary)
    if (existing) return
    const item: CompletedLibraryItem = {
      key: primary,
      styleNo: sample.styleNo,
      flNo: sample.flNo,
      season: sample.season,
      category: sample.category,
      owner: sample.owner,
      construction: sample.construction,
      completedAt: sample.completedAt,
      source: "대장",
      record: null,
      sample,
    }
    archiveByPrimary.set(primary, item)
    items.push(item)
  })

  return items.sort((left, right) =>
    completedTimestamp(right.completedAt) - completedTimestamp(left.completedAt)
      || left.styleNo.localeCompare(right.styleNo, "ko-KR", { numeric: true }),
  )
}

const weekStart = (today: Date, offset = 0): Date => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset + offset * 7)
  return date
}

export function recentWindow(today = new Date(), days = 7): { start: Date; end: Date } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)
  return { start, end }
}

export function defaultHomeDateRanges(today = new Date()): HomeKpiRanges {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
  const range = { from: localDay(from), to: localDay(today) }
  return { completed: { ...range }, new: { ...range } }
}

const inDateRange = (value: string | undefined, range: HomeDateRange): boolean => {
  const parsed = toDate(value)
  if (!parsed || !range.from || !range.to) return false
  const key = localDay(parsed)
  return key >= range.from && key <= range.to
}

const inWindow = (value: string | undefined, window: { start: Date; end: Date }): boolean => {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp >= window.start.getTime() && timestamp < window.end.getTime()
}

/** HOME 완료·신규·지연 카드의 상세 목록. 카드 건수도 이 목록 길이를 사용해 항상 일치시킨다. */
export function homeKpiRecordDetails(
  records: readonly DevRecord[],
  today = new Date(),
  ranges = defaultHomeDateRanges(today),
): HomeKpiDetailGroups {
  const completed = records
    .filter((record) => inDateRange(record.receivedDate, ranges.completed))
    .map((record) => ({ record, date: record.receivedDate ?? "", dayOffset: null }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const newlyRegistered = records
    .filter((record) => inDateRange(record.requestDate, ranges.new))
    .map((record) => ({ record, date: record.requestDate ?? "", dayOffset: null }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const schedule = records
    .filter(isInProgress)
    .map((record) => ({ record, remaining: daysLeft(record.dueDate, today) }))
    .filter((item): item is { record: DevRecord; remaining: number } => item.remaining !== null)
  const due = schedule
    .filter((item) => item.remaining >= 0 && item.remaining <= 7)
    .map(({ record, remaining }) => ({ record, date: record.dueDate, dayOffset: remaining, scheduleState: "due" as const }))
    .sort((a, b) => (a.dayOffset ?? 0) - (b.dayOffset ?? 0))
  const late = schedule
    .filter((item) => item.remaining < 0)
    .map(({ record, remaining }) => ({ record, date: record.dueDate, dayOffset: remaining, scheduleState: "late" as const }))
    .sort((a, b) => (a.dayOffset ?? 0) - (b.dayOffset ?? 0))

  return { completed, new: newlyRegistered, due, late }
}

/**
 * DEVELOPMENT 스케줄 알람.
 * HOME 스케줄 카드와 동일한 기준(진행 중 · 납기임박 D-7 이내 · 납기지연 D+)을 사용해
 * 두 화면의 건수가 항상 일치하도록 homeKpiRecordDetails 결과를 그대로 재사용한다.
 */
export function scheduleAlerts(
  records: readonly DevRecord[],
  today = new Date(),
): { due: HomeKpiDetailRow[]; late: HomeKpiDetailRow[]; all: HomeKpiDetailRow[] } {
  const { due, late } = homeKpiRecordDetails(records, today)
  return { due, late, all: [...late, ...due] }
}

export function homeSectionCards(
  records: readonly DevRecord[],
  today = new Date(),
  ranges = defaultHomeDateRanges(today),
): HomeSectionCards {
  const active = records.filter(isInProgress)
  const details = homeKpiRecordDetails(records, today, ranges)
  return {
    // 전체 개발 진행: DEVELOPMENT OVERVIEW 와 동일한 공정 누적 도달률(processFunnel).
    progress: {
      total: active.length,
      process: processFunnel(active),
    },
    lastWeekDone: details.completed.length,
    thisWeekNew: details.new.length,
    scheduleDueSoon: details.due.length,
    scheduleLate: details.late.length,
  }
}

/** HOME KPI 카드용 분포. 현재 수치는 DD records만 사용한다. */
export function homeKpiDetails(records: readonly DevRecord[], today = new Date()): HomeKpiDetails {
  const active = records.filter((record) => statusOf(record, today) !== "done")
  const funnel = processFunnel(active)
  const attention = attentionItems(records, today)
  const weeklyDone = [-3, -2, -1, 0].map((offset) => {
    const start = weekStart(today, offset).getTime()
    const end = start + 7 * 86400000
    return records.filter((record) => {
      if (statusOf(record, today) !== "done" || !record.requestDate) return false
      const timestamp = new Date(record.requestDate).getTime()
      return timestamp >= start && timestamp < end
    }).length
  })
  return {
    process: funnel.map((item, index) => ({
      label: item.label,
      count: index === funnel.length - 1 ? item.done : Math.max(0, item.done - funnel[index + 1].done),
    })),
    weeklyDone,
    weeklyTarget: Math.max(8, Math.round(records.length * 0.2)),
    dueBuckets: [0, 1, 2, 3].map((days) => ({ label: days === 0 ? "오늘" : `D-${days}`, count: attention.filter((item) => item._days === days).length })),
    lateBuckets: [
      { label: "1–3일", count: attention.filter((item) => item._days !== null && item._days <= -1 && item._days >= -3).length },
      { label: "4–7일", count: attention.filter((item) => item._days !== null && item._days <= -4 && item._days >= -7).length },
      { label: "7일+", count: attention.filter((item) => item._days !== null && item._days < -7).length },
    ],
  }
}

export type RddaProductionType = "gd" | "domestic" | "production" | "purchase" | "other"

export const RDDA_ARCHIVE_CUTOFF_MONTH = "2026-07"

/** FL 번호의 마지막 네 자리 첫 숫자로 생산처를 구분한다. */
export function rddaProductionType(flNo: string): RddaProductionType {
  const digits = flNo.replace(/\D/g, "")
  const serial = digits.slice(-4)
  if (serial.startsWith("9")) return "gd"
  if (serial.startsWith("5")) return "domestic"
  if (serial.startsWith("0")) return "production"
  if (serial.startsWith("2")) return "purchase"
  return "other"
}

/** FL 번호 형식 FL + YY + MM + 4자리 일련번호에서 등록월을 읽는다. */
export function rddaMonthFromFlNo(flNo: string): string | null {
  const digits = flNo.replace(/\D/g, "")
  if (digits.length < 8) return null
  const encoded = digits.slice(-8)
  const year = Number(encoded.slice(0, 2))
  const month = Number(encoded.slice(2, 4))
  if (!Number.isInteger(year) || month < 1 || month > 12) return null
  return `20${String(year).padStart(2, "0")}-${String(month).padStart(2, "0")}`
}

const incrementMonthlyType = (
  map: Map<string, Record<RddaProductionType, number>>,
  month: string,
  flNo: string,
) => {
  const current = map.get(month) ?? { gd: 0, domestic: 0, production: 0, purchase: 0, other: 0 }
  current[rddaProductionType(flNo)] += 1
  map.set(month, current)
}

/**
 * RDDA 등록 현황 1년 추이.
 * 2026년 7월까지는 샘플관리대장의 FL.#에 인코딩된 YYMM을 고정 사용하고,
 * 8월부터는 DD의 Received Date를 사용한다.
 * 양쪽 모두 동일 FL No.는 한 번만 집계한다.
 */
export function monthlyDevelopmentTrend(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  today = new Date(),
  monthCount = 12,
): MonthlyDevelopmentDatum[] {
  const span = Math.max(1, Math.round(monthCount))
  const months = Array.from({ length: span }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (span - 1) + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  })
  const dd = new Map<string, Record<RddaProductionType, number>>()
  const archive = new Map<string, Record<RddaProductionType, number>>()
  const uniqueDd = new Map(records.filter((record) => record.flNo).map((record) => [record.flNo.replace(/\s+/g, "").toUpperCase(), record]))
  uniqueDd.forEach((record) => {
    const month = record.receivedDate?.slice(0, 7)
    if (month && month > RDDA_ARCHIVE_CUTOFF_MONTH) incrementMonthlyType(dd, month, record.flNo)
  })
  const uniqueSamples = new Map(samples.filter((sample) => sample.flNo).map((sample) => [sample.flNo.replace(/\s+/g, "").toUpperCase(), sample]))
  uniqueSamples.forEach((sample) => {
    const month = rddaMonthFromFlNo(sample.flNo)
    if (month && month <= RDDA_ARCHIVE_CUTOFF_MONTH) incrementMonthlyType(archive, month, sample.flNo)
  })
  const latestPopulated = [...months].reverse().find((month) => {
    const values = month <= RDDA_ARCHIVE_CUTOFF_MONTH ? archive.get(month) : dd.get(month)
    return values ? Object.values(values).some((value) => value > 0) : false
  })
  return months.map((month) => {
    const source = month <= RDDA_ARCHIVE_CUTOFF_MONTH ? "샘플대장" as const : "DD" as const
    const values = (source === "샘플대장" ? archive : dd).get(month) ?? { gd: 0, domestic: 0, production: 0, purchase: 0, other: 0 }
    return {
      month,
      total: Object.values(values).reduce((sum, value) => sum + value, 0),
      ...values,
      source,
      latest: month === latestPopulated,
    }
  })
}

/** 담당자별 RDDA 등록 현황. 홈 RDDA 등록 추이와 같은 소스를 담당자별로 분해한다. */
export function ownerMonthlyFlTrend(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  today = new Date(),
  monthCount = 12,
): Record<string, { month: string; count: number }[]> {
  const span = Math.max(1, Math.round(monthCount))
  const months = Array.from({ length: span }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (span - 1) + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  })
  const owners = MEMBERS.map((member) => member.name)
  const dd = new Map<string, Map<string, number>>(owners.map((owner) => [owner, new Map()]))
  const archive = new Map<string, Map<string, number>>(owners.map((owner) => [owner, new Map()]))
  const increment = (source: Map<string, Map<string, number>>, owner: string, month: string) => {
    const counts = source.get(owner)
    if (!counts) return
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }

  const uniqueDd = new Map(records.filter((record) => record.flNo).map((record) => [record.flNo.replace(/\s+/g, "").toUpperCase(), record]))
  uniqueDd.forEach((record) => {
    const month = record.receivedDate?.slice(0, 7)
    if (month && month > RDDA_ARCHIVE_CUTOFF_MONTH) increment(dd, record.owner, month)
  })

  const uniqueSamples = new Map(samples.filter((sample) => sample.flNo).map((sample) => [sample.flNo.replace(/\s+/g, "").toUpperCase(), sample]))
  uniqueSamples.forEach((sample) => {
    const month = rddaMonthFromFlNo(sample.flNo)
    if (month && month <= RDDA_ARCHIVE_CUTOFF_MONTH) increment(archive, sample.owner, month)
  })

  return Object.fromEntries(owners.map((owner) => [
    owner,
    months.map((month) => ({
      month,
      count: (month <= RDDA_ARCHIVE_CUTOFF_MONTH ? archive : dd).get(owner)?.get(month) ?? 0,
    })),
  ]))
}

export function homeWorkSummary(
  records: readonly DevRecord[],
  ts: ReadonlyArray<{ state: string; receivedAt: string }>,
  study: ReadonlyArray<{ state: string; dueDate: string }>,
  fabricAnalysis: readonly FabricAnalysisRow[],
  events: ReadonlyArray<{ date: string }>,
  today = new Date(),
): HomeWorkSummary {
  const todayKey = localDay(today)
  const window = recentWindow(today)
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).getTime()
  const studyDue = study.filter((item) => {
    const timestamp = new Date(item.dueDate).getTime()
    return timestamp >= today.getTime() - 86400000 && timestamp < weekEnd
  })
  const doneStudy = studyDue.filter((item) => item.state === "완료").length
  const dueDates = records.filter((record) => record.dueDate).map((record) => ({ date: record.dueDate }))
  const calendarRows = [...events, ...dueDates]
  return {
    ts: {
      received: ts.filter((item) => item.state === "접수").length,
      processing: ts.filter((item) => item.state === "처리중").length,
      done: ts.filter((item) => item.state === "완료").length,
    },
    study: { missing: studyDue.length - doneStudy, completionRate: studyDue.length ? Math.round((doneStudy / studyDue.length) * 100) : 0 },
    fabric: {
      request: fabricAnalysis.filter((item) => inWindow(item.requestDate, window)).length,
      complete: fabricAnalysis.filter((item) => inWindow(item.completeDate, window)).length,
      connected: fabricAnalysis.length > 0,
    },
    calendar: {
      today: calendarRows.filter((item) => item.date.slice(0, 10) === todayKey).length,
      week: calendarRows.filter((item) => {
        const timestamp = new Date(item.date).getTime()
        return timestamp >= today.getTime() - 86400000 && timestamp < weekEnd
      }).length,
    },
  }
}

export function homeTrendCards(
  ts: ReadonlyArray<{ state: string; receivedAt: string; subject: string }>,
  studyFiles: readonly string[],
  trends: ReadonlyArray<{ title: string; date: string; image: string; source: string }>,
): TrendCard[] {
  const recentTs = [...ts]
    .filter((item) => item.state === "완료")
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]
  const studyFile = [...studyFiles].reverse().find((file) => /\.(pptx?|pdf|docx?)$/i.test(file))
  const extension = studyFile?.match(/\.([^.]+)$/)?.[1].toUpperCase() ?? "STUDY"
  const studyTitle = studyFile?.replace(/\.[^.]+$/, "") ?? "최근 업로드 자료 없음"
  const fallback = { title: "새로운 트렌드 자료를 준비 중입니다", date: "", image: "", source: "R&D" }
  const macro = trends[0] ?? fallback
  const fabric = trends[1] ?? trends[0] ?? fallback
  return [
    recentTs
      ? { title: recentTs.subject, tag: "TS", date: recentTs.receivedAt, image: "", source: "기술지원", href: "#/ts" }
      : { title: "최근 완료 TS 없음", tag: "TS", date: "", image: "", source: "기술지원", href: "#/ts" },
    { title: studyTitle, tag: extension, date: "", image: "", source: "STUDY", href: "#/study" },
    { ...macro, tag: "MACRO", href: "#/trend/macro" },
    { ...fabric, tag: "FABRIC", href: "#/trend/fabric" },
  ]
}

/** 엑셀 자료를 우선해 수동 등록 자료와 합치고 최신순·제목순으로 정렬한다. */
export function materialsOf(
  kind: MaterialKind,
  excelItems: readonly MaterialItem[],
  manualItems: readonly MaterialItem[],
): MaterialItem[] {
  const merged = new Map<string, MaterialItem>()
  manualItems.forEach((item) => merged.set(item.id, item))
  excelItems.forEach((item) => merged.set(item.id, item))
  return [...merged.values()]
    .filter((item) => item.kind === kind)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title, "ko-KR"))
}

type TsMaterialSource = {
  id: string
  receivedAt: string
  subject: string
  from?: string
  advisor?: string
  inquiry?: string
  causes?: string
  analysis?: string
  action?: string
  result?: string
  productionSite?: string
  orderVolume?: string
  attachment?: string
  relatedDepartment?: string
  attn?: string
}

const cleanMaterialText = (value: string | undefined): string => value?.trim() ?? ""

const materialSummary = (value: string | undefined): string | undefined => {
  const normalized = cleanMaterialText(value).replace(/\s+/g, " ")
  if (!normalized) return undefined
  return normalized.length > 120 ? `${normalized.slice(0, 120).trimEnd()}…` : normalized
}

const materialDetails = (
  rows: ReadonlyArray<readonly [label: string, value: string | undefined]>,
): NonNullable<MaterialItem["detail"]> | undefined => {
  const detail = rows
    .map(([label, value]) => ({ label, value: cleanMaterialText(value) }))
    .filter((row) => Boolean(row.value))
  return detail.length ? detail : undefined
}

/** 기존 TS 사고사례 레코드를 읽기 전용 자료 카드로 변환한다. */
export function tsMaterials(ts: readonly TsMaterialSource[]): MaterialItem[] {
  return ts.map<MaterialItem>((record) => {
    const productionSite = cleanMaterialText(record.productionSite)
    const relatedDepartments = cleanMaterialText(record.relatedDepartment)
      .split("/")
      .map((value) => value.trim())
      .filter(Boolean)
    const tags = [...new Set([productionSite, ...relatedDepartments].filter(Boolean))]

    return {
      id: `ts-${record.id}`,
      kind: "TS",
      title: record.subject,
      summary: materialSummary(record.causes),
      date: record.receivedAt,
      tags,
      link: httpsMaterialLink(record.attachment),
      owner: cleanMaterialText(record.advisor) || undefined,
      source: "ts",
      detail: materialDetails([
        ["요청자", record.from],
        ["유관부서", record.relatedDepartment],
        ["수신자", record.attn],
        ["담당", record.advisor],
        ["의뢰 내용", record.inquiry],
        ["현황 분석", record.analysis],
        ["원인", record.causes],
        ["해결 방안", record.action],
        ["결과", record.result],
        ["생산처", record.productionSite],
        ["발주량", record.orderVolume],
      ]),
      readOnly: true,
    }
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title, "ko-KR"))
}

const studyMaterialKey = (record: StudyRecord): string =>
  [record.owner, record.week, record.topic]
    .map((value) => String(value).normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "-"))
    .filter(Boolean)
    .join("-")

/** 기존 STUDY 과제를 읽기 전용 자료 카드로 변환한다. */
export function studyMaterials(study: readonly StudyRecord[]): MaterialItem[] {
  return study.map<MaterialItem>((record) => {
    const category = cleanMaterialText(record.category)
    return {
      id: `study-${studyMaterialKey(record)}`,
      kind: "STUDY",
      title: record.topic,
      summary: materialSummary(record.selectionReason || record.category),
      date: record.completedDate || record.confirmedDate || record.dueDate,
      tags: category ? [category] : [],
      link: httpsMaterialLink(record.materialFile),
      owner: cleanMaterialText(record.owner) || undefined,
      source: "study",
      detail: materialDetails([
        ["주차", record.weekLabel || (record.week ? `${record.week}주차` : "")],
        ["카테고리", record.category],
        ["상태", record.state],
        ["선정 사유", record.selectionReason],
        ["비고", record.reason],
      ]),
      readOnly: true,
    }
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title, "ko-KR"))
}

export function countBy(
  records: readonly DevRecord[],
  key: DevRecordFieldKey,
): CountDatum[] {
  const counts = new Map<string | number, number>()
  for (const record of records) {
    const value = record[key] ?? "(미지정)"
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

export const byCategory = (records: readonly DevRecord[]): CountDatum[] =>
  CATEGORIES.map((category) => ({
    label: category,
    count: records.filter((record) => record.category === category).length,
  }))

export const byOwner = (records: readonly DevRecord[]): CountDatum[] =>
  MEMBERS.map((member) => ({
    label: member.name,
    count: records.filter((record) => record.owner === member.name).length,
  }))

/** 담당자 기준 내 업무 — 마감 급한 순 */
export function myTasks(
  records: readonly DevRecord[],
  owner: string,
  limit = 5,
  today = new Date(),
): DerivedTask[] {
  return records
    .filter((record) => record.owner === owner && statusOf(record, today) !== "done")
    .map((record) => ({
      ...record,
      _status: statusOf(record, today),
      _days: daysLeft(record.dueDate, today),
    }))
    .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999))
    .slice(0, limit)
}

/** 납기 임박·지연 전체 (HOME 알림·DEVELOPMENT 배지용) */
export const attentionItems = (
  records: readonly DevRecord[],
  today = new Date(),
): DerivedTask[] =>
  records
    .map((record) => ({
      ...record,
      _status: statusOf(record, today),
      _days: daysLeft(record.dueDate, today),
    }))
    .filter((record) => record._status === "late" || record._status === "due")
    .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999))

/** 데이터 이상 항목 — 원본은 고치지 않고 목록만 만든다 */
export function anomalies(records: readonly DevRecord[]): DataAnomaly[] {
  const seasonOdd: Array<Record<string, string>> = []
  const dueBlank: Array<Record<string, string>> = []
  const ownerBlank: Array<Record<string, string>> = []
  for (const record of records) {
    const season = normalizeSeason(record.season)
    if (season.normalized) {
      seasonOdd.push({
        styleNo: record.styleNo,
        raw: season.raw,
        suggested: season.value,
      })
    }
    if (!record.dueDate && record.stage !== "완료") {
      dueBlank.push({ styleNo: record.styleNo, category: record.category })
    }
    if (!record.owner) {
      ownerBlank.push({ styleNo: record.styleNo, category: record.category })
    }
  }
  return [
    {
      type: "시즌 표기 불일치",
      tone: "warn",
      count: seasonOdd.length,
      samples: seasonOdd.slice(0, 5),
    },
    {
      type: "납기 공란",
      tone: "crit",
      count: dueBlank.length,
      samples: dueBlank.slice(0, 5),
    },
    {
      type: "담당 미지정",
      tone: "warn",
      count: ownerBlank.length,
      samples: ownerBlank.slice(0, 5),
    },
  ].filter((anomaly) => anomaly.count > 0) as DataAnomaly[]
}

/** 주간보고 2줄 — HOME에서 복사 버튼으로 내보낸다 */
export function weeklyLines(
  records: readonly DevRecord[],
  tsRows: readonly WeeklyTsRow[],
  today = new Date(),
): [string, string] {
  const summary = kpis(records, today)
  const tsNew = tsRows.filter((row) => row.state === "접수").length
  const tsProcessing = tsRows.filter((row) => row.state === "처리중").length
  const tsDone = tsRows.filter((row) => row.state === "완료").length
  return [
    `· 개발: 진행 ${summary.progress}건 / 완료 ${summary.done}건 / 지연 ${summary.late}건 (납기 임박 ${summary.dueSoon}건)`,
    `· 기술지원: 접수 ${tsNew}건 / 처리중 ${tsProcessing}건 / 완료 ${tsDone}건`,
  ]
}
