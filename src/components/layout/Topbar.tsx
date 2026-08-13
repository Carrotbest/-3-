import { Menu } from "lucide-react"
import { useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { routeDefinitions } from "@/routes/route-config"

interface TopbarProps {
  onToggleSidebar: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { pathname } = useLocation()
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
    </header>
  )
}
