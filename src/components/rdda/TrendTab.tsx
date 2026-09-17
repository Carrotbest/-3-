import { useId, useMemo, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { buildMonthlyReport, withPreviousKpi } from "@/data/rdda-monthly"
import { toWeekId, type RddaMonthlyReport, type RddaReportV2, type RddaWeeklySnapshot } from "@/data/rdda-report"
import { saveRddaReports, useAppStore } from "@/store/useAppStore"
import { MonthlyReportDialog } from "./MonthlyReportDialog"
import { useFill } from "./motion"
import { RddaPanel, RddaTable } from "./RddaTable"

const countText = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString()}건`
const rateText = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%p`
const deltaColor = (value: number) => value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-[var(--muted-foreground)]"

function Delta({ value, rate = false }: { value: number; rate?: boolean }) {
  return <span className={`font-semibold [font-variant-numeric:tabular-nums] ${deltaColor(value)}`}>{rate ? rateText(value) : countText(value)}</span>
}

function TrendKpi({ label, value, delta }: { label: string; value: ReactNode; delta: ReactNode }) {
  return <div className="relative overflow-hidden rounded-[11px] border border-white/75 bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-4 py-4 shadow-[0_12px_28px_-25px_rgba(15,23,42,0.35)] backdrop-blur"><span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)]" /><div className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</div><div className="mt-2 text-[26px] font-semibold tracking-[-0.035em] [font-variant-numeric:tabular-nums]">{value}</div><div className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">전주 대비 {delta}</div></div>
}

function TrendChart({ snapshots }: { snapshots: RddaWeeklySnapshot[] }) {
  const fill = useFill()
  const clipId = useId().replace(/:/g, "")
  const rows = [...snapshots].reverse()
  const width = 760
  const height = 240
  const left = 48
  const right = 18
  const top = 20
  const bottom = 34
  const values = rows.flatMap((row) => [row.kpi.pickRate, row.kpi.teamPickRate])
  const low = Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5)
  const high = Math.max(low + 5, Math.ceil(Math.max(...values) / 5) * 5 + 5)
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, rows.length - 1)
  const y = (value: number) => top + (high - value) * (height - top - bottom) / (high - low)
  const points = (key: "pickRate" | "teamPickRate") => rows.map((row, index) => `${x(index)},${y(row.kpi[key])}`).join(" ")
  const labelIndexes = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])

  return <div className="p-4">
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--primary)]" />전체 픽업률</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />팀 픽업률</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="전체 픽업률과 팀 픽업률 주간 추이">
      <defs><clipPath id={clipId}><rect x={left} y={0} width={(width - left - right) * fill} height={height} /></clipPath></defs>
      {[low, (low + high) / 2, high].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" /><text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{tick.toFixed(0)}%</text></g>)}
      <g clipPath={`url(#${clipId})`}><polyline points={points("pickRate")} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /><polyline points={points("teamPickRate")} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{rows.map((row, index) => <g key={row.weekId}><circle cx={x(index)} cy={y(row.kpi.pickRate)} r="3" fill="var(--primary)" /><circle cx={x(index)} cy={y(row.kpi.teamPickRate)} r="3" fill="#f59e0b" /></g>)}</g>
      {rows.map((row, index) => labelIndexes.has(index) && <text key={row.weekId} x={x(index)} y={height - 9} textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted-foreground)">{row.weekId.replace(/^\d{4}-/, "")}</text>)}
    </svg>
  </div>
}

function MonthlyReports({ report, snapshots }: { report: RddaReportV2; snapshots: RddaWeeklySnapshot[] }) {
  const reports = useAppStore((state) => state.rddaReports)
  const [selected, setSelected] = useState<RddaMonthlyReport | null>(null)
  const monthId = report.meta.periodTo.match(/^\d{4}-\d{2}/)?.[0] ?? new Date().toISOString().slice(0, 7)
  const sorted = useMemo(() => [...reports].sort((a, b) => b.monthId.localeCompare(a.monthId)), [reports])
  const current = reports.find((item) => item.monthId === monthId)
  const previous = sorted.find((item) => item.monthId < monthId)

  const generated = (existing?: RddaMonthlyReport) => {
    const next = withPreviousKpi(buildMonthlyReport(report, snapshots, monthId), previous?.kpi)
    return existing ? { ...next, generatedAt: existing.generatedAt, updatedAt: existing.updatedAt, status: existing.status, confirmedAt: existing.confirmedAt } : next
  }
  const save = (next: RddaMonthlyReport) => {
    saveRddaReports([...reports.filter((item) => item.monthId !== next.monthId), next].sort((a, b) => b.monthId.localeCompare(a.monthId)))
    setSelected(next)
  }
  const openCurrent = () => {
    if (current) return setSelected(current)
    const next = generated()
    save(next)
    setSelected(next)
  }

  return <>
    <RddaPanel title="월간 리포트" subtitle="자동 문장을 편집한 뒤 확정하고 인쇄할 수 있습니다.">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/65 bg-white/25 px-4 py-3"><p className="text-xs text-[var(--muted-foreground)]">최신 월부터 순서대로 보관됩니다.</p><Button type="button" onClick={openCurrent}>{current ? "이번 달 리포트 열기" : "이번 달 리포트 생성"}</Button></div>
      <RddaTable rows={sorted} getKey={(row) => row.monthId} empty="생성된 월간 리포트가 없습니다." columns={[
        { key: "month", header: "월", render: (row) => <strong>{row.monthId}</strong> },
        { key: "status", header: "상태", render: (row) => <span className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.status === "confirmed" ? "확정" : "작성 중"}</span> },
        { key: "updated", header: "수정일", render: (row) => new Date(row.updatedAt).toLocaleDateString("ko-KR") },
        { key: "open", header: "", align: "right", render: (row) => <Button type="button" size="sm" variant="outline" onClick={() => setSelected(row)}>열기</Button> },
      ]} />
    </RddaPanel>
    <MonthlyReportDialog open={Boolean(selected)} report={selected} onOpenChange={(open) => { if (!open) setSelected(null) }} onSave={save} onRegenerate={() => generated(selected ?? undefined)} />
  </>
}

export function TrendTab({ report }: { report: RddaReportV2 }) {
  const stored = useAppStore((state) => state.rddaSnapshots)
  const snapshots = useMemo(() => [...stored].sort((a, b) => b.weekId.localeCompare(a.weekId)), [stored])

  return <div className="space-y-4">
    {snapshots.length < 2 ? <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">아직 비교할 기록이 없습니다. 주 1회 집계를 올리면 여기에 추이가 쌓입니다.</p> : (() => {
      const latest = snapshots[0]
      const previous = snapshots[1]
      const fourWeeksAgo = new Date(latest.capturedAt)
      fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28)
      const targetWeek = toWeekId(fourWeeksAgo)
      const comparison = snapshots.find((row) => row.weekId === targetWeek) ?? snapshots.at(-1)!
      const comparisonBuyers = new Map(comparison.buyers.map((buyer) => [buyer.name, buyer]))
      return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <TrendKpi label="제안 건수" value={latest.kpi.offers.toLocaleString()} delta={<Delta value={latest.kpi.offers - previous.kpi.offers} />} />
      <TrendKpi label="픽업률" value={`${latest.kpi.pickRate.toFixed(1)}%`} delta={<Delta value={latest.kpi.pickRate - previous.kpi.pickRate} rate />} />
      <TrendKpi label="팀 비중" value={`${latest.kpi.teamShare.toFixed(1)}%`} delta={<Delta value={latest.kpi.teamShare - previous.kpi.teamShare} rate />} />
      <TrendKpi label="팀 픽업률" value={`${latest.kpi.teamPickRate.toFixed(1)}%`} delta={<Delta value={latest.kpi.teamPickRate - previous.kpi.teamPickRate} rate />} />
    </div>
    <RddaPanel title="주간 추이 선 그래프" subtitle={`${snapshots.at(-1)!.weekId} – ${latest.weekId}`}><TrendChart snapshots={snapshots} /></RddaPanel>
    <RddaPanel title="바이어별 변화" subtitle={`${latest.weekId}와 ${comparison.weekId} 비교`}><RddaTable rows={latest.buyers} getKey={(row) => row.name} columns={[
      { key: "buyer", header: "바이어", render: (row) => <strong>{row.name}</strong> },
      { key: "offers", header: "제안(현재)", align: "right", render: (row) => row.offers.toLocaleString() },
      { key: "offersDelta", header: "제안 증감", align: "right", render: (row) => { const prior = comparisonBuyers.get(row.name); return prior ? <Delta value={row.offers - prior.offers} /> : "—" } },
      { key: "teamPickRate", header: "팀 픽업률(현재)", align: "right", render: (row) => `${row.teamPickRate.toFixed(1)}%` },
      { key: "rateDelta", header: "팀 픽업률 증감", align: "right", render: (row) => { const prior = comparisonBuyers.get(row.name); return prior ? <Delta value={row.teamPickRate - prior.teamPickRate} rate /> : "—" } },
    ]} /></RddaPanel>
    <RddaPanel title="기록 목록"><RddaTable rows={snapshots} getKey={(row) => row.weekId} columns={[
      { key: "week", header: "주차", render: (row) => <strong>{row.weekId}</strong> },
      { key: "captured", header: "수집일", render: (row) => new Date(row.capturedAt).toLocaleDateString("ko-KR") },
      { key: "offers", header: "제안", align: "right", render: (row) => row.kpi.offers.toLocaleString() },
      { key: "picks", header: "픽업", align: "right", render: (row) => row.kpi.picks.toLocaleString() },
      { key: "share", header: "팀 비중", align: "right", render: (row) => `${row.kpi.teamShare.toFixed(1)}%` },
    ]} /></RddaPanel></>
    })()}
    <MonthlyReports report={report} snapshots={snapshots} />
  </div>
}
