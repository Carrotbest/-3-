# R51 — 기능성 개발 포트폴리오 (PORTFOLIO 화면 신설 + HOME 메인 배치)

대상(쓰기): `src/data/chemical.ts`(신규 파서), `src/routes/Portfolio.tsx`(신규 화면), `src/data/upload.ts`·`src/store/useAppStore.ts`·`src/data/cache.ts`(업로드/영속 배선), `src/routes/Setting.tsx`(파일 연결 카드 1개 추가), `src/App.tsx`·`src/routes/route-config.ts`(라우트 연결), `src/routes/Home.tsx`(Trend issue 섹션 재편), `src/data/sample.ts`(익명 데모).
읽기전용 재사용: `src/data/xlsx-parsers.ts`(파싱 관례), `src/components/ui/dialog.tsx`, `src/components/dashboard/SectionCard.tsx`, `src/components/motion/{Reveal,NumberTicker}.tsx`, `src/data/derive.ts`(FL 파서).

## 배경 / 목적
통합원단부 3팀이 개발한 **기능성 원단 포트폴리오**를 앱에 정식 섹션으로 만든다. 원본은 `Chemical 개발 List.xlsx`(팀 자료).
**성격 확정: 포트폴리오**(영업·바이어 제안 및 팀 개발 자산 전시). 단순 과거 실적 나열이 아니라, 업로드할 때마다 갱신되는 살아있는 자산 목록으로 만든다.

### 원본 데이터 구조(실측)
시트 1개. 4행이 헤더: `상태 | Chemical / Brand | Market Product Analysis | Description & Effect | Fabrication | FL#`. 5행부터 데이터.
- **카테고리 행**: A열에만 값, 나머지 빈 칸. 형식 `English Name (한글명)` — 예 `Cooling (냉감)`, `Anti-bacterial / Anti-Odor (항균 · 항취)`.
- **전략 행**: 카테고리 행 바로 다음, A열에만 값이지만 괄호 형식이 아닌 **긴 서술문**(그 카테고리의 타겟 레이어 전략). 예 *"땀 배출이 많고 피부에 직접 닿는 Base Layer·Activewear가 핵심 타겟…"*. 카테고리의 `strategy` 필드로 귀속.
- **개발 항목 행**: B열 이후에 값이 2개 이상. A열 = 상태(`개발완료`/`개발중`/`미착수`/`Drop`).
- **FL# 셀**: 줄바꿈으로 여러 FL이 들어감. 일부에 `(항균 pass)`, `(TEST PASS)` 주석 → **검증 통과 표시**.
- 실측 규모: **카테고리 11 · 개발항목 24 · FL 참조 72(전부 고유) · PASS 주석 7**. 상태 분포 개발완료 13 / 개발중 4 / 미착수 6 / Drop 1.
- **FL#는 앱 채번 규칙과 100% 일치**(`FL`+YY+MM+4자리, 2020~2026). 즉 DD·샘플대장과 조인 가능.

## ★ 데이터 취급 원칙 (반드시 준수)
이 저장소는 **공개 GitHub Pages**다. 원본에는 협력사·약품 브랜드명(VENTEX, HeiQ, DuPont, Polygiene, 풍림, 건백 등)과 실제 FL 번호가 들어 있다.
- **실데이터를 저장소에 커밋 금지**(`sample.ts` 포함). 다른 화면(DD·샘플대장·TS·STUDY·RDDA)과 동일하게 **엑셀 업로드 → IndexedDB 캐시** 방식으로만 앱에 들어온다.
- `sample.ts`에는 **익명 데모**만 넣는다: 카테고리명은 일반명사로(예 `Cooling (냉감)`은 기능 일반명이라 무방), **약품/브랜드/협력사명은 절대 금지** → `데모 약제 A`, `데모 브랜드 B` 식. FL도 데모 형식.
- 파싱 결과를 콘솔 로그·주석에 남기지 말 것.

---

## Task 1 — 파서 `src/data/chemical.ts`
```ts
export interface ChemicalItem {
  id: string                 // 안정적 키(카테고리+행 인덱스 기반)
  category: string           // 소속 카테고리명(원문)
  state: "개발완료" | "개발중" | "미착수" | "Drop" | string
  chemical: string           // Chemical / Brand 원문(줄바꿈 포함 가능)
  market: string             // Market Product Analysis
  description: string        // Description & Effect
  fabrication: string        // Fabrication(여러 원단, 줄바꿈)
  flNos: string[]            // 추출된 FL 번호들
  passNotes: string[]        // "(항균 pass)" 등 통과 주석 원문
  passCount: number
}
export interface ChemicalCategory {
  name: string               // "Cooling (냉감)"
  labelEn: string            // "Cooling"
  labelKo: string            // "냉감"
  strategy: string           // 타겟 레이어 전략 서술
  items: ChemicalItem[]
}
export interface ChemicalPortfolio {
  categories: ChemicalCategory[]
  items: ChemicalItem[]      // 평면 목록
  totals: { categories: number; items: number; done: number; ongoing: number; notStarted: number; dropped: number; fl: number; pass: number }
}
export function parseChemicalPortfolio(workbook: XLSX.WorkBook): ChemicalPortfolio
```
파싱 규칙:
- 헤더 행 자동 탐지(‘Chemical’ 및 ‘FL#’ 포함 행). 그 다음 행부터 순회.
- **카테고리 판정**: A열에 값 + B~F 전부 빈칸 + `/^[A-Za-z][A-Za-z /\-·]*\s*\(.+\)$/` 매칭.
- **전략 판정**: A열만 값 + 위 카테고리 패턴 불일치 + 직전에 카테고리가 있고 그 `strategy`가 비어 있으면 귀속. (원본 마지막 `DWR / Water Repellency (발수)`의 전략문이 다음 행에 오는 케이스 반드시 처리)
- **항목 판정**: B~F 중 2개 이상 값.
- FL 추출: `/FL\d{8,10}/g` 전역 매칭, 중복 제거, 대문자 정규화.
- PASS 추출: `/\(([^)]*(?:pass|PASS)[^)]*)\)/g` — FL 뒤 괄호 주석.
- 상태 정규화: 공백 제거 후 위 4종 매핑, 그 외는 원문 유지.
- 날짜 파싱이 필요하면 `XLSX.SSF.format("yyyy-mm-dd", v)` 관례 준수(현재 스키마엔 날짜 없음).

## Task 2 — 업로드·영속 배선
- `useAppStore`에 `chemical: ChemicalPortfolio | null` 상태 + setter 추가. `cache.ts`에 IndexedDB 저장/복원(다른 소스와 동일 패턴, 키 예 `chemical`).
- `upload.ts`에 `ingestChemical(file)` 추가(다른 ingest 함수와 동일 시그니처·오류 처리).
- `Setting.tsx` **파일 연결 센터에 카드 1개 추가**: 제목 `기능성 개발 List`, 파일 `Chemical 개발 List.xlsx`, 연결 `PORTFOLIO / HOME 포트폴리오 카드`.
- 업로드 실패 시 기존 화면 유지 + 안내(다른 업로드와 동일 UX).

## Task 3 — PORTFOLIO 화면 `src/routes/Portfolio.tsx` (라우트 `/trend/portfolio`)
현재 이 라우트는 `PlaceholderPage`("준비 중")다. 실제 화면으로 교체하고 `route-config.ts`의 subtitle도 갱신(예 `"팀이 개발한 기능성 원단 자산입니다."`).

**① 상단 KPI 밴드** (포트폴리오 목적에 맞는 지표 — 단순 건수보다 "입증된 자산"을 앞세운다)
1. **보유 기능** = 카테고리 수(11)
2. **개발 완료** = 완료 건수 / 전체(13 / 24) + 완료율 진행바
3. **검증 통과** = PASS 주석 건수(7) — *실제로 성능이 입증된 건*
4. **연결 원단** = 고유 FL 수(72)
- `NumberTicker startOnView` + `Reveal` 사용(앱 관례). 카드 톤은 기존 `StatCard`/`AccentKpiTile` 재사용 가능.

**② 카테고리 그리드 (1단계 — 단순하게)**
- 11개 카테고리를 타일 그리드로(`sm:2 / xl:3~4열`). 각 타일: 한글명(크게) + 영문명(작게) + **건수 배지** + 완료/통과 미니 지표 + 상태 4색 스택 미니바.
- 타일에 `strategy` 문구를 2줄 clamp로 노출(이게 이 자료의 강점 — 왜 그 레이어를 타겟하는지).
- **접힘/펼침**: 타일 클릭 → 그 카테고리의 개발 항목 카드가 **아래로 펼쳐짐(아코디언)**. 한 번에 하나만 열림. 첫 화면은 전부 접힌 상태로 깔끔하게.
- 상단에 **상태 필터 칩**(전체/개발완료/개발중/미착수/Drop)과 검색(약품명·원단·FL) 제공.

**③ 개발 항목 카드 (2단계)**
- 펼쳐진 영역에 카드 그리드. 카드: 약품/브랜드명(1~2줄 clamp) · 상태 배지 · FL 개수 칩 · PASS 배지(있으면 강조) · 설명 2줄 clamp.
- 카드 클릭 → **상세 모달**(아래 ④). 인라인 확장 금지(원본 HTML의 문제점: 내용이 길어 스크롤·가독성 저하).

**④ 상세 모달** — 기존 `dialog.tsx` 사용
- 헤더: 약품/브랜드 + 상태 배지 + 카테고리.
- 본문 섹션: `Description & Effect` / `Fabrication`(줄바꿈을 **원단 목록으로 렌더**, 번호 유지) / `Market Product Analysis` / **`FL# 칩 목록`**(PASS 표시된 건은 강조 배지).
- **FL 칩 클릭 → DD 연결**: 해당 FL을 가진 개발 건이 스토어(`records`/`completed`)에 있으면 그 정보(스타일·담당·완료일)를 모달 안에 보조로 표시하거나 `/development`로 이동. 없으면 칩 비활성(툴팁 "DD에 없는 과거 건").
- **OneDrive/SharePoint 링크**: 항목에 링크 필드가 없으므로, 우선 **카테고리·항목 단위 링크를 웹에서 입력·저장**할 수 있게 한다(IndexedDB, 다른 화면의 링크 입력 패턴 재사용). 링크가 있으면 모달 하단에 "원본 자료 열기" 버튼.
- 모달은 스크롤 가능하되 좌우 여백 충분히(가독성 우선).

**⑤ 커버리지 인사이트(포트폴리오다움)**
- 화면 하단(또는 KPI 옆)에 **카테고리별 보유 편차**를 한 줄로: 건수 내림차순 막대(항균 5·땀관리 5·발열 3 … 형태안정/촉감/친환경/회복/마이크로바이옴 각 1). "어느 기능이 얇은가"가 보이게. 과한 시각화 금지 — 단순 가로 막대.

## Task 4 — HOME: Trend issue 섹션에서 PORTFOLIO를 메인으로
현재 HOME 하단 `Trend issue` 섹션은 `MACRO / FABRIC / PORTFOLIO` 3탭이고 기본값이 `MACRO`(`useState<MaterialKind>("MACRO")`). 팀 자료 비중은 **포트폴리오가 압도적**이므로 재편한다.
- **기본 탭을 `PORTFOLIO`로 변경**하고 **탭 순서도 PORTFOLIO를 첫 번째**로.
- 섹션 제목/설명을 포트폴리오 중심으로 조정(예 제목 `기능성 포트폴리오`, 부제 `팀이 개발한 기능성 원단 자산 · 트렌드 자료`). MACRO/FABRIC은 보조 탭으로 유지(제거 금지).
- **PORTFOLIO 탭 내용은 기존 `CoverflowGallery`(자료 덱)가 아니라 전용 프리뷰**로 렌더한다:
  - 상단에 미니 KPI 3개(보유 기능 / 완료 / 검증 통과)
  - 그 아래 **카테고리 칩 스크롤**(11개, 건수 배지) — 클릭 시 `/trend/portfolio`로 이동(해당 카테고리 선택 상태 전달, 라우트 state 또는 쿼리)
  - 우측 상단 "전체 보기 →" → `/trend/portfolio`
- 데이터 없으면(업로드 전) 안내 문구 + SETTING 유도(다른 화면과 동일 톤). 데모 데이터가 있으면 데모로 렌더.

## Task 5 — 익명 데모 데이터 (`sample.ts`)
업로드 전에도 화면이 비지 않도록 **익명 포트폴리오 데모**를 추가한다.
- 카테고리 4~5개(기능 일반명 사용 가능: 냉감/항균/보온/땀관리), 각 1~3개 항목, 합계 8건 내외.
- **약품·브랜드·협력사명 금지** → `데모 약제 A` 등. FL은 데모 채번 형식. `strategy`는 짧은 일반 서술.
- 실데이터 업로드 시 데모는 대체된다(다른 소스와 동일 규칙).

## 금지사항
- **실데이터(협력사·브랜드·FL) 저장소 커밋 금지** — 파서·화면만 구현, 데이터는 업로드로.
- 새 npm 패키지 금지(기존 xlsx·shadcn·recharts만). `derive.ts`·`schema.ts` 기존 로직 변경 금지(추가는 허용).
- 인라인 확장으로 상세를 보여주지 말 것(모달 필수). `prefers-reduced-motion` 대응. 커밋 금지.
- 다른 화면(DD·창고·TS·STUDY·RDDA) 기능 변경 금지.

## 검증(구현 후 자기점검)
1. `tsc --noEmit && vite build` 통과.
2. `#/trend/portfolio`: KPI 4개, 카테고리 타일(전부 접힘), 타일 클릭 시 아코디언 펼침, 항목 클릭 시 **모달**로 상세(Fabrication이 목록으로, FL 칩 표시).
3. 상태 필터·검색 동작. 커버리지 막대 표시.
4. `#/`(HOME) 하단 섹션의 **기본 탭이 PORTFOLIO**이고 미니 KPI + 카테고리 칩이 보이며 "전체 보기"로 이동된다.
5. SETTING에 `기능성 개발 List` 업로드 카드가 있고, 실제 `Chemical 개발 List.xlsx` 업로드 시 **카테고리 11 · 항목 24 · FL 72 · PASS 7**로 파싱된다.
6. 업로드 전에는 익명 데모가 보이고, 저장소에 실제 브랜드·협력사명이 없다.
