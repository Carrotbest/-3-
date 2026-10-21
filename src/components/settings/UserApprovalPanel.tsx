/**
 * 가입자 승인과 권한 표(R263). SETTING 사용자 탭에서 쓴다.
 *
 * 가로가 권한 항목, 세로가 사람인 매트릭스다. 부서로 묶어 접고 펴며,
 * 열 머리 아래 "전체 적용" 줄과 부서 묶음 머리의 일괄 버튼으로 여러 명을 한 번에 바꾼다.
 * 승인 대기는 표에 넣지 않고 머리말 버튼과 팝업으로 뺐다(권한 표는 이미 쓰는 사람들의 자리다).
 *
 * 저장은 사람마다 updateUserAccess 한 번이다. 일괄은 그 호출을 여러 번 보낸다.
 */
import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronRight, ShieldCheck, UserPlus } from "lucide-react"

import { PendingApprovalDialog } from "@/components/settings/PendingApprovalDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/data/auth"
import { DEPARTMENTS, departmentById, matchesDepartment } from "@/data/departments"
import {
  ACCESS_GROUPS,
  ACCESS_LABELS,
  FEATURE_KEYS,
  READ_ONLY_KEYS,
  SCREEN_PERMISSION_OPTIONS,
  type ScreenAccess,
  type ScreenAccessMap,
  type ScreenPermissionKey,
} from "@/data/screen-permissions"
import { approveUser, listenManagedUsers, rejectUser, updateUserAccess, type ManagedUser } from "@/data/users-admin"
import { cn } from "@/lib/utils"

const LABEL_BY_KEY = new Map<ScreenPermissionKey, string>(SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, option.label]))
/**
 * 한 번에 한 묶음만 세운다(R266). 16열을 한 화면에 넣으면 열 폭이 눌려 이름도 토글도 못 읽는다.
 * setting 은 소유자 전용이라 어느 묶음에도 없다.
 */
const TAB_LABELS: string[] = ACCESS_GROUPS.map((group) => group.label)
const keysOfTab = (label: string): ScreenPermissionKey[] => ACCESS_GROUPS.find((group) => group.label === label)?.keys ?? []
/** 전 화면 일괄이 다루는 범위. 탭과 무관하게 모든 열이다. */
const ALL_COLUMN_KEYS: ScreenPermissionKey[] = ACCESS_GROUPS.flatMap((group) => group.keys)
const LEVEL_TONE: Record<ScreenAccess, string> = {
  none: "bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm",
  read: "bg-sky-500 text-white shadow-sm",
  edit: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm",
}
const NAME_W = 214
const DEPT_W = 148
const BULK_W = 128
/** 열 폭. 낱말 토글 세 개(각 34px 이상)가 들어가는 최소치다. */
const COLUMN_W = 124
/** 열 이름 줄 높이. 두 줄까지 접어 쓴다. */
const HEAD_LABEL_H = 46
/** 부서 미지정 묶음 키. DepartmentId 와 겹치지 않는 값이어야 한다. */
const NO_DEPARTMENT = "__none__"

const isFeature = (key: ScreenPermissionKey) => FEATURE_KEYS.includes(key)
/** 팀원에게 편집을 못 주는 화면(R342). 규칙이 쓰기를 소유자로 막아 두어 화면만 열면 저장이 거부된다. */
const isReadOnly = (key: ScreenPermissionKey) => READ_ONLY_KEYS.includes(key)
const levelsFor = (key: ScreenPermissionKey): ScreenAccess[] =>
  isFeature(key) ? ["none", "edit"] : isReadOnly(key) ? ["none", "read"] : ["none", "read", "edit"]
/** 셀 글자. HOME 은 블러·공개, 기능 열은 차단·허용이다. */
function levelText(key: ScreenPermissionKey, level: ScreenAccess): string {
  if (isFeature(key)) return level === "none" ? "차단" : "허용"
  if (key === "home") return ({ none: "없음", read: "블러", edit: "공개" } as const)[level]
  return ACCESS_LABELS[level]
}
/** 전 화면 일괄에서 기능 열은 읽기가 없다. 읽기를 고르면 차단으로 둔다. 읽기 전용 화면은 편집을 읽기로 낮춘다. */
const bulkLevel = (key: ScreenPermissionKey, level: ScreenAccess): ScreenAccess => {
  if (isFeature(key)) return level === "read" ? "none" : level
  if (isReadOnly(key)) return level === "edit" ? "read" : level
  return level
}
const bulkAccess = (access: ScreenAccessMap, level: ScreenAccess): ScreenAccessMap => ({
  ...access,
  ...Object.fromEntries(ALL_COLUMN_KEYS.map((key) => [key, bulkLevel(key, level)])) as Partial<ScreenAccessMap>,
  setting: "none",
})

function LevelCell({ permissionKey, value, disabled, owner, onChange }: {
  permissionKey: ScreenPermissionKey
  value: ScreenAccess
  disabled: boolean
  owner: string
  onChange: (level: ScreenAccess) => void
}) {
  return <span role="radiogroup" aria-label={`${owner} ${LABEL_BY_KEY.get(permissionKey) ?? permissionKey}`} className="inline-flex rounded-[6px] bg-[var(--muted)] p-[2px]">
    {levelsFor(permissionKey).map((level) => {
      const selected = value === level
      const text = levelText(permissionKey, level)
      return <button key={level} type="button" role="radio" aria-checked={selected} aria-label={text} title={text} disabled={disabled} onClick={() => onChange(level)}
        className={cn("min-w-[34px] rounded-[4px] px-1.5 py-[3px] text-[11px] font-semibold leading-none transition-colors disabled:cursor-wait",
          selected ? LEVEL_TONE[level] : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>{text}</button>
    })}
  </span>
}

/** 고른 값이 없는 일괄 버튼. 누르면 그 수준으로 여러 명을 한 번에 바꾼다. */
function BulkCell({ permissionKey, disabled, onPick, label }: {
  permissionKey: ScreenPermissionKey
  disabled: boolean
  onPick: (level: ScreenAccess) => void
  label: string
}) {
  return <span className="inline-flex rounded-[6px] bg-[var(--muted)] p-[2px]">
    {levelsFor(permissionKey).map((level) => {
      const text = levelText(permissionKey, level)
      return <button key={level} type="button" disabled={disabled} aria-label={`${label} ${text}`} title={`${label} ${text}`} onClick={() => onPick(level)}
        className="min-w-[34px] rounded-[4px] px-1.5 py-[3px] text-[11px] font-semibold leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)] disabled:cursor-wait">{text}</button>
    })}
  </span>
}

/** 한 사람 전 화면 일괄. 열마다 다른 단계가 섞이므로 세 단계를 글자로 적는다. */
function RowBulk({ disabled, onPick, label }: { disabled: boolean; onPick: (level: ScreenAccess) => void; label: string }) {
  return <span className="inline-flex gap-0.5">
    {(["none", "read", "edit"] as ScreenAccess[]).map((level) => <button key={level} type="button" disabled={disabled} title={`${label} 전 화면 ${ACCESS_LABELS[level]}`} onClick={() => onPick(level)}
      className="rounded-[5px] border border-[var(--border)] px-2 py-[3px] text-[10px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-wait">{ACCESS_LABELS[level]}</button>)}
  </span>
}

export function UserApprovalPanel() {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [busyUids, setBusyUids] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [showRejected, setShowRejected] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>(TAB_LABELS[0] ?? "")

  useEffect(() => {
    if (!isOwner) return
    const unsub = listenManagedUsers(setManagedUsers)
    return () => unsub()
  }, [isOwner])

  const pending = useMemo(() => managedUsers.filter((member) => member.status === "pending"), [managedUsers])
  const rows = useMemo(() => managedUsers.filter((member) => member.status === "approved" || (showRejected && member.status === "rejected")), [managedUsers, showRejected])
  const groups = useMemo(() => {
    const order = [...DEPARTMENTS.map((department) => department.id as string), NO_DEPARTMENT]
    const byKey = new Map<string, ManagedUser[]>(order.map((key) => [key, []]))
    rows.forEach((member) => {
      const key = departmentById(member.department) ? String(member.department) : NO_DEPARTMENT
      byKey.get(key)?.push(member)
    })
    return order
      .map((key) => ({
        key,
        label: departmentById(key)?.label ?? "부서 미지정",
        hint: departmentById(key)?.hint ?? "부서를 고르면 기본 권한이 채워집니다",
        members: (byKey.get(key) ?? []).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "ko-KR")),
      }))
      .filter((group) => group.members.length)
  }, [rows])

  const columns = keysOfTab(activeTab)
  const nameOf = (member: ManagedUser) => member.name || member.email

  /** 여러 명의 권한을 한 번에 바꾼다. 화면은 먼저 바꾸고 저장은 사람마다 보낸다. */
  const applyAccess = (members: readonly ManagedUser[], build: (member: ManagedUser) => { access: ScreenAccessMap; department: string | null }) => {
    if (!members.length) return
    const updates = members.map((member) => ({ uid: member.uid, ...build(member) }))
    const byUid = new Map(updates.map((item) => [item.uid, item]))
    setManagedUsers((current) => current.map((item) => {
      const update = byUid.get(item.uid)
      return update ? { ...item, access: update.access, department: update.department } : item
    }))
    setBusyUids((current) => new Set([...current, ...updates.map((item) => item.uid)]))
    setMessage("")
    void Promise.allSettled(updates.map((item) => updateUserAccess(item.uid, item.access, item.department))).then((results) => {
      const failed = results.filter((result) => result.status === "rejected").length
      if (failed) setMessage(`${failed}명은 저장하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.`)
      setBusyUids((current) => {
        const next = new Set(current)
        updates.forEach((item) => next.delete(item.uid))
        return next
      })
    })
  }

  const setCell = (member: ManagedUser, key: ScreenPermissionKey, level: ScreenAccess) =>
    applyAccess([member], (item) => ({ access: { ...item.access, [key]: level }, department: item.department }))
  const setRow = (member: ManagedUser, level: ScreenAccess) =>
    applyAccess([member], (item) => ({ access: bulkAccess(item.access, level), department: item.department }))
  const setColumn = (members: readonly ManagedUser[], key: ScreenPermissionKey, level: ScreenAccess, scope: string) => {
    if (!members.length) return
    if (members.length > 1 && !window.confirm(`${scope} ${members.length}명의 ${LABEL_BY_KEY.get(key)} 권한을 ${levelText(key, level)}(으)로 바꿉니다. 계속할까요?`)) return
    applyAccess(members, (item) => ({ access: { ...item.access, [key]: level }, department: item.department }))
  }
  const setGroupLevel = (members: readonly ManagedUser[], level: ScreenAccess, scope: string) => {
    if (!members.length) return
    if (!window.confirm(`${scope} ${members.length}명의 전 화면 권한을 ${ACCESS_LABELS[level]}(으)로 바꿉니다. 계속할까요?`)) return
    applyAccess(members, (item) => ({ access: bulkAccess(item.access, level), department: item.department }))
  }
  const resetToDepartment = (members: readonly ManagedUser[], departmentKey: string) => {
    const department = departmentById(departmentKey)
    if (!department || !members.length) return
    if (!window.confirm(`${department.label} ${members.length}명을 부서 기본 권한으로 되돌립니다. 직접 고친 값은 사라집니다. 계속할까요?`)) return
    applyAccess(members, () => ({ access: { ...department.access }, department: department.id }))
  }
  const chooseDepartment = (member: ManagedUser, id: string) => {
    const department = departmentById(id)
    if (!department) { applyAccess([member], (item) => ({ access: item.access, department: null })); return }
    const custom = Boolean(departmentById(member.department)) && !matchesDepartment(member.department, member.access)
    if (custom && !window.confirm(`직접 고친 권한을 ${department.label} 기본값으로 바꿉니다. 계속할까요?`)) return
    applyAccess([member], () => ({ access: { ...department.access }, department: department.id }))
  }

  const run = async (member: ManagedUser, action: () => Promise<void>, done: string, failed: string) => {
    setBusyUids((current) => new Set([...current, member.uid]))
    setMessage("")
    try { await action(); if (done) setMessage(done) } catch { setMessage(failed) } finally {
      setBusyUids((current) => { const next = new Set(current); next.delete(member.uid); return next })
    }
  }
  const approve = (member: ManagedUser) => void run(member, () => approveUser(member.uid, member.access, member.department), `${nameOf(member)} 사용자를 승인했습니다.`, "사용자 승인에 실패했습니다. 잠시 후 다시 시도해 주세요.")
  const reject = (member: ManagedUser) => {
    const question = member.status === "approved" ? "이 사용자의 승인을 취소하시겠습니까? 즉시 앱 접근이 차단됩니다." : "이 가입 신청을 거부하시겠습니까?"
    if (!window.confirm(question)) return
    void run(member, () => rejectUser(member.uid), `${nameOf(member)} 사용자의 접근을 차단했습니다.`, "사용자 상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.")
  }

  if (!isOwner) return null

  const headCell = "border-b border-r border-[var(--border)] bg-[var(--muted)] text-[11px] font-medium text-[var(--muted-foreground)]"
  const bodyCell = "border-b border-r border-[var(--border)] bg-[var(--card)] px-1 py-1 text-center align-middle"

  return <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-4 text-[var(--primary)]" aria-hidden="true" />가입자 승인 · 권한</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">가로가 화면, 세로가 사람입니다. 칸을 누르면 바로 저장되고 그 사용자 화면에 실시간 반영됩니다.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <input type="checkbox" checked={showRejected} onChange={(event) => setShowRejected(event.target.checked)} />거부됨도 보기
        </label>
        <Button type="button" size="sm" variant={pending.length ? "default" : "outline"} onClick={() => setPendingOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />승인 대기 {pending.length}
        </Button>
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-[var(--muted)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
      <span><strong className="text-[var(--foreground)]">없음</strong> 메뉴에 안 보임</span>
      <span><strong className="text-sky-600">읽기</strong> 보기만. 수정은 저장되지 않음</span>
      <span><strong className="text-[var(--primary)]">편집</strong> 보기와 수정</span>
      <span><strong className="text-[var(--foreground)]">HOME 블러</strong> 흐리게만 보이고 클릭 불가</span>
      <span><strong className="text-[var(--foreground)]">기능 열</strong> 차단 · 허용</span>
      <span className="ml-auto">SETTING은 소유자 전용</span>
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-1" role="tablist" aria-label="권한 묶음">
      {TAB_LABELS.map((label) => <button key={label} type="button" role="tab" aria-selected={activeTab === label} onClick={() => setActiveTab(label)}
        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", activeTab === label ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>
        {label} <span className="tabular-nums opacity-70">{keysOfTab(label).length}</span>
      </button>)}
      <span className="ml-2 text-[11px] text-[var(--muted-foreground)]">한 번에 한 묶음씩 봅니다. `전 화면` 칸은 묶음과 상관없이 전체에 적용됩니다.</span>
    </div>

    <div className="mt-3 overflow-auto rounded-[10px] border border-[var(--border)]" style={{ maxHeight: "72vh" }}>
      <table className="border-separate border-spacing-0">
        <thead>
          <tr style={{ height: HEAD_LABEL_H }}>
            <th className={cn("sticky left-0 top-0 z-40 px-2 text-left", headCell)} style={{ width: NAME_W, minWidth: NAME_W }}>사용자</th>
            <th className={cn("sticky top-0 z-30 px-2 text-left", headCell)} style={{ width: DEPT_W, minWidth: DEPT_W, left: NAME_W }}>부서</th>
            <th className={cn("sticky top-0 z-30 px-2 text-center", headCell)} style={{ width: BULK_W, minWidth: BULK_W, left: NAME_W + DEPT_W }}>전 화면</th>
            {columns.map((key) => <th key={key} title={LABEL_BY_KEY.get(key)} className={cn("sticky top-0 z-20 px-1.5 text-center align-middle", headCell)} style={{ width: COLUMN_W, minWidth: COLUMN_W }}>
              <span className="block whitespace-normal break-keep leading-tight">{LABEL_BY_KEY.get(key)}</span>
            </th>)}
          </tr>
          <tr>
            <th className={cn("sticky left-0 z-40 px-2 text-left text-[10px]", headCell)} style={{ top: HEAD_LABEL_H }}>전체 적용</th>
            <th className={cn("sticky z-30", headCell)} style={{ top: HEAD_LABEL_H, left: NAME_W }} />
            <th className={cn("sticky z-30 px-1 text-center", headCell)} style={{ top: HEAD_LABEL_H, left: NAME_W + DEPT_W }}>
              <RowBulk disabled={!rows.length} label="표에 보이는 전원" onPick={(level) => setGroupLevel(rows, level, "표에 보이는")} />
            </th>
            {columns.map((key) => <th key={key} className={cn("sticky z-20 px-1 py-1 text-center", headCell)} style={{ top: HEAD_LABEL_H }}>
              <BulkCell permissionKey={key} disabled={!rows.length} label={`표에 보이는 전원 ${LABEL_BY_KEY.get(key)}`} onPick={(level) => setColumn(rows, key, level, "표에 보이는")} />
            </th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const open = !collapsed.has(group.key)
            return <Fragment key={group.key}>
              <tr key={`${group.key}-head`}>
                <td colSpan={3 + columns.length} className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] p-0">
                  <div className="sticky left-0 flex flex-wrap items-center gap-2 px-2 py-1.5" style={{ width: NAME_W + DEPT_W + BULK_W + 320 }}>
                    <button type="button" aria-expanded={open} onClick={() => setCollapsed((current) => { const next = new Set(current); if (open) next.add(group.key); else next.delete(group.key); return next })}
                      className="inline-flex items-center gap-1 text-xs font-semibold">
                      <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />{group.label}
                      <span className="tabular-nums text-[var(--muted-foreground)]">{group.members.length}</span>
                    </button>
                    <span className="text-[11px] text-[var(--muted-foreground)]">{group.hint}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <RowBulk disabled={!group.members.length} label={group.label} onPick={(level) => setGroupLevel(group.members, level, group.label)} />
                      {departmentById(group.key) ? <button type="button" onClick={() => resetToDepartment(group.members, group.key)} className="rounded-[5px] border border-[var(--border)] px-1.5 py-[3px] text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]">부서 기본값</button> : null}
                    </span>
                  </div>
                </td>
              </tr>
              {open ? group.members.map((member) => {
                const busy = busyUids.has(member.uid)
                const custom = Boolean(departmentById(member.department)) && !matchesDepartment(member.department, member.access)
                return <tr key={member.uid}>
                  <td className={cn("sticky left-0 z-20 px-2 text-left", bodyCell)} style={{ width: NAME_W, minWidth: NAME_W }}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><strong className="truncate text-xs font-semibold">{nameOf(member)}</strong>{member.status === "rejected" ? <Badge variant="secondary" className="shrink-0 text-[10px]">거부됨</Badge> : null}</span>
                        <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{member.email}</span>
                      </span>
                      {member.status === "approved"
                        ? <button type="button" disabled={busy} onClick={() => reject(member)} className="shrink-0 text-[10px] text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--destructive)] hover:underline">승인 취소</button>
                        : <button type="button" disabled={busy} onClick={() => approve(member)} className="shrink-0 text-[10px] text-[var(--primary)] underline-offset-2 hover:underline">재승인</button>}
                    </span>
                  </td>
                  <td className={cn("sticky z-20 px-1 text-left", bodyCell)} style={{ width: DEPT_W, minWidth: DEPT_W, left: NAME_W }}>
                    <select aria-label={`${nameOf(member)} 부서`} value={member.department ?? ""} disabled={busy} onChange={(event) => chooseDepartment(member, event.target.value)}
                      className="h-7 w-full rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-1 text-[11px] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                      <option value="">부서 미지정</option>
                      {DEPARTMENTS.map((item) => <option key={item.id} value={item.id}>{item.short}</option>)}
                    </select>
                    {custom ? <span className="mt-0.5 block text-[10px] text-amber-600">직접 설정</span> : null}
                  </td>
                  <td className={cn("sticky z-20", bodyCell)} style={{ width: BULK_W, minWidth: BULK_W, left: NAME_W + DEPT_W }}>
                    <RowBulk disabled={busy} label={nameOf(member)} onPick={(level) => setRow(member, level)} />
                  </td>
                  {columns.map((key) => <td key={key} className={bodyCell} style={{ width: COLUMN_W, minWidth: COLUMN_W }}>
                    <LevelCell permissionKey={key} value={member.access[key]} disabled={busy} owner={nameOf(member)} onChange={(level) => setCell(member, key, level)} />
                  </td>)}
                </tr>
              }) : null}
            </Fragment>
          })}
        </tbody>
      </table>
      {!groups.length ? <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">승인된 사용자가 없습니다. 승인 대기에서 먼저 승인하세요.</p> : null}
    </div>

    {message ? <p aria-live="polite" className="mt-3 text-sm">{message}</p> : null}

    <PendingApprovalDialog
      open={pendingOpen}
      onOpenChange={setPendingOpen}
      members={pending}
      busyUids={busyUids}
      onDepartment={(member, id) => chooseDepartment(member, id)}
      onApprove={(member) => approve(member)}
      onReject={(member) => reject(member)}
    />
  </div>
}
