# R263 권한 화면을 표(매트릭스)로 바꾼다

상태: 미착수. 추론 강도 **medium**(패널 1개 전면 교체, 팝업 1개 신규. 권한 데이터 계약은 그대로다).

SETTING 사용자 탭의 가입자 승인·권한 패널을 바꾼다. 지금은 사람마다 카드를 펼쳐야 권한이 보여서, 여러 사람을 비교하거나 한 화면 권한을 여러 명에게 주는 일이 번거롭다.

바꾼 뒤 모양은 이렇다.

- 가로는 권한 항목(화면), 세로는 사람이다. 한 사람의 전 권한이 한 줄에 보인다.
- 부서별로 묶고 묶음 머리를 눌러 접고 편다. 묶음 머리에 그 부서 전원 일괄 적용이 있다.
- 열 머리 아래 `전체 적용` 줄로 한 화면 권한을 표에 보이는 전원에게 한 번에 준다.
- 승인 대기는 표에서 빼고 머리말의 `승인 대기 N` 버튼으로 모은다. 눌러서 부서를 고르고 승인하면 표에 들어온다. 화면별 조정은 표에서 이어서 한다.

## 바뀌지 않는 것 (건드리지 마라)

- 권한 데이터 구조. `ScreenAccessMap`, `access`, `screenPermissions` 병행 저장, `DEPARTMENTS` 기본값, `matchesDepartment` 판정 모두 그대로다.
- 저장 함수. `updateUserAccess(uid, access, department)`, `approveUser`, `rejectUser`, `listenManagedUsers` 를 그대로 쓴다. 새 저장 경로를 만들지 마라.
- `setting` 키는 표에 넣지 않는다. 소유자 전용이다.
- 이 패널은 소유자에게만 보인다(`isOwner` 가드). 그대로 둔다.
- `Reveal`로 감싸지 마라. 목록이 길면 IntersectionObserver 임계값을 못 넘어 영영 안 보인다(CLAUDE.md 주의).
- `src/data/screen-permissions.ts`, `src/data/departments.ts`, `src/data/users-admin.ts` 는 고치지 마라.

## A. 신규 파일 `src/components/settings/PendingApprovalDialog.tsx`

```tsx
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DEPARTMENTS, departmentById } from "@/data/departments"
import { fmtDateFull, fmtTime, toDate } from "@/data/format"
import type { ManagedUser } from "@/data/users-admin"

interface PendingApprovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: readonly ManagedUser[]
  busyUids: ReadonlySet<string>
  onDepartment: (member: ManagedUser, departmentId: string) => void
  onApprove: (member: ManagedUser) => void
  onReject: (member: ManagedUser) => void
}

const dateTime = (value: unknown): string => toDate(value) ? `${fmtDateFull(value)} ${fmtTime(value)}` : "—"

/** 승인 대기 신청만 모아 보는 팝업(R263). 부서를 고르고 승인하면 표에 들어온다. */
export function PendingApprovalDialog({ open, onOpenChange, members, busyUids, onDepartment, onApprove, onReject }: PendingApprovalDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-2xl">
      <DialogHeader>
        <DialogTitle>승인 대기 {members.length}명</DialogTitle>
        <DialogDescription>부서를 고르고 승인하면 그 부서 기본 권한으로 표에 들어옵니다. 화면별 권한은 표에서 마저 고칩니다.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        {members.map((member) => {
          const department = departmentById(member.department)
          const busy = busyUids.has(member.uid)
          return <div key={member.uid} className="rounded-[10px] border border-[var(--border)] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{member.name || member.email}</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">{member.email}{member.requestedAt ? ` · 신청 ${dateTime(member.requestedAt)}` : ""}</span>
              </span>
              {member.department ? <Badge variant="outline" className="shrink-0 text-[10px]" title="가입할 때 신청자가 고른 부서입니다">신청 부서</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select aria-label={`${member.name || member.email} 부서`} value={member.department ?? ""} disabled={busy} onChange={(event) => onDepartment(member, event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                <option value="">부서 미지정</option>
                {DEPARTMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <Button type="button" size="sm" disabled={busy || !department} title={department ? undefined : "부서를 먼저 고르세요"} onClick={() => onApprove(member)}>승인</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onReject(member)}>거부</Button>
            </div>
            {department ? <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">{department.hint}</p> : null}
          </div>
        })}
        {!members.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">승인 대기 중인 신청이 없습니다.</p> : null}
      </DialogBody>
      <DialogFooter><Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
```

## B. `src/components/settings/UserApprovalPanel.tsx` 전면 교체

파일 내용을 통째로 아래로 바꾼다. `UserApprovalPanel` 이름과 export 는 그대로라 부르는 쪽(SETTING 화면)은 고칠 필요가 없다.

```tsx
/**
 * 가입자 승인과 권한 표(R263). SETTING 사용자 탭에서 쓴다.
 *
 * 가로가 권한 항목, 세로가 사람인 매트릭스다. 부서로 묶어 접고 펴며,
 * 열 머리 아래 "전체 적용" 줄과 부서 묶음 머리의 일괄 버튼으로 여러 명을 한 번에 바꾼다.
 * 승인 대기는 표에 넣지 않고 머리말 버튼과 팝업으로 뺐다(권한 표는 이미 쓰는 사람들의 자리다).
 *
 * 저장은 사람마다 updateUserAccess 한 번이다. 일괄은 그 호출을 여러 번 보낸다.
 */
import { useEffect, useMemo, useState } from "react"
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
  SCREEN_PERMISSION_OPTIONS,
  type ScreenAccess,
  type ScreenAccessMap,
  type ScreenPermissionKey,
} from "@/data/screen-permissions"
import { approveUser, listenManagedUsers, rejectUser, updateUserAccess, type ManagedUser } from "@/data/users-admin"
import { cn } from "@/lib/utils"

const LABEL_BY_KEY = new Map<ScreenPermissionKey, string>(SCREEN_PERMISSION_OPTIONS.map((option) => [option.key, option.label]))
/** 표에 세우는 열. setting 은 소유자 전용이라 뺀다. */
const COLUMN_KEYS: ScreenPermissionKey[] = ACCESS_GROUPS.flatMap((group) => group.keys)
const LEVEL_TONE: Record<ScreenAccess, string> = {
  none: "bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm",
  read: "bg-sky-500 text-white shadow-sm",
  edit: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm",
}
const NAME_W = 214
const DEPT_W = 148
const BULK_W = 92
const HEAD_GROUP_H = 26
const HEAD_LABEL_H = 118
/** 부서 미지정 묶음 키. DepartmentId 와 겹치지 않는 값이어야 한다. */
const NO_DEPARTMENT = "__none__"

const isFeature = (key: ScreenPermissionKey) => FEATURE_KEYS.includes(key)
const levelsFor = (key: ScreenPermissionKey): ScreenAccess[] => isFeature(key) ? ["none", "edit"] : ["none", "read", "edit"]
/** 셀 글자. HOME 은 블러·공개, 기능 열은 차단·허용이다. */
function levelText(key: ScreenPermissionKey, level: ScreenAccess): string {
  if (isFeature(key)) return level === "none" ? "차단" : "허용"
  if (key === "home") return ({ none: "없음", read: "블러", edit: "공개" } as const)[level]
  return ACCESS_LABELS[level]
}
/** 전 화면 일괄에서 기능 열은 읽기가 없다. 읽기를 고르면 차단으로 둔다. */
const bulkAccess = (access: ScreenAccessMap, level: ScreenAccess): ScreenAccessMap => ({
  ...access,
  ...Object.fromEntries(COLUMN_KEYS.map((key) => [key, isFeature(key) && level === "read" ? "none" : level])) as Partial<ScreenAccessMap>,
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
        className={cn("w-[22px] rounded-[4px] py-[3px] text-[10px] font-semibold leading-none transition-colors disabled:cursor-wait",
          selected ? LEVEL_TONE[level] : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>{text.slice(0, 1)}</button>
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
        className="w-[22px] rounded-[4px] py-[3px] text-[10px] font-semibold leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)] disabled:cursor-wait">{text.slice(0, 1)}</button>
    })}
  </span>
}

/** 한 사람 전 화면 일괄. 열마다 다른 단계가 섞이므로 세 단계를 글자로 적는다. */
function RowBulk({ disabled, onPick, label }: { disabled: boolean; onPick: (level: ScreenAccess) => void; label: string }) {
  return <span className="inline-flex gap-0.5">
    {(["none", "read", "edit"] as ScreenAccess[]).map((level) => <button key={level} type="button" disabled={disabled} title={`${label} 전 화면 ${ACCESS_LABELS[level]}`} onClick={() => onPick(level)}
      className="rounded-[5px] border border-[var(--border)] px-1.5 py-[3px] text-[10px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-wait">{ACCESS_LABELS[level].slice(0, 1)}</button>)}
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
      <span><strong className="text-[var(--foreground)]">없</strong> 메뉴에 안 보임</span>
      <span><strong className="text-sky-600">읽</strong> 보기만. 수정은 저장되지 않음</span>
      <span><strong className="text-[var(--primary)]">편</strong> 보기와 수정</span>
      <span><strong className="text-[var(--foreground)]">HOME</strong> 블러(블)는 흐리게만 보이고 클릭 불가</span>
      <span><strong className="text-[var(--foreground)]">기능 열</strong> 차단(차) · 허용(허)</span>
      <span className="ml-auto">SETTING은 소유자 전용</span>
    </div>

    <div className="mt-3 overflow-auto rounded-[10px] border border-[var(--border)]" style={{ maxHeight: "72vh" }}>
      <table className="border-separate border-spacing-0">
        <thead>
          <tr style={{ height: HEAD_GROUP_H }}>
            <th className={cn("sticky left-0 top-0 z-40 px-2 text-left", headCell)} style={{ width: NAME_W, minWidth: NAME_W }}>사용자</th>
            <th className={cn("sticky top-0 z-30 px-2 text-left", headCell)} style={{ width: DEPT_W, minWidth: DEPT_W, left: NAME_W }}>부서</th>
            <th className={cn("sticky top-0 z-30 px-2 text-center", headCell)} style={{ width: BULK_W, minWidth: BULK_W, left: NAME_W + DEPT_W }}>전 화면</th>
            {ACCESS_GROUPS.map((group) => <th key={group.label} colSpan={group.keys.length} className={cn("sticky top-0 z-20 px-2 text-center uppercase tracking-[0.06em]", headCell)}>{group.label}</th>)}
          </tr>
          <tr style={{ height: HEAD_LABEL_H }}>
            <th className={cn("sticky left-0 z-40", headCell)} style={{ top: HEAD_GROUP_H }} />
            <th className={cn("sticky z-30", headCell)} style={{ top: HEAD_GROUP_H, left: NAME_W }} />
            <th className={cn("sticky z-30", headCell)} style={{ top: HEAD_GROUP_H, left: NAME_W + DEPT_W }} />
            {COLUMN_KEYS.map((key) => <th key={key} title={LABEL_BY_KEY.get(key)} className={cn("sticky z-20 px-0.5 align-bottom", headCell)} style={{ top: HEAD_GROUP_H, width: 62, minWidth: 62 }}>
              <span className="inline-block whitespace-nowrap py-1 text-[11px] [writing-mode:vertical-rl] rotate-180">{LABEL_BY_KEY.get(key)}</span>
            </th>)}
          </tr>
          <tr>
            <th className={cn("sticky left-0 z-40 px-2 text-left text-[10px]", headCell)} style={{ top: HEAD_GROUP_H + HEAD_LABEL_H }}>전체 적용</th>
            <th className={cn("sticky z-30", headCell)} style={{ top: HEAD_GROUP_H + HEAD_LABEL_H, left: NAME_W }} />
            <th className={cn("sticky z-30 px-1 text-center", headCell)} style={{ top: HEAD_GROUP_H + HEAD_LABEL_H, left: NAME_W + DEPT_W }}>
              <RowBulk disabled={!rows.length} label="표에 보이는 전원" onPick={(level) => setGroupLevel(rows, level, "표에 보이는")} />
            </th>
            {COLUMN_KEYS.map((key) => <th key={key} className={cn("sticky z-20 px-0.5 py-1 text-center", headCell)} style={{ top: HEAD_GROUP_H + HEAD_LABEL_H }}>
              <BulkCell permissionKey={key} disabled={!rows.length} label={`표에 보이는 전원 ${LABEL_BY_KEY.get(key)}`} onPick={(level) => setColumn(rows, key, level, "표에 보이는")} />
            </th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const open = !collapsed.has(group.key)
            return <>
              <tr key={`${group.key}-head`}>
                <td colSpan={3 + COLUMN_KEYS.length} className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] p-0">
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
                  {COLUMN_KEYS.map((key) => <td key={key} className={bodyCell} style={{ width: 62, minWidth: 62 }}>
                    <LevelCell permissionKey={key} value={member.access[key]} disabled={busy} owner={nameOf(member)} onChange={(level) => setCell(member, key, level)} />
                  </td>)}
                </tr>
              }) : null}
            </>
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
```

`groups.map` 안에서 `<>...</>` 조각을 쓰면 key 경고가 난다. `import { Fragment } from "react"` 를 더하고 `<Fragment key={group.key}>` 로 감싸라. 안쪽 `<tr key=...>` 는 그대로 둔다.

## 동작 정리

| 하는 일 | 누르는 곳 |
|---|---|
| 한 사람 한 화면 | 그 칸의 없/읽/편 |
| 한 사람 전 화면 | 그 줄 `전 화면` 칸의 없/읽/편 |
| 한 부서 전원 전 화면 | 부서 묶음 머리의 없/읽/편 (확인 창) |
| 한 부서 전원 부서 기본값 복원 | 부서 묶음 머리의 `부서 기본값` (확인 창) |
| 표 전원 한 화면 | 열 머리 아래 `전체 적용` 줄 (확인 창) |
| 접고 펴기 | 부서 묶음 머리 이름 |
| 승인 대기 처리 | 머리말 `승인 대기 N` 버튼 |

## 하지 말 것

- 일괄 적용에서 확인 창을 빼지 마라. 한 번에 여러 명의 접근 권한이 바뀐다.
- 저장을 한 문서에 모아 쓰지 마라. 사용자 문서는 `users/{uid}` 하나씩이다.
- `setting` 키를 표에 세우지 마라.
- 표를 가상 스크롤로 만들지 마라. 사용자 수가 수십 명이라 필요 없다.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/components/settings/PendingApprovalDialog.tsx` | 신규 (A) |
| `src/components/settings/UserApprovalPanel.tsx` | 전면 교체 (B) |

다른 파일은 열지 않는다. 이 패널을 부르는 SETTING 화면은 export 이름이 같아 고칠 것이 없다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다. SETTING 사용자 탭에서 표가 뜨고, 부서 묶음이 접히고, 칸을 누르면 색이 바뀌는지 본다.
