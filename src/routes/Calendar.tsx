import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtDateFull, toDate } from "@/data/format"
import { MEMBERS } from "@/data/schema"
import { useAppStore } from "@/store/useAppStore"
import { hoverLift } from "@/lib/motion"

const ALL = "__all__"
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]
type CalendarType = "meeting" | "due" | "external" | "leave" | "trip"
interface CombinedEvent { date: string; type: CalendarType; title: string; time?: string; place?: string; owner?: string }

const TYPE_META: Record<CalendarType, { label: string; dot: string; chip: string }> = {
  meeting: { label: "미팅", dot: "bg-[var(--chart-2)]", chip: "border-[var(--chart-2)] text-[var(--foreground)]" },
  due: { label: "납기", dot: "bg-[var(--chart-3)]", chip: "border-[var(--chart-3)] text-[var(--foreground)]" },
  external: { label: "외부", dot: "bg-[var(--chart-1)]", chip: "border-[var(--chart-1)] text-[var(--foreground)]" },
  leave: { label: "휴가", dot: "bg-[var(--muted-foreground)]", chip: "border-[var(--border)] text-[var(--muted-foreground)]" },
  trip: { label: "출장", dot: "bg-[var(--chart-3)]", chip: "border-[var(--chart-3)] text-[var(--foreground)]" },
}

const pad = (value: number) => String(value).padStart(2, "0")
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const startOfWeek = (date: Date) => addDays(date, -date.getDay())

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

function periodText(mode: "month" | "week", cursor: Date): string {
  if (mode === "month") return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
  const first = startOfWeek(cursor)
  const last = addDays(first, 6)
  return `${first.getFullYear()}.${pad(first.getMonth() + 1)}.${pad(first.getDate())}–${last.getFullYear()}.${pad(last.getMonth() + 1)}.${pad(last.getDate())}`
}

export function Calendar() {
  const records = useAppStore((state) => state.records)
  const events = useAppStore((state) => state.events)
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const [mode, setMode] = useState<"month" | "week">("month")
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [owner, setOwner] = useState(ALL)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(todayKey)
  const dayRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusAfterRender = useRef(false)

  const combined = useMemo<CombinedEvent[]>(() => {
    const fixed = events.map((event) => ({ ...event, type: event.type as CalendarType }))
    const deadlines = records.flatMap((record) => {
      const date = toDate(record.dueDate)
      return date ? [{ date: dateKey(date), type: "due" as const, title: `${record.styleNo} 납기`, owner: record.owner }] : []
    })
    const combinedEvents: CombinedEvent[] = [...fixed, ...deadlines]
    return combinedEvents.sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? "").localeCompare(right.time ?? ""))
  }, [events, records])
  const filteredEvents = owner === ALL ? combined : combined.filter((event) => event.owner === owner)
  const byDate = useMemo(() => {
    const grouped = new Map<string, CombinedEvent[]>()
    filteredEvents.forEach((event) => grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]))
    return grouped
  }, [filteredEvents])
  const days = mode === "month" ? monthDays(cursor) : weekDays(cursor)
  const visibleKeys = days.map(dateKey)
  const activeFocusKey = visibleKeys.includes(focusKey) ? focusKey : visibleKeys[0]
  const selectedEvents = selectedKey ? byDate.get(selectedKey) ?? [] : []

  useEffect(() => {
    if (!focusAfterRender.current) return
    focusAfterRender.current = false
    dayRefs.current.get(activeFocusKey)?.focus()
  }, [activeFocusKey])

  const movePeriod = (direction: number) => {
    const next = mode === "month"
      ? new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
      : addDays(cursor, direction * 7)
    focusAfterRender.current = true
    setCursor(next)
    setFocusKey(dateKey(mode === "month" ? new Date(next.getFullYear(), next.getMonth(), 1) : startOfWeek(next)))
    setSelectedKey(null)
  }

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const movement: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const delta = movement[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(days.length - 1, index + delta))
    const targetKey = dateKey(days[target])
    setFocusKey(targetKey)
    dayRefs.current.get(targetKey)?.focus()
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="CALENDAR"
        subtitle="미팅, 납기와 외부 일정을 한 흐름으로 확인합니다."
        actions={(
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" onClick={() => movePeriod(-1)} aria-label={mode === "month" ? "이전 달" : "이전 주"}><ChevronLeft aria-hidden="true" /></Button>
            <span className="min-w-40 text-center text-sm font-semibold" aria-live="polite">{periodText(mode, cursor)}</span>
            <Button type="button" variant="outline" size="icon" onClick={() => movePeriod(1)} aria-label={mode === "month" ? "다음 달" : "다음 주"}><ChevronRight aria-hidden="true" /></Button>
            <Button type="button" variant="outline" onClick={() => { focusAfterRender.current = true; setCursor(today); setFocusKey(todayKey) }}>오늘</Button>
          </div>
        )}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={mode} onValueChange={(value) => { focusAfterRender.current = true; setMode(value as "month" | "week"); setFocusKey(todayKey) }}>
          <TabsList aria-label="캘린더 보기"><TabsTrigger value="month">월 보기</TabsTrigger><TabsTrigger value="week">주 보기</TabsTrigger></TabsList>
        </Tabs>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-full sm:w-44" aria-label="담당자 필터"><SelectValue placeholder="전체 담당자" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>전체 담당자</SelectItem>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-4" aria-label="일정 유형 범례">
        {(Object.keys(TYPE_META) as CalendarType[]).map((type) => <span key={type} className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><span aria-hidden="true" className={`size-2 rounded-full ${TYPE_META[type].dot}`} />{TYPE_META[type].label}</span>)}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <SectionCard title={mode === "month" ? "월간 일정" : "주간 일정"} subtitle="날짜를 선택하면 그날의 전체 일정을 확인할 수 있습니다." contentClassName="p-0" revealDelay={0}>
          <div className="overflow-x-auto">
            <div className="min-w-[48rem]" role="grid" aria-label={periodText(mode, cursor)} aria-colcount={7}>
              <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--muted)]">
                {WEEKDAYS.map((weekday) => <div key={weekday} role="columnheader" className="p-3 text-center text-xs font-semibold text-[var(--muted-foreground)]">{weekday}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day, index) => {
                  const key = dateKey(day)
                  const items = byDate.get(key) ?? []
                  const visible = mode === "month" ? items.slice(0, 3) : items
                  const otherMonth = mode === "month" && day.getMonth() !== cursor.getMonth()
                  return (
                    <button
                      key={key}
                      ref={(node) => { if (node) dayRefs.current.set(key, node); else dayRefs.current.delete(key) }}
                      type="button"
                      role="gridcell"
                      tabIndex={key === activeFocusKey ? 0 : -1}
                      aria-label={`${fmtDateFull(day)} ${WEEKDAYS[day.getDay()]}요일, 일정 ${items.length}건`}
                      onFocus={() => setFocusKey(key)}
                      onKeyDown={(event) => moveFocus(event, index)}
                      onClick={() => setSelectedKey(key)}
                      className={`min-h-32 border-b border-r border-[var(--border)] p-2 text-left align-top outline-none hover:bg-[var(--accent)] focus-visible:ring-inset focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${otherMonth ? "bg-[var(--muted)] text-[var(--muted-foreground)] opacity-60" : "bg-[var(--card)]"}`}
                    >
                      <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-medium ${key === todayKey ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--foreground)]"}`}>{day.getDate()}</span>
                      <span className="mt-2 grid gap-1">
                        {visible.map((item, itemIndex) => <span key={`${item.title}-${itemIndex}`} className={`block truncate rounded-[calc(var(--radius)-2px)] border px-1.5 py-1 text-xs ${TYPE_META[item.type].chip}`}>{item.time ? `${item.time} ` : ""}{item.title}</span>)}
                        {mode === "month" && items.length > 3 ? <span className="text-xs font-medium text-[var(--muted-foreground)]">+<NumberTicker value={items.length - 3} suffix="건" /></span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="메일에서 뽑아낸 일정" subtitle="확인 대기" revealDelay={75}>
          <div className="flex min-h-28 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">연결 예정 — 주간 미팅 요약 메일에서 일정을 가져옵니다.</div>
          <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="메일 일정 반영 흐름">
            {["추출", "확인", "반영"].map((label, index) => <li key={label} className="rounded-[var(--radius)] bg-[var(--muted)] p-3 text-center text-xs text-[var(--foreground)]"><span className="mb-1 block font-semibold">{index + 1}</span>{label}</li>)}
          </ol>
        </SectionCard>
      </div>

      <Sheet open={Boolean(selectedKey)} onOpenChange={(open) => { if (!open) setSelectedKey(null) }}>
        <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-lg">
          <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
            <SheetTitle>{selectedKey ? fmtDateFull(selectedKey) : "일정"}</SheetTitle>
            <SheetDescription>등록 일정 <NumberTicker value={selectedEvents.length} suffix="건" /></SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 p-6">
            {selectedEvents.length ? selectedEvents.map((item, index) => (
              <div key={`${item.title}-${index}`} className={`rounded-[var(--radius)] border border-[var(--border)] p-4 ${hoverLift}`}>
                <div className="flex items-center gap-2"><Badge variant="outline">{TYPE_META[item.type].label}</Badge><strong className="text-sm">{item.title}</strong></div>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">{[item.time ?? "종일", item.place, item.owner ? `담당 ${item.owner}` : ""].filter(Boolean).join(" · ")}</p>
              </div>
            )) : <div className="flex min-h-32 items-center justify-center text-sm text-[var(--muted-foreground)]"><CalendarDays aria-hidden="true" className="mr-2 size-4" />이 날짜에는 등록된 일정이 없습니다.</div>}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
