import type { ReactNode } from "react"
import { AnimatedNumber, MotionSection } from "./motion"

export interface RddaColumn<T> {
  key: string
  header: string
  align?: "left" | "right"
  render: (row: T) => ReactNode
}

export function RddaTable<T>({ columns, rows, getKey, empty = "표시할 데이터가 없습니다." }: { columns: RddaColumn<T>[]; rows: T[]; getKey: (row: T, index: number) => string; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm [font-variant-numeric:tabular-nums]">
        <thead><tr className="border-b border-[var(--border)]/80 bg-[color-mix(in_oklab,var(--muted)_62%,transparent)]">{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.045em] text-[var(--muted-foreground)] ${column.align === "right" ? "text-right" : "text-left"}`}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={getKey(row, index)} className="border-b border-[var(--border)]/55 transition-colors last:border-b-0 hover:bg-[color-mix(in_oklab,var(--gradient-1)_4%,var(--card))]">{columns.map((column) => <td key={column.key} className={`px-4 py-3.5 text-[var(--foreground)] ${column.align === "right" ? "text-right" : "text-left"}`}>{column.render(row)}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function RddaPanel({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return <MotionSection as="section" className={`relative overflow-hidden rounded-[12px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_82%,transparent)] shadow-[0_16px_38px_-34px_rgba(15,23,42,0.42)] backdrop-blur-lg ${className}`}><span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/90" /><header className="relative flex items-start gap-2.5 border-b border-[var(--border)]/65 px-4 py-3.5"><span className="mt-1 size-2 rounded-full bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--gradient-1)_10%,transparent)]" /><div><h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--foreground)]">{title}</h2>{subtitle && <p className="mt-0.5 text-xs leading-5 text-[var(--muted-foreground)]">{subtitle}</p>}</div></header>{children}</MotionSection>
}

type KpiValue = ReactNode | { n: number; decimals?: number; suffix?: string; locale?: boolean }

const isAnimatedValue = (value: KpiValue): value is { n: number; decimals?: number; suffix?: string; locale?: boolean } => Boolean(value && typeof value === "object" && "n" in value)

export function KpiGrid({ items }: { items: { label: string; value: KpiValue; note?: string }[] }) {
  return <MotionSection className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((item, index) => <div key={item.label} className="group relative overflow-hidden rounded-[11px] border border-white/75 bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-4 py-4 shadow-[0_12px_28px_-25px_rgba(15,23,42,0.35)] backdrop-blur transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-24px_rgba(15,23,42,0.42)] motion-reduce:transform-none"><span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)] opacity-75" style={{ filter: `hue-rotate(${index * 18}deg)` }} /><div className="text-[11px] font-medium tracking-[0.025em] text-[var(--muted-foreground)]">{item.label}</div><div className="mt-2 text-[26px] font-semibold tracking-[-0.035em] [font-variant-numeric:tabular-nums]">{typeof item.value === "number" ? <AnimatedNumber value={item.value} /> : isAnimatedValue(item.value) ? <AnimatedNumber value={item.value.n} decimals={item.value.decimals} suffix={item.value.suffix} locale={item.value.locale} /> : item.value}</div>{item.note && <div className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">{item.note}</div>}</div>)}</MotionSection>
}
