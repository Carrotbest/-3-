import type { ReactNode } from "react"
import { Info } from "lucide-react"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  caption: string
  /** 이전 API 호환용. Details/Sparkline UI는 더 이상 렌더하지 않는다. */
  deltaPct?: number
  /** 이전 API 호환용. Details/Sparkline UI는 더 이상 렌더하지 않는다. */
  spark?: number[]
  info?: string
  tone?: "default" | "warning" | "destructive"
  decimals?: number
  suffix?: string
  revealDelay?: number
  className?: string
  decoration?: ReactNode
  visual?: ReactNode
  onClick?: () => void
  pressed?: boolean
}

export function StatCard({ icon, label, value, caption, info, tone = "default", decimals = 0, suffix = "", revealDelay = 0, className, decoration, visual, onClick, pressed = false }: StatCardProps) {
  const cardClassName = cn(
    "relative h-full w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-left text-[var(--card-foreground)] shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-300 motion-reduce:transition-none",
    tone === "warning" && "border-[var(--warning)]",
    tone === "destructive" && "border-[var(--destructive)]",
    pressed && "border-[var(--ring)] bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))] shadow-md ring-2 ring-[color-mix(in_oklab,var(--ring)_25%,transparent)]",
    onClick && "cursor-pointer outline-none hover:-translate-y-1 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]",
  )

  const content = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        {info ? onClick ? (
          <span title={info} aria-label={`${label} 설명`} className="rounded-full text-[var(--muted-foreground)]">
            <Info aria-hidden="true" className="size-4" />
          </span>
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full text-[var(--muted-foreground)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
                  aria-label={`${label} 설명`}
                >
                  <Info aria-hidden="true" className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{info}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <p className={cn("mt-3 text-2xl font-semibold tracking-tight tabular-nums", tone === "destructive" ? "text-[var(--destructive)]" : tone === "warning" ? "text-[var(--warning)]" : "text-[var(--foreground)]")}>
        {typeof value === "number" ? <NumberTicker value={value} decimals={decimals} suffix={suffix} /> : value}
      </p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{caption}</p>
      {visual ? <div className="mt-3 border-t border-[var(--border)] pt-3">{visual}</div> : null}
    </CardContent>
  )

  return (
    <Reveal delay={revealDelay} className={cn("h-full", className)}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={pressed} className={cardClassName}>
          {content}
          {decoration}
        </button>
      ) : (
        <Card className={cardClassName}>
          {content}
          {decoration}
        </Card>
      )}
    </Reveal>
  )
}
