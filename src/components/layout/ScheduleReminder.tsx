import { useEffect, useRef, useState } from "react"
import { BellRing, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/data/auth"
import { TEAM_EVENT_META } from "@/data/calendar-events"
import {
  claimReminder,
  reminderBucket,
  reminderDayKey,
  reminderOccurrences,
  useReminderEnabled,
  type ReminderOccurrence,
} from "@/data/calendar-reminder"
import { canAccessScreenPath } from "@/data/screen-permissions"
import { useAppStore } from "@/store/useAppStore"

interface ActiveAlert extends ReminderOccurrence { minutes: number }

const TICK_MS = 20_000
const MAX_CARDS = 4

/**
 * 일정 임박 알림(R387).
 *
 * **라우트 하나에 가두지 않는다.** `App.tsx`의 레이아웃에 걸어 두어 어느 화면에 있든 뜬다.
 *
 * 중복 발사를 막는 장치가 셋이다.
 * 1. 단계는 구간으로 가른다(`reminderBucket`). 한 번에 두 단계가 울리지 않는다.
 * 2. 울리기 전에 `claimReminder`로 저장소에 찜한다. 탭 여러 개 중 먼저 온 쪽만 울린다.
 * 3. 숨은 탭은 아예 재지 않는다. 다시 보이면 그 자리에서 한 번 잰다.
 *
 * 첫 측정을 0~5초 흩어 두는 것은 탭 둘이 같은 순간에 찜하러 들어가는 것을 줄이려는 것이다.
 * 지우지 말 것.
 */
export function ScheduleReminder() {
  const events = useAppStore((state) => state.events)
  const enabled = useReminderEnabled()
  const uid = useAuthStore((state) => state.user?.uid ?? null)
  const isOwner = useAuthStore((state) => state.isOwner)
  const screenPermissions = useAuthStore((state) => state.screenPermissions)
  // 캘린더를 못 보는 사람에게 팀 일정을 띄우지 않는다.
  const canSee = isOwner || canAccessScreenPath("/calendar", screenPermissions)
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  // 일정이 바뀔 때마다 타이머를 다시 걸면 측정 주기가 끊긴다. 최신 값만 ref로 넘긴다.
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    if (!enabled || !uid || !canSee) {
      setAlerts([])
      return
    }
    const tick = () => {
      if (document.visibilityState !== "visible") return
      const now = new Date()
      const nowMs = now.getTime()
      const dayKey = reminderDayKey(now)
      const fresh: ActiveAlert[] = []
      reminderOccurrences(eventsRef.current, now).forEach((occurrence) => {
        const bucket = reminderBucket((occurrence.startAt - nowMs) / 60000)
        if (bucket === null) return
        if (!claimReminder(uid, occurrence.key, bucket, dayKey)) return
        fresh.push({ ...occurrence, minutes: bucket })
      })
      setAlerts((current) => [
        // 시작 시각이 지난 카드는 스스로 걷는다. 같은 일정은 늦은 단계가 앞 단계를 대신한다.
        ...current.filter((item) => item.startAt > nowMs && !fresh.some((item2) => item2.key === item.key)),
        ...fresh,
      ].slice(-MAX_CARDS))
    }
    let interval = 0
    const first = window.setTimeout(() => {
      tick()
      interval = window.setInterval(tick, TICK_MS)
    }, Math.floor(Math.random() * 5000))
    const onVisible = () => { if (document.visibilityState === "visible") tick() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(first)
      if (interval) window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, uid, canSee])

  if (!alerts.length) return null

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={`${alert.key}|${alert.minutes}`}
          className="pointer-events-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-1)]"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">
              <BellRing aria-hidden="true" className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--primary)]">{alert.minutes}분 뒤 시작</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{alert.title}</p>
              <p className="mt-1 truncate text-[11px] text-[var(--muted-foreground)]">
                {[alert.time, TEAM_EVENT_META[alert.type].label, alert.place, alert.owner ? `담당 ${alert.owner}` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`${alert.title} 알림 닫기`}
              onClick={() => setAlerts((current) => current.filter((item) => item.key !== alert.key))}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
