import { isInProgress } from "@/data/derive"

type DevRecord = Parameters<typeof isInProgress>[0]
type RequestStyle = object
type AnalysisRequest = object
type FabricLedgerOverride = { status?: string }
type CalendarEvent = { date?: unknown }
type TsRecord = object
type TrendItem = object

export interface RoomStat {
  /** 표지에 적을 짧은 말. 예: "진행 61" */
  label: string
  /** 오늘 새로 생긴 수. 0이면 표시하지 않는다. */
  fresh: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_KEYS = ["createdAt", "created_at", "registeredAt", "requestedAt", "date", "publishedAt", "collectedAt", "updatedAt"]

function recordOf(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

function firstField(value: object, keys: string[]): unknown {
  const record = recordOf(value)
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function millisOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === "string") {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number }
    if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime()
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000
  }
  return null
}

function todayBounds(now = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return [start, start + DAY_MS]
}

function isToday(value: object, bounds: [number, number]): boolean {
  const millis = millisOf(firstField(value, DATE_KEYS))
  return millis !== null && millis >= bounds[0] && millis < bounds[1]
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().replaceAll(" ", "").toLocaleLowerCase("ko-KR") : ""
}

function isComplete(value: object): boolean {
  const record = recordOf(value)
  if (record.completed === true || record.done === true || record.completedAt) return true
  const status = normalized(firstField(value, ["status", "result", "state", "progress", "processingStatus"]))
  return status === "완료" || status === "completed" || status === "complete" || status === "done"
}

function isRequestInProgress(value: RequestStyle): boolean {
  const result = normalized(recordOf(value).result)
  return result === "" || result === "진행중"
}

function countFresh(values: object[], bounds: [number, number]): number {
  return values.filter((value) => isToday(value, bounds)).length
}

export function buildRoomStats(input: {
  records: DevRecord[]
  requests: RequestStyle[]
  analysisRequests: AnalysisRequest[]
  fabricOverrides: FabricLedgerOverride[]
  events: CalendarEvent[]
  ts: TsRecord[]
  trends: TrendItem[]
}): Record<string, RoomStat> {
  const today = todayBounds()
  const weekEnd = today[0] + 7 * DAY_MS
  const activeRecords = input.records.filter(isInProgress)
  const activeRequests = input.requests.filter(isRequestInProgress)
  const pendingAnalysis = input.analysisRequests.filter((item) => !isComplete(item))
  const storedFabrics = input.fabricOverrides.filter((item) => item.status === "WAREHOUSE")
  const processingTs = input.ts.filter((item) => !isComplete(item))
  const upcomingEvents = input.events.filter((item) => {
    const millis = millisOf(item.date)
    return millis !== null && millis >= today[0] && millis < weekEnd
  })

  return {
    "/development/workspace": { label: `진행 ${activeRecords.length}`, fresh: countFresh(activeRecords, today) },
    "/request": { label: `진행 ${activeRequests.length}`, fresh: countFresh(activeRequests, today) },
    "/fabric-analysis": { label: `대기 ${pendingAnalysis.length}`, fresh: countFresh(pendingAnalysis, today) },
    "/warehouse": { label: `보관 ${storedFabrics.length}`, fresh: 0 },
    "/ts": { label: `처리 ${processingTs.length}`, fresh: countFresh(processingTs, today) },
    "/calendar": { label: `일정 ${upcomingEvents.length}`, fresh: countFresh(upcomingEvents, today) },
    "/trend/macro": { label: `기사 ${input.trends.length}`, fresh: countFresh(input.trends, today) },
  }
}
