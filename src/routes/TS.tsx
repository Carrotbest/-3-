import { useEffect, useMemo, useState, type FormEvent } from "react"
import { CheckCircle2, ChevronUp, ClipboardList, Download, ExternalLink, LoaderCircle, Plus } from "lucide-react"
import * as XLSX from "xlsx"

import { MaterialDeckSection, MaterialSearchSection } from "@/components/cards/MaterialDeck"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { StatCard } from "@/components/dashboard/StatCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { Reveal } from "@/components/motion/Reveal"
import { DataUpload } from "@/components/upload/DataUpload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { materialsOf, tsMaterials } from "@/data/derive"
import { fmtDate } from "@/data/format"
import { httpsMaterialLink, MEMBERS } from "@/data/schema"
import { type TsRecord, type TsState } from "@/data/sample"
import { ingestTs } from "@/data/upload"
import { loadTsRecords, saveTsRecords, useAppStore } from "@/store/useAppStore"

const ALL = "전체"
const TS_STATES: TsState[] = ["접수", "처리중", "완료"]

interface FormValues {
  receivedAt: string
  subject: string
  from: string
  advisor: string
  relatedDepartment: string
  attn: string
  productionSite: string
  inquiry: string
  analysis: string
  causes: string
  action: string
  result: string
  state: TsState
  orderVolume: string
  attachment: string
}

type ActionNotice = { tone: "success" | "error"; message: string }
type FormErrorKey = "receivedAt" | "subject" | "from" | "advisor" | "attachment"
type FormErrors = Partial<Record<FormErrorKey, string>>

function localDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

const initialForm = (): FormValues => ({
  receivedAt: localDate(),
  subject: "",
  from: "",
  advisor: MEMBERS[0].name,
  relatedDepartment: "",
  attn: "",
  productionSite: "",
  inquiry: "",
  analysis: "",
  causes: "",
  action: "",
  result: "",
  state: "접수",
  orderVolume: "",
  attachment: "",
})

function nextTsId(rows: readonly TsRecord[]): string {
  const max = rows.reduce((value, row) => Math.max(value, Number(row.id.match(/(\d+)$/)?.[1] ?? 0)), 0)
  return `TS26-${String(max + 1).padStart(3, "0")}`
}

function exportTechnicalServices(rows: readonly TsRecord[]): string {
  const exportRows = rows.map((row) => ({
    "# T/S": row.id,
    Date: row.receivedAt,
    From: row.from,
    유관부서: row.relatedDepartment,
    Attn: row.attn,
    Advisor: row.advisor,
    Subject: row.subject,
    Inquiry: row.inquiry,
    Analysis: row.analysis,
    Causes: row.causes,
    Action: row.action,
    Result: row.result,
    생산처: row.productionSite,
    "Order Volume": row.orderVolume,
    상태: row.state,
    첨부: row.attachment ?? "",
  }))
  const worksheet = XLSX.utils.json_to_sheet(exportRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "TS")
  const fileName = `Technical_Services_export_${localDate().replace(/-/g, "")}.xlsx`
  XLSX.writeFile(workbook, fileName, { compression: true })
  return fileName
}

const textareaClassName = "flex min-h-28 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"

function DetailRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 border-b border-[var(--border)] p-4 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</dt>
          <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

function TsDetailSheet({ record, onOpenChange }: { record: TsRecord | null; onOpenChange: (open: boolean) => void }) {
  const attachment = httpsMaterialLink(record?.attachment)
  return (
    <Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-2xl">
        {record ? (
          <>
            <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={record.state} /><span className="text-xs font-medium text-[var(--muted-foreground)]">{record.id}</span></div>
              <SheetTitle className="pt-2 text-[var(--foreground)]">{record.subject}</SheetTitle>
              <SheetDescription>접수일 {fmtDate(record.receivedAt)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 p-6">
              <section aria-labelledby="ts-detail-people">
                <h3 id="ts-detail-people" className="mb-3 text-sm font-semibold text-[var(--foreground)]">의뢰 주체</h3>
                <DetailRows rows={[["요청자 From", record.from], ["유관부서", record.relatedDepartment], ["수신자 Attn", record.attn], ["담당 Advisor", record.advisor]]} />
              </section>
              <section aria-labelledby="ts-detail-workflow">
                <h3 id="ts-detail-workflow" className="mb-3 text-sm font-semibold text-[var(--foreground)]">Trouble shooting 내용</h3>
                <DetailRows rows={[["의뢰 내용", record.inquiry], ["현황 분석", record.analysis], ["원인", record.causes], ["해결 방안", record.action], ["결과", record.result]]} />
              </section>
              <section aria-labelledby="ts-detail-etc">
                <h3 id="ts-detail-etc" className="mb-3 text-sm font-semibold text-[var(--foreground)]">상태·기타</h3>
                <DetailRows rows={[["상태", record.state], ["생산처", record.productionSite], ["발주량", record.orderVolume]]} />
              </section>
              {attachment ? <Button asChild className="w-full"><a href={attachment} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export function TS() {
  const rows = useAppStore((state) => state.ts)
  const materialsManual = useAppStore((state) => state.materialsManual)
  const materialItems = useMemo(() => materialsOf("TS", tsMaterials(rows), materialsManual), [materialsManual, rows])
  const [activeState, setActiveState] = useState(ALL)
  const [search, setSearch] = useState("")
  const [selectedRow, setSelectedRow] = useState<TsRecord | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormValues>(initialForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [exporting, setExporting] = useState(false)
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)

  useEffect(() => {
    const stored = loadTsRecords()
    if (stored) saveTsRecords(stored)
  }, [])

  const counts = useMemo(() => ({
    received: rows.filter((row) => row.state === "접수").length,
    processing: rows.filter((row) => row.state === "처리중").length,
    done: rows.filter((row) => row.state === "완료").length,
  }), [rows])
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    return rows.filter((row) => {
      if (activeState !== ALL && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
  }, [activeState, rows, search])
  const steps: { state: TsState; count: number; caption: string }[] = [
    { state: "접수", count: counts.received, caption: "새 요청 확인" },
    { state: "처리중", count: counts.processing, caption: "분석·해결 진행" },
    { state: "완료", count: counts.done, caption: "결과 정리 완료" },
  ]

  const columns: DataTableColumn<TsRecord>[] = [
    { id: "id", header: "#T/S", accessor: (row) => row.id },
    { id: "receivedAt", header: "접수일", accessor: (row) => row.receivedAt, cell: (row) => fmtDate(row.receivedAt) },
    { id: "subject", header: "Subject", accessor: (row) => row.subject },
    { id: "from", header: "요청자", accessor: (row) => row.from },
    { id: "advisor", header: "담당", accessor: (row) => row.advisor },
    { id: "state", header: "상태", accessor: (row) => row.state, cell: (row) => <StatusBadge status={row.state} /> },
    { id: "orderVolume", header: "발주량", accessor: (row) => row.orderVolume, cell: (row) => row.orderVolume || "—" },
  ]

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === "receivedAt" || key === "subject" || key === "from" || key === "advisor" || key === "attachment") {
      setFormErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  const exportRows = () => {
    setExporting(true)
    setActionNotice(null)
    try {
      const fileName = exportTechnicalServices(rows)
      setActionNotice({ tone: "success", message: `${fileName} 새 파일 다운로드를 시작했습니다.` })
    } catch (error) {
      setActionNotice({ tone: "error", message: error instanceof Error ? error.message : "TS 엑셀을 내보내지 못했습니다." })
    } finally {
      setExporting(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors: FormErrors = {}
    if (!form.receivedAt.trim()) errors.receivedAt = "접수일을 입력해 주세요."
    if (!form.subject.trim()) errors.subject = "Subject 건명을 입력해 주세요."
    if (!form.from.trim()) errors.from = "요청자를 입력해 주세요."
    if (!form.advisor.trim()) errors.advisor = "담당자를 선택해 주세요."
    const attachment = httpsMaterialLink(form.attachment)
    if (form.attachment.trim() && !attachment) errors.attachment = "https://로 시작하는 SharePoint 공유 링크를 입력해 주세요."
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const newRow: TsRecord = {
      id: nextTsId(rows),
      receivedAt: form.receivedAt,
      subject: form.subject.trim(),
      from: form.from.trim(),
      relatedDepartment: form.relatedDepartment.trim(),
      attn: form.attn.trim(),
      advisor: form.advisor,
      inquiry: form.inquiry.trim(),
      analysis: form.analysis.trim(),
      causes: form.causes.trim(),
      action: form.action.trim(),
      result: form.result.trim(),
      productionSite: form.productionSite.trim(),
      orderVolume: form.orderVolume.trim(),
      attachment,
      state: form.state,
      source: "web",
    }
    saveTsRecords([newRow, ...rows])
    setForm(initialForm())
    setFormOpen(false)
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="TS 관리"
        subtitle="Technical Service 접수부터 Trouble shooting 결과까지 관리합니다. 웹 입력이 원본이며 기존 엑셀은 수동으로 가져옵니다."
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            <DataUpload kind="ts-workbook" label="TS 파일 업로드" accept=".xlsx,.xls,.csv" compact onFiles={(files) => { if (files[0]) void ingestTs(files[0]) }} />
            <Button type="button" disabled={exporting || rows.length === 0} onClick={exportRows}>
              <Download aria-hidden="true" />
              {exporting ? "내보내는 중" : "엑셀 내보내기"}
            </Button>
          </div>
        )}
      />

      <MaterialDeckSection kind="TS" title="TS 자료 덱" description="사고사례와 불량 trouble shooting 자료 중 최신 6건입니다." emptyMessage="SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다." items={materialItems} allowAdd={false} />
      <MaterialSearchSection kind="TS" emptyMessage="SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다." items={materialItems} allowAdd={false} />

      {actionNotice ? (
        <p role={actionNotice.tone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-[var(--radius)] border px-4 py-3 text-sm ${actionNotice.tone === "error" ? "border-[var(--destructive)] text-[var(--destructive)]" : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"}`}>
          {actionNotice.message}
        </p>
      ) : null}

      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>처리 단계</CardTitle>
            <CardDescription>단계를 선택하면 아래 목록도 같은 상태로 좁혀집니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto pb-1">
              <ol className="grid min-w-[38rem] grid-cols-3" aria-label="TS 처리 단계">
                {steps.map((step, index) => {
                  const active = activeState === step.state
                  return (
                    <li key={step.state} className="relative flex min-w-0 items-center">
                      <button type="button" aria-current={active ? "step" : undefined} onClick={() => setActiveState(step.state)} className={`relative z-10 flex w-full items-center gap-3 rounded-[var(--radius)] border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}>
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? "border-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--muted)]"}`}>{index + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{step.state}</span><span className={`block truncate text-xs ${active ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}>{step.caption}</span></span>
                        <span className={`inline-flex shrink-0 items-center rounded-[calc(var(--radius)-2px)] border px-2.5 py-0.5 text-xs font-semibold ${active ? "border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] text-[var(--foreground)]"}`}>{step.count}건</span>
                      </button>
                      {index < steps.length - 1 ? <span aria-hidden="true" className="absolute left-full top-1/2 z-0 h-px w-4 -translate-y-1/2 bg-[var(--border)]" /> : null}
                    </li>
                  )
                })}
              </ol>
            </div>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={75}>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div className="min-w-0 space-y-1.5"><CardTitle>신규 접수</CardTitle><CardDescription>필수 4개 항목을 입력하고, 의뢰 정보와 처리 내용을 선택해 덧붙입니다.</CardDescription></div>
            <Button type="button" variant="outline" aria-expanded={formOpen} aria-controls="ts-intake-form" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}{formOpen ? "접기" : "신규 접수"}
            </Button>
          </CardHeader>
          {formOpen ? (
            <CardContent id="ts-intake-form">
              <form className="space-y-7" noValidate onSubmit={submit}>
                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">필수 항목</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2"><Label htmlFor="ts-received-at">접수일 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-received-at" type="date" required aria-invalid={Boolean(formErrors.receivedAt) || undefined} aria-describedby={formErrors.receivedAt ? "ts-received-at-error" : undefined} value={form.receivedAt} onChange={(event) => setField("receivedAt", event.target.value)} />{formErrors.receivedAt ? <p id="ts-received-at-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.receivedAt}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-subject">Subject 건명 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-subject" required value={form.subject} aria-invalid={Boolean(formErrors.subject) || undefined} aria-describedby={formErrors.subject ? "ts-subject-error" : undefined} onChange={(event) => setField("subject", event.target.value)} placeholder="의뢰 건명을 입력하세요" />{formErrors.subject ? <p id="ts-subject-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.subject}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-from">요청자 From <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-from" required value={form.from} aria-invalid={Boolean(formErrors.from) || undefined} aria-describedby={formErrors.from ? "ts-from-error" : undefined} onChange={(event) => setField("from", event.target.value)} />{formErrors.from ? <p id="ts-from-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.from}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-advisor">담당 Advisor <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Select value={form.advisor} onValueChange={(value) => setField("advisor", value)}><SelectTrigger id="ts-advisor" aria-required="true" aria-invalid={Boolean(formErrors.advisor) || undefined} aria-describedby={formErrors.advisor ? "ts-advisor-error" : undefined}><SelectValue /></SelectTrigger><SelectContent>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select>{formErrors.advisor ? <p id="ts-advisor-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.advisor}</p> : null}</div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">의뢰 정보 <span className="text-xs font-normal text-[var(--muted-foreground)]">선택</span></legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="ts-related-department">유관부서</Label><Input id="ts-related-department" value={form.relatedDepartment} onChange={(event) => setField("relatedDepartment", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-attn">수신자 Attn</Label><Input id="ts-attn" value={form.attn} onChange={(event) => setField("attn", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-production-site">생산처</Label><Input id="ts-production-site" value={form.productionSite} onChange={(event) => setField("productionSite", event.target.value)} /></div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">Trouble shooting 내용 <span className="text-xs font-normal text-[var(--muted-foreground)]">선택 · 의뢰 → 분석 → 원인 → 해결 → 결과</span></legend>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="ts-inquiry">의뢰 내용 Inquiry</Label><textarea id="ts-inquiry" className={textareaClassName} value={form.inquiry} onChange={(event) => setField("inquiry", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-analysis">현황 분석 Analysis</Label><textarea id="ts-analysis" className={textareaClassName} value={form.analysis} onChange={(event) => setField("analysis", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-causes">원인 Causes</Label><textarea id="ts-causes" className={textareaClassName} value={form.causes} onChange={(event) => setField("causes", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-action">해결 방안 Action</Label><textarea id="ts-action" className={textareaClassName} value={form.action} onChange={(event) => setField("action", event.target.value)} /></div>
                    <div className="space-y-2 lg:col-span-2"><Label htmlFor="ts-result">결과 Result</Label><textarea id="ts-result" className={textareaClassName} value={form.result} onChange={(event) => setField("result", event.target.value)} /></div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">상태·기타</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="ts-state">상태</Label><Select value={form.state} onValueChange={(value) => setField("state", value as TsState)}><SelectTrigger id="ts-state"><SelectValue /></SelectTrigger><SelectContent>{TS_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="ts-order-volume">발주량</Label><Input id="ts-order-volume" value={form.orderVolume} onChange={(event) => setField("orderVolume", event.target.value)} placeholder="예: 약 40만장 연속 오더" /></div>
                    <div className="space-y-2"><Label htmlFor="ts-attachment">첨부 SharePoint 링크</Label><Input id="ts-attachment" type="url" value={form.attachment} onChange={(event) => setField("attachment", event.target.value)} placeholder="https://" aria-invalid={Boolean(formErrors.attachment) || undefined} aria-describedby="ts-attachment-hint ts-attachment-error" /><p id="ts-attachment-hint" className="text-xs text-[var(--muted-foreground)]">Teams의 SharePoint 공유 링크를 붙여 넣으세요.</p>{formErrors.attachment ? <p id="ts-attachment-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.attachment}</p> : null}</div>
                  </div>
                </fieldset>

                <div className="flex justify-end"><Button type="submit">접수 저장</Button></div>
              </form>
            </CardContent>
          ) : null}
        </Card>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<ClipboardList aria-hidden="true" className="size-4" />} label="접수" value={counts.received} caption="신규 확인 필요" info="현재 접수 상태인 요청입니다." revealDelay={0} />
        <StatCard icon={<LoaderCircle aria-hidden="true" className="size-4" />} label="처리중" value={counts.processing} caption="분석·해결 진행 중" info="현황 분석이나 해결 방안을 진행 중인 요청입니다." revealDelay={75} />
        <StatCard icon={<CheckCircle2 aria-hidden="true" className="size-4" />} label="완료" value={counts.done} caption="결과 정리 완료" info="결과까지 정리해 처리를 마친 요청입니다." revealDelay={150} />
      </div>

      <SectionCard title="TS 목록" subtitle={`현재 보기 ${filteredRows.length}건`} contentClassName="p-0">
        <DataTable
          columns={columns}
          rows={filteredRows}
          getRowId={(row) => row.id}
          pageSize={10}
          onRowClick={setSelectedRow}
          toolbar={(
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={activeState} onValueChange={setActiveState}><TabsList aria-label="TS 상태 필터">{[ALL, ...TS_STATES].map((state) => <TabsTrigger key={state} value={state}>{state}</TabsTrigger>)}</TabsList></Tabs>
              <Input className="lg:max-w-sm" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Subject · 요청자 · 담당 · 의뢰 내용 검색" aria-label="TS 목록 검색" />
            </div>
          )}
        />
      </SectionCard>

      <TsDetailSheet record={selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null) }} />
    </section>
  )
}
