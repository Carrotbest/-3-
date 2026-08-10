import { useRef, useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface Tilt3DProps {
  children: ReactNode
  className?: string
  /** 최대 기울기(deg). 기본 8도. */
  max?: number
  /** hover 시 떠오르는 높이(px). 기본 10px. */
  lift?: number
  /** 광택 하이라이트 표시 여부. 기본 true. */
  glare?: boolean
}

/**
 * 절제된 3D 틸트 래퍼.
 * 포인터 위치에 따라 perspective rotateX/rotateY 를 적용하고,
 * 커서를 따라다니는 광택 하이라이트와 깊이 그림자를 얹는다.
 * prefers-reduced-motion 환경에서는 변형을 생략한다.
 * 외부 3D 라이브러리 없이 CSS transform 만 사용한다.
 */
export function Tilt3D({ children, className, max = 8, lift = 10, glare = true }: Tilt3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({})
  const [glarePos, setGlarePos] = useState<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState(false)

  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    const rotateY = (px - 0.5) * 2 * max
    const rotateX = -(py - 0.5) * 2 * max
    setStyle({
      transform: `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-${lift}px)`,
    })
    setGlarePos({ x: px * 100, y: py * 100 })
  }

  const reset = () => {
    setActive(false)
    setStyle({})
    setGlarePos(null)
  }

  return (
    <div
      ref={ref}
      onPointerEnter={() => setActive(true)}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      className={cn(
        "relative h-full [transform-style:preserve-3d] will-change-transform",
        reduce ? "" : "transition-transform duration-300 ease-out",
        active ? "z-10 shadow-[var(--shadow-4,0_1.5rem_2.5rem_-1rem_rgba(15,23,42,0.35))]" : "",
        className,
      )}
      style={style}
    >
      {children}
      {glare && glarePos && !reduce ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-70 mix-blend-soft-light"
          style={{
            background: `radial-gradient(22rem circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.55), transparent 45%)`,
          }}
        />
      ) : null}
    </div>
  )
}
