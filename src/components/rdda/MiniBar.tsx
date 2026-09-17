import { AnimatedNumber, useFill } from "./motion"

export interface MiniBarItem { label: string; value: number; detail?: string }

export function MiniBar({ items, suffix = "", max }: { items: MiniBarItem[]; suffix?: string; max?: number }) {
  const fill = useFill()
  const ceiling = max ?? Math.max(1, ...items.map((item) => Math.abs(item.value)))
  return <div className="space-y-2 p-4">{items.map((item) => <div key={item.label} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(140px,2fr)_auto] items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm transition-colors hover:bg-white/45"><span className="truncate text-xs font-medium text-[var(--muted-foreground)]">{item.label}</span><div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--muted)_82%,transparent)] shadow-inner"><div className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)] shadow-[0_0_10px_color-mix(in_oklab,var(--gradient-1)_25%,transparent)]" style={{ width: `${Math.max(0, Math.min(100, Math.abs(item.value) / ceiling * 100)) * fill}%` }} /></div><span className="min-w-16 text-right text-xs font-semibold [font-variant-numeric:tabular-nums]">{item.detail ?? <AnimatedNumber value={item.value} suffix={suffix} locale />}</span></div>)}</div>
}
