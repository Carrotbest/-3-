import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, FileSpreadsheet, ImagePlus, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseAnalysisWorkbook, type AnalysisImportRow } from "@/data/analysis-import"
import { CONSTRUCTIONS } from "@/data/constructions"
import { DD_SEASON_OPTIONS } from "@/data/dd-workflow"
import { ANALYSIS_GENDERS, ANALYSIS_ITEMS, ANALYSIS_OBJECTIVES, ANALYSIS_SOURCES, AN_NO_PATTERN, blankAnalysisRequest, DEFAULT_DEPARTMENT, isDuplicateAnNo } from "@/data/fabric-analysis"
import { deleteRequestImage, requestImageUrl, uploadRequestImage, validateRequestImage } from "@/data/request-image"
import { ANALYSIS_REQUEST_TYPES, type AnalysisRequest } from "@/data/schema"
import { saveAnalysisRequests, useAppStore } from "@/store/useAppStore"

type Props = { open: boolean; onOpenChange: (open: boolean) => void; record?: AnalysisRequest | null; requester: string; requesterEmail: string; onSaved?: (record: AnalysisRequest) => void }
const MAX_ANALYSIS_IMAGE_SIZE = 20 * 1024 * 1024
const EMPTY_SELECT = "__empty__"

function ImportImageThumb({ file }: { file?: File }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    if (!file) { setUrl(""); return }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url ? <img src={url} alt="가져온 사진" className="size-9 rounded-md object-cover ring-1 ring-[var(--border)]/60" /> : <span className="flex size-9 items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]"><ImagePlus className="size-4" /></span>
}

export function AnalysisRequestDialog({ open, onOpenChange, record, requester, requesterEmail, onSaved }: Props) {
  const [form, setForm] = useState<AnalysisRequest | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState("")
  const [removePhoto, setRemovePhoto] = useState(false)
  const [savedThisTime, setSavedThisTime] = useState<AnalysisRequest[]>([])
  const [importRows, setImportRows] = useState<AnalysisImportRow[]>([])
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const excelInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setForm(record ? { ...record } : blankAnalysisRequest({ requester, requesterEmail, list: useAppStore.getState().analysisRequests }))
    setFile(null); setRemovePhoto(false); setSavedThisTime([]); setImportRows([]); setImportWarnings([]); setNotice("")
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
    if (!form.requester.trim() || !form.description.trim()) return "Requester와 Request item은 필수입니다."
    if (!form.construction.trim() && !form.contents.trim()) return "Construction과 Contents 중 하나 이상 입력하세요."
    return ""
  }, [form])
  if (!form) return null

  const setField = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => setForm((current) => current ? { ...current, [key]: value } : current)
  const field = (label: string, key: keyof AnalysisRequest, options?: readonly string[], type = "text", placeholder?: string) => <div className="space-y-1"><Label>{label}</Label><Input type={type} list={options ? `analysis-${String(key)}` : undefined} placeholder={placeholder} className={placeholder ? "placeholder:text-[var(--muted-foreground)]/60" : undefined} value={String(form[key] ?? "")} onChange={(event) => setField(key, (type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value) as never)} />{options ? <datalist id={`analysis-${String(key)}`}>{options.map((item) => <option key={item} value={item} />)}</datalist> : null}</div>
  const selectField = (label: string, key: "season" | "construction", choices: readonly string[]) => {
    const current = form[key]
    const items = current && !choices.includes(current) ? [current, ...choices] : choices
    return <div className="space-y-1"><Label>{label}</Label><Select value={current || EMPTY_SELECT} onValueChange={(value) => setField(key, value === EMPTY_SELECT ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={EMPTY_SELECT}>선택 안 함</SelectItem>{items.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
  }

  const chooseImage = (next: File | null) => {
    const invalid = next ? validateRequestImage(next, MAX_ANALYSIS_IMAGE_SIZE) : null
    setNotice(invalid ?? "")
    setFile(invalid ? null : next)
    if (next && !invalid) setRemovePhoto(false)
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

  const loadExcel = async (selectedFile: File | null) => {
    if (!selectedFile) return
    setImporting(true); setNotice("")
    try {
      const parsed = await parseAnalysisWorkbook(selectedFile)
      setImportRows(parsed.rows); setImportWarnings(parsed.warnings)
      if (!parsed.rows.length) setNotice(parsed.warnings[0] ?? "가져올 행이 없습니다.")
    } catch (importError) { setNotice(`엑셀을 읽지 못했습니다. ${importError instanceof Error ? importError.message : ""}`) }
    finally { setImporting(false); if (excelInput.current) excelInput.current.value = "" }
  }

  const saveImported = async () => {
    if (!importRows.length) return
    setSaving(true); setNotice("")
    const current = useAppStore.getState().analysisRequests
    const working = [...current]
    const added = importRows.map((row) => {
      const base = blankAnalysisRequest({ requester, requesterEmail, list: working })
      const next: AnalysisRequest = {
        ...base, department: row.department || DEFAULT_DEPARTMENT, customer: row.customer || base.customer,
        objective: row.objective, description: row.description, requesterComment: row.requesterComment,
        source: row.source, sourceCode: row.sourceCode, season: row.season, gender: row.gender, brand: row.brand,
        construction: row.construction, contents: row.contents, weight: row.weight, requestType: row.requestType,
      }
      working.push(next)
      return next
    })
    saveAnalysisRequests(working)
    const uploaded = [...added]
    const failures: string[] = []
    for (let index = 0; index < importRows.length; index += 1) {
      const image = importRows[index].image
      if (!image) continue
      try {
        uploaded[index] = { ...uploaded[index], ...(await uploadRequestImage(`analysis-${uploaded[index].id}`, image, { maxSourceBytes: MAX_ANALYSIS_IMAGE_SIZE, profile: "analysis" })), updatedAt: new Date().toISOString() }
      } catch { failures.push(uploaded[index].anNo) }
    }
    const uploadedById = new Map(uploaded.map((item) => [item.id, item]))
    saveAnalysisRequests(useAppStore.getState().analysisRequests.map((item) => uploadedById.get(item.id) ?? item))
    setSavedThisTime((items) => [...items, ...uploaded])
    setImportRows([]); setImportWarnings([]); setSaving(false)
    setNotice(failures.length ? `${uploaded.length}건을 저장했습니다. 사진 실패: ${failures.join(", ")}` : `${uploaded.length}건을 저장했습니다.`)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[96vw] max-w-5xl">
    <DialogHeader><DialogTitle>{record ? "의뢰 정보 수정" : "새 분석 의뢰"}</DialogTitle><DialogDescription>의뢰는 작성 상태로 저장됩니다. 목록에서 선택한 뒤 의뢰를 확정하세요.</DialogDescription></DialogHeader>
    <DialogBody className="space-y-4">
      {importRows.length ? <section className="space-y-3">
        <div className="flex items-center justify-between"><div><h3 className="font-medium">가져온 {importRows.length}건</h3><p className="text-xs text-[var(--muted-foreground)]">내용을 확인한 뒤 저장하세요.</p></div><Button type="button" onClick={() => void saveImported()} disabled={saving}>{importRows.length}건 저장</Button></div>
        <div className="max-h-[430px] overflow-auto rounded-lg border border-[var(--border)]/60"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-[var(--muted)]"><tr>{["사진", "Source code", "Construction", "Contents", "Weight", "Season", "확인"].map((item) => <th key={item} className="px-3 py-2 font-medium">{item}</th>)}</tr></thead><tbody>{importRows.map((row, index) => <tr key={`${row.sourceCode}-${index}`} className="border-t border-[var(--border)]/50"><td className="px-3 py-2"><ImportImageThumb file={row.image} /></td><td className="px-3 py-2">{row.sourceCode || "-"}</td><td className="px-3 py-2">{row.construction || "-"}</td><td className="px-3 py-2">{row.contents || "-"}</td><td className="px-3 py-2">{row.weight === "" ? "-" : row.weight}</td><td className="px-3 py-2">{row.season || "-"}</td><td className="px-3 py-2">{row.warnings.length ? <span title={row.warnings.join("\n")} className="text-amber-600"><AlertTriangle className="size-4" /></span> : ""}</td></tr>)}</tbody></table></div>
        {importWarnings.length ? <p className="text-xs text-amber-700 dark:text-amber-300">{importWarnings.join(" · ")}</p> : null}
        <Button type="button" variant="outline" onClick={() => { setImportRows([]); setImportWarnings([]) }}>미리보기 닫기</Button>
      </section> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {field("AN No. *", "anNo")}
            <div className="space-y-1"><Label>Request type</Label><Select value={form.requestType} onValueChange={(value) => setField("requestType", value as AnalysisRequest["requestType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ANALYSIS_REQUEST_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            {field("Requester *", "requester")}{field("Department", "department")}{field("Customer", "customer")}
            {field("Objective", "objective", ANALYSIS_OBJECTIVES)}{field("Source", "source", ANALYSIS_SOURCES)}{field("Source code", "sourceCode", undefined, "text", "ex) HMP123456 / FL26090001")}
            {selectField("Season/Year", "season", DD_SEASON_OPTIONS)}{field("Gender/Age", "gender", ANALYSIS_GENDERS)}{field("Brand", "brand")}
            {selectField("Construction", "construction", CONSTRUCTIONS)}{field("Contents", "contents")}{field("Weight (gsm)", "weight", undefined, "number")}
          </div>
          <div className="space-y-1"><Label>Request item *</Label><textarea className="min-h-20 w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent p-3 text-sm" value={form.description} onChange={(event) => setField("description", event.target.value)} /><div className="flex flex-wrap gap-1">{ANALYSIS_ITEMS.map((item) => <Button key={item} type="button" size="sm" variant="outline" onClick={() => setField("description", [form.description.trim(), item].filter(Boolean).join(", "))}>{item}</Button>)}</div></div>
          <div className="space-y-1"><Label>Comment</Label><textarea className="min-h-16 w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent p-3 text-sm" value={form.requesterComment} onChange={(event) => setField("requesterComment", event.target.value)} /></div>
          <div className="space-y-1"><Label>의뢰 사진</Label><input ref={imageInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} /><button type="button" className="flex min-h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/20 p-2 text-sm text-[var(--muted-foreground)] hover:border-teal-500/60" onClick={() => imageInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files?.[0] ?? null) }}>{photoUrl ? <img src={photoUrl} alt="의뢰 사진 미리보기" className="max-h-48 object-contain" /> : <span className="flex flex-col items-center gap-2"><Upload className="size-5" />클릭하거나 사진을 놓으세요</span>}</button>{photoUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => { setFile(null); setRemovePhoto(true) }}><Trash2 className="size-4" />사진 지우기</Button> : null}</div>
          {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
        </div>
        <aside className="rounded-lg border border-[var(--border)]/60 bg-[var(--muted)]/20 p-3"><p className="text-xs font-medium tracking-wide text-[var(--muted-foreground)]">이번에 저장한 의뢰</p><div className="mt-2 space-y-1">{savedThisTime.length ? savedThisTime.map((item) => <button type="button" key={item.id} className="w-full rounded-md px-2 py-2 text-left hover:bg-[var(--muted)]" onClick={() => { setForm({ ...item }); setFile(null); setRemovePhoto(false) }}><span className="block text-sm font-medium tabular-nums">{item.anNo}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{[item.sourceCode, item.construction].filter(Boolean).join(" · ") || "입력 정보 없음"}</span></button>) : <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">저장한 의뢰가 없습니다.</p>}</div></aside>
      </div>}
      {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
    </DialogBody>
    <DialogFooter><input ref={excelInput} type="file" className="hidden" accept=".xlsx,.xlsm,.xls" onChange={(event) => void loadExcel(event.target.files?.[0] ?? null)} /><Button type="button" variant="outline" disabled={importing || saving} onClick={() => excelInput.current?.click()}><FileSpreadsheet className="size-4" />{importing ? "읽는 중…" : "엑셀 업로드"}</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>{!importRows.length ? <>{!record ? <Button type="button" variant="outline" disabled={Boolean(error) || saving} onClick={() => void saveOne(true)}>저장하고 추가</Button> : null}<Button type="button" disabled={Boolean(error) || saving} onClick={() => void saveOne(false)}>{saving ? "저장 중…" : "저장"}</Button></> : null}</DialogFooter>
  </DialogContent></Dialog>
}
