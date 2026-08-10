import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
}

const SUCCESS = new Set(["완료", "Active", "Success"])
const DESTRUCTIVE = new Set(["지연", "미진행", "Suspended", "Failed"])
const SECONDARY = new Set(["진행", "처리중", "계획", "Processing", "Invited"])
const NEW = new Set(["신규", "접수", "New"])

export function StatusBadge({ status }: StatusBadgeProps) {
  if (SUCCESS.has(status)) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-[var(--chart-2)] text-[var(--primary-foreground)]"
      >
        {status}
      </Badge>
    )
  }

  if (DESTRUCTIVE.has(status)) return <Badge variant="destructive">{status}</Badge>
  if (SECONDARY.has(status)) return <Badge variant="secondary">{status}</Badge>

  return (
    <Badge
      variant="outline"
      className={cn(NEW.has(status) && "border-[var(--sidebar-ring)] text-[var(--sidebar-ring)]")}
    >
      {status}
    </Badge>
  )
}
