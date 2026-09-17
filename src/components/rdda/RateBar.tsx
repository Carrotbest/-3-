export function RateBar({ value, max = 100, tone = "primary" }: { value: number | null; max?: number; tone?: "primary" | "positive" | "negative" }) {
  if (value === null) return <span className="text-[var(--muted-foreground)]">표본 부족</span>
  const width = Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0))
  const color = tone === "positive" ? "#10b981" : tone === "negative" ? "#f43f5e" : "var(--gradient-1)"
  return <div className="relative h-7 min-w-28 overflow-hidden rounded-[7px] border border-white/55 bg-[color-mix(in_oklab,var(--muted)_70%,transparent)] shadow-inner"><span className="absolute inset-y-0 left-0 opacity-[0.16]" style={{ width: `${width}%`, background: `linear-gradient(90deg, transparent, ${color})` }} /><span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold [font-variant-numeric:tabular-nums]">{value.toFixed(1)}%</span></div>
}
