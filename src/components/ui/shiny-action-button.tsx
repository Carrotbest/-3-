import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 신규·추가 액션 전용 강조 버튼.
 *
 * 움직이는 그라데이션(`animate-shine`), 호버 광택 스윕, 유리 느낌의 안쪽 하이라이트를 함께 쓴다.
 * 화면마다 `tone`만 바꾸고 `size`·`rounded`는 그 줄에 있는 다른 버튼에 맞춘다.
 * `animate-shine`은 `--duration` 변수를 읽으므로 인라인 style로 함께 넘긴다.
 */
const TONE_GRADIENT = {
  aurora: "linear-gradient(110deg,var(--primary),#22d3ee,#8b5cf6,var(--primary))",
  teal: "linear-gradient(110deg,#0d9488,#14b8a6,#06b6d4,#0d9488)",
  indigo: "linear-gradient(110deg,#4f46e5,#6366f1,#0ea5e9,#4f46e5)",
  amber: "linear-gradient(110deg,#d97706,#f59e0b,#fb7185,#d97706)",
  violet: "linear-gradient(110deg,#5b6cff,#8b5cf6,#ec4899,#5b6cff)",
  sky: "linear-gradient(110deg,#0284c7,#06b6d4,#22d3ee,#0284c7)",
  rose: "linear-gradient(110deg,#e11d48,#f43f5e,#a855f7,#e11d48)",
} as const

const SIZE_CLASS = {
  xs: "h-7 gap-1 px-3 text-[11px] [&_svg]:size-3.5",
  sm: "h-8 gap-1.5 px-3 text-xs [&_svg]:size-4",
  default: "h-9 gap-2 px-4 text-sm [&_svg]:size-4",
  lg: "h-10 gap-2 px-6 text-sm [&_svg]:size-4",
} as const

export interface ShinyActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: keyof typeof TONE_GRADIENT
  size?: keyof typeof SIZE_CLASS
  rounded?: "md" | "full"
  /** 호버 때 아이콘 움직임. rotate는 90도, spin은 반 바퀴. */
  iconMotion?: "rotate" | "spin" | "none"
  icon?: React.ReactNode
  duration?: string
}

export const ShinyActionButton = React.forwardRef<HTMLButtonElement, ShinyActionButtonProps>(
  ({ tone = "aurora", size = "default", rounded = "md", iconMotion = "rotate", icon, duration = "6s", className, children, style, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      style={{ backgroundImage: TONE_GRADIENT[tone], "--duration": duration, ...style } as React.CSSProperties}
      className={cn(
        "group relative isolate inline-flex shrink-0 animate-shine items-center justify-center overflow-hidden whitespace-nowrap border border-white/25 bg-[length:250%_250%] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-[2px] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-8px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.6)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-50 motion-reduce:animate-none motion-reduce:transform-none motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        SIZE_CLASS[size],
        rounded === "full" ? "rounded-full" : "rounded-[var(--radius)]",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full rounded-[inherit] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden" />
      {icon ? (
        <span className={cn("relative z-10 inline-flex transition-transform duration-300 motion-reduce:transition-none", iconMotion === "rotate" && "group-hover:rotate-90", iconMotion === "spin" && "group-hover:rotate-180")}>{icon}</span>
      ) : null}
      <span className="relative z-10">{children}</span>
    </button>
  ),
)
ShinyActionButton.displayName = "ShinyActionButton"
