import { useEffect, useState } from "react"
import { KeyRound, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeOwnPassword, requestLoginEmailChange, useAuthStore } from "@/data/auth"

type AccountTab = "password" | "email"

/** 회사 메일 도메인. 외부 서비스 가입에 회사 계정을 쓰지 말라는 사내 공지(2026-09-14)에 따라 새 이메일로는 막는다. */
export const COMPANY_EMAIL_DOMAIN = /@hansoll\.com$/i

export const MIN_PASSWORD_LENGTH = 8

interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const user = useAuthStore((state) => state.user)
  const isOwner = useAuthStore((state) => state.isOwner)
  const [tab, setTab] = useState<AccountTab>("password")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setTab("password")
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setNewEmail("")
    setMessage(null)
  }, [open])

  const switchTab = (next: AccountTab) => {
    setTab(next)
    setCurrentPassword("")
    setMessage(null)
  }

  const usingCompanyEmail = COMPANY_EMAIL_DOMAIN.test(user?.email ?? "")
  const passwordError = newPassword && newPassword.length < MIN_PASSWORD_LENGTH
    ? `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
    : newPassword && newPassword === currentPassword
      ? "현재 비밀번호와 다르게 입력하세요."
      : confirmPassword && newPassword !== confirmPassword
        ? "새 비밀번호 확인이 일치하지 않습니다."
        : null
  const trimmedEmail = newEmail.trim()
  const emailError = trimmedEmail && COMPANY_EMAIL_DOMAIN.test(trimmedEmail)
    ? "회사 메일은 쓸 수 없습니다. 개인 메일을 입력하세요."
    : trimmedEmail && user?.email && trimmedEmail.toLowerCase() === user.email.toLowerCase()
      ? "지금 로그인 이메일과 같습니다."
      : null
  const canSubmitPassword = Boolean(currentPassword && newPassword && confirmPassword && !passwordError)
  const canSubmitEmail = !isOwner && Boolean(currentPassword && trimmedEmail && !emailError)

  const submit = async () => {
    if (busy) return
    if (tab === "password" && !canSubmitPassword) return
    if (tab === "email" && !canSubmitEmail) return
    setBusy(true)
    setMessage(null)
    try {
      if (tab === "password") {
        await changeOwnPassword(currentPassword, newPassword)
        setMessage({ kind: "ok", text: "비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요." })
        setNewPassword("")
        setConfirmPassword("")
      } else {
        await requestLoginEmailChange(currentPassword, trimmedEmail)
        setMessage({ kind: "ok", text: `${trimmedEmail}로 확인 메일을 보냈습니다. 메일의 링크를 누르면 로그인 이메일이 바뀝니다. 바뀐 뒤에는 새 이메일로 다시 로그인하세요.` })
        setNewEmail("")
      }
      setCurrentPassword("")
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const tabButton = (key: AccountTab, label: string, icon: React.ReactNode) => <button
    type="button"
    role="tab"
    aria-selected={tab === key}
    onClick={() => switchTab(key)}
    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${tab === key ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
  >{icon}{label}</button>

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>계정 설정</DialogTitle>
        <DialogDescription>로그인 계정 {user?.email ?? ""}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {usingCompanyEmail && !isOwner ? <p className="rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground)]">
          사내 보안 공지에 따라 외부 서비스는 개인 메일로 쓰는 것을 권장합니다. 로그인 이메일 변경 탭에서 개인 메일로 바꿀 수 있습니다. 승인 상태와 화면 권한은 그대로 유지됩니다.
        </p> : null}
        <div className="flex gap-1" role="tablist" aria-label="계정 설정 항목">
          {tabButton("password", "비밀번호 변경", <KeyRound className="size-3.5" />)}
          {tabButton("email", "로그인 이메일 변경", <Mail className="size-3.5" />)}
        </div>

        {tab === "email" && isOwner ? <p className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          소유자 계정은 로그인 이메일을 바꾸지 않습니다. 이메일을 바꾸면 소유자 권한이 사라집니다.
        </p> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <div className="grid gap-1.5">
            <Label htmlFor="account-current-password">현재 비밀번호</Label>
            <Input id="account-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          {tab === "password" ? <>
            <div className="grid gap-1.5">
              <Label htmlFor="account-new-password">새 비밀번호</Label>
              <Input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-confirm-password">새 비밀번호 확인</Label>
              <Input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">{MIN_PASSWORD_LENGTH}자 이상입니다. 회사 계정 비밀번호와 다르게 설정해 주세요.</p>
            {passwordError ? <p className="text-xs text-[var(--destructive)]">{passwordError}</p> : null}
          </> : <>
            <div className="grid gap-1.5">
              <Label htmlFor="account-new-email">새 로그인 이메일 (개인 메일)</Label>
              <Input id="account-new-email" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">새 메일로 확인 링크가 갑니다. 링크를 누르기 전까지는 지금 이메일로 로그인됩니다. 사용자 목록에 보이는 이메일은 소유자가 갱신합니다.</p>
            {emailError ? <p className="text-xs text-[var(--destructive)]">{emailError}</p> : null}
          </>}
          <button type="submit" hidden aria-hidden="true" />
        </form>}

        {message ? <p role="status" className={`text-xs leading-relaxed ${message.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--chart-2)]"}`}>{message.text}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>닫기</Button>
        {tab === "email" && isOwner ? null : <Button type="button" size="sm" disabled={busy || (tab === "password" ? !canSubmitPassword : !canSubmitEmail)} onClick={() => void submit()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}{tab === "password" ? "비밀번호 변경" : "확인 메일 보내기"}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
