import { useEffect, useState } from "react"

import { useInView } from "@/lib/useInView"
export type RadialKpiTone = "one" | "two" | "three" | "four"

interface RadialKpiProps {
  label: string
  done: number
  total: number
  pct: number
  tone: RadialKpiTone
}

/** 쿨톤 진행 그라데이션(원사→피니쉬 흐름). [시작, 끝] */
const TONE_GRADIENT: Record<RadialKpiTone, { from: string; to: string }> = {
  one: { from: "#0e7490", to: "#22d3ee" },
  two: { from: "#6d28d9", to: "#a78bfa" },
  three: { from: "#047857", to: "#34d399" },
  four: { from: "#b45309", to: "#fbbf24" },
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

function useAnimatedValue(dependency: number, active: boolean): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) {
      setValue(0)
      return
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      setValue(1)
      return
    }

    let frame = 0
    let startedAt: number | null = null
    setValue(0)
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const progress = Math.min((now - startedAt) / 1800, 1)
      setValue(easeInOutCubic(progress))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [active, dependency])

  return value
}

export function RadialKpi({ label, done, total, pct, tone }: RadialKpiProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true })
  const progress = useAnimatedValue(pct, inView)
  const animatedPct = pct * progress
  const animatedDone = Math.round(done * progress)
  const animatedTotal = Math.round(total * progress)
  const grad = TONE_GRADIENT[tone]
  const gradientId = `radial-kpi-${tone}`

  return (
    <div
      ref={ref}
      className="group flex flex-col items-center text-center"
      role="img"
      aria-label={`${label} 공정 도달률 ${pct.toLocaleString("ko-KR")}% · ${done}/${total}건`}
    >
      <div className="relative size-40">
        <svg aria-hidden="true" viewBox="0 0 120 120" className="size-full -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={grad.from} />
              <stop offset="100%" stopColor={grad.to} />
            </linearGradient>
          </defs>
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
            stroke={`url(#${gradientId})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            {animatedPct.toFixed(1)}%
          </span>
          <span className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {animatedDone} / {animatedTotal}건
          </span>
        </div>
      </div>
      <p className="mt-3 text-base font-semibold text-[var(--foreground)]">{label}</p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">공정 도달 기준</p>
    </div>
  )
}
