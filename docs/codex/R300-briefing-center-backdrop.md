# R300 — 오늘의 팀 브리핑 가운데 배치, 배경 흐림, 항목 클릭 시 Calendar 이동

상태: 미착수

## 배경

브리핑 팝업은 R251에서 다이어리 모양이었다가 시인성 문제로 직전 작업에서 초기 유리창 모양(R127~R131)으로 되돌렸다.
**그 되돌림은 아직 커밋되지 않은 워킹트리 변경이다. `git reset`이나 `git checkout`으로 건드리지 마라.**
이번 작업은 되돌린 유리창 모양을 그대로 두고 배치와 동작 셋만 바꾼다. 다이어리 CSS(`briefing-diary`, `briefing-drop-*`, Nanum Pen Script)를 되살리지 마라.

## 요구 셋

1. 팝업을 화면 오른쪽 위가 아니라 **가운데**에 띄운다.
2. 팝업 뒤 배경에 **흐림**을 깐다.
3. 일정 **항목을 클릭하면 Calendar로 이동**하고, 그 일정 날짜가 선택된 상태로 열린다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/dashboard/TodayBriefing.tsx` | 초기 좌표 가운데, 백드롭 추가, 항목 버튼화 |
| `src/routes/Calendar.tsx` | `?d=YYYY-MM-DD` 쿼리로 초기 선택 날짜 받기 |
| `src/index.css` | 백드롭 페이드 애니메이션 추가 |

---

## 1. `src/components/dashboard/TodayBriefing.tsx`

### 1-1. import 수정 (1행)

현재:
```tsx
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
```
교체:
```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
```

### 1-2. 초기 좌표를 가운데로 (89~92행)

현재:
```tsx
  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 12 : Math.max(12, window.innerWidth - WINDOW_WIDTH - 28),
    y: 96,
  }))
```
교체:
```tsx
  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 12 : Math.max(12, Math.round((window.innerWidth - WINDOW_WIDTH) / 2)),
    y: 96,
  }))
  const panelRef = useRef<HTMLElement | null>(null)
  const centeredRef = useRef(false)
```

### 1-3. 세로 가운데 정렬 (93행 `dragRef` 선언 바로 아래에 추가)

창 높이는 일정 건수에 따라 달라진다. 그려진 뒤 실제 높이를 재서 한 번만 맞춘다.
드래그로 옮긴 뒤에 다시 가운데로 끌려가면 안 되므로 `centeredRef`로 1회만 돈다.

```tsx
  useLayoutEffect(() => {
    if (!open || centeredRef.current) return
    const el = panelRef.current
    if (!el) return
    centeredRef.current = true
    setPosition({
      x: Math.max(12, Math.round((window.innerWidth - WINDOW_WIDTH) / 2)),
      y: Math.max(24, Math.round((window.innerHeight - el.offsetHeight) / 2)),
    })
  }, [open])
```

### 1-4. 항목 클릭 시 Calendar 이동

`BriefingRow`(58~78행)에 `onOpen` prop을 받아 내용 전체를 버튼으로 감싼다.
`li`에 `onClick`을 거는 방식은 쓰지 마라. 키보드로 못 간다.

`BriefingRow` 전체를 아래로 교체:
```tsx
function BriefingRow({ item, index, onOpen }: { item: BriefingItem; index: number; onOpen: (dateKey: string) => void }) {
  const meta = TEAM_EVENT_META[item.event.type]
  const details = scheduleDetails(item)
  return (
    <li
      className="briefing-item-in rounded-[16px] border border-white/80 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06),0_10px_22px_-16px_rgba(15,23,42,0.28)] transition-colors hover:bg-white/80"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <button
        type="button"
        onClick={() => onOpen(item.event.date)}
        title="달력에서 이 날짜 보기"
        className="flex w-full items-start gap-3 rounded-[16px] px-3.5 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
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
      </button>
    </li>
  )
}
```

`close` 함수(126~129행 근처) 바로 아래에 이동 함수를 추가:
```tsx
  const openInCalendar = (dateKey: string) => {
    close()
    navigate(`/calendar?d=${dateKey}`)
  }
```

`BriefingRow`를 쓰는 두 곳(186행, 194행)에 `onOpen={openInCalendar}`를 붙인다. 나머지 props는 그대로 둔다.

### 1-5. 배경 흐림

`return (` 아래 `<aside>` 하나만 있던 것을 fragment로 감싸고 백드롭을 앞에 둔다.
팝업은 `z-50`이므로 백드롭은 `z-40`이다.

149~156행을 아래로 교체:
```tsx
  return (
    <>
      {/* 흐림은 팝업에 눈을 모으려는 것이다. 백드롭을 누르면 닫히고 "오늘 그만보기"도 그대로 지킨다. */}
      <div
        aria-hidden="true"
        className="briefing-backdrop-in fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[6px]"
        onClick={close}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-briefing-title"
        className="briefing-pop-in fixed z-50 flex max-h-[76vh] w-[440px] flex-col overflow-hidden border border-white/70 bg-white/80 backdrop-blur-xl"
        style={{ left: position.x, top: position.y, borderRadius: 24, boxShadow: WINDOW_SHADOW }}
      >
```

끝의 `</aside>`(213행)를 아래로 교체:
```tsx
      </aside>
    </>
```

**`briefing-pop-in`을 백드롭에 쓰지 마라.** 그 애니메이션은 `scale`과 `rotate`가 들어 있어 전체화면 요소에 걸면 화면이 돌아간다. 아래 3번에서 만드는 `briefing-backdrop-in`을 쓴다.

fragment와 들여쓰기 때문에 `<aside>` 안쪽 블록 전체의 들여쓰기가 두 칸씩 밀린다. 함께 맞춰라.

---

## 2. `src/routes/Calendar.tsx`

`?d=YYYY-MM-DD`가 오면 그 날짜가 선택·포커스된 상태로 연다. 없거나 형식이 틀리면 지금처럼 오늘이다.

### 2-1. import (1~2행)

`react-router-dom`을 쓰는 import가 현재 없다. 2행 `lucide-react` import 위에 추가:
```tsx
import { useSearchParams } from "react-router-dom"
```

### 2-2. 초기 날짜 (145~152행)

현재:
```tsx
  const todayKey = dateKey(today)
  const [mode, setMode] = useState<"month" | "week">("month")
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [owner, setOwner] = useState(ALL)
  const [selectionStart, setSelectionStart] = useState(todayKey)
  const [selectionEnd, setSelectionEnd] = useState(todayKey)
  const [focusKey, setFocusKey] = useState(todayKey)
```
교체:
```tsx
  const todayKey = dateKey(today)
  // HOME 브리핑에서 일정을 누르면 ?d=YYYY-MM-DD로 들어온다. 형식이 틀리면 오늘로 떨어진다.
  const [searchParams] = useSearchParams()
  const initialKey = useMemo(() => {
    const raw = searchParams.get("d")
    return raw && dateFromKey(raw) ? raw : todayKey
  }, [])
  const [mode, setMode] = useState<"month" | "week">("month")
  const [cursor, setCursor] = useState(() => dateFromKey(initialKey) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [owner, setOwner] = useState(ALL)
  const [selectionStart, setSelectionStart] = useState(initialKey)
  const [selectionEnd, setSelectionEnd] = useState(initialKey)
  const [focusKey, setFocusKey] = useState(initialKey)
```

### 2-3. 폼 초기값 (153행)

현재:
```tsx
  const [form, setForm] = useState<EventFormState>(() => formStateFor(todayKey, todayKey))
```
교체:
```tsx
  const [form, setForm] = useState<EventFormState>(() => formStateFor(initialKey, initialKey))
```

`dateFromKey`는 61행에 이미 있고 `Date | null`을 돌려준다. 새로 만들지 마라.
`initialKey`의 `useMemo` 의존성 배열은 **비워 둔다.** 마운트 때 한 번만 읽는 값이다. 의존성을 채우면 사용자가 달력 안에서 날짜를 옮긴 뒤 리렌더에 선택이 되돌아간다.
위 셋은 `useState` 초기화 함수라 어차피 마운트 때만 돈다. `useEffect`로 나중에 덮어쓰는 코드를 추가하지 마라.

---

## 3. `src/index.css`

### 3-1. 백드롭 애니메이션

`@keyframes briefing-pop-in` 블록(337행 근처) **바로 앞**에 추가:
```css
@keyframes briefing-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.briefing-backdrop-in {
  animation: briefing-backdrop-in 260ms ease-out both;
}
```

### 3-2. 모션 축소 대응

`@media (prefers-reduced-motion: reduce)` 안의 아래 블록(492~495행)에 한 줄 추가한다.

현재:
```css
  .briefing-pop-in,
  .briefing-item-in,
  .briefing-float,
  .briefing-ring {
```
교체:
```css
  .briefing-pop-in,
  .briefing-backdrop-in,
  .briefing-item-in,
  .briefing-float,
  .briefing-ring {
```

---

## 하지 말 것

- 다이어리 CSS(`briefing-diary*`, `briefing-drop-*`, `briefing-tape`, `briefing-spiral`)와 Nanum Pen Script를 되살리지 마라. 직전에 의도적으로 지웠다.
- 워킹트리의 기존 변경을 `git reset`·`git checkout`·`git stash`로 건드리지 마라. 되돌림 작업이 스테이징된 상태다.
- 드래그 로직(`startDrag`·`moveDrag`·`stopDrag`)과 `WINDOW_WIDTH`, `WINDOW_SHADOW`, Escape 처리, `hideBriefingToday` 호출을 바꾸지 마라.
- 백드롭에 `briefing-pop-in`을 쓰지 마라(transform 때문에 화면이 돌아간다).
- `li`에 `onClick`을 걸어 항목을 클릭 가능하게 만들지 마라. `button`으로 감싼다.
- `firestore.rules`, `public/data` 아래 JSON, `legacy/`, `backup/`을 열지 마라.

## 성공 기준

- `npm run build`가 통과한다(`tsc --noEmit` 포함). 실패하면 고치고 다시 돌려라.
- `git status --short`에 위 3개 파일 외에 바뀐 파일이 없다(직전 되돌림으로 이미 `M`인 `index.html`은 그대로 남아 있어야 한다).
- `grep -rn "Nanum\|briefing-diary\|briefing-drop" src/ index.html` 결과가 0건이다.
