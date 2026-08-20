import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react"
import { FileText, Paperclip, Trash2, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { ChemicalAttachment, ChemicalCategory, ChemicalItem } from "@/data/chemical"
import { MAX_ATTACHMENTS_PER_ITEM, MAX_ATTACHMENT_SIZE, portfolioStore, validateAttachment } from "@/data/portfolio-store"
import { httpsMaterialLink, MEMBERS } from "@/data/schema"
import { cn } from "@/lib/utils"

const NEW_CATEGORY = "__new_category__"
const STATES = ["개발완료", "개발중", "미착수", "Drop"] as const
const TEXTAREA_CLASS = "w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]"

interface FormValues {
  category: string
  newCategory: string
  newCategoryKo: string
  chemical: string
  state: string
  description: string
  fabrication: string
  market: string
  flNos: string
  passNote: string
  owner: string
  link: string
}

interface PendingFile {
  key: string
  file: File
  url: string | null
}

interface FormErrors {
  category?: string
  chemical?: string
  state?: string
  link?: string
  attachments?: string
  form?: string
}

const emptyForm = (): FormValues => ({
  category: "",
  newCategory: "",
  newCategoryKo: "",
  chemical: "",
  state: "",
  description: "",
  fabrication: "",
  market: "",
  flNos: "",
  passNote: "",
  owner: "",
  link: "",
})

const valuesOf = (item: ChemicalItem | null): FormValues => item ? {
  category: item.category,
  newCategory: "",
  newCategoryKo: "",
  chemical: item.chemical,
  state: item.state,
  description: item.description,
  fabrication: item.fabrication,
  market: item.market,
  flNos: item.flNos.join(", "),
  passNote: item.passNotes.join(" · "),
  owner: item.owner ?? "",
  link: item.link ?? "",
} : emptyForm()

const fileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`
const formatBytes = (size: number): string => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(1)}MB`
  : `${Math.max(1, Math.round(size / 1024))}KB`
const splitFlNos = (value: string): string[] => [...new Set(value
  .split(/[,\n]+/)
  .map((entry) => entry.normalize("NFKC").trim().toUpperCase())
  .filter(Boolean))]
const isValidFl = (value: string): boolean => /^FL\d{8,10}$/.test(value)

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--destructive)]"> *</span>
}

function StoredAttachmentPreview({ attachment }: { attachment: ChemicalAttachment }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    void portfolioStore.getAttachmentUrl(attachment.id).then((next) => {
      objectUrl = next
      if (active) setUrl(next)
      else if (next) URL.revokeObjectURL(next)
    })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.id])
  return attachment.kind === "image" && url
    ? <img src={url} alt="" className="size-12 rounded-[var(--radius)] object-cover" />
    : <span className="flex size-12 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--muted-foreground)]">{attachment.kind === "pdf" ? <FileText aria-hidden="true" /> : <Paperclip aria-hidden="true" />}</span>
}

export function PortfolioForm({ open, item = null, categories, onOpenChange }: {
  open: boolean
  item?: ChemicalItem | null
  categories: ChemicalCategory[]
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [existingAttachments, setExistingAttachments] = useState<ChemicalAttachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [attachmentBlocked, setAttachmentBlocked] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLButtonElement>(null)
  const newCategoryRef = useRef<HTMLInputElement>(null)
  const chemicalRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef<HTMLButtonElement>(null)
  const pendingRef = useRef<PendingFile[]>([])
  const readOnly = Boolean(item && item.source !== "web")
  const flNos = splitFlNos(form.flNos)

  const revokePending = () => {
    pendingRef.current.forEach((entry) => { if (entry.url) URL.revokeObjectURL(entry.url) })
    pendingRef.current = []
  }

  useEffect(() => {
    pendingRef.current = pendingFiles
  }, [pendingFiles])

  useEffect(() => () => revokePending(), [])

  useEffect(() => {
    if (!open) return
    revokePending()
    setForm(valuesOf(item))
    setExistingAttachments(item?.attachments ?? [])
    setPendingFiles([])
    setAttachmentBlocked(false)
    setErrors({})
    setSaving(false)
  }, [item, open])

  const change = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined, ...(key === "newCategory" ? { category: undefined } : {}), form: undefined }))
  }

  const addFiles = (files: File[]) => {
    const remaining = MAX_ATTACHMENTS_PER_ITEM - existingAttachments.length - pendingFiles.length
    if (remaining <= 0 || files.length > remaining) {
      setErrors((current) => ({ ...current, attachments: "항목당 첨부는 최대 6개입니다." }))
      setAttachmentBlocked(true)
      return
    }
    const accepted: PendingFile[] = []
    let error = ""
    const known = new Set(pendingFiles.map((entry) => entry.key))
    for (const file of files) {
      const validation = validateAttachment(file)
      if (validation) {
        error = `${file.name}: ${validation}`
        continue
      }
      const key = fileKey(file)
      if (known.has(key)) continue
      known.add(key)
      accepted.push({ key, file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null })
    }
    setPendingFiles((current) => {
      const next = [...current, ...accepted]
      pendingRef.current = next
      return next
    })
    setAttachmentBlocked(false)
    setErrors((current) => ({ ...current, attachments: error || undefined, form: undefined }))
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  const removePending = (key: string) => {
    setPendingFiles((current) => {
      const next = current.filter((entry) => {
        if (entry.key !== key) return true
        if (entry.url) URL.revokeObjectURL(entry.url)
        return false
      })
      pendingRef.current = next
      return next
    })
    setAttachmentBlocked(false)
    setErrors((current) => ({ ...current, attachments: undefined }))
  }

  const resolveCategory = (): string => {
    if (form.category !== NEW_CATEGORY) return form.category.trim()
    const name = form.newCategory.trim()
    const korean = form.newCategoryKo.trim()
    return name && korean && !/\(.+\)/.test(name) ? `${name} (${korean})` : name
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || saving) return
    const category = resolveCategory()
    const nextErrors: FormErrors = {}
    if (!category) nextErrors.category = "카테고리를 선택하거나 새 카테고리명을 입력하세요."
    if (!form.chemical.trim()) nextErrors.chemical = "Chemical / Brand를 입력하세요."
    if (!form.state.trim()) nextErrors.state = "상태를 선택하세요."
    if (form.link.trim() && !httpsMaterialLink(form.link)) nextErrors.link = "https:// 로 시작하는 원본 링크를 입력하세요."
    if (attachmentBlocked) nextErrors.attachments = errors.attachments ?? "첨부 파일 수를 확인하세요."
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      requestAnimationFrame(() => {
        if (nextErrors.category) (form.category === NEW_CATEGORY ? newCategoryRef.current : categoryRef.current)?.focus()
        else if (nextErrors.chemical) chemicalRef.current?.focus()
        else if (nextErrors.state) stateRef.current?.focus()
      })
      return
    }

    setSaving(true)
    setErrors({})
    const uploaded: ChemicalAttachment[] = []
    let manualSaved = false
    try {
      for (const entry of pendingFiles) uploaded.push(await portfolioStore.putAttachment(entry.file))
      const now = new Date().toISOString()
      const passNotes = form.passNote.trim() ? [form.passNote.trim()] : []
      await portfolioStore.saveManual({
        id: item?.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        category,
        state: form.state,
        chemical: form.chemical.trim(),
        market: form.market.trim(),
        description: form.description.trim(),
        fabrication: form.fabrication.trim(),
        flNos,
        passNotes,
        passCount: passNotes.length,
        source: "web",
        link: form.link.trim() || undefined,
        owner: form.owner || undefined,
        attachments: [...existingAttachments, ...uploaded],
        createdAt: item?.createdAt ?? now,
        updatedAt: now,
      })
      manualSaved = true
      const retainedIds = new Set(existingAttachments.map((attachment) => attachment.id))
      await Promise.all((item?.attachments ?? [])
        .filter((attachment) => !retainedIds.has(attachment.id))
        .map((attachment) => portfolioStore.deleteAttachment(attachment.id)))
      revokePending()
      setPendingFiles([])
      setAttachmentBlocked(false)
      onOpenChange(false)
    } catch (error) {
      if (!manualSaved) await Promise.allSettled(uploaded.map((attachment) => portfolioStore.deleteAttachment(attachment.id)))
      setErrors({ form: error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요." })
    } finally {
      setSaving(false)
    }
  }

  const close = (nextOpen: boolean) => {
    if (!nextOpen && !saving) {
      revokePending()
      setPendingFiles([])
      setAttachmentBlocked(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl motion-reduce:animate-none motion-reduce:transition-none">
        <DialogHeader className="pr-12">
          <div className="flex flex-wrap items-center gap-2"><DialogTitle>{item ? "포트폴리오 항목 수정" : "포트폴리오 신규 등록"}</DialogTitle>{readOnly ? <Badge variant="secondary">엑셀 출처 · 읽기 전용</Badge> : null}</div>
          <DialogDescription>{readOnly ? "엑셀 출처 항목은 다음 업로드에서 갱신되므로 웹에서 수정할 수 없습니다." : "필수 3개 항목과 개발 근거 자료를 등록합니다."}</DialogDescription>
        </DialogHeader>
        <form className="contents" noValidate onSubmit={(event) => { void submit(event) }}>
          <DialogBody className="space-y-6 px-5 py-5 sm:px-7">
            <fieldset disabled={readOnly || saving} className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">필수 항목</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="portfolio-category">카테고리<RequiredMark /></Label>
                    <Select value={form.category} onValueChange={(value) => change("category", value)}>
                      <SelectTrigger ref={categoryRef} id="portfolio-category" aria-required="true" aria-invalid={Boolean(errors.category)} className={cn(errors.category && "ring-1 ring-[var(--destructive)]")}><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
                      <SelectContent>{categories.map((category) => <SelectItem key={category.name} value={category.name}>{category.name}</SelectItem>)}<SelectItem value={NEW_CATEGORY}>새 카테고리 추가</SelectItem></SelectContent>
                    </Select>
                    {errors.category ? <p role="alert" className="text-xs text-[var(--destructive)]">{errors.category}</p> : null}
                  </div>
                  <div className="space-y-2"><Label htmlFor="portfolio-chemical">Chemical / Brand<RequiredMark /></Label><Input ref={chemicalRef} id="portfolio-chemical" value={form.chemical} onChange={(event) => change("chemical", event.target.value)} aria-required="true" aria-invalid={Boolean(errors.chemical)} className={cn(errors.chemical && "ring-1 ring-[var(--destructive)]")} />{errors.chemical ? <p role="alert" className="text-xs text-[var(--destructive)]">{errors.chemical}</p> : null}</div>
                  <div className="space-y-2"><Label htmlFor="portfolio-state">상태<RequiredMark /></Label><Select value={form.state} onValueChange={(value) => change("state", value)}><SelectTrigger ref={stateRef} id="portfolio-state" aria-required="true" aria-invalid={Boolean(errors.state)} className={cn(errors.state && "ring-1 ring-[var(--destructive)]")}><SelectValue placeholder="상태 선택" /></SelectTrigger><SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select>{errors.state ? <p role="alert" className="text-xs text-[var(--destructive)]">{errors.state}</p> : null}</div>
                </div>
                {form.category === NEW_CATEGORY ? <div className="grid gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="portfolio-new-category">새 카테고리명<RequiredMark /></Label><Input ref={newCategoryRef} id="portfolio-new-category" value={form.newCategory} onChange={(event) => change("newCategory", event.target.value)} placeholder="예: Category Name" aria-required="true" aria-invalid={Boolean(errors.category)} className={cn(errors.category && "ring-1 ring-[var(--destructive)]")} /></div><div className="space-y-2"><Label htmlFor="portfolio-new-category-ko">한글명</Label><Input id="portfolio-new-category-ko" value={form.newCategoryKo} onChange={(event) => change("newCategoryKo", event.target.value)} placeholder="입력 시 English (한글)로 저장" /></div></div> : null}
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">선택 항목</h3>
                <div className="space-y-2"><Label htmlFor="portfolio-description">Description &amp; Effect</Label><textarea id="portfolio-description" rows={4} value={form.description} onChange={(event) => change("description", event.target.value)} className={TEXTAREA_CLASS} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="portfolio-fabrication">Fabrication</Label><textarea id="portfolio-fabrication" rows={4} value={form.fabrication} onChange={(event) => change("fabrication", event.target.value)} placeholder="한 줄에 원단 하나" className={TEXTAREA_CLASS} /></div><div className="space-y-2"><Label htmlFor="portfolio-market">Market Product Analysis</Label><textarea id="portfolio-market" rows={4} value={form.market} onChange={(event) => change("market", event.target.value)} className={TEXTAREA_CLASS} /></div></div>
                <div className="space-y-2"><Label htmlFor="portfolio-fl">FL#</Label><Input id="portfolio-fl" value={form.flNos} onChange={(event) => change("flNos", event.target.value)} placeholder="쉼표 또는 줄바꿈으로 구분" /><p className="text-xs text-[var(--muted-foreground)]">채번 규칙: FL + YY + MM + 4자리</p>{flNos.length ? <div className="flex flex-wrap gap-2">{flNos.map((flNo) => <Badge key={flNo} variant={isValidFl(flNo) ? "secondary" : "outline"} className={cn(!isValidFl(flNo) && "border-[var(--destructive)] text-[var(--destructive)]")}>{flNo}</Badge>)}</div> : null}{flNos.some((flNo) => !isValidFl(flNo)) ? <p role="status" className="text-xs text-[var(--destructive)]">형식이 다른 FL도 저장되지만 연결 검색에서 제외될 수 있습니다.</p> : null}</div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="portfolio-pass-note">검증 통과 메모</Label><Input id="portfolio-pass-note" value={form.passNote} onChange={(event) => change("passNote", event.target.value)} placeholder="예: 시험 PASS" /></div><div className="space-y-2"><Label htmlFor="portfolio-owner">담당자</Label><Select value={form.owner} onValueChange={(value) => change("owner", value)}><SelectTrigger id="portfolio-owner"><SelectValue placeholder="담당자 선택" /></SelectTrigger><SelectContent>{MEMBERS.map((member) => <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="space-y-2"><Label htmlFor="portfolio-link">원본 링크</Label><Input id="portfolio-link" type="url" value={form.link} onChange={(event) => change("link", event.target.value)} placeholder="https://" aria-invalid={Boolean(errors.link)} className={cn(errors.link && "ring-1 ring-[var(--destructive)]")} />{errors.link ? <p role="alert" className="text-xs text-[var(--destructive)]">{errors.link}</p> : <p className="text-xs text-[var(--muted-foreground)]">OneDrive 또는 SharePoint의 https 링크를 입력하세요.</p>}</div>
              </section>

              <section className="space-y-3">
                <div><h3 className="text-sm font-semibold text-[var(--foreground)]">첨부</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">JPG·PNG·WEBP·PDF, 파일당 10MB 이하, 항목당 최대 6개입니다. 원본 파일을 보존합니다.</p></div>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)) }} className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-center"><Upload className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" /><p className="text-sm text-[var(--muted-foreground)]">파일을 끌어다 놓거나 선택하세요.</p><Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>파일 선택</Button><input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={onFileChange} aria-label="첨부 파일 선택" /></div>
                {errors.attachments ? <p role="alert" className="text-xs text-[var(--destructive)]">{errors.attachments}</p> : null}
                {existingAttachments.length || pendingFiles.length ? <ul className="grid gap-2 sm:grid-cols-2">{existingAttachments.map((attachment) => <li key={attachment.id} className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3"><StoredAttachmentPreview attachment={attachment} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--foreground)]">{attachment.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{formatBytes(attachment.size)}</span></span><Button type="button" size="icon" variant="ghost" aria-label={`${attachment.name} 삭제`} onClick={() => { setExistingAttachments((current) => current.filter((entry) => entry.id !== attachment.id)); setAttachmentBlocked(false); setErrors((current) => ({ ...current, attachments: undefined })) }}><Trash2 aria-hidden="true" /></Button></li>)}{pendingFiles.map((entry) => <li key={entry.key} className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">{entry.url ? <img src={entry.url} alt="" className="size-12 rounded-[var(--radius)] object-cover" /> : <span className="flex size-12 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--muted-foreground)]"><FileText aria-hidden="true" /></span>}<span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--foreground)]">{entry.file.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{formatBytes(entry.file.size)}{entry.file.size > MAX_ATTACHMENT_SIZE / 2 ? " · 대용량 원본" : ""}</span></span><Button type="button" size="icon" variant="ghost" aria-label={`${entry.file.name} 삭제`} onClick={() => removePending(entry.key)}><Trash2 aria-hidden="true" /></Button></li>)}</ul> : null}
              </section>
            </fieldset>
            <p className="rounded-[var(--radius)] bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">웹 등록 자료는 현재 이 브라우저에 저장됩니다.</p>
            {errors.form ? <p role="alert" aria-live="assertive" className="text-sm text-[var(--destructive)]">{errors.form}</p> : null}
          </DialogBody>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>취소</Button><Button type="submit" disabled={readOnly || saving}>{saving ? "저장 중" : item ? "수정 저장" : "등록"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
