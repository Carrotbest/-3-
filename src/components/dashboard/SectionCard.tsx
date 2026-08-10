import type { ReactNode } from "react"

import { Reveal } from "@/components/motion/Reveal"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SectionCardProps {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  wrapperClassName?: string
  contentClassName?: string
  revealDelay?: number
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  wrapperClassName,
  contentClassName,
  revealDelay = 0,
}: SectionCardProps) {
  return (
    <Reveal delay={revealDelay} className={cn("h-full", wrapperClassName)}>
      <Card className={cn("h-full min-w-0", className)}>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </CardHeader>
        <CardContent className={cn("min-w-0", contentClassName)}>{children}</CardContent>
      </Card>
    </Reveal>
  )
}
