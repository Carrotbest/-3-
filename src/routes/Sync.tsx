import { useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, Database, ListChecks } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { StatCard } from "@/components/dashboard/StatCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { Reveal } from "@/components/motion/Reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { fmtDateFull, fmtNum, fmtTime, toDate } from "@/data/format"
import { type ReconcileCheck } from "@/data/reconcile"
import { type DataMeta } from "@/data/sample"
import { useAppStore } from "@/store/useAppStore"
import { hoverLift } from "@/lib/motion"

const SPARK = [1, 1, 2, 2, 3, 4, 4]

function dateTime(value: unknown): string {
  return toDate(value) ? `${fmtDateFull(value)} ${fmtTime(value)}` : "—"
}

function snapshot(meta: DataMeta) {
  const latest = meta.history.find((item) => item.passed)
  return {
    appliedAt: meta.appliedAt ?? latest?.appliedAt ?? null,
    appliedBy: meta.appliedBy ?? latest?.appliedBy ?? null,
    count: latest?.count ?? meta.checks[0]?.applied ?? null,
  }
}

function elapsedDays(value: unknown): number | null {
  const date = toDate(value)
  if (!date) return null
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

export function Sync() {
  const meta = useAppStore((state) => state.meta)
  const sensitiveUnlocked = useAppStore((state) => state.sensitiveUnlocked)
  const [rollbackMessage, setRollbackMessage] = useState("")
  const current = useMemo(() => snapshot(meta), [meta])
  const days = elapsedDays(current.appliedAt)
  const passedCount = meta.checks.filter((item) => item.ok).length
  const failedChecks = meta.checks.filter((item) => !item.ok)
  const isDemo = meta.mode === "demo"

  const checkColumns: DataTableColumn<ReconcileCheck>[] = [
    { id: "name", header: "확인 방법", accessor: (row) => row.name },
    { id: "excel", header: "엑셀 합", accessor: (row) => row.excel ?? -1, cell: (row) => row.excel === null ? "— (생략)" : fmtNum(row.excel), className: "text-right", headerClassName: "text-right" },
    { id: "applied", header: "반영 값", accessor: (row) => row.applied, cell: (row) => fmtNum(row.applied), className: "text-right", headerClassName: "text-right" },
    { id: "diff", header: "차이", accessor: (row) => row.diff, cell: (row) => row.excel === null ? "—" : fmtNum(row.diff), className: "text-right", headerClassName: "text-right" },
    { id: "ok", header: "판정", accessor: (row) => row.ok ? 1 : 0, cell: (row) => <StatusBadge status={row.ok ? "완료" : "Failed"} /> },
    { id: "note", header: "비고", accessor: (row) => row.note },
  ]
  const requestRollback = () => {
    if (window.confirm("이전 통과 건으로 되돌리기를 요청하시겠습니까?")) setRollbackMessage("되돌리기는 관리자 승인 후 동작합니다.")
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader title="데이터 상태" subtitle="현재 데이터 출처, 대조 결과와 브라우저 캐시 상태를 보여줍니다." />

      <Reveal>
      <div className={`rounded-[var(--radius)] border p-5 ${hoverLift} ${isDemo ? "border-[var(--border)] bg-[var(--muted)]" : meta.passed ? "border-[var(--chart-2)] bg-[color-mix(in_oklab,var(--chart-2)_10%,var(--background))]" : "border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_10%,var(--background))]"}`} aria-label="현재 데이터 상태">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDemo ? "secondary" : meta.passed ? "outline" : "destructive"}>{isDemo ? "예시 데이터" : meta.passed ? "통과" : "반영 안 됨"}</Badge>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{isDemo ? `예시 데이터 ${fmtNum(current.count, "건")}` : meta.passed ? `합계 확인을 통과했습니다 · ${fmtNum(current.count, "건")}` : "합계가 맞지 않아 반영하지 않았습니다"}</h2>
        </div>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{isDemo ? "화면 구성 확인을 위한 값이며 실제 TDS 반영 결과가 아닙니다." : `반영 시각 ${dateTime(current.appliedAt)} · 반영자 ${current.appliedBy ?? "—"}`}</p>
        {!isDemo && !meta.passed ? (
          <div className="mt-3 space-y-1 text-sm text-[var(--foreground)]">
            <p>{failedChecks.map((item) => `${item.name} ${fmtNum(Math.abs(item.diff), "건")} 차이`).join(" · ")}</p>
            <p>이전 반영 값({dateTime(current.appliedAt)})을 그대로 보여주고 있습니다.</p>
            <p className="font-semibold">원본 엑셀에서 해당 항목을 확인한 후 다시 열어 주세요.</p>
          </div>
        ) : null}
      </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CalendarClock aria-hidden="true" className="size-4" />} label="마지막 반영 시각" value={dateTime(current.appliedAt)} caption={current.appliedBy ? `${current.appliedBy} 반영` : "반영 기록 없음"} deltaPct={0} spark={SPARK} info="현재 화면 값이 반영된 시각입니다." revealDelay={0} />
        <StatCard icon={<ListChecks aria-hidden="true" className="size-4" />} label="확인 통과" value={passedCount} suffix="/5" caption={meta.passed ? "모든 항목 확인" : "불일치 확인 필요"} deltaPct={meta.passed ? 0 : -20} spark={SPARK} info="다섯 가지 합계 확인 결과입니다." tone={meta.passed ? "default" : "destructive"} revealDelay={75} />
        <StatCard icon={<Database aria-hidden="true" className="size-4" />} label="반영 건수" value={typeof current.count === "number" ? current.count : "—"} suffix="건" caption={meta.passed ? "현재 화면 기준" : "이전 통과 값 기준"} deltaPct={0} spark={SPARK} info="화면에서 조회 중인 개발 건수입니다." revealDelay={150} />
        <StatCard icon={<CheckCircle2 aria-hidden="true" className="size-4" />} label="경과일" value={days ?? "—"} suffix="일" caption={days !== null && days >= 7 ? "새 TDS 반영 필요" : "최근 반영 기준"} deltaPct={days !== null && days >= 7 ? -7 : 0} spark={SPARK} info="마지막 반영일부터 오늘까지의 일수입니다." tone={days !== null && days >= 7 ? "warning" : "default"} revealDelay={200} />
      </div>

      <SectionCard title="합계 확인 결과" subtitle={`${meta.checks.length}개 항목`} contentClassName="p-0">
        <DataTable columns={checkColumns} rows={meta.checks} getRowId={(row) => row.name} pageSize={5} emptyMessage="확인 결과가 없습니다." />
      </SectionCard>

      <SectionCard
        title="반영 이력"
        subtitle={`${meta.history.length}건`}
        actions={<Button type="button" variant="outline" disabled={!sensitiveUnlocked} title={sensitiveUnlocked ? "관리자 승인 후 되돌리기를 요청합니다." : "관리자 권한을 확인해야 사용할 수 있습니다."} onClick={requestRollback}>이전 통과 건으로 되돌리기</Button>}
      >
        {meta.history.length ? (
          <ol className="space-y-6" aria-label="반영 이력 타임라인">
            {meta.history.map((row, index) => (
              <li key={`${row.appliedAt}-${row.state}`}>
                <Reveal delay={index * 75}>
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-4">
                    <div className="relative flex justify-center" aria-hidden="true">
                      <span className={`relative z-10 mt-5 size-3 rounded-full ring-4 ring-[var(--card)] ${row.passed ? "bg-[var(--chart-2)]" : "bg-[var(--destructive)]"}`} />
                      {index < meta.history.length - 1 ? <span className="absolute bottom-[-1.5rem] top-7 w-px bg-[var(--border)]" /> : null}
                    </div>
                    <Card className={row.passed ? "" : "border-[var(--destructive)]"}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <time dateTime={row.appliedAt} className="text-sm font-semibold text-[var(--foreground)]">{dateTime(row.appliedAt)}</time>
                            <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]" title={row.fileName}>{row.fileName}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {row.passed ? <StatusBadge status="완료" /> : <Badge variant="destructive">확인 실패</Badge>}
                            <Badge variant="outline">{row.state}</Badge>
                          </div>
                        </div>
                        <dl className="mt-4 grid gap-3 rounded-[var(--radius)] bg-[var(--muted)] p-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-[var(--muted-foreground)]">반영자</dt>
                            <dd className="mt-1 font-medium text-[var(--foreground)]">{row.appliedBy || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[var(--muted-foreground)]">반영 건수</dt>
                            <dd className="mt-1 font-medium text-[var(--foreground)]">{row.count === null ? "반영 없음" : fmtNum(row.count, "건")}</dd>
                          </div>
                        </dl>
                        {!row.passed && row.reason ? (
                          <div className="mt-4 rounded-[var(--radius)] border border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))] p-3">
                            <p className="text-xs font-semibold text-[var(--destructive)]">반영하지 않은 이유</p>
                            <p className="mt-1 text-sm text-[var(--foreground)]">{row.reason}</p>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        ) : <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">반영 이력이 없습니다.</p>}
        <p aria-live="polite" className="mt-4 text-sm text-[var(--muted-foreground)]">{rollbackMessage}</p>
      </SectionCard>

      <SectionCard title="데이터 이상 항목" subtitle={meta.anomalies.length ? `${meta.anomalies.length}개 유형` : "확인 완료"}>
        {meta.anomalies.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {meta.anomalies.map((item, index) => (
              <Reveal key={item.type} delay={index * 75}>
              <Card className="h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3"><strong className="text-sm">{item.type}</strong><Badge variant={item.tone === "crit" ? "destructive" : "outline"}>{item.count}건</Badge></div>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">{item.samples.map((sample) => sample.styleNo).filter(Boolean).join(" · ") || "Style No. 예시 없음"}</p>
                </CardContent>
              </Card>
              </Reveal>
            ))}
          </div>
        ) : <Card><CardContent className="flex min-h-28 items-center justify-center text-sm text-[var(--muted-foreground)]">정리할 데이터가 없습니다.</CardContent></Card>}
        <p className="mt-4 text-xs text-[var(--muted-foreground)]">원본은 고치지 않습니다. 확인 후 원본 엑셀에서 직접 수정해 주세요.</p>
      </SectionCard>
    </section>
  )
}
