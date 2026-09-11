# R127 HOME 첫 랜딩 오늘 브리핑 팝업

상태: 미착수. 사용자 요청 신규 기능이다.

HOME을 열면 오늘 팀 일정을 알려 주는 작은 팝업을 띄운다. 창은 마우스로 끌어 옮길 수 있고,
"오늘 그만보기"를 체크하고 닫으면 그날은 다시 뜨지 않는다.
업무 화면이 전반적으로 딱딱해서 이 팝업만 의도적으로 부드럽고 귀여운 톤으로 만든다.

## 지금 상태 (조사 결과)

- `src/components/dashboard/TeamSchedule.tsx`는 **어디에서도 렌더되지 않는다.** R120에서 스케줄러가
  CALENDAR로 넘어간 뒤 남은 파일이다. 이번 작업에서 건드리지도 말고 지우지도 마라. 판단은 사용자가 한다.
- 그래서 지금 HOME에는 팀 일정이 전혀 안 보인다. 이 팝업이 HOME에서 일정을 보는 유일한 자리가 된다.
- `TeamSchedule.tsx`는 `expandRepeats`를 부르지 않는다. 반복 일정이 안 펼쳐진다. 새로 만드는 쪽은 반드시 부른다.
- 이벤트 원본은 `useAppStore((state) => state.events)` 하나뿐이다. `CalendarEvent` 타입은 `src/data/sample.ts`에 있다.

## A. 새 파일 `src/data/today-briefing.ts`

순수 함수만 둔다. 화면 코드에 판정을 섞지 마라. CALENDAR가 `calendar-events.ts`, `calendar-lanes.ts`를
따로 둔 것과 같은 이유다.

```ts
import { expandRepeats, isTeamEventType, type TeamEventType } from "@/data/calendar-events"
import type { CalendarEvent } from "@/data/sample"

export interface BriefingItem {
  event: CalendarEvent & { type: TeamEventType }
  /** 내일 시작하는 휴가·출장의 하루 전 미리 알림 */
  lead: boolean
  /** 오늘이 기간의 첫날이 아니다(이미 진행 중) */
  ongoing: boolean
}

export function todayBriefing(events: readonly CalendarEvent[], todayKey: string): BriefingItem[]
export function isBriefingHidden(todayKey: string): boolean
export function hideBriefingToday(todayKey: string): void
```

### `todayBriefing` 규칙

1. `todayKey`의 다음 날을 `tomorrowKey`로 구한다. `expandRepeats(base, todayKey, tomorrowKey)`로 펼친다.
   `base`는 `events.filter((e) => isTeamEventType(e.type))`다.
2. 기간 판정은 `endDate`가 `date`보다 크고 형식이 맞을 때만 쓴다. 아니면 하루짜리다.
   `TeamSchedule.tsx`의 `eventEndDate`와 같은 방식이다. 그대로 옮겨 써도 된다.
3. 채택 기준
   - `meeting`, `external`: 기간이 오늘을 덮을 때만. `date <= todayKey && endDate >= todayKey`
   - `leave`, `trip`: 오늘을 덮을 때, **또는 `date === tomorrowKey`일 때**(D-1 미리 알림)
   - 내일 시작하는 미팅은 넣지 않는다. 사용자가 하루 전에 알아야 한다고 한 것은 휴가와 출장이다.
4. `lead = event.date === tomorrowKey`, `ongoing = !lead && event.date < todayKey`
5. 정렬: `lead`가 뒤로, 그다음 유형 순서 `meeting, external, trip, leave`, 그다음 `time` 오름차순
   (`time`이 없으면 뒤), 마지막으로 `title`.
6. 결과가 0건이면 빈 배열이다. 호출부가 팝업을 아예 열지 않는다.

### 저장 규칙

- localStorage 키 `home-today-briefing-hidden-v1`, 값은 숨긴 날짜 문자열(`2026-09-11`) 하나다.
- `isBriefingHidden(todayKey)`는 저장값이 `todayKey`와 같을 때만 `true`다. 날이 바뀌면 저절로 풀린다.
- 읽기와 쓰기 모두 `try/catch`로 감싼다. 사생활 보호 모드에서 저장소가 막혀도 화면은 정상이어야 한다.
  `src/data/view-prefs.ts`가 같은 방식이다.
- `JSON.stringify` 하지 말고 날짜 문자열을 그대로 넣는다. 읽는 쪽도 그대로 비교한다.
- 이 값은 `CACHE_KEYS`에 넣지 마라. Firestore로 올라가면 한 사람이 닫은 것이 팀 전체에서 사라진다.

## B. 새 파일 `src/components/dashboard/TodayBriefing.tsx`

`export function TodayBriefing()` 하나만 내보낸다. 인자는 없다. 안에서 스토어를 직접 읽는다.

### 뜨고 닫히는 규칙

- 모듈 최상단에 `let shownThisLoad = false`를 둔다. **state가 아니라 모듈 변수다.**
  HOME은 라우트를 옮겨 다니면 다시 mount되는데, 그때마다 팝업이 또 뜨면 성가시다.
  이 변수는 새로고침하면 초기화되므로 "웹을 열었을 때 한 번"이 된다.
- 열 조건은 세 개가 모두 참일 때뿐이다. `!shownThisLoad`, `!isBriefingHidden(todayKey)`, `items.length > 0`.
  여는 순간 `shownThisLoad = true`로 바꾼다.
- 판정은 mount 시 `useEffect` 한 번에서 한다. 렌더 도중에 모듈 변수를 바꾸지 마라.
- 닫기 버튼과 Esc 키로 닫는다. 체크박스가 켜져 있으면 닫을 때 `hideBriefingToday(todayKey)`를 부른다.
  꺼져 있으면 아무것도 저장하지 않는다. 그날 안에 새로고침하면 다시 뜬다.
- 바깥을 눌러도 닫지 마라. 끌어 옮기는 창이라 오작동으로 사라지면 답답하다.

### 창 자체

- `position: fixed`, `z-50`. Radix `Dialog`를 쓰지 마라. 모달이라 화면을 덮고 드래그와 맞지 않는다.
  `role="dialog"`, `aria-modal="false"`, `aria-labelledby`를 직접 준다.
- 폭 360px, `max-height: 70vh`, 목록만 안에서 스크롤한다.
- 처음 위치는 오른쪽 위다. `x = max(12, innerWidth - 360 - 28)`, `y = 96`. state로 들고 있는다.
- 머리말 띠를 잡고 끈다. `onPointerDown`에서 `event.preventDefault()`를 부르고
  `setPointerCapture`로 잡는다. 안 걸면 브라우저 기본 선택이 같이 시작돼 화면이 반투명 사본으로 끌려다닌다
  (CLAUDE.md 주의 항목과 같은 함정이다).
- `pointermove`로 좌표를 갱신하고 `pointerup`에서 뗀다. 좌표는 화면 안으로 가둔다.
  `x`는 `[8, innerWidth - 360 - 8]`, `y`는 `[8, innerHeight - 64]`.
- 닫기 버튼과 체크박스 위에서는 드래그를 시작하지 마라. 머리말 띠에만 핸들러를 건다.
- 위치는 저장하지 않는다. 그때그때 쓰고 버리는 창이다.
- `ref` 콜백 안에서 `setState` 하지 마라. 크기가 필요하면 상수 360을 쓴다. R119가 그 사고다.

### 내용

- 머리: 오늘 날짜(`M월 D일 (요일)`), `holidayName(todayKey)`가 있으면 그 이름도. 총 건수를 작은 알약으로.
- 본문은 두 덩이다. `lead`가 아닌 것은 "오늘", `lead`인 것은 "내일" 제목 아래 묶는다.
  `lead` 항목이 없으면 "내일" 덩이를 그리지 않는다.
- 한 줄에 담는 것: 유형 점과 라벨(`TEAM_EVENT_META`), 담당자 이름, 제목, 시간과 장소.
  기간 일정이면 `9.12~9.14` 형태로, `ongoing`이면 "진행 중" 표시를 붙인다.
- 유형별 이모지를 하나씩 붙인다. `meeting` 💬, `external` 🤝, `trip` ✈️, `leave` 🌴.
  `aria-hidden="true"`로 감싼다. 읽어 줄 내용이 아니다.
- 색은 `TEAM_EVENT_META`의 `dot`, `chip`을 쓴다. **새 색을 만들지 마라.** CALENDAR 범례와 어긋난다.
- 바닥: 체크박스 "오늘 그만보기"와 "닫기" 버튼. 체크박스는 `@/components/ui/checkbox`를 쓴다.
- 표면은 `HOME_GLASS_SURFACE`(`@/lib/home-surface`)를 쓰되 모서리만 `rounded-[20px]`로 더 둥글게 한다.

### 모션

CSS 키프레임으로만 한다. 이 저장소에 framer-motion이 없다. 새로 깔지 마라.

`src/index.css`의 `diary-today-pulse` 블록 바로 뒤에 넣는다. 이름은 `briefing-` 으로 시작한다.

- `briefing-pop-in`: `opacity 0, translateY(18px) scale(.92) rotate(-1.5deg)`에서 제자리로.
  420ms `cubic-bezier(.16,1,.3,1)`.
- `briefing-item-in`: 항목 하나씩 아래에서 올라온다. 240ms. `animation-delay`를 항목 순번 * 45ms로 준다.
  인라인 `style`로 지연만 넣는다.
- `briefing-float`: 머리말 이모지가 3s 주기로 위아래 3px 흔들린다. `infinite`.
- `briefing-ring`: 날짜 알약 뒤에 부드럽게 퍼지는 테. 2.4s `infinite`.

`@media (prefers-reduced-motion: reduce)` 블록(`index.css` 358행 근처)에 네 클래스를 모두 넣고
`animation: none; opacity: 1; transform: none;`으로 끈다. 기존 `landing-intro-*` 항목과 같은 형식이다.

## C. `src/routes/Home.tsx`

- `import { TodayBriefing } from "@/components/dashboard/TodayBriefing"`를 더한다.
  기존 import 묶음의 `HomeTrendSection` 옆자리다.
- `Home()`의 반환 JSX 맨 끝, 루트 `<section>`이 닫히기 직전에 `<TodayBriefing />`를 한 줄 넣는다.
  `position: fixed`라 트리 위치가 화면 위치를 바꾸지 않는다.
- Home의 다른 부분은 건드리지 마라.

## D. `CLAUDE.md`

"보기 설정" 절의 키 목록에 `home-today-briefing-hidden-v1`을 더한다. 한 줄이면 된다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/today-briefing.ts` | 신규. 순수 함수와 localStorage 3개 |
| `src/components/dashboard/TodayBriefing.tsx` | 신규. 팝업 컴포넌트 |
| `src/index.css` | 키프레임 4개와 클래스 추가, 감속 모션 예외 추가 |
| `src/routes/Home.tsx` | import 1줄, JSX 1줄 |
| `CLAUDE.md` | 보기 설정 키 1줄 |

## 검증

`npm run build` 한 번. `tsc --noEmit`이 포함되어 있다. 그 외 검증은 하지 마라.

## 하지 말 것

- `TeamSchedule.tsx`를 고치거나 지우지 마라. 지금 렌더되지 않는 파일이고 처분은 사용자가 정한다.
- Radix `Dialog`나 `Sheet`로 만들지 마라. 모달은 드래그와 맞지 않는다.
- framer-motion 같은 새 패키지를 깔지 마라.
- `TEAM_EVENT_META` 밖의 새 색을 만들지 마라.
- 숨김 플래그를 `CACHE_KEYS`나 Firestore에 넣지 마라. 한 사람의 닫기가 팀 전체에 퍼진다.
- `expandRepeats` 결과를 저장소에 쓰지 마라. 회차는 화면에서만 만든다.
- 내일 시작하는 미팅을 넣지 마라. 하루 전 알림은 휴가와 출장만이다.
- 창 위치를 localStorage에 저장하지 마라.
