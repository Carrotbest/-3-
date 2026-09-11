# R122 CALENDAR 를 다이어리형 스케줄러로

상태: 미착수. 화면 개편이다. 데이터 모델과 저장 경로는 그대로 쓴다.

## 무엇을 바꾸나

지금 CALENDAR 는 유형에 관계없이 같은 모양의 칩을 날짜 칸에 쌓는다. 그래서 한 달을 봐도 흐름이 안 보인다.
유형마다 다른 형태를 주고, 한 화면에서 끝나게 하고, 삭제를 달력에서 바로 하게 한다.

| 유형 | 지금 | 바꿀 것 |
|---|---|---|
| 미팅(내부) | 칩 | **본문 카드.** 가장 크고 진하다. 왼쪽 굵은 컬러바 + 시간 + 제목 |
| 미팅(외부) | 칩 | 같은 카드, 색만 다르고 테두리는 점선 |
| 출장 | 칩 | **주를 가로지르는 연속 바.** 시작에 라벨, 양 끝 둥근 캡 |
| 휴가 | 칩 | **굵은 점.** 셀 우상단. 기간이면 셀 배경에 옅은 워시 |

## 화면 구성

한 화면에 넣는다. 지금 오른쪽의 "메일에서 뽑아낸 일정"(연결 예정 자리표시)과 맨 아래 "선택 기간 상세"는 없앤다.
상세 목록은 오른쪽 메모지 패널로 옮긴다.

```
┌──────────────────────────────────────────────────────────────┐
│ 9  SEPTEMBER 2026            [월][주] [담당자▾] [+ 일정 추가] │
│ 미팅 12 · 출장 3 · 휴가 5                                     │
├────────────────────────────────────┬─────────────────────────┤
│ 달력 (주 단위 레인 + 날짜 셀)        │ 메모지 패널              │
│                                    │ 선택 기간의 일정 목록     │
└────────────────────────────────────┴─────────────────────────┘
```

바깥 그리드는 지금과 같은 `xl:grid-cols-[minmax(0,1fr)_20rem]` 을 쓴다.

## 핵심: 주 단위 레인 계산 (신규 파일)

`src/data/calendar-lanes.ts` 를 만든다. **순수 함수만 둔다. React 를 import 하지 마라.**

지금은 42칸을 한 번에 그린다. 연속 바를 그리려면 **주 단위로 쪼개야** 한다.

```ts
export interface LaneBar<T> {
  event: T
  /** 그 주 안에서 시작하는 칸(0~6) */
  startCol: number
  /** 그 주 안에서 차지하는 칸 수(1~7) */
  span: number
  /** 겹치지 않도록 배정한 층(0부터) */
  lane: number
  /** 일정의 실제 시작일이 이 주 안이면 true. 라벨과 왼쪽 캡을 붙인다 */
  isStart: boolean
  /** 실제 종료일이 이 주 안이면 true. 오른쪽 캡을 붙인다 */
  isEnd: boolean
}

/**
 * 한 주에 걸치는 기간 일정을 레인으로 배정한다.
 * weekKeys 는 그 주의 날짜 key 7개(일요일부터).
 * 이벤트는 date <= 주 마지막, endDate >= 주 첫날 인 것만 넘긴다.
 * 시작일 오름차순, 같으면 긴 것 먼저로 정렬해 배정하면 층이 안정적이다.
 */
export function assignLanes<T extends { date: string; endDate?: string }>(
  weekKeys: readonly string[],
  events: readonly T[],
  endOf: (event: T) => string,
): LaneBar<T>[]
```

배정 규칙이다.

1. `startCol = weekKeys.indexOf(시작일)`, 주보다 앞서 시작했으면 0
2. `endCol = weekKeys.indexOf(종료일)`, 주보다 뒤에 끝나면 6
3. `span = endCol - startCol + 1`
4. 레인 0부터 훑어 그 레인에 이미 놓인 바와 `[startCol, endCol]` 이 겹치지 않는 첫 레인에 넣는다
5. 레인은 최대 3까지만 만든다. 넘치면 그 바는 버리고 호출부가 "+n" 으로 표시한다

`laneCount` 도 같이 돌려주면 셀 상단 여백 계산에 쓴다. 반환 형태는 `{ bars, laneCount, overflow }` 로 한다.

## 달력 렌더 구조

`days` 를 7개씩 잘라 주 배열로 만든다. 주마다 이렇게 그린다.

```jsx
<div className="relative">
  {/* 레인: 기간 일정(출장·휴가 range). 절대 배치가 아니라 grid 로 칸을 맞춘다 */}
  <div className="pointer-events-none absolute inset-x-0 top-9 z-10 grid grid-cols-7 gap-px px-1">
    {bars.map((bar) => (
      <div style={{ gridColumn: `${bar.startCol + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }} className="pointer-events-auto ...">
        ...
      </div>
    ))}
  </div>

  {/* 날짜 칸 7개 */}
  <div className="grid grid-cols-7">{...}</div>
</div>
```

날짜 칸의 위쪽 안쪽 여백을 `paddingTop: 36 + laneCount * 22` 로 잡아 바와 본문이 겹치지 않게 한다.

### 출장 바

- 높이 20px, `rounded-full`, 배경 `linear-gradient(90deg, var(--chart-3), color-mix(in srgb, var(--chart-3) 70%, white))`
- `isStart` 면 왼쪽 끝이 둥글고 라벨(제목 + 담당) 표시, 아니면 왼쪽을 각지게 하고 라벨 생략
- `isEnd` 면 오른쪽 끝이 둥글다
- 등장 모션: `scaleX` 0 → 1, `transform-origin: left`, 320ms, 레인당 40ms 지연
- hover 시 삭제 X 노출

### 휴가

- 기간이 하루면 셀 우상단에 굵은 점 하나
- 기간이면 레인 바 대신 **셀 배경 워시**(`color-mix(in srgb, var(--chart-4) 12%, transparent)`) + 매일 우상단에 점
- 점 크기 9px, `rounded-full`, `bg-[var(--chart-4)]`, `ring-2 ring-[var(--card)]`
- 여러 명이면 점을 가로로 나열하고 3개 넘으면 `+n`
- 등장 모션: `scale` 0 → 1, `cubic-bezier(0.34, 1.56, 0.64, 1)`, 240ms

### 미팅 카드

- 셀 본문. `rounded-[calc(var(--radius)-2px)]`, 왼쪽 3px 컬러바, 배경은 카드색
- 내부는 `--chart-2` 실선, 외부는 `--chart-1` 점선 테두리
- 한 줄: 시간(있으면) + 제목. 두 번째 줄에 장소·담당(작게)
- 월 보기는 최대 2개, 넘으면 `+n건`. 주 보기는 전부
- `hoverLift`(`@/lib/motion`) 적용
- hover 시 오른쪽에 삭제 X

## 삭제

지금은 수정 Dialog 안에만 있어서 찾기 어렵다. 달력에서 바로 되게 한다.

- 미팅 카드와 출장 바에 hover 시 X 버튼. `event.stopPropagation()` 후 처리
- **두 번 눌러야 지워진다.** 첫 클릭에 그 항목만 "삭제?" 상태로 바뀌고 3초 뒤 저절로 풀린다. 팀 공유 데이터라 한 번에 지우면 위험하다
- 휴가 점은 작아서 X 를 못 붙인다. 오른쪽 메모지 패널에서 지운다
- 메모지 패널의 각 항목에는 삭제 버튼을 상시 노출한다. 같은 2단계 규칙을 쓴다
- `id` 가 없는 항목(옛 seed)은 삭제 버튼을 숨긴다

## 다이어리 느낌

- **헤더**: 월 숫자를 크게(`text-5xl font-semibold tabular-nums tracking-tight`), 옆에 영문 월과 연도를 작게. 그 아래 `미팅 n · 출장 n · 휴가 n` 요약
- **괘선**: 달력 카드 배경에 아주 옅은 가로줄
  `repeating-linear-gradient(to bottom, transparent 0 31px, color-mix(in srgb, var(--border) 35%, transparent) 31px 32px)`
- **워시테이프**: 선택 기간의 첫 칸과 끝 칸 위쪽에 살짝 기울어진 반투명 조각
  `rotate-[-2deg]`, `bg-[color-mix(in srgb, var(--warning) 45%, transparent)]`, 폭 44px 높이 14px
- **메모지 패널**: 카드 위쪽에 테이프 한 조각, 왼쪽에 바인더 구멍 3개(원형 `bg-[var(--muted)]`), 항목 사이는 점선 구분
- **오늘**: 날짜 숫자에 채운 원 + 셀에 은은한 ring pulse (2s infinite)

## 모션 규칙

- 월·주를 넘기면 날짜 칸이 stagger 로 들어온다. `index * 8ms`, 최대 240ms
- **모든 애니메이션에 `motion-reduce:` 가드를 넣는다.** 이 저장소 규칙이다
- 키프레임이 필요하면 `src/index.css` 에 추가한다. Tailwind 임의값으로 `animation` 을 쓰되 키프레임은 CSS 에 둔다

## 하지 말 것

- **`CalendarEvent` 타입과 저장되는 유형 문자열(`meeting`, `external`, `trip`, `leave`)을 바꾸지 마라.** 팀이 등록한 일정이 사라진다
- `addTeamEvent` / `updateTeamEvent` / `deleteTeamEvent` 저장 경로를 바꾸지 마라
- `src/data/calendar-events.ts` 의 라벨을 바꾸지 마라. HOME 팀 일정과 같은 문구를 써야 한다
- `TeamSchedule.tsx`(HOME 위젯)는 건드리지 마라
- **ref 콜백 안에서 setState 하지 마라.** 크기를 재야 하면 `ResizeObserver` 를 쓴다(R119 사고)
- 달력 전체를 `SectionCard` 로 감쌀 때 카드가 뷰포트보다 훨씬 길어지지 않게 한다. `Reveal` 의 IntersectionObserver 임계값이 0.12라 영영 안 보일 수 있다
- 외부 애니메이션 라이브러리를 새로 넣지 마라. CSS 트랜지션과 키프레임으로 한다
- 기존 일정 추가 Dialog(유형·제목·기간·시간·장소·담당·메모)와 날짜 칸 더블클릭 동작은 그대로 둔다

## 검증

```
npm run build
git status --short
```

- 빌드 통과.
- 바뀐 파일이 `src/routes/Calendar.tsx`, 신규 `src/data/calendar-lanes.ts`, 필요하면 `src/index.css`, 그리고 이 문서뿐일 것.
