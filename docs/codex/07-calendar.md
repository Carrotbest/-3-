# 작업지시 07 — CALENDAR 화면

## 맡을 파일 (이 1개만 새로 만든다)

- `assets/js/views/calendar.js`

공용 CSS는 건드리지 마라. 화면 전용 스타일은 파일 안 `STYLE_TEXT` 상수에 넣는다.

## 먼저 읽을 것

1. `assets/js/views/development.js` — 뷰 구조·스타일 주입 패턴
2. `assets/js/ui/widgets.js`
3. `assets/js/data/sample.js` 의 `sampleEvents()`
4. `assets/js/data/derive.js` 의 `attentionItems()` — 납기 일정의 출처
5. `assets/js/core/format.js` — 날짜 처리는 반드시 여기 함수를 쓴다

## 일정의 두 출처

1. **등록 일정** — `store.get().events` : `{ date:'2026-08-03', type:'meeting'|'due'|'external'|'leave', title, time?, place? }`
2. **개발 건 납기** — `store.get().records`의 `dueDate`를 `type:'due'` 일정으로 자동 변환한다.
   제목은 `${styleNo} 납기`, 담당은 `owner`. 이 변환은 화면에서 한 번만 계산한다.

두 출처를 합쳐 하나의 배열로 만들고 그 뒤로는 동일하게 다룬다.

## 만들 것 (IA_화면구성_v7 「CALENDAR」 행 기준)

1. **viewHead** — eyebrow `Operations`, 제목 `캘린더`,
   subtitle `미팅, 납기, 외부 일정을 한 흐름으로 확인합니다.`
   actions: `‹` / `2026년 8월` / `›` / `오늘`
2. **월 / 주 보기 전환** — 탭(`.tabs`)으로 전환. 기본은 월.
   - 월 보기: 7열 그리드. 이전·다음 달 날짜는 흐리게. 오늘 칸은 강조.
     한 칸에 일정 최대 3개까지 표시하고 넘으면 `+N건`.
   - 주 보기: 7열 + 시간대 없이 하루 칸을 세로로 길게. 그날 일정 전부 표시.
3. **유형별 색상** — 미팅 ok / 납기 warn / 외부 brand / 휴가 neutral.
   상단에 범례를 둔다. 색만으로 구분하지 말고 유형 이름도 함께 보이게 한다.
4. **담당자별 필터** — MEMBERS 기준 select. 선택 시 그 담당의 일정·납기만 남는다.
5. **메일에서 뽑아낸 일정 (확인 대기)** — 우측 카드.
   소팀장의 주간 미팅 요약 메일에서 자동 추출된 일정이 사람 확인을 거쳐 반영되는 자리다.
   지금은 연결 전이므로 `emptyState`로
   `연결 예정 — 주간 미팅 요약 메일에서 일정을 뽑아 여기에 쌓입니다. 확인 후 반영됩니다.`
   그 아래에 흐름을 보여주는 3단계 표시(추출 → 확인 → 반영)만 정적으로 둔다.
   **가짜 추출 일정을 지어내지 마라.**
6. **날짜 칸 클릭** — 그날 일정을 모아 보여주는 패널. Esc로 닫히고 포커스가 돌아온다.

## 주의

- 월 이동은 `Date` 연산으로 직접 한다. 월말·윤년에서 깨지지 않게 하라
  (`new Date(y, m + 1, 0).getDate()`로 말일을 구하는 식).
- 요일 시작은 **일요일**이다.
- 키보드로 날짜 칸 사이를 화살표로 이동할 수 있게 한다(`roving tabindex`).

## 확인

`node --check assets/js/views/calendar.js` 와 import 경로만 확인하고 보고한다. 브라우저 확인은 하지 마라.
