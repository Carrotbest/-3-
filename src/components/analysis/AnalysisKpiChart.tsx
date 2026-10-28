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
  const renderTotal = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const point = points[props.index ?? -1]
    if (!point?.requested || props.x == null || props.y == null || props.width == null) return null
    return <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={theme.mutedForeground}>{point.requested}</text>
  }

  // 이번 주 눈금만 진하게. 어디가 지금인지 바로 보이게 한다.
  const renderTick = (props: { x?: number; y?: number; index?: number; payload?: { value?: string } }) => {
    const current = props.index === points.length - 1
    return <text x={props.x} y={(props.y ?? 0) + 10} textAnchor="middle" fontSize={10} fontWeight={current ? 600 : 400} fill={current ? theme.foreground : theme.mutedForeground}>{props.payload?.value}</text>
  }

  const renderTooltip = (props: { active?: boolean; payload?: Array<{ payload?: AnalysisWeeklyPoint }> }) => {
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
