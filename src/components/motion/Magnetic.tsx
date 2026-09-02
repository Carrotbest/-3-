import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"

import { Spring, startFrameLoop, stopFrameLoop } from "@/lib/spring"
import { cn } from "@/lib/utils"

interface MagneticProps {
  children: ReactNode
  className?: string
  /** 커서 쪽으로 끌려가는 최대 거리(px). 0이면 자석 효과를 끈다. */
  strength?: number
  /** 최대 기울기(deg). 0이면 틸트를 끈다. */
  tilt?: number
  /** hover 시 떠오르는 높이(px). */
  lift?: number
  /** hover 시 확대 비율. 1이면 확대하지 않는다. */
  scale?: number
  /** 커서를 따라다니는 광택 하이라이트. */
  glare?: boolean
  /** hover 중에만 붙는 클래스(그림자·z-index 등). */
  activeClassName?: string
  /** 스프링 강성. 클수록 빠르고 단단해진다. */
  stiffness?: number
  /** 스프링 감쇠. 클수록 출렁임이 줄어든다. */
  damping?: number
}

/**
 * 커서를 향해 끌려가는 자석형 hover 래퍼.
 *
 * transform 을 CSS transition 이 아니라 스프링으로 적분해 매 프레임 직접 써 넣는다.
 * hover 진입·이탈이 "정해진 시간 동안 A에서 B로"가 아니라 속도를 물려받는 감속으로
 * 바뀌기 때문에, 커서를 스치듯 지나가도 딱딱 끊기지 않는다.
 * 프레임마다 React 리렌더가 일어나지 않도록 값은 전부 ref 로만 다룬다.
 * prefers-reduced-motion 환경에서는 아무 변형도 하지 않는다.
 */
export function Magnetic({
  children,
  className,
  strength = 6,
  tilt = 0,
  lift = 6,
  scale = 1,
  glare = false,
  activeClassName,
  stiffness = 80,
  damping = 15,
}: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLSpanElement>(null)
  const restingRect = useRef<DOMRect | null>(null)
  const [active, setActive] = useState(false)

  const reduce = useRef(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    reduce.current = query.matches
    const onChange = () => { reduce.current = query.matches }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  // 렌더마다 갱신되는 설정 스냅샷. 프레임 콜백이 항상 최신 값을 읽게 한다.
  const config = useRef({ strength, tilt, lift, scale, glare })
  config.current = { strength, tilt, lift, scale, glare }

  const springs = useRef<Record<"x" | "y" | "rotateX" | "rotateY" | "progress", Spring> | null>(null)
  if (springs.current === null) {
    const options = { stiffness, damping }
    springs.current = {
      x: new Spring(0, options),
      y: new Spring(0, options),
      rotateX: new Spring(0, options),
      rotateY: new Spring(0, options),
      progress: new Spring(0, { ...options, precision: 0.0008 }),
    }
  }
  for (const spring of Object.values(springs.current)) {
    spring.stiffness = stiffness
    spring.damping = damping
  }

  // 광택 위치는 스프링 대상이 아니라 커서 위치 그대로 따라간다.
  const glarePoint = useRef({ x: 50, y: 50 })

  const tick = useCallback((dt: number) => {
    const node = ref.current
    const state = springs.current
    if (!node || !state) return false

    let moving = false
    for (const spring of Object.values(state)) {
      if (spring.step(dt)) moving = true
    }

    const { tilt: maxTilt, lift: maxLift, scale: maxScale } = config.current
    const progress = state.progress.value
    const transform = [
      maxTilt > 0 ? "perspective(60rem)" : "",
      `translate3d(${state.x.value.toFixed(3)}px, ${(state.y.value - maxLift * progress).toFixed(3)}px, 0)`,
      maxTilt > 0 ? `rotateX(${state.rotateX.value.toFixed(3)}deg) rotateY(${state.rotateY.value.toFixed(3)}deg)` : "",
      maxScale !== 1 ? `scale(${(1 + (maxScale - 1) * progress).toFixed(4)})` : "",
    ].filter(Boolean).join(" ")
    node.style.transform = transform

    const glareNode = glareRef.current
    if (glareNode) {
      glareNode.style.opacity = (progress * 0.7).toFixed(3)
      glareNode.style.background = `radial-gradient(22rem circle at ${glarePoint.current.x.toFixed(1)}% ${glarePoint.current.y.toFixed(1)}%, rgba(255,255,255,0.55), transparent 45%)`
    }

    if (!moving) {
      node.style.willChange = ""
      // 완전히 원위치했으면 인라인 transform 을 걷어내 레이어를 반납한다.
      if (state.progress.target === 0) node.style.transform = ""
    }
    return moving
  }, [])

  useEffect(() => () => { stopFrameLoop(tick) }, [tick])

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce.current || event.pointerType !== "mouse") return
    const node = ref.current
    const state = springs.current
    if (!node || !state) return

    const rect = restingRect.current
    if (!rect) return
    if (rect.width === 0 || rect.height === 0) return
    // 진입 순간의 변형 전 경계를 기준으로 삼고, 가장자리 밖 좌표도 ±0.5 안에 가둔다.
    const offsetX = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5))
    const offsetY = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5))

    const { strength: pull, tilt: maxTilt } = config.current
    state.x.to(offsetX * 2 * pull)
    state.y.to(offsetY * 2 * pull)
    state.rotateX.to(-offsetY * 2 * maxTilt)
    state.rotateY.to(offsetX * 2 * maxTilt)
    state.progress.to(1)
    glarePoint.current = { x: (offsetX + 0.5) * 100, y: (offsetY + 0.5) * 100 }

    node.style.willChange = "transform"
    startFrameLoop(tick)
  }

  const handleEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce.current || event.pointerType !== "mouse") return
    const node = ref.current
    if (!node) return
    restingRect.current = node.getBoundingClientRect()
    setActive(true)
  }

  const handleLeave = () => {
    restingRect.current = null
    setActive(false)
    const state = springs.current
    if (!state) return
    // 목표만 0으로 돌린다. 현재 속도를 물고 가므로 되돌아가는 길도 이어진다.
    state.x.to(0)
    state.y.to(0)
    state.rotateX.to(0)
    state.rotateY.to(0)
    state.progress.to(0)
    startFrameLoop(tick)
  }

  return (
    <div
      ref={ref}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
      onPointerDown={handleLeave}
      className={cn(
        "relative h-full min-w-0 [--hover-lift:0px] [transform-style:preserve-3d]",
        active && activeClassName,
        className,
      )}
    >
      {children}
      {glare ? (
        <span
          ref={glareRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-0 mix-blend-soft-light"
        />
      ) : null}
    </div>
  )
}

export type { MagneticProps }
