import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { readChartTheme, tooltipStyle } from "@/components/charts/chart-theme"
import type { AnalysisWeeklyPoint } from "@/data/fabric-analysis"

export function AnalysisKpiChart({ data }: { data: readonly AnalysisWeeklyPoint[] }) {
  const theme = readChartTheme()
  const hasData = data.some((item) => item.requested || item.finished || item.leadDays != null)
  return <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--card)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
    <div className="mb-1 flex items-center justify-between gap-4"><div><p className="text-xs font-medium tracking-wide text-[var(--muted-foreground)]">최근 12주 KPI</p><p className="text-sm">주별 의뢰 · 완료 · 평균 소요일</p></div><div className="flex gap-4 text-[11px] text-[var(--muted-foreground)]"><span><i className="mr-1 inline-block size-2 rounded-sm bg-amber-500" />의뢰</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-teal-600 dark:bg-teal-400" />완료</span><span><i className="mr-1 inline-block h-px w-3 border-t border-dashed border-slate-400 align-middle" />소요일</span></div></div>
    <div className="h-[102px]">{hasData ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={[...data]} margin={{ top: 6, right: 2, bottom: 0, left: -26 }} barGap={2}>
      <CartesianGrid vertical={false} stroke={theme.border} strokeOpacity={0.45} />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.mutedForeground }} />
      <YAxis yAxisId="count" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.mutedForeground }} />
      <YAxis yAxisId="days" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: theme.mutedForeground }} width={28} />
      <Tooltip contentStyle={tooltipStyle(theme)} labelStyle={{ color: theme.foreground }} />
      <Bar yAxisId="count" dataKey="requested" name="의뢰" fill="#f59e0b" barSize={8} radius={[3, 3, 0, 0]} />
      <Bar yAxisId="count" dataKey="finished" name="완료" fill="#0d9488" barSize={8} radius={[3, 3, 0, 0]} />
      <Line yAxisId="days" dataKey="leadDays" name="평균 소요일" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
    </ComposedChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">최근 12주 데이터가 없습니다</div>}</div>
  </div>
}
