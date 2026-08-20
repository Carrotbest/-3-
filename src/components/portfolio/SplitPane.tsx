import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SplitPaneProps {
  orientation: "vertical" | "horizontal"
  storageKey: string
  defaultRatio: number
  min: number
  max: number
  first: ReactNode
  second: ReactNode
  ariaLabel?: string
  className?: string
}

const clampRatio = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

const loadRatio = (storageKey: string, defaultRatio: number, min: number, max: number): number => {
  if (typeof window === "undefined") return clampRatio(defaultRatio, min, max)
  try {
    const stored = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored >= min && stored <= max
      ? Math.round(stored)
      : clampRatio(defaultRatio, min, max)
  } catch {
    return clampRatio(defaultRatio, min, max)
  }
}

const saveRatio = (storageKey: string, ratio: number) => {
  try {
    window.localStorage.setItem(storageKey, String(ratio))
  } catch {
    // 저장소를 사용할 수 없어도 현재 세션의 조절은 유지한다.
  }
}

export function SplitPane({
  orientation,
  storageKey,
  defaultRatio,
  min,
  max,
  first,
  second,
  ariaLabel = "영역 크기 조절",
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [ratio, setRatio] = useState(() => loadRatio(storageKey, defaultRatio, min, max))
  const vertical = orientation === "vertical"

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  const applyRatio = (value: number) => {
    const next = clampRatio(value, min, max)
    setRatio(next)
    saveRatio(storageKey, next)
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    resizeCleanupRef.current?.()
    const bounds = containerRef.current?.getBoundingClientRect()
    const span = vertical ? bounds?.width : bounds?.height
    if (!bounds || !span) return

    const pointerId = event.pointerId
    const previousUserSelect = document.body.style.userSelect
    let nextRatio = ratio
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const position = vertical ? moveEvent.clientX - bounds.left : moveEvent.clientY - bounds.top
      nextRatio = clampRatio((position / span) * 100, min, max)
      setRatio(nextRatio)
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerEnd)
      window.removeEventListener("pointercancel", onPointerEnd)
      document.body.style.userSelect = previousUserSelect
      saveRatio(storageKey, nextRatio)
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) cleanup()
    }

    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerEnd)
    window.addEventListener("pointercancel", onPointerEnd)
    resizeCleanupRef.current = cleanup
  }

  const separator = (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={ratio}
      tabIndex={0}
      onPointerDown={startResize}
      onDoubleClick={() => applyRatio(defaultRatio)}
      onKeyDown={(event) => {
        const decrease = vertical ? "ArrowLeft" : "ArrowUp"
        const increase = vertical ? "ArrowRight" : "ArrowDown"
        if (event.key !== decrease && event.key !== increase) return
        event.preventDefault()
        applyRatio(ratio + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 5 : 2))
      }}
      className={cn(
        "group relative hidden select-none items-center justify-center outline-none xl:flex xl:touch-none",
        vertical ? "h-full cursor-col-resize" : "w-full cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "bg-[var(--border)] transition-colors group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)] motion-reduce:transition-none",
          vertical ? "h-full w-px" : "h-px w-full",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] shadow-sm transition-colors group-hover:border-[var(--primary)] group-focus-visible:border-[var(--ring)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--ring)] motion-reduce:transition-none",
          vertical ? "h-12 w-2" : "h-2 w-12",
        )}
        aria-hidden="true"
      >
        <span className={cn("bg-[var(--muted-foreground)]", vertical ? "h-5 w-px" : "h-px w-5")} />
      </span>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 min-w-0",
        vertical
          ? "grid grid-cols-1 gap-4 xl:h-full xl:grid-cols-[minmax(0,var(--split-pane-first))_0.5rem_minmax(0,1fr)] xl:gap-0"
          : "flex flex-col gap-4 overflow-y-auto xl:grid xl:h-full xl:grid-rows-[minmax(0,var(--split-pane-first))_0.5rem_minmax(0,1fr)] xl:gap-0 xl:overflow-hidden",
        className,
      )}
      style={{ "--split-pane-first": `${ratio}%` } as CSSProperties}
    >
      <div className={cn("min-h-0 min-w-0", !vertical && "shrink-0 xl:overflow-hidden")}>{first}</div>
      {separator}
      <div className={cn("min-h-0 min-w-0", !vertical && "shrink-0 xl:overflow-hidden")}>{second}</div>
    </div>
  )
}
