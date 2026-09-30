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
