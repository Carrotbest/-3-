import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

/** 기간 키. 바뀌면 모든 게이지가 0부터 다시 찬다. */
export const RddaMotionContext = createContext("")

interface SectionMotion {
  started: boolean
  /** 섹션 안에서 게이지마다 순서를 매긴다. 순서만큼 늦게 시작해 위에서 아래로 차례로 찬다. */
  nextOrder: () => number
}

const SectionContext = createContext<SectionMotion | null>(null)

const STAGGER_MS = 45
const MAX_DELAY_MS = 700

const reducedMotion = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * 화면에 들어올 때 안쪽 게이지를 시작시키는 구역(R214).
 * 긴 표도 윗부분이 보이면 시작하도록 threshold 0을 쓴다(CLAUDE.md Reveal 0.12 사고 참조).
 */
export function MotionSection({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLElement | null>(null)
  const [started, setStarted] = useState(reducedMotion)
  const counter = useRef(0)
  useEffect(() => {
    if (started) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") { setStarted(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setStarted(true); observer.disconnect() }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [started])
  const value = useRef<SectionMotion>({ started, nextOrder: () => counter.current++ })
  value.current = { started, nextOrder: value.current.nextOrder }
  return <Tag ref={ref as never} className={className}><SectionContext.Provider value={{ ...value.current }}>{children}</SectionContext.Provider></Tag>
}

/** 섹션이 화면에 들어왔는지. 차트처럼 자체 애니메이션이 있는 것은 이 값이 true일 때 그린다. */
export function useSectionStarted(): boolean {
  const section = useContext(SectionContext)
  return section ? section.started : true
}

/** 0에서 1로 차오르는 진행률. 빠르게 시작해 천천히 멈춘다(easeOutQuart). */
export function useFill(duration = 1100): number {
  const motionKey = useContext(RddaMotionContext)
  const section = useContext(SectionContext)
  const [order] = useState(() => section?.nextOrder() ?? 0)
  const started = section ? section.started : true
  const [fill, setFill] = useState(0)

  useEffect(() => {
    if (reducedMotion()) { setFill(1); return }
    setFill(0)
    if (!started) return
    let frame = 0
    let begin = 0
    const delay = Math.min(order * STAGGER_MS, MAX_DELAY_MS)
    const animate = (time: number) => {
      if (!begin) begin = time + delay
      const elapsed = Math.max(0, Math.min(1, (time - begin) / duration))
      setFill(1 - (1 - elapsed) ** 4)
      if (elapsed < 1) frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [duration, motionKey, started, order])

  return fill
}

export function AnimatedNumber({ value, decimals = 0, suffix = "", locale = false, fill: sharedFill }: { value: number; decimals?: number; suffix?: string; locale?: boolean; fill?: number }) {
  const ownFill = useFill()
  const fill = sharedFill ?? ownFill
  const displayed = Number((value * fill).toFixed(decimals))
  const text = locale
    ? displayed.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : displayed.toFixed(decimals)
  return <span className="tabular-nums">{text}{suffix}</span>
}
