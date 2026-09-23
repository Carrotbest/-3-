import { useEffect, useMemo, useRef, useState } from "react"
import { FileSpreadsheet, ImagePlus, Plus, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseAnalysisWorkbook, type AnalysisImportRow } from "@/data/analysis-import"
import { CONSTRUCTIONS } from "@/data/constructions"
import { ANALYSIS_GENDERS, ANALYSIS_ITEMS, ANALYSIS_OBJECTIVES, ANALYSIS_SEASON_OPTIONS, ANALYSIS_SOURCES, AN_NO_PATTERN, blankAnalysisRequest, DEFAULT_CUSTOMER, DEFAULT_DEPARTMENT, isDuplicateAnNo, nextAnNo } from "@/data/fabric-analysis"
import { deleteRequestImage, requestImageUrl, uploadRequestImage, validateRequestImage } from "@/data/request-image"
import { ANALYSIS_REQUEST_TYPES, type AnalysisRequest } from "@/data/schema"
import { saveAnalysisRequests, useAppStore } from "@/store/useAppStore"

type Props = { open: boolean; onOpenChange: (open: boolean) => void; record?: AnalysisRequest | null; requester: string; requesterEmail: string; onSaved?: (record: AnalysisRequest) => void }
type BatchField = "image" | "department" | "requester" | "customer" | "objective" | "source" | "sourceCode" | "season" | "gender" | "brand" | "construction" | "contents" | "weight" | "description" | "requesterComment" | "requestType"
type RequiredBatchField = "requester" | "source" | "description"

interface BatchRow {
  key: string
  form: AnalysisRequest
  image?: File
  parsedFields: Set<BatchField>
}

const MAX_ANALYSIS_IMAGE_SIZE = 20 * 1024 * 1024
const EMPTY_SELECT = "__empty__"
const REQUIRED_BATCH_FIELDS: RequiredBatchField[] = ["requester", "source", "description"]
const QUICK_ITEM_COLORS = [
  "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/50",
  "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50",
  "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50",
  "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50",
  "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50",
  "border-lime-200 bg-lime-50 text-lime-700 hover:bg-lime-100 dark:border-lime-800 dark:bg-lime-950/30 dark:text-lime-300 dark:hover:bg-lime-950/50",
] as const

let batchSequence = 0
const nextBatchKey = () => `analysis-batch-${Date.now()}-${batchSequence++}`
const cellKey = (rowKey: string, field: BatchField) => `${rowKey}:${field}`
const requiredLabel = (label: string) => label.endsWith(" *")
  ? <>{label.slice(0, -2)} <span className="text-[var(--destructive)]">*</span></>
  : label

const editableValues = (form: AnalysisRequest) => ({
  department: form.department,
  requester: form.requester,
  customer: form.customer,
  objective: form.objective,
  source: form.source,
  sourceCode: form.sourceCode,
  season: form.season,
  gender: form.gender,
  brand: form.brand,
  construction: form.construction,
  contents: form.contents,
  weight: form.weight,
  description: form.description,
  requesterComment: form.requesterComment,
  requestType: form.requestType,
})

function makeBatchRow(requester: string, requesterEmail: string, list: AnalysisRequest[], source?: BatchRow): BatchRow {
  const base = blankAnalysisRequest({ requester, requesterEmail, list })
  return {
    key: nextBatchKey(),
    form: source ? { ...base, ...editableValues(source.form) } : base,
    image: source?.image,
    parsedFields: new Set(source?.parsedFields ?? []),
  }
}

function isBlankBatchRow(row: BatchRow, requester: string): boolean {
  const form = row.form
  return !row.image
    && form.department.trim() === DEFAULT_DEPARTMENT
    && form.requester.trim() === requester.trim()
    && form.customer.trim() === DEFAULT_CUSTOMER
    && form.requestType === "Normal"
    && !form.objective.trim()
    && !form.source.trim()
    && !form.sourceCode.trim()
    && !form.season.trim()
    && !form.gender.trim()
    && !form.brand.trim()
    && !form.construction.trim()
    && !form.contents.trim()
    && form.weight === ""
    && !form.description.trim()
    && !form.requesterComment.trim()
}

function ImportImageThumb({ file, alt = "의뢰 사진" }: { file?: File; alt?: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    if (!file) { setUrl(""); return }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
    ? <img src={url} alt={alt} className="size-9 rounded-md object-cover ring-1 ring-[var(--border)]/60" />
    : <span className="flex size-9 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImagePlus className="size-4" /></span>
}

function BatchImageCell({ file, highlighted, onChoose }: { file?: File; highlighted: boolean; onChoose: (file: File | null) => void }) {
  return <label
    className={`flex h-10 cursor-pointer items-center justify-center rounded-sm ${highlighted ? "bg-teal-50 dark:bg-teal-950/20" : ""}`}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); onChoose(event.dataTransfer.files?.[0] ?? null) }}
  >
    <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onChoose(event.target.files?.[0] ?? null); event.currentTarget.value = "" }} />
    <ImportImageThumb file={file} />
  </label>
}

export function AnalysisRequestDialog({ open, onOpenChange, record, requester, requesterEmail, onSaved }: Props) {
  const analysisRequests = useAppStore((state) => state.analysisRequests)
  const [form, setForm] = useState<AnalysisRequest | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState("")
  const [removePhoto, setRemovePhoto] = useState(false)
  const [savedThisTime, setSavedThisTime] = useState<AnalysisRequest[]>([])
  const [rows, setRows] = useState<BatchRow[]>([])
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())
  const [focusedRowId, setFocusedRowId] = useState("")
  const [fillDownDescription, setFillDownDescription] = useState(false)
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [notice, setNotice] = useState("")
  const [batchError, setBatchError] = useState("")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const excelInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const current = useAppStore.getState().analysisRequests
    setForm(record ? { ...record } : blankAnalysisRequest({ requester, requesterEmail, list: current }))
    setRows(record ? [] : [makeBatchRow(requester, requesterEmail, current)])
    setFile(null); setRemovePhoto(false); setSavedThisTime([]); setInvalid(new Set()); setFocusedRowId(""); setFillDownDescription(false)
    setImportWarnings([]); setNotice(""); setBatchError("")
  }, [open, record, requester, requesterEmail])

  useEffect(() => {
    if (file) {
      const next = URL.createObjectURL(file)
      setPhotoUrl(next)
      return () => URL.revokeObjectURL(next)
    }
    setPhotoUrl("")
    if (!form?.imagePath || removePhoto) return
    let live = true
    void requestImageUrl(form.imagePath).then((url) => { if (live) setPhotoUrl(url ?? "") })
    return () => { live = false }
  }, [file, form?.imagePath, removePhoto])

  const error = useMemo(() => {
    if (!form) return ""
    const list = useAppStore.getState().analysisRequests
    if (!AN_NO_PATTERN.test(form.anNo.trim())) return "AN No.는 AN+숫자 8자리 형식이어야 합니다."
    if (isDuplicateAnNo(list, form.anNo, form.id)) return "이미 사용 중인 AN No.입니다."
    if (!form.requester.trim() || !form.source.trim() || !form.description.trim()) return "Requester, Source, Request item은 필수입니다."
    if (!form.construction.trim() && !form.contents.trim()) return "Construction과 Contents 중 하나 이상 입력하세요."
    return ""
  }, [form])

  const activeRows = useMemo(() => rows.filter((row) => !isBlankBatchRow(row, requester)), [requester, rows])
  const displayNumbers = useMemo(() => {
    const working = [...analysisRequests]
    const assigned = new Map<string, string>()
    rows.forEach((row) => {
      const anNo = nextAnNo(working)
      assigned.set(row.key, anNo)
      working.push({ ...row.form, anNo })
    })
    return assigned
  }, [analysisRequests, rows])

  if (!form) return null

  const setField = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => setForm((current) => current ? { ...current, [key]: value } : current)
  const field = (label: string, key: keyof AnalysisRequest, options?: readonly string[], type = "text", placeholder?: string) => <div className="space-y-1"><Label>{requiredLabel(label)}</Label><Input type={type} list={options ? `analysis-${String(key)}` : undefined} placeholder={placeholder} className={placeholder ? "placeholder:text-[var(--muted-foreground)]/60" : undefined} value={String(form[key] ?? "")} onChange={(event) => setField(key, (type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value) as never)} />{options ? <datalist id={`analysis-${String(key)}`}>{options.map((item) => <option key={item} value={item} />)}</datalist> : null}</div>
  const selectField = (label: string, key: "season" | "construction", choices: readonly string[]) => {
    const current = form[key]
    const items = current && !choices.includes(current) ? [current, ...choices] : choices
    return <div className="space-y-1"><Label>{requiredLabel(label)}</Label><Select value={current || EMPTY_SELECT} onValueChange={(value) => setField(key, value === EMPTY_SELECT ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={EMPTY_SELECT}>선택 안 함</SelectItem>{items.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
  }

  const chooseImage = (next: File | null) => {
    const invalidFile = next ? validateRequestImage(next, MAX_ANALYSIS_IMAGE_SIZE) : null
    setNotice(invalidFile ?? "")
    setFile(invalidFile ? null : next)
    if (next && !invalidFile) setRemovePhoto(false)
  }

  const saveOne = async (addAnother: boolean) => {
    if (error) return
    setSaving(true); setNotice("")
    const now = new Date().toISOString()
    let next: AnalysisRequest = { ...form, anNo: form.anNo.trim().toUpperCase(), state: record ? form.state : "작성", updatedAt: now }
    const current = useAppStore.getState().analysisRequests
    saveAnalysisRequests(current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [...current, next])
    try {
      if (removePhoto && !file && next.imagePath) {
        await deleteRequestImage(`analysis-${next.id}`)
        next = { ...next, imagePath: undefined, imageThumbPath: undefined, updatedAt: new Date().toISOString() }
      } else if (file) {
        const paths = await uploadRequestImage(`analysis-${next.id}`, file, { maxSourceBytes: MAX_ANALYSIS_IMAGE_SIZE, profile: "analysis" })
        next = { ...next, ...paths, updatedAt: new Date().toISOString() }
      }
      const latest = useAppStore.getState().analysisRequests
      saveAnalysisRequests(latest.map((item) => item.id === next.id ? next : item))
    } catch (uploadError) {
      setNotice(`의뢰는 저장했지만 사진을 처리하지 못했습니다. ${uploadError instanceof Error ? uploadError.message : ""}`)
    }
    setSavedThisTime((items) => [...items.filter((item) => item.id !== next.id), next])
    onSaved?.(next)
    setSaving(false)
    if (!addAnother) { onOpenChange(false); return }
    const latest = useAppStore.getState().analysisRequests
    const blank = blankAnalysisRequest({ requester, requesterEmail, list: latest })
    setForm({
      ...blank, department: next.department, requester: next.requester, requesterEmail: next.requesterEmail,
      requestType: next.requestType, objective: next.objective, source: next.source, season: next.season,
      gender: next.gender, brand: next.brand, customer: next.customer,
    })
    setFile(null); setRemovePhoto(false)
  }

  const clearInvalid = (rowKey: string, field: BatchField) => {
    const key = cellKey(rowKey, field)
    setInvalid((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
    setBatchError("")
  }

  const setBatchField = <K extends keyof AnalysisRequest>(rowKey: string, key: K, value: AnalysisRequest[K]) => {
    setRows((current) => current.map((row) => row.key === rowKey ? { ...row, form: { ...row.form, [key]: value } } : row))
    clearInvalid(rowKey, key as BatchField)
  }

  const applyQuickItem = (item: string) => {
    const targetIndex = rows.findIndex((row) => row.key === focusedRowId)
    if (targetIndex < 0) return
    const affectedRowKeys = new Set((fillDownDescription ? rows.slice(targetIndex) : [rows[targetIndex]]).map((row) => row.key))
    setRows((current) => {
      const currentTargetIndex = current.findIndex((row) => row.key === focusedRowId)
      if (currentTargetIndex < 0) return current
      const description = [current[currentTargetIndex].form.description.trim(), item].filter(Boolean).join(", ")
      return current.map((row, index) => index === currentTargetIndex || (fillDownDescription && index > currentTargetIndex)
        ? { ...row, form: { ...row.form, description } }
        : row)
    })
    setInvalid((current) => new Set([...current].filter((key) =>
      ![...affectedRowKeys].some((rowKey) => key === cellKey(rowKey, "description")))))
    setBatchError("")
  }

  const chooseBatchImage = (rowKey: string, next: File | null) => {
    if (!next) return
    const invalidFile = validateRequestImage(next, MAX_ANALYSIS_IMAGE_SIZE)
    if (invalidFile) { setNotice(invalidFile); return }
    setNotice("")
    setRows((current) => current.map((row) => row.key === rowKey ? { ...row, image: next } : row))
  }

  const appendRow = () => setRows((current) => [...current, makeBatchRow(requester, requesterEmail, analysisRequests)])
  const removeRow = (rowKey: string) => {
    setRows((current) => current.length === 1 ? [makeBatchRow(requester, requesterEmail, analysisRequests)] : current.filter((row) => row.key !== rowKey))
    setInvalid((current) => new Set([...current].filter((key) => !key.startsWith(`${rowKey}:`))))
    if (focusedRowId === rowKey) setFocusedRowId("")
  }

  const importedBatchRow = (row: AnalysisImportRow): BatchRow => {
    const next = makeBatchRow(requester, requesterEmail, analysisRequests)
    next.form = {
      ...next.form,
      department: row.department || DEFAULT_DEPARTMENT,
      customer: row.customer || DEFAULT_CUSTOMER,
      objective: row.objective || "Reference",
      source: row.source,
      sourceCode: row.sourceCode,
      season: row.season,
      gender: row.gender,
      brand: row.brand,
      construction: row.construction,
      contents: row.contents,
      weight: row.weight,
      description: "",
    }
    const filled = new Set<BatchField>()
    if (row.department) filled.add("department")
    if (row.customer) filled.add("customer")
    if (row.objective) filled.add("objective")
    if (row.source) filled.add("source")
    if (row.sourceCode) filled.add("sourceCode")
    if (row.season) filled.add("season")
    if (row.gender) filled.add("gender")
    if (row.brand) filled.add("brand")
    if (row.construction) filled.add("construction")
    if (row.contents) filled.add("contents")
    if (row.weight !== "") filled.add("weight")
    if (row.image) filled.add("image")
    next.image = row.image
    next.parsedFields = filled
    return next
  }

  const loadExcel = async (selectedFile: File | null) => {
    if (!selectedFile) return
    setImporting(true); setNotice(""); setBatchError("")
    try {
      const parsed = await parseAnalysisWorkbook(selectedFile)
      setImportWarnings(parsed.warnings)
      if (parsed.rows.length) setRows((current) => [...current, ...parsed.rows.map(importedBatchRow)])
      else setNotice(parsed.warnings[0] ?? "가져올 행이 없습니다.")
    } catch (importError) {
      setNotice(`엑셀을 읽지 못했습니다. ${importError instanceof Error ? importError.message : ""}`)
    } finally {
      setImporting(false)
      if (excelInput.current) excelInput.current.value = ""
    }
  }

  const saveBatch = async () => {
    const targets = rows.filter((row) => !isBlankBatchRow(row, requester))
    if (!targets.length || saving) return
    const nextInvalid = new Set<string>()
    targets.forEach((row) => REQUIRED_BATCH_FIELDS.forEach((field) => {
      if (!String(row.form[field] ?? "").trim()) nextInvalid.add(cellKey(row.key, field))
    }))
    if (nextInvalid.size) {
      setInvalid(nextInvalid)
      setBatchError("Requester, Source, Request item은 필수입니다.")
      return
    }

    setSaving(true); setBatchError(""); setNotice("")
    try {
      const working = [...useAppStore.getState().analysisRequests]
      const added = targets.map((row) => {
        const base = blankAnalysisRequest({ requester, requesterEmail, list: working })
        const next: AnalysisRequest = { ...base, ...editableValues(row.form), state: "작성" }
        working.push(next)
        return next
      })
      saveAnalysisRequests(working)

      const uploaded = [...added]
      const failures: string[] = []
      for (let index = 0; index < targets.length; index += 1) {
        const image = targets[index].image
        if (!image) continue
        try {
          const paths = await uploadRequestImage(`analysis-${uploaded[index].id}`, image, { maxSourceBytes: MAX_ANALYSIS_IMAGE_SIZE, profile: "analysis" })
          uploaded[index] = { ...uploaded[index], ...paths, updatedAt: new Date().toISOString() }
        } catch {
          failures.push(uploaded[index].anNo)
        }
      }
      const uploadedById = new Map(uploaded.map((item) => [item.id, item]))
      saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => uploadedById.get(item.id) ?? item))
      uploaded.forEach((item) => onSaved?.(item))
      setRows([makeBatchRow(requester, requesterEmail, useAppStore.getState().analysisRequests)])
      setInvalid(new Set()); setFocusedRowId(""); setImportWarnings([])
      setNotice(failures.length ? `${uploaded.length}건을 저장했습니다. 사진 실패: ${failures.join(", ")}` : `${uploaded.length}건을 저장했습니다.`)
    } finally {
      setSaving(false)
    }
  }

  const batchInputClass = (row: BatchRow, field: BatchField, extra = "") => [
    "h-8 min-w-0 rounded-none px-2 text-xs",
    row.parsedFields.has(field) ? "bg-teal-50 dark:bg-teal-950/20" : "",
    invalid.has(cellKey(row.key, field)) ? "border-[var(--destructive)] ring-1 ring-[var(--destructive)]" : "",
    extra,
  ].filter(Boolean).join(" ")
  const batchSelectClass = (row: BatchRow, field: BatchField) => [
    "h-8 w-full min-w-0 rounded-none border border-[var(--input)] bg-transparent px-1 text-xs outline-none",
    row.parsedFields.has(field) ? "bg-teal-50 dark:bg-teal-950/20" : "",
    invalid.has(cellKey(row.key, field)) ? "border-[var(--destructive)] ring-1 ring-[var(--destructive)]" : "",
  ].filter(Boolean).join(" ")

  const editForm = <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {field("AN No. *", "anNo")}
        <div className="space-y-1"><Label>Request type</Label><Select value={form.requestType} onValueChange={(value) => setField("requestType", value as AnalysisRequest["requestType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ANALYSIS_REQUEST_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        {field("Requester *", "requester")}{field("Department", "department")}{field("Customer", "customer")}
        {field("Objective", "objective", ANALYSIS_OBJECTIVES)}{field("Source *", "source", ANALYSIS_SOURCES)}{field("Source code", "sourceCode", undefined, "text", "ex) HMP123456 / FL26090001")}
        {selectField("Season/Year", "season", ANALYSIS_SEASON_OPTIONS)}{field("Gender/Age", "gender", ANALYSIS_GENDERS)}{field("Brand", "brand")}
        {selectField("Construction", "construction", CONSTRUCTIONS)}{field("Contents", "contents")}{field("Weight (gsm)", "weight", undefined, "number")}
      </div>
      <div className="space-y-1"><Label>{requiredLabel("Request item *")}</Label><textarea className="min-h-20 w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent p-3 text-sm" value={form.description} onChange={(event) => setField("description", event.target.value)} /><div className="flex flex-wrap gap-1">{ANALYSIS_ITEMS.map((item, index) => <Button key={item} type="button" size="sm" variant="outline" className={QUICK_ITEM_COLORS[index]} onClick={() => setField("description", [form.description.trim(), item].filter(Boolean).join(", "))}>{item}</Button>)}</div></div>
      <div className="space-y-1"><Label>Comment</Label><textarea className="min-h-16 w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent p-3 text-sm" value={form.requesterComment} onChange={(event) => setField("requesterComment", event.target.value)} /></div>
      <div className="space-y-1"><Label>의뢰 사진</Label><input ref={imageInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} /><button type="button" className="flex min-h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/20 p-2 text-sm text-[var(--muted-foreground)] hover:border-teal-500/60" onClick={() => imageInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files?.[0] ?? null) }}>{photoUrl ? <img src={photoUrl} alt="의뢰 사진 미리보기" className="max-h-48 object-contain" /> : <span className="flex flex-col items-center gap-2"><Upload className="size-5" />클릭하거나 사진을 놓으세요</span>}</button>{photoUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => { setFile(null); setRemovePhoto(true) }}><Trash2 className="size-4" />사진 지우기</Button> : null}</div>
      {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
    </div>
    <aside className="rounded-lg border border-[var(--border)]/60 bg-[var(--muted)]/20 p-3"><p className="text-xs font-medium tracking-wide text-[var(--muted-foreground)]">이번에 저장한 의뢰</p><div className="mt-2 space-y-1">{savedThisTime.length ? savedThisTime.map((item) => <button type="button" key={item.id} className="w-full rounded-md px-2 py-2 text-left hover:bg-[var(--muted)]" onClick={() => { setForm({ ...item }); setFile(null); setRemovePhoto(false) }}><span className="block text-sm font-medium tabular-nums">{item.anNo}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{[item.sourceCode, item.construction].filter(Boolean).join(" · ") || "입력 정보 없음"}</span></button>) : <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">저장한 의뢰가 없습니다.</p>}</div></aside>
  </div>

  const batchTable = <div className="flex h-full min-h-0 flex-col space-y-3">
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-[var(--muted-foreground)]">Request item 빠른 입력</span>
      {ANALYSIS_ITEMS.map((item, index) => <Button key={item} type="button" size="sm" variant="outline" className={QUICK_ITEM_COLORS[index]} disabled={!focusedRowId} onClick={() => applyQuickItem(item)}>{item}</Button>)}
      <label className="ml-2 flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--muted-foreground)]"><Checkbox checked={fillDownDescription} onCheckedChange={(value) => setFillDownDescription(value === true)} />아래 줄에도 함께 채우기</label>
      {!focusedRowId ? <span className="ml-1 text-xs text-[var(--muted-foreground)]">Request item 칸을 먼저 선택하세요.</span> : null}
    </div>
    {batchError ? <p role="alert" className="shrink-0 text-sm text-[var(--destructive)]">{batchError}</p> : null}
    <div className="min-h-0 flex-1 overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-max min-w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-9" /><col className="w-14" /><col className="w-[105px]" /><col className="w-[95px]" />
          <col className="w-[80px]" /><col className="w-[130px]" /><col className="w-[90px]" /><col className="w-[95px]" />
          <col className="w-[105px]" /><col className="w-[100px]" /><col className="w-[110px]" /><col className="w-[145px]" />
          <col className="w-[165px]" /><col className="w-[60px]" /><col className="w-[105px]" /><col className="w-[185px]" />
          <col className="w-[70px]" /><col className="w-[60px]" /><col className="w-16" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[var(--muted)] text-[var(--muted-foreground)]">
          <tr>{["#", "사진", "AN No.", "Department", "Requester", "Customer", "Objective", "Source *", "Source code", "Season/Year", "Brand", "Construction", "Contents", "Weight", "Gender/Age", "Request item *", "Comment", "Urgent", ""].map((label, index) => <th key={`${label}-${index}`} className="h-9 whitespace-nowrap border-b border-r border-[var(--border)] px-1 text-center font-medium last:sticky last:right-0 last:z-10 last:border-l last:border-r-0 last:bg-[var(--muted)]">{requiredLabel(label)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowInvalid = REQUIRED_BATCH_FIELDS.some((field) => invalid.has(cellKey(row.key, field)))
            const selectItems = (current: string, choices: readonly string[]) => current && !choices.includes(current) ? [current, ...choices] : choices
            return <tr key={row.key} className={`align-top ${rowInvalid ? "bg-rose-50/40 dark:bg-rose-950/10" : ""}`}>
              <td className="border-b border-r border-[var(--border)] px-1 py-3 text-center text-[var(--muted-foreground)]">{index + 1}</td>
              <td className="border-b border-r border-[var(--border)] p-1"><BatchImageCell file={row.image} highlighted={row.parsedFields.has("image")} onChoose={(next) => chooseBatchImage(row.key, next)} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><div className="flex h-8 items-center justify-center bg-[var(--muted)]/30 px-2 font-mono text-[11px] text-[var(--muted-foreground)]">{displayNumbers.get(row.key)}</div></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Department`} value={row.form.department} onChange={(event) => setBatchField(row.key, "department", event.target.value)} className={batchInputClass(row, "department")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Requester`} value={row.form.requester} onChange={(event) => setBatchField(row.key, "requester", event.target.value)} className={batchInputClass(row, "requester")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Customer`} value={row.form.customer} onChange={(event) => setBatchField(row.key, "customer", event.target.value)} className={batchInputClass(row, "customer")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><select aria-label={`${index + 1}행 Objective`} value={row.form.objective} onChange={(event) => setBatchField(row.key, "objective", event.target.value)} className={batchSelectClass(row, "objective")}><option value="">선택 안 함</option>{ANALYSIS_OBJECTIVES.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Source`} list="analysis-batch-sources" value={row.form.source} onChange={(event) => setBatchField(row.key, "source", event.target.value)} className={batchInputClass(row, "source")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Source code`} placeholder="ex) HMP123456 / FL26090001" value={row.form.sourceCode} onChange={(event) => setBatchField(row.key, "sourceCode", event.target.value)} className={batchInputClass(row, "sourceCode", "placeholder:text-[var(--muted-foreground)]/60")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><select aria-label={`${index + 1}행 Season/Year`} value={row.form.season} onChange={(event) => setBatchField(row.key, "season", event.target.value)} className={batchSelectClass(row, "season")}><option value="">선택 안 함</option>{selectItems(row.form.season, ANALYSIS_SEASON_OPTIONS).map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Brand`} value={row.form.brand} onChange={(event) => setBatchField(row.key, "brand", event.target.value)} className={batchInputClass(row, "brand")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><select aria-label={`${index + 1}행 Construction`} value={row.form.construction} onChange={(event) => setBatchField(row.key, "construction", event.target.value)} className={batchSelectClass(row, "construction")}><option value="">선택 안 함</option>{selectItems(row.form.construction, CONSTRUCTIONS).map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Contents`} value={row.form.contents} onChange={(event) => setBatchField(row.key, "contents", event.target.value)} className={batchInputClass(row, "contents")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Weight`} type="number" value={row.form.weight} onChange={(event) => setBatchField(row.key, "weight", event.target.value === "" ? "" : Number(event.target.value))} className={batchInputClass(row, "weight")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Gender/Age`} list="analysis-batch-genders" value={row.form.gender} onChange={(event) => setBatchField(row.key, "gender", event.target.value)} className={batchInputClass(row, "gender")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Request item`} value={row.form.description} onFocus={() => setFocusedRowId(row.key)} onChange={(event) => setBatchField(row.key, "description", event.target.value)} className={batchInputClass(row, "description")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Comment`} value={row.form.requesterComment} onChange={(event) => setBatchField(row.key, "requesterComment", event.target.value)} className={batchInputClass(row, "requesterComment")} /></td>
              <td className="border-b border-r border-[var(--border)] p-1 text-center"><Checkbox aria-label={`${index + 1}행 긴급 요청`} checked={row.form.requestType === "Urgent"} onCheckedChange={(value) => setBatchField(row.key, "requestType", value === true ? "Urgent" : "Normal")} /></td>
              <td className="sticky right-0 z-[1] border-b border-l border-[var(--border)] bg-[var(--card)] p-1"><div className="flex h-8 items-center justify-center"><button type="button" title="줄 삭제" aria-label={`${index + 1}행 삭제`} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]" onClick={() => removeRow(row.key)}><Trash2 className="size-3.5" /></button></div></td>
            </tr>
          })}
        </tbody>
      </table>
      <datalist id="analysis-batch-sources">{ANALYSIS_SOURCES.map((value) => <option key={value} value={value} />)}</datalist>
      <datalist id="analysis-batch-genders">{ANALYSIS_GENDERS.map((value) => <option key={value} value={value} />)}</datalist>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={appendRow}><Plus className="size-4" />줄 추가</Button>
        <input ref={excelInput} type="file" className="hidden" accept=".xlsx,.xlsm,.xls" onChange={(event) => void loadExcel(event.target.files?.[0] ?? null)} />
        <Button type="button" size="sm" variant="outline" disabled={importing || saving} onClick={() => excelInput.current?.click()}><FileSpreadsheet className="size-4" />{importing ? "읽는 중…" : "엑셀 업로드"}</Button>
      </div>
      <p className="text-sm text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">{activeRows.length}건</strong> 저장 예정</p>
    </div>
    {importWarnings.length ? <p className="shrink-0 text-xs text-amber-700 dark:text-amber-300">{importWarnings.join(" · ")}</p> : null}
  </div>

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}><DialogContent className={record ? "w-[96vw] max-w-5xl" : "flex max-h-[88vh] w-[min(96vw,1680px)] max-w-none flex-col"}>
    <DialogHeader><DialogTitle>{record ? "의뢰 정보 수정" : "새 분석 의뢰"}</DialogTitle><DialogDescription>의뢰는 작성 상태로 저장됩니다. 목록에서 선택한 뒤 의뢰를 확정하세요.</DialogDescription></DialogHeader>
    <DialogBody className={record ? "space-y-4" : "flex min-h-0 flex-col overflow-hidden"}>
      {record ? editForm : batchTable}
      {notice ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
    </DialogBody>
    <DialogFooter>
      <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{record ? "닫기" : "취소"}</Button>
      {record
        ? <Button type="button" disabled={Boolean(error) || saving} onClick={() => void saveOne(false)}>{saving ? "저장 중…" : "저장"}</Button>
        : <Button type="button" disabled={saving || activeRows.length === 0} onClick={() => void saveBatch()}>{saving ? "저장 중…" : `${activeRows.length}건 저장`}</Button>}
    </DialogFooter>
  </DialogContent></Dialog>
}
