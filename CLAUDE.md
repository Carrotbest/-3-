# Fabric R&D Claude Code 인수인계

최종 갱신: 2026-08-10

## 즉시 알아야 할 상태

- 프로젝트: 한솔섬유 통합원단부 3팀 Fabric R&D 업무 플랫폼 MVP.
- 위치: `C:\Users\hkpark\Desktop\fabric-rnd`
- 기술: React 18, TypeScript, Vite, Zustand, Recharts, Tailwind CSS v4, SheetJS.
- 실행: `npm run dev`; 검증: `npm run build` (`tsc --noEmit && vite build`).
- 앱 base 경로는 `/-3-/` (vite.config). 개발 URL은 `http://localhost:<port>/-3-/`.
- 미리보기 주의: Desktop 레벨 `.claude/launch.json`의 `fabric-rnd` 설정은 Python 정적 서버(.tsx를 octet-stream으로 서빙 → 로드 실패)라 dev용으로 쓰면 안 된다. Vite dev는 `fabric-rnd-vite` 설정(포트 5175, `npm --prefix fabric-rnd run dev`)을 사용한다.

## 2026-08-10 구현 (Claude) — HOME/DEVELOPMENT 개편

빌드 통과·브라우저 검증 완료. 모두 `records` 원본 기준이라 실데이터 재업로드 후에도 동일 로직으로 동작한다.

### HOME (`src/routes/Home.tsx`)
- KPI `신규`→`접수` 명칭 변경(기준은 그대로 Request Date). 완료·접수 카드에 조회 기간을 큰 글씨(`rangeLabel`)로 노출.
- 스케줄 카드: 납기임박=주황(`--warning`), 납기지연=빨강(`--destructive`). 상세 시트 배지·행 색상도 동일 통일. 색 토큰은 `src/index.css`에 `--warning/--warning-foreground/--warning-soft` 신설.
- RDDA 등록 현황에 기간 선택(6/12/24개월) 세그먼트 추가. `localStorage: fabric-rnd-home-rdda-months-v1`. `monthlyDevelopmentTrend(records, samples, today, monthCount)`에 `monthCount` 파라미터 추가. 24개월이면 X축 눈금 격월(`interval`).
- 하단 3개 섹션 명칭·UI 개편: `업무 카드뉴스`→`Work report`, `트렌드 카드뉴스`→`Trend issue`, `QUICK ACCESS`→`Quick access`. 절제된 3D(포인터 틸트+광택+깊이) 래퍼 `src/components/motion/Tilt3D.tsx` 적용(외부 라이브러리 없음, reduced-motion 대응).

### DEVELOPMENT (`src/routes/Development.tsx`)
- 접수현황을 GD 개발 건에 한정(`receiptStatus`가 `devTypeOf===GD`만 집계, 판정은 `gdNo`). 문구도 "GD개발 진행중 · GD# 기입"으로 수정.
- 4공정 KPI(`RadialKpi`): 공정명 라벨을 원 아래로, 건수(done/total)를 원 안 % 아래로 이동.
- 담당자별 현황: "작지"→"건" 표기. Process status는 막대 안 %(≥12%) 인라인 + 카드형 범례(건수·%)로 개선.
- Categories 카드 클릭 시 대표 스타일 시트(`CategoryStyleSheet`) — Style No./담당자/Buyer/시즌/OPT. `categoryStyleList(records, category)` 신설(동일 Style No.는 OPT 합산).
- Schedule Alerts를 HOME 스케줄과 동일 기준으로 연결(`scheduleAlerts()` = `homeKpiRecordDetails`의 due/late 재사용, D-7/D+). 행 클릭 시 스타일 DETAIL 시트(`ScheduleAlertSheet`, 조직/염색/컬러/중량/공정단계 등). ※ 원사·작업처 전용 필드는 `DevRecord`에 없어 미노출.

### 참고
- `attentionItems`는 `homeKpiDetails` 내부 전용으로만 남았고 Development에서는 제거했다.

## 2026-08-10 추가 (R23·R24)

### R23 — 공정 보드 재설계
- 보드 탭의 5열 칸반을 **병목 히트맵 + 담당자 레인**으로 교체했다(`src/components/charts/OwnerLaneBoard.tsx`, `derive.ts`의 `ownerLaneBoard()`).
- 카드별 5색 진행 인디케이터는 삭제. 열 위치가 이미 진행도라 중복이었다.
- 같은 스타일의 여러 OPT는 칩 하나로 묶는다. 색은 긴급도(완료/정상/임박 D-7/오늘·지연)에만 쓴다.
- 히트맵 셀 클릭 → 레인이 해당 담당자·공정으로 좁아진다.
- 이 화면에는 `Tilt3D`를 쓰지 않는다. "한눈에 파악"이 목적이라 칩마다 틸트를 걸면 산만해진다.
- 정합성 규칙: 히트맵 공정 합계 = 레인 합계 = `boardRows.length`. 검증 시 이것부터 본다.

### R24 — HOME 하단 3개 섹션 + 자료(Material) 체계
- **자료 저장소 결정**: 팀즈 폴더 = SharePoint(`hansoll365.sharepoint.com`)이며 이미 로컬 동기화 중. 브라우저는 로컬 경로를 못 읽으므로 **공유 링크**로 연결한다. 별도 서버 구매 불필요.
- `MaterialItem`(schema) / `parseMaterials`(xlsx-parsers) / `materials`·`materialsManual`(store) 신설. 등록 경로는 **엑셀 목록 + 앱 직접 등록** 둘 다.
- 신규 컴포넌트: `cards/MaterialDeck.tsx`(3D 덱), `cards/CoverflowGallery.tsx`, `cards/PinBoard.tsx`.
- Work report = TS 덱 + STUDY 덱 + FABRIC ANALYSIS 의뢰 보드(3단계) + CALENDAR.
- Trend issue = 탭 3개(MACRO/FABRIC/PORTFOLIO) + coverflow. 3건 미만이면 그리드 폴백, 0건이면 데모 카드.
- Quick access = 핀보드. 회전각은 `ROTATION_CLASSES` 인덱스 기반 고정값(`Math.random()` 금지 — 리렌더마다 흔들린다).

### R25 — TS·STUDY 덱을 네이티브 소스로 (R24 이중관리 수정)
- R24에서 TS·STUDY 덱을 별도 `자료목록.xlsx`(parseMaterials)에서 가져오게 한 것은 이중 관리라 잘못이었다. 수정함.
- **TS 덱 = `tsMaterials(ts)`** (derive.ts): 기존 TS 엑셀 사고사례에서 카드 생성. 상세=문의/원인/분석/조치/결과. `source:"ts"`, `readOnly:true`, 링크 없음.
- **STUDY 덱 = `studyMaterials(study)`**: 기존 STUDY 엑셀에서. `materialFile`이 https면 "SharePoint에서 열기" 활성. 상세=주차/카테고리/상태/선정사유.
- `MaterialItem`에 `detail?: MaterialDetailRow[]`, `readOnly?`, `source:"ts"|"study"` 추가. 상세 시트가 detail을 dl 그리드로 렌더, readOnly면 편집 버튼 숨김.
- **TS·STUDY 덱의 `자료 추가` 버튼 제거**(원본이 엑셀). Trend issue(MACRO/FABRIC/PORTFOLIO)의 `자료 추가`는 유지.
- `자료목록.xlsx`(parseMaterials)는 **트렌드 3종 전용**으로 축소. TS/STUDY 행은 불필요.
- STUDY 파서가 `materialFile`을 고정 컬럼(row[9])에서 읽는 것은 그대로. 그 열에 SharePoint 링크를 넣으면 열기 버튼이 켜진다(코드 변경 아님).
- **휠 가로채기 규칙**: 덱에 포인터가 있을 때만 가로채고, 첫 장/마지막 장에서는 `preventDefault`를 걸지 않고 return 해 페이지가 정상 스크롤되게 한다(`MaterialDeck.tsx:62-64`). 이걸 없애면 사용자가 덱에 갇힌다.
- 버튼 라벨은 `SharePoint에서 열기`. 앱이 파일을 직접 내려주지 않으므로 "다운로드"라고 쓰지 않는다. 링크 없으면 비활성.

## 알려진 데이터 이슈 (2026-08-10 실파일 조사)

원본을 직접 열어 확인한 사실이다. 코드 버그가 아니라 **원본 데이터 기준 문제**이므로 화면에서 억지로 보정하지 말 것.

### RDDA — 파일마다 집계 기준이 다르다 (최우선 과제)
`전략자료\RDDA 픽업율` 폴더 실측:

| 파일 | Meeting 행수 | 실제 포함 기간 |
|---|---:|---|
| 26년 3월 | 1,431 | 2026-03만 |
| 26년 4월 | 1,604 | 2026-04만 |
| 26년 5월 | 1,316 | 2026-05만 |
| **26년 6월** | **7,077** | **2025-12 ~ 2026-05 누적** |

3·4·5월은 "그 달만", 6월만 "누적"이다. 앱이 넷 다 같은 월 스냅샷으로 그려서 6월에 5.4배 수직 상승한다.
→ 권장 해법: 파일 신뢰를 버리고 **각 행의 `MeetDate`로 월을 재계산**한다. 원본 관리 습관에 의존하면 재발한다.
→ 추가 주의: Pickup 시트에는 과거 월 미팅 건이 섞인다(미팅 후 나중에 픽업). 월별 픽업율은 분모·분자 기간 정의가 다르다는 점을 명시할 것.

### TS — 파싱은 정상, 발주량이 자유 텍스트
- `Technical survices 2026.xlsx` [TS] 시트: 헤더 4행, 데이터 5행~, **유효 24건**. 파서는 전부 정상 인식한다.
- `Order Volume` 24건 중 숫자는 **1건**. 나머지는 `약 40만장 연속 오더`, `135만장`, `Claim 2만불`, URL 등 자유 텍스트 → `numberOrNull()`이 null 처리 → **"발주량 기입률" 지표가 사실상 무의미**. 단위도 장·yds·USD 혼재라 합산 불가.
- 원본에 **상태 컬럼이 없다**. Result 기입 여부로 완료(20)/처리중(4)을 추정하므로 "접수" 상태는 나오지 않는다.
- HOME Work report의 TS 수치는 **이번달 기준**이라 대부분 0으로 보인다(월 분포: 1월 4, 3월 3, 7월 9, 8월 3).

### 빈 화면 6개
사이드바 19개 메뉴 중 6개가 실질적으로 비어 있다.
- `PlaceholderPage`: CONSTRUCTION GUIDE, MACRO TREND, FABRIC TREND, PORTFOLIO, PROCESS INNOVATION
- 스텁(15줄): FABRIC ANALYSIS — 목록·차트 없이 안내문만
- ⚠️ HOME의 Trend issue·Quick access가 이 빈 화면들로 링크된다. 화면이 예뻐질수록 공백이 더 드러난다.
- MACRO/FABRIC TREND/PORTFOLIO는 R24 Trend issue와 목적이 겹치므로 **자료 목록 기반 화면으로 통합**하면 3개를 한 번에 해결한다.
- 현재 브랜치/작업트리는 대규모 React 재구축 중이며 변경 파일이 매우 많다. 사용자의 기존 변경을 되돌리거나 `git reset --hard`, `git checkout --`를 실행하지 말 것. 커밋은 사용자가 요청할 때만 한다.
- 2026-08-07 마지막 빌드는 성공했다. 번들 크기 경고만 있으며 기능 차단 오류는 아니다.

## 최근 구현 완료

### HOME KPI

- 완료·신규 카드에 독립적인 기간 설정 달력 버튼을 추가했다.
- 기간은 브라우저 로컬 설정 `fabric-rnd-home-kpi-ranges-v1`에 저장된다.
- 완료 상세: 담당자, 플래너, Style No., Received Date.
- 신규 상세: 담당자, 플래너, Style No., Request Date.
- 기존 지연경보는 `스케줄`로 변경했다.
- 스케줄은 진행 중 건만 대상으로 납기 임박(D-7 이내)과 납기 지연(D+)을 분리한다.
- 관련 파일: `src/routes/Home.tsx`, `src/data/derive.ts`, `src/data/format.ts`, `src/data/xlsx-parsers.ts`, `src/data/schema.ts`.

### RDDA 등록 현황

- 최근 12개월을 표시한다.
- 2026-07까지는 샘플관리대장, 2026-08부터는 DD를 사용한다.
- 과거 월은 Request Date/Finish Date가 아니라 FL.# 자체에서 읽는다.
- 실제 FL 형식: `FL + YY + MM + 4자리 일련번호`.
  - 예: `FL26049011` → 등록월 `2026-04`, 생산처 GD.
- `rddaMonthFromFlNo(flNo)`는 숫자만 남기고 마지막 8자리를 `YYMMNNNN`으로 해석한다.
- 생산처는 마지막 네 자리 첫 숫자로 분류한다.
  - 9: GD, 5: 국내, 0: 생산, 2: 사입, 나머지: 기타.
- 동일 FL은 공백 제거·대문자화 후 전체 시트에서 1건만 집계한다.
- 샘플관리대장은 시트명을 고정하지 않는다. `Style/# + FL.#` 헤더가 발견되는 모든 시트를 파싱한다(현황·창고보관·소진완료·폐기 및 향후 추가 시트).
- 파서가 `CompletedSample.sourceSheet`를 기록한다.
- 핵심 함수: `src/data/derive.ts`의 `rddaMonthFromFlNo`, `rddaProductionType`, `monthlyDevelopmentTrend`; `src/data/xlsx-parsers.ts`의 `parseSamples`.

### RDDA 그래프 UI

- TOTAL: 얇은 파란색 `natural` 곡선. 영역 채움/그라데이션 없음.
- IntersectionObserver로 그래프 영역이 화면에 들어올 때 라인이 왼쪽→오른쪽으로 그려진다.
- 생산처 누적 막대는 기본적으로 모두 `scaleY(0)`이다.
- 커서가 위치한 월(`activeTooltipIndex`)의 막대만 아래에서 채워지고, 다른 월로 이동하면 이전 막대는 닫힌다. 차트 밖으로 나가면 모두 빈 상태로 돌아간다.
- reduced-motion 환경에서는 전환을 생략한다.
- 구현 위치: `src/routes/Home.tsx`의 `RddaTrendChart`, `AnimatedRddaBar`, `RddaTrendTooltip`.

### 파일 업로드 체계

- SETTING을 `파일 연결 센터`로 개편했다. 파일별 독립 드롭존과 연결 화면 설명을 제공한다.
- 연결 카드: DD, 샘플관리대장, STUDY, TS, RDDA 리포트, 원단분석.
- 열린 Excel 파일도 탐색기에서 카드로 드래그앤드롭하는 흐름이다.
- 각 파일은 한 번에 하나씩 해당 카드에 드롭한다.
- HOME, DEVELOPMENT, STUDY, TS, RDDA, FABRIC ANALYSIS PageHeader에 직접 업로드 버튼을 추가했다.
- 공통 업로드 컴포넌트: `src/components/upload/DataUpload.tsx`.
- 라우팅/처리 함수: `src/data/upload.ts`.

## 데이터 소스 규칙

| 화면/지표 | 원본 | 기준 |
|---|---|---|
| HOME 완료 | DD | Received Date + 사용자 기간 |
| HOME 접수(구 신규) | DD | Request Date + 사용자 기간 |
| HOME 스케줄 | DD 진행 중 | Due Date, D-7/D+ |
| RDDA 등록 ~2026-07 | 샘플관리대장 전체 시트 | FL.# YYMM, 동일 FL 1건 |
| RDDA 등록 2026-08~ | DD | Received Date, 동일 FL 1건 |
| DEVELOPMENT | DD + 샘플관리대장 | 진행 현황 + 완료 샘플 |
| STUDY | Capability Improvement | 주차별 현황 |
| TS | TS Excel + 웹 입력 | 중복 제외 누적 |
| RDDA REPORT | 월별 RDDA 파일 | YTD 스냅샷, 합산 금지 |
| FABRIC ANALYSIS | 원단분석 export | 업로드 캐시 |

## 다음 작업에서 가장 먼저 할 검증

현재 브라우저에서 마지막으로 확인한 샘플 데이터는 실제 파일이 아니라 예시 캐시였다.

- 예시 캐시 표시: 동일 FL 24건, 2026-06 4건, 2026-07 4건, `sourceSheet` 없음.
- 사용자는 실제 6~7월 FL 등록이 훨씬 많다고 확인했다.
- 따라서 실제 샘플관리대장을 새 SETTING 드롭존에 다시 올려야 한다.
- 업로드 후 SETTING의 `샘플관리대장 FL 파싱 확인`에서 다음을 대조한다.
  1. 인식 시트명이 원본의 모든 관련 시트인지.
  2. 동일 FL 제거 후 전체 건수.
  3. `FL 2606`, `FL 2607` 건수.
  4. `월 형식 불일치` 건수.
- 원본과 불일치하면 먼저 실제 FL 문자열 예시를 확인하고 `rddaMonthFromFlNo`만 최소 수정한다. Request Date나 Finish Date 폴백을 다시 넣지 말 것.

## 중요한 구현 결정과 주의사항

- 샘플관리대장 파싱 결과는 IndexedDB `fabric-rnd-cache`의 `completed` 키에 저장된다. 구버전 캐시는 새 필드 `sourceSheet`가 없으므로 파일을 재업로드해야 새 파싱 결과가 생긴다.
- DD 메타가 예시 데이터로 표시되더라도 샘플대장만 별도로 업로드됐을 가능성은 있다. SETTING의 FL 진단 값과 `sourceSheet`를 함께 확인한다.
- 샘플관리대장 모든 시트를 읽도록 바꿨기 때문에 DEVELOPMENT 완료 샘플 라이브러리에도 FL이 있는 전체 시트 행이 들어온다. 사용자가 폐기/진행 행을 라이브러리에서 제외해 달라고 하면 그래프용 archive 상태를 별도로 분리하는 것이 안전하다.
- 날짜 파싱은 Excel 날짜 하루 밀림을 막기 위해 `XLSX.SSF.format("yyyy-mm-dd", value)`를 사용한다.
- `statusOf`는 명시적 DD status 완료/HOLD/DROP/REJECT를 우선하며, 스케줄 집계는 `isInProgress`만 사용한다.
- 사용자 제공 실제 데이터나 캐시 내용을 로그·git·공개 파일에 포함하지 말 것.

## 공유 자료

- 팀 공유용 HTML: `docs/작업공유_0807.html`
- 실행 가능한 단일 HTML 공유본: `share/FABRIC_RND_0807.html`
- 단일 HTML 재생성: `npm run export:html`
- 기존 설계/작업 기록: `docs/codex/`, `docs/reference/`, `docs/REACT_REBUILD.md`

## 완료 조건

1. 실제 샘플관리대장 재업로드.
2. SETTING 진단의 시트·6월·7월·형식 불일치 수치를 원본과 대조.
3. HOME RDDA 월별 TOTAL이 생산처 누적합(+기타)과 일치하는지 확인.
4. 그래프 초기 막대가 비어 있고 월 hover/leave 동작이 정상인지 확인.
5. `npm run build` 통과.
