# 데이터 소스 구조 (팀즈 공용 폴더) — 구조 전용, 실데이터 없음

동기화 경로(각 PC): `OneDrive\한솔섬유\통합원단부 - 3팀\`
연결 방식: File System Access API (사용자가 이 폴더를 1회 선택 → 로컬 동기화본을 직접 읽기).
루트의 두 엑셀이 메인 소스다.

---

## A. Development Dashboard.xlsx → DEVELOPMENT 화면

시트: `Overview` `전체현황` `박향근` `진영은` `김지현` `변재휘` `Lists` `대장이관`

### 전체현황 (개발 레코드 원천) — 헤더 = **행 index 3**, 데이터 = **행 index 5부터**
컬럼 인덱스(0-base):
```
0 담당            1 Status         2 Style No.      3 # of Opt      4 Season
5 Buyer          6 Category       7 Planner        8 Request Date  9 Due Date
10 Brand         11 Contents      12 Cons.         13 Org. Weight  14 Yarn(분석)
15 Comments      16 Developer     17 Co            18 GD#/SA#      19 Arrange#
20 Yarn Detail   21 Cons.         22 T.Weight      23 Color        24 Dyeing Side
25 Finishing     29 Remark
30 Yarn in-fac   32 Knitting      34 Dyeing        36 Finishing     (← 공정 SCHEDULE Mill/Status)
38 Received Date 39 FL#           40 옵션완료(완료/전체) 41 Review    42 Actual
47 Knitting      53 Greige        55 Tenter        57 Wash         59 Finish
61 Pass/Fail     62 Fail 사유     63 Style History
```

### 앱 DevRecord 로의 매핑 (어댑터)
| 실제 컬럼 | 앱 필드 |
|---|---|
| 담당 | owner |
| Style No. | styleNo |
| # of Opt | opt |
| Season | season (정규화) |
| Category (EU MARKET/SEASON DEV/CORE UPDATE/PROJECT) | category → **EU MARKET / SEASON / CORE / PROJECT** 로 축약 매핑 |
| Buyer | buyer |
| Cons.(12 또는 21) | construction |
| Org.Weight/T.Weight | weight |
| Co (GD/국내/생산) | devType (GD/국내) |
| GD#/SA# | gdNo 또는 saNo (Co 로 구분) |
| Dyeing Side | dyeing |
| FL# | flNo |
| Due Date | dueDate |
| Status (진행중/완료/HOLD/DROP/REJECT) | 상태 판정에 사용 |
| Yarn in-fac/Knitting/Dyeing/Finishing status(30/32/34/36) | 공정 단계(stage) 판정 + overview 4공정 퍼널 |
| Remark(29) | note |

- **담당자별 현황**: `담당` 컬럼으로 그룹(박향근/진영은/김지현/변재휘). 또는 per-developer 시트의 요약(진행중/금주신규 by category) 사용.
- **행 색상 규칙(참고)**: 완료=회색·DROP=빨강·REJECT=주황·HOLD=노랑.

### Lists (SETTING 기준값 원천)
| 열 | 값 |
|---|---|
| Status | 진행중 / 완료 / HOLD / DROP / REJECT |
| Season | SS26 FW26 SS27 FW27 SS28 FW28 SS29 FW29 |
| Category | EU MARKET / SEASON DEV / CORE UPDATE / PROJECT |
| Co | GD / 국내 / 생산 |
| Dyeing Side | CSD / DD / YD / CPB / 기타 |
| Pass/Fail | PASS / FAIL |
| Cons. 조직명 | (ABC순 조직 목록, 예: 1*1 Rib …) |
| Finishing | (가공 태그 목록, 예: Anti Bacterial …) |

---

## B. 샘플 관리 대장.xlsx → HOME(샘플 현황) + 완료 샘플 라이브러리

시트: `현황`(진행) `창고보관` `소진완료` `폐기`
헤더 = **행 index 3 + 4(2줄 병합 단위)**, 데이터 = **행 index 5부터**

컬럼(0-base, 괄호=행4 단위):
```
0 No./R&D No.   1 Season        2 Buyer Division  3 Category      4 Original Ref#
5 Requester     6 Developer     7 Style/#         8 FL.#          9 Yarn detail
10 Cons.        11 Target wt'(g/m2)  12 (wash)     13 Final Data(Width)  14 (Weight)
15 Color        16 Dyeing Side  17 Request Date
18 Yarn in-fac(Mill) 19 (Status) 20 Knitting(Mill) 21 (Status)
22 Dyeing(Mill) 23 (Status)     24 Finishing(Mill) 25 (Status)
26 Finish Date  27 Due Date     28 Remark/Issue
29 Shrinkage(Length -%) 30 (Width -%)
31 Knitting Data(Inch) 32 (Needles) 33 (Feeder) 34 (Loop)
35 Greige(Width) 36 (Weight)
```

### 완료 샘플 라이브러리(CompletedSample) 매핑 — 실제 물성 확보!
| 실제 컬럼 | 앱 CompletedSample |
|---|---|
| Style/# | styleNo | FL.# | flNo | Season | season | Category | category |
| Buyer Division | buyer | Developer | owner | Cons. | construction |
| **Final Data Width(13)** | inhouse.widthCm |
| **Final Data Weight(14)** | inhouse.weightGsm |
| **Shrinkage Length/Width(29/30)** | inhouse.shrinkagePct (장/폭) |
| Target wt'(11) + wash(12) | 참고 |
| Yarn/Knit/Dye/Finish Status | process.knit/dye/finish |
| Remark/Issue(28) | process.remark |
| Finish Date(26) | completedAt |
- **필링(pilling)**: 이 파일엔 없음 → 라이브러리에서 필링은 '미기재'로 두거나 별도 시험 데이터 연결 시 추가.
- 완료 샘플 소스 = `창고보관` + `소진완료`(+선택적으로 `현황` 중 완료건). `폐기`는 제외 또는 별도 표시.

### HOME 샘플 현황(overview)
- `현황` 시트 = 진행 중 샘플. GD/국내는 Development Dashboard 의 Co 와 연계(또는 대장엔 없으면 생략).
- 창고보관/소진완료/폐기 건수 = 누적/리드타임 지표.

---

## C. 하위 폴더 데이터 맵 (전체 조사 결과)

폴더가 어수선하다(백업·복사본·구버전·.tmp 다수). **글롭 금지 — 화면별 "정본 파일" 하나만 정확히 타겟한다.**

| 화면 | 정본 소스 | 파싱 모드 | 비고 |
|---|---|---|---|
| DEVELOPMENT | `Development Dashboard.xlsx`/전체현황 (루트) | 자동(내용) | R11 |
| HOME 샘플현황·완료샘플 | `샘플 관리 대장.xlsx` (루트) | 자동(내용) | R11 |
| 기준값(SETTING) | `Development Dashboard.xlsx`/Lists | 자동(내용) | R11 |
| **TS 관리** | `TECH SERVICE\Technical survices {연도}.xlsx` | 자동(내용) | 연도별 1파일, 최신 연도 자동 선택. ※조사 시 2026 파일 **열려있어 잠김**(permission denied) — 열려있으면 못 읽을 수 있음 |
| **STUDY 진행현황** | `주별 UPDATE 자료\개인 STUDY 과제\Capability Improvement (개선안).xlsx` | 자동(내용) | Summary + 진영은/김지현/변재휘 시트. 헤더=행1: Year·Wk·주차(월)·주제·분류·선정배경·확정일·목표일·완료일자·**자료(파일명)**·상태·미진행 사유. STUDY 화면과 정확히 일치 |
| **STUDY 자료 라이브러리** | `개인 STUDY 과제\자료\` (pptx·docx·png) | 자동(**목록만**) | 파일명 규칙 `YYYY.MM.DD 주제 (작성자)` → 내용 파싱 없이 파일 목록으로 라이브러리 구성. Capability의 '자료(파일명)' 칸과 대조 |
| 주간보고 | `주별 UPDATE 자료\주간 업무 보고\{연도} 주간 업무 보고\` | 자동/수동 | 최신 파일. HOME 주간 요약 참고 |
| **RDDA REPORT** | `전략자료\RDDA 픽업율\26년 {3~6}월 Meeting,Pickup.xlsx` (**정본 = 월별 파일**) | 자동 | 각 파일 `Meeting`(제안)·`Pickup` 2시트, 컬럼: FL_NUMBER·MeetDate·SupplierCode/Name·OriginalFabric·CountryOfOrigin·DevType·MemberCode/Name·CustomerName·BrandName·GenderName·SeasonName·SampleNo(+PickupDate). **월별 파일은 YTD 누적 스냅샷**(3월 데이터가 6월 파일에도 있음) → 합산 금지. 집계는 **최신(6월) 파일** 기준, 3~6월 총계는 스냅샷 추이로. `개발 원단 사용 픽업율(2025).xlsx`·`기타\HS Develop 활용도\`는 **사용 안 함**(구자료) |
| Categories 정의 | `참고 자료\개발자료\자체개발 샘플 CATEGORY\개발 ITEM CATEGORIZE.xlsx`·`FABRIC DEVELOPMENT CARD.xlsx` | 참고 | 카테고리·아이템 분류 기준 |
| TEXTILE ACADEMY(2차) | `참고 자료\교육자료\` (`2026 TA 교육 커리큘럼.xlsx` + 자료들) | 자동(목록)+수동 | 커리큘럼 표 + 자료 목록 |
| 조직도 | `조직도 편집기\팀원별 조직도\*.json` (5명) | 자동(내용) | 팀/권한(SETTING) 화면에 활용 가능 |
| **물성 시험성적서(필링 포함)** | `SAMPLE CHART\MARKET SAMPLE_1팀\GD TEST REPORT\*.xlsx` | 수동(온디맨드) | 완료샘플의 **필링/실측 물성**은 샘플대장에 없음 → 이 성적서에 있을 수 있음. 파일 다수·대용량이라 필요 시 개별 선택 |
| (제외) | 전략자료 PPT·PDF, 경영보고, Heiq 브로슈어, GD 샘플비 내역 등 | 링크만 | 대시보드 데이터 아님. 필요 시 링크/열기만 |

### 파싱 모드 정의
- **자동(내용)**: 구조 일정한 정본 1파일 → 폴더 연결 시 자동 파싱·반영.
- **자동(목록)**: 폴더의 파일명만 읽어 라이브러리/커리큘럼 구성(내용 파싱 없음).
- **수동(온디맨드)**: 형식이 제각각이거나 대용량 → 사용자가 SETTING에서 특정 파일 선택 시에만.
- **링크만**: 파싱 안 함. 위치 링크만 제공.

### 주의
- 파일이 Excel/OneDrive 에서 **열려 있으면 잠겨** 못 읽을 수 있음(TS 2026 사례). 사용자 안내 필요.
- 백업/복사본/`~$`/`.tmp`/구버전 파일은 **절대 자동 대상에 넣지 않는다**(정확한 파일명 매칭만).
- 형식 이상(.xls·xlsb·not-zip) 파일은 SheetJS 로 포맷 판별 후 처리.
- 어떤 경우에도 실데이터·성적서 값은 repo·문서·로그에 남기지 않는다.

## D. RDDA 분석 방식 (legacy/index.html 의 원본 로직 재현)

원본 사이트가 Meeting/Pickup 엑셀을 파싱하던 방식. R14b 는 이 의미(semantics)를 그대로 따른다.
- 소스: `전략자료\RDDA 픽업율\26년 {N}월 Meeting,Pickup.xlsx` 의 `Meeting`·`Pickup` 시트(헤더 행0, 데이터 행1~).
- **Hansoll 제외**: SupplierName/CustomerName 이 `Hansoll Textile Ltd.`(대소문자·마침표 변형 포함)인 행은 카운트 제외.
- **두 관점**:
  - **전체(all)**: 모든 행.
  - **3팀(team3)**: MemberName ∈ 현재 팀원(박향근·김지현·변재휘·진영은) 로 필터.
    (legacy 는 MemberCode {17010,13135,25007,21049,13050} 하드코딩이었으나 현재 팀과 안 맞을 수 있어 **이름 기준 필터 권장**.
     박향근=MemberCode 17010 확인됨. 나머지 코드는 데이터에서 이름↔코드로 확인.)
- **지표(관점별)**:
  - meetingTotal = Meeting 행수, pickupTotal = Pickup 행수, **pickupRate = pickup/meeting×100**.
  - pickupByCustomer: CustomerName 그룹 → {pickupCount, meetingCount, rate=pickup/meeting}.
  - origin: CountryOfOrigin 분포(도넛). 색 키 China/Vietnam/Korea/Indonesia/India/Thailand/기타.
  - **Best Items**: FL_NUMBER 기준 Pickup ≥ 2 **그리고** Meeting ≥ 3, Hansoll 제외, 픽업수 내림차순(동률 동일순위).
- **월별 파일 = YTD 누적 스냅샷**(§C 참고): 집계는 최신(6월) 파일 기준. 3~6월 각 파일 총계는 스냅샷 추이로만.
- 대용량(수천~수만 행): 읽는 즉시 1패스 집계, raw 미저장.

## 연결·동기화 규칙
- 파일명 고정: `Development Dashboard.xlsx`, `샘플 관리 대장.xlsx` (루트). 이름 바뀌면 SETTING에서 재지정.
- 읽기 후 **합계 대조 5종** 통과분만 반영(기존 reconcile). 실패 시 이전 값 유지.
- 데이터는 브라우저 세션에만. 저장소·서버로 전송 금지. **이 문서에도 실제 행 값은 넣지 않는다.**
