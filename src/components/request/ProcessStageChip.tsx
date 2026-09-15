import { useEffect, useState, type MouseEvent } from "react"
import type { ProcessStage } from "@/data/request-process-stage"

interface ProcessStageChipProps {
  stage: ProcessStage
  onOpen: () => void
}

export function ProcessStageChip({ stage, onOpen }: ProcessStageChipProps) {
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    setFilled(false)
    const frame = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(frame)
  }, [stage.currentIndex, stage.steps.length])

  const stop = (event: MouseEvent) => event.stopPropagation()
  const progress = stage.currentIndex < 0 ? 0 : (stage.currentIndex + 1) / stage.steps.length * 100
  const struck = stage.halted === "드롭" || stage.halted === "반려"
  const title = stage.linked ? `${stage.currentIndex + 1}/${stage.steps.length}단계 ${stage.label}` : "대기"

  return (
    <button
      type="button"
      disabled={!stage.linked}
      title={title}
      onMouseDown={stop}
      onDoubleClick={stop}
      onClick={(event) => { event.stopPropagation(); if (stage.linked) onOpen() }}
      className="relative h-5 w-full overflow-hidden rounded-full bg-[var(--muted)] text-[10px] font-medium text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-default disabled:text-[var(--muted-foreground)]"
    >
      {stage.linked ? <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 origin-left transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none"
        style={{
          width: `${progress}%`,
          background: `color-mix(in srgb, ${stage.color} 34%, transparent)`,
          borderRight: `2px solid ${stage.color}`,
          transform: filled ? "scaleX(1)" : "scaleX(0)",
        }}
      /> : null}
      <span className={`relative flex items-center justify-center gap-1 ${struck ? "line-through" : ""}`}>
        {stage.linked ? <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} /> : null}
        {stage.label}
      </span>
    </button>
  )
}
