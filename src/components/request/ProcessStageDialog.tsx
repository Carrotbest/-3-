import { Check, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ProcessStage } from "@/data/request-process-stage"

interface ProcessStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: ProcessStage | null
  title: string
  /** 이 옵션에 연결된 DD 행 수. 1보다 크면 겹쳐 연결된 상태다. */
  linkedCount: number
  /** DD MASTER 편집 권한. 없으면 두 버튼을 비활성한다. */
  canEdit: boolean
  onUnlink: () => void
  onRelink: () => void
  onOpenDd: () => void
}

export function ProcessStageDialog({ open, onOpenChange, stage, title, linkedCount, canEdit, onUnlink, onRelink, onOpenDd }: ProcessStageDialogProps) {
  if (!stage?.linked) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {stage.halted ? <Badge variant="secondary" style={{ color: stage.color }}>{stage.halted}</Badge> : null}
          </div>
          <DialogDescription>현재 {stage.label}, {stage.currentIndex + 1}/{stage.steps.length}단계</DialogDescription>
          {linkedCount >= 2 ? <p className="text-xs" style={{ color: "var(--destructive)" }}>DD 행 {linkedCount}개가 이 옵션에 함께 연결돼 있습니다. 연결 해제는 전부 풉니다.</p> : null}
        </DialogHeader>
        <DialogBody>
          {/* 인라인 animation은 motion-reduce 클래스로 못 끈다(R137). 미디어 쿼리를 !important로 둔다. */}
          <style>{`@keyframes request-process-step-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion: reduce){.request-process-step{animation:none !important}}`}</style>
          <div>
            {stage.steps.map((step, index) => {
              const active = step.state === "current"
              const completed = step.state === "done"
              const nextReached = stage.steps[index + 1]?.state === "done" || stage.steps[index + 1]?.state === "current"
              const connectorColor = nextReached ? stage.steps[index + 1].color : "var(--border)"
              return <div key={step.key} className="request-process-step" style={{ animation: "request-process-step-in 240ms ease-out both", animationDelay: `${index * 40}ms` }}>
                <div
                  className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${active ? "font-semibold" : ""}`}
                  style={active ? { background: `color-mix(in srgb, ${step.color} 10%, transparent)` } : undefined}
                >
                  <span className="relative flex size-[22px] shrink-0 items-center justify-center rounded-full">
                    {active ? <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full opacity-25 motion-reduce:hidden" style={{ backgroundColor: step.color }} /> : null}
                    <span
                      className={`relative flex size-[22px] items-center justify-center rounded-full ${completed || active ? "text-white" : ""}`}
                      style={completed || active
                        ? { backgroundColor: step.color, boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${step.color} 25%, transparent)` : undefined }
                        : { border: `2px ${step.state === "planned" ? "dashed" : "solid"} ${step.state === "planned" ? step.color : "var(--border)"}` }}
                    >
                      {completed ? <Check className="size-3.5" /> : null}
                    </span>
                  </span>
                  <span className={`min-w-0 flex-1 ${step.state === "planned" || step.state === "todo" ? "text-[var(--muted-foreground)]" : ""}`}>
                    {step.label}
                  </span>
                  {step.date ? <span className="text-[11px] font-normal text-[var(--muted-foreground)]">{step.state === "planned" ? `예정 ${step.date}` : step.date}</span> : null}
                  {active ? <Badge variant="secondary" className="text-[10px]">현재</Badge> : null}
                </div>
                {index < stage.steps.length - 1 ? <div className="ml-[18px] flex h-[18px] w-2 flex-col items-center">
                  <span className="h-3 w-0.5" style={{ backgroundColor: connectorColor }} />
                  <ChevronDown className="size-3 shrink-0" style={{ color: connectorColor }} />
                </div> : null}
              </div>
            })}
          </div>
        </DialogBody>
        <DialogFooter className="flex-wrap justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!canEdit} title={!canEdit ? "DD MASTER 편집 권한이 필요합니다" : undefined} style={{ color: "var(--destructive)" }} onClick={onUnlink}>연결 해제</Button>
            <Button type="button" variant="outline" disabled={!canEdit} title={!canEdit ? "DD MASTER 편집 권한이 필요합니다" : undefined} onClick={onRelink}>연결 변경</Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
            <Button type="button" onClick={onOpenDd}>DD MASTER에서 열기</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
