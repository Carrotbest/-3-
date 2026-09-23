import * as XLSX from "xlsx"

import { normalizeRackNo } from "@/data/warehouse-rack"
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
  if (match) return { yds: Number(match[1]), roll }
  /*
   * 단위 없이 숫자만 적은 칸도 잔량이다(1팀 대장의 "10", "7"). 칸 전체가 숫자일 때만 읽는다.
   * 글 안에 섞인 숫자는 품번이나 날짜라 잔량이 아니다.
   * 0은 잔량 0인지 미기입인지 갈리지 않아 수량 미상으로 둔다. 0을 넣으면 소진으로 읽힌다.
   */
  const bare = /^\d+(?:\.\d+)?$/.exec(remark.trim())
  if (bare && Number(bare[0]) > 0) return { yds: Number(bare[0]), roll }
  return { yds: null, roll }
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

  /**
   * Rack No.는 필수가 아니다. 1팀 대장은 예전에 이 열이 없었고 지금도 빈 행이 있다.
   * 표기 흔들림(`Rack NO.`, `Rack No.`, `RACK NO`)을 견디려고 이름을 정확히 맞추지 않고 찾는다.
   */
  const rackIndex = rows[0].findIndex((value) => /^rack\s*no\.?$/i.test(normalizeHeader(value)))

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
    // `V11`처럼 K/L 규칙 밖의 값은 대문자로만 정리돼 그대로 들어온다. 형식은 강제하지 않는다(2026-09-22).
    const rackNo = rackIndex < 0 ? "" : normalizeRackNo(cellText(row[rackIndex])) ?? ""
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
      rackNo,
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
