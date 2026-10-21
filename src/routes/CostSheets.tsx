import { useEffect, useMemo, useState } from "react"
import { Download, Pencil, Printer, Search, Trash2 } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { CostSheetDialog } from "@/components/dd/CostSheetDialog"
import { CostSheetBody, CostSheetPrintDeck } from "@/components/dd/CostSheetPrintSheet"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuthStore, useScreenAccess } from "@/data/auth"
import { compareCostSheets, deleteCostSheetGroup, isCostSheetStale, latestByGroup, listCostSheets, type CostSheetDoc } from "@/data/cost-sheets"
import { costSheetFileName, exportCostSheetWorkbook } from "@/data/cost-export"
import { downloadBlob } from "@/data/dd-export"
import type { DevRecord, DevTechnical } from "@/data/schema"
import { useAppStore, writeDevelopmentRecords } from "@/store/useAppStore"

const LIMIT = 500
const text = (value: string) => value || "-"
const dateText = (at: number) => new Date(at).toLocaleDateString("ko-KR")
const won = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
/** 단가는 소수점 둘째 자리까지 반올림해 보인다(2026-10-21 박향근 지시). */
const usd = (value: number) => value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const identity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

async function downloadExcel(doc: CostSheetDoc): Promise<void> {
  downloadBlob(await exportCostSheetWorkbook(doc), costSheetFileName(doc))
}

function ExcelButton({ doc, label = "엑셀" }: { doc: CostSheetDoc; label?: string }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try { await downloadExcel(doc) } finally { setBusy(false) }
  }
  return <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} onClick={(event) => { event.stopPropagation(); void run() }}><Download className="size-3" />{busy ? "생성 중" : label}</Button>
}

/**
 * 한 건을 A4 모양 그대로 띄우는 팝업(R348).
 * 본문은 인쇄와 같은 `CostSheetBody` 다. 따로 그리면 보이는 것과 종이가 갈린다.
 */
function SheetViewDialog({ doc, onClose, onPrint }: { doc: CostSheetDoc | null; onClose: () => void; onPrint: (doc: CostSheetDoc) => void }) {
  return <Dialog open={Boolean(doc)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="w-[96vw] max-w-[840px]">
      {doc ? <>
        <DialogHeader className="py-2.5">
          <DialogTitle className="text-base">원가계산서 · {text(doc.flNo) !== "-" ? doc.flNo : doc.styleNo}</DialogTitle>
          <DialogDescription>v{doc.version} · {dateText(doc.at)} · {text(doc.by)}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-auto bg-[var(--muted)]/30 p-4">
          {/* cs-sheet-view 가 인쇄 전용 본문을 화면에 펼친다. A4 폭 그대로라 가운데에 둔다. */}
          <div className="cs-sheet-view mx-auto w-max origin-top shadow-[0_1px_8px_rgba(0,0,0,0.12)]">
            <div className="p-[10mm]"><CostSheetBody doc={doc} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <ExcelButton doc={doc} />
          <Button type="button" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onPrint(doc)}><Printer className="size-3" />인쇄 · PDF</Button>
        </DialogFooter>
      </> : null}
    </DialogContent>
  </Dialog>
}

export function CostSheets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [docs, setDocs] = useState<CostSheetDoc[]>([])
  const [search, setSearch] = useState(() => searchParams.get("fl") ?? "")
  const [staleOnly, setStaleOnly] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState("")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [beforeId, setBeforeId] = useState("")
  const [afterId, setAfterId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [viewDoc, setViewDoc] = useState<CostSheetDoc | null>(null)
  const [printJob, setPrintJob] = useState<CostSheetDoc[] | null>(null)
  const [editRows, setEditRows] = useState<DevRecord[]>([])
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  const records = useAppStore((state) => state.records)
  const isOwner = useAuthStore((state) => state.isOwner)
  const canEdit = useScreenAccess("/cost") === "edit"

  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 6000) }

  useEffect(() => {
    if (searchParams.has("fl")) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const reload = () => listCostSheets({ limit: LIMIT }).then((items) => {
    setDocs(items)
    setSelectedGroup((current) => current || latestByGroup(items)[0]?.groupId || "")
  })

  useEffect(() => {
    let live = true
    void listCostSheets({ limit: LIMIT }).then((items) => {
      if (!live) return
      setDocs(items)
      setSelectedGroup((current) => current || latestByGroup(items)[0]?.groupId || "")
    }).catch(() => { if (live) setError("원가계산서 목록을 불러오지 못했습니다.") }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return latestByGroup(docs).filter((doc) => !staleOnly || isCostSheetStale(doc)).filter((doc) => !query || [doc.flNo, doc.styleNo, doc.project, doc.buyer, doc.owner, doc.construction].some((value) => value.toLocaleLowerCase("ko-KR").includes(query)))
  }, [docs, search, staleOnly])
  const versions = useMemo(() => docs.filter((doc) => doc.groupId === selectedGroup).sort((a, b) => b.version - a.version || b.at - a.at), [docs, selectedGroup])

  // 목록이 걸러지면 화면에 없는 줄의 체크를 들고 있지 않는다. 안 보이는 건이 삭제·출력에 섞인다.
  useEffect(() => {
    const visible = new Set(rows.map((doc) => doc.groupId))
    setChecked((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)))
      return next.size === current.size ? current : next
    })
  }, [rows])

  useEffect(() => {
    setAfterId(versions[0]?.id ?? "")
    setBeforeId(versions[1]?.id ?? "")
  }, [selectedGroup, versions])

  const before = versions.find((doc) => doc.id === beforeId)
  const after = versions.find((doc) => doc.id === afterId)
  const comparison = before && after ? compareCostSheets(before, after) : []

  const checkedDocs = rows.filter((doc) => checked.has(doc.groupId))
  const allChecked = rows.length > 0 && checkedDocs.length === rows.length
  const toggle = (groupId: string) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId)
    return next
  })

  /** 수정은 DD MASTER 와 같은 입력 팝업을 연다. 그 FL 의 DD 행이 있어야 열린다. */
  const editSelected = () => {
    if (checkedDocs.length !== 1) return
    const target = checkedDocs[0]
    const row = records.find((record) => identity(record) === target.rowKey)
    if (!row) { showNotice("이 계산서의 DD 행을 찾지 못했습니다. DD MASTER에서 열어 주세요."); return }
    setEditRows([row])
  }

  const deleteSelected = async () => {
    if (!checkedDocs.length || busy) return
    if (!isOwner) { showNotice("원가계산서 삭제는 소유자만 할 수 있습니다."); return }
    const counts = await Promise.all(checkedDocs.map((doc) => listCostSheets({ groupId: doc.groupId }).then((items) => items.length)))
    const total = counts.reduce((sum, value) => sum + value, 0)
    const names = checkedDocs.map((doc) => text(doc.flNo) !== "-" ? doc.flNo : doc.styleNo).join(", ")
    if (!window.confirm(`${names}\n위 ${checkedDocs.length}건의 원가계산서를 버전까지 모두 지웁니다. 문서 ${total}개가 사라지며 되돌릴 수 없습니다. 계속할까요?`)) return
    setBusy(true)
    try {
      for (const doc of checkedDocs) await deleteCostSheetGroup(doc.groupId)
      setChecked(new Set())
      await reload()
      showNotice(`원가계산서 ${checkedDocs.length}건(문서 ${total}개)을 지웠습니다.`)
    } catch (caught) {
      showNotice(`지우지 못했습니다. ${(caught as { code?: string } | null)?.code ?? ""}`.trim())
    } finally { setBusy(false) }
  }

  /** 저장하면 DD 행의 tech.costRef 를 같이 갱신한다. DD MASTER 의 applyCostRef 와 같은 일이다. */
  const applyCostRef = async (rowKey: string, ref: NonNullable<DevTechnical["costRef"]>) => {
    const next = useAppStore.getState().records.map((record) => identity(record) === rowKey ? { ...record, tech: { ...record.tech, costRef: ref } } : record)
    await writeDevelopmentRecords(next, false, "edit")
    await reload()
  }

  const headCells = ["Style No.", "Project", "Buyer", "조직", "Color", "담당", "계산일", "버전", "Net 원/yd", "Net $/yd", ""]

  return <section className="min-w-0 space-y-3">
    <PageHeader title="COST SHEET" actions={<div className="relative w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="FL# · Style No. · Project · Buyer · 담당 · 조직 검색" className="h-8 pl-9 text-[13px]" /></div>} />

    {notice ? <p className="rounded-[var(--radius)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)]">{notice}</p> : null}

    <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="flex-row items-center justify-between gap-3 py-2.5">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-medium">원가계산서 자료실</CardTitle>
          {docs.length >= LIMIT ? <span className="text-[11px] text-[var(--warning)]">최근 500건만</span> : null}
          {checkedDocs.length ? <span className="text-[11px] text-[var(--muted-foreground)]">{checkedDocs.length}건 선택</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={checkedDocs.length !== 1 || !canEdit} onClick={editSelected}><Pencil className="size-3" />수정</Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!checkedDocs.length} onClick={() => setPrintJob(checkedDocs)}><Printer className="size-3" />출력</Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] text-[var(--destructive)]" disabled={!checkedDocs.length || busy || !isOwner} onClick={() => void deleteSelected()}><Trash2 className="size-3" />삭제</Button>
          <label className="ml-1 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><input type="checkbox" checked={staleOnly} onChange={(event) => setStaleOnly(event.target.checked)} />경과 건만</label>
        </div>
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[1180px] text-[12px] [&_td]:py-1.5 [&_th]:h-8"><TableHeader className="bg-[var(--muted)]/40"><TableRow>
        <TableHead className="w-8"><input type="checkbox" aria-label="전체 선택" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((doc) => doc.groupId)))} /></TableHead>
        <TableHead className="text-[10px] font-medium tracking-wide text-[var(--muted-foreground)]">FL#</TableHead>
        {headCells.map((head, index) => <TableHead key={`${head}-${index}`} className="text-[10px] font-medium tracking-wide text-[var(--muted-foreground)]">{head}</TableHead>)}
      </TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={13} className="h-28 text-center text-[var(--muted-foreground)]">불러오는 중…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={13} className="h-28 text-center text-[var(--destructive)]">{error}</TableCell></TableRow> : rows.length ? rows.map((doc) => {
          const staleDays = Math.floor((Date.now() - doc.at) / 86_400_000)
          // 한 번 클릭은 아래 버전 내역만 바꾸고, 두 번 클릭해야 계산서 팝업이 뜬다
          // (2026-10-21 박향근 지시). 한 번에 팝업이 뜨면 버전 비교를 보려고 줄을 고를 수가 없다.
          return <TableRow key={doc.id} className={`cursor-pointer hover:bg-teal-500/[0.06] ${selectedGroup === doc.groupId ? "bg-teal-500/10" : ""}`} onClick={() => setSelectedGroup(doc.groupId)} onDoubleClick={() => { setSelectedGroup(doc.groupId); setViewDoc(doc) }}>
            <TableCell onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`${doc.flNo || doc.styleNo} 선택`} checked={checked.has(doc.groupId)} onChange={() => toggle(doc.groupId)} /></TableCell>
            <TableCell className="font-mono">{text(doc.flNo)}</TableCell>
            <TableCell>{text(doc.styleNo)}</TableCell><TableCell>{text(doc.project)}</TableCell><TableCell>{text(doc.buyer)}</TableCell><TableCell>{text(doc.construction)}</TableCell><TableCell>{text(doc.color)}</TableCell><TableCell>{text(doc.owner)}</TableCell>
            <TableCell className="whitespace-nowrap">{dateText(doc.at)}{isCostSheetStale(doc) ? <span className="ml-1.5 rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--warning)]">{staleDays}일</span> : null}</TableCell>
            <TableCell>v{doc.version}</TableCell><TableCell className="tabular-nums">{won(doc.sheet.result.netKrwPerYd)}</TableCell><TableCell className="tabular-nums">{usd(doc.sheet.result.netPerYd)}</TableCell>
            <TableCell><ExcelButton doc={doc} /></TableCell>
          </TableRow>
        }) : <TableRow><TableCell colSpan={13} className="h-28 text-center text-[var(--muted-foreground)]">표시할 원가계산서가 없습니다.</TableCell></TableRow>}
      </TableBody></Table></div></CardContent>
    </Card>

    {versions.length ? <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="py-2.5"><CardTitle className="text-sm font-medium">버전 상세 · {versions[0].flNo || versions[0].styleNo}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto"><Table className="text-[12px] [&_td]:py-1.5 [&_th]:h-8"><TableHeader><TableRow>{["버전", "계산일", "작성자", "Net 원/yd", "", "", ""].map((head, index) => <TableHead key={`${head}-${index}`} className="text-[10px] text-[var(--muted-foreground)]">{head}</TableHead>)}</TableRow></TableHeader><TableBody>{versions.map((doc) => <TableRow key={doc.id}><TableCell>v{doc.version}</TableCell><TableCell>{dateText(doc.at)}</TableCell><TableCell>{text(doc.by)}</TableCell><TableCell className="tabular-nums">{won(doc.sheet.result.netKrwPerYd)}</TableCell><TableCell><Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setViewDoc(doc)}>보기</Button></TableCell><TableCell><ExcelButton doc={doc} /></TableCell><TableCell><Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]"><Link to={`/development/workspace?focus=${encodeURIComponent(doc.rowKey)}`}>DD 행 열기</Link></Button></TableCell></TableRow>)}</TableBody></Table></div>
        {versions.length >= 2 ? <div className="space-y-2"><div className="flex flex-wrap items-center gap-2 text-[12px]"><span>비교</span><select value={beforeId} onChange={(event) => setBeforeId(event.target.value)} className="h-7 rounded border border-[var(--input)] bg-[var(--background)] px-2 text-[12px]">{versions.map((doc) => <option key={doc.id} value={doc.id}>v{doc.version} · {dateText(doc.at)}</option>)}</select><span>→</span><select value={afterId} onChange={(event) => setAfterId(event.target.value)} className="h-7 rounded border border-[var(--input)] bg-[var(--background)] px-2 text-[12px]">{versions.map((doc) => <option key={doc.id} value={doc.id}>v{doc.version} · {dateText(doc.at)}</option>)}</select></div><div className="overflow-x-auto"><Table className="text-[12px] [&_td]:py-1.5 [&_th]:h-8"><TableHeader><TableRow>{["항목", "이전", "이후", "차이", "증감%"].map((head) => <TableHead key={head} className="text-[10px] text-[var(--muted-foreground)]">{head}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.map((item) => <TableRow key={item.label}><TableCell>{item.label}</TableCell><TableCell className="tabular-nums">{item.prev.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</TableCell><TableCell className="tabular-nums">{item.next.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</TableCell><TableCell className="tabular-nums">{item.diff.toLocaleString("ko-KR", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}</TableCell><TableCell className="tabular-nums" style={{ color: item.diff > 0 ? "var(--destructive)" : item.diff < 0 ? "var(--chart-2)" : undefined }}>{item.diffPct.toLocaleString("ko-KR", { maximumFractionDigits: 1, signDisplay: "exceptZero" })}%</TableCell></TableRow>)}</TableBody></Table></div></div> : <p className="text-[12px] text-[var(--muted-foreground)]">비교할 이전 버전이 없습니다.</p>}
      </CardContent>
    </Card> : null}

    <SheetViewDialog doc={viewDoc} onClose={() => setViewDoc(null)} onPrint={(doc) => { setViewDoc(null); setPrintJob([doc]) }} />
    <CostSheetDialog open={editRows.length > 0} onOpenChange={(open) => { if (!open) { setEditRows([]); void reload() } }} rows={editRows} canEdit={canEdit} onSaved={(rowKey, ref) => void applyCostRef(rowKey, ref)} />
    {printJob?.length ? <CostSheetPrintDeck docs={printJob} onDone={() => setPrintJob(null)} /> : null}
  </section>
}
