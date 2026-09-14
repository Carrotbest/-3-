import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { buildLinkHelperGroups, defaultLinkPairs, linkedLineIds, type HelperGroup, type HelperStatus } from "@/data/request-link"
import { ownerDisplayName, type DevRecord, type RequestStyle } from "@/data/schema"

interface RequestLinkHelperDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: readonly DevRecord[]
  requests: readonly RequestStyle[]
  editEnabled: boolean
  disabledMessage: string
  onLinkAuto: (groups: HelperGroup[]) => Promise<void>
  onReview: (group: HelperGroup) => void
}

const TABS: { key: HelperStatus; label: string }[] = [
  { key: "auto", label: "자동" },
  { key: "review", label: "확인 필요" },
  { key: "none", label: "후보 없음" },
]

const headCell = "sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-left text-xs font-normal text-[var(--muted-foreground)]"
const bodyCell = "border-b border-[var(--border)] px-2 py-1.5 align-top text-xs"

/** 요청 연결 도우미. 판정은 buildLinkHelperGroups, 짝은 defaultLinkPairs를 그대로 쓴다. */
export function RequestLinkHelperDialog({ open, onOpenChange, records, requests, editEnabled, disabledMessage, onLinkAuto, onReview }: RequestLinkHelperDialogProps) {
  const groups = useMemo(() => buildLinkHelperGroups(records, requests), [records, requests])
  const linked = useMemo(() => linkedLineIds(records), [records])
  const [tab, setTab] = useState<HelperStatus>("auto")
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab("auto")
    setUnchecked(new Set())
  }, [open])

  const byStatus = (status: HelperStatus) => groups.filter((group) => group.status === status)
  const autoGroups = byStatus("auto")
  const selected = autoGroups.filter((group) => !unchecked.has(group.styleKey))
  const selectedRows = selected.reduce((sum, group) => sum + group.rows.length, 0)
  const totalRows = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const allChecked = autoGroups.length > 0 && selected.length === autoGroups.length
  const shown = byStatus(tab)

  const toggle = (styleKey: string, checked: boolean) => setUnchecked((current) => {
    const next = new Set(current)
    if (checked) next.delete(styleKey); else next.add(styleKey)
    return next
  })

  const pairPreview = (group: HelperGroup) => {
    const style = group.candidates[0]
    if (!style) return ""
    const optionNo = new Map(style.options.map((option) => [option.optId, option.no]))
    return defaultLinkPairs(group.rows, style, linked)
      .map((pair) => {
        const row = group.rows.find((item) => `${item._src.sheet}::${item._src.row}` === pair.rowId)
        return `${row?.opt || "?"}→${pair.optId ? optionNo.get(pair.optId) : "-"}`
      })
      .join(", ")
  }

  const runAuto = async () => {
    if (!selected.length || busy) return
    setBusy(true)
    try {
      await onLinkAuto(selected)
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[94vw] max-w-5xl">
      <DialogHeader>
        <DialogTitle>요청 연결 도우미</DialogTitle>
        <DialogDescription>
          자동 {autoGroups.length} · 확인 필요 {byStatus("review").length} · 후보 없음 {byStatus("none").length} · 미연결 DD 행 {totalRows}
        </DialogDescription>
        <p className="text-xs text-[var(--warning)]">여러 행을 한 번에 연결합니다. 실행 전에 SETTING에서 JSON 백업을 내려받아 두세요.</p>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="연결 도우미 구분">
          {TABS.map((item) => <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs ${tab === item.key ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
          >
            {item.label}
            <Badge variant="secondary" className="h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums">{byStatus(item.key).length}</Badge>
          </button>)}
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
          {shown.length ? <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {tab === "auto" ? <th className={`${headCell} w-8`}><Checkbox aria-label="모두 선택" checked={allChecked} onCheckedChange={(checked) => setUnchecked(checked === true ? new Set() : new Set(autoGroups.map((group) => group.styleKey)))} /></th> : null}
                <th className={headCell}>Style No.</th>
                <th className={`${headCell} w-16`}>DD 행</th>
                {tab === "none" ? <th className={headCell}>담당</th> : <th className={headCell}>요청</th>}
                {tab === "auto" ? <th className={headCell}>짝 미리보기 (DD Opt→요청 Opt)</th> : null}
                {tab === "review" ? <th className={headCell}>사유</th> : null}
                {tab !== "auto" ? <th className={`${headCell} w-24`} /> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((group) => {
                const style = group.candidates[0]
                return <tr key={group.styleKey} className="hover:bg-[var(--accent)]">
                  {tab === "auto" ? <td className={bodyCell}><Checkbox aria-label={`${group.styleNo} 선택`} checked={!unchecked.has(group.styleKey)} onCheckedChange={(checked) => toggle(group.styleKey, checked === true)} /></td> : null}
                  <td className={`${bodyCell} font-mono`}>{group.styleNo}</td>
                  <td className={`${bodyCell} tabular-nums`}>{group.rows.length}</td>
                  {tab === "none"
                    ? <td className={bodyCell}>{ownerDisplayName(group.rows[0]?.owner ?? "") || "미지정"}</td>
                    : <td className={bodyCell}>{group.candidates.length === 1 && style ? `${style.chart || "차트 미기재"} · #${style.seq} · ${style.brand || "Brand 미기재"}` : `${group.candidates.length}개 후보`}</td>}
                  {tab === "auto" ? <td className={`${bodyCell} font-mono text-[11px] text-[var(--muted-foreground)]`}>{pairPreview(group)}</td> : null}
                  {tab === "review" ? <td className={bodyCell}>{group.reason}</td> : null}
                  {tab !== "auto" ? <td className={`${bodyCell} text-right`}>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!editEnabled} title={editEnabled ? undefined : disabledMessage} onClick={() => onReview(group)}>{tab === "review" ? "짝 확인…" : "직접 연결…"}</Button>
                  </td> : null}
                </tr>
              })}
            </tbody>
          </table> : <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">해당하는 스타일이 없습니다.</p>}
        </div>
      </DialogBody>
      <DialogFooter>
        {!editEnabled ? <span className="mr-auto text-xs text-[var(--muted-foreground)]">{disabledMessage}</span> : null}
        <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        {tab === "auto" ? <Button type="button" size="sm" disabled={!editEnabled || !selected.length || busy} onClick={() => void runAuto()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}선택 {selected.length}개 스타일 연결 ({selectedRows}행)
        </Button> : null}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
