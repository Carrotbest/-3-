import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode , type CSSProperties } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ArchiveRestore, ClipboardList, Copy, DatabaseBackup, Eye, FileDown, History, Info, LayoutGrid, ListX, Loader2, Mail, PackageCheck, PackageOpen, PackageX, Pencil, Plus, Rows3, Search, Send, Trash2 } from "lucide-react"
import { Fabric1IntakeDialog } from "@/components/warehouse/Fabric1IntakeDialog"
import { InboundRequestMailDialog } from "@/components/warehouse/InboundRequestMailDialog"
import { RackMap } from "@/components/warehouse/RackMap"
import { DisposalRoundPanel } from "@/components/warehouse/DisposalRoundPanel"
import { OutboundRequestMailDialog } from "@/components/warehouse/OutboundRequestMailDialog"
import { FlEntryCheckDialog } from "@/components/warehouse/FlEntryCheckDialog"
import { normalizeRackNo, RACK_FORMAT_HINT } from "@/data/warehouse-rack"
import { CONSTRUCTIONS } from "@/data/constructions"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { GRADE_ROW_CLASS, PerfBadge, PerfCounts, usePerformanceIndex } from "@/components/fabric/PerfBadge"
import { GRADE_META, lookupPerformance, type FabricPerformance } from "@/data/fabric-performance"
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
import { buildFabricLedger, FABRIC1_STORAGE_NO_MAX, FABRIC1_STORAGE_NO_MIN, fabricRecordIdentity, isFabric1Item, latestActiveOutbound, STORAGE_NO_MAX, STORAGE_NO_WRAP, storageNoLabel, storageNumberOf, warehouseOrderKey, warehouseSequenceStart, type FabricLedgerItem } from "@/data/fabric-ledger"
import { backupFileName, buildExcelBackup } from "@/data/backup-export"
import { currentUserCanEditKey, useAuthStore } from "@/data/auth"
import { loadViewGroups, saveViewPref } from "@/data/view-prefs"
import { downloadBlob } from "@/data/dd-export"
import { DISPOSAL_REASONS, type DisposalReason } from "@/data/disposal-round"
import { combineRangeTsv, formatStatNumber, MULTI_RANGE_COPY_BLOCKED, type IndexRect } from "@/data/range-tsv"
import { buildWarehouseWorkbook, collectWarehouseExport, warehouseExportFileName } from "@/data/warehouse-export"
import { FabricDetailBody } from "@/routes/FabricDetail"
import { fmtDateFull, fmtDateMd } from "@/data/format"
import { rddaProductionType } from "@/data/derive"
import type { FabricLedgerStatus } from "@/data/schema"
import { FABRIC1_INTAKE_SHEET, WEB_INTAKE_SHEET } from "@/data/schema"
import { checkWarehouseFlEntry, needsFlConfirm, type WarehouseFlCheck } from "@/data/warehouse-fl-check"
import { buildInboundCard, buildOutboundCancelCard, buildOutboundConfirmCard, notifyTeams } from "@/data/teams-notify"
import { claimStorageNumbers, releaseStorageNumbers } from "@/data/storage-claims"
import { useInView } from "@/lib/useInView"
import { addManualIntake, updateManualIntake, applyDisposalRoundCompletion, applyFabricAction, applyFabricActions, backfillFabricRecordIds, clearFabric1Cells, removeFabricRows, saveDisposalRounds, saveFabricFields, saveFabricRackNo, saveFabricRackNos, undoFabricEntry, useAppStore, type ApplyFabricActionInput, type FabricUndoEntry } from "@/store/useAppStore"

type WarehouseTab = "READY" | "WAREHOUSE" | "HISTORY"
type ActionKind = "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "UNCONFIRM" | "DISPOSE" | "STOCK" | "OUTBOUND" | "UNOUTBOUND" | "EXHAUST" | "RESTORE" | "REMOVE"

interface ActionDialogState {
  kind: ActionKind
  keys: string[]
  /** 이력에서 되돌릴 때 어느 탭으로 보낼지. RESTORE 에서만 쓴다. */
  restoreTo?: "READY" | "WAREHOUSE"
}

const TAB_META: Record<WarehouseTab, { label: string; description: string }> = {
  READY: { label: "입고 대기", description: "완료 후 R&D No. 채번을 기다리는 원단" },
  WAREHOUSE: { label: "창고 보관", description: "재고와 출고 잔량을 관리하는 원단" },
  HISTORY: { label: "이력", description: "전량 소진 또는 폐기된 원단" },
}

type WarehouseColumnId = "storageNo" | "styleNo" | "flNo" | "millRef" | "owner" | "stock" | "confirm" | "rackNo"
  | "season" | "buyer" | "category" | "requestDate" | "completedAt"
  | "originalRef" | "planner" | "yarnDetail" | "construction" | "content" | "weight" | "color" | "dyeing" | "flSource" | "supplier" | "priceYd" | "priceLb" | "dueDate"
  | "yarnMill" | "yarnDate" | "knittingMill" | "knittingDate" | "dyeingMill" | "dyeingDate" | "finishingMill" | "finishingDate"
  | "actualWidth" | "actualWeight" | "shrinkageLength" | "shrinkageWidth"
  | "knitInch" | "knitGauge" | "knitNeedles" | "loopF" | "loopT" | "loopB"
  | "greigeWidth" | "greigeWeight" | "note"
  | "perfGrade" | "perfCounts" | "perfRate"

interface WarehouseColumn {
  id: WarehouseColumnId
  label: string
  width: number
}

interface WarehouseGroup {
  key: "fixed" | "rdda" | "ledger" | "process" | "result"
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
    // 빈 칸을 찾아 넣는 rack 관리(창고팀 협의 2026-09-14). 창고보관 탭에서만 보인다.
    { id: "rackNo", label: "Rack No.", width: 84 },
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
    { id: "content", label: "Content", width: 200 },
    { id: "weight", label: "Target wt'", width: 80 },
    { id: "actualWidth", label: "Final 폭", width: 76 },
    { id: "actualWeight", label: "Final 중량", width: 82 },
    { id: "color", label: "Color", width: 104 },
    { id: "dyeing", label: "Dyeing Side", width: 88 },
    { id: "flSource", label: "구분", width: 84 },
    { id: "supplier", label: "공급처", width: 150 },
    { id: "priceYd", label: "Price ($/YD)", width: 88 },
    { id: "priceLb", label: "Price ($/LB)", width: 88 },
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
  // RDDA 원장 누적 성과(R211). FL No.로 붙이며 3팀 담당 FL만 수치가 있다.
  { key: "rdda", label: "RDDA 성과", color: "var(--chart-2)", collapsible: true, columns: [
    { id: "perfGrade", label: "등급", width: 84 },
    { id: "perfCounts", label: "제안/픽업/오더", width: 104 },
    { id: "perfRate", label: "픽업률", width: 68 },
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

// 1팀 열은 1팀 엑셀 순서를 따른다(2026-09-22). No., R&D Number, 위치, 폐기는 고정 열과 탭이 대신한다.
const TEAM1_COLUMN_GROUPS: readonly WarehouseGroup[] = [
  COLUMN_GROUPS[0],
  { key: "ledger", label: "대장", color: "var(--chart-1)", columns: [
    { id: "flNo", label: "FL No.", width: 100 },
    { id: "millRef", label: "Mill Ref.", width: 120 },
    { id: "color", label: "Color", width: 104 },
    { id: "construction", label: "Construction", width: 124 },
    { id: "content", label: "Content", width: 200 },
    { id: "actualWidth", label: "Width (INCH)", width: 88 },
    { id: "actualWeight", label: "Weight (G/M2)", width: 92 },
    { id: "priceYd", label: "Price ($/YD)", width: 88 },
    { id: "priceLb", label: "Price ($/LB)", width: 88 },
    { id: "owner", label: "입고담당자", width: 88 },
    { id: "requestDate", label: "입고 요청일", width: 88 },
    { id: "note", label: "Remark", width: 200 },
    { id: "supplier", label: "완사입 업체", width: 150 },
  ] },
]

const WH_COL_WIDTHS_KEY = "warehouse-col-widths-v1"
const WH_OPEN_GROUPS_KEY = "warehouse-open-groups-v1"
const MIN_COL_WIDTH = 48

/** 행 높이가 h-8 로 고정이라 보이는 구간만 그리면 된다. 이력 탭은 4,400행이 넘는다. */
const MANUAL_EDITABLE = new Set(["styleNo", "flNo", "buyer", "season", "category", "owner", "construction", "content", "priceYd", "priceLb", "supplier", "note", "originalRef", "planner", "yarnDetail", "color", "dyeing"])
const FABRIC1_SAMPLE_EDITABLE = new Set<WarehouseColumnId>(["flNo", "color", "construction", "owner", "requestDate", "note"])
const FABRIC1_OVERRIDE_EDITABLE = new Set<WarehouseColumnId>(["millRef", "content", "actualWidth", "actualWeight", "priceYd", "priceLb", "supplier"])
const FABRIC1_EDITABLE = new Set<WarehouseColumnId>([...FABRIC1_SAMPLE_EDITABLE, ...FABRIC1_OVERRIDE_EDITABLE])
const FABRIC1_ONLY_COLUMNS = new Set<WarehouseColumnId>(["millRef", "content", "flSource", "supplier", "priceYd", "priceLb"])

const ROW_HEIGHT = 32
const ROW_OVERSCAN = 12

const TAB_ORDER: WarehouseTab[] = ["READY", "WAREHOUSE", "HISTORY"]
const TAB_ORDER_TEAM1: WarehouseTab[] = ["WAREHOUSE", "HISTORY"]
const TAB_STATUSES: Record<WarehouseTab, readonly FabricLedgerStatus[]> = {
  READY: ["READY"],
  WAREHOUSE: ["WAREHOUSE"],
  HISTORY: ["EXHAUSTED", "DISPOSED"],
}

/** 탭·상태별 고정 액센트. 모든 탭에서 열 구성이 같으므로 색으로만 맥락을 구분한다. */
const TAB_ACCENT: Record<WarehouseTab, { fill: string; dot: string; active: string; badge: string; bar: string; drop: string; rowBar: string; borderTop: string; headBg: string }> = {
  READY: { fill: "bg-[var(--warning)]", dot: "bg-[var(--warning)]", active: "data-[state=active]:bg-[var(--warning)] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:font-semibold", badge: "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)] group-data-[state=active]/tab:bg-white/25 group-data-[state=active]/tab:text-white", bar: "bg-[var(--warning)]", drop: "ring-2 ring-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_15%,transparent)]", rowBar: "border-l-[var(--warning)]", borderTop: "border-t-[var(--warning)]", headBg: "color-mix(in srgb, var(--warning) 16%, var(--card))" },
  WAREHOUSE: { fill: "bg-[var(--chart-2)]", dot: "bg-[var(--chart-2)]", active: "data-[state=active]:bg-[var(--chart-2)] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:font-semibold", badge: "bg-[color-mix(in_srgb,var(--chart-2)_15%,transparent)] text-[var(--chart-2)] group-data-[state=active]/tab:bg-white/25 group-data-[state=active]/tab:text-white", bar: "bg-[var(--chart-2)]", drop: "ring-2 ring-[var(--chart-2)] bg-[color-mix(in_srgb,var(--chart-2)_15%,transparent)]", rowBar: "border-l-[var(--chart-2)]", borderTop: "border-t-[var(--chart-2)]", headBg: "color-mix(in srgb, var(--chart-2) 16%, var(--card))" },
  HISTORY: { fill: "bg-[var(--muted-foreground)]", dot: "bg-[var(--muted-foreground)]", active: "data-[state=active]:bg-[var(--muted-foreground)] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:font-semibold", badge: "bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)] text-[var(--foreground)] group-data-[state=active]/tab:bg-white/25 group-data-[state=active]/tab:text-white", bar: "bg-[var(--muted-foreground)]", drop: "ring-2 ring-[var(--muted-foreground)] bg-[color-mix(in_srgb,var(--muted-foreground)_15%,transparent)]", rowBar: "border-l-[var(--muted-foreground)]", borderTop: "border-t-[var(--muted-foreground)]", headBg: "color-mix(in srgb, var(--muted-foreground) 16%, var(--card))" },
}

const GRIP_WIDTH = 42
const ACTION_WIDTH = 56
const FABRIC1_RANGE = { min: FABRIC1_STORAGE_NO_MIN, max: FABRIC1_STORAGE_NO_MAX }

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

const EXPORT_RANGE_KEY = "warehouse-export-range"
const EXPORT_PRESETS = ["어제", "오늘", "이번 주", "지난 주", "직접 지정"] as const
type ExportPreset = typeof EXPORT_PRESETS[number]
interface ExportRange { preset: ExportPreset; from: string; to: string }

function exportPresetDates(preset: ExportPreset): { from: string; to: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (preset === "어제") start.setDate(start.getDate() - 1)
  if (preset === "이번 주" || preset === "지난 주") {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7 - (preset === "지난 주" ? 7 : 0))
  }
  const end = new Date(start)
  if (preset === "이번 주" || preset === "지난 주") end.setDate(end.getDate() + 6)
  return { from: localDateValue(start), to: localDateValue(end) }
}

function isExportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function loadExportRange(): ExportRange {
  const fallback: ExportRange = { preset: "지난 주", ...exportPresetDates("지난 주") }
  try {
    const stored = JSON.parse(window.localStorage.getItem(EXPORT_RANGE_KEY) ?? "null") as Partial<ExportRange> | null
    if (!stored || !EXPORT_PRESETS.includes(stored.preset as ExportPreset)) return fallback
    return {
      preset: stored.preset as ExportPreset,
      from: isExportDate(stored.from) ? stored.from : fallback.from,
      to: isExportDate(stored.to) ? stored.to : fallback.to,
    }
  } catch { return fallback }
}

function formatYds(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
}

/**
 * 지금 창고에 있어서 쓸 수 없는 번호. 창고보관만 센다.
 * 소진·폐기로 이력에 간 번호는 다시 쓴다. 오래된 이력은 FL No.로 찾지 R&D No.로 찾지 않는다.
 * 번호를 아껴 쓰는 것보다 빈칸 없이 순서대로 나가는 것이 창고팀과의 약속이다.
 */
function occupiedStorageNumbers(items: readonly FabricLedgerItem[]): Set<number> {
  const used = new Set<number>()
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE") return
    const matched = item.storageNo.trim().match(/^\d{1,5}(?!\d)/)?.[0]
    if (matched) used.add(Number(matched))
  })
  return used
}

function nextStorageNumbers(items: readonly FabricLedgerItem[], count: number, scope: "team3" | "team1" = "team3"): number[] {
  const scoped = items.filter((item) => isFabric1Item(item) === (scope === "team1"))
  const used = occupiedStorageNumbers(scoped)
  const picked: number[] = []
  const take = (candidate: number) => {
    if (used.has(candidate)) return
    picked.push(candidate)
    used.add(candidate)
  }
  const numberOf = (value: string): number | null => {
    const matched = value.trim().match(/^\d{1,5}(?!\d)/)?.[0]
    return matched ? Number(matched) : null
  }
  const stockedItems = scoped.filter((item) => item.status === "WAREHOUSE")
  const numberInScope = (item: FabricLedgerItem | null | undefined): number | null => {
    if (!item) return null
    const value = numberOf(item.storageNo)
    if (value === null) return null
    return scope === "team1" && (value < FABRIC1_RANGE.min || value > FABRIC1_RANGE.max) ? null : value
  }
  // 한 번에 입고한 항목은 intakeAt이 같다. 같은 시각의 끝 번호를 순환 순서로 골라 프론티어로 삼는다.
  const latestIntakeAt = stockedItems.reduce((latest, item) => item.intakeAt && numberInScope(item) !== null && item.intakeAt > latest ? item.intakeAt : latest, "")
  const latestItems = latestIntakeAt ? stockedItems.filter((item) => item.intakeAt === latestIntakeAt && numberInScope(item) !== null) : []
  const latestNumbers = latestItems.map(numberInScope).filter((value): value is number => value !== null)
  const latestStart = scope === "team1"
    ? warehouseSequenceStart(latestNumbers, FABRIC1_RANGE)
    : warehouseSequenceStart(latestNumbers)
  const latestItem = latestItems.reduce<FabricLedgerItem | null>((last, item) => {
    if (!last) return item
    const itemKey = scope === "team1" ? warehouseOrderKey(item, latestStart, FABRIC1_RANGE) : warehouseOrderKey(item, latestStart)
    const lastKey = scope === "team1" ? warehouseOrderKey(last, latestStart, FABRIC1_RANGE) : warehouseOrderKey(last, latestStart)
    return itemKey > lastKey ? item : last
  }, null)
  const frontier = numberInScope(latestItem)
    ?? Math.max(scope === "team1" ? FABRIC1_STORAGE_NO_MIN - 1 : 0, ...stockedItems.map((item) => numberInScope(item) ?? 0))
  if (scope === "team1") {
    // 1팀은 빈자리를 메우지 않는다. 최신 입고 번호 다음부터 가고 9999 다음은 8000으로 되감는다.
    for (let candidate = frontier + 1; candidate <= FABRIC1_STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
    for (let candidate = FABRIC1_STORAGE_NO_MIN; candidate <= frontier && picked.length < count; candidate += 1) take(candidate)
    return picked
  }
  // 어떤 상태로든 그 번호를 쓰는 항목이 있으면 '기록 있음'이다. 빈자리 판정에만 쓴다.
  const recorded = new Set<number>()
  scoped.forEach((item) => {
    const value = numberOf(item.storageNo)
    if (value !== null) recorded.add(value)
  })
  // 프론티어 = 웹에서 마지막으로 입고 등록한 번호. 원장 항목의 입고일(intakeAt)로 찾는다.
  // 대장에서 이관된 옛 항목은 intakeAt 이 없다. 그래서 옛 주기에 남은 높은 번호에 끌려가지 않는다.
  // 현재 주기 밴드. 프론티어에서 아래로 내려가다 기록 없는 번호가 20개 이어지면 옛 주기다.
  const GAP_BREAK = 20
  let band = frontier
  let run = 0
  for (let candidate = frontier; candidate >= 1; candidate -= 1) {
    if (recorded.has(candidate)) { run = 0; band = candidate; continue }
    run += 1
    if (run >= GAP_BREAK) break
  }
  // 1) 주기 안에 생긴 빈자리부터 메운다. 입고 취소나 숨김으로 풀린 번호다.
  for (let candidate = band; candidate <= frontier && picked.length < count; candidate += 1) {
    if (!recorded.has(candidate)) take(candidate)
  }
  // 2) 프론티어 다음부터 순서대로. 창고에 있는 번호만 건너뛴다(이력 번호는 그냥 쓴다).
  for (let candidate = frontier + 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  // 3) 7999 를 넘기면 1000 부터 되감는다.
  for (let candidate = STORAGE_NO_WRAP; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  return picked
}

/**
 * 필터와 정렬이 보는 값. coreCell 이 화면에 그리는 값과 같은 출처를 쓴다.
 * 한쪽만 고치면 필터 목록과 화면이 어긋나므로 열을 더할 때 둘 다 손봐야 한다.
 */
// cellValue 는 컴포넌트 밖 함수라 성과 색인을 인자로 받지 않는다. Warehouse 가 렌더마다 먼저 채운다.
let perfIndexForCells: Map<string, FabricPerformance> | null = null
const perfOf = (item: FabricLedgerItem): FabricPerformance | null => lookupPerformance(perfIndexForCells, item.flNo)

/** 성과 열 정렬값. 문자열 비교로는 등급 순서와 숫자 크기가 맞지 않는다. */
function perfSortValue(item: FabricLedgerItem, id: WarehouseColumnId): number {
  const perf = perfOf(item)
  if (!perf) return Number.NEGATIVE_INFINITY
  if (id === "perfGrade") return -GRADE_META[perf.grade].rank
  if (id === "perfCounts") return (perf.orders ?? 0) * 1_000_000 + (perf.picks ?? 0) * 1_000 + perf.offers
  return perf.pickRate ?? -1
}

function cellValue(item: FabricLedgerItem, id: WarehouseColumnId): string {
  const record = item.record
  const led = item.sample?.ledger
  const sam = item.sample
  // 창고는 대장 미러다. 호출부는 (DD 값, 대장 값) 순서로 유지하고 여기서 대장 값을 먼저 고른다.
  const first = (fromRecord: unknown, fromLedger?: unknown): string => {
    for (const value of [fromLedger, fromRecord]) {
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
    case "millRef": return item.fields.millRef ?? ""
    case "owner": return item.owner
    case "stock": return item.yds === null ? "" : `${item.balance ?? 0}/${item.yds}`
    case "confirm": return item.status !== "WAREHOUSE" ? "" : item.confirmedAt ? "확인" : "미확인"
    case "rackNo": return item.rackNo ?? ""
    case "season": return first(item.season, led?.seasonRaw)
    case "buyer": return item.buyer
    case "category": return first(item.category, led?.categoryRaw)
    case "requestDate": return item.requestDate ?? ""
    case "completedAt": return item.completedAt
    case "originalRef": return first(record?.tech?.original?.brand, led?.originalRef)
    case "planner": return first(record?.planner, led?.planner)
    case "yarnDetail": return first(record?.tech?.yarnDetail, led?.yarnDetail)
    case "construction": return first(record?.construction, item.construction)
    case "content": return item.fields.content ?? ""
    case "weight": return first(record?.weight, led?.targetWeight)
    case "color": return first(record?.color, led?.color)
    case "dyeing": return first(record?.dyeing, led?.dyeingSide)
    case "flSource": {
      if (!item.flNo.trim()) return ""
      const type = rddaProductionType(item.flNo)
      return type === "gd" ? "GD개발" : type === "purchase" ? "완사입" : type === "production" ? "생산팀" : type === "domestic" ? "자체개발" : "기타"
    }
    case "supplier": return item.fields.supplier ?? ""
    case "priceYd": return item.fields.priceYd ?? ""
    case "priceLb": return item.fields.priceLb ?? ""
    case "dueDate": return first(record?.dueDate, led?.dueDate)
    case "yarnMill": return first(record?.tech?.mills?.yarn, led?.mills?.yarn)
    case "yarnDate": return first(record?.tech?.processDates?.yarn, sam?.process.yarn)
    case "knittingMill": return first(record?.tech?.mills?.knitting, led?.mills?.knitting)
    case "knittingDate": return first(record?.tech?.processDates?.knitting, sam?.process.knit)
    case "dyeingMill": return first(record?.tech?.mills?.dyeing, led?.mills?.dyeing)
    case "dyeingDate": return first(record?.tech?.processDates?.dyeing, sam?.process.dye)
    case "finishingMill": return first(record?.tech?.mills?.finishing, led?.mills?.finishing)
    case "finishingDate": return first(record?.tech?.processDates?.finishing, sam?.process.finish)
    case "actualWidth": return first(record?.tech?.actual?.width, sam?.inhouse.widthCm) || (item.fields.actualWidth ?? "")
    case "actualWeight": return first(record?.tech?.actual?.weight, sam?.inhouse.weightGsm) || (item.fields.actualWeight ?? "")
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
    case "perfGrade": { const perf = perfOf(item); return perf ? GRADE_META[perf.grade].label : "" }
    case "perfCounts": { const perf = perfOf(item); return perf ? `${perf.offers}/${perf.picks ?? "-"}/${perf.orders ?? "-"}` : "" }
    case "perfRate": { const perf = perfOf(item); return perf?.pickRate != null ? `${perf.pickRate.toFixed(1)}%` : "" }
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

/** 조회 탭 비율 스택바 — 세그먼트를 누르면 해당 탭으로 이동한다. */
function StatusMixBar({ counts, total, tabs, onPick }: { counts: Record<WarehouseTab, number>; total: number; tabs: readonly WarehouseTab[]; onPick: (tab: WarehouseTab) => void }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  return (
    <div ref={ref} className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]" role="img" aria-label={`상태 분포 — ${tabs.map((key) => `${TAB_META[key].label} ${counts[key]}건`).join(", ")}`}>
      {tabs.map((key) => (
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

export function Warehouse() {
  const perfIndex = usePerformanceIndex()
  perfIndexForCells = perfIndex
  const access = useAuthStore((state) => state.access)
  const isOwner = useAuthStore((state) => state.isOwner)
  const canSeeTeam3 = isOwner || access.warehouse !== "none"
  const canSeeTeam1 = isOwner || access.warehouseFabric1 !== "none"
  const [teamScope, setTeamScope] = useState<"team3" | "team1">(() => canSeeTeam3 ? "team3" : "team1")
  const scopeAccess = teamScope === "team1" ? access.warehouseFabric1 : access.warehouse
  /** 지금 보고 있는 스코프를 고칠 수 있는가. 버튼과 표 편집은 모두 이 값을 본다. */
  const canEditScope = isOwner || scopeAccess === "edit"
  /** 출고 요청 메일은 데이터를 저장하지 않는 기능이라 편집과 별도로 본다. */
  const canRequestOutbound = isOwner || access.warehouseOutbound !== "none"
  const canBackup = useAuthStore((state) => state.isOwner || state.screenPermissions.excelBackup)
  // 출고 요청 메일 초안(C형). 요청자 기본값은 로그인 표시 이름, 없으면 이메일 앞부분이다.
  const [outboundMailOpen, setOutboundMailOpen] = useState(false)
  const [fabric1IntakeOpen, setFabric1IntakeOpen] = useState(false)
  // 선택 입고 뒤 입고 요청 메일을 만들 원단 key. 입고 등록이 끝난 원장 값(R&D No.)으로 표를 채운다.
  const [inboundMailKeys, setInboundMailKeys] = useState<string[]>([])
  // Rack 배치도 보기. 켜면 표 자리에 배치도를 그리고, 탭을 누르거나 칸을 고르면 표로 돌아간다.
  const [rackView, setRackView] = useState(false)
  const [disposalView, setDisposalView] = useState(false)
  const authUser = useAuthStore((state) => state.user)
  const canWrite = useAuthStore((state) => state.isOwner || (state.status === "signed-in" && state.approval === "approved"))
  const defaultRequester = useAuthStore((state) => state.user?.displayName || state.user?.email?.split("@")[0] || "")
  const records = useAppStore((state) => state.records)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const fabricEvents = useAppStore((state) => state.fabricEvents)
  const disposalRounds = useAppStore((state) => state.disposalRounds)
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents), [fabricEvents, overrides, records, samples])
  const suggestFabric1Numbers = useCallback((count: number) => nextStorageNumbers(ledger, count, "team1"), [ledger])
  const scopedLedger = useMemo(() => ledger.filter((item) => isFabric1Item(item) === (teamScope === "team1")), [ledger, teamScope])
  /**
   * 목록에서 숨긴(REMOVED) 항목. 되살리기 화면에서만 쓴다.
   * 채번과 통계는 위 `ledger` 를 그대로 보게 두어야 한다. 숨긴 번호까지 점유로 세면 채번이 달라진다.
   */
  const hiddenLedger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents, { includeRemoved: true })
    .filter((item) => item.status === "REMOVED" && isFabric1Item(item) === (teamScope === "team1")),
  [fabricEvents, overrides, records, samples, teamScope])
  const hiddenCount = hiddenLedger.length
  /** 3팀 번호 순환을 전제하는 곳(폐기 라운드)이 쓰는 목록. 팀 전환과 무관하게 항상 3팀만이다. */
  const team3Ledger = useMemo(() => ledger.filter((item) => !isFabric1Item(item)), [ledger])
  useEffect(() => {
    if (!canSeeTeam3 && canSeeTeam1 && teamScope === "team3") setTeamScope("team1")
    else if (!canSeeTeam1 && canSeeTeam3 && teamScope === "team1") setTeamScope("team3")
  }, [canSeeTeam1, canSeeTeam3, teamScope])
  const recordIdBackfillRef = useRef(false)
  useEffect(() => {
    if (!canWrite || recordIdBackfillRef.current) return
    recordIdBackfillRef.current = true
    void backfillFabricRecordIds().catch(() => undefined)
  }, [canWrite])
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRange, setExportRange] = useState(loadExportRange)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState("")
  const [backupExporting, setBackupExporting] = useState(false)
  const exportBackup = async () => {
    if (backupExporting) return
    setBackupExporting(true)
    try {
      downloadBlob(await buildExcelBackup(), backupFileName("xlsx"))
    } catch {
      window.alert("엑셀 백업에 실패했습니다.")
    } finally {
      setBackupExporting(false)
    }
  }
  useEffect(() => { saveViewPref(EXPORT_RANGE_KEY, exportRange) }, [exportRange])
  useEffect(() => { if (exportOpen) setExportError("") }, [exportOpen, exportRange])
  const exportDates = exportRange.preset === "직접 지정" ? exportRange : exportPresetDates(exportRange.preset)
  const exportDayCount = isExportDate(exportDates.from) && isExportDate(exportDates.to)
    ? (Date.parse(`${exportDates.to}T00:00:00Z`) - Date.parse(`${exportDates.from}T00:00:00Z`)) / 86400000 + 1 : 0
  const exportRangeError = exportDayCount > 31 ? "기간이 너무 깁니다. 31일 이내로 좁혀 주세요."
    : exportDayCount <= 0 ? "시작일과 종료일을 올바르게 지정해 주세요." : ""
  const exportData = useMemo(() => exportOpen && !exportRangeError
    ? collectWarehouseExport(fabricEvents, scopedLedger, exportDates.from, exportDates.to) : null,
  [exportOpen, exportRangeError, fabricEvents, scopedLedger, exportDates.from, exportDates.to])
  const runExport = async () => {
    if (!exportData || exportBusy) return
    setExportBusy(true)
    setExportError("")
    try {
      const blob = await buildWarehouseWorkbook(exportData)
      downloadBlob(blob, warehouseExportFileName(exportData.from, exportData.to))
    } catch {
      setExportError("엑셀 내려받기에 실패했습니다. 다시 시도해 주세요.")
    } finally { setExportBusy(false) }
  }
  const [tab, setTab] = useState<WarehouseTab>("READY")
  const tabOrder = teamScope === "team1" ? TAB_ORDER_TEAM1 : TAB_ORDER
  // 펼침/접힘은 개인 브라우저에 남는다. 팀원 화면에는 영향을 주지 않는다.
  const [openGroups, setOpenGroups] = useState(() => loadViewGroups(WH_OPEN_GROUPS_KEY, { process: true, rdda: true }))
  useEffect(() => { saveViewPref(WH_OPEN_GROUPS_KEY, openGroups) }, [openGroups])
  // 열 너비는 사용자가 끌어 조절하고 브라우저에 남는다. 기본값을 바꾸면 키를 올려야 반영된다.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const storedWidths: Record<string, number> = {}
    const knownIds = new Set([...COLUMN_GROUPS, ...TEAM1_COLUMN_GROUPS].flatMap((group) => group.columns).map((column) => column.id))
    try {
      const raw = window.localStorage.getItem(WH_COL_WIDTHS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, unknown>
        Object.entries(stored).forEach(([id, value]) => {
          if (knownIds.has(id as WarehouseColumnId) && typeof value === "number" && Number.isFinite(value) && value >= MIN_COL_WIDTH) storedWidths[id] = value
        })
      }
    } catch { /* 저장소를 못 쓰면 기본 너비로 간다. */ }
    return storedWidths
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
  const [receiveRolls, setReceiveRolls] = useState<Record<string, boolean>>({})
  const [receiveNos, setReceiveNos] = useState<Record<string, string>>({})
  const [confirmChecks, setConfirmChecks] = useState<Record<string, boolean>>({})
  // 실물 입고 확인 창의 Rack No. 입력값. 창고팀이 확인하면서 칸 번호를 같이 적는다.
  const [confirmRacks, setConfirmRacks] = useState<Record<string, string>>({})
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false)
  const [hiddenOnly, setHiddenOnly] = useState(false)
  // 웹 등록 행만 그리드에서 직접 고친다. DD·대장에서 온 행은 여기서 수정하지 않는다.
  const [editCell, setEditCell] = useState<{ row: string; col: string } | null>(null)
  const [flEntryCheck, setFlEntryCheck] = useState<{ item: FabricLedgerItem; manualId: string; check: WarehouseFlCheck } | null>(null)
  // 엑셀식 열 필터와 정렬. 기본은 대장 행 순서이고 정렬을 걸었을 때만 바뀐다.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [sortRule, setSortRule] = useState<{ col: WarehouseColumnId; dir: "asc" | "desc" } | null>(null)
  const [filterMenu, setFilterMenu] = useState<WarehouseColumnId | null>(null)
  const [filterSearch, setFilterSearch] = useState("")
  const [exhaustOnZero, setExhaustOnZero] = useState(true)
  // 셀 범위 선택. 행은 visibleRows 인덱스, 열은 visibleColumns 인덱스다.
  const [cellRange, setCellRange] = useState<{ ar: number; ac: number; fr: number; fc: number } | null>(null)
  // Ctrl+클릭으로 더한 영역. cellRange는 마지막에 잡은 활성 영역이다.
  const [extraCellRanges, setExtraCellRanges] = useState<{ ar: number; ac: number; fr: number; fc: number }[]>([])
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<FabricUndoEntry[]>([])
  const [undoing, setUndoing] = useState(false)
  const cellDragRef = useRef(false)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number; key: string } | null>(null)
  const [viewports, setViewports] = useState<Record<string, { top: number; height: number }>>({})
  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({})
  /**
   * 그리드 스크롤 상자의 ref.
   *
   * **여기서 setState 를 하면 안 된다.** 렌더마다 새로 만든 ref 콜백은 React 가 커밋마다 떼었다 붙인다.
   * 그 안에서 상태를 바꾸면 커밋과 렌더가 끝없이 이어져 "Maximum update depth exceeded" 로 트리가 통째로 죽는다.
   * 화면 전체가 백지가 되고 콘솔 말고는 단서가 남지 않는다(2026-09-10 창고 탭 전환 사고).
   * 값이 같으면 같은 객체를 돌려주는 방어로는 못 막는다. 렌더가 연달아 도는 중에는 React 의 조기 탈출이 걸리지 않는다.
   *
   * 높이 측정은 아래 ResizeObserver 와 탭 전환 useLayoutEffect 가 맡는다.
   */
  const attachGrid = useCallback((element: HTMLDivElement | null) => {
    gridRefs.current[tab] = element
  }, [tab])
  const [stockYds, setStockYds] = useState("")
  const [stockBalance, setStockBalance] = useState("")
  const [recipient, setRecipient] = useState("")
  const [division, setDivision] = useState("")
  const [outboundQtys, setOutboundQtys] = useState<Record<string, string>>({})
  const [outboundDate, setOutboundDate] = useState(localDateValue)
  const [disposalReason, setDisposalReason] = useState<DisposalReason | "">("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  // 행 위 드래그 = 범위 선택. 클릭(상세 열기)과 충돌하지 않도록 이동 여부를 따로 기억한다.
  const dragAnchorRef = useRef<number | null>(null)
  const rangeDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)

  const counts = useMemo(() => Object.fromEntries(TAB_ORDER.map((key) => [key, scopedLedger.filter((item) => TAB_STATUSES[key].includes(item.status)).length])) as Record<WarehouseTab, number>, [scopedLedger])
  /** 되감기 지점은 검색·필터와 무관하게 창고 보관 전체 번호로 정한다. */
  const sequenceStart = useMemo(
    () => warehouseSequenceStart(ledger.filter((item) => item.status === "WAREHOUSE" && !isFabric1Item(item)).map(storageNumberOf).filter((value): value is number => value !== null)),
    [ledger],
  )
  // Rack No. 추천은 고정 선반 목록이 아니라 지금까지 입력된 값이다. 배치가 바뀌어도 사람이 친 값이 그대로 목록이 된다.
  const usedRackNos = useMemo(() => [...new Set(ledger.map((item) => item.rackNo?.trim() ?? "").filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true })), [ledger])
  const fabric1SequenceStart = useMemo(
    () => warehouseSequenceStart(ledger.filter((item) => item.status === "WAREHOUSE" && isFabric1Item(item)).map(storageNumberOf).filter((value): value is number => value !== null), FABRIC1_RANGE),
    [ledger],
  )
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    const base = hiddenOnly ? hiddenLedger : scopedLedger.filter((item) => TAB_STATUSES[tab].includes(item.status))
    return base
      .filter((item) => !(unconfirmedOnly && tab === "WAREHOUSE" && !hiddenOnly) || !item.confirmedAt)
      .filter((item) => !query || [
      item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner,
      item.fields.millRef,
      item.sample?.ledger?.seasonRaw, item.sample?.ledger?.categoryRaw, item.sample?.ledger?.originalRef,
      item.construction, item.lastOutbound?.to, item.lastOutbound?.division, item.note,
      item.record?.planner, item.record?.tech?.original?.brand, item.record?.tech?.yarnDetail,
      item.record?.color, item.record?.dyeing, item.record?.dueDate,
      ...item.outbound.flatMap((outbound) => [outbound.to, outbound.division]),
    ].some((value) => String(value ?? "").toLocaleLowerCase("ko-KR").includes(query)))
  }, [hiddenLedger, hiddenOnly, scopedLedger, search, tab, unconfirmedOnly])

  // 원단별로 이력(소진·폐기)에 들어간 마지막 시각. 기록 시각(recordedAt)을 먼저 본다. 출고일(occurredAt)은 사람이 고른 날짜다.
  const historyEnteredAt = useMemo(() => {
    const map = new Map<string, string>()
    for (const event of fabricEvents) {
      if (event.toStatus !== "EXHAUSTED" && event.toStatus !== "DISPOSED") continue
      const at = event.recordedAt ?? event.occurredAt ?? ""
      // DD 값이 바뀌면 원장 key가 달라질 수 있어 R&D No.로도 찾는다.
      for (const id of [event.fabricKey, event.storageNo ? `no:${event.storageNo.trim()}` : ""]) {
        if (!id) continue
        const previous = map.get(id)
        if (!previous || at > previous) map.set(id, at)
      }
    }
    return { get: (item: FabricLedgerItem) => map.get(item.key) ?? (item.storageNo.trim() ? map.get(`no:${item.storageNo.trim()}`) : undefined) }
  }, [fabricEvents])

  // 열 필터를 통과한 행. 정렬을 걸지 않으면 원장이 준 대장 순서를 그대로 쓴다.
  const visibleRows = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, values]) => values.length > 0)
    const filtered = active.length === 0 ? rows : rows.filter((item) =>
      active.every(([columnId, values]) => values.includes(cellValue(item, columnId as WarehouseColumnId))))
    if (!sortRule) {
      // 창고 보관은 채번 순서대로 본다. 되감기(7999 다음 낮은 번호)까지 펴서 선반 순서와 맞춘다.
      // 대장 시트 순서를 그대로 쓰면 웹에서 새로 입고한 건이 번호와 무관하게 늘 맨 아래로 간다.
      // 이력은 화면을 아래부터 본다. 창고에서 넘어온 순서대로 아래에 쌓이게, 이력에 들어간 시각 오름차순으로 둔다.
      // 넘어온 기록이 없는 대장 이관분은 원래 순서 그대로 위에 둔다.
      if (tab === "HISTORY") {
        const legacy = filtered.filter((item) => !historyEnteredAt.get(item))
        const moved = filtered.filter((item) => historyEnteredAt.get(item))
          .sort((left, right) => historyEnteredAt.get(left)!.localeCompare(historyEnteredAt.get(right)!))
        return [...legacy, ...moved]
      }
      if (tab !== "WAREHOUSE") return filtered
      if (teamScope === "team1") {
        return [...filtered].sort((left, right) => warehouseOrderKey(left, fabric1SequenceStart, FABRIC1_RANGE) - warehouseOrderKey(right, fabric1SequenceStart, FABRIC1_RANGE))
      }
      return [...filtered].sort((left, right) => warehouseOrderKey(left, sequenceStart) - warehouseOrderKey(right, sequenceStart))
    }
    const direction = sortRule.dir === "asc" ? 1 : -1
    if (sortRule.col.startsWith("perf")) return [...filtered].sort((left, right) => direction * (perfSortValue(left, sortRule.col) - perfSortValue(right, sortRule.col)))
    return [...filtered].sort((left, right) =>
      direction * cellValue(left, sortRule.col).localeCompare(cellValue(right, sortRule.col), "ko-KR", { numeric: true }))
  }, [rows, columnFilters, sortRule, tab, teamScope, sequenceStart, fabric1SequenceStart, perfIndex, historyEnteredAt])
  const divisionSuggestions = useMemo(() => [...new Set(fabricEvents.map((event) => event.division?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true })), [fabricEvents])
  // 입고 대기에서는 R&D No., 재고, 입고확인이 아직 의미가 없어 고정 열을 숨긴다. Rack No.는 창고보관 탭에서만 보인다.
  const scopeGroups = teamScope === "team1"
    ? TEAM1_COLUMN_GROUPS
    : COLUMN_GROUPS.map((group) => ({ ...group, columns: group.columns.filter((column) => !FABRIC1_ONLY_COLUMNS.has(column.id)) }))
  const visibleGroups = scopeGroups
    .filter((group) => !group.collapsible || openGroups[group.key as keyof typeof openGroups])
    .map((group) => group.key !== "fixed" ? group : { ...group, columns: group.columns.filter((column) => tab !== "READY" && (column.id !== "rackNo" || tab === "WAREHOUSE")) })
    .filter((group) => group.columns.length > 0)
  const visibleColumns = visibleGroups.flatMap((group) => group.columns)
  const fixedColumns = visibleColumns.filter((column) => COLUMN_GROUPS[0].columns.some((fixed) => fixed.id === column.id))
  const groupedColumns = visibleGroups.filter((group) => group.key !== "fixed")
  const gripWidth = teamScope === "team1" ? 62 : GRIP_WIDTH
  const tableWidth = gripWidth + ACTION_WIDTH + visibleColumns.reduce((sum, column) => sum + widthOf(column), 0)
  const ledgerByKey = useMemo(() => new Map([...scopedLedger, ...hiddenLedger].map((item) => [item.key, item])), [scopedLedger, hiddenLedger])
  const outboundHistoryItem = outboundHistoryKey ? ledgerByKey.get(outboundHistoryKey) ?? null : null
  const actionItems = actionDialog?.keys.map((key) => ledgerByKey.get(key)).filter((item): item is FabricLedgerItem => Boolean(item)) ?? []
  const selectedRows = rows.filter((item) => checked.has(item.key))
  const activeOutboundFor = (item: FabricLedgerItem) => latestActiveOutbound(fabricEvents, item.key, fabricRecordIdentity(item.record))
  const hasSelectedActiveOutbound = selectedRows.some((item) => Boolean(activeOutboundFor(item)))
  const allRowsSelected = visibleRows.length > 0 && visibleRows.every((item) => checked.has(item.key))
  const someRowsSelected = visibleRows.some((item) => checked.has(item.key))
  const accent = TAB_ACCENT[tab]
  const fixedLeft = (id: WarehouseColumnId): number => {
    const index = fixedColumns.findIndex((column) => column.id === id)
    return gripWidth + fixedColumns.slice(0, Math.max(0, index)).reduce((sum, column) => sum + widthOf(column), 0)
  }

  // KPI — 탭 badge와 겹치지 않는 재고·출고 관점 지표.
  const kpi = useMemo(() => {
    const stored = scopedLedger.filter((item) => item.status === "WAREHOUSE")
    const stockTotal = stored.reduce((sum, item) => sum + (item.yds ?? 0), 0)
    const balanceTotal = stored.reduce((sum, item) => sum + (item.balance ?? 0), 0)
    const outboundTotal = scopedLedger.reduce((sum, item) => sum + item.outboundTotal, 0)
    const outboundCount = scopedLedger.reduce((sum, item) => sum + item.outbound.length, 0)
    const missingStock = stored.filter((item) => item.yds === null).length
    const shipped = stockTotal + outboundTotal
    // 창고보관 중인 RDDA 성과 원단(R211). 3팀 담당 FL만 집계된다.
    const storedPerf = stored.map((item) => lookupPerformance(perfIndex, item.flNo))
    return {
      orderStored: storedPerf.filter((perf) => perf?.grade === "order").length,
      bestStored: storedPerf.filter((perf) => perf?.grade === "best").length,
      perfMatched: storedPerf.filter(Boolean).length,
      storedCount: stored.length,
      stockTotal,
      balanceTotal,
      outboundTotal,
      outboundCount,
      missingStock,
      usedPct: shipped > 0 ? (outboundTotal / shipped) * 100 : 0,
      nextNo: teamScope === "team3"
        ? String(nextStorageNumbers(ledger, 1, teamScope)[0] ?? 0).padStart(4, "0")
        : String(nextStorageNumbers(ledger, 1, teamScope)[0] ?? ""),
    }
  }, [ledger, scopedLedger, perfIndex, teamScope])

  useEffect(() => {
    const finish = () => {
      rangeDraggingRef.current = false
      dragAnchorRef.current = null
    }
    window.addEventListener("mouseup", finish)
    return () => window.removeEventListener("mouseup", finish)
  }, [])

  const changeTab = (next: WarehouseTab) => {
    setRackView(false)
    setDisposalView(false)
    setHiddenOnly(false)
    setTab(next)
    setChecked(new Set())
    setColumnFilters({})
    setSortRule(null)
    // 탭마다 스크롤 상자가 새로 생긴다. 남아 있던 top 을 그대로 쓰면 첫 렌더가 빈 여백만 그린다.
    setViewports((current) => ({ ...current, [next]: { top: 0, height: current[next]?.height ?? current[tab]?.height ?? 900 } }))
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

  /**
   * 브라우저 기본 선택·드래그를 막는다. 표는 select-none이지만 바깥 텍스트는 아니라서,
   * 그리드에서 끌기 시작하면 화면 다른 곳의 글자까지 선택된다. 그 선택을 다시 끌면
   * 크롬이 선택 영역을 통째로 끌고 반투명 사본이 화면 밖까지 따라다닌다.
   * 버튼·입력칸 위에서는 막지 않는다. 포커스가 사라지면 키보드 조작이 끊긴다.
   */
  const blockNativeDrag = (event: MouseEvent<HTMLTableCellElement>) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, select, a")) return
    event.preventDefault()
    ;(event.currentTarget.parentElement as HTMLElement | null)?.focus({ preventScroll: true })
  }

  /** 행 본문 mousedown — 이 시점엔 선택을 바꾸지 않는다(단순 클릭은 상세 열기). */
  const beginRangeSelect = (event: MouseEvent<HTMLTableCellElement>, index: number) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest("[data-no-range]")) return
    blockNativeDrag(event)
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

  const openOutboundHistory = (key: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setOutboundHistoryKey(key)
  }

  /** 그립 핸들 드래그 — 선택 전체(핸들 행이 미선택이면 그 행만)를 끌고 간다. */



  const closeActionDialog = () => {
    setActionDialog(null)
    setReceiveRolls({})
    setFormError("")
    setSaving(false)
  }

  const openAction = (kind: ActionKind, items: readonly FabricLedgerItem[], restoreTo?: "READY" | "WAREHOUSE") => {
    if (!items.length) return
    setActionDialog({ kind, keys: items.map((item) => item.key), restoreTo })
    setFormError("")
    setReceiveYds(Object.fromEntries(items.map((item) => [item.key, item.yds === null ? "" : String(item.yds)])))
    setConfirmRacks(Object.fromEntries(items.map((item) => [item.key, item.rackNo ?? ""])))
    setStockYds(items[0].yds === null ? "" : String(items[0].yds))
    setStockBalance(items[0].balance === null ? "" : String(Math.max(0, items[0].balance)))
    setRecipient("")
    setDivision("")
    setOutboundQtys({})
    setOutboundDate(localDateValue())
    setDisposalReason("")
  }

  const changeTeamScope = (next: "team3" | "team1") => {
    setTeamScope(next)
    setRackView(false)
    setDisposalView(false)
    setChecked(new Set())
    setColumnFilters({})
    setSortRule(null)
    if (next === "team1") setUnconfirmedOnly(false)
    if (next === "team1" && tab === "READY") setTab("WAREHOUSE")
  }

  const stopAndOpen = (event: MouseEvent, kind: ActionKind, item: FabricLedgerItem) => {
    event.stopPropagation()
    openAction(kind, [item])
  }

  const rememberUndo = (entry: FabricUndoEntry) => {
    if (!entry.eventIds.length) return
    setUndoStack((current) => [...current, entry].slice(-50))
  }

  const runAction = async (withInboundMail = false) => {
    if (!actionDialog || !actionItems.length) return
    setFormError("")
    setSaving(true)
    try {
      if (actionDialog.kind === "RECEIVE") {
        const auto = nextStorageNumbers(ledger, actionItems.length, teamScope)
        if (auto.length < actionItems.length) throw new Error(teamScope === "team1"
          ? "1팀 R&D No. 대역(8000~9999)이 모두 사용 중입니다."
          : "사용할 수 있는 R&D No.가 부족합니다. 번호를 직접 입력하세요.")
        const taken = occupiedStorageNumbers(ledger)
        const assigned = actionItems.map((item, index) => {
          const raw = (receiveNos[item.key] ?? (teamScope === "team3" ? String(auto[index]).padStart(4, "0") : String(auto[index]))).trim()
          const num = Number(raw)
          const okTeam3 = /^\d{1,4}$/.test(raw) && Number.isInteger(num) && num >= 1 && num <= STORAGE_NO_MAX
          const okTeam1 = /^\d{4}$/.test(raw) && Number.isInteger(num) && num >= FABRIC1_STORAGE_NO_MIN && num <= FABRIC1_STORAGE_NO_MAX
          if (teamScope === "team1" ? !okTeam1 : !okTeam3) {
            throw new Error(teamScope === "team1"
              ? `R&D No. 는 ${FABRIC1_STORAGE_NO_MIN}부터 ${FABRIC1_STORAGE_NO_MAX} 사이여야 합니다.`
              : `R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 1팀 대역입니다.`)
          }
          if (taken.has(num)) throw new Error(`R&D No. ${raw} 는 이미 창고에 있습니다.`)
          taken.add(num)
          return teamScope === "team3" ? raw.padStart(4, "0") : raw
        })
        const parsedYds = actionItems.map((item) => {
          const raw = receiveYds[item.key]?.trim() ?? ""
          const yds = raw ? Number(raw) : undefined
          if (yds !== undefined && (!Number.isFinite(yds) || yds < 0)) throw new Error("입고 수량은 0 이상의 숫자로 입력하세요.")
          return yds
        })
        // 예약을 먼저 잡는다. 다른 사람이 같은 번호를 집고 있으면 여기서 갈린다.
        // 후보는 화면이 고른 번호를 앞에 두고, 뒤에 여유분을 붙인다.
        // 손으로 고친 번호가 남에게 잡혀 있으면 여유분에서 다른 번호가 나간다.
        const spare = nextStorageNumbers(ledger, actionItems.length + 30, teamScope)
          .map((value) => teamScope === "team3" ? String(value).padStart(4, "0") : String(value))
        let claimed: string[]
        try {
          claimed = await claimStorageNumbers([...assigned, ...spare], actionItems.length)
        } catch (error) {
          throw new Error(error instanceof Error && error.message ? error.message
            : "R&D No.를 예약하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.")
        }
        const changedNos = claimed.filter((value, index) => value !== assigned[index])
        try {
          rememberUndo(await applyFabricActions(actionItems.map((item, index) => ({ fabricKey: item.key, action: "RECEIVE" as const, fromStatus: "READY" as const, toStatus: "WAREHOUSE" as const, storageNo: claimed[index], roll: receiveRolls[item.key] === true, yds: parsedYds[index], note: "웹 입고 등록", recordIdentity: fabricRecordIdentity(item.record) }))))
        } finally {
          // 원장에 들어갔으면 예약은 더 필요 없다. 실패했으면 번호를 다른 사람에게 돌려준다.
          void releaseStorageNumbers(claimed)
        }
        if (changedNos.length) {
          setSelectionNotice(`다른 사람이 먼저 쓴 번호가 있어 ${changedNos.join(", ")} 로 바뀌었습니다.`)
        }
        try {
          await notifyTeams(buildInboundCard({
            registrant: defaultRequester,
            registeredDate: localDateValue(),
            items: actionItems.map((item, index) => ({ item, storageNo: claimed[index], yds: parsedYds[index] })),
          }))
        } catch {
          setSelectionNotice("입고 등록은 완료했지만 Teams 알림을 보내지 못했습니다.")
        }
        setReceiveNos({})
        setChecked(new Set())
        setTab("WAREHOUSE")
        if (withInboundMail) setInboundMailKeys(actionItems.map((item) => item.key))
      } else if (actionDialog.kind === "UNRECEIVE") {
        rememberUndo(await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "UNRECEIVE" as const, fromStatus: "WAREHOUSE" as const, toStatus: "READY" as const, note: "입고 대기로 되돌림" }))))
        setChecked(new Set())
        setTab("READY")
      } else if (actionDialog.kind === "CONFIRM") {
        const targets = actionItems.filter((item) => confirmChecks[item.key] !== false)
        if (!targets.length) throw new Error("실물을 확인한 항목을 하나 이상 체크하세요.")
        // 형식이 틀린 칸이 하나라도 있으면 확인 처리 전에 멈춘다. 빈 칸은 지정 안 함으로 둔다.
        const rackEntries = targets.filter((item) => item.status === "WAREHOUSE").map((item) => {
          const rackNo = normalizeRackNo(confirmRacks[item.key] ?? item.rackNo ?? "")
          if (rackNo === null) throw new Error(`${item.storageNo || item.styleNo || "원단"}: ${RACK_FORMAT_HINT}`)
          return { item, rackNo }
        })
        const undoEntry = await applyFabricActions(targets.filter((item) => item.status === "WAREHOUSE" && !item.confirmedAt).map((item) => ({ fabricKey: item.key, action: "CONFIRM" as const, fromStatus: "WAREHOUSE" as const, toStatus: "WAREHOUSE" as const, storageNo: item.storageNo, note: "창고 실물 입고 확인" })))
        // 확인 처리가 끝난 최신 상태 위에 한 번에 저장해야 앞 저장을 덮지 않는다.
        await saveFabricRackNos(rackEntries)
        const latestOverrides = useAppStore.getState().fabricOverrides
        undoEntry.overrides = undoEntry.overrides.map((change) => ({
          ...change,
          after: latestOverrides.find((entry) => entry.key === change.after.key)
            ?? latestOverrides.find((entry) => change.after.recordId && entry.recordId === change.after.recordId)
            ?? change.after,
        }))
        rememberUndo(undoEntry)
        setChecked(new Set())
        setConfirmChecks({})
        setConfirmRacks({})
      } else if (actionDialog.kind === "UNCONFIRM") {
        rememberUndo(await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE" && item.confirmedAt).map((item) => ({ fabricKey: item.key, action: "UNCONFIRM" as const, fromStatus: "WAREHOUSE" as const, toStatus: "WAREHOUSE" as const, storageNo: item.storageNo, note: "실물 입고 확인 취소" }))))
        setChecked(new Set())
      } else if (actionDialog.kind === "REMOVE") {
        await removeFabricRows(actionItems.map((item) => ({ key: item.key, fromStatus: item.status })))
        setChecked(new Set())
      } else if (actionDialog.kind === "DISPOSE") {
        if (!disposalReason) throw new Error("폐기 사유를 선택하세요.")
        rememberUndo(await applyFabricActions(actionItems.filter((item) => item.status === "READY" || item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "DISPOSE" as const, fromStatus: item.status, toStatus: "DISPOSED" as const, storageNo: item.storageNo, reason: disposalReason, note: `폐기: ${disposalReason}` }))))
        setChecked(new Set())
        setTab("HISTORY")
      } else if (actionDialog.kind === "STOCK") {
        const item = actionItems[0]
        const yds = Number(stockYds)
        if (!stockYds.trim() || !Number.isFinite(yds) || yds < 0) throw new Error("보유 재고를 0 이상의 숫자로 입력하세요.")
        rememberUndo(await applyFabricAction({ fabricKey: item.key, action: "NOTE", fromStatus: item.status, toStatus: item.status, storageNo: item.storageNo, yds, note: "보유 재고 수정" }))
        if (yds - item.outboundTotal <= 0) setTab("HISTORY")
      } else if (actionDialog.kind === "OUTBOUND") {
        if (!recipient.trim()) throw new Error("수령자를 입력하세요.")
        if (!outboundDate) throw new Error("출고 날짜를 선택하세요.")
        const confirmed = actionItems.map((item) => {
          const label = `R&D No. ${storageNoLabel(item) || "미지정"}`
          const qty = Number(outboundQtys[item.key]?.trim() ?? "")
          if (item.balance === null) throw new Error(`${label}: 먼저 보유 재고를 입력하세요.`)
          if (!Number.isFinite(qty) || qty <= 0) throw new Error(`${label}: 출고 수량을 0보다 큰 숫자로 입력하세요.`)
          if (qty > item.balance) throw new Error(`${label}: 현재 잔량 ${formatYds(item.balance)} yds를 초과할 수 없습니다.`)
          return { item, qty, balanceAfter: item.balance - qty }
        })
        rememberUndo(await applyFabricActions(confirmed.map(({ item, qty }) => ({ fabricKey: item.key, action: "OUTBOUND" as const, fromStatus: "WAREHOUSE" as const, toStatus: "WAREHOUSE" as const, storageNo: item.storageNo, qty, to: recipient, division, date: outboundDate, note: "출고 등록", autoExhaust: exhaustOnZero }))))
        try {
          await notifyTeams(buildOutboundConfirmCard({ to: recipient.trim(), division, date: outboundDate, items: confirmed }))
        } catch {
          setSelectionNotice("출고는 확정했지만 Teams 알림을 보내지 못했습니다.")
        }
        if (confirmed.every(({ balanceAfter }) => balanceAfter <= 0)) setTab("HISTORY")
      } else if (actionDialog.kind === "UNOUTBOUND") {
        const canceled = actionItems.flatMap((item) => {
          const outbound = activeOutboundFor(item)
          return outbound && typeof outbound.qty === "number" ? [{ item, outbound }] : []
        })
        if (!canceled.length) throw new Error("취소할 출고가 없습니다.")
        rememberUndo(await applyFabricActions(canceled.map(({ item, outbound }) => ({
          fabricKey: item.key,
          action: "UNOUTBOUND" as const,
          fromStatus: item.status,
          toStatus: item.status === "EXHAUSTED" ? "WAREHOUSE" as const : item.status,
          storageNo: item.storageNo,
          targetEventId: outbound.id,
          note: "출고 취소",
        }))))
        try {
          await notifyTeams(buildOutboundCancelCard({
            canceler: defaultRequester,
            canceledDate: localDateValue(),
            items: canceled.map(({ item, outbound }) => ({ item, qty: outbound.qty!, outboundDate: outbound.occurredAt.slice(0, 10) })),
          }))
        } catch {
          setSelectionNotice("출고는 취소했지만 Teams 알림을 보내지 못했습니다.")
        }
        setChecked(new Set())
      } else if (actionDialog.kind === "EXHAUST") {
        rememberUndo(await applyFabricActions(actionItems.filter((item) => item.status === "WAREHOUSE").map((item) => ({ fabricKey: item.key, action: "EXHAUST" as const, fromStatus: item.status, toStatus: "EXHAUSTED" as const, storageNo: item.storageNo, note: "수동 소진 완료" }))))
        setChecked(new Set())
        setTab("HISTORY")
      } else {
        // 어디로 되돌릴지는 사용자가 버튼으로 고른다. 고르지 않았으면 폐기 직전 상태를 따른다.
        let restoreStatus: "READY" | "WAREHOUSE" = actionDialog.restoreTo ?? "WAREHOUSE"
        const restoreInputs: ApplyFabricActionInput[] = []
        for (const item of actionItems) {
          if (item.status !== "EXHAUSTED" && item.status !== "DISPOSED") continue
          if (!actionDialog.restoreTo) {
            const disposedEvent = fabricEvents.find((event) => event.fabricKey === item.key && event.action === "DISPOSE")
            restoreStatus = item.status === "DISPOSED" && disposedEvent?.fromStatus === "READY" ? "READY" : "WAREHOUSE"
          }
          // 입고 대기는 채번 전 상태다. 그쪽으로 되돌리면 R&D No.와 재고를 함께 푼다.
          restoreInputs.push({
            fabricKey: item.key, action: "RESTORE", fromStatus: item.status, toStatus: restoreStatus,
            storageNo: restoreStatus === "WAREHOUSE" ? item.storageNo : undefined,
            note: restoreStatus === "READY" ? "입고 대기로 되돌림" : "창고 보관으로 되돌림",
          })
        }
        rememberUndo(await applyFabricActions(restoreInputs))
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
      case "rackNo": return item.rackNo ?? ""
      case "styleNo": return item.styleNo
      case "flNo": return item.flNo
      case "millRef": return item.fields.millRef ?? ""
      case "buyer": return item.buyer
      case "season": return item.season
      case "category": return item.category
      case "owner": return item.owner
      case "requestDate": return item.requestDate
      case "construction": return item.construction
      case "content": return item.fields.content ?? ""
      case "actualWidth": return item.fields.actualWidth ?? ""
      case "actualWeight": return item.fields.actualWeight ?? ""
      case "priceYd": return item.fields.priceYd ?? ""
      case "priceLb": return item.fields.priceLb ?? ""
      case "supplier": return item.fields.supplier ?? ""
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
    if (id === "storageNo") return <TextCell value={storageNoLabel(item)} mono />
    if (id === "perfGrade") return <PerfBadge perf={perfOf(item)} compact />
    if (id === "perfCounts") return <PerfCounts perf={perfOf(item)} />
    if (id === "perfRate") { const perf = perfOf(item); return <TextCell value={perf?.pickRate != null ? `${perf.pickRate.toFixed(1)}%` : ""} /> }
    if (id === "rackNo") return item.rackNo
      ? <TextCell value={item.rackNo} mono />
      : <span className="text-[10px] text-[var(--muted-foreground)]" title="더블클릭해서 Rack No. 입력">미지정</span>
    if (id === "styleNo") return <TextCell value={item.styleNo} mono />
    if (id === "flNo") return <TextCell value={item.flNo} mono />
    if (id === "owner") return <TextCell value={item.owner} />
    if (id === "stock") {
      const balance = item.balance === null ? null : Math.max(0, item.balance)
      // 한 번 클릭은 셀 선택만 한다. 팝업이 바로 뜨면 더블클릭으로 여는 수정 창이 가려진다.
      return <span className={`flex h-full w-full items-center overflow-hidden whitespace-nowrap tabular-nums ${balance === 0 ? "text-[var(--muted-foreground)]" : ""}`} title={item.yds === null ? "더블클릭해서 재고 입력" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds · 더블클릭해서 수정`}>{item.yds === null ? "" : `${formatYds(balance ?? 0)}/${formatYds(item.yds)}yds`}</span>
    }
    if (id === "confirm") {
      if (item.status !== "WAREHOUSE") return <TextCell value="" />
      return item.confirmedAt
        ? <span className="text-[11px] font-medium text-[var(--muted-foreground)]" title={`창고 확인 ${fmtDateFull(item.confirmedAt)}`}>확인</span>
        : <span className="text-[11px] font-medium text-[var(--destructive)]">미확인</span>
    }
    if (id === "season") return <TextCell value={cellValue(item, "season")} />
    if (id === "buyer") return <TextCell value={item.buyer} />
    if (id === "category") return <TextCell value={cellValue(item, "category")} />
    if (id === "requestDate") return <TextCell value={item.requestDate ? fmtDateMd(item.requestDate) : ""} />
    if (id === "completedAt") return <TextCell value={item.completedAt ? fmtDateMd(item.completedAt) : ""} />
    if (FABRIC1_ONLY_COLUMNS.has(id)) return <TextCell value={cellValue(item, id)} />

    // 대장 값이 기준이다. DD는 대장 칸이 비었을 때만 채운다.
    const record = item.record
    const led = item.sample?.ledger
    const sam = item.sample
    const pick = <T,>(fromRecord: T | undefined | null, fromLedger: T | undefined | null): T | undefined =>
      (fromLedger === undefined || fromLedger === null || fromLedger === "" ? undefined : fromLedger)
      ?? (fromRecord === undefined || fromRecord === null || fromRecord === "" ? undefined : fromRecord)
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
    if (id === "actualWidth") return <TextCell value={pick(record?.tech?.actual?.width, sam?.inhouse.widthCm) || item.fields.actualWidth || ""} />
    if (id === "actualWeight") return <TextCell value={pick(record?.tech?.actual?.weight, sam?.inhouse.weightGsm) || item.fields.actualWeight || ""} />
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

  // 처리 열은 삭제 하나만 둔다(2026-09-22). 재고, 출고, 소진, 폐기, 복구는 상단 선택 버튼과 재고 칸 더블클릭으로 한다.
  // 삭제는 폐기가 아니라 목록에서 빼는 것이다(REMOVE). 창고보관, 이력, 창고팀 집계 어디에도 남지 않는다.
  const actionCell = (item: FabricLedgerItem) => {
    if (!canEditScope) return <span className="text-xs text-[var(--muted-foreground)]">보기</span>
    if (item.status === "READY") return <span className="text-xs text-[var(--muted-foreground)]">선택 처리</span>
    return <div className="flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-[var(--muted-foreground)] hover:text-[var(--destructive)]" title="삭제" aria-label={`${storageNoLabel(item) || item.flNo || "원단"} 삭제`} onClick={(event) => stopAndOpen(event, "REMOVE", item)}><Trash2 /></Button>
    </div>
  }


  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, item: FabricLedgerItem) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    openDetail(item.key)
  }

  const actionTitle = actionDialog?.kind === "RECEIVE" ? "선택 입고 등록"
    : actionDialog?.kind === "UNRECEIVE" ? "입고 대기로 되돌리기"
    : actionDialog?.kind === "RESTORE" ? actionDialog.restoreTo === "READY" ? "입고 대기로 되돌리기" : "창고 보관으로 되돌리기"
    : actionDialog?.kind === "CONFIRM" ? "실물 입고 확인"
    : actionDialog?.kind === "UNCONFIRM" ? "실물 입고 확인 취소"
    : actionDialog?.kind === "DISPOSE" ? "선택 폐기"
      : actionDialog?.kind === "REMOVE" ? "선택 삭제"
        : actionDialog?.kind === "STOCK" ? "보유 재고 수정"
        : actionDialog?.kind === "OUTBOUND" ? "출고 확정"
          : actionDialog?.kind === "UNOUTBOUND" ? "출고 취소"
          : actionDialog?.kind === "EXHAUST" ? "소진 완료"
            : "상태 복구"

  const unconfirmedCount = useMemo(() => scopedLedger.filter((item) => item.status === "WAREHOUSE" && !item.confirmedAt).length, [scopedLedger])

  const storedItems = useMemo(() => scopedLedger.filter((item) => item.status === "WAREHOUSE"), [scopedLedger])

  /** 배치도 칸에서 창고보관 목록으로 넘어간다. Rack No. 열 필터 하나만 걸어 머리 ▼ 메뉴에서 바로 풀 수 있다. */
  const openRackSlot = (rackNo: string) => {
    changeTab("WAREHOUSE")
    setUnconfirmedOnly(false)
    setSearch("")
    setColumnFilters({ rackNo: [rackNo] })
  }

  const inboundMailItems = useMemo(() => {
    const byKey = new Map(scopedLedger.map((item) => [item.key, item]))
    return inboundMailKeys.map((key) => byKey.get(key)).filter((item): item is FabricLedgerItem => Boolean(item))
  }, [scopedLedger, inboundMailKeys])

  const suggestedNos = useMemo(() => nextStorageNumbers(ledger, actionItems.length, teamScope), [ledger, actionItems.length, teamScope])
  const storageNoFor = (index: number): string =>
    receiveNos[actionItems[index]?.key ?? ""] ?? (teamScope === "team3" ? String(suggestedNos[index] ?? "").padStart(4, "0") : String(suggestedNos[index] ?? ""))

  const totalCount = tabOrder.reduce((sum, key) => sum + counts[key], 0)

  const undoLastWarehouseAction = async () => {
    const entry = undoStack[undoStack.length - 1]
    if (!entry || undoing) return
    setUndoing(true)
    setUndoStack((current) => current.slice(0, -1))
    const beforeState = useAppStore.getState()
    const outboundEvents = entry.kind === "OUTBOUND"
      ? entry.eventIds.map((id) => beforeState.fabricEvents.find((event) => event.id === id))
        .filter((event) => event?.action === "OUTBOUND" && typeof event.qty === "number")
      : []
    const beforeLedger = buildFabricLedger(beforeState.records, beforeState.completed, beforeState.fabricOverrides, beforeState.fabricEvents, { includeRemoved: true })
    try {
      const result = await undoFabricEntry(entry)
      const skipped = result.conflicted ? ` 다른 작업과 겹친 ${result.conflicted}건은 건너뛰었습니다.` : ""
      let notice = `되돌리기 ${result.applied}건을 적용했습니다.${skipped}`
      if (entry.kind === "RECEIVE" && result.applied) {
        notice += " Teams 알림은 이미 나갔습니다. 필요하면 채널에 따로 알려 주십시오."
      }
      if (entry.kind === "OUTBOUND" && result.applied) {
        const remainingIds = new Set(useAppStore.getState().fabricEvents.map((event) => event.id))
        const canceled = outboundEvents.flatMap((event) => {
          if (!event || remainingIds.has(event.id) || typeof event.qty !== "number") return []
          const item = beforeLedger.find((candidate) => event.recordId && fabricRecordIdentity(candidate.record)
            ? fabricRecordIdentity(candidate.record) === event.recordId
            : candidate.key === event.fabricKey)
          return item ? [{ item, qty: event.qty, outboundDate: event.occurredAt.slice(0, 10) }] : []
        })
        if (canceled.length) {
          try {
            await notifyTeams(buildOutboundCancelCard({ canceler: defaultRequester, canceledDate: localDateValue(), items: canceled }))
          } catch {
            notice += " 출고는 되돌렸지만 Teams 알림을 보내지 못했습니다."
          }
        }
      }
      setSelectionNotice(notice)
    } catch {
      setUndoStack((current) => [...current, entry].slice(-50))
      setSelectionNotice("되돌리기에 실패했습니다.")
    } finally {
      setUndoing(false)
    }
  }

  /**
   * 숨긴 행을 감추기 직전 상태로 되돌린다.
   * 목표 상태는 그 행의 마지막 REMOVE 기록의 `fromStatus` 다. 창고보관에서 감춘 건은
   * 번호를 지킨 채 창고보관으로 돌아가고, 입고대기에서 감춘 건은 입고대기로 돌아간다.
   */
  const restoreHiddenRows = async () => {
    if (!selectedRows.length || saving) return
    setSaving(true)
    try {
      const recordIdOf = (item: FabricLedgerItem) => fabricRecordIdentity(item.record)
      const inputs: ApplyFabricActionInput[] = selectedRows.map((item) => {
        const recordId = recordIdOf(item)
        const removal = [...fabricEvents]
          .filter((event) => event.action === "REMOVE"
            && (recordId && event.recordId ? event.recordId === recordId : event.fabricKey === item.key))
          .sort((left, right) => (left.recordedAt ?? left.occurredAt).localeCompare(right.recordedAt ?? right.occurredAt))
          .at(-1)
        const target = removal?.fromStatus === "WAREHOUSE" ? "WAREHOUSE" as const : "READY" as const
        return {
          fabricKey: item.key, action: "RESTORE" as const,
          fromStatus: "REMOVED" as const, toStatus: target,
          storageNo: target === "WAREHOUSE" ? item.storageNo : undefined,
          note: "목록 숨김 해제",
        }
      })
      rememberUndo(await applyFabricActions(inputs))
      setSelectionNotice(`${inputs.length}건을 목록으로 되돌렸습니다.`)
      if (hiddenCount - inputs.length <= 0) setHiddenOnly(false)
    } catch {
      setSelectionNotice("되살리기에 실패했습니다.")
    } finally { setSaving(false) }
  }

  /**
   * R&D No.를 고친다. 채번 기록이라 검사를 통과한 값만 저장하고 이력을 남긴다.
   * 저장은 applyFabricActions 를 지난다. 그래야 rackNo 같은 다른 값이 함께 물려가고
   * Ctrl+Z 되돌리기와 작업 이력이 같이 걸린다. 오버라이드를 직접 만들지 마라.
   */
  const commitStorageNo = async (item: FabricLedgerItem, raw: string) => {
    const value = raw.trim()
    const before = item.storageNo.trim()
    if (!value || value === before) return
    const number = Number(value)
    const okTeam3 = /^\d{1,4}$/.test(value) && Number.isInteger(number) && number >= 1 && number <= STORAGE_NO_MAX
    const okTeam1 = /^\d{4}$/.test(value) && Number.isInteger(number) && number >= FABRIC1_STORAGE_NO_MIN && number <= FABRIC1_STORAGE_NO_MAX
    if (teamScope === "team1" ? !okTeam1 : !okTeam3) {
      setSelectionNotice(teamScope === "team1"
        ? `R&D No. 는 ${FABRIC1_STORAGE_NO_MIN}부터 ${FABRIC1_STORAGE_NO_MAX} 사이여야 합니다.`
        : `R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 1팀 대역입니다.`)
      return
    }
    const next = teamScope === "team3" ? value.padStart(4, "0") : value
    const scoped = ledger.filter((other) => other.key !== item.key && isFabric1Item(other) === (teamScope === "team1"))
    if (occupiedStorageNumbers(scoped).has(number)) {
      setSelectionNotice(`R&D No. ${value} 는 이미 창고에 있습니다.`)
      return
    }
    try {
      rememberUndo(await applyFabricActions([{
        fabricKey: item.key, action: "NOTE",
        fromStatus: item.status, toStatus: item.status,
        storageNo: next,
        note: `R&D No. ${before || "없음"} → ${next}`,
      }]))
      setSelectionNotice(`R&D No. 를 ${next} 로 바꿨습니다. 되돌리려면 Ctrl+Z 입니다.`)
    } catch {
      setSelectionNotice("R&D No. 를 바꾸지 못했습니다.")
    }
  }

  useEffect(() => {
    const stop = () => { cellDragRef.current = false }
    const onCopy = (event: globalThis.KeyboardEvent) => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return
      if (active instanceof HTMLElement && active.isContentEditable) return
      // 팝업 창 안의 키는 표에 넘기지 않는다(다른 창에서 글자를 지우다 rack 번호가 지워지지 않게).
      if (active instanceof HTMLElement && active.closest("[role=dialog]")) return
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        if (!canEditScope || !undoStack.length || document.querySelector("[role=dialog]")) return
        event.preventDefault()
        void undoLastWarehouseAction()
        return
      }
      // Delete·Backspace: 창고보관 탭에서 선택 영역이 걸친 Rack No. 칸을 지운다. Ctrl+클릭으로 더한 영역도 포함한다.
      if (canEditScope && (event.key === "Delete" || event.key === "Backspace") && tab === "WAREHOUSE" && allRangeRects.length) {
        if (teamScope === "team1") {
          const seen = new Set<string>()
          const rackTargets = new Map<string, FabricLedgerItem>()
          const fabricTargets: Array<{ item: FabricLedgerItem; columnId: string }> = []
          let skippedProtected = false
          for (const area of allRangeRects) {
            for (let r = area.top; r <= area.bottom; r += 1) {
              const target = visibleRows[r]
              if (!target) continue
              for (let c = area.left; c <= area.right; c += 1) {
                const column = visibleColumns[c]
                if (!column) continue
                const key = `${target.key}:${column.id}`
                if (seen.has(key)) continue
                seen.add(key)
                if (column.id === "rackNo") {
                  if (target.rackNo && target.status === "WAREHOUSE") rackTargets.set(target.key, target)
                } else if (["storageNo", "stock", "confirm"].includes(column.id)) {
                  skippedProtected = true
                } else if (target.sample?.sourceSheet === FABRIC1_INTAKE_SHEET && FABRIC1_EDITABLE.has(column.id) && cellValue(target, column.id).trim()) {
                  fabricTargets.push({ item: target, columnId: column.id })
                }
              }
            }
          }
          event.preventDefault()
          void (async () => {
            const rackCount = await saveFabricRackNos([...rackTargets.values()].map((target) => ({ item: target, rackNo: "" })))
            const fabricCount = await clearFabric1Cells(fabricTargets)
            const count = rackCount + fabricCount
            const cleared = count ? `셀 ${count}개를 지웠습니다.` : "지울 수 있는 값이 없습니다."
            const protectedNote = skippedProtected ? " R&D No., 재고, 입고확인 칸은 지우지 않습니다." : ""
            setSelectionNotice(`${cleared}${protectedNote}`)
          })().catch(() => setSelectionNotice("선택한 셀을 지우지 못했습니다."))
          return
        }
        const rackCol = visibleColumns.findIndex((column) => column.id === "rackNo")
        if (rackCol < 0) return
        const targets = new Map<string, FabricLedgerItem>()
        for (const area of allRangeRects) {
          if (rackCol < area.left || rackCol > area.right) continue
          for (let r = area.top; r <= area.bottom; r += 1) {
            const target = visibleRows[r]
            if (target?.rackNo && target.status === "WAREHOUSE") targets.set(target.key, target)
          }
        }
        if (!targets.size) return
        event.preventDefault()
        void saveFabricRackNos([...targets.values()].map((target) => ({ item: target, rackNo: "" })))
          .then((count) => { if (count) setSelectionNotice(`Rack No. ${count}건을 지웠습니다.`) })
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c") return
      if (!rangeRect) return
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

  // 최근 등록한 것이 맨 아래에 온다. 탭을 열면 그 끝을 먼저 보여 준다. 세 탭 모두 같다.
  // 페인트 전에 scrollTop 과 viewports 를 같은 값으로 맞춘다.
  // rAF 로 미루면 그 사이 topPad 빈 줄만 화면에 잡혀 표가 통째로 비어 보인다.
  useLayoutEffect(() => {
    const element = gridRefs.current[tab]
    if (!element) return
    element.scrollTop = element.scrollHeight
    setViewports((current) => ({ ...current, [tab]: { top: element.scrollTop, height: element.clientHeight } }))
  }, [tab, visibleRows.length])

  // 창을 줄이면 보이는 줄 수가 달라진다. ResizeObserver 는 실제로 크기가 변할 때만 부르므로
  // ref 콜백에서 재던 것과 달리 렌더를 되먹이지 않는다. observe 직후 한 번 불러 첫 높이도 여기서 잡는다.
  useEffect(() => {
    const element = gridRefs.current[tab]
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      const height = element.clientHeight
      setViewports((current) => current[tab]?.height === height ? current : { ...current, [tab]: { top: element.scrollTop, height } })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [tab])

  const columnIndexById = useMemo(() => new Map(visibleColumns.map((column, index) => [column.id, index])), [visibleColumns])

  const toRangeRect = (value: { ar: number; ac: number; fr: number; fc: number }): IndexRect => ({
    top: Math.min(value.ar, value.fr),
    bottom: Math.max(value.ar, value.fr),
    left: Math.min(value.ac, value.fc),
    right: Math.max(value.ac, value.fc),
  })
  const rangeRect = cellRange ? toRangeRect(cellRange) : null
  // Ctrl+클릭으로 더한 영역까지 포함한 전체 선택. 표시·복사·개수 합계가 모두 이 목록을 본다.
  const extraRangeRects = extraCellRanges.map(toRangeRect)
  const allRangeRects = rangeRect ? [...extraRangeRects, rangeRect] : extraRangeRects

  const rectTsv = (area: IndexRect): string => {
    const lines: string[] = []
    for (let r = area.top; r <= area.bottom; r += 1) {
      const item = visibleRows[r]
      if (!item) continue
      const cells: string[] = []
      for (let c = area.left; c <= area.right; c += 1) {
        const column = visibleColumns[c]
        cells.push(column ? cellValue(item, column.id) : "")
      }
      lines.push(cells.join("\t"))
    }
    return lines.join("\n")
  }

  const copyRange = async (): Promise<void> => {
    if (!rangeRect) return
    const text = combineRangeTsv(allRangeRects, rectTsv)
    if (text === null) { setSelectionNotice(MULTI_RANGE_COPY_BLOCKED); setCellMenu(null); return }
    // 엑셀과 같은 탭 구분 텍스트라 그대로 붙여넣을 수 있다.
    try { await navigator.clipboard.writeText(text) } catch { /* 클립보드를 못 쓰면 조용히 넘긴다. */ }
    if (extraRangeRects.length) setSelectionNotice(`${allRangeRects.length}개 영역을 복사했습니다.`)
    setCellMenu(null)
  }

  /** 엑셀 상태 표시줄처럼 선택 셀의 개수·합계·평균. 두 칸 이상일 때만 보인다. 겹친 칸은 한 번만 센다. */
  const selectionStats = (() => {
    if (!allRangeRects.length) return null
    const seen = new Set<string>()
    let cells = 0, count = 0, numeric = 0, sum = 0
    for (const area of allRangeRects) {
      for (let r = area.top; r <= area.bottom; r += 1) {
        const item = visibleRows[r]
        if (!item) continue
        for (let c = area.left; c <= area.right; c += 1) {
          const key = `${r}:${c}`
          if (seen.has(key)) continue
          seen.add(key)
          cells += 1
          const column = visibleColumns[c]
          const value = (column ? cellValue(item, column.id) : "").trim()
          if (!value) continue
          count += 1
          const number = Number(value.replace(/,/g, ""))
          if (Number.isFinite(number)) { numeric += 1; sum += number }
        }
      }
    }
    return cells > 1 ? { count, numeric, sum } : null
  })()

  useEffect(() => {
    if (!selectionNotice) return
    const timer = window.setTimeout(() => setSelectionNotice(null), 2500)
    return () => window.clearTimeout(timer)
  }, [selectionNotice])
  // 탭이나 목록이 바뀌면 인덱스가 달라지므로 추가 영역을 버린다.
  useEffect(() => { setExtraCellRanges([]) }, [tab, visibleRows])

  const filterButton = (column: WarehouseColumn) => {
    const selected = columnFilters[column.id] ?? []
    const active = selected.length > 0 || sortRule?.col === column.id
    // 열마다 전체 행을 훑는 계산이다. 팝오버가 열린 열에서만 돌린다.
    // 닫힌 상태에서도 돌리면 이력 탭 기준 매 렌더 17만 번(4,485행 x 38열)이 된다.
    const open = filterMenu === column.id
    const values = open
      ? [...new Set(rows.map((item) => cellValue(item, column.id)))].sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true }))
      : []
    const query = filterSearch.trim().toLocaleLowerCase("ko-KR")
    const shown = (query ? values.filter((value) => value.toLocaleLowerCase("ko-KR").includes(query)) : values).slice(0, 400)
    const setFilter = (next: string[]) => setColumnFilters((current) => {
      const copy = { ...current }
      if (next.length === 0) delete copy[column.id]
      else copy[column.id] = next
      return copy
    })
    return <Popover.Root open={open} onOpenChange={(open) => { setFilterMenu(open ? column.id : null); setFilterSearch("") }}>
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
    return (
        <div key={gridId} className="min-h-0 flex-1 overflow-auto" ref={attachGrid} onDragStart={(event) => event.preventDefault()} onScroll={(event) => {
              const el = event.currentTarget
              setViewports((current) => {
                const previous = current[gridId]
                if (previous
                  && previous.height === el.clientHeight
                  && Math.floor(previous.top / ROW_HEIGHT) === Math.floor(el.scrollTop / ROW_HEIGHT)) return current
                return { ...current, [gridId]: { top: el.scrollTop, height: el.clientHeight } }
              })
            }}>
          <table className="w-full table-fixed select-none border-separate border-spacing-0 text-xs [&_input]:select-text [&_textarea]:select-text" style={{ width: tableWidth, minWidth: tableWidth }}>
            <colgroup>
              <col style={{ width: gripWidth }} />
              {visibleColumns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
              <col style={{ width: ACTION_WIDTH }} />
            </colgroup>
            <TableHeader className="sticky top-0 z-30 bg-[var(--card)] shadow-sm">
              <TableRow className="h-8 hover:bg-[var(--card)]">
                <TableHead rowSpan={2} className="sticky left-0 top-0 z-50 border-b border-r border-[var(--border)] px-1.5 text-center" style={{ background: accent.headBg }}><Checkbox checked={allRowsSelected ? true : someRowsSelected ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label={`${TAB_META[tab].label} 전체 선택`} /></TableHead>
                {fixedColumns.map((column) => <TableHead key={column.id} rowSpan={2} className="group/head relative sticky top-0 z-40 border-b border-r border-[var(--border)] px-1.5 text-center text-xs font-semibold text-[var(--foreground)]" style={{ left: fixedLeft(column.id), background: accent.headBg }} title={column.label}>{column.label}{filterButton(column)}<span aria-hidden="true" title={`${column.label} 너비 조절`} onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></TableHead>)}
                {groupedColumns.map((group) => <TableHead key={group.key} colSpan={group.columns.length} className="relative sticky top-0 z-30 border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-semibold" style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}>
                  <span>{group.label}</span>
                  {group.collapsible ? <button type="button" aria-label={`${group.label} 열 접기`} aria-pressed={true} title={`${group.label} 열 접기`} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: false }))} className="absolute right-2 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none hover:bg-[var(--muted)]">-</button> : null}
                </TableHead>)}
                <TableHead rowSpan={2} className="relative sticky top-0 z-30 border-b border-[var(--border)] px-1.5 text-right text-xs font-normal text-[var(--muted-foreground)]" style={{ background: accent.headBg }}>
                  <span>처리</span>
                  <span className="absolute right-full top-1 flex -translate-y-0 gap-1 pr-2">
                    {scopeGroups.filter((group) => group.collapsible && !openGroups[group.key as keyof typeof openGroups]).map((group) => <button key={group.key} type="button" aria-label={`${group.label} 열 펼치기`} aria-pressed={false} title={`${group.label} 열 펼치기`} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: true }))} className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 text-[10px] font-semibold leading-none hover:bg-[var(--muted)]"><span>{group.label}</span><span aria-hidden="true">+</span></button>)}
                  </span>
                </TableHead>
              </TableRow>
              <TableRow className="h-8 hover:bg-[var(--card)]">
                {groupedColumns.flatMap((group) => group.columns.map((column) => <TableHead key={column.id} className={`${teamScope === "team1" ? "text-center" : ""} group/head relative sticky top-8 z-30 truncate border-b border-r border-[var(--border)] px-1.5 text-xs font-normal text-[var(--muted-foreground)]`} style={{ background: `color-mix(in srgb, ${group.color} 7%, ${accent.headBg})` }} title={column.label}>{column.label}{filterButton(column)}<span aria-hidden="true" title={`${column.label} 너비 조절`} onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></TableHead>))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPad > 0 ? <tr aria-hidden="true" style={{ height: topPad }} /> : null}
              {gridRows.length ? windowRows.map((item, offset) => {
                const index = start + offset
                const selected = checked.has(item.key)
                return <TableRow
                  key={item.key}
                  className={`h-8 cursor-pointer border-l-2 ${GRADE_ROW_CLASS[perfOf(item)?.grade ?? "normal"] ?? ""} ${selected ? `${accent.rowBar} bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]` : "border-l-transparent"}`}
                  tabIndex={0}
                  aria-selected={selected}
                  aria-label={`${item.styleNo || item.flNo || "원단"} 상세 보기`}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                >
                  <TableCell className="sticky left-0 z-20 h-8 cursor-ns-resize border-b border-r border-[var(--border)] px-1.5 py-0" style={{ background: selected ? "color-mix(in srgb, var(--primary) 6%, var(--card))" : "var(--card)" }} title="끌어서 여러 행 선택" onMouseDown={(event) => beginRangeSelect(event, index)} onMouseEnter={() => extendRangeSelect(index)} onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Checkbox checked={selected} onCheckedChange={(value) => toggleChecked(item.key, value === true)} aria-label={`${item.styleNo || item.flNo} 선택`} />
                      {teamScope === "team1" ? <button type="button" className="inline-flex size-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]" aria-label="반출 이력" title="반출 이력" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openOutboundHistory(item.key) }}><History className="size-3.5" /></button> : null}
                    </div>
                  </TableCell>
                  {visibleColumns.map((column) => {
                    const fixed = fixedColumns.some((candidate) => candidate.id === column.id)
                    const colIndex = columnIndexById.get(column.id) ?? 0
                    // 활성 영역을 먼저 보고, 없으면 Ctrl+클릭으로 더한 영역에서 이 칸이 든 영역을 찾는다.
                    const containsCell = (area: IndexRect) => index >= area.top && index <= area.bottom && colIndex >= area.left && colIndex <= area.right
                    const hitRect = rangeRect && containsCell(rangeRect) ? rangeRect : extraRangeRects.find(containsCell)
                    const inRange = Boolean(hitRect)
                    // DD MASTER 와 같은 방식이다. 범위 가장자리에만 선을 그어 사각형으로 보이게 한다.
                    const edges = hitRect ? [
                      index === hitRect.top ? "inset 0 1.5px 0 0 var(--grid-selection)" : "",
                      index === hitRect.bottom ? "inset 0 -1.5px 0 0 var(--grid-selection)" : "",
                      colIndex === hitRect.left ? "inset 1.5px 0 0 0 var(--grid-selection)" : "",
                      colIndex === hitRect.right ? "inset -1.5px 0 0 0 var(--grid-selection)" : "",
                    ].filter(Boolean).join(", ") : ""
                    const cellActive = selectedCell?.row === item.key && selectedCell.col === column.id
                    const confirmed = Boolean(item.confirmedAt)
                    const manualId = canEditScope && item.sample?.sourceSheet === WEB_INTAKE_SHEET ? item.sample.id : undefined
                    const fabric1Id = canEditScope && teamScope === "team1" && item.sample?.sourceSheet === FABRIC1_INTAKE_SHEET ? item.sample.id : undefined
                    const fabric1Editable = Boolean(fabric1Id) && FABRIC1_EDITABLE.has(column.id)
                    // Rack No.는 대장 행이든 DD 행이든 창고보관 원단이면 모두 편집한다(원단별 상태에만 저장).
                    const rackEditable = canEditScope && column.id === "rackNo" && item.status === "WAREHOUSE"
                    // R&D No.는 채번 기록이라 창고보관 상태에서만, 편집 권한이 있을 때만 고친다.
                    // 소진·폐기로 넘어간 건은 고치지 않는다. 지난 출고 자료와 어긋난다.
                    const storageEditable = canEditScope && column.id === "storageNo" && item.status === "WAREHOUSE"
                    const editable = rackEditable || storageEditable || fabric1Editable || (Boolean(manualId) && MANUAL_EDITABLE.has(column.id))
                    const editing = editable && editCell?.row === item.key && editCell.col === column.id
                    return <TableCell key={column.id} className={`${teamScope === "team1" ? "text-center [&_.flex]:justify-center" : ""} h-8 min-w-0 cursor-cell border-b border-r border-[var(--border)] px-1.5 py-0 ${confirmed ? "bg-[var(--muted)]" : ""} ${fixed ? "sticky z-10" : ""} ${inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,transparent)]" : ""} ${cellActive ? "outline outline-2 -outline-offset-2 outline-[var(--grid-selection)]" : ""}`} style={{ ...(fixed ? { left: fixedLeft(column.id), background: selected ? "color-mix(in srgb, var(--primary) 6%, var(--card))" : "var(--card)" } : null), ...(edges ? { boxShadow: edges } : null) }} data-no-range={column.id === "stock" ? "" : undefined} onMouseDown={(event) => { if (event.button !== 0 || editing) return; blockNativeDrag(event); cellDragRef.current = true; if (event.ctrlKey || event.metaKey) { if (cellRange) setExtraCellRanges((current) => [...current, cellRange]) } else setExtraCellRanges([]); setCellRange({ ar: index, ac: colIndex, fr: index, fc: colIndex }); setCellMenu(null) }} onMouseEnter={() => { if (cellDragRef.current) setCellRange((current) => current ? { ...current, fr: index, fc: colIndex } : current) }} onContextMenu={(event) => { event.preventDefault(); if (!inRange) { setExtraCellRanges([]); setCellRange({ ar: index, ac: colIndex, fr: index, fc: colIndex }) } setCellMenu({ x: event.clientX, y: event.clientY, key: item.key }) }} onClick={(event) => { if (column.id === "stock") event.stopPropagation(); setSelectedCell({ row: item.key, col: column.id }) }} onDoubleClick={() => { if (canEditScope && column.id === "stock" && tab !== "HISTORY") { setOutboundHistoryKey(null); openAction("STOCK", [item]) } else if (editable) setEditCell({ row: item.key, col: column.id }); else if (teamScope !== "team1") openDetail(item.key) }}>{editing
                      ? <input
                          autoFocus
                          type={fabric1Editable && column.id === "requestDate" ? "date" : "text"}
                          defaultValue={String(cellRawValue(item, column.id) ?? "")}
                          className="h-7 w-full rounded-none border-0 bg-[var(--card)] px-1 text-xs text-[var(--foreground)] outline-none ring-2 ring-inset ring-[var(--ring)]"
                          list={rackEditable ? "warehouse-rack-positions" : fabric1Editable && column.id === "construction" ? "warehouse-fabric1-constructions" : undefined}
                          onBlur={(event) => {
                            if (storageEditable) {
                              void commitStorageNo(item, event.target.value)
                              setEditCell(null)
                              return
                            }
                            if (rackEditable) {
                              // 형식이 틀리면 저장하지 않고 알린다. 빈 값은 지정 해제다.
                              const normalized = normalizeRackNo(event.target.value)
                              if (normalized === null) setSelectionNotice(RACK_FORMAT_HINT)
                              else void saveFabricRackNo(item, normalized)
                            } else if (fabric1Editable) {
                              const before = cellRawValue(item, column.id).trim()
                              let value = event.target.value.trim()
                              if ((column.id === "priceYd" || column.id === "priceLb") && value && Number(value) === 0) value = ""
                              if (value !== before) {
                                if (FABRIC1_SAMPLE_EDITABLE.has(column.id)) void updateManualIntake(fabric1Id as string, column.id, value)
                                else if (FABRIC1_OVERRIDE_EDITABLE.has(column.id)) void saveFabricFields(item, { [column.id]: value })
                              }
                            } else if (column.id === "flNo") {
                              const value = event.target.value
                              if (value.trim() !== item.flNo.trim()) {
                                const check = checkWarehouseFlEntry(value, item, records, ledger)
                                if (needsFlConfirm(check)) setFlEntryCheck({ item, manualId: manualId as string, check })
                                else void updateManualIntake(manualId as string, "flNo", check.fl)
                              }
                            } else void updateManualIntake(manualId as string, column.id, event.target.value)
                            setEditCell(null)
                          }}
                          onKeyDown={(event) => {
                            // 편집기 키가 표 단축키로 번지지 않게 막는다(CLAUDE.md 인라인 편집기 주의).
                            if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
                            if (event.key === "Escape") { event.preventDefault(); setEditCell(null) }
                            else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); event.currentTarget.blur() }
                          }}
                        />
                      : coreCell(item, column.id)}
                    {editing && rackEditable ? <datalist id="warehouse-rack-positions">{usedRackNos.map((position) => <option key={position} value={position} />)}</datalist> : null}
                    {editing && fabric1Editable && column.id === "construction" ? <datalist id="warehouse-fabric1-constructions">{CONSTRUCTIONS.map((value) => <option key={value} value={value} />)}</datalist> : null}</TableCell>
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
        footer={<StatusMixBar counts={counts} total={totalCount} tabs={tabOrder} onPick={changeTab} />}
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
        footer={<p className="truncate text-[10px] text-[var(--muted-foreground)]">출고 <strong className="tabular-nums text-[var(--foreground)]">{kpi.outboundCount.toLocaleString("ko-KR")}</strong>건{kpi.missingStock ? ` · 재고 미기입 ${kpi.missingStock}건` : ""}{perfIndex ? <span title={`창고보관 ${kpi.storedCount}건 중 RDDA 성과 매칭 ${kpi.perfMatched}건`}> · 보관 중 <strong className="text-amber-700">오더 {kpi.orderStored}</strong> / <strong className="text-emerald-700">베스트 {kpi.bestStored}</strong></span> : null}</p>}
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

    <div className="flex shrink-0 items-center gap-2">
    {canSeeTeam3 && canSeeTeam1 ? <div className="inline-flex shrink-0 rounded-md border border-[var(--border)] bg-[var(--muted)] p-0.5">
      {(["team3", "team1"] as const).map((scope) => <button key={scope} type="button" aria-pressed={teamScope === scope} onClick={() => changeTeamScope(scope)} className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${teamScope === scope ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{scope === "team3" ? "3팀 원단" : "1팀 원단"}</button>)}
    </div> : null}
    <Tabs value={tab} onValueChange={(value) => changeTab(value as WarehouseTab)} className="min-w-0 flex-1">
      <TabsList className="flex w-full justify-start gap-1 overflow-x-auto">
        {tabOrder.map((key) => {
          return <TabsTrigger
            key={key}
            value={key}
            className={`group/tab min-w-0 flex-1 gap-2 transition-[background-color,box-shadow,opacity] duration-200 motion-reduce:transition-none ${TAB_ACCENT[key].active}`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full group-data-[state=active]/tab:bg-white ${TAB_ACCENT[key].dot}`} />
            <span className="truncate">{TAB_META[key].label}</span>
            <Badge variant="secondary" className={`h-5 min-w-5 justify-center px-1.5 tabular-nums ${TAB_ACCENT[key].badge}`}>{counts[key].toLocaleString("ko-KR")}</Badge>
          </TabsTrigger>
        })}
      </TabsList>
    </Tabs>
    <Button type="button" size="sm" variant={rackView ? "default" : "outline"} className="shrink-0" aria-pressed={rackView} title="통합원단부 전용 rack 칸별 보관 현황" onClick={() => { setDisposalView(false); setRackView((current) => !current) }}>
      <LayoutGrid className="size-4" />배치도
    </Button>
    {teamScope === "team3" && (isOwner || access.warehouse === "edit") ? <Button type="button" size="sm" variant={disposalView ? "default" : "outline"} className="shrink-0" aria-pressed={disposalView} onClick={() => setDisposalView(true)}>
      <ClipboardList className="size-4" />폐기 라운드{disposalRounds.some((round) => round.status !== "완료") ? <Badge variant="secondary" className="ml-1 h-5 px-1.5">{disposalRounds.filter((round) => round.status !== "완료").length}</Badge> : null}
    </Button> : null}
    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setExportOpen(true)}>
      <FileDown className="size-4" />창고팀 자료
    </Button>
    {canBackup ? <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={backupExporting} title="DD 전체와 창고 상태·이력, 샘플대장을 필드 그대로 엑셀로 내려받습니다" onClick={() => void exportBackup()}>{backupExporting ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}엑셀 백업</Button> : null}
    {!canEditScope && scopeAccess === "read" ? <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/95 px-2.5 py-1 text-xs font-semibold text-sky-700"><Eye className="size-3.5" aria-hidden="true" />읽기 전용</span> : null}
    </div>

    {rackView ? <RackMap items={storedItems} onOpenSlot={openRackSlot} /> : <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--border)] bg-[var(--card)] transition-colors duration-200 motion-reduce:transition-none ${accent.borderTop}`}>
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border)] p-2">
        {teamScope === "team1" && tab === "WAREHOUSE" && canEditScope ? <Button type="button" size="sm" className="shrink-0" onClick={() => setFabric1IntakeOpen(true)}><Plus />신규 입고</Button> : null}
        <label className="relative block min-w-52 flex-1"><span className="sr-only">창고 검색</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="R&D No., Style, FL, Buyer 검색" className="pl-9" /></label>
        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{TAB_META[tab].label} <strong className="text-[var(--foreground)]">{rows.length.toLocaleString("ko-KR")}</strong>건 · 선택 {selectedRows.length}건</span>
        {tab === "READY" && !hiddenOnly && canEditScope ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => openAction("RECEIVE", selectedRows)}><PackageCheck />선택 입고</Button> : null}
        {tab === "READY" && !hiddenOnly && canEditScope ? <Button type="button" size="sm" variant="outline" onClick={async () => { await addManualIntake(); setTab("READY"); setUnconfirmedOnly(false); setSearch("") }}><Pencil />직접 추가</Button> : null}
        {tab === "READY" && !hiddenOnly && canEditScope ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("REMOVE", selectedRows)}><ListX />선택 삭제</Button> : null}
        {tab === "WAREHOUSE" && canEditScope ? <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => openAction("CONFIRM", selectedRows)} className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/40 dark:bg-emerald-500 dark:hover:bg-emerald-600"><PackageCheck />입고 확인</Button>
          <Button type="button" size="sm" variant="outline" disabled={!selectedRows.some((item) => item.confirmedAt)} title={selectedRows.some((item) => item.confirmedAt) ? "선택한 원단의 실물 확인 표시를 지웁니다" : "확인된 원단을 먼저 선택하세요."} onClick={() => openAction("UNCONFIRM", selectedRows)}><PackageX />입고 확인 취소</Button>
        </div> : null}
        {tab === "WAREHOUSE" && canEditScope ? <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--border)]" /> : null}
        {tab === "WAREHOUSE" && canRequestOutbound ? <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" disabled={!selectedRows.length} className="bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-600/40 dark:bg-sky-500 dark:hover:bg-sky-600" title={selectedRows.length ? "선택한 원단의 출고를 창고팀에 요청합니다" : "요청할 원단을 먼저 선택하세요."} onClick={() => setOutboundMailOpen(true)}><Mail />출고 요청</Button>
        </div> : null}
        {tab === "WAREHOUSE" && canEditScope && canRequestOutbound ? <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--border)]" /> : null}
        {tab === "WAREHOUSE" && canEditScope ? <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20" title={selectedRows.length ? "창고팀에서 커팅을 마친 후 누르세요" : "출고할 원단을 먼저 선택하세요."} onClick={() => openAction("OUTBOUND", selectedRows)}><Send />출고 확정</Button>
          <Button type="button" size="sm" variant="outline" disabled={!hasSelectedActiveOutbound} title={hasSelectedActiveOutbound ? "선택한 원단의 최근 출고를 취소합니다" : "취소할 출고가 있는 원단을 선택하세요."} onClick={() => openAction("UNOUTBOUND", selectedRows)}><PackageX />출고 취소</Button>
        </div> : null}
        {tab === "WAREHOUSE" && canEditScope ? <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--border)]" /> : null}
        {(tab === "READY" || tab === "WAREHOUSE") && canEditScope ? <div className="flex shrink-0 items-center gap-2">
          {tab === "WAREHOUSE" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("EXHAUST", selectedRows)}><PackageOpen />소진</Button> : null}
          <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("DISPOSE", selectedRows)}><Trash2 />폐기</Button>
          {tab === "WAREHOUSE" && teamScope !== "team1" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("UNRECEIVE", selectedRows)}><PackageOpen />입고 대기로</Button> : null}
        </div> : null}
        {tab === "HISTORY" && canEditScope ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => openAction("RESTORE", selectedRows, "WAREHOUSE")}><PackageCheck />창고 보관으로</Button> : null}
        {tab === "HISTORY" && canEditScope && teamScope !== "team1" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("RESTORE", selectedRows, "READY")}><PackageOpen />입고 대기로</Button> : null}
        {tab === "HISTORY" && canEditScope ? <Button type="button" size="sm" variant="outline" disabled={!hasSelectedActiveOutbound} title={hasSelectedActiveOutbound ? "선택한 원단의 최근 출고를 취소합니다" : "취소할 출고가 있는 원단을 선택하세요."} onClick={() => openAction("UNOUTBOUND", selectedRows)}><PackageX />출고 취소</Button> : null}
        {tab === "WAREHOUSE" && teamScope !== "team1" ? <Button type="button" size="sm" variant={unconfirmedOnly ? "default" : "outline"} aria-pressed={unconfirmedOnly} onClick={() => setUnconfirmedOnly((current) => !current)}>미확인 {unconfirmedCount}건</Button> : null}
        {tab === "READY" && hiddenCount > 0 ? <Button type="button" size="sm" variant={hiddenOnly ? "default" : "outline"} aria-pressed={hiddenOnly} title="선택 삭제로 목록에서 감춘 행입니다" onClick={() => setHiddenOnly((current) => !current)}>숨긴 행 {hiddenCount}건</Button> : null}
        {hiddenOnly && canEditScope ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => void restoreHiddenRows()}><PackageCheck />되살리기</Button> : null}
      </div>

      {renderGrid(tab, visibleRows, hiddenOnly ? "숨긴 행이 없습니다." : `${TAB_META[tab].label} 항목이 없습니다.`)}
      <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">{hiddenOnly ? "선택 삭제로 감춘 행입니다. 골라서 되살리면 감추기 직전 상태로 돌아갑니다." : `체크박스로 여러 건을 고른 뒤 위 버튼으로 처리합니다. · ${TAB_META[tab].description} 창고보관 탭에서는 R&D No. 칸을 더블클릭해 번호를 고칠 수 있습니다.`}</div>
    </div>}

    {selectionStats || selectionNotice ? <div role="status" className="pointer-events-none fixed bottom-4 right-6 z-[75] flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] shadow-md">
      {selectionNotice ? <span className="text-[var(--foreground)]">{selectionNotice}</span> : null}
      {selectionStats ? <>
        <span>개수 <strong className="tabular-nums text-[var(--foreground)]">{selectionStats.count.toLocaleString("ko-KR")}</strong></span>
        {selectionStats.numeric ? <>
          <span>합계 <strong className="tabular-nums text-[var(--foreground)]">{formatStatNumber(selectionStats.sum)}</strong></span>
          <span>평균 <strong className="tabular-nums text-[var(--foreground)]">{formatStatNumber(selectionStats.sum / selectionStats.numeric)}</strong></span>
        </> : null}
      </> : null}
    </div> : null}

    {cellMenu ? <>
      <div className="fixed inset-0 z-[85]" onMouseDown={() => setCellMenu(null)} onContextMenu={(event) => { event.preventDefault(); setCellMenu(null) }} />
      <div role="menu" className="fixed z-[90] w-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: Math.min(cellMenu.x, window.innerWidth - 176), top: Math.min(cellMenu.y, window.innerHeight - 120) }}>
        {teamScope === "team1" ? <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => { const key = cellMenu.key; setCellMenu(null); openDetail(key) }}><Info className="size-3.5" />원단 상세</button> : null}
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => void copyRange()}><Copy className="size-3.5" />복사 (Ctrl+C)</button>
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => { if (rangeRect) { setExtraCellRanges([]); setCellRange({ ar: rangeRect.top, ac: 0, fr: rangeRect.bottom, fc: visibleColumns.length - 1 }) } setCellMenu(null) }}><Rows3 className="size-3.5" />행 전체 선택</button>
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--muted-foreground)] hover:bg-[var(--muted)]" onClick={() => { setExtraCellRanges([]); setCellRange(null); setCellMenu(null) }}>선택 해제</button>
      </div>
    </> : null}

    <Fabric1IntakeDialog
      open={fabric1IntakeOpen}
      onOpenChange={setFabric1IntakeOpen}
      ledger={ledger}
      defaultOwner={defaultRequester}
      suggestNumbers={suggestFabric1Numbers}
      onSaved={(storageNo, notice) => {
        setSearch("")
        setColumnFilters({})
        setSortRule(null)
        setHiddenOnly(false)
        setUnconfirmedOnly(false)
        setChecked(new Set())
        setSelectionNotice(notice ?? `R&D No. ${storageNo} 입고했습니다.`)
      }}
    />
    <OutboundRequestMailDialog open={outboundMailOpen} onOpenChange={setOutboundMailOpen} items={selectedRows} defaultRequester={defaultRequester} />
    <InboundRequestMailDialog open={inboundMailKeys.length > 0} onOpenChange={(open) => { if (!open) setInboundMailKeys([]) }} items={inboundMailItems} defaultRequester={defaultRequester} />
    <FlEntryCheckDialog
      check={flEntryCheck?.check ?? null}
      onCancel={() => setFlEntryCheck(null)}
      onConfirm={() => {
        if (!flEntryCheck) return
        void updateManualIntake(flEntryCheck.manualId, "flNo", flEntryCheck.check.fl)
        setFlEntryCheck(null)
      }}
    />

    {/* 폐기 라운드는 창고보관 표를 덮지 않고 팝업으로 연다(R152). */}
    <Dialog open={disposalView} onOpenChange={setDisposalView}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1800px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
        <DialogHeader className="shrink-0 border-b border-[var(--border)] px-4 py-3"><DialogTitle>폐기 라운드</DialogTitle></DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {/* 폐기 라운드는 3팀 번호(1~7999) 순환을 전제로 범위를 자른다. 1팀 행을 넣으면 순서가 깨진다. R223에서 팀 분리한다. */}
          <DisposalRoundPanel ledger={team3Ledger} sequenceStart={sequenceStart} rounds={disposalRounds} actor={{ email: authUser?.email ?? "", name: authUser?.displayName || authUser?.email?.split("@")[0] || "" }} canWrite={currentUserCanEditKey("disposalRounds")} isOwner={isOwner} onSave={saveDisposalRounds} onCompleteDisposal={async (entries, reason) => {
            const moved = await applyDisposalRoundCompletion(entries, { reason, actor: authUser?.displayName || authUser?.email || "관리자" })
            setChecked(new Set())
            setTab("HISTORY")
            setDisposalView(false)
            return moved
          }} />
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={exportOpen} onOpenChange={(open) => { if (!exportBusy) setExportOpen(open) }}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>창고팀 자료</DialogTitle>
          <DialogDescription>선택한 기간의 입출고 자료를 엑셀 한 파일로 내려받습니다.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EXPORT_PRESETS.map((preset) => <Button key={preset} type="button" size="sm"
              variant={exportRange.preset === preset ? "default" : "outline"}
              aria-pressed={exportRange.preset === preset} disabled={exportBusy}
              onClick={() => setExportRange((current) => ({ ...current, preset }))}>{preset}</Button>)}
          </div>
          {exportRange.preset === "직접 지정" ? <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="warehouse-export-from">시작일</Label><Input id="warehouse-export-from" type="date" value={exportRange.from} disabled={exportBusy} onChange={(event) => setExportRange((current) => ({ ...current, from: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="warehouse-export-to">종료일</Label><Input id="warehouse-export-to" type="date" value={exportRange.to} disabled={exportBusy} onChange={(event) => setExportRange((current) => ({ ...current, to: event.target.value }))} /></div>
          </div> : <p className="text-sm text-[var(--muted-foreground)]">{exportDates.from} ~ {exportDates.to}</p>}
          {exportData ? <p className="text-sm" aria-live="polite">입고 {exportData.totals.inbound}건 · 소진/폐기 {exportData.totals.outboundDone}건 · 출고요청 {exportData.totals.listCount}건</p> : null}
          {exportRangeError || exportError ? <p role="alert" className="text-sm text-[var(--destructive)]">{exportRangeError || exportError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={exportBusy || !exportData} onClick={() => void runExport()}>{exportBusy ? "생성 중…" : "엑셀 내려받기"}</Button>
          <Button type="button" variant="outline" disabled={exportBusy} onClick={() => setExportOpen(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>


    <Dialog open={Boolean(outboundHistoryItem)} onOpenChange={(open) => { if (!open) setOutboundHistoryKey(null) }}>
      <DialogContent className="max-w-2xl">
        {outboundHistoryItem ? <>
          <DialogHeader><DialogTitle>반출 이력</DialogTitle><DialogDescription>{storageNoLabel(outboundHistoryItem) || "R&D No. 없음"} · {outboundHistoryItem.flNo || "FL No. 없음"}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-3">
            {outboundHistoryItem.outbound.length ? <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--muted)] text-left text-[var(--muted-foreground)]"><tr><th className="px-3 py-2">날짜</th><th className="px-3 py-2">반출처</th><th className="px-3 py-2">사업부</th><th className="px-3 py-2 text-right">수량</th></tr></thead>
                <tbody>{outboundHistoryItem.outbound.map((event, index) => <tr key={`${event.date}-${index}`} className="border-t border-[var(--border)]"><td className="px-3 py-2">{fmtDateFull(event.date)}</td><td className="px-3 py-2">{event.to}</td><td className="px-3 py-2">{event.division ?? ""}</td><td className="px-3 py-2 text-right tabular-nums">{formatYds(event.qty)} yds</td></tr>)}</tbody>
              </table>
            </div> : <p className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">반출 기록이 없습니다.</p>}
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]"><span>입고 <strong className="tabular-nums text-[var(--foreground)]">{outboundHistoryItem.yds === null ? "-" : `${formatYds(outboundHistoryItem.yds)} yds`}</strong></span><span>누적 반출 <strong className="tabular-nums text-[var(--foreground)]">{outboundHistoryItem.outboundTotal === null ? "-" : `${formatYds(outboundHistoryItem.outboundTotal)} yds`}</strong></span><span>잔량 <strong className="tabular-nums text-[var(--foreground)]">{outboundHistoryItem.balance === null ? "-" : `${formatYds(outboundHistoryItem.balance)} yds`}</strong></span></div>
          </DialogBody>
        </> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(detailKey)} onOpenChange={(open) => { if (!open) setDetailKey(null) }}>
      <DialogContent className="max-h-[90vh] w-[96vw] max-w-[1600px] overflow-y-auto sm:max-w-[96vw]">
        <DialogHeader><DialogTitle>원단 상세</DialogTitle></DialogHeader>
        <DialogBody>{detailKey ? <FabricDetailBody fabricKey={detailKey} /> : null}</DialogBody>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open && !saving) closeActionDialog() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{actionTitle}</DialogTitle><DialogDescription>{actionDialog?.kind === "UNOUTBOUND" ? "원단마다 가장 최근 출고 한 건을 취소합니다. 잔량이 돌아오고, 소진된 원단은 창고 보관으로 돌아갑니다. 출고 기록은 지우지 않고 취소 기록을 덧붙입니다." : actionItems.length === 1 ? `${storageNoLabel(actionItems[0]) || "자동 채번"} · ${actionItems[0]?.styleNo || actionItems[0]?.flNo || "원단"}` : `선택한 ${actionItems.length}건을 처리합니다.`}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          {actionDialog?.kind === "RECEIVE" ? <div className="space-y-2"><p className="text-xs text-[var(--muted-foreground)]">빠진 번호를 먼저 메우고 마지막 번호 다음으로 이어 갑니다. 7999 다음은 1000부터 이어집니다. 이력으로 간 번호는 다시 씁니다. 8000번대는 타 사업부 대역이라 쓰지 않습니다. 번호는 직접 고칠 수 있고 yds는 비워 두어도 됩니다. 롤 원단은 체크하면 번호 뒤에 R을 붙입니다. 채번은 그대로입니다.</p>{actionItems.map((item, index) => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3"><div className="min-w-0"><div className="flex items-center gap-2"><Input aria-label={`${item.styleNo || item.flNo || "원단"} R&D No.`} className="h-8 w-20 font-mono text-sm" value={storageNoFor(index)} onChange={(event) => setReceiveNos((current) => ({ ...current, [item.key]: event.target.value }))} /><span className="truncate text-sm font-medium">{item.styleNo || item.flNo || "미입력"}</span></div><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{item.flNo || "FL No. 없음"}</p></div><div className="space-y-1"><Label htmlFor={`receive-yds-${index}`} className="text-xs">보유 yds (옵션)</Label><Input id={`receive-yds-${index}`} type="number" min="0" step="0.01" value={receiveYds[item.key] ?? ""} onChange={(event) => setReceiveYds((current) => ({ ...current, [item.key]: event.target.value }))} /><label className="mt-1 flex items-center gap-1.5 text-xs"><Checkbox checked={receiveRolls[item.key] === true} onCheckedChange={(value) => setReceiveRolls((current) => ({ ...current, [item.key]: value === true }))} aria-label={`${item.styleNo || item.flNo || "원단"} 롤 원단`} /><span>롤 원단</span></label></div></div>)}</div> : null}
          {actionDialog?.kind === "UNRECEIVE" ? <p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.length}건을 입고 대기로 되돌립니다. <strong>채번한 R&D No.가 취소되고 그 번호는 다시 쓸 수 있게 풀립니다.</strong> 실물 확인 표시와 보유 재고도 함께 지워지고, 출고 합계는 0부터 다시 셉니다. 지난 기록은 원단 상세의 이력에 그대로 남습니다.</p> : null}
          {actionDialog?.kind === "UNCONFIRM" ? <p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.filter((item) => item.confirmedAt).length}건의 <strong>실물 확인 표시만 지웁니다.</strong> R&D No., 보유 재고, 출고 기록은 그대로 둡니다. 확인이 안 된 건은 건너뜁니다. 취소 기록은 원단 상세의 이력에 남습니다.</p> : null}
          {actionDialog?.kind === "CONFIRM" ? <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">창고에서 실물을 확인한 건만 체크하세요. 확인된 행은 대장에서 회색으로 칠하던 것과 같게 흐리게 보입니다.</p>
            <p className="text-xs text-[var(--muted-foreground)]">원단을 넣은 칸의 Rack No.를 적어 주세요. 입력한 값 그대로 저장하고, 이미 쓰인 번호가 참고로 뜹니다. 모르면 비워 두고 나중에 표에서 적어도 됩니다.</p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {actionItems.map((item) => {
                const rackDraft = confirmRacks[item.key] ?? item.rackNo ?? ""
                const rackInvalid = normalizeRackNo(rackDraft) === null
                return <div key={item.key} className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2">
                  <label className={`flex min-w-0 flex-1 items-center gap-3 ${item.confirmedAt ? "opacity-50" : ""}`}>
                    <Checkbox checked={item.confirmedAt ? true : confirmChecks[item.key] !== false} disabled={Boolean(item.confirmedAt)} onCheckedChange={(value) => setConfirmChecks((current) => ({ ...current, [item.key]: value === true }))} aria-label={`${storageNoLabel(item) || item.styleNo} 실물 확인`} />
                    <span className="min-w-0 flex-1 truncate text-sm"><span className="font-mono">{storageNoLabel(item) || "번호 없음"}</span> · {item.styleNo || item.flNo || "미입력"}</span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{item.confirmedAt ? `확인 ${fmtDateFull(item.confirmedAt)}` : item.yds === null ? "" : `${formatYds(item.yds)}yds`}</span>
                  </label>
                  <Input
                    aria-label={`${item.storageNo || item.styleNo || "원단"} Rack No.`}
                    title={rackInvalid ? RACK_FORMAT_HINT : "Rack No."}
                    list="warehouse-confirm-rack-positions"
                    placeholder="Rack No."
                    className={`h-8 w-28 shrink-0 font-mono text-sm ${rackInvalid ? "border-[var(--destructive)]" : ""}`}
                    value={rackDraft}
                    onChange={(event) => setConfirmRacks((current) => ({ ...current, [item.key]: event.target.value }))}
                    onBlur={(event) => {
                      const normalized = normalizeRackNo(event.target.value)
                      if (normalized !== null) setConfirmRacks((current) => ({ ...current, [item.key]: normalized }))
                    }}
                  />
                </div>
              })}
            </div>
            <datalist id="warehouse-confirm-rack-positions">{usedRackNos.map((position) => <option key={position} value={position} />)}</datalist>
          </div> : null}
          {actionDialog?.kind === "DISPOSE" ? <div className="space-y-2"><Label htmlFor="warehouse-disposal-reason">폐기 사유</Label><Select value={disposalReason} onValueChange={(value) => setDisposalReason(value as DisposalReason)}><SelectTrigger id="warehouse-disposal-reason"><SelectValue placeholder="사유 선택" /></SelectTrigger><SelectContent>{DISPOSAL_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select><p className="text-xs text-[var(--muted-foreground)]">선택한 {actionItems.length}건에 같은 사유가 기록됩니다.</p></div> : null}
          {actionDialog?.kind === "RESTORE" ? <div className="space-y-2">
            <p className="text-sm">선택한 {actionItems.length}건을 {actionDialog.restoreTo === "READY" ? "입고 대기" : "창고 보관"}로 되돌립니다.</p>
            <p className="text-xs text-[var(--muted-foreground)]">{actionDialog.restoreTo === "READY"
              ? "입고 대기는 채번 전 상태입니다. R&D No.가 풀리고 보유 재고와 출고 합계도 초기화됩니다. 지난 기록은 원단 상세의 이력에 남습니다."
              : "소진·폐기 표시를 지우고 창고 보관으로 되돌립니다. R&D No.와 보유 재고, 출고 이력은 그대로 둡니다."}</p>
          </div> : null}
          {actionDialog?.kind === "REMOVE" ? <div className="space-y-2"><p className="text-sm">선택한 {actionItems.length}건을 창고 목록에서 삭제합니다.</p><p className="text-xs text-[var(--muted-foreground)]">폐기가 아닙니다. 창고보관, 이력, 창고팀 자료 어디에도 나오지 않고 R&D No.는 다시 쓸 수 있게 풀립니다. 3팀 원단은 DD MASTER 원본과 개발 이력이 그대로 남습니다. 삭제 기록은 작업 이력에 남습니다.</p></div> : null}
          {actionDialog?.kind === "STOCK" ? (() => {
            const outboundTotal = actionItems[0]?.outboundTotal ?? 0
            const changeTotal = (value: string) => {
              setStockYds(value)
              const next = Number(value)
              setStockBalance(value.trim() && Number.isFinite(next) ? String(Math.max(0, next - outboundTotal)) : "")
            }
            const changeBalance = (value: string) => {
              setStockBalance(value)
              const next = Number(value)
              setStockYds(value.trim() && Number.isFinite(next) ? String(next + outboundTotal) : "")
            }
            return <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 text-center">
                <div><dt className="text-xs text-[var(--muted-foreground)]">현재 전체</dt><dd className="mt-0.5 text-sm font-medium tabular-nums">{actionItems[0]?.yds === null || actionItems[0]?.yds === undefined ? "미입력" : `${formatYds(actionItems[0].yds)} yds`}</dd></div>
                <div><dt className="text-xs text-[var(--muted-foreground)]">출고 합계</dt><dd className="mt-0.5 text-sm font-medium tabular-nums">{formatYds(outboundTotal)} yds</dd></div>
                <div><dt className="text-xs text-[var(--muted-foreground)]">현재 잔량</dt><dd className="mt-0.5 text-sm font-medium tabular-nums">{actionItems[0]?.balance === null || actionItems[0]?.balance === undefined ? "미입력" : `${formatYds(Math.max(0, actionItems[0].balance))} yds`}</dd></div>
              </dl>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="warehouse-stock-yds">전체 수량 (yds)</Label><Input id="warehouse-stock-yds" type="number" min="0" step="0.01" value={stockYds} onChange={(event) => changeTotal(event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="warehouse-stock-balance">잔량 (yds)</Label><Input id="warehouse-stock-balance" type="number" min="0" step="0.01" value={stockBalance} onChange={(event) => changeBalance(event.target.value)} /></div>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">둘 중 아무 칸이나 고치면 나머지가 따라 바뀝니다. 잔량은 전체 수량에서 출고 합계 {formatYds(outboundTotal)} yds를 뺀 값입니다. 출고 이력은 그대로 두고 수량만 고칩니다.</p>
            </div>
          })() : null}
          {actionDialog?.kind === "OUTBOUND" ? <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="warehouse-recipient">수령자</Label><Input id="warehouse-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="수령자를 자유롭게 입력" /></div>
              <div className="space-y-2"><Label htmlFor="warehouse-division">사업부 (옵션)</Label><Input id="warehouse-division" list="warehouse-division-suggestions" value={division} onChange={(event) => setDivision(event.target.value)} placeholder="사업부를 자유롭게 입력" /><datalist id="warehouse-division-suggestions">{divisionSuggestions.map((value) => <option key={value} value={value} />)}</datalist></div>
              <div className="space-y-2"><Label htmlFor="warehouse-outbound-date">출고 날짜</Label><Input id="warehouse-outbound-date" type="date" value={outboundDate} onChange={(event) => setOutboundDate(event.target.value)} /></div>
              <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-xs"><Checkbox checked={exhaustOnZero} onCheckedChange={(value) => setExhaustOnZero(value === true)} aria-label="잔량 0이면 소진 완료" /><span>잔량 0이면 소진 완료로 이동</span></label></div>
            </div>
            <div className="space-y-2">{actionItems.map((item, index) => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-sm">{storageNoLabel(item) || "번호 없음"}</span><span className="truncate text-sm font-medium">{item.styleNo || item.flNo || "미입력"}</span></div><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">FL {item.flNo || "No. 없음"} · 현재 잔량 {item.balance === null ? "미기입" : `${formatYds(item.balance)} yds`}</p></div>
              <div className="space-y-1"><Label htmlFor={`warehouse-outbound-qty-${index}`} className="text-xs">출고 수량 (yds)</Label><Input id={`warehouse-outbound-qty-${index}`} type="number" min="0.01" max={item.balance ?? undefined} step="0.01" value={outboundQtys[item.key] ?? ""} onChange={(event) => setOutboundQtys((current) => ({ ...current, [item.key]: event.target.value }))} /></div>
            </div>)}</div>
          </div> : null}
          {actionDialog?.kind === "UNOUTBOUND" ? <div className="max-h-72 space-y-2 overflow-y-auto">{actionItems.map((item) => {
            const outbound = activeOutboundFor(item)
            return <div key={item.key} className={`rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 ${outbound ? "" : "opacity-50"}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-sm">{storageNoLabel(item) || "번호 없음"}</span><span className="truncate text-sm font-medium">{item.styleNo || item.flNo || "미입력"}</span></div>
              {outbound ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">출고일 {fmtDateFull(outbound.occurredAt)}　받는 곳 {outbound.to || "미입력"}　수량 {formatYds(outbound.qty ?? 0)} yds</p> : <p className="mt-1 text-xs text-[var(--muted-foreground)]">취소할 출고 없음</p>}
            </div>
          })}</div> : null}
          {actionDialog?.kind === "EXHAUST" ? <p className="text-sm">재고 수량과 관계없이 이 원단을 소진 완료로 이동합니다.</p> : null}
          {actionDialog?.kind === "RESTORE" ? <p className="text-sm">{actionItems[0]?.status === "EXHAUSTED" ? "창고 보관 상태로 복구합니다." : "폐기 전 상태로 복구합니다."}</p> : null}
          {formError ? <p role="alert" className="text-sm text-[var(--destructive)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={closeActionDialog}>취소</Button>{actionDialog?.kind === "RECEIVE" ? <Button type="button" variant="outline" disabled={saving} title="입고 등록을 마친 뒤 정산관리팀 입고 요청 메일 창을 엽니다" onClick={() => void runAction(true)}><Mail />입고 등록 후 요청 메일</Button> : null}<Button type="button" variant={actionDialog?.kind === "DISPOSE" || actionDialog?.kind === "REMOVE" ? "destructive" : "default"} disabled={saving || (actionDialog?.kind === "UNOUTBOUND" && !actionItems.some((item) => Boolean(activeOutboundFor(item))))} onClick={() => void runAction()}>{saving ? "처리 중…" : "처리 확정"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
