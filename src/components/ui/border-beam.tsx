import * as React from "react"

import { cn } from "@/lib/utils"

type BeamColor = "var(--chart-1)" | "var(--chart-2)" | "var(--chart-3)" | "var(--chart-4)" | "var(--chart-5)"

interface BorderBeamProps extends React.HTMLAttributes<HTMLSpanElement> {
  colorFrom?: BeamColor
  colorTo?: BeamColor
}

const VIA_COLOR: Record<BeamColor, string> = {
  "var(--chart-1)": "before:via-[var(--chart-1)]",
  "var(--chart-2)": "before:via-[var(--chart-2)]",
  "var(--chart-3)": "before:via-[var(--chart-3)]",
  "var(--chart-4)": "before:via-[var(--chart-4)]",
  "var(--chart-5)": "before:via-[var(--chart-5)]",
}

const TO_COLOR: Record<BeamColor, string> = {
  "var(--chart-1)": "before:to-[var(--chart-1)]",
  "var(--chart-2)": "before:to-[var(--chart-2)]",
  "var(--chart-3)": "before:to-[var(--chart-3)]",
  "var(--chart-4)": "before:to-[var(--chart-4)]",
  "var(--chart-5)": "before:to-[var(--chart-5)]",
}

function BorderBeam({
  className,
  colorFrom = "var(--chart-1)",
  colorTo = "var(--chart-2)",
  ...props
}: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] border border-[var(--border)] before:absolute before:inset-x-1/4 before:-top-px before:h-px before:bg-linear-to-r before:from-transparent",
        VIA_COLOR[colorFrom],
        TO_COLOR[colorTo],
        className,
      )}
      {...props}
    />
  )
}

export { BorderBeam, type BorderBeamProps }
