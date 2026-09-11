import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TEAM_EVENT_META, type TeamEventType } from "@/data/calendar-events"
import { dateKeyOf, holidayName } from "@/data/holidays"
import type { CalendarEvent } from "@/data/sample"
import { hideBriefingToday, isBriefingHidden, todayBriefing, type BriefingItem } from "@/data/today-briefing"
import { useAppStore } from "@/store/useAppStore"

const WINDOW_WIDTH = 440

/**
 * 떠 있는 창이라 배경과 확실히 갈라져야 한다. HOME 카드의 옅은 유리 그림자로는 묻힌다.
 * 그래서 그림자를 네 겹으로 쌓는다. 위 하이라이트, 테두리 링, 근거리 접지 그림자,
 * 멀리 퍼지는 확산 그림자다. 배경은 반투명을 낮춰(80%) 뒤 내용이 비쳐 흐려지지 않게 한다.
 */
const WINDOW_SHADOW = [
  "inset 0 1px 0 rgba(255,255,255,0.95)",
  "0 0 0 1px rgba(15,23,42,0.08)",
  "0 2px 6px rgba(15,23,42,0.10)",
  "0 18px 32px -12px rgba(15,23,42,0.30)",
  "0 44px 80px -28px rgba(15,23,42,0.34)",
].join(", ")
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const
const EVENT_EMOJI: Record<TeamEventType, string> = {
  meeting: "💬",
  external: "🤝",
  trip: "✈️",
  leave: "🌴",
}

let shownThisLoad = false

function dateFromKey(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
}

function validEndDate(event: CalendarEvent): string {
  if (!event.endDate || event.endDate <= event.date) return event.date
  return dateKeyOf(dateFromKey(event.endDate)) === event.endDate ? event.endDate : event.date
}

const shortDate = (key: string): string => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`

function scheduleDetails(item: BriefingItem): string {
  const endDate = validEndDate(item.event)
  return [
    endDate > item.event.date ? `${shortDate(item.event.date)}~${shortDate(endDate)}` : null,
    item.event.time,
    item.event.place,
    item.ongoing ? "진행 중" : null,
  ].filter(Boolean).join(" · ")
}

function BriefingRow({ item, index }: { item: BriefingItem; index: number }) {
  const meta = TEAM_EVENT_META[item.event.type]
  const details = scheduleDetails(item)
  return (
    <li
      className="briefing-item-in flex items-start gap-3 rounded-[16px] border border-white/80 bg-white/55 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06),0_10px_22px_-16px_rgba(15,23,42,0.28)]"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <span aria-hidden="true" className="mt-0.5 text-xl leading-none drop-shadow-[0_2px_4px_rgba(15,23,42,0.16)]">{EVENT_EMOJI[item.event.type]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <span className={`rounded-full border bg-white/60 px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>{meta.label}</span>
          {item.event.owner ? <span className="text-xs font-medium text-[var(--muted-foreground)]">{item.event.owner}</span> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">{item.event.title}</span>
        </div>
        {details ? <p className="mt-1.5 truncate text-xs text-[var(--muted-foreground)]">{details}</p> : null}
      </div>
    </li>
  )
}

export function TodayBriefing() {
  const navigate = useNavigate()
  const events = useAppStore((state) => state.events)
  const [todayKey] = useState(() => dateKeyOf(new Date()))
  const items = useMemo(() => todayBriefing(events, todayKey), [events, todayKey])
  const todayItems = items.filter((item) => !item.lead)
  const tomorrowItems = items.filter((item) => item.lead)
  const [open, setOpen] = useState(false)
  const [hideToday, setHideToday] = useState(false)
  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 12 : Math.max(12, window.innerWidth - WINDOW_WIDTH - 28),
    y: 96,
  }))
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const today = dateFromKey(todayKey)
  const holiday = holidayName(todayKey)

  useEffect(() => {
    if (!shownThisLoad && !isBriefingHidden(todayKey) && items.length > 0) {
      shownThisLoad = true
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (hideToday) hideBriefingToday(todayKey)
      setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [hideToday, open, todayKey])

  const close = () => {
    if (hideToday) hideBriefingToday(todayKey)
    setOpen(false)
  }

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const maxX = Math.max(8, window.innerWidth - WINDOW_WIDTH - 8)
    const maxY = Math.max(8, window.innerHeight - 64)
    setPosition({
      x: Math.min(maxX, Math.max(8, event.clientX - drag.offsetX)),
      y: Math.min(maxY, Math.max(8, event.clientY - drag.offsetY)),
    })
  }

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }

  if (!open) return null

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="today-briefing-title"
      className="briefing-pop-in fixed z-50 flex max-h-[76vh] w-[440px] flex-col overflow-hidden border border-white/70 bg-white/80 backdrop-blur-xl"
      style={{ left: position.x, top: position.y, borderRadius: 24, boxShadow: WINDOW_SHADOW }}
    >
      <div
        className="cursor-grab select-none border-b border-white/70 bg-gradient-to-b from-white/75 to-white/35 px-5 pb-4 pt-4 shadow-[0_1px_0_rgba(255,255,255,0.8)] active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="briefing-float text-3xl drop-shadow-[0_4px_8px_rgba(15,23,42,0.18)]">🌤️</span>
          <div className="min-w-0 flex-1">
            <p id="today-briefing-title" className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">오늘의 팀 브리핑</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="relative isolate inline-flex rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-[var(--foreground)] shadow-[0_2px_6px_-2px_rgba(15,23,42,0.2)]">
                <span aria-hidden="true" className="briefing-ring absolute inset-0 -z-10 rounded-full border border-[var(--ring)]" />
                {today.getMonth() + 1}월 {today.getDate()}일 ({WEEKDAYS[today.getDay()]})
              </span>
              {holiday ? <span className="text-xs font-medium text-[var(--muted-foreground)]">{holiday}</span> : null}
            </div>
          </div>
          <span className="rounded-full border border-white/80 bg-white/70 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[var(--muted-foreground)] shadow-[0_2px_6px_-2px_rgba(15,23,42,0.2)]">{items.length}건</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 내일 시작하는 휴가·출장만 있는 날은 "오늘" 제목을 아예 그리지 않는다. 빈 제목만 남으면 오늘 일정이 빠진 것처럼 보인다. */}
        {todayItems.length ? (
          <section aria-labelledby="today-briefing-today">
            <h3 id="today-briefing-today" className="mb-2.5 px-1 text-xs font-semibold tracking-[0.08em] text-[var(--muted-foreground)]">오늘</h3>
            <ul className="grid gap-2.5">
              {todayItems.map((item, index) => <BriefingRow key={`${item.event.id ?? item.event.title}-${item.event.date}-${index}`} item={item} index={index} />)}
            </ul>
          </section>
        ) : null}
        {tomorrowItems.length ? (
          <section className={todayItems.length ? "mt-4" : ""} aria-labelledby="today-briefing-tomorrow">
            <h3 id="today-briefing-tomorrow" className="mb-2.5 px-1 text-xs font-semibold tracking-[0.08em] text-[var(--muted-foreground)]">내일</h3>
            <ul className="grid gap-2.5">
              {tomorrowItems.map((item, index) => <BriefingRow key={`${item.event.id ?? item.event.title}-${item.event.date}-${index}`} item={item} index={todayItems.length + index} />)}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/70 bg-gradient-to-b from-white/40 to-white/65 px-5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <label htmlFor="hide-today-briefing" className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Checkbox id="hide-today-briefing" checked={hideToday} onCheckedChange={(checked) => setHideToday(checked === true)} />
          오늘 그만보기
        </label>
        <div className="flex items-center gap-2">
          {/* 달력으로 넘어갈 때도 "오늘 그만보기"를 지킨다. HOME을 떠나면 이 창은 어차피 사라진다. */}
          <Button type="button" size="sm" className="shadow-[0_6px_14px_-8px_rgba(15,23,42,0.5)]" onClick={() => { close(); navigate("/calendar") }}>
            <CalendarDays className="size-3.5" />달력에서 보기
          </Button>
          <Button type="button" size="sm" variant="outline" className="border-white/80 bg-white/55" onClick={close}>닫기</Button>
        </div>
      </div>
    </aside>
  )
}
