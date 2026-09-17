import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { RequestBoard } from "@/data/schema"

export function BoardDeleteDialog({ open, board, styleCount, optionCount, linkedCount, onConfirm, onOpenChange }: {
  open: boolean
  board: RequestBoard | null
  styleCount: number
  optionCount: number
  linkedCount: number
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState("")
  useEffect(() => { if (open) setName("") }, [open, board?.boardId])
  const confirmed = Boolean(board && name.trim() === board.name.trim())

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>보드 삭제</DialogTitle></DialogHeader><DialogBody className="grid gap-4 text-sm">
    <div className="rounded border border-[var(--border)] bg-[var(--muted)]/40 p-3">
      <strong>{board?.name ?? ""}</strong>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">스타일 {styleCount}건 · 옵션 {optionCount}건 · DD MASTER 연결 옵션 {linkedCount}건</p>
    </div>
    <div className="grid gap-1 text-[var(--destructive)]"><p>스타일과 옵션이 함께 삭제되며 되돌릴 수 없습니다.</p><p>DD MASTER 행은 지워지지 않습니다. 연결 표시만 REQ?로 바뀝니다.</p><p>보관함에 남은 종결 기록은 지워지지 않습니다.</p></div>
    <label className="grid gap-1 text-xs">확인을 위해 보드 이름을 입력하세요<Input value={name} onChange={(event) => setName(event.target.value)} placeholder={board?.name ?? ""} autoFocus /></label>
  </DialogBody><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="button" variant="destructive" disabled={!confirmed} onClick={onConfirm}>삭제</Button></DialogFooter></DialogContent></Dialog>
}
