import { useState } from "react"
import { LogOut, Menu, UserCog } from "lucide-react"
import { useLocation } from "react-router-dom"

import { AccountSettingsDialog, COMPANY_EMAIL_DOMAIN } from "@/components/auth/AccountSettingsDialog"
import { Button } from "@/components/ui/button"
import { routeDefinitions } from "@/routes/route-config"
import { signOutUser, useAuthStore, useScreenAccess } from "@/data/auth"

interface TopbarProps {
  onToggleSidebar: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { pathname } = useLocation()
  const user = useAuthStore((state) => state.user)
  const isOwner = useAuthStore((state) => state.isOwner)
  const approval = useAuthStore((state) => state.approval)
  const [accountOpen, setAccountOpen] = useState(false)
  const screenAccess = useScreenAccess(pathname)
  // 소유자는 편집. 팀원은 지금 화면의 권한을 보인다(R217). 등록되지 않은 경로는 승인 여부로만 본다.
  const canWrite = isOwner || (approval === "approved" && screenAccess !== "read")
  // 사내 보안 공지(2026-09-14): 외부 서비스는 개인 메일 사용 권장. 소유자 외 회사 메일 계정에 알림 점을 띄운다.
  const suggestPersonalEmail = !isOwner && COMPANY_EMAIL_DOMAIN.test(user?.email ?? "")
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
              (canWrite
                ? "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]")
            }
            title={canWrite ? "이 화면 편집 권한" : approval === "approved" ? "이 화면은 읽기 권한입니다" : "읽기 전용(승인 대기)"}
          >
            {canWrite ? "편집 권한" : "읽기 전용"}
          </span>
          <span className="hidden max-w-[180px] truncate text-xs text-[var(--muted-foreground)] md:inline">
            {user.email}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="계정 설정"
            title={suggestPersonalEmail ? "계정 설정 · 개인 메일 전환 권장" : "계정 설정"}
            className="relative"
            onClick={() => setAccountOpen(true)}
          >
            <UserCog aria-hidden="true" />
            {suggestPersonalEmail ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--warning)]" /> : null}
          </Button>
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
          <AccountSettingsDialog open={accountOpen} onOpenChange={setAccountOpen} />
        </div>
      ) : null}
    </header>
  )
}
