import type { ReactNode } from "react"

import { Magnetic } from "@/components/motion/Magnetic"

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
 * 실제 움직임은 {@link Magnetic} 의 스프링이 담당한다. 기울기와 함께
 * 커서 쪽으로 살짝 끌려가는 자석 성분을 섞어 회전만 할 때보다 덜 기계적으로 보이게 한다.
 */
export function Tilt3D({ children, className, max = 8, lift = 10, glare = true }: Tilt3DProps) {
  return (
    <Magnetic
      className={className}
      tilt={max}
      lift={lift}
      strength={max * 0.45}
      glare={glare}
      activeClassName="z-10"
    >
      {children}
    </Magnetic>
  )
}

export type { Tilt3DProps }
