import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { Copy, FileSpreadsheet, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CONSTRUCTIONS } from "@/data/constructions"
import { parseFabric1IntakeExcel } from "@/data/fabric1-intake-excel"
import {
  FABRIC1_STORAGE_NO_MAX,
  FABRIC1_STORAGE_NO_MIN,
  isFabric1Item,
  storageNoLabel,
  storageNumberOf,
  type FabricLedgerItem,
} from "@/data/fabric-ledger"
import { claimStorageNumbers, releaseStorageNumbers } from "@/data/storage-claims"
import { addFabric1Intake } from "@/store/useAppStore"

interface Fabric1IntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ledger: readonly FabricLedgerItem[]
  defaultOwner: string
  suggestNumbers: (count: number) => number[]
  onSaved: (storageNo: string, notice?: string) => void
}

interface IntakeRow {
  id: string
  storageNo: string
  yds: string
  unknownYds: boolean
  roll: boolean
  flNo: string
  color: string
  construction: string
  content: string
  actualWeight: string
  supplier: string
  owner: string
  season: string
  buyer: string
  note: string
  /** 칸이 없다. 입고한 날(오늘)로 저장한다(R242). 줄을 더할 때 앞 줄 값을 물려준다. */
  requestDate: string
  defaults: { construction: string; owner: string; requestDate: string }
}

type TextField = Exclude<keyof IntakeRow, "id" | "unknownYds" | "roll" | "defaults">

// 1팀 대장 순서(R242): FL No., Color, Construction, Content, Weight, Mill, Requester, Season, Brand, Remark.
// Mill은 공급처(supplier), Requester는 입고담당자(owner), Brand는 buyer다.
const requiredFields: TextField[] = ["flNo", "color", "construction", "content", "actualWeight", "owner"]
const pasteColumns: Array<TextField | "roll"> = [
  "storageNo", "yds", "roll", "flNo", "color", "construction", "content", "actualWeight",
  "supplier", "owner", "season", "buyer", "note",
]
const checkedPasteValues = new Set(["Y", "O", "1", "TRUE", "R", "ROLL"])

let rowSequence = 0
const nextRowId = () => `fabric1-intake-${Date.now()}-${rowSequence++}`

const todayValue = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const makeRow = (defaults: IntakeRow["defaults"]): IntakeRow => ({
  id: nextRowId(),
  storageNo: "",
  yds: "",
  unknownYds: false,
  roll: false,
  flNo: "",
  color: "",
  construction: defaults.construction,
  content: "",
  actualWeight: "",
  supplier: "",
  owner: defaults.owner,
  season: "",
  buyer: "",
  note: "",
  requestDate: defaults.requestDate,
  defaults,
})

const initialRow = (owner: string): IntakeRow => makeRow({ construction: "", owner, requestDate: todayValue() })

const isBlankRow = (row: IntakeRow): boolean =>
  !row.storageNo.trim()
  && !row.yds.trim()
  && !row.unknownYds
  && !row.roll
  && !row.flNo.trim()
  && !row.color.trim()
  && row.construction.trim() === row.defaults.construction.trim()
  && !row.content.trim()
  && !row.actualWeight.trim()
  && !row.supplier.trim()
  && row.owner.trim() === row.defaults.owner.trim()
  && !row.season.trim()
  && !row.buyer.trim()
  && !row.note.trim()

const cellKey = (rowId: string, field: string) => `${rowId}:${field}`

export function Fabric1IntakeDialog({ open, onOpenChange, ledger, defaultOwner, suggestNumbers, onSaved }: Fabric1IntakeDialogProps) {
  const [rows, setRows] = useState<IntakeRow[]>(() => [initialRow(defaultOwner)])
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const excelInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setRows([initialRow(defaultOwner)])
    setInvalid(new Set())
    setError("")
  }, [defaultOwner, open])

  const activeRows = useMemo(() => rows.filter((row) => !isBlankRow(row)), [rows])
  const occupiedNumbers = useMemo(() => new Set(ledger
    .filter((item) => isFabric1Item(item) && item.status === "WAREHOUSE")
    .map(storageNumberOf)
    .filter((value): value is number => value !== null)), [ledger])

  // 자동 번호를 위에서부터 차례로 붙인다. 손으로 친 번호는 건너뛴다.
  const numberRows = useCallback((targets: readonly IntakeRow[]) => {
    const manual = new Set(targets.map((row) => row.storageNo.trim()).filter(Boolean))
    const candidates = suggestNumbers(targets.length + 30).map(String).filter((value) => !manual.has(value))
    const assigned = new Map<string, string>()
    targets.forEach((row) => {
      if (!row.storageNo.trim()) assigned.set(row.id, candidates.shift() ?? "")
    })
    return assigned
  }, [suggestNumbers])
  // 화면에는 빈 줄까지 모든 줄에 번호를 보인다. 팝업을 열거나 줄을 더하면 바로 다음 번호가 뜬다.
  const displayNumbers = useMemo(() => numberRows(rows), [numberRows, rows])
  // 저장은 실제로 입고하는 줄끼리 이어서 매긴다. 중간에 빈 줄이 있어도 번호가 비지 않는다.
  const autoNumbers = useMemo(() => numberRows(activeRows), [numberRows, activeRows])

  const manualErrors = useMemo(() => {
    const counts = new Map<string, number>()
    activeRows.forEach((row) => {
      const value = row.storageNo.trim()
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    })
    const errors = new Map<string, string>()
    activeRows.forEach((row) => {
      const value = row.storageNo.trim()
      if (!value) return
      const number = Number(value)
      if (!/^\d{4}$/.test(value) || !Number.isInteger(number) || number < FABRIC1_STORAGE_NO_MIN || number > FABRIC1_STORAGE_NO_MAX) {
        errors.set(row.id, `${FABRIC1_STORAGE_NO_MIN}~${FABRIC1_STORAGE_NO_MAX}의 4자리 번호를 입력하세요.`)
      } else if ((counts.get(value) ?? 0) > 1) {
        errors.set(row.id, "표 안에서 중복된 번호입니다.")
      } else if (occupiedNumbers.has(number)) {
        errors.set(row.id, "이미 1팀 창고에서 보관 중인 번호입니다.")
      }
    })
    return errors
  }, [activeRows, occupiedNumbers])

  const clearInvalid = (rowId: string, field: string) => {
    const key = cellKey(rowId, field)
    setInvalid((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  const setText = (rowId: string, field: TextField, value: string) => {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, [field]: value } : row))
    clearInvalid(rowId, field)
  }

  const setBoolean = (rowId: string, field: "unknownYds" | "roll", value: boolean) => {
    setRows((current) => current.map((row) => row.id === rowId
      ? { ...row, [field]: value, ...(field === "unknownYds" && value ? { yds: "" } : {}) }
      : row))
    if (field === "unknownYds") clearInvalid(rowId, "yds")
  }

  const appendRow = (source?: IntakeRow) => {
    const base = source ?? rows[rows.length - 1]
    const defaults = {
      construction: base?.construction ?? "",
      owner: base?.owner ?? defaultOwner,
      requestDate: base?.requestDate ?? todayValue(),
    }
    setRows((current) => [...current, makeRow(defaults)])
  }

  const duplicateRow = (source: IntakeRow) => {
    const duplicate: IntakeRow = {
      ...source,
      id: nextRowId(),
      storageNo: "",
      yds: "",
      unknownYds: false,
      color: "",
      defaults: { construction: source.construction, owner: source.owner, requestDate: source.requestDate },
    }
    setRows((current) => {
      const index = current.findIndex((row) => row.id === source.id)
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]
    })
  }

  const removeRow = (rowId: string) => {
    setRows((current) => current.length === 1 ? [initialRow(defaultOwner)] : current.filter((row) => row.id !== rowId))
    setInvalid((current) => new Set([...current].filter((key) => !key.startsWith(`${rowId}:`))))
  }

  const handleLastTab = (event: KeyboardEvent<HTMLInputElement>, row: IntakeRow, index: number) => {
    if (event.key !== "Tab" || event.shiftKey || index !== rows.length - 1) return
    event.preventDefault()
    const next = makeRow({ construction: row.construction, owner: row.owner, requestDate: row.requestDate })
    setRows((current) => [...current, next])
    requestAnimationFrame(() => document.getElementById(`${next.id}-storageNo`)?.focus())
  }

  const handlePaste = (event: ClipboardEvent<HTMLTableElement>) => {
    const text = event.clipboardData.getData("text")
    if (!text.includes("\t") && !/[\r\n]/.test(text)) return
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-paste-column]")
    const rowElement = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")
    if (!cell || !rowElement) return
    const startColumn = Number(cell.dataset.pasteColumn)
    const startRowId = rowElement.dataset.rowId
    const startRow = rows.findIndex((row) => row.id === startRowId)
    if (startRow < 0 || !Number.isInteger(startColumn)) return
    event.preventDefault()
    const lines = text.replace(/\r\n?/g, "\n").split("\n")
    if (lines.at(-1) === "") lines.pop()
    const grid = lines.map((line) => line.split("\t"))
    setRows((current) => {
      const next = current.map((row) => ({ ...row, defaults: { ...row.defaults } }))
      while (next.length < startRow + grid.length) {
        const previous = next[next.length - 1]
        next.push(makeRow({
          construction: previous?.construction ?? "",
          owner: previous?.owner ?? defaultOwner,
          requestDate: previous?.requestDate ?? todayValue(),
        }))
      }
      grid.forEach((values, rowOffset) => {
        const target = next[startRow + rowOffset]
        values.forEach((value, columnOffset) => {
          const field = pasteColumns[startColumn + columnOffset]
          if (!field) return
          if (field === "roll") target.roll = checkedPasteValues.has(value.trim().toUpperCase())
          else if (field === "yds") {
            target.unknownYds = value.trim() === "미상"
            target.yds = target.unknownYds ? "" : value.trim()
          } else target[field] = value.trim()
        })
      })
      return next
    })
    setInvalid(new Set())
    setError("")
  }

  const loadExcel = async (file: File | null) => {
    if (!file) return
    setImporting(true)
    setError("")
    try {
      const parsed = await parseFabric1IntakeExcel(file)
      if (!parsed.rows.length) {
        setError(parsed.warning ?? "가져올 행이 없습니다.")
        return
      }
      const imported = parsed.rows.map((value) => ({
        ...makeRow({ construction: "", owner: defaultOwner, requestDate: todayValue() }),
        flNo: value.flNo,
        construction: value.construction,
        content: value.content,
        actualWeight: value.actualWeight,
        supplier: value.supplier,
      }))
      setRows((current) => current.length === 1 && isBlankRow(current[0]) ? imported : [...current, ...imported])
      setInvalid(new Set())
    } catch (cause) {
      setError(`엑셀을 읽지 못했습니다. ${cause instanceof Error ? cause.message : ""}`.trim())
    } finally {
      setImporting(false)
      if (excelInput.current) excelInput.current.value = ""
    }
  }

  const inputClass = (rowId: string, field: string, extra = "") => `${extra} h-8 rounded-none px-2 text-center text-xs ${invalid.has(cellKey(rowId, field)) ? "border-[var(--destructive)] ring-1 ring-[var(--destructive)]" : ""}`

  const save = async () => {
    const targets = rows.filter((row) => !isBlankRow(row))
    if (!targets.length || saving) return
    if (manualErrors.size) {
      setError("R&D No.를 확인하세요.")
      return
    }

    const nextInvalid = new Set<string>()
    targets.forEach((row) => {
      requiredFields.forEach((field) => { if (!row[field].trim()) nextInvalid.add(cellKey(row.id, field)) })
      const yds = Number(row.yds)
      if (!row.unknownYds && (!row.yds.trim() || !Number.isFinite(yds) || yds <= 0)) nextInvalid.add(cellKey(row.id, "yds"))
      if (!row.storageNo.trim() && !autoNumbers.get(row.id)) nextInvalid.add(cellKey(row.id, "storageNo"))
    })
    if (nextInvalid.size) {
      setInvalid(nextInvalid)
      setError(`필수 칸 ${nextInvalid.size}개가 비어 있습니다.`)
      return
    }

    const assigned = targets.map((row) => row.storageNo.trim() || autoNumbers.get(row.id) as string)
    const spare = suggestNumbers(targets.length + 30).map(String)
    setSaving(true)
    setError("")
    let claimed: string[] = []
    try {
      try {
        claimed = await claimStorageNumbers([...assigned, ...spare], targets.length)
      } catch (cause) {
        throw new Error(cause instanceof Error && cause.message ? cause.message : "R&D No.를 예약하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.")
      }

      const claimedSet = new Set(claimed)
      const unavailableManual = targets.find((row) => row.storageNo.trim() && !claimedSet.has(row.storageNo.trim()))
      if (unavailableManual) {
        setError(`R&D No. ${unavailableManual.storageNo.trim()}는 다른 사람이 입고 중입니다. 다른 번호를 쓰세요.`)
        return
      }

      const manualNumbers = new Set(targets.map((row) => row.storageNo.trim()).filter(Boolean))
      const autoPool = claimed.filter((value) => !manualNumbers.has(value))
      let autoIndex = 0
      const actual = targets.map((row) => row.storageNo.trim() || autoPool[autoIndex++])
      await addFabric1Intake(targets.map((row, index) => ({
        storageNo: actual[index],
        flNo: row.flNo.trim(),
        color: row.color.trim(),
        construction: row.construction.trim(),
        owner: row.owner.trim(),
        requestDate: row.requestDate,
        note: row.note.trim(),
        season: row.season.trim(),
        buyer: row.buyer.trim(),
        yds: row.unknownYds ? null : Number(row.yds),
        roll: row.roll,
        fields: {
          content: row.content.trim(),
          actualWeight: row.actualWeight.trim(),
          ...(row.supplier.trim() ? { supplier: row.supplier.trim() } : {}),
        },
      })))

      const labels = actual.map((storageNo, index) => storageNoLabel({ storageNo, roll: targets[index].roll }))
      const numbers = actual.map(Number)
      const consecutive = targets.every((row) => !row.roll) && numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1)
      const numberText = consecutive && labels.length > 1 ? `${labels[0]}~${labels.at(-1)}` : labels.join(", ")
      // 화면에 보이던 번호와 실제로 나간 번호가 다르면 알린다(다른 사람이 먼저 입고했거나, 중간 빈 줄을 건너뛰었을 때).
      const shown = targets.map((row) => row.storageNo.trim() || displayNumbers.get(row.id) || "")
      const changes = actual.flatMap((value, index) => value !== shown[index] ? [`예정 ${shown[index]}, 실제 ${value}`] : [])
      const notice = `R&D No. ${numberText} ${targets.length}건 입고했습니다.${changes.length ? ` ${changes.join("; ")}.` : ""}`
      onOpenChange(false)
      onSaved(actual[0], notice)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "신규 입고를 저장하지 못했습니다.")
    } finally {
      await releaseStorageNumbers(claimed).catch(() => undefined)
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
    <DialogContent className="flex max-h-[88vh] w-[min(96vw,1680px)] max-w-none flex-col">
      <DialogHeader>
        <DialogTitle>1팀 신규 입고</DialogTitle>
        <DialogDescription>Rack No.는 창고팀이 입고 확인 때 입력합니다.</DialogDescription>
      </DialogHeader>
      <DialogBody className="min-h-0 overflow-hidden">
        {error ? <p role="alert" className="mb-2 text-sm text-[var(--destructive)]">{error}</p> : null}
        <div className="max-h-[calc(88vh-13rem)] overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
          <table className="w-max min-w-full table-fixed border-collapse text-xs" onPaste={handlePaste}>
            <colgroup>
              <col className="w-9" /><col className="w-[84px]" /><col className="w-[120px]" /><col className="w-11" />
              <col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[140px]" /><col className="w-[200px]" />
              <col className="w-[100px]" /><col className="w-[160px]" /><col className="w-[110px]" /><col className="w-[90px]" />
              <col className="w-[120px]" /><col className="w-[220px]" /><col className="w-16" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--muted)] text-[var(--muted-foreground)]">
              <tr>{["#", "R&D No.", "입고 수량 (YDS) *", "롤", "FL No. *", "Color *", "Construction *", "Content *", "Weight (G/M2) *", "Mill", "Requester *", "Season", "Brand", "Remark", ""].map((label, index) => <th key={`${label}-${index}`} className="h-9 whitespace-nowrap border-b border-r border-[var(--border)] px-1 text-center font-medium last:sticky last:right-0 last:z-10 last:border-l last:border-r-0 last:bg-[var(--muted)]">{label.endsWith(" *") ? <>{label.slice(0, -2)} <span className="text-[var(--destructive)]">*</span></> : label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const autoNo = displayNumbers.get(row.id) ?? ""
                const displayNo = row.storageNo || autoNo
                const displayLabel = displayNo ? storageNoLabel({ storageNo: displayNo, roll: row.roll }) : ""
                return <tr key={row.id} data-row-id={row.id} className="align-top">
                  <td className="border-b border-r border-[var(--border)] px-1 py-2 text-center text-[var(--muted-foreground)]">{index + 1}</td>
                  <td data-paste-column="0" className="border-b border-r border-[var(--border)] p-1">
                    <Input id={`${row.id}-storageNo`} aria-label={`${index + 1}행 R&D No.`} value={displayLabel} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setText(row.id, "storageNo", event.target.value)} className={inputClass(row.id, "storageNo", `font-mono ${row.storageNo ? "" : "text-[var(--muted-foreground)]"}`)} />
                    {manualErrors.get(row.id) ? <p className="mt-1 text-[10px] leading-tight text-[var(--destructive)]">{manualErrors.get(row.id)}</p> : null}
                  </td>
                  <td data-paste-column="1" className="border-b border-r border-[var(--border)] p-1"><div className="flex items-center gap-1"><Input aria-label={`${index + 1}행 입고 수량`} type="number" min="0.01" step="0.01" disabled={row.unknownYds} value={row.yds} onChange={(event) => setText(row.id, "yds", event.target.value)} className={inputClass(row.id, "yds", "min-w-0 flex-1")} /><label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px]"><Checkbox checked={row.unknownYds} onCheckedChange={(value) => setBoolean(row.id, "unknownYds", value === true)} />미상</label></div></td>
                  <td data-paste-column="2" className="border-b border-r border-[var(--border)] p-1 text-center"><Checkbox aria-label={`${index + 1}행 롤`} checked={row.roll} onCheckedChange={(value) => setBoolean(row.id, "roll", value === true)} /></td>
                  <td data-paste-column="3" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 FL No.`} value={row.flNo} onChange={(event) => setText(row.id, "flNo", event.target.value)} className={inputClass(row.id, "flNo")} /></td>
                  <td data-paste-column="4" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Color`} value={row.color} onChange={(event) => setText(row.id, "color", event.target.value)} className={inputClass(row.id, "color")} /></td>
                  <td data-paste-column="5" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Construction`} list="fabric1-intake-constructions" value={row.construction} onChange={(event) => setText(row.id, "construction", event.target.value)} className={inputClass(row.id, "construction")} /></td>
                  <td data-paste-column="6" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Content`} value={row.content} onChange={(event) => setText(row.id, "content", event.target.value)} className={inputClass(row.id, "content")} /></td>
                  <td data-paste-column="7" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Weight`} value={row.actualWeight} onChange={(event) => setText(row.id, "actualWeight", event.target.value)} className={inputClass(row.id, "actualWeight")} /></td>
                  <td data-paste-column="8" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Mill`} value={row.supplier} onChange={(event) => setText(row.id, "supplier", event.target.value)} className={inputClass(row.id, "supplier")} /></td>
                  <td data-paste-column="9" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Requester`} value={row.owner} onChange={(event) => setText(row.id, "owner", event.target.value)} className={inputClass(row.id, "owner")} /></td>
                  <td data-paste-column="10" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Season`} value={row.season} onChange={(event) => setText(row.id, "season", event.target.value)} className={inputClass(row.id, "season")} /></td>
                  <td data-paste-column="11" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Brand`} value={row.buyer} onChange={(event) => setText(row.id, "buyer", event.target.value)} className={inputClass(row.id, "buyer")} /></td>
                  <td data-paste-column="12" className="border-b border-r border-[var(--border)] p-1"><Input aria-label={`${index + 1}행 Remark`} value={row.note} onChange={(event) => setText(row.id, "note", event.target.value)} onKeyDown={(event) => handleLastTab(event, row, index)} className={inputClass(row.id, "note")} /></td>
                  <td className="sticky right-0 z-[1] border-b border-l border-[var(--border)] bg-[var(--card)] p-1"><div className="flex h-8 items-center justify-center gap-1"><button type="button" title="줄 복제" aria-label={`${index + 1}행 복제`} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => duplicateRow(row)}><Copy className="size-3.5" /></button><button type="button" title="줄 삭제" aria-label={`${index + 1}행 삭제`} className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]" onClick={() => removeRow(row.id)}><Trash2 className="size-3.5" /></button></div></td>
                </tr>
              })}
            </tbody>
          </table>
          <datalist id="fabric1-intake-constructions">{CONSTRUCTIONS.map((value) => <option key={value} value={value} />)}</datalist>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <input ref={excelInput} type="file" className="hidden" accept=".xlsx,.xlsm,.xls" onChange={(event) => void loadExcel(event.target.files?.[0] ?? null)} />
            <Button type="button" size="sm" variant="outline" disabled={importing || saving} onClick={() => excelInput.current?.click()}><FileSpreadsheet className="size-4" />{importing ? "읽는 중…" : "엑셀 업로드"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => appendRow()}><Plus className="size-4" />줄 추가</Button>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">{activeRows.length}건</strong> 입고 예정</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>취소</Button>
        <Button type="button" disabled={saving || activeRows.length === 0} onClick={() => void save()}>{saving ? "저장 중…" : `입고 (${activeRows.length}건)`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
