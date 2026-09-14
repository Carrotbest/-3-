import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { defaultLinkPairs, linkedLineIds, requestCandidates, type LinkPair } from "@/data/request-link"
import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"

interface RequestPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requests: readonly RequestStyle[]
  records: readonly DevRecord[]
  styleNo: string
  initialReqId?: string
  mode?: "import" | "link"
  linkRows?: readonly DevRecord[]
  blockedLineIds?: ReadonlySet<string>
  onConfirm?: (style: RequestStyle, options: RequestOption[]) => void
  onConfirmLink?: (style: RequestStyle, pairs: LinkPair[], fillEmpty: boolean) => void
}

const EMPTY_ROWS: readonly DevRecord[] = []
const EMPTY_LINE_IDS: ReadonlySet<string> = new Set()

export function RequestPickerDialog({ open, onOpenChange, requests, records, styleNo, initialReqId, mode = "import", linkRows = EMPTY_ROWS, blockedLineIds = EMPTY_LINE_IDS, onConfirm, onConfirmLink }: RequestPickerDialogProps) {
  const [query, setQuery] = useState("")
  const [includeLinked, setIncludeLinked] = useState(false)
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(() => new Set())
  const [pairs, setPairs] = useState<LinkPair[]>([])
  const [fillEmpty, setFillEmpty] = useState(false)
  const linked = useMemo(() => linkedLineIds(records), [records])
  const candidates = useMemo(() => requestCandidates(requests, records, styleNo, query, includeLinked), [includeLinked, query, records, requests, styleNo])
  const selected = candidates.find(({ style }) => style.reqId === selectedReqId)?.style ?? requests.find((style) => style.reqId === selectedReqId)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setIncludeLinked(mode === "link")
    setSelectedReqId(initialReqId ?? null)
    setFillEmpty(false)
  }, [initialReqId, mode, open])

  useEffect(() => {
    if (!open || !selected) { setSelectedLineIds(new Set()); setPairs([]); return }
    if (mode === "link") setPairs(defaultLinkPairs(linkRows, selected, blockedLineIds))
    else setSelectedLineIds(new Set(selected.options.flatMap((option) => !option.lineId || !linked.has(option.lineId) ? [option.lineId ?? option.optId] : [])))
  }, [blockedLineIds, linked, linkRows, mode, open, selectedReqId])

  const available = selected?.options.filter((option) => !option.lineId || !linked.has(option.lineId)) ?? []
  const selectedOptions = selected?.options.filter((option) => selectedLineIds.has(option.lineId ?? option.optId)) ?? []
  const allSelected = available.length > 0 && available.every((option) => selectedLineIds.has(option.lineId ?? option.optId))
  const pairedCount = pairs.filter((pair) => pair.optId).length
  const toggleLine = (lineId: string, checked: boolean) => setSelectedLineIds((current) => {
    const next = new Set(current)
    if (checked) next.add(lineId); else next.delete(lineId)
    return next
  })
  const choosePair = (rowId: string, optId: string | null) => setPairs((current) => current.map((pair) => {
    if (pair.rowId === rowId) return { ...pair, optId }
    return optId && pair.optId === optId ? { ...pair, optId: null } : pair
  }))

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-4xl">
      <DialogHeader><DialogTitle>{mode === "link" ? `FABRIC REQUEST 연결 · ${linkRows.length}행` : "FABRIC REQUEST에서 불러오기"}</DialogTitle></DialogHeader>
      <DialogBody className="grid grid-cols-[1.1fr_1fr] gap-3">
        <section className="min-w-0 space-y-2">
          <Input className="h-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Garment No. · Brand · 차트 · 개발 담당 검색" />
          <Button type="button" size="sm" variant={includeLinked ? "default" : "outline"} onClick={() => setIncludeLinked((value) => !value)}>연결된 스타일도 보기</Button>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {candidates.map(({ style, total, unlinked, exact }) => <button key={style.reqId} type="button" className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left ${selected?.reqId === style.reqId ? "bg-[var(--accent)]" : "hover:bg-[var(--muted)]"}`} onClick={() => setSelectedReqId(style.reqId)}>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><strong className="truncate text-sm">{style.garmentNo || "Garment No. 미기재"}</strong>{exact ? <Badge className="shrink-0">같은 Style No.</Badge> : null}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{style.chart} · #{style.seq} · {style.brand} · 개발 {style.developer}</span></span>
              <span className="shrink-0 text-xs text-[var(--muted-foreground)]">미연결 {unlinked}/{total}</span>
            </button>)}
            {!candidates.length ? <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">조건에 맞는 요청이 없습니다.</p> : null}
          </div>
        </section>
        <section className="min-w-0 rounded-md border p-2.5">
          {selected && mode === "link" ? <>
            <p className="mb-2 border-b pb-2 text-sm font-medium">요청 옵션 {selected.options.length}개 · DD 행 {linkRows.length}개</p>
            {selected.options.length !== linkRows.length ? <p className="mb-2 text-xs text-[var(--destructive)]">개수가 달라 일부 행은 연결되지 않습니다</p> : null}
            <div className="max-h-[52vh] space-y-1 overflow-y-auto">
              {pairs.map((pair) => {
                const row = linkRows.find((item) => `${item._src.sheet}::${item._src.row}` === pair.rowId)
                return <div key={pair.rowId} className="grid grid-cols-[1fr_1fr] gap-2 rounded-md border p-2">
                  <span className="min-w-0"><span className="block truncate text-xs font-medium">Opt {row?.opt} · {row?.color} · {row?.dyeing}</span><span className="block truncate text-[11px] text-[var(--muted-foreground)]">{row?.tech?.yarnDetail || "Yarn Detail 미기재"}</span></span>
                  <select className="h-8 min-w-0 rounded-md border bg-[var(--card)] px-2 text-xs" value={pair.optId ?? ""} onChange={(event) => choosePair(pair.rowId, event.target.value || null)}>
                    <option value="">연결 안 함</option>
                    {selected.options.map((option) => { const blocked = Boolean(option.lineId && blockedLineIds.has(option.lineId)); return <option key={option.optId} value={option.optId} disabled={blocked}>Opt {option.no} · {option.color} · {option.dyeingMethod}{blocked ? " · 다른 행 연결됨" : ""}</option> })}
                  </select>
                </div>
              })}
            </div>
            <label className="mt-2 flex items-start gap-2 text-xs"><Checkbox checked={fillEmpty} onCheckedChange={(checked) => setFillEmpty(checked === true)} /><span>비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)</span></label>
          </> : selected ? <>
            <label className="mb-2 flex items-center gap-2 border-b pb-2 text-sm font-medium"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedLineIds(new Set(checked ? available.map((option) => option.lineId ?? option.optId) : []))} />모두 선택</label>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">{selected.options.map((option) => { const isLinked = Boolean(option.lineId && linked.has(option.lineId)); return <label key={option.lineId ?? option.optId} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--muted)]"><Checkbox disabled={isLinked} checked={selectedLineIds.has(option.lineId ?? option.optId)} onCheckedChange={(checked) => toggleLine(option.lineId ?? option.optId, checked === true)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">Opt {option.no} · {option.color} · {option.dyeingMethod}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{option.yarnDetail || "Yarn Detail 미기재"}</span></span>{isLinked ? <Badge variant="outline">연결됨</Badge> : null}</label> })}</div>
          </> : <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">왼쪽에서 스타일을 선택하세요.</p>}
        </section>
      </DialogBody>
      <DialogFooter><Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>{mode === "link" ? <Button type="button" size="sm" disabled={!selected || pairedCount === 0} onClick={() => selected && onConfirmLink?.(selected, pairs, fillEmpty)}>{pairedCount}행 연결</Button> : <Button type="button" size="sm" disabled={!selected || selectedOptions.length === 0} onClick={() => selected && onConfirm?.(selected, selectedOptions)}>{selectedOptions.length}건 불러오기</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>
}
