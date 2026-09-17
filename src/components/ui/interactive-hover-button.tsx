import React from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string
}

/**
 * 점이 번져 버튼을 채우고, 글자가 밀려난 자리에 글자+화살표가 들어오는 버튼.
 * 이 프로젝트의 Tailwind 테마는 bg-background·bg-primary·text-primary-foreground 유틸을 매핑하지 않으므로
 * (CLAUDE.md 팝업 투명 버그 참조) 원본의 해당 클래스를 CSS 변수 표기로 바꿨다.
 */
const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "group relative w-32 cursor-pointer overflow-hidden rounded-full border bg-[var(--background)] p-2 text-center font-semibold",
        className,
      )}
      {...props}
    >
      <span className="inline-block translate-x-1 transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
        {text}
      </span>
      <div className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-[var(--primary-foreground)] opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100">
        <span>{text}</span>
        <ArrowRight />
      </div>
      <div className="absolute left-[20%] top-[40%] h-2 w-2 scale-[1] rounded-lg bg-[var(--primary)] transition-all duration-300 group-hover:left-[0%] group-hover:top-[0%] group-hover:h-full group-hover:w-full group-hover:scale-[1.8] group-hover:bg-[var(--primary)]"></div>
    </button>
  )
})

InteractiveHoverButton.displayName = "InteractiveHoverButton"

export { InteractiveHoverButton }
