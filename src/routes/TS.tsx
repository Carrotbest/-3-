import { useEffect, useMemo, useState, type FormEvent } from "react"
import { CheckCircle2, ChevronUp, ClipboardList, Download, Link2Off, LoaderCircle, Plus } from "lucide-react"
import * as XLSX from "xlsx"

import { BarCard } from "@/components/charts/BarCard"
import { MaterialDeckSection, MaterialSearchSection } from "@/components/cards/MaterialDeck"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { StatCard } from "@/components/dashboard/StatCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtDate, fmtNum } from "@/data/format"
import { ingestTs } from "@/data/upload"
import { MEMBERS } from "@/data/schema"
import { type TsRecord, type TsState } from "@/data/sample"
import { type TechnicalServiceDetails } from "@/data/xlsx-parsers"
import { loadTsRecords, saveTsRecords, useAppStore } from "@/store/useAppStore"

const ALL = "전체"
const TYPES = ["이색 클레임", "신축 회복 불량", "Pilling 등급 문의", "수축률 초과", "봉제부 터짐", "발수 지속성"]
const SPARK = [2, 3, 3, 4, 5, 5, 6]

interface FormValues {
  receivedAt: string
  subject: string
  from: string
  owner: string
  state: TsState
  styleNo: string
  flNo: string
  construction: string
  cause: string
  testItem: string
  orderQty: string
  unlinkedReason: string
}

interface OptionalTsFields {
  styleNo?: string
  flNo?: string
  construction?: string
  cause?: string
  testItem?: string
}

type StoredTsRecord = TsRecord & Partial<TechnicalServiceDetails & OptionalTsFields>
type ActionNotice = { tone: "success" | "error"; message: string }

type FormErrorKey = "receivedAt" | "subject" | "from" | "owner" | "completion"
type FormErrors = Partial<Record<FormErrorKey, string>>

function localDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

const initialForm = (): FormValues => ({
  receivedAt: localDate(),
  subject: TYPES[0],
  from: "",
  owner: MEMBERS[0].name,
  state: "접수",
  styleNo: "",
  flNo: "",
  construction: "",
  cause: "",
  testItem: "",
  orderQty: "",
  unlinkedReason: "",
})

function nextTsId(rows: readonly TsRecord[]): string {
  const max = rows.reduce((value, row) => Math.max(value, Number(row.id.match(/(\d+)$/)?.[1] ?? 0)), 0)
  return `TS26-${String(max + 1).padStart(3, "0")}`
}

function exportTechnicalServices(rows: readonly TsRecord[]): string {
  const exportRows = rows.map((baseRow) => {
    const row = baseRow as StoredTsRecord
    return {
      "# T/S": row.id,
      Date: row.receivedAt,
      From: row.from,
      유관부서: row.relatedDepartment ?? "",
      Attn: row.attn ?? "",
      Advisor: row.owner,
      Subject: row.subject,
      Inquiry: row.inquiry ?? "",
      Causes: row.causes ?? row.cause ?? "",
      Analysis: row.analysis ?? "",
      Action: row.action ?? "",
      Result: row.result ?? "",
      생산처: row.productionSite ?? "",
      "Order Volume": row.orderQty,
      상태: row.state,
      "발주 미연결 사유": row.unlinkedReason ?? "",
      "대상 Style No.": row.styleNo ?? "",
      "FL No.": row.flNo ?? "",
      조직: row.construction ?? "",
      "시험 항목": row.testItem ?? "",
    }
  })
  const worksheet = XLSX.utils.json_to_sheet(exportRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "TS")
  const fileName = `Technical_Services_export_${localDate().replace(/-/g, "")}.xlsx`
  XLSX.writeFile(workbook, fileName, { compression: true })
  return fileName
}

export function TS() {
  const rows = useAppStore((state) => state.ts)
  const [activeState, setActiveState] = useState("접수")
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
    unlinked: rows.filter((row) => row.state === "완료" && !row.orderQty).length,
  }), [rows])
  const linkedDone = rows.filter((row) => row.state === "완료" && Boolean(row.orderQty)).length
  const completionRate = counts.done ? Math.round((linkedDone / counts.done) * 100) : 0
  const filteredRows = activeState === ALL ? rows : rows.filter((row) => row.state === activeState)
  const typeStats = TYPES.map((label) => ({
    label,
    count: rows.filter((row) => row.subject === label).length,
  }))
  const steps: { state: TsState; count: number; caption: string }[] = [
    { state: "접수", count: counts.received, caption: "새 요청 확인" },
    { state: "처리중", count: counts.processing, caption: "조사·회신 진행" },
    { state: "완료", count: counts.done, caption: "처리 종료" },
  ]

  const columns: DataTableColumn<TsRecord>[] = [
    { id: "id", header: "TS#", accessor: (row) => row.id },
    { id: "receivedAt", header: "접수일", accessor: (row) => row.receivedAt, cell: (row) => fmtDate(row.receivedAt) },
    { id: "subject", header: "Subject", accessor: (row) => row.subject },
    { id: "from", header: "요청처", accessor: (row) => row.from },
    { id: "owner", header: "담당", accessor: (row) => row.owner },
    { id: "state", header: "상태", accessor: (row) => row.state, cell: (row) => <StatusBadge status={row.state} /> },
    { id: "orderQty", header: "발주량", accessor: (row) => row.orderQty ?? 0, cell: (row) => row.orderQty ? fmtNum(row.orderQty, " yds") : row.unlinkedReason ?? "—", className: "text-right", headerClassName: "text-right" },
  ]

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === "receivedAt" || key === "subject" || key === "from" || key === "owner") {
      setFormErrors((current) => ({ ...current, [key]: undefined }))
    }
    if (key === "orderQty" || key === "unlinkedReason" || key === "state") {
      setFormErrors((current) => ({ ...current, completion: undefined }))
    }
  }

  const exportRows = () => {
    setExporting(true)
    setActionNotice(null)
    try {
      const fileName = exportTechnicalServices(rows)
      setActionNotice({ tone: "success", message: `${fileName} 새 파일 다운로드를 시작했습니다.` })
    } catch (error) {
      setActionNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "TS 엑셀을 내보내지 못했습니다.",
      })
    } finally {
      setExporting(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors: FormErrors = {}
    if (!form.receivedAt.trim()) errors.receivedAt = "접수일을 입력해 주세요."
    if (!form.from.trim()) errors.from = "요청처를 입력해 주세요."
    if (!form.subject.trim()) errors.subject = "Subject(유형)를 선택해 주세요."
    if (!form.owner.trim()) errors.owner = "담당자를 선택해 주세요."
    if (form.state === "완료" && !form.orderQty.trim() && !form.unlinkedReason.trim()) {
      errors.completion = "완료로 저장하려면 발주량 또는 발주 미연결 사유를 입력해 주세요."
    }
    setFormErrors(errors)
    if (Object.keys(errors).length) return

    const newRow: TsRecord & OptionalTsFields = {
      id: nextTsId(rows),
      receivedAt: form.receivedAt,
      subject: form.subject,
      from: form.from.trim(),
      owner: form.owner,
      state: form.state,
      orderQty: form.orderQty.trim() ? Number(form.orderQty) : null,
      unlinkedReason: form.unlinkedReason.trim() || null,
      styleNo: form.styleNo.trim() || undefined,
      flNo: form.flNo.trim() || undefined,
      construction: form.construction.trim() || undefined,
      cause: form.cause.trim() || undefined,
      testItem: form.testItem.trim() || undefined,
    }
    saveTsRecords([newRow, ...rows])
    setForm(initialForm())
    setFormOpen(false)
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="TS 관리"
        subtitle="Technical Service 접수부터 완료와 발주 연결까지 관리합니다. 웹 입력이 원본이며 기존 엑셀은 수동으로만 가져옵니다."
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

      <MaterialDeckSection kind="TS" title="TS 자료 덱" description="사고사례와 불량 trouble shoot 자료 중 최신 6건입니다." emptyMessage="등록된 TS 자료가 없습니다." />
      <MaterialSearchSection kind="TS" emptyMessage="등록된 TS 자료가 없습니다. 자료목록 엑셀을 올리거나 직접 추가하세요." />

      {actionNotice ? (
        <p
          role={actionNotice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-[var(--radius)] border px-4 py-3 text-sm ${actionNotice.tone === "error" ? "border-[var(--destructive)] text-[var(--destructive)]" : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"}`}
        >
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
                      <button
                        type="button"
                        aria-current={active ? "step" : undefined}
                        onClick={() => setActiveState(step.state)}
                        className={`relative z-10 flex w-full items-center gap-3 rounded-[var(--radius)] border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}
                      >
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? "border-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--muted)]"}`}>{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{step.state}</span>
                          <span className={`block truncate text-xs ${active ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}>{step.caption}</span>
                        </span>
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
            <div className="min-w-0 space-y-1.5">
              <CardTitle>신규 접수</CardTitle>
              <CardDescription>필수 항목을 먼저 입력하고, 필요한 정보를 선택해 덧붙입니다.</CardDescription>
            </div>
            <Button type="button" variant="outline" aria-expanded={formOpen} aria-controls="ts-intake-form" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {formOpen ? "접기" : "신규 접수"}
            </Button>
          </CardHeader>
          {formOpen ? (
            <CardContent id="ts-intake-form">
              <form className="space-y-6" noValidate onSubmit={submit}>
                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">필수 항목</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="ts-received-at">접수일 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label>
                      <Input id="ts-received-at" type="date" aria-required="true" aria-invalid={Boolean(formErrors.receivedAt) || undefined} aria-describedby={formErrors.receivedAt ? "ts-received-at-error" : undefined} value={form.receivedAt} onChange={(event) => setField("receivedAt", event.target.value)} />
                      {formErrors.receivedAt ? <p id="ts-received-at-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.receivedAt}</p> : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-from">요청처 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label>
                      <Input id="ts-from" aria-required="true" aria-invalid={Boolean(formErrors.from) || undefined} aria-describedby={formErrors.from ? "ts-from-error" : undefined} value={form.from} onChange={(event) => setField("from", event.target.value)} />
                      {formErrors.from ? <p id="ts-from-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.from}</p> : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-subject">Subject(유형) <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label>
                      <Select value={form.subject} onValueChange={(value) => setField("subject", value)}>
                        <SelectTrigger id="ts-subject" aria-required="true" aria-invalid={Boolean(formErrors.subject) || undefined} aria-describedby={formErrors.subject ? "ts-subject-error" : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>{TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                      </Select>
                      {formErrors.subject ? <p id="ts-subject-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.subject}</p> : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-owner">담당 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label>
                      <Select value={form.owner} onValueChange={(value) => setField("owner", value)}>
                        <SelectTrigger id="ts-owner" aria-required="true" aria-invalid={Boolean(formErrors.owner) || undefined} aria-describedby={formErrors.owner ? "ts-owner-error" : undefined}><SelectValue /></SelectTrigger>
                        <SelectContent>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {formErrors.owner ? <p id="ts-owner-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.owner}</p> : null}
                    </div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">선택 항목</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="ts-style-no">대상 Style No.</Label><Input id="ts-style-no" value={form.styleNo} onChange={(event) => setField("styleNo", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-fl-no">FL No.</Label><Input id="ts-fl-no" value={form.flNo} onChange={(event) => setField("flNo", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-construction">조직</Label><Input id="ts-construction" value={form.construction} onChange={(event) => setField("construction", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-cause">원인</Label><Input id="ts-cause" value={form.cause} onChange={(event) => setField("cause", event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-test-item">시험 항목</Label><Input id="ts-test-item" value={form.testItem} onChange={(event) => setField("testItem", event.target.value)} /></div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-attachment">첨부</Label>
                      <Input id="ts-attachment" type="file" aria-describedby="ts-attachment-hint" />
                      <p id="ts-attachment-hint" className="text-xs text-[var(--muted-foreground)]">첨부 파일 저장 연결 전</p>
                    </div>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">처리 상태 및 완료 정보</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="ts-state">상태</Label>
                      <Select value={form.state} onValueChange={(value) => setField("state", value as TsState)}>
                        <SelectTrigger id="ts-state"><SelectValue /></SelectTrigger>
                        <SelectContent>{["접수", "처리중", "완료"].map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-order-qty">발주량 {form.state === "완료" ? <span className="text-xs text-[var(--muted-foreground)]">(둘 중 하나 필수)</span> : null}</Label>
                      <Input id="ts-order-qty" type="number" min="0" value={form.orderQty} disabled={Boolean(form.unlinkedReason)} aria-invalid={Boolean(formErrors.completion) || undefined} aria-describedby={formErrors.completion ? "ts-completion-error" : undefined} onChange={(event) => setField("orderQty", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ts-unlinked-reason">발주 미연결 사유 {form.state === "완료" ? <span className="text-xs text-[var(--muted-foreground)]">(둘 중 하나 필수)</span> : null}</Label>
                      <Input id="ts-unlinked-reason" value={form.unlinkedReason} disabled={Boolean(form.orderQty)} aria-invalid={Boolean(formErrors.completion) || undefined} aria-describedby={formErrors.completion ? "ts-completion-error" : undefined} onChange={(event) => setField("unlinkedReason", event.target.value)} />
                    </div>
                  </div>
                  {formErrors.completion ? <p id="ts-completion-error" role="alert" className="mt-3 text-sm text-[var(--destructive)]">{formErrors.completion}</p> : null}
                </fieldset>

                <div className="flex justify-end"><Button type="submit">접수 저장</Button></div>
              </form>
            </CardContent>
          ) : null}
        </Card>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<ClipboardList aria-hidden="true" className="size-4" />} label="접수" value={counts.received} caption="신규 확인 필요" deltaPct={4} spark={SPARK} info="현재 접수 상태인 요청입니다." revealDelay={0} />
        <StatCard icon={<LoaderCircle aria-hidden="true" className="size-4" />} label="처리중" value={counts.processing} caption="담당자 처리 중" deltaPct={6} spark={SPARK} info="조사 또는 회신을 진행 중인 요청입니다." revealDelay={75} />
        <StatCard icon={<CheckCircle2 aria-hidden="true" className="size-4" />} label="완료" value={counts.done} caption="전체 완료 누계" deltaPct={9} spark={SPARK} info="처리를 마친 요청입니다." revealDelay={150} />
        <StatCard icon={<Link2Off aria-hidden="true" className="size-4" />} label="발주 미연결" value={counts.unlinked} caption="완료 건 중 발주량 없음" deltaPct={counts.unlinked ? -counts.unlinked : 0} spark={[6, 5, 5, 4, 3, 2, counts.unlinked]} info="완료됐지만 발주량이 연결되지 않은 건입니다." tone={counts.unlinked ? "destructive" : "default"} revealDelay={200} />
      </div>

      <SectionCard title="발주량 기입률" subtitle={<>완료 <NumberTicker value={counts.done} suffix="건" /> 중 <NumberTicker value={linkedDone} suffix="건" /></>}>
        <div className="flex items-center gap-4">
          <progress className="h-3 flex-1 accent-[var(--chart-2)]" aria-label="발주량 기입률" max={100} value={completionRate}>{completionRate}%</progress>
          <strong className="text-sm text-[var(--foreground)]"><NumberTicker value={completionRate} suffix="%" /></strong>
        </div>
      </SectionCard>

      <SectionCard title="TS 목록" subtitle={`현재 보기 ${filteredRows.length}건`} contentClassName="p-0">
        <DataTable
          columns={columns}
          rows={filteredRows}
          getRowId={(row) => row.id}
          pageSize={10}
          toolbar={(
            <Tabs value={activeState} onValueChange={setActiveState}>
              <TabsList aria-label="TS 상태 필터">
                {[ALL, "접수", "처리중", "완료"].map((state) => <TabsTrigger key={state} value={state}>{state}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          )}
        />
      </SectionCard>

      <BarCard title="유형별 통계" subtitle="현재 TS 요청 기준" data={typeStats} series={[{ dataKey: "count", label: "건수" }]} horizontal revealDelay={75} />
    </section>
  )
}
