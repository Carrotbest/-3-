import { Info, Lock, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { dismissIntegrityNotice, useAppStore } from "@/store/useAppStore"

export function IntegrityNoticeDialog() {
  const notice = useAppStore((state) => state.integrityNotice)
  if (!notice) return null
  const NoticeIcon = notice.kind === "permission" ? Lock : notice.kind === "format" ? Info : ShieldAlert
  const iconColor = notice.kind === "permission" ? "text-amber-600" : notice.kind === "format" ? "text-sky-600" : "text-rose-600"

  return <Dialog open onOpenChange={(open) => { if (!open) dismissIntegrityNotice() }}>
    <DialogContent className="max-w-lg" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <NoticeIcon className={`size-5 ${iconColor}`} aria-hidden="true" />
          저장하지 않았습니다
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3 text-sm">
        <p>작업: {notice.action}</p>
        <div className="space-y-1">
          {notice.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
        {notice.hint ? <p>{notice.hint}</p> : null}
        {notice.kind === "format" ? null : <p className="text-[var(--muted-foreground)]">{notice.kind === "permission" ? "권한이 필요한 작업입니다. 담당 부서에 요청해 주세요." : "이 저장을 그대로 하면 창고 장부가 바뀌어 저장을 멈췄습니다. 이 창을 캡처해 원단 R&D팀에 알려 주세요."}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={dismissIntegrityNotice}>확인</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
