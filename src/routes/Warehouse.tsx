import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { ArchiveRestore, GripVertical, PackageCheck, PackageOpen, Pencil, Search, Send, Trash2 } from "lucide-react"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { DataUpload } from "@/components/upload/DataUpload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FABRIC_STATUS_META, buildFabricLedger, fabricRecordIdentity, type FabricLedgerItem } from "@/data/fabric-ledger"
import { fmtDateFull } from "@/data/format"
import type { FabricLedgerStatus } from "@/data/schema"
import { ingestSamples } from "@/data/upload"
import { useInView } from "@/lib/useInView"
import { applyFabricAction, useAppStore } from "@/store/useAppStore"

type WarehouseTab = "READY" | "WAREHOUSE" | "EXHAUSTED" | "DISPOSED"
type DisposalReason = "용량 초과" | "품질 불량"
type ActionKind = "RECEIVE" | "DISPOSE" | "STOCK" | "OUTBOUND" | "EXHAUST" | "RESTORE"

interface ActionDialogState {
  kind: ActionKind
  keys: string[]
}

const TAB_META: Record<WarehouseTab, { label: string; description: string }> = {
  READY: { label: "입고 대기", description: "완료 후 R&D No. 채번을 기다리는 원단" },
  WAREHOUSE: { label: "창고 보관", description: "재고와 출고 잔량을 관리하는 원단" },
  EXHAUSTED: { label: "소진 완료", description: "잔량이 없거나 수동 소진된 원단" },
  DISPOSED: { label: "폐기", description: "용량 초과 또는 품질 불량으로 폐기된 원단" },
}

const CORE_HEADERS = [
  { id: "storageNo", label: "R&D No." },
  { id: "styleNo", label: "Style No." },
  { id: "flNo", label: "FL No." },
  { id: "season", label: "Season" },
  { id: "category", label: "Category" },
  { id: "buyer", label: "Buyer" },
  { id: "owner", label: "담당" },
  { id: "construction", label: "조직" },
  { id: "weight", label: "중량" },
  { id: "completedAt", label: "완료일" },
  { id: "inventory", label: "재고/잔량" },
] as const

const DISPOSAL_REASONS: DisposalReason[] = ["용량 초과", "품질 불량"]
const TAB_ORDER: WarehouseTab[] = ["READY", "WAREHOUSE", "EXHAUSTED", "DISPOSED"]

/** 탭·상태별 고정 액센트. 모든 탭에서 열 구성이 같으므로 색으로만 맥락을 구분한다. */
const TAB_ACCENT: Record<WarehouseTab, { fill: string; dot: string; active: string; badge: string; bar: string; drop: string; rowBar: string; borderTop: string }> = {
  READY: { fill: "bg-amber-500", dot: "bg-amber-500", active: "data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", bar: "bg-amber-500", drop: "ring-2 ring-amber-500 bg-amber-500/15", rowBar: "border-l-amber-500", borderTop: "border-t-amber-500" },
  WAREHOUSE: { fill: "bg-emerald-500", dot: "bg-emerald-500", active: "data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", drop: "ring-2 ring-emerald-500 bg-emerald-500/15", rowBar: "border-l-emerald-500", borderTop: "border-t-emerald-500" },
  EXHAUSTED: { fill: "bg-slate-500", dot: "bg-slate-500", active: "data-[state=active]:bg-slate-500/15 data-[state=active]:text-slate-700 dark:data-[state=active]:text-slate-300", badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300", bar: "bg-slate-500", drop: "ring-2 ring-slate-500 bg-slate-500/15", rowBar: "border-l-slate-500", borderTop: "border-t-slate-500" },
  DISPOSED: { fill: "bg-rose-500", dot: "bg-rose-500", active: "data-[state=active]:bg-rose-500/15 data-[state=active]:text-rose-700 dark:data-[state=active]:text-rose-300", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300", bar: "bg-rose-500", drop: "ring-2 ring-rose-500 bg-rose-500/15", rowBar: "border-l-rose-500", borderTop: "border-t-rose-500" },
}

/** 탭을 넘겨도 열 경계가 흔들리지 않도록 폭은 단 하나만 쓴다(체크·처리 열 항상 렌더). */
const GRIP_WIDTH = "w-[4%]"
const ACTION_WIDTH = "w-[12%]"
const COLUMN_WIDTHS = ["w-[7%]", "w-[9%]", "w-[8%]", "w-[6%]", "w-[8%]", "w-[8%]", "w-[6%]", "w-[8%]", "w-[5%]", "w-[8%]", "w-[11%]"]

/** DEVELOPMENT Overview와 동일한 게이지 모션(1500ms · easeInOutCubic). */
const GAUGE_MS = 1500
const GAUGE_EASE = "duration-[1500ms] [transition-timing-function:cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"

/** 드래그앤드롭 전이 매트릭스. 유효하지 않은 조합은 null. */
function dropActionFor(from: WarehouseTab, target: WarehouseTab): ActionKind | null {
  if (from === "READY" && target === "WAREHOUSE") return "RECEIVE"
  if ((from === "READY" || from === "WAREHOUSE") && target === "DISPOSED") return "DISPOSE"
  if (from === "WAREHOUSE" && target === "EXHAUSTED") return "EXHAUST"
  if ((from === "EXHAUSTED" || from === "DISPOSED") && (target === "WAREHOUSE" || target === "READY")) return "RESTORE"
  return null
}

function localDateValue(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatYds(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

function maxStorageNumber(items: readonly FabricLedgerItem[]): number {
  return items.reduce((max, item) => {
    const matched = item.storageNo.trim().match(/^\d{4}(?!\d)/)?.[0]
    return matched ? Math.max(max, Number(matched)) : max
  }, 0)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
}

function TextCell({ value, mono = false }: { value: unknown; mono?: boolean }) {
  const text = String(value ?? "").trim() || "—"
  return <span title={text} className={`block truncate ${mono ? "font-mono" : ""}`}>{text}</span>
}

function InventoryCell({ item }: { item: FabricLedgerItem }) {
  if (item.status === "READY" || item.status === "DISPOSED") return <span className="text-[var(--muted-foreground)]">—</span>
  if (item.status === "EXHAUSTED") return <span className="font-semibold text-[var(--destructive)]">소진(0)</span>
  if (item.yds === null || item.balance === null) return <span className="text-[var(--muted-foreground)]">미기입</span>
  return (
    <span className="block truncate" title={`보유 ${formatYds(item.yds)} · 잔량 ${formatYds(item.balance)} yds`}>
      보유 {formatYds(item.yds)} · <strong className="text-[var(--primary)]">잔량 {formatYds(item.balance)} yds</strong>
    </span>
  )
}

function processDetails(item: FabricLedgerItem): { label: string; value: string }[] {
  const mills = item.record?.tech?.mills
  const dates = item.record?.tech?.processDates
  const combine = (...values: (string | undefined)[]) => values.map((value) => value?.trim()).filter(Boolean).join(" · ") || "—"
  return [
    { label: "원사", value: combine(item.sample?.process.yarn, mills?.yarn, dates?.yarn) },
    { label: "편직", value: combine(item.sample?.process.knit, mills?.knitting, dates?.knitting) },
    { label: "염색", value: combine(item.sample?.process.dye, mills?.dyeing, dates?.dyeing) },
    { label: "가공", value: combine(item.sample?.process.finish, mills?.finishing, dates?.finishing) },
  ]
}

function shrinkageText(item: FabricLedgerItem): string {
  const shrinkage = item.sample?.inhouse.shrinkagePct
  if (typeof shrinkage === "number") return `${shrinkage}%`
  const length = shrinkage?.length ?? item.record?.tech?.actual?.shrinkageLength
  const width = shrinkage?.width ?? item.record?.tech?.actual?.shrinkageWidth
  if (length === null || length === undefined) return width === null || width === undefined ? "—" : `위 ${width}%`
  return width === null || width === undefined ? `경 ${length}%` : `경 ${length}% · 위 ${width}%`
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-[var(--radius)] bg-[var(--muted)] px-3 py-2"><dt className="text-xs text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 truncate text-sm font-medium" title={typeof children === "string" ? children : undefined}>{children}</dd></div>
}

/** 컴팩트 KPI 타일. 표 높이를 뺏지 않도록 고정 높이로 유지한다. */
function KpiTile({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <p className="truncate text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <div className="mt-0.5 min-w-0">{children}</div>
      <div className="mt-1 min-h-4 min-w-0">{footer}</div>
    </div>
  )
}

/** 인뷰 진입 시 채워지는 단색 진행바. */
function KpiBar({ pct, className }: { pct: number; className: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  return (
    <div ref={ref} className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
      <div className={`h-full rounded-full transition-[width] ${GAUGE_EASE} ${className}`} style={{ width: `${inView ? Math.min(100, Math.max(0, pct)) : 0}%` }} />
    </div>
  )
}

/** 4상태 비율 스택바 — 세그먼트를 누르면 해당 탭으로 이동한다. */
function StatusMixBar({ counts, total, onPick }: { counts: Record<WarehouseTab, number>; total: number; onPick: (tab: WarehouseTab) => void }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  return (
    <div ref={ref} className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]" role="img" aria-label={`상태 분포 — ${TAB_ORDER.map((key) => `${TAB_META[key].label} ${counts[key]}건`).join(", ")}`}>
      {TAB_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          tabIndex={counts[key] ? 0 : -1}
          title={`${TAB_META[key].label} ${counts[key].toLocaleString("ko-KR")}건`}
          aria-label={`${TAB_META[key].label} 탭으로 이동`}
          onClick={() => onPick(key)}
          className={`h-full transition-[width] ${GAUGE_EASE} ${TAB_ACCENT[key].fill}`}
          style={{ width: `${inView && total ? (counts[key] / total) * 100 : 0}%` }}
        />
      ))}
    </div>
  )
}

/** 탭 전환 시 짧은 페이드+슬라이드. */
function TabFade({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    setShown(false)
    const frame = window.requestAnimationFrame(() => setShown(true))
    return () => window.cancelAnimationFrame(frame)
  }, [tabKey])
  return (
    <div className={`flex min-h-0 flex-1 flex-col transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
      {children}
    </div>
  )
}

export function Warehouse() {
  const records = useAppStore((state) => state.records)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const fabricEvents = useAppStore((state) => state.fabricEvents)
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents), [fabricEvents, overrides, records, samples])
  const [tab, setTab] = useState<WarehouseTab>("READY")
  const [search, setSearch] = useState("")
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null)
  const [receiveYds, setReceiveYds] = useState<Record<string, string>>({})
  const [stockYds, setStockYds] = useState("")
  const [recipient, setRecipient] = useState("")
  const [outboundQty, setOutboundQty] = useState("")
  const [outboundDate, setOutboundDate] = useState(localDateValue)
  const [disposalReason, setDisposalReason] = useState<DisposalReason | "">("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [dragKeys, setDragKeys] = useState<string[] | null>(null)
  const [dropTab, setDropTab] = useState<WarehouseTab | null>(null)
  // 행 위 드래그 = 범위 선택. 클릭(상세 열기)과 충돌하지 않도록 이동 여부를 따로 기억한다.
  const dragAnchorRef = useRef<number | null>(null)
  const rangeDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)

  const counts = useMemo(() => Object.fromEntries((Object.keys(TAB_META) as WarehouseTab[]).map((key) => [key, ledger.filter((item) => item.status === key).length])) as Record<WarehouseTab, number>, [ledger])
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return ledger.filter((item) => item.status === tab).filter((item) => !query || [item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner, item.construction].some((value) => String(value).toLocaleLowerCase("ko-KR").includes(query)))
  }, [ledger, search, tab])
  const ledgerByKey = useMemo(() => new Map(ledger.map((item) => [item.key, item])), [ledger])
  const detailItem = detailKey ? ledgerByKey.get(detailKey) ?? null : null
  const actionItems = actionDialog?.keys.map((key) => ledgerByKey.get(key)).filter((item): item is FabricLedgerItem => Boolean(item)) ?? []
  const selectedRows = rows.filter((item) => checked.has(item.key))
  const allRowsSelected = rows.length > 0 && rows.every((item) => checked.has(item.key))
  const someRowsSelected = rows.some((item) => checked.has(item.key))
  const accent = TAB_ACCENT[tab]

  // KPI — 탭 badge와 겹치지 않는 재고·출고 관점 지표.
  const kpi = useMemo(() => {
    const stored = ledger.filter((item) => item.status === "WAREHOUSE")
    const stockTotal = stored.reduce((sum, item) => sum + (item.yds ?? 0), 0)
    const balanceTotal = stored.reduce((sum, item) => sum + (item.balance ?? 0), 0)
    const outboundTotal = ledger.reduce((sum, item) => sum + item.outboundTotal, 0)
    const outboundCount = ledger.reduce((sum, item) => sum + item.outbound.length, 0)
    const missingStock = stored.filter((item) => item.yds === null).length
    const shipped = stockTotal + outboundTotal
    return {
      stockTotal,
      balanceTotal,
      outboundTotal,
      outboundCount,
      missingStock,
      usedPct: shipped > 0 ? (outboundTotal / shipped) * 100 : 0,
      nextNo: String(Math.min(9999, maxStorageNumber(ledger) + 1)).padStart(4, "0"),
    }
  }, [ledger])

  useEffect(() => {
    const finish = () => {
      rangeDraggingRef.current = false
      dragAnchorRef.current = null
    }
    window.addEventListener("mouseup", finish)
    return () => window.removeEventListener("mouseup", finish)
  }, [])

  const changeTab = (next: WarehouseTab) => {
    setTab(next)
    setChecked(new Set())
    setDragKeys(null)
    setDropTab(null)
  }

  const toggleChecked = (key: string, selected: boolean) => {
    setChecked((current) => {
      const next = new Set(current)
      if (selected) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleAll = () => {
    setChecked((current) => {
      const next = new Set(current)
      rows.forEach((item) => allRowsSelected ? next.delete(item.key) : next.add(item.key))
      return next
    })
  }

  /** 행 본문 mousedown — 이 시점엔 선택을 바꾸지 않는다(단순 클릭은 상세 열기). */
  const beginRangeSelect = (event: MouseEvent<HTMLTableRowElement>, index: number) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest("[data-no-range]")) return
    dragAnchorRef.current = index
    rangeDraggingRef.current = true
    suppressClickRef.current = false
  }

  /** 드래그로 지나간 행까지 연속 선택. 실제로 이동했을 때만 선택을 갱신한다. */
  const extendRangeSelect = (index: number) => {
    const anchor = dragAnchorRef.current
    if (!rangeDraggingRef.current || anchor === null || anchor === index) return
    suppressClickRef.current = true
    const [first, last] = anchor <= index ? [anchor, index] : [index, anchor]
    setChecked(new Set(rows.slice(first, last + 1).map((item) => item.key)))
  }

  const openDetail = (key: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setDetailKey(key)
  }

  /** 그립 핸들 드래그 — 선택 전체(핸들 행이 미선택이면 그 행만)를 끌고 간다. */
  const startRowDrag = (event: DragEvent<HTMLSpanElement>, item: FabricLedgerItem) => {
    const keys = checked.has(item.key) ? rows.filter((row) => checked.has(row.key)).map((row) => row.key) : [item.key]
    setDragKeys(keys)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", keys.join(","))
  }

  const endRowDrag = () => {
    setDragKeys(null)
    setDropTab(null)
  }

  const handleTabDrop = (target: WarehouseTab) => {
    const keys = dragKeys ?? []
    const kind = dropActionFor(tab, target)
    setDragKeys(null)
    setDropTab(null)
    if (!kind || !keys.length) return
    const items = keys.map((key) => ledgerByKey.get(key)).filter((item): item is FabricLedgerItem => Boolean(item))
    if (items.length) openAction(kind, items)
  }

  const closeActionDialog = () => {
    setActionDialog(null)
    setFormError("")
    setSaving(false)
  }

  const openAction = (kind: ActionKind, items: readonly FabricLedgerItem[]) => {
    if (!items.length) return
    setActionDialog({ kind, keys: items.map((item) => item.key) })
    setFormError("")
    setReceiveYds(Object.fromEntries(items.map((item) => [item.key, item.yds === null ? "" : String(item.yds)])))
    setStockYds(items[0].yds === null ? "" : String(items[0].yds))
    setRecipient("")
    setOutboundQty("")
    setOutboundDate(localDateValue())
    setDisposalReason("")
  }

  const stopAndOpen = (event: MouseEvent, kind: ActionKind, item: FabricLedgerItem) => {
    event.stopPropagation()
    openAction(kind, [item])
  }

  const runAction = async () => {
    if (!actionDialog || !actionItems.length) return
    setFormError("")
    setSaving(true)
    try {
      if (actionDialog.kind === "RECEIVE") {
        let nextNumber = maxStorageNumber(ledger)
        if (nextNumber + actionItems.length > 9999) throw new Error("4자리 R&D No. 범위를 초과해 입고할 수 없습니다.")
        const parsedYds = actionItems.map((item) => {
          const raw = receiveYds[item.key]?.trim() ?? ""
          const yds = raw ? Number(raw) : undefined
          if (yds !== undefined && (!Number.isFinite(yds) || yds < 0)) throw new Error("입고 수량은 0 이상의 숫자로 입력하세요.")
          return yds
        })
        for (const [index, item] of actionItems.entries()) {
          nextNumber += 1
          await applyFabricAction({ fabricKey: item.key, action: "RECEIVE", fromStatus: "READY", toStatus: "WAREHOUSE", storageNo: String(nextNumber).padStart(4, "0"), yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })
        }
        setChecked(new Set())
        setTab("WAREHOUSE")
      } else if (actionDialog.kind === "DISPOSE") {
        if (!disposalReason) throw new Error("폐기 사유를 선택하세요.")
        for (const item of actionItems) {
          if (item.status !== "READY" && item.status !== "WAREHOUSE") continue
          await applyFabricAction({ fabricKey: item.key, action: "DISPOSE", fromStatus: item.status, toStatus: "DISPOSED", storageNo: item.storageNo, reason: disposalReason, note: `폐기: ${disposalReason}` })
        }
        setChecked(new Set())
        setTab("DISPOSED")
      } else if (actionDialog.kind === "STOCK") {
        const item = actionItems[0]
        const yds = Number(stockYds)
        if (!stockYds.trim() || !Number.isFinite(yds) || yds < 0) throw new Error("보유 재고를 0 이상의 숫자로 입력하세요.")
        await applyFabricAction({ fabricKey: item.key, action: "NOTE", fromStatus: item.status, toStatus: item.status, storageNo: item.storageNo, yds, note: "보유 재고 수정" })
        if (yds - item.outboundTotal <= 0) setTab("EXHAUSTED")
      } else if (actionDialog.kind === "OUTBOUND") {
        const item = actionItems[0]
        const qty = Number(outboundQty)
        if (item.balance === null) throw new Error("먼저 보유 재고를 입력하세요.")
        if (!recipient.trim()) throw new Error("수령자를 입력하세요.")
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("출고 수량을 0보다 큰 숫자로 입력하세요.")
        if (qty > item.balance) throw new Error(`현재 잔량 ${formatYds(item.balance)} yds를 초과할 수 없습니다.`)
        if (!outboundDate) throw new Error("출고 날짜를 선택하세요.")
        await applyFabricAction({ fabricKey: item.key, action: "OUTBOUND", fromStatus: "WAREHOUSE", toStatus: "WAREHOUSE", storageNo: item.storageNo, qty, to: recipient, date: outboundDate, note: "출고 등록" })
        if (qty >= item.balance) setTab("EXHAUSTED")
      } else if (actionDialog.kind === "EXHAUST") {
        for (const item of actionItems) {
          if (item.status !== "WAREHOUSE") continue
          await applyFabricAction({ fabricKey: item.key, action: "EXHAUST", fromStatus: item.status, toStatus: "EXHAUSTED", storageNo: item.storageNo, note: "수동 소진 완료" })
        }
        setChecked(new Set())
        setTab("EXHAUSTED")
      } else {
        let restoreStatus: WarehouseTab = "WAREHOUSE"
        for (const item of actionItems) {
          if (item.status !== "EXHAUSTED" && item.status !== "DISPOSED") continue
          const disposedEvent = fabricEvents.find((event) => event.fabricKey === item.key && event.action === "DISPOSE")
          restoreStatus = item.status === "DISPOSED" && disposedEvent?.fromStatus === "READY" ? "READY" : "WAREHOUSE"
          await applyFabricAction({ fabricKey: item.key, action: "RESTORE", fromStatus: item.status, toStatus: restoreStatus, storageNo: item.storageNo, note: "상태 복구" })
        }
        setChecked(new Set())
        setTab(restoreStatus)
      }
      closeActionDialog()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.")
      setSaving(false)
    }
  }

  const coreCell = (item: FabricLedgerItem, id: (typeof CORE_HEADERS)[number]["id"]): ReactNode => {
    if (id === "storageNo") return <TextCell value={item.storageNo || (item.status === "READY" ? "자동 채번" : "—")} mono />
    if (id === "styleNo") return <TextCell value={item.styleNo} mono />
    if (id === "flNo") return <TextCell value={item.flNo} mono />
    if (id === "season") return <TextCell value={item.season} />
    if (id === "category") return <TextCell value={item.category} />
    if (id === "buyer") return <TextCell value={item.buyer} />
    if (id === "owner") return <TextCell value={item.owner} />
    if (id === "construction") return <TextCell value={item.construction} />
    if (id === "weight") return <TextCell value={item.weight === "" ? "—" : `${item.weight} gsm`} />
    if (id === "completedAt") return <TextCell value={item.completedAt ? fmtDateFull(item.completedAt) : "—"} />
    return <InventoryCell item={item} />
  }

  const actionCell = (item: FabricLedgerItem) => {
    if (item.status === "READY") return <span className="text-xs text-[var(--muted-foreground)]">선택 처리</span>
    if (item.status === "WAREHOUSE") return <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      <Button type="button" size="icon" variant="outline" className="size-7" title="재고 기입·수정" aria-label={`${item.styleNo} 재고 기입·수정`} onClick={(event) => stopAndOpen(event, "STOCK", item)}><Pencil /></Button>
      <Button type="button" size="icon" variant="outline" className="size-7" title="출고" aria-label={`${item.styleNo} 출고`} onClick={(event) => stopAndOpen(event, "OUTBOUND", item)}><Send /></Button>
      <Button type="button" size="icon" variant="outline" className="size-7" title="수동 소진 완료" aria-label={`${item.styleNo} 수동 소진 완료`} onClick={(event) => stopAndOpen(event, "EXHAUST", item)}><PackageOpen /></Button>
      <Button type="button" size="icon" variant="outline" className="size-7" title="폐기" aria-label={`${item.styleNo} 폐기`} onClick={(event) => stopAndOpen(event, "DISPOSE", item)}><Trash2 /></Button>
    </div>
    return <Button type="button" size="sm" variant="outline" onClick={(event) => stopAndOpen(event, "RESTORE", item)}><ArchiveRestore />{item.status === "EXHAUSTED" ? "창고 복구" : "복구"}</Button>
  }

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, item: FabricLedgerItem) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    setDetailKey(item.key)
  }

  const actionTitle = actionDialog?.kind === "RECEIVE" ? "선택 입고 등록"
    : actionDialog?.kind === "DISPOSE" ? "선택 폐기"
      : actionDialog?.kind === "STOCK" ? "보유 재고 수정"
        : actionDialog?.kind === "OUTBOUND" ? "출고 등록"
          : actionDialog?.kind === "EXHAUST" ? "소진 완료"
            : "상태 복구"
  const receiveBaseNo = maxStorageNumber(ledger)
  const disposalEvent = detailItem ? fabricEvents.find((event) => event.fabricKey === detailItem.key && event.action === "DISPOSE") : undefined
  const inhouse = detailItem ? [
    { label: "폭", value: detailItem.sample?.inhouse.widthCm ?? detailItem.record?.tech?.actual?.width, unit: " cm" },
    { label: "중량", value: detailItem.sample?.inhouse.weightGsm ?? detailItem.record?.tech?.actual?.weight, unit: " gsm" },
    { label: "수축", value: shrinkageText(detailItem), unit: "" },
    { label: "필링", value: detailItem.sample?.inhouse.pilling, unit: " 급" },
  ] : []

  const totalCount = TAB_ORDER.reduce((sum, key) => sum + counts[key], 0)
  const dragging = Boolean(dragKeys?.length)

  return <section className="flex h-[calc(100dvh-7rem)] min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
    <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="상태 분포" footer={<StatusMixBar counts={counts} total={totalCount} onPick={changeTab} />}>
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={totalCount} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">건 전체</span>
        </p>
      </KpiTile>

      <KpiTile
        label="창고 재고 (yds)"
        footer={<div className="flex items-center gap-2"><KpiBar pct={kpi.usedPct} className={TAB_ACCENT.WAREHOUSE.bar} /><span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">소진 {Math.round(kpi.usedPct)}%</span></div>}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={Math.round(kpi.balanceTotal)} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">잔량 / 보유 {formatYds(kpi.stockTotal)}</span>
        </p>
      </KpiTile>

      <KpiTile
        label="출고 누계 (yds)"
        footer={<p className="truncate text-[10px] text-[var(--muted-foreground)]">출고 <strong className="tabular-nums text-[var(--foreground)]">{kpi.outboundCount.toLocaleString("ko-KR")}</strong>건{kpi.missingStock ? ` · 재고 미기입 ${kpi.missingStock}건` : ""}</p>}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={Math.round(kpi.outboundTotal)} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">yds</span>
        </p>
      </KpiTile>

      <KpiTile
        label="입고 대기"
        footer={<div className="flex items-center gap-2"><KpiBar pct={totalCount ? (counts.READY / totalCount) * 100 : 0} className={TAB_ACCENT.READY.bar} /><span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">다음 {kpi.nextNo}</span></div>}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={counts.READY} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">건 채번 대기</span>
        </p>
      </KpiTile>
    </div>

    <Tabs value={tab} onValueChange={(value) => changeTab(value as WarehouseTab)} className="min-w-0 shrink-0">
      <TabsList className="flex w-full justify-start gap-1 overflow-x-auto">
        {TAB_ORDER.map((key) => {
          const droppable = dragging && Boolean(dropActionFor(tab, key))
          return <TabsTrigger
            key={key}
            value={key}
            onDragOver={(event) => { if (!droppable) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTab(key) }}
            onDragLeave={() => setDropTab((current) => (current === key ? null : current))}
            onDrop={(event) => { if (!droppable) return; event.preventDefault(); handleTabDrop(key) }}
            className={`min-w-0 flex-1 gap-2 transition-[background-color,box-shadow,opacity] duration-200 motion-reduce:transition-none ${TAB_ACCENT[key].active} ${dropTab === key && droppable ? TAB_ACCENT[key].drop : ""} ${dragging && !droppable ? "opacity-40" : ""}`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TAB_ACCENT[key].dot}`} />
            <span className="truncate">{TAB_META[key].label}</span>
            <Badge variant="secondary" className={`h-5 min-w-5 justify-center px-1.5 tabular-nums ${TAB_ACCENT[key].badge}`}>{counts[key].toLocaleString("ko-KR")}</Badge>
          </TabsTrigger>
        })}
      </TabsList>
    </Tabs>

    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-2 border-[var(--border)] bg-[var(--card)] transition-colors duration-200 motion-reduce:transition-none ${accent.borderTop}`}>
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border)] p-2">
        <label className="relative block min-w-52 flex-1"><span className="sr-only">창고 검색</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="R&D No., Style, FL, Buyer 검색" className="pl-9" /></label>
        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{TAB_META[tab].label} <strong className="text-[var(--foreground)]">{rows.length.toLocaleString("ko-KR")}</strong>건 · 선택 {selectedRows.length}건</span>
        {tab === "READY" ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => openAction("RECEIVE", selectedRows)}><PackageCheck />선택 입고</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("EXHAUST", selectedRows)}><PackageOpen />일괄 소진</Button> : null}
        {tab === "READY" || tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("DISPOSE", selectedRows)}><Trash2 />일괄 폐기</Button> : null}
        {tab === "EXHAUSTED" || tab === "DISPOSED" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("RESTORE", selectedRows)}><ArchiveRestore />일괄 복구</Button> : null}
        <DataUpload kind="development-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} />
      </div>

      <TabFade tabKey={tab}>
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="w-full table-fixed text-xs">
            <colgroup>
              <col className={GRIP_WIDTH} />
              {COLUMN_WIDTHS.map((width, index) => <col key={CORE_HEADERS[index].id} className={width} />)}
              <col className={ACTION_WIDTH} />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-[var(--card)] shadow-sm">
              <TableRow className="h-9 hover:bg-[var(--card)]">
                <TableHead className="px-1.5 text-center"><Checkbox checked={allRowsSelected ? true : someRowsSelected ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label={`${TAB_META[tab].label} 전체 선택`} /></TableHead>
                {CORE_HEADERS.map((header) => <TableHead key={header.id} className="truncate px-1.5 text-xs" title={header.label}>{header.label}</TableHead>)}
                <TableHead className="px-1.5 text-right text-xs">처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? rows.map((item, index) => {
                const selected = checked.has(item.key)
                return <TableRow
                  key={item.key}
                  className={`h-9 cursor-pointer border-l-2 ${selected ? `${accent.rowBar} bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]` : "border-l-transparent"}`}
                  tabIndex={0}
                  aria-selected={selected}
                  aria-label={`${item.styleNo || item.flNo || "원단"} 상세 보기`}
                  onMouseDown={(event) => beginRangeSelect(event, index)}
                  onMouseEnter={() => extendRangeSelect(index)}
                  onClick={() => openDetail(item.key)}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                >
                  <TableCell className="px-1.5 py-1.5" data-no-range onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      <span
                        draggable
                        onDragStart={(event) => startRowDrag(event, item)}
                        onDragEnd={endRowDrag}
                        title="드래그해서 다른 탭으로 이동"
                        aria-label={`${item.styleNo || item.flNo} 드래그해서 상태 이동`}
                        className="cursor-grab text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] active:cursor-grabbing"
                      >
                        <GripVertical className="size-3.5" />
                      </span>
                      <Checkbox checked={selected} onCheckedChange={(value) => toggleChecked(item.key, value === true)} aria-label={`${item.styleNo || item.flNo} 선택`} />
                    </div>
                  </TableCell>
                  {CORE_HEADERS.map((header) => <TableCell key={header.id} className="min-w-0 px-1.5 py-1.5">{coreCell(item, header.id)}</TableCell>)}
                  <TableCell className="px-1.5 py-1.5 text-right" data-no-range onClick={(event) => event.stopPropagation()}>{actionCell(item)}</TableCell>
                </TableRow>
              }) : <TableRow><TableCell colSpan={CORE_HEADERS.length + 2} className="h-32 text-center text-sm text-[var(--muted-foreground)]">{TAB_META[tab].label} 항목이 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </TabFade>
      <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">행을 드래그하면 여러 건을 한 번에 선택하고, <GripVertical className="inline size-3" aria-hidden="true" /> 핸들을 탭으로 끌면 상태를 옮깁니다. · {TAB_META[tab].description}</div>
    </div>

    <Dialog open={Boolean(detailItem)} onOpenChange={(open) => { if (!open) setDetailKey(null) }}>
      <DialogContent className="max-w-4xl">
        {detailItem ? <>
          <DialogHeader><DialogTitle>원단 상세</DialogTitle><DialogDescription>{detailItem.storageNo || "자동 채번"} · {detailItem.styleNo || detailItem.flNo || "미입력"}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-5">
            <section aria-labelledby="warehouse-detail-core"><h3 id="warehouse-detail-core" className="mb-2 text-sm font-semibold">샘플 관리 정보</h3><dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <DetailValue label="R&D No.">{detailItem.storageNo || "자동 채번"}</DetailValue><DetailValue label="Style No.">{detailItem.styleNo || "—"}</DetailValue><DetailValue label="FL No.">{detailItem.flNo || "—"}</DetailValue><DetailValue label="Season">{detailItem.season || "—"}</DetailValue>
              <DetailValue label="Category">{detailItem.category || "—"}</DetailValue><DetailValue label="Buyer">{detailItem.buyer || "—"}</DetailValue><DetailValue label="담당">{detailItem.owner || "—"}</DetailValue><DetailValue label="조직">{detailItem.construction || "—"}</DetailValue>
              <DetailValue label="중량">{detailItem.weight === "" ? "—" : `${detailItem.weight} gsm`}</DetailValue><DetailValue label="완료일">{detailItem.completedAt ? fmtDateFull(detailItem.completedAt) : "—"}</DetailValue><DetailValue label="Planner">{detailItem.planner || "—"}</DetailValue><DetailValue label="원본">{detailItem.sourceSheet || "—"}</DetailValue>
            </dl></section>
            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-labelledby="warehouse-detail-process"><h3 id="warehouse-detail-process" className="mb-2 text-sm font-semibold">공정 4단계</h3><dl className="grid gap-2 sm:grid-cols-2">{processDetails(detailItem).map((detail) => <DetailValue key={detail.label} label={detail.label}>{detail.value}</DetailValue>)}</dl></section>
              <section aria-labelledby="warehouse-detail-inhouse"><h3 id="warehouse-detail-inhouse" className="mb-2 text-sm font-semibold">in-house 4종</h3><dl className="grid gap-2 sm:grid-cols-2">{inhouse.map((detail) => <DetailValue key={detail.label} label={detail.label}>{detail.value === null || detail.value === undefined ? "—" : `${detail.value}${detail.unit}`}</DetailValue>)}</dl></section>
            </div>
            {(detailItem.status === "WAREHOUSE" || detailItem.status === "EXHAUSTED") ? <section aria-labelledby="warehouse-detail-stock"><div className="mb-2 flex items-center justify-between gap-2"><h3 id="warehouse-detail-stock" className="text-sm font-semibold">출고 이력</h3><span className="text-sm">보유 {detailItem.yds === null ? "—" : `${formatYds(detailItem.yds)} yds`} · <strong className="text-[var(--primary)]">잔량 {detailItem.balance === null ? "—" : `${formatYds(Math.max(0, detailItem.balance))} yds`}</strong></span></div><div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]"><table className="w-full text-sm"><thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]"><tr><th className="px-3 py-2">수령자</th><th className="px-3 py-2 text-right">수량</th><th className="px-3 py-2">날짜</th></tr></thead><tbody>{detailItem.outbound.length ? detailItem.outbound.map((event, index) => <tr key={`${event.date}-${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-2">{event.to}</td><td className="px-3 py-2 text-right tabular-nums">{formatYds(event.qty)} yds</td><td className="px-3 py-2">{fmtDateFull(event.date)}</td></tr>) : <tr><td colSpan={3} className="px-3 py-6 text-center text-[var(--muted-foreground)]">출고 이력이 없습니다.</td></tr>}</tbody></table></div></section> : null}
            {detailItem.status === "DISPOSED" ? <section aria-labelledby="warehouse-detail-dispose"><h3 id="warehouse-detail-dispose" className="mb-2 text-sm font-semibold">폐기 정보</h3><dl className="grid gap-2 sm:grid-cols-3"><DetailValue label="사유">{disposalEvent?.reason || "—"}</DetailValue><DetailValue label="처리자">{disposalEvent?.actor || detailItem.updatedBy || "—"}</DetailValue><DetailValue label="처리 일시">{disposalEvent ? formatDateTime(disposalEvent.occurredAt) : detailItem.updatedAt ? formatDateTime(detailItem.updatedAt) : "—"}</DetailValue></dl></section> : null}
            <section aria-labelledby="warehouse-detail-extra"><h3 id="warehouse-detail-extra" className="mb-2 text-sm font-semibold">기타 원본 값</h3><dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><DetailValue label="컬러">{detailItem.color || "—"}</DetailValue><DetailValue label="염색">{detailItem.dyeing || "—"}</DetailValue><DetailValue label="요청일">{detailItem.requestDate ? fmtDateFull(detailItem.requestDate) : "—"}</DetailValue><DetailValue label="납기">{detailItem.dueDate ? fmtDateFull(detailItem.dueDate) : "—"}</DetailValue><div className="sm:col-span-2 lg:col-span-4"><DetailValue label="비고">{detailItem.note || detailItem.sample?.process.remark || "—"}</DetailValue></div></dl></section>
          </DialogBody>
        </> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open && !saving) closeActionDialog() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{actionTitle}</DialogTitle><DialogDescription>{actionItems.length === 1 ? `${actionItems[0]?.storageNo || "자동 채번"} · ${actionItems[0]?.styleNo || actionItems[0]?.flNo || "원단"}` : `선택한 ${actionItems.length}건을 처리합니다.`}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {actionDialog?.kind === "RECEIVE" ? <div className="space-y-2"><p className="text-xs text-[var(--muted-foreground)]">현재 최대 번호 다음부터 순서대로 4자리 R&D No.가 부여됩니다. yds는 비워 두어도 됩니다.</p>{actionItems.map((item, index) => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{String(receiveBaseNo + index + 1).padStart(4, "0")} · {item.styleNo || item.flNo || "미입력"}</p><p className="truncate text-xs text-[var(--muted-foreground)]">{item.flNo || "FL No. 없음"}</p></div><div className="space-y-1"><Label htmlFor={`receive-yds-${index}`} className="text-xs">보유 yds (옵션)</Label><Input id={`receive-yds-${index}`} type="number" min="0" step="0.01" value={receiveYds[item.key] ?? ""} onChange={(event) => setReceiveYds((current) => ({ ...current, [item.key]: event.target.value }))} /></div></div>)}</div> : null}
          {actionDialog?.kind === "DISPOSE" ? <div className="space-y-2"><Label htmlFor="warehouse-disposal-reason">폐기 사유</Label><Select value={disposalReason} onValueChange={(value) => setDisposalReason(value as DisposalReason)}><SelectTrigger id="warehouse-disposal-reason"><SelectValue placeholder="사유 선택" /></SelectTrigger><SelectContent>{DISPOSAL_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select><p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.length}건에 같은 사유가 기록됩니다.</p></div> : null}
          {actionDialog?.kind === "STOCK" ? <div className="space-y-2"><Label htmlFor="warehouse-stock-yds">보유 재고 (yds)</Label><Input id="warehouse-stock-yds" type="number" min="0" step="0.01" value={stockYds} onChange={(event) => setStockYds(event.target.value)} /><p className="text-xs text-[var(--muted-foreground)]">기존 출고 합계 {formatYds(actionItems[0]?.outboundTotal ?? 0)} yds를 반영해 잔량을 다시 계산합니다.</p></div> : null}
          {actionDialog?.kind === "OUTBOUND" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="warehouse-recipient">수령자</Label><Input id="warehouse-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="수령자를 자유롭게 입력" /></div><div className="space-y-2"><Label htmlFor="warehouse-outbound-qty">수량 (yds)</Label><Input id="warehouse-outbound-qty" type="number" min="0.01" max={actionItems[0]?.balance ?? undefined} step="0.01" value={outboundQty} onChange={(event) => setOutboundQty(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="warehouse-outbound-date">출고 날짜</Label><Input id="warehouse-outbound-date" type="date" value={outboundDate} onChange={(event) => setOutboundDate(event.target.value)} /></div><p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">현재 잔량 {actionItems[0]?.balance === null ? "미기입" : `${formatYds(actionItems[0]?.balance ?? 0)} yds`} · 출고 후 잔량이 0이면 자동으로 소진 완료됩니다.</p></div> : null}
          {actionDialog?.kind === "EXHAUST" ? <p className="text-sm">재고 수량과 관계없이 이 원단을 소진 완료로 이동합니다.</p> : null}
          {actionDialog?.kind === "RESTORE" ? <p className="text-sm">{actionItems[0]?.status === "EXHAUSTED" ? "창고 보관 상태로 복구합니다." : "폐기 전 상태로 복구합니다."}</p> : null}
          {formError ? <p role="alert" className="text-sm text-[var(--destructive)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={closeActionDialog}>취소</Button><Button type="button" variant={actionDialog?.kind === "DISPOSE" ? "destructive" : "default"} disabled={saving} onClick={() => void runAction()}>{saving ? "처리 중…" : "처리 확정"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
