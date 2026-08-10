import { useEffect, useState } from "react"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { DataSourceBar } from "@/components/layout/DataSourceBar"
import { Topbar } from "@/components/layout/Topbar"
import { ParsingOverlay } from "@/components/upload/ParsingOverlay"
import { loadAllCache } from "@/data/cache"
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
import { setAppState } from "@/store/useAppStore"
import { routeDefinitions } from "@/routes/route-config"

const THEME_STORAGE_KEY = "fabric-rnd-theme"
const IMPLEMENTED_ROUTES = new Set(["/", "/development", "/rdda", "/ts", "/study", "/fabric-analysis", "/calendar", "/sync", "/setting"])

function readInitialTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
  } catch {
    return false
  }
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [dark, setDark] = useState(readInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light")
    } catch {
      // 저장소를 사용할 수 없는 환경에서도 현재 세션의 테마는 유지한다.
    }
  }, [dark])

  useEffect(() => {
    let current = true
    void loadAllCache().then((cached) => { if (current && Object.keys(cached).length) setAppState(cached) }).catch(() => undefined)
    return () => { current = false }
  }, [])

  const handleSidebarToggle = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((current) => !current)
      return
    }
    setMobileSidebarOpen((current) => !current)
  }

  return (
    <div className="min-h-screen bg-[var(--background)] font-sans text-[var(--foreground)]">
      <AppSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className={cn("min-h-screen transition-[padding] duration-200 motion-reduce:transition-none", sidebarCollapsed ? "lg:pl-20" : "lg:pl-72")}>
        <Topbar dark={dark} onToggleSidebar={handleSidebarToggle} onToggleTheme={() => setDark((current) => !current)} />
        <DataSourceBar />
        <main className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/development" element={<Development />} />
            <Route path="/development/:sub" element={<Development />} />
            <Route path="/rdda" element={<Rdda />} />
            <Route path="/ts" element={<TS />} />
            <Route path="/study" element={<Study />} />
            <Route path="/fabric-analysis" element={<FabricAnalysis />} />
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
