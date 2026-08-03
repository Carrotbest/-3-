# 작업지시 06 — STUDY 과제 화면

## 맡을 파일 (이 1개만 새로 만든다)

- `assets/js/views/study.js`

공용 CSS는 건드리지 마라. 화면 전용 스타일은 파일 안 `STYLE_TEXT` 상수에 넣는다
(`assets/js/views/development.js` 참고).

## 먼저 읽을 것

1. `assets/js/views/development.js` — 뷰 구조·서브 라우트 처리·스타일 주입 패턴
2. `assets/js/ui/widgets.js`, `assets/js/ui/table.js`
3. `assets/js/data/sample.js` 의 `sampleStudy()` — 레코드 형태
4. `assets/js/data/schema.js` 의 `MEMBERS`

## 레코드 형태

```js
{ week:31, owner:'김지현', topic:'니트 컬링 원인', category:'품질사고',
  state:'계획'|'진행'|'완료'|'미진행', dueDate:'2026-08-06' }
```

`store.get().study` 배열. 입력은 지금처럼 엑셀 개인 시트에서 하므로 **이 화면은 조회 전용**이다.
고치는 기능을 만들지 마라.

## 서브 라우트

`#/study/<sub>` — `progress`(기본) / `library`

## 진행 현황 (`progress`)

1. **viewHead** — eyebrow `Technical Services`, 제목 `STUDY 과제`,
   subtitle `팀원별 주간 과제의 주제·마감·완료 상태를 한 곳에서 확인합니다.`
   actions에 서브 전환 버튼 2개(진행 현황 / 자료 라이브러리)
2. **이번 주 마감 알림** — 과제 마감은 **매주 목요일**이다.
   오늘 기준 이번 주 목요일까지 남은 일수를 `.alert`로 띄운다.
   미제출(계획·미진행) 건이 있으면 그 수를 함께 적고, 없으면 알림을 띄우지 않는다.
3. **주차별 매트릭스** — 행이 주차(week), 열이 팀원(MEMBERS 중 `role==='팀원'`).
   각 칸에 주제 + 상태 배지. 표가 아니라 CSS 그리드로 만든다.
   상태 배지 톤: 완료 ok / 진행 warn / 계획 neutral / 미진행 crit.
   빈 칸은 `—`로 두고 미제출로 세지 않는다.
4. **분류별 누적** — 품질사고 / 공정 개념 / 환경 / 특정분야 건수를 가로 막대로.
   `createChart(horizontal:true)`를 쓴다. 주제 쏠림을 보는 것이 목적이다.
5. **미진행 건과 사유** — `state === '미진행'`인 건 목록.
   사유 필드가 데이터에 없으므로 `사유 미기재`로 표시하고,
   `사유는 개인 시트에 적어 주세요.` 안내를 붙인다. 사유를 지어내지 마라.
6. **개인 상세** — 팀원 이름을 누르면 그 사람 과제만 모아 보여주는 패널.
   주차·주제·분류·상태·마감일 표.

## 자료 라이브러리 (`library`)

데이터가 아직 없다. `store.get().studyFiles`가 없으면 **빈 상태로 그린다** — 더미를 지어내지 마라.

1. 검색 입력(주제·작성자·분류·연도) + 필터 select — 동작하는 껍데기까지 만든다
2. 자료 카드 목록 자리 — 카드 1장의 구조(제목 / 작성자 / 작성일 / 분류 / 열기·내려받기)를
   보여주는 예시 카드 1장만 두고, 나머지는 `emptyState`로
   `연결 예정 — 팀즈 「자료」 폴더의 파일 목록을 읽어 채웁니다.`
3. **점검 결과 자리** — 파일명 규칙(`YYYY.MM.DD 주제 (작성자)`) 위반 건수와
   취합 엑셀과 짝이 맞지 않는 건수를 보여줄 카드. 지금은 `—`로 두고
   규칙 문구만 정확히 적는다.

## 확인

`node --check assets/js/views/study.js` 와 import 경로만 확인하고 보고한다. 브라우저 확인은 하지 마라.
