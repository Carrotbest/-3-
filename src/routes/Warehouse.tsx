import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode , type CSSProperties } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ArchiveRestore, Copy, Info, Rows3, PackageCheck, PackageOpen, Pencil, Search, Send, Trash2 } from "lucide-react"

import { NumberTicker } from "@/components/motion/NumberTicker"
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
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { buildFabricLedger, fabricRecordIdentity, type FabricLedgerItem } from "@/data/fabric-ledger"
import { FabricDetailBody } from "@/routes/FabricDetail"
import { fmtDateFull, fmtDateMd } from "@/data/format"
import type { FabricLedgerStatus } from "@/data/schema"
import { WEB_INTAKE_SHEET } from "@/data/schema"
import { useInView } from "@/lib/useInView"
import { addManualIntake, updateManualIntake, applyFabricAction, useAppStore } from "@/store/useAppStore"

type WarehouseTab = "READY" | "WAREHOUSE" | "HISTORY"
type DisposalReason = "용량 초과" | "품질 불량"
type ActionKind = "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "DISPOSE" | "STOCK" | "OUTBOUND" | "EXHAUST" | "RESTORE"

interface ActionDialogState {
  kind: ActionKind
  keys: string[]
}

const TAB_META: Record<WarehouseTab, { label: string; description: string }> = {
  READY: { label: "입고 대기", description: "완료 후 R&D No. 채번을 기다리는 원단" },
  WAREHOUSE: { label: "창고 보관", description: "재고와 출고 잔량을 관리하는 원단" },
  HISTORY: { label: "이력", description: "전량 소진 또는 폐기된 원단" },
}

type WarehouseColumnId = "storageNo" | "styleNo" | "flNo" | "owner" | "stock" | "confirm"
  | "season" | "buyer" | "category" | "requestDate" | "completedAt"
  | "originalRef" | "planner" | "yarnDetail" | "construction" | "weight" | "color" | "dyeing" | "dueDate"
  | "yarnMill" | "yarnDate" | "knittingMill" | "knittingDate" | "dyeingMill" | "dyeingDate" | "finishingMill" | "finishingDate"
  | "actualWidth" | "actualWeight" | "shrinkageLength" | "shrinkageWidth"
  | "knitInch" | "knitGauge" | "knitNeedles" | "loopF" | "loopT" | "loopB"
  | "greigeWidth" | "greigeWeight" | "note"

interface WarehouseColumn {
  id: WarehouseColumnId
  label: string
  width: number
}

interface WarehouseGroup {
  key: "fixed" | "ledger" | "process" | "result"
  label: string
  color: string
  collapsible?: boolean
  columns: readonly WarehouseColumn[]
}

const COLUMN_GROUPS: readonly WarehouseGroup[] = [
  // 열 순서는 샘플관리대장 시트를 그대로 따른다. 재고만 웹에서 더한 칸이라 좌측에 고정한다.
  { key: "fixed", label: "고정", color: "var(--primary)", columns: [
    { id: "storageNo", label: "R&D No.", width: 86 },
    { id: "stock", label: "재고", width: 96 },
    { id: "confirm", label: "입고확인", width: 76 },
  ] },
  { key: "ledger", label: "대장", color: "var(--chart-1)", columns: [
    { id: "season", label: "Season", width: 72 },
    { id: "buyer", label: "Buyer", width: 92 },
    { id: "category", label: "Category", width: 96 },
    { id: "originalRef", label: "Original Ref#", width: 108 },
    { id: "planner", label: "Requester", width: 84 },
    { id: "owner", label: "Developer", width: 84 },
    { id: "styleNo", label: "Style/#", width: 108 },
    { id: "flNo", label: "FL.#", width: 100 },
    { id: "yarnDetail", label: "Yarn", width: 220 },
    { id: "construction", label: "Cons.", width: 124 },
    { id: "weight", label: "Target wt'", width: 80 },
    { id: "actualWidth", label: "Final 폭", width: 76 },
    { id: "actualWeight", label: "Final 중량", width: 82 },
    { id: "color", label: "Color", width: 104 },
    { id: "dyeing", label: "Dyeing Side", width: 88 },
    { id: "requestDate", label: "Request Date", width: 88 },
  ] },
  { key: "process", label: "공정", color: "var(--warning)", collapsible: true, columns: [
    { id: "yarnMill", label: "원사 Mill", width: 88 },
    { id: "yarnDate", label: "Status", width: 78 },
    { id: "knittingMill", label: "편직 Mill", width: 88 },
    { id: "knittingDate", label: "Status", width: 78 },
    { id: "dyeingMill", label: "염색 Mill", width: 88 },
    { id: "dyeingDate", label: "Status", width: 78 },
    { id: "finishingMill", label: "가공 Mill", width: 88 },
    { id: "finishingDate", label: "Status", width: 78 },
  ] },
  { key: "result", label: "결과", color: "var(--chart-4)", columns: [
    { id: "completedAt", label: "Finish Date", width: 88 },
    { id: "dueDate", label: "Due Date", width: 88 },
    { id: "note", label: "Remark/Issue", width: 200 },
    { id: "shrinkageLength", label: "Shrinkage L", width: 88 },
    { id: "shrinkageWidth", label: "Shrinkage W", width: 88 },
    { id: "knitInch", label: "Inch", width: 68 },
    { id: "knitNeedles", label: "Needles", width: 78 },
    { id: "knitGauge", label: "Gauge", width: 72 },
    { id: "loopF", label: "Loop F", width: 68 },
    { id: "loopT", label: "Loop T", width: 68 },
    { id: "loopB", label: "Loop B", width: 68 },
    { id: "greigeWidth", label: "Greige 폭", width: 80 },
    { id: "greigeWeight", label: "Greige 중량", width: 86 },
  ] },
]

const WH_COL_WIDTHS_KEY = "warehouse-col-widths-v1"
const MIN_COL_WIDTH = 48

/** 행 높이가 h-8 로 고정이라 보이는 구간만 그리면 된다. 이력 탭은 4,400행이 넘는다. */
const MANUAL_EDITABLE = new Set(["styleNo", "flNo", "buyer", "season", "category", "owner", "construction", "note", "originalRef", "planner", "yarnDetail", "color", "dyeing"])

const ROW_HEIGHT = 32
const ROW_OVERSCAN = 12

const DISPOSAL_REASONS: DisposalReason[] = ["용량 초과", "품질 불량"]
const TAB_ORDER: WarehouseTab[] = ["READY", "WAREHOUSE", "HISTORY"]
const TAB_STATUSES: Record<WarehouseTab, readonly FabricLedgerStatus[]> = {
  READY: ["READY"],
  WAREHOUSE: ["WAREHOUSE"],
  HISTORY: ["EXHAUSTED", "DISPOSED"],
}

/** 탭·상태별 고정 액센트. 모든 탭에서 열 구성이 같으므로 색으로만 맥락을 구분한다. */
const TAB_ACCENT: Record<WarehouseTab, { fill: string; dot: string; active: string; badge: string; bar: string; drop: string; rowBar: string; borderTop: string }> = {
  READY: { fill: "bg-[var(--warning)]", dot: "bg-[var(--warning)]", active: "data-[state=active]:bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] data-[state=active]:text-[var(--warning)]", badge: "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]", bar: "bg-[var(--warning)]", drop: "ring-2 ring-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]", rowBar: "border-l-[var(--warning)]", borderTop: "border-t-[var(--warning)]" },
  WAREHOUSE: { fill: "bg-[var(--chart-2)]", dot: "bg-[var(--chart-2)]", active: "data-[state=active]:bg-[color-mix(in_srgb,var(--chart-2)_15%,transparent)] data-[state=active]:text-[var(--chart-2)]", badge: "bg-[color-mix(in_srgb,var(--chart-2)_15%,transparent)] text-[var(--chart-2)]", bar: "bg-[var(--chart-2)]", drop: "ring-2 ring-[var(--chart-2)] bg-[color-mix(in_srgb,var(--chart-2)_15%,transparent)]", rowBar: "border-l-[var(--chart-2)]", borderTop: "border-t-[var(--chart-2)]" },
  HISTORY: { fill: "bg-[var(--muted-foreground)]", dot: "bg-[var(--muted-foreground)]", active: "data-[state=active]:bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)] data-[state=active]:text-[var(--foreground)]", badge: "bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)] text-[var(--foreground)]", bar: "bg-[var(--muted-foreground)]", drop: "ring-2 ring-[var(--muted-foreground)] bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)]", rowBar: "border-l-[var(--muted-foreground)]", borderTop: "border-t-[var(--muted-foreground)]" },
}

const GRIP_WIDTH = 42
const ACTION_WIDTH = 120

/** DEVELOPMENT Overview와 동일한 게이지 모션(1500ms · easeInOutCubic). */
const GAUGE_MS = 1500
const GAUGE_EASE = "duration-[1500ms] [transition-timing-function:cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"

/** 드래그앤드롭 전이 매트릭스. 유효하지 않은 조합은 null. */
function dropActionFor(from: WarehouseTab, target: WarehouseTab): ActionKind | null {
  if (from === "READY" && target === "WAREHOUSE") return "RECEIVE"
  if (from === "HISTORY" && target === "WAREHOUSE") return "RESTORE"
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

/**
 * 8000번대는 타 사업부가 쓰고 있어 우리 대역이 아니다. 최대값 다음 번호를 주면 8000이 나온다.
 * 폐기·소진으로 풀린 번호를 다시 쓰는 운영이라, 창고에 지금 있는 번호를 피해
 * 가장 낮은 빈 번호부터 채운다. 부여된 번호는 화면에서 고칠 수 있다.
 */
const STORAGE_NO_MAX = 7999

function occupiedStorageNumbers(items: readonly FabricLedgerItem[]): Set<number> {
  const used = new Set<number>()
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE") return
    const matched = item.storageNo.trim().match(/^\d{1,4}(?!\d)/)?.[0]
    if (matched) used.add(Number(matched))
  })
  return used
}

/** 대장 행 순서가 곧 채번 순서다. 마지막으로 채번된 번호 다음부터 이어 간다. */
function lastIssuedStorageNumber(items: readonly FabricLedgerItem[]): number {
  let last = 0
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE") return
    const matched = item.storageNo.trim().match(/^\d{1,4}(?!\d)/)?.[0]
    if (matched) last = Number(matched)
  })
  return last
}

function nextStorageNumbers(items: readonly FabricLedgerItem[], count: number): number[] {
  const used = occupiedStorageNumbers(items)
  const picked: number[] = []
  const take = (candidate: number) => {
    if (used.has(candidate)) return
    picked.push(candidate)
    used.add(candidate)
  }
  // 마지막 채번 다음부터 위로 채우고, 7999 를 넘기면 비어 있는 낮은 번호로 되감는다.
  for (let candidate = lastIssuedStorageNumber(items) + 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  for (let candidate = 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  return picked
}

/**
 * 필터와 정렬이 보는 값. coreCell 이 화면에 그리는 값과 같은 출처를 쓴다.
 * 한쪽만 고치면 필터 목록과 화면이 어긋나므로 열을 더할 때 둘 다 손봐야 한다.
 */
function cellValue(item: FabricLedgerItem, id: WarehouseColumnId): string {
  const record = item.record
  const led = item.sample?.ledger
  const sam = item.sample
  const first = (...values: Array<unknown>): string => {
    for (const value of values) {
      if (value === undefined || value === null) continue
      const text = String(value).trim()
      if (text) return text
    }
    return ""
  }
  switch (id) {
    case "storageNo": return item.storageNo
    case "styleNo": return item.styleNo
    case "flNo": return item.flNo
    case "owner": return item.owner
    case "stock": return item.yds === null ? "" : `${item.balance ?? 0}/${item.yds}`
    case "confirm": return item.status !== "WAREHOUSE" ? "" : item.confirmedAt ? "확인" : "미확인"
    case "season": return item.season
    case "buyer": return item.buyer
    case "category": return item.category
    case "requestDate": return item.requestDate ?? ""
    case "completedAt": return item.completedAt
    case "originalRef": return first(record?.tech?.original?.brand, led?.originalRef)
    case "planner": return first(record?.planner, led?.planner)
    case "yarnDetail": return first(record?.tech?.yarnDetail, led?.yarnDetail)
    case "construction": return first(record?.construction, item.construction)
    case "weight": return first(record?.weight, led?.targetWeight)
    case "color": return first(record?.color, led?.color)
    case "dyeing": return first(record?.dyeing, led?.dyeingSide)
    case "dueDate": return first(record?.dueDate, led?.dueDate)
    case "yarnMill": return first(record?.tech?.mills?.yarn, led?.mills?.yarn)
    case "yarnDate": return first(record?.tech?.processDates?.yarn, sam?.process.yarn)
    case "knittingMill": return first(record?.tech?.mills?.knitting, led?.mills?.knitting)
    case "knittingDate": return first(record?.tech?.processDates?.knitting, sam?.process.knit)
    case "dyeingMill": return first(record?.tech?.mills?.dyeing, led?.mills?.dyeing)
    case "dyeingDate": return first(record?.tech?.processDates?.dyeing, sam?.process.dye)
    case "finishingMill": return first(record?.tech?.mills?.finishing, led?.mills?.finishing)
    case "finishingDate": return first(record?.tech?.processDates?.finishing, sam?.process.finish)
    case "actualWidth": return first(record?.tech?.actual?.width, sam?.inhouse.widthCm)
    case "actualWeight": return first(record?.tech?.actual?.weight, sam?.inhouse.weightGsm)
    case "shrinkageLength": return first(record?.tech?.actual?.shrinkageLength, typeof sam?.inhouse.shrinkagePct === "object" ? sam?.inhouse.shrinkagePct.length : undefined)
    case "shrinkageWidth": return first(record?.tech?.actual?.shrinkageWidth, typeof sam?.inhouse.shrinkagePct === "object" ? sam?.inhouse.shrinkagePct.width : undefined)
    case "knitInch": return first(record?.tech?.knitSpec?.inch, led?.knitSpec?.inch)
    case "knitGauge": return first(record?.tech?.knitSpec?.gauge, led?.knitSpec?.feeder)
    case "knitNeedles": return first(record?.tech?.knitSpec?.needles, led?.knitSpec?.needles)
    case "loopF": return first(record?.tech?.knitSpec?.loopF, led?.knitSpec?.loop)
    case "loopT": return first(record?.tech?.knitSpec?.loopT)
    case "loopB": return first(record?.tech?.knitSpec?.loopB)
    case "greigeWidth": return first(record?.tech?.stageData?.greige?.width, led?.greige?.width)
    case "greigeWeight": return first(record?.tech?.stageData?.greige?.weight, led?.greige?.weight)
    case "note": return item.note
    default: return ""
  }
}

function TextCell({ value, mono = false }: { value: unknown; mono?: boolean }) {
  const text = String(value ?? "").trim()
  return <span title={text} className={`block truncate ${mono ? "font-mono" : ""}`}>{text}</span>
}

/** 컴팩트 KPI 타일. 표 높이를 뺏지 않도록 고정 높이로 유지한다. */
function KpiTile({ label, children, footer, basis }: { label: string; children: ReactNode; footer?: ReactNode; basis?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <p className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)]">
        <span className="truncate">{label}</span>
        {basis ? <span title={basis} aria-label={`${label} 집계 기준`} className="shrink-0"><Info aria-hidden="true" className="size-3" /></span> : null}
      </p>
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

/** 3개 조회 탭 비율 스택바 — 세그먼트를 누르면 해당 탭으로 이동한다. */
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
  const [openGroups, setOpenGroups] = useState({ process: true })
  // 열 너비는 사용자가 끌어 조절하고 브라우저에 남는다. 기본값을 바꾸면 키를 올려야 반영된다.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const defaults = Object.fromEntries(COLUMN_GROUPS.flatMap((group) => group.columns).map((column) => [column.id, column.width]))
    try {
      const raw = window.localStorage.getItem(WH_COL_WIDTHS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, unknown>
        Object.entries(stored).forEach(([id, value]) => {
          if (id in defaults && typeof value === "number" && Number.isFinite(value) && value >= MIN_COL_WIDTH) defaults[id] = value
        })
      }
    } catch { /* 저장소를 못 쓰면 기본 너비로 간다. */ }
    return defaults
  })
  const widthOf = (column: WarehouseColumn): number => columnWidths[column.id] ?? column.width
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null)
  const startColumnResize = (column: WarehouseColumn, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { id: column.id, startX: event.clientX, startWidth: widthOf(column) }
    // React 의 MouseEvent 를 별칭으로 들여왔으므로 window 리스너는 DOM 쪽 타입을 명시한다.
    const move = (moveEvent: globalThis.MouseEvent) => {
      const drag = resizeRef.current
      if (!drag) return
      const next = Math.max(MIN_COL_WIDTH, drag.startWidth + moveEvent.clientX - drag.startX)
      setColumnWidths((current) => ({ ...current, [drag.id]: next }))
    }
    const up = () => {
      resizeRef.current = null
      document.body.style.cursor = ""
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      setColumnWidths((current) => {
        try { window.localStorage.setItem(WH_COL_WIDTHS_KEY, JSON.stringify(current)) } catch { /* 저장 못해도 이번 세션은 유지된다. */ }
        return current
      })
    }
    document.body.style.cursor = "col-resize"
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }
  // 한 번 누르면 셀 선택, 두 번 누르면 상세 팝업. 엑셀과 DD MASTER 의 조작을 맞춘다.
  const [selectedCell, setSelectedCell] = useState<{ row: string; col: string } | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [outboundHistoryKey, setOutboundHistoryKey] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null)
  const [receiveYds, setReceiveYds] = useState<Record<string, string>>({})
  const [receiveNos, setReceiveNos] = useState<Record<string, string>>({})
  const [confirmChecks, setConfirmChecks] = useState<Record<string, boolean>>({})
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false)
  // 웹 등록 행만 그리드에서 직접 고친다. DD·대장에서 온 행은 여기서 수정하지 않는다.
  const [editCell, setEditCell] = useState<{ row: string; col: string } | null>(null)
  // 엑셀식 열 필터와 정렬. 기본은 대장 행 순서이고 정렬을 걸었을 때만 바뀐다.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [sortRule, setSortRule] = useState<{ col: WarehouseColumnId; dir: "asc" | "desc" } | null>(null)
  const [filterMenu, setFilterMenu] = useState<WarehouseColumnId | null>(null)
  const [filterSearch, setFilterSearch] = useState("")
  const [exhaustOnZero, setExhaustOnZero] = useState(true)
  // 셀 범위 선택. 행은 visibleRows 인덱스, 열은 visibleColumns 인덱스다.
  const [cellRange, setCellRange] = useState<{ ar: number; ac: number; fr: number; fc: number } | null>(null)
  const cellDragRef = useRef(false)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number } | null>(null)
  const [viewports, setViewports] = useState<Record<string, { top: number; height: number }>>({})
  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [stockYds, setStockYds] = useState("")
  const [recipient, setRecipient] = useState("")
  const [division, setDivision] = useState("")
  const [outboundQty, setOutboundQty] = useState("")
  const [outboundDate, setOutboundDate] = useState(localDateValue)
  const [disposalReason, setDisposalReason] = useState<DisposalReason | "">("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  // 행 위 드래그 = 범위 선택. 클릭(상세 열기)과 충돌하지 않도록 이동 여부를 따로 기억한다.
  const dragAnchorRef = useRef<number | null>(null)
  const rangeDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)

  const counts = useMemo(() => Object.fromEntries(TAB_ORDER.map((key) => [key, ledger.filter((item) => TAB_STATUSES[key].includes(item.status)).length])) as Record<WarehouseTab, number>, [ledger])
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return ledger.filter((item) => TAB_STATUSES[tab].includes(item.status))
      .filter((item) => !(unconfirmedOnly && tab === "WAREHOUSE") || !item.confirmedAt)
      .filter((item) => !query || [
      item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner,
      item.construction, item.lastOutbound?.to, item.lastOutbound?.division, item.note,
      item.record?.planner, item.record?.tech?.original?.brand, item.record?.tech?.yarnDetail,
      item.record?.color, item.record?.dyeing, item.record?.dueDate,
      ...item.outbound.flatMap((outbound) => [outbound.to, outbound.division]),
    ].some((value) => String(value ?? "").toLocaleLowerCase("ko-KR").includes(query)))
  }, [ledger, search, tab, unconfirmedOnly])

  // 열 필터를 통과한 행. 정렬을 걸지 않으면 원장이 준 대장 순서를 그대로 쓴다.
  const visibleRows = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, values]) => values.length > 0)
    const filtered = active.length === 0 ? rows : rows.filter((item) =>
      active.every(([columnId, values]) => values.includes(cellValue(item, columnId as WarehouseColumnId))))
    if (!sortRule) return filtered
    const direction = sortRule.dir === "asc" ? 1 : -1
    return [...filtered].sort((left, right) =>
      direction * cellValue(left, sortRule.col).localeCompare(cellValue(right, sortRule.col), "ko-KR", { numeric: true }))
  }, [rows, columnFilters, sortRule])
  const divisionSuggestions = useMemo(() => [...new Set(fabricEvents.map((event) => event.division?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true })), [fabricEvents])
  const visibleGroups = COLUMN_GROUPS.filter((group) => !group.collapsible || openGroups[group.key as keyof typeof openGroups])
  const visibleColumns = visibleGroups.flatMap((group) => group.columns)
  const fixedColumns = visibleColumns.filter((column) => COLUMN_GROUPS[0].columns.some((fixed) => fixed.id === column.id))
  const groupedColumns = visibleGroups.filter((group) => group.key !== "fixed")
  const tableWidth = GRIP_WIDTH + ACTION_WIDTH + visibleColumns.reduce((sum, column) => sum + widthOf(column), 0)
  const ledgerByKey = useMemo(() => new Map(ledger.map((item) => [item.key, item])), [ledger])
  const outboundHistoryItem = outboundHistoryKey ? ledgerByKey.get(outboundHistoryKey) ?? null : null
  const actionItems = actionDialog?.keys.map((key) => ledgerByKey.get(key)).filter((item): item is FabricLedgerItem => Boolean(item)) ?? []
  const selectedRows = rows.filter((item) => checked.has(item.key))
  const allRowsSelected = visibleRows.length > 0 && visibleRows.every((item) => checked.has(item.key))
  const someRowsSelected = visibleRows.some((item) => checked.has(item.key))
  const accent = TAB_ACCENT[tab]
  const fixedLeft = (id: WarehouseColumnId): number => {
    const index = fixedColumns.findIndex((column) => column.id === id)
    return GRIP_WIDTH + fixedColumns.slice(0, Math.max(0, index)).reduce((sum, column) => sum + widthOf(column), 0)
  }

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
      nextNo: String(nextStorageNumbers(ledger, 1)[0] ?? 0).padStart(4, "0"),
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
    setColumnFilters({})
    setSortRule(null)
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
      visibleRows.forEach((item) => allRowsSelected ? next.delete(item.key) : next.add(item.key))
      return next
    })
  }

  /** 행 본문 mousedown — 이 시점엔 선택을 바꾸지 않는다(단순 클릭은 상세 열기). */
  const beginRangeSelect = (event: MouseEvent<HTMLTableCellElement>, index: number) => {
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
    setChecked(new Set(visibleRows.slice(first, last + 1).map((item) => item.key)))
  }

  const openDetail = (key: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setDetailKey(key)
  }

  /** 그립 핸들 드래그 — 선택 전체(핸들 행이 미선택이면 그 행만)를 끌고 간다. */



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
    setDivision("")
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
        const auto = nextStorageNumbers(ledger, actionItems.length)
        if (auto.length < actionItems.length) throw new Error("사용할 수 있는 R&D No.가 부족합니다. 번호를 직접 입력하세요.")
        const taken = occupiedStorageNumbers(ledger)
        const assigned = actionItems.map((item, index) => {
          const raw = (receiveNos[item.key] ?? String(auto[index]).padStart(4, "0")).trim()
          const num = Number(raw)
          if (!/^\d{1,4}$/.test(raw) || !Number.isInteger(num) || num < 1 || num > STORAGE_NO_MAX) {
            throw new Error(`R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 타 사업부 대역입니다.`)
          }
          if (taken.has(num)) throw new Error(`R&D No. ${raw} 는 이미 창고에 있습니다.`)
          taken.add(num)
          return raw.padStart(4, "0")
        })
        const parsedYds = actionItems.map((item) => {
          const raw = receiveYds[item.key]?.trim() ?? ""
          const yds = raw ? Number(raw) : undefined
          if (yds !== undefined && (!Number.isFinite(yds) || yds < 0)) throw new Error("입고 수량은 0 이상의 숫자로 입력하세요.")
          return yds
        })
        for (const [index, item] of actionItems.entries()) {
          await applyFabricAction({ fabricKey: item.key, action: "RECEIVE", fromStatus: "READY", toStatus: "WAREHOUSE", storageNo: assigned[index], yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) })
        }
        setReceiveNos({})
        setChecked(new Set())
        setTab("WAREHOUSE")
      } else if (actionDialog.kind === "UNRECEIVE") {
        for (const item of actionItems) {
          if (item.status !== "WAREHOUSE") continue
          await applyFabricAction({ fabricKey: item.key, action: "UNRECEIVE", fromStatus: "WAREHOUSE", toStatus: "READY", note: "입고 대기로 되돌림" })
        }
        setChecked(new Set())
        setTab("READY")
      } else if (actionDialog.kind === "CONFIRM") {
        const targets = actionItems.filter((item) => confirmChecks[item.key] !== false)
        if (!targets.length) throw new Error("실물을 확인한 항목을 하나 이상 체크하세요.")
        for (const item of targets) {
          if (item.status !== "WAREHOUSE" || item.confirmedAt) continue
          await applyFabricAction({ fabricKey: item.key, action: "CONFIRM", fromStatus: "WAREHOUSE", toStatus: "WAREHOUSE", storageNo: item.storageNo, note: "창고 실물 입고 확인" })
        }
        setChecked(new Set())
        setConfirmChecks({})
      } else if (actionDialog.kind === "DISPOSE") {
        if (!disposalReason) throw new Error("폐기 사유를 선택하세요.")
        for (const item of actionItems) {
          if (item.status !== "READY" && item.status !== "WAREHOUSE") continue
          await applyFabricAction({ fabricKey: item.key, action: "DISPOSE", fromStatus: item.status, toStatus: "DISPOSED", storageNo: item.storageNo, reason: disposalReason, note: `폐기: ${disposalReason}` })
        }
        setChecked(new Set())
        setTab("HISTORY")
      } else if (actionDialog.kind === "STOCK") {
        const item = actionItems[0]
        const yds = Number(stockYds)
        if (!stockYds.trim() || !Number.isFinite(yds) || yds < 0) throw new Error("보유 재고를 0 이상의 숫자로 입력하세요.")
        await applyFabricAction({ fabricKey: item.key, action: "NOTE", fromStatus: item.status, toStatus: item.status, storageNo: item.storageNo, yds, note: "보유 재고 수정" })
        if (yds - item.outboundTotal <= 0) setTab("HISTORY")
      } else if (actionDialog.kind === "OUTBOUND") {
        const item = actionItems[0]
        const qty = Number(outboundQty)
        if (item.balance === null) throw new Error("먼저 보유 재고를 입력하세요.")
        if (!recipient.trim()) throw new Error("수령자를 입력하세요.")
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("출고 수량을 0보다 큰 숫자로 입력하세요.")
        if (qty > item.balance) throw new Error(`현재 잔량 ${formatYds(item.balance)} yds를 초과할 수 없습니다.`)
        if (!outboundDate) throw new Error("출고 날짜를 선택하세요.")
        await applyFabricAction({ fabricKey: item.key, action: "OUTBOUND", fromStatus: "WAREHOUSE", toStatus: "WAREHOUSE", storageNo: item.storageNo, qty, to: recipient, division, date: outboundDate, note: "출고 등록", autoExhaust: exhaustOnZero })
        if (qty >= item.balance) setTab("HISTORY")
      } else if (actionDialog.kind === "EXHAUST") {
        for (const item of actionItems) {
          if (item.status !== "WAREHOUSE") continue
          await applyFabricAction({ fabricKey: item.key, action: "EXHAUST", fromStatus: item.status, toStatus: "EXHAUSTED", storageNo: item.storageNo, note: "수동 소진 완료" })
        }
        setChecked(new Set())
        setTab("HISTORY")
      } else {
        let restoreStatus: "READY" | "WAREHOUSE" = "WAREHOUSE"
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

  /** 편집 입력의 초기값. 화면 표기가 아니라 저장된 원본을 넣어야 한다. */
  const cellRawValue = (item: FabricLedgerItem, id: WarehouseColumnId): string => {
    const led = item.sample?.ledger
    switch (id) {
      case "styleNo": return item.styleNo
      case "flNo": return item.flNo
      case "buyer": return item.buyer
      case "season": return item.season
      case "category": return item.category
      case "owner": return item.owner
      case "construction": return item.construction
      case "note": return item.note
      case "originalRef": return led?.originalRef ?? ""
      case "planner": return led?.planner ?? ""
      case "yarnDetail": return led?.yarnDetail ?? ""
      case "color": return led?.color ?? ""
      case "dyeing": return led?.dyeingSide ?? ""
      default: return ""
    }
  }

  const coreCell = (item: FabricLedgerItem, id: WarehouseColumnId): ReactNode => {
    if (id === "storageNo") return <TextCell value={item.storageNo} mono />
    if (id === "styleNo") return <TextCell value={item.styleNo} mono />
    if (id === "flNo") return <TextCell value={item.flNo} mono />
    if (id === "owner") return <TextCell value={item.owner} />
    if (id === "stock") {
      const balance = item.balance === null ? null : Math.max(0, item.balance)
      return <button type="button" className={`block h-full w-full truncate text-left tabular-nums ${balance === 0 ? "text-[var(--muted-foreground)]" : ""}`} title={item.yds === null ? "반출 이력" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds`} aria-label={`${item.styleNo || item.flNo || "원단"} 반출 이력`} onClick={(event) => { event.stopPropagation(); setOutboundHistoryKey(item.key) }}>{item.yds === null ? "" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds`}</button>
    }
    if (id === "confirm") {
      if (item.status !== "WAREHOUSE") return <TextCell value="" />
      return item.confirmedAt
        ? <span className="text-[11px] font-medium text-[var(--muted-foreground)]" title={`창고 확인 ${fmtDateFull(item.confirmedAt)}`}>확인</span>
        : <span className="text-[11px] font-medium text-[var(--destructive)]">미확인</span>
    }
    if (id === "season") return <TextCell value={item.season} />
    if (id === "buyer") return <TextCell value={item.buyer} />
    if (id === "category") return <TextCell value={item.category} />
    if (id === "requestDate") return <TextCell value={item.requestDate ? fmtDateMd(item.requestDate) : ""} />
    if (id === "completedAt") return <TextCell value={item.completedAt ? fmtDateMd(item.completedAt) : ""} />

    // DD 원본이 있으면 그 값을, 없으면(과거 대장 행) 대장에서 읽은 원본을 그대로 쓴다.
    const record = item.record
    const led = item.sample?.ledger
    const sam = item.sample
    const pick = <T,>(fromRecord: T | undefined | null, fromLedger: T | undefined | null): T | undefined =>
      (fromRecord === undefined || fromRecord === null || fromRecord === "" ? undefined : fromRecord)
      ?? (fromLedger === undefined || fromLedger === null || fromLedger === "" ? undefined : fromLedger)
      ?? undefined
    if (id === "originalRef") return <TextCell value={pick(record?.tech?.original?.brand, led?.originalRef)} />
    if (id === "planner") return <TextCell value={pick(record?.planner, led?.planner)} />
    if (id === "yarnDetail") return <TextCell value={pick(record?.tech?.yarnDetail, led?.yarnDetail)} />
    if (id === "construction") return <TextCell value={pick(record?.construction, item.construction)} />
    if (id === "weight") return <TextCell value={pick(record?.weight, led?.targetWeight)} />
    if (id === "color") return <TextCell value={pick(record?.color, led?.color)} />
    if (id === "dyeing") return <TextCell value={pick(record?.dyeing, led?.dyeingSide)} />
    if (id === "dueDate") { const v = pick(record?.dueDate, led?.dueDate); return <TextCell value={v ? fmtDateFull(v) : ""} /> }
    if (id === "yarnMill") return <TextCell value={pick(record?.tech?.mills?.yarn, led?.mills?.yarn)} />
    if (id === "yarnDate") { const v = pick(record?.tech?.processDates?.yarn, sam?.process.yarn); return <TextCell value={v ? fmtDateFull(v) : String(v ?? "")} /> }
    if (id === "knittingMill") return <TextCell value={pick(record?.tech?.mills?.knitting, led?.mills?.knitting)} />
    if (id === "knittingDate") { const v = pick(record?.tech?.processDates?.knitting, sam?.process.knit); return <TextCell value={v ? fmtDateFull(v) : String(v ?? "")} /> }
    if (id === "dyeingMill") return <TextCell value={pick(record?.tech?.mills?.dyeing, led?.mills?.dyeing)} />
    if (id === "dyeingDate") { const v = pick(record?.tech?.processDates?.dyeing, sam?.process.dye); return <TextCell value={v ? fmtDateFull(v) : String(v ?? "")} /> }
    if (id === "finishingMill") return <TextCell value={pick(record?.tech?.mills?.finishing, led?.mills?.finishing)} />
    if (id === "finishingDate") { const v = pick(record?.tech?.processDates?.finishing, sam?.process.finish); return <TextCell value={v ? fmtDateFull(v) : String(v ?? "")} /> }
    if (id === "actualWidth") return <TextCell value={pick(record?.tech?.actual?.width, sam?.inhouse.widthCm)} />
    if (id === "actualWeight") return <TextCell value={pick(record?.tech?.actual?.weight, sam?.inhouse.weightGsm)} />
    if (id === "shrinkageLength") return <TextCell value={pick(record?.tech?.actual?.shrinkageLength, typeof sam?.inhouse.shrinkagePct === "object" ? sam?.inhouse.shrinkagePct.length : undefined)} />
    if (id === "shrinkageWidth") return <TextCell value={pick(record?.tech?.actual?.shrinkageWidth, typeof sam?.inhouse.shrinkagePct === "object" ? sam?.inhouse.shrinkagePct.width : undefined)} />
    if (id === "knitInch") return <TextCell value={pick(record?.tech?.knitSpec?.inch, led?.knitSpec?.inch)} />
    if (id === "knitGauge") return <TextCell value={pick(record?.tech?.knitSpec?.gauge, led?.knitSpec?.feeder)} />
    if (id === "knitNeedles") return <TextCell value={pick(record?.tech?.knitSpec?.needles, led?.knitSpec?.needles)} />
    if (id === "loopF") return <TextCell value={pick(record?.tech?.knitSpec?.loopF, led?.knitSpec?.loop)} />
    if (id === "loopT") return <TextCell value={record?.tech?.knitSpec?.loopT} />
    if (id === "loopB") return <TextCell value={record?.tech?.knitSpec?.loopB} />
    if (id === "greigeWidth") return <TextCell value={pick(record?.tech?.stageData?.greige?.width, led?.greige?.width)} />
    if (id === "greigeWeight") return <TextCell value={pick(record?.tech?.stageData?.greige?.weight, led?.greige?.weight)} />
    return <TextCell value={item.note} />
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
    openDetail(item.key)
  }

  const actionTitle = actionDialog?.kind === "RECEIVE" ? "선택 입고 등록"
    : actionDialog?.kind === "UNRECEIVE" ? "입고 대기로 되돌리기"
    : actionDialog?.kind === "CONFIRM" ? "실물 입고 확인"
    : actionDialog?.kind === "DISPOSE" ? "선택 폐기"
      : actionDialog?.kind === "STOCK" ? "보유 재고 수정"
        : actionDialog?.kind === "OUTBOUND" ? "출고 등록"
          : actionDialog?.kind === "EXHAUST" ? "소진 완료"
            : "상태 복구"

  const unconfirmedCount = useMemo(() => ledger.filter((item) => item.status === "WAREHOUSE" && !item.confirmedAt).length, [ledger])

  const suggestedNos = useMemo(() => nextStorageNumbers(ledger, actionItems.length), [ledger, actionItems.length])
  const storageNoFor = (index: number): string =>
    receiveNos[actionItems[index]?.key ?? ""] ?? String(suggestedNos[index] ?? "").padStart(4, "0")

  const totalCount = TAB_ORDER.reduce((sum, key) => sum + counts[key], 0)

  useEffect(() => {
    const stop = () => { cellDragRef.current = false }
    const onCopy = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return
      if (!rangeRect) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      event.preventDefault()
      void copyRange()
    }
    window.addEventListener("mouseup", stop)
    window.addEventListener("keydown", onCopy)
    return () => {
      window.removeEventListener("mouseup", stop)
      window.removeEventListener("keydown", onCopy)
    }
  })

  // 최근 등록한 것이 맨 아래에 온다. 탭을 열면 그 끝을 먼저 보여 준다.
  useEffect(() => {
    const element = gridRefs.current[tab]
    if (!element) return
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
      setViewports((current) => ({ ...current, [tab]: { top: element.scrollTop, height: element.clientHeight } }))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tab, visibleRows.length])

  const rangeRect = cellRange ? {
    top: Math.min(cellRange.ar, cellRange.fr),
    bottom: Math.max(cellRange.ar, cellRange.fr),
    left: Math.min(cellRange.ac, cellRange.fc),
    right: Math.max(cellRange.ac, cellRange.fc),
  } : null

  const copyRange = async (): Promise<void> => {
    if (!rangeRect) return
    const lines: string[] = []
    for (let r = rangeRect.top; r <= rangeRect.bottom; r += 1) {
      const item = visibleRows[r]
      if (!item) continue
      const cells: string[] = []
      for (let c = rangeRect.left; c <= rangeRect.right; c += 1) {
        const column = visibleColumns[c]
        cells.push(column ? cellValue(item, column.id) : "")
      }
      lines.push(cells.join("\t"))
    }
    // 엑셀과 같은 탭 구분 텍스트라 그대로 붙여넣을 수 있다.
    try { await navigator.clipboard.writeText(lines.join("\n")) } catch { /* 클립보드를 못 쓰면 조용히 넘긴다. */ }
    setCellMenu(null)
  }

  const filterButton = (column: WarehouseColumn) => {
    const selected = columnFilters[column.id] ?? []
    const active = selected.length > 0 || sortRule?.col === column.id
    const values = [...new Set(rows.map((item) => cellValue(item, column.id)))]
      .sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true }))
    const query = filterSearch.trim().toLocaleLowerCase("ko-KR")
    const shown = (query ? values.filter((value) => value.toLocaleLowerCase("ko-KR").includes(query)) : values).slice(0, 400)
    const setFilter = (next: string[]) => setColumnFilters((current) => {
      const copy = { ...current }
      if (next.length === 0) delete copy[column.id]
      else copy[column.id] = next
      return copy
    })
    return <Popover.Root open={filterMenu === column.id} onOpenChange={(open) => { setFilterMenu(open ? column.id : null); setFilterSearch("") }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={`${column.label} 필터·정렬`}
          aria-label={`${column.label} 필터 및 정렬`}
          onClick={(event) => event.stopPropagation()}
          className={`absolute right-2 top-1/2 z-10 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-[9px] leading-none transition-opacity hover:bg-[var(--muted)] ${active ? "opacity-100 text-[var(--primary)]" : "opacity-0 group-hover/head:opacity-100"}`}
        >{sortRule?.col === column.id ? (sortRule.dir === "asc" ? "▲" : "▼") : "▾"}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[80] w-60 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2 text-xs shadow-lg outline-none">
          <div className="grid gap-1 border-b border-[var(--border)] pb-2">
            <button type="button" className="rounded px-2 py-1 text-left hover:bg-[var(--muted)]" onClick={() => { setSortRule({ col: column.id, dir: "asc" }); setFilterMenu(null) }}>오름차순 정렬</button>
            <button type="button" className="rounded px-2 py-1 text-left hover:bg-[var(--muted)]" onClick={() => { setSortRule({ col: column.id, dir: "desc" }); setFilterMenu(null) }}>내림차순 정렬</button>
            <button type="button" className="rounded px-2 py-1 text-left text-[var(--muted-foreground)] hover:bg-[var(--muted)]" onClick={() => { setSortRule(null); setFilterMenu(null) }}>정렬 해제 (대장 순서)</button>
          </div>
          <div className="mt-2 space-y-2">
            <Input value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} placeholder="값 검색" className="h-7 text-xs" />
            <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
              <button type="button" className="hover:underline" onClick={() => setFilter(values)}>모두 선택</button>
              <span>{selected.length ? `${selected.length}개 선택` : "전체 표시"}</span>
              <button type="button" className="hover:underline" onClick={() => setFilter([])}>해제</button>
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {shown.map((value) => {
                const checked = selected.length === 0 || selected.includes(value)
                return <label key={value || "(빈값)"} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--muted)]">
                  <Checkbox checked={checked} onCheckedChange={(next) => {
                    const base = selected.length === 0 ? values : selected
                    setFilter(next === true ? [...new Set([...base, value])] : base.filter((entry) => entry !== value))
                  }} aria-label={value || "빈값"} />
                  <span className="min-w-0 flex-1 truncate">{value || <span className="text-[var(--muted-foreground)]">(빈값)</span>}</span>
                </label>
              })}
              {shown.length === 0 ? <p className="px-1 py-2 text-[var(--muted-foreground)]">일치하는 값이 없습니다.</p> : null}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  }

  const renderGrid = (gridId: string, gridRows: readonly FabricLedgerItem[], emptyText: string) => {
    const viewport = viewports[gridId] ?? { top: 0, height: 900 }
    const total = gridRows.length
    const start = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - ROW_OVERSCAN)
    const end = Math.min(total, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + ROW_OVERSCAN)
    const windowRows = gridRows.slice(start, end)
    const topPad = start * ROW_HEIGHT
    const bottomPad = Math.max(0, (total - end) * ROW_HEIGHT)
    const measure = (element: HTMLDivElement | null) => {
      gridRefs.current[gridId] = element
      if (!element) return
      const height = element.clientHeight
      setViewports((current) => current[gridId]?.height === height ? current : { ...current, [gridId]: { top: element.scrollTop, height } })
    }
    return (
        <div className="min-h-0 flex-1 overflow-auto" ref={measure} onScroll={(event) => { const el = event.currentTarget; setViewports((current) => ({ ...current, [gridId]: { top: el.scrollTop, height: el.clientHeight } })) }}>
          <table className="w-full table-fixed select-none border-separate border-spacing-0 text-xs [&_input]:select-text [&_textarea]:select-text" style={{ width: tableWidth, minWidth: tableWidth }}>
            <colgroup>
              <col style={{ width: GRIP_WIDTH }} />
              {visibleColumns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
              <col style={{ width: ACTION_WIDTH }} />
            </colgroup>
            <TableHeader className="sticky top-0 z-30 bg-[var(--card)] shadow-sm">
              <TableRow className="h-8 hover:bg-[var(--card)]">
                <TableHead rowSpan={2} className="sticky left-0 top-0 z-50 border-b border-r border-[var(--border)] bg-[var(--muted)] px-1.5 text-center"><Checkbox checked={allRowsSelected ? true : someRowsSelected ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label={`${TAB_META[tab].label} 전체 선택`} disabled={tab === "HISTORY"} /></TableHead>
                {fixedColumns.map((column) => <TableHead key={column.id} rowSpan={2} className="group/head relative sticky top-0 z-40 border-b border-r border-[var(--border)] bg-[var(--muted)] px-1.5 text-center text-xs font-normal text-[var(--muted-foreground)]" style={{ left: fixedLeft(column.id) }} title={column.label}>{column.label}{filterButton(column)}<span aria-hidden="true" title={`${column.label} 너비 조절`} onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></TableHead>)}
                {groupedColumns.map((group) => <TableHead key={group.key} colSpan={group.columns.length} className="relative sticky top-0 z-30 border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-semibold" style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}>
                  <span>{group.label}</span>
                  {group.collapsible ? <button type="button" aria-label={`${group.label} 열 접기`} aria-pressed={true} title={`${group.label} 열 접기`} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: false }))} className="absolute right-2 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none hover:bg-[var(--muted)]">-</button> : null}
                </TableHead>)}
                <TableHead rowSpan={2} className="relative sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--muted)] px-1.5 text-right text-xs font-normal text-[var(--muted-foreground)]">
                  <span>처리</span>
                  <span className="absolute right-full top-1 flex -translate-y-0 gap-1 pr-2">
                    {COLUMN_GROUPS.filter((group) => group.collapsible && !openGroups[group.key as keyof typeof openGroups]).map((group) => <button key={group.key} type="button" aria-label={`${group.label} 열 펼치기`} aria-pressed={false} title={`${group.label} 열 펼치기`} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: true }))} className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 text-[10px] font-semibold leading-none hover:bg-[var(--muted)]"><span>{group.label}</span><span aria-hidden="true">+</span></button>)}
                  </span>
                </TableHead>
              </TableRow>
              <TableRow className="h-8 hover:bg-[var(--card)]">
                {groupedColumns.flatMap((group) => group.columns.map((column) => <TableHead key={column.id} className="group/head relative sticky top-8 z-30 truncate border-b border-r border-[var(--border)] px-1.5 text-xs font-normal text-[var(--muted-foreground)]" style={{ background: `color-mix(in srgb, ${group.color} 7%, var(--muted))` }} title={column.label}>{column.label}{filterButton(column)}<span aria-hidden="true" title={`${column.label} 너비 조절`} onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></TableHead>))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPad > 0 ? <tr aria-hidden="true" style={{ height: topPad }} /> : null}
              {gridRows.length ? windowRows.map((item, offset) => {
                const index = start + offset
                const selected = checked.has(item.key)
                return <TableRow
                  key={item.key}
                  className={`h-8 cursor-pointer border-l-2 ${selected ? `${accent.rowBar} bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]` : "border-l-transparent"}`}
                  tabIndex={0}
                  aria-selected={selected}
                  aria-label={`${item.styleNo || item.flNo || "원단"} 상세 보기`}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                >
                  <TableCell className="sticky left-0 z-20 h-8 cursor-ns-resize border-b border-r border-[var(--border)] px-1.5 py-0" style={{ background: selected ? "color-mix(in srgb, var(--primary) 6%, var(--card))" : "var(--card)" }} title="끌어서 여러 행 선택" onMouseDown={(event) => beginRangeSelect(event, index)} onMouseEnter={() => extendRangeSelect(index)} onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Checkbox checked={selected} disabled={tab === "HISTORY"} onCheckedChange={(value) => toggleChecked(item.key, value === true)} aria-label={`${item.styleNo || item.flNo} 선택`} />
                    </div>
                  </TableCell>
                  {visibleColumns.map((column) => {
                    const fixed = fixedColumns.some((candidate) => candidate.id === column.id)
                    const colIndex = visibleColumns.findIndex((candidate) => candidate.id === column.id)
                    const inRange = Boolean(rangeRect && index >= rangeRect.top && index <= rangeRect.bottom && colIndex >= rangeRect.left && colIndex <= rangeRect.right)
                    // DD MASTER 와 같은 방식이다. 범위 가장자리에만 선을 그어 사각형으로 보이게 한다.
                    const edges = inRange && rangeRect ? [
                      index === rangeRect.top ? "inset 0 1.5px 0 0 var(--grid-selection)" : "",
                      index === rangeRect.bottom ? "inset 0 -1.5px 0 0 var(--grid-selection)" : "",
                      colIndex === rangeRect.left ? "inset 1.5px 0 0 0 var(--grid-selection)" : "",
                      colIndex === rangeRect.right ? "inset -1.5px 0 0 0 var(--grid-selection)" : "",
                    ].filter(Boolean).join(", ") : ""
                    const cellActive = selectedCell?.row === item.key && selectedCell.col === column.id
                    const confirmed = Boolean(item.confirmedAt)
                    const manualId = item.sample?.sourceSheet === WEB_INTAKE_SHEET ? item.sample.id : undefined
                    const editable = Boolean(manualId) && MANUAL_EDITABLE.has(column.id)
                    const editing = editable && editCell?.row === item.key && editCell.col === column.id
                    return <TableCell key={column.id} className={`h-8 min-w-0 cursor-cell border-b border-r border-[var(--border)] px-1.5 py-0 ${confirmed ? "bg-[var(--muted)] text-[var(--muted-foreground)]" : ""} ${fixed ? "sticky z-10" : ""} ${inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,transparent)]" : ""} ${cellActive ? "outline outline-2 -outline-offset-2 outline-[var(--grid-selection)]" : ""}`} style={{ ...(fixed ? { left: fixedLeft(column.id), background: selected ? "color-mix(in srgb, var(--primary) 6%, var(--card))" : "var(--card)" } : null), ...(edges ? { boxShadow: edges } : null) }} data-no-range={column.id === "stock" ? "" : undefined} onMouseDown={(event) => { if (event.button !== 0 || editing) return; cellDragRef.current = true; setCellRange({ ar: index, ac: colIndex, fr: index, fc: colIndex }); setCellMenu(null) }} onMouseEnter={() => { if (cellDragRef.current) setCellRange((current) => current ? { ...current, fr: index, fc: colIndex } : current) }} onContextMenu={(event) => { event.preventDefault(); if (!inRange) setCellRange({ ar: index, ac: colIndex, fr: index, fc: colIndex }); setCellMenu({ x: event.clientX, y: event.clientY }) }} onClick={(event) => { if (column.id === "stock") event.stopPropagation(); setSelectedCell({ row: item.key, col: column.id }) }} onDoubleClick={() => { if (editable) setEditCell({ row: item.key, col: column.id }); else openDetail(item.key) }}>{editing
                      ? <input
                          autoFocus
                          defaultValue={String(cellRawValue(item, column.id) ?? "")}
                          className="h-7 w-full rounded-none border-0 bg-[var(--card)] px-1 text-xs text-[var(--foreground)] outline-none ring-2 ring-inset ring-[var(--ring)]"
                          onBlur={(event) => { void updateManualIntake(manualId as string, column.id, event.target.value); setEditCell(null) }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") { event.preventDefault(); setEditCell(null) }
                            else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); void updateManualIntake(manualId as string, column.id, event.currentTarget.value); setEditCell(null) }
                          }}
                        />
                      : coreCell(item, column.id)}</TableCell>
                  })}
                  <TableCell className="h-8 border-b border-[var(--border)] px-1.5 py-0 text-right" data-no-range onClick={(event) => event.stopPropagation()}>{actionCell(item)}</TableCell>
                </TableRow>
              }) : <TableRow><TableCell colSpan={visibleColumns.length + 2} className="h-32 text-center text-sm text-[var(--muted-foreground)]">{emptyText}</TableCell></TableRow>}
              {bottomPad > 0 ? <tr aria-hidden="true" style={{ height: bottomPad }} /> : null}
            </TableBody>
          </table>
        </div>    )
  }

  return <section className="flex h-[calc(100dvh-7rem)] min-h-0 min-w-0 flex-col gap-2 overflow-hidden" style={{ "--grid-selection": "#217346" } as CSSProperties}>
    <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="상태 분포"
        basis="완료 샘플(DD 완료 + 샘플관리대장)을 FL 우선·Style 보조로 병합한 건수입니다. 입고대기·창고보관·이력 세 조회 구분의 합이며, 개발 진행중 건은 포함하지 않습니다."
        footer={<StatusMixBar counts={counts} total={totalCount} onPick={changeTab} />}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={totalCount} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">건 전체</span>
        </p>
      </KpiTile>

      <KpiTile
        label="창고 재고 (yds)"
        basis="입고 등록 시 직접 입력한 보유 수량 기준입니다. DD·샘플관리대장에는 수량 항목이 없어, 입고 처리 전에는 0으로 표시됩니다."
        footer={<div className="flex items-center gap-2"><KpiBar pct={kpi.usedPct} className={TAB_ACCENT.WAREHOUSE.bar} /><span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">소진 {Math.round(kpi.usedPct)}%</span></div>}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={Math.round(kpi.balanceTotal)} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">잔량 / 보유 {formatYds(kpi.stockTotal)}</span>
        </p>
      </KpiTile>

      <KpiTile
        label="출고 누계 (yds)"
        basis="출고 처리한 수량의 누계입니다. 폐기·소진 처리분은 포함하지 않습니다."
        footer={<p className="truncate text-[10px] text-[var(--muted-foreground)]">출고 <strong className="tabular-nums text-[var(--foreground)]">{kpi.outboundCount.toLocaleString("ko-KR")}</strong>건{kpi.missingStock ? ` · 재고 미기입 ${kpi.missingStock}건` : ""}</p>}
      >
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums"><NumberTicker value={Math.round(kpi.outboundTotal)} duration={GAUGE_MS} startOnView /></span>
          <span className="text-xs text-[var(--muted-foreground)]">yds</span>
        </p>
      </KpiTile>

      <KpiTile
        label="입고 대기"
        basis="DD MASTER 결과 RESULT 의 YDS 날짜가 입력된 건이 넘어옵니다. 입고하면 R&D No.가 채번되어 창고보관으로 바뀝니다."
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
          return <TabsTrigger
            key={key}
            value={key}
            className={`min-w-0 flex-1 gap-2 transition-[background-color,box-shadow,opacity] duration-200 motion-reduce:transition-none ${TAB_ACCENT[key].active}`}
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
        {tab === "READY" ? <Button type="button" size="sm" variant="outline" onClick={async () => { await addManualIntake(); setTab("READY"); setUnconfirmedOnly(false); setSearch("") }}><Pencil />직접 추가</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => openAction("CONFIRM", selectedRows)} className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/40 dark:bg-emerald-500 dark:hover:bg-emerald-600"><PackageCheck />입고 확인</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" disabled={selectedRows.length !== 1} title={selectedRows.length === 1 ? undefined : "출고는 한 건씩 등록합니다."} onClick={() => openAction("OUTBOUND", selectedRows)}><Send />출고</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("EXHAUST", selectedRows)}><PackageOpen />소진</Button> : null}
        {tab === "READY" || tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("DISPOSE", selectedRows)}><Trash2 />폐기</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("UNRECEIVE", selectedRows)}><PackageOpen />입고 대기로</Button> : null}
        {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant={unconfirmedOnly ? "default" : "outline"} aria-pressed={unconfirmedOnly} onClick={() => setUnconfirmedOnly((current) => !current)}>미확인 {unconfirmedCount}건</Button> : null}
      </div>

      <TabFade tabKey={tab}>
        {renderGrid(tab, visibleRows, `${TAB_META[tab].label} 항목이 없습니다.`)}
      </TabFade>
      <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">체크박스로 여러 건을 고른 뒤 위 버튼으로 처리합니다. · {TAB_META[tab].description}</div>
    </div>

    {cellMenu ? <>
      <div className="fixed inset-0 z-[85]" onMouseDown={() => setCellMenu(null)} onContextMenu={(event) => { event.preventDefault(); setCellMenu(null) }} />
      <div role="menu" className="fixed z-[90] w-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: Math.min(cellMenu.x, window.innerWidth - 176), top: Math.min(cellMenu.y, window.innerHeight - 120) }}>
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => void copyRange()}><Copy className="size-3.5" />복사 (Ctrl+C)</button>
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => { if (rangeRect) setCellRange({ ar: rangeRect.top, ac: 0, fr: rangeRect.bottom, fc: visibleColumns.length - 1 }); setCellMenu(null) }}><Rows3 className="size-3.5" />행 전체 선택</button>
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--muted-foreground)] hover:bg-[var(--muted)]" onClick={() => { setCellRange(null); setCellMenu(null) }}>선택 해제</button>
      </div>
    </> : null}

    <Dialog open={Boolean(outboundHistoryItem)} onOpenChange={(open) => { if (!open) setOutboundHistoryKey(null) }}>
      <DialogContent className="max-w-2xl">
        {outboundHistoryItem ? <>
          <DialogHeader><DialogTitle>반출 이력</DialogTitle><DialogDescription>{outboundHistoryItem.storageNo || outboundHistoryItem.styleNo || outboundHistoryItem.flNo || "원단"}</DialogDescription></DialogHeader>
          <DialogBody>
            <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--muted)] text-left text-[var(--muted-foreground)]"><tr><th className="px-3 py-2">날짜</th><th className="px-3 py-2">반출처</th><th className="px-3 py-2">사업부</th><th className="px-3 py-2 text-right">수량</th></tr></thead>
                <tbody>{outboundHistoryItem.outbound.length ? outboundHistoryItem.outbound.map((event, index) => <tr key={`${event.date}-${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-2">{fmtDateFull(event.date)}</td><td className="px-3 py-2">{event.to}</td><td className="px-3 py-2">{event.division ?? ""}</td><td className="px-3 py-2 text-right tabular-nums">{formatYds(event.qty)} yds</td></tr>) : <tr><td colSpan={4} className="px-3 py-8 text-center text-[var(--muted-foreground)]">반출 이력이 없습니다</td></tr>}</tbody>
              </table>
            </div>
          </DialogBody>
        </> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(detailKey)} onOpenChange={(open) => { if (!open) setDetailKey(null) }}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>원단 상세</DialogTitle></DialogHeader>
        <DialogBody>{detailKey ? <FabricDetailBody fabricKey={detailKey} /> : null}</DialogBody>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open && !saving) closeActionDialog() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{actionTitle}</DialogTitle><DialogDescription>{actionItems.length === 1 ? `${actionItems[0]?.storageNo || "자동 채번"} · ${actionItems[0]?.styleNo || actionItems[0]?.flNo || "원단"}` : `선택한 ${actionItems.length}건을 처리합니다.`}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {actionDialog?.kind === "RECEIVE" ? <div className="space-y-2"><p className="text-xs text-[var(--muted-foreground)]">창고에 없는 가장 낮은 번호부터 채웁니다. 8000번대는 타 사업부 대역이라 쓰지 않습니다. 번호는 직접 고칠 수 있고 yds는 비워 두어도 됩니다.</p>{actionItems.map((item, index) => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3"><div className="min-w-0"><div className="flex items-center gap-2"><Input aria-label={`${item.styleNo || item.flNo || "원단"} R&D No.`} className="h-8 w-20 font-mono text-sm" value={storageNoFor(index)} onChange={(event) => setReceiveNos((current) => ({ ...current, [item.key]: event.target.value }))} /><span className="truncate text-sm font-medium">{item.styleNo || item.flNo || "미입력"}</span></div><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{item.flNo || "FL No. 없음"}</p></div><div className="space-y-1"><Label htmlFor={`receive-yds-${index}`} className="text-xs">보유 yds (옵션)</Label><Input id={`receive-yds-${index}`} type="number" min="0" step="0.01" value={receiveYds[item.key] ?? ""} onChange={(event) => setReceiveYds((current) => ({ ...current, [item.key]: event.target.value }))} /></div></div>)}</div> : null}
          {actionDialog?.kind === "UNRECEIVE" ? <p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.length}건을 입고 대기로 되돌립니다. <strong>채번한 R&D No.가 취소되고 그 번호는 다시 쓸 수 있게 풀립니다.</strong> 실물 확인 표시도 함께 해제됩니다. 보유 재고와 반출 이력은 그대로 남습니다.</p> : null}
          {actionDialog?.kind === "CONFIRM" ? <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">창고에서 실물을 확인한 건만 체크하세요. 확인된 행은 대장에서 회색으로 칠하던 것과 같게 흐리게 보입니다.</p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {actionItems.map((item) => <label key={item.key} className={`flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 ${item.confirmedAt ? "opacity-50" : ""}`}>
                <Checkbox checked={item.confirmedAt ? true : confirmChecks[item.key] !== false} disabled={Boolean(item.confirmedAt)} onCheckedChange={(value) => setConfirmChecks((current) => ({ ...current, [item.key]: value === true }))} aria-label={`${item.storageNo || item.styleNo} 실물 확인`} />
                <span className="min-w-0 flex-1 truncate text-sm"><span className="font-mono">{item.storageNo || "번호 없음"}</span> · {item.styleNo || item.flNo || "미입력"}</span>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{item.confirmedAt ? `확인 ${fmtDateFull(item.confirmedAt)}` : item.yds === null ? "" : `${formatYds(item.yds)}yds`}</span>
              </label>)}
            </div>
          </div> : null}
          {actionDialog?.kind === "DISPOSE" ? <div className="space-y-2"><Label htmlFor="warehouse-disposal-reason">폐기 사유</Label><Select value={disposalReason} onValueChange={(value) => setDisposalReason(value as DisposalReason)}><SelectTrigger id="warehouse-disposal-reason"><SelectValue placeholder="사유 선택" /></SelectTrigger><SelectContent>{DISPOSAL_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select><p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.length}건에 같은 사유가 기록됩니다.</p></div> : null}
          {actionDialog?.kind === "STOCK" ? <div className="space-y-2"><Label htmlFor="warehouse-stock-yds">보유 재고 (yds)</Label><Input id="warehouse-stock-yds" type="number" min="0" step="0.01" value={stockYds} onChange={(event) => setStockYds(event.target.value)} /><p className="text-xs text-[var(--muted-foreground)]">기존 출고 합계 {formatYds(actionItems[0]?.outboundTotal ?? 0)} yds를 반영해 잔량을 다시 계산합니다.</p></div> : null}
          {actionDialog?.kind === "OUTBOUND" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="warehouse-recipient">수령자</Label><Input id="warehouse-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="수령자를 자유롭게 입력" /></div><div className="space-y-2"><Label htmlFor="warehouse-division">사업부 (옵션)</Label><Input id="warehouse-division" list="warehouse-division-suggestions" value={division} onChange={(event) => setDivision(event.target.value)} placeholder="사업부를 자유롭게 입력" /><datalist id="warehouse-division-suggestions">{divisionSuggestions.map((value) => <option key={value} value={value} />)}</datalist></div><div className="space-y-2"><Label htmlFor="warehouse-outbound-qty">수량 (yds)</Label><Input id="warehouse-outbound-qty" type="number" min="0.01" max={actionItems[0]?.balance ?? undefined} step="0.01" value={outboundQty} onChange={(event) => setOutboundQty(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="warehouse-outbound-date">출고 날짜</Label><Input id="warehouse-outbound-date" type="date" value={outboundDate} onChange={(event) => setOutboundDate(event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><p className="text-xs text-[var(--muted-foreground)]">현재 잔량 {actionItems[0]?.balance === null ? "미기입" : `${formatYds(actionItems[0]?.balance ?? 0)} yds`}</p><label className="flex items-center gap-2 text-xs"><Checkbox checked={exhaustOnZero} onCheckedChange={(value) => setExhaustOnZero(value === true)} aria-label="잔량 0이면 소진 완료" /><span>출고 후 잔량이 0이 되면 소진 완료로 옮깁니다. 체크를 풀면 창고 보관에 남습니다.</span></label></div></div> : null}
          {actionDialog?.kind === "EXHAUST" ? <p className="text-sm">재고 수량과 관계없이 이 원단을 소진 완료로 이동합니다.</p> : null}
          {actionDialog?.kind === "RESTORE" ? <p className="text-sm">{actionItems[0]?.status === "EXHAUSTED" ? "창고 보관 상태로 복구합니다." : "폐기 전 상태로 복구합니다."}</p> : null}
          {formError ? <p role="alert" className="text-sm text-[var(--destructive)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={closeActionDialog}>취소</Button><Button type="button" variant={actionDialog?.kind === "DISPOSE" ? "destructive" : "default"} disabled={saving} onClick={() => void runAction()}>{saving ? "처리 중…" : "처리 확정"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
