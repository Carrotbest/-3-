# R202 · RDDA 주간 스냅샷과 추이 탭

상태: 미착수. R201(화면 재작성)이 끝난 뒤 이어서 한다.

## 무엇을 하는가

RDDA 집계를 업로드할 때마다 **주간 스냅샷을 한 줄씩 쌓고**, 그 이력을 보는 **추이 탭**을 더한다.
월간 분석 리포트는 R203에서 따로 한다. 이번에는 손대지 마라.

## 왜 필요한가

R201에서 만든 구조는 최신 집계 하나를 `state/rdda`에 덮어쓴다. 지난주 숫자가 남지 않아 변화를 못 본다.
주 1회 KPI를 쌓아야 "이번 주에 무엇이 늘고 줄었는지"가 나온다.

## 확정된 기준

| 항목 | 값 |
|---|---|
| 주간 스냅샷 범위 | 전체 KPI + 주요 바이어 10곳 |
| 주간 보관 | 104주. 넘으면 오래된 것부터 지운다 |
| 월간 리포트 | R203에서. 이번에는 타입도 만들지 마라 |
| 추이 위치 | 새 탭 하나. 8번째 탭이 된다 |

## 데이터 계약

`src/data/rdda-report.ts`에 아래를 더한다. 기존 타입은 건드리지 마라.

```ts
export interface RddaWeeklySnapshot {
  weekId: string          // "2026-W38". ISO 주차
  capturedAt: string      // "2026-09-16T10:22:00.000Z"
  periodFrom: string      // 집계 대상 기간. meta 에서 그대로 가져온다
  periodTo: string
  kpi: {
    offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
    ledgerHitRate: number      // 전사 누적 히트율
    teamHitRate: number        // 팀 누적 히트율
    teamTotal: number          // 팀 FL 누적 건수
  }
  buyers: {
    name: string; offers: number; picks: number
    teamOffers: number; teamPickRate: number
  }[]                     // 제안 규모 상위 10곳
}
```

`weekId` 계산은 ISO 8601 주차다. 목요일이 속한 해를 기준으로 삼는다. 직접 구현하고 라이브러리를 넣지 마라.

```
2026-09-16(수) → "2026-W38"
```

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/rdda-report.ts` | `RddaWeeklySnapshot` 타입, `toWeekId(date: Date): string`, `buildSnapshot(report: RddaReportV2): RddaWeeklySnapshot`, `pruneSnapshots(list, max=104)` 추가 |
| `src/data/cache.ts` | 7행 `CACHE_KEYS` 배열 끝에 `"rddaSnapshots"` 추가 |
| `src/data/firestore-sync.ts` | 24행 `MERGE_IDS`에 `rddaSnapshots: (item: { weekId: string }) => item.weekId` 추가 |
| `src/store/useAppStore.ts` | `rddaSnapshots: RddaWeeklySnapshot[]` 상태와 `saveRddaSnapshots` 추가. `disposalRounds` 처리 방식을 그대로 따라라 |
| `src/data/upload.ts` | `ingestRddaReport` 안에서 최신 집계를 저장한 뒤 `buildSnapshot`으로 스냅샷을 만들어 기존 목록에 병합하고 `pruneSnapshots`로 잘라 저장 |
| `src/components/rdda/TrendTab.tsx` | 신규 |
| `src/routes/Rdda.tsx` | 탭 목록 끝에 `추이` 추가 |

### 스냅샷 병합 규칙

같은 `weekId`가 이미 있으면 **덮어쓴다.** 한 주에 두 번 돌려도 줄이 늘지 않는다.
`pruneSnapshots`는 `weekId` 내림차순으로 정렬해 앞에서 104개만 남긴다.

`saveRddaSnapshots`는 작업 이력(`logAction`)을 남기지 마라. 주 1회 자동 기록이라 이력에 남을 값이 아니다.
`disposalRounds`가 같은 이유로 이력을 남기지 않는다.

## 추이 탭 구성

스냅샷이 2개 미만이면 "아직 비교할 기록이 없습니다. 주 1회 집계를 올리면 여기에 추이가 쌓입니다."만 보인다.

1. **KPI 카드 4장.** 최신 주 값과 전주 대비 증감. 증감은 `+1.2%p` 또는 `-34건` 형태로 색을 준다.
   - 제안 건수, 픽업률, 팀 비중, 팀 픽업률
2. **주간 추이 선 그래프.** 가로축은 주차, 세로축은 비율. 선 두 개다.
   - 전체 픽업률, 팀 픽업률
   - 인라인 `svg`로 그린다. Recharts를 쓰지 마라.
3. **바이어별 변화 표.** 최신 주와 4주 전을 비교한다.
   - 열: 바이어, 제안(현재), 제안 증감, 팀 픽업률(현재), 팀 픽업률 증감
   - 4주 전 기록이 없으면 있는 것 중 가장 오래된 것과 비교하고 그 주차를 표 위에 적는다
4. **기록 목록.** 주차, 수집일, 제안, 픽업, 팀 비중을 한 줄씩. 최신이 위다.

## 검증

```
npm run build
```

통과하면 된다. 그 외 검증은 하지 마라.

## 하지 말 것

- 월간 리포트 관련 타입, 화면, 저장 키를 만들지 마라. R203 몫이다.
- `state/rdda`의 최신 집계 구조를 바꾸지 마라. R201에서 확정됐다.
- 스냅샷에 원본 행이나 추천 목록을 담지 마라. KPI와 바이어 10곳까지다.
- `pruneSnapshots` 기본값 104를 바꾸지 마라.
- 날짜 라이브러리를 설치하지 마라. `toWeekId`는 직접 짠다.
- 실제 바이어명을 샘플이나 주석에 넣지 마라. 이 저장소는 공개다.
- `public/data` 아래 JSON을 열지 마라.
