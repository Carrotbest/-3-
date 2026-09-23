import { useEffect, useState } from "react"
import { Copy, Mail } from "lucide-react"

import { MailRecipientsField } from "@/components/warehouse/MailRecipientsField"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FabricLedgerItem } from "@/data/fabric-ledger"
import { INBOUND_REQUEST_COLUMNS, inboundRequestLines, inboundRequestRows, inboundRequestSubject, type InboundRequestMeta } from "@/data/inbound-request-mail"
import { composeMail, copyMailTable, fileDateStamp, type MailAddress } from "@/data/mail-draft"

interface InboundRequestMailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly FabricLedgerItem[]
  defaultRequester: string
}

const todayValue = (): string => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 선택 입고한 원단의 입고 요청 메일. 받는 사람은 고정 목록이고 표는 본문에 들어간 .eml로 연다. */
export function InboundRequestMailDialog({ open, onOpenChange, items, defaultRequester }: InboundRequestMailDialogProps) {
  const [meta, setMeta] = useState<InboundRequestMeta>({ requester: "", deliveryDate: "", note: "" })
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setMeta({ requester: defaultRequester, deliveryDate: todayValue(), note: "" })
    setNotice(null)
    // 창을 열 때 한 번만 초기화한다.
  }, [open])

  const rows = inboundRequestRows(items)

  const copyTable = async () => {
    try {
      const mode = await copyMailTable(INBOUND_REQUEST_COLUMNS, rows)
      setNotice({ kind: "ok", text: mode === "html" ? "표를 복사했습니다. 메일 본문에 붙여넣으세요." : "표를 서식 없이 복사했습니다." })
    } catch {
      setNotice({ kind: "error", text: "복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하세요." })
    }
  }

  const makeMail = async () => {
    if (!recipients.length) { setNotice({ kind: "error", text: "수신자가 등록되어 있지 않습니다." }); return }
    const mode = await composeMail({
      fileName: `원단입고요청_${fileDateStamp()}.eml`,
      subject: inboundRequestSubject(items),
      to: recipients,
      lines: inboundRequestLines(meta, items),
      columns: INBOUND_REQUEST_COLUMNS,
      rows,
    })
    setNotice(mode === "mailto"
      ? { kind: "ok", text: "Outlook 새 메일 창을 열었습니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 보내세요. 서명은 그대로 남습니다." }
      : { kind: "ok", text: "클립보드 복사에 실패해 .eml 파일을 내려받았습니다. 파일을 열면 표까지 채워진 새 메일이 뜹니다(서명 없음)." })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[94vw] max-w-4xl">
      <DialogHeader>
        <DialogTitle>입고 요청 메일</DialogTitle>
        <DialogDescription>입고 등록한 원단 {items.length}건의 입고 요청 메일을 만듭니다. 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜨고, 본문은 클립보드에 담아 둡니다.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <MailRecipientsField open={open} onRecipientsChange={setRecipients} onEditingChange={setEditing} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="inbound-requester">요청자</Label>
            <Input id="inbound-requester" value={meta.requester} onChange={(event) => setMeta((current) => ({ ...current, requester: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inbound-date">전달 예정일</Label>
            <Input id="inbound-date" type="date" value={meta.deliveryDate} onChange={(event) => setMeta((current) => ({ ...current, deliveryDate: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inbound-note">비고</Label>
            <Input id="inbound-note" value={meta.note} onChange={(event) => setMeta((current) => ({ ...current, note: event.target.value }))} />
          </div>
        </div>

        <div className="max-h-[45vh] overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>{INBOUND_REQUEST_COLUMNS.map((head) => <th key={head} className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-center font-normal text-[var(--muted-foreground)]">{head}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((cells, index) => <tr key={items[index]?.key ?? index}>
                {cells.map((cell, at) => <td key={at} className={`max-w-40 truncate border-b border-[var(--border)] px-2 py-1.5 ${at <= 2 || at === 7 ? "font-mono" : ""} ${at === 6 ? "text-right tabular-nums" : ""}`} title={cell}>{cell}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          메일은 자동으로 보내지 않습니다. 메일로 작성을 누르면 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜹니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 확인한 뒤 보내세요. Rack No. 열은 창고팀이 채워 회신하도록 비워 둡니다.
        </p>
        {notice ? <p role="status" className={`text-xs leading-relaxed ${notice.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--chart-2)]"}`}>{notice.text}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        <Button type="button" size="sm" variant="outline" disabled={!items.length} onClick={() => void copyTable()}><Copy className="size-4" />표 복사</Button>
        <Button type="button" size="sm" disabled={!items.length || !recipients.length || editing} onClick={() => void makeMail()}><Mail className="size-4" />메일로 작성</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
