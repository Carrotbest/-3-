import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { linkedLineIds } from "@/data/request-link"
import { MATCH_MIN_SCORE, scoreStyleForRows } from "@/data/request-link-match"
import { styleRemarkText, type DevRecord, type RequestBoard, type RequestOption, type RequestStyle } from "@/data/schema"

interface RequestBrowseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 연결 대상 DD 행 하나. */
  row: DevRecord | null
  requests: readonly RequestStyle[]
  boards: readonly RequestBoard[]
  records: readonly DevRecord[]
  onConfirm: (style: RequestStyle, option: RequestOption, fillEmpty: boolean) => void
}

/** boardId가 없는 이관 전 스타일을 담는 가짜 폴더 키. */
const NO_BOARD = "__noboard__"
type FolderStatus = "진행" | "이관" | "종결"
const STATUS_RANK: Record<FolderStatus, number> = { 진행: 0, 이관: 1, 종결: 2 }

interface FolderStyle { style: RequestStyle; score: number; reasons: string[]; free: number }
interface FolderNode { key: string; name: string; note: string; status: FolderStatus; order: number; styles: FolderStyle[] }

const text = (value: unknown): string => String(value ?? "").trim()
const hay = (...values: unknown[]): string => values.map((value) => text(value).toLocaleLowerCase("ko-KR")).join(" ")

export function RequestBrowseDialog({ open, onOpenChange, row, requests, boards, records, onConfirm }: RequestBrowseDialogProps) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [expandedStyles, setExpandedStyles] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<{ reqId: string; optId: string } | null>(null)
  const [fillEmpty, setFillEmpty] = useState(false)

  // 다른 DD 행이 이미 쓰고 있는 옵션만 막는다. 이 행이 지금 쓰고 있는 옵션은 다시 고를 수 있어야 한다.
  const blocked = useMemo(() => {
    const all = linkedLineIds(records)
    const own = row?.tech?.requestLink?.lineId
    if (own) all.delete(own)
    return all
  }, [records, row])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setFillEmpty(false)
    const link = row?.tech?.requestLink
    const current = link ? requests.find((style) => style.reqId === link.reqId) : undefined
    const currentOption = current?.options.find((option) => option.lineId === link?.lineId)
    // 이미 연결된 행이면 그 폴더와 스타일을 펼치고 그 옵션을 골라 둔다.
    setExpanded(new Set(current ? [current.boardId ?? NO_BOARD] : []))
    setExpandedStyles(new Set(current ? [current.reqId] : []))
    setSelected(current && currentOption ? { reqId: current.reqId, optId: currentOption.optId } : null)
  }, [open, requests, row])

  const folders = useMemo<FolderNode[]>(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    const byBoard = new Map<string, FolderNode>()
    boards.forEach((board) => byBoard.set(board.boardId, {
      key: board.boardId, name: board.name || "이름 없는 보드",
      note: [board.kind, board.team].filter(Boolean).join(" · "),
      status: board.status === "종결" ? "종결" : "진행", order: board.order, styles: [],
    }))
    byBoard.set(NO_BOARD, { key: NO_BOARD, name: "보드 없음(이관 전)", note: "", status: "이관", order: 9999, styles: [] })
    requests.forEach((style) => {
      const optionHit = Boolean(needle) && style.options.some((option) => hay(option.yarnDetail, option.color, option.dyeingMethod).includes(needle))
      const remarkHit = Boolean(needle) && hay(styleRemarkText(style)).includes(needle)
      if (needle && !optionHit && !remarkHit && !hay(style.garmentNo, style.brand, style.chart, style.developer, style.requester).includes(needle)) return
      const match = scoreStyleForRows(style, row?.styleNo ?? "", row ? [row] : [], blocked)
      const folder = byBoard.get(style.boardId ?? NO_BOARD) ?? byBoard.get(NO_BOARD)!
      folder.styles.push({ style, score: match.score, reasons: match.reasons, free: match.unlinked })
    })
    return [...byBoard.values()]
      .filter((folder) => folder.styles.length)
      .map((folder) => ({
        ...folder,
        styles: [...folder.styles].sort((a, b) => a.style.seq - b.style.seq
          || a.style.garmentNo.localeCompare(b.style.garmentNo, "en", { numeric: true })),
      }))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.order - b.order || a.name.localeCompare(b.name, "ko-KR"))
  }, [blocked, boards, query, requests, row])

  const top = useMemo(() => folders.flatMap((folder) => folder.styles)
    .filter((item) => item.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5), [folders])

  const searching = Boolean(query.trim())
  const folderOpen = (key: string) => searching || expanded.has(key)
  const styleOpen = (reqId: string) => searching || expandedStyles.has(reqId)
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  }
  const jumpTo = (style: RequestStyle) => {
    setExpanded((current) => new Set([...current, style.boardId ?? NO_BOARD]))
    setExpandedStyles((current) => new Set([...current, style.reqId]))
  }

  const selectedStyle = selected ? requests.find((style) => style.reqId === selected.reqId) : undefined
  const selectedOption = selectedStyle?.options.find((option) => option.optId === selected?.optId)
  const totalStyles = folders.reduce((sum, folder) => sum + folder.styles.length, 0)

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-3xl">
      <DialogHeader>
        <DialogTitle>요청 폴더에서 찾아 연결</DialogTitle>
        <DialogDescription>
          {row
            ? `${row.styleNo || "Style No. 미기재"} · Opt ${row.opt || "-"} · ${row.color || "색 미기재"} · ${row.tech?.yarnDetail || "Yarn Detail 미기재"}`
            : "연결할 DD 행이 없습니다."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <Input className="h-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Garment No. · Brand · 차트 · 담당 · Yarn Detail · Color 검색" />
        {!searching && top.length ? <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--muted)]/40 p-2">
          <span className="text-[11px] text-[var(--muted-foreground)]">추천</span>
          {top.map((item) => <button key={item.style.reqId} type="button" className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] hover:bg-[var(--accent)]" onClick={() => jumpTo(item.style)}>
            <strong className="font-medium">{item.style.garmentNo || "Garment No. 미기재"}</strong>
            <span className="tabular-nums text-[var(--muted-foreground)]">{item.score}</span>
          </button>)}
        </div> : null}
        <div className="max-h-[56vh] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]">
          {folders.map((folder) => <div key={folder.key} className="border-b border-[var(--border)]/60 last:border-b-0">
            <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--muted)]/50" onClick={() => setExpanded((current) => toggle(current, folder.key))}>
              {folderOpen(folder.key) ? <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />}
              {folderOpen(folder.key) ? <FolderOpen className="size-4 shrink-0 text-[var(--muted-foreground)]" /> : <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{folder.name}</span>{folder.note ? <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{folder.note}</span> : null}</span>
              {folder.status !== "진행" ? <Badge variant="outline" className="shrink-0 text-[10px]">{folder.status}</Badge> : null}
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">스타일 {folder.styles.length}</span>
            </button>
            {folderOpen(folder.key) ? <div className="pl-6">
              {folder.styles.map(({ style, score, reasons, free }) => <div key={style.reqId} className="border-t border-[var(--border)]/50">
                <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--muted)]/50" onClick={() => setExpandedStyles((current) => toggle(current, style.reqId))}>
                  {styleOpen(style.reqId) ? <ChevronDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />}
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-[13px] font-medium">{style.garmentNo || "Garment No. 미기재"}</strong>{score >= MATCH_MIN_SCORE ? <Badge variant="outline" className="shrink-0 tabular-nums text-[10px]">{score}점</Badge> : null}</span><span className="block truncate text-[11px] text-[var(--muted-foreground)]">#{style.seq} · {style.brand || "Brand 미기재"} · 개발 {style.developer || "미지정"}{reasons.length ? ` · ${reasons.slice(0, 2).join(" · ")}` : ""}</span></span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">빈 옵션 {free}/{style.options.length}</span>
                </button>
                {styleOpen(style.reqId) ? <ul className="pb-1 pl-8 pr-2">
                  {style.options.map((option) => {
                    const isBlocked = Boolean(option.lineId && blocked.has(option.lineId))
                    const isSelected = selected?.reqId === style.reqId && selected.optId === option.optId
                    return <li key={option.optId}>
                      <button type="button" disabled={isBlocked} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-45 ${isSelected ? "bg-[var(--accent)]" : "hover:bg-[var(--muted)]/60"}`} onClick={() => setSelected({ reqId: style.reqId, optId: option.optId })}>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[12px]">Opt {option.no} · {option.color || "색 미기재"} · {option.dyeingMethod || "염색 미기재"}</span><span className="block truncate text-[11px] text-[var(--muted-foreground)]">{option.yarnDetail || "Yarn Detail 미기재"}{option.construction ? ` · ${option.construction}` : ""}{option.weight === "" || option.weight == null ? "" : ` · ${option.weight}g`}</span></span>
                        {isBlocked ? <Badge variant="outline" className="shrink-0 text-[10px]">다른 행 연결됨</Badge> : null}
                      </button>
                    </li>
                  })}
                </ul> : null}
              </div>)}
            </div> : null}
          </div>)}
          {!folders.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{searching ? "검색에 맞는 요청이 없습니다." : "요청 스타일이 없습니다."}</p> : null}
        </div>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={fillEmpty} onCheckedChange={(checked) => setFillEmpty(checked === true)} /><span>비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)</span></label>
      </DialogBody>
      <DialogFooter className="justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">
          {selectedStyle && selectedOption
            ? `선택: ${selectedStyle.garmentNo || "Garment No. 미기재"} · Opt ${selectedOption.no}`
            : `스타일 ${totalStyles}개`}
        </span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="button" size="sm" disabled={!row || !selectedStyle || !selectedOption} onClick={() => { if (selectedStyle && selectedOption) onConfirm(selectedStyle, selectedOption, fillEmpty) }}>이 옵션에 연결</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
