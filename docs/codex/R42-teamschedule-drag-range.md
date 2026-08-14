# R42 — 홈 "팀 일정"(TeamSchedule) 드래그 기간 선택 → 기간 상세 리스트

대상: `src/components/dashboard/TeamSchedule.tsx` (홈 화면 우측/하단 팀 일정 카드).

메인 캘린더(`src/routes/Calendar.tsx`)에는 R41에서 이미 **드래그 기간 선택 + 달력 아래 선택 기간 상세 리스트**가 구현돼 있다. 홈 팀 일정에도 **동일한 UX**를 적용한다. Calendar.tsx의 R41 구현(선택 상태·드래그 핸들러·범위 하이라이트·겹침 필터·정렬·기간 라벨)을 **그대로 참고·이식**해 일관성을 맞춘다.

현재 상태: `selectedKey`(단일일)만 있고, 셀 클릭 시 그 날짜 선택 → 하단에 당일 이벤트 리스트. range 이벤트 표시(`eventDateKeys`/`isRangeEvent`)는 이미 동작.

## 변경 지시

### 1. 선택 상태를 기간으로
- `selectedKey`(단일) → `selectionStart`, `selectionEnd`(둘 다 dateKey, 기본 `todayKey`)로 교체. `draggingRef` 추가.
- 정렬 범위 `[selFirst, selLast] = selectionStart <= selectionEnd ? [start,end] : [end,start]`.

### 2. 드래그 상호작용(월 그리드 날짜 버튼)
- `onMouseDown(key)` → `draggingRef.current=true`, `setSelectionStart(key)`, `setSelectionEnd(key)`.
- `onMouseEnter(key)` → `if (draggingRef.current) setSelectionEnd(key)`.
- `window`의 `mouseup` → `draggingRef.current=false`(useEffect로 리스너 등록/해제).
- 단순 클릭(드래그 없이)도 1일 선택으로 동작. 키보드 접근성: 버튼 포커스 시 Enter/Space = 그 날 1일 선택(`aria-pressed`는 선택 범위 포함 여부로).
- R41 Calendar.tsx와 동일한 방식으로 구현(중복 로직 재사용 가능하면 재사용).

### 3. 선택 범위 하이라이트
- `[selFirst, selLast]`에 포함된 날짜 셀에 은은한 배경 틴트(엑셀식). 시작/끝(또는 단일 선택)은 기존 `ring-2 ring-[var(--primary)]` 강조 유지. 오늘·다른달·휴일색과 공존.

### 4. 하단 리스트를 "선택 기간 상세"로
- 현재 하단 헤더 `{월}월 {일}일` + 당일 리스트를 **기간 기준**으로 바꾼다.
  - 헤더: 단일이면 `M월 D일`, 범위면 `M.D ~ M.D`(또는 `YYYY.MM.DD ~ YYYY.MM.DD`), 우측 건수 배지.
  - 리스트: **선택 기간과 겹치는 모든 팀 이벤트**를 표시. 겹침 판정은 R41과 동일하게 이벤트 범위 `[event.date, endDate ?? event.date]` 가 `[selFirst, selLast]`와 겹치면 포함(`event.start <= selLast && event.end >= selFirst`).
  - **정렬**: 날짜 오름차순 → time 오름차순.
  - 각 항목: 앞에 **날짜 라벨**(단일일이면 그 날짜, 다중일이면 `시작~종료`) + 기존 표기(유형 배지·담당·제목·시간/장소) + 삭제 버튼(`deleteTeamEvent`) 유지.
  - 비어 있으면 "선택 기간에 등록된 팀 일정이 없습니다."
- 기존 `eventsByDate`(range 전개)는 달력 셀 표시에 계속 사용. 하단 리스트는 위 겹침 필터로 별도 산출(중복 없이 이벤트 1건씩).

### 5. 부수
- "일정 추가" 폼 기본 날짜(`openForm`/`formStateFor`)는 `selFirst` 기준으로. 저장 후 선택도 해당 날짜로.
- 카드 높이/스크롤(`min-h-0 flex-1 overflow-y-auto`) 레이아웃 유지.

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후).
- 홈에서 팀 일정 달력의 여러 날을 드래그 → 하단에 그 기간 일정이 날짜순으로(기간 이벤트는 시작~종료 라벨로) 나열되는지 확인. 단일 클릭도 1일 상세로 동작.
- 기능 회귀 금지: 일정 추가/삭제, range 이벤트 셀 표시, 휴일색, 월 이동/오늘.
- 전역 토큰·다른 파일·store 로직 변경 금지(이 컴포넌트만). `CalendarEvent`/`addTeamEvent` 시그니처 변경 금지.
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R42-last.txt`에 남기고 변경점·드래그/겹침 구현을 기록.
