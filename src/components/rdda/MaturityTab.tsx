import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { RateBar } from "./RateBar"
import { KpiGrid, RddaPanel, RddaTable } from "./RddaTable"

export function MaturityTab({ report }: { report: RddaReportV2 }) {
  const bestPrice = [...report.price].sort((a, b) => b.pickRate - a.pickRate)[0]
  const bestAge = [...report.maturity].sort((a, b) => b.hitRate - a.hitRate)[0]
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "가격 구간", value: { n: report.price.length } }, { label: "가격 데이터", value: { n: report.price.reduce((sum, row) => sum + row.count, 0), locale: true } }, { label: "최고 픽업 구간", value: bestPrice?.band ?? "—", note: `${(bestPrice?.pickRate ?? 0).toFixed(1)}%` }, { label: "최고 성숙 구간", value: bestAge?.band ?? "—", note: `${(bestAge?.hitRate ?? 0).toFixed(1)}%` }]} />
    <RddaPanel title="가격대"><RddaTable rows={report.price} getKey={(row) => row.band} columns={[{ key: "band", header: "가격대", render: (row) => <strong>{row.band}</strong> }, { key: "count", header: "건수", align: "right", render: (row) => row.count.toLocaleString() }, { key: "pick", header: "픽업률", render: (row) => <RateBar value={row.pickRate} /> }, { key: "order", header: "오더율", render: (row) => <RateBar value={row.orderRate} /> }, { key: "note", header: "해석", render: (row) => row.note }]} /></RddaPanel>
    <RddaPanel title="등록 후 경과 기간" subtitle="등록 연차별 적중률"><MiniBar items={report.maturity.map((row) => ({ label: row.band, value: row.hitRate, detail: `${row.hitRate.toFixed(1)}% · ${row.count.toLocaleString()}건` }))} max={30} /></RddaPanel>
  </div>
}
