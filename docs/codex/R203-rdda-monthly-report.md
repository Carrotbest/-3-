# R203 · RDDA 월간 분석 리포트

상태: 미착수. R202(주간 스냅샷과 추이 탭)가 끝난 뒤 이어서 한다.

## 무엇을 하는가

월간 분석 리포트를 화면에서 **자동 생성하고, 편집하고, 확정하고, 인쇄**한다.
확정된 리포트는 지우지 않고 계속 쌓는다.

## 왜 필요한가

부장님이 월별 정기보고를 지시했다. 지금까지는 팀원이 RDDA를 손으로 집계해 PPT를 만들었고, 그 담당자가 팀을 떠났다.
집계는 이미 화면이 갖고 있으므로 문장까지 만들어 주면 그 업무가 버튼 몇 번으로 끝난다.

## 확정된 기준

| 항목 | 값 |
|---|---|
| 생성 방식 | 전자동으로 문장까지 만든다. 그다음 사람이 고친다 |
| 확정 | 확정 버튼을 누르면 `confirmed`가 된다. 확정 뒤에도 다시 편집할 수 있다 |
| 출력 | 브라우저 인쇄. 슬라이드처럼 보이는 인쇄 전용 레이아웃 |
| 보관 | 무기한. 지우는 기능을 만들지 마라 |
| 섹션 | 아래 5개 고정 |

## 데이터 계약

`src/data/rdda-report.ts`에 더한다.

```ts
export interface RddaMonthlyReport {
  monthId: string          // "2026-09"
  generatedAt: string      // 최초 생성 시각 ISO
  updatedAt: string        // 마지막 편집 시각 ISO
  status: "draft" | "confirmed"
  confirmedAt?: string
  kpi: {
    meetings: number; offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
  }
  prevKpi?: RddaMonthlyReport["kpi"]   // 전월. 없으면 생략
  sections: { id: string; title: string; body: string }[]
}
```

저장 키는 `rddaReports`, 병합 id는 `monthId`다.

| 파일 | 조치 |
|---|---|
| `src/data/cache.ts` | `CACHE_KEYS`에 `"rddaReports"` 추가 |
| `src/data/firestore-sync.ts` | `MERGE_IDS`에 `rddaReports: (item: { monthId: string }) => item.monthId` 추가 |
| `src/store/useAppStore.ts` | `rddaReports: RddaMonthlyReport[]` 상태와 `saveRddaReports` 추가 |

`saveRddaReports`는 작업 이력(`logAction`)을 남겨라. 사람이 고치는 문서라 누가 언제 바꿨는지가 남아야 한다.
주간 스냅샷과 반대다.

## 섹션 다섯 개와 자동 문장

`buildMonthlyReport(report: RddaReportV2, snapshots: RddaWeeklySnapshot[], monthId: string): RddaMonthlyReport`를
`src/data/rdda-monthly.ts`에 새로 만든다.

문장은 아래 틀에 숫자를 채운다. 값이 없으면 그 문장을 통째로 뺀다.

**1. `meetings` · 월 바이어 미팅 현황**
```
{월}월 바이어 미팅은 {meetings}건이었다.
{1위}이 {n}건으로 가장 많았고 {2위} {n}건, {3위} {n}건이 뒤를 이었다.
```

**2. `share` · 전체 제안 대비 3팀 비율**
```
전체 제안 원단 {offers}건 중 3팀 원단은 {teamOffers}건으로 {teamShare}%를 차지했다.
바이어별로는 {최고비중 바이어}가 {n}%로 가장 높고 {최저비중 바이어}가 {n}%로 가장 낮다.
```

**3. `pickup` · 바이어 selection 및 Pickup 현황**
```
전체 픽업률은 {pickRate}%, 3팀 원단 픽업률은 {teamPickRate}%다.
{팀픽업률이 전체보다 높은 바이어 상위 3곳}에서 3팀 원단이 평균보다 잘 선택됐다.
{팀픽업률이 전체보다 낮은 바이어 상위 2곳}은 제안 방향 점검이 필요하다.
```

**4. `material` · 소재 및 원단 트렌드**
```
조직별로는 {gaps 상위 3개 construction}에서 3팀이 전사 평균을 앞섰다.
혼용률은 {fibers 중 gap 상위 2개}가 강세다.
전사 등록 비중이 늘고 있는 조직은 {trend.rising 상위 3개}이고, 줄고 있는 조직은 {trend.falling 상위 3개}다.
```

**5. `change` · 전월 대비 변화**
```
제안은 전월 {n}건에서 {n}건으로 {증감}했다.
픽업률은 {n}%에서 {n}%로 {증감}%p 움직였다.
3팀 비중은 {n}%에서 {n}%로 {증감}%p 변했다.
```
`prevKpi`가 없으면 이 섹션 본문을 `비교할 전월 기록이 없습니다.`로 둔다.

숫자 표기 규칙:
- 건수는 천 단위 쉼표. 비율은 소수 첫째 자리까지.
- 증감은 `늘었다` `줄었다` `같았다`. %p는 `+1.2` `-0.8` 형태.
- 화살표나 가운뎃점을 쓰지 마라. 문장은 짧게 끊는다.

## 화면

추이 탭(R202에서 만든 `TrendTab.tsx`) 안에 리포트 영역을 더한다. 새 탭을 만들지 마라.

### 목록

추이 탭 맨 아래에 `월간 리포트` 섹션을 둔다.

- 줄마다 월, 상태 배지(`작성 중` 회색 / `확정` 초록), 수정일, `열기` 버튼
- 맨 위에 `이번 달 리포트 생성` 버튼. 이미 있으면 `이번 달 리포트 열기`로 바뀐다
- 최신이 위다

### 편집 화면

`열기`를 누르면 전체 화면 모달이 열린다. `src/components/rdda/MonthlyReportDialog.tsx`를 새로 만든다.

- 머리에 월, 상태, KPI 4장
- 섹션 5개가 세로로. 각 섹션은 제목과 `textarea`
- `textarea`는 입력할 때마다 상태만 바꾸고, `저장` 버튼을 눌러야 저장한다. 자동 저장하지 마라
- 하단 버튼 세 개: `저장`, `확정`(또는 `확정 해제`), `인쇄`
- `다시 생성` 버튼도 둔다. 누르면 확인을 받고 본문을 자동 문장으로 되돌린다

### 인쇄

`인쇄` 버튼은 `window.print()`를 부른다. 인쇄 전용 CSS를 `@media print`로 둔다.

- 화면 요소(탭, 버튼, 사이드바)는 전부 숨긴다
- 표지 한 장: 제목 `RDDA 월간 분석`, 월, 확정일
- KPI 한 장
- 섹션마다 한 장씩. `page-break-after: always`
- 가로 방향을 기본으로: `@page { size: A4 landscape; margin: 12mm; }`
- 글자는 본문 12pt, 제목 20pt 정도. 슬라이드처럼 여백을 넉넉히

## 검증

```
npm run build
```

통과하면 된다. 인쇄 결과는 사람이 브라우저에서 확인한다.

## 하지 말 것

- PPT 생성 라이브러리(pptxgenjs 등)나 PDF 라이브러리(jsPDF 등)를 설치하지 마라. 번들이 이미 2.9MB다.
- 리포트 삭제 기능을 만들지 마라.
- 자동 저장을 넣지 마라. 편집 중 동기화가 끼어들면 남의 편집을 덮는다.
- 새 탭을 만들지 마라. 추이 탭 안에 넣는다.
- 주간 스냅샷 구조를 바꾸지 마라. R202에서 확정됐다.
- 실제 바이어명을 샘플이나 주석에 넣지 마라. 이 저장소는 공개다.
- `public/data` 아래 JSON을 열지 마라.
