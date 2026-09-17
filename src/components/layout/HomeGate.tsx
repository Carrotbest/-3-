import type { ReactNode, SyntheticEvent } from "react"
import { LockKeyhole } from "lucide-react"

import { useAuthStore } from "@/data/auth"

/**
 * HOME 공개 범위(R219). HOME은 원단 R&D 팀 KPI 위주라 팀 밖에는 흐리게만 보인다.
 * access.home: edit = 공개, read = 블러(호버 효과는 보이고 클릭·키 입력은 막음), none = 메뉴 없음.
 * 블러는 화면 가림일 뿐 데이터는 브라우저에 있다. 전사 배포 전에는 HOME 구성을 따로 만든다.
 */
export function HomeGate({ children }: { children: ReactNode }) {
  const blurred = useAuthStore((state) => !state.isOwner && state.access.home === "read")
  if (!blurred) return <>{children}</>
  const stop = (event: SyntheticEvent) => { event.preventDefault(); event.stopPropagation() }
  const stopKeys = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Tab") stop(event)
  }
  return <div className="relative">
    <div aria-hidden="true" className="select-none blur-[7px] saturate-[0.85] [&_*]:cursor-default"
      onClickCapture={stop} onMouseDownCapture={stop} onDoubleClickCapture={stop} onContextMenuCapture={stop} onKeyDownCapture={stopKeys} onFocusCapture={(event) => (event.target as HTMLElement).blur?.()}>
      {children}
    </div>
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 lg:left-[calc(50%+9rem)]">
      <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-2 text-sm font-medium text-[var(--foreground)] shadow-lg backdrop-blur">
        <LockKeyhole className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
        HOME 대시보드는 원단 R&amp;D 팀 전용입니다
      </div>
    </div>
  </div>
}
