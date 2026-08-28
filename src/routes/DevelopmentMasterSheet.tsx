import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Columns3, GripVertical, Loader2, Maximize2, Paperclip, Plus, RotateCcw, Save, Search, Trash2, TriangleAlert, X } from "lucide-react"
import { Popover } from "radix-ui"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataUpload } from "@/components/upload/DataUpload"
import { FABRIC_STATUS_META, buildFabricLedger, type FabricLedgerItem } from "@/data/fabric-ledger"
import { createBlankDevRecord, DD_CATEGORY_OPTIONS, DD_COMPANY_OPTIONS, DD_DYEING_OPTIONS, DD_PASS_FAIL_OPTIONS, DD_SEASON_OPTIONS, DD_STATUS_OPTIONS, ddStatusStyle, ddWarnings } from "@/data/dd-workflow"
import { fmtDateFull, toDate } from "@/data/format"
import { dayToneText, holidayName } from "@/data/holidays"
import { ingestDevelopment, ingestSamples } from "@/data/upload"
import { applyZajiHeader, parseZaji, zajiToRecord, type Zaji } from "@/data/zaji"
import { MEMBERS, ownerDisplayName, type DevRecord, type DevTechnical } from "@/data/schema"
import { deleteDevelopmentRecord, reorderDevelopmentRecords, saveDevelopmentIntakeRecords, saveDevelopmentRecord, useAppStore } from "@/store/useAppStore"

const ALL = "__all__"
const COL_WIDTHS_STORAGE_KEY = "dd-col-widths"
const MIN_COLUMN_WIDTH = 56

/** 현재 재직 중인 메인 개발 담당(팀장 제외). 본인 개발건 우선 확인용 네임카드에 쓴다. */
const MAIN_DEVELOPERS: string[] = MEMBERS.filter((member) => member.role !== "팀장").map((member) => member.name)

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

const text = (value: CellValue): string => value === null || value === undefined || value === "" ? "—" : String(value)
const dateText = (value: CellValue): string => value ? fmtDateFull(String(value)) : "—"

function ledgerStatus(ledger: FabricLedgerItem | null): ReactNode {
  if (!ledger) return <span className="text-[var(--muted-foreground)]">미연결</span>
  const meta = FABRIC_STATUS_META[ledger.status]
  return <Badge variant="outline" className="gap-1.5 whitespace-nowrap bg-[var(--background)] font-normal"><span className={`size-2 rounded-full ${meta.tone}`} />{meta.label}</Badge>
}

const PINNED_COLUMNS: MasterColumn[] = [
  { id: "owner", label: "담당", width: 118, suggest: true, value: (row) => row.owner },
  { id: "status", label: "Status", width: 108, options: DD_STATUS_OPTIONS, value: (row) => row.devStatus || row.stage },
  { id: "styleNo", label: "Style No.", width: 140, mono: true, value: (row) => row.styleNo },
]

const GROUPS: MasterGroup[] = [
  {
    key: "request", label: "개발 REQUEST", color: "var(--chart-1)", columns: [
      { id: "opt", label: "# of Opt", width: 68, mono: true, align: "center", value: (row) => row.opt },
      { id: "season", label: "Season", width: 82, value: (row) => row.season, options: DD_SEASON_OPTIONS },
      { id: "buyer", label: "Buyer", width: 104, suggest: true, value: (row) => row.buyer },
      { id: "category", label: "Category", width: 104, value: (row) => row.category, options: DD_CATEGORY_OPTIONS },
      { id: "planner", label: "Planner", width: 92, suggest: true, value: (row) => row.planner },
      { id: "requestDate", label: "Request Date", width: 108, date: true, value: (row) => row.requestDate },
      { id: "dueDate", label: "Due Date", width: 108, date: true, value: (row) => row.dueDate, render: (row) => <span className={ddWarnings(row).some((item) => item.key === "due") ? "text-[var(--destructive)]" : ""}>{dateText(row.dueDate)}</span> },
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
      { id: "yarnMill", label: "업체", width: 108, sub: "원사", value: (row) => row.tech?.mills?.yarn },
      { id: "yarnStatus", label: "완료일", width: 104, sub: "원사", value: (row) => row.tech?.processDates?.yarn },
      { id: "knittingMill", label: "업체", width: 108, sub: "편직", value: (row) => row.tech?.mills?.knitting },
      { id: "knittingStatus", label: "완료일", width: 104, sub: "편직", value: (row) => row.tech?.processDates?.knitting },
      { id: "dyeingMill", label: "업체", width: 108, sub: "염색", value: (row) => row.tech?.mills?.dyeing },
      { id: "dyeingStatus", label: "완료일", width: 104, sub: "염색", value: (row) => row.tech?.processDates?.dyeing },
      { id: "finishingMill", label: "업체", width: 108, sub: "가공", value: (row) => row.tech?.mills?.finishing },
      { id: "finishingStatus", label: "완료일", width: 104, sub: "가공", value: (row) => row.tech?.processDates?.finishing },
    ],
  },
  {
    key: "result", label: "결과 RESULT", color: "var(--chart-2)", columns: [
      { id: "receivedDate", label: "Received Date", width: 114, date: true, value: (row) => row.receivedDate },
      { id: "flNo", label: "FL#", width: 116, mono: true, value: (row) => row.flNo, render: (row) => row.flNo ? <span className="font-mono">{row.flNo}</span> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미입력</span> : "—" },
      { id: "optionProgress", label: "옵션 완료", width: 96, align: "center", value: (row) => row.tech?.optionProgress },
      { id: "review", label: "Review", width: 176, value: (row) => row.tech?.review },
    ],
  },
  {
    key: "data", label: "DATA", color: "var(--chart-4)", editorLayout: "data", columns: [
      { id: "actualWidth", label: "폭", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.width },
      { id: "actualWeight", label: "중량", width: 84, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.weight },
      { id: "actualBalance", label: "Balance", width: 92, sub: "실측", align: "right", number: true, value: (row) => row.tech?.actual?.balance, render: (row) => { const balance = row.tech?.actual?.balance; return balance === null || balance === undefined ? "—" : `${balance >= 0 ? "+" : ""}${balance.toFixed(1)}%` } },
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
      { id: "ledgerUpdated", label: "웹 최종 변경", width: 136, value: (_row, ledger) => ledger?.updatedAt, render: (_row, ledger) => ledger?.updatedAt ? new Date(ledger.updatedAt).toLocaleString("ko-KR") : "—" },
    ],
  },
]

const DEFAULT_OPEN: Record<GroupKey, boolean> = { request: true, original: false, detail: true, schedule: true, result: true, data: false, history: false, ledger: true }
const GROUP_COLUMNS = GROUPS.flatMap((group) => group.columns)
const GROUP_COLUMN_IDS = new Set(GROUP_COLUMNS.map((column) => column.id))
// 핀 고정 열도 그룹(고정 핵심)처럼 너비 조절·저장 대상에 포함한다.
const RESIZABLE_COLUMNS = [...PINNED_COLUMNS, ...GROUP_COLUMNS]
const RESIZABLE_COLUMN_IDS = new Set(RESIZABLE_COLUMNS.map((column) => column.id))
const LEFT_ALIGN_IDS = new Set([
  "styleNo", "developmentNo", "arrangeNo", "yarnDetail", "construction", "color", "remark",
  "receivedDate", "flNo", "review", "failReason", "styleHistory",
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

const COMPUTED_COLUMN_IDS = new Set(["opt", "optionProgress", "actualBalance"])

const TECH_PATHS: Record<string, string[]> = {
  origBrand: ["original", "brand"], origContents: ["original", "contents"], origConstruction: ["original", "construction"], origWeight: ["original", "weight"], origYarn: ["original", "yarn"], origComments: ["original", "comments"],
  developer: ["development", "developer"], co: ["development", "co"], developmentNo: ["development", "developmentNo"], arrangeNo: ["arrangeNo"], yarnDetail: ["yarnDetail"],
  finishingA: ["finishingSlots", "a"], finishingB: ["finishingSlots", "b"], finishingC: ["finishingSlots", "c"], finishingD: ["finishingSlots", "d"],
  yarnMill: ["mills", "yarn"], yarnStatus: ["processDates", "yarn"], knittingMill: ["mills", "knitting"], knittingStatus: ["processDates", "knitting"], dyeingMill: ["mills", "dyeing"], dyeingStatus: ["processDates", "dyeing"], finishingMill: ["mills", "finishing"], finishingStatus: ["processDates", "finishing"],
  optionProgress: ["optionProgress"], review: ["review"], actualWidth: ["actual", "width"], actualWeight: ["actual", "weight"], actualBalance: ["actual", "balance"], shrinkageLength: ["actual", "shrinkageLength"], shrinkageWidth: ["actual", "shrinkageWidth"],
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
  const value: string | number | null = column.number ? (raw.trim() === "" ? null : Number(raw)) : raw
  switch (column.id) {
    case "owner": return { ...record, owner: raw }
    case "status": return { ...record, devStatus: raw }
    case "styleNo": return { ...record, styleNo: raw }
    case "season": return { ...record, season: raw }
    case "buyer": return { ...record, buyer: raw }
    case "category": return { ...record, category: raw }
    case "planner": return { ...record, planner: raw }
    case "requestDate": return { ...record, requestDate: raw }
    case "dueDate": return { ...record, dueDate: raw }
    case "construction": return { ...record, construction: raw }
    case "targetWeight": return { ...record, weight: raw === "" ? "" : Number(raw) }
    case "color": return { ...record, color: raw }
    case "dyeing": return { ...record, dyeing: raw }
    case "remark": return { ...record, note: raw }
    case "receivedDate": return { ...record, receivedDate: raw }
    case "flNo": return { ...record, flNo: raw }
  }
  const path = TECH_PATHS[column.id]
  if (!path) return record
  const tech = structuredClone(record.tech ?? {}) as DevTechnical
  setNested(tech as unknown as Record<string, unknown>, path, value === "" ? undefined : value)
  if (column.id === "co") {
    const devType = raw === "GD" ? "GD" : raw === "국내" ? "국내" : undefined
    return { ...record, tech, devType }
  }
  if (column.id === "developmentNo") {
    return { ...record, tech, gdNo: record.tech?.development?.co === "GD" ? raw : record.gdNo, saNo: record.tech?.development?.co === "국내" ? raw : record.saNo }
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
  initialOpen?: boolean
  triggerClassName?: string
}

/** 포털로 렌더링하는 로컬 기준 월간 달력. 그리드 스크롤 컨테이너에 잘리지 않는다. */
function DatePickerPopover({ value, disabled = false, invalid = false, onChange, onCancel, initialOpen = false, triggerClassName = "" }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(initialOpen)
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
        <span className="min-w-0 flex-1 truncate">{value || "날짜 선택"}</span>
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

/** 모달 날짜 필드도 동일한 포털 캘린더로 표시한다. */
function DateInput({ value, disabled, invalid, onChange }: { value: string; disabled?: boolean; invalid?: boolean; onChange: (raw: string) => void }) {
  return <DatePickerPopover value={value} disabled={disabled} invalid={invalid} onChange={onChange} triggerClassName={`h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${invalid ? "ring-1 ring-[var(--destructive)]" : ""}`} />
}

function EditorField({ column, draft, onChange, optionsById, requiredIds }: { column: MasterColumn; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; requiredIds?: ReadonlySet<string> }) {
  const value = String(column.value(draft, null) ?? "")
  const disabled = COMPUTED_COLUMN_IDS.has(column.id)
  const required = requiredIds?.has(column.id) ?? false
  const invalid = required && !value.trim()
  const set = (raw: string) => onChange(updateRecordCell(draft, column, raw))
  const baseOptions = optionsById[column.id] ?? column.options
  // 작지 자동 채움 값이 정규 목록에 없어도 드롭다운에 표시되도록 앞에 끼워 넣는다.
  const options = baseOptions && value && !baseOptions.includes(value) ? [value, ...baseOptions] : baseOptions
  const invalidClass = invalid ? "ring-1 ring-[var(--destructive)]" : ""
  const label = <Label className="truncate text-xs text-[var(--muted-foreground)]">{column.label}{required ? <span className="text-[var(--destructive)]"> *</span> : null}{disabled ? " ·수식" : ""}</Label>
  if (column.date) return <div className="grid min-w-0 gap-1">{label}<DateInput value={value} disabled={disabled} invalid={invalid} onChange={set} /></div>
  if (options && options.length && !column.suggest) return <div className="grid min-w-0 gap-1">{label}<Select value={value || ALL} onValueChange={(next) => set(next === ALL ? "" : next)} disabled={disabled}><SelectTrigger aria-invalid={invalid} className={`text-sm ${invalidClass}`}><SelectValue placeholder="선택" /></SelectTrigger><SelectContent><SelectItem value={ALL}>미입력</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
  if (column.suggest) return <div className="grid min-w-0 gap-1">{label}<Input list={`dl-${column.id}`} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${invalidClass}`} /><datalist id={`dl-${column.id}`}>{(options ?? []).map((option) => <option key={option} value={option} />)}</datalist></div>
  return <div className="grid min-w-0 gap-1">{label}<Input type={column.number ? "number" : "text"} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${disabled ? "bg-[var(--muted)]" : ""} ${invalidClass}`} /></div>
}

/** 에디터 병합 단위 카드(공정·단계). 같은 sub 필드를 한 박스로 묶어 엑셀 병합셀처럼 보이게 한다. */
function SubCard({ label, color, columns, draft, onChange, optionsById, requiredIds }: { label: string; color?: string; columns: MasterColumn[]; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; requiredIds?: ReadonlySet<string> }) {
  return <div className="rounded-md border border-[var(--border)] p-2.5" style={color ? { background: `color-mix(in srgb, ${color} 6%, var(--card))`, borderColor: `color-mix(in srgb, ${color} 30%, var(--border))` } : undefined}><p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide" style={color ? { color } : undefined}>{label}</p><div className="grid grid-cols-2 gap-2">{columns.map((column) => <EditorField key={column.id} column={column} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} />)}</div></div>
}

/** 그리드에서 Status 를 색 블럭 칩으로 바로 바꾼다(변경 즉시 저장). */
function StatusChip({ record }: { record: DevRecord }) {
  const current = record.devStatus || record.stage || ""
  const style = ddStatusStyle(current)
  const change = (next: string) => { void saveDevelopmentRecord({ ...record, devStatus: next }, recordIdentity(record)) }
  return <Select value={DD_STATUS_OPTIONS.includes(current as (typeof DD_STATUS_OPTIONS)[number]) ? current : ""} onValueChange={change}>
    <SelectTrigger className={`h-6 w-full gap-1 rounded-md border-0 px-2 text-[11px] font-normal shadow-none focus:ring-1 focus:ring-[var(--ring)] ${style.block}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="truncate">{style.label}</span>
    </SelectTrigger>
    <SelectContent>{DD_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
  </Select>
}

const LEDGER_COL_IDS = new Set(["ledgerStatus", "storageNo", "sourceSheet", "ledgerUpdated"])
/** 고정값(수식·샘플대장 연결)은 그리드에서 직접 수정하지 않는다. */
const isFixedColumn = (column: MasterColumn): boolean => COMPUTED_COLUMN_IDS.has(column.id) || LEDGER_COL_IDS.has(column.id)

/** 그리드 셀 인라인 편집기. 선택형=드롭다운, 날짜=데이트피커, 그 외=수기(제안 목록 포함). */
function InlineEditor({ record, column, options, onCommit, onCancel }: { record: DevRecord; column: MasterColumn; options?: readonly string[]; onCommit: (raw: string) => void; onCancel: () => void }) {
  const value = String(column.value(record, null) ?? "")
  const cls = "h-8 w-full rounded-none border-0 bg-[var(--card)] px-1.5 text-xs text-[var(--foreground)] outline-none ring-2 ring-inset ring-[var(--ring)]"
  const opts = options && options.length ? options : undefined
  if (column.date) {
    return <DatePickerPopover value={value} initialOpen onChange={onCommit} onCancel={onCancel} triggerClassName={cls} />
  }
  if (opts && !column.suggest) {
    return <select autoFocus defaultValue={value} className={cls} onChange={(event) => onCommit(event.target.value)} onBlur={onCancel} onKeyDown={(event) => { if (event.key === "Escape") onCancel() }}>
      <option value="">—</option>
      {value && !opts.includes(value) ? <option value={value}>{value}</option> : null}
      {opts.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  }
  const listId = `inline-${column.id}`
  return <><input autoFocus type={column.number ? "number" : "text"} defaultValue={value} list={column.suggest ? listId : undefined} className={cls} onBlur={(event) => onCommit(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); else if (event.key === "Escape") onCancel() }} />{column.suggest && opts ? <datalist id={listId}>{opts.map((option) => <option key={option} value={option} />)}</datalist> : null}</>
}

/** 데이터 셀. 더블클릭 시 인라인 편집(고정값은 음영·수정 불가). */
function GridCell({ record, column, width, ledger, active, highlighted, selected, options, onSelect, onEdit, onCommit, onCancel }: { record: DevRecord; column: MasterColumn; width: number; ledger: FabricLedgerItem | null; active: boolean; highlighted: boolean; selected: boolean; options?: readonly string[]; onSelect: () => void; onEdit: () => void; onCommit: (raw: string) => void; onCancel: () => void }) {
  const fixed = isFixedColumn(column)
  const align = `${alignOf(column) === "center" ? "text-center" : "text-left"} ${column.number ? "tabular-nums" : ""}`
  const highlight = highlighted ? "bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]" : ""
  const selectionRing = selected ? "ring-2 ring-inset ring-[var(--ring)]" : ""
  if (active && !fixed) {
    return <td onClick={onSelect} className={`h-8 border-b border-r border-[var(--border)] p-0 ${align} ${highlight} ${selectionRing}`} style={{ width, minWidth: width }}><InlineEditor record={record} column={column} options={options} onCommit={onCommit} onCancel={onCancel} /></td>
  }
  const content = column.render ? column.render(record, ledger) : column.date ? dateText(column.value(record, ledger)) : text(column.value(record, ledger))
  return <td title={typeof content === "string" ? content : undefined} onClick={onSelect} onDoubleClick={fixed ? undefined : onEdit} className={`h-8 max-w-0 truncate border-b border-r border-[var(--border)] px-2 text-xs font-normal ${column.mono ? "font-mono" : ""} ${align} ${highlight} ${selectionRing} ${fixed ? `${highlight ? "" : "bg-[color-mix(in_srgb,var(--muted)_30%,transparent)]"} text-[var(--muted-foreground)]` : "cursor-cell hover:bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]"}`} style={{ width, minWidth: width }}>{content}</td>
}

function EditorGroup({ label, color, columns, draft, onChange, optionsById, layout, requiredIds }: { label: string; color?: string; columns: MasterColumn[]; draft: DevRecord; onChange: (next: DevRecord) => void; optionsById: Record<string, readonly string[]>; layout?: "schedule" | "data"; requiredIds?: ReadonlySet<string> }) {
  const accent = color ?? "var(--muted-foreground)"
  const blocks = groupSubBlocks(columns)
  const field = (column: MasterColumn) => <EditorField key={column.id} column={column} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} />

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
        ? <div key={`${block.sub}-${index}`} className="mb-2 break-inside-avoid"><SubCard label={block.sub} color={color} columns={block.columns} draft={draft} onChange={onChange} optionsById={optionsById} requiredIds={requiredIds} /></div>
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
  const samples = useAppStore((state) => state.completed)
  const overrides = useAppStore((state) => state.fabricOverrides)
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides), [overrides, records, samples])
  const ledgerByRecord = useMemo(() => new Map(ledger.flatMap((item) => item.record ? [[recordIdentity(item.record), item] as const] : [])), [ledger])
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN)
  const [search, setSearch] = useState("")
  const [owner, setOwner] = useState(ALL)
  const [status, setStatus] = useState(ALL)
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
  const [selected, setSelected] = useState<{ row: string; col: string } | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColumnWidths)
  const [confirmDelete, setConfirmDelete] = useState<DevRecord | null>(null)  // 행 삭제 확인
  const [armedRow, setArmedRow] = useState<string | null>(null)               // 드래그 손잡이 눌린 행
  const [dragRow, setDragRow] = useState<string | null>(null)                 // 끌고 있는 행
  const [dragOverRow, setDragOverRow] = useState<string | null>(null)         // 드롭 대상 행
  const zajiInputRef = useRef<HTMLInputElement>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => resizeCleanupRef.current?.(), [])
  useEffect(() => {
    const clearSelected = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null) }
    window.addEventListener("keydown", clearSelected)
    return () => window.removeEventListener("keydown", clearSelected)
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
  const visibleGroups = GROUPS.filter((group) => openGroups[group.key])
  const displayedColumns = [...PINNED_COLUMNS, ...visibleGroups.flatMap((group) => group.columns)]
  const editingLedger = editing ? ledgerByRecord.get(recordIdentity(editing)) ?? null : null

  // 기본 순서(수동 순서 → 접수일 오래된 순). 방금 접수한 행 강조는 여기에 반영하지 않는다.
  const ordered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return scoped.filter((record) => {
      if (owner !== ALL && record.owner !== owner) return false
      if (status !== ALL && (record.devStatus || record.stage) !== status) return false
      if (!query) return true
      const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
      return allColumns.some((column) => String(column.value(record, linked) ?? "").toLocaleLowerCase("ko-KR").includes(query))
        || String(record.tech?.development?.developer ?? "").toLocaleLowerCase("ko-KR").includes(query)
    }).map((record, index) => ({ record, index }))
      .sort((a, b) => compareManualOrder(a.record, b.record) || a.index - b.index)
      .map(({ record }) => record)
  }, [allColumns, ledgerByRecord, owner, scoped, search, status])

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
  const pinnedLeft = (index: number) => PINNED_COLUMNS.slice(0, index).reduce((sum, column) => sum + widthOf(column), 0)
  const pinnedTotal = PINNED_COLUMNS.reduce((sum, column) => sum + widthOf(column), 0)

  // 드래그 재배치는 필터가 없는 전체 목록에서만 허용한다(부분 목록 재배치 방지).
  const dragEnabled = !categoryScope && owner === ALL && status === ALL && !search.trim()
  const handleRowDrop = (targetId: string) => {
    if (!dragRow || dragRow === targetId) return
    // 신규 강조로 끌어올린 위치가 아니라 기본 순서를 기준으로 저장한다.
    const order = ordered.map((record) => recordIdentity(record))
    const from = order.indexOf(dragRow)
    const to = order.indexOf(targetId)
    if (from === -1 || to === -1) return
    order.splice(to, 0, order.splice(from, 1)[0])
    void reorderDevelopmentRecords(order)
  }
  const endRowDrag = () => { setArmedRow(null); setDragRow(null); setDragOverRow(null) }

  const applyPreset = (preset: "core" | "process" | "all") => {
    if (preset === "all") setOpenGroups({ request: true, original: true, detail: true, schedule: true, result: true, data: true, history: true, ledger: true })
    else if (preset === "process") setOpenGroups({ request: true, original: false, detail: true, schedule: true, result: true, data: false, history: false, ledger: true })
    else setOpenGroups(DEFAULT_OPEN)
  }

  const resetAttach = () => { setAttached(null); setAttachError(null); setAttaching(false) }
  const openEditor = (record: DevRecord) => { setEditing(structuredClone(record)); setEditCell(null) }
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
    if (!editing) return
    await saveDevelopmentRecord(editing, recordIdentity(editing))
    closeEditor()
  }
  const commitCell = async (record: DevRecord, column: MasterColumn, raw: string) => {
    setEditCell(null)
    const next = updateRecordCell(record, column, raw)
    if (next !== record) await saveDevelopmentRecord(next, recordIdentity(record))
  }
  const confirmDeleteRecord = async () => {
    if (!confirmDelete) return
    await deleteDevelopmentRecord(recordIdentity(confirmDelete))
    setConfirmDelete(null)
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-2 -mx-4 sm:-mx-6 lg:-mx-8">
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
        <Button type="button" size="sm" variant="outline" onClick={resetColumnWidths}><RotateCcw className="size-4" />열 너비 초기화</Button>
      </div>
    </div>

    <div className="flex min-h-0 flex-1 flex-col border-y border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2">
        <label className="relative block w-44 shrink-0"><span className="sr-only">DD 전체 열 검색</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="전체 열 검색" className="pl-8" /></label>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="담당" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 담당</SelectItem>{ownerOptions.map((item) => <SelectItem key={item} value={item}>{ownerDisplayName(item)}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 Status</SelectItem>{statusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => { setSearch(""); setOwner(ALL); setStatus(ALL) }}><RotateCcw className="size-4" />초기화</Button>
        {intakeNotice ? <span role="status" className="shrink-0 whitespace-nowrap rounded-full bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)]">{intakeNotice}</span> : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted-foreground)]">
          <div className="flex flex-wrap items-center justify-end gap-1" aria-label="DD 열 그룹 표시">
            {GROUPS.map((group) => <button type="button" key={group.key} aria-pressed={openGroups[group.key]} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))} className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-normal transition-colors ${openGroups[group.key] ? "border-transparent text-white" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"}`} style={openGroups[group.key] ? { backgroundColor: group.color } : undefined}>{openGroups[group.key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{group.label}<span className="opacity-75">{group.columns.length}</span></button>)}
          </div>
          <p className="shrink-0 whitespace-nowrap">{filtered.length.toLocaleString("ko-KR")} / {scoped.length.toLocaleString("ko-KR")}행</p>
          <div className="flex shrink-0 items-center gap-2">
            <DataUpload kind="development-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} />
            <DataUpload kind="development-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} />
          </div>
        </div>
      </div>

      <div data-route-scroll-root className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-30 bg-[var(--card)] shadow-sm">
            <tr className="h-6">
              <th colSpan={PINNED_COLUMNS.length} rowSpan={2} className="sticky left-0 z-40 border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-[11px] font-normal text-[var(--muted-foreground)]" style={{ width: pinnedTotal, minWidth: pinnedTotal }}><span className="relative block">고정 핵심<span aria-hidden="true" title="고정 핵심 너비 조절" onMouseDown={(event) => startGroupResize(PINNED_COLUMNS, event)} className="absolute right-[-9px] top-1/2 h-4 w-1.5 -translate-y-1/2 cursor-col-resize rounded-full bg-[var(--border)] transition-colors hover:bg-[var(--primary)]" /></span></th>
              {visibleGroups.map((group) => <th key={group.key} colSpan={group.columns.length} rowSpan={group.columns.some((column) => column.sub) ? 1 : 2} className="relative border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-semibold" style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}>{group.label}<span aria-hidden="true" title={`${group.label} 너비 조절`} onMouseDown={(event) => startGroupResize(group.columns, event)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th>)}
            </tr>
            <tr className="h-6">
              {visibleGroups.filter((group) => group.columns.some((column) => column.sub)).flatMap((group) => subRuns(group.columns).map((run, index) => <th key={`${group.key}-sub-${index}`} colSpan={run.span} className="border-b border-r border-[var(--border)] px-2 text-center text-[10px] font-semibold" style={{ color: run.label ? group.color : "transparent", background: `color-mix(in srgb, ${group.color} ${run.label ? 18 : 12}%, var(--card))` }}>{run.label || "·"}</th>))}
            </tr>
            <tr className="h-8">
              {PINNED_COLUMNS.map((column, index) => { const width = widthOf(column); return <th key={column.id} className={`relative sticky z-40 border-b border-r border-[var(--border)] px-2 text-xs font-normal text-[var(--muted-foreground)] ${selected?.col === column.id ? "bg-[color-mix(in_srgb,var(--primary)_6%,var(--muted))]" : "bg-[var(--muted)]"} ${column.id === "owner" ? "text-center" : "text-left"}`} style={{ width, minWidth: width, left: pinnedLeft(index) }}>{column.label}<span aria-hidden="true" onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th> })}
              {visibleGroups.flatMap((group) => group.columns.map((column) => { const width = widthOf(column); return <th key={`${group.key}-${column.id}`} className={`relative border-b border-r border-[var(--border)] px-2 text-xs font-normal text-[var(--muted-foreground)] ${selected?.col === column.id ? "bg-[color-mix(in_srgb,var(--primary)_6%,var(--muted))]" : "bg-[var(--muted)]"} ${alignOf(column) === "center" ? "text-center" : "text-left"}`} style={{ width, minWidth: width }}>{column.label}<span aria-hidden="true" onMouseDown={(event) => startColumnResize(column, event)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]" /></th> }))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
              const warnings = ddWarnings(record)
              const rowStyle = ddStatusStyle(record.devStatus || record.stage)
              const rowId = recordIdentity(record)
              const isRecent = recentIntakeRows.has(rowId)
              const isActive = (colId: string) => editCell?.row === rowId && editCell?.col === colId
              const rowSelected = selected?.row === rowId
              const selectCell = (colId: string) => setSelected({ row: rowId, col: colId })
              const isDragging = dragRow === rowId
              const isDropTarget = dragOverRow === rowId && dragRow !== null && dragRow !== rowId
              return <tr key={rowId}
                draggable={dragEnabled && armedRow === rowId}
                onDragStart={() => setDragRow(rowId)}
                onDragEnter={(event) => { if (dragRow && dragRow !== rowId) { event.preventDefault(); setDragOverRow(rowId) } }}
                onDragOver={(event) => { if (dragRow && dragRow !== rowId) event.preventDefault() }}
                onDrop={(event) => { event.preventDefault(); handleRowDrop(rowId); endRowDrag() }}
                onDragEnd={endRowDrag}
                onMouseUp={() => { if (!dragRow && armedRow === rowId) setArmedRow(null) }}
                onClick={(event) => {
                const cell = (event.target as HTMLElement).closest("td")
                const column = cell instanceof HTMLTableCellElement ? displayedColumns[cell.cellIndex] : undefined
                if (column) selectCell(column.id)
              }} className={`group bg-[var(--card)] transition-colors hover:bg-[var(--accent)] ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "[&>td]:shadow-[inset_0_2px_0_0_var(--primary)]" : ""}`}>
                {PINNED_COLUMNS.map((column, index) => {
                  const left = pinnedLeft(index)
                  const width = widthOf(column)
                  const highlighted = rowSelected || selected?.col === column.id
                  const cellSelected = rowSelected && selected?.col === column.id
                  const stickyBase = `sticky z-20 h-8 border-b border-r border-[var(--border)] ${highlighted ? "bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))]" : "bg-[var(--card)] group-hover:bg-[var(--accent)]"} ${cellSelected ? "ring-2 ring-inset ring-[var(--ring)]" : ""} ${index === 0 ? `border-l-4 ${rowStyle.row}` : ""}`
                  if (column.id === "status") return <td key={column.id} onClick={() => selectCell(column.id)} className={`${stickyBase} px-1.5`} style={{ width, minWidth: width, left }}><StatusChip record={record} /></td>
                  const active = isActive(column.id)
                  if (active) return <td key={column.id} onClick={() => selectCell(column.id)} className={`${stickyBase} p-0`} style={{ width, minWidth: width, left }}><InlineEditor record={record} column={column} options={optionsById[column.id] ?? column.options} onCommit={(raw) => void commitCell(record, column, raw)} onCancel={() => setEditCell(null)} /></td>
                  return <td key={column.id} onDoubleClick={column.id === "owner" ? undefined : () => setEditCell({ row: rowId, col: column.id })} className={`${stickyBase} max-w-0 ${column.id === "owner" ? "" : "cursor-cell"} px-2 text-xs font-normal ${column.mono ? "font-mono" : ""}`} style={{ width, minWidth: width, left }}>
                    {column.id === "owner"
                      ? <div className="flex items-center gap-0.5">
                          {dragEnabled ? <span role="button" title="드래그로 순서 이동" aria-label="행 순서 이동" onMouseDown={() => setArmedRow(rowId)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} className="inline-flex shrink-0 cursor-grab rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:opacity-100 active:cursor-grabbing"><GripVertical className="size-3.5" /></span> : null}
                          <span className="min-w-0 flex-1 truncate">{text(ownerDisplayName(record.owner))}</span>
                          <button type="button" title="전체 항목 수정" onClick={(event) => { event.stopPropagation(); openEditor(record) }} onDoubleClick={(event) => event.stopPropagation()} className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--muted)] hover:text-[var(--foreground)] group-hover:opacity-100"><Maximize2 className="size-3.5" /></button>
                          <button type="button" title="이 옵션 삭제" aria-label="이 옵션 삭제" onClick={(event) => { event.stopPropagation(); setConfirmDelete(record) }} onDoubleClick={(event) => event.stopPropagation()} className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--destructive)] hover:text-white group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                        </div>
                      : column.id === "styleNo"
                        ? <span className="flex items-center gap-1 truncate" title={warnings.map((warning) => warning.label).join(" · ") || undefined}>{isRecent ? <span className="shrink-0 rounded-full bg-[linear-gradient(110deg,#06b6d4,#2563eb_55%,#7c3aed)] px-1.5 py-0.5 text-[8px] font-bold tracking-[0.04em] text-white">신규</span> : null}<span className="truncate">{text(record.styleNo)}</span>{warnings.length ? <TriangleAlert className="size-3.5 shrink-0 text-[var(--destructive)]" /> : null}</span>
                        : <span className="truncate">{text(column.value(record, linked))}</span>}
                  </td>
                })}
                {visibleGroups.flatMap((group) => group.columns.map((column) => <GridCell key={`${group.key}-${column.id}`} record={record} column={column} width={widthOf(column)} ledger={linked} active={isActive(column.id)} highlighted={rowSelected || selected?.col === column.id} selected={rowSelected && selected?.col === column.id} options={optionsById[column.id] ?? column.options} onSelect={() => selectCell(column.id)} onEdit={() => setEditCell({ row: rowId, col: column.id })} onCommit={(raw) => void commitCell(record, column, raw)} onCancel={() => setEditCell(null)} />))}
              </tr>
            })}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-12 text-center text-sm text-[var(--muted-foreground)]">{scoped.length ? "조건에 맞는 DD 행이 없습니다." : "DD를 업로드하거나 신규 작지를 접수해 현황판을 시작하세요."}</div> : null}
      </div>
    </div>

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
            <DialogDescription>{`DD 원본 행 ${editing._src.sheet === "웹 접수" ? "· 웹 접수" : editing._src.row} · 수식 열은 자동 계산되며 나머지는 직접 수정합니다.`}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2.5">
            <EditorGroup label="고정 핵심" color="var(--chart-1)" columns={PINNED_COLUMNS} draft={editing} onChange={setEditing} optionsById={optionsById} />
            {GROUPS.filter((group) => group.key !== "ledger").map((group) => <EditorGroup key={group.key} label={group.label} color={group.color} columns={group.columns} draft={editing} onChange={setEditing} optionsById={optionsById} layout={group.editorLayout} />)}
          </DialogBody>
          <DialogFooter className="gap-1.5 py-2.5">
            <Button type="button" size="sm" variant="outline" onClick={closeEditor}>취소</Button>
            <Button type="button" size="sm" onClick={() => void saveEditor()}><Save className="size-4" />변경 저장</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>

    {/* 행(샘플 옵션) 삭제 확인 */}
    <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
      <DialogContent className="w-[92vw] max-w-md">
        {confirmDelete ? <>
          <DialogHeader className="py-2.5">
            <DialogTitle>샘플 옵션 삭제</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-[var(--foreground)]">{confirmDelete.styleNo || "무제"}</span>
              {confirmDelete.color ? ` · ${confirmDelete.color}` : ""}
              {confirmDelete.opt ? ` · 옵션 ${confirmDelete.opt}` : ""} 행을 현황판에서 삭제합니다. 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-1.5 py-2.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>취소</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void confirmDeleteRecord()}><Trash2 className="size-4" />삭제</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
  </div>
}
