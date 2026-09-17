import { useEffect, useRef, useState } from "react"
import { CalendarRange, SlidersHorizontal } from "lucide-react"

import { addMonths, monthsOf } from "@/data/rdda-dataset"

type Range = { from: string; to: string }

export function RangePicker({ firstMonth, lastMonth, value, onChange }: { firstMonth: string; lastMonth: string; value: Range; onChange: (next: Range) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const apply = (next: Range) => {
    const clamp = (ym: string) => ym < firstMonth ? firstMonth : ym > lastMonth ? lastMonth : ym
    const clamped = { from: clamp(next.from), to: clamp(next.to) }
    const ordered = clamped.from <= clamped.to ? clamped : { from: clamped.to, to: clamped.from }
    onChange(ordered)
    setOpen(false)
  }
  const year = Number(lastMonth.slice(0, 4))
  const presets: { label: string; range: Range }[] = [
    { label: "최근 3개월", range: { from: addMonths(lastMonth, -2), to: lastMonth } },
    { label: "최근 6개월", range: { from: addMonths(lastMonth, -5), to: lastMonth } },
    { label: "최근 12개월", range: { from: addMonths(lastMonth, -11), to: lastMonth } },
    { label: "올해", range: { from: `${year}-01`, to: lastMonth } },
    { label: "작년", range: { from: `${year - 1}-01`, to: `${year - 1}-12` } },
    { label: "전체", range: { from: firstMonth, to: lastMonth } },
  ].map((preset) => ({ ...preset, range: { from: preset.range.from < firstMonth ? firstMonth : preset.range.from, to: preset.range.to > lastMonth ? lastMonth : preset.range.to } }))

  return <div ref={rootRef} className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="relative w-full cursor-pointer overflow-hidden rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 text-left shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur transition-colors hover:border-[var(--gradient-1)]">
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--muted-foreground)]"><span className="flex items-center gap-2"><CalendarRange className="size-3.5 text-[var(--gradient-1)]" aria-hidden="true" />분석 기간</span><span className="flex items-center gap-1 rounded-full border border-[var(--gradient-1)]/30 bg-[var(--gradient-1)]/8 px-2 py-0.5 text-[10px] font-semibold text-[var(--gradient-1)]"><SlidersHorizontal className="size-3" aria-hidden="true" />기간 설정</span></span>
      <span className="mt-0.5 block font-semibold tracking-tight tabular-nums">{value.from} – {value.to}</span>
      <span className="block text-[10px] text-[var(--muted-foreground)]">{monthsOf(value.from, value.to).length}개월</span>
    </button>
    {open && <div className="absolute left-0 top-full z-30 mt-2 w-[300px] rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl">
      <div className="grid grid-cols-2 gap-1.5">{presets.map((preset) => <button key={preset.label} type="button" onClick={() => apply(preset.range)} className="rounded-[8px] border border-[var(--border)] px-2.5 py-2 text-xs font-medium hover:border-[var(--gradient-1)] hover:bg-[color-mix(in_oklab,var(--gradient-1)_7%,var(--card))]">{preset.label}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
        <label className="text-[10px] font-medium text-[var(--muted-foreground)]">시작<input type="month" min={firstMonth} max={lastMonth} value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} className="mt-1 w-full rounded-[7px] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]" /></label>
        <label className="text-[10px] font-medium text-[var(--muted-foreground)]">끝<input type="month" min={firstMonth} max={lastMonth} value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} className="mt-1 w-full rounded-[7px] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--foreground)]" /></label>
      </div>
      <button type="button" onClick={() => apply(draft)} className="mt-3 w-full rounded-[8px] bg-[var(--gradient-1)] px-3 py-2 text-xs font-semibold text-white">적용</button>
    </div>}
  </div>
}
