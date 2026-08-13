import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, FileText, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MATERIAL_CARD_PALETTES, useCoverflowMotion } from "@/components/cards/MaterialDeck"
import { fmtDateFull } from "@/data/format"
import type { MaterialItem } from "@/data/schema"

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

function CoverCard({ item }: { item: MaterialItem }) {
  return <><span className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-white/15 text-white ring-1 ring-inset ring-white/20"><FileText className="size-5" aria-hidden="true" /></span><Badge className="absolute right-4 top-4 border-white/25 bg-white/15 text-white hover:bg-white/15" variant="outline">{item.source === "excel" ? "엑셀" : "직접등록"}</Badge><strong className="mt-5 line-clamp-2 block text-base leading-6 text-white">{item.title}</strong><span className="mt-2 line-clamp-3 block text-sm text-white/70">{item.summary || "요약이 등록되지 않았습니다."}</span><span className="mt-auto block pt-4 text-xs text-white/70">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}</span></>
}

export function CoverflowGallery({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const shown = items.slice(0, 6)
  const reduced = useReducedMotion()
  const { active, move, goTo, rootRef, setCardRef, wasDragged, rootProps } = useCoverflowMotion(shown.length, reduced)

  if (!shown.length) return <div className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center"><p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>{onAdd ? <Button type="button" size="sm" className="mt-4" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>

  if (shown.length < 3) {
    return <div className="grid gap-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">{shown.map((item, index) => { const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]; return <button key={item.id} type="button" onClick={() => onOpen(item)} className={`relative flex aspect-square w-full max-w-[260px] cursor-pointer flex-col justify-self-center overflow-hidden rounded-2xl border border-white/20 p-5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-white/80 ${palette.background} ${palette.activeShadow}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${CARD_VIGNETTE}`} /><span className="relative z-10 flex h-full flex-col"><CoverCard item={item} /></span></button> })}</div>
  }

  return <div ref={rootRef} role="group" aria-roledescription="carousel" aria-label="트렌드 자료 coverflow" tabIndex={0} {...rootProps} className="touch-pan-y overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
    <div className="relative min-h-[21rem] cursor-grab overflow-hidden [perspective:1200px] active:cursor-grabbing sm:min-h-[22rem]">{shown.map((item, index) => { const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]; const isActive = index === active; return <button key={item.id} ref={setCardRef(index)} type="button" tabIndex={isActive ? 0 : -1} aria-hidden={!isActive} onClick={() => { if (wasDragged()) return; if (isActive) onOpen(item); else goTo(index) }} style={{ opacity: 0 }} className={`absolute left-1/2 top-7 flex aspect-square [width:clamp(190px,44%,260px)] cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/20 p-5 text-left outline-none transition-shadow duration-300 will-change-transform focus-visible:ring-[3px] focus-visible:ring-white/80 ${palette.background} ${isActive ? palette.activeShadow : INACTIVE_CARD_SHADOW}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${CARD_VIGNETTE}`} /><span className="relative z-10 flex h-full flex-col"><CoverCard item={item} /></span></button> })}</div>
    <div className="flex items-center justify-center gap-3 px-5 pb-5"><Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 트렌드 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(-1)} className="text-[var(--foreground)]"><ArrowLeft /></Button><span className="min-w-20 text-center text-sm font-semibold tabular-nums text-[var(--foreground)]" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(shown.length).padStart(2, "0")}</span><Button type="button" variant="outline" size="icon" disabled={active === shown.length - 1} aria-label="다음 트렌드 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(1)} className="text-[var(--foreground)]"><ArrowRight /></Button></div>
  </div>
}
