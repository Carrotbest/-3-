import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { REPEAT_LABELS, TEAM_EVENT_META, TEAM_EVENT_TYPES, expandRepeats, isTeamEventType, type RepeatRule, type TeamEventType } from "@/data/calendar-events"
import { assignLanes } from "@/data/calendar-lanes"
import { fmtDateFull } from "@/data/format"
import { dayToneText, holidayName } from "@/data/holidays"
import type { CalendarEvent } from "@/data/sample"
import { MEMBERS } from "@/data/schema"
import { addTeamEvent, deleteTeamEvent, updateTeamEvent, useAppStore } from "@/store/useAppStore"
import { hoverLift } from "@/lib/motion"

const ALL = "__all__"
const UNASSIGNED = "__unassigned__"
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
const ENGLISH_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
/** `origin` 이 있으면 반복 일정의 2회차 이후다. 수정·삭제는 원본을 가리킨다. */
interface CombinedEvent extends CalendarEvent { type: TeamEventType; origin?: CombinedEvent }

interface EventFormState {
  id?: string
  type: TeamEventType
  title: string
  date: string
  endDate: string
  time: string
  endTime: string
  place: string
  owner: string
  note: string
  half: boolean
  repeat: RepeatRule | "none"
  repeatUntil: string
}

/**
 * 반차 판정.
 * 저장된 `half` 가 기준이고, 체크박스가 생기기 전에 넣은 건과 손으로 "반차"라 적은 건을 위해
 * 제목도 같이 본다. 기간이 이틀 이상이면 반차로 보지 않는다.
 */
const isHalfLeave = (event: { type: string; title: string; half?: boolean }): boolean =>
  event.type === "leave" && (Boolean(event.half) || event.title.includes("반차"))

/** 오후 반차면 칸의 오른쪽 절반에 붙인다. 오전이면 왼쪽이다. */
const isAfternoonLeave = (event: { title: string; time?: string }): boolean =>
  event.title.includes("오후") || (event.time ? event.time >= "12:00" : false)

const pad = (value: number) => String(value).padStart(2, "0")
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const startOfWeek = (date: Date) => addDays(date, -date.getDay())

function dateFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return dateKey(date) === key ? date : null
}

const eventEndDate = (event: CombinedEvent): string =>
  event.endDate && event.endDate >= event.date && dateFromKey(event.endDate) ? event.endDate : event.date

function eventDateKeys(event: CombinedEvent): string[] {
  const start = dateFromKey(event.date)
  const end = dateFromKey(eventEndDate(event))
  if (!start || !end || start.getTime() === end.getTime()) return [event.date]
  const keys: string[] = []
  for (let day = start; day.getTime() <= end.getTime(); day = addDays(day, 1)) keys.push(dateKey(day))
  return keys
}

const dottedDate = (key: string): string => key.replaceAll("-", ".")

function selectionPeriodText(start: string, end: string): string {
  if (start !== end) return `${dottedDate(start)} ~ ${dottedDate(end)}`
  const date = dateFromKey(start)
  return `${dottedDate(start)}${date ? ` (${WEEKDAYS[date.getDay()]}요일)` : ""}`
}

function monthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const count = Math.ceil((first.getDay() + lastDay) / 7) * 7
  return Array.from({ length: count }, (_, index) => addDays(first, index - first.getDay()))
}

function weekDays(cursor: Date): Date[] {
  const first = startOfWeek(cursor)
  return Array.from({ length: 7 }, (_, index) => addDays(first, index))
}

function chunkWeeks(days: readonly Date[]): Date[][] {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7))
}

function periodText(mode: "month" | "week", cursor: Date): string {
  if (mode === "month") return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
  const first = startOfWeek(cursor)
  const last = addDays(first, 6)
  return `${first.getFullYear()}.${pad(first.getMonth() + 1)}.${pad(first.getDate())}–${last.getFullYear()}.${pad(last.getMonth() + 1)}.${pad(last.getDate())}`
}

const formStateFor = (start: string, end: string): EventFormState => ({
  type: "meeting",
  title: "",
  date: start,
  endDate: end,
  time: "",
  endTime: "",
  place: "",
  owner: "",
  note: "",
  half: false,
  repeat: "none",
  repeatUntil: "",
})

const formStateFromEvent = (event: CombinedEvent): EventFormState => ({
  id: event.id,
  type: event.type,
  title: event.title,
  date: event.date,
  endDate: event.endDate ?? event.date,
  time: event.time ?? "",
  endTime: event.endTime ?? "",
  place: event.place ?? "",
  owner: event.owner ?? "",
  note: event.note ?? "",
  half: Boolean(event.half),
  repeat: event.repeat ?? "none",
  repeatUntil: event.repeatUntil ?? "",
})

export function Calendar() {
  const events = useAppStore((state) => state.events)
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const [mode, setMode] = useState<"month" | "week">("month")
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [owner, setOwner] = useState(ALL)
  const [selectionStart, setSelectionStart] = useState(todayKey)
  const [selectionEnd, setSelectionEnd] = useState(todayKey)
  const [focusKey, setFocusKey] = useState(todayKey)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<EventFormState>(() => formStateFor(todayKey, todayKey))
  const [formError, setFormError] = useState<"title" | "date" | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const dayRefs = useRef(new Map<string, HTMLDivElement>())
  const focusAfterRender = useRef(false)
  const draggingRef = useRef(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragEventRef = useRef<CombinedEvent | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  const days = mode === "month" ? monthDays(cursor) : weekDays(cursor)
  const weeks = chunkWeeks(days)
  const visibleKeys = days.map(dateKey)
  const rangeFrom = visibleKeys[0] ?? todayKey
  const rangeTo = visibleKeys[visibleKeys.length - 1] ?? todayKey
  // 반복 일정은 보이는 기간 안에서만 펼친다. 저장소에는 원본 1건뿐이다.
  const combined = useMemo<CombinedEvent[]>(() => {
    const base = events.filter((event): event is CombinedEvent => isTeamEventType(event.type))
    return expandRepeats(base, rangeFrom, rangeTo)
      .sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? "").localeCompare(right.time ?? ""))
  }, [events, rangeFrom, rangeTo])
  const filteredEvents = owner === ALL ? combined : combined.filter((event) => event.owner === owner)
  const meetingsByDate = useMemo(() => {
    const grouped = new Map<string, CombinedEvent[]>()
    filteredEvents.filter((event) => event.type === "meeting" || event.type === "external").forEach((event) => {
      eventDateKeys(event).forEach((key) => grouped.set(key, [...(grouped.get(key) ?? []), event]))
    })
    return grouped
  }, [filteredEvents])
  const activeFocusKey = visibleKeys.includes(focusKey) ? focusKey : visibleKeys[0]
  const [selectionFirst, selectionLast] = selectionStart <= selectionEnd ? [selectionStart, selectionEnd] : [selectionEnd, selectionStart]
  const selectedEvents = filteredEvents
    .filter((event) => event.date <= selectionLast && eventEndDate(event) >= selectionFirst)
    .sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? "").localeCompare(right.time ?? ""))
  const visibleEvents = filteredEvents.filter((event) => event.date <= visibleKeys[visibleKeys.length - 1] && eventEndDate(event) >= visibleKeys[0])
  const summary = TEAM_EVENT_TYPES.reduce<Record<TeamEventType, number>>((counts, type) => {
    counts[type] = visibleEvents.filter((event) => event.type === type).length
    return counts
  }, { meeting: 0, external: 0, trip: 0, leave: 0 })

  useEffect(() => {
    if (!focusAfterRender.current) return
    focusAfterRender.current = false
    dayRefs.current.get(activeFocusKey)?.focus()
  }, [activeFocusKey])

  useEffect(() => {
    const finishDrag = () => { draggingRef.current = false }
    window.addEventListener("mouseup", finishDrag)
    return () => window.removeEventListener("mouseup", finishDrag)
  }, [])

  useEffect(() => () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
  }, [])

  const movePeriod = (direction: number) => {
    const next = mode === "month"
      ? new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
      : addDays(cursor, direction * 7)
    focusAfterRender.current = true
    setCursor(next)
    setFocusKey(dateKey(mode === "month" ? new Date(next.getFullYear(), next.getMonth(), 1) : startOfWeek(next)))
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const key = dateKey(days[index])
      setSelectionStart(key)
      setSelectionEnd(key)
      return
    }
    const movement: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const delta = movement[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(days.length - 1, index + delta))
    const targetKey = dateKey(days[target])
    setFocusKey(targetKey)
    dayRefs.current.get(targetKey)?.focus()
  }

  /** 인자가 없으면 지금 고른 기간을 쓴다. 날짜 칸 더블클릭은 그 하루만 넘긴다. */
  const openCreateDialog = (start: string = selectionFirst, end: string = selectionLast) => {
    setForm(formStateFor(start, end))
    setFormError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (event: CombinedEvent) => {
    if (!event.id) return
    // 반복 2회차를 눌러도 원본을 연다. 회차 날짜로 저장하면 반복 시작일이 통째로 옮겨진다.
    setForm(formStateFromEvent(event.origin ?? event))
    setFormError(null)
    setDialogOpen(true)
  }

  /**
   * 일정을 다른 날짜 칸으로 끈다. 기간 일정은 길이를 유지한 채 통째로 옮긴다.
   * 반복 일정의 2회차 이후는 끌 수 없다. 어느 회차를 옮기는지가 애매해진다. 수정 창에서 시작일을 고친다.
   */
  const startEventDrag = (item: CombinedEvent, dragEvent: DragEvent<HTMLElement>) => {
    if (!item.id || item.origin) { dragEvent.preventDefault(); return }
    dragEventRef.current = item
    dragEvent.dataTransfer.effectAllowed = "move"
    dragEvent.dataTransfer.setData("text/plain", item.id)
  }

  const dropEventOn = (key: string) => {
    const item = dragEventRef.current
    dragEventRef.current = null
    setDropKey(null)
    if (!item?.id || key === item.date) return
    const start = dateFromKey(item.date)
    const target = dateFromKey(key)
    if (!start || !target) return
    const end = item.endDate ? dateFromKey(item.endDate) : null
    const spanDays = end && end > start ? Math.round((end.getTime() - start.getTime()) / 86400000) : 0
    updateTeamEvent({ ...item, date: key, endDate: spanDays > 0 ? dateKey(addDays(target, spanDays)) : undefined })
  }

  const saveEvent = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    if (!form.title.trim()) {
      setFormError("title")
      return
    }
    if (form.endDate < form.date) {
      setFormError("date")
      return
    }
    const event: CalendarEvent = {
      ...(form.id ? { id: form.id } : {}),
      type: form.type,
      title: form.title.trim(),
      date: form.date,
      endDate: form.endDate === form.date ? undefined : form.endDate,
      time: form.time || undefined,
      endTime: form.endTime || undefined,
      place: form.place.trim() || undefined,
      owner: form.owner || undefined,
      note: form.note.trim() || undefined,
      half: form.type === "leave" && form.half ? true : undefined,
      repeat: form.repeat === "none" ? undefined : form.repeat,
      repeatUntil: form.repeat === "none" || !form.repeatUntil ? undefined : form.repeatUntil,
    }
    if (form.id) updateTeamEvent(event)
    else addTeamEvent(event)
    setDialogOpen(false)
  }

  const removeEvent = () => {
    if (!form.id) return
    deleteTeamEvent(form.id)
    setDialogOpen(false)
  }

  const requestDelete = (item: CombinedEvent, clickEvent: MouseEvent<HTMLButtonElement>) => {
    clickEvent.stopPropagation()
    if (!item.id) return
    if (pendingDeleteId === item.id) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = null
      setPendingDeleteId(null)
      deleteTeamEvent(item.id)
      return
    }
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setPendingDeleteId(item.id)
    deleteTimerRef.current = setTimeout(() => {
      setPendingDeleteId(null)
      deleteTimerRef.current = null
    }, 3000)
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--muted-foreground)]">CALENDAR</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-5xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]">{cursor.getMonth() + 1}</span>
            <span className="pb-1 text-sm font-semibold tracking-[0.12em] text-[var(--muted-foreground)]">{ENGLISH_MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">미팅 {summary.meeting + summary.external} · 출장 {summary.trip} · 휴가 {summary.leave}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => movePeriod(-1)} aria-label={mode === "month" ? "이전 달" : "이전 주"}><ChevronLeft aria-hidden="true" /></Button>
          <span className="min-w-40 text-center text-sm font-semibold" aria-live="polite">{periodText(mode, cursor)}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => movePeriod(1)} aria-label={mode === "month" ? "다음 달" : "다음 주"}><ChevronRight aria-hidden="true" /></Button>
          <Button type="button" variant="outline" onClick={() => { focusAfterRender.current = true; setCursor(today); setFocusKey(todayKey); setSelectionStart(todayKey); setSelectionEnd(todayKey) }}>오늘</Button>
          <Tabs value={mode} onValueChange={(value) => { focusAfterRender.current = true; setMode(value as "month" | "week"); setFocusKey(todayKey) }}>
            <TabsList aria-label="캘린더 보기"><TabsTrigger value="month">월</TabsTrigger><TabsTrigger value="week">주</TabsTrigger></TabsList>
          </Tabs>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-36" aria-label="담당자 필터"><SelectValue placeholder="전체 담당자" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>전체 담당자</SelectItem>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" onClick={() => openCreateDialog()}><Plus aria-hidden="true" />일정 추가</Button>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-1)]">
          <div className="overflow-x-auto">
            <div className="calendar-diary-lines min-w-[48rem]" role="grid" aria-label={periodText(mode, cursor)} aria-colcount={7}>
              <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--muted)]">
                {WEEKDAYS.map((weekday, index) => <div key={weekday} role="columnheader" className={`p-3 text-center text-xs font-semibold ${index === 0 ? "text-rose-500 dark:text-rose-400" : index === 6 ? "text-sky-500 dark:text-sky-400" : "text-[var(--muted-foreground)]"}`}>{weekday}</div>)}
              </div>
              {weeks.map((week, weekIndex) => {
                const weekKeys = week.map(dateKey)
                // 아래에서부터 출장, 그 위에 휴가를 쌓는다. 미팅은 셀 본문을 위에서부터 채운다.
                const tripLanes = assignLanes(weekKeys, filteredEvents.filter((event) => event.type === "trip"), eventEndDate)
                const leaveLanes = assignLanes(weekKeys, filteredEvents.filter((event) => event.type === "leave"), eventEndDate)
                const laneRows = leaveLanes.laneCount + tripLanes.laneCount
                const laneOverflow = leaveLanes.overflow + tripLanes.overflow
                const rangeBars = [
                  ...leaveLanes.bars.map((bar) => ({ bar, row: bar.lane + 1, tone: "leave" as const })),
                  ...tripLanes.bars.map((bar) => ({ bar, row: leaveLanes.laneCount + bar.lane + 1, tone: "trip" as const })),
                ]
                return (
                  <div key={weekKeys[0]} className="relative">
                    <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-20 grid grid-cols-7 gap-px px-1" style={{ gridAutoRows: "20px", rowGap: 2 }}>
                      {rangeBars.map(({ bar, row, tone }, barIndex) => {
                        const item = bar.event
                        // 반차는 하루의 절반만 차지한다. 오후면 오른쪽에 붙여 시간 흐름과 맞춘다.
                        const half = tone === "leave" && bar.span === 1 && isHalfLeave(item)
                        const afternoon = half && isAfternoonLeave(item)
                        return (
                          <div
                            key={`${item.id ?? item.title}-${barIndex}`}
                            role={item.id ? "button" : undefined}
                            tabIndex={item.id ? 0 : undefined}
                            onClick={() => openEditDialog(item)}
                            onKeyDown={(event) => { if (item.id && (event.key === "Enter" || event.key === " ")) openEditDialog(item) }}
                            onDoubleClick={(event) => event.stopPropagation()}
                            style={{
                              animationDelay: `${bar.lane * 40}ms`,
                              background: tone === "trip"
                                ? "linear-gradient(90deg, hsl(0 74% 45%), hsl(14 90% 60%))"
                                : "linear-gradient(90deg, hsl(160 84% 30%), hsl(150 72% 48%))",
                              gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                              gridRow: row,
                              ...(half ? { width: "50%", justifySelf: afternoon ? "end" : "start" } : null),
                            }}
                            draggable={Boolean(item.id) && !item.origin}
                            onDragStart={(dragEvent) => startEventDrag(item, dragEvent)}
                            className={`group pointer-events-auto relative flex h-5 min-w-0 items-center px-2 text-[10px] font-semibold text-white shadow-sm diary-trip-draw motion-reduce:animate-none ${item.id ? "cursor-pointer" : ""} ${half ? "rounded-full" : `${bar.isStart ? "rounded-l-full" : "rounded-l-none"} ${bar.isEnd ? "rounded-r-full" : "rounded-r-none"}`}`}
                          >
                            {bar.isStart ? <span className="truncate pr-5">{pendingDeleteId === item.id ? "삭제?" : `${item.title}${item.owner ? ` · ${item.owner}` : ""}`}</span> : null}
                            {item.id ? <button type="button" onClick={(event) => requestDelete(item, event)} aria-label={pendingDeleteId === item.id ? `${item.title} 삭제 확인` : `${item.title} 삭제`} className={`absolute right-1 inline-flex size-4 items-center justify-center rounded-full bg-black/25 text-white transition-opacity motion-reduce:transition-none ${pendingDeleteId === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><X aria-hidden="true" className="size-3" /></button> : null}
                          </div>
                        )
                      })}
                    </div>
                    {laneOverflow ? <span className="absolute bottom-1.5 right-2 z-30 rounded-full bg-[var(--muted)] px-1.5 text-[10px] font-semibold text-[var(--muted-foreground)]">+{laneOverflow}</span> : null}
                    <div className="grid grid-cols-7">
                      {week.map((day, dayIndex) => {
                        const index = weekIndex * 7 + dayIndex
                        const key = dateKey(day)
                        const meetings = meetingsByDate.get(key) ?? []
                        const visibleMeetings = mode === "month" ? meetings.slice(0, 2) : meetings
                        const dayEventCount = filteredEvents.filter((item) => item.date <= key && eventEndDate(item) >= key).length
                        const otherMonth = mode === "month" && day.getMonth() !== cursor.getMonth()
                        const holiday = holidayName(key)
                        const selected = key >= selectionFirst && key <= selectionLast
                        return (
                          <div
                            key={key}
                            ref={(node) => { if (node) dayRefs.current.set(key, node); else dayRefs.current.delete(key) }}
                            role="gridcell"
                            tabIndex={key === activeFocusKey ? 0 : -1}
                            aria-selected={selected}
                            aria-label={`${fmtDateFull(day)} ${WEEKDAYS[day.getDay()]}요일${holiday ? `, ${holiday}` : ""}, 일정 ${dayEventCount}건`}
                            onFocus={() => setFocusKey(key)}
                            onKeyDown={(event) => moveFocus(event, index)}
                            onMouseDown={(event) => {
                              if (event.button !== 0) return
                              draggingRef.current = true
                              setFocusKey(key)
                              setSelectionStart(key)
                              setSelectionEnd(key)
                            }}
                            onMouseEnter={() => { if (draggingRef.current) setSelectionEnd(key) }}
                            onDoubleClick={() => { draggingRef.current = false; openCreateDialog(key, key) }}
                            onDragOver={(dragEvent) => { if (!dragEventRef.current) return; dragEvent.preventDefault(); dragEvent.dataTransfer.dropEffect = "move"; if (dropKey !== key) setDropKey(key) }}
                            onDragLeave={() => { if (dropKey === key) setDropKey(null) }}
                            onDrop={(dragEvent) => { dragEvent.preventDefault(); dropEventOn(key) }}
                            style={{ animationDelay: `${Math.min(index * 8, 240)}ms`, paddingTop: 38, paddingBottom: 10 + laneRows * 22 }}
                            className={`diary-cell-in relative min-h-[10.375rem] cursor-cell select-none border-b border-r border-[var(--border)] p-2 text-left align-top outline-none motion-reduce:animate-none hover:bg-[var(--accent)] focus-visible:ring-inset focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${mode === "week" ? "min-h-[23rem]" : ""} ${otherMonth ? "bg-[color-mix(in_srgb,var(--muted)_78%,transparent)] text-[var(--muted-foreground)]" : "bg-[color-mix(in_srgb,var(--card)_88%,transparent)]"} ${selected ? "ring-2 ring-inset ring-[var(--primary)]" : ""} ${key === todayKey ? "diary-today-pulse" : ""} ${dropKey === key ? "ring-2 ring-inset ring-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : ""}`}
                          >
                            {key === selectionFirst ? <span aria-hidden="true" className="absolute left-2 top-0 z-30 h-3.5 w-11 -translate-y-1/2 rotate-[-2deg] bg-[color-mix(in_srgb,var(--warning)_45%,transparent)]" /> : null}
                            {key === selectionLast ? <span aria-hidden="true" className="absolute right-2 top-0 z-30 h-3.5 w-11 -translate-y-1/2 rotate-[2deg] bg-[color-mix(in_srgb,var(--warning)_45%,transparent)]" /> : null}
                            <span className="pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center gap-1">
                              <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-medium ${key === todayKey ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : dayToneText(day)}`}>{day.getDate()}</span>
                              {holiday ? <span className="text-[10px] text-[var(--muted-foreground)]">{holiday}</span> : null}
                            </span>
                            <div className="relative z-10 grid gap-1.5">
                              {visibleMeetings.map((item, itemIndex) => (
                                <div
                                  key={`${item.id ?? item.title}-${itemIndex}`}
                                  role={item.id ? "button" : undefined}
                                  tabIndex={item.id ? 0 : undefined}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onDoubleClick={(event) => event.stopPropagation()}
                                  onClick={() => openEditDialog(item)}
                                  onKeyDown={(event) => { if (item.id && (event.key === "Enter" || event.key === " ")) openEditDialog(item) }}
                                  draggable={Boolean(item.id) && !item.origin}
                                  onDragStart={(dragEvent) => startEventDrag(item, dragEvent)}
                                  style={{ borderLeftColor: item.type === "external" ? "var(--chart-1)" : "var(--chart-2)" }}
                                  className={`group relative min-w-0 rounded-[calc(var(--radius)-2px)] border border-l-[3px] bg-[var(--card)] px-2 py-1.5 shadow-sm ${item.id ? `cursor-pointer ${hoverLift}` : ""} ${item.type === "external" ? "border-dashed border-[var(--chart-1)]" : "border-solid border-[var(--chart-2)]"}`}
                                >
                                  <div className="truncate pr-5 text-xs font-semibold text-[var(--foreground)]">{item.time ? <span className="mr-1 tabular-nums text-[var(--muted-foreground)]">{item.time}</span> : null}{pendingDeleteId === item.id ? "삭제?" : item.title}{item.repeat ? <Repeat aria-label="반복 일정" className="ml-1 inline size-3 align-[-1px] text-[var(--muted-foreground)]" /> : null}</div>
                                  <div className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">{[item.place, item.owner ? `담당 ${item.owner}` : ""].filter(Boolean).join(" · ") || TEAM_EVENT_META[item.type].label}</div>
                                  {item.id ? <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => requestDelete(item, event)} aria-label={pendingDeleteId === item.id ? `${item.title} 삭제 확인` : `${item.title} 삭제`} className={`absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] transition-opacity hover:text-[var(--destructive)] motion-reduce:transition-none ${pendingDeleteId === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}><X aria-hidden="true" className="size-3" /></button> : null}
                                </div>
                              ))}
                              {mode === "month" && meetings.length > 2 ? <span className="text-xs font-semibold text-[var(--muted-foreground)]">+{meetings.length - 2}건</span> : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="relative self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-1)] xl:sticky xl:top-4">
          <span aria-hidden="true" className="absolute left-1/2 top-0 h-4 w-20 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] bg-[color-mix(in_srgb,var(--warning)_45%,transparent)]" />
          <span aria-hidden="true" className="absolute -left-2 top-16 size-4 rounded-full bg-[var(--muted)] ring-1 ring-[var(--border)]" />
          <span aria-hidden="true" className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-[var(--muted)] ring-1 ring-[var(--border)]" />
          <span aria-hidden="true" className="absolute -left-2 bottom-16 size-4 rounded-full bg-[var(--muted)] ring-1 ring-[var(--border)]" />
          <div className="border-b border-dashed border-[var(--border)] px-5 pb-4 pt-6">
            <h2 className="font-semibold text-[var(--foreground)]">선택 기간의 일정</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{selectionPeriodText(selectionFirst, selectionLast)} · 총 {selectedEvents.length.toLocaleString("ko-KR")}건</p>
          </div>
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            {selectedEvents.length ? (
              <ul>
                {selectedEvents.map((item, index) => {
                  const end = eventEndDate(item)
                  return (
                    <li key={`${item.id ?? item.title}-${index}`} className="group relative border-b border-dashed border-[var(--border)] p-4 last:border-b-0">
                      <button type="button" disabled={!item.id} onClick={() => openEditDialog(item)} className={`w-full pr-8 text-left disabled:cursor-default ${item.id ? hoverLift : ""}`}>
                        <span className="block text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">{dottedDate(item.date)}{end > item.date ? ` ~ ${dottedDate(end)}` : ""}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={TEAM_EVENT_META[item.type].chip}>{TEAM_EVENT_META[item.type].label}</Badge><strong className="text-sm text-[var(--foreground)]">{pendingDeleteId === item.id ? "삭제?" : item.title}</strong></span>
                        <span className="mt-2 block text-xs text-[var(--muted-foreground)]">{[item.time ?? "종일", item.endTime ? `~ ${item.endTime}` : "", item.place, item.owner ? `담당 ${item.owner}` : ""].filter(Boolean).join(" · ")}</span>
                        {item.note ? <span className="mt-1 block text-xs text-[var(--muted-foreground)]">{item.note}</span> : null}
                      </button>
                      {item.id ? <button type="button" onClick={(event) => requestDelete(item, event)} aria-label={pendingDeleteId === item.id ? `${item.title} 삭제 확인` : `${item.title} 삭제`} className={`absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none ${pendingDeleteId === item.id ? "border-[var(--destructive)] bg-[var(--destructive)] text-white" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--destructive)]"}`}>{pendingDeleteId === item.id ? <span className="text-[10px] font-bold">확인</span> : <Trash2 aria-hidden="true" className="size-3.5" />}</button> : null}
                    </li>
                  )
                })}
              </ul>
            ) : <div className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-[var(--muted-foreground)]"><CalendarDays aria-hidden="true" className="mr-2 size-4" />등록된 일정이 없습니다.</div>}
          </div>
        </aside>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={saveEvent}>
            <DialogHeader><DialogTitle>{form.id ? "일정 수정" : "일정 추가"}</DialogTitle></DialogHeader>
            <DialogBody className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="calendar-event-type">유형</Label>
                <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as TeamEventType }))}>
                  <SelectTrigger id="calendar-event-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TEAM_EVENT_TYPES.map((type) => <SelectItem key={type} value={type}>{TEAM_EVENT_META[type].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="calendar-event-title">제목 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label>
                <Input id="calendar-event-title" value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); if (formError === "title") setFormError(null) }} className={formError === "title" ? "border-[var(--destructive)] ring-1 ring-[var(--destructive)]" : ""} aria-invalid={formError === "title"} />
                {formError === "title" ? <p className="text-xs text-[var(--destructive)]">제목을 입력해 주세요.</p> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="calendar-event-date">시작일</Label><Input id="calendar-event-date" type="date" required value={form.date} onChange={(event) => { setForm((current) => ({ ...current, date: event.target.value })); if (formError === "date") setFormError(null) }} /></div>
                <div className="grid gap-2"><Label htmlFor="calendar-event-end-date">종료일</Label><Input id="calendar-event-end-date" type="date" required value={form.endDate} onChange={(event) => { setForm((current) => ({ ...current, endDate: event.target.value })); if (formError === "date") setFormError(null) }} className={formError === "date" ? "border-[var(--destructive)] ring-1 ring-[var(--destructive)]" : ""} aria-invalid={formError === "date"} />{formError === "date" ? <p className="text-xs text-[var(--destructive)]">종료일은 시작일보다 빠를 수 없습니다.</p> : null}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="calendar-event-time">시작시간</Label><Input id="calendar-event-time" type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} /></div>
                <div className="grid gap-2"><Label htmlFor="calendar-event-end-time">종료시간</Label><Input id="calendar-event-end-time" type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="calendar-event-place">장소</Label><Input id="calendar-event-place" value={form.place} onChange={(event) => setForm((current) => ({ ...current, place: event.target.value }))} /></div>
                <div className="grid gap-2"><Label htmlFor="calendar-event-owner">담당</Label><Select value={form.owner || UNASSIGNED} onValueChange={(value) => setForm((current) => ({ ...current, owner: value === UNASSIGNED ? "" : value }))}><SelectTrigger id="calendar-event-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={UNASSIGNED}>미지정</SelectItem>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              {form.type === "leave" ? (
                <label htmlFor="calendar-event-half" className="flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm">
                  <input id="calendar-event-half" type="checkbox" checked={form.half} onChange={(event) => setForm((current) => ({ ...current, half: event.target.checked }))} className="size-4 accent-[hsl(160_84%_33%)]" />
                  반차
                  <span className="text-xs text-[var(--muted-foreground)]">달력에 라인을 반만 그립니다</span>
                </label>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="calendar-event-repeat">반복</Label>
                  <Select value={form.repeat} onValueChange={(value) => setForm((current) => ({ ...current, repeat: value as EventFormState["repeat"] }))}>
                    <SelectTrigger id="calendar-event-repeat"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">반복 안 함</SelectItem>
                      {(Object.keys(REPEAT_LABELS) as RepeatRule[]).map((rule) => <SelectItem key={rule} value={rule}>{REPEAT_LABELS[rule]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.repeat === "none" ? null : (
                  <div className="grid gap-2">
                    <Label htmlFor="calendar-event-repeat-until">반복 종료일</Label>
                    <Input id="calendar-event-repeat-until" type="date" value={form.repeatUntil} onChange={(event) => setForm((current) => ({ ...current, repeatUntil: event.target.value }))} />
                    <p className="text-xs text-[var(--muted-foreground)]">비우면 계속 반복합니다. 지우면 반복 전체가 지워집니다.</p>
                  </div>
                )}
              </div>
              <div className="grid gap-2"><Label htmlFor="calendar-event-note">메모</Label><textarea id="calendar-event-note" rows={4} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className="w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none placeholder:text-[var(--muted-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]" /></div>
            </DialogBody>
            <DialogFooter className="justify-between">
              <div>{form.id ? <Button type="button" variant="destructive" onClick={removeEvent}><Trash2 aria-hidden="true" />삭제</Button> : null}</div>
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button type="submit">저장</Button></div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
