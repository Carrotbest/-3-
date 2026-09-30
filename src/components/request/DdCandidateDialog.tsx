import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MATCH_MIN_SCORE, scoreRowForOption } from "@/data/request-link-match"
import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"

interface DdCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  style: RequestStyle | null
  option: RequestOption | null
  records: readonly DevRecord[]
  /** DD MASTER 편집 권한. 없으면 후보만 보고 연결은 못 한다. */
  canLink: boolean
  onConfirm: (record: DevRecord, fillEmpty: boolean) => void
}

const identity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`
const text = (value: unknown): string => String(value ?? "").trim()
/** 검색어 없이 열었을 때 보여 줄 최대 후보 수. 검색하면 전체에서 다시 찾는다. */
const LIMIT = 60

export function DdCandidateDialog({ open, onOpenChange, style, option, records, canLink, onConfirm }: DdCandidateDialogProps) {
  const [query, setQuery] = useState("")
  const [unlinkedOnly, setUnlinkedOnly] = useState(true)
  const [fillEmpty, setFillEmpty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setUnlinkedOnly(true)
    setFillEmpty(false)
    setSelectedId(null)
  }, [open])

  const matches = useMemo(() => {
    if (!style || !option) return []
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    return records
      .filter((record) => !needle || [record.styleNo, record.color, record.dyeing, record.owner, record.buyer, record.flNo, record.tech?.yarnDetail]
        .some((value) => text(value).toLocaleLowerCase("ko-KR").includes(needle)))
      .map((record) => scoreRowForOption(record, style, option))
      .filter((match) => !unlinkedOnly || !match.linkedElsewhere)
      // 검색어가 없으면 점수가 붙은 후보만 보인다. DD 행 전체를 펼쳐 놓으면 고르기 어렵다.
      .filter((match) => Boolean(needle) || match.score >= MATCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score || text(a.record.styleNo).localeCompare(text(b.record.styleNo), "en", { numeric: true }))
      .slice(0, LIMIT)
  }, [option, query, records, style, unlinkedOnly])

  const selected = matches.find((match) => identity(match.record) === selectedId)

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[92vw] max-w-3xl">
      <DialogHeader>
        <DialogTitle>DD 후보에서 연결</DialogTitle>
        <DialogDescription>
          {style && option
            ? `${style.garmentNo || "Garment No. 미기입"} · Opt ${option.no} · ${option.color || "색 미기입"} · ${option.yarnDetail || "Yarn Detail 미기입"}`
            : "연결할 옵션이 없습니다."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 min-w-0 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Style No. · Color · Yarn Detail · 담당 · FL# 검색" />
          <Button type="button" size="sm" variant={unlinkedOnly ? "default" : "outline"} onClick={() => setUnlinkedOnly((value) => !value)}>미연결 행만</Button>
        </div>
        <p className="text-[11px] text-[var(--muted-foreground)]">검색어가 없으면 {MATCH_MIN_SCORE}점 이상 후보만 보입니다. 찾는 행이 없으면 검색하세요.</p>
        <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-1">
          {matches.map(({ record, score, reasons, linkedElsewhere }) => {
            const key = identity(record)
            return <button key={key} type="button" className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left ${selectedId === key ? "border-[var(--primary)] bg-[var(--accent)]" : "border-transparent hover:bg-[var(--muted)]/60"}`} onClick={() => setSelectedId(key)}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="font-mono text-[13px]">{record.styleNo || "Style No. 미기입"}</strong>
                  <span className="text-[11px] text-[var(--muted-foreground)]">Opt {record.opt || "-"} · {record.color || "색 미기입"} · {record.dyeing || "염색 미기입"}</span>
                  <Badge variant="outline" className="tabular-nums text-[10px]">{score}점</Badge>
                  {linkedElsewhere ? <Badge variant="outline" className="text-[10px] text-[var(--warning)]">다른 요청에 연결됨</Badge> : null}
                </span>
                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{record.tech?.yarnDetail || "Yarn Detail 미기입"}</span>
                <span className="block truncate text-[11px] text-[var(--muted-foreground)]">담당 {record.owner || "미지정"} · {record.devStatus || "상태 미기입"}{record.flNo ? ` · ${record.flNo}` : ""}{reasons.length ? ` · ${reasons.slice(0, 3).join(" · ")}` : ""}</span>
              </span>
            </button>
          })}
          {!matches.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query.trim() ? "검색에 맞는 DD 행이 없습니다." : "점수가 붙는 후보가 없습니다. 검색해서 찾으세요."}</p> : null}
        </div>
        <label className="flex items-start gap-2 text-xs"><Checkbox checked={fillEmpty} onCheckedChange={(checked) => setFillEmpty(checked === true)} /><span>DD 행의 비어 있는 칸만 요청 값으로 채우기(Buyer·Planner·Color·Dyeing·Remark·Yarn Detail)</span></label>
        {selected?.linkedElsewhere ? <p className="text-xs text-[var(--warning)]">이 행은 다른 요청 옵션에 연결되어 있습니다. 연결하면 그 연결은 이 옵션으로 옮겨갑니다.</p> : null}
      </DialogBody>
      <DialogFooter className="justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{canLink ? `후보 ${matches.length}건` : "DD MASTER 편집 권한이 없어 연결할 수 없습니다."}</span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="button" size="sm" disabled={!canLink || !selected} onClick={() => { if (selected) onConfirm(selected.record, fillEmpty) }}>{selected?.linkedElsewhere ? "연결 옮기기" : "이 행에 연결"}</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
