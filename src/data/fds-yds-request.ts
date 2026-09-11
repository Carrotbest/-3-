import { ownerDisplayName, type DevRecord } from "@/data/schema"
import { isCompletedFlNo } from "@/data/dd-workflow"
import { isInProgress } from "@/data/derive"
import { fmtDate } from "@/data/format"

export interface FdsYdsRow {
  /** DD 행 식별자. `${_src.sheet}::${_src.row}` — BODY 수정 저장에 쓴다. */
  key: string
  /** STYLE#(GD#/SA#) 또는 ARRANGE#가 비어 있다. 그대로 보내면 GD가 작지를 못 찾는다. */
  missing: boolean
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

/** 표에 실제로 찍는 열. `key`와 `missing`은 화면 동작용 값이라 열에서 뺀다. */
export const FDS_YDS_COLUMNS: readonly { key: keyof Omit<FdsYdsRow, "key" | "missing">; head: string; width: number }[] = [
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

const text = (value: unknown): string => String(value ?? "").trim()
const dateText = (value: unknown): string => text(value) ? fmtDate(value) : ""

/** 표의 STYLE 칸에 넣는 값. GD#/SA# 한 곳에서만 만든다(추출 조건과 표시가 어긋나면 안 된다). */
const styleNoOf = (record: DevRecord): string =>
  text(record.tech?.development?.developmentNo || record.gdNo || record.saNo)

/**
 * 추출 조건을 바꾸려면 여기 한 곳만 고친다.
 *
 * 올리는 건은 **진행중인 GD 샘플 가운데 Received date가 있고 FDS 또는 YDS가 비어 있는 것**이다.
 *
 * **Received date가 없으면 올리지 않는다.** 원단 실물을 받은 뒤에 FDS를 따라가는 순서라
 * 아직 받지도 않은 건을 요청 목록에 올리면 GD에 보낼 수 없는 줄이 섞인다.
 *
 * **STYLE#(GD#/SA#)과 ARRANGE#가 비어도 올린다.** 예전에는 둘 다 있어야 올렸는데,
 * 그렇게 하면 번호를 아직 안 채운 건이 화면에서 조용히 사라져 요청 자체가 누락됐다.
 * 지금은 올리고 `missing`으로 표시해 맨 위에 세운다. 비어 있으면 GD가 작지를 못 찾으므로
 * 보내기 전에 DD MASTER에서 채워야 한다. 그 판단은 사람이 한다.
 */
export function collectFdsYdsRows(records: readonly DevRecord[]): FdsYdsRow[] {
  return records.filter((record) => {
    const co = text(record.tech?.development?.co || record.devType).toUpperCase()
    if (co !== "GD" || !text(record.styleNo)) return false
    // 진행중 판정은 `isInProgress` 하나를 쓴다. Status 값이 있으면 "진행중"일 때만,
    // 비어 있으면 완료 판정으로 가른다. 화면의 진행중 건수와 같은 기준이라야 숫자가 어긋나지 않는다.
    if (!isInProgress(record)) return false
    // 실물을 받은 건만 올린다. 원단을 받고 나서 FDS를 따라가는 순서다.
    if (!text(record.receivedDate)) return false
    // FL#이 등록된 건은 FDS를 이미 받은 것이다. 요청할 이유가 없다.
    if (isCompletedFlNo(record.flNo)) return false
    return !text(record.tech?.sampleDates?.fds) || !text(record.tech?.sampleDates?.yds)
  }).map((record) => ({
    key: `${record._src.sheet}::${record._src.row}`,
    missing: !styleNoOf(record) || !text(record.tech?.arrangeNo),
    // 퇴사자는 이니셜로 익명 표기한다. GD로 나가는 자료라 실명을 그대로 싣지 않는다.
    owner: ownerDisplayName(text(record.owner)),
    hmp: text(record.styleNo),
    style: styleNoOf(record),
    arrange: text(record.tech?.arrangeNo),
    body: bodyLabel(record),
    fabrication: text(record.tech?.yarnDetail),
    // 요청일은 메일 보내는 날에 맞춰 손으로 적는다. 접수일(requestDate)과 다르다.
    request: "",
    fds: dateText(record.tech?.sampleDates?.fds),
    yds: dateText(record.tech?.sampleDates?.yds),
    remark: text(record.note),
    // 번호가 빈 건을 맨 위에 세운다. 그대로 보내면 접수가 안 되니 먼저 눈에 걸려야 한다.
  })).sort((a, b) => Number(b.missing) - Number(a.missing)
    || a.owner.localeCompare(b.owner, "ko-KR", { numeric: true })
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
