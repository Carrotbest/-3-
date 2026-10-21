import { cn } from "@/lib/utils"
import type { NavBadgeKind } from "@/data/nav-badges"

interface NavBadgeProps {
  kind: NavBadgeKind
  count: number
  /** 접힌 사이드바에서는 글자 대신 점만 찍는다. */
  dot?: boolean
  /** 색 토큰. 사이드바는 구역 강조색, 상단바는 기본색을 쓴다. */
  tone?: string
  className?: string
}

/**
 * 신규 표시(R341). 아이폰 뱃지에서 따왔지만 빨강을 쓰지 않는다.
 * 표 안이 아니라 사이드바와 상단바에만 뜨므로 한 화면에 많아야 예닐곱 개다.
 * 깜빡임, 번짐 그림자, backdrop-filter를 넣지 말 것. 넣으면 이 표시만 눈에 띈다.
 */
export function NavBadge({ kind, count, dot = false, tone = "var(--nav-accent)", className }: NavBadgeProps) {
  const label = kind === "count" ? `신규 ${count}건` : "자료가 갱신되었습니다"

  if (dot) {
    return (
      <span
        aria-label={label}
        className={cn("block size-[7px] shrink-0 rounded-full", className)}
        style={{ background: tone }}
      />
    )
  }

  const style = {
    background: `color-mix(in srgb, ${tone} 14%, transparent)`,
    color: tone,
  }

  if (kind === "updated") {
    return (
      <span
        aria-label={label}
        className={cn(
          "inline-flex h-[16px] shrink-0 items-center justify-center rounded-full px-1.5 text-[9px] font-semibold leading-none tracking-[0.06em]",
          className,
        )}
        style={style}
      >
        <span aria-hidden="true">UPDATED</span>
      </span>
    )
  }

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none tabular-nums",
        className,
      )}
      style={style}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    </span>
  )
}
