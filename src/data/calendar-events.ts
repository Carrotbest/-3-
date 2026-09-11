export const TEAM_EVENT_TYPES = ["meeting", "external", "trip", "leave"] as const
export type TeamEventType = (typeof TEAM_EVENT_TYPES)[number]

/** 화면 문구의 기준 하나뿐이다. HOME 팀 일정과 CALENDAR가 같은 말을 써야 한다. */
export const TEAM_EVENT_META: Record<TeamEventType, { label: string; dot: string; chip: string }> = {
  meeting: { label: "미팅(내부)", dot: "bg-[var(--chart-2)]", chip: "border-[var(--chart-2)] text-[var(--chart-2)]" },
  external: { label: "미팅(외부)", dot: "bg-[var(--chart-1)]", chip: "border-[var(--chart-1)] text-[var(--chart-1)]" },
  // 출장은 붉은색, 휴가는 초록색이다. 달력의 연속 바 그라데이션과 같은 계열을 쓴다.
  trip: { label: "출장", dot: "bg-[hsl(0_74%_48%)]", chip: "border-[hsl(0_74%_48%)] text-[hsl(0_74%_44%)]" },
  leave: { label: "휴가", dot: "bg-[hsl(160_84%_33%)]", chip: "border-[hsl(160_84%_33%)] text-[hsl(160_84%_28%)]" },
}

export const isTeamEventType = (type: string): type is TeamEventType =>
  (TEAM_EVENT_TYPES as readonly string[]).includes(type)


export type RepeatRule = "weekly" | "biweekly" | "monthly"

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  weekly: "매주",
  biweekly: "격주",
  monthly: "매월",
}

const pad2 = (value: number): string => String(value).padStart(2, "0")
const keyOf = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

function parseKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return keyOf(date) === key ? date : null
}

const shiftDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** 다음 반복 시점. 매월은 같은 일자를 쓰고, 그 달에 없는 일자면 건너뛴다. */
function nextOccurrence(date: Date, rule: RepeatRule, dayOfMonth: number): Date {
  if (rule === "weekly") return shiftDays(date, 7)
  if (rule === "biweekly") return shiftDays(date, 14)
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  return new Date(next.getFullYear(), next.getMonth(), Math.min(dayOfMonth, lastDay))
}

interface RepeatableEvent {
  date: string
  endDate?: string
  repeat?: RepeatRule
  repeatUntil?: string
}

/**
 * 반복 일정을 화면에 보이는 기간(from~to) 안의 실제 날짜로 펼친다.
 *
 * 저장소에는 원본 1건만 둔다. 사본을 만들면 하나 고칠 때마다 전부 손봐야 한다.
 * 첫 회차는 원본 객체를 그대로 돌려주므로 수정·삭제가 원본을 가리킨다.
 * 두 번째 회차부터는 `origin` 에 원본을 달아 둔다. 호출부는 그것으로 원본을 찾는다.
 */
export function expandRepeats<T extends RepeatableEvent>(
  events: readonly T[],
  from: string,
  to: string,
): Array<T & { origin?: T }> {
  const out: Array<T & { origin?: T }> = []
  events.forEach((event) => {
    const start = event.repeat ? parseKey(event.date) : null
    if (!event.repeat || !start) {
      out.push(event)
      return
    }
    const end = event.endDate ? parseKey(event.endDate) : null
    const spanDays = end && end > start ? Math.round((end.getTime() - start.getTime()) / 86400000) : 0
    const limit = event.repeatUntil && event.repeatUntil >= event.date ? event.repeatUntil : to
    const dayOfMonth = start.getDate()
    let cursor = start
    // 무한 루프 방지. 매주 기준 약 8년이면 화면에 보이는 어떤 기간도 덮는다.
    for (let guard = 0; guard < 420; guard += 1) {
      const key = keyOf(cursor)
      if (key > limit || key > to) break
      const endKey = spanDays > 0 ? keyOf(shiftDays(cursor, spanDays)) : undefined
      if ((endKey ?? key) >= from) {
        out.push(key === event.date ? event : { ...event, date: key, endDate: endKey, origin: event })
      }
      cursor = nextOccurrence(cursor, event.repeat, dayOfMonth)
    }
  })
  return out
}
