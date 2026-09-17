import { useContext } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { RddaMotionContext, useSectionStarted } from "./motion"

type MonthRow = RddaReportV2["months"][number]
type ChartRow = MonthRow & { otherOffers: number; teamOffers: number; teamPickRate: number; teamShare: number }

function MonthlyTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartRow }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return <div className="rounded-[9px] border border-[var(--border)] bg-[var(--popover)] p-3 text-xs text-[var(--popover-foreground)] shadow-xl">
    <strong>{row.month}</strong>
    <div className="mt-2 space-y-1 text-[var(--muted-foreground)]">
      <p>제안: 3팀 {row.teamOffers.toLocaleString()}건 / 소싱 {row.otherOffers.toLocaleString()}건</p>
      <p>전체 픽업률: {row.pickRate.toFixed(1)}%</p>
      <p>3팀 픽업률: {row.teamPickRate.toFixed(1)}%</p>
      <p>소싱 / 3팀: {(100 - row.teamShare).toFixed(1)}% / {row.teamShare.toFixed(1)}%</p>
    </div>
  </div>
}

export function MonthlyTrendChart({ months }: { months: RddaReportV2["months"] }) {
  const motionKey = useContext(RddaMotionContext)
  // 차트 애니메이션은 recharts가 마운트 때 한 번 돈다. 화면에 들어온 뒤에 그려야 보인다.
  const started = useSectionStarted()
  const hasTeamData = months.length > 0 && months.every((row) => typeof row.teamOffers === "number")
  if (!hasTeamData) return <MiniBar items={months.map((row) => ({ label: row.month, value: row.pickRate, detail: `${row.pickRate.toFixed(1)}% · ${row.offers.toLocaleString()}건` }))} max={30} />

  const rows: ChartRow[] = months.map((row) => ({
    ...row,
    teamOffers: row.teamOffers ?? 0,
    otherOffers: Math.max(0, row.offers - (row.teamOffers ?? 0)),
    teamPickRate: row.teamPickRate ?? 0,
    teamShare: row.teamShare ?? 0,
  }))
  const eligible = rows.filter((row) => row.teamOffers >= 30).sort((a, b) => b.teamPickRate - a.teamPickRate)
  const higher = rows.filter((row) => row.teamPickRate > row.pickRate).length

  return <div className="p-4">
    <div className="h-[260px]">
      {started ? <ResponsiveContainer width="100%" height="100%">
        <ComposedChart key={motionKey} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.65} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="offers" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="rate" orientation="right" domain={[0, "auto"]} unit="%" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip content={<MonthlyTooltip />} />
          <Bar yAxisId="offers" dataKey="teamOffers" name="3팀 제안" stackId="offers" fill="var(--gradient-1)" isAnimationActive animationDuration={1100} animationEasing="ease-out" />
          <Bar yAxisId="offers" dataKey="otherOffers" name="소싱 제안" stackId="offers" fill="color-mix(in oklab, var(--gradient-1) 22%, transparent)" isAnimationActive animationDuration={1100} animationEasing="ease-out" />
          <Line yAxisId="rate" type="monotone" dataKey="pickRate" name="전체 픽업률" stroke="#94a3b8" strokeWidth={1.8} strokeDasharray="4 3" dot={false} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
          <Line yAxisId="rate" type="monotone" dataKey="teamPickRate" name="3팀 픽업률" stroke="var(--gradient-3)" strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer> : null}
    </div>
    <ul className="mt-3 grid gap-x-5 gap-y-1.5 border-t border-[var(--border)]/60 pt-3 text-[11px] leading-4 text-[var(--muted-foreground)] sm:grid-cols-2">
      <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 h-2.5 w-3 shrink-0 rounded-[2px] bg-[var(--gradient-1)]" /><span><strong className="font-semibold text-[var(--foreground)]">3팀 제안</strong> 그 달 미팅에 제안된 3팀 담당 원단 수(왼쪽 축)</span></li>
      <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 h-2.5 w-3 shrink-0 rounded-[2px] bg-[color-mix(in_oklab,var(--gradient-1)_22%,transparent)]" /><span><strong className="font-semibold text-[var(--foreground)]">소싱 제안</strong> 3팀 외 원단 수. 막대 전체 높이가 그 달 전체 제안</span></li>
      <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 w-3 shrink-0 border-t-2 border-dashed border-[#94a3b8]" /><span><strong className="font-semibold text-[var(--foreground)]">전체 픽업률</strong> 전체 제안 중 바이어가 픽업한 비율(오른쪽 축)</span></li>
      <li className="flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 w-3 shrink-0 border-t-[3px] border-[var(--gradient-3)]" /><span><strong className="font-semibold text-[var(--foreground)]">3팀 픽업률</strong> 3팀 제안 중 픽업된 비율. 실선이 점선 위면 전체보다 잘 팔린 달</span></li>
    </ul>
    <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{eligible.length ? `3팀 픽업률 최고 ${eligible[0].month} ${eligible[0].teamPickRate.toFixed(1)}%, 최저 ${eligible.at(-1)!.month} ${eligible.at(-1)!.teamPickRate.toFixed(1)}%. ` : "제안 30건 이상인 달이 없습니다. "}전체보다 높았던 달은 {higher}/{rows.length}개월입니다.</p>
  </div>
}
