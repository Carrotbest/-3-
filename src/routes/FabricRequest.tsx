/**
 * FABRIC REQUEST — 통합원단부 1팀이 보내는 소싱 의뢰 원장.
 *
 * 엑셀 소싱 차트(27열 4밴드)를 웹으로 옮긴 화면이다. 엑셀에서 한 셀에 "1. / 2. / 3."으로
 * 눌러 담던 옵션을 스타일 병합 블럭 안의 옵션 라인으로 푼다.
 * 옵션 라인 하나가 나중에 DD MASTER 행 하나와 1대1로 연결된다(R104 예정).
 *
 * 행 높이는 사용자가 조절하되 글자 길이에 따라 자동으로 늘리지는 않는다.
 * 넘치는 셀 안에서만 세로 스크롤한다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Archive, ChevronDown, ChevronRight, ClipboardPaste, Copy, Download, Eraser, Flame, ImagePlus, Loader2, Pencil, Plus, Redo2, RotateCcw, Rows3, Scissors, Trash2, Undo2, Upload } from "lucide-react"
import * as XLSX from "xlsx"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CONSTRUCTIONS, matchConstruction } from "@/data/constructions"
import { currentUserCanWrite, useAuthStore } from "@/data/auth"
import { buildFabricLedger } from "@/data/fabric-ledger"
import { ddRecordsByLineId, requestDdStatus, type RequestDdStatus } from "@/data/request-link"
import { requestProcessStage, type ProcessStage } from "@/data/request-process-stage"
import { ALL_BOARDS, ARCHIVE_VIEW, appendRequestHistory, boardEvent, boardKindColor, buildBoardArchive, canDeleteBoard, canManageBoard, closeBoard, migrateChartsToBoards, nextBoardSeq, reopenBoard, resultOf } from "@/data/request-board"
import type { AuditKind } from "@/data/audit"

import { ProcessStageChip } from "@/components/request/ProcessStageChip"
import { ProcessStageDialog } from "@/components/request/ProcessStageDialog"
import { RequestBoardHeader } from "@/components/request/RequestBoardHeader"
import { RequestBoardCloseDialog } from "@/components/request/RequestBoardCloseDialog"
import { RequestArchiveView } from "@/components/request/RequestArchiveView"
import { MoveStyleDialog, RequestBoardDialog, type RequestBoardValues } from "@/components/request/RequestBoardDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FillHandle, selectionShadow, type CellMove, type CellRect, type CellRef } from "@/components/data-table/grid-selection"
import { downloadBlob } from "@/data/dd-export"
import { deleteRequestImage, requestImageUrl, uploadRequestImage, validateRequestImage } from "@/data/request-image"
import { buildRequestWorkbook, mergeRequestStyles, parseRequestWorkbook, requestTemplateFileName } from "@/data/request-template"
import { MEMBERS, REQUEST_RESULTS, type RequestArchive, type RequestBoard, type RequestOption, type RequestResult, type RequestStyle } from "@/data/schema"
import { loadViewNumbers, saveViewPref } from "@/data/view-prefs"
import { saveRequestArchive, saveRequestBoards, saveRequests, saveRequestsAndBoards, useAppStore } from "@/store/useAppStore"

// ─────────────────────────────────────────────── 열 정의

type ColumnScope = "style" | "option"

interface RequestColumn {
  id: string
  label: string
  width: number
  scope: ColumnScope
  align?: "center" | "right"
}

interface RequestGroup {
  key: string
  label: string
  color: string
  columns: readonly RequestColumn[]
}

/** 좌측 고정 열. 사진과 Garment No.는 가로 스크롤에서도 남는다. */
const FIXED_COLUMNS: readonly RequestColumn[] = [
  { id: "image", label: "사진", width: 88, scope: "style", align: "center" },
  { id: "garmentNo", label: "Garment No.", width: 120, scope: "style" },
]

const COLUMN_GROUPS: readonly RequestGroup[] = [
  { key: "original", label: "ORIGINAL", color: "var(--chart-1)", columns: [
    { id: "brand", label: "Brand", width: 100, scope: "style" },
    { id: "contents", label: "Contents", width: 150, scope: "style" },
    { id: "origConstruction", label: "Cons.", width: 120, scope: "style" },
    { id: "origWeight", label: "Weight", width: 80, scope: "style", align: "right" },
  ] },
  { key: "analysis", label: "분석", color: "var(--chart-2)", columns: [
    { id: "yarnAnalysis", label: "Yarn analysis", width: 180, scope: "style" },
    { id: "devConstruction", label: "Cons.(개발)", width: 120, scope: "style" },
    { id: "comment", label: "Comment", width: 160, scope: "style" },
    { id: "analyst", label: "분석 담당", width: 90, scope: "style" },
  ] },
  { key: "request", label: "의뢰", color: "var(--chart-3)", columns: [
    { id: "result", label: "결과", width: 76, scope: "style", align: "center" },
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "devPlan", label: "개발", width: 200, scope: "style" },
  ] },
  { key: "option", label: "옵션", color: "var(--warning)", columns: [
    { id: "optNo", label: "Opt", width: 50, scope: "option", align: "center" },
    { id: "yarnDetail", label: "Yarn Detail", width: 180, scope: "option" },
    // 원단 FULL DETAIL을 원사, 조직, 중량으로 나눈 열. 조직은 목록에서만 고른다.
    { id: "construction", label: "Cons.", width: 130, scope: "option" },
    { id: "weight", label: "W'T", width: 64, scope: "option", align: "right" },
    { id: "color", label: "Color", width: 120, scope: "option" },
    { id: "dyeingMethod", label: "Dyeing", width: 90, scope: "option" },
    { id: "remark", label: "Remark", width: 180, scope: "option" },
    // 보기 전용 두 열. DD 행의 tech.requestLink를 읽어 계산하며 요청 데이터나 엑셀 양식에는 없다.
    { id: "ddStage", label: "공정", width: 96, scope: "option", align: "center" },
    { id: "ddLink", label: "Link", width: 150, scope: "option" },
  ] },
]

const ACTION_WIDTH = 72
/** 엑셀 행 머리처럼 왼쪽 끝에 붙는 행 번호 칸. 너비 조절 대상이 아니라 상수로 둔다. */
const ROW_NO_WIDTH = 44
const STYLE_ROW_HEIGHT = 84
const OPTION_ROW_HEIGHT = 28
const ADD_ROW_HEIGHT = 24
const MIN_COLUMN_WIDTH = 56
const COL_WIDTHS_KEY = "fabric.request.colWidths"
const OPEN_GROUPS_KEY = "fabric.request.openGroups"
const ROW_HEIGHTS_KEY = "fabric.request.rowHeights"
const MAX_ROW_HEIGHT = 800

const ALL_COLUMNS = [...FIXED_COLUMNS, ...COLUMN_GROUPS.flatMap((group) => group.columns)]
const COLUMN_IDS = new Set(ALL_COLUMNS.map((column) => column.id))

type GroupKey = (typeof COLUMN_GROUPS)[number]["key"]
const ALL_OPEN = Object.fromEntries(COLUMN_GROUPS.map((group) => [group.key, true])) as Record<string, boolean>

/** 열 너비는 사용자가 끌어 조절하고 브라우저에 남는다. 손상된 값은 기본 너비로 되돌린다. */
function loadColumnWidths(): Record<string, number> {
  const defaults = Object.fromEntries(ALL_COLUMNS.map((column) => [column.id, column.width]))
  if (typeof window === "undefined") return defaults
  try {
    const raw = window.localStorage.getItem(COL_WIDTHS_KEY)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Record<string, unknown>
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults
    Object.entries(stored).forEach(([id, width]) => {
      if (COLUMN_IDS.has(id) && typeof width === "number" && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH) defaults[id] = width
    })
  } catch {
    // 저장소를 못 쓰면 기본 너비로 간다.
  }
  return defaults
}

function saveColumnWidths(widths: Record<string, number>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(widths))
  } catch {
    // 저장 못해도 이번 세션의 조절은 유지된다.
  }
}

function loadOpenGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return { ...ALL_OPEN }
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY)
    if (!raw) return { ...ALL_OPEN }
    const stored = JSON.parse(raw) as Record<string, unknown>
    const next = { ...ALL_OPEN }
    Object.entries(stored).forEach(([key, value]) => {
      if (key in next && typeof value === "boolean") next[key] = value
    })
    return next
  } catch {
    return { ...ALL_OPEN }
  }
}

// ─────────────────────────────────────────────── 행 모델

type Line =
  | { kind: "style"; style: RequestStyle }
  | { kind: "option"; style: RequestStyle; option: RequestOption }

type StageFilter = "전체" | "분석" | "개발"
type SortKey = "seq" | "requester" | "developer" | "analyst"

const SORT_LABEL: Record<SortKey, string> = {
  seq: "순번",
  requester: "의뢰자",
  developer: "개발 담당",
  analyst: "분석 담당",
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

const blankStyle = (): RequestStyle => ({
  reqId: newId(),
  chart: "",
  stage: "분석",
  seq: 0,
  garmentNo: "",
  brand: "",
  contents: "",
  origConstruction: "",
  origWeight: "",
  yarnAnalysis: "",
  devConstruction: "",
  comment: "",
  analyst: "",
  urgent: false,
  requester: "",
  developer: "",
  devPlan: "",
  options: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

/** 옵션 번호는 삭제 후에도 1부터 다시 매긴다. optId는 그 번호를 따라간다. */
const renumber = (reqId: string, options: RequestOption[]): RequestOption[] =>
  options.map((option, index) => ({ ...option, no: index + 1, optId: `${reqId}#${index + 1}` }))

const blankOption = (reqId: string, no: number): RequestOption => ({
  optId: `${reqId}#${no}`,
  lineId: crypto.randomUUID(),
  no,
  yarnDetail: "",
  construction: "",
  weight: "",
  color: "",
  dyeingMethod: "",
  remark: "",
})

const text = (value: string | number | undefined): string =>
  value === undefined || value === "" ? "" : String(value)

const replaceText = (source: string, find: string, replacement: string, matchCase: boolean): string => {
  if (!find) return source
  if (matchCase) return source.split(find).join(replacement)
  return source.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), replacement)
}

// ─────────────────────────────────────────────── 사진

/** Storage 경로를 다운로드 URL로 바꾼다. requestImageUrl이 모듈 캐시를 갖고 있어 경로당 한 번만 나간다. */
function useRequestImageUrl(path: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    let alive = true
    void requestImageUrl(path).then((value) => {
      if (alive) setUrl(value)
    })
    return () => {
      alive = false
    }
  }, [path])
  return url
}

interface ImageCellProps {
  style: RequestStyle
  onUploaded: (paths: { imagePath: string; imageThumbPath: string }) => void
  onOpen: () => void
}

function ImageCell({ style, onUploaded, onOpen }: ImageCellProps) {
  const thumbUrl = useRequestImageUrl(style.imageThumbPath)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    const invalid = validateRequestImage(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const paths = await uploadRequestImage(style.reqId, file)
      onUploaded(paths)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "사진을 올리지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      {busy ? (
        <Loader2 className="size-4 animate-spin text-[var(--muted-foreground)]" aria-label="사진 올리는 중" />
      ) : thumbUrl ? (
        <>
          <button type="button" className="min-h-0 flex-1" title="크게 보기" onClick={onOpen}>
            <img src={thumbUrl} alt={`${style.garmentNo || "의뢰"} garment 사진`} className="h-full w-full rounded object-cover" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[9px] text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          >
            교체
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <ImagePlus className="size-3.5" />
          사진 추가
        </button>
      )}
      {error ? <span className="px-0.5 text-center text-[9px] leading-tight text-[var(--destructive)]">{error}</span> : null}
    </div>
  )
}

// ─────────────────────────────────────────────── 편집 모달

interface EditorProps {
  open: boolean
  draft: RequestStyle | null
  ownerOptions: string[]
  boardName: string
  onClose: () => void
  onSave: (style: RequestStyle) => void
}

function RequestEditor({ open, draft, ownerOptions, boardName, onClose, onSave }: EditorProps) {
  const [value, setValue] = useState<RequestStyle | null>(draft)

  useEffect(() => {
    setValue(draft)
  }, [draft])

  if (!value) return null

  const set = <K extends keyof RequestStyle>(key: K, next: RequestStyle[K]) =>
    setValue((current) => (current ? { ...current, [key]: next } : current))

  const setOption = (index: number, key: "yarnDetail" | "construction" | "color" | "dyeingMethod" | "remark", next: string) =>
    setValue((current) => {
      if (!current) return current
      return { ...current, options: current.options.map((option, i) => (i === index ? { ...option, [key]: next } : option)) }
    })
  const setOptionWeight = (index: number, raw: string) =>
    setValue((current) => {
      if (!current) return current
      const weight: number | "" = raw === "" ? "" : Number(raw)
      return { ...current, options: current.options.map((option, i) => (i === index ? { ...option, weight } : option)) }
    })

  const field = (label: string, node: ReactNode) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-[var(--muted-foreground)]">{label}</span>
      {node}
    </label>
  )

  const areaClass = "h-16 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"

  const memberSelect = (label: string, key: "analyst" | "developer") =>
    field(label, (
      <Select value={value[key] || "__none"} onValueChange={(next) => set(key, next === "__none" ? "" : next)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">미지정</SelectItem>
          {ownerOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
    ))

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{draft && draft.garmentNo ? `의뢰 수정 — ${draft.garmentNo}` : "신규 의뢰"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-3">
            {field("보드", <Input className="h-8 text-xs" value={boardName} readOnly />)}
            {field("단계", (
              <Select value={value.stage} onValueChange={(next) => set("stage", next as RequestStyle["stage"])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="분석">분석</SelectItem>
                  <SelectItem value="개발">개발</SelectItem>
                </SelectContent>
              </Select>
            ))}
            {field("순번", (
              <Input className="h-8 text-xs" type="number" value={value.seq || ""} onChange={(event) => set("seq", Number(event.target.value) || 0)} />
            ))}
            {field("Garment No.", (
              <Input className="h-8 text-xs" value={value.garmentNo} onChange={(event) => set("garmentNo", event.target.value)} />
            ))}
            {field("Brand", <Input className="h-8 text-xs" value={value.brand} onChange={(event) => set("brand", event.target.value)} />)}
            {field("Contents", <Input className="h-8 text-xs" value={value.contents} onChange={(event) => set("contents", event.target.value)} />)}
            {field("Cons.", <Input className="h-8 text-xs" value={value.origConstruction} onChange={(event) => set("origConstruction", event.target.value)} />)}
            {field("Weight (g/m2)", (
              <Input
                className="h-8 text-xs"
                type="number"
                value={value.origWeight === "" ? "" : value.origWeight}
                onChange={(event) => set("origWeight", event.target.value === "" ? "" : Number(event.target.value))}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {field("Yarn analysis", <textarea className={areaClass} value={value.yarnAnalysis} onChange={(event) => set("yarnAnalysis", event.target.value)} />)}
            {field("Cons.(개발)", <textarea className={areaClass} value={value.devConstruction} onChange={(event) => set("devConstruction", event.target.value)} />)}
            {field("Comment", <textarea className={areaClass} value={value.comment} onChange={(event) => set("comment", event.target.value)} />)}
          </div>

          <div className="mt-4 grid grid-cols-4 items-end gap-3">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={value.urgent} onCheckedChange={(next) => set("urgent", next === true)} />
              <span className="font-medium">URGENT</span>
            </label>
            {field("의뢰자 (1팀)", <Input className="h-8 text-xs" value={value.requester} onChange={(event) => set("requester", event.target.value)} />)}
            {memberSelect("개발 담당", "developer")}
            {memberSelect("분석 담당", "analyst")}
          </div>

          <div className="mt-3">
            {field("개발", <textarea className="h-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs" value={value.devPlan} onChange={(event) => set("devPlan", event.target.value)} />)}
          </div>

          <div className="mt-5 rounded border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-xs font-semibold">옵션 {value.options.length}건</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setValue((current) => current
                  ? { ...current, options: renumber(current.reqId, [...current.options, blankOption(current.reqId, current.options.length + 1)]) }
                  : current)}
              >
                <Plus className="size-3.5" />옵션 추가
              </Button>
            </div>
            {value.options.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
                옵션을 추가하면 라인이 생깁니다. 라인 하나가 DD MASTER 한 행과 짝이 됩니다.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {value.options.map((option, index) => (
                  <div key={option.optId} className="grid grid-cols-[36px_minmax(0,1.4fr)_140px_64px_minmax(0,1fr)_90px_minmax(0,1fr)_44px] items-center gap-2 px-3 py-2">
                    <span className="text-center text-xs font-semibold text-[var(--muted-foreground)]">{option.no}</span>
                    <Input className="h-8 text-xs" placeholder="Yarn Detail" value={option.yarnDetail} onChange={(event) => setOption(index, "yarnDetail", event.target.value)} />
                    <Select value={option.construction || "__none"} onValueChange={(next) => setOption(index, "construction", next === "__none" ? "" : next)}>
                      <SelectTrigger className="h-8 text-xs" aria-label={`옵션 ${option.no} Cons.`}><SelectValue placeholder="Cons." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">선택 안함</SelectItem>
                        {option.construction && !CONSTRUCTIONS.includes(option.construction) ? <SelectItem value={option.construction}>(목록 외) {option.construction}</SelectItem> : null}
                        {CONSTRUCTIONS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-right text-xs" type="number" min="0" placeholder="W'T" aria-label={`옵션 ${option.no} W'T`} value={option.weight ?? ""} onChange={(event) => setOptionWeight(index, event.target.value)} />
                    <Input className="h-8 text-xs" placeholder="Color" value={option.color} onChange={(event) => setOption(index, "color", event.target.value)} />
                    <Input className="h-8 text-xs" placeholder="Dyeing" value={option.dyeingMethod} onChange={(event) => setOption(index, "dyeingMethod", event.target.value)} />
                    <Input className="h-8 text-xs" placeholder="Remark" value={option.remark} onChange={(event) => setOption(index, "remark", event.target.value)} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`옵션 ${option.no} 삭제`}
                      onClick={() => setValue((current) => current
                        ? { ...current, options: renumber(current.reqId, current.options.filter((_, i) => i !== index)) }
                        : current)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button type="button" onClick={() => onSave({ ...value, updatedAt: new Date().toISOString() })}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────── 사진 크게 보기

function PreviewDialog({ style, onClose }: { style: RequestStyle | null; onClose: () => void }) {
  const url = useRequestImageUrl(style?.imagePath)
  return (
    <Dialog open={style !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{style?.garmentNo || "garment 사진"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {url ? (
            <img src={url} alt={`${style?.garmentNo ?? ""} garment 사진`} className="max-h-[70vh] w-full object-contain" />
          ) : (
            <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">사진을 불러오는 중입니다.</p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────── 셀 편집

type EditKind = "text" | "area" | "number" | "member" | "construction" | "result" | "toggle" | null

/** 더블클릭으로 고칠 수 있는 열과 그 입력 방식. 사진과 옵션 번호는 자동 값이라 막는다. */
function editKindOf(columnId: string): EditKind {
  switch (columnId) {
    case "garmentNo": case "brand": case "origConstruction": case "devConstruction":
    case "requester": case "color": case "dyeingMethod":
      return "text"
    case "contents": case "yarnAnalysis": case "comment":
    case "devPlan": case "yarnDetail": case "remark":
      return "area"
    case "origWeight": case "weight":
      return "number"
    case "analyst": case "developer":
      return "member"
    case "construction":
      return "construction"
    case "result":
      return "result"
    case "urgent":
      return "toggle"
    default:
      return null
  }
}

interface CellEditorProps {
  kind: Exclude<EditKind, "toggle" | null>
  initial: string
  members: string[]
  onCommit: (value: string, move?: CellMove, fillRange?: boolean) => void
  onCancel: () => void
}

/** 셀 안에서 바로 고친다. Enter 저장, Esc 취소, 포커스가 빠져도 저장한다. */
function CellEditor({ kind, initial, members, onCommit, onCancel }: CellEditorProps) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)

  const commit = (move?: CellMove, fillRange?: boolean) => {
    if (done.current) return
    done.current = true
    onCommit(value, move, fillRange)
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }

  if (kind === "member") {
    return (
      <Select
        defaultOpen
        value={value || "__none"}
        onValueChange={(next) => { done.current = true; onCommit(next === "__none" ? "" : next) }}
      >
        <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">미지정</SelectItem>
          {members.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  if (kind === "construction") {
    // 표기 통일용 목록이라 자유 입력을 받지 않는다. 목록 밖 옛 값은 보이게만 남긴다.
    return (
      <Select
        defaultOpen
        value={value || "__none"}
        onValueChange={(next) => { done.current = true; onCommit(next === "__none" ? "" : next) }}
      >
        <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">선택 안함</SelectItem>
          {value && !CONSTRUCTIONS.includes(value) ? <SelectItem value={value}>(목록 외) {value}</SelectItem> : null}
          {CONSTRUCTIONS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  if (kind === "result") {
    return <Select defaultOpen value={value || "진행중"} onValueChange={(next) => { done.current = true; onCommit(next) }}><SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger><SelectContent>{REQUEST_RESULTS.map((result) => <SelectItem key={result} value={result}>{result}</SelectItem>)}</SelectContent></Select>
  }

  const shared = {
    autoFocus: true,
    value,
    onBlur: () => commit(),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
      if (event.key === "Escape") { event.preventDefault(); cancel() }
      else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(undefined, true) }
      else if (event.key === "Enter" && kind === "area" && event.altKey) return
      else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        commit(event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
      }
    },
  }

  if (kind === "area") {
    return (
      <textarea
        {...shared}
        onChange={(event) => setValue(event.target.value)}
        className="h-full w-full resize-none rounded-none border border-[var(--primary)] bg-[var(--card)] px-1 py-0.5 text-xs outline-none"
      />
    )
  }
  return (
    <input
      {...shared}
      type={kind === "number" ? "number" : "text"}
      onChange={(event) => setValue(event.target.value)}
      className="h-7 w-full rounded-none border border-[var(--primary)] bg-[var(--card)] px-1 text-xs outline-none"
    />
  )
}

// ─────────────────────────────────────────────── 화면

export function FabricRequest() {
  const requests = useAppStore((state) => state.requests)
  const requestBoards = useAppStore((state) => state.requestBoards)
  const requestArchive = useAppStore((state) => state.requestArchive)
  const authUser = useAuthStore((state) => state.user)
  const isOwner = useAuthStore((state) => state.isOwner)
  const boardMigrationRef = useRef(false)
  useEffect(() => {
    if (boardMigrationRef.current || !currentUserCanWrite() || requests.length === 0 || requests.every((request) => request.boardId)) return
    const actor = {
      email: authUser?.email ?? authUser?.uid ?? "unknown",
      name: authUser?.displayName?.trim() || authUser?.email?.split("@")[0] || "알 수 없음",
    }
    const result = migrateChartsToBoards(requests, requestBoards, actor)
    if (!result.changed) return
    boardMigrationRef.current = true
    try {
      saveRequestsAndBoards(result.requests, result.boards, "edit")
    } finally {
      boardMigrationRef.current = false
    }
  }, [authUser, requestBoards, requests])
  const [searchParams, setSearchParams] = useSearchParams()
  // DD 공정과 Link 열. 요청에 저장하지 않고 DD 행의 tech.requestLink를 읽어 매번 계산한다.
  const navigate = useNavigate()
  const ddRecords = useAppStore((state) => state.records)
  const ddCompletedSamples = useAppStore((state) => state.completed)
  const ddFabricOverrides = useAppStore((state) => state.fabricOverrides)
  const ddByLine = useMemo(() => ddRecordsByLineId(ddRecords), [ddRecords])
  // 원단 상세 링크 키는 DD MASTER(ledgerByRecord)와 같은 원장 구성으로 만든다.
  const ddLedgerKeyByRow = useMemo(() => new Map<string, string>(
    buildFabricLedger(ddRecords, ddCompletedSamples, ddFabricOverrides)
      .flatMap((item) => item.record ? [[`${item.record._src.sheet}::${item.record._src.row}`, item.key] as const] : []),
  ), [ddCompletedSamples, ddFabricOverrides, ddRecords])
  const [stageTarget, setStageTarget] = useState<{ stage: ProcessStage; title: string; rowId?: string } | null>(null)
  const DD_TONE_CLASS: Record<RequestDdStatus["tone"], string> = {
    none: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    progress: "bg-[color-mix(in_srgb,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]",
    late: "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]",
    received: "bg-[color-mix(in_srgb,var(--chart-2)_12%,transparent)] text-[var(--chart-2)]",
    done: "bg-[color-mix(in_srgb,var(--chart-2)_26%,transparent)] font-semibold text-[var(--chart-2)]",
    hold: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]",
    drop: "bg-[var(--muted)] text-[var(--muted-foreground)] line-through",
  }
  const renderDdLink = (option: RequestOption): ReactNode => {
    const status = requestDdStatus(ddByLine, option)
    const chip = "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium"
    if (status.tone === "none") return <span className={`${chip} ${DD_TONE_CLASS.none}`}>미연결</span>
    // 버튼 누름이 셀 선택·편집으로 번지지 않게 막는다.
    const stop = (event: React.MouseEvent) => event.stopPropagation()
    const openDd = () => navigate(`/development/workspace?focus=${encodeURIComponent(status.rowId ?? "")}`)
    const ledgerKey = status.rowId ? ddLedgerKeyByRow.get(status.rowId) : undefined
    const linkTone: RequestDdStatus["tone"] = status.tone === "hold" || status.tone === "drop" || status.tone === "done" ? status.tone : "progress"
    return <span className="inline-flex flex-wrap items-center gap-1">
      <button type="button" title="DD MASTER에서 열기" onMouseDown={stop} onDoubleClick={stop} onClick={(event) => { event.stopPropagation(); openDd() }} className={`${chip} ${DD_TONE_CLASS[linkTone]} hover:opacity-80`}>연결</button>
      {status.flNo ? <button type="button" title="원단 상세 열기" onMouseDown={stop} onDoubleClick={stop} onClick={(event) => { event.stopPropagation(); if (ledgerKey) navigate(`/fabric/${encodeURIComponent(ledgerKey)}`); else openDd() }} className="font-mono text-[11px] text-[var(--primary)] underline-offset-2 hover:underline">{status.flNo}</button> : null}
      {status.extra > 0 ? <span title={`같은 옵션에 연결된 DD 행이 ${status.extra}개 더 있습니다`} className="text-[10px] text-[var(--muted-foreground)]">+{status.extra}</span> : null}
    </span>
  }
  const renderDdStage = (style: RequestStyle, option: RequestOption): ReactNode => {
    const stage = requestProcessStage(ddByLine, option)
    const status = requestDdStatus(ddByLine, option)
    return <ProcessStageChip
      stage={stage}
      onOpen={() => setStageTarget({ stage, title: `${style.garmentNo || "스타일"} Opt ${option.no}`, rowId: status.rowId })}
    />
  }

  const [stage, setStage] = useState<StageFilter>("전체")
  const [sortKey, setSortKey] = useState<SortKey>("seq")
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [activeBoard, setActiveBoard] = useState<string>(() => { try { return window.localStorage.getItem("fabric.request.activeBoard") || ALL_BOARDS } catch { return ALL_BOARDS } })
  const [boardDialog, setBoardDialog] = useState<"create" | "edit" | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [archiveSelected, setArchiveSelected] = useState<string | null>(null)
  const [moveStyle, setMoveStyle] = useState<RequestStyle | null>(null)
  const [draft, setDraft] = useState<RequestStyle | null>(null)
  const [preview, setPreview] = useState<RequestStyle | null>(null)
  const [editCell, setEditCell] = useState<(CellRef & { seed?: string }) | null>(null)
  const [range, setRange] = useState<{ anchor: CellRef; focus: CellRef } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; cell: CellRef } | null>(null)
  const [bottomMenu, setBottomMenu] = useState<{ x: number; y: number } | null>(null)
  const [undoStack, setUndoStack] = useState<RequestStyle[][]>([])
  const [redoStack, setRedoStack] = useState<RequestStyle[][]>([])
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [findValue, setFindValue] = useState("")
  const [replaceValue, setReplaceValue] = useState("")
  const [replaceScope, setReplaceScope] = useState<"selection" | "all">("selection")
  const [replaceMatchCase, setReplaceMatchCase] = useState(false)
  const dragRef = useRef(false)
  const fillRef = useRef<CellRect | null>(null)
  const clipRef = useRef<{ text: string; cut: boolean; rect: CellRect } | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColumnWidths)
  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => loadViewNumbers(ROW_HEIGHTS_KEY, 0, MAX_ROW_HEIGHT))
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [focusedReqId, setFocusedReqId] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const openBoards = useMemo(() => requestBoards.filter((board) => board.status === "진행").sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko-KR")), [requestBoards])
  const activeBoardInfo = activeBoard === ALL_BOARDS || activeBoard === ARCHIVE_VIEW ? null : openBoards.find((board) => board.boardId === activeBoard) ?? null
  const readOnly = activeBoard === ALL_BOARDS || activeBoard === ARCHIVE_VIEW
  // 보드 목록이 캐시나 동기화로 들어오기 전(빈 배열)에는 되돌리지 않는다. 되돌리면 새로고침마다 마지막 탭 기억이 전체로 덮인다.
  useEffect(() => { if (requestBoards.length > 0 && activeBoard !== ALL_BOARDS && activeBoard !== ARCHIVE_VIEW && !activeBoardInfo) setActiveBoard(ALL_BOARDS) }, [activeBoard, activeBoardInfo, requestBoards.length])
  useEffect(() => { try { window.localStorage.setItem("fabric.request.activeBoard", activeBoard) } catch { /* 현재 세션만 유지한다. */ } }, [activeBoard])
  const scoped = useMemo(() => activeBoard === ALL_BOARDS ? requests : requests.filter((item) => item.boardId === activeBoard), [activeBoard, requests])

  const ownerOptions = useMemo(() => {
    const fromData = requests.flatMap((item) => [item.analyst, item.developer]).filter(Boolean)
    return [...new Set([...MEMBERS.map((member) => member.name), ...fromData])]
  }, [requests])

  const visible = useMemo(() => {
    const filtered = scoped.filter((item) => {
      if (stage !== "전체" && item.stage !== stage) return false
      if (urgentOnly && !item.urgent) return false
      return true
    })
    // 정렬은 스타일 단위다. 옵션 라인은 부모에 붙어 함께 움직인다.
    return [...filtered].sort((a, b) => {
      if (sortKey === "seq") return a.seq - b.seq || a.garmentNo.localeCompare(b.garmentNo, "ko-KR")
      return (a[sortKey] || "").localeCompare(b[sortKey] || "", "ko-KR") || a.seq - b.seq
    })
  }, [scoped, stage, urgentOnly, sortKey])

  const optionCount = visible.reduce((sum, style) => sum + style.options.length, 0)

  const actor = { email: authUser?.email ?? authUser?.uid ?? "unknown", name: authUser?.displayName?.trim() || authUser?.email?.split("@")[0] || "알 수 없음" }
  function commitRequests(next: RequestStyle[], kind: AuditKind = "edit"): boolean {
    if (readOnly) { setNotice({ kind: "error", text: "전체 탭은 보기 전용입니다. 보드 탭에서 수정하세요." }); return false }
    if (next === requests) return false
    const history = appendRequestHistory(requests, next, requestBoards, actor)
    if (history.changed) saveRequestsAndBoards(next, history.boards, kind); else saveRequests(next, kind)
    return true
  }
  function saveMutation(next: RequestStyle[]) { if (next === requests || readOnly) { if (readOnly) commitRequests(next); return } pushSnapshot(); commitRequests(next) }

  const upsert = (next: RequestStyle) => {
    const exists = requests.some((item) => item.reqId === next.reqId)
    const prepared = exists ? next : { ...next, boardId: activeBoard, chart: activeBoardInfo?.name ?? "", seq: next.seq || nextBoardSeq(requests, activeBoard) }
    commitRequests(exists ? requests.map((item) => (item.reqId === next.reqId ? prepared : item)) : [...requests, prepared])
    setDraft(null)
  }

  const patchStyle = (reqId: string, patch: Partial<RequestStyle>) => {
    commitRequests(requests.map((item) => (item.reqId === reqId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)))
  }

  const remove = (style: RequestStyle) => {
    if (!window.confirm(`${style.garmentNo || "이 의뢰"} 건을 삭제할까요? 옵션 ${style.options.length}건이 함께 지워집니다.`)) return
    commitRequests(requests.filter((item) => item.reqId !== style.reqId))
    // 사진은 없으면 조용히 넘어간다. 실패해도 원장 삭제는 그대로 둔다.
    void deleteRequestImage(style.reqId).catch(() => undefined)
    setRowMenu(null)
  }

  /** 스타일 맨 아래에 옵션 라인을 한 줄 붙인다. 편집 팝업을 열지 않고 표에서 바로 만든다. */
  const addOption = (style: RequestStyle) => {
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, [...style.options, blankOption(style.reqId, style.options.length + 1)]), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }

  /**
   * 옵션 라인 한 줄을 지운다.
   *
   * 지운 뒤 `renumber`로 번호를 1부터 다시 매긴다. `optId`가 번호를 따라가므로
   * 인덱스로 지우면 뒤 옵션의 식별자가 밀린다. 반드시 `optId`로 찾아 지운다.
   * 내용이 하나라도 적힌 줄만 되묻는다. 빈 줄까지 확인창을 띄우면 성가시다.
   */
  const removeOption = (style: RequestStyle, option: RequestOption) => {
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod, option.remark].some((value) => text(value).trim())
    if (filled && !window.confirm(`옵션 ${option.no}번을 삭제할까요?`)) return
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, style.options.filter((item) => item.optId !== option.optId)), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }

  const widthOf = (column: RequestColumn): number => colWidths[column.id] ?? column.width
  const visibleGroups = COLUMN_GROUPS.filter((group) => openGroups[group.key])
  const boardColumn: RequestColumn = { id: "boardName", label: "보드", width: 120, scope: "style" }
  const visibleColumns = readOnly ? [...FIXED_COLUMNS, boardColumn, ...visibleGroups.flatMap((group) => group.columns)] : [...FIXED_COLUMNS, ...visibleGroups.flatMap((group) => group.columns)]
  const tableWidth = visibleColumns.reduce((sum, column) => sum + widthOf(column), 0) + ACTION_WIDTH + ROW_NO_WIDTH
  const slots = visible.flatMap((style) => Array.from({ length: Math.max(1, style.options.length) }, (_, optionIndex) => ({ style, optionIndex, option: style.options[optionIndex] })))

  useEffect(() => {
    const reqId = searchParams.get("focus")
    if (!reqId) return
    const style = requests.find((item) => item.reqId === reqId)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("focus")
    if (!style) {
      setNotice({ kind: "error", text: "연결된 요청 스타일을 찾을 수 없습니다." })
      setSearchParams(nextParams, { replace: true })
      return
    }
    if (stage !== "전체") setStage("전체")
    const board = style.boardId ? requestBoards.find((item) => item.boardId === style.boardId && item.status === "진행") : undefined
    setActiveBoard(board?.boardId ?? ALL_BOARDS)
    if (urgentOnly) setUrgentOnly(false)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("tr[data-req-id]")].find((item) => item.dataset.reqId === reqId)
      const cell = row?.querySelector<HTMLElement>('td[data-col-id="garmentNo"]')
      const slotIndex = Number(cell?.dataset.slotIndex)
      setSearchParams(nextParams, { replace: true })
      if (!cell || !Number.isInteger(slotIndex)) return
      setRange({ anchor: { row: slotIndex, col: "garmentNo" }, focus: { row: slotIndex, col: "garmentNo" } })
      cell.scrollIntoView({ block: "center", inline: "nearest" })
      setFocusedReqId(reqId)
      window.setTimeout(() => setFocusedReqId(null), 1200)
    }))
  }, [searchParams, setSearchParams])
  const colIndexOf = new Map(visibleColumns.map((column, index) => [column.id, index]))
  const rect = useMemo(() => {
    if (!range) return null
    const a = colIndexOf.get(range.anchor.col), f = colIndexOf.get(range.focus.col)
    if (a === undefined || f === undefined || !slots[range.anchor.row] || !slots[range.focus.row]) return null
    return { top: Math.min(range.anchor.row, range.focus.row), bottom: Math.max(range.anchor.row, range.focus.row), left: Math.min(a, f), right: Math.max(a, f) } satisfies CellRect
  }, [range, visibleColumns, visible])

  const pushSnapshot = () => { setUndoStack((stack) => [...stack, requests].slice(-50)); setRedoStack([]) }
  const appendBlankStyles = (count: number) => {
    if (readOnly || !activeBoardInfo) { commitRequests(requests); return }
    const nextChart = activeBoardInfo.name
    const nextStage = stage === "전체" ? "분석" : stage
    const firstSeq = nextBoardSeq(requests, activeBoard)
    const added = Array.from({ length: count }, (_, index) => {
      const style = blankStyle()
      return { ...style, boardId: activeBoard, chart: nextChart, stage: nextStage, seq: firstSeq + index, options: renumber(style.reqId, [blankOption(style.reqId, 1)]) }
    })
    saveMutation([...requests, ...added])
    setBottomMenu(null)
    if (urgentOnly) {
      setUrgentOnly(false)
      setNotice({ kind: "ok", text: "URGENT만 보기를 해제하고 추가했습니다." })
    }
    const firstId = added[0]?.reqId
    if (!firstId) return
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("tr[data-req-id]")].find((item) => item.dataset.reqId === firstId)
      const cell = row?.querySelector<HTMLElement>('td[data-col-id="garmentNo"]')
      const slotIndex = Number(cell?.dataset.slotIndex)
      if (!cell || !Number.isInteger(slotIndex)) return
      setRange({ anchor: { row: slotIndex, col: "garmentNo" }, focus: { row: slotIndex, col: "garmentNo" } })
      cell.scrollIntoView({ block: "nearest", inline: "nearest" })
    }))
  }
  const undoLast = () => { const snapshot = undoStack.at(-1); if (!snapshot) return; setUndoStack((s) => s.slice(0, -1)); setRedoStack((s) => [...s, requests].slice(-50)); commitRequests(snapshot) }
  const redoLast = () => { const snapshot = redoStack.at(-1); if (!snapshot) return; setRedoStack((s) => s.slice(0, -1)); setUndoStack((s) => [...s, requests].slice(-50)); commitRequests(snapshot) }

  const cellLine = (cell: CellRef): Line | null => {
    const slot = slots[cell.row], column = visibleColumns[colIndexOf.get(cell.col) ?? -1]
    if (!slot || !column) return null
    if (column.scope === "style") return { kind: "style", style: slot.style }
    return slot.option ? { kind: "option", style: slot.style, option: slot.option } : null
  }
  const editableCell = (cell: CellRef) => cell.col !== "image" && editKindOf(cell.col) !== null && (cellLine(cell) !== null || visibleColumns[colIndexOf.get(cell.col) ?? -1]?.scope === "option")
  const setCellAnchor = (cell: CellRef, extend = false) => setRange((current) => extend && current ? { ...current, focus: cell } : { anchor: cell, focus: cell })
  const selectWholeRow = (row: number, extend = false) => {
    const first = visibleColumns[0]?.id, last = visibleColumns.at(-1)?.id
    if (!first || !last) return
    setRange((current) => extend && current ? { anchor: { row: current.anchor.row, col: first }, focus: { row, col: last } } : { anchor: { row, col: first }, focus: { row, col: last } })
  }
  const selectionFor = (row: number, column: RequestColumn) => {
    if (!rect) return { inRange: false, isActive: false, top: false, bottom: false, left: false, right: false, handle: false }
    const c = colIndexOf.get(column.id) ?? -1
    const slot = slots[row]
    let top = row, bottom = row
    if (column.scope === "style" && slot) {
      while (top > 0 && slots[top - 1]?.style.reqId === slot.style.reqId) top -= 1
      while (bottom + 1 < slots.length && slots[bottom + 1]?.style.reqId === slot.style.reqId) bottom += 1
    }
    const inRange = c >= rect.left && c <= rect.right && bottom >= rect.top && top <= rect.bottom
    const activeSlot = range ? slots[range.focus.row] : null
    const isActive = Boolean(inRange && range && c === (colIndexOf.get(range.focus.col) ?? -2) && (column.scope === "style" ? activeSlot?.style.reqId === slot?.style.reqId : range.focus.row === row))
    return { inRange, isActive, top: inRange && top <= rect.top, bottom: inRange && bottom >= rect.bottom, left: inRange && c === rect.left, right: inRange && c === rect.right, handle: isActive }
  }
  // 드래그 중 표 가장자리에 가까이 가면 DD MASTER처럼 표를 굴린다(`DevelopmentMasterSheet` startDragAutoScroll과 같은 규칙).
  // 마우스가 멈춰도 매 프레임 포인터 아래 칸을 다시 찾아 선택을 넓힌다.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowDragRef = useRef(false)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const lastExtendRef = useRef("")
  const extendAtPointerRef = useRef<(x: number, y: number) => void>(() => undefined)
  const onCellMouseDown = (event: React.MouseEvent, cell: CellRef) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select,[role=menu]")) return
    event.preventDefault(); dragRef.current = true; rowDragRef.current = false; lastExtendRef.current = ""; setCellAnchor(cell, event.shiftKey)
  }
  const onCellEnter = (cell: CellRef) => { if (dragRef.current) setRange((current) => current ? { ...current, focus: cell } : current) }
  // 렌더마다 최신 slots·선택 함수를 쓰도록 ref에 다시 담는다. 프레임 루프는 한 번만 등록한다.
  extendAtPointerRef.current = (x, y) => {
    const target = document.elementFromPoint(x, y)
    if (!(target instanceof Element) || !scrollRef.current?.contains(target)) return
    const cellEl = target.closest<HTMLElement>("[data-slot-index][data-col-id]")
    if (rowDragRef.current) {
      const rowHead = target.closest<HTMLElement>("[data-row-start]")
      const slotIndex = cellEl ? Number(cellEl.dataset.slotIndex) : -1
      const start = rowHead ? Number(rowHead.dataset.rowStart) : slotIndex >= 0 ? slots.findIndex((slot) => slot.style.reqId === slots[slotIndex]?.style.reqId) : -1
      const key = `row:${start}`
      if (start < 0 || lastExtendRef.current === key) return
      lastExtendRef.current = key
      selectWholeRow(start, true)
      return
    }
    if (!cellEl) return
    const cell = { row: Number(cellEl.dataset.slotIndex), col: cellEl.dataset.colId ?? "" } as CellRef
    const key = `cell:${cell.row}:${cell.col}`
    if (lastExtendRef.current === key) return
    lastExtendRef.current = key
    onCellEnter(cell)
  }
  useEffect(() => {
    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
      pointerRef.current = null
      lastExtendRef.current = ""
    }
    const tick = () => {
      autoScrollFrameRef.current = null
      const pointer = pointerRef.current
      const scroller = scrollRef.current
      if (!pointer || !scroller || !dragRef.current) return
      const box = scroller.getBoundingClientRect()
      // 머리글은 sticky라 표 위쪽 가장자리는 머리글 아래 선으로 본다.
      const headBottom = Math.max(box.top, scroller.querySelector("thead")?.getBoundingClientRect().bottom ?? box.top)
      if (pointer.y < headBottom + 24) scroller.scrollTop -= 16
      else if (pointer.y > box.bottom - 48) scroller.scrollTop += 16
      if (!rowDragRef.current) {
        if (pointer.x < box.left + 80) scroller.scrollLeft -= 16
        else if (pointer.x > box.right - 48) scroller.scrollLeft += 16
      }
      // 포인터가 표 밖으로 나가도 가장 가까운 안쪽 칸으로 선택을 넓힌다. 스크롤바 폭만큼 안으로 당긴다.
      const x = Math.min(Math.max(pointer.x, box.left + 2), box.right - 14)
      const y = Math.min(Math.max(pointer.y, headBottom + 2), box.bottom - 14)
      extendAtPointerRef.current(x, y)
      autoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    const move = (event: MouseEvent) => {
      if (!dragRef.current) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (autoScrollFrameRef.current === null) autoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    const up = () => {
      dragRef.current = false
      rowDragRef.current = false
      fillRef.current = null
      stopAutoScroll()
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      stopAutoScroll()
    }
  }, [])

  type SkipReason = false | "number" | "construction" | "result"
  type SkipCounts = { number: number; construction: number; result: number }
  const countSkip = (counts: SkipCounts, reason: SkipReason) => { if (reason) counts[reason] += 1 }
  const noticeSkips = (counts: SkipCounts) => {
    const parts = [
      counts.number ? `숫자로 바꿀 수 없는 ${counts.number}칸` : "",
      counts.construction ? `조직 목록에 없는 ${counts.construction}칸` : "",
      counts.result ? `결과 목록에 없는 ${counts.result}칸` : "",
    ].filter(Boolean)
    if (parts.length) setNotice({ kind: "error", text: `${parts.join(", ")}을 건너뛰었습니다.` })
  }
  const updateCell = (list: RequestStyle[], cell: CellRef, raw: string): { next: RequestStyle[]; skipped: SkipReason } => {
    const slot = slots[cell.row], column = visibleColumns[colIndexOf.get(cell.col) ?? -1]
    if (!slot || !column || column.id === "image" || editKindOf(column.id) === null) return { next: list, skipped: false }
    const index = list.findIndex((item) => item.reqId === slot.style.reqId)
    if (index < 0) return { next: list, skipped: false }
    const current = list[index]
    let nextStyle = current
    if (column.scope === "style") {
      let value: string | number | boolean = raw
      if (column.id === "result") { if (!REQUEST_RESULTS.includes(raw as (typeof REQUEST_RESULTS)[number])) return { next: list, skipped: "result" }; nextStyle = { ...current, result: raw as (typeof REQUEST_RESULTS)[number], resultAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; const next = [...list]; next[index] = nextStyle; return { next, skipped: false } }
      if (column.id === "urgent") value = /^(y|yes|true|1|urgent|o)$/i.test(raw.trim())
      if (column.id === "origWeight") { const trimmed = raw.trim(); value = trimmed === "" ? "" : Number(trimmed); if (value !== "" && !Number.isFinite(value)) return { next: list, skipped: "number" } }
      nextStyle = { ...current, [column.id]: value, updatedAt: new Date().toISOString() }
    } else {
      let optionValue: string | number = raw
      if (column.id === "weight") {
        // 붙여넣기에 단위가 섞여 와도 숫자만 받는다.
        const trimmed = raw.trim().replace(/\s*(g\/m2|gsm|g)$/i, "")
        const parsed = trimmed === "" ? "" : Number(trimmed)
        if (parsed !== "" && !Number.isFinite(parsed)) return { next: list, skipped: "number" }
        optionValue = parsed
      }
      if (column.id === "construction") {
        const matched = matchConstruction(raw)
        if (matched === null) return { next: list, skipped: "construction" }
        optionValue = matched
      }
      let options = current.options
      if (!options[slot.optionIndex]) {
        if (options.length !== 0 || slot.optionIndex !== 0) return { next: list, skipped: false }
        options = [blankOption(current.reqId, 1)]
      }
      options = options.map((option, i) => i === slot.optionIndex ? { ...option, [column.id]: optionValue } : option)
      nextStyle = { ...current, options: renumber(current.reqId, options), updatedAt: new Date().toISOString() }
    }
    const next = [...list]; next[index] = nextStyle; return { next, skipped: false }
  }
  const applyCells = (cells: CellRef[], raw: string) => { let next = requests; const skipCounts: SkipCounts = { number: 0, construction: 0, result: 0 }; cells.forEach((cell) => { const result = updateCell(next, cell, raw); next = result.next; countSkip(skipCounts, result.skipped) }); if (next !== requests) saveMutation(next); noticeSkips(skipCounts) }
  const cellsInRect = (area = rect) => { const cells: CellRef[] = []; if (!area) return cells; for (let r = area.top; r <= area.bottom; r += 1) for (let c = area.left; c <= area.right; c += 1) cells.push({ row: r, col: visibleColumns[c].id }); return cells }
  const clearRange = () => { if (!rect) return; let next = requests; cellsInRect().forEach((cell) => { if (!editableCell(cell)) return; next = updateCell(next, cell, "").next }); if (next !== requests) saveMutation(next) }
  const fillDown = () => { if (!rect || rect.bottom <= rect.top) return; let next = requests; for (let r = rect.top + 1; r <= rect.bottom; r += 1) for (let c = rect.left; c <= rect.right; c += 1) { const source = cellLine({ row: rect.top, col: visibleColumns[c].id }); if (source) next = updateCell(next, { row: r, col: visibleColumns[c].id }, rawValue(source, visibleColumns[c].id)).next } if (next !== requests) saveMutation(next) }

  /** 좌측 고정 열의 누적 left 값. 조절된 너비를 따라간다. 행 번호 칸이 맨 왼쪽에 먼저 붙는다. */
  const fixedLeft = (id: string): number => {
    let left = ROW_NO_WIDTH
    for (const column of FIXED_COLUMNS) {
      if (column.id === id) return left
      left += widthOf(column)
    }
    return 0
  }

  const toggleGroup = (key: GroupKey) => {
    setOpenGroups((current) => {
      const next = { ...current, [key]: !current[key] }
      try { window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)) } catch { /* 저장 실패는 무시한다. */ }
      return next
    })
  }

  /** 열 머리 오른쪽 끝을 끌어 그 열 하나의 너비를 바꾼다. */
  const startColumnResize = (column: RequestColumn, event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = widthOf(column)
    const previousUserSelect = document.body.style.userSelect
    let nextWidths = { ...colWidths }
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      nextWidths = { ...nextWidths, [column.id]: Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX) }
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

  /** 밴드 머리 오른쪽 끝을 끌면 그 밴드의 열들이 비율대로 함께 늘고 준다. */
  const startGroupResize = (columns: readonly RequestColumn[], event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidths = columns.map((column) => widthOf(column))
    const startTotal = startWidths.reduce((sum, width) => sum + width, 0)
    const minTotal = columns.length * MIN_COLUMN_WIDTH
    const previousUserSelect = document.body.style.userSelect
    let nextWidths = { ...colWidths }
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
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
    const defaults = Object.fromEntries(ALL_COLUMNS.map((column) => [column.id, column.width]))
    setColWidths(defaults)
    saveColumnWidths(defaults)
  }

  /** 편집기에 넣을 원본 문자열. 열 id가 필드명과 같아 그대로 집는다. */
  const rawValue = (line: Line, columnId: string): string => {
    // 보기 전용 계산 열. 복사할 때도 DD 행의 현재 값으로 만든다.
    if (columnId === "ddStage") {
      if (line.kind !== "option") return ""
      const stage = requestProcessStage(ddByLine, line.option)
      return stage.linked ? stage.label : ""
    }
    if (columnId === "ddLink") {
      if (line.kind !== "option") return ""
      const status = requestDdStatus(ddByLine, line.option)
      return status.tone === "none" ? "" : ["연결", status.flNo].filter(Boolean).join(" ")
    }
    const source = (line.kind === "style" ? line.style : line.option) as unknown as Record<string, unknown>
    const value = source[columnId]
    return value === undefined || value === null || value === "" ? "" : String(value)
  }

  const commitCell = (line: Line, columnId: string, raw: string) => {
    if (line.kind === "style") {
      if (columnId === "origWeight") {
        const trimmed = raw.trim()
        const parsed = trimmed === "" ? "" : Number(trimmed)
        if (parsed !== "" && !Number.isFinite(parsed)) return
        patchStyle(line.style.reqId, { origWeight: parsed })
        return
      }
      patchStyle(line.style.reqId, { [columnId]: raw } as Partial<RequestStyle>)
      return
    }
    const { style, option } = line
    let optionValue: string | number = raw
    if (columnId === "weight") {
      const trimmed = raw.trim()
      const parsed = trimmed === "" ? "" : Number(trimmed)
      if (parsed !== "" && !Number.isFinite(parsed)) return
      optionValue = parsed
    }
    if (columnId === "construction") {
      const matched = matchConstruction(raw)
      if (matched === null) return
      optionValue = matched
    }
    commitRequests(requests.map((item) => item.reqId !== style.reqId ? item : {
      ...item,
      options: item.options.map((current) => current.optId === option.optId ? { ...current, [columnId]: optionValue } : current),
      updatedAt: new Date().toISOString(),
    }))
  }

  const resetRowHeights = () => {
    setRowHeights({})
    saveViewPref(ROW_HEIGHTS_KEY, {})
  }

  const startRowResize = (reqId: string, startHeight: number, minimumHeight: number, event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanupRef.current?.()
    const startY = event.clientY
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    let nextHeight = startHeight
    let nextHeights = { ...rowHeights }
    let frame: number | null = null
    const applyHeight = () => {
      frame = null
      nextHeights = { ...nextHeights, [reqId]: nextHeight }
      setRowHeights(nextHeights)
    }
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      nextHeight = Math.min(MAX_ROW_HEIGHT, Math.max(minimumHeight, startHeight + moveEvent.clientY - startY))
      if (frame === null) frame = window.requestAnimationFrame(applyHeight)
    }
    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", cleanup)
      if (frame !== null) window.cancelAnimationFrame(frame)
      nextHeights = { ...nextHeights, [reqId]: nextHeight }
      setRowHeights(nextHeights)
      saveViewPref(ROW_HEIGHTS_KEY, nextHeights)
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "row-resize"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", cleanup)
    resizeCleanupRef.current = cleanup
  }

  const resetRowHeight = (reqId: string) => {
    const next = { ...rowHeights }
    delete next[reqId]
    setRowHeights(next)
    saveViewPref(ROW_HEIGHTS_KEY, next)
  }

  const moveSelection = (direction: CellMove, extend = false, wrap = false) => {
    if (!range || !visibleColumns.length || !slots.length) return
    let row = range.focus.row, col = colIndexOf.get(range.focus.col) ?? 0
    if (direction === "left" || direction === "right") {
      col += direction === "left" ? -1 : 1
      if (wrap && col < 0) { col = visibleColumns.length - 1; row -= 1 }
      if (wrap && col >= visibleColumns.length) { col = 0; row += 1 }
    } else {
      const column = visibleColumns[col]
      if (column.scope === "style") {
        const reqId = slots[row]?.style.reqId
        if (direction === "up") { while (row >= 0 && slots[row]?.style.reqId === reqId) row -= 1 }
        else { while (row < slots.length && slots[row]?.style.reqId === reqId) row += 1 }
      } else row += direction === "up" ? -1 : 1
    }
    row = Math.max(0, Math.min(slots.length - 1, row)); col = Math.max(0, Math.min(visibleColumns.length - 1, col))
    setCellAnchor({ row, col: visibleColumns[col].id }, extend)
  }
  const beginCellEdit = (cell: CellRef, seed?: string) => { if (readOnly) { commitRequests(requests); return } if (editableCell(cell)) setEditCell({ ...cell, seed }) }
  const copyRange = async (cut = false) => {
    if (!rect) return
    const lines: string[] = []
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      const values: string[] = []
      for (let c = rect.left; c <= rect.right; c += 1) {
        const column = visibleColumns[c], slot = slots[r], line = cellLine({ row: r, col: column.id })
        const firstSlot = r === 0 || slots[r - 1]?.style.reqId !== slot?.style.reqId
        values.push(line && (column.scope === "option" || firstSlot) ? column.id === "urgent" ? (line.style.urgent ? "Y" : "") : rawValue(line, column.id) : "")
      }
      lines.push(values.join("\t"))
    }
    const value = lines.join("\n"); clipRef.current = { text: value, cut, rect }
    try { await navigator.clipboard.writeText(value) } catch { /* 내부 클립보드로 계속 쓴다. */ }
  }
  const pasteRange = async () => {
    if (!rect) return
    let value = ""; try { value = await navigator.clipboard.readText() } catch { value = "" }
    if (!value) value = clipRef.current?.text ?? ""; if (!value) return
    let next = requests
    const skipCounts: SkipCounts = { number: 0, construction: 0, result: 0 }
    if (clipRef.current?.cut) cellsInRect(clipRef.current.rect).forEach((cell) => { if (editableCell(cell)) next = updateCell(next, cell, "").next })
    const grid = value.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
    const singleFill = grid.length === 1 && grid[0].length === 1 && (rect.top !== rect.bottom || rect.left !== rect.right)
    if (singleFill) cellsInRect().forEach((cell) => { const result = updateCell(next, cell, grid[0][0]); next = result.next; countSkip(skipCounts, result.skipped) })
    else grid.forEach((line, r) => line.forEach((raw, c) => { const row = rect.top + r, column = visibleColumns[rect.left + c]; if (!column || !slots[row]) return; const slot = slots[row]; if (column.scope === "style" && row > 0 && slots[row - 1]?.style.reqId === slot.style.reqId) return; const result = updateCell(next, { row, col: column.id }, raw); next = result.next; countSkip(skipCounts, result.skipped) }))
    if (next !== requests) saveMutation(next); if (clipRef.current) clipRef.current.cut = false
    noticeSkips(skipCounts)
  }
  const changeOptions = (mode: "above" | "below" | "delete") => {
    if (!rect) return
    const targets = new Map<string, Set<number>>()
    for (let r = rect.top; r <= rect.bottom; r += 1) { const slot = slots[r]; if (!slot) continue; const set = targets.get(slot.style.reqId) ?? new Set<number>(); set.add(slot.optionIndex); targets.set(slot.style.reqId, set) }
    const now = new Date().toISOString()
    const next = requests.map((style) => { const indices = targets.get(style.reqId); if (!indices) return style; let options = [...style.options]; if (mode === "delete") options = options.filter((_, i) => !indices.has(i)); else [...indices].sort((a,b) => b-a).forEach((i) => options.splice(i + (mode === "below" ? 1 : 0), 0, blankOption(style.reqId, 1))); return { ...style, options: renumber(style.reqId, options), updatedAt: now } })
    saveMutation(next); setRowMenu(null)
  }
  const replaceAllMatches = () => {
    if (!findValue) return
    const targets = replaceScope === "selection" ? cellsInRect() : slots.flatMap((_, row) => visibleColumns.map((column) => ({ row, col: column.id })))
    let next = requests
    targets.forEach((cell) => { if (!editableCell(cell) || cell.col === "urgent") return; const line = cellLine(cell); if (!line) return; const before = rawValue(line, cell.col), after = replaceText(before, findValue, replaceValue, replaceMatchCase); if (after !== before) next = updateCell(next, cell, after).next })
    if (next !== requests) saveMutation(next); setReplaceOpen(false)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.isComposing) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest("input,textarea,select,[contenteditable=true],[role=dialog]")) return
    const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase()
    if (mod && key === "h") { event.preventDefault(); setReplaceScope(rect ? "selection" : "all"); setReplaceOpen(true); return }
    if (mod && key === "c") { event.preventDefault(); void copyRange(); return }
    if (mod && key === "x") { event.preventDefault(); void copyRange(true); return }
    if (mod && key === "v") { event.preventDefault(); void pasteRange(); return }
    if (mod && key === "d") { event.preventDefault(); fillDown(); return }
    if (mod && key === "z" && event.shiftKey) { event.preventDefault(); redoLast(); return }
    if (mod && key === "z") { event.preventDefault(); undoLast(); return }
    if (mod && key === "y") { event.preventDefault(); redoLast(); return }
    if (event.key === "Escape") { setRange(null); setRowMenu(null); return }
    if (event.key === "Delete" || event.key === "Backspace") { if (rect) { event.preventDefault(); clearRange() }; return }
    if (event.shiftKey && event.code === "Space") { if (range) { event.preventDefault(); selectWholeRow(range.focus.row) }; return }
    if (event.key.startsWith("Arrow")) { event.preventDefault(); moveSelection(event.key.slice(5).toLowerCase() as CellMove, event.shiftKey); return }
    if (event.key === "Tab") { event.preventDefault(); moveSelection(event.shiftKey ? "left" : "right", false, true); return }
    if (event.key === "Enter") { event.preventDefault(); moveSelection(event.shiftKey ? "up" : "down"); return }
    if (event.key === "F2") { if (range) { event.preventDefault(); beginCellEdit(range.focus) }; return }
    if (event.key.length === 1 && !mod && !event.altKey && range) { event.preventDefault(); beginCellEdit(range.focus, event.key) }
  }
  const keyHandlerRef = useRef(onKey); keyHandlerRef.current = onKey
  useEffect(() => { const listener = (event: KeyboardEvent) => keyHandlerRef.current(event); window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener) }, [])
  const menuLine = rowMenu ? cellLine(rowMenu.cell) : null

  /** 양식 내려받기. 원장이 있으면 현재 값을 채워 준다. 받아서 고쳐 올리기 쉽다. */
  const downloadTemplate = async () => {
    setNotice(null)
    try {
      downloadBlob(await buildRequestWorkbook(visible), requestTemplateFileName())
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "양식을 만들지 못했습니다." })
    }
  }

  const ingest = async (file: File | undefined) => {
    if (!file) return
    if (readOnly || !activeBoardInfo) { commitRequests(requests); return }
    setNotice(null)
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
      const parsed = parseRequestWorkbook(workbook)
      const ignored = parsed.styles.filter((style) => style.chart.trim() && style.chart.trim() !== activeBoardInfo.name).length
      const incoming = parsed.styles.map((style) => ({ ...style, boardId: activeBoard, chart: activeBoardInfo.name }))
      const { merged, added, updated } = mergeRequestStyles(requests, incoming)
      commitRequests(merged, "upload")
      const skipped = parsed.warnings.length ? ` 확인할 내용 ${parsed.warnings.length}건: ${parsed.warnings.slice(0, 3).join(" / ")}${parsed.warnings.length > 3 ? " 외" : ""}` : ""
      setNotice({ kind: "ok", text: `추가 ${added}건, 갱신 ${updated}건을 반영했습니다.${skipped}${ignored ? ` 차트 열 값 ${ignored}건은 무시하고 현재 보드로 올렸습니다.` : ""}` })
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "파일을 읽지 못했습니다." })
    }
  }

  const cellValue = (line: Line, column: RequestColumn): ReactNode => {
    if (line.kind === "style") {
      if (column.scope === "option") return null
      const style = line.style
      switch (column.id) {
        case "image":
          return <ImageCell style={style} onUploaded={(paths) => patchStyle(style.reqId, paths)} onOpen={() => setPreview(style)} />
        case "garmentNo": return <span className="font-mono">{style.garmentNo}</span>
        case "boardName": {
          const board = requestBoards.find((item) => item.boardId === style.boardId)
          return board ? <button type="button" className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px]" onClick={(event) => { event.stopPropagation(); if (board.status === "종결") { setArchiveSelected(requestArchive.filter((archive) => archive.boardId === board.boardId).sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0]?.archiveId ?? null); setActiveBoard(ARCHIVE_VIEW) } else setActiveBoard(board.boardId) }}><span className="size-1.5 rounded-full" style={{ backgroundColor: boardKindColor(board.kind) }} />{board.name}{board.status === "종결" ? <span className="text-[var(--muted-foreground)]">종결</span> : null}</button> : <span className="text-[var(--muted-foreground)]">미분류</span>
        }
        case "brand": return style.brand
        case "contents": return style.contents
        case "origConstruction": return style.origConstruction
        case "origWeight": return text(style.origWeight)
        case "yarnAnalysis": return style.yarnAnalysis
        case "devConstruction": return style.devConstruction
        case "comment": return style.comment
        case "analyst": return style.analyst
        case "result": {
          const result = resultOf(style)
          const tone = result === "진행중" ? "bg-[color-mix(in_srgb,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]" : result === "완료" ? "bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]" : result === "드롭" ? "bg-[var(--muted)] text-[var(--muted-foreground)] line-through" : "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]"
          return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{result}</span>
        }
        case "urgent": return style.urgent
          ? <span className="rounded-full bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--destructive)]">URGENT</span>
          : null
        case "requester": return style.requester
        case "developer": return style.developer
        case "devPlan": return style.devPlan
        default: return null
      }
    }
    if (column.scope === "style") return null
    const option = line.option
    if (column.id === "ddStage") return renderDdStage(line.style, option)
    if (column.id === "ddLink") return renderDdLink(option)
    switch (column.id) {
      case "optNo": return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--muted)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--foreground)]">{option.no}</span>
      case "yarnDetail": return option.yarnDetail
      case "construction": return option.construction ?? ""
      case "weight": return text(option.weight)
      case "color": return option.color
      case "dyeingMethod": return option.dyeingMethod
      case "remark": return option.remark
      default: return null
    }
  }

  const renderDataCell = (
    line: Line,
    column: RequestColumn,
    slotIndex: number,
    height: number,
    maxHeight: number,
    rowSpan?: number,
  ): ReactNode => {
    const fixed = FIXED_COLUMNS.some((item) => item.id === column.id)
    const kind = editKindOf(column.id)
    const editable = kind !== null
    const cellRef = { row: slotIndex, col: column.id }
    const editing = editable && editCell?.row === slotIndex && editCell.col === column.id && kind !== "toggle"
    const isOption = line.kind === "option"
    const sel = selectionFor(slotIndex, column)
    return (
      <TableCell
        key={column.id}
        rowSpan={rowSpan}
        data-col-id={column.id}
        data-slot-index={slotIndex}
        className={`relative min-w-0 overflow-hidden border-b border-r border-[var(--border)] p-0 align-top text-xs ${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : "bg-[var(--card)]"} ${isOption ? "" : "border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))]"} ${fixed ? "sticky z-10" : ""} cursor-cell`}
        style={{ height, width: widthOf(column), boxShadow: selectionShadow(sel), ...(fixed ? { left: fixedLeft(column.id) } : null) }}
        title={isOption ? String(rawValue(line, column.id) ?? "") : editable ? "더블클릭해서 수정" : undefined}
        onMouseDown={(event) => onCellMouseDown(event, cellRef)}
        onMouseEnter={() => onCellEnter(cellRef)}
        onContextMenu={(event) => { event.preventDefault(); setCellAnchor(cellRef); setRowMenu({ x: event.clientX, y: event.clientY, cell: cellRef }) }}
        onDoubleClick={() => {
          if (!editable) return
          if (kind === "toggle") { const result = updateCell(requests, cellRef, line.style.urgent ? "" : "Y"); if (result.next !== requests) saveMutation(result.next); return }
          setEditCell(cellRef)
        }}
      >
        {editing ? (
          <CellEditor
            kind={kind}
            initial={editCell?.seed ?? rawValue(line, column.id)}
            members={ownerOptions}
            onCommit={(next, move, fillRange) => { fillRange && rect ? applyCells(cellsInRect(), next) : applyCells([cellRef], next); setEditCell(null); if (move) moveSelection(move) }}
            onCancel={() => setEditCell(null)}
          />
        ) : (
          <div
            className={`h-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] [scrollbar-width:thin] px-2 py-1 leading-snug ${column.align === "center" ? "text-center" : column.align === "right" ? "text-right tabular-nums" : ""}`}
            style={{ maxHeight }}
            title={isOption ? String(rawValue(line, column.id) ?? "") : undefined}
          >
            {cellValue(line, column)}
          </div>
        )}
        <FillHandle visible={sel.handle} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); fillRef.current = rect; dragRef.current = true }} />
        {isOption && column.id === "optNo" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`옵션 ${line.option.no} 삭제`}
            title="옵션 삭제"
            className="absolute right-0 top-1/2 size-5 -translate-y-1/2 p-0 opacity-0 group-hover/opt:opacity-100"
            onClick={(event) => { event.stopPropagation(); removeOption(line.style, line.option) }}
          >
            <Trash2 className="size-3" />
          </Button>
        ) : null}
      </TableCell>
    )
  }

  const submitBoard = (values: RequestBoardValues) => {
    const now = new Date().toISOString()
    if (boardDialog === "create") {
      const board: RequestBoard = { ...values, boardId: crypto.randomUUID(), status: "진행", order: openBoards.reduce((max, item) => Math.max(max, item.order), 0) + 1, createdAt: now, updatedAt: now, createdBy: actor.email, createdByName: actor.name, history: [boardEvent(actor, "create", { to: values.name }, now)] }
      saveRequestBoards([...requestBoards, board]); setActiveBoard(board.boardId)
    } else if (activeBoardInfo) {
      const fields = ["name", "kind", "team", "note", "createdBy", "createdByName"] as const
      const history = fields.filter((field) => activeBoardInfo[field] !== values[field]).map((field) => boardEvent(actor, "update", { target: field, from: String(activeBoardInfo[field]), to: String(values[field]) }, now))
      const nextBoard = { ...activeBoardInfo, ...values, updatedAt: now, history: [...activeBoardInfo.history, ...history] }
      const boards = requestBoards.map((item) => item.boardId === nextBoard.boardId ? nextBoard : item)
      if (values.name !== activeBoardInfo.name) saveRequestsAndBoards(requests.map((style) => style.boardId === nextBoard.boardId ? { ...style, chart: values.name, updatedAt: now } : style), boards)
      else saveRequestBoards(boards)
    }
    setBoardDialog(null)
  }
  const deleteBoard = () => { if (!activeBoardInfo) return; saveRequestBoards(requestBoards.filter((item) => item.boardId !== activeBoardInfo.boardId)); setActiveBoard(ALL_BOARDS); setBoardDialog(null) }
  const closeActiveBoard = ({ memo, fillResult }: { memo: string; fillResult?: Exclude<RequestResult, "진행중"> }) => {
    if (!activeBoardInfo || !canManageBoard(activeBoardInfo, authUser?.email, isOwner)) return
    const now = new Date().toISOString()
    const nextRequests = requests.map((style) => style.boardId === activeBoardInfo.boardId && resultOf(style) === "진행중" && fillResult ? { ...style, result: fillResult, resultAt: now, updatedAt: now } : style)
    const history = appendRequestHistory(requests, nextRequests, requestBoards, actor, now)
    const boards = closeBoard(history.boards, activeBoardInfo.boardId, actor, memo, now)
    const closed = boards.find((board) => board.boardId === activeBoardInfo.boardId)
    if (!closed) return
    const archive = buildBoardArchive(closed, nextRequests.filter((style) => style.boardId === closed.boardId), (option) => requestProcessStage(ddByLine, option), (option) => requestDdStatus(ddByLine, option).flNo)
    saveRequestsAndBoards(nextRequests, boards, "edit")
    saveRequestArchive([...requestArchive, archive])
    setUndoStack([]); setRedoStack([]); setCloseOpen(false); setArchiveSelected(archive.archiveId); setActiveBoard(ARCHIVE_VIEW)
  }
  const reopenArchivedBoard = (boardId: string) => { saveRequestBoards(reopenBoard(requestBoards, boardId, actor)); setActiveBoard(boardId) }
  const downloadArchive = async (archive: RequestArchive) => {
    try { downloadBlob(await buildRequestWorkbook(archive.styles), requestTemplateFileName()) }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "엑셀을 만들지 못했습니다." }) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
        {/* 보드 탭 레일. 전체와 보드 묶음을 구분선으로 가르고, 보드마다 종류 색 막대와 건수 배지로 구분한다. */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--muted)_55%,transparent)] p-1">
          <button type="button" title="모든 보드의 스타일을 모아 봅니다(보기 전용)" onClick={() => setActiveBoard(ALL_BOARDS)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-[background-color,box-shadow,color] duration-150 ${activeBoard === ALL_BOARDS ? "bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)]" : "text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"}`} style={activeBoard === ALL_BOARDS ? { boxShadow: "inset 0 -2px 0 var(--primary)" } : undefined}><span className="size-2 rounded-full bg-[var(--primary)]" />전체<Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{requests.length}</Badge><span className="text-[10px] font-normal text-[var(--muted-foreground)]">보기 전용</span></button>
          {openBoards.length ? <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" /> : null}
          {openBoards.map((board) => {
            const color = boardKindColor(board.kind)
            const active = activeBoard === board.boardId
            return <button key={board.boardId} type="button" title={`${board.name}, ${board.kind}${board.team ? `, ${board.team}` : ""}`} onClick={() => setActiveBoard(board.boardId)}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-[background-color,box-shadow,color,border-color] duration-150 ${active ? "border-[var(--border)] bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm" : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--card)_70%,transparent)]"}`}
              style={{ boxShadow: active ? `inset 3px 0 0 ${color}, inset 0 -2px 0 ${color}` : `inset 3px 0 0 color-mix(in srgb, ${color} 55%, transparent)` }}>
              <span className="max-w-40 truncate">{board.name}</span>
              <span className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold leading-5 tabular-nums" style={{ color, background: `color-mix(in srgb, ${color} ${active ? 18 : 12}%, transparent)` }}>{requests.filter((style) => style.boardId === board.boardId).length}</span>
            </button>
          })}
        </div>
        <Button type="button" size="sm" disabled={!currentUserCanWrite()} onClick={() => setBoardDialog("create")} className="shrink-0 gap-1 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_color-mix(in_srgb,var(--primary)_35%,transparent)] transition-transform active:translate-y-px"><Plus className="size-4" />새 보드</Button>
        <Button type="button" size="sm" variant={activeBoard === ARCHIVE_VIEW ? "secondary" : "outline"} className="shrink-0 rounded-lg" onClick={() => setActiveBoard(ARCHIVE_VIEW)}><Archive className="size-3.5" />보관함<Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{requestBoards.filter((board) => board.status === "종결").length}</Badge></Button>
        {activeBoard !== ARCHIVE_VIEW ? <div className="ml-auto flex items-center gap-2">
          <input
            ref={uploadRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => { void ingest(event.target.files?.[0]); event.target.value = "" }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void downloadTemplate()}>
            <Download className="size-4" />양식 내려받기
          </Button>
          {!readOnly ? <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
            <Upload className="size-4" />업로드
          </Button> : null}
          {!readOnly ? <Button type="button" size="sm" onClick={() => setDraft(blankStyle())}>
            <Plus className="size-4" />신규 의뢰
          </Button> : null}
        </div> : null}
      </div>

      {activeBoard === ARCHIVE_VIEW ? <RequestArchiveView archives={requestArchive} boards={requestBoards} selectedId={archiveSelected} onSelect={setArchiveSelected} canManage={(board) => canManageBoard(board, authUser?.email, isOwner)} onReopen={reopenArchivedBoard} onDownload={(archive) => void downloadArchive(archive)} /> : <>
      {activeBoardInfo ? <RequestBoardHeader board={activeBoardInfo} styles={scoped} stageOf={(option) => requestProcessStage(ddByLine, option)} canManage={canManageBoard(activeBoardInfo, authUser?.email, isOwner)} onEdit={() => setBoardDialog("edit")} onCloseBoard={() => setCloseOpen(true)} /> : null}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--border)] bg-[var(--card)]"
        style={{ borderTopColor: activeBoardInfo ? boardKindColor(activeBoardInfo.kind) : "var(--primary)" }}
      >
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border)] p-2">
          <Select value={sortKey} onValueChange={(next) => setSortKey(next as SortKey)}>
            <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>{SORT_LABEL[key]} 순</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={stage} onValueChange={(next) => setStage(next as StageFilter)}><TabsList>{(["전체", "분석", "개발"] as StageFilter[]).map((key) => <TabsTrigger key={key} value={key} className="h-6 px-2 text-[10px]">{key} {key === "전체" ? scoped.length : scoped.filter((item) => item.stage === key).length}</TabsTrigger>)}</TabsList></Tabs>
          <Button type="button" size="sm" variant={urgentOnly ? "default" : "outline"} className="h-7 shrink-0 px-2 text-[11px]" aria-pressed={urgentOnly} onClick={() => setUrgentOnly(!urgentOnly)}>
            <Flame className="size-3.5" />URGENT만
          </Button>
          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
            스타일 <strong className="text-[var(--foreground)]">{visible.length.toLocaleString("ko-KR")}</strong> · 옵션 <strong className="text-[var(--foreground)]">{optionCount.toLocaleString("ko-KR")}</strong>
          </span>
          <div className="ml-auto flex items-center gap-1">
            {COLUMN_GROUPS.map((group) => (
              <button
                type="button"
                key={group.key}
                aria-pressed={openGroups[group.key]}
                title={openGroups[group.key] ? `${group.label} 열 접기` : `${group.label} 열 펼치기`}
                onClick={() => toggleGroup(group.key)}
                className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-normal transition-colors ${openGroups[group.key]
                  ? "border-transparent text-white"
                  : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"}`}
                style={openGroups[group.key] ? { backgroundColor: group.color } : undefined}
              >
                {openGroups[group.key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {group.label}
                <span className="opacity-75">{group.columns.length}</span>
              </button>
            ))}
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-[var(--muted-foreground)]" onClick={resetColumnWidths} title="열 너비를 기본값으로 되돌립니다">
              <RotateCcw className="size-3.5" />너비 초기화
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-[var(--muted-foreground)]" onClick={resetRowHeights} title="행 높이를 기본값으로 되돌립니다">
              <RotateCcw className="size-3.5" />높이 초기화
            </Button>
          </div>
        </div>
        {notice ? (
          <div role="status" className={`mx-2 mt-2 rounded-full bg-[var(--muted)] px-3 py-1 text-xs ${notice.kind === "error" ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}>
            {notice.text}
            <button type="button" className="ml-2 underline underline-offset-2" onClick={() => setNotice(null)}>닫기</button>
          </div>
        ) : null}
        {scoped.length === 0 ? (
          <div onContextMenu={(event) => { if (readOnly) return; event.preventDefault(); setRowMenu(null); setBottomMenu({ x: event.clientX, y: event.clientY }) }} className="flex flex-1 items-center justify-center p-10">
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            {readOnly ? "아직 등록된 의뢰가 없습니다. 보드 탭에서 추가하세요." : "이 보드에 아직 스타일이 없습니다. 신규 의뢰나 빈 곳 우클릭으로 추가하세요."}
            <br />
            {!readOnly ? "양식 내려받기로 엑셀을 받아 채운 뒤 업로드할 수 있습니다." : null}
          </p>
          </div>
      ) : (
        <div ref={scrollRef} onContextMenu={(event) => { if (readOnly || (event.target as HTMLElement).closest("table")) return; event.preventDefault(); setRowMenu(null); setBottomMenu({ x: event.clientX, y: event.clientY }) }} className="min-h-0 flex-1 overflow-auto">
          <table
            className="table-fixed border-separate border-spacing-0 text-xs"
            style={{ width: tableWidth, minWidth: tableWidth }}
          >
            <colgroup>
              <col style={{ width: ROW_NO_WIDTH }} />
              {visibleColumns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
              <col style={{ width: ACTION_WIDTH }} />
            </colgroup>
            <TableHeader className="sticky top-0 z-30 bg-[var(--card)] shadow-sm">
              <TableRow>
                <TableHead
                  rowSpan={2}
                  title="행 번호. 행을 우클릭하면 옵션 추가와 삭제를 할 수 있습니다."
                  className="sticky left-0 top-0 z-50 border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-[10px] font-normal text-[var(--muted-foreground)]"
                  style={{ width: ROW_NO_WIDTH }}
                >
                  #
                </TableHead>
                {FIXED_COLUMNS.map((column) => (
                  <TableHead
                    key={column.id}
                    rowSpan={2}
                    className="relative sticky top-0 z-40 border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-xs font-normal text-[var(--muted-foreground)]"
                    style={{ left: fixedLeft(column.id), width: widthOf(column) }}
                  >
                    {column.label}
                    <span
                      aria-hidden="true"
                      title={`${column.label} 너비 조절`}
                      onMouseDown={(event) => startColumnResize(column, event)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
                    />
                  </TableHead>
                ))}
                {visibleGroups.map((group) => (
                  <TableHead
                    key={group.key}
                    colSpan={group.columns.length}
                    className="relative sticky top-0 z-30 h-6 border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-semibold"
                    style={{ color: group.color, background: `color-mix(in srgb, ${group.color} 12%, var(--card))` }}
                  >
                    <span>{group.label}</span>
                    <button
                      type="button"
                      aria-label={`${group.label} 열 접기`}
                      aria-pressed={true}
                      title={`${group.label} 열 접기`}
                      onClick={() => toggleGroup(group.key)}
                      className="absolute right-3 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none hover:bg-[var(--muted)]"
                    >
                      -
                    </button>
                    <span
                      aria-hidden="true"
                      title={`${group.label} 너비 조절`}
                      onMouseDown={(event) => startGroupResize(group.columns, event)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
                    />
                  </TableHead>
                ))}
                <TableHead
                  rowSpan={2}
                  className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--muted)] px-2"
                  style={{ width: ACTION_WIDTH }}
                />
              </TableRow>
              <TableRow>
                {visibleGroups.flatMap((group) => group.columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={`relative sticky top-6 z-30 h-8 truncate border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-xs font-normal text-[var(--muted-foreground)]`}
                    style={{ width: widthOf(column) }}
                    title={column.label}
                  >
                    {column.label}
                    <span
                      aria-hidden="true"
                      title={`${column.label} 너비 조절`}
                      onMouseDown={(event) => startColumnResize(column, event)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
                    />
                  </TableHead>
                )))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.flatMap((style, styleIndex) => {
                const styleLine: Line = { kind: "style", style }
                const styleColumns = visibleColumns.filter((column) => column.scope === "style")
                const optionColumns = visibleColumns.filter((column) => column.scope === "option")
                const hasOptionColumns = optionColumns.length > 0
                const optionSlots = Math.max(1, style.options.length)
                const rowSpan = hasOptionColumns ? optionSlots + 1 : 1
                const defaultOptionRowHeight = Math.max(OPTION_ROW_HEIGHT, Math.floor((STYLE_ROW_HEIGHT - ADD_ROW_HEIGHT) / optionSlots))
                const defaultBlockHeight = hasOptionColumns ? defaultOptionRowHeight * optionSlots + ADD_ROW_HEIGHT : STYLE_ROW_HEIGHT
                const requestedBlockHeight = Math.min(MAX_ROW_HEIGHT, Math.max(defaultBlockHeight, rowHeights[style.reqId] ?? 0))
                const optionRowHeight = hasOptionColumns ? Math.max(OPTION_ROW_HEIGHT, Math.floor((requestedBlockHeight - ADD_ROW_HEIGHT) / optionSlots)) : requestedBlockHeight
                const blockHeight = hasOptionColumns ? optionRowHeight * optionSlots + ADD_ROW_HEIGHT : requestedBlockHeight
                const firstOption = style.options[0]
                const styleStart = slots.findIndex((slot) => slot.style.reqId === style.reqId)
                const rows: ReactNode[] = []

                rows.push(
                  <TableRow key={`s:${style.reqId}`} data-req-id={style.reqId} className={firstOption ? "group/opt hover:bg-[var(--accent)]" : undefined} style={{ height: hasOptionColumns ? optionRowHeight : blockHeight }}>
                    <TableCell
                      rowSpan={rowSpan}
                      className="relative sticky left-0 z-20 select-none border-b border-r border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--muted)] p-0 text-center align-top text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]"
                      style={{ width: ROW_NO_WIDTH, height: blockHeight, ...(focusedReqId === style.reqId ? { outline: "2px solid var(--primary)", outlineOffset: "-2px" } : null) }}
                      title="우클릭: 옵션 추가·삭제"
                      data-row-start={styleStart}
                      onMouseDown={(event) => { if ((event.target as HTMLElement).closest("button,input")) return; event.preventDefault(); dragRef.current = true; rowDragRef.current = true; lastExtendRef.current = ""; selectWholeRow(styleStart, event.shiftKey) }}
                      onMouseEnter={() => { if (dragRef.current) selectWholeRow(styleStart, true) }}
                      onContextMenu={(event) => { event.preventDefault(); selectWholeRow(styleStart); setRowMenu({ x: event.clientX, y: event.clientY, cell: { row: styleStart, col: visibleColumns[0].id } }) }}
                    >
                      <div className="pt-1.5">{styleIndex + 1}</div>
                      {style.options.length ? (() => {
                        const statuses = style.options.map((option) => requestDdStatus(ddByLine, option))
                        const linkedCount = statuses.filter((status) => status.tone !== "none").length
                        const allDone = statuses.every((status) => status.tone === "done")
                        return <div title="DD에 연결된 옵션 수 / 전체 옵션 수" className={`mt-0.5 text-[9px] tabular-nums ${allDone ? "text-[var(--chart-2)]" : "text-[var(--muted-foreground)]"}`}>DD {linkedCount}/{style.options.length}</div>
                      })() : null}
                      <span
                        aria-hidden="true"
                        title="끌어서 행 높이 조절 · 더블클릭: 기본 높이"
                        onMouseDown={(event) => startRowResize(style.reqId, blockHeight, defaultBlockHeight, event)}
                        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); resetRowHeight(style.reqId) }}
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize select-none hover:bg-[var(--primary)]"
                      />
                    </TableCell>
                    {styleColumns.map((column) => renderDataCell(styleLine, column, styleStart, blockHeight, blockHeight, rowSpan))}
                    {hasOptionColumns && firstOption
                      ? optionColumns.map((column) => renderDataCell({ kind: "option", style, option: firstOption }, column, styleStart, optionRowHeight, optionRowHeight))
                      : hasOptionColumns ? optionColumns.map((column) => renderDataCell(styleLine, column, styleStart, optionRowHeight, optionRowHeight)) : null}
                    <TableCell
                      rowSpan={rowSpan}
                      className="border-b border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--card)] p-0 align-top"
                      style={{ height: blockHeight, width: ACTION_WIDTH }}
                    >
                      <div className="flex items-start justify-center gap-0.5 pt-1">
                        <Button type="button" size="sm" variant="ghost" className="size-6 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label={`${style.garmentNo || "의뢰"} 수정`} title="수정" onClick={() => setDraft(style)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="size-6 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label={`${style.garmentNo || "의뢰"} 삭제`} title="스타일 삭제" onClick={() => remove(style)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>,
                )

                if (hasOptionColumns) {
                  style.options.slice(1).forEach((option, optionOffset) => {
                    const optionLine: Line = { kind: "option", style, option }
                    rows.push(
                      <TableRow key={`o:${option.optId}`} className="group/opt hover:bg-[var(--accent)]" style={{ height: optionRowHeight }}>
                        {optionColumns.map((column) => renderDataCell(optionLine, column, styleStart + optionOffset + 1, optionRowHeight, optionRowHeight))}
                      </TableRow>,
                    )
                  })
                  rows.push(
                    <TableRow key={`a:${style.reqId}`} className="border-b border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))]" style={{ height: ADD_ROW_HEIGHT }}>
                      <TableCell colSpan={optionColumns.length} className="border-b border-r border-[var(--border)] border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--card)] p-0">
                        <Button type="button" variant="ghost" className="h-5 w-full justify-start gap-1 px-2 text-[11px] font-normal text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => addOption(style)}>
                          <Plus className="size-3" />옵션 추가
                        </Button>
                      </TableCell>
                    </TableRow>,
                  )
                }
                return rows
              })}
            </TableBody>
          </table>
        </div>
      )}
      </div>
      </>}

      {rowMenu ? <>
        {/* 덮개가 먼저 클릭을 받아 메뉴를 닫는다. 우클릭으로도 닫힌다. */}
        <div className="fixed inset-0 z-[85]" onMouseDown={() => setRowMenu(null)} onContextMenu={(event) => { event.preventDefault(); setRowMenu(null) }} />
        <div
          role="menu"
          className="fixed z-[90] w-44 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg"
          style={{ left: Math.min(rowMenu.x, window.innerWidth - 192), top: Math.min(rowMenu.y, window.innerHeight - 140) }}
        >
          <p className="truncate px-2 py-1 text-[10px] text-[var(--muted-foreground)]">{menuLine?.style.garmentNo || "선택 영역"}</p>
          {[
            { key: "copy", label: "복사", hint: "Ctrl+C", icon: <Copy className="size-3.5" />, run: () => void copyRange() },
            { key: "cut", label: "잘라내기", hint: "Ctrl+X", icon: <Scissors className="size-3.5" />, run: () => void copyRange(true) },
            { key: "paste", label: "붙여넣기", hint: "Ctrl+V", icon: <ClipboardPaste className="size-3.5" />, run: () => void pasteRange() },
            { key: "clear", label: "내용 지우기", hint: "Delete", icon: <Eraser className="size-3.5" />, run: clearRange },
            { key: "above", label: "옵션 위에 삽입", hint: "", icon: <Plus className="size-3.5" />, run: () => changeOptions("above") },
            { key: "below", label: "옵션 아래에 삽입", hint: "", icon: <Plus className="size-3.5" />, run: () => changeOptions("below") },
            { key: "delete-option", label: "옵션 삭제", hint: "", icon: <Trash2 className="size-3.5" />, run: () => changeOptions("delete") },
            { key: "row", label: "줄 전체 선택", hint: "Shift+Space", icon: <Rows3 className="size-3.5" />, run: () => selectWholeRow(rowMenu.cell.row) },
          ].filter((item) => !readOnly || item.key === "copy" || item.key === "row").map((item) => <button key={item.key} type="button" role="menuitem" onClick={() => { setRowMenu(null); item.run() }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]"><span className="text-[var(--muted-foreground)]">{item.icon}</span><span className="flex-1">{item.label}</span><span className="text-[10px] text-[var(--muted-foreground)]">{item.hint}</span></button>)}
          <div className="my-1 h-px bg-[var(--border)]" />
          {readOnly ? (() => {
            // 전체 탭은 보기 전용이라 편집 항목 대신 그 스타일의 보드 탭으로 보내는 길만 둔다.
            const targetBoard = menuLine ? openBoards.find((board) => board.boardId === menuLine.style.boardId) : undefined
            return <button type="button" role="menuitem" disabled={!targetBoard} title={targetBoard ? undefined : "진행 중인 보드가 없는 스타일입니다."} onClick={() => { if (targetBoard) setActiveBoard(targetBoard.boardId); setRowMenu(null) }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-40"><Pencil className="size-3.5" /><span className="flex-1">보드 탭에서 열기</span>{targetBoard ? <span className="max-w-20 truncate text-[10px] text-[var(--muted-foreground)]">{targetBoard.name}</span> : null}</button>
          })() : <>
          <button type="button" role="menuitem" disabled={!undoStack.length} onClick={() => { setRowMenu(null); undoLast() }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-40"><Undo2 className="size-3.5" /><span className="flex-1">되돌리기</span><span className="text-[10px]">Ctrl+Z</span></button>
          <button type="button" role="menuitem" disabled={!redoStack.length} onClick={() => { setRowMenu(null); redoLast() }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-40"><Redo2 className="size-3.5" /><span className="flex-1">다시 실행</span><span className="text-[10px]">Ctrl+Y</span></button>
          </>}
          {menuLine && !readOnly ? <><button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => { setMoveStyle(menuLine.style); setRowMenu(null) }}><Rows3 className="size-3.5" />다른 보드로 옮기기</button><button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]" onClick={() => { setDraft(menuLine.style); setRowMenu(null) }}><Pencil className="size-3.5" />스타일 수정</button><button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--destructive)] hover:bg-[var(--muted)]" onClick={() => remove(menuLine.style)}><Trash2 className="size-3.5" />스타일 삭제</button></> : null}
        </div>
      </> : null}

      {bottomMenu ? <>
        <div className="fixed inset-0 z-[85]" onMouseDown={() => setBottomMenu(null)} onContextMenu={(event) => { event.preventDefault(); setBottomMenu(null) }} />
        <div role="menu" className="fixed z-[90] min-w-44 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: Math.min(bottomMenu.x, window.innerWidth - 192), top: Math.min(bottomMenu.y, window.innerHeight - 130) }}>
          {[
            { key: "append-one", label: "스타일 1개 추가", hint: "목록 맨 아래", icon: <Plus className="size-3.5" />, run: () => appendBlankStyles(1) },
            { key: "append-five", label: "스타일 5개 추가", hint: "목록 맨 아래", icon: <Rows3 className="size-3.5" />, run: () => appendBlankStyles(5) },
            { key: "new-dialog", label: "신규 의뢰 창으로 추가", hint: "", icon: <Pencil className="size-3.5" />, run: () => { setBottomMenu(null); setDraft(blankStyle()) } },
          ].map((item) => <button key={item.key} type="button" role="menuitem" onClick={item.run} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--muted)]"><span className="text-[var(--muted-foreground)]">{item.icon}</span><span className="flex-1">{item.label}</span><span className="text-[10px] text-[var(--muted-foreground)]">{item.hint}</span></button>)}
        </div>
      </> : null}

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent className="w-[92vw] max-w-lg">
          <DialogHeader><DialogTitle>찾기 · 바꾸기</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-3">
            <label className="grid gap-1 text-xs">찾을 내용<Input autoFocus value={findValue} onChange={(event) => setFindValue(event.target.value)} /></label>
            <label className="grid gap-1 text-xs">바꿀 내용<Input value={replaceValue} onChange={(event) => setReplaceValue(event.target.value)} /></label>
            <label className="grid gap-1 text-xs">대상<Select value={replaceScope} onValueChange={(value) => setReplaceScope(value as "selection" | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selection" disabled={!rect}>선택 영역</SelectItem><SelectItem value="all">전체</SelectItem></SelectContent></Select></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={replaceMatchCase} onChange={(event) => setReplaceMatchCase(event.target.checked)} />대소문자 구분</label>
          </DialogBody>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setReplaceOpen(false)}>닫기</Button><Button type="button" disabled={!findValue} onClick={replaceAllMatches}>모두 바꾸기</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ProcessStageDialog
        open={stageTarget !== null}
        onOpenChange={(open) => { if (!open) setStageTarget(null) }}
        stage={stageTarget?.stage ?? null}
        title={stageTarget?.title ?? ""}
        onOpenDd={() => {
          if (!stageTarget?.rowId) return
          navigate(`/development/workspace?focus=${encodeURIComponent(stageTarget.rowId)}`)
          setStageTarget(null)
        }}
      />

      <RequestEditor
        open={draft !== null}
        draft={draft}
        ownerOptions={ownerOptions}
        boardName={activeBoardInfo?.name ?? "전체"}
        onClose={() => setDraft(null)}
        onSave={upsert}
      />

      <RequestBoardDialog open={boardDialog !== null} mode={boardDialog ?? "create"} board={boardDialog === "edit" ? activeBoardInfo ?? undefined : undefined} boards={requestBoards} teams={[...new Set(requestBoards.map((board) => board.team).filter(Boolean))]} isOwner={isOwner} canDelete={Boolean(activeBoardInfo && canDeleteBoard(activeBoardInfo, requests, isOwner))} onSubmit={submitBoard} onDelete={deleteBoard} onOpenChange={(open) => { if (!open) setBoardDialog(null) }} />
      <RequestBoardCloseDialog open={closeOpen} board={activeBoardInfo} styles={scoped} onConfirm={closeActiveBoard} onOpenChange={setCloseOpen} />
      <MoveStyleDialog open={moveStyle !== null} boards={openBoards.filter((board) => board.boardId !== activeBoard)} onOpenChange={(open) => { if (!open) setMoveStyle(null) }} onMove={(boardId) => { if (!moveStyle) return; const board = openBoards.find((item) => item.boardId === boardId); if (!board) return; saveMutation(requests.map((style) => style.reqId === moveStyle.reqId ? { ...style, boardId, chart: board.name, seq: nextBoardSeq(requests, boardId), updatedAt: new Date().toISOString() } : style)); setMoveStyle(null) }} />

      <PreviewDialog style={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
