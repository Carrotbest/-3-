/**
 * 가입자 승인과 화면 권한 패널. 원래 DATA 화면에 있었으나 성격이 사용자 관리라
 * SETTING의 사용자 탭으로 옮겼다. 상태와 핸들러를 통째로 들고 와서 화면 어디서든 쓸 수 있다.
 */
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Reveal } from "@/components/motion/Reveal"
import { useAuthStore } from "@/data/auth"
import { fmtDateFull, fmtTime, toDate } from "@/data/format"
import {
  approveUser,
  listenManagedUsers,
  rejectUser,
  updateUserScreenPermissions,
  type ManagedUser,
} from "@/data/users-admin"
import { cn } from "@/lib/utils"
import { SCREEN_PERMISSION_OPTIONS, createScreenPermissions, type ScreenPermissionKey } from "@/data/screen-permissions"

function dateTime(value: unknown): string {
  return toDate(value) ? `${fmtDateFull(value)} ${fmtTime(value)}` : "—"
}

function PermissionToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left outline-none transition-colors hover:bg-[var(--accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
    >
      <span className="truncate text-xs font-medium text-[var(--foreground)]">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none",
          checked ? "bg-[var(--primary)]" : "bg-[var(--muted)]",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full bg-[var(--card)] shadow-sm transition-transform motion-reduce:transition-none",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  )
}

export function UserApprovalPanel() {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [permissionBusyUid, setPermissionBusyUid] = useState<string | null>(null)
  const [userActionMessage, setUserActionMessage] = useState("")
  useEffect(() => {
    if (!isOwner) return
    const unsub = listenManagedUsers(setManagedUsers)
    return () => unsub()
  }, [isOwner])
  const pendingCount = managedUsers.filter((member) => member.status === "pending").length
  const handleApprove = async (member: ManagedUser) => {
    setBusyUid(member.uid)
    setUserActionMessage("")
    try {
      await approveUser(member.uid, member.screenPermissions)
      setUserActionMessage(`${member.name || member.email} 사용자를 승인했습니다.`)
    } catch {
      setUserActionMessage("사용자 승인에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusyUid(null)
    }
  }
  const handleReject = async (member: ManagedUser) => {
    const question = member.status === "approved"
      ? "이 사용자의 승인을 취소하시겠습니까? 즉시 앱 접근이 차단됩니다."
      : "이 가입 신청을 거부하시겠습니까?"
    if (!window.confirm(question)) return
    setBusyUid(member.uid)
    setUserActionMessage("")
    try {
      await rejectUser(member.uid)
      setUserActionMessage(`${member.name || member.email} 사용자의 접근을 차단했습니다.`)
    } catch {
      setUserActionMessage("사용자 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusyUid(null)
    }
  }
  const handlePermissionChange = async (member: ManagedUser, key: ScreenPermissionKey, enabled: boolean) => {
    const nextPermissions = { ...member.screenPermissions, [key]: enabled }
    setManagedUsers((current) => current.map((item) => item.uid === member.uid
      ? { ...item, screenPermissions: nextPermissions }
      : item))
    setPermissionBusyUid(member.uid)
    setUserActionMessage("")
    try {
      await updateUserScreenPermissions(member.uid, nextPermissions)
    } catch {
      setUserActionMessage("화면 권한 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setPermissionBusyUid(null)
    }
  }
  const handleAllPermissions = async (member: ManagedUser, enabled: boolean) => {
    const nextPermissions = createScreenPermissions(enabled)
    setManagedUsers((current) => current.map((item) => item.uid === member.uid
      ? { ...item, screenPermissions: nextPermissions }
      : item))
    setPermissionBusyUid(member.uid)
    setUserActionMessage("")
    try {
      await updateUserScreenPermissions(member.uid, nextPermissions)
    } catch {
      setUserActionMessage("화면 권한 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setPermissionBusyUid(null)
    }
  }

  return (
    <>
      {isOwner ? (
        <Reveal>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--foreground)]">가입자 승인 · 화면 권한</h2>
              <Badge variant={pendingCount ? "destructive" : "secondary"}>{pendingCount}건 대기</Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              사용자별로 접근 가능한 화면을 설정합니다. 토글 변경은 해당 사용자 화면에 실시간 반영됩니다.
            </p>
            {managedUsers.length ? (
              <ul className="mt-4 space-y-3">
                {managedUsers.map((member) => {
                  const enabledCount = SCREEN_PERMISSION_OPTIONS.filter((option) => member.screenPermissions[option.key]).length
                  const permissionBusy = permissionBusyUid === member.uid
                  return (
                    <li key={member.uid} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-[var(--foreground)]">{member.name || member.email}</p>
                            <Badge variant={member.status === "pending" ? "destructive" : member.status === "approved" ? "outline" : "secondary"}>
                              {member.status === "pending" ? "승인 대기" : member.status === "approved" ? "승인됨" : "거부됨"}
                            </Badge>
                            <span className="text-xs text-[var(--muted-foreground)]">{enabledCount}/{SCREEN_PERMISSION_OPTIONS.length} 화면</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                            {member.email}{member.requestedAt ? ` · ${dateTime(member.requestedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={permissionBusy}
                            onClick={() => { void handleAllPermissions(member, enabledCount !== SCREEN_PERMISSION_OPTIONS.length) }}
                          >
                            {enabledCount === SCREEN_PERMISSION_OPTIONS.length ? "전체 해제" : "전체 허용"}
                          </Button>
                          {member.status !== "approved" ? (
                            <Button type="button" size="sm" disabled={busyUid === member.uid} onClick={() => { void handleApprove(member) }}>
                              {member.status === "rejected" ? "재승인" : "승인"}
                            </Button>
                          ) : null}
                          {member.status !== "rejected" ? (
                            <Button type="button" size="sm" variant="outline" disabled={busyUid === member.uid} onClick={() => { void handleReject(member) }}>
                              {member.status === "approved" ? "승인 취소" : "거부"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {SCREEN_PERMISSION_OPTIONS.map((option) => (
                          <PermissionToggle
                            key={option.key}
                            label={option.label}
                            checked={member.screenPermissions[option.key]}
                            disabled={permissionBusy}
                            onChange={(enabled) => { void handlePermissionChange(member, option.key, enabled) }}
                          />
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">가입 신청 또는 승인된 사용자가 없습니다.</p>
            )}
            {userActionMessage ? <p aria-live="polite" className="mt-3 text-sm text-[var(--foreground)]">{userActionMessage}</p> : null}
          </div>
        </Reveal>
      ) : null}
    </>
  )
}
