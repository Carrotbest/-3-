import { useEffect, useState } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { Topbar } from "@/components/layout/Topbar"
import { ParsingOverlay } from "@/components/upload/ParsingOverlay"
import { loadAllCache, saveCache } from "@/data/cache"
import { loadEmbeddedAppData, markEmbeddedAppDataApplied } from "@/data/embedded-workbooks"
import { cn } from "@/lib/utils"
import { Development } from "@/routes/Development"
import { Home } from "@/routes/Home"
import { Calendar } from "@/routes/Calendar"
import { PlaceholderPage } from "@/routes/PlaceholderPage"
import { Rdda } from "@/routes/Rdda"
import { Setting } from "@/routes/Setting"
import { Study } from "@/routes/Study"
import { Sync } from "@/routes/Sync"
import { TS } from "@/routes/TS"
import { FabricAnalysis } from "@/routes/FabricAnalysis"
import { Warehouse } from "@/routes/Warehouse"
import { setAppState } from "@/store/useAppStore"
import { routeDefinitions } from "@/routes/route-config"

const IMPLEMENTED_ROUTES = new Set(["/", "/development", "/rdda", "/ts", "/study", "/fabric-analysis", "/warehouse", "/calendar", "/sync", "/setting"])

function AppLayout() {
  // 사이드바는 기본 접힘(아이콘 레일). 확장은 hover/focus 오버레이 또는 핀 고정으로.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  // DD 마스터는 엑셀 작업공간처럼 좌우 빈칸 없이 콘텐츠 폭 전체를 쓴다(폭 제약·패딩 해제).
  const fullBleed = pathname === "/development/workspace"

  useEffect(() => {
    let current = true
    void (async () => {
      const cached = await loadAllCache().catch(() => ({}))
      const embedded = await loadEmbeddedAppData(cached).catch(() => null)
      if (!current) return
      if (embedded) {
        const next = { ...cached, ...embedded.patch }
        setAppState(next)
        await Promise.allSettled([
          saveCache("records", embedded.patch.records),
          saveCache("completed", embedded.patch.completed),
          saveCache("meta", embedded.patch.meta),
        ])
        markEmbeddedAppDataApplied(embedded.signature)
        return
      }
      if (Object.keys(cached).length) setAppState(cached)
    })()
    return () => { current = false }
  }, [])

  const handleSidebarToggle = () => setMobileSidebarOpen((current) => !current)
  const toggleCollapsed = () => setSidebarCollapsed((current) => !current)

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--foreground)]">
      <AppSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className={cn("transition-[padding] duration-500 [transition-timing-function:cubic-bezier(0.83,0,0.17,1)] motion-reduce:transition-none", sidebarCollapsed ? "lg:pl-20" : "lg:pl-72", fullBleed ? "flex h-screen flex-col overflow-hidden" : "min-h-screen")}>
        <Topbar onToggleSidebar={handleSidebarToggle} />
        <main className={cn("w-full", fullBleed ? "flex min-h-0 flex-1 flex-col overflow-hidden max-w-none p-0" : "mx-auto w-full max-w-[2200px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6")}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/development" element={<Development />} />
            <Route path="/development/:sub" element={<Development />} />
            <Route path="/rdda" element={<Rdda />} />
            <Route path="/ts" element={<TS />} />
            <Route path="/study" element={<Study />} />
            <Route path="/fabric-analysis" element={<FabricAnalysis />} />
            <Route path="/warehouse" element={<Warehouse />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/setting" element={<Setting />} />
            {routeDefinitions.filter((route) => !IMPLEMENTED_ROUTES.has(route.path) && !route.path.startsWith("/development")).map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<PlaceholderPage title={route.title} subtitle={route.subtitle} />}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <ParsingOverlay />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  )
}
