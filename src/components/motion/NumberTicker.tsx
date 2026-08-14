import { useEffect, useRef, useState } from "react"

import { useInView } from "@/lib/useInView"
import { cn } from "@/lib/utils"

interface NumberTickerProps {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  className?: string
  /** 뷰포트 진입 후 한 번만 카운트업합니다. 기본값은 기존 즉시 시작 동작입니다. */
  startOnView?: boolean
}

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3)

export function NumberTicker({
  value,
  duration = 800,
  decimals = 0,
  suffix = "",
  className,
  startOnView = false,
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const currentValue = useRef(0)
  const { ref, inView } = useInView<HTMLSpanElement>({ once: true })
  const active = !startOnView || inView

  useEffect(() => {
    if (!active) {
      currentValue.current = 0
      setDisplayValue(0)
      return
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion || duration <= 0) {
      currentValue.current = value
      setDisplayValue(value)
      return
    }

    const from = currentValue.current
    const distance = value - from
    let frame = 0
    let startedAt: number | null = null

    const tick = (now: number) => {
      if (startedAt === null) startedAt = now
      const progress = Math.min((now - startedAt) / duration, 1)
      const nextValue = from + distance * easeOutCubic(progress)
      currentValue.current = nextValue
      setDisplayValue(nextValue)

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick)
      } else {
        currentValue.current = value
        setDisplayValue(value)
      }
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [active, duration, value])

  const formatted = displayValue.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span
      ref={ref}
      className={cn("tabular-nums", className)}
      aria-label={`${value.toLocaleString("ko-KR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`}
    >
      {formatted}{suffix}
    </span>
  )
}

export type { NumberTickerProps }
