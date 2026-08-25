import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Check, ChevronUp, Download, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"
import * as XLSX from "xlsx"

import { MaterialDeckSection } from "@/components/cards/MaterialDeck"
import { TsTrendCard } from "@/components/charts/TsTrendCard"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { Reveal } from "@/components/motion/Reveal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { materialsOf, tsMaterials } from "@/data/derive"
import { fmtDate } from "@/data/format"
import { httpsMaterialLink, MEMBERS } from "@/data/schema"
import { type TsRecord, type TsState } from "@/data/sample"
import { saveTsRecords, useAppStore } from "@/store/useAppStore"

const ALL = "전체"
// 등록 단계는 쓰지 않는다(웹에서 접수하면 곧바로 처리중). 선택지는 처리중·완료 둘뿐이다.
const TS_STATES: TsState[] = ["처리중", "완료"]

// DD 마스터 상태 칩(ddStatusStyle)과 동일한 톤앤매너.
const TS_STATE_STYLE: Record<TsState, string> = {
  등록: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30",
  처리중: "bg-amber-500/18 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/35",
  완료: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
}
const TS_STATE_DOT: Record<TsState, string> = {
  등록: "bg-sky-500",
  처리중: "bg-amber-500",
  완료: "bg-emerald-500",
}

function TsStateChip({ state }: { state: TsState }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius)-2px)] px-2 py-0.5 text-xs font-semibold ${TS_STATE_STYLE[state]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${TS_STATE_DOT[state]}`} />{state}
    </span>
  )
}

interface TsStageCounts {
  received: number
  processing: number
  done: number
}

function TsStagePanel({ counts, activeState, onSelect }: {
  counts: TsStageCounts
  activeState: TsState | null
  onSelect: (state: TsState | null) => void
}) {
  const total = counts.received + counts.processing + counts.done
  const steps: { state: TsState | null; label: string; count: number; caption: string; dot: string }[] = [
    { state: null, label: ALL, count: total, caption: "모든 요청", dot: "bg-[var(--muted-foreground)]" },
    { state: "처리중", label: "처리중", count: counts.processing, caption: "분석·해결 진행", dot: TS_STATE_DOT.처리중 },
    { state: "완료", label: "완료", count: counts.done, caption: "결과 정리 완료", dot: TS_STATE_DOT.완료 },
  ]
  const chartData = total > 0
    ? [
        { name: "처리중", value: counts.processing, fill: "#f59e0b" },
        { name: "완료", value: counts.done, fill: "#10b981" },
      ]
    : [{ name: "데이터 없음", value: 1, fill: "var(--muted)" }]

  return (
    <Reveal className="h-full">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>처리 단계</CardTitle>
          <CardDescription>단계를 선택하면 목록이 좁혀집니다</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative h-40 w-40 shrink-0" role="img" aria-label={`TS 처리 단계 분포, 전체 ${total}건`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    innerRadius={48}
                    outerRadius={70}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    stroke="var(--card)"
                    isAnimationActive={false}
                  >
                    {chartData.map((item) => <Cell key={item.name} fill={item.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <strong className="text-2xl font-semibold text-[var(--foreground)]">{total}건</strong>
                <span className="text-xs text-[var(--muted-foreground)]">전체</span>
              </div>
            </div>
            <ol className="min-w-0 flex-1 space-y-2" aria-label="TS 처리 단계">
              {steps.map((step) => {
                const active = activeState === step.state
                return (
                  <li key={step.label}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(step.state)}
                      className={`flex w-full items-center gap-3 rounded-[var(--radius)] border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${active ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}
                    >
                      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${step.dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{step.label}</span>
                        <span className={`block truncate text-xs ${active ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}>{step.caption}</span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center rounded-[calc(var(--radius)-2px)] border px-2.5 py-0.5 text-xs font-semibold ${active ? "border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] text-[var(--foreground)]"}`}>{step.count}건</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  )
}

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
  state: "처리중",
  orderVolume: "",
  attachment: "",
})

function nextTsId(rows: readonly TsRecord[]): string {
  const yy = String(new Date().getFullYear()).slice(2)
  const prefix = `TS${yy}-`
  const max = rows.reduce((v, r) => r.id.startsWith(prefix)
    ? Math.max(v, Number(r.id.slice(prefix.length)) || 0) : v, 0)
  return `${prefix}${String(max + 1).padStart(3, "0")}`
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
  const filled = rows.filter(([, value]) => Boolean(value && value.trim()))
  if (!filled.length) return null
  return (
    <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
      {filled.map(([label, value]) => (
        <div key={label} className="grid gap-1 border-b border-[var(--border)] p-4 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</dt>
          <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function DetailSection({ id, title, rows }: { id: string; title: string; rows: ReadonlyArray<readonly [string, string]> }) {
  if (!rows.some(([, value]) => Boolean(value && value.trim()))) return null
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      <DetailRows rows={rows} />
    </section>
  )
}

function TsDetailDialog({ record, startInEdit, onOpenChange, onSave, onDelete }: {
  record: TsRecord | null
  startInEdit: boolean
  onOpenChange: (open: boolean) => void
  onSave: (record: TsRecord) => void
  onDelete: (record: TsRecord) => void
}) {
  const [editing, setEditing] = useState(startInEdit)
  const [draft, setDraft] = useState<TsRecord | null>(record)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)

  // 다른 행을 열거나 저장 후 목록이 갱신되면 편집 상태를 초기화한다.
  useEffect(() => {
    setDraft(record)
    setEditing(startInEdit)
    setError(null)
  }, [record, startInEdit])

  // 저장 완료 표시 타이머는 팝업이 닫혀도 남지 않도록 정리한다.
  useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current) }, [])

  const attachment = httpsMaterialLink(record?.attachment)
  const setField = <K extends keyof TsRecord>(key: K, value: TsRecord[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const handleSave = () => {
    if (!draft) return
    if (!draft.subject.trim()) { setError("Subject 건명을 입력해 주세요."); return }
    if (!draft.receivedAt.trim()) { setError("접수일을 입력해 주세요."); return }
    const normalizedAttachment = httpsMaterialLink(draft.attachment)
    if (draft.attachment && draft.attachment.trim() && !normalizedAttachment) {
      setError("첨부는 https://로 시작하는 SharePoint 공유 링크여야 합니다."); return
    }
    onSave({
      ...draft,
      subject: draft.subject.trim(),
      from: draft.from.trim(),
      relatedDepartment: draft.relatedDepartment.trim(),
      attn: draft.attn.trim(),
      advisor: draft.advisor.trim(),
      productionSite: draft.productionSite.trim(),
      orderVolume: draft.orderVolume.trim(),
      inquiry: draft.inquiry.trim(),
      analysis: draft.analysis.trim(),
      causes: draft.causes.trim(),
      action: draft.action.trim(),
      result: draft.result.trim(),
      attachment: normalizedAttachment,
    })
    setError(null)
    // 저장이 먹혔다는 걸 눈으로 확인할 수 있게 잠깐 완료 상태를 보여준 뒤 보기 모드로 돌아간다.
    setJustSaved(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => {
      setJustSaved(false)
      setEditing(false)
      savedTimer.current = null
    }, 900)
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {record && draft ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={record.state} /><span className="text-xs font-medium text-[var(--muted-foreground)]">{record.id}</span></div>
                {editing ? null : (
                  <Button type="button" size="sm" variant="outline" className="mr-8" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />수정</Button>
                )}
              </div>
              <DialogTitle className="pt-2">{editing ? "TS 수정" : record.subject}</DialogTitle>
              <DialogDescription>접수일 {fmtDate(record.receivedAt)}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-6">
              {editing ? (
                <div className="space-y-5">
                  {error ? <p role="alert" className="rounded-[var(--radius)] border border-[var(--destructive)] px-3 py-2 text-xs text-[var(--destructive)]">{error}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="ts-edit-received">접수일</Label><Input id="ts-edit-received" type="date" value={draft.receivedAt} onChange={(e) => setField("receivedAt", e.target.value)} /></div>
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="ts-edit-subject">Subject 건명</Label><Input id="ts-edit-subject" value={draft.subject} onChange={(e) => setField("subject", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-from">요청자 From</Label><Input id="ts-edit-from" value={draft.from} onChange={(e) => setField("from", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-dept">유관부서</Label><Input id="ts-edit-dept" value={draft.relatedDepartment} onChange={(e) => setField("relatedDepartment", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-attn">수신자 Attn</Label><Input id="ts-edit-attn" value={draft.attn} onChange={(e) => setField("attn", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-advisor">담당 Advisor</Label><Input id="ts-edit-advisor" value={draft.advisor} onChange={(e) => setField("advisor", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-site">생산처</Label><Input id="ts-edit-site" value={draft.productionSite} onChange={(e) => setField("productionSite", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-state">상태</Label><Select value={draft.state} onValueChange={(v) => setField("state", v as TsState)}><SelectTrigger id="ts-edit-state"><SelectValue /></SelectTrigger><SelectContent>{TS_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-volume">발주량</Label><Input id="ts-edit-volume" value={draft.orderVolume} onChange={(e) => setField("orderVolume", e.target.value)} /></div>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label htmlFor="ts-edit-attachment">첨부 SharePoint 링크</Label><Input id="ts-edit-attachment" type="url" placeholder="https://" value={draft.attachment ?? ""} onChange={(e) => setField("attachment", e.target.value)} /></div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="ts-edit-inquiry">의뢰 내용 Inquiry</Label><textarea id="ts-edit-inquiry" className={textareaClassName} value={draft.inquiry} onChange={(e) => setField("inquiry", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-analysis">현황 분석 Analysis</Label><textarea id="ts-edit-analysis" className={textareaClassName} value={draft.analysis} onChange={(e) => setField("analysis", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-causes">원인 Causes</Label><textarea id="ts-edit-causes" className={textareaClassName} value={draft.causes} onChange={(e) => setField("causes", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ts-edit-action">해결 방안 Action</Label><textarea id="ts-edit-action" className={textareaClassName} value={draft.action} onChange={(e) => setField("action", e.target.value)} /></div>
                    <div className="space-y-2 lg:col-span-2"><Label htmlFor="ts-edit-result">결과 Result</Label><textarea id="ts-edit-result" className={textareaClassName} value={draft.result} onChange={(e) => setField("result", e.target.value)} /></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={justSaved} onClick={() => { setDraft(record); setEditing(false); setError(null) }}>취소</Button>
                    <Button
                      type="button"
                      disabled={justSaved}
                      aria-live="polite"
                      onClick={handleSave}
                      className={justSaved
                        ? "bg-[var(--status-normal,#10b981)] text-white animate-[save-pop_0.45s_ease-out] motion-reduce:animate-none"
                        : "transition-transform duration-150 active:scale-[0.96] motion-reduce:transition-none"}
                    >
                      {justSaved ? <><Check aria-hidden="true" />저장됨</> : "저장"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <DetailSection id="ts-detail-people" title="의뢰 주체" rows={[["요청자 From", record.from], ["유관부서", record.relatedDepartment], ["수신자 Attn", record.attn], ["담당 Advisor", record.advisor]]} />
                  <DetailSection id="ts-detail-workflow" title="Trouble shooting 내용" rows={[["의뢰 내용", record.inquiry], ["현황 분석", record.analysis], ["원인", record.causes], ["해결 방안", record.action], ["결과", record.result]]} />
                  <DetailSection id="ts-detail-etc" title="상태·기타" rows={[["생산처", record.productionSite], ["발주량", record.orderVolume]]} />
                  {attachment ? <Button asChild className="w-full"><a href={attachment} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : null}
                  {/* 삭제는 닫기(X)와 멀리 떨어진 우측 맨 아래에 둔다 — 실수로 눌리지 않게. */}
                  <div className="flex justify-end border-t border-[var(--border)] pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[var(--destructive)] text-[var(--destructive)] hover:bg-[var(--destructive)] hover:text-[var(--destructive-foreground)]"
                      onClick={() => onDelete(record)}
                    >
                      <Trash2 aria-hidden="true" />이 건 삭제
                    </Button>
                  </div>
                </>
              )}
            </DialogBody>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function TS() {
  const rows = useAppStore((state) => state.ts)
  const materialsManual = useAppStore((state) => state.materialsManual)
  const materialItems = useMemo(() => materialsOf("TS", tsMaterials(rows), materialsManual), [materialsManual, rows])
  const peopleOptions = useMemo(() => {
    const set = new Set<string>()
    const push = (value?: string) => value?.split("/").map((part) => part.trim()).filter(Boolean).forEach((part) => set.add(part))
    rows.forEach((row) => { push(row.advisor); push(row.from) })
    MEMBERS.forEach((member) => set.add(member.name))
    return [...set].sort((a, b) => a.localeCompare(b, "ko-KR"))
  }, [rows])
  const [activeState, setActiveState] = useState<TsState | null>(null)
  const [search, setSearch] = useState("")
  const [selectedRow, setSelectedRow] = useState<TsRecord | null>(null)
  const [openInEdit, setOpenInEdit] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormValues>(initialForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [exporting, setExporting] = useState(false)
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)

  const counts = useMemo(() => ({
    received: rows.filter((row) => row.state === "등록").length,
    processing: rows.filter((row) => row.state === "처리중").length,
    done: rows.filter((row) => row.state === "완료").length,
  }), [rows])
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    return rows.filter((row) => {
      if (activeState && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
  }, [activeState, rows, search])
  const columns: DataTableColumn<TsRecord>[] = [
    { id: "id", header: "# T/S", accessor: (r) => r.id, headerClassName: "w-24" },
    { id: "receivedAt", header: "Date", accessor: (r) => r.receivedAt, cell: (r) => fmtDate(r.receivedAt), headerClassName: "w-28" },
    { id: "subject", header: "Subject", accessor: (r) => r.subject, headerClassName: "w-80" },
    { id: "analysis", header: "Analysis", accessor: (r) => r.analysis, cell: (r) => r.analysis || "—", headerClassName: "w-64" },
    { id: "action", header: "Action", accessor: (r) => r.action, cell: (r) => r.action || "—", headerClassName: "w-64" },
    { id: "productionSite", header: "CO", accessor: (r) => r.productionSite, cell: (r) => r.productionSite || "—", headerClassName: "w-32" },
    {
      id: "state",
      header: "상태",
      accessor: (r) => r.state,
      headerClassName: "w-32",
      // 목록에서 바로 처리중/완료를 바꾼다. 행 클릭(상세 열기)과 겹치지 않게 전파를 멈춘다.
      cell: (record) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Select value={record.state} onValueChange={(value) => changeRowState(record, value as TsState)}>
            <SelectTrigger className="h-8 w-full" aria-label={`${record.id} 상태 변경`}>
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${TS_STATE_DOT[record.state]}`} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TS_STATES.map((state) => <SelectItem key={state} value={state}><TsStateChip state={state} /></SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      id: "manage",
      header: "관리",
      accessor: () => "",
      sortable: false,
      headerClassName: "w-28",
      // 행 클릭(상세 열기)과 겹치지 않도록 버튼에서 이벤트 전파를 멈춘다.
      cell: (record) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${record.id} 수정`}
            onClick={() => { setSelectedRow(record); setOpenInEdit(true) }}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-[var(--destructive)] hover:bg-[var(--destructive)] hover:text-[var(--destructive-foreground)]"
            aria-label={`${record.id} 삭제`}
            onClick={() => deleteRow(record)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ]

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === "receivedAt" || key === "subject" || key === "from" || key === "advisor" || key === "attachment") {
      setFormErrors((current) => ({ ...current, [key]: undefined }))
    }
  }

  const changeRowState = (record: TsRecord, state: TsState) => {
    if (record.state === state) return
    const next = useAppStore.getState().ts.map((row) => (row.id === record.id ? { ...row, state } : row))
    saveTsRecords(next)
    setSelectedRow((current) => (current && current.id === record.id ? { ...current, state } : current))
    setActionNotice({ tone: "success", message: `${record.id} 상태를 ${state}(으)로 변경했습니다.` })
  }

  const saveRow = (updated: TsRecord) => {
    const next = useAppStore.getState().ts.map((row) => (row.id === updated.id ? updated : row))
    saveTsRecords(next)
    setSelectedRow(updated)
    setActionNotice({ tone: "success", message: `${updated.id} 수정 내용을 저장했습니다. 팀원 화면에 실시간 반영됩니다.` })
  }

  const deleteRow = (record: TsRecord) => {
    if (!window.confirm(`${record.id} · ${record.subject}\n\n이 TS 건을 삭제할까요? 되돌릴 수 없습니다.`)) return
    const next = useAppStore.getState().ts.filter((row) => row.id !== record.id)
    saveTsRecords(next)
    setSelectedRow(null)
    setOpenInEdit(false)
    setActionNotice({ tone: "success", message: `${record.id} 건을 삭제했습니다.` })
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
    if (!form.advisor.trim()) errors.advisor = "담당자를 입력해 주세요."
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
        subtitle="Technical Service 등록부터 Trouble shooting 결과까지 웹에서 관리합니다."
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" disabled={exporting || rows.length === 0} onClick={exportRows}>
              <Download aria-hidden="true" />
              {exporting ? "내보내는 중" : "엑셀 내보내기"}
            </Button>
          </div>
        )}
      />

      <MaterialDeckSection kind="TS" title="TS 자료 덱" description="사고사례·Trouble shooting 자료" emptyMessage="SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다." items={materialItems} allowAdd={false} visibleCards={7} hideBadges deepPerspective />

      {actionNotice ? (
        <p role={actionNotice.tone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-[var(--radius)] border px-4 py-3 text-sm ${actionNotice.tone === "error" ? "border-[var(--destructive)] text-[var(--destructive)]" : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"}`}>
          {actionNotice.message}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2"><TsTrendCard ts={rows} /></div>
        <aside className="xl:col-span-1"><TsStagePanel counts={counts} activeState={activeState} onSelect={setActiveState} /></aside>
      </div>

      <Reveal delay={75}>
        <Card className="border-[var(--primary)] bg-[var(--accent)]/40 shadow-lg ring-1 ring-[var(--ring)]">
          <CardHeader className="flex-col items-start justify-start gap-4 space-y-0 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="lg"
              className="group relative shrink-0 overflow-hidden rounded-full border-0 bg-[linear-gradient(110deg,#5B6CFF,#8B5CF6_55%,#EC4899)] bg-[length:200%_100%] text-white shadow-[0_8px_24px_-8px_rgba(91,108,255,0.7)] transition-[transform,box-shadow,background-position] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_0] hover:shadow-[0_14px_32px_-8px_rgba(139,92,246,0.85)] active:translate-y-0 active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none motion-reduce:transition-none"
              aria-expanded={formOpen}
              aria-controls="ts-intake-form"
              onClick={() => setFormOpen((open) => !open)}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden" />
              <span className="relative z-10 inline-flex items-center gap-2">{formOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}{formOpen ? "접기" : "신규 등록 입력"}</span>
            </Button>
          </CardHeader>
          {formOpen ? (
            <CardContent id="ts-intake-form">
              <form className="space-y-7" noValidate onSubmit={submit}>
                <datalist id="ts-people">{peopleOptions.map((person) => <option key={person} value={person} />)}</datalist>
                <fieldset>
                  <legend className="mb-3 text-sm font-semibold text-[var(--foreground)]">필수 항목</legend>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2"><Label htmlFor="ts-received-at">접수일 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-received-at" type="date" required aria-invalid={Boolean(formErrors.receivedAt) || undefined} aria-describedby={formErrors.receivedAt ? "ts-received-at-error" : undefined} value={form.receivedAt} onChange={(event) => setField("receivedAt", event.target.value)} />{formErrors.receivedAt ? <p id="ts-received-at-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.receivedAt}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-subject">Subject 건명 <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-subject" required value={form.subject} aria-invalid={Boolean(formErrors.subject) || undefined} aria-describedby={formErrors.subject ? "ts-subject-error" : undefined} onChange={(event) => setField("subject", event.target.value)} placeholder="의뢰 건명을 입력하세요" />{formErrors.subject ? <p id="ts-subject-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.subject}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-from">요청자 From <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-from" list="ts-people" required value={form.from} aria-invalid={Boolean(formErrors.from) || undefined} aria-describedby={formErrors.from ? "ts-from-error" : undefined} onChange={(event) => setField("from", event.target.value)} />{formErrors.from ? <p id="ts-from-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.from}</p> : null}</div>
                    <div className="space-y-2"><Label htmlFor="ts-advisor">담당 Advisor <span aria-hidden="true" className="text-[var(--destructive)]">*</span></Label><Input id="ts-advisor" list="ts-people" required value={form.advisor} aria-invalid={Boolean(formErrors.advisor) || undefined} aria-describedby={formErrors.advisor ? "ts-advisor-error" : undefined} onChange={(event) => setField("advisor", event.target.value)} />{formErrors.advisor ? <p id="ts-advisor-error" role="alert" className="text-xs text-[var(--destructive)]">{formErrors.advisor}</p> : null}</div>
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

                <div className="flex justify-start"><Button type="submit">등록</Button></div>
              </form>
            </CardContent>
          ) : null}
        </Card>
      </Reveal>

      <SectionCard
        title="TS 목록"
        subtitle={`현재 보기 ${filteredRows.length}건`}
        contentClassName="p-0"
      >
        <DataTable
          columns={columns}
          rows={filteredRows}
          getRowId={(row) => row.id}
          pageSize={10}
          resizableColumns
          fitContainer
          storageKey="ts-list-v3"
          fillToPageSize
          onRowClick={(record) => { setSelectedRow(record); setOpenInEdit(false) }}
          toolbar={(
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={activeState ?? ALL} onValueChange={(value) => setActiveState(value === ALL ? null : value as TsState)}>
                <TabsList aria-label="TS 상태 필터">
                  {[ALL, ...TS_STATES].map((state) => <TabsTrigger key={state} value={state}>{state}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <Input className="lg:max-w-sm" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Subject · 요청자 · 담당 · 의뢰 내용 검색" aria-label="TS 목록 검색" />
            </div>
          )}
        />
      </SectionCard>
      <TsDetailDialog
        record={selectedRow}
        startInEdit={openInEdit}
        onOpenChange={(open) => { if (!open) { setSelectedRow(null); setOpenInEdit(false) } }}
        onSave={saveRow}
        onDelete={deleteRow}
      />
    </section>
  )
}
