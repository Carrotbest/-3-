import { useMemo, useState } from "react"
import { ClipboardList, PackageCheck, Percent } from "lucide-react"

import { AreaCard } from "@/components/charts/AreaCard"
import { BarCard } from "@/components/charts/BarCard"
import { DonutCard } from "@/components/charts/DonutCard"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { StatCard } from "@/components/dashboard/StatCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { Button } from "@/components/ui/button"
import { fmtNum } from "@/data/format"
import { ingestRdda } from "@/data/upload"
import {
  sampleRdda,
  type RddaBestItem,
  type RddaScope,
} from "@/data/sample"
import { useAppStore } from "@/store/useAppStore"

const FALLBACK_RDDA = sampleRdda()

const percentageChange = (current: number, previous: number): number =>
  previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : 0

export function Rdda() {
  const storedRdda = useAppStore((state) => state.rdda)
  const sensitiveUnlocked = useAppStore((state) => state.sensitiveUnlocked)
  const [scope, setScope] = useState<RddaScope>("all")
  const rdda = storedRdda ?? FALLBACK_RDDA
  const perspectives = rdda.perspectives ?? FALLBACK_RDDA.perspectives
  const perspective = perspectives[scope] ?? FALLBACK_RDDA.perspectives[scope]
  const snapshots = rdda.snapshots?.length ? rdda.snapshots : FALLBACK_RDDA.snapshots

  const summary = useMemo(() => {
    const latest = snapshots.at(-1)
    const previous = snapshots.at(-2)
    const isAll = scope === "all"
    return {
      meeting: perspective.meetingTotal,
      pickup: perspective.pickupTotal,
      rate: perspective.pickupRate,
      meetingDelta: isAll ? percentageChange(latest?.meeting ?? 0, previous?.meeting ?? 0) : 0,
      pickupDelta: isAll ? percentageChange(latest?.pickup ?? 0, previous?.pickup ?? 0) : 0,
      rateDelta: isAll ? percentageChange(latest?.rate ?? 0, previous?.rate ?? 0) : 0,
      meetingSpark: isAll ? snapshots.map((row) => row.meeting) : [perspective.meetingTotal],
      pickupSpark: isAll ? snapshots.map((row) => row.pickup) : [perspective.pickupTotal],
      rateSpark: isAll ? snapshots.map((row) => row.rate) : [perspective.pickupRate],
    }
  }, [perspective, scope, snapshots])

  const snapshotData = snapshots.map((row) => ({
    label: `${row.month}월`,
    meeting: row.meeting,
    pickup: row.pickup,
  }))
  const customerData = perspective.pickupByCustomer.slice(0, 8).map((row) => ({
    label: row.name,
    meeting: row.meetingCount,
    pickup: row.pickupCount,
  }))
  const columns: DataTableColumn<RddaBestItem>[] = [
    { id: "rank", header: "순위", accessor: (row) => row.rank, className: "text-center", headerClassName: "text-center" },
    { id: "flNo", header: "FL NUMBER", accessor: (row) => row.flNo },
    { id: "construction", header: "원단", accessor: (row) => row.construction, cell: (row) => row.construction || "—" },
    { id: "pickup", header: "Pickup", accessor: (row) => row.pickupCount, cell: (row) => fmtNum(row.pickupCount, "건"), className: "text-right", headerClassName: "text-right" },
    { id: "meeting", header: "Meeting", accessor: (row) => row.meetingCount, cell: (row) => fmtNum(row.meetingCount, "건"), className: "text-right", headerClassName: "text-right" },
  ]
  if (sensitiveUnlocked) {
    columns.push({
      id: "vendor",
      header: "협력사",
      accessor: (row) => row.vendor ?? "",
      cell: (row) => row.vendor ?? "—",
    })
  }

  const latestLabel = rdda.latestMonth ? `26년 ${rdda.latestMonth}월 YTD` : "현재 스냅샷"
  const scopeLabel = scope === "all" ? "전체" : "3팀"

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="RDDA REPORT"
        subtitle="Meeting·Pickup 최신 누적 실적과 월별 스냅샷 추이를 확인합니다."
        actions={(
          <div role="group" aria-label="RDDA 집계 관점 및 파일 업로드" className="flex flex-wrap items-center justify-end gap-2">
            <DataUpload kind="rdda-workbook" label="RDDA 파일 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestRdda([files[0]]) }} />
            <Button type="button" size="sm" variant={scope === "all" ? "default" : "outline"} aria-pressed={scope === "all"} onClick={() => setScope("all")}>전체</Button>
            <Button type="button" size="sm" variant={scope === "team3" ? "default" : "outline"} aria-pressed={scope === "team3"} onClick={() => setScope("team3")}>3팀</Button>
          </div>
        )}
      />


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={<ClipboardList aria-hidden="true" className="size-4" />}
          label={`${scopeLabel} Meeting`}
          value={summary.meeting}
          caption={`${latestLabel} · Hansoll 제외`}
          deltaPct={summary.meetingDelta}
          spark={summary.meetingSpark.length ? summary.meetingSpark : [0]}
          info="최신 월 파일 Meeting 시트의 유효 행수입니다."
          revealDelay={0}
        />
        <StatCard
          icon={<PackageCheck aria-hidden="true" className="size-4" />}
          label={`${scopeLabel} Pickup`}
          value={summary.pickup}
          caption={`${latestLabel} · Hansoll 제외`}
          deltaPct={summary.pickupDelta}
          spark={summary.pickupSpark.length ? summary.pickupSpark : [0]}
          info="최신 월 파일 Pickup 시트의 유효 행수입니다."
          revealDelay={75}
        />
        <StatCard
          icon={<Percent aria-hidden="true" className="size-4" />}
          label={`${scopeLabel} Pickup율`}
          value={summary.rate}
          decimals={1}
          suffix="%"
          caption="Pickup ÷ Meeting"
          deltaPct={summary.rateDelta}
          spark={summary.rateSpark.length ? summary.rateSpark : [0]}
          info="Pickup 건수를 Meeting 건수로 나눈 비율입니다."
          revealDelay={150}
        />
      </div>

      <AreaCard
        title="월별 YTD 스냅샷 추이"
        subtitle="월별 파일은 합산하지 않고 각 파일 총계만 비교합니다."
        data={snapshotData}
        series={[{ dataKey: "meeting", label: "Meeting" }, { dataKey: "pickup", label: "Pickup" }]}
        revealDelay={0}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BarCard
          title={`${scopeLabel} 고객별 Pickup`}
          subtitle="Pickup 건수 내림차순 · CustomerName 기준"
          data={customerData}
          series={[{ dataKey: "meeting", label: "Meeting" }, { dataKey: "pickup", label: "Pickup" }]}
          horizontal
          revealDelay={75}
        />
        <DonutCard
          title={`${scopeLabel} 원산지 분포`}
          subtitle="Meeting 시트 CountryOfOrigin 기준"
          data={perspective.origin}
          revealDelay={125}
        />
      </div>

      <SectionCard title={`${scopeLabel} Best Items`} subtitle="Pickup 2건 이상 · Meeting 3건 이상 · Pickup 동률 동일 순위" contentClassName="p-0" revealDelay={175}>
        <DataTable columns={columns} rows={perspective.bestItems} getRowId={(row) => row.flNo} pageSize={10} emptyMessage="조건을 충족한 Best Items가 없습니다." />
        <p className="px-4 pb-4 text-xs text-[var(--muted-foreground)]">
          협력사 컬럼은 합계 대조를 통과한 팀 내부 화면에서만 생성합니다.
        </p>
      </SectionCard>

      <p className="text-xs text-[var(--muted-foreground)]">
        {rdda.source === "folder"
          ? "전략자료/RDDA 픽업율의 최신 Meeting,Pickup 파일 하나를 상세 집계했습니다. 월별 파일은 추이 계산에만 사용하며 원본 행은 상태에 저장하지 않습니다."
          : "Meeting,Pickup 파일이 연결되지 않아 공개 sample 집계를 표시합니다."}
      </p>
    </section>
  )
}
