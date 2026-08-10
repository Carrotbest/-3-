import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowLeft, ArrowRight, FileText, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fmtDateFull } from "@/data/format"
import type { MaterialItem } from "@/data/schema"

const coverPosition = (offset: number): string => {
  if (offset === 0) return "z-30 opacity-100 [transform:translateX(-50%)_scale(1)_rotateY(0deg)]"
  if (offset === -1) return "z-20 opacity-70 [transform:translateX(-96%)_scale(.82)_rotateY(42deg)]"
  if (offset === 1) return "z-20 opacity-70 [transform:translateX(-4%)_scale(.82)_rotateY(-42deg)]"
  if (offset < -1) return "z-10 opacity-25 [transform:translateX(-120%)_scale(.68)_rotateY(54deg)]"
  return "z-10 opacity-25 [transform:translateX(20%)_scale(.68)_rotateY(-54deg)]"
}

function CoverCard({ item }: { item: MaterialItem }) {
  return <><span className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)]"><FileText className="size-5" aria-hidden="true" /></span><Badge className="absolute right-4 top-4" variant="outline">{item.source === "excel" ? "엑셀" : "직접등록"}</Badge><strong className="mt-5 line-clamp-2 block text-base leading-6 text-[var(--foreground)]">{item.title}</strong><span className="mt-2 line-clamp-3 block text-sm text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</span><span className="mt-auto block pt-4 text-xs text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}</span></>
}

export function CoverflowGallery({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const shown = items.slice(0, 6)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  const dragStart = useRef<number | null>(null)
  const wheelLockUntil = useRef(0)

  useEffect(() => { setActive((current) => Math.min(current, Math.max(0, shown.length - 1))) }, [shown.length])
  const move = (direction: -1 | 1) => setActive((current) => Math.max(0, Math.min(shown.length - 1, current + direction)))

  useEffect(() => {
    const node = rootRef.current
    if (!node || shown.length < 3) return
    const onWheel = (event: WheelEvent) => {
      if (!pointerInside.current) return
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const direction = Math.sign(delta)
      if (!direction || (active === 0 && direction < 0) || (active === shown.length - 1 && direction > 0)) return
      event.preventDefault()
      const now = performance.now()
      if (now < wheelLockUntil.current) return
      wheelLockUntil.current = now + 220
      move(direction > 0 ? 1 : -1)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [active, shown.length])

  if (!shown.length) return <div className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center"><p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>{onAdd ? <Button type="button" size="sm" className="mt-4" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>

  if (shown.length < 3) {
    return <div className="grid gap-4 md:grid-cols-2">{shown.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)} className="relative flex min-h-56 cursor-pointer flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"><CoverCard item={item} /></button>)}</div>
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStart.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return
    const distance = event.clientX - dragStart.current
    dragStart.current = null
    if (Math.abs(distance) >= 40) move(distance > 0 ? -1 : 1)
  }

  return <div ref={rootRef} role="group" aria-roledescription="carousel" aria-label="트렌드 자료 coverflow" tabIndex={0} onPointerEnter={() => { pointerInside.current = true }} onPointerLeave={() => { pointerInside.current = false; dragStart.current = null }} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { dragStart.current = null }} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; const direction = event.key === "ArrowRight" ? 1 : -1; if ((active === 0 && direction < 0) || (active === shown.length - 1 && direction > 0)) return; event.preventDefault(); move(direction as -1 | 1) }} className="touch-pan-y rounded-[var(--radius)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
    <div className="relative min-h-80 overflow-hidden [perspective:75rem]">{shown.map((item, index) => { const offset = index - active; if (Math.abs(offset) > 2) return null; return <button key={item.id} type="button" tabIndex={offset === 0 ? 0 : -1} aria-hidden={offset !== 0} onClick={() => { if (offset === 0) onOpen(item) }} className={`absolute left-1/2 top-5 flex h-72 w-[62%] max-w-md cursor-pointer flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-[var(--shadow-2)] outline-none transition-[transform,opacity] duration-300 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${coverPosition(offset)}`}><CoverCard item={item} /></button> })}</div>
    <div className="flex items-center justify-center gap-3"><Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 트렌드 자료" onClick={() => move(-1)}><ArrowLeft /></Button><span className="min-w-20 text-center text-sm font-semibold tabular-nums" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(shown.length).padStart(2, "0")}</span><Button type="button" variant="outline" size="icon" disabled={active === shown.length - 1} aria-label="다음 트렌드 자료" onClick={() => move(1)}><ArrowRight /></Button></div>
  </div>
}
