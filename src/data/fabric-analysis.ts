import type { AnalysisRequest } from "./schema"
import { DD_SEASON_OPTIONS } from "./dd-workflow"

const SEASON_YEARS = [...new Set(DD_SEASON_OPTIONS.map((value) => value.slice(-2)))]
/** DD 시즌(SS/FW)에 봄(SPR)과 홀리데이(HOL)를 더한 분석 화면 전용 목록. */
export const ANALYSIS_SEASON_OPTIONS = SEASON_YEARS.flatMap((yy) => [`SPR'${yy}`, `SS'${yy}`, `FW'${yy}`, `HOL'${yy}`])

export const AN_NO_PATTERN = /^AN\d{8}$/
export const ANALYSIS_OBJECTIVES = ["Development", "Quality check", "Reference"] as const
export const ANALYSIS_SOURCES = ["Market sample", "Buyer sample", "Mill sample"] as const
export const ANALYSIS_GENDERS = ["Women's", "Men's", "Kids", "Unisex"] as const
export const ANALYSIS_ITEMS = ["Yarn count", "Spinning type", "Contents", "Construction", "Weight", "Density"] as const
export const DEFAULT_CUSTOMER = "Hansoll Textile Ltd."
export const DEFAULT_DEPARTMENT = "통합원단부1팀"

export function newAnalysisId(): string {
  return `an:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

const localDateValue = (date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function nextAnNo(list: readonly AnalysisRequest[], date = new Date()): string {
  const prefix = `AN${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`
  const max = list.reduce((value, item) => item.anNo.startsWith(prefix) && AN_NO_PATTERN.test(item.anNo)
    ? Math.max(value, Number(item.anNo.slice(-4)))
    : value, 0)
  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

export function isDuplicateAnNo(list: readonly AnalysisRequest[], anNo: string, selfId?: string): boolean {
  return list.some((item) => item.id !== selfId && item.anNo.toUpperCase() === anNo.trim().toUpperCase())
}

export function blankAnalysisRequest(opts: { requester: string; requesterEmail: string; list: AnalysisRequest[] }): AnalysisRequest {
  const now = new Date().toISOString()
  return {
    id: newAnalysisId(), anNo: nextAnNo(opts.list), state: "작성", requestedAt: "", requestType: "Normal",
    requester: opts.requester, requesterEmail: opts.requesterEmail, department: DEFAULT_DEPARTMENT, customer: DEFAULT_CUSTOMER,
    objective: "", description: "", requesterComment: "", source: "", sourceCode: "", season: "", gender: "",
    brand: "", construction: "", contents: "", weight: "", inCharge: "", yarnDescription: "",
    constructionRnd: "", weightRnd: "", commentRnd: "", finishedAt: "", createdBy: opts.requesterEmail,
    createdAt: now, updatedAt: now,
  }
}

export function analysisLeadDays(item: AnalysisRequest): number | null {
  if (item.state !== "완료" || !item.requestedAt || !item.finishedAt) return null
  const start = new Date(`${item.requestedAt}T00:00:00`).getTime()
  const finish = new Date(`${item.finishedAt}T00:00:00`).getTime()
  return Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, Math.round((finish - start) / 86_400_000)) : null
}

export const analysisTodayValue = localDateValue

export interface AnalysisWeeklyPoint {
  week: string
  label: string
  requested: number
  finished: number
  leadDays: number | null
}

const dateValue = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime()) ? date : null
}

const mondayOf = (date: Date): Date => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7))
  return next
}

export function analysisWeeklySeries(list: readonly AnalysisRequest[], today = new Date()): AnalysisWeeklyPoint[] {
  const end = mondayOf(today)
  const starts = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(end)
    date.setDate(end.getDate() - (11 - index) * 7)
    return date
  })
  return starts.map((start) => {
    const finish = new Date(start)
    finish.setDate(start.getDate() + 7)
    const inWeek = (value: string) => {
      const date = dateValue(value)
      return Boolean(date && date >= start && date < finish)
    }
    const completed = list.filter((item) => item.state === "완료" && inWeek(item.finishedAt))
    const leads = completed.map(analysisLeadDays).filter((days): days is number => days != null)
    return {
      week: localDateValue(start),
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      requested: list.filter((item) => item.state !== "작성" && inWeek(item.requestedAt)).length,
      finished: completed.length,
      leadDays: leads.length ? Number((leads.reduce((sum, days) => sum + days, 0) / leads.length).toFixed(1)) : null,
    }
  })
}
