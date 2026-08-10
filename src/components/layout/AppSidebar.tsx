import { Fragment, useEffect, useState } from "react"
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
}

interface SidebarLinkProps {
  item: NavigationItem
  collapsed: boolean
  onNavigate: () => void
}

function SidebarLink({ item, collapsed, onNavigate }: SidebarLinkProps) {
  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 overflow-hidden rounded-[var(--radius)] px-3 text-sm font-medium text-[var(--sidebar-foreground)] outline-none transition-colors duration-[var(--t-fast)] before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:origin-center before:scale-y-50 before:rounded-full before:bg-[var(--chart-1)] before:opacity-0 before:transition-[transform,opacity] before:duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none motion-reduce:before:transition-none",
          collapsed && "justify-center px-0",
          isActive && "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] before:scale-y-100 before:opacity-100",
        )
      }
    >
      <item.icon
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform duration-[var(--t-fast)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
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

export function AppSidebar({ collapsed, mobileOpen, onMobileClose }: AppSidebarProps) {
  const location = useLocation()
  const developmentActive = location.pathname.startsWith("/development")
  const [developmentOpen, setDevelopmentOpen] = useState(developmentActive)

  useEffect(() => {
    if (developmentActive) setDevelopmentOpen(true)
  }, [developmentActive])

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
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-[width,transform] duration-200 motion-reduce:transition-none lg:translate-x-0",
          collapsed && "lg:w-20",
          mobileOpen && "translate-x-0",
        )}
      >
        <div className={cn("flex h-16 items-center gap-3 px-5", collapsed && "lg:justify-center lg:px-0")}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-linear-to-br from-[var(--chart-1)] to-[var(--chart-2)] font-semibold text-[var(--sidebar-primary-foreground)]">
              F
            </AvatarFallback>
          </Avatar>
          <div className={cn("min-w-0", collapsed && "lg:sr-only")}>
            <p className="truncate text-sm font-semibold text-[var(--sidebar-accent-foreground)]">FABRIC R&amp;D</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">통합원단부 3팀</p>
          </div>
        </div>

        <Separator className="bg-[var(--sidebar-border)]" />

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navigationGroups.map((group) => (
            <section key={group.label} aria-labelledby={`nav-${group.label.replaceAll(" ", "-")}`}>
              <h2
                id={`nav-${group.label.replaceAll(" ", "-")}`}
                className={cn(
                  "mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--muted-foreground)_70%,transparent)]",
                  collapsed && "lg:sr-only",
                )}
              >
                {group.label}
              </h2>
              <div className="space-y-1">
                {group.items.map((item) => {
                  if (!item.children) {
                    return <SidebarLink key={item.path} item={item} collapsed={collapsed} onNavigate={onMobileClose} />
                  }

                  return (
                    <Fragment key={item.path}>
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <SidebarLink item={item} collapsed={collapsed} onNavigate={onMobileClose} />
                        </div>
                        {!collapsed ? (
                          <button
                            type="button"
                            aria-label="DEVELOPMENT 하위 메뉴"
                            aria-expanded={developmentOpen}
                            onClick={() => setDevelopmentOpen((current) => !current)}
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--muted-foreground)] outline-none transition-colors duration-[var(--t-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_60%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[var(--sidebar-ring)] motion-reduce:transition-none",
                              developmentActive && "text-[var(--sidebar-accent-foreground)]",
                            )}
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "size-4 transition-transform duration-[var(--t-fast)] motion-reduce:transition-none",
                                developmentOpen && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}
                      </div>
                      {!collapsed ? (
                        <div
                          aria-hidden={!developmentOpen}
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-[var(--t-fast)] motion-reduce:transition-none",
                            developmentOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className="ml-4 space-y-1 border-l border-[var(--sidebar-border)] pl-4">
                              {item.children.map((child) => (
                                <NavLink
                                  key={child.path}
                                  to={child.path}
                                  end={child.path === "/development"}
                                  onClick={onMobileClose}
                                  tabIndex={developmentOpen ? undefined : -1}
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
          <div className={cn("flex items-center gap-3 rounded-[var(--radius)] p-2", collapsed && "lg:justify-center")}>
            <Avatar className="size-8">
              <AvatarFallback className="text-xs font-semibold">F</AvatarFallback>
            </Avatar>
            <div className={cn("min-w-0", collapsed && "lg:sr-only")}>
              <p className="truncate text-sm font-medium">FABRIC R&amp;D</p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">통합원단부 3팀</p>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
