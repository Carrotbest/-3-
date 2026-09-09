/**
 * FABRIC REQUEST — 통합원단부 1팀이 보내는 소싱 의뢰 원장.
 *
 * 엑셀 소싱 차트(27열 4밴드)를 웹으로 옮긴 화면이다. 엑셀에서 한 셀에 "1. / 2. / 3."으로
 * 눌러 담던 옵션을 라인으로 푼다. 스타일 1행 아래에 옵션 라인 N행이 붙는다.
 * 옵션 라인 하나가 나중에 DD MASTER 행 하나와 1대1로 연결된다(R104 예정).
 *
 * 행 높이는 고정이다. 엑셀에서는 글자 길이에 맞춰 행을 늘렸지만 여기서는 늘리지 않고
 * 넘치는 셀 안에서만 세로 스크롤한다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Download, ImagePlus, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react"
import * as XLSX from "xlsx"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { downloadBlob } from "@/data/dd-export"
import { deleteRequestImage, requestImageUrl, uploadRequestImage, validateRequestImage } from "@/data/request-image"
import { buildRequestWorkbook, mergeRequestStyles, parseRequestWorkbook, requestTemplateFileName } from "@/data/request-template"
import { MEMBERS, type RequestOption, type RequestStyle } from "@/data/schema"
import { saveRequests, useAppStore } from "@/store/useAppStore"

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
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "devPlan", label: "개발", width: 200, scope: "style" },
  ] },
  { key: "option", label: "옵션", color: "var(--warning)", columns: [
    { id: "optNo", label: "Opt", width: 50, scope: "option", align: "center" },
    { id: "yarnDetail", label: "Yarn Detail", width: 200, scope: "option" },
    { id: "color", label: "Color", width: 120, scope: "option" },
    { id: "dyeingMethod", label: "Dyeing", width: 90, scope: "option" },
    { id: "remark", label: "Remark", width: 180, scope: "option" },
  ] },
]

const ACTION_WIDTH = 76
const STYLE_ROW_HEIGHT = 112
const OPTION_ROW_HEIGHT = 40
const MIN_COLUMN_WIDTH = 56
const COL_WIDTHS_KEY = "fabric.request.colWidths"
const OPEN_GROUPS_KEY = "fabric.request.openGroups"

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
  no,
  yarnDetail: "",
  color: "",
  dyeingMethod: "",
  remark: "",
})

const text = (value: string | number | undefined): string =>
  value === undefined || value === "" ? "" : String(value)

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
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <ImagePlus className="size-4" />
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
  chartOptions: string[]
  onClose: () => void
  onSave: (style: RequestStyle) => void
}

function RequestEditor({ open, draft, ownerOptions, chartOptions, onClose, onSave }: EditorProps) {
  const [value, setValue] = useState<RequestStyle | null>(draft)

  useEffect(() => {
    setValue(draft)
  }, [draft])

  if (!value) return null

  const set = <K extends keyof RequestStyle>(key: K, next: RequestStyle[K]) =>
    setValue((current) => (current ? { ...current, [key]: next } : current))

  const setOption = (index: number, key: "yarnDetail" | "color" | "dyeingMethod" | "remark", next: string) =>
    setValue((current) => {
      if (!current) return current
      return { ...current, options: current.options.map((option, i) => (i === index ? { ...option, [key]: next } : option)) }
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
            {field("차트", (
              <Input
                className="h-8 text-xs"
                list="fabric-request-charts"
                value={value.chart}
                onChange={(event) => set("chart", event.target.value)}
                placeholder="26.FEB EU MARKET"
              />
            ))}
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
          <datalist id="fabric-request-charts">
            {chartOptions.map((chart) => <option key={chart} value={chart} />)}
          </datalist>

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
                  <div key={option.optId} className="grid grid-cols-[36px_1fr_1fr_100px_1fr_44px] items-center gap-2 px-3 py-2">
                    <span className="text-center text-xs font-semibold text-[var(--muted-foreground)]">{option.no}</span>
                    <Input className="h-8 text-xs" placeholder="Yarn Detail" value={option.yarnDetail} onChange={(event) => setOption(index, "yarnDetail", event.target.value)} />
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

type EditKind = "text" | "area" | "number" | "member" | "toggle" | null

/** 더블클릭으로 고칠 수 있는 열과 그 입력 방식. 사진과 옵션 번호는 자동 값이라 막는다. */
function editKindOf(columnId: string): EditKind {
  switch (columnId) {
    case "garmentNo": case "brand": case "origConstruction": case "devConstruction":
    case "requester": case "color": case "dyeingMethod":
      return "text"
    case "contents": case "yarnAnalysis": case "comment":
    case "devPlan": case "yarnDetail": case "remark":
      return "area"
    case "origWeight":
      return "number"
    case "analyst": case "developer":
      return "member"
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
  onCommit: (value: string) => void
  onCancel: () => void
}

/** 셀 안에서 바로 고친다. Enter 저장, Esc 취소, 포커스가 빠져도 저장한다. */
function CellEditor({ kind, initial, members, onCommit, onCancel }: CellEditorProps) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)

  const commit = () => {
    if (done.current) return
    done.current = true
    onCommit(value)
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

  const shared = {
    autoFocus: true,
    value,
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancel() }
      // 여러 줄 칸은 Enter로 줄을 바꾸고 Ctrl+Enter로 저장한다.
      else if (event.key === "Enter" && (kind !== "area" || event.ctrlKey || event.metaKey)) { event.preventDefault(); commit() }
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

  const [stage, setStage] = useState<StageFilter>("전체")
  const [sortKey, setSortKey] = useState<SortKey>("seq")
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [chart, setChart] = useState("전체")
  const [draft, setDraft] = useState<RequestStyle | null>(null)
  const [preview, setPreview] = useState<RequestStyle | null>(null)
  /** 편집 중인 셀 키. 행키:열id 하나만 열린다. */
  const [editCell, setEditCell] = useState<string | null>(null)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColumnWidths)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const chartOptions = useMemo(
    () => [...new Set(requests.map((item) => item.chart).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko-KR")),
    [requests],
  )

  const ownerOptions = useMemo(() => {
    const fromData = requests.flatMap((item) => [item.analyst, item.developer]).filter(Boolean)
    return [...new Set([...MEMBERS.map((member) => member.name), ...fromData])]
  }, [requests])

  const visible = useMemo(() => {
    const filtered = requests.filter((item) => {
      if (stage !== "전체" && item.stage !== stage) return false
      if (urgentOnly && !item.urgent) return false
      if (chart !== "전체" && item.chart !== chart) return false
      return true
    })
    // 정렬은 스타일 단위다. 옵션 라인은 부모에 붙어 함께 움직인다.
    return [...filtered].sort((a, b) => {
      if (sortKey === "seq") return a.seq - b.seq || a.garmentNo.localeCompare(b.garmentNo, "ko-KR")
      return (a[sortKey] || "").localeCompare(b[sortKey] || "", "ko-KR") || a.seq - b.seq
    })
  }, [requests, stage, urgentOnly, chart, sortKey])

  const lines = useMemo<Line[]>(
    () => visible.flatMap((style) => [
      { kind: "style" as const, style },
      ...style.options.map((option) => ({ kind: "option" as const, style, option })),
    ]),
    [visible],
  )

  const optionCount = visible.reduce((sum, style) => sum + style.options.length, 0)

  const upsert = (next: RequestStyle) => {
    const exists = requests.some((item) => item.reqId === next.reqId)
    saveRequests(exists ? requests.map((item) => (item.reqId === next.reqId ? next : item)) : [...requests, next])
    setDraft(null)
  }

  const patchStyle = (reqId: string, patch: Partial<RequestStyle>) => {
    saveRequests(requests.map((item) => (item.reqId === reqId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)))
  }

  const remove = (style: RequestStyle) => {
    if (!window.confirm(`${style.garmentNo || "이 의뢰"} 건을 삭제할까요? 옵션 ${style.options.length}건이 함께 지워집니다.`)) return
    saveRequests(requests.filter((item) => item.reqId !== style.reqId))
    // 사진은 없으면 조용히 넘어간다. 실패해도 원장 삭제는 그대로 둔다.
    void deleteRequestImage(style.reqId).catch(() => undefined)
  }

  const widthOf = (column: RequestColumn): number => colWidths[column.id] ?? column.width
  const visibleGroups = COLUMN_GROUPS.filter((group) => openGroups[group.key])
  const visibleColumns = [...FIXED_COLUMNS, ...visibleGroups.flatMap((group) => group.columns)]
  const tableWidth = visibleColumns.reduce((sum, column) => sum + widthOf(column), 0) + ACTION_WIDTH

  /** 좌측 고정 열의 누적 left 값. 조절된 너비를 따라간다. */
  const fixedLeft = (id: string): number => {
    let left = 0
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
    saveRequests(requests.map((item) => item.reqId !== style.reqId ? item : {
      ...item,
      options: item.options.map((current) => current.optId === option.optId ? { ...current, [columnId]: raw } : current),
      updatedAt: new Date().toISOString(),
    }))
  }

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
    setNotice(null)
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
      const parsed = parseRequestWorkbook(workbook)
      const { merged, added, updated } = mergeRequestStyles(requests, parsed.styles)
      saveRequests(merged)
      const skipped = parsed.warnings.length ? ` 건너뛴 행 ${parsed.warnings.length}개.` : ""
      setNotice({ kind: "ok", text: `추가 ${added}건, 갱신 ${updated}건을 반영했습니다.${skipped}` })
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
        case "brand": return style.brand
        case "contents": return style.contents
        case "origConstruction": return style.origConstruction
        case "origWeight": return text(style.origWeight)
        case "yarnAnalysis": return style.yarnAnalysis
        case "devConstruction": return style.devConstruction
        case "comment": return style.comment
        case "analyst": return style.analyst
        case "urgent": return style.urgent
          ? <span className="rounded bg-[var(--destructive)] px-1.5 py-0.5 text-[10px] font-bold text-white">V</span>
          : null
        case "requester": return style.requester
        case "developer": return style.developer
        case "devPlan": return style.devPlan
        default: return null
      }
    }
    if (column.scope === "style") return null
    const option = line.option
    switch (column.id) {
      case "optNo": return <span className="font-semibold text-[var(--muted-foreground)]">{option.no}</span>
      case "yarnDetail": return option.yarnDetail
      case "color": return option.color
      case "dyeingMethod": return option.dyeingMethod
      case "remark": return option.remark
      default: return null
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Tabs value={stage} onValueChange={(next) => setStage(next as StageFilter)}>
          <TabsList>
            <TabsTrigger value="전체">전체</TabsTrigger>
            <TabsTrigger value="분석">분석</TabsTrigger>
            <TabsTrigger value="개발">개발</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={sortKey} onValueChange={(next) => setSortKey(next as SortKey)}>
          <SelectTrigger className="h-8 w-[136px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>{SORT_LABEL[key]} 순</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={chart} onValueChange={setChart}>
          <SelectTrigger className="h-8 w-[184px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">차트 전체</SelectItem>
            {chartOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={urgentOnly} onCheckedChange={(next) => setUrgentOnly(next === true)} />
          URGENT만
        </label>

        <span className="text-xs text-[var(--muted-foreground)]">
          스타일 {visible.length.toLocaleString("ko-KR")}건, 옵션 {optionCount.toLocaleString("ko-KR")}건
        </span>

        <div className="ml-auto flex items-center gap-2">
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
          <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
            <Upload className="size-4" />업로드
          </Button>
          <Button type="button" size="sm" onClick={() => setDraft(blankStyle())}>
            <Plus className="size-4" />신규 의뢰
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-1.5">
        {COLUMN_GROUPS.map((group) => (
          <button
            type="button"
            key={group.key}
            aria-pressed={openGroups[group.key]}
            title={openGroups[group.key] ? `${group.label} 열 접기` : `${group.label} 열 펼치기`}
            onClick={() => toggleGroup(group.key)}
            className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors ${openGroups[group.key]
              ? "border-transparent font-semibold text-white"
              : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"}`}
            style={openGroups[group.key] ? { backgroundColor: group.color } : undefined}
          >
            {openGroups[group.key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {group.label}
            <span className="opacity-75">{group.columns.length}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={resetColumnWidths}
          className="ml-1 shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          title="열 너비를 기본값으로 되돌립니다"
        >
          너비 초기화
        </button>
      </div>

      {notice ? (
        <div
          role="status"
          className={`rounded-[var(--radius)] border px-3 py-2 text-xs ${notice.kind === "error"
            ? "border-[var(--destructive)] text-[var(--destructive)]"
            : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
        >
          {notice.text}
          <button type="button" className="ml-2 underline underline-offset-2" onClick={() => setNotice(null)}>닫기</button>
        </div>
      ) : null}

      {requests.length === 0 ? (
        <Card className="flex flex-1 items-center justify-center p-10">
          <p className="text-center text-sm text-[var(--muted-foreground)]">
            아직 등록된 의뢰가 없습니다.
            <br />
            &quot;양식 내려받기&quot;로 엑셀을 받아 채운 뒤 &quot;업로드&quot;하거나, &quot;신규 의뢰&quot;로 한 건씩 넣어 주세요.
          </p>
        </Card>
      ) : (
        <Card className="min-h-0 flex-1 overflow-auto p-0">
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-xs"
            style={{ width: tableWidth, minWidth: tableWidth }}
          >
            <TableHeader className="sticky top-0 z-30">
              <TableRow>
                {FIXED_COLUMNS.map((column) => (
                  <TableHead
                    key={column.id}
                    rowSpan={2}
                    className="relative sticky top-0 z-40 border-b border-r border-[var(--border)] bg-[var(--card)] px-1.5 text-center text-xs font-bold text-[var(--foreground)]"
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
                    className="relative sticky top-0 z-30 border-b border-r border-[var(--border)] px-2 text-center text-[11px] font-bold text-[var(--foreground)]"
                    style={{ background: `color-mix(in srgb, ${group.color} 20%, var(--card))` }}
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
                  className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)] px-1.5"
                  style={{ width: ACTION_WIDTH }}
                />
              </TableRow>
              <TableRow>
                {visibleGroups.flatMap((group) => group.columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className="relative sticky top-8 z-30 truncate border-b border-r border-[var(--border)] px-1.5 text-center text-xs font-bold text-[var(--foreground)]"
                    style={{ width: widthOf(column), background: `color-mix(in srgb, ${group.color} 7%, var(--card))` }}
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
              {lines.map((line) => {
                const isStyle = line.kind === "style"
                const height = isStyle ? STYLE_ROW_HEIGHT : OPTION_ROW_HEIGHT
                const key = isStyle ? `s:${line.style.reqId}` : `o:${line.option.optId}`
                return (
                  <TableRow key={key} className={isStyle ? "border-l-2 border-l-[var(--primary)]" : ""}>
                    {visibleColumns.map((column) => {
                      const fixed = FIXED_COLUMNS.some((item) => item.id === column.id)
                      const kind = editKindOf(column.id)
                      const inScope = line.kind === "style" ? column.scope === "style" : column.scope === "option"
                      const editable = kind !== null && inScope
                      const cellKey = `${key}:${column.id}`
                      const editing = editable && editCell === cellKey && kind !== "toggle"
                      return (
                        <TableCell
                          key={column.id}
                          className={`min-w-0 border-b border-r border-[var(--border)] p-0 align-top ${fixed ? "sticky z-10 bg-[var(--card)]" : ""} ${isStyle ? "" : "bg-[color-mix(in_srgb,var(--muted)_35%,transparent)]"} ${editable ? "cursor-cell" : ""}`}
                          style={{ height, width: widthOf(column), ...(fixed ? { left: fixedLeft(column.id) } : null) }}
                          title={editable ? "더블클릭해서 수정" : undefined}
                          onDoubleClick={() => {
                            if (!editable) return
                            // URGENT는 켜고 끄는 값이라 편집기를 띄우지 않고 바로 뒤집는다.
                            if (kind === "toggle") { patchStyle(line.style.reqId, { urgent: !line.style.urgent }); return }
                            setEditCell(cellKey)
                          }}
                        >
                          {/* editing이 참이면 kind는 편집기가 받는 네 가지 중 하나로 이미 좁혀진다. */}
                          {editing ? (
                            <CellEditor
                              kind={kind}
                              initial={rawValue(line, column.id)}
                              members={ownerOptions}
                              onCommit={(next) => { commitCell(line, column.id, next); setEditCell(null) }}
                              onCancel={() => setEditCell(null)}
                            />
                          ) : (
                            /* 행 높이는 고정이다. 내용이 넘치면 이 칸 안에서만 스크롤한다. */
                            <div
                              className={`h-full overflow-y-auto whitespace-pre-wrap break-words px-1.5 py-1 ${column.align === "center" ? "text-center" : column.align === "right" ? "text-right tabular-nums" : ""}`}
                              style={{ maxHeight: height }}
                            >
                              {cellValue(line, column)}
                            </div>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="border-b border-[var(--border)] p-0 align-top" style={{ height, width: ACTION_WIDTH }}>
                      {isStyle ? (
                        <div className="flex items-start justify-center gap-0.5 py-1">
                          <Button type="button" size="sm" variant="ghost" aria-label={`${line.style.garmentNo || "의뢰"} 수정`} onClick={() => setDraft(line.style)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" aria-label={`${line.style.garmentNo || "의뢰"} 삭제`} onClick={() => remove(line.style)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </table>
        </Card>
      )}

      <RequestEditor
        open={draft !== null}
        draft={draft}
        ownerOptions={ownerOptions}
        chartOptions={chartOptions}
        onClose={() => setDraft(null)}
        onSave={upsert}
      />

      <PreviewDialog style={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
