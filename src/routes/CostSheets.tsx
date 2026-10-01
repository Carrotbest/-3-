import { useEffect, useMemo, useState } from "react"
import { Download, Search } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { compareCostSheets, isCostSheetStale, latestByGroup, listCostSheets, type CostSheetDoc } from "@/data/cost-sheets"
import { costSheetFileName, exportCostSheetWorkbook } from "@/data/cost-export"
import { downloadBlob } from "@/data/dd-export"

const LIMIT = 500
const text = (value: string) => value || "-"
const dateText = (at: number) => new Date(at).toLocaleDateString("ko-KR")
const won = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
const usd = (value: number) => value.toLocaleString("ko-KR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })

function ExcelButton({ doc }: { doc: CostSheetDoc }) {
  const [busy, setBusy] = useState(false)
  const download = async () => {
    if (busy) return
    setBusy(true)
    try { downloadBlob(await exportCostSheetWorkbook(doc), costSheetFileName(doc)) }
    finally { setBusy(false) }
  }
  return <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={(event) => { event.stopPropagation(); void download() }}><Download className="size-3.5" />{busy ? "생성 중" : "엑셀"}</Button>
}

export function CostSheets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [docs, setDocs] = useState<CostSheetDoc[]>([])
  const [search, setSearch] = useState(() => searchParams.get("fl") ?? "")
  const [staleOnly, setStaleOnly] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState("")
  const [beforeId, setBeforeId] = useState("")
  const [afterId, setAfterId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (searchParams.has("fl")) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

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

  useEffect(() => {
    setAfterId(versions[0]?.id ?? "")
    setBeforeId(versions[1]?.id ?? "")
  }, [selectedGroup, versions])

  const before = versions.find((doc) => doc.id === beforeId)
  const after = versions.find((doc) => doc.id === afterId)
  const comparison = before && after ? compareCostSheets(before, after) : []

  return <section className="min-w-0 space-y-4">
    <PageHeader title="COST SHEET" actions={<div className="relative w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="FL# · Style No. · Project · Buyer · 담당 · 조직 검색" className="pl-9" /></div>} />

    <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div><CardTitle className="text-base font-medium">원가계산서 자료실</CardTitle>{docs.length >= LIMIT ? <p className="mt-1 text-xs text-[var(--warning)]">최근 500건만 보고 있습니다</p> : null}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={staleOnly} onChange={(event) => setStaleOnly(event.target.checked)} />경과 건만</label>
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[1180px] text-[13px]"><TableHeader className="bg-[var(--muted)]/40"><TableRow>{["FL#", "Style No.", "Project", "Buyer", "조직", "Color", "담당", "계산일", "버전", "Net 원/yd", "Net $/yd", ""].map((head, index) => <TableHead key={`${head}-${index}`} className="text-[11px] font-medium tracking-wide text-[var(--muted-foreground)]">{head}</TableHead>)}</TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={12} className="h-32 text-center text-[var(--muted-foreground)]">불러오는 중…</TableCell></TableRow> : error ? <TableRow><TableCell colSpan={12} className="h-32 text-center text-[var(--destructive)]">{error}</TableCell></TableRow> : rows.length ? rows.map((doc) => {
          const staleDays = Math.floor((Date.now() - doc.at) / 86_400_000)
          return <TableRow key={doc.id} className={`cursor-pointer hover:bg-teal-500/[0.06] ${selectedGroup === doc.groupId ? "bg-teal-500/10" : ""}`} onClick={() => setSelectedGroup(doc.groupId)}><TableCell className="font-mono">{text(doc.flNo)}</TableCell><TableCell>{text(doc.styleNo)}</TableCell><TableCell>{text(doc.project)}</TableCell><TableCell>{text(doc.buyer)}</TableCell><TableCell>{text(doc.construction)}</TableCell><TableCell>{text(doc.color)}</TableCell><TableCell>{text(doc.owner)}</TableCell><TableCell className="whitespace-nowrap">{dateText(doc.at)}{isCostSheetStale(doc) ? <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-2 py-0.5 text-[11px] text-[var(--warning)]">{staleDays}일 경과</span> : null}</TableCell><TableCell>v{doc.version}</TableCell><TableCell className="tabular-nums">{won(doc.sheet.result.netKrwPerYd)}</TableCell><TableCell className="tabular-nums">{usd(doc.sheet.result.netPerYd)}</TableCell><TableCell><ExcelButton doc={doc} /></TableCell></TableRow>
        }) : <TableRow><TableCell colSpan={12} className="h-32 text-center text-[var(--muted-foreground)]">표시할 원가계산서가 없습니다.</TableCell></TableRow>}
      </TableBody></Table></div></CardContent>
    </Card>

    {versions.length ? <Card className="border-[var(--border)]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:translate-y-0 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader><CardTitle className="text-base font-medium">버전 상세 · {versions[0].flNo || versions[0].styleNo}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["버전", "계산일", "작성자", "Net 원/yd", "", ""].map((head, index) => <TableHead key={`${head}-${index}`}>{head}</TableHead>)}</TableRow></TableHeader><TableBody>{versions.map((doc) => <TableRow key={doc.id}><TableCell>v{doc.version}</TableCell><TableCell>{dateText(doc.at)}</TableCell><TableCell>{text(doc.by)}</TableCell><TableCell>{won(doc.sheet.result.netKrwPerYd)}</TableCell><TableCell><ExcelButton doc={doc} /></TableCell><TableCell><Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs"><Link to={`/development/workspace?focus=${encodeURIComponent(doc.rowKey)}`}>DD 행 열기</Link></Button></TableCell></TableRow>)}</TableBody></Table></div>
        {versions.length >= 2 ? <div className="space-y-3"><div className="flex flex-wrap items-center gap-2 text-sm"><span>비교</span><select value={beforeId} onChange={(event) => setBeforeId(event.target.value)} className="h-8 rounded border border-[var(--input)] bg-[var(--background)] px-2">{versions.map((doc) => <option key={doc.id} value={doc.id}>v{doc.version} · {dateText(doc.at)}</option>)}</select><span>→</span><select value={afterId} onChange={(event) => setAfterId(event.target.value)} className="h-8 rounded border border-[var(--input)] bg-[var(--background)] px-2">{versions.map((doc) => <option key={doc.id} value={doc.id}>v{doc.version} · {dateText(doc.at)}</option>)}</select></div><div className="overflow-x-auto"><Table><TableHeader><TableRow>{["항목", "이전", "이후", "차이", "증감%"].map((head) => <TableHead key={head}>{head}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.map((item) => <TableRow key={item.label}><TableCell>{item.label}</TableCell><TableCell className="tabular-nums">{item.prev.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</TableCell><TableCell className="tabular-nums">{item.next.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</TableCell><TableCell className="tabular-nums">{item.diff.toLocaleString("ko-KR", { maximumFractionDigits: 4, signDisplay: "exceptZero" })}</TableCell><TableCell className="tabular-nums" style={{ color: item.diff > 0 ? "var(--destructive)" : item.diff < 0 ? "var(--chart-2)" : undefined }}>{item.diffPct.toLocaleString("ko-KR", { maximumFractionDigits: 1, signDisplay: "exceptZero" })}%</TableCell></TableRow>)}</TableBody></Table></div></div> : <p className="text-sm text-[var(--muted-foreground)]">비교할 이전 버전이 없습니다.</p>}
      </CardContent>
    </Card> : null}
  </section>
}
