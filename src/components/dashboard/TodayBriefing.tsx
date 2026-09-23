import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
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
const delayStyle = (delay: number): CSSProperties => ({ "--d": `${delay}ms` } as CSSProperties)

function scheduleDetails(item: BriefingItem): string {
  const endDate = validEndDate(item.event)
  return [
    endDate > item.event.date ? `${shortDate(item.event.date)}~${shortDate(endDate)}` : null,
    item.event.time,
    item.event.place,
    item.ongoing ? "진행 중" : null,
  ].filter(Boolean).join(" · ")
}

function BriefingRow({ item, delay }: { item: BriefingItem; delay: number }) {
  const meta = TEAM_EVENT_META[item.event.type]
  const details = scheduleDetails(item)
  return (
    <li className="briefing-diary-item briefing-write-in" style={delayStyle(delay)}>
      <span aria-hidden="true" className="briefing-hand-check" />
      <span aria-hidden="true" className={`briefing-star briefing-star-${item.event.type}`}>
        {item.lead ? "✦" : "★"}
      </span>
      <span aria-hidden="true" className="briefing-event-emoji">{EVENT_EMOJI[item.event.type]}</span>
      <span className={`briefing-tag briefing-tag-${item.event.type}`}>{meta.label}</span>
      <div className="briefing-item-copy">
        <div className="briefing-item-heading">
          <span className="briefing-item-title">{item.event.title}</span>
          {item.event.owner ? <span className="briefing-item-owner">{item.event.owner}</span> : null}
        </div>
        {details ? <p className="briefing-item-meta">{details}</p> : null}
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
  const [closing, setClosing] = useState(false)
  const [hideToday, setHideToday] = useState(false)
  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 12 : Math.max(12, window.innerWidth - WINDOW_WIDTH - 28),
    y: 96,
  }))
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const afterCloseRef = useRef<(() => void) | null>(null)
  const today = dateFromKey(todayKey)
  const holiday = holidayName(todayKey)
  const tomorrowSectionDelay = 230 + todayItems.length * 50

  const finishClose = () => {
    setOpen(false)
    setClosing(false)
    const afterClose = afterCloseRef.current
    afterCloseRef.current = null
    afterClose?.()
  }

  const close = (afterClose?: () => void) => {
    if (closing) return
    if (hideToday) hideBriefingToday(todayKey)
    afterCloseRef.current = afterClose ?? null
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose()
      return
    }
    setClosing(true)
  }

  useEffect(() => {
    if (!shownThisLoad && !isBriefingHidden(todayKey) && items.length > 0) {
      shownThisLoad = true
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!open || closing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closing, hideToday, open, todayKey])

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(finishClose, 360)
    return () => window.clearTimeout(timer)
  }, [closing])

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
      className={`briefing-diary ${closing ? "briefing-drop-out" : "briefing-drop-in"}`}
      style={{ left: position.x, top: position.y }}
      onAnimationEnd={(event) => {
        if (closing && event.currentTarget === event.target) finishClose()
      }}
    >
      <span aria-hidden="true" className="briefing-tape briefing-tape-left" />
      <span aria-hidden="true" className="briefing-tape briefing-tape-right" />
      <span aria-hidden="true" className="briefing-spiral" />
      <span aria-hidden="true" className="briefing-doodle briefing-doodle-flower">✿</span>
      <span aria-hidden="true" className="briefing-doodle briefing-doodle-pencil">✎</span>
      <span aria-hidden="true" className="briefing-doodle briefing-doodle-sparkle">✦</span>

      <div className="briefing-diary-inner">
        <div
          className="briefing-diary-header"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <p id="today-briefing-title" className="briefing-diary-title briefing-write-in" style={delayStyle(60)}>오늘의 팀 브리핑</p>
          <span className="briefing-diary-date briefing-write-in" style={delayStyle(110)}>
            {today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAYS[today.getDay()]}요일
            {holiday ? ` · ${holiday}` : ""}
          </span>
          <span className="briefing-diary-count briefing-write-in" style={delayStyle(150)}>★ {items.length}건</span>
        </div>

        <div aria-hidden="true" className="briefing-wave" />

        <div className="briefing-diary-scroll">
          {/* 내일 시작하는 휴가·출장만 있는 날은 "오늘" 제목을 아예 그리지 않는다. */}
          {todayItems.length ? (
            <section aria-labelledby="today-briefing-today">
              <h3 id="today-briefing-today" className="briefing-diary-section briefing-write-in" style={delayStyle(190)}>오늘</h3>
              <ul className="briefing-diary-list">
                {todayItems.map((item, index) => (
                  <BriefingRow
                    key={`${item.event.id ?? item.event.title}-${item.event.date}-${index}`}
                    item={item}
                    delay={230 + index * 50}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {tomorrowItems.length ? (
            <section className="briefing-diary-tomorrow" aria-labelledby="today-briefing-tomorrow">
              <h3
                id="today-briefing-tomorrow"
                className="briefing-diary-section briefing-write-in"
                style={delayStyle(todayItems.length ? tomorrowSectionDelay : 190)}
              >내일</h3>
              <ul className="briefing-diary-list">
                {tomorrowItems.map((item, index) => (
                  <BriefingRow
                    key={`${item.event.id ?? item.event.title}-${item.event.date}-${index}`}
                    item={item}
                    delay={(todayItems.length ? tomorrowSectionDelay + 40 : 230) + index * 50}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="briefing-diary-footer briefing-write-in" style={delayStyle(420)}>
          <label htmlFor="hide-today-briefing" className="briefing-hide-label">
            <Checkbox
              id="hide-today-briefing"
              className="briefing-hide-checkbox"
              checked={hideToday}
              onCheckedChange={(checked) => setHideToday(checked === true)}
            />
            오늘 그만보기
          </label>
          <div className="briefing-diary-actions">
            <Button type="button" size="sm" className="briefing-diary-button briefing-diary-button-primary" onClick={() => close(() => navigate("/calendar"))}>
              <CalendarDays className="briefing-button-icon" />달력에서 보기
            </Button>
            <Button type="button" size="sm" variant="outline" className="briefing-diary-button" onClick={() => close()}>닫기</Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
