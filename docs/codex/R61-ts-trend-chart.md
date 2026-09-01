# R61 — TS 화면에 "TS 등록 추이" 차트 추가 (홈 RDDA 곡선 차트와 동일 형태)

## 목적
TS 화면(`/ts`)의 **TS 자료 덱 바로 아래**에, 홈의 "RDDA 등록 현황" 곡선 차트와 **동일한 형태**
(월별 스택 바 + 총합 곡선 라인, 6/12/24개월 기간 토글, KPI 타일, 범례, 바 애니메이션·툴팁·색상·모션 전부 동일)의
차트를 넣는다. 단 데이터는 **TS(월별 접수, 상태별)**.

대상: `src/data/derive.ts`(집계 함수 추가), `src/components/charts/TsTrendCard.tsx`(신규),
`src/routes/TS.tsx`(차트 배치). 그 외 파일·홈 화면 변경 금지.

> 참고 원본: 홈 RDDA 차트는 `src/routes/Home.tsx`의 `RDDA_RANGE_OPTIONS`(518), `RDDA_SERIES`(532),
> `RddaTrendTooltip`(539), `AnimatedRddaBarProps/AnimatedRddaBar`(568/579), `RddaTrendChart`(583),
> 카드 JSX(738~771, 토글 그룹·KPI 타일·범례). **이 코드를 그대로 복제**해 TS용으로 최소 변경한다(모션/색/그래픽 동일 유지).

---

## 항목 1 — 월별 TS 집계 함수 (`src/data/derive.ts`)

`monthlyDevelopmentTrend`(934~972행)와 **같은 월 배열 생성 방식**으로 TS 버전을 추가한다.
- import: 상단에 `type TsRecord`가 없으면 `import { ... , type TsRecord } from "./sample"` 추가(이미 다른 sample 타입 import 중).
- 타입·함수:
  ```ts
  export interface MonthlyTsDatum {
    month: string
    total: number
    registered: number // 등록
    processing: number // 처리중
    done: number       // 완료
    latest: boolean
  }

  /** 월별 TS 접수(receivedAt) 건수를 상태(등록/처리중/완료)별로 집계한다. 홈 RDDA 추이와 동일한 월 스팬 규칙. */
  export function monthlyTsTrend(
    ts: readonly TsRecord[],
    today = new Date(),
    monthCount = 12,
  ): MonthlyTsDatum[] {
    const span = Math.max(1, Math.round(monthCount))
    const months = Array.from({ length: span }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (span - 1) + index, 1)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    })
    const buckets = new Map<string, { registered: number; processing: number; done: number }>()
    ts.forEach((record) => {
      const month = (record.receivedAt || "").slice(0, 7)
      if (!month) return
      const bucket = buckets.get(month) ?? { registered: 0, processing: 0, done: 0 }
      if (record.state === "완료") bucket.done += 1
      else if (record.state === "처리중") bucket.processing += 1
      else bucket.registered += 1
      buckets.set(month, bucket)
    })
    const latestPopulated = [...months].reverse().find((month) => {
      const v = buckets.get(month)
      return v ? v.registered + v.processing + v.done > 0 : false
    })
    return months.map((month) => {
      const v = buckets.get(month) ?? { registered: 0, processing: 0, done: 0 }
      return { month, ...v, total: v.registered + v.processing + v.done, latest: month === latestPopulated }
    })
  }
  ```

---

## 항목 2 — `src/components/charts/TsTrendCard.tsx` (신규, 자족 컴포넌트)

홈 RDDA 차트 카드를 복제해 TS용으로 만든다. **자체적으로 기간 상태 + localStorage를 관리**하고 `ts`를 받아 집계한다.

- import: `recharts`(Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis),
  `NumberTicker`, `Badge`, `Card`, `CardContent`, `Reveal`(홈과 동일 래핑), `monthlyTsTrend`/`MonthlyTsDatum`(derive), `TsRecord`(sample).
- 상수(홈에서 복제, 값만 TS로):
  ```ts
  const TS_RANGE_OPTIONS = [
    { months: 6, label: "6개월" },
    { months: 12, label: "1년" },
    { months: 24, label: "2년" },
  ] as const
  const TS_TREND_MONTHS_STORAGE_KEY = "fabric-rnd-ts-trend-months-v1"
  const TS_TREND_SERIES = [
    { key: "registered", label: "등록", color: "var(--chart-1)" },
    { key: "processing", label: "처리중", color: "var(--chart-4)" },
    { key: "done", label: "완료", color: "var(--chart-2)" },
  ] as const
  ```
- `loadTsTrendMonths()`: 홈 `loadRddaMonths` 복제(기본 12, 저장키만 위 상수).
- **툴팁**(`TsTrendTooltip`): 홈 `RddaTrendTooltip`(539~566) 복제하되 — 상단 배지(`item.source`) 제거, 각 시리즈 count+백분율 표시(`item.total`으로 % 계산), 하단 TOTAL 행 유지. series는 `TS_TREND_SERIES`. `range` 표기 없음, `other` 행 없음.
- **바 애니메이션**(`AnimatedTsBar`, props): 홈 `AnimatedRddaBar`(568~581) **그대로 복제**(동일 rect/transition/scaleY 모션).
- **차트**(`TsTrendChart`): 홈 `RddaTrendChart`(583~611) **그대로 복제**하되 `monthly: MonthlyTsDatum[]`, `TS_TREND_SERIES`로 Bar 매핑, `stackId="ts-status"`, Line은 동일(`dataKey="total"`, stroke `#2563eb`, width 1.75, dots, `animationDuration={1950}` linear, LabelList total). XAxis/YAxis/Tooltip/CartesianGrid/margins/`h-[25rem]`/IntersectionObserver `started` 로직 전부 동일.
- **카드 컴포넌트**(`export function TsTrendCard({ ts, today }: { ts: readonly TsRecord[]; today?: Date })`):
  - `reduceMotion` 판정은 홈과 동일.
  - `months` 상태 + `useEffect`로 localStorage 저장(홈 `rddaMonths` 패턴).
  - `monthly = useMemo(() => monthlyTsTrend(ts, today ?? new Date(), months), [ts, today, months])`.
  - `monthlyKpis = useMemo(...)`로 total/registered/processing/done 합계(홈 `monthlyKpis`(641) 패턴).
  - JSX는 홈 카드(738~771) 복제:
    - 제목 `<h2>TS 등록 추이</h2>` + 부제 `<p ...>접수일 기준 월별 · 상태별 분포</p>`.
    - 기간 토글 그룹(6개월/1년/2년) — 홈과 동일 스타일/aria.
    - 범례: `TS_TREND_SERIES` 점+라벨(등록/처리중/완료). `range` 표기 없음.
    - KPI 타일 그리드(`grid-cols-2 sm:grid-cols-4`): "N개월 TOTAL" + 시리즈 3개 타일(borderTopColor=series.color), `NumberTicker` 사용 — 홈과 동일 스타일.
    - `<div className="mt-5"><TsTrendChart key={months} monthly={monthly} reduceMotion={reduceMotion} /></div>`.
  - 전체를 홈처럼 `<Reveal><Card className="overflow-hidden"><CardContent className="p-5 sm:p-6">...</CardContent></Card></Reveal>`로 감싼다.
- 홈과 **동일한 색/모션/그래픽**을 유지하는 게 핵심. (홈 코드에서 문자열만 TS로 바꾸는 수준으로 복제.)

---

## 항목 3 — 배치 (`src/routes/TS.tsx`)
- import: `import { TsTrendCard } from "@/components/charts/TsTrendCard"`.
- **TS 자료 덱(`<MaterialDeckSection kind="TS" ... />`, 306행) 바로 아래**에 삽입:
  ```tsx
  <TsTrendCard ts={rows} />
  ```
  (`rows`는 이미 `useAppStore((s) => s.ts)`로 존재.)

---

## 검증
- `npm run build`(tsc + vite) 통과.
- `/ts`에서 TS 자료 덱 바로 아래에 "TS 등록 추이" 차트가 뜬다: 월별 스택 바(등록/처리중/완료) + 총합 곡선 라인, 6개월/1년/2년 토글, KPI 타일 4개, 범례, 홈 RDDA 차트와 동일한 바 성장 애니메이션·호버 강조·툴팁·색.
- 기간 토글 변경 시 재집계·재애니메이션(홈과 동일 UX), 선택은 localStorage 유지.
- 홈 화면 RDDA 차트는 변경 없이 그대로.

## 절대 금지
- 홈 화면(`Home.tsx`)·RDDA 차트 로직 변경 금지(복제만).
- `src/data/ts-seed.ts` 수정 금지. git commit/reset/checkout 금지. 실데이터 값 로그/결과 파일에 남기지 말 것.
