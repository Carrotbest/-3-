# R201 · RDDA REPORT 화면 재작성

상태: 미착수

## 무엇을 하는가

`/rdda` 화면을 전면 재작성한다. 데이터 원본이 전략팀 월별 엑셀에서 **RDDA 원본 API 집계 JSON**으로 바뀐다.
화면은 탭 8개가 된다.

## 왜 바꾸는가

기존 화면은 전략팀이 만든 월별 엑셀을 파싱한다. 그래서 세 가지가 막혀 있었다.

1. 월별 파일이 시점 스냅샷이라 합산이 금지된다. 추이를 못 본다.
2. 분석 축이 전체와 3팀 둘뿐이다. 바이어, 브랜드, 업체, 조직 축이 없다.
3. 픽업률 정의가 `Pickup ÷ Meeting`인데 보고서와 기준이 달라 숫자가 안 맞는다.

RDDA API를 직접 집계해 보니 기존 월간 보고서의 바이어별 미팅 횟수가 정확히 재현됐다.
최근 12개월 미팅 711건, 제안 원단 10,988건을 전수 집계할 수 있다.

## 확정된 기준

Codex는 이 기준을 바꾸지 마라. 사용자가 정한 것이다.

| 항목 | 값 |
|---|---|
| 주지표 | **제안 대비 픽업**. 그달 미팅에 건 원단 중 선택된 비율 |
| 누적 지표 | 전사 대비 탭에서만. 분모가 달라 섞지 않는다 |
| 첫 화면 | 바이어 탭 |
| 담당자 | 이름을 화면에 세우지 않는다. 팀 합계와 연도별 집계만 |
| 분석 기간 | 최근 12개월 |
| 폐기 리스트 | 수집 단계에서 이미 제외됨. 화면은 신경 쓰지 않는다 |

## 데이터 계약

집계 JSON을 업로드받아 `state/rdda`에 저장한다. 수집 스크립트는 저장소 밖에 있고 이 형식으로 파일을 만든다.

`src/data/rdda-report.ts`를 새로 만들고 아래 타입을 그대로 선언한다. 필드명을 바꾸지 마라.

```ts
export interface RddaReportV2 {
  meta: {
    generatedAt: string        // "2026-09-16"
    periodFrom: string         // "2025-10"
    periodTo: string           // "2026-09"
    meetings: number           // 711
    offers: number             // 10988
    picks: number              // 1734
    ledgerTotal: number        // 85415  전사 FL 누적
    teamTotal: number          // 5538   팀 FL 누적
  }
  summary: {
    offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
  }
  buyers: RddaBuyerRow[]
  brands: RddaSegmentRow[]
  genders: RddaSegmentRow[]
  fibers: RddaFiberRow[]
  weights: { band: string; offers: number; pickRate: number }[]
  months: { month: string; offers: number; pickRate: number }[]
  seasons: RddaSegmentRow[]
  ledger: RddaLedgerRow[]
  origins: { name: string; count: number; hitRate: number; teamCount: number; note: string }[]
  suppliers: RddaSupplierRow[]
  gaps: RddaGapRow[]
  trend: { rising: RddaTrendRow[]; falling: RddaTrendRow[] }
  price: { band: string; count: number; pickRate: number; orderRate: number; note: string }[]
  maturity: { band: string; count: number; hitRate: number }[]
  teamYears: { year: string; registered: number; neverShownRate: number }[]
  recommend: Record<string, RddaRecommend>
}

export interface RddaBuyerRow {
  name: string; meetings: number; offers: number; pickRate: number
  teamOffers: number; teamShare: number; teamPickRate: number
  limited?: boolean          // true면 확대 권고 대신 "기회 제한" 배지
}

export interface RddaSegmentRow {
  name: string; offers: number; pickRate: number
  teamOffers: number; teamShare: number
  teamPickRate: number | null   // 팀 표본 20건 미만이면 null
  gap: number | null            // 팀 픽업률 빼기 타팀 픽업률
}

export interface RddaFiberRow {
  name: string; offers: number; pickRate: number
  teamOffers: number; teamShare: number; gap: number | null
}

export interface RddaLedgerRow {
  scope: string              // "전사 전체" | "우리 팀" | "타팀 소싱"
  count: number; shownRate: number; avgShown: number
  hitRate: number; shownHitRate: number; orderRate: number
  lead?: boolean             // true면 표에서 강조
}

export interface RddaSupplierRow {
  name: string; count: number; hitRate: number
  avgPrice: number; teamCount: number; topConstructions: string
}

export interface RddaGapRow {
  construction: string; allCount: number; allHitRate: number
  teamCount: number; teamHitRate: number; gap: number
}

export interface RddaTrendRow {
  construction: string; before: number; after: number; delta: number
}

export interface RddaRecommend {
  buyer: string; candidates: number
  teamPickRate: number; allPickRate: number
  top: { name: string; pickRate: number; picks: number; offers: number }
  avoid: { name: string; pickRate: number; picks: number; offers: number }
  preferences: { name: string; offers: number; picks: number; pickRate: number }[]
  mix: { name: string; count: number }[]
  items: { flNo: string; construction: string }[]
}
```

## 화면 구성

탭 8개. 순서를 지켜라. 첫 탭이 기본 선택이다.

| # | 탭 | 내용 |
|---|---|---|
| 1 | 바이어 | KPI 4장, 바이어 표, 브랜드 표, Gender 표와 막대, 월별 픽업률 막대 |
| 2 | 원단 제안 | 바이어 토글, KPI 4장, 선호 조직 랭킹, 후보 구성 막대, 우선 제안 목록 |
| 3 | 전사 대비 | KPI 4장, 전사 비교 표, 지수 막대, 원산지 표 |
| 4 | 업체 | KPI 4장, 업체 포트폴리오 표 |
| 5 | 개발 방향 | 조직 격차 표, 혼용률 표, 중량 막대, 시즌 표, 트렌드 랭킹 2개 |
| 6 | 성숙과 가격 | KPI 4장, 가격대 표, 나이별 막대 |
| 7 | 팀 운영 | KPI 4장, 연도별 등록 막대, 미노출 비율 막대 |
| 8 | 설계 | 확정 기준 표, 수집 경로 설명 |

**8번 탭은 만들지 마라.** 시안 문서용이다. 화면은 7탭이다.

### 공통 규칙

- 표는 `DataTable`을 쓰지 말고 단순 `<table>`로 만든다. 열이 7개까지 가고 정렬이 필요 없다.
- 비율 셀은 **인라인 막대 + 숫자**다. 배경 트랙 위에 채움 막대를 깔고 오른쪽 끝에 숫자를 얹는다.
- 판단 배지는 네 가지다. `확대`(초록) `유지`(회색) `재검토`(빨강) `기회 제한`(주황).
- 숫자는 `font-variant-numeric: tabular-nums`.
- KPI 카드는 기존 `StatCard`를 쓰지 말고 이 화면 전용 단순 카드로 만든다. 4개가 1px 간격으로 붙은 격자다.

### 배지 판정 규칙

바이어 표:

```
limited === true                      → "기회 제한" (주황)
gap >= 6 && teamShare < 20            → "확대" (초록)
gap >= 6                              → "유지 확대" (초록)
gap <= -4                             → "재검토" (빨강)
teamOffers < 20                       → "표본 부족" (주황)
그 외                                  → "유지" (회색)
```
여기서 `gap = teamPickRate - pickRate`.

조직 격차 표:

```
gap >= 18 && teamCount < 150  → "개발 확대" (초록)
gap >= 8                      → "현 수준 유지" (회색)
gap >= 0                      → "유지" (회색)
그 외                          → "축소 검토" (빨강)
```

혼용률 표:

```
teamShare < 5 && offers >= 800 → "대상 아님" (회색)
gap === null                   → "표본 부족" (주황)
gap >= 8                       → "강점 확대" (초록)
gap >= 2                       → "유지" (회색)
그 외                           → "평균" (회색)
```

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/rdda-report.ts` | 신규. 위 타입 전량 + `sampleRddaReport()` 익명 샘플 생성 함수 |
| `src/data/upload.ts` | `ingestRddaReport(files: File[])` 추가. `.json` 한 개를 읽어 `RddaReportV2`로 파싱하고 `state/rdda`에 저장. 기존 `ingestRdda`는 **지우지 말고 그대로 둔다** |
| `src/routes/Rdda.tsx` | 전면 재작성. 탭 7개 |
| `src/components/rdda/` | 신규 폴더. 탭별 컴포넌트를 파일로 나눈다. `BuyerTab.tsx` `RecommendTab.tsx` `LedgerTab.tsx` `SupplierTab.tsx` `DirectionTab.tsx` `MaturityTab.tsx` `TeamTab.tsx`, 공용 `RddaTable.tsx` `RateBar.tsx` `Badge.tsx` `MiniBar.tsx` |

`sampleRddaReport()`의 익명 샘플 규칙:

- 바이어와 브랜드는 `Buyer A` `Brand A` 식으로. 실명을 쓰지 마라.
- 업체는 `Vendor A` 식. `avgPrice`는 0으로 둔다.
- 조직명과 혼용률명은 일반 용어라 그대로 써도 된다. `Single Jersey` `Cotton/Spandex` 등.
- 행 수는 각 배열 4~6개면 충분하다. 화면이 비어 보이지 않을 정도.

## 검증

```
npm run build
```

`tsc --noEmit`이 통과하고 빌드가 끝나면 된다. 그 외 검증은 하지 마라.

## 하지 말 것

- 기존 `ingestRdda`와 `src/data/sample.ts`의 `RddaReport` 계열 타입을 **지우지 마라.** 엑셀 업로드 경로가 아직 살아 있다.
- `rdda-files.ts`를 건드리지 마라. 폐기 라운드에서 쓴다.
- 차트 라이브러리를 새로 넣지 마라. 막대는 전부 `div` 또는 인라인 `svg`로 그린다. Recharts를 쓰지 않는다.
- 담당자 이름을 화면 어디에도 넣지 마라. 타입에도 개인명 필드가 없다.
- 실제 바이어명, 업체명, 단가를 샘플이나 주석에 넣지 마라. 이 저장소는 공개다.
- `public/data` 아래 JSON을 열지 마라.
