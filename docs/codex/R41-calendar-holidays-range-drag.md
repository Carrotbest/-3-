# R41 — 캘린더: 주말·휴무일 표시 · 기간(range) 스케줄 · 드래그 기간 선택 → 하단 상세 리스트

대상 캘린더(4곳): `src/routes/Calendar.tsx`(메인), `src/components/dashboard/TeamSchedule.tsx`(홈 레일), `src/routes/Development.tsx`(완료 캘린더), `src/routes/DevelopmentMasterSheet.tsx`(R40의 `DatePickerPopover`). 데이터: `src/data/sample.ts`(CalendarEvent), `src/store/useAppStore.ts`(addTeamEvent). 신규: `src/data/holidays.ts`.

세 가지: **(A) 모든 캘린더에 토/일/공휴일 표시**, **(B) 출장·휴가 등 기간(연속 일자) 스케줄 지원**, **(C) 메인 캘린더에서 날짜를 드래그(단일 클릭 포함)하면 그 기간의 모든 스케줄을 날짜 순서로 달력 아래에 리스트업**.

---

## Part A — 주말·공휴일 캘린더 (모든 달력 공통)

### A-1. 공휴일 유틸 신설 `src/data/holidays.ts`
```ts
// 한국 공휴일/대체공휴일 + 회사 휴무일. dateKey "YYYY-MM-DD" → 명칭. 사용자가 쉽게 추가/수정.
export const HOLIDAYS: Record<string, string> = {
  // 2026 (요일 검증 완료)
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일(삼일절)",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일(부처님오신날)",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일(광복절)",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-09-28": "대체공휴일(추석)",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일(개천절)",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  // 2025·2027 고정일 공휴일(음력·대체는 필요 시 사용자가 추가)
  "2025-01-01": "신정", "2025-03-01": "삼일절", "2025-05-05": "어린이날", "2025-06-06": "현충일", "2025-08-15": "광복절", "2025-10-03": "개천절", "2025-10-09": "한글날", "2025-12-25": "성탄절",
  "2027-01-01": "신정", "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-10-03": "개천절", "2027-10-09": "한글날", "2027-12-25": "성탄절",
}
const pad = (n: number) => String(n).padStart(2, "0")
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isHoliday = (key: string) => key in HOLIDAYS
export const holidayName = (key: string) => HOLIDAYS[key] ?? ""
export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
/** 날짜 톤: 일요일·공휴일=휴일(빨강), 토요일=토(파랑), 그 외 평일. */
export function dayTone(d: Date): "holiday" | "sat" | "weekday" {
  if (d.getDay() === 0 || isHoliday(dateKeyOf(d))) return "holiday"
  if (d.getDay() === 6) return "sat"
  return "weekday"
}
/** 숫자/요일 텍스트 색 클래스(토큰 없이 tailwind 색으로 통일). */
export const dayToneText = (d: Date) => dayTone(d) === "holiday" ? "text-rose-500 dark:text-rose-400" : dayTone(d) === "sat" ? "text-sky-500 dark:text-sky-400" : "text-[var(--foreground)]"
```
(기존 각 파일의 로컬 `dateKey`/`pad`와 충돌하지 않게 import 별칭 사용 가능.)

### A-2. 적용(4개 캘린더 모두)
- **요일 헤더**: 일요일 라벨=휴일색(rose), 토요일=토색(sky).
- **날짜 셀/버튼**: 날짜 숫자에 `dayToneText(date)` 적용(일·공휴일=rose, 토=sky). 공휴일이면 셀에 **작은 공휴일 명칭**(예: `holidayName`)을 muted로 노출(월간 그리드는 공간 되는 곳에, DatePickerPopover는 날짜 버튼 `title`/aria에 포함).
- 기존 "오늘" 강조, 다른달 흐림 등은 유지하고 색만 얹는다(오늘 강조가 우선).
- 대상: Calendar.tsx(헤더+셀), TeamSchedule.tsx(헤더+셀), Development.tsx 완료 캘린더(헤더+셀), DatePickerPopover(요일 헤더+날짜 버튼).

---

## Part B — 기간(range) 스케줄 (출장·휴가 등 연속 일자)

### B-1. 모델 확장 `src/data/sample.ts`
- `CalendarEvent`에 `endDate?: string`(옵셔널, "YYYY-MM-DD") 추가. 없으면 단일일(=date). `endDate < date`면 단일일 취급.
- `sampleEvents()`에 range 예시 2건 추가(예: `trip` 2~3일, `leave` 2일)로 데모에서 확인 가능하게.

### B-2. 생성 폼(`TeamSchedule.tsx`)
- 이벤트 추가 폼에 **종료일(endDate) 입력** 추가(옵셔널). 특히 `leave`(연차)·`trip`(출장)에서 유용. 시작일 필수, 종료일은 비우면 단일일.
- `addTeamEvent` 호출 시 `endDate`(있으면) 포함. `src/store/useAppStore.ts`의 `addTeamEvent`/캐시는 `CalendarEvent` 그대로 저장하므로 필드만 통과시키면 됨(별도 로직 변경 최소).

### B-3. 캘린더 렌더에 range 반영(Calendar.tsx, TeamSchedule.tsx)
- 이벤트가 `[date, endDate]` 범위를 덮으면 **범위 내 각 날짜 셀에 표시**한다(해당 기간 모든 날에 칩 노출). 칩에 기간 표시(예: 다중일이면 제목 옆 작은 배지나 `~` 표기), 시작일 칩엔 시간, 중간일은 연속 느낌(선택: 좌우 라운드 제거로 바 느낌). MVP는 "각 날에 칩 반복"으로 충분.
- `byDate` 그룹핑을 range 전개(각 이벤트를 덮는 모든 dateKey에 매핑)로 바꾼다.

---

## Part C — 드래그 기간 선택 → 달력 아래 스케줄 상세 리스트 (Calendar.tsx)

현재 날짜 클릭 시 옆에 Sheet로 당일 일정을 보여준다. 이를 **달력 아래 인라인 "선택 기간 상세" 리스트**로 바꾸고, **드래그로 기간 선택**을 지원한다.

- **선택 상태**: `selectionStart`, `selectionEnd`(둘 다 dateKey). 단일 클릭 = 시작=끝(1일). 드래그 = 범위.
- **드래그 상호작용**(월/주 그리드 날짜 셀):
  - `onMouseDown(day)` → 앵커 설정, dragging=true, start=end=day.
  - `onMouseEnter(day)` (dragging 중) → end=day. 표시 범위는 `[min(start,end), max(start,end)]`.
  - `onMouseUp`(window) → dragging=false로 확정.
  - 단순 클릭(드래그 없이)도 1일 선택으로 동작(mousedown+mouseup 동일 셀).
  - 키보드 접근성: 기존 방향키 포커스 유지, Enter/Space = 그 날 1일 선택.
- **선택 범위 하이라이트**: 선택된 셀들에 은은한 배경 틴트(엑셀 느낌), 시작/끝 강조.
- **달력 아래 상세 리스트 섹션**(기존 Sheet 대체):
  - 제목: 선택 기간 표시(단일: `YYYY.MM.DD (요일)`, 범위: `YYYY.MM.DD ~ YYYY.MM.DD`), 총 건수.
  - **선택 기간과 겹치는 모든 이벤트**(range 겹침: `event.start <= selEnd && event.end >= selStart`)를 **날짜 오름차순(그다음 time)으로 정렬**해 리스트업. 각 항목 앞에 **날짜(다중일이면 시작~종료)를 라벨**로 붙이고, 유형 배지·제목·시간/장소/담당 표기. owner 필터 적용.
  - 비어 있으면 "선택 기간에 등록된 일정이 없습니다."
  - 기본 선택 = 오늘(1일)로 초기화해 로드 시 리스트가 채워지게.
- 기존 우측 Sheet(당일 상세)는 제거하고 이 하단 리스트로 일원화. (우측 "메일에서 뽑아낸 일정" 카드 레이아웃은 유지하되, 필요 시 하단 리스트와 자연스럽게 배치.)

> 결과 UX: 달력에서 하루를 클릭하거나 여러 날을 드래그하면, 달력 아래에 그 기간의 모든 스케줄이 날짜와 함께 순서대로 정리돼 보인다(출장·휴가 같은 기간 일정도 겹치면 포함).

---

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후).
- 4개 캘린더 모두에서 토=파랑·일/공휴일=빨강, 공휴일명 노출 확인. range 이벤트가 여러 날에 표시되고, TeamSchedule에서 종료일로 기간 등록 가능. 메인 캘린더 드래그→하단 리스트가 기간 내 일정을 날짜순으로 나열.
- 기능 회귀 금지: 기존 이벤트(단일일)·납기 파생·owner 필터·월/주 전환·키보드 이동·DatePickerPopover 선택.
- 전역 토큰·다른 라우트·무관한 로직 변경 금지. `CalendarEvent`는 **필드 추가(endDate)만**, 기존 시그니처 유지.
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R41-last.txt`에 남기고 변경 파일·range 전개 방식·드래그 구현·잔여 이슈 기록.
