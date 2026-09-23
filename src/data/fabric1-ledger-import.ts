import * as XLSX from "xlsx"

import type { Fabric1IntakeInput } from "@/store/useAppStore"

type Cell = string | number | boolean | Date | null | undefined

const REQUIRED_HEADERS = [
  "R&D Number",
  "Ref. No",
  "Color",
  "완사입 업체",
  "Construction",
  "Content",
  "Weight (G/M2)",
  "입고담당자",
  "입고 요청일",
  "Remark",
] as const

const normalizeHeader = (value: Cell): string =>
  String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim()

const cellText = (value: Cell): string => {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return XLSX.SSF.format("yyyy-mm-dd", value)
  return String(value).trim()
}

const normalizeDate = (value: Cell): string => {
  if (value instanceof Date || (typeof value === "number" && Number.isFinite(value))) {
    return XLSX.SSF.format("yyyy-mm-dd", value)
  }
  const text = cellText(value)
  const matched = /^(\d{2}|\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(text)
  if (!matched) return text
  const year = matched[1].length === 2 ? 2000 + Number(matched[1]) : Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return text
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function extractFabric1Qty(remark: string): { yds: number | null; roll: boolean } {
  const roll = /ROLL/i.test(remark)
  if (remark.includes("전량")) return { yds: null, roll }
  const match = remark.match(/(\d+(?:\.\d+)?)\s*(?:YDS?|yards?)\b/i)
  if (!match) return { yds: null, roll }
  return { yds: Number(match[1]), roll }
}

export async function parseFabric1LedgerFile(file: File): Promise<{ inputs: Fabric1IntakeInput[]; warnings: string[] }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error("첫 번째 시트를 찾을 수 없습니다.")

  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: "",
  })
  if (!rows.length) throw new Error("헤더 행을 찾을 수 없습니다.")

  const headerIndex = new Map(rows[0].map((value, index) => [normalizeHeader(value), index]))
  const missing = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header))
  if (missing.length) throw new Error(`필수 열을 찾을 수 없습니다: ${missing.join(", ")}`)
  const valueAt = (row: Cell[], header: typeof REQUIRED_HEADERS[number]): Cell => row[headerIndex.get(header) as number]

  const warnings: string[] = []
  const inputs: Fabric1IntakeInput[] = []
  rows.slice(1).forEach((row, offset) => {
    if (!row.some((value) => cellText(value))) return
    const rowNumber = offset + 2
    const storageNo = cellText(valueAt(row, "R&D Number"))
    const flNo = cellText(valueAt(row, "Ref. No"))
    const color = cellText(valueAt(row, "Color"))
    const construction = cellText(valueAt(row, "Construction"))
    const content = cellText(valueAt(row, "Content"))
    const actualWeight = cellText(valueAt(row, "Weight (G/M2)"))
    const owner = cellText(valueAt(row, "입고담당자"))
    const requestDate = normalizeDate(valueAt(row, "입고 요청일"))
    const note = cellText(valueAt(row, "Remark"))
    const quantity = extractFabric1Qty(note)

    const required = [
      ["R&D Number", storageNo],
      ["Ref. No", flNo],
      ["Color", color],
      ["Construction", construction],
      ["Content", content],
      ["Weight (G/M2)", actualWeight],
      ["입고담당자", owner],
      ["입고 요청일", requestDate],
    ] as const
    required.forEach(([label, value]) => {
      if (!value) warnings.push(`${rowNumber}행: ${label} 값이 비어 있습니다.`)
    })

    inputs.push({
      storageNo,
      flNo,
      color,
      construction,
      owner,
      requestDate,
      occurredAt: requestDate,
      note,
      yds: quantity.yds,
      roll: quantity.roll,
      season: "",
      buyer: "",
      fields: {
        supplier: cellText(valueAt(row, "완사입 업체")),
        content,
        actualWeight,
      },
    })
  })

  if (!inputs.length) throw new Error("데이터 행을 찾을 수 없습니다.")
  return { inputs, warnings }
}
