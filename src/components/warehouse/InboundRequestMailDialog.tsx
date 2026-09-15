import { useEffect, useState } from "react"
import { Copy, Mail, Plus, Settings2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/data/auth"
import type { FabricLedgerItem } from "@/data/fabric-ledger"
import { INBOUND_REQUEST_COLUMNS, inboundRequestHtml, inboundRequestRows, inboundRequestSubject, type InboundRequestMeta } from "@/data/inbound-request-mail"
import { buildEml, copyMailTable, downloadEml, EMAIL_PATTERN, fileDateStamp, type MailAddress } from "@/data/mail-draft"
import { loadInboundRecipients, saveInboundRecipients } from "@/data/mail-recipients"

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
  const isOwner = useAuthStore((state) => state.isOwner)
  const [meta, setMeta] = useState<InboundRequestMeta>({ requester: "", deliveryDate: "", note: "" })
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MailAddress[]>([])
  const [savingRecipients, setSavingRecipients] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setMeta({ requester: defaultRequester, deliveryDate: todayValue(), note: "" })
    setNotice(null)
    setEditing(false)
    setLoading(true)
    let cancelled = false
    loadInboundRecipients()
      .then((list) => { if (!cancelled) setRecipients(list) })
      .catch(() => { if (!cancelled) setNotice({ kind: "error", text: "수신자 목록을 불러오지 못했습니다. 네트워크를 확인하세요." }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // 창을 열 때 한 번만 초기화한다.
  }, [open])

  const startEdit = () => {
    setDraft(recipients.length ? recipients.map((entry) => ({ ...entry })) : [{ name: "", email: "" }])
    setEditing(true)
  }

  const saveDraft = async () => {
    const filled = draft.filter((entry) => entry.name.trim() || entry.email.trim())
    const bad = filled.find((entry) => !EMAIL_PATTERN.test(entry.email.trim()))
    if (bad) { setNotice({ kind: "error", text: `메일 주소를 확인하세요: ${bad.name || bad.email || "빈 칸"}` }); return }
    setSavingRecipients(true)
    try {
      setRecipients(await saveInboundRecipients(filled))
      setEditing(false)
      setNotice({ kind: "ok", text: "수신자를 저장했습니다. 팀 전체에 같은 목록이 적용됩니다." })
    } catch {
      setNotice({ kind: "error", text: "수신자 저장에 실패했습니다." })
    } finally {
      setSavingRecipients(false)
    }
  }

  const rows = inboundRequestRows(items)

  const copyTable = async () => {
    try {
      const mode = await copyMailTable(INBOUND_REQUEST_COLUMNS, rows)
      setNotice({ kind: "ok", text: mode === "html" ? "표를 복사했습니다. 메일 본문에 붙여넣으세요." : "표를 서식 없이 복사했습니다." })
    } catch {
      setNotice({ kind: "error", text: "복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하세요." })
    }
  }

  const makeMail = () => {
    if (!recipients.length) { setNotice({ kind: "error", text: "수신자가 등록되어 있지 않습니다." }); return }
    const eml = buildEml({ to: recipients, subject: inboundRequestSubject(items), html: inboundRequestHtml(meta, items) })
    downloadEml(`원단입고요청_${fileDateStamp()}.eml`, eml)
    setNotice({ kind: "ok", text: "메일 파일을 내려받았습니다. 브라우저 아래나 다운로드 목록에서 파일을 열면 Outlook 새 메일 창이 뜹니다. 내용을 확인하고 보내세요." })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[94vw] max-w-4xl">
      <DialogHeader>
        <DialogTitle>입고 요청 메일</DialogTitle>
        <DialogDescription>입고 등록한 원단 {items.length}건의 입고 요청 메일을 만듭니다. 표는 본문에 들어가고 받는 사람은 정해진 목록으로 채웁니다.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">받는 사람</p>
            {isOwner && !editing ? <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={startEdit}><Settings2 className="size-3.5" />수신자 편집</Button> : null}
          </div>
          {editing ? <div className="space-y-1.5">
            {draft.map((entry, index) => <div key={index} className="grid grid-cols-[10rem_minmax(0,1fr)_auto] items-center gap-2">
              <Input aria-label={`수신자 ${index + 1} 이름`} placeholder="이름 또는 팀" className="h-8 text-xs" value={entry.name} onChange={(event) => setDraft((current) => current.map((row, at) => at === index ? { ...row, name: event.target.value } : row))} />
              <Input aria-label={`수신자 ${index + 1} 메일`} placeholder="메일 주소" className="h-8 font-mono text-xs" value={entry.email} onChange={(event) => setDraft((current) => current.map((row, at) => at === index ? { ...row, email: event.target.value } : row))} />
              <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`수신자 ${index + 1} 삭제`} onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}><X className="size-4" /></Button>
            </div>)}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft((current) => [...current, { name: "", email: "" }])}><Plus className="size-3.5" />추가</Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={savingRecipients} onClick={() => setEditing(false)}>취소</Button>
                <Button type="button" size="sm" className="h-7 text-xs" disabled={savingRecipients} onClick={() => void saveDraft()}>{savingRecipients ? "저장 중…" : "저장"}</Button>
              </div>
            </div>
          </div> : loading
            ? <p className="text-xs text-[var(--muted-foreground)]">불러오는 중…</p>
            : recipients.length
              ? <div className="flex flex-wrap gap-1.5">{recipients.map((entry) => <span key={entry.email} className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs" title={entry.email}>{entry.name || entry.email}</span>)}</div>
              : <p className="text-xs text-[var(--destructive)]">{isOwner ? "수신자가 없습니다. 수신자 편집에서 등록하세요." : "수신자가 등록되어 있지 않습니다. 소유자에게 등록을 요청하세요."}</p>}
        </div>

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
          메일은 자동으로 보내지 않습니다. Outlook 메일 만들기를 누르면 받는 사람, 제목, 표가 채워진 메일 파일을 내려받습니다. 파일을 열어 확인한 뒤 보내세요. Rack No. 열은 창고팀이 채워 회신하도록 비워 둡니다.
        </p>
        {notice ? <p role="status" className={`text-xs leading-relaxed ${notice.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--chart-2)]"}`}>{notice.text}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        <Button type="button" size="sm" variant="outline" disabled={!items.length} onClick={() => void copyTable()}><Copy className="size-4" />표 복사</Button>
        <Button type="button" size="sm" disabled={!items.length || !recipients.length || editing} onClick={makeMail}><Mail className="size-4" />Outlook 메일 만들기</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
