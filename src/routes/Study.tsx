import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { BarCard } from "@/components/charts/BarCard"
import { MaterialDeckSection, MaterialSearchSection } from "@/components/cards/MaterialDeck"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { DataUpload } from "@/components/upload/DataUpload"
import { type DataTableColumn } from "@/components/data-table/DataTable"
import { RecordListDialog } from "@/components/data-table/RecordListDialog"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { materialsOf, studyMaterials } from "@/data/derive"
import { fmtDate, fmtDateFull } from "@/data/format"
import { type StudyRecord } from "@/data/schema"
import { useAppStore } from "@/store/useAppStore"
import { ingestStudyWorkbook } from "@/data/upload"
import { hoverLift } from "@/lib/motion"

const RECENT_WEEK_COUNT = 6

const studyRowId = (row: StudyRecord) => `${row.owner}-${row.week}-${row.topic}`

function StudyDetailDialog({ row, onOpenChange }: { row: StudyRecord | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {row ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.state} /><Badge variant="outline">{row.week}주차</Badge></div>
              <DialogTitle className="pt-2">{row.topic}</DialogTitle>
              <DialogDescription>{row.owner} · 마감 {fmtDateFull(row.dueDate)}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                {[["담당자", row.owner], ["분류", row.category], ["주차", `${row.week}주차${row.weekLabel ? ` · ${row.weekLabel}` : ""}`], ["상태", row.state], ["마감일", fmtDateFull(row.dueDate)], ["미진행 사유", row.reason?.trim() || "—"]].map(([label, value]) => (
                  <div key={label} className="grid gap-1 border-b border-[var(--border)] p-4 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</dt>
                    <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </DialogBody>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function Study() {
  const study = useAppStore((state) => state.study)
  const materialsManual = useAppStore((state) => state.materialsManual)
  const materialItems = useMemo(() => materialsOf("STUDY", studyMaterials(study), materialsManual), [materialsManual, study])
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<StudyRecord | null>(null)

  const weeks = useMemo(
    () => [...new Set(study.map((row) => row.week))].sort((a, b) => a - b).slice(-RECENT_WEEK_COUNT),
    [study],
  )
  const owners = useMemo(() => [...new Set(study.map((row) => row.owner).filter(Boolean))], [study])
  const currentWeek = weeks.at(-1)
  const currentRows = study.filter((row) => row.week === currentWeek)
  const missingCount = owners.filter((owner) => !currentRows.some((row) => row.owner === owner && row.state === "완료")).length
  const categories = [...new Set(study.map((row) => row.category))]
  const categoryStats = categories.map((label) => ({ label, count: study.filter((row) => row.category === label).length }))
  const stalled = study.filter((row) => row.state === "미진행")
  const ownerRows = study.filter((row) => row.owner === selectedOwner).sort((a, b) => b.week - a.week)
  const categoryRows = study.filter((row) => row.category === selectedCategory).sort((a, b) => b.week - a.week)

  const ownerColumns: DataTableColumn<StudyRecord>[] = [
    { id: "week", header: "주차", accessor: (row) => row.week, cell: (row) => `${row.week}주차` },
    { id: "topic", header: "주제", accessor: (row) => row.topic },
    { id: "category", header: "분류", accessor: (row) => row.category },
    { id: "state", header: "상태", accessor: (row) => row.state, cell: (row) => <StatusBadge status={row.state} /> },
    { id: "dueDate", header: "마감", accessor: (row) => row.dueDate, cell: (row) => fmtDate(row.dueDate) },
  ]

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader title="TECHNICAL REFERENCES" subtitle="주차별 학습 과제와 팀원별 진행 상황을 확인합니다." actions={<DataUpload kind="study-workbook" label="현황 파일 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestStudyWorkbook(files[0]) }} />} />

      <MaterialDeckSection kind="STUDY" title="STUDY 자료 덱" description="섬유 교육자료 중 최신 6건입니다." emptyMessage="SETTING에서 STUDY 엑셀을 업로드하면 교육 과제가 카드로 표시됩니다." items={materialItems} allowAdd={false} />

      <Tabs defaultValue="progress" className="min-w-0">
        <TabsList aria-label="STUDY 보기">
          <TabsTrigger value="progress">진행 현황</TabsTrigger>
          <TabsTrigger value="library">자료 라이브러리</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="mt-6 space-y-6">
          <Reveal>
          <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4" role="status">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--chart-3)]" />
            <div>
              <p className="font-semibold text-[var(--foreground)]">이번 주 목요일 마감</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{currentWeek ? `${currentWeek}주차 기준 ` : ""}미제출 <NumberTicker value={missingCount} suffix="명" />입니다.</p>
            </div>
          </div>
          </Reveal>

          <SectionCard title="주차별 제출 현황" subtitle="팀원 이름을 선택하면 개인별 상세를 확인할 수 있습니다." contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse">
                <caption className="sr-only">팀원별 주차 제출 현황</caption>
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th scope="col" className="w-32 border-b border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--muted-foreground)]">팀원</th>
                    {weeks.map((week) => {
                      const weekRows = study.filter((row) => row.week === week)
                      const weekLabel = weekRows.find((row) => row.weekLabel?.trim())?.weekLabel
                      const dueDate = weekRows[0]?.dueDate
                      const isCurrent = week === currentWeek
                      return (
                        <th key={week} scope="col" className={`min-w-56 border-b border-l p-4 text-left ${isCurrent ? "border-[var(--chart-1)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--foreground)]">W{week}</span>
                            {isCurrent ? <Badge variant="outline" className="border-[var(--chart-1)] text-[var(--foreground)]">이번 주</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs font-normal text-[var(--muted-foreground)]">
                            {[weekLabel, dueDate ? `${fmtDate(dueDate)} 목요일 마감` : "마감일 없음"].filter(Boolean).join(" · ")}
                          </p>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {owners.map((owner) => (
                    <tr key={owner} className="border-b border-[var(--border)] last:border-b-0">
                      <th scope="row" className="p-3 text-left align-top">
                        <button type="button" onClick={() => setSelectedOwner(owner)} className="w-full rounded-[var(--radius)] p-2 text-left text-sm font-semibold text-[var(--foreground)] outline-none hover:bg-[var(--accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                          {owner}
                          <span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">상세 보기</span>
                        </button>
                      </th>
                      {weeks.map((week) => {
                        const row = study.find((item) => item.week === week && item.owner === owner)
                        const isCurrent = week === currentWeek
                        return (
                          <td key={week} className={`border-l p-3 align-top ${isCurrent ? "border-[var(--chart-1)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
                            {row ? (
                              <button type="button" aria-haspopup="dialog" onClick={() => setSelectedRow(row)} className={`h-full min-h-24 w-full rounded-[var(--radius)] border p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${hoverLift} ${row.state === "미진행" ? "border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))]" : "border-[var(--border)] bg-[var(--card)]"}`}>
                                <StatusBadge status={row.state} />
                                <p className="mt-2 line-clamp-2 break-words text-sm font-medium text-[var(--foreground)]" title={row.topic}>{row.topic}</p>
                                <p className="mt-2 text-xs text-[var(--muted-foreground)]">마감 {fmtDate(row.dueDate)}</p>
                              </button>
                            ) : (
                              <div className="min-h-24 rounded-[var(--radius)] border border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))] p-3">
                                <Badge variant="destructive">미제출</Badge>
                                <p className="mt-2 text-sm font-medium text-[var(--destructive)]">등록된 과제가 없습니다.</p>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <BarCard title="분류별 누적" subtitle="막대를 클릭하면 분류별 과제 목록을 확인합니다." data={categoryStats} series={[{ dataKey: "count", label: "과제" }]} revealDelay={0} onItemClick={setSelectedCategory} />
            <SectionCard title="미진행 목록" subtitle={<NumberTicker value={stalled.length} suffix="건" />} revealDelay={75}>
              {stalled.length ? (
                <div className="divide-y divide-[var(--border)]">
                  {stalled.map((row) => (
                    <button type="button" aria-haspopup="dialog" onClick={() => setSelectedRow(row)} key={studyRowId(row)} className={`flex w-full items-start justify-between gap-4 rounded-[var(--radius)] px-2 py-3 text-left outline-none first:pt-0 last:pb-0 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${hoverLift}`}>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-[var(--foreground)]">{row.topic}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.owner} · {row.week}주차 · {row.reason?.trim() || "사유 미기재"}</p>
                      </div>
                      <StatusBadge status={row.state} />
                    </button>
                  ))}
                </div>
              ) : <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">미진행 과제가 없습니다.</p>}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="library" className="mt-6">
          <MaterialSearchSection kind="STUDY" emptyMessage="SETTING에서 STUDY 엑셀을 업로드하면 교육 과제가 카드로 표시됩니다." items={materialItems} allowAdd={false} />
        </TabsContent>
      </Tabs>

      <RecordListDialog open={Boolean(selectedOwner)} title={`${selectedOwner ?? "팀원"} 과제 목록`} description={`전체 ${ownerRows.length.toLocaleString("ko-KR")}건 · 행을 선택하면 상세 내용을 확인합니다.`} rows={ownerRows} columns={ownerColumns} getRowId={studyRowId} onOpenChange={(open) => { if (!open) setSelectedOwner(null) }} onRowClick={(row) => { setSelectedOwner(null); setSelectedRow(row) }} emptyMessage="과제가 없습니다." />
      <RecordListDialog open={Boolean(selectedCategory)} title={`${selectedCategory ?? "분류"} 과제 목록`} description={`전체 ${categoryRows.length.toLocaleString("ko-KR")}건 · 행을 선택하면 상세 내용을 확인합니다.`} rows={categoryRows} columns={ownerColumns} getRowId={studyRowId} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }} onRowClick={(row) => { setSelectedCategory(null); setSelectedRow(row) }} emptyMessage="과제가 없습니다." />
      <StudyDetailDialog row={selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null) }} />
    </section>
  )
}
