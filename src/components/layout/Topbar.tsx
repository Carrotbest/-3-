import { LogOut, Menu } from "lucide-react"
import { useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { routeDefinitions } from "@/routes/route-config"
import { signOutUser, useAuthStore } from "@/data/auth"

interface TopbarProps {
  onToggleSidebar: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { pathname } = useLocation()
  const user = useAuthStore((state) => state.user)
  const isOwner = useAuthStore((state) => state.isOwner)
  const currentRoute = routeDefinitions.find((definition) => definition.path === pathname)
    ?? [...routeDefinitions]
      .sort((left, right) => right.path.length - left.path.length)
      .find((definition) => pathname.startsWith(definition.path))

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_94%,transparent)] px-4 backdrop-blur-sm sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="메뉴 열기"
        aria-controls="app-sidebar"
        onClick={onToggleSidebar}
        className="lg:hidden"
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <h1 className="shrink-0 whitespace-nowrap text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          {currentRoute?.title ?? ""}
        </h1>
        {currentRoute?.subtitle ? (
          <>
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[var(--border)]" />
            <p className="min-w-0 truncate text-xs text-[var(--muted-foreground)]">{currentRoute.subtitle}</p>
          </>
        ) : null}
      </div>

      {user ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={
              "hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block " +
              (isOwner
                ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]")
            }
            title={isOwner ? "편집·업로드 권한" : "읽기 전용(편집은 소유자만)"}
          >
            {isOwner ? "편집 권한" : "읽기 전용"}
          </span>
          <span className="hidden max-w-[180px] truncate text-xs text-[var(--muted-foreground)] md:inline">
            {user.email}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="로그아웃"
            title="로그아웃"
            onClick={() => { void signOutUser() }}
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </header>
  )
}
