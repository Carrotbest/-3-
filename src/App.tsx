import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { Topbar } from "@/components/layout/Topbar"
import { UpdateBanner } from "@/components/layout/UpdateBanner"
import { ParsingOverlay } from "@/components/upload/ParsingOverlay"
import { LoginGate } from "@/components/auth/AuthExperience"
import { useAuthStore } from "@/data/auth"
import { CAPTURE } from "@/data/capture"
import { loadAllCache, saveCacheLocal } from "@/data/cache"
import { startStateSync, stopStateSync } from "@/data/firestore-sync"
import { loadEmbeddedAppData, markEmbeddedAppDataApplied } from "@/data/embedded-workbooks"
import { loadLedgerArchive } from "@/data/ledger-archive"
import { canAccessScreenPath } from "@/data/screen-permissions"
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
import { FabricDetail } from "@/routes/FabricDetail"
import { Warehouse } from "@/routes/Warehouse"
import { Portfolio } from "@/routes/Portfolio"
import { TrendFabric } from "@/routes/TrendFabric"
import { TrendMacro } from "@/routes/TrendMacro"
import { ensureTsSeed, migrateLocalTsIntoSync, repairTsData, setAppState, useAppStore } from "@/store/useAppStore"
import { routeDefinitions } from "@/routes/route-config"

const IMPLEMENTED_ROUTES = new Set(["/", "/development", "/rdda", "/ts", "/study", "/fabric-analysis", "/fabric/:key", "/warehouse", "/calendar", "/sync", "/setting", "/trend/portfolio", "/trend/fabric", "/trend/macro"])

function ScreenAccessDenied() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          이 화면은 관리자에게 허용받은 사용자만 볼 수 있습니다. 화면 권한이 필요하면 박향근 관리자에게 요청해 주세요.
        </p>
      </div>
    </div>
  )
}

function AppLayout() {
  // 첫 랜딩에서는 사이드바를 펼친 상태로 시작하고, 이후 사용자가 직접 접을 수 있다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const location = useLocation()
  const { pathname } = location
  const mainRef = useRef<HTMLElement>(null)
  const isOwnerRaw = useAuthStore((state) => state.isOwner)
  const isOwner = CAPTURE || isOwnerRaw
  const screenPermissions = useAuthStore((state) => state.screenPermissions)
  const canViewCurrentPath = isOwner || canAccessScreenPath(pathname, screenPermissions)
  // DD 마스터는 엑셀 작업공간처럼 좌우 빈칸 없이 콘텐츠 폭 전체를 쓴다(폭 제약·패딩 해제).
  const fullBleed = pathname === "/development/workspace" && canViewCurrentPath

  // 네비게이션으로 화면이 바뀔 때 이전 화면의 스크롤 위치를 이어받지 않는다.
  // 일반 페이지(window)와 전체화면 작업공간의 내부 스크롤 루트를 함께 초기화한다.
  useLayoutEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
      mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" })
      mainRef.current?.querySelectorAll<HTMLElement>("[data-route-scroll-root]").forEach((element) => {
        element.scrollTo({ top: 0, left: 0, behavior: "auto" })
      })
    }

    scrollToTop()
    const frame = window.requestAnimationFrame(scrollToTop)
    return () => window.cancelAnimationFrame(frame)
  }, [location.key, pathname])

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    return () => { window.history.scrollRestoration = previous }
  }, [])

  // 로컬 데이터(IndexedDB·seed·localStorage 이관)를 모두 반영한 뒤에야 실시간 동기화를 시작한다.
  // 순서가 뒤바뀌면 중앙 스냅샷이 먼저 반영됐다가 로컬 값에 다시 덮여 화면이 튄다.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let current = true
    void (async () => {
      const cached = await loadAllCache().catch(() => ({}))
      if (Array.isArray((cached as any).ts) && (cached as any).ts.length === 0) delete (cached as any).ts
      const embedded = await loadEmbeddedAppData(cached).catch(() => null)
      if (!current) return
      if (embedded) {
        const next = { ...cached, ...embedded.patch }
        setAppState(next)
        // 데모/내장 데이터는 로컬 캐시에만 저장한다(Firestore로 올리지 않음).
        await Promise.allSettled([
          saveCacheLocal("records", embedded.patch.records),
          saveCacheLocal("completed", embedded.patch.completed),
          saveCacheLocal("meta", embedded.patch.meta),
        ])
        markEmbeddedAppDataApplied(embedded.signature)
      } else if (Object.keys(cached).length) {
        setAppState(cached)
      }
      // 샘플관리대장 아카이브는 "비었을 때만 채우는 씨앗"이다. 이미 값이 있으면 건드리지 않는다.
      // 배포할 때마다 웹에서 쌓은 데이터가 되돌아가면 안 된다. 갱신은 화면에서 엑셀을 올려서 하고,
      // 그 값이 Firestore로 팀에 퍼진다. 아카이브는 신규 PC나 캐시를 지운 경우를 위한 출발점일 뿐이다.
      const archive = await loadLedgerArchive()
      if (!current) return
      const existingCompleted = useAppStore.getState().completed
      const needsLedgerSeed = !Array.isArray(existingCompleted) || existingCompleted.length === 0
      if (archive && archive.length > 0 && needsLedgerSeed) {
        setAppState({ completed: archive })
        // 로컬에만 둔다. 씨앗을 Firestore로 올리면 팀이 공유하는 최신 값을 덮을 수 있다.
        await saveCacheLocal("completed", archive)
      }
      await ensureTsSeed()
      // 팀 공유 전환 전 localStorage에만 있던 TS 등록·수정 건을 1회 합친다.
      await migrateLocalTsIntoSync()
      // 낡은 TS가 캐시에 남아 있으면 백업(localStorage)·seed로 되돌린 뒤 동기화를 시작한다.
      await repairTsData()
      if (current) setHydrated(true)
    })()
    return () => { current = false }
  }, [])

  // 로그인 상태에서만 렌더되므로, 마운트 시 Firestore 실시간 동기화를 시작한다.
  // 중앙 데이터가 도착하면 데모/로컬 대신 실데이터가 화면에 반영된다.
  useEffect(() => {
    if (CAPTURE || !hydrated) return
    void startStateSync()
    return () => { stopStateSync() }
  }, [hydrated])

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
        <main ref={mainRef} className={cn("w-full", fullBleed ? "flex min-h-0 flex-1 flex-col overflow-hidden max-w-none p-0" : "mx-auto w-full max-w-[2200px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6")}>
          {canViewCurrentPath ? <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/development" element={<Development />} />
            <Route path="/development/:sub" element={<Development />} />
            <Route path="/rdda" element={<Rdda />} />
            <Route path="/ts" element={<TS />} />
            <Route path="/study" element={<Study />} />
            <Route path="/fabric-analysis" element={<FabricAnalysis />} />
            <Route path="/fabric/:key" element={<FabricDetail />} />
            <Route path="/warehouse" element={<Warehouse />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/setting" element={<Setting />} />
            <Route path="/trend/portfolio" element={<Portfolio />} />
            <Route path="/trend/fabric" element={<TrendFabric />} />
            <Route path="/trend/macro" element={<TrendMacro />} />
            {routeDefinitions.filter((route) => !IMPLEMENTED_ROUTES.has(route.path) && !route.path.startsWith("/development")).map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<PlaceholderPage title={route.title} subtitle={route.subtitle} />}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes> : <ScreenAccessDenied />}
        </main>
      </div>
      <ParsingOverlay />
      <UpdateBanner />
    </div>
  )
}

export default function App() {
  return (
    <LoginGate>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </LoginGate>
  )
}
