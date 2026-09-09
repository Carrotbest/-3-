import type { DevRecord } from "@/data/schema"
import { fmtDate } from "@/data/format"

export interface FdsYdsRow {
  /** DD 행 식별자. `${_src.sheet}::${_src.row}` — BODY 수정 저장에 쓴다. */
  key: string
  owner: string
  hmp: string
  style: string
  arrange: string
  body: string
  fabrication: string
  request: string
  fds: string
  yds: string
  remark: string
}

export const FDS_YDS_COLUMNS: readonly { key: keyof Omit<FdsYdsRow, "key">; head: string; width: number }[] = [
  { key: "owner", head: "담당", width: 10 },
  { key: "hmp", head: "HMP", width: 14 },
  { key: "style", head: "STYLE", width: 12 },
  { key: "arrange", head: "ARRANGE", width: 18 },
  { key: "body", head: "BODY", width: 8 },
  { key: "fabrication", head: "FABRICATION", width: 60 },
  { key: "request", head: "REQUEST", width: 12 },
  { key: "fds", head: "FDS", width: 12 },
  { key: "yds", head: "YDS", width: 12 },
  { key: "remark", head: "REMARK", width: 20 },
]

/** 저장값이 있으면 그것, 없으면 opt에서 만든다. opt가 없으면 빈 칸이다. */
export function bodyLabel(record: DevRecord): string {
  const stored = record.tech?.bodyNo?.trim()
  if (stored) return stored
  const opt = Number(String(record.opt ?? "").trim())
  return Number.isFinite(opt) && opt > 0 ? `B${String(opt).padStart(2, "0")}` : ""
}

const EXCLUDED_STATUS = new Set(["DROP", "HOLD", "REJECT"])
const text = (value: unknown): string => String(value ?? "").trim()
const dateText = (value: unknown): string => text(value) ? fmtDate(value) : ""

/** 추출 조건을 바꾸려면 여기 한 곳만 고친다. */
export function collectFdsYdsRows(records: readonly DevRecord[]): FdsYdsRow[] {
  return records.filter((record) => {
    const co = text(record.tech?.development?.co || record.devType).toUpperCase()
    const status = text(record.devStatus || record.stage).toUpperCase()
    return co === "GD" && !EXCLUDED_STATUS.has(status) && Boolean(text(record.styleNo))
      && (!text(record.tech?.sampleDates?.fds) || !text(record.tech?.sampleDates?.yds))
  }).map((record) => ({
    key: `${record._src.sheet}::${record._src.row}`,
    owner: text(record.owner),
    hmp: text(record.styleNo),
    style: text(record.tech?.development?.developmentNo || record.gdNo || record.saNo),
    arrange: text(record.tech?.arrangeNo),
    body: bodyLabel(record),
    fabrication: text(record.tech?.yarnDetail),
    request: dateText(record.requestDate),
    fds: dateText(record.tech?.sampleDates?.fds),
    yds: dateText(record.tech?.sampleDates?.yds),
    remark: text(record.note),
  })).sort((a, b) => a.owner.localeCompare(b.owner, "ko-KR", { numeric: true })
    || a.hmp.localeCompare(b.hmp, "ko-KR", { numeric: true })
    || a.body.localeCompare(b.body, "ko-KR", { numeric: true }))
}

export async function buildFdsYdsWorkbook(rows: readonly FdsYdsRow[]): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet("REQUEST")
  const edge = { style: "thin" as const, color: { argb: "FFBFBFBF" } }
  const border = { top: edge, bottom: edge, left: edge, right: edge }
  FDS_YDS_COLUMNS.forEach((column, index) => {
    const col = index + 3
    ws.getColumn(col).width = column.width
    const header = ws.getCell(7, col)
    header.value = column.head
    header.font = { bold: true }
    header.alignment = { horizontal: "center", vertical: "middle" }
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } }
    header.border = border
    rows.forEach((row, rowIndex) => {
      const cell = ws.getCell(rowIndex + 8, col)
      cell.value = row[column.key]
      cell.alignment = { vertical: "top", wrapText: true }
      cell.border = border
    })
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function fdsYdsFileName(date = new Date()): string {
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  return `FDS_YDS_요청_${stamp}.xlsx`
}

/** 아웃룩 본문에 붙이면 표로 들어간다. 실패하면 탭 구분 텍스트로 떨어진다. */
export async function copyFdsYdsTable(rows: readonly FdsYdsRow[]): Promise<"html" | "text"> {
  const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const cellStyle = "border:1px solid #bfbfbf; padding:4px 6px; font-size:12px;"
  const header = FDS_YDS_COLUMNS.map((column) => `<th style="${cellStyle} background:#d6e4f0; font-weight:bold; text-align:center;">${escapeHtml(column.head)}</th>`).join("")
  const body = rows.map((row) => `<tr>${FDS_YDS_COLUMNS.map((column) => `<td style="${cellStyle} vertical-align:top;">${escapeHtml(row[column.key]).replace(/\r\n|\r|\n/g, "<br>")}</td>`).join("")}</tr>`).join("")
  const html = `<table style="border-collapse:collapse;"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
  const tsv = [FDS_YDS_COLUMNS.map((column) => column.head).join("\t"),
    ...rows.map((row) => FDS_YDS_COLUMNS.map((column) => row[column.key].replace(/[\t\r\n]+/g, " ")).join("\t")),
  ].join("\n")
  // Blob과 ClipboardItem은 첫 await 전에, 클릭의 동기 실행 흐름에서 만든다.
  const htmlBlob = new Blob([html], { type: "text/html" })
  const textBlob = new Blob([tsv], { type: "text/plain" })
  try {
    if (typeof ClipboardItem !== "undefined") {
      const item = new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
      await navigator.clipboard.write([item])
      return "html"
    }
  } catch { /* HTML 복사를 지원하지 않으면 탭 구분 텍스트로 재시도한다. */ }
  await navigator.clipboard.writeText(tsv)
  return "text"
}
