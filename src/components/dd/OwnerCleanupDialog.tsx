import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listActions } from "@/data/audit"
import { buildOwnerCleanupPlan, cleanupAuditWindow, mergeAuditActions, multiOwnerRecords, type OwnerCleanupRow } from "@/data/owner-cleanup"
import type { DevRecord } from "@/data/schema"

interface OwnerCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: readonly DevRecord[]
  /** 키 → { from: 계획이 본 담당, to: 바꿀 담당 }. 부르는 쪽이 저장한다. */
  onApply: (picks: Map<string, { from: string; to: string }>) => Promise<void>
}

const shortDateTime = (value: string): string => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function OwnerCleanupDialog({ open, onOpenChange, records, onApply }: OwnerCleanupDialogProps) {
  const [rows, setRows] = useState<OwnerCleanupRow[]>([])
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [picks, setPicks] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      const targets = multiOwnerRecords(records)
      setRows([])
      setChecked(new Set())
      setPicks(new Map())
      if (!targets.length) { setLoading(false); return }
      setLoading(true)
      const { from, to } = cleanupAuditWindow(targets)
      const [created, edited] = await Promise.all([
        // 접수한 때. 좁은 창이라 잘릴 일이 없다.
        listActions({ screen: "dd", from, to, max: 1000 }),
        // 접수 뒤 지금까지. 최신순이라 최근 편집이 들어온다.
        listActions({ screen: "dd", from, max: 1000 }),
      ])
      if (!active) return
      const plan = buildOwnerCleanupPlan(targets, mergeAuditActions(created, edited))
      setRows(plan)
      setChecked(new Set(plan.filter((row) => row.reason === "ok" && !row.conflict).map((row) => row.key)))
      setPicks(new Map(plan.flatMap((row) => row.proposed ? [[row.key, row.proposed] as const] : [])))
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [open])

  const selected = rows.filter((row) => checked.has(row.key) && picks.has(row.key))
  const selectable = rows.filter((row) => picks.has(row.key))
  const allSelected = selectable.length > 0 && selectable.every((row) => checked.has(row.key))
  const toggle = (key: string, value: boolean) => setChecked((current) => {
    const next = new Set(current)
    if (value) next.add(key); else next.delete(key)
    return next
  })
  const choose = (key: string, value: string) => {
    setPicks((current) => {
      const next = new Map(current)
      if (value) next.set(key, value); else next.delete(key)
      return next
    })
    toggle(key, Boolean(value))
  }
  const selectAll = (value: boolean) => setChecked(new Set(value ? selectable.map((row) => row.key) : []))
  /** 이 표에 나온 사람 전부. "모두 ○○로" 목록이다. */
  const everyone = [...new Set(rows.flatMap((row) => row.choices))].sort((a, b) => a.localeCompare(b, "ko-KR"))
  /**
   * 그 사람을 담당으로 고를 수 있는 행을 한 번에 그 사람으로 맞춘다(R433).
   * 담당 목록에 그 사람이 없는 행은 건드리지 않는다. 남의 행을 끌어오면 안 된다.
   */
  const setAllTo = (name: string) => {
    if (!name) return
    const hit = rows.filter((row) => row.choices.includes(name))
    if (!hit.length) return
    setPicks((current) => {
      const next = new Map(current)
      for (const row of hit) next.set(row.key, name)
      return next
    })
    setChecked((current) => {
      const next = new Set(current)
      for (const row of hit) next.add(row.key)
      return next
    })
  }
  const apply = async () => {
    const chosen = new Map(selected.map((row) => [row.key, { from: row.current, to: picks.get(row.key)! }]))
    if (!chosen.size) return
    setApplying(true)
    try {
      await onApply(chosen)
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[94vw] max-w-6xl">
      <DialogHeader>
        <DialogTitle>담당 묶음 정리</DialogTitle>
        <p className="text-sm text-[var(--muted-foreground)]">담당이 두 사람으로 적힌 행입니다. 접수자는 작업 이력에서 찾았습니다. 담당 칸만 바뀝니다.</p>
      </DialogHeader>
      <DialogBody>
        {loading ? <p className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted-foreground)]"><Loader2 className="size-4 animate-spin" />작업 이력을 읽는 중입니다.</p> : !rows.length ? <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">담당이 두 사람으로 적힌 행이 없습니다.</p> : <div className="max-h-[62vh] overflow-auto rounded-md border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-[var(--card)]">
              <tr className="border-b text-left">
                <th className="px-2 py-2"><label className="flex items-center gap-1.5 whitespace-nowrap"><Checkbox checked={allSelected} onCheckedChange={(value) => selectAll(value === true)} />모두 선택</label></th>
                <th className="px-2 py-2">Style No.</th><th className="px-2 py-2">Opt</th><th className="px-2 py-2">FL#</th><th className="px-2 py-2">현재 담당</th><th className="px-2 py-2">접수자</th><th className="px-2 py-2">접수 일시</th><th className="px-2 py-2">접수 뒤 편집</th><th className="px-2 py-2"><span className="flex items-center gap-2 whitespace-nowrap">바꿀 담당<select aria-label="바꿀 담당 일괄 지정" className="h-7 rounded-md border bg-[var(--card)] px-1.5 text-[11px] font-normal" value="" onChange={(event) => { setAllTo(event.target.value); event.target.value = "" }}><option value="">모두 …로</option>{everyone.map((name) => <option key={name} value={name}>모두 {name}로</option>)}</select></span></th>
              </tr>
            </thead>
            <tbody>{rows.map((row) => <tr key={row.key} className="border-b last:border-b-0">
              <td className="px-2 py-1.5"><Checkbox checked={checked.has(row.key)} disabled={!picks.has(row.key)} onCheckedChange={(value) => toggle(row.key, value === true)} /></td>
              <td className="px-2 py-1.5 font-medium">{row.styleNo}</td><td className="px-2 py-1.5 tabular-nums">{row.opt}</td><td className="px-2 py-1.5">{row.flNo}</td><td className="px-2 py-1.5">{row.current}</td>
              <td className="px-2 py-1.5">{row.creator ? <span className="flex items-center gap-1.5">{row.creator}{row.reason === "creator-outside" ? <Badge variant="outline">담당 밖</Badge> : null}</span> : <Badge variant="outline">기록 없음</Badge>}</td>
              <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{shortDateTime(row.at)}</td>
              <td className="px-2 py-1.5">{row.editors.length ? <><span className="flex items-center gap-1.5">{row.editors.join(" · ")}{row.conflict ? <Badge variant="outline">편집자 다름</Badge> : null}</span><span className="block text-[11px] text-[var(--muted-foreground)]">{shortDateTime(row.lastEditAt)}</span></> : <span className="text-[var(--muted-foreground)]">-</span>}</td>
              <td className="px-2 py-1.5"><select className="h-8 min-w-32 rounded-md border bg-[var(--card)] px-2 text-xs" value={picks.get(row.key) ?? ""} onChange={(event) => choose(row.key, event.target.value)}><option value="">— 고르세요 —</option>{row.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </DialogBody>
      <DialogFooter><span className="mr-auto text-xs text-[var(--muted-foreground)]">전체 {rows.length}행 · 바꿀 {selected.length}행{rows.length - selectable.length ? ` · 못 정한 ${rows.length - selectable.length}행` : ""}</span><Button type="button" size="sm" variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>취소</Button><Button type="button" size="sm" disabled={applying || selected.length === 0} onClick={() => void apply()}>{applying ? <Loader2 className="size-4 animate-spin" /> : null}{selected.length}행 담당 바꾸기</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
