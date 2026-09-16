import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { Download, Loader2, PackageOpen, Plus, Scissors, Send, Sparkles, Trash2, Undo2, Upload } from "lucide-react"
import * as XLSX from "xlsx"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { applyKeepList, applyListMarks, applyRddaUsage, buildDisposalItems, buildDisposalWorkbook, DISPOSAL_REASONS, disposalEvent, disposalSummary, disposalWorkbookFileName, formatMeetingPickup, isActiveItem, isCut, isFinalDispose, isKept, itemVerdict, parseMeetingPickup, type DisposalActor, type DisposalCompletionEntry, type DisposalMarkTarget, type DisposalReason } from "@/data/disposal-round"
import { storageNumberOf, type FabricLedgerItem } from "@/data/fabric-ledger"
import { parseRddaFlList, parseRddaUsage } from "@/data/rdda-files"
import type { DisposalItem, DisposalRound } from "@/data/schema"
import { downloadBlob } from "@/data/dd-export"

interface Props {
  ledger: readonly FabricLedgerItem[]
  sequenceStart: number
  rounds: DisposalRound[]
  actor: DisposalActor
  canWrite: boolean
  isOwner: boolean
  onSave: (rounds: DisposalRound[]) => void
  /** 최종 확정에서 이력으로 옮긴다. 옮긴 건수를 돌려준다. */
  onCompleteDisposal: (entries: ReadonlyArray<DisposalCompletionEntry>, reason: string) => Promise<number>
}

type Filter = "전체" | "보관" | "폐기" | "컷팅" | "제외"
const filters: Filter[] = ["전체", "보관", "폐기", "컷팅", "제외"]
const markTargets: DisposalMarkTarget[] = ["보관", "Cutting"]
const today = () => new Date().toISOString().slice(0, 10)
const defaultTitle = () => `${today().slice(2, 4)}.${today().slice(5, 7)} 폐기`
const numberOf = (item: DisposalItem) => Number(item.storageNo.trim().match(/^\d{1,4}(?!\d)/)?.[0] ?? 0)

export function DisposalRoundPanel({ ledger, sequenceStart, rounds, actor, canWrite, isOwner, onSave, onCompleteDisposal }: Props) {
  const ordered = useMemo(() => [...rounds].sort((a, b) => Number(a.status === "완료") - Number(b.status === "완료") || b.createdAt.localeCompare(a.createdAt)), [rounds])
  const [selectedId, setSelectedId] = useState(rounds.find((round) => round.status !== "완료")?.roundId ?? rounds[0]?.roundId ?? "")
  const selected = rounds.find((round) => round.roundId === selectedId)
  // 검토는 1팀 판정 단계, 창고 전달은 창고팀 실물 작업 단계다.
  // 라운드 자체(제목·범위·파일·제외)는 검토에서만 고치고, 판정·컷팅·메모는 창고 전달에서도 고친다.
  // 실물이 없거나 재고가 달라 창고팀이 판정을 되돌리는 일이 있어서다. 완료는 전부 읽기 전용이다.
  const editable = !!selected && selected.status === "검토" && canWrite
  const verdictEditable = !!selected && (selected.status === "검토" || selected.status === "창고 전달") && canWrite
  const [createOpen, setCreateOpen] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [draft, setDraft] = useState({ title: defaultTitle(), requestedAt: today(), from: "", to: "", note: "" })
  const [filter, setFilter] = useState<Filter>("전체")
  const [search, setSearch] = useState("")
  const [selectedRow, setSelectedRow] = useState(0)
  const [markTarget, setMarkTarget] = useState<DisposalMarkTarget>("보관")
  const [markText, setMarkText] = useState("")
  const [markResult, setMarkResult] = useState("")
  const [localNumbers, setLocalNumbers] = useState<Record<string, string>>({})
  const [invalidNumbers, setInvalidNumbers] = useState<Set<string>>(new Set())
  const [fileError, setFileError] = useState("")
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeReason, setCompleteReason] = useState<DisposalReason>("용량 초과")
  const [completeError, setCompleteError] = useState("")
  const [completing, setCompleting] = useState(false)
  const usageInput = useRef<HTMLInputElement>(null)
  const keepInput = useRef<HTMLInputElement>(null)
  const ledgerByKey = useMemo(() => new Map(ledger.map((item) => [item.key, item])), [ledger])

  useEffect(() => {
    if (!selectedId && rounds[0]) setSelectedId(rounds[0].roundId)
  }, [rounds, selectedId])

  const preview = useMemo(() => {
    const from = Number(draft.from)
    const to = Number(draft.to)
    return from && to ? buildDisposalItems(ledger, from, to, sequenceStart) : []
  }, [draft.from, draft.to, ledger, sequenceStart])
  const previewExcluded = preview.filter((item) => item.excluded)

  const replaceRound = (next: DisposalRound) => onSave(rounds.map((round) => round.roundId === next.roundId ? { ...next, updatedAt: new Date().toISOString() } : round))
  const patchItem = (fabricKey: string, patch: Partial<DisposalItem>) => {
    if (!selected || !verdictEditable) return
    const before = selected.items.find((item) => item.fabricKey === fabricKey)
    const items = selected.items.map((item) => item.fabricKey === fabricKey ? { ...item, ...patch } : item)
    const after = items.find((item) => item.fabricKey === fabricKey)
    // 창고 전달 뒤 판정이 바뀌는 것은 창고팀이 실물을 보고 고친 결과다. 근거가 남아야 해서 이력에 적는다.
    // 검토 단계는 판정을 자주 뒤집는 자리라 적지 않는다. 적으면 이력이 수백 줄이 된다.
    const changed = selected.status === "창고 전달" && before && after && itemVerdict(before) !== itemVerdict(after)
    if (!changed || !before || !after) { replaceRound({ ...selected, items }); return }
    replaceRound({ ...selected, items, history: [...selected.history, disposalEvent(actor, "update", { target: `${numberOf(after)} ${after.flNo}`, from: itemVerdict(before), to: itemVerdict(after) })] })
  }
  const createRound = () => {
    if (!preview.length) return
    const now = new Date().toISOString()
    const next: DisposalRound = {
      roundId: crypto.randomUUID(), title: draft.title.trim(), status: "검토", rangeFrom: Number(draft.from), rangeTo: Number(draft.to),
      requestedAt: draft.requestedAt, note: draft.note.trim(), createdAt: now, createdBy: actor.email, createdByName: actor.name, updatedAt: now,
      items: preview, history: [disposalEvent(actor, "create", { to: `범위 ${draft.from}~${draft.to}, 후보 ${preview.length}건` }, now)],
    }
    onSave([...rounds, next]); setSelectedId(next.roundId); setCreateOpen(false)
    setDraft({ title: defaultTitle(), requestedAt: today(), from: "", to: "", note: "" })
  }

  const summary = selected ? disposalSummary(selected) : null
  // 라운드를 만든 뒤 개별 폐기나 소진으로 이미 창고를 떠난 건이 있을 수 있다. 그런 건은 건너뛰고 건수만 알린다.
  const completionTargets = useMemo(() => {
    const move: DisposalItem[] = []
    const skipped: DisposalItem[] = []
    selected?.items.filter(isFinalDispose).forEach((item) => {
      if (ledgerByKey.get(item.fabricKey)?.status === "WAREHOUSE") move.push(item)
      else skipped.push(item)
    })
    return { move, skipped }
  }, [ledgerByKey, selected])
  const visibleItems = useMemo(() => selected?.items.filter((item) => {
    const active = isActiveItem(item)
    const verdict = itemVerdict(item)
    const filterOk = filter === "전체" || filter === "제외" ? (filter === "전체" || !active) : active && verdict === filter
    const needle = search.trim().toLowerCase()
    const live = ledgerByKey.get(item.fabricKey)
    return filterOk && (!needle || [item.storageNo, item.flNo, item.requester ?? live?.planner, item.developer ?? live?.owner, item.yarnDetail ?? live?.fields.yarnDetail, item.construction ?? live?.construction].some((value) => (value ?? "").toLowerCase().includes(needle)))
  }) ?? [], [filter, ledgerByKey, search, selected])

  const commitNumber = (item: DisposalItem) => {
    const raw = localNumbers[item.fabricKey]
    if (raw === undefined) return
    const parsed = parseMeetingPickup(raw)
    if (!parsed) { setInvalidNumbers((current) => new Set(current).add(item.fabricKey)); return }
    patchItem(item.fabricKey, parsed)
    setLocalNumbers((current) => { const next = { ...current }; delete next[item.fabricKey]; return next })
    setInvalidNumbers((current) => { const next = new Set(current); next.delete(item.fabricKey); return next })
  }
  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!verdictEditable || createOpen || markOpen || completeOpen || (event.target as HTMLElement).matches("input, textarea, select, button")) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelectedRow((current) => Math.max(0, Math.min(visibleItems.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); return }
    const item = visibleItems[selectedRow]
    if (!item || !isActiveItem(item)) return
    if (event.key.toLowerCase() === "k") patchItem(item.fabricKey, { keep: true })
    else if (event.key.toLowerCase() === "d") patchItem(item.fabricKey, { keep: false })
    else if (event.key.toLowerCase() === "c" && !isKept(item)) patchItem(item.fabricKey, { swatchLow: !item.swatchLow })
  }
  const runCompletion = async () => {
    if (!selected || completing) return
    setCompleting(true)
    setCompleteError("")
    try {
      const now = new Date().toISOString()
      const moving = new Set(completionTargets.move.map((item) => item.fabricKey))
      const moved = await onCompleteDisposal(completionTargets.move.map((item) => ({
        key: item.fabricKey,
        storageNo: item.storageNo,
        fromStatus: "WAREHOUSE" as const,
        note: `폐기 라운드 ${selected.title}${isCut(item) ? " (1yd 컷팅 후 폐기)" : ""}`,
      })), completeReason)
      const items = selected.items.map((item) => moving.has(item.fabricKey)
        ? { ...item, disposedAt: now, disposedBy: actor.email, ...(isCut(item) ? { cutDoneAt: now, cutDoneBy: actor.email } : {}) }
        : item)
      const keeping = disposalSummary(selected).keeping
      const skippedNote = completionTargets.skipped.length ? `, 건너뜀 ${completionTargets.skipped.length}건` : ""
      replaceRound({ ...selected, status: "완료", completedAt: now, items, history: [...selected.history, disposalEvent(actor, "complete", { to: `이력 이동 ${moved}건, 보관 유지 ${keeping}건${skippedNote}` }, now)] })
      setCompleteOpen(false)
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : "이력으로 옮기지 못했습니다.")
    } finally {
      setCompleting(false)
    }
  }
  const exportWorkbook = async (kind: "rdda" | "final") => {
    if (!selected) return
    downloadBlob(await buildDisposalWorkbook(selected, kind), disposalWorkbookFileName(selected, kind))
  }
  const uploadFile = async (event: ChangeEvent<HTMLInputElement>, kind: "usage" | "keep") => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !selected || !editable) return
    setFileError("")
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const now = new Date().toISOString()
      if (kind === "usage") {
        const parsed = parseRddaUsage(workbook)
        const result = applyRddaUsage(selected, parsed.byFl)
        replaceRound({ ...result.round, rddaUsageFile: { fileName: file.name, uploadedAt: now, uploadedBy: actor.email, fileRows: parsed.fileRows, matched: result.matched }, history: [...selected.history, disposalEvent(actor, "update", { target: "RDDA 활용 파일", to: `${file.name} 매칭 ${result.matched}건` }, now)] })
      } else {
        const parsed = parseRddaFlList(workbook)
        const result = applyKeepList(selected, parsed.fls)
        // 한 건도 안 맞으면 기록을 남기지 않고 이유를 알린다. 다른 대역(예: 8000번대) 목록을 올리는 경우가 있다.
        if (result.matched === 0) {
          setFileError(`보관으로 바꾼 원단이 없습니다. 파일의 FL ${parsed.fls.length}개가 이 라운드 원단(범위 ${selected.rangeFrom}~${selected.rangeTo})에 하나도 없습니다. 라운드 범위의 1팀 보관 목록인지 확인해 주세요.`)
          return
        }
        replaceRound({ ...result.round, keepListFile: { fileName: file.name, uploadedAt: now, uploadedBy: actor.email, fileFl: parsed.fls.length, matched: result.matched, unmatchedFl: result.unmatchedFl.slice(0, 50) }, history: [...selected.history, disposalEvent(actor, "update", { target: "보관 목록 파일", to: `${file.name} 매칭 ${result.matched}건` }, now)] })
      }
    } catch (error) { setFileError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.") }
  }
  const uploadTime = (value: string) => { const date = new Date(value); return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--warning)] bg-[var(--card)] lg:flex-row" onKeyDown={handleKeys} tabIndex={0}>
    {/* 창고보관 표처럼 옅은 격자. 보관은 초록 막대와 반짝임, 폐기는 붉은 막대로 판정을 한눈에 가른다.
        행과 셀에는 transform을 걸지 않는다(sticky 머리). 움직임은 버튼 안쪽 요소에만 준다. */}
    <style>{`
      .disposal-grid { border-collapse: separate; border-spacing: 0; }
      .disposal-grid th { background: color-mix(in srgb, var(--muted) 70%, var(--card)); color: var(--muted-foreground); font-weight: 600; text-align: center; white-space: nowrap; border-bottom: 1px solid var(--border); border-right: 1px solid color-mix(in srgb, var(--border) 80%, transparent); }
      .disposal-grid td { height: 36px; vertical-align: middle; border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent); border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent); transition: background-color 300ms ease-out; }
      .disposal-grid tbody tr:hover td { background-image: linear-gradient(color-mix(in srgb, var(--foreground) 3%, transparent), color-mix(in srgb, var(--foreground) 3%, transparent)); }
      .disposal-grid tbody tr.disposal-row-selected td { background-image: linear-gradient(color-mix(in srgb, var(--primary) 9%, transparent), color-mix(in srgb, var(--primary) 9%, transparent)); }
      .disposal-row-keep td:first-child { box-shadow: inset 3px 0 0 #10b981; }
      .disposal-row-dispose td:first-child { box-shadow: inset 3px 0 0 #e11d48; }
      @keyframes disposal-shine { 0% { transform: translateX(-160%) skewX(-20deg); } 55%, 100% { transform: translateX(360%) skewX(-20deg); } }
      .disposal-shine { animation: disposal-shine 2.8s ease-in-out infinite; }
      @keyframes disposal-pop { 0% { transform: scale(0.9); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
      .disposal-pop { animation: disposal-pop 260ms ease-out; }
      @media (prefers-reduced-motion: reduce) { .disposal-shine { display: none; } .disposal-pop { animation: none !important; } .disposal-grid td { transition: none; } }
    `}</style>
    <aside className="w-full shrink-0 border-b border-[var(--border)] p-3 lg:w-[260px] lg:border-b-0 lg:border-r">
      {canWrite ? <Button className="mb-3 w-full" size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" />새 라운드</Button> : null}
      <div className="space-y-2">{ordered.map((round) => { const value = disposalSummary(round); return <button key={round.roundId} type="button" onClick={() => setSelectedId(round.roundId)} className={`w-full rounded-md border p-2 text-left text-xs ${round.roundId === selectedId ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
        <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{round.title}</strong><StatusBadge status={round.status} /></div>
        <div className="mt-1 text-[var(--muted-foreground)]">{round.rangeFrom}~{round.rangeTo}　{Number(round.requestedAt.slice(5, 7))}/{Number(round.requestedAt.slice(8, 10))}</div>
        <div className="mt-1">최종 폐기 {value.finalDispose} / 보관 {value.keeping} / 컷팅 {value.cut}</div>
      </button> })}</div>
    </aside>
    {!selected || !summary ? <div className="grid flex-1 place-items-center p-8 text-sm text-[var(--muted-foreground)]">라운드를 선택하거나 새로 만들어 주세요.</div> : <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b p-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold" onDoubleClick={() => { if (!editable) return; const title = window.prompt("새 제목", selected.title)?.trim(); if (title && title !== selected.title) replaceRound({ ...selected, title, history: [...selected.history, disposalEvent(actor, "update", { target: "제목", from: selected.title, to: title })] }) }}>{selected.title}</h2><StatusBadge status={selected.status} /><span className="text-xs text-[var(--muted-foreground)]">범위 {selected.rangeFrom}~{selected.rangeTo} / 요청일 {selected.requestedAt} / 만든 사람 {selected.createdByName}{selected.sentAt ? ` / 창고 전달 ${uploadTime(selected.sentAt)}` : ""}{selected.completedAt ? ` / 완료 ${uploadTime(selected.completedAt)}` : ""}</span></div>
        {selected.note ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{selected.note}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">{[["전달받은", summary.received], ["제외", summary.excluded], ["보관", summary.keeping], ["컷팅", summary.cut], ["최종 폐기", summary.finalDispose]].map(([label, value]) => <Badge key={label} variant="secondary">{label} {value}</Badge>)}</div>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void exportWorkbook("rdda")}><Download className="size-4" />RDDA 목록 내려받기</Button><Button size="sm" variant="outline" disabled={!editable} onClick={() => usageInput.current?.click()}><Upload className="size-4" />RDDA 활용 파일 올리기</Button><Button size="sm" variant="outline" disabled={!editable} onClick={() => keepInput.current?.click()}><Upload className="size-4" />보관 목록 파일 올리기</Button><input ref={usageInput} className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => void uploadFile(event, "usage")} /><input ref={keepInput} className="hidden" type="file" accept=".xls,.xlsx" onChange={(event) => void uploadFile(event, "keep")} /><Button size="sm" variant="outline" disabled={!editable} onClick={() => { setMarkResult(""); setMarkOpen(true) }}>목록 붙여넣기로 표시</Button><Button size="sm" variant="outline" onClick={() => void exportWorkbook("final")}><Download className="size-4" />최종 리스트 내려받기</Button>{canWrite && selected.status === "검토" ? <Button size="sm" onClick={() => { if (window.confirm(`최종 리스트를 창고팀에 전달합니다.\n폐기 ${summary.finalDispose}건, 보관 ${summary.keeping}건입니다.\n전달 뒤에는 판정·컷팅·메모만 고칠 수 있습니다.`)) replaceRound({ ...selected, status: "창고 전달", sentAt: new Date().toISOString(), sentBy: actor.email, history: [...selected.history, disposalEvent(actor, "send", { to: `폐기 ${summary.finalDispose} / 보관 ${summary.keeping}` })] }) }}><Send className="size-4" />창고 전달</Button> : null}{canWrite && selected.status === "창고 전달" ? <><Button size="sm" variant="outline" onClick={() => { if (window.confirm("검토 단계로 되돌립니다. 창고팀이 실물 작업 중이면 되돌리지 마세요.")) replaceRound({ ...selected, status: "검토", history: [...selected.history, disposalEvent(actor, "reopen")] }) }}><Undo2 className="size-4" />검토로 되돌리기</Button><Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => { setCompleteReason("용량 초과"); setCompleteError(""); setCompleteOpen(true) }}><PackageOpen className="size-4" />최종 확정 · 이력 이동</Button></> : null}{isOwner && selected.status === "검토" ? <Button size="sm" variant="destructive" onClick={() => { if (window.confirm("이 라운드를 삭제할까요?")) { onSave(rounds.filter((round) => round.roundId !== selected.roundId)); setSelectedId("") } }}><Trash2 className="size-4" />라운드 삭제</Button> : null}</div>
        {fileError ? <p className="mt-2 text-xs text-[var(--destructive)]">{fileError}</p> : null}
        {selected.rddaUsageFile ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">RDDA 활용 {uploadTime(selected.rddaUsageFile.uploadedAt)} 반영, 매칭 {selected.rddaUsageFile.matched}/{selected.items.length}건, 파일 {selected.rddaUsageFile.fileRows}행 ({selected.rddaUsageFile.fileName})</p> : null}
        {selected.keepListFile ? <div className="mt-1 text-xs text-[var(--muted-foreground)]">보관 목록 {uploadTime(selected.keepListFile.uploadedAt)} 반영, 보관 표시 {selected.keepListFile.matched}건, 라운드에 없는 FL {selected.keepListFile.unmatchedFl.length}개{selected.keepListFile.unmatchedFl.length ? <><button type="button" className="ml-2 underline" onClick={() => setShowUnmatched((current) => !current)}>보기</button>{showUnmatched ? <p className="mt-1 break-all">{selected.keepListFile.unmatchedFl.join(", ")}</p> : null}</> : null}</div> : null}
        <div className="mt-3 flex flex-wrap gap-2">{filters.map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{value}</Button>)}<Input className="h-8 min-w-52 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="R&D No., FL#, Requester, Developer, Yarn Detail, Cons. 검색" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto"><table className="disposal-grid w-full min-w-[1320px] text-[11px]"><thead className="sticky top-0 z-10"><tr>{["R&D No.", "Rack No.", "FL#", "Requester", "Developer", "Yarn Detail", "Cons.", "판정", "M/P", "Cutting", "메모"].map((head) => <th key={head} className="px-2 py-2">{head}</th>)}</tr></thead><tbody>{visibleItems.map((item, index) => {
        const active = isActiveItem(item); const kept = isKept(item); const live = ledgerByKey.get(item.fabricKey); const fill = kept ? { background: "color-mix(in srgb, #059669 12%, transparent)", transition: "background-color 300ms ease-out" } : undefined
        const requester = item.requester ?? live?.planner ?? ""; const developer = item.developer ?? live?.owner ?? ""; const yarnDetail = item.yarnDetail ?? live?.fields.yarnDetail ?? ""; const construction = item.construction ?? live?.construction ?? ""
        return <tr key={item.fabricKey} onClick={() => setSelectedRow(index)} className={`${index === selectedRow ? "disposal-row-selected" : ""} ${active ? (kept ? "disposal-row-keep" : "disposal-row-dispose") : "opacity-50"}`}>
          <td style={fill} className="px-2 py-1 font-mono">{numberOf(item)}</td><td style={fill} className="px-2 py-1">{item.rackNo}</td><td style={fill} className="px-2 py-1 font-mono">{item.flNo}</td><td style={fill} className="px-2 py-1">{requester}</td><td style={fill} className="px-2 py-1">{developer}</td><td style={fill} className="max-w-[220px] truncate px-2 py-1" title={yarnDetail}>{yarnDetail}</td><td style={fill} className="px-2 py-1">{construction}</td>
          {!active ? <td style={fill} colSpan={4} className="px-2 py-1"><Badge variant="secondary">{item.excluded}</Badge>{editable ? <Button className="ml-2 h-6" size="sm" variant="outline" onClick={() => patchItem(item.fabricKey, { included: true })}>포함</Button> : null}</td> : <>
            <td style={fill} className="px-2 py-1 text-center"><div className="inline-flex whitespace-nowrap rounded-lg bg-[color-mix(in_srgb,var(--muted)_85%,transparent)] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]">
              <button type="button" disabled={!verdictEditable} aria-pressed={kept} title="보관" onClick={() => patchItem(item.fabricKey, { keep: true })} className={`relative inline-flex items-center gap-1 overflow-hidden rounded-md px-2.5 py-1 text-[11px] font-semibold transition-[color,box-shadow,background-color] duration-200 active:translate-y-px disabled:cursor-default ${kept ? "disposal-pop bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_6px_rgba(16,185,129,0.45)]" : "text-[var(--muted-foreground)] enabled:hover:text-emerald-600"}`}>
                {kept ? <span aria-hidden="true" className="disposal-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" /> : null}
                <Sparkles className="relative size-3" /><span className="relative">보관</span>
              </button>
              <button type="button" disabled={!verdictEditable} aria-pressed={!kept} title="폐기" onClick={() => patchItem(item.fabricKey, { keep: false })} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-[color,box-shadow,background-color] duration-200 active:translate-y-px disabled:cursor-default ${!kept ? "disposal-pop bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_6px_rgba(225,29,72,0.4)]" : "text-[var(--muted-foreground)] enabled:hover:text-rose-600"}`}>
                <Trash2 className="size-3" />폐기
              </button>
            </div></td>
            <td style={fill} className="px-2 py-1"><input className={`h-7 w-16 rounded-md border bg-[var(--background)] px-1 text-center font-mono tabular-nums shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring)_30%,transparent)] disabled:opacity-60 ${invalidNumbers.has(item.fabricKey) ? "border-[var(--destructive)] ring-2 ring-[color-mix(in_srgb,var(--destructive)_25%,transparent)]" : "border-[var(--border)]"}`} inputMode="numeric" placeholder="0/0" disabled={!editable} value={localNumbers[item.fabricKey] ?? formatMeetingPickup(item)} title={invalidNumbers.has(item.fabricKey) ? "미팅/픽업 형식으로 적어 주세요. 예: 3/1" : undefined} onChange={(event) => { setLocalNumbers((current) => ({ ...current, [item.fabricKey]: event.target.value })); setInvalidNumbers((current) => { const next = new Set(current); next.delete(item.fabricKey); return next }) }} onBlur={() => commitNumber(item)} onKeyDown={(event) => { if (event.key === "Enter") { commitNumber(item); event.currentTarget.blur() } }} /></td>
            <td style={fill} className="px-2 py-1 text-center"><button type="button" aria-pressed={!kept && !!item.swatchLow} disabled={!verdictEditable || kept} title={kept ? "보관 원단은 컷팅하지 않습니다" : "1yd 컷팅 후 폐기"} onClick={() => patchItem(item.fabricKey, { swatchLow: !item.swatchLow })} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-[color,box-shadow,background-color,border-color] duration-200 active:translate-y-px disabled:cursor-not-allowed ${kept ? "border-dashed border-[var(--border)] text-[var(--muted-foreground)] opacity-40" : item.swatchLow ? "disposal-pop border-transparent bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_5px_rgba(217,119,6,0.4)]" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] shadow-sm enabled:hover:border-amber-400 enabled:hover:text-amber-600"}`}><Scissors className="size-3" />{!kept && item.swatchLow ? "1yd" : "컷팅"}</button></td>
            <td style={fill} className="px-2 py-1"><input className="h-7 w-40 rounded-md border border-transparent bg-transparent px-2 outline-none transition placeholder:text-[var(--muted-foreground)] enabled:hover:border-[var(--border)] focus:border-[var(--ring)] focus:bg-[var(--background)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring)_30%,transparent)]" placeholder="메모" defaultValue={item.memo ?? ""} disabled={!verdictEditable} onBlur={(event) => { if (event.target.value !== (item.memo ?? "")) patchItem(item.fabricKey, { memo: event.target.value }) }} /></td>
          </>}
          {active && item.excluded ? <td className="px-2 py-1"><Button className="h-6" size="sm" variant="outline" disabled={!editable} onClick={() => patchItem(item.fabricKey, { included: false })}>다시 제외</Button></td> : null}
        </tr>})}</tbody></table></div>
    </section>}

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>새 폐기 라운드</DialogTitle></DialogHeader><DialogBody className="space-y-3"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="제목" /><Input type="date" value={draft.requestedAt} onChange={(event) => setDraft({ ...draft, requestedAt: event.target.value })} /><div className="grid grid-cols-2 gap-2"><Input type="number" min="1" max="7999" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} placeholder="범위 시작" /><Input type="number" min="1" max="7999" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} placeholder="범위 끝" /></div><textarea className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="메모" /><p className="text-xs text-[var(--muted-foreground)]">후보 {preview.length}건, 자동 제외 {previewExcluded.length}건(FL 미기입 {previewExcluded.filter((item) => item.excluded === "FL 미기입").length}, FL 중복 {previewExcluded.filter((item) => item.excluded === "FL 중복").length})</p></DialogBody><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button><Button disabled={!preview.length || !draft.title.trim() || !draft.requestedAt} onClick={createRound}>만들기</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={markOpen} onOpenChange={setMarkOpen}><DialogContent><DialogHeader><DialogTitle>목록 붙여넣기로 표시</DialogTitle></DialogHeader><DialogBody className="space-y-3"><select className="h-9 w-full rounded-md border bg-[var(--background)] px-2 text-sm" value={markTarget} onChange={(event) => setMarkTarget(event.target.value as DisposalMarkTarget)}>{markTargets.map((target) => <option key={target}>{target}</option>)}</select><textarea className="min-h-48 w-full rounded-md border bg-transparent p-2 text-sm" value={markText} onChange={(event) => setMarkText(event.target.value)} placeholder="R&D No. 또는 FL#를 붙여넣으세요." />{markResult ? <p className="text-xs">{markResult}</p> : null}</DialogBody><DialogFooter><Button variant="outline" onClick={() => setMarkOpen(false)}>닫기</Button><Button disabled={!editable || !markText.trim()} onClick={() => { if (!selected) return; const result = applyListMarks(selected, markText, markTarget); replaceRound({ ...result.round, history: [...selected.history, disposalEvent(actor, "update", { target: "목록 표시", to: `${markTarget} ${result.matched}건` })] }); setMarkResult(`${result.matched}건 표시, 못 찾은 값 ${result.unmatched.length}개${result.unmatched.length ? `: ${result.unmatched.slice(0, 10).join(", ")}` : ""}`) }}>표시하기</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={completeOpen} onOpenChange={(open) => { if (!completing) setCompleteOpen(open) }}><DialogContent><DialogHeader><DialogTitle>최종 확정 · 이력 이동</DialogTitle></DialogHeader><DialogBody className="space-y-3">
      <p className="text-sm">폐기가 확정된 원단을 창고 보관에서 <strong>이력</strong>으로 옮깁니다. 되돌리려면 이력 탭에서 건별로 창고 보관으로 되돌려야 합니다.</p>
      <div className="rounded-md border border-[var(--border)] p-3 text-sm">
        <div className="flex justify-between"><span>이력으로 이동</span><strong>{completionTargets.move.length}건</strong></div>
        <div className="mt-1 flex justify-between text-[var(--muted-foreground)]"><span>창고 보관 유지</span><span>{selected ? disposalSummary(selected).keeping : 0}건</span></div>
        {completionTargets.skipped.length ? <div className="mt-1 flex justify-between text-[var(--muted-foreground)]"><span>이미 창고를 떠난 건(건너뜀)</span><span>{completionTargets.skipped.length}건</span></div> : null}
      </div>
      <div className="space-y-1"><label className="text-xs text-[var(--muted-foreground)]" htmlFor="disposal-complete-reason">폐기 사유</label><select id="disposal-complete-reason" className="h-9 w-full rounded-md border bg-[var(--background)] px-2 text-sm" value={completeReason} onChange={(event) => setCompleteReason(event.target.value as DisposalReason)}>{DISPOSAL_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select><p className="text-xs text-[var(--muted-foreground)]">이동하는 {completionTargets.move.length}건에 같은 사유가 기록됩니다.</p></div>
      {completeError ? <p className="text-xs text-[var(--destructive)]">{completeError}</p> : null}
    </DialogBody><DialogFooter><Button variant="outline" disabled={completing} onClick={() => setCompleteOpen(false)}>취소</Button><Button disabled={completing || !completionTargets.move.length} onClick={() => void runCompletion()}>{completing ? <Loader2 className="size-4 animate-spin" /> : null}확정하고 이력으로 옮기기</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function StatusBadge({ status }: { status: DisposalRound["status"] }) {
  return <Badge variant="secondary" style={{ color: status === "검토" ? "var(--chart-1)" : status === "창고 전달" ? "var(--warning)" : "var(--muted-foreground)" }}>{status}</Badge>
}
