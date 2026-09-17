/**
 * 가입자 승인과 권한 패널(R217). SETTING 사용자 탭에서 쓴다.
 * 화면마다 없음 / 읽기 / 편집을 고르고, 부서를 고르면 부서 기본 권한으로 한 번에 채운다.
 */
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/data/auth"
import { DEPARTMENTS, departmentById, matchesDepartment } from "@/data/departments"
import { fmtDateFull, fmtTime, toDate } from "@/data/format"
import {
  ACCESS_GROUPS,
  ACCESS_LABELS,
  FEATURE_KEYS,
  SCREEN_PERMISSION_OPTIONS,
  type ScreenAccess,
  type ScreenAccessMap,
  type ScreenPermissionKey,
} from "@/data/screen-permissions"
import { approveUser, listenManagedUsers, rejectUser, updateUserAccess, type ManagedUser, type ManagedUserStatus } from "@/data/users-admin"
import { cn } from "@/lib/utils"

const LABEL_BY_KEY = new Map<ScreenPermissionKey, string>(SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, option.label]))
const STATUS_LABEL: Record<ManagedUserStatus, string> = { pending: "승인 대기", approved: "승인됨", rejected: "거부됨" }
const LEVEL_TONE: Record<ScreenAccess, string> = {
  none: "bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm",
  read: "bg-sky-500 text-white shadow-sm",
  edit: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm",
}

function dateTime(value: unknown): string {
  return toDate(value) ? `${fmtDateFull(value)} ${fmtTime(value)}` : "—"
}

function countLevels(access: ScreenAccessMap) {
  const keys = ACCESS_GROUPS.flatMap((group) => group.keys).filter((key) => !FEATURE_KEYS.includes(key))
  return { edit: keys.filter((key) => access[key] === "edit").length, read: keys.filter((key) => access[key] === "read").length, total: keys.length }
}

function LevelSwitch({ value, levels, disabled, onChange, label }: { value: ScreenAccess; levels: ScreenAccess[]; disabled: boolean; onChange: (next: ScreenAccess) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-[8px] bg-[var(--muted)] p-0.5">
    {levels.map((level) => {
      const selected = value === level
      const text = FEATURE_KEYS.includes(label as ScreenPermissionKey) ? (level === "none" ? "차단" : "허용") : label === "HOME" ? ({ none: "없음", read: "블러", edit: "공개" } as const)[level] : ACCESS_LABELS[level]
      return <button key={level} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onChange(level)}
        className={cn("min-w-11 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-wait", selected ? LEVEL_TONE[level] : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>{text}</button>
    })}
  </div>
}

function UserRow({ member, busy, onAccess, onApprove, onReject }: {
  member: ManagedUser
  busy: boolean
  onAccess: (access: ScreenAccessMap, department: string | null) => void
  onApprove: () => void
  onReject: () => void
}) {
  const [open, setOpen] = useState(member.status === "pending")
  const department = departmentById(member.department)
  const custom = Boolean(department) && !matchesDepartment(member.department, member.access)
  const counts = countLevels(member.access)
  const noAccess = counts.edit + counts.read === 0

  const chooseDepartment = (id: string) => {
    const next = departmentById(id)
    if (!next) { onAccess(member.access, null); return }
    if (custom && !window.confirm(`직접 고친 권한을 ${next.label} 기본값으로 바꿉니다. 계속할까요?`)) return
    onAccess({ ...next.access }, next.id)
  }
  const setLevel = (key: ScreenPermissionKey, level: ScreenAccess) => onAccess({ ...member.access, [key]: level }, member.department)
  const setGroup = (keys: ScreenPermissionKey[], level: ScreenAccess) => onAccess({ ...member.access, ...Object.fromEntries(keys.map((key) => [key, FEATURE_KEYS.includes(key) && level === "read" ? "none" : level])) }, member.department)

  return <li className={cn("rounded-[12px] border bg-[var(--card)] transition-shadow", member.status === "pending" ? "border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))]" : "border-[var(--border)]", open && "shadow-sm")}>
    <div className="grid items-center gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-semibold text-[var(--foreground)]">{(member.name || member.email || "?").slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{member.name || member.email}</p>
            <Badge variant={member.status === "pending" ? "destructive" : member.status === "approved" ? "outline" : "secondary"}>{STATUS_LABEL[member.status]}</Badge>
          </div>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{member.email}{member.requestedAt ? ` · 신청 ${dateTime(member.requestedAt)}` : ""}</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <select aria-label={`${member.name || member.email} 부서`} value={member.department ?? ""} disabled={busy} onChange={(event) => chooseDepartment(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
          <option value="">부서 미지정</option>
          {DEPARTMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]" title="업무·분석 화면 기준">
          <strong className="text-[var(--primary)]">편집 {counts.edit}</strong> · <strong className="text-sky-600">읽기 {counts.read}</strong>
        </span>
        {member.status === "pending" && department ? <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title="가입할 때 신청자가 고른 부서입니다. 승인하면 이 부서 기본 권한이 바로 적용됩니다.">신청 부서</span> : null}
        {custom ? <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">직접 설정</span> : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {member.status !== "approved" ? <Button type="button" size="sm" disabled={busy || noAccess} title={noAccess ? "부서를 고르거나 화면 권한을 하나 이상 주세요" : undefined} onClick={onApprove}>{member.status === "rejected" ? "재승인" : "승인"}</Button> : null}
        {member.status !== "rejected" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReject}>{member.status === "approved" ? "승인 취소" : "거부"}</Button> : null}
        <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((current) => !current)}>권한<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" /></Button>
      </div>
    </div>

    {open ? <div className="border-t border-[var(--border)] px-3 pb-3 pt-2">
      {department ? <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">{department.label} 기본값: {department.hint}</p> : <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">부서를 고르면 기본 권한이 채워집니다. 화면별로 고칠 수 있습니다.</p>}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {ACCESS_GROUPS.map((group) => {
          const feature = group.keys.every((key) => FEATURE_KEYS.includes(key))
          return <section key={group.label} className="rounded-[10px] bg-[color-mix(in_srgb,var(--muted)_55%,transparent)] p-2">
            <header className="mb-1 flex items-center justify-between px-1">
              <h3 className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{group.label}</h3>
              {!feature ? <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] text-[var(--muted-foreground)]">일괄{(["none", "read", "edit"] as ScreenAccess[]).map((level) => <button key={level} type="button" disabled={busy} onClick={() => setGroup(group.keys, level)} className="rounded px-1.5 py-0.5 hover:bg-[var(--card)] hover:text-[var(--foreground)]">{ACCESS_LABELS[level]}</button>)}</span> : null}
            </header>
            <ul className="space-y-1">
              {group.keys.map((key) => <li key={key} className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--card)] px-2.5 py-1.5">
                <span className="min-w-0 truncate text-xs font-medium" title={LABEL_BY_KEY.get(key)}>{LABEL_BY_KEY.get(key)}</span>
                <LevelSwitch label={FEATURE_KEYS.includes(key) ? key : LABEL_BY_KEY.get(key) ?? key} value={member.access[key]} levels={FEATURE_KEYS.includes(key) ? ["none", "edit"] : ["none", "read", "edit"]} disabled={busy} onChange={(level) => setLevel(key, level)} />
              </li>)}
            </ul>
          </section>
        })}
      </div>
    </div> : null}
  </li>
}

export function UserApprovalPanel() {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [filter, setFilter] = useState<"all" | ManagedUserStatus>("all")

  useEffect(() => {
    if (!isOwner) return
    const unsub = listenManagedUsers(setManagedUsers)
    return () => unsub()
  }, [isOwner])

  const counts = useMemo(() => ({
    all: managedUsers.length,
    pending: managedUsers.filter((member) => member.status === "pending").length,
    approved: managedUsers.filter((member) => member.status === "approved").length,
    rejected: managedUsers.filter((member) => member.status === "rejected").length,
  }), [managedUsers])
  const visible = filter === "all" ? managedUsers : managedUsers.filter((member) => member.status === filter)

  const run = async (member: ManagedUser, action: () => Promise<void>, done: string, failed: string) => {
    setBusyUid(member.uid)
    setMessage("")
    try { await action(); if (done) setMessage(done) } catch { setMessage(failed) } finally { setBusyUid(null) }
  }
  const changeAccess = (member: ManagedUser, access: ScreenAccessMap, department: string | null) => {
    setManagedUsers((current) => current.map((item) => item.uid === member.uid ? { ...item, access, department } : item))
    void run(member, () => updateUserAccess(member.uid, access, department), "", "권한 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.")
  }
  const approve = (member: ManagedUser) => void run(member, () => approveUser(member.uid, member.access, member.department), `${member.name || member.email} 사용자를 승인했습니다.`, "사용자 승인에 실패했습니다. 잠시 후 다시 시도해 주세요.")
  const reject = (member: ManagedUser) => {
    const question = member.status === "approved" ? "이 사용자의 승인을 취소하시겠습니까? 즉시 앱 접근이 차단됩니다." : "이 가입 신청을 거부하시겠습니까?"
    if (!window.confirm(question)) return
    void run(member, () => rejectUser(member.uid), `${member.name || member.email} 사용자의 접근을 차단했습니다.`, "사용자 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.")
  }

  if (!isOwner) return null
  // Reveal로 감싸지 않는다. 목록이 길면 관찰 임계값을 못 넘어 영영 안 보인다(CLAUDE.md 주의).
  return <>
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-4 text-[var(--primary)]" aria-hidden="true" />가입자 승인 · 권한</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">부서를 고르면 기본 권한이 채워집니다. 화면별 <strong className="text-[var(--foreground)]">없음 / 읽기 / 편집</strong>은 바로 저장되고 해당 사용자 화면에 실시간 반영됩니다.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", "pending", "approved", "rejected"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors", filter === key ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]", key === "pending" && counts.pending > 0 && filter !== key && "border-[var(--destructive)] text-[var(--destructive)]")}>
            {key === "all" ? "전체" : STATUS_LABEL[key]} {counts[key]}
          </button>)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-[var(--muted)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
        <span><strong className="text-[var(--foreground)]">없음</strong> 메뉴에 안 보임</span>
        <span><strong className="text-sky-600">읽기</strong> 보기만. 수정은 저장되지 않음</span>
        <span><strong className="text-[var(--primary)]">편집</strong> 보기와 수정</span>
        <span><strong className="text-[var(--foreground)]">HOME</strong> 블러는 흐리게만 보이고 클릭 불가</span>
        <span className="ml-auto">SETTING은 소유자 전용</span>
      </div>

      {visible.length ? <ul className="mt-3 space-y-2">
        {visible.map((member) => <UserRow key={member.uid} member={member} busy={busyUid === member.uid}
          onAccess={(access, department) => changeAccess(member, access, department)} onApprove={() => approve(member)} onReject={() => reject(member)} />)}
      </ul> : <p className="mt-4 text-sm text-[var(--muted-foreground)]">해당하는 사용자가 없습니다.</p>}
      {message ? <p aria-live="polite" className="mt-3 text-sm">{message}</p> : null}
    </div>
  </>
}
