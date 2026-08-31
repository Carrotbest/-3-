// DD MASTER 엑셀 내보내기 — 팀이 쓰던 Development Dashboard 의 "전체현황" 시트 양식을 그대로 재현한다.
// 레이아웃(행 구성·병합·색·열너비)은 실제 DD 파일에서 그대로 옮겨 왔다. 수식은 넣지 않고 값만 쓴다.
import type { DevRecord } from "./schema"
import { ownerDisplayName } from "./schema"

/** 대분류 머리(엑셀 3행). 색은 실제 DD 파일 값 그대로다. */
const GROUP_BANDS: { label: string; from: number; to: number; color: string }[] = [
  { label: "개발 REQUEST", from: 0, to: 9, color: "FF1F4E5F" },
  { label: "ORIGINAL 분석", from: 10, to: 15, color: "FF538135" },
  { label: "개발 DETAIL (옵션별)", from: 16, to: 29, color: "FF2E5E8C" },
  { label: "공정 SCHEDULE", from: 30, to: 37, color: "FFC55A11" },
  { label: "결과 RESULT", from: 38, to: 41, color: "FF6A4E8C" },
  { label: "DATA", from: 42, to: 60, color: "FF7F6000" },
  { label: "REVIEW & HISTORY", from: 61, to: 63, color: "FF943634" },
]

/** 두 줄로 묶이는 소분류 머리(엑셀 4행 라벨 + 5행 하위 라벨). */
const SUB_BANDS: { label: string; from: number; to: number }[] = [
  { label: "Finishing", from: 25, to: 28 },
  { label: "Yarn in-fac", from: 30, to: 31 },
  { label: "Knitting", from: 32, to: 33 },
  { label: "Dyeing", from: 34, to: 35 },
  { label: "Finishing", from: 36, to: 37 },
  { label: "Actual", from: 42, to: 46 },
  { label: "Knitting", from: 47, to: 52 },
  { label: "Greige", from: 53, to: 54 },
  { label: "Tenter", from: 55, to: 56 },
  { label: "Wash", from: 57, to: 58 },
  { label: "Finish", from: 59, to: 60 },
]

type Cell = string | number | null

const str = (value: unknown): Cell => {
  const text = value === null || value === undefined ? "" : String(value).trim()
  return text === "" ? null : text
}
const num = (value: unknown): Cell => {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : str(value)
}

/** 엑셀 머리글의 두 줄 표기. 원본 DD 가 셀 안에서 줄을 나눠 쓴다. */
const br = (top: string, bottom: string): string => top + String.fromCharCode(13, 10) + bottom

/** 엑셀 64열 정의. head 는 열 머리, sub 가 있으면 소분류 하위 라벨이다. */
interface ExportColumn {
  head: string
  sub?: string
  width: number
  value: (row: DevRecord) => Cell
}

const COLUMNS: ExportColumn[] = [
  { head: "담당", width: 8.8, value: (r) => str(ownerDisplayName(r.owner)) },
  { head: "Status", width: 9.8, value: (r) => str(r.devStatus || r.stage) },
  { head: "Style No.", width: 12.2, value: (r) => str(r.styleNo) },
  { head: "# of Opt", width: 12.2, value: (r) => num(r.opt) },
  { head: "Season", width: 12.2, value: (r) => str(r.season) },
  { head: "Buyer", width: 12.2, value: (r) => str(r.buyer) },
  { head: "Category", width: 12.2, value: (r) => str(r.category) },
  { head: "Planner", width: 8.2, value: (r) => str(r.planner) },
  { head: br("Request", "Date"), width: 10.2, value: (r) => str(r.requestDate) },
  { head: br("Due", "Date"), width: 12.2, value: (r) => str(r.dueDate) },

  { head: "Brand", width: 11.2, value: (r) => str(r.tech?.original?.brand) },
  { head: "Contents", width: 20.3, value: (r) => str(r.tech?.original?.contents) },
  { head: "Cons.", width: 11.2, value: (r) => str(r.tech?.original?.construction) },
  { head: "Org. Weight", width: 12.2, value: (r) => num(r.tech?.original?.weight) },
  { head: "Yarn (분석)", width: 56.7, value: (r) => str(r.tech?.original?.yarn) },
  { head: "Comments", width: 11.2, value: (r) => str(r.tech?.original?.comments) },

  { head: "Developer", width: 8.2, value: (r) => str(r.tech?.development?.developer || r.owner) },
  { head: "Co", width: 6.2, value: (r) => str(r.tech?.development?.co || r.devType) },
  { head: "GD#/SA#", width: 9.2, value: (r) => str(r.tech?.development?.developmentNo || r.gdNo || r.saNo) },
  { head: "Arrange#", width: 10.2, value: (r) => str(r.tech?.arrangeNo) },
  { head: "Yarn Detail", width: 90.7, value: (r) => str(r.tech?.yarnDetail) },
  { head: "Cons.", width: 15.2, value: (r) => str(r.construction) },
  { head: "T.Weight", width: 8.2, value: (r) => num(r.weight) },
  { head: "Color", width: 13.2, value: (r) => str(r.color) },
  { head: br("Dyeing", "Side"), width: 7.2, value: (r) => str(r.dyeing) },
  { head: "Finishing", sub: "A", width: 10.2, value: (r) => str(r.tech?.finishingSlots?.a) },
  { head: "Finishing", sub: "B", width: 12.2, value: (r) => str(r.tech?.finishingSlots?.b) },
  { head: "Finishing", sub: "C", width: 12.2, value: (r) => str(r.tech?.finishingSlots?.c) },
  { head: "Finishing", sub: "D", width: 12.2, value: (r) => str(r.tech?.finishingSlots?.d) },
  { head: "Remark", width: 19.2, value: (r) => str(r.note) },

  { head: "Yarn in-fac", sub: "Mill", width: 7.2, value: (r) => str(r.tech?.mills?.yarn) },
  { head: "Yarn in-fac", sub: "Status", width: 7.2, value: (r) => str(r.tech?.processDates?.yarn) },
  { head: "Knitting", sub: "Mill", width: 7.2, value: (r) => str(r.tech?.mills?.knitting) },
  { head: "Knitting", sub: "Status", width: 7.2, value: (r) => str(r.tech?.processDates?.knitting) },
  { head: "Dyeing", sub: "Mill", width: 7.2, value: (r) => str(r.tech?.mills?.dyeing) },
  { head: "Dyeing", sub: "Status", width: 7.2, value: (r) => str(r.tech?.processDates?.dyeing) },
  { head: "Finishing", sub: "Mill", width: 7.2, value: (r) => str(r.tech?.mills?.finishing) },
  { head: "Finishing", sub: "Status", width: 7.2, value: (r) => str(r.tech?.processDates?.finishing) },

  { head: br("Received", "Date"), width: 10.2, value: (r) => str(r.receivedDate) },
  { head: "FL#", width: 12.2, value: (r) => str(r.flNo) },
  { head: br("옵션 완료", "(완료/전체)"), width: 9.2, value: (r) => str(r.tech?.optionProgress) },
  { head: "Review", width: 21.2, value: (r) => str(r.tech?.review) },

  { head: "Actual", sub: "Width", width: 7.2, value: (r) => num(r.tech?.actual?.width) },
  { head: "Actual", sub: "Weight", width: 12.2, value: (r) => num(r.tech?.actual?.weight) },
  { head: "Actual", sub: "Balance", width: 12.2, value: (r) => num(r.tech?.actual?.balance) },
  { head: "Actual", sub: "축률(L)%", width: 8.7, value: (r) => num(r.tech?.actual?.shrinkageLength) },
  { head: "Actual", sub: "축률(W)%", width: 12.2, value: (r) => num(r.tech?.actual?.shrinkageWidth) },
  { head: "Knitting", sub: "Inch", width: 7.2, value: (r) => str(r.tech?.knitSpec?.inch) },
  { head: "Knitting", sub: "Gauge", width: 12.2, value: (r) => str(r.tech?.knitSpec?.gauge) },
  { head: "Knitting", sub: "Needles", width: 12.2, value: (r) => str(r.tech?.knitSpec?.needles) },
  { head: "Knitting", sub: "Loop(F)", width: 12.2, value: (r) => str(r.tech?.knitSpec?.loopF) },
  { head: "Knitting", sub: "Loop(T)", width: 12.2, value: (r) => str(r.tech?.knitSpec?.loopT) },
  { head: "Knitting", sub: "Loop(B)", width: 12.2, value: (r) => str(r.tech?.knitSpec?.loopB) },
  { head: "Greige", sub: "Width", width: 12.2, value: (r) => num(r.tech?.stageData?.greige?.width) },
  { head: "Greige", sub: "Weight", width: 12.2, value: (r) => num(r.tech?.stageData?.greige?.weight) },
  { head: "Tenter", sub: "Width", width: 12.2, value: (r) => num(r.tech?.stageData?.tenter?.width) },
  { head: "Tenter", sub: "Weight", width: 12.2, value: (r) => num(r.tech?.stageData?.tenter?.weight) },
  { head: "Wash", sub: "Width", width: 12.2, value: (r) => num(r.tech?.stageData?.wash?.width) },
  { head: "Wash", sub: "Weight", width: 12.2, value: (r) => num(r.tech?.stageData?.wash?.weight) },
  { head: "Finish", sub: "Brush", width: 12.2, value: (r) => str(r.tech?.finish?.brush) },
  { head: "Finish", sub: "Chemical", width: 12.2, value: (r) => str(r.tech?.finish?.chemical) },

  { head: "Pass/Fail", width: 8.2, value: (r) => str(r.tech?.passFail) },
  { head: "Fail 사유", width: 21.2, value: (r) => str(r.tech?.failReason) },
  { head: "Style History", width: 29.2, value: (r) => str(r.tech?.styleHistory) },
]

const HEADER_FILL = "FFD9E2E8"
const BORDER = "FFB6C0C8"

export interface DdExportSheet {
  name: string
  title: string
  rows: readonly DevRecord[]
}

/** 엑셀에서 못 쓰는 문자를 걷어내고 31자 제한에 맞춘다. */
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[\\/?*[\]:]/g, " ").trim() || "시트").slice(0, 31)
  let candidate = base
  let index = 2
  while (used.has(candidate)) candidate = `${base.slice(0, 28)}_${index++}`
  used.add(candidate)
  return candidate
}

/**
 * DD 양식 통합문서를 만든다.
 * 화면에 접혀 있는 열도 포함해 항상 64열 전부를 쓴다. 행 순서는 넘겨받은 그대로다.
 */
export async function buildDdWorkbook(sheets: readonly DdExportSheet[]): Promise<Blob> {
  // exceljs 는 CJS 라 번들러와 Node 에서 default 위치가 달라진다. 둘 다 받아 준다.
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Fabric R&D"
  workbook.created = new Date()

  const used = new Set<string>()
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(safeSheetName(sheet.name, used), {
      views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
    })
    COLUMNS.forEach((column, index) => { ws.getColumn(index + 1).width = column.width })

    // 1행 제목, 2행 공백, 3행 대분류, 4~5행 열 머리, 6행부터 데이터. 실제 DD 파일과 같은 배치다.
    ws.getCell(1, 1).value = sheet.title
    ws.getCell(1, 1).font = { bold: true, size: 12 }
    ws.getRow(1).height = 21
    ws.mergeCells(1, 1, 1, COLUMNS.length)

    for (const band of GROUP_BANDS) {
      ws.mergeCells(3, band.from + 1, 3, band.to + 1)
      const cell = ws.getCell(3, band.from + 1)
      cell.value = band.label
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band.color } }
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }
      cell.alignment = { horizontal: "center", vertical: "middle" }
    }
    ws.getRow(3).height = 15

    const subStart = new Map(SUB_BANDS.map((band) => [band.from, band]))
    const covered = new Set(SUB_BANDS.flatMap((band) => Array.from({ length: band.to - band.from + 1 }, (_, i) => band.from + i)))
    COLUMNS.forEach((column, index) => {
      if (covered.has(index)) {
        const band = subStart.get(index)
        if (band) {
          ws.mergeCells(4, band.from + 1, 4, band.to + 1)
          ws.getCell(4, band.from + 1).value = band.label
        }
        ws.getCell(5, index + 1).value = column.sub ?? ""
      } else {
        ws.mergeCells(4, index + 1, 5, index + 1)
        ws.getCell(4, index + 1).value = column.head
      }
    })
    for (const rowIndex of [4, 5]) {
      const row = ws.getRow(rowIndex)
      row.height = 15
      COLUMNS.forEach((_, index) => {
        const cell = row.getCell(index + 1)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
        cell.font = { bold: true, size: 9 }
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
        cell.border = {
          top: { style: "thin", color: { argb: BORDER } }, bottom: { style: "thin", color: { argb: BORDER } },
          left: { style: "thin", color: { argb: BORDER } }, right: { style: "thin", color: { argb: BORDER } },
        }
      })
    }

    sheet.rows.forEach((record, offset) => {
      const row = ws.getRow(6 + offset)
      COLUMNS.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        cell.value = column.value(record)
        cell.font = { size: 9 }
        cell.alignment = { vertical: "middle" }
        cell.border = {
          top: { style: "hair", color: { argb: BORDER } }, bottom: { style: "hair", color: { argb: BORDER } },
          left: { style: "hair", color: { argb: BORDER } }, right: { style: "hair", color: { argb: BORDER } },
        }
      })
    })

    // 머리글 두 줄을 자동 필터 기준으로 삼아 엑셀에서 바로 걸러 볼 수 있게 한다.
    if (sheet.rows.length) {
      ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + sheet.rows.length, column: COLUMNS.length } }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

/** 브라우저에서 파일로 내려받는다. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** 파일명 규칙: 짧게, 언더스코어, MMDD. */
export function ddExportFileName(scope: string, date = new Date()): string {
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  return `DD_${scope}_${stamp}.xlsx`
}

export const DD_EXPORT_COLUMN_COUNT = COLUMNS.length
