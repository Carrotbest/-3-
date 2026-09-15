import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { resultOf, unresolvedStyles } from "@/data/request-board"
import type { RequestBoard, RequestResult, RequestStyle } from "@/data/schema"

export function RequestBoardCloseDialog({ open, board, styles, onConfirm, onOpenChange }: {
  open: boolean
  board: RequestBoard | null
  styles: readonly RequestStyle[]
  onConfirm: (value: { memo: string; fillResult?: Exclude<RequestResult, "진행중"> }) => void
  onOpenChange: (open: boolean) => void
}) {
  const [memo, setMemo] = useState("")
  const [fillResult, setFillResult] = useState<Exclude<RequestResult, "진행중"> | undefined>()
  useEffect(() => { if (open) { setMemo(""); setFillResult(undefined) } }, [open])
  const unresolved = useMemo(() => unresolvedStyles(styles), [styles])
  const counts = Object.fromEntries(["진행중", "완료", "드롭", "보류"].map((result) => [result, styles.filter((style) => resultOf(style) === result).length]))
  if (!board) return null
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-lg">
      <DialogHeader><DialogTitle>{board.name} 종결</DialogTitle></DialogHeader>
      <DialogBody className="grid gap-4">
        <div className="flex flex-wrap gap-1">{Object.entries(counts).map(([result, count]) => <Badge key={result} variant="secondary">{result} {count}</Badge>)}</div>
        {unresolved.length ? <div className="grid gap-2 rounded-[var(--radius)] border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-3 text-xs"><strong>결과가 정해지지 않은 스타일 {unresolved.length}건이 있습니다.</strong><p>{unresolved.slice(0, 8).map((style) => style.garmentNo || "이름 없음").join(", ")}{unresolved.length > 8 ? ` 외 ${unresolved.length - 8}건` : ""}</p><Select value={fillResult} onValueChange={(value) => setFillResult(value as Exclude<RequestResult, "진행중">)}><SelectTrigger><SelectValue placeholder={`남은 ${unresolved.length}건을 이 결과로 정리`} /></SelectTrigger><SelectContent>{["완료", "드롭", "보류"].map((result) => <SelectItem key={result} value={result}>{result}</SelectItem>)}</SelectContent></Select></div> : null}
        <label className="grid gap-1 text-xs">종결 메모<textarea className="min-h-20 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-2 text-sm" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
        <p className="text-xs text-[var(--muted-foreground)]">종결하면 보드가 탭에서 빠지고 지금 상태가 보관함에 기록으로 고정됩니다. 보드를 만든 사람과 소유자는 보관함에서 다시 열 수 있습니다.</p>
      </DialogBody>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="button" disabled={Boolean(unresolved.length && !fillResult)} onClick={() => onConfirm({ memo, fillResult })}>종결</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
