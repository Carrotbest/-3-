import { useMemo, useState } from "react"
import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { RateBar } from "./RateBar"
import { KpiGrid, RddaPanel, RddaTable } from "./RddaTable"

export function RecommendTab({ report }: { report: RddaReportV2 }) {
  const names = Object.keys(report.recommend)
  const [selected, setSelected] = useState(names[0] ?? "")
  const data = report.recommend[selected] ?? report.recommend[names[0]]
  const maxMix = useMemo(() => Math.max(1, ...(data?.mix.map((row) => row.count) ?? [1])), [data])
  if (!data) return <RddaPanel title="원단 제안"><p className="p-6 text-sm text-[var(--muted-foreground)]">추천 데이터가 없습니다.</p></RddaPanel>
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-1.5 rounded-[11px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_72%,transparent)] p-1.5 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.35)] backdrop-blur" role="group" aria-label="바이어 선택">{names.map((name) => <button key={name} type="button" aria-pressed={selected === name} onClick={() => setSelected(name)} className={`rounded-[8px] border px-3.5 py-2 text-xs font-semibold outline-none transition-[background-color,color,box-shadow,transform] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected === name ? "border-white/80 bg-[var(--card)] text-[var(--foreground)] shadow-[0_7px_16px_-12px_rgba(15,23,42,0.45)]" : "border-transparent text-[var(--muted-foreground)] hover:-translate-y-0.5 hover:bg-white/45 hover:text-[var(--foreground)]"}`}>{name}</button>)}</div>
    <KpiGrid items={[{ label: "제안 후보", value: { n: data.candidates, locale: true } }, { label: "팀 픽업률", value: { n: data.teamPickRate, decimals: 1, suffix: "%" } }, { label: "전체 픽업률", value: { n: data.allPickRate, decimals: 1, suffix: "%" } }, { label: "팀 우위", value: { n: data.teamPickRate - data.allPickRate, decimals: 1, suffix: "%p" } }]} />
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="선호 조직 랭킹"><RddaTable rows={data.preferences} getKey={(row) => row.name} columns={[
      { key: "name", header: "조직", render: (row) => <strong>{row.name}</strong> }, { key: "offers", header: "제안", align: "right", render: (row) => row.offers.toLocaleString() }, { key: "picks", header: "픽업", align: "right", render: (row) => row.picks.toLocaleString() }, { key: "rate", header: "픽업률", render: (row) => <RateBar value={row.pickRate} /> },
    ]} /></RddaPanel><RddaPanel title="후보 구성"><MiniBar items={data.mix.map((row) => ({ label: row.name, value: row.count }))} max={maxMix} /></RddaPanel></div>
    <div className="grid gap-4 sm:grid-cols-2"><RddaPanel title="우선 조직"><div className="p-4"><strong>{data.top.name}</strong><p className="mt-2 text-sm text-[var(--muted-foreground)]">{data.top.picks} / {data.top.offers}건 · {data.top.pickRate.toFixed(1)}%</p></div></RddaPanel><RddaPanel title="후순위 조직"><div className="p-4"><strong>{data.avoid.name}</strong><p className="mt-2 text-sm text-[var(--muted-foreground)]">{data.avoid.picks} / {data.avoid.offers}건 · {data.avoid.pickRate.toFixed(1)}%</p></div></RddaPanel></div>
    <RddaPanel title="우선 제안 목록"><RddaTable rows={data.items} getKey={(row) => row.flNo} columns={[{ key: "fl", header: "FL NUMBER", render: (row) => <strong>{row.flNo}</strong> }, { key: "construction", header: "조직", render: (row) => row.construction }]} /></RddaPanel>
  </div>
}
