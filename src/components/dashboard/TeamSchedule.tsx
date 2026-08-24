import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Magnetic } from "@/components/motion/Magnetic"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { dayToneText, holidayName } from "@/data/holidays"
import type { CalendarEvent, EventType } from "@/data/sample"
import { MEMBERS } from "@/data/schema"
import { addTeamEvent, deleteTeamEvent, useAppStore } from "@/store/useAppStore"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const
const TEAM_EVENT_TYPES = ["meeting", "leave", "external", "trip"] as const
type TeamEventType = (typeof TEAM_EVENT_TYPES)[number]

const CATEGORY_META: Record<TeamEventType, { label: string; dot: string; chip: string }> = {
  meeting: { label: "미팅", dot: "bg-[var(--chart-2)]", chip: "border-[var(--chart-2)] text-[var(--chart-2)]" },
  leave: { label: "연차", dot: "bg-[var(--chart-4)]", chip: "border-[var(--chart-4)] text-[var(--chart-4)]" },
  external: { label: "외근", dot: "bg-[var(--chart-1)]", chip: "border-[var(--chart-1)] text-[var(--chart-1)]" },
  trip: { label: "출장", dot: "bg-[var(--chart-3)]", chip: "border-[var(--chart-3)] text-[var(--chart-3)]" },
}

interface TeamEvent extends CalendarEvent {
  type: TeamEventType
}

interface EventFormState {
  date: string
  endDate: string
  type: TeamEventType
  owner: string
  title: string
  time: string
  place: string
}

const pad = (value: number): string => String(value).padStart(2, "0")
const dateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

function dateFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return dateKey(date) === key ? date : null
}

const eventEndDate = (event: CalendarEvent): string =>
  event.endDate && event.endDate >= event.date && dateFromKey(event.endDate) ? event.endDate : event.date
const isRangeEvent = (event: CalendarEvent): boolean => eventEndDate(event) > event.date
const dottedDate = (key: string): string => key.replaceAll("-", ".")

function selectionPeriodText(start: string, end: string): string {
  const startText = `${Number(start.slice(5, 7))}.${Number(start.slice(8, 10))}`
  if (start !== end) return `${startText} ~ ${Number(end.slice(5, 7))}.${Number(end.slice(8, 10))}`
  return `${Number(start.slice(5, 7))}월 ${Number(start.slice(8, 10))}일`
}

function eventDateKeys(event: CalendarEvent): string[] {
  const start = dateFromKey(event.date)
  const end = dateFromKey(eventEndDate(event))
  if (!start || !end || start.getTime() === end.getTime()) return [event.date]
  const keys: string[] = []
  for (let day = start; day.getTime() <= end.getTime(); day = addDays(day, 1)) keys.push(dateKey(day))
  return keys
}

function monthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const count = Math.ceil((first.getDay() + lastDay) / 7) * 7
  return Array.from({ length: count }, (_, index) => addDays(first, index - first.getDay()))
}

const isTeamEventType = (type: EventType): type is TeamEventType =>
  TEAM_EVENT_TYPES.includes(type as TeamEventType)

const formStateFor = (date: string): EventFormState => ({
  date,
  endDate: "",
  type: "meeting",
  owner: MEMBERS[0]?.name ?? "",
  title: "",
  time: "",
  place: "",
})

export function TeamSchedule() {
  const events = useAppStore((state) => state.events)
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectionStart, setSelectionStart] = useState(todayKey)
  const [selectionEnd, setSelectionEnd] = useState(todayKey)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<EventFormState>(() => formStateFor(todayKey))
  const draggingRef = useRef(false)

  const teamEvents = useMemo<TeamEvent[]>(() => events
    .filter((event): event is TeamEvent => isTeamEventType(event.type))
    .sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? "").localeCompare(right.time ?? "")), [events])
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, TeamEvent[]>()
    teamEvents.forEach((event) => {
      eventDateKeys(event).forEach((key) => grouped.set(key, [...(grouped.get(key) ?? []), event]))
    })
    return grouped
  }, [teamEvents])
  const [selFirst, selLast] = selectionStart <= selectionEnd
    ? [selectionStart, selectionEnd]
    : [selectionEnd, selectionStart]
  const selectedEvents = teamEvents
    .filter((event) => event.date <= selLast && eventEndDate(event) >= selFirst)
    .sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? "").localeCompare(right.time ?? ""))
  const days = monthDays(cursor)

  useEffect(() => {
    const finishDrag = () => { draggingRef.current = false }
    window.addEventListener("mouseup", finishDrag)
    return () => window.removeEventListener("mouseup", finishDrag)
  }, [])

  const moveMonth = (direction: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))
  }

  const selectToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectionStart(todayKey)
    setSelectionEnd(todayKey)
  }

  const openForm = () => {
    setForm(formStateFor(selFirst))
    setSheetOpen(true)
  }

  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    setSelectionStart(key)
    setSelectionEnd(key)
  }

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!form.date || !form.type || !form.owner || !title) return
    addTeamEvent({
      date: form.date,
      endDate: form.endDate || undefined,
      type: form.type,
      owner: form.owner,
      title,
      time: form.time || undefined,
      place: form.place.trim() || undefined,
    })
    const [year, month] = form.date.split("-").map(Number)
    setCursor(new Date(year, month - 1, 1))
    setSelectionStart(form.date)
    setSelectionEnd(form.date)
    setSheetOpen(false)
  }

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden rounded-[12px] border-white/70 bg-white/55 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_-22px_rgba(15,23,42,0.16)] backdrop-blur-md [--hover-lift:0px] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_-22px_rgba(15,23,42,0.16)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/95" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--chart-4)] to-[var(--gradient-3)] text-white shadow-[0_7px_18px_-6px_rgba(139,92,246,0.65)]"><CalendarDays className="size-4" aria-hidden="true" /></span>
          <div><h2 className="text-base font-semibold text-[var(--foreground)]">팀 일정</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">미팅·연차·외근·출장 공유</p></div>
        </div>
        <Button type="button" size="sm" onClick={openForm}><Plus aria-hidden="true" />일정 추가</Button>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2" aria-label="팀 일정 구분 범례">
        {TEAM_EVENT_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-2 py-1 text-[11px] text-[var(--muted-foreground)] shadow-sm backdrop-blur">
            <span aria-hidden="true" className={`size-2 rounded-full ${CATEGORY_META[type].dot}`} />
            {CATEGORY_META[type].label}
          </span>
        ))}
      </div>

      <div className="relative mt-4 rounded-[11px] border border-white/80 bg-white/55 p-2 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight aria-hidden="true" /></Button>
          </div>
          <strong className="text-sm text-[var(--foreground)]" aria-live="polite">{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</strong>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={selectToday}>오늘</Button>
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label={`${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월 팀 일정`}>
          {WEEKDAYS.map((weekday, index) => <div key={weekday} role="columnheader" className={`py-1 text-center text-[10px] font-medium ${index === 0 ? "text-rose-500 dark:text-rose-400" : index === 6 ? "text-sky-500 dark:text-sky-400" : "text-[var(--muted-foreground)]"}`}>{weekday}</div>)}
          {days.map((day) => {
            const key = dateKey(day)
            const dayEvents = eventsByDate.get(key) ?? []
            const extraCount = Math.max(0, dayEvents.length - 3)
            const otherMonth = day.getMonth() !== cursor.getMonth()
            const selected = key >= selFirst && key <= selLast
            const boundary = key === selFirst || key === selLast
            const holiday = holidayName(key)
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-pressed={selected}
                aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일${holiday ? `, ${holiday}` : ""}, 팀 일정 ${dayEvents.length}건`}
                onKeyDown={(event) => selectWithKeyboard(event, key)}
                onMouseDown={(event) => {
                  if (event.button !== 0) return
                  draggingRef.current = true
                  setSelectionStart(key)
                  setSelectionEnd(key)
                }}
                onMouseEnter={() => { if (draggingRef.current) setSelectionEnd(key) }}
                className={`relative flex min-h-12 select-none flex-col items-center rounded-[calc(var(--radius)-2px)] px-0.5 py-1 text-xs outline-none hover:bg-[var(--accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected ? "bg-[var(--accent)]" : ""} ${boundary ? "ring-2 ring-[var(--primary)]" : ""} ${otherMonth ? "text-[var(--muted-foreground)] opacity-45" : "text-[var(--foreground)]"}`}
              >
                <span className={`inline-flex size-5 items-center justify-center rounded-full text-[13px] ${key === todayKey ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : dayToneText(day)}`}>{day.getDate()}</span>
                {holiday ? <span className="max-w-full truncate text-[8px] leading-none text-[var(--muted-foreground)]">{holiday}</span> : null}
                <span className="mt-1 flex min-h-2 items-center justify-center gap-0.5">
                  {dayEvents.slice(0, 3).map((item, index) => <span key={`${item.id ?? item.title}-${index}`} aria-hidden="true" title={`${CATEGORY_META[item.type].label}${isRangeEvent(item) ? ` · ${item.date}~${eventEndDate(item)}` : ""}`} className={`h-1.5 ${isRangeEvent(item) ? "w-3.5 rounded-sm" : "w-2.5 rounded-full"} ${CATEGORY_META[item.type].dot}`} />)}
                  {extraCount ? <span className="text-[9px] font-medium text-[var(--muted-foreground)]">+{extraCount}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative mt-4 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{selectionPeriodText(selFirst, selLast)}</h3>
          <Badge variant="secondary">{selectedEvents.length}건</Badge>
        </div>
        <div className="min-h-32 flex-1 overflow-y-auto py-2 xl:min-h-0">
          {selectedEvents.length ? (
            <ul className="grid gap-2">
              {selectedEvents.map((item, index) => (
                <li key={item.id ?? `${item.date}-${item.title}-${index}`} className="min-w-0">
                  <Magnetic strength={7} lift={5} tilt={2} className="flex items-start gap-2 rounded-[10px] border border-white/80 bg-white/58 p-2.5 shadow-[0_7px_18px_-18px_rgba(15,23,42,0.16)] backdrop-blur transition-[box-shadow] duration-[var(--t-lift)] ease-[var(--e-soft)] hover:shadow-[0_12px_22px_-16px_rgba(15,23,42,0.22)] motion-reduce:transition-none">
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${CATEGORY_META[item.type].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">{dottedDate(item.date)}{isRangeEvent(item) ? `~${dottedDate(eventEndDate(item))}` : ""}</span>
                      <Badge variant="outline" className={CATEGORY_META[item.type].chip}>{CATEGORY_META[item.type].label}</Badge>
                      {item.owner ? <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{item.owner}</span> : null}
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--foreground)]">{item.title}</p>
                    {item.time || item.place ? <p className="mt-1 truncate text-[11px] text-[var(--muted-foreground)]">{[item.time, item.place].filter(Boolean).join(" · ")}</p> : null}
                  </div>
                  {item.id ? <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`${item.title} 일정 삭제`} onClick={() => deleteTeamEvent(item.id!)}><X aria-hidden="true" /></Button> : null}
                  </Magnetic>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-full min-h-28 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">선택 기간에 등록된 팀 일정이 없습니다.</div>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
        <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--card)] sm:max-w-md">
          <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
            <SheetTitle className="text-[var(--foreground)]">팀 일정 추가</SheetTitle>
            <SheetDescription className="text-[var(--muted-foreground)]">미팅·연차·외근·출장 계획을 이 브라우저에 저장합니다.</SheetDescription>
          </SheetHeader>
          <form className="grid gap-5 p-6" onSubmit={submitEvent}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="team-event-date">시작일</Label><Input id="team-event-date" type="date" required value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="team-event-end-date">종료일 <span className="font-normal text-[var(--muted-foreground)]">(선택)</span></Label><Input id="team-event-end-date" type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="team-event-type">구분</Label><Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as TeamEventType }))}><SelectTrigger id="team-event-type"><SelectValue /></SelectTrigger><SelectContent>{TEAM_EVENT_TYPES.map((type) => <SelectItem key={type} value={type}>{CATEGORY_META[type].label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="team-event-owner">담당자</Label><Select value={form.owner} onValueChange={(value) => setForm((current) => ({ ...current, owner: value }))}><SelectTrigger id="team-event-owner"><SelectValue placeholder="담당자 선택" /></SelectTrigger><SelectContent>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="team-event-title">제목</Label><Input id="team-event-title" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="일정 제목" /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="team-event-time">시간 <span className="font-normal text-[var(--muted-foreground)]">(선택)</span></Label><Input id="team-event-time" type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="team-event-place">장소 <span className="font-normal text-[var(--muted-foreground)]">(선택)</span></Label><Input id="team-event-place" value={form.place} onChange={(event) => setForm((current) => ({ ...current, place: event.target.value }))} placeholder="회의실·방문처" /></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-5"><Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>취소</Button><Button type="submit">저장</Button></div>
          </form>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
