import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { initAuth, signIn, signOutUser, signUp, useAuthStore } from "@/data/auth"

type Mode = "login" | "signup"

function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const error = useAuthStore((state) => state.error)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setNotice("")
    try {
      if (mode === "login") {
        await signIn(email, password)
      } else {
        await signUp(email, password, name)
        setNotice("가입 신청이 접수되었습니다. 관리자 승인 후 이용할 수 있습니다.")
      }
    } catch {
      // 오류 메시지는 auth 스토어(error)에 반영된다.
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setNotice("")
    useAuthStore.setState({ error: null })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="w-full max-w-sm rounded-[calc(var(--radius)+4px)] border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Fabric R&amp;D</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            통합원단부 3팀 · {mode === "login" ? "로그인" : "가입 신청"}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-[var(--muted)] p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={"rounded-[calc(var(--radius)-2px)] py-1.5 text-sm font-medium transition-colors " + (mode === "login" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={"rounded-[calc(var(--radius)-2px)] py-1.5 text-sm font-medium transition-colors " + (mode === "signup" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}
          >
            가입 신청
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="signup-name">이름</Label>
              <Input
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 홍길동"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">이메일</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">비밀번호</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "signup" ? "6자 이상" : undefined}
              required
            />
          </div>
          {error ? <p className="text-sm text-[var(--destructive)]" role="alert">{error}</p> : null}
          {notice ? <p className="text-sm text-[var(--foreground)]" role="status">{notice}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "처리 중…" : mode === "login" ? "로그인" : "가입 신청"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
          {mode === "login"
            ? "계정이 없으면 ‘가입 신청’ 후 관리자 승인을 받으세요."
            : "가입 후 관리자(박향근) 승인을 받으면 이용할 수 있습니다."}
        </p>
      </div>
    </div>
  )
}

function StatusScreen({ title, description }: { title: string; description: string }) {
  const email = useAuthStore((state) => state.user?.email)
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--foreground)]">
      <div className="w-full max-w-sm rounded-[calc(var(--radius)+4px)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p>
        {email ? <p className="mt-4 text-xs text-[var(--muted-foreground)]">로그인 계정: {email}</p> : null}
        <Button type="button" variant="outline" className="mt-6" onClick={() => { void signOutUser() }}>
          로그아웃
        </Button>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
      불러오는 중…
    </div>
  )
}

/** 로그인 + 관리자 승인을 통과해야 앱과 실데이터에 접근할 수 있도록 감싸는 게이트. */
export function LoginGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const isOwner = useAuthStore((state) => state.isOwner)
  const approval = useAuthStore((state) => state.approval)

  useEffect(() => {
    initAuth()
  }, [])

  if (status === "loading") return <LoadingScreen />
  if (status === "signed-out") return <AuthScreen />
  if (isOwner || approval === "approved") return <>{children}</>
  if (approval === "rejected") {
    return <StatusScreen title="가입이 거부되었습니다" description="접근 권한이 없습니다. 담당자(박향근)에게 문의하세요." />
  }
  if (approval === "pending") {
    return <StatusScreen title="승인 대기 중" description="관리자 승인 후 이용할 수 있습니다. 승인되면 이 화면이 자동으로 전환됩니다." />
  }
  return <LoadingScreen />
}
