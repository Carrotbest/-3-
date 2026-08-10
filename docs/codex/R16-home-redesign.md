# 작업지시 R16 — HOME 대시보드 전면 재설계 (최우선 화면)

전제: R11~R15 완료. `docs/REACT_REBUILD.md`, `docs/reference/data-sources.md`.
검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. 커밋·실데이터 로그 금지. 강도 **화려하되 절제**(모더레이트+).

## 데이터 소스 우선순위 (중요·이번에 확정)
- **현재 KPI·집계는 DD(전체현황) 기준이 정답.** HOME 의 모든 현재 수치는 `store.records`(=DD 파싱)에서.
- **샘플 관리 대장은 보조**: 창고보관 넘버링·과거 이력(완료샘플 라이브러리) + **월별 추이 과거 backfill** 용도로만.
- HOME 샘플 현황을 샘플대장 '현황' 시트로 집계하지 마라. DD 기준.

## HOME 레이아웃 (위→아래)

### 1) 4개 KPI — 숫자 기본 + 목적별 그래프 (sparkline 대체)
`derive.ts` 의 `kpis(records)` 값을 헤드라인 숫자로. 각 카드에 목적에 맞는 미니 그래프:
- **개발 진행**: 공정 세그먼트 바 — 진행중 건을 원사/편직/염색/피니쉬 단계로 분해(누적 가로 바). `processFunnel` 활용.
- **이번주 완료**: 목표 대비 불릿 바(완료 vs 주간목표=derive 에 상수/추정) + 최근 주 미니 컬럼.
- **납기 임박**: D-day 버킷 가로 바(오늘/D-1/D-2/D-3) — `attentionItems` 의 `_days` 로 버킷팅.
- **지연**: 지연일 구간 바(1–3일/4–7일/7일+), 빨강 강조. 큰 숫자 + 구간 분포.
- 숫자는 `NumberTicker`. 카드 `hoverLift` + `Reveal`.

### 2) 개발 진행 추이 (핵심 그래프)
- **월별 개발 건수(막대) + KPI 선(완료율 또는 누적, 이중축) 복합 차트** (Recharts ComposedChart).
- 월 집계 기준: **Request Date(개발 요청월)**. 최근 개월 = DD `records`, **과거 ~6개월 = 샘플 관리 대장**(창고보관/소진완료의 Request Date)에서 backfill.
  → derive/parsers 에 `monthlyDevelopmentTrend(records, samples)` 추가: 최근 12개월, DD 우선·과거는 샘플대장 보충(월 중복 시 DD 우선).
- 화려한 동적: 그라디언트 막대, 마운트 시 그려지는 애니메이션, 값 라벨, 최신월 강조, 부드러운 곡선 선. reduced-motion 존중.

### 3) 업무 카드뉴스 (하단 1)
TS관리 · STUDY과제 · FABRIC ANALYSIS · CALENDAR **요약 카드뉴스 4장**:
- TS: 처리중/완료/발주 미연결 수 (store.ts). STUDY: 이번주 미제출 수·완료율(store.study).
- FABRIC ANALYSIS: FL 물성 건수(store.completed). CALENDAR: 오늘/이번주 일정 수(store.events + records dueDate).
- 각 카드 클릭 → 해당 화면 이동. 아이콘·핵심수치·한줄요약. `Reveal` 순차.

### 4) 트렌드 카드뉴스 (하단 2)
- 최신 트렌드/기술 정보를 **이미지 카드**로. `store.trends`(신규 상태) 배열 사용: `{title, tag, date, image, source}`.
- 데이터 소스 미정 → 지금은 **`sample.ts` 에 트렌드 더미 4~6건**(제목/태그/날짜/이미지 placeholder). 실제 연결은 추후.
  이미지 없으면 그라디언트 플레이스홀더 + 태그. 카드 hover 확대.

### 5) QUICK ACCESS (최하단) — 원본 carrotbest 스타일 3×3
- 타일 9개: 아이콘 + 이름 + 한줄설명 + ↗, 색 변형. 클릭 시 해당 라우트로.
  Overview(개발현황) / RDDA / CALENDAR / FABRIC ANALYSIS / TS관리 / CONSTRUCTION GUIDE / MACRO TREND / FABRIC TREND / PORTFOLIO.
- 색은 토큰(차트색·accent)로. 네온 금지, 절제된 컬러 타일.

## DEVELOPMENT 로 이동 (HOME 에서 제거)
- 기존 HOME 의 **카테고리 분포 도넛**, **담당별/내 담당 납기 목록**은 HOME 에서 빼고 **DEVELOPMENT Overview** 로 옮긴다.
  (DEVELOPMENT Overview 에 이미 유사 섹션 있으면 통합. 중복 카드 정리.)

## 규칙
- 집계는 derive 함수로(화면 재계산 금지). DD 기준 KPI. 샘플대장은 backfill·이력만.
- 다른 화면(그 외)·데이터 파서 훼손 금지. 새 npm 금지. MutationObserver 금지. reduced-motion 존중. 커밋 금지.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / 새 derive·상태 / KPI 그래프 종류 / BUILD / NOTES.
