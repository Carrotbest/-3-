import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react"
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

// --- Continuous coverflow motion -------------------------------------------
// The deck no longer snaps between whole indices. `posRef` holds a *fractional*
// card position that the pointer drags 1:1, the wheel nudges in fine steps, and
// a flick carries with inertia. Everything is painted straight to the DOM on a
// rAF loop, so the cards glide instead of stepping. `active` (the rounded centre)
// is kept only for the page counter, arrow-disabled state and tap-to-open.

// Geometry, tuned so that at whole offsets the deck matches the previous look:
// neighbour ≈ 0.62·width across / scale .82 / 24°, second card compressed in,
// blurred and half-faded. Non-integer offsets interpolate smoothly between.
const CARD_PITCH = 0.62 // sideways travel per card, as a fraction of card width
const PITCH_FALLOFF = 0.8 // < 1 so far cards pack in rather than fan out forever
const SCALE_STEP = 0.18
const SCALE_FALLOFF = 0.92
const ROTATE = 24
const ROTATE_FALLOFF = 0.32
const ROTATE_CAP = 46
const WHEEL_PER_CARD = 280 // larger = finer wheel; a notch moves ~0.35 of a card
const WHEEL_SETTLE_MS = 140 // after the wheel goes quiet, ease onto the nearest card

function cardTransform(distance: number, width: number): string {
  const abs = Math.abs(distance)
  const dir = Math.sign(distance)
  const tx = dir * width * CARD_PITCH * Math.pow(abs, PITCH_FALLOFF)
  const ty = -4 * Math.max(0, 1 - abs) // the centre card lifts a touch
  const scale = Math.max(0.5, 1 - SCALE_STEP * Math.pow(abs, SCALE_FALLOFF))
  const tilt = Math.min(ROTATE * Math.pow(abs, ROTATE_FALLOFF), ROTATE_CAP) * -dir
  return `translateX(calc(-50% + ${tx.toFixed(2)}px)) translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(3)}) rotateY(${tilt.toFixed(2)}deg)`
}

export function useCoverflowMotion(itemCount: number, reduced: boolean) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const posRef = useRef(0) // fractional centre — the single source of truth
  const targetRef = useRef(0) // where the current settle is headed
  const widthRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const wheelIdle = useRef<number | null>(null)
  const pointerInside = useRef(false)
  const movedRef = useRef(false) // did the last press turn into a drag?
  const dragRef = useRef<{ id: number; x: number; pos: number; v: number; t: number } | null>(null)
  const [active, setActive] = useState(0)

  const clamp = useCallback(
    (pos: number) => Math.max(0, Math.min(Math.max(0, itemCount - 1), pos)),
    [itemCount],
  )

  // Paint transforms straight to the DOM — sixty state updates a second would
  // re-render every card for numbers React never needs to see.
  const paint = useCallback(() => {
    const width = widthRef.current
    if (!width) return
    const pos = posRef.current
    cardRefs.current.forEach((card, index) => {
      if (!card) return
      const distance = index - pos
      const abs = Math.abs(distance)
      card.style.transform = cardTransform(distance, width)
      const opacity = abs <= 1 ? 1 - 0.08 * abs : Math.max(0, 0.92 - 0.46 * (abs - 1))
      card.style.opacity = opacity.toFixed(3)
      const blur = Math.min(1.2, Math.max(0, (abs - 1.2) * 1.2))
      card.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : "none"
      card.style.zIndex = String(100 - Math.round(abs * 10))
      card.style.pointerEvents = abs < 2.2 ? "auto" : "none"
      card.style.visibility = abs > 3 ? "hidden" : "visible"
    })
  }, [])

  const settle = useCallback(
    (target: number) => {
      const goal = clamp(target)
      targetRef.current = goal
      setActive(Math.round(goal))
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (reduced) {
        posRef.current = goal
        paint()
        return
      }
      const step = () => {
        const remaining = targetRef.current - posRef.current
        if (Math.abs(remaining) < 0.0006) {
          posRef.current = targetRef.current
          paint()
          rafRef.current = null
          return
        }
        // Exponential ease-out — the tail is what makes it feel unhurried.
        posRef.current += remaining * 0.18
        paint()
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [clamp, paint, reduced],
  )

  const move = useCallback(
    (direction: -1 | 1) => settle(Math.round(targetRef.current) + direction),
    [settle],
  )
  const goTo = useCallback((index: number) => settle(index), [settle])

  // Keep the centre in range if the deck shrinks under us.
  useEffect(() => {
    posRef.current = clamp(posRef.current)
    targetRef.current = clamp(targetRef.current)
    setActive(Math.round(posRef.current))
    paint()
  }, [clamp, itemCount, paint])

  // Card width drives pitch and depth, so it is the only thing worth measuring —
  // and only when the box actually changes size.
  useEffect(() => {
    const frame = rootRef.current
    if (!frame) return
    const measure = () => {
      const card = cardRefs.current.find(Boolean)
      if (!card) return
      widthRef.current = card.offsetWidth
      paint()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [paint])

  // Fine, continuous wheel: accumulate into the target and re-aim the settle,
  // then snap gently onto the nearest card once the wheel goes quiet.
  useEffect(() => {
    const node = rootRef.current
    if (!node || itemCount < 2) return
    const onWheel = (event: WheelEvent) => {
      if (!pointerInside.current) return
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (!delta) return
      const atStart = targetRef.current <= 0.001 && delta < 0
      const atEnd = targetRef.current >= itemCount - 1 - 0.001 && delta > 0
      if (atStart || atEnd) return // let the page scroll past the ends
      event.preventDefault()
      settle(targetRef.current + delta / WHEEL_PER_CARD)
      if (wheelIdle.current !== null) window.clearTimeout(wheelIdle.current)
      wheelIdle.current = window.setTimeout(() => {
        settle(Math.round(targetRef.current))
      }, WHEEL_SETTLE_MS)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [itemCount, settle])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (wheelIdle.current !== null) window.clearTimeout(wheelIdle.current)
    },
    [],
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    movedRef.current = false
    targetRef.current = posRef.current
    dragRef.current = { id: event.pointerId, x: event.clientX, pos: posRef.current, v: 0, t: performance.now() }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const pitch = widthRef.current * CARD_PITCH
    if (!pitch) return
    const dx = event.clientX - drag.x
    if (Math.abs(dx) > 4) movedRef.current = true
    const now = performance.now()
    const previous = posRef.current
    posRef.current = clamp(drag.pos - dx / pitch) // cards track the finger 1:1
    drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000 // cards/sec
    drag.t = now
    const index = Math.round(clamp(posRef.current))
    if (index !== active) setActive(index)
    paint()
  }
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    // Let a flick carry, but never more than two cards.
    const carried = Math.max(-2, Math.min(2, drag.v * 0.14))
    settle(Math.round(posRef.current + carried))
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
    goTo,
    rootRef,
    setCardRef: (index: number) => (node: HTMLElement | null) => {
      cardRefs.current[index] = node
    },
    wasDragged: () => movedRef.current,
    rootProps: {
      onPointerEnter: () => { pointerInside.current = true },
      onPointerLeave: () => { pointerInside.current = false },
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  }
}

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
  const { active, move, goTo, rootRef, setCardRef, wasDragged, rootProps } = useCoverflowMotion(deckItems.length, reduced)

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
      className="touch-pan-y overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
      {...rootProps}
    >
      <div className="relative min-h-[21rem] cursor-grab overflow-hidden [perspective:1200px] active:cursor-grabbing sm:min-h-[22rem]">
        {deckItems.map((item, index) => {
          const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]
          const isActive = index === active
          return (
            <button
              key={item.id}
              ref={setCardRef(index)}
              type="button"
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              onClick={() => { if (wasDragged()) return; if (isActive) onOpen(item); else goTo(index) }}
              style={{ opacity: 0 }}
              className={`absolute left-1/2 top-7 flex aspect-square [width:clamp(190px,44%,260px)] cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/20 p-5 text-left outline-none transition-shadow duration-300 will-change-transform focus-visible:ring-[3px] focus-visible:ring-white/80 ${palette.background} ${isActive ? palette.activeShadow : INACTIVE_CARD_SHADOW}`}
            >
              <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${CARD_VIGNETTE}`} />
              <span className="relative z-10 flex h-full flex-col"><MaterialCardBody item={item} tone="onColor" /></span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-3 px-5 pb-5">
        <Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(-1)} className="text-[var(--foreground)]"><ArrowLeft /></Button>
        <span className="min-w-20 text-center text-sm font-semibold tabular-nums text-[var(--foreground)]" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(deckItems.length).padStart(2, "0")}</span>
        <Button type="button" variant="outline" size="icon" disabled={active === deckItems.length - 1} aria-label="다음 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(1)} className="text-[var(--foreground)]"><ArrowRight /></Button>
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
              {link ? <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4"><Button asChild className="w-full"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button></div> : null}
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
      {shown.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((item) => {
        const link = httpsMaterialLink(item.link)
        return <Card key={item.id} className="flex h-full flex-col"><CardHeader className="p-4 pb-2"><CardTitle className="line-clamp-2 text-base leading-5">{item.title}</CardTitle><p className="text-xs text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</p></CardHeader><CardContent className="flex flex-1 flex-col px-4 pb-4"><p className="line-clamp-2 min-h-10 text-sm text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.tags.slice(0, 5).map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div><div className="mt-auto grid gap-2 pt-4"><Button type="button" variant="default" size="default" className="w-full" onClick={() => onOpen(item)}>상세</Button>{link ? <Button asChild variant="outline" size="default" className="w-full"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : null}</div></CardContent></Card>
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
