import type { RddaReportV2 } from "@/data/rdda-report"
import { MiniBar } from "./MiniBar"
import { KpiGrid, RddaPanel } from "./RddaTable"

export function TeamTab({ report }: { report: RddaReportV2 }) {
  const latest = report.teamYears.at(-1)
  const previous = report.teamYears.at(-2)
  const total = report.teamYears.reduce((sum, row) => sum + row.registered, 0)
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "팀 FL 누적", value: { n: report.meta.teamTotal, locale: true } }, { label: "연도 집계 합계", value: { n: total, locale: true } }, { label: "최근 연도 등록", value: { n: latest?.registered ?? 0, locale: true }, note: latest?.year }, { label: "미노출 개선", value: { n: (previous?.neverShownRate ?? 0) - (latest?.neverShownRate ?? 0), decimals: 1, suffix: "%p" }, note: "전년 대비 감소" }]} />
    <div className="grid gap-4 xl:grid-cols-2"><RddaPanel title="연도별 등록"><MiniBar items={report.teamYears.map((row) => ({ label: row.year, value: row.registered }))} /></RddaPanel><RddaPanel title="미노출 비율"><MiniBar items={report.teamYears.map((row) => ({ label: row.year, value: row.neverShownRate, detail: `${row.neverShownRate.toFixed(1)}%` }))} max={100} /></RddaPanel></div>
  </div>
}
