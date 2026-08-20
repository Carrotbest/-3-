import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, FileText, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MATERIAL_CARD_PALETTES, useCoverflowMotion } from "@/components/cards/MaterialDeck"
import { fmtDateFull } from "@/data/format"
import type { MaterialItem } from "@/data/schema"

const INACTIVE_CARD_SHADOW = "shadow-sm"
const HOME_VISIBLE_CARDS = 5

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
  return <><span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><FileText className="size-4" aria-hidden="true" /></span><Badge className="absolute right-3 top-3" variant="outline">{item.source === "excel" ? "엑셀" : "직접등록"}</Badge><strong className="mt-3 line-clamp-1 block text-sm leading-5 text-[var(--foreground)]">{item.title}</strong><span className="mt-1 line-clamp-2 block text-xs leading-4 text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</span><span className="mt-auto block pt-2 text-[10px] text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}</span></>
}

export function CoverflowGallery({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const shown = items
  const reduced = useReducedMotion()
  const { active, move, goTo, rootRef, setCardRef, wasDragged, rootProps } = useCoverflowMotion(shown.length, reduced)
  if (!shown.length) return <div className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center"><p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>{onAdd ? <Button type="button" size="sm" className="mt-4" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>

  if (shown.length < 3) {
    return <div className="grid gap-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-2">{shown.map((item, index) => { const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]; return <button key={item.id} type="button" onClick={() => onOpen(item)} className={`relative flex aspect-[4/3] w-full max-w-[220px] cursor-pointer flex-col justify-self-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${palette.activeShadow}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${palette.background}`} /><span className="relative z-10 flex h-full flex-col"><CoverCard item={item} /></span></button> })}</div>
  }

  return <div ref={rootRef} role="group" aria-roledescription="carousel" aria-label="트렌드 자료 coverflow" tabIndex={0} data-coverflow-visible={HOME_VISIBLE_CARDS} onPointerMove={rootProps.onPointerMove} onPointerLeave={rootProps.onPointerLeave} onKeyDown={rootProps.onKeyDown} className="touch-pan-y overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
    <div className="relative min-h-[15rem] [perspective:820px] [perspective-origin:50%_45%] [transform-style:preserve-3d]">{shown.map((item, index) => { const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]; const isActive = index === active; return <button key={item.id} ref={setCardRef(index)} type="button" tabIndex={isActive ? 0 : -1} aria-hidden={!isActive} onClick={() => { if (wasDragged()) return; if (isActive) onOpen(item); else goTo(index) }} style={{ opacity: 0 }} className={`absolute left-1/2 top-4 flex aspect-[4/3] [width:clamp(180px,22%,240px)] cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left outline-none transition-shadow duration-300 [backface-visibility:hidden] [transform-style:preserve-3d] will-change-transform focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${isActive ? palette.activeShadow : INACTIVE_CARD_SHADOW}`}><span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${palette.background}`} /><span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-20 bg-[var(--foreground)] transition-opacity duration-300 motion-reduce:transition-none ${isActive ? "opacity-0" : "opacity-[0.06]"}`} /><span className="relative z-10 flex h-full flex-col"><CoverCard item={item} /></span></button> })}</div>
    <div className="flex items-center justify-center gap-3 px-4 pb-4"><Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 트렌드 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(-1)} className="text-[var(--foreground)]"><ArrowLeft /></Button><span className="min-w-20 text-center text-sm font-semibold tabular-nums text-[var(--foreground)]" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(shown.length).padStart(2, "0")}</span><Button type="button" variant="outline" size="icon" disabled={active === shown.length - 1} aria-label="다음 트렌드 자료" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(1)} className="text-[var(--foreground)]"><ArrowRight /></Button></div>
  </div>
}
