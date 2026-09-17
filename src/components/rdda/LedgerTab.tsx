import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { RateBar } from "./RateBar"
import { KpiGrid, RddaPanel, RddaTable } from "./RddaTable"

export function LedgerTab({ report }: { report: RddaReportV2 }) {
  const lead = report.ledger.find((row) => row.lead) ?? report.ledger[0]
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "전사 FL 누적", value: report.meta.ledgerTotal.toLocaleString() }, { label: "팀 FL 누적", value: report.meta.teamTotal.toLocaleString() }, { label: "팀 누적 점유", value: `${(report.meta.teamTotal / Math.max(1, report.meta.ledgerTotal) * 100).toFixed(1)}%` }, { label: "팀 적중률", value: `${(lead?.hitRate ?? 0).toFixed(1)}%` }]} />
    <RddaPanel title="전사 비교"><RddaTable rows={report.ledger} getKey={(row) => row.scope} columns={[
      { key: "scope", header: "범위", render: (row) => <strong className={row.lead ? "text-[var(--primary)]" : ""}>{row.scope}</strong> }, { key: "count", header: "등록", align: "right", render: (row) => row.count.toLocaleString() }, { key: "shown", header: "노출률", render: (row) => <RateBar value={row.shownRate} /> }, { key: "avg", header: "평균 노출", align: "right", render: (row) => row.avgShown.toFixed(1) }, { key: "hit", header: "적중률", render: (row) => <RateBar value={row.hitRate} /> }, { key: "shownHit", header: "노출 후 적중", render: (row) => <RateBar value={row.shownHitRate} /> }, { key: "order", header: "오더율", render: (row) => <RateBar value={row.orderRate} /> },
    ]} /></RddaPanel>
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="성과 지수" subtitle="전사 평균을 100으로 환산"><MiniBar items={(lead ? [{ label: "노출률", value: lead.shownRate / report.ledger[0].shownRate * 100 }, { label: "적중률", value: lead.hitRate / report.ledger[0].hitRate * 100 }, { label: "오더율", value: lead.orderRate / report.ledger[0].orderRate * 100 }] : []).map((row) => ({ ...row, detail: `${row.value.toFixed(0)}` }))} max={150} /></RddaPanel><RddaPanel title="원산지"><RddaTable rows={report.origins} getKey={(row) => row.name} columns={[{ key: "name", header: "원산지", render: (row) => <strong>{row.name}</strong> }, { key: "count", header: "전사 등록", align: "right", render: (row) => row.count.toLocaleString() }, { key: "hit", header: "적중률", render: (row) => <RateBar value={row.hitRate} /> }, { key: "team", header: "팀 등록", align: "right", render: (row) => row.teamCount.toLocaleString() }, { key: "note", header: "메모", render: (row) => row.note }]} /></RddaPanel></div>
  </div>
}
