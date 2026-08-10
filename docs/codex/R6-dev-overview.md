# 작업지시 R6 — DEVELOPMENT Overview 대시보드 (밝고 세련된 동적 KPI)

전제: `docs/REACT_REBUILD.md`. 8개 화면 동작 중. 검증 `npx tsc --noEmit` + `npm run build`.

## 배경

기존 carrotbest 사이트의 overview 데이터 구조를 가져오되, **비주얼은 완전히 새로 만든다.**
다크 게이지가 아니라 **밝고 세련된 shadcn 라이트 팔레트의 동적 KPI**로 구성한다.
데이터 구조 참고: `legacy/overview_extract.txt` (이 파일만 열어도 됨. 다른 legacy 파일 금지).

## DEVELOPMENT 화면 구조 재편

현재 Development.tsx 는 목록/보드/타임라인 탭 + 서브라우트(overview/eu/season/core/project) 필터다.
이걸 다음으로 재편한다:

- `#/development` 또는 `#/development/overview` → **Overview 대시보드**(이번에 새로 만드는 것)
- `#/development/eu|season|core|project` → 기존 필터 리스트(목록/보드/타임라인) 그대로 유지
- 즉 overview 서브만 대시보드로 바뀌고, 카테고리별 서브는 기존 리스트 유지.

사이드바 DEVELOPMENT 하위에 Overview 가 이미 있다. Overview 클릭 시 대시보드가 뜨면 된다.

## Overview 대시보드 구성 (원본 1~5 항목 → 새 KPI)

색은 **shadcn 토큰 + 차트 변수(--chart-1..5)만**. 임의 hex 금지. 모든 수치는 `src/data/derive.ts` 집계 사용.
필요한 집계 함수가 없으면 **derive.ts 에 추가해도 된다**(이 작업 한정 허용). 동작은 기존 것과 일관되게.

### 1. 상단 요약 — 총 샘플 / GD개발 / 국내개발 / 접수현황
- `src/data/sample.ts` 레코드에 `devType: 'GD' | '국내'` 를 추가한다(약 82% GD / 18% 국내로 분포, 시드 고정).
  derive 에 `devTypeSplit(records)` 추가: `{ total, gd, dom, gdPct, domPct }`.
- 큰 카드 2장(GD개발/국내개발) — 건수 + %. **가로 비율 바**로 82.7% / 17.3% 처럼 시각화(애니메이션 채움).
- 접수현황(=Style No. 기재/미기재) 작은 지표 하나.

### 2. 4공정 KPI — 원사 / 편직 / 염색 / 피니쉬
- `stage` 기준 각 공정 도달 건수/전체 + %. derive 에 `processFunnel(records)` 추가
  (원사 이상 진행=YARN, 편직 이상=KNITTING … 누적 개념. 원본 overview 처럼 done/total).
- **밝은 동적 도넛/링 게이지 4개** — 각 공정 색은 --chart-1..4 계열. 마운트 시 0→값 애니메이션(카운트업 + 링 채움).
  `prefers-reduced-motion` 이면 애니메이션 생략. 아래에 done/total, 큰 %.
- 새 컴포넌트 `src/components/charts/RadialKpi.tsx` (Recharts RadialBarChart 또는 SVG + CSS 애니메이션).

### 3. 담당자별 현황 (STATUS BY MEMBERS)
- MEMBERS 각자: 작지 건수 + 국내/GD 도넛(작게) + PROCESS STATUS 그라디언트 누적 바(미접수/편직대기/염색중/등록대기).
- 카드 리스트. derive 에 `byOwnerDetailed(records)` 추가.

### 4. Categories — 작은 카드 형태 (사용자 명시)
- 기존 큰 표 대신 **카테고리별 작은 카드**(SEASON/CORE/EU/PROJECT): 건수 + OPT 수 + 미니 도넛 또는 바.
  4장 그리드.

### 5. Schedule Alerts — 기존과 동일한 형태
- 공정 지연 건(납기 초과/임박)을 행 목록으로. `attentionItems(records)` 사용.
  원본 hp-warn-rows 처럼 담당·공정단계·지연일 표시. 기존 파싱 방식 유지.

### (선택) Lead Time — 하단 StatCard 4
- 이번주 완료 / 이번달 완료 / 편직 리드타임 / 샘플 리드타임. 데이터 없으면 '—'.

## 규칙
- 색·폰트는 토큰만. MutationObserver 로 표 감시 금지. 새 npm 설치 금지(필요시 보고).
- 기존 카테고리 리스트(eu/season/core/project 서브)·다른 화면은 건드리지 마라.
- 애니메이션은 세련되게 절제(카운트업·링 채움·바 채움 정도). 과한 3D·네온 금지.
- 커밋 금지.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / COMPONENTS / DERIVE(추가한 집계 함수) / BUILD / NOTES.
