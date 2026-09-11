# R120 DEVELOPMENT 하단 표 제거와 CALENDAR 스케줄러 전환

상태: 미착수. 조사는 끝났다. 아래 좌표대로 고치면 된다.

## A. DEVELOPMENT 하단 "전체 완료 샘플" 섹션 제거

`src/routes/Development.tsx`

1191~1193행의 `SectionCard title="전체 완료 샘플"` 블록을 통째로 지운다.

**주의: 검색·필터 도구를 같이 잃으면 안 된다.** `toolbar`(1138행)는 지금 그 표에만 붙어 있는데,
바로 위 "완료 캘린더" 가 `filteredItems` 로 그려지고 부제도 "검색 조건과 연동" 이라고 적혀 있다.
표만 지우면 캘린더는 필터가 걸린 채 조작할 방법이 사라진다.
그래서 **`toolbar` 를 "완료 캘린더" 카드 안, 월 이동 줄 위에 옮겨 넣는다.**

지우고 나서 쓰이지 않게 되는 것들도 같이 지운다.

| 대상 | 위치 | 조치 |
|---|---|---|
| `completedLibraryRowId` | 1047행 | 삭제 |
| `columns` useMemo | 1122~1130행 | 삭제 |

지우면 안 되는 것들이다. 다른 데서 계속 쓴다.

- `DataTable`, `DataTableColumn` import(36행) — 1420행, 1513행에서 쓴다
- `library`(1073행) — `latestMonth`, `options`, `filteredItems` 가 쓴다
- `selectedItem` / `setSelectedItem` — 완료 캘린더의 날짜 카드 버튼이 쓴다
- `DevelopmentDetailDialog`(1195행) — 위와 같은 이유

## B. CALENDAR 를 미팅·출장·휴가 스케줄러로

개발 원단 납기는 뺀다. HOME 의 팀 일정과 같은 데이터를 쓰되, CALENDAR 는 등록·수정·삭제까지 하는 본 화면이다.

### B-1. 유형 정의를 한 곳으로 모은다 (신규 파일)

`src/data/calendar-events.ts` 를 만든다. 지금 `Calendar.tsx` 와 `TeamSchedule.tsx` 가 각자 들고 있는
유형 목록과 색·라벨이 서로 다르다. 한 곳만 두고 둘이 가져다 쓴다.

```ts
export const TEAM_EVENT_TYPES = ["meeting", "external", "trip", "leave"] as const
export type TeamEventType = (typeof TEAM_EVENT_TYPES)[number]

/** 화면 문구는 여기 하나뿐이다. HOME 팀 일정과 CALENDAR 가 같은 말을 써야 한다. */
export const TEAM_EVENT_META: Record<TeamEventType, { label: string; dot: string; chip: string }> = {
  meeting:  { label: "미팅(내부)", dot: "bg-[var(--chart-2)]", chip: "border-[var(--chart-2)] text-[var(--chart-2)]" },
  external: { label: "미팅(외부)", dot: "bg-[var(--chart-1)]", chip: "border-[var(--chart-1)] text-[var(--chart-1)]" },
  trip:     { label: "출장",      dot: "bg-[var(--chart-3)]", chip: "border-[var(--chart-3)] text-[var(--chart-3)]" },
  leave:    { label: "휴가",      dot: "bg-[var(--chart-4)]", chip: "border-[var(--chart-4)] text-[var(--chart-4)]" },
}

export const isTeamEventType = (type: string): type is TeamEventType =>
  (TEAM_EVENT_TYPES as readonly string[]).includes(type)
```

**타입 문자열은 바꾸지 마라.** `meeting`, `external`, `trip`, `leave` 는 이미 저장된 값이다.
바꾸면 팀이 등록해 둔 일정이 화면에서 사라진다. 라벨만 바뀐다.

### B-2. `due` 를 없앤다

`src/data/sample.ts`

- 362행 `export type EventType = "meeting" | "due" | "external" | "leave" | "trip"` 에서 `"due"` 를 뺀다.
- `sampleEvents()`(375행)의 `type: "due"` 3줄(378, 381, 384행)을 지운다.

### B-3. `Calendar.tsx` 에서 납기 파생 제거

`src/routes/Calendar.tsx`

- `const records = useAppStore((state) => state.records)`(82행) 삭제.
- `combined` useMemo(96~104행)에서 `deadlines` 를 만들고 합치는 부분을 전부 지운다. `events` 만 쓴다.
  의존성 배열도 `[events]` 로 줄인다.
- `toDate` import 가 남으면 지운다.
- 파일 안의 `CalendarType`, `TYPE_META`(22~28행)를 지우고 B-1 의 `TeamEventType`, `TEAM_EVENT_META` 를 import 해서 쓴다.
- 저장된 값 중 유형이 네 가지가 아닌 것(옛 `due` 등)은 `isTeamEventType` 으로 걸러 목록에서 뺀다.
- `PageHeader` subtitle(164행)을 `"미팅, 출장, 휴가를 팀이 같이 보는 일정표입니다."` 로 바꾼다.

### B-4. 등록·수정·삭제

`src/store/useAppStore.ts`

`deleteTeamEvent`(219행) 바로 아래에 `updateTeamEvent` 를 만든다. `addTeamEvent` 와 같은 모양이다.

```ts
export function updateTeamEvent(event: CalendarEvent): void {
  if (!event.id) return
  const next = useAppStore.getState().events.map((item) => item.id === event.id ? { ...item, ...event } : item)
  setAppState({ events: next })
  void saveCache("events", next)
}
```

`src/data/sample.ts` 의 `CalendarEvent` 에 선택 항목 두 개를 더한다. 기존 값에 영향이 없다.

```ts
  endTime?: string
  note?: string
```

`src/routes/Calendar.tsx` 에 일정 입력 Dialog 를 만든다. 파일 안에 두면 된다.

- 진입 1: `PageHeader` actions 에 `일정 추가` 버튼. 지금 선택된 기간(`selectionFirst`~`selectionLast`)이 시작일·종료일 기본값으로 들어간다.
- 진입 2: "선택 기간 상세" 목록의 각 항목을 누르면 그 일정으로 수정 모드. `id` 가 없는 항목(데모 seed)은 누를 수 없게 한다.
- 필드: 유형(Select, 4종) · 제목(필수) · 시작일 · 종료일 · 시작시간 · 종료시간 · 장소 · 담당(`MEMBERS` Select, 미지정 허용) · 메모
- 저장 버튼: 새 일정이면 `addTeamEvent`, 수정이면 `updateTeamEvent`
- 수정 모드에만 삭제 버튼. `deleteTeamEvent(id)` 후 Dialog 닫기
- 제목이 비면 저장 버튼을 막고 붉은 테두리로 표시한다. 종료일이 시작일보다 앞이면 저장을 막는다
- Dialog 는 `@/components/ui/dialog` 의 `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogBody`, `DialogFooter` 를 쓴다

### B-5. `TeamSchedule.tsx` 는 문구만 맞춘다

`src/components/dashboard/TeamSchedule.tsx`

- 18행 `TEAM_EVENT_TYPES`, 21~26행 `CATEGORY_META`, 80~81행 `isTeamEventType` 을 지우고 B-1 파일에서 import 한다.
- **입력 폼과 나머지 동작은 건드리지 마라.** HOME 에서 잘 돌고 있다. 라벨만 "미팅(내부)/미팅(외부)/출장/휴가" 로 바뀌면 된다.

## 검증

```
npm run build
git status --short
```

- 빌드 통과.
- 바뀐 파일이 `src/routes/Development.tsx`, `src/routes/Calendar.tsx`, `src/components/dashboard/TeamSchedule.tsx`, `src/data/sample.ts`, `src/store/useAppStore.ts`, 새 파일 `src/data/calendar-events.ts`, 그리고 이 문서뿐일 것.

## 하지 말 것

- 저장되는 유형 문자열(`meeting`, `external`, `trip`, `leave`)을 바꾸지 마라. 팀이 등록한 일정이 사라진다.
- `TeamSchedule.tsx` 의 입력 폼과 Sheet 동작을 건드리지 마라. 이번 범위는 문구 통일뿐이다.
- `events` 를 `CACHE_KEYS` 에서 빼거나 저장 경로를 바꾸지 마라. 팀 공유가 끊긴다.
- `Development.tsx` 의 `DataTable` import 를 지우지 마라. 아래쪽 다른 화면이 쓴다.
- 완료 캘린더의 검색·필터를 없애지 마라. 표를 지우는 대신 도구 줄을 캘린더로 옮기는 것이 이번 조치다.
