import { useEffect, useState } from "react"
import { Copy, Mail } from "lucide-react"

import { MailRecipientsField } from "@/components/warehouse/MailRecipientsField"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { storageNoLabel, type FabricLedgerItem } from "@/data/fabric-ledger"
import { composeMail, copyMailTable, fileDateStamp, type MailAddress } from "@/data/mail-draft"
import {
  OUTBOUND_REQUEST_COLUMNS,
  outboundRequestLines,
  outboundRequestRows,
  outboundRequestSubject,
  stockYds,
  type OutboundRequestLine,
  type OutboundRequestMeta,
} from "@/data/outbound-request-mail"
import { buildOutboundCard, notifyTeams } from "@/data/teams-notify"

interface OutboundRequestMailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly FabricLedgerItem[]
  defaultRequester: string
  /** 로그인한 사람의 부서. 창을 열 때 부서 칸에 채우고 사람이 고칠 수 있다 */
  defaultDivision: string
}

/** 오늘 날짜(yyyy-mm-dd). toISOString은 UTC라 한국 시간 오전 9시 전에 어제로 나온다. 현지 날짜로 만든다. */
const todayValue = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const EMPTY_META: OutboundRequestMeta = { division: "", requester: "", wantedDate: "" }

/** 창고보관 원단의 컷팅·출고 요청 메일 초안. 메일은 사람이 Outlook에서 받는 사람을 넣고 보낸다(C형). */
export function OutboundRequestMailDialog({ open, onOpenChange, items, defaultRequester, defaultDivision }: OutboundRequestMailDialogProps) {
  const [meta, setMeta] = useState<OutboundRequestMeta>(EMPTY_META)
  const [lines, setLines] = useState<Record<string, { qty: string; note: string }>>({})
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [recipientsEditing, setRecipientsEditing] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [teamsNotice, setTeamsNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setMeta({ ...EMPTY_META, division: defaultDivision, requester: defaultRequester, wantedDate: todayValue() })
    setLines(Object.fromEntries(items.map((item) => [item.key, { qty: "", note: "" }])))
    setNotice(null)
    setTeamsNotice(null)
    // 창을 열 때 한 번만 초기화한다. 열린 동안 선택이 바뀌어도 입력을 지우지 않는다.
  }, [open])

  const requestLines: OutboundRequestLine[] = items.map((item) => ({ item, qty: lines[item.key]?.qty ?? "", note: lines[item.key]?.note ?? "" }))
  const qtyError = (line: OutboundRequestLine): string | null => {
    const raw = line.qty.trim()
    if (!raw) return "수량 입력"
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return "숫자 확인"
    return null
  }
  const overStock = (line: OutboundRequestLine): boolean => {
    const stock = stockYds(line.item)
    const value = Number(line.qty.trim())
    return stock !== null && Number.isFinite(value) && value > stock
  }
  const invalid = requestLines.some((line) => qtyError(line) !== null)

  const setLine = (key: string, patch: Partial<{ qty: string; note: string }>) =>
    setLines((current) => ({ ...current, [key]: { qty: current[key]?.qty ?? "", note: current[key]?.note ?? "", ...patch } }))

  const copyTable = async () => {
    if (invalid) { setNotice({ kind: "error", text: "요청 수량을 모두 입력하세요." }); return }
    try {
      const mode = await copyMailTable(OUTBOUND_REQUEST_COLUMNS, outboundRequestRows(requestLines))
      setNotice({ kind: "ok", text: mode === "html" ? "표를 복사했습니다. 메일 본문에 붙여넣으세요." : "표를 서식 없이 복사했습니다." })
    } catch {
      setNotice({ kind: "error", text: "복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하세요." })
    }
  }

  const makeMail = async () => {
    setTeamsNotice(null)
    if (invalid) { setNotice({ kind: "error", text: "요청 수량을 모두 입력하세요." }); return }
    const mode = await composeMail({
      fileName: `원단출고요청_${fileDateStamp()}.eml`,
      subject: outboundRequestSubject(requestLines),
      to: recipients,
      lines: outboundRequestLines(meta, requestLines),
      columns: OUTBOUND_REQUEST_COLUMNS,
      rows: outboundRequestRows(requestLines),
    })
    setNotice(mode === "mailto"
      ? { kind: "ok", text: "Outlook 새 메일 창을 열었습니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 보내세요. 서명은 그대로 남습니다." }
      : { kind: "ok", text: "클립보드 복사에 실패해 .eml 파일을 내려받았습니다. 파일을 열면 표까지 채워진 새 메일이 뜹니다(서명 없음)." })
  }

  const sendTeamsNotice = async () => {
    setTeamsNotice(null)
    if (invalid) { setTeamsNotice({ kind: "error", text: "요청 수량을 모두 입력하세요." }); return }
    try {
      const result = await notifyTeams(buildOutboundCard({ meta, lines: requestLines }))
      setTeamsNotice(result === "sent"
        ? { kind: "ok", text: "Teams 알림을 보냈습니다." }
        : { kind: "ok", text: "Teams 알림 주소가 없어 알림은 보내지 않았습니다." })
    } catch {
      setTeamsNotice({ kind: "error", text: "Teams 알림을 보내지 못했습니다." })
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[94vw] max-w-4xl">
      <DialogHeader>
        <DialogTitle>출고 요청 메일</DialogTitle>
        <DialogDescription>선택한 원단 {items.length}건의 컷팅·출고 요청 메일을 만듭니다. 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜨고, 본문은 클립보드에 담아 둡니다.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <MailRecipientsField open={open} onRecipientsChange={setRecipients} onEditingChange={setRecipientsEditing} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-division">부서</Label>
            <Input id="outbound-division" value={meta.division} onChange={(event) => setMeta((current) => ({ ...current, division: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-requester">요청자</Label>
            <Input id="outbound-requester" value={meta.requester} onChange={(event) => setMeta((current) => ({ ...current, requester: event.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="outbound-date">희망 컷팅일</Label>
            <Input id="outbound-date" type="date" value={meta.wantedDate} onChange={(event) => setMeta((current) => ({ ...current, wantedDate: event.target.value }))} />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {OUTBOUND_REQUEST_COLUMNS.map((head) => <th key={head} className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-center font-normal text-[var(--muted-foreground)]">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {requestLines.map((line) => {
                const stock = stockYds(line.item)
                const error = qtyError(line)
                return <tr key={line.item.key}>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{storageNoLabel(line.item)}</td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{line.item.rackNo ?? ""}</td>
                  <td className="w-24 border-b border-[var(--border)] px-2 py-1">
                    <Input aria-label={`${line.item.storageNo} 요청 수량`} inputMode="decimal" value={line.qty} onChange={(event) => setLine(line.item.key, { qty: event.target.value })} className={`h-7 text-right text-xs ${error && line.qty ? "border-[var(--destructive)]" : ""}`} />
                    {overStock(line) ? <p className="mt-0.5 text-[10px] text-[var(--warning)]">재고 초과</p> : null}
                  </td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 text-right tabular-nums">{stock === null ? "" : stock.toLocaleString("ko-KR")}</td>
                  <td className="border-b border-[var(--border)] px-2 py-1.5 font-mono">{line.item.flNo}</td>
                  <td className="max-w-40 truncate border-b border-[var(--border)] px-2 py-1.5" title={line.item.construction}>{line.item.construction}</td>
                  <td className="w-40 border-b border-[var(--border)] px-2 py-1">
                    <Input aria-label={`${line.item.storageNo} 비고`} value={line.note} onChange={(event) => setLine(line.item.key, { note: event.target.value })} className="h-7 text-xs" />
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          메일은 자동으로 보내지 않습니다. 메일로 작성을 누르면 받는 사람과 제목이 채워진 Outlook 새 메일 창이 뜹니다. 본문 첫 줄에 Ctrl+V로 붙여넣고 확인한 뒤 보내세요. 실제 출고 기록은 정산관리팀 컷팅 회신 뒤 기존 출고 버튼으로 남깁니다.
        </p>
        {notice ? <p role="status" className={`text-xs leading-relaxed ${notice.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--chart-2)]"}`}>{notice.text}</p> : null}
        {teamsNotice ? <p role="status" className={`text-xs leading-relaxed ${teamsNotice.kind === "error" ? "text-[var(--warning)]" : "text-[var(--chart-2)]"}`}>{teamsNotice.text}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        <Button type="button" size="sm" variant="outline" disabled={!items.length} onClick={() => void copyTable()}><Copy className="size-4" />표 복사</Button>
        <Button type="button" size="sm" variant="outline" disabled={!items.length || recipientsEditing} onClick={() => void makeMail()}><Mail className="size-4" />메일로 작성</Button>
        <Button type="button" size="sm" disabled={!items.length} onClick={() => void sendTeamsNotice()}>Teams 알림 보내기</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
