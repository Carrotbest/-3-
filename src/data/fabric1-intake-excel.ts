import * as XLSX from "xlsx"

export interface Fabric1IntakeExcelRow {
  flNo: string
  construction: string
  content: string
  actualWeight: string
  supplier: string
}

type Field = keyof Fabric1IntakeExcelRow

const HEADERS: Record<Field, string> = {
  flNo: "Ref. No",
  construction: "Construction",
  content: "Content",
  actualWeight: "Weight(G/M2)",
  supplier: "Supplier",
}

const FIELDS = Object.keys(HEADERS) as Field[]
const normalizeHeader = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toLowerCase()
const cellText = (value: unknown): string => String(value ?? "").trim()

export async function parseFabric1IntakeExcel(file: File): Promise<{ rows: Fabric1IntakeExcelRow[]; warning?: string }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { rows: [], warning: "헤더를 찾지 못했습니다." }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  })
  const expected = new Map(FIELDS.map((field) => [normalizeHeader(HEADERS[field]), field]))
  let headerRow = -1
  let columns: Partial<Record<Field, number>> = {}

  for (let rowIndex = 0; rowIndex < Math.min(5, grid.length); rowIndex += 1) {
    const found: Partial<Record<Field, number>> = {}
    grid[rowIndex].forEach((value, columnIndex) => {
      const field = expected.get(normalizeHeader(value))
      if (field !== undefined && found[field] === undefined) found[field] = columnIndex
    })
    if (Object.keys(found).length >= 3) {
      headerRow = rowIndex
      columns = found
      break
    }
  }

  if (headerRow < 0) return { rows: [], warning: "헤더를 찾지 못했습니다." }

  const rows = grid.slice(headerRow + 1).flatMap((values) => {
    const valueOf = (field: Field) => {
      const column = columns[field]
      return column === undefined ? "" : cellText(values[column])
    }
    const row: Fabric1IntakeExcelRow = {
      flNo: valueOf("flNo"),
      construction: valueOf("construction"),
      content: valueOf("content"),
      actualWeight: valueOf("actualWeight"),
      supplier: valueOf("supplier"),
    }
    return FIELDS.every((field) => !row[field]) ? [] : [row]
  })
  return { rows }
}
