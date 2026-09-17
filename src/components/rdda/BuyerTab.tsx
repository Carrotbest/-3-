import type { RddaBuyerRow, RddaReportV2, RddaSegmentRow } from "@/data/rdda-report"
import { Badge, type RddaBadgeTone } from "./Badge"
import { MonthlyTrendChart } from "./MonthlyTrendChart"
import { RateBar } from "./RateBar"
import { ShareBar } from "./ShareBar"
import { KpiGrid, RddaPanel, RddaTable } from "./RddaTable"

function buyerDecision(row: RddaBuyerRow): { label: string; tone: RddaBadgeTone } {
  const gap = row.teamPickRate - row.pickRate
  if (row.limited) return { label: "기회 제한", tone: "limited" }
  if (gap >= 6 && row.teamShare < 20) return { label: "확대", tone: "grow" }
  if (gap >= 6) return { label: "유지 확대", tone: "grow" }
  if (gap <= -4) return { label: "재검토", tone: "review" }
  if (row.teamOffers < 20) return { label: "표본 부족", tone: "limited" }
  return { label: "유지", tone: "hold" }
}

const segmentColumns = [
  { key: "name", header: "구분", render: (row: RddaSegmentRow) => <strong>{row.name}</strong> },
  { key: "offers", header: "전체 제안", align: "right" as const, render: (row: RddaSegmentRow) => row.offers.toLocaleString() },
  { key: "pick", header: "전체 픽업률", render: (row: RddaSegmentRow) => <RateBar value={row.pickRate} /> },
  { key: "team", header: "팀 제안", align: "right" as const, render: (row: RddaSegmentRow) => row.teamOffers.toLocaleString() },
  { key: "share", header: "소싱 / 3팀", render: (row: RddaSegmentRow) => <ShareBar teamShare={row.teamShare} offers={row.offers} teamOffers={row.teamOffers} /> },
  { key: "teamPick", header: "팀 픽업률", render: (row: RddaSegmentRow) => <RateBar value={row.teamPickRate} /> },
]

export function BuyerTab({ report }: { report: RddaReportV2 }) {
  const s = report.summary
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "전체 제안", value: { n: s.offers, locale: true } }, { label: "전체 픽업", value: { n: s.picks, locale: true } }, { label: "제안 대비 픽업률", value: { n: s.pickRate, decimals: 1, suffix: "%" }, note: "주지표" }, { label: "3팀 픽업률", value: { n: s.teamPickRate, decimals: 1, suffix: "%" }, note: `팀 제안 ${s.teamOffers.toLocaleString()}건` }]} />
    <RddaPanel title="월별 제안과 픽업률" subtitle="막대: 3팀·소싱 제안 원단 수 / 선: 전체·3팀 픽업률"><MonthlyTrendChart months={report.months} /></RddaPanel>
    <RddaPanel title="바이어 성과" subtitle="제안 대비 픽업과 소싱 / 3팀 원단 비중을 함께 봅니다."><RddaTable rows={report.buyers} getKey={(row) => row.name} columns={[
      { key: "name", header: "바이어", render: (row) => <strong>{row.name}</strong> },
      { key: "offers", header: "전체 제안", align: "right", render: (row) => row.offers.toLocaleString() },
      { key: "pickRate", header: "전체 픽업률", render: (row) => <RateBar value={row.pickRate} /> },
      { key: "share", header: "소싱 / 3팀", render: (row) => <ShareBar teamShare={row.teamShare} offers={row.offers} teamOffers={row.teamOffers} /> },
      { key: "teamRate", header: "팀 픽업률", render: (row) => <RateBar value={row.teamPickRate} /> },
      { key: "decision", header: "판단", render: (row) => { const decision = buyerDecision(row); return <Badge tone={decision.tone}>{decision.label}</Badge> } },
    ]} /></RddaPanel>
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="브랜드"><RddaTable rows={report.brands} getKey={(row) => row.name} columns={segmentColumns} /></RddaPanel><RddaPanel title="Gender"><RddaTable rows={report.genders} getKey={(row) => row.name} columns={segmentColumns} /></RddaPanel></div>
  </div>
}
