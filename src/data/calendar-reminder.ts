import { create } from "zustand"

import { expandRepeats, isTeamEventType, type TeamEventType } from "./calendar-events"
import type { CalendarEvent } from "./sample"
import { loadViewFlag, saveViewPref } from "./view-prefs"

/**
 * 일정 임박 알림(R387).
 *
 * **대상은 시작 시간이 적힌 팀 일정 전부다.** 담당자로 거르지 않는다(2026-11-04 박향근 확정).
 * 시간이 비어 있으면 알리지 않는다. 종일 일정에 분 단위 알림은 뜻이 없다.
 *
 * 켜짐 여부는 개인 브라우저에만 남는다(`view-prefs`). 계정이 아니라 브라우저에 붙는 값이고
 * `CACHE_KEYS`에 없어 Firestore로 올라가지 않는다. 새 저장 경로를 만들지 말 것.
 */
export const REMINDER_PREF_KEY = "calendar-reminder-v1"

interface ReminderState { enabled: boolean }

const useReminderStore = create<ReminderState>(() => ({ enabled: loadViewFlag(REMINDER_PREF_KEY, true) }))

export const useReminderEnabled = (): boolean => useReminderStore((state) => state.enabled)

export function setReminderEnabled(next: boolean): void {
  saveViewPref(REMINDER_PREF_KEY, next)
  useReminderStore.setState({ enabled: next })
}

export interface ReminderOccurrence {
  /** 반복 일정은 회차마다 다른 키다. `{id}@{그 회차 날짜}` */
  key: string
  title: string
  type: TeamEventType
  /** 시작 시각(epoch ms) */
  startAt: number
  time: string
  place?: string
  owner?: string
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/
const pad2 = (value: number): string => String(value).padStart(2, "0")

export const reminderDayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return reminderDayKey(date) === key ? date : null
}

/**
 * 남은 시간(분)이 속한 알림 단계. 지금 울릴 것이 없으면 `null`이다.
 *
 * 구간으로 가른다. 15분 단계는 (10, 15], 10분은 (5, 10], 5분은 (0, 5].
 * `남은 시간 <= 단계`만 보면 6분 남았을 때 15분과 10분이 한꺼번에 울린다.
 * 이미 시작한 일정(0 이하)은 알리지 않는다.
 */
export function reminderBucket(minutesLeft: number): number | null {
  if (minutesLeft <= 0 || minutesLeft > 15) return null
  if (minutesLeft > 10) return 15
  if (minutesLeft > 5) return 10
  return 5
}

/** 오늘과 내일에 시작하는 회차. 반복 일정은 `expandRepeats`로 펼친다. */
export function reminderOccurrences(events: readonly CalendarEvent[], now: Date): ReminderOccurrence[] {
  const todayKey = reminderDayKey(now)
  const tomorrowKey = reminderDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const base = events.filter((event): event is CalendarEvent & { type: TeamEventType } =>
    isTeamEventType(event.type) && Boolean(event.id) && TIME_RE.test(event.time ?? ""))

  return expandRepeats(base, todayKey, tomorrowKey).flatMap((event) => {
    if (event.date < todayKey || event.date > tomorrowKey) return []
    const day = parseDayKey(event.date)
    const match = TIME_RE.exec(event.time ?? "")
    if (!day || !match) return []
    const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2])).getTime()
    return [{
      key: `${event.id}@${event.date}`,
      title: event.title,
      type: event.type,
      startAt,
      time: event.time ?? "",
      place: event.place,
      owner: event.owner,
    }]
  })
}

const firedStorageKey = (uid: string): string => `fabric.calendar-reminded.v1.${uid}`

/**
 * 이 단계를 내가 울리겠다고 찜한다. 이미 찜혀 있으면 `false`다.
 *
 * **탭을 여러 개 열어 둔 경우를 이것으로 막는다.** 저장소를 그 자리에서 다시 읽고
 * 바로 되쓰므로 먼저 온 탭이 이긴다. 호출부는 탭마다 0~5초 다른 시점에 돌아 충돌을 줄인다.
 * 어제 것은 버린다. 매일 쌓이면 저장소가 센다.
 */
export function claimReminder(uid: string, key: string, minutes: number, dayKey: string): boolean {
  const slot = `${key}|${minutes}`
  try {
    const raw = window.localStorage.getItem(firedStorageKey(uid))
    const parsed = raw ? JSON.parse(raw) as unknown : null
    const kept: Record<string, string> = {}
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string" && value >= dayKey) kept[name] = value
      }
    }
    if (kept[slot]) return false
    kept[slot] = dayKey
    window.localStorage.setItem(firedStorageKey(uid), JSON.stringify(kept))
    return true
  } catch {
    // 시크릿 창은 접근 자체가 예외다. 알림은 띄우되 탭마다 한 번씩 뜬다.
    return true
  }
}
