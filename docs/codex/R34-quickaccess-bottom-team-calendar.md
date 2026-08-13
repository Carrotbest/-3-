# R34 — Quick access 하단 3열 이동 + 팀 일정 캘린더 섹션 신설

## 목표
1. **Quick access**를 Home 상단 우측 레일에서 빼서 **페이지 맨 하단으로 이동**하고, **3열 그리드**로 배치한다. 기존 Aurora Glass 카드 디자인(반투명·그라디언트 액센트·깊이 섀도·모서리 10px)은 **그대로 유지**한다.
2. 비워진 **상단 우측 레일 자리(`<aside className="xl:col-span-4">`)에 팀 일정 캘린더 섹션(`TeamSchedule`)을 신설**한다. 팀원의 **미팅 / 연차 / 외근 / 출장** 계획을 등록·조회·공유하는 용도.

> 배경: Home 상단은 12칼럼 2:1 구조(좌 8 = KPI 3종 + RDDA 차트, 우 4 = 레일). 현재 우측 레일에 `QuickAccessRail`(세로 글래스 카드 8개)이 들어 있다. 이걸 하단 3열 그리드로 내리고, 그 자리에 팀 일정 캘린더를 넣는다.

---

## Part A — Quick access 하단 3열 이동

**대상: `src/routes/Home.tsx`**

- 현재 상단 우측 레일의 `<aside className="xl:col-span-4"><QuickAccessRail items={QUICK_ACCESS} onNavigate={navigate} /></aside>` 에서 `QuickAccessRail`을 **제거**하고 그 자리에 `<TeamSchedule />`(Part B)를 넣는다.
- 기존 `QuickAccessRail`(세로 스택) 컴포넌트를 **`QuickAccessGrid`(3열 그리드)로 대체**한다. 카드 1개의 **비주얼(글래스 패널·그라디언트 아이콘칩·hover 리프트/글로우·상단 하이라이트·모서리 10px·`QUICK_ACCESS_ACCENTS` 액센트)은 100% 동일하게 유지**하고, 컨테이너만 세로 스택 → 3열 그리드로 바꾼다.
  - 그리드: `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3` (8개 항목 → 3/3/2로 배치).
  - 카드 높이는 그리드 셀 내에서 자연 높이(세로 flex-1 강제 제거). 카드 내부는 아이콘칩 + 제목/설명 + 우측 화살표의 가로 레이아웃 유지.
  - 상단 "Quick access" 헤더 라벨은 섹션 제목으로 이동(아래).
- **위치**: 페이지 **맨 하단**(현재 마지막 섹션인 "Trend issue" 다음)에 새 섹션으로 배치:
  ```
  <section aria-labelledby="quick-access-title">
    <div className="mb-4"><h2 id="quick-access-title" className="text-base font-semibold text-[var(--foreground)]">Quick access</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">자주 사용하는 업무 화면으로 바로 이동합니다.</p></div>
    <QuickAccessGrid items={QUICK_ACCESS} onNavigate={navigate} />
  </section>
  ```
- `QUICK_ACCESS`, `QUICK_ACCESS_ACCENTS`, `PinBoardItem` 타입 import는 그대로 재사용.

---

## Part B — 팀 일정 캘린더 섹션 (`TeamSchedule`)

### B-1. 데이터 모델 확장

**`src/data/sample.ts`**
- `EventType`에 값 2개 추가: `"meeting" | "due" | "external" | "leave" | "trip"`.
- `CalendarEvent` 인터페이스에 필드 2개 추가(옵셔널):
  ```ts
  export interface CalendarEvent {
    id?: string          // 신규
    date: string
    type: EventType
    title: string
    time?: string
    place?: string
    owner?: string       // 신규 (담당자 이름)
  }
  ```
- `sampleEvents()`에 데모용 1~2건 추가(owner 포함, leave/trip/external 각 예시). 실제 사용자 데이터는 넣지 말 것.

**`src/data/cache.ts`**
- `CACHE_KEYS`에 `"events"`를 추가한다(현재 `records`/`completed`/`meta` 등과 동일 패턴). 이로써 `saveCache("events", events)` / 부팅 시 `loadAllCache()`가 events를 저장·복원한다.

**`src/store/useAppStore.ts`**
- 팀 일정 추가/삭제 액션을 추가하고 IndexedDB에 영속화한다(기존 `saveDevelopmentRecord` 등과 동일 패턴: `setAppState` + `void saveCache("events", next)`):
  - `addTeamEvent(event: CalendarEvent)`: `id`가 없으면 생성(`crypto.randomUUID()` 사용, 폴백 `String(Date.now())`), 현재 `events` 배열에 append → 저장.
  - `deleteTeamEvent(id: string)`: `id` 일치 항목 제거 → 저장.
- 두 액션은 현재 스토어의 액션 export 방식과 동일하게 노출한다.

**`src/App.tsx`**
- 부팅 로딩 흐름에서 `loadAllCache()` 결과의 `events`가 있으면 반영되도록 확인(대부분 기존 `setAppState(cached)` 스프레드로 자동 반영됨). 캐시에 events가 없으면 기존 `sampleEvents()` 유지. embedded 패치 흐름(`{ ...cached, ...embedded.patch }`)이 events를 덮어쓰지 않는지 확인.

### B-2. 컴포넌트 `src/components/dashboard/TeamSchedule.tsx` (신규)

목적: 좁은 우측 레일(약 440px)에서 팀의 미팅/연차/외근/출장 일정을 미니 캘린더 + 선택일 목록 + 등록 폼으로 공유.

**높이**: 좌측 열(KPI+RDDA) 높이에 맞춰 `h-full`로 채운다(레일 aside가 그리드 행 높이를 공유). 컨테이너는 `flex h-full flex-col`. 카드 컨테이너: `rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4`.

**카테고리(구분) 정의** — 색은 토큰 사용, Calendar 라우트(`src/routes/Calendar.tsx`)의 `CATEGORY_META`와 톤을 맞춘다:
| type | 라벨 | 색(dot/chip) |
|---|---|---|
| meeting | 미팅 | `var(--chart-2)` |
| leave | 연차 | `var(--chart-4)` |
| external | 외근 | `var(--chart-1)` |
| trip | 출장 | `var(--chart-3)` |

`due`(납기)는 자동 파생이므로 **팀 일정 입력·표시 대상에서 제외**한다. TeamSchedule는 `events` 중 `type ∈ {meeting, leave, external, trip}`만 다룬다.

**UI 구성(위→아래)**
1. 헤더: 좌측 "팀 일정" 제목 + 부제 "미팅·연차·외근·출장 공유", 우측 "일정 추가" 버튼(`<Button size="sm">` + `Plus` 아이콘) → 등록 Sheet 오픈.
2. 카테고리 범례 칩 4개(색 dot + 라벨). 클릭 시 해당 카테고리 필터 토글(선택)해도 좋음(옵션, 필수 아님).
3. 미니 월 캘린더:
   - 현재 커서 월 기준 7열 그리드(요일 헤더 포함, Calendar 라우트와 동일한 주 시작 요일 규칙 사용).
   - 이전/다음 달 이동 버튼 + "오늘" 버튼, 상단에 "YYYY년 M월" 표기.
   - 각 날짜 셀: 날짜 숫자 + 그 날의 팀 이벤트 카테고리 색 dot(최대 3~4개, 초과 시 `+N`). 오늘 강조, 선택일 강조(ring).
   - 셀 클릭 → 선택일 설정.
4. 선택일 패널(`min-h-0 flex-1 overflow-y-auto`): 선택일의 팀 이벤트 목록. 각 행 = 카테고리 색 chip/dot + 담당자(owner) + 제목 + (시간/장소 있으면 표기) + 우측 삭제(×) 버튼(`deleteTeamEvent`). 이벤트 없으면 빈 상태 안내.
5. 등록 Sheet(모달): 필드 — 날짜(`type="date"`, 기본값=선택일) / 구분(Select: 미팅·연차·외근·출장) / 담당자(Select: `MEMBERS`의 name) / 제목(Input) / 시간(Input, 옵션) / 장소(Input, 옵션). **필수: 날짜·구분·담당자·제목.** 저장 시 `addTeamEvent` 호출 → 닫고 해당 날짜 선택.

**모달 투명 버그 주의**: Sheet 사용 시 `SheetContent`에 명시적 배경(`bg-[var(--background)]` 또는 `bg-[var(--card)]`)을 지정한다(기존 `KpiDetailSheet` 패턴 참고). 또는 `src/components/ui/dialog.tsx`(명시적 `var(--card)`) 사용.

**재사용**: `Card`/`Button`/`Badge`/`Select`/`Input`/`Label`/`Sheet`(또는 dialog) 등 기존 `@/components/ui/*`를 사용. 아이콘은 lucide-react.

---

## 공유(sharing)에 대한 주의
- 실제 팀원 간 실시간 공유는 백엔드(Firebase 검토 중, 미정)가 필요하다. 이번 R34는 **로컬 IndexedDB 저장** 기반의 "팀 공용 일정" UX/데이터모델 구현까지다. 데이터 모델과 저장 계층을 분리해 두어, 추후 Firebase 동기화로 저장 계층만 교체할 수 있게 한다.

## 금지사항 (반드시 준수)
- Home 상단 **12칼럼 2:1 구조, KPI 3종, RDDA 카드, OwnerLaneBoard 섹션, Work report 2×2, Trend issue 섹션은 변경 금지**. 오직 (a) 우측 레일 내용 교체(→ TeamSchedule), (b) 하단 Quick access 3열 섹션 신설만 한다.
- **전역 레이아웃·밀도 변경 금지**: `App.tsx`의 `max-w-[2200px]`, `index.css`의 기준 폰트 14px 등은 의도된 설정이므로 유지.
- Quick access 카드의 글래스 비주얼(색/섀도/블러/모서리/액센트)은 **동일 유지**.
- 앱은 **라이트 전용**(`.dark` 토글 제거됨). 다크 대응 코드 추가 금지.
- **커밋 금지, `git reset`/`git checkout` 금지.** 사용자 실제 데이터·캐시 내용을 로그/공개 파일에 넣지 말 것.
- 다른 라우트(DD workspace, RDDA, TS, Warehouse 등) 로직 변경 금지.

## 검증(완료 전 필수)
- `npx tsc --noEmit` 통과.
- 가능하면 `npm run build` 통과.
- 수동 확인 포인트: (1) 하단 Quick access가 3열 글래스 그리드로 표시, (2) 상단 우측 레일에 팀 일정 캘린더 표시, (3) 일정 추가 → 캘린더 dot·선택일 목록 반영 → 새로고침 후에도 유지(IndexedDB), (4) 삭제 동작.
