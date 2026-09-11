import { expandRepeats, isTeamEventType, type TeamEventType } from "@/data/calendar-events"
import type { CalendarEvent } from "@/data/sample"

const HIDDEN_KEY = "home-today-briefing-hidden-v1"
const TYPE_ORDER: Record<TeamEventType, number> = {
  meeting: 0,
  external: 1,
  trip: 2,
  leave: 3,
}

export interface BriefingItem {
  event: CalendarEvent & { type: TeamEventType }
  /** 내일 시작하는 휴가·출장의 하루 전 미리 알림 */
  lead: boolean
  /** 오늘이 기간의 첫날이 아니다(이미 진행 중) */
  ongoing: boolean
}

const pad2 = (value: number): string => String(value).padStart(2, "0")
const keyOf = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

function dateFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return keyOf(date) === key ? date : null
}

const eventEndDate = (event: CalendarEvent): string =>
  event.endDate && event.endDate > event.date && dateFromKey(event.endDate) ? event.endDate : event.date

export function todayBriefing(events: readonly CalendarEvent[], todayKey: string): BriefingItem[] {
  const today = dateFromKey(todayKey)
  if (!today) return []
  const tomorrowKey = keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
  const base = events.filter((event): event is CalendarEvent & { type: TeamEventType } => isTeamEventType(event.type))

  return expandRepeats(base, todayKey, tomorrowKey)
    .filter((event) => {
      const coversToday = event.date <= todayKey && eventEndDate(event) >= todayKey
      if (event.type === "meeting" || event.type === "external") return coversToday
      return coversToday || event.date === tomorrowKey
    })
    .map((event) => ({
      event,
      lead: event.date === tomorrowKey,
      ongoing: event.date !== tomorrowKey && event.date < todayKey,
    }))
    .sort((left, right) =>
      Number(left.lead) - Number(right.lead)
      || TYPE_ORDER[left.event.type] - TYPE_ORDER[right.event.type]
      || (left.event.time ? 0 : 1) - (right.event.time ? 0 : 1)
      || (left.event.time ?? "").localeCompare(right.event.time ?? "")
      || left.event.title.localeCompare(right.event.title),
    )
}

export function isBriefingHidden(todayKey: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === todayKey
  } catch {
    return false
  }
}

export function hideBriefingToday(todayKey: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(HIDDEN_KEY, todayKey)
  } catch {
    // 저장소가 막혀도 팝업을 닫는 동작은 그대로 유지한다.
  }
}
