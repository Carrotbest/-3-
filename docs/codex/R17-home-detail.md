# 작업지시 R17 — HOME 화면 디테일 재설계 (R16 후속)

전제: R16 완료. `docs/REACT_REBUILD.md`, `docs/reference/data-sources.md`.
검증 `npx tsc --noEmit`. 토큰 색만. 커밋·실데이터 로그 금지. 강도 화려하되 절제.
현재 수치 기준은 **DD(전체현황) = `store.records`**. 샘플대장(`store.completed`)은 추이 backfill·이력용.

---

## 0. 데이터 계약 변경 (먼저)

### 0-1. `src/data/schema.ts` — DevRecord 에 Received Date 추가
- `DevRecord` 에 `receivedDate?: string` 필드 추가(위치: `requestDate?` 아래).
- 의미: **FL# 가 부여되는 접수 완료일**. DD 시트 컬럼 38(Received Date). FL#(39)와 짝.

### 0-2. `src/data/xlsx-parsers.ts` — Received Date 파싱
- `DEV_DEFAULT_COLUMNS` 에 `receivedDate: 38` 추가.
- DevRecord 생성부(현재 `flNo: text(row[columns.flNo])` 근처)에서 `receivedDate` 도 채운다:
  헤더 로케이트는 `locate(["received date","received","접수일","접수완료일"], DEV_DEFAULT_COLUMNS.receivedDate)` 패턴. 값은 날짜 문자열(기존 requestDate/dueDate 와 동일 포맷 처리).
- 샘플대장(SAMPLE_DEFAULT_COLUMNS)엔 receivedDate 불필요(대장은 `completedAt` 사용).

### 0-3. `src/data/sample.ts` — 더미에 receivedDate 채우기
- `sampleRecords()` 의 각 dev 레코드에 `receivedDate` 추가: **flNo 가 있는(=완료 단계) 레코드만** 값을 주고, 나머지는 빈칸.
  값 분포는 최근 8주에 흩어지게(일부는 최근 7일 안, 일부는 그 전). "지난주 완료/이번주 신규/추이"가 0이 되지 않도록.
- `requestDate` 도 최근 7일 내 몇 건이 들어오도록 분포 조정(이번주 신규 카드가 보이게).

### 0-4. FABRIC ANALYSIS 원천 = 팀 폴더의 "내보낸 파일"
- 새 타입 `FabricAnalysisRow { anNo: string; requestDate: string; completeDate: string; item: string; owner: string }`.
- 파서 `parseFabricAnalysis(workbook): FabricAnalysisRow[]` in `xlsx-parsers.ts`:
  헤더 흔들림 흡수(tolerant). 컬럼 후보 — anNo:["AN","AN번호","AN No"], requestDate:["의뢰일","접수일","Request"], completeDate:["완료일","완료","Complete"], item:["항목","제목","Subject"], owner:["담당","담당자","Owner"]. 첫 데이터행 자동 탐지(기존 패턴 재사용).
- `folder-source.ts`: 팀 폴더에서 파일명이 `원단분석` 또는 `fabric` 포함 + `.xlsx/.csv` 인 파일을 찾아 파싱해 `store.fabricAnalysis` 에 넣는다.
  **파일이 없으면 경고 없이 `store.fabricAnalysis = []`** (조직도와 동일한 조용한 폴백 원칙). online-only(size 0)면 기존 readableFile 로직대로 스킵.
- `useAppStore.ts`: `AppState` 에 `fabricAnalysis: FabricAnalysisRow[]` 추가, 초기값 `sampleFabricAnalysis()`(더미 4~6건, 일부 이번주 의뢰/완료).

### 0-5. `src/data/derive.ts` — 함수 계약
아래를 추가/수정. 화면에서 재계산 금지.

- **주간 창** 헬퍼: `recentWindow(today, days=7)` → `{start, end}` = [today-7d 00:00, today 24:00). "동기화일 기준 직전 7일".
- `homeSectionCards(records, today): { progress: ProgressCard; lastWeekDone: number; thisWeekNew: number; lateAlert: number }`
  - `progress`: `{ total: kpis(records).progress, process: [{key:'yarn',label:'원사',count}, knitting/편직, dyeing/염색, finishing/피니쉬] }`
    process count = **현재 진행중(active=완료 아님) 레코드의 현재 stage 분포**: 원사=stage"원사", 편직="편직", 염색="염색", 피니쉬=["가공","시험"]. 합 = active 총계.
  - `lastWeekDone`: `records` 중 `receivedDate ∈ recentWindow` 인 건수(=지난 1주 접수완료/FL부여).
  - `thisWeekNew`: `records` 중 `requestDate ∈ recentWindow` 인 건수(=같은 창의 신규 발생).
  - `lateAlert`: `statusOf==='late'` 건수(due date 경과·미완료).
- `monthlyDevelopmentTrend(records, samples, today)` **재작성**(완료율 제거):
  - 반환 타입에서 `completionRate` 제거. `MonthlyDevelopmentDatum = { month; count; source:'DD'|'샘플대장'; latest }`.
  - DD 월별: `records.filter(r => r.flNo)` 를 `receivedDate` 의 월(YYYY-MM)로 그룹(receivedDate 없으면 그 레코드는 제외). 월 count = 건수.
  - 대장 월별: `samples` 를 `flNo` 로 **중복 제거** 후 `completedAt` 의 월로 그룹. 월 count = 고유 flNo 건수.
  - 최근 12개월. **월별 DD 우선**, DD 가 0/없음인 월만 대장으로 backfill. `latest` = 값이 있는 가장 최근 월.
- `homeWorkSummary(...)` **수정**(시그니처에 fabric 원천 추가):
  - `ts`: **이번달**(현재 달) 기준. `{ received: receivedAt 월==이번달 건수, done: state==='완료' && receivedAt 월==이번달 건수 }`. (기존 processing/unlinked 는 유지하되 카드엔 received/done 만 쓴다.)
  - `study`: 기존 `completionRate` 유지(주간 제출 완료율). 카드엔 **완료율 %만** 노출.
  - `fabric`: `fabricAnalysis` 인자 받아 `{ request: requestDate ∈ recentWindow 건수, complete: completeDate ∈ recentWindow 건수, connected: fabricAnalysis.length>0 }`.
  - `calendar`: 기존 today/week 유지.
- 트렌드 카드용 파생 `homeTrendCards(ts, studyFiles, trends): TrendCard[]`:
  - `TrendCard = { title; tag; date; image; source; href }`.
  - [0] 최근 TS: `ts` 중 state==='완료' 를 receivedAt 최신순 첫 건 → `{title: subject, tag:'TS', date: receivedAt, source:'기술지원', href:'#/ts'}`.
  - [1] STUDY 최근 업로드: `studyFiles`(파일명 배열) 중 확장자가 ppt/pptx/pdf/doc/docx 인 마지막 항목 → `{title: 파일명(확장자 제거), tag: 확장자대문자, date:'', source:'STUDY', href:'#/study'}`. 없으면 placeholder 1장.
  - [2] MACRO TREND: `trends`(더미)에서 1건 → `{...trends[0], tag:'MACRO', href:'#/trend/macro'}`.
  - [3] FABRIC TREND: `trends` 에서 1건 → `{...trends[1], tag:'FABRIC', href:'#/trend/fabric'}`.
  제목은 자연스럽게(더미 제목 그대로 사용 가능).

---

## 1. 섹션 카드 4종 (전체 개발 진행 / 지난주 완료 / 이번주 신규 / 지연경보)

`homeSectionCards()` 사용. **공통 변경**:
- **각 카드 하단의 바 그래프·각주(미니 컬럼/세그먼트바/버킷바/구간바) 전부 삭제.** 헤드라인 숫자 중심으로 심플하게.
- **카드 전체가 클릭 가능** → 해당 화면으로 이동(hash route). 커서 pointer, hoverLift 유지.
  - 전체 개발 진행 → `#/development`
  - 지난주 완료 → `#/development`
  - 이번주 신규 → `#/development`
  - 지연경보 → `#/development` (지연 배지가 있는 Overview)
- 숫자는 `NumberTicker`, `Reveal` 유지. "DD 전체현황" 배지 유지.

### 1-1. 전체 개발 진행
- 헤드라인 = `progress.total`(진행중 총계).
- **추가**: 공정별 현황 KPI 4개를 카드 안에 인라인으로 (원사/편직/염색/피니쉬 = `progress.process[].count`).
  작은 4분할 스탯(라벨+숫자)만. 바 그래프 아님. 합이 헤드라인과 같다는 점이 드러나게.

### 1-2. 지난주 완료
- 헤드라인 = `lastWeekDone`. 캡션 "동기화일 기준 직전 7일 · Received date".

### 1-3. 이번주 신규
- 헤드라인 = `thisWeekNew`. 캡션 "직전 7일 신규 발생 · 요청일".
  (라벨은 지시대로 '이번주 신규'로 표기)

### 1-4. 지연경보
- 헤드라인 = `lateAlert`. 빨강 강조. 캡션 "완료 전 납기일 경과".

---

## 2. 개발 진행 추이
- `monthlyDevelopmentTrend` 새 계약 사용. **완료율 선/이중축 제거**, 단일 막대 시리즈(개발 건수)만.
- 부제: "FL 부여 기준 · 최근 12개월 · DD 우선, 과거 공백은 샘플대장 보충".
- 화려한 동적(그라디언트 막대, 마운트 애니메이션, 값 라벨, 최신월 강조)은 유지. reduced-motion 존중.

---

## 3. 업무 카드뉴스 (4장, 클릭 시 이동)
`homeWorkSummary` 사용. 각 카드 클릭 → 해당 route.
- **TS 관리** (`#/ts`): "접수 N / 완료 M" (이번달). `ts.received` / `ts.done`.
- **STUDY 과제** (`#/study`): 건수 빼고 **주간 제출 완료율**만 크게. `study.completionRate`% (예: 100%).
- **FABRIC ANALYSIS** (`#/fabric-analysis`): `fabric.connected` 면 "의뢰 N / 완료 M"(주간), 아니면 "연동 예정 · 파일 없음" 안내.
- **CALENDAR** (`#/calendar`): 현행 유지(오늘/이번주 일정 수).

---

## 4. 트렌드 카드뉴스 (최신 자료)
`homeTrendCards()` 사용. 4장, 카드 클릭 → `href`.
- 최근 TS 원인/결과 · STUDY 최근 업로드 자료 · MACRO TREND · FABRIC TREND.
- 이미지 없으면 그라디언트 플레이스홀더 + 태그. hover 확대. 부제 "최신 소재·기술·이슈".

---

## 5. QUICK ACCESS
- **변경 없음.** 현행 3×3 유지.

---

## 규칙
- 집계는 derive 로. DD 기준 현재수치. 대장은 추이 backfill·이력.
- 다른 화면·파서(대장/RDDA/STUDY/조직도) 훼손 금지. 새 npm 금지. MutationObserver 금지. reduced-motion 존중. 커밋 금지. 실데이터 로그 금지.
- `legacy/` 접근 금지.

## 검증 `npx tsc --noEmit`.
## 보고 DONE 파일 / 새·수정 derive·타입 / 파서 변경 / 섹션·카드 요약 / TSC / NOTES(가정·한계).
