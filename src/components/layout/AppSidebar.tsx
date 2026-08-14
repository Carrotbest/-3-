import { Fragment, useState } from "react"
import { ChevronDown } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { navigationGroups, type NavigationItem } from "@/routes/route-config"

interface AppSidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  onToggleCollapsed: () => void
}

interface SidebarLinkProps {
  item: NavigationItem
  collapsed: boolean
  onNavigate: () => void
  active?: boolean
}

function SidebarLink({ item, collapsed, onNavigate, active = false }: SidebarLinkProps) {
  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/" || item.path === "/development"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 overflow-hidden rounded-[var(--radius)] px-3 text-sm font-medium text-[var(--sidebar-foreground)] outline-none transition-colors duration-[var(--t-fast)] before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:origin-center before:scale-y-50 before:rounded-full before:bg-[var(--chart-1)] before:opacity-0 before:transition-[transform,opacity] before:duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none motion-reduce:before:transition-none",
          (isActive || active) && "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] before:scale-y-100 before:opacity-100",
        )
      }
    >
      <item.icon
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform duration-[var(--t-fast)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span
        className={cn(
          "truncate transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.83,0,0.17,1)] motion-reduce:transition-none",
          collapsed ? "opacity-0" : "opacity-100",
        )}
      >
        {item.label}
      </span>
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({ collapsed, mobileOpen, onMobileClose, onToggleCollapsed }: AppSidebarProps) {
  const location = useLocation()
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState(false)

  const expanded = !collapsed || revealed || mobileOpen
  const showCollapsed = !expanded
  const overlay = collapsed && revealed
  const closeReveal = () => {
    setRevealed(false)
    setOpenMap({})
  }
  const handleNavigate = () => {
    onMobileClose()
    closeReveal()
  }

  return (
    <TooltipProvider delayDuration={150}>
      <button
        type="button"
        aria-label="사이드바 닫기"
        onClick={onMobileClose}
        className={cn(
          "fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--foreground)_20%,transparent)] transition-opacity lg:hidden motion-reduce:transition-none",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="주 메뉴"
        onMouseEnter={() => setRevealed(true)}
        onMouseLeave={closeReveal}
        onFocusCapture={() => setRevealed(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeReveal()
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width,transform,box-shadow] duration-500 [transition-timing-function:cubic-bezier(0.83,0,0.17,1)] motion-reduce:transition-none lg:translate-x-0",
          showCollapsed && "lg:w-20",
          overlay && "lg:shadow-[0_1.25rem_3rem_-1rem_rgba(0,0,0,0.45)]",
          mobileOpen && "translate-x-0",
        )}
      >
        <div className="relative flex h-16 items-center gap-3 px-5">
          <Avatar className="size-9">
            <AvatarFallback className="bg-linear-to-br from-[var(--chart-1)] to-[var(--chart-2)] font-semibold text-[var(--sidebar-primary-foreground)]">
              F
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              "min-w-0 transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.83,0,0.17,1)] motion-reduce:transition-none",
              showCollapsed ? "opacity-0" : "opacity-100",
            )}
          >
            <p className="truncate text-sm font-semibold text-[var(--sidebar-accent-foreground)]">FABRIC R&amp;D</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">통합원단부 3팀</p>
          </div>
          <button
            type="button"
            aria-label={collapsed ? "사이드바 고정" : "사이드바 자동 숨김"}
            title={collapsed ? "사이드바 고정" : "사이드바 자동 숨김"}
            onClick={onToggleCollapsed}
            className={cn(
              "absolute top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] text-sm outline-none transition-[background-color,opacity] duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none lg:flex",
              showCollapsed ? "right-1 opacity-0" : "right-2 opacity-100",
            )}
          >
            <span aria-hidden="true">{collapsed ? "📌" : "◀️"}</span>
          </button>
        </div>

        <Separator className="bg-[var(--sidebar-border)]" />

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {navigationGroups.map((group, groupIndex) => (
            <section
              key={group.label}
              aria-label={group.label}
              className={cn(groupIndex > 0 && "mt-4 border-t border-[var(--sidebar-border)] pt-4")}
            >
              <div className="space-y-1">
                {group.items.map((item) => {
                  if (!item.children) {
                    return <SidebarLink key={item.path} item={item} collapsed={showCollapsed} onNavigate={handleNavigate} />
                  }

                  const isParentActive = location.pathname === item.path || item.children.some((child) => location.pathname === child.path)
                  const isOpen = openMap[item.path] ?? isParentActive

                  return (
                    <Fragment key={item.path}>
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <SidebarLink item={item} collapsed={showCollapsed} onNavigate={handleNavigate} active={isParentActive} />
                        </div>
                        {!showCollapsed ? (
                          <button
                            type="button"
                            aria-label={`${item.label} 하위 메뉴`}
                            aria-expanded={isOpen}
                            onClick={() => setOpenMap((current) => ({ ...current, [item.path]: !isOpen }))}
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] outline-none transition-colors duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none",
                              isParentActive && "text-[var(--sidebar-accent-foreground)]",
                            )}
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "size-4 transition-transform duration-[var(--t-fast)] motion-reduce:transition-none",
                                isOpen && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}
                      </div>
                      {!showCollapsed ? (
                        <div
                          aria-hidden={!isOpen}
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-[var(--t-fast)] motion-reduce:transition-none",
                            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className="ml-4 space-y-1 border-l border-[var(--sidebar-border)] pl-4">
                              {item.children.map((child) => (
                                <NavLink
                                  key={child.path}
                                  to={child.path}
                                  end
                                  onClick={handleNavigate}
                                  tabIndex={isOpen ? undefined : -1}
                                  className={({ isActive }) =>
                                    cn(
                                      "relative block rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--muted-foreground)] outline-none transition-colors duration-[var(--t-fast)] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--chart-1)] before:opacity-0 before:transition-opacity before:duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none motion-reduce:before:transition-none",
                                      isActive && "bg-[var(--sidebar-accent)] font-medium text-[var(--sidebar-accent-foreground)] before:opacity-100",
                                    )
                                  }
                                >
                                  {child.label}
                                </NavLink>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </Fragment>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="p-3">
          <Separator className="mb-3 bg-[var(--sidebar-border)]" />
          <div className="flex items-center gap-3 rounded-[var(--radius)] p-2">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs font-semibold">F</AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "min-w-0 transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.83,0,0.17,1)] motion-reduce:transition-none",
                showCollapsed ? "opacity-0" : "opacity-100",
              )}
            >
              <p className="truncate text-sm font-medium">FABRIC R&amp;D</p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">통합원단부 3팀</p>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
