import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { KpiGrid, RddaPanel } from "./RddaTable"

export function TeamTab({ report }: { report: RddaReportV2 }) {
  const latest = report.teamYears.at(-1)
  const previous = report.teamYears.at(-2)
  const total = report.teamYears.reduce((sum, row) => sum + row.registered, 0)
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "팀 FL 누적", value: report.meta.teamTotal.toLocaleString() }, { label: "연도 집계 합계", value: total.toLocaleString() }, { label: "최근 연도 등록", value: (latest?.registered ?? 0).toLocaleString(), note: latest?.year }, { label: "미노출 개선", value: `${((previous?.neverShownRate ?? 0) - (latest?.neverShownRate ?? 0)).toFixed(1)}%p`, note: "전년 대비 감소" }]} />
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="연도별 등록"><MiniBar items={report.teamYears.map((row) => ({ label: row.year, value: row.registered }))} /></RddaPanel><RddaPanel title="미노출 비율"><MiniBar items={report.teamYears.map((row) => ({ label: row.year, value: row.neverShownRate, detail: `${row.neverShownRate.toFixed(1)}%` }))} max={100} /></RddaPanel></div>
  </div>
}
