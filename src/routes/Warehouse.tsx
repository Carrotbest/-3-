import { useMemo, useState } from "react"
import { ArchiveRestore, Boxes, PackageCheck, PackageOpen, Search, Trash2 } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FABRIC_STATUS_META, buildFabricLedger, fabricRecordIdentity, type FabricLedgerItem } from "@/data/fabric-ledger"
import { fmtDateFull } from "@/data/format"
import type { FabricLedgerAction, FabricLedgerStatus } from "@/data/schema"
import { ingestSamples } from "@/data/upload"
import { applyFabricAction, useAppStore } from "@/store/useAppStore"

type WarehouseTab = "READY" | "WAREHOUSE" | "EXHAUSTED" | "DISPOSED"

const TAB_META: Record<WarehouseTab, { label: string; description: string }> = {
  READY: { label: "입고 대기", description: "DD 완료 또는 샘플대장 현황 중 아직 R&D No.가 없는 항목" },
  WAREHOUSE: { label: "창고 보관", description: "4자리 R&D No.로 입고 등록되어 보관 중인 원단" },
  EXHAUSTED: { label: "소진 완료", description: "사용이 완료되어 재고가 없는 원단" },
  DISPOSED: { label: "폐기", description: "폐기 처리되어 이력만 보관하는 원단" },
}

function statusBadge(status: FabricLedgerStatus) {
  const meta = FABRIC_STATUS_META[status]
  return <Badge variant="outline" className="gap-1.5 whitespace-nowrap"><span className={`size-2 rounded-full ${meta.tone}`} />{meta.label}</Badge>
}

function maxStorageNumber(items: readonly FabricLedgerItem[]): number {
  return items.reduce((max, item) => {
    const matched = item.storageNo.trim().match(/^\d{4}/)?.[0]
    return matched ? Math.max(max, Number(matched)) : max
  }, 0)
}

export function Warehouse() {
  const records = useAppStore((state) => state.records)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides), [overrides, records, samples])
  const [tab, setTab] = useState<WarehouseTab>("READY")
  const [search, setSearch] = useState("")
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [actionItem, setActionItem] = useState<FabricLedgerItem | null>(null)
  const [action, setAction] = useState<FabricLedgerAction | null>(null)
  const [note, setNote] = useState("")

  const counts = useMemo(() => Object.fromEntries((Object.keys(TAB_META) as WarehouseTab[]).map((key) => [key, ledger.filter((item) => item.status === key).length])) as Record<WarehouseTab, number>, [ledger])
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return ledger.filter((item) => item.status === tab).filter((item) => !query || [item.storageNo, item.styleNo, item.flNo, item.season, item.buyer, item.owner, item.construction].some((value) => String(value).toLocaleLowerCase("ko-KR").includes(query)))
  }, [ledger, search, tab])

  const toggleChecked = (key: string, selected: boolean) => {
    setChecked((current) => {
      const next = new Set(current)
      if (selected) next.add(key); else next.delete(key)
      return next
    })
  }

  const receiveChecked = async () => {
    const targets = rows.filter((item) => checked.has(item.key) && item.status === "READY")
    let nextNumber = maxStorageNumber(ledger)
    for (const item of targets) {
      nextNumber += 1
      await applyFabricAction({ fabricKey: item.key, action: "RECEIVE", fromStatus: "READY", toStatus: "WAREHOUSE", storageNo: String(nextNumber).padStart(4, "0"), note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })
    }
    setChecked(new Set())
    setTab("WAREHOUSE")
  }

  const openAction = (item: FabricLedgerItem, nextAction: FabricLedgerAction) => {
    setActionItem(item)
    setAction(nextAction)
    setNote("")
  }

  const confirmAction = async () => {
    if (!actionItem || !action) return
    const toStatus: FabricLedgerStatus = action === "EXHAUST" ? "EXHAUSTED" : action === "DISPOSE" ? "DISPOSED" : "WAREHOUSE"
    if ((action === "EXHAUST" || action === "DISPOSE") && !note.trim()) return
    await applyFabricAction({ fabricKey: actionItem.key, action, fromStatus: actionItem.status, toStatus, note, storageNo: actionItem.storageNo, recordIdentity: fabricRecordIdentity(actionItem.record) })
    setActionItem(null)
    setAction(null)
    setNote("")
    setTab(toStatus as WarehouseTab)
  }

  const columns = useMemo<DataTableColumn<FabricLedgerItem>[]>(() => [
    ...(tab === "READY" ? [{ id: "check", header: "입고", cell: (item: FabricLedgerItem) => <Checkbox aria-label={`${item.styleNo} 입고 선택`} checked={checked.has(item.key)} onCheckedChange={(value) => toggleChecked(item.key, value === true)} /> }] : []),
    { id: "storage", header: "R&D No.", accessor: (item) => item.storageNo, cell: (item) => <span className="font-mono font-semibold">{item.storageNo || "자동 채번"}</span> },
    { id: "status", header: "상태", accessor: (item) => item.status, cell: (item) => statusBadge(item.status) },
    { id: "style", header: "Style No.", accessor: (item) => item.styleNo, cell: (item) => <span className="font-mono">{item.styleNo || "—"}</span> },
    { id: "fl", header: "FL No.", accessor: (item) => item.flNo, cell: (item) => <span className="font-mono">{item.flNo || "—"}</span> },
    { id: "season", header: "Season", accessor: (item) => item.season },
    { id: "buyer", header: "Buyer", accessor: (item) => item.buyer },
    { id: "owner", header: "Developer", accessor: (item) => item.owner },
    { id: "completed", header: "완료일", accessor: (item) => item.completedAt, cell: (item) => item.completedAt ? fmtDateFull(item.completedAt) : "—" },
    { id: "source", header: "원본", accessor: (item) => item.sourceSheet, cell: (item) => <span className="text-xs text-[var(--muted-foreground)]">{item.sample?.sourceSheet || "DD"}</span> },
    { id: "action", header: "처리", cell: (item) => item.status === "WAREHOUSE" ? <div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={() => openAction(item, "EXHAUST")}><PackageOpen />소진</Button><Button type="button" size="sm" variant="outline" onClick={() => openAction(item, "DISPOSE")}><Trash2 />폐기</Button></div> : item.status === "EXHAUSTED" || item.status === "DISPOSED" ? <Button type="button" size="sm" variant="outline" onClick={() => openAction(item, "RESTORE")}><ArchiveRestore />창고 복구</Button> : null },
  ], [checked, tab])

  const statusKeys = Object.keys(TAB_META) as WarehouseTab[]
  const totalCount = statusKeys.reduce((sum, key) => sum + counts[key], 0)

  return <section className="min-w-0 space-y-6">
    <PageHeader title="SAMPLE WAREHOUSE" subtitle="완료 샘플의 4자리 R&D No. 입고부터 보관·소진·폐기까지 한 이력으로 관리합니다." actions={<DataUpload kind="development-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} />} />

    <div className="grid gap-4 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-8">
    <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-4">{(Object.keys(TAB_META) as WarehouseTab[]).map((key) => <button key={key} type="button" onClick={() => { setTab(key); setChecked(new Set()) }} className={`rounded-[var(--radius)] border bg-[var(--card)] p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 ${tab === key ? "border-[var(--primary)] shadow-md" : "border-[var(--border)]"}`}><div className="flex items-center justify-between">{statusBadge(key)}<strong className="text-2xl tabular-nums">{counts[key].toLocaleString("ko-KR")}</strong></div><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{TAB_META[key].description}</p></button>)}</div>
      </div>
      <div className="min-w-0 xl:col-span-4">
        <div className="flex h-full flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">상태 분포</h2>
            <span className="text-xs text-[var(--muted-foreground)]">총 <span className="font-semibold tabular-nums text-[var(--foreground)]">{totalCount.toLocaleString("ko-KR")}</span>건</span>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]" role="img" aria-label={`상태 분포 — ${statusKeys.map((key) => `${TAB_META[key].label} ${counts[key]}건`).join(", ")}`}>
            {statusKeys.map((key) => counts[key] > 0 ? <div key={key} className={FABRIC_STATUS_META[key].tone} style={{ width: `${(counts[key] / (totalCount || 1)) * 100}%` }} /> : null)}
          </div>
          <ul className="mt-4 space-y-2">
            {statusKeys.map((key) => (
              <li key={key} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-[var(--foreground)]"><span className={`size-2 rounded-full ${FABRIC_STATUS_META[key].tone}`} />{TAB_META[key].label}</span>
                <span className="tabular-nums text-[var(--muted-foreground)]"><span className="font-medium text-[var(--foreground)]">{counts[key].toLocaleString("ko-KR")}</span>건 · {totalCount ? Math.round((counts[key] / totalCount) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>

    <Tabs value={tab} onValueChange={(value) => { setTab(value as WarehouseTab); setChecked(new Set()) }}><TabsList>{(Object.keys(TAB_META) as WarehouseTab[]).map((key) => <TabsTrigger key={key} value={key}>{TAB_META[key].label}</TabsTrigger>)}</TabsList></Tabs>

    <SectionCard title={TAB_META[tab].label} subtitle={`${rows.length.toLocaleString("ko-KR")}건 · ${tab === "READY" ? "체크 후 입고 등록하면 현재 최대 R&D No. 다음 4자리 번호가 순서대로 부여됩니다." : "원본 시트 상태와 웹 처리 이력을 함께 반영합니다."}`} contentClassName="p-0">
      <DataTable columns={columns} rows={rows} getRowId={(item) => item.key} pageSize={25} emptyMessage={`${TAB_META[tab].label} 항목이 없습니다.`} toolbar={<div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label className="relative block min-w-0 flex-1 sm:max-w-md"><span className="sr-only">창고 검색</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="R&D No., Style, FL, Buyer 검색" className="pl-9" /></label>{tab === "READY" ? <Button type="button" disabled={!checked.size} onClick={() => void receiveChecked()}><PackageCheck />선택 {checked.size}건 입고 등록</Button> : null}</div>} />
    </SectionCard>

    <Sheet open={Boolean(actionItem)} onOpenChange={(open) => { if (!open) { setActionItem(null); setAction(null); setNote("") } }}><SheetContent><SheetHeader><SheetTitle>{action === "EXHAUST" ? "소진 완료" : action === "DISPOSE" ? "폐기 처리" : "창고 복구"}</SheetTitle><SheetDescription>{actionItem?.storageNo} · {actionItem?.styleNo}</SheetDescription></SheetHeader>{action === "EXHAUST" || action === "DISPOSE" ? <div className="mt-6 grid gap-2"><Label htmlFor="warehouse-note">처리 사유 *</Label><textarea id="warehouse-note" value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]" /></div> : null}<div className="mt-6 flex justify-end"><Button type="button" disabled={(action === "EXHAUST" || action === "DISPOSE") && !note.trim()} onClick={() => void confirmAction()}><Boxes />처리 확정</Button></div></SheetContent></Sheet>
  </section>
}
