import type { RddaReportV2 } from "@/data/rdda-report"
import { RateBar } from "./RateBar"
import { KpiGrid, RddaPanel, RddaTable } from "./RddaTable"

export function SupplierTab({ report }: { report: RddaReportV2 }) {
  const suppliers = report.suppliers
  const total = suppliers.reduce((sum, row) => sum + row.count, 0)
  const best = [...suppliers].sort((a, b) => b.hitRate - a.hitRate)[0]
  return <div className="space-y-4">
    <KpiGrid items={[{ label: "분석 업체", value: { n: suppliers.length, locale: true } }, { label: "업체 등록 합계", value: { n: total, locale: true } }, { label: "팀 소싱 합계", value: { n: suppliers.reduce((sum, row) => sum + row.teamCount, 0), locale: true } }, { label: "최고 적중률", value: { n: best?.hitRate ?? 0, decimals: 1, suffix: "%" }, note: best?.name }]} />
    <RddaPanel title="업체 포트폴리오" subtitle="단가는 원본 데이터가 있을 때만 표시합니다."><RddaTable rows={suppliers} getKey={(row) => row.name} columns={[
      { key: "name", header: "업체", render: (row) => <strong>{row.name}</strong> }, { key: "count", header: "등록", align: "right", render: (row) => row.count.toLocaleString() }, { key: "hit", header: "적중률", render: (row) => <RateBar value={row.hitRate} /> }, { key: "price", header: "평균 단가", align: "right", render: (row) => row.avgPrice > 0 ? row.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—" }, { key: "team", header: "팀 등록", align: "right", render: (row) => row.teamCount.toLocaleString() }, { key: "construction", header: "주요 조직", render: (row) => row.topConstructions },
    ]} /></RddaPanel>
  </div>
}
