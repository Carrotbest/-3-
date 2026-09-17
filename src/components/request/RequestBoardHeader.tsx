import { Archive, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { boardKindColor, resultOf } from "@/data/request-board"
import { PROCESS_STEP_ORDER, processStepColor, type ProcessStage } from "@/data/request-process-stage"
import type { RequestBoard, RequestOption, RequestStyle } from "@/data/schema"

export function RequestBoardHeader({ board, styles, stageOf, canManage, canDelete, onEdit, onCloseBoard, onDelete }: {
  board: RequestBoard; styles: readonly RequestStyle[]; stageOf: (option: RequestOption) => ProcessStage; canManage: boolean; canDelete: boolean; onEdit: () => void; onCloseBoard: () => void; onDelete: () => void
}) {
  const results = Object.fromEntries(["진행중", "완료", "드롭", "보류"].map((key) => [key, styles.filter((style) => resultOf(style) === key).length]))
  const stages = new Map<string, { label: string; count: number; color: string }>()
  styles.flatMap((style) => style.options).forEach((option) => {
    const stage = stageOf(option)
    const key = !stage.linked ? "waiting" : stage.halted ? `halted:${stage.halted}` : stage.steps[stage.currentIndex]?.key ?? "waiting"
    const label = !stage.linked ? "대기" : stage.halted ?? stage.label
    const color = !stage.linked ? "var(--muted)" : stage.halted === "보류" ? "var(--warning)" : stage.halted ? "var(--muted-foreground)" : processStepColor(key as (typeof PROCESS_STEP_ORDER)[number])
    const current = stages.get(key); stages.set(key, { label, color, count: (current?.count ?? 0) + 1 })
  })
  const ordered = [...PROCESS_STEP_ORDER.map((key) => stages.get(key)).filter(Boolean), stages.get("waiting"), stages.get("halted:보류"), stages.get("halted:드롭"), stages.get("halted:반려")].filter(Boolean) as { label: string; count: number; color: string }[]
  const total = ordered.reduce((sum, item) => sum + item.count, 0)
  const created = new Date(board.createdAt)
  return <div className="grid shrink-0 gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(280px,1.3fr)]">
    <div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate">{board.name}</strong><Badge variant="outline" style={{ borderColor: boardKindColor(board.kind), color: boardKindColor(board.kind) }}>{board.kind}</Badge></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{board.team || "소팀 미지정"} / 만든 사람 {board.createdByName} / {created.getMonth() + 1}/{created.getDate()}</div>{board.note ? <p className="mt-1 truncate text-xs">{board.note}</p> : null}</div>
    <div className="flex flex-wrap items-center gap-1">{Object.entries(results).map(([name, count]) => <Badge key={name} variant="secondary">{name} {count}</Badge>)}</div>
    <div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><div className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]">{ordered.map((item) => <span key={item.label} title={`${item.label} ${item.count}건`} style={{ width: `${total ? item.count / total * 100 : 0}%`, backgroundColor: item.color }} />)}</div><div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">{ordered.map((item) => <span key={item.label} className="text-[10px] text-[var(--muted-foreground)]"><i className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label} {item.count}</span>)}</div></div><div className="flex gap-1"><Button type="button" size="sm" variant="outline" disabled={!canManage} title={!canManage ? "보드를 만든 사람과 소유자만 고칠 수 있습니다." : undefined} onClick={onEdit}><Pencil className="size-3.5" />보드 정보</Button><Button type="button" size="sm" variant="outline" disabled={!canManage} title={!canManage ? "보드를 만든 사람과 소유자만 종결할 수 있습니다." : undefined} onClick={onCloseBoard}><Archive className="size-3.5" />보드 종결</Button>{canDelete ? <Button type="button" size="sm" variant="destructive" onClick={onDelete}><Trash2 className="size-3.5" />보드 삭제</Button> : null}</div></div>
  </div>
}
