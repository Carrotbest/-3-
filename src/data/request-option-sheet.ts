import * as XLSX from "xlsx"

import { matchConstruction } from "./constructions"
import { matchCompany } from "./dd-workflow"
import type { RequestOption, RequestStyle } from "./schema"

const OPTION_COLUMNS = [
  { head: "Garment Number", key: "garmentNo", width: 22 },
  { head: "Opt", key: "no", width: 8 },
  { head: "LINE ID", key: "lineId", width: 20 },
  { head: "YARN DETAIL", key: "yarnDetail", width: 28 },
  { head: "CONS", key: "construction", width: 18 },
  { head: "W'T", key: "weight", width: 10 },
  { head: "COLOR", key: "color", width: 18 },
  { head: "DYEING METHOD", key: "dyeingMethod", width: 18 },
  // R423 에 더한 열이다. 그 열이 없는 옛 옵션 양식도 계속 읽는다.
  { head: "FINISH", key: "finish", width: 22, optional: true },
  { head: "CO", key: "co", width: 10 },
] as const

type OptionColumnKey = (typeof OPTION_COLUMNS)[number]["key"]

export interface OptionSheetRow {
  garmentNo: string
  no: number
  lineId: string
  yarnDetail: string
  construction: string
  weight: number | ""
  color: string
  dyeingMethod: string
  finish: string
  co: string
  /** 엑셀 행 번호. 경고 문구에 쓴다. */
  excelRow: number
}

export interface OptionSheetParseResult {
  rows: OptionSheetRow[]
  warnings: string[]
}

const optionValue = (option: RequestOption | null, key: OptionColumnKey): string | number => {
  if (!option) return ""
  if (key === "no") return option.no
  if (key === "lineId") return option.lineId ?? ""
  if (key === "yarnDetail") return option.yarnDetail
  if (key === "construction") return option.construction ?? ""
  if (key === "weight") return option.weight ?? ""
  if (key === "color") return option.color
  if (key === "dyeingMethod") return option.dyeingMethod
  if (key === "finish") return option.finish ?? ""
  if (key === "co") return option.co ?? ""
  return ""
}

export async function buildOptionWorkbook(styles: readonly RequestStyle[]): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Fabric R&D"
  workbook.created = new Date()
  const ws = workbook.addWorksheet("OPTIONS", { views: [{ state: "frozen", ySplit: 1 }] })

  OPTION_COLUMNS.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.width
    if (column.key === "lineId") ws.getColumn(index + 1).hidden = true
    const cell = ws.getCell(1, index + 1)
    cell.value = column.head
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F3F1" } }
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = {
      top: { style: "thin", color: { argb: "FFB8C6C3" } },
      bottom: { style: "thin", color: { argb: "FFB8C6C3" } },
      left: { style: "thin", color: { argb: "FFB8C6C3" } },
      right: { style: "thin", color: { argb: "FFB8C6C3" } },
    }
  })
  ws.getRow(1).height = 24

  let rowIndex = 2
  for (const style of styles) {
    const options: (RequestOption | null)[] = style.options.length ? style.options : [null]
    options.forEach((option, offset) => {
      const row = ws.getRow(rowIndex++)
      OPTION_COLUMNS.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        cell.value = column.key === "garmentNo" ? (offset === 0 ? style.garmentNo : "") : optionValue(option, column.key)
        cell.font = { size: 9 }
        cell.alignment = { vertical: "top", wrapText: true }
        cell.border = {
          top: { style: "hair", color: { argb: "FFD5DEDC" } },
          bottom: { style: "hair", color: { argb: "FFD5DEDC" } },
          left: { style: "hair", color: { argb: "FFD5DEDC" } },
          right: { style: "hair", color: { argb: "FFD5DEDC" } },
        }
      })
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function optionSheetFileName(boardName: string): string {
  const safeName = boardName.trim().replace(/[\\/:*?"<>|]+/g, "_") || "보드"
  const date = new Date()
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  return `FABRIC_REQUEST_옵션_${safeName}_${stamp}.xlsx`
}

const asText = (value: unknown): string => value === null || value === undefined ? "" : String(value).trim()

export function parseOptionWorkbook(workbook: XLSX.WorkBook): OptionSheetParseResult {
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLocaleUpperCase("en-US") === "OPTIONS") ?? workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error("OPTIONS 시트를 찾지 못했습니다. 옵션 양식을 받아서 쓰세요.")
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null })
  const header = (grid[0] ?? []).map(asText)
  const indexByKey = new Map<OptionColumnKey, number>()
  for (const column of OPTION_COLUMNS) {
    const index = header.indexOf(column.head)
    // 선택 열은 없어도 읽는다. 그 열이 없으면 그 값은 "변경 없음"이 되어 기존 값을 지킨다.
    if (index < 0 && "optional" in column && column.optional) continue
    if (index < 0) throw new Error(`양식이 다릅니다. 1행에 "${column.head}" 열이 없습니다. 옵션 양식을 받아서 쓰세요.`)
    indexByKey.set(column.key, index)
  }
  const at = (row: unknown[], key: OptionColumnKey): unknown => row[indexByKey.get(key) ?? -1] ?? null
  const rows: OptionSheetRow[] = []
  const warnings: string[] = []
  let currentGarment = ""
  for (let index = 1; index < grid.length; index += 1) {
    const row = grid[index] ?? []
    const excelRow = index + 1
    const garment = asText(at(row, "garmentNo"))
    if (garment) currentGarment = garment
    const lineId = asText(at(row, "lineId"))
    const values = {
      yarnDetail: asText(at(row, "yarnDetail")),
      construction: asText(at(row, "construction")),
      color: asText(at(row, "color")),
      dyeingMethod: asText(at(row, "dyeingMethod")),
      finish: asText(at(row, "finish")),
      co: asText(at(row, "co")),
    }
    const weightRaw = at(row, "weight")
    const weightText = asText(weightRaw)
    const hasOption = Object.values(values).some(Boolean) || weightText !== ""
    if (!hasOption && !lineId) continue
    if (!currentGarment) {
      warnings.push(`엑셀 ${excelRow}행은 Garment No.가 정해지기 전 옵션이라 건너뜁니다`)
      continue
    }
    let weight: number | "" = ""
    if (weightText) {
      const parsed = typeof weightRaw === "number" ? weightRaw : Number(weightText)
      if (Number.isFinite(parsed)) weight = parsed
      else warnings.push(`엑셀 ${excelRow}행 W'T "${weightText}" 은 숫자가 아니라 비워 두었습니다`)
    }
    const noValue = Number(asText(at(row, "no")))
    rows.push({
      garmentNo: currentGarment,
      no: Number.isFinite(noValue) && noValue > 0 ? noValue : rows.length + 1,
      lineId,
      ...values,
      weight,
      excelRow,
    })
  }
  return { rows, warnings }
}

export interface OptionFieldChange {
  key: "yarnDetail" | "construction" | "weight" | "color" | "dyeingMethod" | "finish" | "co"
  before: string
  after: string
}

export interface OptionPlanLine {
  lineId: string | null
  no: number
  /** 기존 옵션에 붙는지 새 옵션으로 늘어나는지 */
  kind: "update" | "append"
  changes: OptionFieldChange[]
}

export interface OptionPlanStyle {
  reqId: string
  garmentNo: string
  /** 미리보기를 만든 시점의 값. 적용 직전에 다시 비교한다. */
  updatedAt: string
  lines: OptionPlanLine[]
}

export interface OptionPlan {
  styles: OptionPlanStyle[]
  /** 적용하지 않는 것들. 사람이 읽을 문장이다. */
  skipped: string[]
  warnings: string[]
  changedFields: number
  appendedLines: number
}

const garmentKey = (value: string): string => value.trim().toLocaleUpperCase("en-US")
const optionText = (option: RequestOption, key: OptionFieldChange["key"]): string => {
  const value = option[key]
  return value === undefined || value === "" ? "" : String(value)
}

export function planOptionUpdate(styles: readonly RequestStyle[], boardId: string, rows: readonly OptionSheetRow[]): OptionPlan {
  const skipped: string[] = []
  const warnings: string[] = []
  const boardByKey = new Map<string, RequestStyle[]>()
  styles.filter((style) => style.boardId === boardId).forEach((style) => {
    const key = garmentKey(style.garmentNo)
    boardByKey.set(key, [...(boardByKey.get(key) ?? []), style])
  })

  const groups: Array<{ key: string; label: string; rows: OptionSheetRow[] }> = []
  rows.forEach((row) => {
    const key = garmentKey(row.garmentNo)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.rows.push(row)
    else groups.push({ key, label: row.garmentNo.trim(), rows: [row] })
  })
  const groupCounts = new Map<string, number>()
  groups.forEach((group) => groupCounts.set(group.key, (groupCounts.get(group.key) ?? 0) + 1))

  const planned: OptionPlanStyle[] = []
  let changedFields = 0
  let appendedLines = 0
  for (const group of groups) {
    if ((groupCounts.get(group.key) ?? 0) > 1) {
      if (!skipped.some((text) => text === `파일에 Garment No. "${group.label}" 이 여러 번 나옵니다`)) skipped.push(`파일에 Garment No. "${group.label}" 이 여러 번 나옵니다`)
      continue
    }
    const matches = boardByKey.get(group.key) ?? []
    if (matches.length === 0) { skipped.push(`보드에 없는 Garment No. "${group.label}" ${group.rows.length}줄`); continue }
    if (matches.length > 1) { skipped.push(`보드에 같은 Garment No. "${group.label}" 스타일이 ${matches.length}건이라 건너뜁니다`); continue }
    const duplicateIds = group.rows.map((row) => row.lineId.trim()).filter(Boolean)
    if (new Set(duplicateIds).size !== duplicateIds.length) {
      skipped.push(`Garment No. "${group.label}" 에 같은 LINE ID 가 여러 줄입니다. 옵션 하나를 여러 줄로 나눌 수 없습니다.`)
      continue
    }

    const style = matches[0]
    const optionsByLine = new Map(style.options.flatMap((option) => option.lineId ? [[option.lineId, option] as const] : []))
    const lines: OptionPlanLine[] = []
    let appendNo = style.options.length
    for (const row of group.rows) {
      const lineId = row.lineId.trim()
      const option = lineId ? optionsByLine.get(lineId) : undefined
      if (lineId && !option) { warnings.push(`엑셀 ${row.excelRow}행 LINE ID가 Garment No. "${group.label}" 옵션에 없어 건너뜁니다`); continue }
      const changes: OptionFieldChange[] = []
      const candidates: Array<[OptionFieldChange["key"], string]> = [
        ["yarnDetail", row.yarnDetail], ["construction", row.construction], ["weight", row.weight === "" ? "" : String(row.weight)],
        ["color", row.color], ["dyeingMethod", row.dyeingMethod], ["finish", row.finish], ["co", row.co],
      ]
      candidates.forEach(([key, raw]) => {
        if (!raw) return
        let after = raw
        if (key === "construction") {
          const matched = matchConstruction(raw)
          if (matched === null) { warnings.push(`엑셀 ${row.excelRow}행 CONS "${raw}" 은 목록에 없습니다`); return }
          after = matched
        } else if (key === "co") {
          const matched = matchCompany(raw)
          if (matched === null) { warnings.push(`엑셀 ${row.excelRow}행 CO "${raw}" 은 목록에 없습니다`); return }
          after = matched
        }
        const before = option ? optionText(option, key) : ""
        if (before !== after) changes.push({ key, before, after })
      })
      if (!changes.length) continue
      const kind = option ? "update" : "append"
      const no = option?.no ?? ++appendNo
      lines.push({ lineId: option?.lineId ?? null, no, kind, changes })
      changedFields += changes.length
      if (kind === "append") appendedLines += 1
    }
    if (lines.length) planned.push({ reqId: style.reqId, garmentNo: style.garmentNo, updatedAt: style.updatedAt, lines })
  }
  return { styles: planned, skipped, warnings, changedFields, appendedLines }
}

const blankOption = (reqId: string, no: number): RequestOption => ({
  optId: `${reqId}#${no}`,
  lineId: crypto.randomUUID(),
  no,
  yarnDetail: "",
  construction: "",
  weight: "",
  co: "",
  color: "",
  dyeingMethod: "",
  finish: "",
})

const applyChanges = (option: RequestOption, changes: readonly OptionFieldChange[]): RequestOption => {
  const next = { ...option }
  changes.forEach((change) => {
    if (change.key === "weight") next.weight = Number(change.after)
    else next[change.key] = change.after
  })
  return next
}

export function applyOptionPlan(styles: readonly RequestStyle[], plan: OptionPlan): { next: RequestStyle[]; conflicts: string[] } {
  const planById = new Map(plan.styles.map((style) => [style.reqId, style]))
  const seen = new Set<string>()
  const conflicts: string[] = []
  const now = new Date().toISOString()
  const next = styles.map((style) => {
    const planned = planById.get(style.reqId)
    if (!planned) return style
    seen.add(style.reqId)
    if (style.updatedAt !== planned.updatedAt) { conflicts.push(planned.garmentNo); return style }
    let options = [...style.options]
    planned.lines.forEach((line) => {
      if (line.kind === "update") {
        const index = options.findIndex((option) => option.lineId === line.lineId)
        if (index >= 0) options[index] = applyChanges(options[index], line.changes)
      } else {
        options.push(applyChanges(blankOption(style.reqId, options.length + 1), line.changes))
      }
    })
    options = options.map((option, index) => ({ ...option, no: index + 1, optId: `${style.reqId}#${index + 1}` }))
    return { ...style, options, updatedAt: now }
  })
  plan.styles.forEach((style) => { if (!seen.has(style.reqId)) conflicts.push(style.garmentNo) })
  return { next, conflicts }
}
