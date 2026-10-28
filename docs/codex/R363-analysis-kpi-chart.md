# R363 — FABRIC ANALYSIS 상단 KPI 그래프 재설계

상태: 구현 완료. `npm run build` 통과, 2026-10-28 박향근 화면 확인 완료.

## 배경

`/analysis` 상단 KPI 그래프가 무슨 상태인지 읽히지 않는다. 원인은 셋이다.

1. **축이 둘이다.** 왼쪽은 건수, 오른쪽은 소요일이다. 두 척도를 한 그림에 겹치면 높이 비교가 뜻을 잃는다.
2. **막대가 8px이고 12주 중 8주가 0이다.** 데이터가 9/28부터라 대부분이 빈칸인데 눈금과 격자만 가득하다.
3. **의뢰와 완료를 나란히 세웠다.** 분석 의뢰는 거의 100%가 1~2일 안에 끝나서 두 막대가 늘 비슷하다. 대조할 것이 없는 값을 대조하고 있다(2026-10-28 박향근 확인).

바꿀 것은 "의뢰가 몇 건인지 한눈에 보이게"다. 막대 높이 = 그 주 의뢰 건수 하나로 읽히게 하고, 소요일 선은 뺀다. 평균 소요일은 바로 위 KPI 띠에 이미 있다(`FabricAnalysis.tsx`의 `metrics` 배열).

## 설계 결정

- **단일 축.** 소요일 축과 선을 없앤다.
- **막대 하나 = 그 주 의뢰 건수.** 그 막대를 완료분(teal)과 아직 분석 대기분(amber)으로 **쌓는다.** 의뢰와 완료를 나란히 비교하는 것이 아니라 한 막대의 구성이다. 과거 주는 대기가 0이라 teal 한 덩어리로 보이고, 대기가 남은 주만 윗부분이 amber가 된다.
- **완료 집계 기준이 바뀐다.** 기존 `finished`는 "그 주에 완료된 건"(완료일 기준)이었다. 새 `done`은 "그 주에 의뢰된 건 중 지금 완료인 건"이다. 막대 높이가 의뢰 건수여야 하므로 분자와 분모의 주가 같아야 한다.
- **격자와 Y축을 없애고 막대 위에 숫자를 직접 적는다.** 12개 중 몇 개만 값이 있어 눈금을 읽게 할 이유가 없다.
- **왼쪽에 요약 칸을 둔다.** 이번 주 의뢰 건수를 큰 숫자로, 지난주 대비 증감과 12주 합계·주 평균을 작게 적는다. 막대가 전부 0인 주에도 이 칸은 뜻을 갖는다.
- **색은 검증했다.** `#0d9488`(완료)과 `#d97706`(대기) 두 값이 밝은 모드(배경 `#fff`)와 어두운 모드(배경 `hsl(240 10% 3.9%)`) **양쪽에서** 명도 대역·채도·색각 분리(ΔE protan 12.5, normal 24.3)·대비 3:1을 모두 통과했다. 그래서 **모드별로 색을 가르는 코드가 필요 없다.** 기존 `#f59e0b`는 밝은 모드에서 배경 대비 2.09로 미달이라 쓰지 않는다. 이 두 값을 임의로 바꾸지 말 것.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/fabric-analysis.ts` | `AnalysisWeeklyPoint`의 `finished`·`leadDays`를 `done`·`pending`으로 교체. `analysisWeeklySeries` 집계 수정 |
| `src/components/analysis/AnalysisKpiChart.tsx` | 전면 재작성 |
| `src/routes/FabricAnalysis.tsx` | **고치지 않는다.** `analysisWeeklySeries(rows)`를 넘기는 호출부가 그대로 맞는다 |

`analysisLeadDays`는 그대로 둔다. `FabricAnalysis.tsx` 154행 평균 소요일 지표가 쓴다.

### 1. `src/data/fabric-analysis.ts`

70행 인터페이스를 이렇게 바꾼다.

```ts
export interface AnalysisWeeklyPoint {
  week: string
  label: string
  /** 그 주에 의뢰된 건수. 막대 전체 높이다. */
  requested: number
  /** 그중 지금 완료인 건. */
  done: number
  /** 그중 아직 완료가 아닌 건. requested - done. */
  pending: number
}
```

`analysisWeeklySeries`의 `starts.map` 안을 이렇게 바꾼다. 주 경계 계산(`end`, `starts`, `inWeek`)은 그대로다.

```ts
  return starts.map((start) => {
    const finish = new Date(start)
    finish.setDate(start.getDate() + 7)
    const inWeek = (value: string) => {
      const date = dateValue(value)
      return Boolean(date && date >= start && date < finish)
    }
    // 분자와 분모의 주를 맞춘다. 막대 높이가 그 주 의뢰 건수라서,
    // 완료도 "그 주에 의뢰된 건 중 완료인 것"으로 센다.
    const requestedRows = list.filter((item) => item.state !== "작성" && inWeek(item.requestedAt))
    const done = requestedRows.filter((item) => item.state === "완료").length
    return {
      week: localDateValue(start),
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      requested: requestedRows.length,
      done,
      pending: requestedRows.length - done,
    }
  })
```

`completed`, `leads` 지역 변수와 `analysisLeadDays` **import가 아닌 호출**은 이 함수에서 빠진다. 함수 자체는 파일에 남겨 둔다.

### 2. `src/components/analysis/AnalysisKpiChart.tsx`

파일 전체를 아래로 바꾼다. 이 저장소는 한 줄에 길게 쓰는 JSX 스타일을 쓰지만, 이 파일은 읽을 일이 많아 줄을 나눠 둔다.

```tsx
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { readChartTheme } from "@/components/charts/chart-theme"
import { NumberTicker } from "@/components/motion/NumberTicker"
import type { AnalysisWeeklyPoint } from "@/data/fabric-analysis"

/**
 * 두 색은 밝은 모드와 어두운 모드 양쪽에서 명도·채도·색각 분리·대비 검사를 통과한 값이다(R363).
 * 모드에 따라 가르지 않는다. amber-500(#f59e0b)은 흰 배경 대비가 2.09라 쓰지 않는다.
 */
const DONE_COLOR = "#0d9488"
const PENDING_COLOR = "#d97706"

export function AnalysisKpiChart({ data }: { data: readonly AnalysisWeeklyPoint[] }) {
  const theme = readChartTheme()
  const points = [...data]
  const last = points[points.length - 1]
  const previous = points[points.length - 2]
  const thisWeek = last?.requested ?? 0
  const lastWeek = previous?.requested ?? 0
  const delta = thisWeek - lastWeek
  const total = points.reduce((sum, item) => sum + item.requested, 0)
  const average = points.length ? total / points.length : 0
  const deltaText = delta === 0 ? "지난주와 같음" : `지난주 대비 ${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}건`

  // 막대 꼭대기에 그 주 의뢰 건수를 적는다. 0인 주에는 아무것도 적지 않는다.
  // 대기가 0이어도 높이 0인 사각형이 쌓임 꼭대기에 서므로 y 좌표가 맞는다.
  const renderTotal = (props: { x?: number; y?: number; width?: number; index?: number }) => {
    const point = points[props.index ?? -1]
    if (!point?.requested || props.x == null || props.y == null || props.width == null) return null
    return <text x={props.x + props.width / 2} y={props.y - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={theme.mutedForeground}>{point.requested}</text>
  }

  // 이번 주 눈금만 진하게. 어디가 지금인지 바로 보이게 한다.
  const renderTick = (props: { x?: number; y?: number; index?: number; payload?: { value?: string } }) => {
    const current = props.index === points.length - 1
    return <text x={props.x} y={(props.y ?? 0) + 10} textAnchor="middle" fontSize={10} fontWeight={current ? 600 : 400} fill={current ? theme.foreground : theme.mutedForeground}>{props.payload?.value}</text>
  }

  const renderTooltip = (props: { active?: boolean; payload?: Array<{ payload: AnalysisWeeklyPoint }> }) => {
    const point = props.active ? props.payload?.[0]?.payload : null
    if (!point) return null
    return <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{point.label} 주</p>
      <p className="mt-0.5 text-[var(--muted-foreground)]">의뢰 <span className="font-medium text-[var(--foreground)]">{point.requested}</span>건</p>
      {point.requested ? <p className="text-[var(--muted-foreground)]">완료 {point.done} · 대기 {point.pending}</p> : null}
    </div>
  }

  return <div className="flex rounded-lg border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
    <div className="w-[196px] shrink-0 border-r border-[var(--border)]/60 px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">이번 주 의뢰</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <NumberTicker value={thisWeek} className="text-3xl font-semibold tabular-nums" />
        <span className="text-sm text-[var(--muted-foreground)]">건</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{deltaText}</p>
      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">최근 12주 <span className="font-medium text-[var(--foreground)]">{total}</span>건 · 주 평균 <span className="font-medium text-[var(--foreground)]">{average.toFixed(1)}</span>건</p>
    </div>
    <div className="flex min-w-0 flex-1 flex-col px-3 py-3">
      <div className="mb-1 flex items-center justify-end gap-3 text-[11px] text-[var(--muted-foreground)]">
        <span><i className="mr-1 inline-block size-2 rounded-[2px] align-middle" style={{ background: DONE_COLOR }} />완료</span>
        <span><i className="mr-1 inline-block size-2 rounded-[2px] align-middle" style={{ background: PENDING_COLOR }} />분석 대기</span>
      </div>
      <div className="h-[104px]">{total ? <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 16, right: 4, bottom: 0, left: 4 }} barCategoryGap="30%" maxBarSize={22}>
          <XAxis dataKey="label" interval={0} tickLine={false} axisLine={{ stroke: theme.border, strokeOpacity: 0.5 }} tick={renderTick} />
          <YAxis hide allowDecimals={false} />
          <Tooltip cursor={{ fill: theme.mutedForeground, fillOpacity: 0.08 }} content={renderTooltip} />
          <Bar dataKey="done" name="완료" stackId="week" fill={DONE_COLOR} radius={[3, 3, 0, 0]} />
          <Bar dataKey="pending" name="분석 대기" stackId="week" fill={PENDING_COLOR} radius={[3, 3, 0, 0]}>
            <LabelList content={renderTotal} />
          </Bar>
        </BarChart>
      </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">최근 12주 의뢰가 없습니다</div>}</div>
    </div>
  </div>
}
```

## 하지 말 것

- **두 번째 Y축을 다시 만들지 말 것.** 축이 둘이면 막대 높이가 뜻을 잃는다. 평균 소요일은 위 KPI 띠에 있다.
- **의뢰와 완료를 나란한 막대로 되돌리지 말 것.** 1~2일 안에 끝나는 업무라 늘 같은 높이가 나온다.
- **`CartesianGrid`와 보이는 Y축을 되살리지 말 것.** 숫자는 막대 위에 직접 적는다.
- **색을 `#f59e0b`나 teal-400 계열로 바꾸지 말 것.** 검사를 통과한 조합이 아니다.
- `FabricAnalysis.tsx`를 고치지 말 것. 호출부가 그대로 맞는다.
- `analysisLeadDays` 함수를 지우지 말 것.

## 검증

- `npm run build`가 통과할 것. `tsc --noEmit`이 포함이라 `finished`·`leadDays` 잔존 참조가 있으면 여기서 걸린다.
- `git status --short`에 위 두 파일과 이 문서 외의 변경이 없을 것.
- 화면 확인은 박향근이 한다.
