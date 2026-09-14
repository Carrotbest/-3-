import { CACHE_KEYS } from "@/data/cache"
import { useAppStore } from "@/store/useAppStore"

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const CELL_TEXT_LIMIT = 32_000

type FlatRow = Record<string, string | number | boolean>

function cellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") {
    return value.length > CELL_TEXT_LIMIT ? `${value.slice(0, CELL_TEXT_LIMIT)}…(생략)` : value
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  const text = JSON.stringify(value) ?? ""
  return text.length > CELL_TEXT_LIMIT ? `${text.slice(0, CELL_TEXT_LIMIT)}…(생략)` : text
}

function flattenRow(value: unknown, prefix = "", result: FlatRow = {}): FlatRow {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) result[prefix] = cellValue(value)
    return result
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child !== null && typeof child === "object" && !Array.isArray(child)) flattenRow(child, path, result)
    else result[path] = cellValue(child)
  }
  return result
}

export async function buildJsonBackup(): Promise<Blob> {
  const state = useAppStore.getState()
  const data = Object.fromEntries(CACHE_KEYS.map((key) => [key, state[key]]))
  const payload = { app: "fabric-rnd", version: 1, exportedAt: new Date().toISOString(), data }
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
}

export async function buildExcelBackup(): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  const state = useAppStore.getState()
  const exportedAt = new Date().toISOString()
  const guide = workbook.addWorksheet("안내")
  guide.addRows([
    ["내보낸 시각", exportedAt],
    ["안내", "사람이 읽는 백업입니다. 복원에는 SETTING의 JSON 백업을 쓰세요."],
    [],
    ["시트", "내용", "행 수"],
    ["DD", "DD MASTER 전체 records", state.records.length],
    ["창고상태", "창고 상태 fabricOverrides", state.fabricOverrides.length],
    ["창고이력", "창고 작업 이력 fabricEvents", state.fabricEvents.length],
    ["샘플대장", "완료 샘플 completed", state.completed.length],
  ])
  guide.getColumn(1).width = 18
  guide.getColumn(2).width = 72
  guide.getRow(4).font = { bold: true }
  guide.views = [{ state: "frozen", ySplit: 1 }]

  const sheets: Array<[string, readonly unknown[]]> = [
    ["DD", state.records],
    ["창고상태", state.fabricOverrides],
    ["창고이력", state.fabricEvents],
    ["샘플대장", state.completed],
  ]
  for (const [name, values] of sheets) {
    const rows = values.map((value) => flattenRow(value))
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const worksheet = workbook.addWorksheet(name)
    if (headers.length) {
      worksheet.addRow(headers)
      for (const row of rows) worksheet.addRow(headers.map((header) => row[header] ?? ""))
      worksheet.getRow(1).font = { bold: true }
      worksheet.views = [{ state: "frozen", ySplit: 1 }]
      headers.forEach((header, index) => {
        worksheet.getColumn(index + 1).width = Math.min(48, Math.max(12, header.length + 2))
      })
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: EXCEL_MIME })
}

export function backupFileName(ext: "json" | "xlsx", date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
  return `FabricRnD_백업_${stamp}.${ext}`
}
