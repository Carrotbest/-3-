import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import { CalendarDays, Eye, EyeOff, Download, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardPaste, Columns3, Copy, Eraser, Loader2, Maximize2, Paperclip, Plus, Redo2, RotateCcw, Rows3, Save, Scissors, Search, Trash2, TriangleAlert, Undo2, X } from "lucide-react"
import { Popover } from "radix-ui"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataUpload } from "@/components/upload/DataUpload"
import { FABRIC_STATUS_META, buildFabricLedger, type FabricLedgerItem } from "@/data/fabric-ledger"
import { createBlankDevRecord, DD_CATEGORY_OPTIONS, DD_COMPANY_OPTIONS, DD_DYEING_OPTIONS, DD_PASS_FAIL_OPTIONS, DD_SEASON_OPTIONS, DD_STATUS_OPTIONS, ddCategoryTextClass, ddStatusStyle, ddWarnings } from "@/data/dd-workflow"
import { buildDdWorkbook, ddExportFileName, downloadBlob, type DdExportSheet } from "@/data/dd-export"
import { fmtDateMd, normalizeDateInput, toDate } from "@/data/format"
import { dayToneText, holidayName } from "@/data/holidays"
import { ingestDevelopment } from "@/data/upload"
import { applyZajiHeader, parseZaji, zajiToRecord, type Zaji } from "@/data/zaji"
import { MEMBERS, ownerDisplayName, type DevRecord, type DevTechnical } from "@/data/schema"
import { saveDevelopmentIntakeRecords, saveDevelopmentRecord, useAppStore, flushDevelopmentRecords, writeDevelopmentRecords } from "@/store/useAppStore"

const ALL = "__all__"
const EDIT_DISABLED_MESSAGE = "담당을 선택한 뒤 수정할 수 있습니다."
const COL_WIDTHS_STORAGE_KEY = "dd-col-widths-v2"
const MIN_COLUMN_WIDTH = 56
/** 더 이상 진행하지 않는 상태. 전체 탭에서는 감추고, 담당 탭에서는 위로 올려 흐리게 보여 준다. */
const CLOSED_STATUSES = new Set(["완료", "DROP", "REJECT"])
/** 종료된 행의 회색. DD MASTER 에서 쓰는 회색 중 가장 진하다. */
const DIMMED_ROW_BG = "color-mix(in srgb, var(--foreground) 24%, var(--card))"
const isClosedRecord = (record: DevRecord): boolean => CLOSED_STATUSES.has(String(record.devStatus || record.stage || "").trim())
/** 엑셀의 행 머리글에 해당하는 좌측 번호 칸. 데이터 열이 아니므로 복사·붙여넣기 대상에서 빠진다. */
const ROW_HEADER_WIDTH = 40

/** 현재 재직 중인 메인 개발 담당(팀장 제외). 본인 개발건 우선 확인용 네임카드에 쓴다. */
const MAIN_DEVELOPERS: string[] = MEMBERS.filter((member) => member.role !== "팀장").map((member) => member.name)

interface CellRef { row: string; col: string }
type CellMove = "up" | "down" | "left" | "right"

interface CellRect {
  top: number
  bottom: number
  left: number
  right: number
}

interface CellSel {
  inRange: boolean
  isActive: boolean
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
  handle: boolean
  moveEdge: boolean
}

interface MoveDrag {
  source: CellRect
  wholeRows: boolean
  grabRow: number
  grabCol: number
}

type GroupKey = "request" | "original" | "detail" | "schedule" | "result" | "data" | "history" | "ledger"
type CellValue = string | number | null | undefined

interface MasterColumn {
  id: string
  label: string
  width: number
  value: (record: DevRecord, ledger: FabricLedgerItem | null) => CellValue
  date?: boolean
  mono?: boolean
  align?: "center" | "right"
  render?: (record: DevRecord, ledger: FabricLedgerItem | null) => ReactNode
  options?: readonly string[]
  number?: boolean
  /** 엑셀 병합셀 단위(공정·단계). 같은 sub 는 헤더·에디터에서 하나로 묶는다. */
  sub?: string
  /** 에디터에서 목록 제안 + 자유 입력(datalist). 값이 늘어나는 인명·바이어 등. */
  suggest?: boolean
}

interface MasterGroup {
  key: GroupKey
  label: string
  color: string
  columns: MasterColumn[]
  /** 에디터 전용 레이아웃. schedule=공정별 라벨 좌측+축소 카드, data=한 줄 배열+라벨 상단. */
  editorLayout?: "schedule" | "data"
}

const text = (value: CellValue): string => value === null || value === undefined || value === "" ? "" : String(value)
const dateText = (value: CellValue): string => value ? fmtDateMd(String(value)) : ""

function selectionShadow(sel: CellSel): string | undefined {
  if (!sel.inRange) return undefined
  const parts: string[] = []
  if (sel.top) parts.push("inset 0 1.5px 0 0 var(--grid-selection)")
  if (sel.bottom) parts.push("inset 0 -1.5px 0 0 var(--grid-selection)")
  if (sel.left) parts.push("inset 1.5px 0 0 0 var(--grid-selection)")
  if (sel.right) parts.push("inset -1.5px 0 0 0 var(--grid-selection)")
  return parts.length ? parts.join(", ") : undefined
}

function replaceText(source: string, find: string, replacement: string, matchCase: boolean): string {
  if (!find) return source
  if (matchCase) return source.split(find).join(replacement)
  const sourceKey = source.toLocaleLowerCase("ko-KR")
  const findKey = find.toLocaleLowerCase("ko-KR")
  let cursor = 0
  let result = ""
  while (cursor < source.length) {
    const index = sourceKey.indexOf(findKey, cursor)
    if (index === -1) return result + source.slice(cursor)
    result += source.slice(cursor, index) + replacement
    cursor = index + find.length
  }
  return result
}

function FillHandle({ visible, onMouseDown }: { visible: boolean; onMouseDown: (event: ReactMouseEvent<HTMLSpanElement>) => void }) {
  if (!visible) return null
  return <span data-fill-handle aria-hidden="true" onMouseDown={onMouseDown} className="absolute -bottom-1 -right-1 z-30 size-[7px] cursor-crosshair border border-white bg-[var(--grid-selection)]" />
}

function ledgerStatus(ledger: FabricLedgerItem | null): ReactNode {
  if (!ledger) return <span className="text-[var(--muted-foreground)]">미연결</span>
  const meta = FABRIC_STATUS_META[ledger.status]
  return <Badge variant="outline" className="gap-1.5 whitespace-nowrap bg-[var(--background)] font-normal"><span className={`size-2 rounded-full ${meta.tone}`} />{meta.label}</Badge>
}

/**
 * 옵션 순번을 "2/4" 분수로 보여준다. 전체 개수는 수식 열 optionProgress("완료 / 전체")의 분모를 쓴다.
 * 표시만 바꾸고 value 는 순번 그대로라 복사·붙여넣기 값은 달라지지 않는다.
 */
function optionSequenceText(row: DevRecord): string {
  const sequence = String(row.opt ?? "").trim()
  if (!sequence) return ""
  const total = String(row.tech?.optionProgress ?? "").split("/")[1]?.trim()
  return total ? `${sequence}/${total}` : sequence
}

const PINNED_COLUMNS: MasterColumn[] = [
  { id: "owner", label: "담당", width: 118, suggest: true, value: (row) => row.owner },
  { id: "status", label: "Status", width: 108, options: DD_STATUS_OPTIONS, value: (row) => row.devStatus || row.stage },
  { id: "styleNo", label: "Style No.", width: 140, mono: true, value: (row) => row.styleNo },
]

const GROUPS: MasterGroup[] = [
  {
    key: "request", label: "개발 REQUEST", color: "var(--chart-1)", columns: [
      { id: "opt", label: "# of Opt", width: 68, mono: true, align: "center", value: (row) => row.opt, render: (row) => optionSequenceText(row) },
      { id: "season", label: "Season", width: 82, value: (row) => row.season, options: DD_SEASON_OPTIONS },
      { id: "buyer", label: "Buyer", width: 104, suggest: true, value: (row) => row.buyer },
      { id: "category", label: "Category", width: 104, value: (row) => row.category, options: DD_CATEGORY_OPTIONS, render: (row) => <span className={ddCategoryTextClass(row.category)}>{text(row.category)}</span> },
      { id: "planner", label: "Planner", width: 92, suggest: true, value: (row) => row.planner },
      { id: "requestDate", label: "Request Date", width: 76, date: true, value: (row) => row.requestDate },
      { id: "dueDate", label: "Due Date", width: 76, date: true, value: (row) => row.dueDate, render: (row) => <span className={ddWarnings(row).some((item) => item.key === "due") ? "text-[var(--destructive)]" : ""}>{dateText(row.dueDate)}</span> },
    ],
  },
  {
    key: "original", label: "ORIGINAL 분석", color: "var(--chart-2)", columns: [
      { id: "origBrand", label: "Brand", width: 104, value: (row) => row.tech?.original?.brand },
      { id: "origContents", label: "Contents", width: 148, value: (row) => row.tech?.original?.contents },
      { id: "origConstruction", label: "Cons.", width: 128, value: (row) => row.tech?.original?.construction },
      { id: "origWeight", label: "Org. Weight", width: 100, align: "right", number: true, value: (row) => row.tech?.original?.weight },
      { id: "origYarn", label: "Yarn (분석)", width: 184, value: (row) => row.tech?.original?.yarn },
      { id: "origComments", label: "Comments", width: 176, value: (row) => row.tech?.original?.comments },
    ],
  },
  {
    key: "detail", label: "개발 DETAIL", color: "var(--chart-3)", columns: [
      { id: "co", label: "Co", width: 62, align: "center", value: (row) => row.tech?.development?.co || row.devType, options: DD_COMPANY_OPTIONS },
      { id: "developmentNo", label: "GD#/SA#", width: 108, mono: true, value: (row) => row.tech?.development?.developmentNo || row.gdNo || row.saNo },
      { id: "arrangeNo", label: "Arrange#", width: 100, mono: true, value: (row) => row.tech?.arrangeNo },
      { id: "yarnDetail", label: "Yarn Detail", width: 200, value: (row) => row.tech?.yarnDetail },
      { id: "construction", label: "Cons.", width: 128, value: (row) => row.construction },
      { id: "targetWeight", label: "T.Weight", width: 92, align: "right", number: true, value: (row) => row.weight },
      { id: "color", label: "Color", width: 96, value: (row) => row.color },
      { id: "dyeing", label: "Dyeing Side", width: 104, value: (row) => row.dyeing, options: DD_DYEING_OPTIONS },
      { id: "finishingA", label: "A", width: 96, sub: "Finishing", value: (row) => row.tech?.finishingSlots?.a },
      { id: "finishingB", label: "B", width: 96, sub: "Finishing", value: (row) => row.tech?.finishingSlots?.b },
      { id: "finishingC", label: "C", width: 96, sub: "Finishing", value: (row) => row.tech?.finishingSlots?.c },
      { id: "finishingD", label: "D", width: 96, sub: "Finishing", value: (row) => row.tech?.finishingSlots?.d },
      { id: "remark", label: "Remark", width: 210, value: (row) => row.note },
    ],
  },
  {
    key: "schedule", label: "공정 SCHEDULE", color: "var(--warning)", editorLayout: "schedule", columns: [
      { id: "yarnMill", label: "업체", width: 65, sub: "원사", value: (row) => row.tech?.mills?.yarn },
      { id: "yarnStatus", label: "완료일", width: 76, date: true, sub: "원사", value: (row) => row.tech?.processDates?.yarn },
      { id: "knittingMill", label: "업체", width: 65, sub: "편직", value: (row) => row.tech?.mills?.knitting },
      { id: "knittingStatus", label: "완료일", width: 76, date: true, sub: "편직", value: (row) => row.tech?.processDates?.knitting },
      { id: "dyeingMill", label: "업체", width: 65, sub: "염색", value: (row) => row.tech?.mills?.dyeing },
      { id: "dyeingStatus", label: "완료일", width: 76, date: true, sub: "염색", value: (row) => row.tech?.processDates?.dyeing },
      { id: "finishingMill", label: "업체", width: 65, sub: "가공", value: (row) => row.tech?.mills?.finishing },
      { id: "finishingStatus", label: "완료일", width: 76, date: true, sub: "가공", value: (row) => row.tech?.processDates?.finishing },
    ],
  },
  {
    key: "result", label: "결과 RESULT", color: "var(--chart-2)", columns: [
      { id: "receivedDate", label: "Received Date", width: 80, date: true, value: (row) => row.receivedDate },
      { id: "fds", label: "FDS", width: 76, date: true, value: (row) => row.tech?.sampleDates?.fds, render: (row) => row.tech?.sampleDates?.fds ? dateText(row.tech.sampleDates.fds) : row.receivedDate ? <span className="text-[var(--destructive)]">미요청</span> : "" },
      { id: "yds", label: "YDS", width: 76, date: true, value: (row) => row.tech?.sampleDates?.yds, render: (row) => row.tech?.sampleDates?.yds ? dateText(row.tech.sampleDates.yds) : row.receivedDate ? <span className="text-[var(--destructive)]">미요청</span> : "" },
      { id: "flNo", label: "FL#", width: 81, mono: true, value: (row) => row.flNo, render: (row) => row.flNo ? <span className="font-mono">{row.flNo}</span> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미입력</span> : "" },
      { id: "optionProgress", label: "옵션 완료", width: 67, align: "center", value: (row) => row.tech?.optionProgress },
      { id: "review", label: "Review", width: 123, value: (row) => row.tech?.review },
    ],
  },
  {
    key: "data", label: "DATA", color: "var(--chart-4)", editorLayout: "data", columns: [
      { id: "actualWidth", label: "폭", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.width },
      { id: "actualWeight", label: "중량", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.weight },
      { id: "actualBalance", label: "Balance", width: 92, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.balance, render: (row) => { const balance = row.tech?.actual?.balance; return balance === null || balance === undefined ? "" : `${balance >= 0 ? "+" : ""}${balance.toFixed(1)}%` } },
      { id: "shrinkageLength", label: "축률L%", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.shrinkageLength },
      { id: "shrinkageWidth", label: "축률W%", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.shrinkageWidth },
      { id: "knitInch", label: "Inch", width: 84, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.inch },
      { id: "knitGauge", label: "Gauge", width: 88, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.gauge },
      { id: "knitNeedles", label: "Needles", width: 96, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.needles },
      { id: "loopF", label: "Loop F", width: 78, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.loopF },
      { id: "loopT", label: "Loop T", width: 78, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.loopT },
      { id: "loopB", label: "Loop B", width: 78, sub: "편직 사양", value: (row) => row.tech?.knitSpec?.loopB },
      { id: "greigeWidth", label: "폭", width: 84, sub: "Greige", align: "right", number: true, value: (row) => row.tech?.stageData?.greige?.width },
      { id: "greigeWeight", label: "중량", width: 84, sub: "Greige", align: "right", number: true, value: (row) => row.tech?.stageData?.greige?.weight },
      { id: "tenterWidth", label: "폭", width: 84, sub: "Tenter", align: "right", number: true, value: (row) => row.tech?.stageData?.tenter?.width },
      { id: "tenterWeight", label: "중량", width: 84, sub: "Tenter", align: "right", number: true, value: (row) => row.tech?.stageData?.tenter?.weight },
      { id: "washWidth", label: "폭", width: 84, sub: "Wash", align: "right", number: true, value: (row) => row.tech?.stageData?.wash?.width },
      { id: "washWeight", label: "중량", width: 84, sub: "Wash", align: "right", number: true, value: (row) => row.tech?.stageData?.wash?.weight },
      { id: "finishBrush", label: "Brush", width: 100, sub: "Finish", value: (row) => row.tech?.finish?.brush },
      { id: "finishChemical", label: "Chemical", width: 116, sub: "Finish", value: (row) => row.tech?.finish?.chemical },
    ],
  },
  {
    key: "history", label: "REVIEW & HISTORY", color: "var(--destructive)", columns: [
      { id: "passFail", label: "Pass/Fail", width: 96, value: (row) => row.tech?.passFail, options: DD_PASS_FAIL_OPTIONS },
      { id: "failReason", label: "Fail 사유", width: 176, value: (row) => row.tech?.failReason },
      { id: "styleHistory", label: "Style History", width: 210, value: (row) => row.tech?.styleHistory },
    ],
  },
  {
    key: "ledger", label: "샘플관리대장 연결", color: "var(--chart-1)", columns: [
      { id: "ledgerStatus", label: "대장 상태", width: 116, value: (_row, ledger) => ledger ? FABRIC_STATUS_META[ledger.status].label : "", render: (_row, ledger) => ledgerStatus(ledger) },
      { id: "storageNo", label: "넘버링", width: 104, mono: true, value: (_row, ledger) => ledger?.storageNo },
      { id: "sourceSheet", label: "대장 시트", width: 108, value: (_row, ledger) => ledger?.sample?.sourceSheet },
      { id: "ledgerUpdated", label: "웹 최종 변경", width: 136, value: (_row, ledger) => ledger?.updatedAt, render: (_row, ledger) => ledger?.updatedAt ? new Date(ledger.updatedAt).toLocaleString("ko-KR") : "" },
    ],
  },
]

const DEFAULT_OPEN: Record<GroupKey, boolean> = { request: true, original: false, detail: true, schedule: false, result: true, data: false, history: false, ledger: false }
const FINISHING_COLUMN_IDS = new Set(["finishingA", "finishingB", "finishingC", "finishingD", "remark"])
const COMPANY_COLOR_COLUMN_IDS = new Set(["co", "yarnMill", "knittingMill", "dyeingMill", "finishingMill"])
const GROUP_COLUMNS = GROUPS.flatMap((group) => group.columns)
const GROUP_COLUMN_IDS = new Set(GROUP_COLUMNS.map((column) => column.id))
// 핀 고정 열도 그룹(고정 핵심)처럼 너비 조절·저장 대상에 포함한다.
const RESIZABLE_COLUMNS = [...PINNED_COLUMNS, ...GROUP_COLUMNS]
const RESIZABLE_COLUMN_IDS = new Set(RESIZABLE_COLUMNS.map((column) => column.id))
const LEFT_ALIGN_IDS = new Set([
  "styleNo", "developmentNo", "arrangeNo", "yarnDetail", "construction", "color", "remark",
  "failReason", "styleHistory",
  "origBrand", "origContents", "origConstruction", "origWeight", "origYarn", "origComments",
])

const alignOf = (column: MasterColumn): "left" | "center" => LEFT_ALIGN_IDS.has(column.id) ? "left" : "center"

function loadColumnWidths(): Record<string, number> {
  const defaults = Object.fromEntries(RESIZABLE_COLUMNS.map((column) => [column.id, column.width]))
  if (typeof window === "undefined") return defaults
  try {
    const raw = window.localStorage.getItem(COL_WIDTHS_STORAGE_KEY)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Record<string, unknown>
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults
    Object.entries(stored).forEach(([id, width]) => {
      if (RESIZABLE_COLUMN_IDS.has(id) && typeof width === "number" && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH) defaults[id] = width
    })
  } catch {
    // 손상되었거나 사용할 수 없는 저장소 값은 기본 너비로 대체한다.
  }
  return defaults
}

function saveColumnWidths(widths: Record<string, number>): void {
  if (typeof window === "undefined") return
  const stored = Object.fromEntries(Object.entries(widths).filter(([id, width]) => RESIZABLE_COLUMN_IDS.has(id) && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH))
  try {
    window.localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // 저장 공간이 차단되거나 부족해도 현재 세션의 열 조절은 유지한다.
  }
}

/** 접수일 오래된 순(위가 과거). 등록 시각이 있으면 그것을, 없으면 Request Date 를 쓴다. */
function compareRequestDate(a: DevRecord, b: DevRecord): number {
  const sortable = (record: DevRecord) => {
    const registeredAt = Date.parse(String(record.registeredAt ?? ""))
    if (!Number.isNaN(registeredAt)) return { rank: 0, time: registeredAt, text: "" }
    // registeredAt 도입 전 웹 접수 행은 timestamp 기반 _src.row 에서 실제 등록 시각을 복원한다.
    if (record._src.sheet === "웹 접수" && record._src.row > 10_000_000_000) {
      return { rank: 0, time: Math.floor(record._src.row / 1000), text: "" }
    }
    const raw = String(record.requestDate ?? "").trim()
    if (!raw) return { rank: 2, time: Number.POSITIVE_INFINITY, text: "" }
    const time = Date.parse(raw.replace(/[.\/-]/g, "-"))
    return Number.isNaN(time) ? { rank: 1, time: Number.POSITIVE_INFINITY, text: raw } : { rank: 0, time, text: raw }
  }
  const left = sortable(a)
  const right = sortable(b)
  if (left.rank !== right.rank) return left.rank - right.rank
  if (left.rank === 0 && left.time !== right.time) return left.time - right.time
  if (left.rank === 1 && left.text !== right.text) return left.text.localeCompare(right.text, "ko-KR", { numeric: true })
  const styleOrder = a.styleNo.localeCompare(b.styleNo, "ko-KR", { numeric: true })
  if (styleOrder) return styleOrder
  const optionOrder = String(a.opt).localeCompare(String(b.opt), "ko-KR", { numeric: true })
  if (optionOrder) return optionOrder
  return a._src.row - b._src.row
}

/**
 * 기본 정렬. 드래그로 지정한 수동 순서(sortOrder)가 있으면 그것을 따르고, 없으면 접수일 오래된 순.
 * 수동 순서가 없는 행(=새로 접수된 행)은 아래로 내려 기존 배치를 흔들지 않는다.
 */
function compareManualOrder(a: DevRecord, b: DevRecord): number {
  const ao = a.sortOrder
  const bo = b.sortOrder
  const aHas = typeof ao === "number" && Number.isFinite(ao)
  const bHas = typeof bo === "number" && Number.isFinite(bo)
  if (aHas && bHas) return (ao as number) - (bo as number)
  if (aHas !== bHas) return aHas ? -1 : 1
  return compareRequestDate(a, b)
}

// 신규 작지 접수 전용 구성: 결과/DATA/REVIEW 제외. REQUEST·ORIGINAL은 옵션 공통, DETAIL·SCHEDULE은 옵션별.
const groupByKey = (key: GroupKey) => GROUPS.find((group) => group.key === key)!
const INTAKE_CORE = PINNED_COLUMNS.filter((column) => column.id !== "status") // 담당·Style No.
const INTAKE_REQUEST = groupByKey("request").columns.filter((column) => column.id !== "opt")
const INTAKE_ORIGINAL = groupByKey("original").columns
const INTAKE_REQUIRED_IDS = new Set(["owner", "styleNo", "season", "category", "buyer", "planner"])
const DETAIL_GROUP = groupByKey("detail")
const SCHEDULE_GROUP = groupByKey("schedule")

/** 옵션 공통(REQUEST·ORIGINAL·담당·Style) 필드를 from → to 로 복사한다. DETAIL·SCHEDULE 등 옵션별 필드는 유지. */
function applySharedFields(from: DevRecord, to: DevRecord): DevRecord {
  return {
    ...to,
    owner: from.owner, styleNo: from.styleNo, season: from.season, buyer: from.buyer,
    category: from.category, planner: from.planner, requestDate: from.requestDate, dueDate: from.dueDate,
    tech: { ...to.tech, original: { ...from.tech?.original } },
  }
}

/** 연속된 같은 sub 를 하나의 병합 헤더로 묶는다(엑셀 상위 열머리 병합 재현). */
function subRuns(columns: MasterColumn[]): { key: string; label: string; span: number }[] {
  const runs: { key: string; label: string; span: number }[] = []
  columns.forEach((column) => {
    const key = column.sub ?? ""
    const last = runs.at(-1)
    if (last && last.key === key) last.span += 1
    else runs.push({ key, label: column.sub ?? "", span: 1 })
  })
  return runs
}

/** 에디터용: 그룹 컬럼을 sub 버킷(병합 단위)으로 나눈다. sub 없는 컬럼은 null 버킷. */
function groupSubBlocks(columns: MasterColumn[]): { sub: string | null; columns: MasterColumn[] }[] {
  const blocks: { sub: string | null; columns: MasterColumn[] }[] = []
  columns.forEach((column) => {
    const sub = column.sub ?? null
    const last = blocks.at(-1)
    if (last && last.sub === sub) last.columns.push(column)
    else blocks.push({ sub, columns: [column] })
  })
  return blocks
}

function recordIdentity(record: DevRecord): string {
  return `${record._src.sheet}::${record._src.row}`
}

/** 그리드에 추가하는 행은 접수 화면의 기본값도 비워 엑셀의 새 빈 행처럼 시작한다. */
function createEmptyGridRecord(owner = ""): DevRecord {
  return { ...createBlankDevRecord(owner), opt: "", stage: "", devStatus: "", requestDate: "" }
}

const COMPUTED_COLUMN_IDS = new Set(["opt", "optionProgress", "actualBalance"])

const TECH_PATHS: Record<string, string[]> = {
  origBrand: ["original", "brand"], origContents: ["original", "contents"], origConstruction: ["original", "construction"], origWeight: ["original", "weight"], origYarn: ["original", "yarn"], origComments: ["original", "comments"],
  developer: ["development", "developer"], co: ["development", "co"], developmentNo: ["development", "developmentNo"], arrangeNo: ["arrangeNo"], yarnDetail: ["yarnDetail"],
  finishingA: ["finishingSlots", "a"], finishingB: ["finishingSlots", "b"], finishingC: ["finishingSlots", "c"], finishingD: ["finishingSlots", "d"],
  yarnMill: ["mills", "yarn"], yarnStatus: ["processDates", "yarn"], knittingMill: ["mills", "knitting"], knittingStatus: ["processDates", "knitting"], dyeingMill: ["mills", "dyeing"], dyeingStatus: ["processDates", "dyeing"], finishingMill: ["mills", "finishing"], finishingStatus: ["processDates", "finishing"],
  fds: ["sampleDates", "fds"], yds: ["sampleDates", "yds"], optionProgress: ["optionProgress"], review: ["review"], actualWidth: ["actual", "width"], actualWeight: ["actual", "weight"], actualBalance: ["actual", "balance"], shrinkageLength: ["actual", "shrinkageLength"], shrinkageWidth: ["actual", "shrinkageWidth"],
  knitInch: ["knitSpec", "inch"], knitGauge: ["knitSpec", "gauge"], knitNeedles: ["knitSpec", "needles"], loopF: ["knitSpec", "loopF"], loopT: ["knitSpec", "loopT"], loopB: ["knitSpec", "loopB"],
  greigeWidth: ["stageData", "greige", "width"], greigeWeight: ["stageData", "greige", "weight"], tenterWidth: ["stageData", "tenter", "width"], tenterWeight: ["stageData", "tenter", "weight"], washWidth: ["stageData", "wash", "width"], washWeight: ["stageData", "wash", "weight"],
  finishBrush: ["finish", "brush"], finishChemical: ["finish", "chemical"], passFail: ["passFail"], failReason: ["failReason"], styleHistory: ["styleHistory"],
}

function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target
  path.slice(0, -1).forEach((key) => {
    const next = cursor[key]
    if (!next || typeof next !== "object") cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  })
  cursor[path.at(-1)!] = value
}

function updateRecordCell(record: DevRecord, column: MasterColumn, raw: string): DevRecord {
  if (COMPUTED_COLUMN_IDS.has(column.id)) return record
  const input = column.date ? normalizeDateInput(raw) : raw
  const value: string | number | null = column.number ? (input.trim() === "" ? null : Number(input)) : input
  switch (column.id) {
    case "owner": return { ...record, owner: input }
    case "status": return { ...record, devStatus: input }
    case "styleNo": return { ...record, styleNo: input }
    case "season": return { ...record, season: input }
    case "buyer": return { ...record, buyer: input }
    case "category": return { ...record, category: input }
    case "planner": return { ...record, planner: input }
    case "requestDate": return { ...record, requestDate: input }
    case "dueDate": return { ...record, dueDate: input }
    case "construction": return { ...record, construction: input }
    case "targetWeight": return { ...record, weight: input === "" ? "" : Number(input) }
    case "color": return { ...record, color: input }
    case "dyeing": return { ...record, dyeing: input }
    case "remark": return { ...record, note: input }
    case "receivedDate": return { ...record, receivedDate: input }
    case "flNo": return { ...record, flNo: input }
  }
  const path = TECH_PATHS[column.id]
  if (!path) return record
  const tech = structuredClone(record.tech ?? {}) as DevTechnical
  setNested(tech as unknown as Record<string, unknown>, path, value === "" ? undefined : value)
  if (column.id === "co") {
    const devType = input === "GD" ? "GD" : input === "국내" ? "국내" : undefined
    return { ...record, tech, devType }
  }
  if (column.id === "developmentNo") {
    return { ...record, tech, gdNo: record.tech?.development?.co === "GD" ? input : record.gdNo, saNo: record.tech?.development?.co === "국내" ? input : record.saNo }
  }
  return { ...record, tech }
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** YYYY-MM-DD는 UTC 문자열로 다시 해석하지 않고, 로컬 달력 날짜로 유지한다. */
function localDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match) {
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null
  }
  const parsed = toDate(value)
  return parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

interface DatePickerPopoverProps {
  value: string
  disabled?: boolean
  invalid?: boolean
  onChange: (raw: string) => void
  onCancel?: () => void
  iconOnly?: boolean
  triggerClassName?: string
}

/** 포털로 렌더링하는 로컬 기준 월간 달력. 그리드 스크롤 컨테이너에 잘리지 않는다. */
function DatePickerPopover({ value, disabled = false, invalid = false, onChange, onCancel, iconOnly = false, triggerClassName = "" }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthStart(localDate(value) ?? new Date()))
  const committedRef = useRef(false)
  const selected = localDate(value)
  const selectedKey = selected ? dateKey(selected) : ""
  const today = new Date()
  const todayKey = dateKey(today)
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const cells = Array.from({ length: Math.ceil((firstDay.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, index) => {
    const day = index - firstDay.getDay() + 1
    return day > 0 && day <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      ? new Date(month.getFullYear(), month.getMonth(), day)
      : null
  })

  useEffect(() => {
    if (open) setMonth(monthStart(localDate(value) ?? new Date()))
  }, [open, value])

  const changeOpen = (next: boolean) => {
    if (next) committedRef.current = false
    setOpen(next)
    if (!next && !committedRef.current) onCancel?.()
  }
  const commit = (next: string) => {
    committedRef.current = true
    onChange(next)
    setOpen(false)
  }
  const previousMonth = () => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
  const nextMonth = () => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))

  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <button type="button" disabled={disabled} aria-invalid={invalid} aria-label={value ? `날짜 선택: ${value}` : "날짜 선택"} className={`flex min-w-0 items-center gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${triggerClassName}`}>
        {iconOnly ? null : <span className="min-w-0 flex-1 truncate">{value || "날짜 선택"}</span>}
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[70] w-64 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg outline-none">
        <div className="mb-1 flex items-center justify-between gap-1">
          <button type="button" aria-label="이전 달" onClick={previousMonth} className="inline-flex size-7 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"><ChevronLeft className="size-4" /></button>
          <p className="text-xs font-semibold tabular-nums text-[var(--foreground)]">{month.getFullYear()}.{String(month.getMonth() + 1).padStart(2, "0")}</p>
          <button type="button" aria-label="다음 달" onClick={nextMonth} className="inline-flex size-7 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs">
          {WEEKDAYS.map((day, index) => <span key={day} className={`flex size-7 items-center justify-center ${index === 0 ? "text-rose-500 dark:text-rose-400" : index === 6 ? "text-sky-500 dark:text-sky-400" : "text-[var(--muted-foreground)]"}`}>{day}</span>)}
          {cells.map((date, index) => date
            ? <button key={dateKey(date)} type="button" title={holidayName(dateKey(date)) || undefined} aria-label={`${dateKey(date)}${holidayName(dateKey(date)) ? `, ${holidayName(dateKey(date))}` : ""}`} aria-pressed={dateKey(date) === selectedKey} onClick={() => commit(dateKey(date))} className={`inline-flex size-7 items-center justify-center rounded text-xs transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${dateKey(date) === selectedKey ? "bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]" : dateKey(date) === todayKey ? "font-semibold text-[var(--primary)]" : dayToneText(date)}`}>{date.getDate()}</button>
            : <span key={`blank-${index}`} aria-hidden="true" className="size-7" />)}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
          <button type="button" onClick={() => commit(todayKey)} className="rounded px-2 py-1 text-xs text-[var(--primary)] transition-colors hover:bg-[var(--muted)]">오늘</button>
          <button type="button" onClick={() => commit("")} className="rounded px-2 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]">지우기</button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}

function DateValuePreview({ raw, className = "" }: { raw: string; className?: string }) {
  if (!raw.trim()) return null
  const normalized = normalizeDateInput(raw)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(normalized) && localDate(normalized) !== null
  return <span className={`text-[10px] leading-tight ${valid ? "text-[var(--muted-foreground)]" : "text-[var(--destructive)]"} ${className}`}>{valid ? normalized : "형식 확인"}</span>
}

/** 모달 날짜 필드도 수기 입력, 포털 캘린더, 저장값 미리보기를 함께 제공한다. */
function DateInput({ value, disabled, invalid, onChange }: { value: string; disabled?: boolean; invalid?: boolean; onChange: (raw: string) => void }) {
  // 저장된 YYYY-MM-DD를 그대로 초기화해야 과거 연도가 Enter만으로 올해로 바뀌지 않는다.
  const [raw, setRaw] = useState(value)
  useEffect(() => {
    if (value !== normalizeDateInput(raw)) setRaw(value)
  }, [value, raw])
  const change = (next: string) => {
    setRaw(next)
    onChange(next)
  }
  return <div className="grid min-w-0 gap-1">
    <div className={`flex h-9 min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] transition-colors focus-within:ring-2 focus-within:ring-[var(--ring)] ${invalid ? "ring-1 ring-[var(--destructive)]" : ""}`}>
      <input type="text" value={raw} disabled={disabled} aria-invalid={invalid} onChange={(event) => change(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-40" />
      <DatePickerPopover value={raw} disabled={disabled} invalid={invalid} onChange={change} iconOnly triggerClassName="h-full w-9 shrink-0 justify-center border-l border-[var(--border)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]" />
    </div>
    <DateValuePreview raw={raw} />
  </div>
}

function EditorField({ column, draft, onChange, optionsById, requiredIds, readOnly = false }: { column: MasterColumn; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; requiredIds?: ReadonlySet<string>; readOnly?: boolean }) {
  const value = String(column.value(draft, null) ?? "")
  const computed = COMPUTED_COLUMN_IDS.has(column.id)
  const disabled = readOnly || computed
  const required = requiredIds?.has(column.id) ?? false
  const invalid = required && !value.trim()
  const set = (raw: string) => onChange(updateRecordCell(draft, column, raw))
  const baseOptions = optionsById[column.id] ?? column.options
  // 작지 자동 채움 값이 정규 목록에 없어도 드롭다운에 표시되도록 앞에 끼워 넣는다.
  const options = baseOptions && value && !baseOptions.includes(value) ? [value, ...baseOptions] : baseOptions
  const invalidClass = invalid ? "ring-1 ring-[var(--destructive)]" : ""
  const label = <Label className="truncate text-xs text-[var(--muted-foreground)]">{column.label}{required ? <span className="text-[var(--destructive)]"> *</span> : null}{computed ? " ·수식" : ""}</Label>
  if (column.date) return <div className="grid min-w-0 gap-1">{label}<DateInput value={value} disabled={disabled} invalid={invalid} onChange={set} /></div>
  if (options && options.length && !column.suggest) return <div className="grid min-w-0 gap-1">{label}<Select value={value || ALL} onValueChange={(next) => set(next === ALL ? "" : next)} disabled={disabled}><SelectTrigger aria-invalid={invalid} className={`text-sm ${invalidClass}`}><SelectValue placeholder="선택" /></SelectTrigger><SelectContent><SelectItem value={ALL}>미입력</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
  if (column.suggest) return <div className="grid min-w-0 gap-1">{label}<Input list={`dl-${column.id}`} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${invalidClass}`} /><datalist id={`dl-${column.id}`}>{(options ?? []).map((option) => <option key={option} value={option} />)}</datalist></div>
  return <div className="grid min-w-0 gap-1">{label}<Input type={column.number ? "number" : "text"} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${disabled ? "bg-[var(--muted)]" : ""} ${invalidClass}`} /></div>
}

/** 에디터 병합 단위 카드(공정·단계). 같은 sub 필드를 한 박스로 묶어 엑셀 병합셀처럼 보이게 한다. */
function SubCard({ label, color, columns, draft, onChange, optionsById, requiredIds, readOnly }: { label: string; color?: string; columns: MasterColumn[]; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; requiredIds?: ReadonlySet<string>; readOnly?: boolean }) {
  return <div className="rounded-md border border-[var(--border)] p-2.5" style={color ? { background: `color-mix(in srgb, ${color} 6%, var(--card))`, borderColor: `color-mix(in srgb, ${color} 30%, var(--border))` } : undefined}><p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide" style={color ? { color } : undefined}>{label}</p><div className="grid grid-cols-2 gap-2">{columns.map((column) => <EditorField key={column.id} column={column} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} readOnly={readOnly} />)}</div></div>
}

/** 그리드에서 Status 를 색 블럭 칩으로 바로 바꾼다(변경 즉시 저장). */
function StatusChip({ record, disabled }: { record: DevRecord; disabled?: boolean }) {
  const current = record.devStatus || record.stage || ""
  const style = ddStatusStyle(current)
  const selected = DD_STATUS_OPTIONS.includes(current as (typeof DD_STATUS_OPTIONS)[number]) ? current : undefined
  const change = (next: string) => { if (!disabled) void saveDevelopmentRecord({ ...record, devStatus: next }, recordIdentity(record)) }
  return <Select value={selected} onValueChange={change} disabled={disabled}>
    <SelectTrigger className={`h-6 w-full gap-1 rounded-md border-0 px-2 text-[11px] font-normal shadow-none focus:ring-1 focus:ring-[var(--ring)] ${style.block}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <SelectValue placeholder={style.label} />
    </SelectTrigger>
    <SelectContent>{DD_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
  </Select>
}

const LEDGER_COL_IDS = new Set(["ledgerStatus", "storageNo", "sourceSheet", "ledgerUpdated"])
/** 고정값(수식·샘플대장 연결)은 그리드에서 직접 수정하지 않는다. */
const isFixedColumn = (column: MasterColumn): boolean => COMPUTED_COLUMN_IDS.has(column.id) || LEDGER_COL_IDS.has(column.id)

function InlineDateEditor({ initialValue, onCommit, onCancel }: { initialValue: string; onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void; onCancel: () => void }) {
  // 저장된 전체 날짜를 초기값으로 보존하므로, 손대지 않고 Enter를 눌러도 연도가 바뀌지 않는다.
  const [raw, setRaw] = useState(initialValue)
  const editorRef = useRef<HTMLDivElement>(null)
  const chooseDate = (next: string) => {
    setRaw(next)
    onCommit(next)
  }
  return <div ref={editorRef} className="relative flex h-8 min-w-0 bg-[var(--card)] ring-2 ring-inset ring-[var(--ring)]">
    <input autoFocus type="text" value={raw} onChange={(event) => setRaw(event.target.value)} onBlur={(event) => {
      const next = event.relatedTarget
      if (next instanceof Node && editorRef.current?.contains(next)) return
      onCommit(event.currentTarget.value)
    }} className="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1.5 text-xs text-[var(--foreground)] outline-none" onKeyDown={(event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
      else if (event.key === "Escape") { event.preventDefault(); onCancel() }
      else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
      }
    }} />
    <DatePickerPopover value={raw} onChange={chooseDate} iconOnly triggerClassName="h-8 w-8 shrink-0 justify-center border-l border-[var(--border)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]" />
    <DateValuePreview raw={raw} className="absolute left-1 top-[calc(100%+2px)] z-[65] whitespace-nowrap rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 shadow-sm" />
  </div>
}

/** 그리드 셀 인라인 편집기. 선택형=드롭다운, 날짜=데이트피커, 그 외=수기(제안 목록 포함). */
function InlineEditor({ record, column, options, initial, onCommit, onCancel }: { record: DevRecord; column: MasterColumn; options?: readonly string[]; initial?: string; onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void; onCancel: () => void }) {
  const value = String(column.value(record, null) ?? "")
  const initialValue = initial ?? value
  const cls = "h-8 w-full rounded-none border-0 bg-[var(--card)] px-1.5 text-xs text-[var(--foreground)] outline-none ring-2 ring-inset ring-[var(--ring)]"
  const opts = options && options.length ? options : undefined
  if (column.date) return <InlineDateEditor initialValue={initialValue} onCommit={onCommit} onCancel={onCancel} />
  if (initial !== undefined) {
    return <input autoFocus type={column.number ? "number" : "text"} defaultValue={initialValue} className={cls} onBlur={(event) => onCommit(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
      else if (event.key === "Escape") { event.preventDefault(); onCancel() }
      else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
      }
    }} />
  }
  if (opts && !column.suggest) {
    return <select autoFocus defaultValue={initialValue} className={cls} onChange={(event) => onCommit(event.target.value)} onBlur={onCancel} onKeyDown={(event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
      else if (event.key === "Escape") { event.preventDefault(); onCancel() }
      else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
      }
    }}>
      <option value="">—</option>
      {initialValue && !opts.includes(initialValue) ? <option value={initialValue}>{initialValue}</option> : null}
      {opts.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  }
  const listId = `inline-${column.id}`
  return <><input autoFocus type={column.number ? "number" : "text"} defaultValue={initialValue} list={column.suggest ? listId : undefined} className={cls} onBlur={(event) => onCommit(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
    else if (event.key === "Escape") { event.preventDefault(); onCancel() }
    else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
    }
  }} />{column.suggest && opts ? <datalist id={listId}>{opts.map((option) => <option key={option} value={option} />)}</datalist> : null}</>
}

/** 데이터 셀. 더블클릭 시 인라인 편집(고정값은 음영·수정 불가). */
/**
 * 그리드 액션 묶음. 참조가 매 렌더 바뀌지 않아야 GridCell 의 memo 가 살아 있다.
 * 부모에서 ref 위임으로 한 번만 만들고 최신 상태는 ref 로 읽는다.
 */
interface GridActions {
  select: (rowId: string, colId: string) => void
  edit: (rowId: string, colId: string) => void
  commit: (record: DevRecord, column: MasterColumn, raw: string, move?: CellMove, fillRange?: boolean) => void
  cancel: () => void
  contextMenu: (event: ReactMouseEvent<HTMLTableCellElement>, rowId: string, colId: string) => void
  fillStart: (event: ReactMouseEvent<HTMLSpanElement>) => void
}

interface GridCellProps {
  record: DevRecord
  column: MasterColumn
  rowId: string
  width: number
  ledger: FabricLedgerItem | null
  active: boolean
  selIn: boolean
  selActive: boolean
  selTop: boolean
  selBottom: boolean
  selLeft: boolean
  selRight: boolean
  selHandle: boolean
  selMoveEdge: boolean
  fillPreview: boolean
  dimmed: boolean
  moveStyle?: CSSProperties
  options?: readonly string[]
  editSeed?: string
  editEnabled: boolean
  actions: GridActions
}

/**
 * 선택이 한 칸 움직일 때 표 전체가 다시 그려지지 않도록 memo 로 감싼다.
 * 그래서 props 는 전부 원시값이거나 참조가 고정된 값이어야 한다(CellSel 객체를 그대로 넘기면 memo 가 깨진다).
 */
const GridCell = memo(function GridCell({ record, column, rowId, width, ledger, active, selIn, selActive, selTop, selBottom, selLeft, selRight, selHandle, selMoveEdge, fillPreview, dimmed, moveStyle, options, editSeed, editEnabled, actions }: GridCellProps) {
  const sel: CellSel = { inRange: selIn, isActive: selActive, top: selTop, bottom: selBottom, left: selLeft, right: selRight, handle: selHandle, moveEdge: selMoveEdge }
  const onSelect = () => actions.select(rowId, column.id)
  const onEdit = () => actions.edit(rowId, column.id)
  const onCommit = (raw: string, move?: CellMove, fillRange?: boolean) => actions.commit(record, column, raw, move, fillRange)
  const onCancel = () => actions.cancel()
  const onContextMenu = (event: ReactMouseEvent<HTMLTableCellElement>) => actions.contextMenu(event, rowId, column.id)
  const onFillStart = actions.fillStart
  const fixed = isFixedColumn(column)
  const align = `${alignOf(column) === "center" ? "text-center" : "text-left"} ${column.number ? "tabular-nums" : ""}`
  const highlight = sel.inRange && !sel.isActive ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,transparent)]" : ""
  // 종료된 행의 회색은 클래스로는 다른 배경 클래스에 밀리므로 인라인으로 덮는다. 글자색은 건드리지 않는다.
  const dimStyle = dimmed && !sel.inRange ? { backgroundColor: DIMMED_ROW_BG } : null
  // 셀마다 도는 코드다. 대상 열일 때만 column.value 를 부른다(전체 셀이 5천 개 규모).
  const companyValue = COMPANY_COLOR_COLUMN_IDS.has(column.id) ? String(column.value(record, ledger) ?? "").trim() : ""
  const companyColorStyle = companyValue && !sel.inRange
    ? { backgroundColor: `color-mix(in srgb, ${/gd/i.test(companyValue) ? "#a78bfa" : "#6ee7b7"} 18%, var(--card))` }
    : null
  const selectionStyle = { width, minWidth: width, boxShadow: selectionShadow(sel), cursor: sel.moveEdge ? "move" : undefined, ...moveStyle, ...companyColorStyle, ...dimStyle }
  if (editEnabled && active && !fixed) {
    return <td data-col-id={column.id} onClick={(event) => { if (!event.shiftKey) onSelect() }} className={`relative h-8 border-b border-r border-[var(--border)] p-0 ${align} ${highlight} ${fillPreview ? "outline outline-1 outline-dashed outline-[var(--grid-selection)]" : ""}`} style={selectionStyle}><InlineEditor record={record} column={column} options={options} initial={editSeed} onCommit={onCommit} onCancel={onCancel} /><FillHandle visible={editEnabled && sel.handle} onMouseDown={onFillStart} /></td>
  }
  const content = column.render ? column.render(record, ledger) : column.date ? dateText(column.value(record, ledger)) : text(column.value(record, ledger))
  return <td data-col-id={column.id} title={typeof content === "string" ? content : undefined} onClick={(event) => { if (!event.shiftKey) onSelect() }} onContextMenu={onContextMenu} onDoubleClick={fixed || !editEnabled ? undefined : onEdit} className={`relative h-8 max-w-0 truncate border-b border-r border-[var(--border)] px-2 text-xs font-normal ${column.mono ? "font-mono" : ""} ${align} ${highlight} ${fillPreview ? "outline outline-1 outline-dashed outline-[var(--grid-selection)]" : ""} ${fixed ? `${sel.inRange ? "" : "bg-[color-mix(in_srgb,var(--muted)_30%,transparent)]"} text-[var(--muted-foreground)]` : editEnabled ? "cursor-cell hover:bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]" : ""}`} style={selectionStyle}>{content}<FillHandle visible={editEnabled && sel.handle} onMouseDown={onFillStart} /></td>
})

function EditorGroup({ label, color, columns, draft, onChange, optionsById, layout, requiredIds, readOnly }: { label: string; color?: string; columns: MasterColumn[]; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; layout?: "schedule" | "data"; requiredIds?: ReadonlySet<string>; readOnly?: boolean }) {
  const accent = color ?? "var(--muted-foreground)"
  const blocks = groupSubBlocks(columns)
  const field = (column: MasterColumn) => <EditorField key={column.id} column={column} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} readOnly={readOnly} />

  let body: ReactNode
  if (layout === "schedule") {
    // 공정별: 소제목을 카드 밖 왼쪽에 두고, 업체·완료일만 담은 작은 박스.
    body = <div className="grid gap-x-4 gap-y-2.5 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {blocks.map((block, index) => <div key={index} className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-[13px] font-bold leading-tight" style={{ color: accent }}>{block.sub}</span>
        <div className="grid flex-1 grid-cols-2 gap-2 rounded-md border p-2" style={{ borderColor: `color-mix(in srgb, ${accent} 30%, var(--border))`, background: `color-mix(in srgb, ${accent} 5%, var(--card))` }}>{block.columns.map(field)}</div>
      </div>)}
    </div>
  } else if (layout === "data") {
    // DATA: 엑셀처럼 한 줄에 모두. 소제목은 카드 밖 상단(가독성 위해 진하게).
    const labelColor = `color-mix(in srgb, ${accent} 55%, var(--foreground))`
    body = <div className="flex items-start gap-3 overflow-x-auto p-3">
      {blocks.map((block, index) => <div key={index} className="shrink-0">
        <p className="mb-1.5 flex items-center gap-1 whitespace-nowrap text-[13px] font-bold" style={{ color: labelColor }}><span className="inline-block h-3.5 w-1 rounded-full" style={{ background: accent }} />{block.sub}</p>
        <div className="flex gap-1">{block.columns.map((column) => <div key={column.id} className="w-16 shrink-0">{field(column)}</div>)}</div>
      </div>)}
    </div>
  } else {
    body = <div className="gap-2 p-3 [column-fill:balance] sm:columns-2 lg:columns-3 xl:columns-4">
      {blocks.map((block, index) => block.sub
        ? <div key={`${block.sub}-${index}`} className="mb-2 break-inside-avoid"><SubCard label={block.sub} color={color} columns={block.columns} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} readOnly={readOnly} /></div>
        : block.columns.map((column) => <div key={column.id} className="mb-2 break-inside-avoid">{field(column)}</div>))}
    </div>
  }

  return <section className="overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: `color-mix(in srgb, ${accent} 35%, var(--border))` }}>
    <h3 className="border-b px-3 py-2 text-sm font-semibold" style={{ color: accent, borderLeft: `4px solid ${accent}`, borderBottomColor: `color-mix(in srgb, ${accent} 25%, var(--border))`, background: `color-mix(in srgb, ${accent} 10%, var(--card))` }}>{label}</h3>
    {body}
  </section>
}

export function DevelopmentMasterSheet({ categoryScope = null }: { categoryScope?: string | null }) {
  const records = useAppStore((state) => state.records)
  const saveState = useAppStore((state) => state.recordsSaveState)
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides), [overrides, records, samples])
  const ledgerByRecord = useMemo(() => new Map(ledger.flatMap((item) => item.record ? [[recordIdentity(item.record), item] as const] : [])), [ledger])
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN)
  const [finishingOpen, setFinishingOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [owner, setOwner] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [sortBy, setSortBy] = useState<{ col: string; dir: "asc" | "desc" } | null>(null)
  // 담당 탭에서 완료·DROP·REJECT 를 감출지. 전체 탭은 항상 감춘다.
  const [hideClosed, setHideClosed] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [findValue, setFindValue] = useState("")
  const [replaceValue, setReplaceValue] = useState("")
  const [replaceScope, setReplaceScope] = useState<"selection" | "all">("selection")
  const [replaceMatchCase, setReplaceMatchCase] = useState(false)
  const [editing, setEditing] = useState<DevRecord | null>(null)      // 수정(전체 64열) 모드
  const [intake, setIntake] = useState<DevRecord[] | null>(null)      // 신규 접수 모드(옵션별 레코드)
  const [intakeOpt, setIntakeOpt] = useState(0)
  const [intakeError, setIntakeError] = useState<string | null>(null)
  const [attached, setAttached] = useState<Zaji | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [savingIntake, setSavingIntake] = useState(false)
  const [intakeNotice, setIntakeNotice] = useState<string | null>(null)
  const [recentIntakeRows, setRecentIntakeRows] = useState<Set<string>>(() => new Set())
  const [editCell, setEditCell] = useState<{ row: string; col: string } | null>(null)
  const [editSeed, setEditSeed] = useState<string | undefined>(undefined)
  const [range, setRange] = useState<{ anchor: CellRef; focus: CellRef } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "cells" | "bottom" } | null>(null)          // 우클릭 메뉴 위치
  const [undoStack, setUndoStack] = useState<DevRecord[][]>([])
  const [redoStack, setRedoStack] = useState<DevRecord[][]>([])
  const [clipNotice, setClipNotice] = useState<string | null>(null)
  const clipRef = useRef<{ text: string; cut: boolean } | null>(null)              // 브라우저 클립보드 차단 시 대체 버퍼
  const cutRangeRef = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null)
  const selectingRef = useRef(false)
  const rowSelectingRef = useRef(false)
  const fillDragRef = useRef<{ source: CellRect } | null>(null)
  const fillPreviewRef = useRef<CellRect | null>(null)
  const [fillPreview, setFillPreview] = useState<CellRect | null>(null)
  const moveDragRef = useRef<MoveDrag | null>(null)
  const movePreviewRef = useRef<CellRect | null>(null)
  const [movePreview, setMovePreview] = useState<CellRect | null>(null)
  const [moveHover, setMoveHover] = useState<{ row: string; col: string | null } | null>(null)
  const lastDragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const dragAutoScrollFrameRef = useRef<number | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColumnWidths)
  const [confirmDelete, setConfirmDelete] = useState<DevRecord[] | null>(null)  // 행 삭제 확인
  const zajiInputRef = useRef<HTMLInputElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const pushUndoSnapshot = (snapshot: DevRecord[]) => {
    setUndoStack((current) => [...current, snapshot].slice(-50))
    setRedoStack([])
  }

  useEffect(() => () => resizeCleanupRef.current?.(), [])
  // 화면을 떠날 때 지연 중인 저장을 반드시 내보낸다(편집 유실 방지).
  useEffect(() => () => { void flushDevelopmentRecords() }, [])

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("table[data-dd-master-grid]")) return
      // 포털로 열린 메뉴·대화상자·달력·선택 목록을 누를 때는 작업 중인 선택을 보존한다.
      if (target.closest('[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper], [data-slot="dialog-content"]')) return
      setRange(null)
      setMenu(null)
    }
    document.addEventListener("mousedown", onDocumentMouseDown)
    return () => document.removeEventListener("mousedown", onDocumentMouseDown)
  }, [])

  const scoped = useMemo(() => categoryScope ? records.filter((row) => row.category === categoryScope) : records, [categoryScope, records])
  const ownerOptions = useMemo(() => [...new Set(scoped.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko-KR")), [scoped])
  // 메인 담당별 개발 건수(진행중·전체)와 팀 전체 합계. 네임카드에 표시하고, 클릭하면 담당 필터로 이어진다.
  const ownerStats = useMemo(() => {
    const byOwner = new Map<string, { total: number; active: number }>(MAIN_DEVELOPERS.map((name) => [name, { total: 0, active: 0 }]))
    const all = { total: 0, active: 0 }
    for (const row of scoped) {
      const active = (row.devStatus || row.stage) === "진행중"
      all.total += 1
      if (active) all.active += 1
      const stat = byOwner.get(row.owner)
      if (!stat) continue
      stat.total += 1
      if (active) stat.active += 1
    }
    return { byOwner, all }
  }, [scoped])
  const statusOptions = useMemo(() => [...new Set([...DD_STATUS_OPTIONS, ...scoped.map((row) => row.devStatus || row.stage).filter(Boolean)])], [scoped])
  const allColumns = useMemo(() => [...PINNED_COLUMNS, ...GROUPS.flatMap((group) => group.columns)], [])
  const optionsById = useMemo<Record<string, readonly string[]>>(() => {
    const memberNames = MEMBERS.map((member) => member.name)
    const distinct = (get: (record: DevRecord) => unknown) => [...new Set(records.map((record) => (get(record) == null ? "" : String(get(record))).trim()).filter(Boolean))]
    const union = (base: readonly string[], values: string[]) => [...new Set([...base, ...values])]
    const sortKo = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true }))
    return {
      season: union(DD_SEASON_OPTIONS, sortKo(distinct((record) => record.season))),
      category: union(DD_CATEGORY_OPTIONS, distinct((record) => record.category)),
      co: union(DD_COMPANY_OPTIONS, distinct((record) => record.tech?.development?.co || record.devType)),
      dyeing: union(DD_DYEING_OPTIONS, distinct((record) => record.dyeing)),
      passFail: union(DD_PASS_FAIL_OPTIONS, distinct((record) => record.tech?.passFail)),
      owner: union(memberNames, distinct((record) => record.owner)),
      developer: union(memberNames, distinct((record) => record.tech?.development?.developer || record.owner)),
      buyer: sortKo(distinct((record) => record.buyer)),
      planner: sortKo(distinct((record) => record.planner)),
    }
  }, [records])
  const visibleGroups = GROUPS
    .filter((group) => openGroups[group.key])
    .map((group) => group.key === "detail" && !finishingOpen
      ? { ...group, columns: group.columns.filter((column) => !FINISHING_COLUMN_IDS.has(column.id)) }
      : group)
  const displayedColumns = [...PINNED_COLUMNS, ...visibleGroups.flatMap((group) => group.columns)]
  const editingLedger = editing ? ledgerByRecord.get(recordIdentity(editing)) ?? null : null

  const compareColumnRows = (left: DevRecord, right: DevRecord, column: MasterColumn): number => {
    const leftValue = column.value(left, ledgerByRecord.get(recordIdentity(left)) ?? null)
    const rightValue = column.value(right, ledgerByRecord.get(recordIdentity(right)) ?? null)
    const blank = (value: CellValue) => value === null || value === undefined || String(value).trim() === ""
    if (blank(leftValue) || blank(rightValue)) return blank(leftValue) === blank(rightValue) ? 0 : blank(leftValue) ? 1 : -1
    if (column.number) {
      const a = Number(leftValue), b = Number(rightValue)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) === Number.isFinite(b) ? 0 : Number.isFinite(a) ? -1 : 1
      return a - b
    }
    if (column.date) {
      const a = toDate(String(leftValue))?.getTime(), b = toDate(String(rightValue))?.getTime()
      if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
      return a - b
    }
    return String(leftValue).localeCompare(String(rightValue), "ko-KR", { numeric: true })
  }

  // 기본 순서(수동 순서 → 접수일 오래된 순). 방금 접수한 행 강조는 여기에 반영하지 않는다.
  const ordered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    const rows = scoped.filter((record) => {
      if (owner !== ALL && record.owner !== owner) return false
      // 전체 탭은 진행 중인 건만 본다. 담당 탭은 숨김을 켰을 때만 감춘다.
      if ((owner === ALL || hideClosed) && status === ALL && isClosedRecord(record)) return false
      if (status !== ALL && (record.devStatus || record.stage) !== status) return false
      if (!query) return true
      const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
      return allColumns.some((column) => String(column.value(record, linked) ?? "").toLocaleLowerCase("ko-KR").includes(query))
        || String(record.tech?.development?.developer ?? "").toLocaleLowerCase("ko-KR").includes(query)
    }).map((record, index) => ({ record, index }))
    const sortColumn = sortBy ? allColumns.find((column) => column.id === sortBy.col) : undefined
    return rows
      .sort((a, b) => {
        if (sortBy && sortColumn) {
          const order = compareColumnRows(a.record, b.record, sortColumn)
          if (order) {
            const aValue = sortColumn.value(a.record, ledgerByRecord.get(recordIdentity(a.record)) ?? null)
            const bValue = sortColumn.value(b.record, ledgerByRecord.get(recordIdentity(b.record)) ?? null)
            const hasBlank = aValue === null || aValue === undefined || String(aValue).trim() === "" || bValue === null || bValue === undefined || String(bValue).trim() === ""
            return hasBlank ? order : sortBy.dir === "asc" ? order : -order
          }
        }
        return sortBy ? a.index - b.index : compareManualOrder(a.record, b.record) || a.index - b.index
      })
      .sort((a, b) => {
        // 담당 탭에서는 끝난 건을 위로 모은다. 상태를 바꾸는 즉시 자리가 올라간다.
        if (owner === ALL || hideClosed) return 0
        return Number(isClosedRecord(b.record)) - Number(isClosedRecord(a.record))
      })
      .map(({ record }) => record)
  }, [allColumns, hideClosed, ledgerByRecord, owner, scoped, search, sortBy, status])

  // 필터를 걷어낸 전체 순서. 담당별 재배치를 저장할 때 다른 담당 행의 자리를 지키는 기준이 된다.
  const globalOrdered = useMemo(() => scoped
    .map((record, index) => ({ record, index }))
    .sort((a, b) => compareManualOrder(a.record, b.record) || a.index - b.index)
    .map(({ record }) => record), [scoped])

  // 전체 보기에서는 행 이동을 막고, 담당을 고른 상태에서만 그 담당의 행을 재배치한다.
  const dragEnabled = owner !== ALL && sortBy === null
  const editEnabled = owner !== ALL

  /**
   * 화면 표시 순서. 방금 접수한 행만 확인하기 쉽도록 잠시 맨 위로 끌어올린다.
   * recentIntakeRows 는 저장하지 않는 화면 상태라, 새로고침하면 기본 순서(맨 아래)로 돌아간다.
   */
  const filtered = useMemo(() => {
    if (!recentIntakeRows.size) return ordered
    const recent: DevRecord[] = []
    const rest: DevRecord[] = []
    for (const record of ordered) (recentIntakeRows.has(recordIdentity(record)) ? recent : rest).push(record)
    return [...recent, ...rest]
  }, [ordered, recentIntakeRows])

  const widthOf = (column: MasterColumn) => colWidths[column.id] ?? column.width
  const startColumnResize = (column: MasterColumn, event: ReactMouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = widthOf(column)
    const previousUserSelect = document.body.style.userSelect
    let nextWidths = { ...colWidths }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const width = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX)
      nextWidths = { ...nextWidths, [column.id]: width }
      setColWidths(nextWidths)
    }
    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", cleanup)
      document.body.style.userSelect = previousUserSelect
      saveColumnWidths(nextWidths)
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", cleanup)
    resizeCleanupRef.current = cleanup
  }
  // 상단 대분류(고정 핵심·개발 REQUEST 등) 헤더 오른쪽 끝을 끌면 그룹 내 열 너비를 비율대로 함께 조절한다.
  const startGroupResize = (columns: MasterColumn[], event: ReactMouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidths = columns.map((column) => widthOf(column))
    const startTotal = startWidths.reduce((sum, width) => sum + width, 0)
    const minTotal = columns.length * MIN_COLUMN_WIDTH
    const previousUserSelect = document.body.style.userSelect
    let nextWidths = { ...colWidths }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const targetTotal = Math.max(minTotal, startTotal + moveEvent.clientX - startX)
      const factor = targetTotal / startTotal
      const patch: Record<string, number> = {}
      columns.forEach((column, index) => { patch[column.id] = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidths[index] * factor)) })
      nextWidths = { ...nextWidths, ...patch }
      setColWidths(nextWidths)
    }
    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", cleanup)
      document.body.style.userSelect = previousUserSelect
      saveColumnWidths(nextWidths)
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", cleanup)
    resizeCleanupRef.current = cleanup
  }
  const resetColumnWidths = () => {
    resizeCleanupRef.current?.()
    setColWidths({})
    try { window.localStorage.removeItem(COL_WIDTHS_STORAGE_KEY) } catch { /* 저장소를 사용할 수 없어도 기본 너비로 초기화한다. */ }
  }

  // 핀 고정 열도 너비 조절 대상이므로 sticky left 오프셋을 현재 너비로 계산한다.
  const pinnedLeft = (index: number) => ROW_HEADER_WIDTH + PINNED_COLUMNS.slice(0, index).reduce((sum, column) => sum + widthOf(column), 0)
  const pinnedTotal = PINNED_COLUMNS.reduce((sum, column) => sum + widthOf(column), 0)

  const stopDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) window.cancelAnimationFrame(dragAutoScrollFrameRef.current)
    dragAutoScrollFrameRef.current = null
    lastDragPointerRef.current = null
  }
  const startDragAutoScroll = (clientX: number, clientY: number) => {
    lastDragPointerRef.current = { x: clientX, y: clientY }
    if (dragAutoScrollFrameRef.current !== null) return
    const tick = () => {
      dragAutoScrollFrameRef.current = null
      const pointer = lastDragPointerRef.current
      const moveDrag = moveDragRef.current
      const dragActive = Boolean(moveDrag || fillDragRef.current || rowSelectingRef.current || selectingRef.current)
      if (!pointer || !dragActive) return
      const scroller = document.querySelector<HTMLElement>("[data-route-scroll-root]")
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        if (pointer.y < box.top + 48) scroller.scrollTop -= 16
        else if (pointer.y > box.bottom - 48) scroller.scrollTop += 16
        const wholeRowDrag = moveDrag?.wholeRows === true || rowSelectingRef.current
        if (!wholeRowDrag && pointer.x < box.left + 80) scroller.scrollLeft -= 16
        else if (!wholeRowDrag && pointer.x > box.right - 48) scroller.scrollLeft += 16
      }
      // 스크롤 뒤 포인터 아래 대상을 매 프레임 다시 찾아, 마우스가 멈춰도 선택·미리보기를 확장한다.
      gridMouseRef.current.moveAt(pointer.x, pointer.y)
      dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
  }

  /**
   * 행 머리글(좌측 번호 칸)에서는 행 전체 선택을, 데이터 셀에서는 범위 선택을 한다.
   * 엑셀의 행 머리글/셀 구분과 같은 방식이다.
   */
  const onRowMouseDown = (rowId: string, event: ReactMouseEvent<HTMLTableRowElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest("button, input, select, textarea, a, [role=\"button\"]")) return
    if (startSelectionMove(event)) return
    if (target.closest("[data-row-header]")) {
      event.preventDefault()
      selectWholeRow(rowId, event.shiftKey)
      rowSelectingRef.current = true
      selectingRef.current = false
      startDragAutoScroll(event.clientX, event.clientY)
      setMenu(null)
      return
    }
    const cell = target.closest("td[data-col-id]")
    const colId = cell?.getAttribute("data-col-id") ?? null
    if (!colId) return
    if (event.shiftKey) extendTo(rowId, colId)
    else setCellAnchor(rowId, colId)
    selectingRef.current = true
    startDragAutoScroll(event.clientX, event.clientY)
    setMenu(null)
  }

  const updateDragAt = (clientX: number, clientY: number) => {
    const moveDrag = moveDragRef.current
    if (moveDrag) {
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
      const rowElement = target?.closest<HTMLElement>("tr[data-row-id]")
      const rowId = rowElement?.dataset.rowId
      const row = rowId ? rowIndexOf.get(rowId) : undefined
      const cell = target?.closest<HTMLTableCellElement>("td[data-col-id]")
      const colId = cell?.dataset.colId
      const col = colId ? colIndexOf.get(colId) : undefined
      if (row !== undefined && (moveDrag.wholeRows || col !== undefined)) {
        const height = moveDrag.source.bottom - moveDrag.source.top + 1
        const width = moveDrag.source.right - moveDrag.source.left + 1
        const top = Math.max(0, Math.min(filtered.length - height, row - moveDrag.grabRow))
        const left = moveDrag.wholeRows ? 0 : Math.max(0, Math.min(displayedColumns.length - width, (col as number) - moveDrag.grabCol))
        const next = { top, bottom: top + height - 1, left, right: left + width - 1 }
        movePreviewRef.current = next
        setMovePreview(next)
      }
      return
    }
    const fillDrag = fillDragRef.current
    if (fillDrag) {
      const cell = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest("td[data-col-id]")
      const colId = cell?.getAttribute("data-col-id")
      const rowId = cell?.closest("tr[data-row-id]")?.getAttribute("data-row-id")
      const row = rowId ? rowIndexOf.get(rowId) : undefined
      const col = colId ? colIndexOf.get(colId) : undefined
      if (row === undefined || col === undefined) return
      const source = fillDrag.source
      const down = Math.max(0, row - source.bottom)
      const right = Math.max(0, col - source.right)
      const next = !down && !right ? source : down >= right ? { ...source, bottom: row } : { ...source, right: col }
      fillPreviewRef.current = next
      setFillPreview(next)
      return
    }
    if (rowSelectingRef.current) {
      const row = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest("tr[data-row-id]")
      const rowId = row?.getAttribute("data-row-id")
      if (rowId) selectWholeRow(rowId, true)
      return
    }
    if (selectingRef.current) {
      const cell = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest("td[data-col-id]")
      const colId = cell?.getAttribute("data-col-id")
      const rowId = cell?.closest("tr[data-row-id]")?.getAttribute("data-row-id")
      if (colId && rowId) extendTo(rowId, colId)
      return
    }
  }
  const onMove = (event: MouseEvent) => {
    lastDragPointerRef.current = { x: event.clientX, y: event.clientY }
    updateDragAt(event.clientX, event.clientY)
  }
  const onUp = () => {
    // mouseup 에서 rAF를 먼저 취소해 포인터를 놓은 뒤 스크롤이 남지 않게 한다.
    stopDragAutoScroll()
    const moveDrag = moveDragRef.current
    const moveTarget = movePreviewRef.current
    if (moveDrag) {
      moveDragRef.current = null
      movePreviewRef.current = null
      setMovePreview(null)
      document.body.style.cursor = ""
      if (moveTarget) void commitSelectionMove(moveDrag, moveTarget)
      return
    }
    const fillDrag = fillDragRef.current
    const preview = fillPreviewRef.current
    if (fillDrag) {
      fillDragRef.current = null
      fillPreviewRef.current = null
      setFillPreview(null)
      if (preview) void commitFill(fillDrag.source, preview)
      return
    }
    selectingRef.current = false
    rowSelectingRef.current = false
  }
  // 핸들러는 매 렌더 최신으로 바뀌지만, 리스너 등록·해제는 1회만 한다(매 렌더 재등록은 비용이 크다).
  const gridMouseRef = useRef({ move: onMove, moveAt: updateDragAt, up: onUp })
  gridMouseRef.current = { move: onMove, moveAt: updateDragAt, up: onUp }
  useEffect(() => {
    const move = (event: MouseEvent) => gridMouseRef.current.move(event)
    const up = () => gridMouseRef.current.up()
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      // 언마운트에서도 예약 프레임을 취소해 화면을 떠난 뒤 루프가 남지 않게 한다.
      stopDragAutoScroll()
    }
  }, [])

  // ── 셀 범위 선택 · 엑셀식 복사/붙여넣기 ────────────────────────────────
  const rowIndexOf = useMemo(() => new Map(filtered.map((record, index) => [recordIdentity(record), index])), [filtered])
  const colIndexOf = useMemo(() => new Map(displayedColumns.map((column, index) => [column.id, index])), [displayedColumns])

  /** 선택 사각형(행·열 인덱스). 앵커와 포커스 사이를 모두 포함한다. */
  const rect = useMemo(() => {
    if (!range) return null
    const r1 = rowIndexOf.get(range.anchor.row), r2 = rowIndexOf.get(range.focus.row)
    const c1 = colIndexOf.get(range.anchor.col), c2 = colIndexOf.get(range.focus.col)
    if (r1 === undefined || r2 === undefined || c1 === undefined || c2 === undefined) return null
    return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: Math.min(c1, c2), right: Math.max(c1, c2) } satisfies CellRect
  }, [colIndexOf, range, rowIndexOf])

  const wholeRowSelection = rect !== null && rect.left === 0 && rect.right === displayedColumns.length - 1

  /** 선택 외곽 4px 안쪽만 이동 손잡이로 인정해 셀 편집·범위 선택과 충돌하지 않게 한다. */
  const selectionEdgeAt = (target: HTMLElement, clientX: number, clientY: number): { row: string; col: string | null; rowIndex: number; colIndex: number } | null => {
    if (!editEnabled || !rect || target.closest("[data-fill-handle]")) return null
    const cell = target.closest<HTMLTableCellElement>("td[data-col-id], td[data-row-header]")
    const rowElement = cell?.closest<HTMLElement>("tr[data-row-id]")
    const rowId = rowElement?.dataset.rowId
    const rowIndex = rowId ? rowIndexOf.get(rowId) : undefined
    if (!cell || !rowId || rowIndex === undefined || rowIndex < rect.top || rowIndex > rect.bottom) return null

    const header = cell.hasAttribute("data-row-header")
    if (header && (!wholeRowSelection || !dragEnabled)) return null
    const colId = header ? null : cell.dataset.colId ?? null
    const colIndex = colId ? colIndexOf.get(colId) : -1
    if (!header && (colIndex === undefined || colIndex < rect.left || colIndex > rect.right)) return null
    if (!header && wholeRowSelection && !dragEnabled) return null

    const box = cell.getBoundingClientRect()
    const edge = 4
    const onTop = rowIndex === rect.top && clientY - box.top <= edge
    const onBottom = rowIndex === rect.bottom && box.bottom - clientY <= edge
    const onLeft = header
      ? wholeRowSelection && clientX - box.left <= edge
      : !wholeRowSelection && colIndex === rect.left && clientX - box.left <= edge
    const onRight = !header && colIndex === rect.right && box.right - clientX <= edge
    return onTop || onBottom || onLeft || onRight ? { row: rowId, col: colId, rowIndex, colIndex: header ? 0 : colIndex as number } : null
  }

  const startSelectionMove = (event: ReactMouseEvent<HTMLTableRowElement>): boolean => {
    const target = event.target as HTMLElement
    const edge = selectionEdgeAt(target, event.clientX, event.clientY)
    if (!edge || !rect) return false
    event.preventDefault()
    event.stopPropagation()
    selectingRef.current = false
    rowSelectingRef.current = false
    setMoveHover(null)
    const drag = { source: { ...rect }, wholeRows: wholeRowSelection, grabRow: edge.rowIndex - rect.top, grabCol: edge.colIndex - rect.left }
    moveDragRef.current = drag
    movePreviewRef.current = { ...rect }
    setMovePreview({ ...rect })
    document.body.style.cursor = "grabbing"
    startDragAutoScroll(event.clientX, event.clientY)
    return true
  }

  const movePreviewStyle = (rowIndex: number | undefined, colIndex: number, header = false): CSSProperties | undefined => {
    if (!movePreview || rowIndex === undefined || rowIndex < movePreview.top || rowIndex > movePreview.bottom) return undefined
    const wholeRows = moveDragRef.current?.wholeRows === true
    if (header && !wholeRows) return undefined
    if (!header && (colIndex < movePreview.left || colIndex > movePreview.right)) return undefined
    const style: CSSProperties = {}
    if (rowIndex === movePreview.top) style.borderTop = "1.5px dashed var(--grid-selection)"
    if (rowIndex === movePreview.bottom) style.borderBottom = "1.5px dashed var(--grid-selection)"
    if (header && wholeRows) style.borderLeft = "1.5px dashed var(--grid-selection)"
    if (!header && !wholeRows && colIndex === movePreview.left) style.borderLeft = "1.5px dashed var(--grid-selection)"
    if (!header && colIndex === movePreview.right) style.borderRight = "1.5px dashed var(--grid-selection)"
    return style
  }

  const onGridMouseMove = (event: ReactMouseEvent<HTMLTableElement>) => {
    if (moveDragRef.current) return
    const edge = selectionEdgeAt(event.target as HTMLElement, event.clientX, event.clientY)
    setMoveHover((current) => {
      const next = edge ? { row: edge.row, col: edge.col } : null
      return current?.row === next?.row && current?.col === next?.col ? current : next
    })
  }

  const startFill = (event: ReactMouseEvent<HTMLSpanElement>) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    event.preventDefault()
    event.stopPropagation()
    selectingRef.current = false
    fillDragRef.current = { source: { ...rect } }
    fillPreviewRef.current = { ...rect }
    setFillPreview({ ...rect })
    startDragAutoScroll(event.clientX, event.clientY)
  }

  const inFillPreview = (row: number | undefined, colId: string): boolean => {
    if (!fillPreview || row === undefined) return false
    const col = colIndexOf.get(colId)
    return col !== undefined && row >= fillPreview.top && row <= fillPreview.bottom && col >= fillPreview.left && col <= fillPreview.right
      && (!rect || row < rect.top || row > rect.bottom || col < rect.left || col > rect.right)
  }

  /** 헤더 강조용 — 선택 사각형의 열 범위에 드는지. */
  const colInRange = (colId: string): boolean => {
    if (!rect) return false
    const index = colIndexOf.get(colId)
    return index !== undefined && index >= rect.left && index <= rect.right
  }

  const toggleColumnSort = (col: string) => setSortBy((current) => {
    if (!current || current.col !== col) return { col, dir: "asc" }
    if (current.dir === "asc") return { col, dir: "desc" }
    return null
  })

  const sortIcon = (col: string) => sortBy?.col === col
    ? sortBy.dir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />
    : null

  /** 엑셀의 행 머리글 클릭처럼 그 행의 표시 중인 모든 열을 선택한다. */
  const selectWholeRow = (rowId: string, extend = false) => {
    const first = displayedColumns[0], last = displayedColumns[displayedColumns.length - 1]
    if (!first || !last) return
    setRange((current) => extend && current
      ? { anchor: { row: current.anchor.row, col: first.id }, focus: { row: rowId, col: last.id } }
      : { anchor: { row: rowId, col: first.id }, focus: { row: rowId, col: last.id } })
  }

  const setCellAnchor = (row: string, col: string) => setRange({ anchor: { row, col }, focus: { row, col } })
  const extendTo = (row: string, col: string) => setRange((current) => current ? { anchor: current.anchor, focus: { row, col } } : { anchor: { row, col }, focus: { row, col } })

  const scrollCellIntoView = (cellRef: CellRef) => {
    window.requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("tr[data-row-id]")].find((item) => item.dataset.rowId === cellRef.row)
      const cell = row ? [...row.querySelectorAll<HTMLElement>("td[data-col-id]")].find((item) => item.dataset.colId === cellRef.col) : null
      if (!cell) return
      cell.scrollIntoView({ block: "nearest", inline: "nearest" })
      const scroller = cell.closest<HTMLElement>("[data-route-scroll-root]")
      const colIndex = colIndexOf.get(cellRef.col)
      if (!scroller || colIndex === undefined || colIndex < PINNED_COLUMNS.length) return
      const cellBox = cell.getBoundingClientRect()
      const scrollBox = scroller.getBoundingClientRect()
      const stickyEdge = scrollBox.left + ROW_HEADER_WIDTH + pinnedTotal
      if (cellBox.left < stickyEdge) scroller.scrollLeft -= stickyEdge - cellBox.left
    })
  }

  /** 방향키는 가장자리에서 멈추고, Tab만 행 끝에서 다음/이전 행으로 순환한다. */
  const moveSelection = (direction: CellMove, extend = false, wrap = false, origin?: CellRef) => {
    const rowCount = filtered.length
    const colCount = displayedColumns.length
    if (!rowCount || !colCount) return
    const current = origin ?? range?.focus
    if (!current) {
      const first = { row: recordIdentity(filtered[0]), col: displayedColumns[0].id }
      setRange({ anchor: first, focus: first })
      scrollCellIntoView(first)
      return
    }
    let rowIndex = current ? rowIndexOf.get(current.row) ?? 0 : 0
    let colIndex = current ? colIndexOf.get(current.col) ?? 0 : 0

    if (direction === "up") rowIndex = Math.max(0, rowIndex - 1)
    else if (direction === "down") rowIndex = Math.min(rowCount - 1, rowIndex + 1)
    else if (direction === "right") {
      if (wrap && colIndex === colCount - 1 && rowIndex < rowCount - 1) { rowIndex += 1; colIndex = 0 }
      else colIndex = Math.min(colCount - 1, colIndex + 1)
    } else if (wrap && colIndex === 0 && rowIndex > 0) {
      rowIndex -= 1
      colIndex = colCount - 1
    } else colIndex = Math.max(0, colIndex - 1)

    const row = filtered[rowIndex]
    const column = displayedColumns[colIndex]
    if (!row || !column) return
    const next = { row: recordIdentity(row), col: column.id }
    setRange((currentRange) => extend && currentRange ? { anchor: currentRange.anchor, focus: next } : { anchor: next, focus: next })
    scrollCellIntoView(next)
  }

  const beginCellEdit = (cellRef: CellRef, initial?: string) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const rowIndex = rowIndexOf.get(cellRef.row)
    const colIndex = colIndexOf.get(cellRef.col)
    const column = colIndex === undefined ? undefined : displayedColumns[colIndex]
    if (rowIndex === undefined || !filtered[rowIndex] || !column || isFixedColumn(column)) return
    setEditSeed(initial)
    setEditCell(cellRef)
  }

  const cancelCellEdit = () => { setEditCell(null); setEditSeed(undefined) }

  /** 복사·붙여넣기에 쓰는 원본 값(화면 표기 "—" 가 아닌 실제 값). */
  const rawCellText = (record: DevRecord, column: MasterColumn): string => {
    const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
    const value = column.value(record, linked)
    return value === null || value === undefined ? "" : String(value)
  }

  const rangeToTsv = (box: NonNullable<typeof rect>): string => {
    const lines: string[] = []
    for (let r = box.top; r <= box.bottom; r += 1) {
      const record = filtered[r]
      if (!record) continue
      const cells: string[] = []
      for (let c = box.left; c <= box.right; c += 1) {
        const column = displayedColumns[c]
        cells.push(column ? rawCellText(record, column) : "")
      }
      lines.push(cells.join("\t"))
    }
    return lines.join("\n")
  }

  const notify = (message: string) => { setClipNotice(message); window.setTimeout(() => setClipNotice(null), 2500) }

  /** 현재 화면 순서를 인덱스로 굳힌다. 편집으로 접수일이 바뀌어도 행이 튀지 않게 한다. */
  const rankOf = (records: readonly DevRecord[]): Map<string, number> => {
    const rank = new Map<string, number>()
    records.map((record, index) => ({ record, index }))
      .sort((a, b) => compareManualOrder(a.record, b.record) || a.index - b.index)
      .forEach(({ record }, position) => rank.set(recordIdentity(record), position))
    return rank
  }

  /**
   * 변경 전 전체 레코드를 담아 두고 일괄 저장한다. 되돌리기는 이 스냅샷 한 단계만 지원한다.
   * 저장 직전에 편집 전 순서를 sortOrder 로 고정해, 엑셀처럼 행이 제자리에 머물게 한다.
   */
  const commitRecords = async (build: (records: DevRecord[]) => DevRecord[], freezeOrder = true) => {
    const before = useAppStore.getState().records
    const edited = build(before)
    if (edited === before) return
    const rank = freezeOrder ? rankOf(before) : null
    const next = rank ? edited.map((record) => {
      const order = rank.get(recordIdentity(record))
      return order === undefined || record.sortOrder === order ? record : { ...record, sortOrder: order }
    }) : edited
    pushUndoSnapshot(before)
    await writeDevelopmentRecords(next)
  }

  /** 선택 테두리 이동은 셀 값 이동과 행 블록 재배치를 한 경로에서 처리해 한 번에 되돌릴 수 있게 한다. */
  const commitSelectionMove = async (drag: MoveDrag, target: CellRect) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const source = drag.source
    if (source.top === target.top && source.left === target.left) return

    if (drag.wholeRows) {
      if (!dragEnabled) { notify("담당 필터를 선택한 상태에서만 행을 이동할 수 있습니다."); return }
      const selectedIds = filtered.slice(source.top, source.bottom + 1).map(recordIdentity)
      const selectedSet = new Set(selectedIds)
      const visible = ordered.map(recordIdentity)
      const moving = visible.filter((identity) => selectedSet.has(identity))
      if (!moving.length) return
      const remaining = visible.filter((identity) => !selectedSet.has(identity))
      const insertAt = Math.max(0, Math.min(target.top, remaining.length))
      const movedVisible = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)]
      if (movedVisible.every((identity, index) => identity === visible[index])) return

      // 화면에 보이는 담당 행이 차지한 슬롯만 갈아끼워 다른 담당의 전역 위치를 보존한다.
      const visibleSet = new Set(visible)
      const globalIds = globalOrdered.map(recordIdentity)
      let cursor = 0
      const reorderedIds = globalIds.map((identity) => visibleSet.has(identity) ? movedVisible[cursor++] : identity)
      const order = new Map(reorderedIds.map((identity, index) => [identity, index]))
      await commitRecords((records) => records.map((record) => {
        const nextOrder = order.get(recordIdentity(record))
        return nextOrder === undefined || record.sortOrder === nextOrder ? record : { ...record, sortOrder: nextOrder }
      }), false)
      const first = displayedColumns[0], last = displayedColumns[displayedColumns.length - 1]
      if (first && last) setRange({ anchor: { row: moving[0], col: first.id }, focus: { row: moving[moving.length - 1], col: last.id } })
      notify(`${moving.length}개 행을 이동했습니다.`)
      return
    }

    const moves: { sourceRecord: DevRecord; sourceColumn: MasterColumn; targetRecord: DevRecord; targetColumn: MasterColumn; value: string }[] = []
    for (let row = source.top; row <= source.bottom; row += 1) {
      const sourceRecord = filtered[row]
      const targetRecord = filtered[target.top + row - source.top]
      if (!sourceRecord || !targetRecord) continue
      for (let col = source.left; col <= source.right; col += 1) {
        const sourceColumn = displayedColumns[col]
        const targetColumn = displayedColumns[target.left + col - source.left]
        if (!sourceColumn || !targetColumn || isFixedColumn(sourceColumn) || isFixedColumn(targetColumn)) continue
        moves.push({ sourceRecord, sourceColumn, targetRecord, targetColumn, value: rawCellText(sourceRecord, sourceColumn) })
      }
    }
    if (!moves.length) { notify("이동할 수 있는 셀이 없습니다."); return }

    const edits = new Map<string, DevRecord>()
    const write = (record: DevRecord, column: MasterColumn, value: string) => {
      const identity = recordIdentity(record)
      const draft = edits.get(identity) ?? record
      const next = updateRecordCell(draft, column, value)
      if (next !== draft) edits.set(identity, next)
    }
    // 겹치는 범위도 잘라내기처럼 동작하도록 원본을 모두 비운 뒤 스냅샷 값을 대상에 쓴다.
    moves.forEach(({ sourceRecord, sourceColumn }) => write(sourceRecord, sourceColumn, ""))
    moves.forEach(({ targetRecord, targetColumn, value }) => write(targetRecord, targetColumn, value))
    if (!edits.size) return
    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    const firstRow = filtered[target.top], lastRow = filtered[target.bottom]
    const firstCol = displayedColumns[target.left], lastCol = displayedColumns[target.right]
    if (firstRow && lastRow && firstCol && lastCol) setRange({ anchor: { row: recordIdentity(firstRow), col: firstCol.id }, focus: { row: recordIdentity(lastRow), col: lastCol.id } })
    notify(`${moves.length}개 셀을 이동했습니다.`)
  }

  /** 채우기 핸들은 원본 사각형의 값을 행/열 패턴 그대로 반복한다. */
  const commitFill = async (source: CellRect, target: CellRect) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const edits = new Map<string, DevRecord>()
    let changed = 0
    const write = (rowIndex: number, colIndex: number, sourceRow: number, sourceCol: number) => {
      const record = filtered[rowIndex]
      const fromRecord = filtered[sourceRow]
      const column = displayedColumns[colIndex]
      const fromColumn = displayedColumns[sourceCol]
      if (!record || !fromRecord || !column || !fromColumn || isFixedColumn(column)) return
      const identity = recordIdentity(record)
      const draft = edits.get(identity) ?? record
      const next = updateRecordCell(draft, column, rawCellText(fromRecord, fromColumn))
      if (next !== draft) { edits.set(identity, next); changed += 1 }
    }

    if (target.bottom > source.bottom) {
      const height = source.bottom - source.top + 1
      for (let row = source.bottom + 1; row <= target.bottom; row += 1) {
        const sourceRow = source.top + ((row - source.top) % height)
        for (let col = source.left; col <= source.right; col += 1) write(row, col, sourceRow, col)
      }
    } else if (target.right > source.right) {
      const width = source.right - source.left + 1
      for (let row = source.top; row <= source.bottom; row += 1) {
        for (let col = source.right + 1; col <= target.right; col += 1) {
          const sourceCol = source.left + ((col - source.left) % width)
          write(row, col, row, sourceCol)
        }
      }
    }
    if (!edits.size) return
    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    const firstRow = filtered[target.top], lastRow = filtered[target.bottom]
    const firstCol = displayedColumns[target.left], lastCol = displayedColumns[target.right]
    if (firstRow && lastRow && firstCol && lastCol) setRange({ anchor: { row: recordIdentity(firstRow), col: firstCol.id }, focus: { row: recordIdentity(lastRow), col: lastCol.id } })
    notify(`${changed}개 셀을 채웠습니다.`)
  }

  /** Ctrl+D: 첫 행을 아래로 복사하고, 단일 셀은 바로 위 값을 가져온다. */
  const fillDown = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    const single = rect.top === rect.bottom && rect.left === rect.right
    const sourceRow = single ? rect.top - 1 : rect.top
    const startRow = single ? rect.top : rect.top + 1
    if (sourceRow < 0 || startRow > rect.bottom) { notify("위에서 가져올 값이 없습니다."); return }
    const edits = new Map<string, DevRecord>()
    let changed = 0
    for (let row = startRow; row <= rect.bottom; row += 1) {
      const record = filtered[row]
      const fromRecord = filtered[sourceRow]
      if (!record || !fromRecord) continue
      let draft = record
      for (let col = rect.left; col <= rect.right; col += 1) {
        const column = displayedColumns[col]
        if (!column || isFixedColumn(column)) continue
        const next = updateRecordCell(draft, column, rawCellText(fromRecord, column))
        if (next !== draft) { draft = next; changed += 1 }
      }
      if (draft !== record) edits.set(recordIdentity(record), draft)
    }
    if (!edits.size) return
    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    notify(`${changed}개 셀을 아래로 채웠습니다.`)
  }

  const replaceAllMatches = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!findValue) { notify("찾을 내용을 입력하세요."); return }
    const edits = new Map<string, DevRecord>()
    let changed = 0
    const replaceCell = (record: DevRecord, column: MasterColumn) => {
      if (isFixedColumn(column)) return
      const identity = recordIdentity(record)
      const draft = edits.get(identity) ?? record
      const linked = ledgerByRecord.get(identity) ?? null
      const raw = column.value(draft, linked)
      const before = raw === null || raw === undefined ? "" : String(raw)
      const after = replaceText(before, findValue, replaceValue, replaceMatchCase)
      if (after === before) return
      const next = updateRecordCell(draft, column, after)
      if (next !== draft) { edits.set(identity, next); changed += 1 }
    }

    if (replaceScope === "selection") {
      if (!rect) { notify("먼저 바꿀 영역을 선택하세요."); return }
      for (let row = rect.top; row <= rect.bottom; row += 1) {
        const record = filtered[row]
        if (!record) continue
        for (let col = rect.left; col <= rect.right; col += 1) {
          const column = displayedColumns[col]
          if (column) replaceCell(record, column)
        }
      }
    } else {
      for (const record of scoped) for (const column of allColumns) replaceCell(record, column)
    }

    if (!edits.size) { notify("바꿀 셀이 없습니다."); return }
    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    notify(`${changed}개 셀을 바꿨습니다.`)
  }

  /** 엑셀의 "복사한 셀 삽입" — 클립보드 내용을 선택 행 아래에 새 행으로 끼워 넣는다. */
  const insertCopiedRows = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    let text = ""
    try { text = await navigator.clipboard.readText() } catch { text = "" }
    if (!text) text = clipRef.current?.text ?? ""
    if (!text) { notify("삽입할 내용이 없습니다.") ; return }

    const grid = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
    const created = grid.map((line) => {
      let draft = createBlankDevRecord()
      line.forEach((value, index) => {
        const column = displayedColumns[rect.left + index]
        if (column && !isFixedColumn(column)) draft = updateRecordCell(draft, column, value)
      })
      return draft
    })
    if (!created.length) return

    const before = useAppStore.getState().records
    const rank = rankOf(before)
    const sorted = [...before].sort((a, b) => (rank.get(recordIdentity(a)) ?? 0) - (rank.get(recordIdentity(b)) ?? 0))
    const anchor = filtered[rect.bottom]
    const at = anchor ? sorted.findIndex((record) => recordIdentity(record) === recordIdentity(anchor)) : -1
    const cut = at === -1 ? sorted.length : at + 1
    const merged = [...sorted.slice(0, cut), ...created, ...sorted.slice(cut)]

    pushUndoSnapshot(before)
    await writeDevelopmentRecords(merged.map((record, index) => ({ ...record, sortOrder: index })))
    setRange(null)
    notify(`${created.length}개 행을 아래에 삽입했습니다.`)
  }

  const selectedRows = (): DevRecord[] => rect ? filtered.slice(rect.top, rect.bottom + 1) : []

  const insertBlankRows = async (position: "above" | "below") => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    const count = Math.max(1, rect.bottom - rect.top + 1)
    const blankOwner = owner === ALL ? "" : owner
    const created = Array.from({ length: count }, () => createEmptyGridRecord(blankOwner))
    const before = useAppStore.getState().records
    const rank = rankOf(before)
    const sorted = [...before].sort((a, b) => (rank.get(recordIdentity(a)) ?? 0) - (rank.get(recordIdentity(b)) ?? 0))
    const anchor = filtered[position === "above" ? rect.top : rect.bottom]
    const anchorIndex = anchor ? sorted.findIndex((record) => recordIdentity(record) === recordIdentity(anchor)) : -1
    const at = anchorIndex === -1 ? sorted.length : anchorIndex + (position === "below" ? 1 : 0)
    const merged = [...sorted.slice(0, at), ...created, ...sorted.slice(at)]
    pushUndoSnapshot(before)
    await writeDevelopmentRecords(merged.map((record, index) => ({ ...record, sortOrder: index })))
    const first = displayedColumns[0], last = displayedColumns[displayedColumns.length - 1]
    if (first && last) {
      const firstCell = { row: recordIdentity(created[0]), col: first.id }
      setRange({ anchor: firstCell, focus: { row: recordIdentity(created[created.length - 1]), col: last.id } })
      scrollCellIntoView(firstCell)
    }
    notify(`${created.length}개 빈 행을 ${position === "above" ? "위" : "아래"}에 삽입했습니다.`)
  }

  const appendBlankRows = async (count: number) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const blankOwner = owner === ALL ? "" : owner
    const created = Array.from({ length: count }, () => createEmptyGridRecord(blankOwner))
    await commitRecords((records) => {
      const rank = rankOf(records)
      const sorted = [...records].sort((a, b) => (rank.get(recordIdentity(a)) ?? 0) - (rank.get(recordIdentity(b)) ?? 0))
      return [...sorted, ...created].map((record, index) => ({ ...record, sortOrder: index }))
    })
    const first = displayedColumns[0], last = displayedColumns[displayedColumns.length - 1]
    if (first && last) {
      const lastCell = { row: recordIdentity(created[created.length - 1]), col: first.id }
      setRange({ anchor: { row: recordIdentity(created[0]), col: first.id }, focus: { row: lastCell.row, col: last.id } })
      scrollCellIntoView(lastCell)
    }
    notify(`${created.length}개 빈 행을 목록 아래에 추가했습니다.`)
  }

  const requestDeleteSelectedRows = () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const rows = selectedRows()
    if (rows.length) setConfirmDelete(rows)
  }

  const copyRange = async (cut = false) => {
    if (cut && !editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    const text = rangeToTsv(rect)
    clipRef.current = { text, cut }
    cutRangeRef.current = cut ? { ...rect } : null
    try { await navigator.clipboard.writeText(text) } catch { /* 클립보드 권한이 없어도 앱 내부 붙여넣기는 동작한다. */ }
    const count = (rect.bottom - rect.top + 1) * (rect.right - rect.left + 1)
    notify(cut ? `${count}개 셀 잘라내기` : `${count}개 셀 복사`)
  }

  /** 선택 영역의 편집 가능한 셀을 비운다(수식·대장연결 열은 건너뛴다). */
  const clearRange = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    const edits = new Map<string, DevRecord>()
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      const record = filtered[r]
      if (!record) continue
      let draft = edits.get(recordIdentity(record)) ?? record
      for (let c = rect.left; c <= rect.right; c += 1) {
        const column = displayedColumns[c]
        if (!column || isFixedColumn(column)) continue
        draft = updateRecordCell(draft, column, "")
      }
      if (draft !== record) edits.set(recordIdentity(record), draft)
    }
    if (!edits.size) return
    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    notify("선택 영역을 비웠습니다.")
  }

  const pasteRange = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!rect) return
    let text = ""
    try { text = await navigator.clipboard.readText() } catch { text = "" }
    if (!text) text = clipRef.current?.text ?? ""
    if (!text) { notify("붙여넣을 내용이 없습니다.") ; return }

    const grid = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
    const cut = clipRef.current?.cut ? cutRangeRef.current : null
    const edits = new Map<string, DevRecord>()
    const put = (record: DevRecord, draft: DevRecord) => { if (draft !== record) edits.set(recordIdentity(record), draft) }

    // 잘라내기 원본을 먼저 비운다(원본과 대상이 겹쳐도 값이 남지 않게).
    if (cut) {
      for (let r = cut.top; r <= cut.bottom; r += 1) {
        const record = filtered[r]
        if (!record) continue
        let draft = edits.get(recordIdentity(record)) ?? record
        for (let c = cut.left; c <= cut.right; c += 1) {
          const column = displayedColumns[c]
          if (!column || isFixedColumn(column)) continue
          draft = updateRecordCell(draft, column, "")
        }
        put(record, draft)
      }
    }

    let skipped = 0
    for (let r = 0; r < grid.length; r += 1) {
      const record = filtered[rect.top + r]
      if (!record) break
      let draft = edits.get(recordIdentity(record)) ?? record
      for (let c = 0; c < grid[r].length; c += 1) {
        const column = displayedColumns[rect.left + c]
        if (!column) break
        if (isFixedColumn(column)) { skipped += 1; continue }
        draft = updateRecordCell(draft, column, grid[r][c])
      }
      put(record, draft)
    }
    if (!edits.size) { notify("붙여넣을 수 있는 셀이 없습니다.") ; return }

    await commitRecords((records) => records.map((record) => edits.get(recordIdentity(record)) ?? record))
    clipRef.current = clipRef.current ? { ...clipRef.current, cut: false } : null
    cutRangeRef.current = null
    notify(skipped ? `붙여넣기 완료 · 수정 불가 ${skipped}칸 제외` : "붙여넣기 완료")
  }

  /** 우클릭: 선택 밖 셀이면 그 셀을 먼저 선택하고 메뉴를 연다(엑셀과 동일). */
  const openCellMenu = (event: ReactMouseEvent<HTMLTableCellElement>, rowId: string, colId: string) => {
    event.preventDefault()
    const rowIdx = rowIndexOf.get(rowId)
    const colIdx = colIndexOf.get(colId)
    const inside = rect !== null && rowIdx !== undefined && colIdx !== undefined
      && rowIdx >= rect.top && rowIdx <= rect.bottom && colIdx >= rect.left && colIdx <= rect.right
    if (!inside) setCellAnchor(rowId, colId)
    setMenu({ x: event.clientX, y: event.clientY, kind: "cells" })
  }

  const undoLast = async () => {
    const snapshot = undoStack[undoStack.length - 1]
    if (!snapshot) return
    const current = useAppStore.getState().records
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, current].slice(-50))
    await writeDevelopmentRecords(snapshot, false)
    notify("이전 상태로 되돌렸습니다.")
  }

  const redoLast = async () => {
    const snapshot = redoStack[redoStack.length - 1]
    if (!snapshot) return
    const current = useAppStore.getState().records
    setRedoStack((stack) => stack.slice(0, -1))
    setUndoStack((stack) => [...stack, current].slice(-50))
    await writeDevelopmentRecords(snapshot, false)
    notify("되돌린 작업을 다시 실행했습니다.")
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.isComposing) return
    // 인라인 편집기·모달 입력 중에는 표 단축키를 가로채지 않는다.
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest("input, textarea, select, [contenteditable=true]")) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()

    if (mod && key === "h") { event.preventDefault(); if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }; setReplaceScope(rect ? "selection" : "all"); setReplaceOpen(true); return }
    if (mod && key === "c") { event.preventDefault(); void copyRange(); return }
    if (mod && key === "x") { event.preventDefault(); void copyRange(true); return }
    if (mod && key === "v") { event.preventDefault(); void pasteRange(); return }
    if (mod && key === "d") { event.preventDefault(); void fillDown(); return }
    if (mod && key === "z" && event.shiftKey) { event.preventDefault(); void redoLast(); return }
    if (mod && key === "z") { event.preventDefault(); void undoLast(); return }
    if (mod && key === "y") { event.preventDefault(); void redoLast(); return }
    if (event.key === "Escape") { setRange(null); setMenu(null); return }
    if (event.key === "Delete" || event.key === "Backspace") { if (rect) { event.preventDefault(); void clearRange() }; return }
    if (event.shiftKey && event.code === "Space") { if (range) { event.preventDefault(); selectWholeRow(range.focus.row) }; return }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      const direction = event.key.slice(5).toLowerCase() as CellMove
      moveSelection(direction, event.shiftKey)
      return
    }
    if (event.key === "Tab") { event.preventDefault(); moveSelection(event.shiftKey ? "left" : "right", false, true); return }
    if (event.key === "Enter") { event.preventDefault(); moveSelection(event.shiftKey ? "up" : "down"); return }
    if (event.key === "F2") { if (range) { event.preventDefault(); beginCellEdit(range.focus) }; return }
    if (event.key.length === 1 && !mod && !event.altKey && range) {
      event.preventDefault()
      beginCellEdit(range.focus, event.key)
    }
  }
  // 핸들러는 매 렌더 최신으로 바뀌지만, 리스너 등록·해제는 1회만 한다(매 렌더 재등록은 비용이 크다).
  const keyHandlerRef = useRef(onKey)
  keyHandlerRef.current = onKey
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  const applyPreset = (preset: "core" | "process" | "all") => {
    if (preset === "all") setOpenGroups({ request: true, original: true, detail: true, schedule: true, result: true, data: true, history: true, ledger: true })
    else if (preset === "process") setOpenGroups({ request: true, original: false, detail: true, schedule: true, result: true, data: false, history: false, ledger: true })
    else setOpenGroups(DEFAULT_OPEN)
  }

  const resetAttach = () => { setAttached(null); setAttachError(null); setAttaching(false) }
  const openEditor = (record: DevRecord) => { setEditing(structuredClone(record)); cancelCellEdit() }
  const openNew = () => { setIntake([createBlankDevRecord()]); setIntakeOpt(0); setIntakeError(null); setIntakeNotice(null); resetAttach() }
  const closeEditor = () => { setEditing(null) }
  const closeIntake = () => { setIntake(null); setIntakeOpt(0); setIntakeError(null); resetAttach() }

  // 접수 모드: REQUEST·ORIGINAL·담당·Style 은 옵션 공통, DETAIL·SCHEDULE 은 옵션별.
  const sharedDraft = intake ? intake[0] : null
  const optionDraft = intake ? intake[Math.min(intakeOpt, intake.length - 1)] : null
  const changeShared = (next: DevRecord) => setIntake((recs) => (recs ? recs.map((r) => applySharedFields(next, r)) : recs))
  const changeOption = (next: DevRecord) => setIntake((recs) => (recs ? recs.map((r, i) => (i === Math.min(intakeOpt, recs.length - 1) ? next : r)) : recs))
  const addOption = () => setIntake((recs) => {
    if (!recs) return recs
    const next = [...recs, applySharedFields(recs[0], createBlankDevRecord())]
    setIntakeOpt(next.length - 1)
    return next
  })
  const removeOption = (index: number) => setIntake((recs) => {
    if (!recs || recs.length <= 1) return recs
    const next = recs.filter((_, i) => i !== index)
    setIntakeOpt((cur) => Math.max(0, Math.min(cur, next.length - 1)))
    return next
  })

  const onAttachFile = async (file: File | undefined) => {
    if (!file) return
    setAttaching(true); setAttachError(null)
    try {
      const z = await parseZaji(file)
      const recs = z.options.length ? z.options.map((_, index) => zajiToRecord(z, index)) : [applyZajiHeader(createBlankDevRecord(), z)]
      setAttached(z); setIntake(recs); setIntakeOpt(0); setIntakeError(null)
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "작지 파싱에 실패했습니다.")
    } finally {
      setAttaching(false)
      if (zajiInputRef.current) zajiInputRef.current.value = ""
    }
  }
  const saveIntake = async () => {
    if (!intake || !sharedDraft || savingIntake) return
    const intakeColumns = [...INTAKE_CORE, ...INTAKE_REQUEST, ...INTAKE_ORIGINAL]
    const fieldValueOf = (record: DevRecord, id: string) => intakeColumns.find((column) => column.id === id)?.value(record, null)
    const missing = [...INTAKE_REQUIRED_IDS].filter((id) => !String(fieldValueOf(sharedDraft, id) ?? "").trim())
    if (missing.length > 0) {
      setIntakeError(`필수 항목을 입력하세요: ${missing.map((id) => intakeColumns.find((column) => column.id === id)?.label ?? id).join(" · ")}`)
      return
    }
    setIntakeError(null)
    const registeredAt = new Date().toISOString()
    const recs = intake.map((record, index) => ({ ...record, opt: String(index + 1), devStatus: "진행중", registeredAt }))
    setSavingIntake(true)
    try {
      const result = await saveDevelopmentIntakeRecords(recs)
      if (!result.added) {
        setIntakeError(`이미 DD MASTER에 등록된 동일 작지·옵션입니다. 중복 ${result.skipped}건은 저장하지 않았습니다.`)
        return
      }
      // 방금 접수한 행만 잠시 맨 위로 올려 확인하게 한다. 새로고침하면 기본 순서(맨 아래)로 내려간다.
      setRecentIntakeRows((current) => new Set([...current, ...result.addedIdentities]))
      setIntakeNotice(result.skipped
        ? `${result.added}건 신규 · 기존 중복 ${result.skipped}건 제외`
        : `${result.added}건 등록 · 새로고침 전까지 맨 위에 표시합니다.`)
      closeIntake()
    } finally {
      setSavingIntake(false)
    }
  }
  const saveEditor = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!editing) return
    await saveDevelopmentRecord(editing, recordIdentity(editing))
    closeEditor()
  }
  const commitCell = async (record: DevRecord, column: MasterColumn, raw: string, move?: CellMove, fillRange = false) => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    const origin = { row: recordIdentity(record), col: column.id }
    cancelCellEdit()
    if (fillRange && rect) {
      const edits = new Map<string, DevRecord>()
      let changed = 0
      for (let row = rect.top; row <= rect.bottom; row += 1) {
        const target = filtered[row]
        if (!target) continue
        let draft = target
        for (let col = rect.left; col <= rect.right; col += 1) {
          const targetColumn = displayedColumns[col]
          if (!targetColumn || isFixedColumn(targetColumn)) continue
          const next = updateRecordCell(draft, targetColumn, raw)
          if (next !== draft) { draft = next; changed += 1 }
        }
        if (draft !== target) edits.set(recordIdentity(target), draft)
      }
      if (edits.size) await commitRecords((records) => records.map((item) => edits.get(recordIdentity(item)) ?? item))
      notify(`${changed}개 셀에 같은 값을 입력했습니다.`)
      return
    }
    const next = updateRecordCell(record, column, raw)
    if (next !== record) {
      const identity = recordIdentity(record)
      await commitRecords((records) => records.map((item) => recordIdentity(item) === identity ? next : item))
    }
    if (move) moveSelection(move, false, move === "left" || move === "right", origin)
  }
  const [exporting, setExporting] = useState(false)
  /**
   * 화면에서 보고 있는 순서 그대로 DD 엑셀 양식으로 내보낸다.
   * 시트는 전체현황과 담당별로 나눈다. 접혀 있는 열도 포함해 64열 전부를 쓴다.
   */
  const exportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // 담당 필터만 걷어내고 화면과 같은 정렬·검색 조건을 그대로 쓴다.
      // 전체현황 시트가 비어 보이지 않게 하되, 소팅한 순서는 화면 그대로 유지한다.
      const query = search.trim().toLocaleLowerCase("ko-KR")
      const sortColumn = sortBy ? allColumns.find((column) => column.id === sortBy.col) : undefined
      const base = scoped.filter((record) => {
        if (status !== ALL && (record.devStatus || record.stage) !== status) return false
        if (!query) return true
        const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
        return allColumns.some((column) => String(column.value(record, linked) ?? "").toLocaleLowerCase("ko-KR").includes(query))
      }).map((record, index) => ({ record, index }))
        .sort((a, b) => {
          if (sortBy && sortColumn) {
            const left = String(sortColumn.value(a.record, null) ?? "").trim()
            const right = String(sortColumn.value(b.record, null) ?? "").trim()
            if (!left !== !right) return left ? -1 : 1
            const order = left.localeCompare(right, "ko-KR", { numeric: true })
            if (order) return sortBy.dir === "asc" ? order : -order
          }
          return compareManualOrder(a.record, b.record) || a.index - b.index
        })
        .map(({ record }) => record)
      const owners = [...new Set(base.map((record) => record.owner).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ko-KR"))
      const stamp = new Date().toLocaleDateString("ko-KR")
      const sheets: DdExportSheet[] = [
        { name: "전체현황", title: `DEVELOPMENT DASHBOARD 전체현황 (${base.length}건, ${stamp} 내보냄)`, rows: base },
        ...owners.map((name) => {
          const rows = base.filter((record) => record.owner === name)
          return { name: ownerDisplayName(name), title: `DEVELOPMENT DASHBOARD ${ownerDisplayName(name)} (${rows.length}건, ${stamp} 내보냄)`, rows }
        }),
      ]
      const blob = await buildDdWorkbook(sheets)
      // 통합문서에는 담당 필터와 상관없이 전체현황과 담당별 시트가 모두 들어가므로 파일명도 하나로 둔다.
      downloadBlob(blob, ddExportFileName("전체현황"))
      notify(`엑셀 ${sheets.length}개 시트로 내보냈습니다.`)
    } catch {
      notify("엑셀 내보내기에 실패했습니다.")
    } finally {
      setExporting(false)
    }
  }

  // GridCell 은 memo 라 콜백 참조가 고정돼야 한다. 최신 상태는 ref 로 읽고 객체 자체는 한 번만 만든다.
  const gridActionsRef = useRef({ setCellAnchor, beginCellEdit, commitCell, cancelCellEdit, openCellMenu, startFill })
  gridActionsRef.current = { setCellAnchor, beginCellEdit, commitCell, cancelCellEdit, openCellMenu, startFill }
  const gridActions = useMemo<GridActions>(() => ({
    select: (rowId, colId) => gridActionsRef.current.setCellAnchor(rowId, colId),
    edit: (rowId, colId) => gridActionsRef.current.beginCellEdit({ row: rowId, col: colId }),
    commit: (record, column, raw, move, fillRange) => void gridActionsRef.current.commitCell(record, column, raw, move, fillRange),
    cancel: () => gridActionsRef.current.cancelCellEdit(),
    contextMenu: (event, rowId, colId) => gridActionsRef.current.openCellMenu(event, rowId, colId),
    fillStart: (event) => gridActionsRef.current.startFill(event),
  }), [])

  const confirmDeleteRecord = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!confirmDelete?.length) return
    const identities = new Set(confirmDelete.map(recordIdentity))
    await commitRecords((records) => records.filter((record) => !identities.has(recordIdentity(record))))
    setConfirmDelete(null)
    setRange(null)
    notify(`${identities.size}개 행을 삭제했습니다.`)
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-2 -mx-4 sm:-mx-6 lg:-mx-8" style={{ "--grid-selection": "#217346" } as CSSProperties}>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-1.5" aria-label="주요 개발 담당">
        {[{ key: ALL, label: "전체", initial: "전", stat: ownerStats.all }, ...MAIN_DEVELOPERS.map((name) => ({ key: name, label: name, initial: name.charAt(0), stat: ownerStats.byOwner.get(name) ?? { total: 0, active: 0 } }))].map((card) => {
          const on = owner === card.key
          return <button type="button" key={card.key} aria-pressed={on} title={card.key === ALL ? "담당 필터 해제" : `${card.label} 개발건만 보기`} onClick={() => setOwner(on && card.key !== ALL ? ALL : card.key)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[calc(var(--radius)-2px)] border px-2 transition-colors ${on ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)]"}`}>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${on ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--foreground)]"}`}>{card.initial}</span>
            <span className="text-xs font-semibold text-[var(--foreground)]">{card.label}</span>
            <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]" title={`진행중 ${card.stat.active} / 전체 ${card.stat.total}`}>{card.stat.active}<span className="opacity-50">/{card.stat.total}</span></span>
          </button>
        })}
        {owner !== ALL && !MAIN_DEVELOPERS.includes(owner) ? <span className="flex h-8 shrink-0 items-center gap-1 rounded-[calc(var(--radius)-2px)] border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] px-2 text-xs text-[var(--foreground)]">{ownerDisplayName(owner)}<button type="button" title="담당 필터 해제" onClick={() => setOwner(ALL)} className="rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"><X className="size-3" /></button></span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" onClick={openNew}><Plus className="size-4" />신규 작지 접수</Button>
        <span className="mx-0.5 h-5 w-px bg-[var(--border)]" />
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("core")}>핵심 보기</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("process")}>공정·결과</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("all")}><Columns3 className="size-4" />전체 64열</Button>
        {saveState === "idle" ? null : <span role="status" className={`mr-0.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${saveState === "error" ? "bg-[var(--destructive)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>{saveState === "error" ? "저장 실패" : saveState === "saved" ? "저장됨" : "저장 중"}</span>}
        <Button type="button" size="sm" variant="outline" disabled={!undoStack.length} title={undoStack.length ? "이전 편집 되돌리기 (Ctrl+Z)" : "되돌릴 편집이 없습니다"} onClick={() => void undoLast()}><Undo2 className="size-4" />되돌리기</Button>
        <Button type="button" size="sm" variant="outline" disabled={!redoStack.length} title={redoStack.length ? "되돌린 편집 다시 실행 (Ctrl+Y)" : "다시 실행할 편집이 없습니다"} onClick={() => void redoLast()}><Redo2 className="size-4" />다시 실행</Button>
        <Button type="button" size="sm" variant="outline" disabled={!editEnabled} title={editEnabled ? "찾기·바꾸기 (Ctrl+H)" : EDIT_DISABLED_MESSAGE} onClick={() => { setReplaceScope(rect ? "selection" : "all"); setReplaceOpen(true) }}><Search className="size-4" />찾기·바꾸기</Button>
        {sortBy ? <Button type="button" size="sm" variant="outline" onClick={() => setSortBy(null)}><X className="size-4" />정렬 해제</Button> : null}
        <Button type="button" size="sm" variant="outline" disabled={exporting} title="화면에 보이는 순서 그대로 DD 엑셀 양식으로 내보냅니다" onClick={() => void exportExcel()}>{exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}엑셀 내보내기</Button>
        <Button type="button" size="sm" variant="outline" onClick={resetColumnWidths}><RotateCcw className="size-4" />열 너비 초기화</Button>
      </div>
    </div>

    <div className="flex min-h-0 flex-1 flex-col border-y border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2">
        <label className="relative block w-44 shrink-0"><span className="sr-only">DD 전체 열 검색</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="전체 열 검색" className="pl-8" /></label>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="담당" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 담당</SelectItem>{ownerOptions.map((item) => <SelectItem key={item} value={item}>{ownerDisplayName(item)}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 Status</SelectItem>{statusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => { setSearch(""); setOwner(ALL); setStatus(ALL) }}><RotateCcw className="size-4" />초기화</Button>
        <Button type="button" variant={hideClosed ? "default" : "outline"} className="shrink-0" aria-pressed={hideClosed} title="완료, DROP, REJECT 건을 감춥니다" onClick={() => setHideClosed((current) => !current)}>{hideClosed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}진행중만</Button>
        {!editEnabled ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">읽기 전용 · 담당을 선택하면 수정할 수 있습니다</span> : null}
        {intakeNotice ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)]">{intakeNotice}</span> : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted-foreground)]">
          <div className="flex flex-wrap items-center justify-end gap-1" aria-label="DD 열 그룹 표시">
            {GROUPS.map((group) => <button type="button" key={group.key} aria-pressed={openGroups[group.key]} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))} className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-normal transition-colors ${openGroups[group.key] ? "border-transparent text-white" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"}`} style={openGroups[group.key] ? { backgroundColor: group.color } : undefined}>{openGroups[group.key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{group.label}<span className="opacity-75">{group.columns.length}</span></button>)}
          </div>
          <p className="shrink-0 whitespace-nowrap">{filtered.length.toLocaleString("ko-KR")} / {scoped.length.toLocaleString("ko-KR")}행</p>
          <div className="flex shrink-0 items-center gap-2">
            <DataUpload kind="development-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} />
          </div>
        </div>
      </div>

      <div data-route-scroll-root onContextMenu={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("table[data-dd-master-grid], [role=\"menu\"]")) return
        event.preventDefault()
        setRange(null)
        setMenu({ x: event.clientX, y: event.clientY, kind: "bottom" })
      }} className="min-h-0 flex-1 overflow-auto">
        <table data-dd-master-grid onMouseMove={onGridMouseMove} onMouseLeave={() => { if (!moveDragRef.current) setMoveHover(null) }} className="select-none border-separate border-spacing-0 text-left [&_input]:select-text [&_textarea]:select-text">
          <thead className="sticky top-0 z-30 bg-[var(--card)] shadow-sm">
            <tr className="h-6">
              <th rowSpan={3} className="sticky left-0 z-40 border-b border-r border-[var(--border)] bg-[var(--muted)] text-center text-[10px] font-normal text-[var(--muted-foreground)]" style={{ width: ROW_HEADER_WIDTH, minWidth: ROW_HEADER_WIDTH }} />
              {PINNED_COLUMNS.map((column, index) => { const width = widthOf(column); return <th key={column.id} rowSpan={3} onClick={() => toggleColumnSort(column.id)} className={`relative sticky z-40 cursor-pointer border-b border-r border-[var(--border)] px-2 text-xs font-normal text-[var(--muted-foreground)] ${colInRange(column.id) ? "bg-[color-mix(in_srgb,var(--primary)_6%,var(--muted))]" : "bg-[var(--muted)]"} text-center`} style={{ width, minWidth: width, left: pinnedLeft(index) }}><span className="inline-flex items-center gap-1">{column.label}{sortIcon(column.id)}</span><span aria-hidden="true" onMouseDown={(event) => startColumnResize(column, event)} onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th> })}
              {visibleGroups.map((group) => <th key={group.key} colSpan={group.columns.length} rowSpan={group.columns.some((column) => column.sub) ? 1 : 2} className="relative border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-semibold" style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}><span>{group.label}</span>{group.key === "detail" ? <button type="button" aria-label={finishingOpen ? "Finishing 열 접기" : "Finishing 열 펼치기"} aria-pressed={finishingOpen} title={finishingOpen ? "Finishing 열 접기" : "Finishing 열 펼치기"} onClick={(event) => { event.stopPropagation(); setFinishingOpen((current) => !current) }} className="absolute right-3 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none hover:bg-[var(--muted)]">{finishingOpen ? "-" : "+"}</button> : null}<span aria-hidden="true" title={`${group.label} 너비 조절`} onMouseDown={(event) => startGroupResize(group.columns, event)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th>)}
            </tr>
            <tr className="h-6">
              {visibleGroups.filter((group) => group.columns.some((column) => column.sub)).flatMap((group) => subRuns(group.columns).map((run, index) => <th key={`${group.key}-sub-${index}`} colSpan={run.span} className="border-b border-r border-[var(--border)] px-2 text-center text-[10px] font-semibold" style={{ color: run.label ? group.color : "transparent", background: `color-mix(in srgb, ${group.color} ${run.label ? 18 : 12}%, var(--card))` }}>{run.label || "·"}</th>))}
            </tr>
            <tr className="h-8">
              {visibleGroups.flatMap((group) => group.columns.map((column) => { const width = widthOf(column); return <th key={`${group.key}-${column.id}`} onClick={() => toggleColumnSort(column.id)} className={`relative cursor-pointer border-b border-r border-[var(--border)] px-2 text-xs font-normal text-[var(--muted-foreground)] ${colInRange(column.id) ? "bg-[color-mix(in_srgb,var(--primary)_6%,var(--muted))]" : "bg-[var(--muted)]"} ${alignOf(column) === "center" ? "text-center" : "text-left"}`} style={{ width, minWidth: width }}><span className="inline-flex items-center gap-1">{column.label}{sortIcon(column.id)}</span><span aria-hidden="true" onMouseDown={(event) => startColumnResize(column, event)} onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th> }))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
              const warnings = ddWarnings(record)
              const rowStyle = ddStatusStyle(record.devStatus || record.stage)
              const rowId = recordIdentity(record)
              const isRecent = recentIntakeRows.has(rowId)
              const rowDimmed = isClosedRecord(record)
              const isActive = (colId: string) => editCell?.row === rowId && editCell?.col === colId
              const rowIdx = rowIndexOf.get(rowId)
              const rowSelected = rect !== null && rowIdx !== undefined && rowIdx >= rect.top && rowIdx <= rect.bottom
              const wholeRowSelected = rect !== null && rect.left === 0 && rect.right === displayedColumns.length - 1
              const cellSel = (colId: string): CellSel => {
                const empty = { inRange: false, isActive: false, top: false, bottom: false, left: false, right: false, handle: false, moveEdge: false }
                if (!rect || rowIdx === undefined || rowIdx < rect.top || rowIdx > rect.bottom) return empty
                const colIdx = colIndexOf.get(colId)
                if (colIdx === undefined || colIdx < rect.left || colIdx > rect.right) return empty
                return {
                  inRange: true,
                  isActive: range?.focus.row === rowId && range.focus.col === colId,
                  top: rowIdx === rect.top,
                  bottom: rowIdx === rect.bottom,
                  left: colIdx === rect.left && !wholeRowSelected,
                  right: colIdx === rect.right,
                  handle: rowIdx === rect.bottom && colIdx === rect.right,
                  moveEdge: moveHover?.row === rowId && moveHover.col === colId,
                }
              }
              const selectCell = (colId: string) => setCellAnchor(rowId, colId)
              const rowHeaderSel: CellSel = {
                inRange: rowSelected && wholeRowSelected,
                isActive: false,
                top: rowIdx === rect?.top,
                bottom: rowIdx === rect?.bottom,
                left: true,
                right: false,
                handle: false,
                moveEdge: moveHover?.row === rowId && moveHover.col === null,
              }
              return <tr key={rowId}
                data-row-id={rowId}
                onMouseDown={(event) => onRowMouseDown(rowId, event)}
                className="group bg-[var(--card)] transition-colors hover:bg-[var(--accent)]">
                <td data-row-header onContextMenu={(event) => { event.preventDefault(); if (!rowSelected) selectWholeRow(rowId); setMenu({ x: event.clientX, y: event.clientY, kind: "cells" }) }} title="클릭: 행 전체 선택 · 끌기: 여러 행 선택" className={`sticky left-0 z-20 h-8 cursor-pointer select-none border-b border-r border-[var(--border)] text-center text-[10px] tabular-nums ${rowHeaderSel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,transparent)] text-[var(--foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] group-hover:bg-[var(--accent)]"}`} style={{ width: ROW_HEADER_WIDTH, minWidth: ROW_HEADER_WIDTH, boxShadow: selectionShadow(rowHeaderSel), cursor: rowHeaderSel.moveEdge ? "move" : undefined, ...movePreviewStyle(rowIdx, -1, true), ...(rowDimmed && !rowHeaderSel.inRange ? { backgroundColor: DIMMED_ROW_BG } : null) }}>{(rowIdx ?? 0) + 1}</td>
                {PINNED_COLUMNS.map((column, index) => {
                  const left = pinnedLeft(index)
                  const width = widthOf(column)
                  const sel = cellSel(column.id)
                  const preview = inFillPreview(rowIdx, column.id)
                  const stickyBase = `relative sticky z-20 h-8 border-b border-r border-[var(--border)] ${sel.inRange && !sel.isActive ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,transparent)]" : "bg-[var(--card)] group-hover:bg-[var(--accent)]"} ${preview ? "outline outline-1 outline-dashed outline-[var(--grid-selection)]" : ""} ${index === 0 ? `border-l-4 ${rowStyle.row}` : ""}`
                  const cellStyle = { width, minWidth: width, left, boxShadow: selectionShadow(sel), cursor: sel.moveEdge ? "move" : undefined, ...movePreviewStyle(rowIdx, colIndexOf.get(column.id) ?? -1), ...(rowDimmed && !sel.inRange ? { backgroundColor: DIMMED_ROW_BG } : null) }
                  const active = isActive(column.id)
                  if (editEnabled && active) return <td key={column.id} data-col-id={column.id} onClick={(event) => { if (!event.shiftKey) selectCell(column.id) }} className={`${stickyBase} p-0`} style={cellStyle}><InlineEditor record={record} column={column} options={optionsById[column.id] ?? column.options} initial={editSeed} onCommit={(raw, move, fillRange) => void commitCell(record, column, raw, move, fillRange)} onCancel={cancelCellEdit} /><FillHandle visible={editEnabled && sel.handle} onMouseDown={startFill} /></td>
                  if (column.id === "status") return <td key={column.id} data-col-id={column.id} onContextMenu={(event) => openCellMenu(event, rowId, column.id)} onClick={(event) => { if (!event.shiftKey) selectCell(column.id) }} onDoubleClick={editEnabled ? () => beginCellEdit({ row: rowId, col: column.id }) : undefined} className={`${stickyBase} px-1.5`} style={cellStyle}><StatusChip record={record} disabled={!editEnabled} /><FillHandle visible={editEnabled && sel.handle} onMouseDown={startFill} /></td>
                  return <td key={column.id} data-col-id={column.id} onContextMenu={(event) => openCellMenu(event, rowId, column.id)} onDoubleClick={editEnabled ? () => beginCellEdit({ row: rowId, col: column.id }) : undefined} className={`${stickyBase} max-w-0 px-2 text-xs font-normal ${editEnabled ? "cursor-cell" : ""} ${column.mono ? "font-mono" : ""}`} style={cellStyle}>
                    {column.id === "owner"
                      ? <>
                          <span className="block w-full truncate text-center">{text(ownerDisplayName(record.owner))}</span>
                          <div className="pointer-events-none absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 group-hover:pointer-events-auto">
                          <button type="button" title={editEnabled ? "전체 항목 수정" : "전체 항목 보기"} onClick={(event) => { event.stopPropagation(); openEditor(record) }} onDoubleClick={(event) => event.stopPropagation()} className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:opacity-100"><Maximize2 className="size-3.5" /></button>
                          <button type="button" title={editEnabled ? "이 옵션 삭제" : EDIT_DISABLED_MESSAGE} aria-label="이 옵션 삭제" disabled={!editEnabled} onClick={(event) => { event.stopPropagation(); setConfirmDelete([record]) }} onDoubleClick={(event) => event.stopPropagation()} className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--destructive)] hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--muted-foreground)]"><Trash2 className="size-3.5" /></button>
                          </div>
                        </>
                      : column.id === "styleNo"
                        ? <span className="flex items-center gap-1 truncate" title={warnings.map((warning) => warning.label).join(" · ") || undefined}>{isRecent ? <span className="shrink-0 rounded-full bg-[linear-gradient(110deg,#06b6d4,#2563eb_55%,#7c3aed)] px-1.5 py-0.5 text-[8px] font-bold tracking-[0.04em] text-white">신규</span> : null}<span className="truncate">{text(record.styleNo)}</span>{warnings.length ? <TriangleAlert className="size-3.5 shrink-0 text-[var(--destructive)]" /> : null}</span>
                        : <span className="truncate">{text(column.value(record, linked))}</span>}
                    <FillHandle visible={editEnabled && sel.handle} onMouseDown={startFill} />
                  </td>
                })}
                {visibleGroups.flatMap((group) => group.columns.map((column) => {
                  const cs = cellSel(column.id)
                  return <GridCell key={`${group.key}-${column.id}`} record={record} column={column} rowId={rowId} width={widthOf(column)} ledger={linked} active={isActive(column.id)}
                    selIn={cs.inRange} selActive={cs.isActive} selTop={cs.top} selBottom={cs.bottom} selLeft={cs.left} selRight={cs.right} selHandle={cs.handle} selMoveEdge={cs.moveEdge}
                    fillPreview={inFillPreview(rowIdx, column.id)} dimmed={rowDimmed} moveStyle={movePreviewStyle(rowIdx, colIndexOf.get(column.id) ?? -1)}
                    options={optionsById[column.id] ?? column.options} editSeed={editSeed} editEnabled={editEnabled} actions={gridActions} />
                }))}
              </tr>
            })}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-12 text-center text-sm text-[var(--muted-foreground)]">{scoped.length ? "조건에 맞는 DD 행이 없습니다." : "DD를 업로드하거나 신규 작지를 접수해 현황판을 시작하세요."}</div> : null}
        <div data-grid-bottom-area aria-hidden="true" className="h-28 min-w-full" />
      </div>

      {clipNotice ? <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-medium text-[var(--background)] shadow-lg">{clipNotice}</div> : null}

      {menu ? <>
        <div className="fixed inset-0 z-[90]" onMouseDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null) }} />
        <div role="menu" className="fixed z-[91] min-w-44 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] py-1 text-sm shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - (menu.kind === "bottom" ? 100 : 210)) }}>
          {(menu.kind === "bottom" ? [
            { key: "append-one", label: "행 1개 추가", hint: "목록 맨 아래", icon: <Plus className="size-3.5" />, run: () => void appendBlankRows(1), disabled: !editEnabled },
            { key: "append-five", label: "행 5개 추가", hint: "목록 맨 아래", icon: <Rows3 className="size-3.5" />, run: () => void appendBlankRows(5), disabled: !editEnabled },
          ] : [
            { key: "copy", label: "복사", hint: "Ctrl+C", icon: <Copy className="size-3.5" />, run: () => void copyRange(), disabled: false },
            { key: "cut", label: "잘라내기", hint: "Ctrl+X", icon: <Scissors className="size-3.5" />, run: () => void copyRange(true), disabled: !editEnabled },
            { key: "paste", label: "붙여넣기", hint: "Ctrl+V", icon: <ClipboardPaste className="size-3.5" />, run: () => void pasteRange(), disabled: !editEnabled },
            { key: "insert", label: "복사한 행 삽입", hint: "아래에 추가", icon: <Rows3 className="size-3.5" />, run: () => void insertCopiedRows(), disabled: !editEnabled },
            { key: "insert-above", label: "위에 행 삽입", hint: "선택 행 수만큼", icon: <Rows3 className="size-3.5" />, run: () => void insertBlankRows("above"), disabled: !editEnabled },
            { key: "insert-below", label: "아래에 행 삽입", hint: "선택 행 수만큼", icon: <Rows3 className="size-3.5" />, run: () => void insertBlankRows("below"), disabled: !editEnabled },
            { key: "delete-row", label: "행 삭제", hint: "선택 행 전체", icon: <Trash2 className="size-3.5" />, run: requestDeleteSelectedRows, disabled: !editEnabled },
            { key: "clear", label: "내용 지우기", hint: "Delete", icon: <Eraser className="size-3.5" />, run: () => void clearRange(), disabled: !editEnabled },
            { key: "row", label: "행 전체 선택", hint: "Shift+Space", icon: <Rows3 className="size-3.5" />, run: () => { if (range) selectWholeRow(range.focus.row) }, disabled: false },
          ]).map((item) => <button key={item.key} type="button" role="menuitem" disabled={item.disabled} title={item.disabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => { setMenu(null); item.run() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
            <span className="text-[var(--muted-foreground)]">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">{item.hint}</span>
          </button>)}
          {menu.kind === "cells" ? <><div className="my-1 h-px bg-[var(--border)]" />
          <button type="button" role="menuitem" disabled={!undoStack.length} onClick={() => { setMenu(null); void undoLast() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40">
            <span className="text-[var(--muted-foreground)]"><Undo2 className="size-3.5" /></span>
            <span className="flex-1">되돌리기</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">Ctrl+Z</span>
          </button>
          <button type="button" role="menuitem" disabled={!redoStack.length} onClick={() => { setMenu(null); void redoLast() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40">
            <span className="text-[var(--muted-foreground)]"><Redo2 className="size-3.5" /></span>
            <span className="flex-1">다시 실행</span>
            <span className="text-[11px] text-[var(--muted-foreground)]">Ctrl+Y</span>
          </button></> : null}
        </div>
      </> : null}
    </div>

    <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
      <DialogContent className="w-[92vw] max-w-lg">
        <DialogHeader className="py-2.5">
          <DialogTitle>찾기 · 바꾸기</DialogTitle>
          <DialogDescription>부분 문자열을 찾아 한 번에 바꿉니다. 수식과 샘플대장 연결 열은 제외됩니다.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="dd-find">찾을 내용</Label><Input id="dd-find" autoFocus value={findValue} onChange={(event) => setFindValue(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="dd-replace">바꿀 내용</Label><Input id="dd-replace" value={replaceValue} onChange={(event) => setReplaceValue(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label>대상</Label><Select value={replaceScope} onValueChange={(value) => setReplaceScope(value as "selection" | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selection" disabled={!rect}>선택 영역</SelectItem><SelectItem value="all">전체</SelectItem></SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]"><input type="checkbox" checked={replaceMatchCase} onChange={(event) => setReplaceMatchCase(event.target.checked)} className="size-4 accent-[var(--primary)]" />대소문자 구분</label>
        </DialogBody>
        <DialogFooter className="gap-1.5 py-2.5">
          <Button type="button" size="sm" variant="outline" onClick={() => setReplaceOpen(false)}>닫기</Button>
          <Button type="button" size="sm" disabled={!editEnabled} title={!editEnabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => void replaceAllMatches()}>모두 바꾸기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 신규 작지 접수 — 결과/DATA/REVIEW 없음. REQUEST·ORIGINAL 공통, DETAIL·SCHEDULE 옵션별. */}
    <Dialog open={Boolean(intake)} onOpenChange={(open) => { if (!open) closeIntake() }}>
      <DialogContent className="w-[97vw] max-w-none xl:w-[1490px]">
        {intake && sharedDraft && optionDraft ? <>
          <DialogHeader className="py-2.5">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle>신규 작지 접수</DialogTitle>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${ddStatusStyle("진행중").block}`}><span className="size-1.5 rounded-full bg-sky-500" />진행중</span>
              <Badge variant="outline" className="font-normal">옵션 {intake.length}건</Badge>
            </div>
            <DialogDescription>REQUEST·ORIGINAL 분석은 옵션 공통, 개발 DETAIL·공정 SCHEDULE은 옵션(색상)별로 입력합니다. 작업지시서를 첨부하면 자동으로 채워집니다.</DialogDescription>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={zajiInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void onAttachFile(event.target.files?.[0])} />
                <Button type="button" size="sm" variant="outline" onClick={() => zajiInputRef.current?.click()} disabled={attaching}>{attaching ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}작업지시서 첨부</Button>
                {attached ? <span className="font-mono text-xs text-[var(--muted-foreground)]">{attached.subFmt} · {attached.number} · 옵션 {attached.options.length}건{attached.dupRemoved ? ` · 중복 ${attached.dupRemoved} 제거` : ""}</span> : <span className="text-xs text-[var(--muted-foreground)]">GD 작지(Fabric sample request report .xlsx)를 지원합니다.</span>}
              </div>
              {attachError ? <p className="text-xs text-[var(--destructive)]">{attachError}</p> : null}
            </div>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-2.5">
              <EditorGroup label="담당 · Style (옵션 공통)" color="var(--chart-1)" columns={INTAKE_CORE} draft={sharedDraft} onChange={changeShared} optionsById={optionsById} requiredIds={INTAKE_REQUIRED_IDS} />
              <EditorGroup label="개발 REQUEST (옵션 공통)" color={groupByKey("request").color} columns={INTAKE_REQUEST} draft={sharedDraft} onChange={changeShared} optionsById={optionsById} requiredIds={INTAKE_REQUIRED_IDS} />
              <EditorGroup label="ORIGINAL 분석 (옵션 공통)" color={groupByKey("original").color} columns={INTAKE_ORIGINAL} draft={sharedDraft} onChange={changeShared} optionsById={optionsById} requiredIds={INTAKE_REQUIRED_IDS} />
            </div>
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-2.5">
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-[var(--muted-foreground)]">옵션(색상)별 개발·공정</span>
                {intake.map((record, index) => <span key={index} className="inline-flex items-center">
                  <button type="button" onClick={() => setIntakeOpt(index)} className={`rounded-l-full border py-0.5 pl-2.5 pr-2 text-[11px] transition-colors ${index === intakeOpt ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"} ${intake.length > 1 ? "" : "rounded-r-full pr-2.5"}`}>{index + 1}. {record.color || "색상 미지정"}</button>
                  {intake.length > 1 ? <button type="button" title="옵션 삭제" onClick={() => removeOption(index)} className={`rounded-r-full border border-l-0 px-1 py-0.5 transition-colors ${index === intakeOpt ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--destructive)] hover:text-white"}`}><X className="size-3" /></button> : null}
                </span>)}
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={addOption}><Plus className="size-3.5" />옵션 추가</Button>
              </div>
              <div className="space-y-2.5">
                <EditorGroup label={`개발 DETAIL · 옵션 ${intakeOpt + 1}`} color={DETAIL_GROUP.color} columns={DETAIL_GROUP.columns} draft={optionDraft} onChange={changeOption} optionsById={optionsById} />
                <EditorGroup label={`공정 SCHEDULE · 옵션 ${intakeOpt + 1}`} color={SCHEDULE_GROUP.color} columns={SCHEDULE_GROUP.columns} draft={optionDraft} onChange={changeOption} optionsById={optionsById} layout={SCHEDULE_GROUP.editorLayout} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="gap-1.5 py-2.5">
            {intakeError ? <span role="alert" className="mr-auto text-xs text-[var(--destructive)]">{intakeError}</span> : <span className="mr-auto text-xs text-[var(--muted-foreground)]">저장 시 옵션 {intake.length}건이 각각 현황판 행으로 등록됩니다.</span>}
            <Button type="button" size="sm" variant="outline" onClick={closeIntake}>취소</Button>
            <Button type="button" size="sm" disabled={savingIntake} onClick={() => void saveIntake()}>{savingIntake ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{savingIntake ? "중복 확인·등록 중" : `작지 접수 등록 (${intake.length}건)`}</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>

    {/* 전체 항목 수정(64열) — 담당 칸의 확대 아이콘으로 진입. 데이터 입력 화면. */}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) closeEditor() }}>
      <DialogContent className="w-[97vw] max-w-none xl:w-[1490px]">
        {editing ? <>
          <DialogHeader className="py-2.5">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle className="font-mono">{editing.styleNo || "작지 수정"}</DialogTitle>
              {(() => { const style = ddStatusStyle(editing.devStatus || editing.stage); return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${style.block}`}><span className={`size-1.5 rounded-full ${style.dot}`} />{style.label}</span> })()}
              {ledgerStatus(editingLedger)}
            </div>
            <DialogDescription>{editEnabled ? `DD 원본 행 ${editing._src.sheet === "웹 접수" ? "· 웹 접수" : editing._src.row} · 수식 열은 자동 계산되며 나머지는 직접 수정합니다.` : "읽기 전용 · 담당을 선택하면 수정할 수 있습니다."}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2.5">
            <EditorGroup label="고정 핵심" color="var(--chart-1)" columns={PINNED_COLUMNS} draft={editing} onChange={setEditing} optionsById={optionsById} readOnly={!editEnabled} />
            {GROUPS.filter((group) => group.key !== "ledger").map((group) => <EditorGroup key={group.key} label={group.label} color={group.color} columns={group.columns} draft={editing} onChange={setEditing} optionsById={optionsById} layout={group.editorLayout} readOnly={!editEnabled} />)}
          </DialogBody>
          <DialogFooter className="gap-1.5 py-2.5">
            <Button type="button" size="sm" variant="outline" onClick={closeEditor}>취소</Button>
            <Button type="button" size="sm" disabled={!editEnabled} title={!editEnabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => void saveEditor()}><Save className="size-4" />변경 저장</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>

    {/* 행(샘플 옵션) 삭제 확인 */}
    <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
      <DialogContent className="w-[92vw] max-w-md">
        {confirmDelete?.length ? <>
          <DialogHeader className="py-2.5">
            <DialogTitle>{confirmDelete.length > 1 ? `${confirmDelete.length}개 행 삭제` : "샘플 옵션 삭제"}</DialogTitle>
            <DialogDescription>
              {confirmDelete.length === 1 ? <><span className="font-mono text-[var(--foreground)]">{confirmDelete[0].styleNo || "무제"}</span>{confirmDelete[0].color ? ` · ${confirmDelete[0].color}` : ""}{confirmDelete[0].opt ? ` · 옵션 ${confirmDelete[0].opt}` : ""} 행을 현황판에서 삭제합니다.</> : `선택한 ${confirmDelete.length}개 행을 현황판에서 삭제합니다.`} 삭제 후 되돌리기를 사용할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-1.5 py-2.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>취소</Button>
            <Button type="button" size="sm" variant="destructive" disabled={!editEnabled} title={!editEnabled ? EDIT_DISABLED_MESSAGE : undefined} onClick={() => void confirmDeleteRecord()}><Trash2 className="size-4" />삭제</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
  </div>
}
