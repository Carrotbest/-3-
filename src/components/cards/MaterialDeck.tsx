import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { materialsOf } from "@/data/derive"
import { fmtDateFull } from "@/data/format"
import { httpsMaterialLink, MATERIAL_KINDS, type MaterialItem, type MaterialKind } from "@/data/schema"
import { deleteManualMaterial, saveManualMaterial, useAppStore } from "@/store/useAppStore"

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  TS: "TS",
  STUDY: "STUDY",
  MACRO: "MACRO TREND",
  FABRIC: "FABRIC TREND",
  PORTFOLIO: "PORTFOLIO",
}

const DECK_LIMIT = 6
const PAGE_SIZE = 20

export const MATERIAL_CARD_PALETTES = [
  {
    background: "bg-[linear-gradient(145deg,#6366f1,#8b5cf6)]",
    glow: "bg-[#6366f1]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(99,102,241,0.4)]",
  },
  {
    background: "bg-[linear-gradient(145deg,#0ea5e9,#22d3ee)]",
    glow: "bg-[#0ea5e9]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(14,165,233,0.4)]",
  },
  {
    background: "bg-[linear-gradient(145deg,#f59e0b,#f43f5e)]",
    glow: "bg-[#f59e0b]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(245,158,11,0.4)]",
  },
  {
    background: "bg-[linear-gradient(145deg,#10b981,#34d399)]",
    glow: "bg-[#10b981]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(16,185,129,0.4)]",
  },
  {
    background: "bg-[linear-gradient(145deg,#8b5cf6,#ec4899)]",
    glow: "bg-[#8b5cf6]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(139,92,246,0.4)]",
  },
  {
    background: "bg-[linear-gradient(145deg,#fb923c,#f43f5e)]",
    glow: "bg-[#fb923c]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(251,146,60,0.4)]",
  },
] as const

const INACTIVE_CARD_SHADOW = "shadow-[0_1rem_2rem_-0.75rem_rgba(0,0,0,0.72)]"
const CARD_VIGNETTE = "bg-[linear-gradient(to_bottom,transparent_42%,rgba(0,0,0,0.34))]"

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return reduced
}

function useDeckControls(itemCount: number) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  const dragStart = useRef<number | null>(null)
  const wheelLockUntil = useRef(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, itemCount - 1)))
  }, [itemCount])

  const move = (direction: -1 | 1) => {
    setActive((current) => Math.max(0, Math.min(itemCount - 1, current + direction)))
  }

  useEffect(() => {
    const node = rootRef.current
    if (!node || itemCount < 2) return
    const onWheel = (event: WheelEvent) => {
      if (!pointerInside.current) return
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const direction = Math.sign(delta)
      if (!direction) return
      const atStart = active === 0 && direction < 0
      const atEnd = active === itemCount - 1 && direction > 0
      if (atStart || atEnd) return
      event.preventDefault()
      const now = performance.now()
      if (now < wheelLockUntil.current) return
      wheelLockUntil.current = now + 220
      move(direction > 0 ? 1 : -1)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [active, itemCount])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStart.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return
    const distance = event.clientX - dragStart.current
    dragStart.current = null
    if (Math.abs(distance) >= 40) move(distance > 0 ? -1 : 1)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    const direction = event.key === "ArrowRight" ? 1 : -1
    if ((active === 0 && direction < 0) || (active === itemCount - 1 && direction > 0)) return
    event.preventDefault()
    move(direction as -1 | 1)
  }

  return {
    active,
    move,
    rootRef,
    rootProps: {
      onPointerEnter: () => { pointerInside.current = true },
      onPointerLeave: () => { pointerInside.current = false; dragStart.current = null },
      onPointerDown,
      onPointerUp,
      onPointerCancel: () => { dragStart.current = null },
      onKeyDown,
    },
  }
}

const deckPosition = (offset: number): string => {
  if (offset === 0) return "z-30 opacity-100 [filter:none] [transform:translateX(-50%)_translateY(-0.25rem)_scale(1)_rotateY(0deg)]"
  if (offset === -1) return "z-20 opacity-[.92] [filter:none] [transform:translateX(-112%)_scale(.82)_rotateY(24deg)]"
  if (offset === 1) return "z-20 opacity-[.92] [filter:none] [transform:translateX(12%)_scale(.82)_rotateY(-24deg)]"
  if (offset === -2) return "z-10 opacity-50 [filter:blur(1px)] [transform:translateX(-158%)_scale(.66)_rotateY(30deg)]"
  return "z-10 opacity-50 [filter:blur(1px)] [transform:translateX(58%)_scale(.66)_rotateY(-30deg)]"
}

const REDUCED_ACTIVE_POSITION = "z-30 opacity-100 [filter:none] [transform:translateX(-50%)_scale(1)]"

type MaterialCardTone = "surface" | "onColor"

function SourceBadge({ source, tone = "surface" }: { source: MaterialItem["source"]; tone?: MaterialCardTone }) {
  const labels: Record<MaterialItem["source"], string> = {
    excel: "엑셀",
    manual: "직접등록",
    ts: "TS 엑셀",
    study: "STUDY 엑셀",
  }
  return <Badge variant="outline" className={tone === "onColor" ? "border-white/25 bg-white/15 text-white hover:bg-white/15" : undefined}>{labels[source]}</Badge>
}

function MaterialCardBody({ item, tone = "surface" }: { item: MaterialItem; tone?: MaterialCardTone }) {
  const onColor = tone === "onColor"
  return (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] ${onColor ? "bg-white/15 text-white ring-1 ring-inset ring-white/20" : "bg-[var(--muted)] text-[var(--foreground)]"}`}><FileText className="size-5" aria-hidden="true" /></span>
        <SourceBadge source={item.source} tone={tone} />
      </span>
      <strong className={`mt-5 line-clamp-2 block text-base leading-6 ${onColor ? "text-white" : "text-[var(--foreground)]"}`}>{item.title}</strong>
      <span className={`mt-2 line-clamp-2 block text-sm ${onColor ? "text-white/70" : "text-[var(--muted-foreground)]"}`}>{item.summary || "요약이 등록되지 않았습니다."}</span>
      <span className="mt-4 flex flex-wrap gap-1.5">
        {item.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="secondary" className={onColor ? "border border-white/10 bg-white/15 text-white hover:bg-white/15" : undefined}>{tag}</Badge>)}
      </span>
      <span className={`mt-auto block pt-4 text-xs ${onColor ? "text-white/70" : "text-[var(--muted-foreground)]"}`}>{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</span>
    </>
  )
}

export function MaterialDeck({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const deckItems = items.slice(0, DECK_LIMIT)
  const reduced = useReducedMotion()
  const { active, move, rootRef, rootProps } = useDeckControls(deckItems.length)
  const activePalette = MATERIAL_CARD_PALETTES[active % MATERIAL_CARD_PALETTES.length]

  if (!deckItems.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>
        {onAdd ? <Button type="button" size="sm" className="mt-4" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label="자료 카드 덱"
      tabIndex={0}
      className="touch-pan-y overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#111114_0%,#0b0b0f_100%)] outline-none focus-visible:ring-[3px] focus-visible:ring-white/60"
      {...rootProps}
    >
      <div className="relative min-h-[21rem] overflow-hidden [perspective:1200px] sm:min-h-[22rem]">
        <span aria-hidden="true" className={`pointer-events-none absolute left-1/2 top-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl saturate-50 transition-colors duration-500 motion-reduce:transition-none ${activePalette.glow}`} />
        {deckItems.map((item, index) => {
          const offset = index - active
          if (Math.abs(offset) > 2 || (reduced && offset !== 0)) return null
          const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]
          return (
            <button
              key={item.id}
              type="button"
              tabIndex={offset === 0 ? 0 : -1}
              aria-hidden={offset !== 0}
              onClick={() => { if (offset === 0) onOpen(item) }}
              className={`absolute left-1/2 top-7 flex aspect-square [width:clamp(190px,44%,260px)] cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/20 p-5 text-left outline-none transition-[transform,opacity,filter] duration-[560ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] will-change-[transform,opacity,filter] focus-visible:ring-[3px] focus-visible:ring-white/80 motion-reduce:transition-none ${palette.background} ${offset === 0 ? palette.activeShadow : INACTIVE_CARD_SHADOW} ${reduced ? REDUCED_ACTIVE_POSITION : deckPosition(offset)}`}
            >
              <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${CARD_VIGNETTE}`} />
              <span className="relative z-10 flex h-full flex-col"><MaterialCardBody item={item} tone="onColor" /></span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-3 px-5 pb-5">
        <Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 자료" onClick={() => move(-1)} className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white disabled:border-white/10 disabled:bg-white/5 disabled:text-white/35"><ArrowLeft /></Button>
        <span className="min-w-20 text-center text-sm font-semibold tabular-nums text-white/85" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(deckItems.length).padStart(2, "0")}</span>
        <Button type="button" variant="outline" size="icon" disabled={active === deckItems.length - 1} aria-label="다음 자료" onClick={() => move(1)} className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white disabled:border-white/10 disabled:bg-white/5 disabled:text-white/35"><ArrowRight /></Button>
      </div>
    </div>
  )
}

export function MaterialDetailSheet({ item, onOpenChange, onEdit, onDeleted }: {
  item: MaterialItem | null
  onOpenChange: (open: boolean) => void
  onEdit?: (item: MaterialItem) => void
  onDeleted?: () => void
}) {
  const link = httpsMaterialLink(item?.link)
  const remove = async () => {
    if (!item || item.source !== "manual" || !window.confirm("이 자료를 삭제할까요?")) return
    await deleteManualMaterial(item.id)
    onOpenChange(false)
    onDeleted?.()
  }
  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-xl">
        {item ? (
          <>
            <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{MATERIAL_KIND_LABELS[item.kind]}</Badge><SourceBadge source={item.source} /></div>
              <SheetTitle className="pt-2 text-[var(--foreground)]">{item.title}</SheetTitle>
              <SheetDescription>{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-6">
              {item.detail?.length ? (
                <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                  {item.detail.map((row) => (
                    <div key={row.label} className="grid gap-1 border-b border-[var(--border)] p-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{row.label}</dt>
                      <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">요약</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</p></div>
              )}
              <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">태그</p><div className="mt-2 flex flex-wrap gap-2">{item.tags.length ? item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>) : <span className="text-sm text-[var(--muted-foreground)]">태그 없음</span>}</div></div>
              <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4">
                {link ? <Button asChild className="w-full"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : <><Button type="button" className="w-full" disabled><ExternalLink aria-hidden="true" />SharePoint에서 열기</Button><p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">링크 미등록</p></>}
              </div>
              {!item.readOnly && item.source === "manual" ? <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => onEdit?.(item)}><Pencil aria-hidden="true" />수정</Button><Button type="button" variant="destructive" onClick={() => { void remove() }}><Trash2 aria-hidden="true" />삭제</Button></div> : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

interface MaterialFormValues {
  title: string
  kind: MaterialKind
  summary: string
  date: string
  tags: string
  link: string
  owner: string
}

const emptyForm = (kind: MaterialKind): MaterialFormValues => ({ title: "", kind, summary: "", date: "", tags: "", link: "", owner: "" })

export function MaterialFormSheet({ open, defaultKind, item, onOpenChange, onSaved }: {
  open: boolean
  defaultKind: MaterialKind
  item?: MaterialItem | null
  onOpenChange: (open: boolean) => void
  onSaved?: (item: MaterialItem) => void
}) {
  const [form, setForm] = useState<MaterialFormValues>(() => emptyForm(defaultKind))
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm(item ? {
      title: item.title,
      kind: item.kind,
      summary: item.summary ?? "",
      date: item.date ?? "",
      tags: item.tags.join(", "),
      link: item.link ?? "",
      owner: item.owner ?? "",
    } : emptyForm(defaultKind))
    setError("")
  }, [defaultKind, item, open])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.title.trim()) { setError("제목을 입력하세요."); return }
    const link = form.link.trim()
    if (link && !httpsMaterialLink(link)) { setError("https:// 로 시작하는 공유 링크를 입력하세요"); return }
    setSaving(true)
    setError("")
    try {
      const saved = await saveManualMaterial({
        title: form.title.trim(),
        kind: form.kind,
        summary: form.summary.trim() || undefined,
        date: form.date || undefined,
        tags: [...new Set(form.tags.split(/[,/\s]+/).map((tag) => tag.trim()).filter(Boolean))],
        link: link || undefined,
        owner: form.owner.trim() || undefined,
      }, item?.id)
      onSaved?.(saved)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-xl">
        <SheetHeader className="border-b border-[var(--border)] p-6 pr-12"><SheetTitle>{item ? "자료 수정" : "자료 추가"}</SheetTitle><SheetDescription>SharePoint 공유 링크와 자료 정보를 등록합니다.</SheetDescription></SheetHeader>
        <form className="grid gap-5 p-6" noValidate onSubmit={(event) => { void submit(event) }}>
          <div className="space-y-2"><Label htmlFor="material-title">제목</Label><Input id="material-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} aria-required="true" /></div>
          <div className="space-y-2"><Label htmlFor="material-kind">구분</Label><select id="material-kind" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as MaterialKind }))} className="h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]">{MATERIAL_KINDS.map((kind) => <option key={kind} value={kind}>{MATERIAL_KIND_LABELS[kind]}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="material-summary">요약</Label><textarea id="material-summary" rows={4} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} className="w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="material-date">날짜</Label><Input id="material-date" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="material-owner">담당</Label><Input id="material-owner" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} /></div></div>
          <div className="space-y-2"><Label htmlFor="material-tags">태그</Label><Input id="material-tags" value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="쉼표, 슬래시 또는 공백으로 구분" /></div>
          <div className="space-y-2"><Label htmlFor="material-link">공유 링크</Label><Input id="material-link" type="url" value={form.link} onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))} placeholder="https://" aria-describedby="material-link-help material-form-error" /><p id="material-link-help" className="text-xs text-[var(--muted-foreground)]">Teams의 SharePoint 공유 링크를 붙여 넣으세요.</p></div>
          <p id="material-form-error" role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--destructive)]">{error}</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={saving}>{saving ? "저장 중" : "저장"}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function MaterialSearchList({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState("__all__")
  const [sort, setSort] = useState("latest")
  const [page, setPage] = useState(1)
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b, "ko-KR")), [items])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR")
    return items.filter((item) => {
      const searchable = [item.title, item.summary, ...item.tags].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR")
      return (!normalized || searchable.includes(normalized)) && (tag === "__all__" || item.tags.includes(tag))
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ko-KR") : (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title, "ko-KR"))
  }, [items, query, sort, tag])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, sort, tag])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-[var(--foreground)]">자료 검색 목록</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">총 {items.length.toLocaleString("ko-KR")}건</p></div>{onAdd ? <Button type="button" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative block"><span className="sr-only">자료 검색</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·태그·요약 검색" className="pl-9" /></label>
        <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="자료 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">최신순</SelectItem><SelectItem value="title">제목순</SelectItem></SelectContent></Select>
      </div>
      {tags.length ? <div className="flex flex-wrap gap-2" aria-label="태그 필터"><Button type="button" size="sm" variant={tag === "__all__" ? "secondary" : "outline"} onClick={() => setTag("__all__")}>전체</Button>{tags.map((value) => <Button key={value} type="button" size="sm" variant={tag === value ? "secondary" : "outline"} onClick={() => setTag(value)}>{value}</Button>)}</div> : null}
      {shown.length ? <div className="grid gap-3 lg:grid-cols-2">{shown.map((item) => {
        const link = httpsMaterialLink(item.link)
        return <Card key={item.id} className="h-full"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="line-clamp-2 leading-6">{item.title}</CardTitle><SourceBadge source={item.source} /></div><p className="text-xs text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</p></CardHeader><CardContent><p className="line-clamp-2 min-h-10 text-sm text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.tags.slice(0, 5).map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div><div className="mt-5 flex flex-wrap items-center justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onOpen(item)}>상세</Button>{link ? <Button asChild size="sm"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : <><span className="text-xs text-[var(--muted-foreground)]">링크 미등록</span><Button type="button" size="sm" disabled>SharePoint에서 열기</Button></>}</div></CardContent></Card>
      })}</div> : <div className="flex min-h-32 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">{items.length ? "검색 조건에 맞는 자료가 없습니다." : emptyMessage}</div>}
      {pageCount > 1 ? <div className="flex items-center justify-center gap-3"><Button type="button" variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>이전</Button><span className="text-sm tabular-nums text-[var(--muted-foreground)]">{safePage} / {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>다음</Button></div> : null}
    </div>
  )
}

function useMaterialSection(kind: MaterialKind) {
  const excel = useAppStore((state) => state.materials)
  const manual = useAppStore((state) => state.materialsManual)
  return useMemo(() => materialsOf(kind, excel, manual), [excel, kind, manual])
}

export function MaterialDeckSection({ kind, title, description, emptyMessage, items: providedItems, allowAdd = true }: { kind: MaterialKind; title: string; description: string; emptyMessage: string; items?: MaterialItem[]; allowAdd?: boolean }) {
  const storedItems = useMaterialSection(kind)
  const items = providedItems ?? storedItems
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [editing, setEditing] = useState<MaterialItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (item?: MaterialItem) => { setSelected(null); setEditing(item ?? null); setFormOpen(true) }
  return <Card><CardHeader className="flex-row items-start justify-between gap-3 space-y-0"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p></div>{allowAdd ? <Button type="button" variant="outline" size="sm" onClick={() => openForm()}><Plus aria-hidden="true" />자료 추가</Button> : null}</CardHeader><CardContent><MaterialDeck items={items} emptyMessage={emptyMessage} onOpen={setSelected} onAdd={allowAdd ? () => openForm() : undefined} /></CardContent><MaterialDetailSheet item={selected} onOpenChange={(open) => { if (!open) setSelected(null) }} onEdit={openForm} /><MaterialFormSheet open={formOpen} defaultKind={kind} item={editing} onOpenChange={setFormOpen} /></Card>
}

export function MaterialSearchSection({ kind, emptyMessage, items: providedItems, allowAdd = true }: { kind: MaterialKind; emptyMessage: string; items?: MaterialItem[]; allowAdd?: boolean }) {
  const storedItems = useMaterialSection(kind)
  const items = providedItems ?? storedItems
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [editing, setEditing] = useState<MaterialItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (item?: MaterialItem) => { setSelected(null); setEditing(item ?? null); setFormOpen(true) }
  return <Card><CardContent className="p-6"><MaterialSearchList items={items} emptyMessage={emptyMessage} onOpen={setSelected} onAdd={allowAdd ? () => openForm() : undefined} /></CardContent><MaterialDetailSheet item={selected} onOpenChange={(open) => { if (!open) setSelected(null) }} onEdit={openForm} /><MaterialFormSheet open={formOpen} defaultKind={kind} item={editing} onOpenChange={setFormOpen} /></Card>
}
