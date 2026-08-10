import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
}

const delayClass = (delay: number) => {
  if (delay >= 300) return "delay-300"
  if (delay >= 200) return "delay-200"
  if (delay >= 150) return "delay-150"
  if (delay >= 75) return "delay-75"
  return "delay-0"
}

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ))

  useEffect(() => {
    const node = rootRef.current
    if (!node || revealed) return

    if (!("IntersectionObserver" in window)) {
      setRevealed(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setRevealed(true)
        observer.disconnect()
      },
      { threshold: 0.12 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed])

  return (
    <div
      ref={rootRef}
      className={cn(
        "min-w-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none",
        delayClass(delay),
        revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  )
}

export type { RevealProps }
