import { useEffect, useState } from "react"
import { Plus, Settings2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/data/auth"
import { EMAIL_PATTERN, type MailAddress } from "@/data/mail-draft"
import { loadWarehouseRecipients, saveWarehouseRecipients } from "@/data/mail-recipients"

interface MailRecipientsFieldProps {
  /** 대화상자 열림 상태. 열릴 때 한 번 불러온다 */
  open: boolean
  onRecipientsChange: (list: MailAddress[]) => void
  onEditingChange: (editing: boolean) => void
}

export function MailRecipientsField({ open, onRecipientsChange, onEditingChange }: MailRecipientsFieldProps) {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [recipients, setRecipients] = useState<MailAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MailAddress[]>([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setNotice(null)
    setEditing(false)
    setLoading(true)
    let cancelled = false
    loadWarehouseRecipients()
      .then((list) => {
        if (cancelled) return
        setRecipients(list)
        onRecipientsChange(list)
      })
      .catch(() => {
        if (cancelled) return
        setRecipients([])
        onRecipientsChange([])
        setNotice({ kind: "error", text: "수신자 목록을 불러오지 못했습니다. 네트워크를 확인하세요." })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // 창을 열 때 한 번만 초기화한다.
  }, [open])

  useEffect(() => {
    onEditingChange(editing)
  }, [editing, onEditingChange])

  const startEdit = () => {
    setDraft(recipients.length ? recipients.map((entry) => ({ ...entry })) : [{ name: "", email: "" }])
    setEditing(true)
  }

  const saveDraft = async () => {
    const filled = draft.filter((entry) => entry.name.trim() || entry.email.trim())
    const bad = filled.find((entry) => !EMAIL_PATTERN.test(entry.email.trim()))
    if (bad) { setNotice({ kind: "error", text: `메일 주소를 확인하세요: ${bad.name || bad.email || "빈 칸"}` }); return }
    setSaving(true)
    try {
      const list = await saveWarehouseRecipients(filled)
      setRecipients(list)
      onRecipientsChange(list)
      setEditing(false)
      setNotice({ kind: "ok", text: "수신자를 저장했습니다. 입고·출고 요청 메일에 같은 목록이 적용됩니다." })
    } catch {
      onRecipientsChange([])
      setNotice({ kind: "error", text: "수신자 저장에 실패했습니다." })
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
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
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => setEditing(false)}>취소</Button>
          <Button type="button" size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void saveDraft()}>{saving ? "저장 중…" : "저장"}</Button>
        </div>
      </div>
    </div> : loading
      ? <p className="text-xs text-[var(--muted-foreground)]">불러오는 중…</p>
      : recipients.length
        ? <div className="flex flex-wrap gap-1.5">{recipients.map((entry) => <span key={entry.email} className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs" title={entry.email}>{entry.name || entry.email}</span>)}</div>
        : <p className="text-xs text-[var(--destructive)]">{isOwner ? "수신자가 없습니다. 수신자 편집에서 등록하세요." : "수신자가 등록되어 있지 않습니다. 소유자에게 등록을 요청하세요."}</p>}
    {notice ? <p role="status" className={`text-xs leading-relaxed ${notice.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--chart-2)]"}`}>{notice.text}</p> : null}
  </div>
}
