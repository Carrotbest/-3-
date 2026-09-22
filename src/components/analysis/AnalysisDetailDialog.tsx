import { useEffect, useRef, useState } from "react"
import { Check, ImagePlus, Loader2, Mail, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { openAnalysisFinishedMail } from "@/data/analysis-mail"
import { CONSTRUCTIONS } from "@/data/constructions"
import { analysisLeadDays, analysisTodayValue } from "@/data/fabric-analysis"
import type { MailAddress } from "@/data/mail-draft"
import { deleteRequestImage, requestImageUrl, uploadRequestImage, validateRequestImage } from "@/data/request-image"
import type { AnalysisRequest, AnalysisState } from "@/data/schema"

type Props = { record: AnalysisRequest | null; canEdit: boolean; defaultInCharge: string; recipients: readonly MailAddress[]; onOpenChange: (open: boolean) => void; onSave: (record: AnalysisRequest) => void; onEditRequest: (record: AnalysisRequest) => void }
type SaveStatus = "idle" | "saving" | "saved"
const MAX_ANALYSIS_IMAGE_SIZE = 20 * 1024 * 1024
const EMPTY_SELECT = "__empty__"

const stateClass: Record<AnalysisState, string> = {
  작성: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  의뢰: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  완료: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  취소: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}

function RemoteImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let live = true
    setUrl("")
    void requestImageUrl(path).then((next) => { if (live) setUrl(next ?? "") })
    return () => { live = false }
  }, [path])
  return url ? <a href={url} target="_blank" rel="noreferrer" className="block h-full"><img src={url} alt={alt} className={className} /></a> : <div className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">불러오는 중…</div>
}

export function AnalysisDetailDialog({ record, canEdit, defaultInCharge, recipients, onOpenChange, onSave, onEditRequest }: Props) {
  const [draft, setDraft] = useState<AnalysisRequest | null>(record)
  const [notice, setNotice] = useState("")
  const [working, setWorking] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [completionNotice, setCompletionNotice] = useState<"visible" | "fading" | null>(null)
  const [completionMessage, setCompletionMessage] = useState("완료 처리하였습니다")
  const requestInput = useRef<HTMLInputElement>(null)
  const resultInput = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<number | null>(null)
  const saveTimer = useRef<number | null>(null)
  const completionFadeTimer = useRef<number | null>(null)
  const completionCloseTimer = useRef<number | null>(null)
  const completionRun = useRef(0)
  const clearTimers = () => {
    for (const timer of [noticeTimer, saveTimer, completionFadeTimer, completionCloseTimer]) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => {
    clearTimers()
    setDraft(record ? { ...record, resultImages: [...(record.resultImages ?? [])], inCharge: record.inCharge || defaultInCharge, finishedAt: record.finishedAt || analysisTodayValue(), weightRnd: record.weightRnd === "" ? record.weight : record.weightRnd } : null)
    setNotice("")
    setSaveStatus("idle")
    setCompletionNotice(null)
    setCompletionMessage("완료 처리하였습니다")
    completionRun.current += 1
  }, [record?.id, defaultInCharge])
  useEffect(() => () => { clearTimers(); completionRun.current += 1 }, [])
  if (!record || !draft) return null

  const markResultChanged = () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = null
    setSaveStatus("idle")
  }
  const setField = <K extends keyof AnalysisRequest>(key: K, value: AnalysisRequest[K]) => {
    markResultChanged()
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  const save = (patch: Partial<AnalysisRequest> = {}) => {
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() }
    setDraft(next); onSave(next)
    return next
  }
  const showNotice = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = window.setTimeout(() => { setNotice(""); noticeTimer.current = null }, 6000)
  }
  const saveResult = () => {
    setSaveStatus("saving")
    save()
    saveTimer.current = window.setTimeout(() => { setSaveStatus("saved"); saveTimer.current = null }, 600)
  }
  const completeAnalysis = () => {
    const next = save({ state: "완료", finishedAt: draft.finishedAt || analysisTodayValue() })
    const run = ++completionRun.current
    setCompletionMessage("완료 처리하였습니다")
    void openAnalysisFinishedMail([next], recipients).then((result) => {
      if (completionRun.current !== run) return
      setCompletionMessage(result === "mailto"
        ? "완료 처리하였습니다. 메일 본문에서 Ctrl+V 하세요."
        : "완료 처리하였습니다. 메일 파일을 받았습니다.")
    })
    setCompletionNotice("visible")
    completionFadeTimer.current = window.setTimeout(() => { setCompletionNotice("fading"); completionFadeTimer.current = null }, 900)
    completionCloseTimer.current = window.setTimeout(() => { completionCloseTimer.current = null; completionRun.current += 1; onOpenChange(false) }, 1200)
  }
  const finishedMail = () => {
    void openAnalysisFinishedMail([record], recipients).then((result) => showNotice(result === "mailto"
      ? `본문을 복사했습니다. Outlook 새 메일 본문 첫 줄에서 Ctrl+V 하세요. 서명은 그 아래 그대로 남습니다.${recipients.length ? "" : " 받는 사람 목록이 비어 있습니다."}`
      : "클립보드 복사에 실패해 .eml 파일을 내려받았습니다."))
  }
  const chooseRequestImage = async (file: File | null) => {
    if (!file) return
    const invalid = validateRequestImage(file, MAX_ANALYSIS_IMAGE_SIZE)
    if (invalid) { showNotice(invalid); return }
    setWorking(true)
    try { save(await uploadRequestImage(`analysis-${draft.id}`, file, { maxSourceBytes: MAX_ANALYSIS_IMAGE_SIZE, profile: "analysis" })); markResultChanged() }
    catch (error) { showNotice(error instanceof Error ? error.message : "사진을 올리지 못했습니다.") }
    finally { setWorking(false); if (requestInput.current) requestInput.current.value = "" }
  }
  const removeRequestImage = async () => {
    setWorking(true)
    try { await deleteRequestImage(`analysis-${draft.id}`); save({ imagePath: undefined, imageThumbPath: undefined }); markResultChanged() }
    catch { showNotice("사진을 지우지 못했습니다.") }
    finally { setWorking(false) }
  }
  const addResultImage = async (file: File | null) => {
    if (!file || (draft.resultImages?.length ?? 0) >= 4) return
    const invalid = validateRequestImage(file, MAX_ANALYSIS_IMAGE_SIZE)
    if (invalid) { showNotice(invalid); return }
    setWorking(true)
    const key = Date.now().toString(36)
    try {
      const paths = await uploadRequestImage(`analysis-${draft.id}-r${key}`, file, { maxSourceBytes: MAX_ANALYSIS_IMAGE_SIZE, profile: "analysis" })
      save({ resultImages: [...(draft.resultImages ?? []), { key, ...paths }] })
      markResultChanged()
    } catch (error) { showNotice(error instanceof Error ? error.message : "분석 사진을 올리지 못했습니다.") }
    finally { setWorking(false); if (resultInput.current) resultInput.current.value = "" }
  }
  const removeResultImage = async (key: string) => {
    setWorking(true)
    try { await deleteRequestImage(`analysis-${draft.id}-r${key}`); save({ resultImages: (draft.resultImages ?? []).filter((item) => item.key !== key) }); markResultChanged() }
    catch { showNotice("분석 사진을 지우지 못했습니다.") }
    finally { setWorking(false) }
  }

  const details: Array<[string, string | number]> = [["Requester", record.requester], ["Department", record.department], ["Customer", record.customer], ["Objective", record.objective], ["Request item", record.description], ["Comment", record.requesterComment], ["Source", record.source], ["Source code", record.sourceCode], ["Season/Year", record.season], ["Gender/Age", record.gender], ["Brand", record.brand], ["Construction", record.construction], ["Contents", record.contents], ["Weight", record.weight]]
  const constructionItems = draft.constructionRnd && !CONSTRUCTIONS.includes(draft.constructionRnd) ? [draft.constructionRnd, ...CONSTRUCTIONS] : CONSTRUCTIONS
  const leadDays = analysisLeadDays(record)
  const completionPending = completionNotice !== null
  const controlsDisabled = !canEdit || completionPending
  const resultLabel = saveStatus === "saving" ? <><Loader2 className="animate-spin" />저장 중…</> : saveStatus === "saved" ? <><Check />저장됨</> : "결과 저장"
  const resultSaveClass = saveStatus === "saved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300" : "border-teal-600/40 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"

  return <Dialog open={Boolean(record)} onOpenChange={(open) => { if (!completionPending) onOpenChange(open) }}><DialogContent className="w-[96vw] max-w-6xl">
    {completionNotice ? <div className={`pointer-events-none absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${completionNotice === "fading" ? "opacity-0" : "opacity-100"}`}><div className="flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-medium text-white shadow-lg"><Check className="size-5" />{completionMessage}</div></div> : null}
    <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-xl tabular-nums">{record.anNo}</DialogTitle><span className={`rounded-full px-2 py-0.5 text-[11px] ${stateClass[record.state]}`}>{record.state}</span>{record.requestType === "Urgent" ? <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">Urgent</span> : null}</div><DialogDescription>의뢰일 {record.requestedAt || "-"}{leadDays == null ? "" : ` · ${leadDays}일 소요`}</DialogDescription></DialogHeader>
    <DialogBody className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <section className="rounded-lg border border-[var(--border)]/60 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">의뢰 사진</h3>{canEdit ? <div className="flex gap-1"><input ref={requestInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseRequestImage(event.target.files?.[0] ?? null)} /><Button type="button" size="sm" variant="ghost" disabled={working || completionPending} onClick={() => requestInput.current?.click()}><Upload className="size-4" />변경</Button>{draft.imagePath ? <Button type="button" size="sm" variant="ghost" disabled={working || completionPending} onClick={() => void removeRequestImage()}><Trash2 className="size-4" /></Button> : null}</div> : null}</div><div className="aspect-[4/3] overflow-hidden rounded-md bg-[var(--muted)]/30">{draft.imagePath ? <RemoteImage path={draft.imagePath} alt={`${record.anNo} 의뢰 사진`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">사진 없음</div>}</div></section>
          <dl className="grid grid-cols-2 gap-x-4">{details.map(([label, value]) => <div key={label} className="border-b border-[var(--border)]/50 py-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-[13px]">{String(value || "-")}</dd></div>)}</dl>
        </div>
        <div className="space-y-4">
          <section className="rounded-lg border border-[var(--border)]/60 p-4"><h3 className="mb-3 text-sm font-medium">분석 결과</h3><div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1"><Label>In charge</Label><Input disabled={controlsDisabled} value={draft.inCharge} onChange={(event) => setField("inCharge", event.target.value)} /></div>
            <div className="space-y-1"><Label>Construction (RND)</Label><Select disabled={controlsDisabled} value={draft.constructionRnd || EMPTY_SELECT} onValueChange={(value) => setField("constructionRnd", value === EMPTY_SELECT ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={EMPTY_SELECT}>선택 안 함</SelectItem>{constructionItems.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Weight (RND)</Label><Input disabled={controlsDisabled} type="number" value={draft.weightRnd} onChange={(event) => setField("weightRnd", event.target.value === "" ? "" : Number(event.target.value))} /></div>
            <div className="space-y-1"><Label>완료일</Label><Input disabled={controlsDisabled} type="date" value={draft.finishedAt} onChange={(event) => setField("finishedAt", event.target.value)} /></div>
          </div><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label><span className="mr-1.5 inline-block size-1.5 rounded-full bg-teal-500 align-middle" />Yarn description</Label><textarea disabled={controlsDisabled} className="min-h-24 w-full rounded-[var(--radius)] border border-teal-500/30 bg-teal-500/[0.06] p-3 text-sm placeholder:text-[var(--muted-foreground)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:bg-teal-400/10" value={draft.yarnDescription} onChange={(event) => setField("yarnDescription", event.target.value)} /></div><div className="space-y-1"><Label><span className="mr-1.5 inline-block size-1.5 rounded-full bg-teal-500 align-middle" />Comment (RND)</Label><textarea disabled={controlsDisabled} className="min-h-24 w-full rounded-[var(--radius)] border border-teal-500/30 bg-teal-500/[0.06] p-3 text-sm placeholder:text-[var(--muted-foreground)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 disabled:opacity-60 dark:bg-teal-400/10" value={draft.commentRnd} onChange={(event) => setField("commentRnd", event.target.value)} /></div></div></section>
          <section className="rounded-lg border border-[var(--border)]/60 p-4"><div className="mb-3"><h3 className="text-sm font-medium">분석 사진</h3><p className="text-xs text-[var(--muted-foreground)]">단면, 조직도 등 최대 4장</p></div><input ref={resultInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void addResultImage(event.target.files?.[0] ?? null)} /><div className="grid grid-cols-2 gap-3">{(draft.resultImages ?? []).map((item) => <div key={item.key} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-[var(--muted)]/30"><RemoteImage path={item.imagePath} alt="분석 사진" className="h-full w-full object-contain" />{canEdit ? <button type="button" disabled={working || completionPending} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity disabled:pointer-events-none group-hover:opacity-100" onClick={() => void removeResultImage(item.key)} aria-label="분석 사진 지우기"><Trash2 className="size-4" /></button> : null}</div>)}{canEdit && (draft.resultImages?.length ?? 0) < 4 ? <button type="button" disabled={working || completionPending} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] text-xs text-[var(--muted-foreground)] hover:border-teal-500/60 disabled:pointer-events-none disabled:opacity-50" onClick={() => resultInput.current?.click()}><ImagePlus className="size-5" />사진 추가</button> : null}</div></section>
        </div>
      </div>
      {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
    </DialogBody>
    <DialogFooter className="justify-between"><div>{record.state === "완료" ? <Button type="button" variant="outline" disabled={completionPending} className="border-teal-600/40 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300" onClick={finishedMail}><Mail />완료 메일</Button> : null}</div><div className="flex flex-wrap gap-2">{canEdit ? <><Button type="button" variant="ghost" disabled={completionPending} onClick={() => onEditRequest(record)}>의뢰 정보 수정</Button><Button type="button" variant="outline" disabled={working || completionPending || saveStatus === "saving"} className={resultSaveClass} onClick={saveResult}>{resultLabel}</Button>{record.state === "의뢰" ? <Button type="button" disabled={working || completionPending || (!draft.yarnDescription.trim() && !draft.commentRnd.trim())} className="bg-teal-600 text-white hover:bg-teal-700" onClick={completeAnalysis}>완료 처리</Button> : null}{record.state === "완료" ? <Button type="button" variant="outline" disabled={working || completionPending} className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300" onClick={() => save({ state: "의뢰", finishedAt: "" })}>완료 되돌리기</Button> : null}{record.state === "작성" || record.state === "의뢰" ? <Button type="button" variant="outline" disabled={working || completionPending} className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10" onClick={() => { if (confirm("이 의뢰를 취소할까요?")) save({ state: "취소" }) }}>의뢰 취소</Button> : null}</> : null}<Button type="button" variant="ghost" disabled={completionPending} onClick={() => onOpenChange(false)}>닫기</Button></div></DialogFooter>
  </DialogContent></Dialog>
}
