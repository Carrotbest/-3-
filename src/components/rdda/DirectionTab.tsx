import type { RddaFiberRow, RddaGapRow, RddaReportV2 } from "@/data/rdda-report"
import { Badge, type RddaBadgeTone } from "./Badge"
import { MiniBar } from "./MiniBar"
import { RateBar } from "./RateBar"
import { ShareBar } from "./ShareBar"
import { RddaPanel, RddaTable } from "./RddaTable"

function gapDecision(row: RddaGapRow): { label: string; tone: RddaBadgeTone } {
  if (row.gap >= 18 && row.teamCount < 150) return { label: "개발 확대", tone: "grow" }
  if (row.gap >= 8) return { label: "현 수준 유지", tone: "hold" }
  if (row.gap >= 0) return { label: "유지", tone: "hold" }
  return { label: "축소 검토", tone: "review" }
}
function fiberDecision(row: RddaFiberRow): { label: string; tone: RddaBadgeTone } {
  if (row.teamShare < 5 && row.offers >= 800) return { label: "대상 아님", tone: "hold" }
  if (row.gap === null) return { label: "표본 부족", tone: "limited" }
  if (row.gap >= 8) return { label: "강점 확대", tone: "grow" }
  if (row.gap >= 2) return { label: "유지", tone: "hold" }
  return { label: "평균", tone: "hold" }
}

export function DirectionTab({ report }: { report: RddaReportV2 }) {
  return <div className="space-y-4">
    <RddaPanel title="조직 격차"><RddaTable rows={report.gaps} getKey={(row) => row.construction} columns={[
      { key: "name", header: "조직", render: (row) => <strong>{row.construction}</strong> }, { key: "allCount", header: "전사", align: "right", render: (row) => row.allCount.toLocaleString() }, { key: "allHit", header: "전사 적중률", render: (row) => <RateBar value={row.allHitRate} /> }, { key: "teamCount", header: "팀", align: "right", render: (row) => row.teamCount.toLocaleString() }, { key: "teamHit", header: "팀 적중률", render: (row) => <RateBar value={row.teamHitRate} /> }, { key: "gap", header: "격차", align: "right", render: (row) => `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(1)}%p` }, { key: "decision", header: "판단", render: (row) => { const d = gapDecision(row); return <Badge tone={d.tone}>{d.label}</Badge> } },
    ]} /></RddaPanel>
    <RddaPanel title="혼용률"><RddaTable rows={report.fibers} getKey={(row) => row.name} columns={[
      { key: "name", header: "혼용률", render: (row) => <strong>{row.name}</strong> }, { key: "offers", header: "전체 제안", align: "right", render: (row) => row.offers.toLocaleString() }, { key: "pick", header: "전체 픽업률", render: (row) => <RateBar value={row.pickRate} /> }, { key: "team", header: "팀 제안", align: "right", render: (row) => row.teamOffers.toLocaleString() }, { key: "share", header: "소싱 / 3팀", render: (row) => <ShareBar teamShare={row.teamShare} offers={row.offers} teamOffers={row.teamOffers} /> }, { key: "gap", header: "격차", align: "right", render: (row) => row.gap === null ? "—" : `${row.gap > 0 ? "+" : ""}${row.gap.toFixed(1)}%p` }, { key: "decision", header: "판단", render: (row) => { const d = fiberDecision(row); return <Badge tone={d.tone}>{d.label}</Badge> } },
    ]} /></RddaPanel>
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="중량대"><MiniBar items={report.weights.map((row) => ({ label: row.band, value: row.offers, detail: `${row.offers.toLocaleString()}건 · ${row.pickRate.toFixed(1)}%` }))} /></RddaPanel><RddaPanel title="시즌"><RddaTable rows={report.seasons} getKey={(row) => row.name} columns={[{ key: "name", header: "시즌", render: (row) => <strong>{row.name}</strong> }, { key: "offers", header: "전체 제안", align: "right", render: (row) => row.offers.toLocaleString() }, { key: "pick", header: "전체 픽업률", render: (row) => <RateBar value={row.pickRate} /> }, { key: "team", header: "팀 제안", align: "right", render: (row) => row.teamOffers.toLocaleString() }]} /></RddaPanel></div>
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="상승 트렌드"><MiniBar items={report.trend.rising.map((row) => ({ label: row.construction, value: row.delta, detail: `+${row.delta}` }))} /></RddaPanel><RddaPanel title="하락 트렌드"><MiniBar items={report.trend.falling.map((row) => ({ label: row.construction, value: row.delta, detail: `${row.delta}` }))} /></RddaPanel></div>
  </div>
}
