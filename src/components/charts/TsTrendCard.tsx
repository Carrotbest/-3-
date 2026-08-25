import { useEffect, useMemo, useRef, useState } from "react"
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Card, CardContent } from "@/components/ui/card"
import { monthlyTsTrend, type MonthlyTsDatum } from "@/data/derive"
import type { TsRecord } from "@/data/sample"

const TS_RANGE_OPTIONS = [
  { months: 6, label: "6개월" },
  { months: 12, label: "1년" },
  { months: 24, label: "2년" },
] as const

const TS_TREND_MONTHS_STORAGE_KEY = "fabric-rnd-ts-trend-months-v1"

function loadTsTrendMonths(): number {
  if (typeof window === "undefined") return 12
  const stored = Number(window.localStorage.getItem(TS_TREND_MONTHS_STORAGE_KEY))
  return TS_RANGE_OPTIONS.some((option) => option.months === stored) ? stored : 12
}

const TS_TREND_SERIES = [
  { key: "processing", label: "처리중", color: "var(--chart-4)" },
  { key: "done", label: "완료", color: "var(--chart-2)" },
] as const

function TsTrendTooltip({ active, payload }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: MonthlyTsDatum }>
}) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return (
    <div className="min-w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-3 text-[var(--popover-foreground)] shadow-xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-2">
        <p className="text-sm font-semibold">{item.month.replace("-", ".")}월</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {TS_TREND_SERIES.map((series) => {
          const value = item[series.key]
          return (
            <div key={series.key} className="flex items-center justify-between gap-5 text-xs">
              <span className="flex items-center gap-2 text-[var(--muted-foreground)]"><i className="size-2 rounded-full" style={{ background: series.color }} />{series.label}</span>
              <strong>{value}건 <span className="font-normal text-[var(--muted-foreground)]">({item.total ? Math.round(value / item.total * 100) : 0}%)</span></strong>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm"><span className="font-medium">TOTAL</span><strong>{item.total}건</strong></div>
    </div>
  )
}

interface AnimatedTsBarProps {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  index?: number
  reduceMotion?: boolean
  active?: boolean
}

function AnimatedTsBar({ x = 0, y = 0, width = 0, height = 0, fill = "currentColor", reduceMotion = false, active = false }: AnimatedTsBarProps) {
  return <rect x={x} y={y} width={width} height={height} rx={2} fill={fill} style={{ transformBox: "fill-box", transformOrigin: "center bottom", transform: active ? "scaleY(1)" : "scaleY(0)", opacity: active ? 0.9 : 0, transition: reduceMotion ? "none" : "transform 480ms cubic-bezier(.16,.8,.24,1), opacity 180ms ease-out" }} />
}

function TsTrendChart({ monthly, reduceMotion }: { monthly: MonthlyTsDatum[]; reduceMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(reduceMotion)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)

  useEffect(() => {
    const node = rootRef.current
    if (!node || started) return
    if (!("IntersectionObserver" in window)) { setStarted(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setStarted(true)
      observer.disconnect()
    }, { threshold: 0.3 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [started])

  return (
    <div ref={rootRef} className="absolute inset-0" role="img" aria-label="접수일 기준 월별 TS 전체 추이와 처리중, 완료 비율 차트">
      {started ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly} margin={{ top: 28, right: 12, bottom: 0, left: -18 }} barCategoryGap="32%" onMouseMove={(state: unknown) => { const index = (state as { activeTooltipIndex?: number }).activeTooltipIndex; setHoveredMonth(typeof index === "number" ? index : null) }} onMouseLeave={() => setHoveredMonth(null)}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="month" tickFormatter={(value: string) => `${value.slice(2, 4)}.${value.slice(5)}월`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval={monthly.length > 14 ? 1 : 0} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ stroke: "#2563eb", strokeOpacity: 0.25, strokeDasharray: "4 4" }} content={<TsTrendTooltip />} />
        {TS_TREND_SERIES.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label} stackId="ts-status" fill={series.color} isAnimationActive={false} shape={(props: unknown) => { const bar = props as AnimatedTsBarProps; return <AnimatedTsBar {...bar} active={bar.index === hoveredMonth} reduceMotion={reduceMotion} /> }} />)}
        <Line type="natural" dataKey="total" name="TOTAL" stroke="#2563eb" strokeWidth={1.75} dot={{ r: 2.5, fill: "var(--background)", stroke: "#2563eb", strokeWidth: 1.5 }} activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)", stroke: "#2563eb" }} isAnimationActive={!reduceMotion} animationDuration={1950} animationEasing="linear">
          <LabelList dataKey="total" position="top" offset={10} fill="var(--muted-foreground)" fontSize={10} fontWeight={600} />
        </Line>
      </ComposedChart></ResponsiveContainer> : null}
    </div>
  )
}

export function TsTrendCard({ ts, today }: { ts: readonly TsRecord[]; today?: Date }) {
  const [months, setMonths] = useState<number>(loadTsTrendMonths)
  const monthly = useMemo(() => monthlyTsTrend(ts, today ?? new Date(), months), [ts, today, months])
  const monthlyKpis = useMemo(() => monthly.reduce((summary, item) => ({
    total: summary.total + item.total,
    registered: summary.registered + item.registered,
    processing: summary.processing + item.processing,
    done: summary.done + item.done,
  }), { total: 0, registered: 0, processing: 0, done: 0 }), [monthly])
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  useEffect(() => {
    window.localStorage.setItem(TS_TREND_MONTHS_STORAGE_KEY, String(months))
  }, [months])

  return (
    <Reveal className="h-full">
      <Card className="h-full overflow-hidden"><CardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-base font-semibold text-[var(--foreground)]">월별 TS 현황</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">접수일 기준 월별 · 상태별 분포</p></div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] p-1" role="group" aria-label="TS 조회 기간 선택">
              {TS_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.months}
                  type="button"
                  aria-pressed={months === option.months}
                  onClick={() => setMonths(option.months)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${months === option.months ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
              {TS_TREND_SERIES.map((series) => <span key={series.key} className="flex items-center gap-1.5"><i className="size-2.5 rounded-full shadow-sm" style={{ background: series.color }} />{series.label}</span>)}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]/80 p-3 transition duration-300 hover:-translate-y-1 hover:border-[var(--chart-1)] hover:shadow-md motion-reduce:transition-none">
            <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{months}개월 TOTAL</p><p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis.total} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
          </div>
          {TS_TREND_SERIES.map((series) => (
            <div key={series.key} className="group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]/80 p-3 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none" style={{ borderTopColor: series.color, borderTopWidth: 2 }}>
              <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{series.label}</p></div>
              <p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis[series.key]} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
            </div>
          ))}
        </div>
        <div className="relative mt-5 min-h-[12rem] flex-1"><TsTrendChart key={months} monthly={monthly} reduceMotion={reduceMotion} /></div>
      </CardContent></Card>
    </Reveal>
  )
}
