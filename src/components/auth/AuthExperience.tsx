import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  ArrowRight,
  Check,
  DatabaseZap,
  Eye,
  EyeOff,
  Fingerprint,
  Layers3,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { initAuth, signIn, signOutUser, signUp, useAuthStore } from "@/data/auth"

type Mode = "login" | "signup"

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white font-semibold tracking-[-0.08em] text-slate-950 shadow-[0_0.6rem_1.8rem_-0.9rem_rgba(15,23,42,0.35)] ${compact ? "size-9 text-[11px]" : "size-11 text-xs"}`}>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-cyan-400 via-teal-400 to-violet-400" />
        F/RD
      </span>
      <span>
        <strong className="block text-sm font-semibold tracking-[-0.02em] text-slate-950">Fabric Intelligence</strong>
        <span className="block text-[10px] font-medium uppercase tracking-[0.19em] text-slate-400">R&amp;D Workspace</span>
      </span>
    </div>
  )
}

function LandingBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-white" />
      {[18, 38, 58, 78].map((position) => <span key={`v-${position}`} className="absolute inset-y-0 w-px bg-slate-100/70" style={{ left: `${position}%` }} />)}
      {[24, 52, 80].map((position) => <span key={`h-${position}`} className="absolute inset-x-0 h-px bg-slate-100/70" style={{ top: `${position}%` }} />)}
      <div className="absolute -right-24 top-24 size-72 rounded-full border border-slate-100" />
      <div className="absolute -right-8 top-40 size-44 rounded-full border border-teal-100/70" />
    </div>
  )
}

function ProductPreview() {
  const sceneStyle = {
    "--scene-rx": "0deg",
    "--scene-ry": "0deg",
    "--scene-x": "0px",
    "--scene-y": "0px",
  } as CSSProperties

  const moveScene = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    event.currentTarget.style.setProperty("--scene-rx", `${(-y * 7).toFixed(2)}deg`)
    event.currentTarget.style.setProperty("--scene-ry", `${(x * 9).toFixed(2)}deg`)
    event.currentTarget.style.setProperty("--scene-x", `${(x * 14).toFixed(2)}px`)
    event.currentTarget.style.setProperty("--scene-y", `${(y * 12).toFixed(2)}px`)
  }

  const resetScene = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--scene-rx", "0deg")
    event.currentTarget.style.setProperty("--scene-ry", "0deg")
    event.currentTarget.style.setProperty("--scene-x", "0px")
    event.currentTarget.style.setProperty("--scene-y", "0px")
  }

  return (
    <div
      className="group relative mx-auto aspect-[4/3] w-full max-w-[46rem] touch-pan-y lg:mr-0 [perspective:1200px]"
      style={sceneStyle}
      onPointerMove={moveScene}
      onPointerLeave={resetScene}
      aria-label="Interactive fabric workflow visualization"
    >
      <div className="absolute inset-[5%] transition-transform duration-300 ease-out motion-reduce:transform-none" style={{ transform: "perspective(1200px) rotateX(var(--scene-rx)) rotateY(var(--scene-ry))" }}>
        <div className="absolute left-[17%] top-[12%] h-[70%] w-[68%] rounded-[2.4rem] border border-slate-200 bg-slate-50 shadow-[0_2.6rem_5rem_-3rem_rgba(15,23,42,0.35)] [transform:translate3d(-28px,20px,-90px)_rotate(-7deg)]" />
        <div className="absolute left-[17%] top-[12%] h-[70%] w-[68%] rounded-[2.4rem] border border-cyan-100 bg-cyan-50/90 shadow-[0_2.2rem_4rem_-3rem_rgba(8,145,178,0.35)] [transform:translate3d(-14px,10px,-45px)_rotate(-3.5deg)]" />
        <div className="absolute left-[17%] top-[12%] h-[70%] w-[68%] overflow-hidden rounded-[2.4rem] border border-slate-200 bg-white shadow-[0_2.8rem_5.5rem_-2.6rem_rgba(15,23,42,0.4)] [transform:translateZ(15px)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-teal-600">Live operating system</span><strong className="mt-1 block text-lg tracking-[-0.03em] text-slate-950">Fabric flow</strong></div>
            <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-40 motion-reduce:hidden" /><span className="relative inline-flex size-3 rounded-full bg-teal-500" /></span>
          </div>
          <div className="relative px-6 py-7">
            <div className="absolute left-[14%] right-[14%] top-[3.25rem] h-px bg-slate-200" />
            <div className="relative grid grid-cols-4 gap-2">{["Yarn", "Knit", "Dye", "Finish"].map((item, index) => <div key={item} className="text-center"><span className={`mx-auto grid size-9 place-items-center rounded-xl border text-[10px] font-bold shadow-sm ${index < 3 ? "border-teal-200 bg-teal-500 text-white" : "border-violet-200 bg-violet-50 text-violet-600"}`}>{index + 1}</span><span className="mt-2 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">{item}</span></div>)}</div>
            <div className="mt-7 grid grid-cols-3 gap-2">{[["Active", "42"], ["On track", "79%"], ["Insights", "18"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><span className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span><strong className="mt-1 block text-sm text-slate-900">{value}</strong></div>)}</div>
          </div>
        </div>

        <div className="absolute right-[2%] top-[6%] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_1.4rem_3rem_-1.5rem_rgba(15,23,42,0.4)] backdrop-blur-xl transition-transform duration-300 ease-out motion-safe:animate-[pulse_4s_ease-in-out_infinite]" style={{ transform: "translate3d(calc(var(--scene-x) * 1.15), calc(var(--scene-y) * 1.15), 110px) rotate(3deg)" }}>
          <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500"><span className="size-2 rounded-full bg-emerald-400" /> Live material data</span><strong className="mt-1 block text-lg font-semibold text-slate-950">Synchronized</strong>
        </div>
        <div className="absolute bottom-[4%] left-[5%] hidden rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_1.4rem_3rem_-1.5rem_rgba(15,23,42,0.35)] backdrop-blur-xl transition-transform duration-300 ease-out sm:block" style={{ transform: "translate3d(calc(var(--scene-x) * -0.9), calc(var(--scene-y) * -0.9), 95px) rotate(-3deg)" }}>
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cursor-responsive workspace</span><div className="mt-2 flex items-center gap-2"><span className="size-7 rounded-lg bg-cyan-100" /><span><strong className="block text-xs text-slate-900">Connected intelligence</strong><span className="block text-[9px] text-slate-400">Move to explore depth</span></span></div>
        </div>

        <div className="absolute left-[6%] top-[10%] size-20 rounded-full border border-cyan-200 transition-transform duration-300 ease-out motion-safe:animate-[spin_16s_linear_infinite]" style={{ transform: "translate3d(calc(var(--scene-x) * -1.2), calc(var(--scene-y) * -1.2), 80px)" }}><span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400" /></div>
        <div className="absolute bottom-[11%] right-[8%] size-14 rounded-full border border-violet-200 transition-transform duration-300 ease-out" style={{ transform: "translate3d(calc(var(--scene-x) * 1.4), calc(var(--scene-y) * 1.4), 130px)" }}><span className="absolute bottom-1 right-1 size-3 rounded-full bg-violet-300 motion-safe:animate-bounce" /></div>
      </div>
    </div>
  )
}

function AuthDialog({ open, mode, onOpenChange, onModeChange }: { open: boolean; mode: Mode; onOpenChange: (open: boolean) => void; onModeChange: (mode: Mode) => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState("")
  const error = useAuthStore((state) => state.error)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setNotice("")
    try {
      if (mode === "login") await signIn(email, password)
      else { await signUp(email, password, name); setNotice("Your request has been submitted. Access will open after administrator approval.") }
    } catch {
      // 오류 메시지는 auth 스토어(error)에 반영된다.
    } finally { setSubmitting(false) }
  }

  const switchMode = (next: Mode) => { onModeChange(next); setNotice(""); useAuthStore.setState({ error: null }) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[46rem] max-w-md overflow-hidden rounded-[1.6rem] border-slate-200/80 bg-white p-0 text-slate-950 shadow-[0_2.5rem_8rem_-2rem_rgba(15,23,42,0.38)] [&>button.absolute]:text-slate-400 [&>button.absolute]:hover:text-slate-950">
        <div className="relative h-[12.5rem] shrink-0 overflow-hidden border-b border-slate-100 bg-white px-6 pb-5 pt-7">
          <div className="absolute -right-12 -top-16 size-52 rounded-full bg-gradient-to-br from-cyan-200/70 via-teal-100/45 to-violet-200/60 blur-2xl" aria-hidden="true" />
          <div className="absolute right-10 top-8 size-16 rounded-full border border-white bg-gradient-to-br from-white via-cyan-100 to-teal-300 opacity-80 shadow-[0_1rem_2rem_-0.7rem_rgba(13,148,136,0.5)]" aria-hidden="true" />
          <div className="relative"><BrandMark compact /><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-600">Private team workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-slate-950">Access Fabric Intelligence.</h2><p className="mt-2 text-sm leading-6 text-slate-500">Sign in or request access from the same secure workspace.</p></div>
        </div>

        <DialogHeader className="sr-only"><DialogTitle>{mode === "login" ? "Sign in" : "Request access"}</DialogTitle><DialogDescription>Fabric R&amp;D workspace authentication</DialogDescription></DialogHeader>
        <DialogBody className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-6 sm:px-7 [scrollbar-gutter:stable]">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">{(["login", "signup"] as Mode[]).map((item) => <button key={item} type="button" onClick={() => switchMode(item)} className={`h-10 rounded-lg px-3 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-slate-900 ${mode === item ? "bg-white text-slate-950 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}>{item === "login" ? "Sign in" : "Request access"}</button>)}</div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? <div className="space-y-2"><Label htmlFor="signup-name" className="text-xs font-semibold text-slate-700">Name</Label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="signup-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 text-slate-950 shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-slate-900" /></div></div> : null}
            <div className="space-y-2"><Label htmlFor="auth-email" className="text-xs font-semibold text-slate-700">Email</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="auth-email" type="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 text-slate-950 shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-slate-900" /></div></div>
            <div className="space-y-2"><Label htmlFor="auth-password" className="text-xs font-semibold text-slate-700">Password</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"} required className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-11 text-slate-950 shadow-none placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-slate-900" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 outline-none hover:bg-slate-200 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
            {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">{error}</div> : null}
            {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700" role="status">{notice}</div> : null}
            <Button type="submit" className="h-11 w-full rounded-xl bg-slate-950 text-white shadow-[0_0.75rem_1.8rem_-0.8rem_rgba(13,148,136,0.65)] hover:bg-teal-700 hover:opacity-100" disabled={submitting}>{submitting ? <><span className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />Processing…</> : <>{mode === "login" ? "Open workspace" : "Submit access request"}<ArrowRight className="size-4" /></>}</Button>
          </form>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500"><Fingerprint className="mt-0.5 size-4 shrink-0 text-teal-600" /><span>{mode === "login" ? "New here? Switch to Request access above. An administrator will review your account." : "Team data remains private until approval. After approval, only assigned screens will be available."}</span></div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function AuthScreen() {
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("login")
  const openAuth = (next: Mode) => { setMode(next); useAuthStore.setState({ error: null }); setAuthOpen(true) }

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-950 selection:bg-teal-200 selection:text-slate-950">
      <LandingBackdrop />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-slate-100" aria-hidden="true"><span className="landing-intro-progress block h-full bg-teal-500" /></div>
      <div className="landing-intro-status pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 shadow-sm backdrop-blur-md" role="status">Initializing fabric intelligence</div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:px-12">
        <header className="landing-intro-reveal flex h-20 items-center justify-between border-b border-slate-200/70" style={{ animationDelay: "80ms" }}><BrandMark /><div className="flex items-center gap-3"><span className="hidden text-xs font-medium text-slate-400 md:block">Hansoll Textile · Integrated Fabric Division 3</span><Button type="button" onClick={() => openAuth("login")} className="h-10 rounded-full bg-slate-950 px-5 text-white shadow-[0_0.7rem_1.6rem_-0.8rem_rgba(15,23,42,0.5)] hover:bg-teal-700 hover:opacity-100">Get Started <ArrowRight className="size-3.5" /></Button></div></header>

        <main className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:py-20">
          <div className="max-w-2xl">
            <div className="landing-intro-reveal inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700 shadow-sm" style={{ animationDelay: "380ms" }}><Sparkles className="size-3" /> A smarter way to build fabric</div>
            <h1 className="mt-7 text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.97] tracking-[-0.065em] text-slate-950">
              <span className="landing-intro-line-wrap"><span className="landing-intro-line" style={{ animationDelay: "620ms" }}>Build fabric.</span></span>
              <span className="landing-intro-line-wrap pb-[0.08em]"><span className="landing-intro-line bg-gradient-to-r from-teal-600 via-cyan-500 to-violet-600 bg-clip-text text-transparent" style={{ animationDelay: "930ms" }}>Connect every move.</span></span>
            </h1>
            <p className="landing-intro-reveal mt-7 max-w-xl text-base leading-7 text-slate-500 sm:text-lg sm:leading-8" style={{ animationDelay: "1380ms" }}>개발 현황부터 Technical Service, Fabric Study와 기능성 포트폴리오까지. 흩어진 팀의 업무를 실시간 데이터와 하나의 운영 체계로 연결합니다.</p>
            <div className="landing-intro-reveal mt-9" style={{ animationDelay: "1680ms" }}><Button type="button" size="lg" onClick={() => openAuth("login")} className="h-12 rounded-full bg-slate-950 px-7 text-white shadow-[0_1rem_3rem_-1rem_rgba(13,148,136,0.6)] hover:bg-teal-700 hover:opacity-100">Get Started <ArrowRight /></Button></div>
            <div className="landing-intro-reveal mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-200/80 pt-6" style={{ animationDelay: "1960ms" }}>{["Real-time data sync", "Admin-approved security", "Screen-level access"].map((item) => <span key={item} className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className="grid size-4 place-items-center rounded-full bg-teal-100 text-teal-700"><Check className="size-2.5" /></span>{item}</span>)}</div>
          </div>
          <div className="landing-intro-scene"><ProductPreview /></div>
        </main>

        <section className="landing-intro-reveal grid gap-px overflow-hidden rounded-t-2xl border border-b-0 border-slate-200/80 bg-slate-200/80 shadow-[0_2rem_5rem_-3.5rem_rgba(15,23,42,0.4)] sm:grid-cols-3" style={{ animationDelay: "2220ms" }} aria-label="Platform capabilities">
          {[{ icon: DatabaseZap, title: "Single source of truth", text: "Unify uploaded and web-native data around one current operational record." }, { icon: Layers3, title: "Connected workflow", text: "Connect Development, TS, Study and Portfolio in one continuous flow." }, { icon: ShieldCheck, title: "Controlled collaboration", text: "Share only what each approved team member needs to see." }].map(({ icon: Icon, title, text }) => <div key={title} className="bg-white/95 p-5 sm:p-6"><Icon className="size-5 text-teal-600" /><h2 className="mt-4 text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1.5 text-xs leading-5 text-slate-500">{text}</p></div>)}
        </section>
      </div>
      <AuthDialog open={authOpen} mode={mode} onOpenChange={setAuthOpen} onModeChange={setMode} />
    </div>
  )
}

function StatusScreen({ title, description, rejected = false }: { title: string; description: string; rejected?: boolean }) {
  const email = useAuthStore((state) => state.user?.email)
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 text-slate-950"><LandingBackdrop /><div className="relative w-full max-w-md overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white/80 p-8 text-center shadow-[0_2rem_7rem_-2rem_rgba(15,23,42,0.3)] backdrop-blur-2xl"><span className={`mx-auto grid size-14 place-items-center rounded-2xl border ${rejected ? "border-red-200 bg-red-50 text-red-600" : "border-teal-200 bg-teal-50 text-teal-700"}`}>{rejected ? <LockKeyhole className="size-6" /> : <ShieldCheck className="size-6" />}</span><h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>{email ? <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{email}</p> : null}<Button type="button" className="mt-6 h-10 rounded-full bg-slate-950 px-5 text-white hover:bg-teal-700 hover:opacity-100" onClick={() => { void signOutUser() }}>Use another account</Button></div></div>
  )
}

function LoadingScreen() {
  return <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white text-slate-950"><LandingBackdrop /><div className="relative flex flex-col items-center"><span className="grid size-12 place-items-center rounded-2xl border border-slate-200 bg-white text-xs font-semibold tracking-[-0.08em] shadow-xl">F/RD</span><span className="mt-5 size-5 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" /><span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Loading workspace</span></div></div>
}

/** 로그인 + 관리자 승인을 통과해야 앱과 실데이터에 접근할 수 있도록 감싸는 게이트. */
export function LoginGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const isOwner = useAuthStore((state) => state.isOwner)
  const approval = useAuthStore((state) => state.approval)

  useEffect(() => { initAuth() }, [])

  if (status === "loading") return <LoadingScreen />
  if (status === "signed-out") return <AuthScreen />
  if (isOwner || approval === "approved") return <>{children}</>
  if (approval === "rejected") return <StatusScreen rejected title="Access request declined" description="This account does not currently have workspace access. Please contact the administrator, Hyanggeun Park." />
  if (approval === "pending") return <StatusScreen title="Approval pending" description="Your access request has been received. The workspace will open automatically after administrator approval." />
  return <LoadingScreen />
}
