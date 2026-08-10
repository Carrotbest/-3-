/* tds-loader.ts — TDS 엑셀 → 레코드
   파일은 브라우저 안에서만 읽힌다. 어디에도 전송하지 않는다. */

import * as XLSX from "xlsx"

import { toDate } from "./format"
import {
  FIELDS,
  HEADER_MAP,
  type DevRecord,
  type DevRecordFieldKey,
} from "./schema"

const KEYS = new Set<DevRecordFieldKey>(FIELDS.map((field) => field.key))

type HeaderIndexMap = Partial<Record<DevRecordFieldKey, number>>

interface HeaderMatch {
  idx: number
  hits: number
  map: HeaderIndexMap
}

export interface TdsSheets {
  owner: string[]
  summary: string[]
  skipped: string[]
}

export interface LoadedTds {
  records: DevRecord[]
  workbook: XLSX.WorkBook
  sheets: TdsSheets
}

/** 시트 이름이 집계/요약 시트인가 */
const isSummarySheet = (name: string): boolean =>
  /overview|전체|total|summary|현황/i.test(name)

/** 무시할 시트 (기준값·안내·차트 등) */
const isIgnoredSheet = (name: string): boolean =>
  /^(설정|기준|안내|guide|chart|pivot|sheet\d*)$/i.test(name.trim())

function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()[\]]/g, "")
}

/** 헤더 행을 찾는다. 상위 12행 중 매핑 히트가 가장 많은 행. */
function findHeaderRow(rows: unknown[][]): HeaderMatch | null {
  let best: HeaderMatch | null = null
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const map: HeaderIndexMap = {}
    let hits = 0
    rows[i].forEach((cell, column) => {
      const key = HEADER_MAP[normalizeHeader(cell) as keyof typeof HEADER_MAP]
      if (key && !(key in map)) {
        map[key] = column
        hits++
      }
    })
    if (!best || hits > best.hits) best = { idx: i, hits, map }
  }
  return best && best.hits >= 4 ? best : null
}

function sheetRows(workbook: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
    header: 1,
    blankrows: false,
    defval: "",
  })
}

function rowToRecord(
  row: unknown[],
  map: HeaderIndexMap,
  sheetName: string,
  rowNumber: number,
): DevRecord {
  const values = {} as Record<DevRecordFieldKey, string | number>
  for (const key of KEYS) {
    const column = map[key]
    let value: unknown = column === undefined ? "" : row[column]
    if (value === null || value === undefined) value = ""
    if (key === "dueDate") {
      const date = toDate(value)
      value = date ? date.toISOString().slice(0, 10) : ""
    } else if (key === "weight") {
      const number = Number.parseFloat(String(value).replace(/[^\d.]/g, ""))
      value = Number.isNaN(number) ? "" : number
    } else {
      value = String(value).trim()
    }
    values[key] = value as string | number
  }
  return {
    ...values,
    _src: { sheet: sheetName, row: rowNumber },
  } as DevRecord
}

export async function loadTds(file: File): Promise<LoadedTds> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: "array", cellDates: true })

  const records: DevRecord[] = []
  const sheets: TdsSheets = { owner: [], summary: [], skipped: [] }

  for (const name of workbook.SheetNames) {
    if (isIgnoredSheet(name)) {
      sheets.skipped.push(name)
      continue
    }

    const rows = sheetRows(workbook, name)
    const head = findHeaderRow(rows)
    if (!head) {
      sheets.skipped.push(name)
      continue
    }

    if (isSummarySheet(name)) {
      sheets.summary.push(name)
      continue
    }
    sheets.owner.push(name)

    for (let i = head.idx + 1; i < rows.length; i++) {
      const row = rows[i]
      const styleColumn = head.map.styleNo
      if (styleColumn === undefined || !String(row[styleColumn] ?? "").trim()) continue
      records.push(rowToRecord(row, head.map, name, i + 1))
    }
  }

  if (!records.length) {
    throw new Error(
      "개발 건을 찾지 못했습니다. 시트 헤더에 Style No.·담당·납기 같은 항목이 있는지 확인해 주세요.",
    )
  }

  return { records, workbook, sheets }
}

/** 시트 하나의 유효 행 수 (Style No.가 있는 행) */
function countRows(workbook: XLSX.WorkBook, name: string): number {
  const rows = sheetRows(workbook, name)
  const head = findHeaderRow(rows)
  if (!head || head.map.styleNo === undefined) return 0
  let count = 0
  for (let i = head.idx + 1; i < rows.length; i++) {
    if (String(rows[i][head.map.styleNo] ?? "").trim()) count++
  }
  return count
}

/** 요약(전체 현황) 시트 이름들 */
export const summarySheetNames = (workbook: XLSX.WorkBook): string[] =>
  workbook.SheetNames.filter((name) => !isIgnoredSheet(name) && isSummarySheet(name))

/** 요약 시트들의 유효 행 수 합계 — reconcile 대조용 */
export const countSummaryRows = (
  workbook: XLSX.WorkBook,
  sheetNames: readonly string[],
): number => sheetNames.reduce((sum, name) => sum + countRows(workbook, name), 0)

/** 담당자 시트별 유효 행 수 — reconcile 대조용 */
export function ownerSheetCounts(workbook: XLSX.WorkBook): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of workbook.SheetNames) {
    if (isIgnoredSheet(name) || isSummarySheet(name)) continue
    const count = countRows(workbook, name)
    if (count > 0) counts[name] = count
  }
  return counts
}
