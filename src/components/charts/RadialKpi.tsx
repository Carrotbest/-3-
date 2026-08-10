import { useEffect, useState } from "react"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { cn } from "@/lib/utils"

export type RadialKpiTone = "one" | "two" | "three" | "four"

interface RadialKpiProps {
  label: string
  done: number
  total: number
  pct: number
  tone: RadialKpiTone
}

const STROKE_CLASS: Record<RadialKpiTone, string> = {
  one: "stroke-[var(--chart-1)]",
  two: "stroke-[var(--chart-2)]",
  three: "stroke-[var(--chart-3)]",
  four: "stroke-[var(--chart-4)]",
}

function useAnimatedValue(target: number): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      setValue(target)
      return
    }

    let frame = 0
    let startedAt: number | null = null
    setValue(0)
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const progress = Math.min((now - startedAt) / 900, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [target])

  return value
}

export function RadialKpi({ label, done, total, pct, tone }: RadialKpiProps) {
  const animatedPct = useAnimatedValue(pct)

  return (
    <div
      className="flex flex-col items-center text-center"
      role="img"
      aria-label={`${label} 공정 도달률 ${pct.toLocaleString("ko-KR")}% · ${done}/${total}건`}
    >
      <div className="relative size-40">
        <svg aria-hidden="true" viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="50"
            pathLength="100"
            fill="none"
            strokeWidth="10"
            className="stroke-[var(--muted)]"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            pathLength="100"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={100 - animatedPct}
            className={cn(STROKE_CLASS[tone])}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            <NumberTicker value={pct} duration={900} decimals={1} suffix="%" />
          </span>
          <span className="mt-1 text-sm font-medium text-[var(--foreground)]">
            <NumberTicker value={done} duration={900} /> / <NumberTicker value={total} duration={900} suffix="건" />
          </span>
        </div>
      </div>
      <p className="mt-3 text-base font-semibold text-[var(--foreground)]">{label}</p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">공정 도달 기준</p>
    </div>
  )
}
