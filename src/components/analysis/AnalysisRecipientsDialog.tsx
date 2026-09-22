import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { EMAIL_PATTERN, type MailAddress } from "@/data/mail-draft"
import { loadAnalysisRecipients, saveAnalysisRecipients } from "@/data/mail-recipients"

export function AnalysisRecipientsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<MailAddress[]>([])
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNotice("")
    loadAnalysisRecipients().then((list) => setRows(list.length ? list : [{ name: "", email: "" }])).catch(() => setNotice("받는 사람 목록을 불러오지 못했습니다."))
  }, [open])

  const save = async () => {
    const filled = rows.map((row) => ({ name: row.name.trim(), email: row.email.trim() })).filter((row) => row.name || row.email)
    if (filled.some((row) => !EMAIL_PATTERN.test(row.email))) { setNotice("메일 주소 형식을 확인하세요."); return }
    setSaving(true)
    try { setRows(await saveAnalysisRecipients(filled)); setNotice("받는 사람 목록을 저장했습니다.") }
    catch { setNotice("받는 사람 저장에 실패했습니다.") }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>분석 받는 사람</DialogTitle><DialogDescription>의뢰 메일 수신자와 완료 메일 참조에 사용합니다.</DialogDescription></DialogHeader>
      <DialogBody className="space-y-3">
        {rows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <Input value={row.name} placeholder="이름" onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
          <Input type="email" value={row.email} placeholder="메일 주소" onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} />
          <Button type="button" variant="ghost" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>삭제</Button>
        </div>)}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((current) => [...current, { name: "", email: "" }])}>받는 사람 추가</Button>
        {notice ? <p className="text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
      </DialogBody>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button><Button type="button" disabled={saving} onClick={() => void save()}>저장</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
