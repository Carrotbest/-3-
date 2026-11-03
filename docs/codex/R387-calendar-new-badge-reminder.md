# R387 — 캘린더 신규 표시와 일정 임박 알림

상태: **미착수**. 설계 확정됨(2026-11-04 박향근). 아래 그대로 지으면 된다.

## 무엇을 만드는가

두 가지다.

1. **신규 표시.** 새 일정이 들어오면 **왼쪽 사이드바 CALENDAR 메뉴**에 건수 뱃지가 뜨고, **캘린더 화면 안의 그 일정**에 "신규" 딱지가 붙는다. 캘린더를 열어 보고 나가면 사라진다.
2. **임박 알림.** 시작 시간이 적힌 팀 일정에 대해 **15분·10분·5분 전**에 화면 오른쪽 아래로 알림 카드를 띄운다. **어느 화면에 있든** 뜬다. 계정 설정에서 끌 수 있다.

## 박향근 확정 사항 (바꾸지 말 것)

- "네비게이터"는 **왼쪽 사이드바**다. HOME 팀 일정 카드는 이번 범위가 아니다.
- 신규 표시는 **캘린더를 열어 본 뒤 나가면** 사라진다. 등록 후 N시간 방식이 아니다.
- 알림 대상은 **시작 시간이 적힌 팀 일정 전부**다. 담당자로 거르지 않는다.
- 알림은 **앱 안 카드**만이다. 브라우저 알림(Notification API)은 쓰지 않는다. 권한 요청 창을 띄우지 마라.
- 끄는 자리는 **상단바 계정 설정 팝업**이다.

## 하지 말 것

- **새 저장 경로를 만들지 마라.** 켜고 끄는 값은 `src/data/view-prefs.ts`의 `loadViewFlag`/`saveViewPref`(localStorage)를 쓴다. Firestore 컬렉션도, `CACHE_KEYS` 추가도 없다.
- **`CACHE_KEYS`를 건드리지 마라.** `events`는 이미 들어 있다.
- **`createdAt`에 `undefined`를 넣지 마라.** Firestore가 값 없는 키를 거부한다. 항상 문자열을 넣거나 키를 아예 빼라.
- **브라우저 알림, 소리, 진동, 깜빡임, `backdrop-filter`를 쓰지 마라.**
- **읽은 적 없는 과거 일정이 전부 신규로 잡히게 하지 마라.** `createdAt`이 없는 기존 일정은 신규가 아니다(`nav-badges.ts`의 기존 규칙과 같다).
- 한글 문구를 영어로 바꾸지 마라. 파일은 `Get-Content -Encoding UTF8`로 읽어라.

---

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/sample.ts` | `CalendarEvent`에 `createdAt?: string` 추가 |
| `src/store/useAppStore.ts` | `addTeamEvent`가 `createdAt`을 찍는다 |
| `src/data/nav-badges.ts` | `calendar` 뱃지 소스 추가, `navSeenAt` 내보내기 |
| `src/data/calendar-reminder.ts` | **새 파일.** 알림 켜짐 상태, 회차 계산, 중복 발사 방지 |
| `src/components/layout/ScheduleReminder.tsx` | **새 파일.** 전역 알림 카드 |
| `src/App.tsx` | `ScheduleReminder` 전역 마운트 |
| `src/routes/Calendar.tsx` | 달력 칸·연속 바·오른쪽 목록에 "신규" 딱지 |
| `src/components/auth/AccountSettingsDialog.tsx` | "일정 알림" 탭 추가 |

---

## 1. `src/data/sample.ts` — `createdAt` 필드

`CalendarEvent` 인터페이스(366행 근처). `id?: string` 바로 아래에 한 줄 넣는다.

현재:

```ts
export interface CalendarEvent {
  id?: string
  date: string
```

바꾼 뒤:

```ts
export interface CalendarEvent {
  id?: string
  /** 등록 시각(ISO). 신규 표시의 기준이다(R387). 이 값이 없는 옛 일정은 신규가 아니다. */
  createdAt?: string
  date: string
```

`sampleEvents()`의 데모 일정에는 **넣지 마라.** 데모가 신규로 뜨면 안 된다.

## 2. `src/store/useAppStore.ts` — 등록 시각 찍기

`addTeamEvent`(281행 근처).

현재:

```ts
export function addTeamEvent(event: CalendarEvent): void {
  const id = event.id ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now())
  const next = [...useAppStore.getState().events, { ...event, id }]
  setAppState({ events: next })
  void saveCache("events", next)
}
```

바꾼 뒤:

```ts
export function addTeamEvent(event: CalendarEvent): void {
  const id = event.id ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now())
  // 신규 표시의 기준(R387). 값 없는 키를 만들면 Firestore가 문서를 통째로 거부하므로 늘 문자열을 넣는다.
  const createdAt = event.createdAt ?? new Date().toISOString()
  const next = [...useAppStore.getState().events, { ...event, id, createdAt }]
  setAppState({ events: next })
  void saveCache("events", next)
}
```

`updateTeamEvent`와 `deleteTeamEvent`는 **손대지 마라.** `updateTeamEvent`는 `{ ...item, ...event }`라서, 수정 폼이 `createdAt` 키를 만들지 않는 한 원래 값이 그대로 살아남는다. 수정이 등록 시각을 밀어 올리면 고칠 때마다 신규로 되살아난다.

## 3. `src/data/nav-badges.ts` — 사이드바 뱃지

### 3-1. 뱃지 소스에 캘린더를 더한다

현재:

```ts
export const NAV_BADGE_SOURCES: NavBadgeSource[] = [
  { key: "request", path: "/request", kind: "count" },
  { key: "analysis", path: "/fabric-analysis", kind: "count" },
  { key: "ts", path: "/ts", kind: "count" },
```

한 줄을 `ts` 다음에 넣는다:

```ts
  { key: "calendar", path: "/calendar", kind: "count" },
```

`AppSidebar.tsx`와 `Topbar.tsx`는 이 목록을 그대로 읽으므로 **고치지 마라.** 뱃지는 저절로 붙는다.

### 3-2. 건수를 센다

`useNavBadges` 안. 지금 `const ts = useAppStore((state) => state.ts)` 같은 줄이 모여 있는 자리에 한 줄을 더한다:

```ts
  const events = useAppStore((state) => state.events)
```

**조기 반환(`if (status !== "signed-in" ...) return {}`)보다 위여야 한다.** 훅 순서가 깨진다.

그리고 `tsCount` 블록 다음에:

```ts
  // 팀 일정은 등록 시각(createdAt)이 기준이다. 수정은 신규로 치지 않는다.
  const calendarCount = countNewer(events.filter((event) => isTeamEventType(event.type)), parse(seen.calendar))
  if (calendarCount > 0) badges.calendar = { kind: "count", count: calendarCount }
```

파일 맨 위 import에 더한다:

```ts
import { isTeamEventType } from "./calendar-events"
```

### 3-3. 기준선을 꺼내 쓰는 함수

`markNavSeen` 함수 **바로 아래**에 새 함수를 둔다:

```ts
/**
 * 지금 저장된 읽음 기준선(epoch ms). 읽을 수 없으면 `NaN`이다.
 *
 * 화면에 들어오면 3초 뒤 `markNavSeen`이 기준선을 올린다(`App.tsx`).
 * 그래서 화면 안에서 신규를 표시하려면 **들어온 시점에 이 값을 한 번 얼려 두고** 그것으로 가른다.
 * 매 렌더 다시 읽으면 보고 있는 동안 딱지가 눈앞에서 사라진다.
 */
export function navSeenAt(key: string): number {
  const state = useNavSeenStore.getState()
  const uid = state.uid ?? useAuthStore.getState().user?.uid ?? null
  if (!uid) return Number.NaN
  const value = state.uid === uid ? state.seen[key] : readStored(uid)[key]
  return parse(value)
}
```

`parse`는 이 파일 아래쪽에 이미 선언돼 있다. **함수 선언이라 호이스팅되므로 위에서 불러도 된다.** `readStored`와 `useNavSeenStore`도 이미 있다. 새로 만들지 마라.

## 4. `src/data/calendar-reminder.ts` — 새 파일

통째로 아래와 같이 만든다.

```ts
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

/** 알림 단계(분). 큰 것부터다. */
export const REMINDER_MINUTES = [15, 10, 5] as const

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
```

## 5. `src/components/layout/ScheduleReminder.tsx` — 새 파일

통째로 아래와 같이 만든다.

```tsx
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
```

## 6. `src/App.tsx` — 전역 마운트

import 묶음에 더한다(`UpdateBanner` 줄 근처):

```ts
import { ScheduleReminder } from "@/components/layout/ScheduleReminder"
```

`AppLayout` 반환부의 맨 아래. 현재:

```tsx
      <ParsingOverlay />
      <IntegrityNoticeDialog />
      <UpdateBanner />
    </div>
```

바꾼 뒤:

```tsx
      <ParsingOverlay />
      <IntegrityNoticeDialog />
      <ScheduleReminder />
      <UpdateBanner />
    </div>
```

**`UpdateBanner` 앞에 둔다.** 배너는 `z-[1000]`으로 화면을 막는 쪽이라 알림이 그 위에 뜨면 안 된다. 알림 카드는 `z-[90]`이라 팝업(`z-50`) 위, 파싱 오버레이(`z-[100]`) 아래다.

## 7. `src/routes/Calendar.tsx` — 신규 딱지

### 7-1. import 추가

```ts
import { navSeenAt } from "@/data/nav-badges"
```

### 7-2. 딱지 컴포넌트

파일 위쪽, `formStateFromEvent` 선언 다음(143행 `export function Calendar()` 바로 앞)에 둔다:

```tsx
/**
 * 신규 딱지(R387). 달력 칸과 오른쪽 목록이 같은 말을 쓴다.
 * 깜빡임·번짐 그림자·`backdrop-filter`를 넣지 말 것. 표가 떨린다.
 */
function NewMark({ className }: { className: string }) {
  return <span className={`inline-flex h-[15px] shrink-0 items-center rounded-full px-1.5 text-[9px] font-bold leading-none ${className}`}>신규</span>
}
```

### 7-3. 기준선을 한 번 얼린다

`export function Calendar()` 안, `const todayKey = dateKey(today)` 다음 줄에 넣는다:

```tsx
  // 신규 표시(R387). **화면에 들어온 시점의 기준선을 얼려 둔다.**
  // `App.tsx`가 3초 뒤 기준선을 올리므로, 매번 다시 읽으면 보고 있는 동안 딱지가 사라진다.
  // 캘린더를 떠나면 이 컴포넌트가 사라지고, 다시 들어올 때는 올라간 기준선을 읽어 딱지가 없다.
  const [calendarSeenAt] = useState(() => navSeenAt("calendar"))
  const isNewEvent = (item: CombinedEvent): boolean => {
    if (Number.isNaN(calendarSeenAt) || !item.createdAt) return false
    const at = Date.parse(item.createdAt)
    return !Number.isNaN(at) && at > calendarSeenAt
  }
```

### 7-4. 연속 바(출장·휴가)

410행. 현재:

```tsx
                            {bar.isStart ? <span className="truncate pr-5">{pendingDeleteId === item.id ? "삭제?" : `${item.title}${item.owner ? ` · ${item.owner}` : ""}`}</span> : null}
```

바꾼 뒤:

```tsx
                            {bar.isStart ? <span className="flex min-w-0 items-center gap-1 pr-5">{isNewEvent(item) ? <NewMark className="bg-white/30 text-white" /> : null}<span className="truncate">{pendingDeleteId === item.id ? "삭제?" : `${item.title}${item.owner ? ` · ${item.owner}` : ""}`}</span></span> : null}
```

### 7-5. 미팅 카드(달력 칸 본문)

472행. 현재:

```tsx
                                  <div className="truncate pr-5 text-xs font-semibold text-[var(--foreground)]">{item.time ? <span className="mr-1 tabular-nums text-[var(--muted-foreground)]">{item.time}</span> : null}{pendingDeleteId === item.id ? "삭제?" : item.title}{item.repeat ? <Repeat aria-label="반복 일정" className="ml-1 inline size-3 align-[-1px] text-[var(--muted-foreground)]" /> : null}</div>
```

바꾼 뒤(`{item.time ...}` 앞에 딱지를 끼운다):

```tsx
                                  <div className="truncate pr-5 text-xs font-semibold text-[var(--foreground)]">{isNewEvent(item) ? <NewMark className="mr-1 bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] align-[-2px] text-[var(--primary)]" /> : null}{item.time ? <span className="mr-1 tabular-nums text-[var(--muted-foreground)]">{item.time}</span> : null}{pendingDeleteId === item.id ? "삭제?" : item.title}{item.repeat ? <Repeat aria-label="반복 일정" className="ml-1 inline size-3 align-[-1px] text-[var(--muted-foreground)]" /> : null}</div>
```

### 7-6. 오른쪽 "선택 기간의 일정" 목록

507행. 현재:

```tsx
                        <span className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={TEAM_EVENT_META[item.type].chip}>{TEAM_EVENT_META[item.type].label}</Badge><strong className="text-sm text-[var(--foreground)]">{pendingDeleteId === item.id ? "삭제?" : item.title}</strong></span>
```

바꾼 뒤:

```tsx
                        <span className="mt-2 flex flex-wrap items-center gap-2">{isNewEvent(item) ? <NewMark className="bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]" /> : null}<Badge variant="outline" className={TEAM_EVENT_META[item.type].chip}>{TEAM_EVENT_META[item.type].label}</Badge><strong className="text-sm text-[var(--foreground)]">{pendingDeleteId === item.id ? "삭제?" : item.title}</strong></span>
```

**다른 곳은 손대지 마라.** `CombinedEvent`는 `CalendarEvent`를 넓힌 것이라 `createdAt`이 저절로 따라온다. 반복 2회차는 `{ ...event, origin }`이라 원본의 `createdAt`을 물려받는다. 그대로 둔다.

## 8. `src/components/auth/AccountSettingsDialog.tsx` — 일정 알림 탭

### 8-1. 탭 종류

현재:

```ts
type AccountTab = "password" | "email" | "name"
```

바꾼 뒤:

```ts
type AccountTab = "password" | "email" | "name" | "alert"
```

### 8-2. import

```ts
import { BellRing, KeyRound, Loader2, Mail, UserRound } from "lucide-react"
```

그리고:

```ts
import { setReminderEnabled, useReminderEnabled } from "@/data/calendar-reminder"
```

### 8-3. 상태 읽기

`const [message, setMessage] = useState<...>(null)` 다음 줄에:

```ts
  const reminderEnabled = useReminderEnabled()
```

### 8-4. 탭 버튼

현재:

```tsx
          {tabButton("name", "이름 변경", <UserRound className="size-3.5" />)}
```

다음 줄에 더한다:

```tsx
          {tabButton("alert", "일정 알림", <BellRing className="size-3.5" />)}
```

### 8-5. 본문

현재 124행 근처:

```tsx
        {tab === "email" && isOwner ? <p className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          소유자 계정은 로그인 이메일을 바꾸지 않습니다. 이메일을 바꾸면 소유자 권한이 사라집니다.
        </p> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
```

바꾼 뒤(앞에 분기 하나를 더한다):

```tsx
        {tab === "alert" ? <div className="space-y-2">
          <label htmlFor="account-schedule-reminder" className="flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm">
            <input id="account-schedule-reminder" type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} className="size-4 accent-[var(--primary)]" />
            일정 임박 알림 받기
          </label>
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">시작 시간이 적힌 팀 일정에 대해 15분·10분·5분 전에 화면 오른쪽 아래로 알림이 뜹니다. 어느 화면을 보고 있든 뜨고, 시간을 적지 않은 일정은 알리지 않습니다. 이 설정은 지금 쓰는 브라우저에만 남습니다.</p>
        </div> : tab === "email" && isOwner ? <p className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          소유자 계정은 로그인 이메일을 바꾸지 않습니다. 이메일을 바꾸면 소유자 권한이 사라집니다.
        </p> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
```

### 8-6. 푸터 버튼

현재 163행:

```tsx
        {tab === "email" && isOwner ? null : <Button type="button" size="sm" disabled={busy || (tab === "password" ? !canSubmitPassword : tab === "email" ? !canSubmitEmail : !canSubmitName)} onClick={() => void submit()}>
```

바꾼 뒤:

```tsx
        {tab === "alert" || (tab === "email" && isOwner) ? null : <Button type="button" size="sm" disabled={busy || (tab === "password" ? !canSubmitPassword : tab === "email" ? !canSubmitEmail : !canSubmitName)} onClick={() => void submit()}>
```

**체크박스는 저장 버튼이 없다.** 누르는 순간 저장된다. `submit()`에 `alert` 분기를 넣지 마라.

---

## 성공 기준

- `npm run build`가 통과한다(`tsc --noEmit && vite build`). **모든 수정을 마친 뒤 한 번만 돌린다.**
- `git status --short`에 아래 10개만 뜬다.
  - `M docs/codex/R387-calendar-new-badge-reminder.md`는 안 뜬다(이 문서는 클로드가 이미 만들었다)
  - `M src/App.tsx`
  - `M src/components/auth/AccountSettingsDialog.tsx`
  - `?? src/components/layout/ScheduleReminder.tsx`
  - `?? src/data/calendar-reminder.ts`
  - `M src/data/nav-badges.ts`
  - `M src/data/sample.ts`
  - `M src/routes/Calendar.tsx`
  - `M src/store/useAppStore.ts`
- `git diff`에 새로 생긴 영어 문구가 없다. 화면 글자는 전부 한글이다.

## 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 파일을 지우지 마라. 이 작업에 삭제는 없다.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 데이터 값을 지어내지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라. 다른 검증은 하지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`은 2.5MB다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
