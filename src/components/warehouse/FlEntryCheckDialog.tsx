import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WarehouseFlCheck } from "@/data/warehouse-fl-check"

interface FlEntryCheckDialogProps {
  check: WarehouseFlCheck | null
  onCancel: () => void
  onConfirm: () => void
  saving?: boolean
}

const text = (value: string | number | undefined): string => String(value ?? "").trim() || "—"

/** 창고 직접 추가 원단의 FL 저장 전 경고를 한곳에 모아 보여준다. */
export function FlEntryCheckDialog({ check, onCancel, onConfirm, saving = false }: FlEntryCheckDialogProps) {
  return <Dialog open={Boolean(check)} onOpenChange={(open) => { if (!open && !saving) onCancel() }}>
    <DialogContent className="max-w-2xl" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>FL 저장 확인</DialogTitle>
        <DialogDescription>{check?.fl ? `${check.fl} 저장 전에 확인해 주세요.` : "저장 전에 확인해 주세요."}</DialogDescription>
      </DialogHeader>
      <DialogBody className="max-h-[65vh] space-y-3 overflow-y-auto text-sm">
        {check?.mergeRecords.length ? <section className="rounded-[var(--radius)] border border-[var(--border)] p-3">
          <p className="font-medium">DD MASTER의 같은 FL 행과 한 원단으로 합쳐집니다.</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
            {check.mergeRecords.map((record, index) => <li key={`${record._src.row}-${index}`}>{[record.owner, record.styleNo, record.season, record.construction].map(text).join(" · ")}</li>)}
          </ul>
        </section> : null}
        {check?.sameStyleNoFl.length ? <section className="rounded-[var(--radius)] border border-[var(--warning)] p-3">
          <p className="font-medium">DD MASTER에 같은 Style No.이면서 FL이 빈 행이 있습니다. DD에 있는 원단이면 DD MASTER에서 FL을 입력하세요.</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
            {check.sameStyleNoFl.map((record, index) => <li key={`${record._src.row}-${index}`}>{[record.owner, record.styleNo, record.opt, record.construction, record.tech?.yarnDetail?.slice(0, 40)].map(text).join(" · ")}</li>)}
          </ul>
        </section> : null}
        {check?.duplicateItems.length ? <section className="rounded-[var(--radius)] border border-[var(--destructive)] p-3">
          <p className="font-medium">다른 창고 원단이 이미 이 FL을 쓰고 있습니다.</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
            {check.duplicateItems.map((item) => <li key={item.key}>{text(item.storageNo)} · {text(item.styleNo)}</li>)}
          </ul>
        </section> : null}
        {check?.formatWarning ? <section className="rounded-[var(--radius)] border border-[var(--warning)] p-3">
          <p className="font-medium">FL 형식(FL+연월 4자리+번호 4자리)과 다릅니다. 국내 SA 등 다른 형식이면 그대로 저장하세요.</p>
        </section> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>취소</Button>
        <Button type="button" disabled={saving} onClick={onConfirm}>{saving ? "저장 중…" : check?.sameStyleNoFl.length ? "DD에 없는 원단입니다. 저장" : "저장"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
