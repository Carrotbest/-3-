import type { ReactNode } from "react"

export type RddaBadgeTone = "grow" | "hold" | "review" | "limited"

export function Badge({ tone, children }: { tone: RddaBadgeTone; children: ReactNode }) {
  const styles: Record<RddaBadgeTone, string> = {
    grow: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hold: "border-slate-200 bg-slate-50 text-slate-600",
    review: "border-rose-200 bg-rose-50 text-rose-700",
    limited: "border-amber-200 bg-amber-50 text-amber-700",
  }
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-[0_4px_10px_-8px_rgba(15,23,42,0.35)] ${styles[tone]}`}>{children}</span>
}
