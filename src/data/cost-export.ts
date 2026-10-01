import type { CostSheetDoc } from "./cost-sheets"
import type { YarnSpec } from "./yarn-blend"

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const FEE_GROUP_LABEL = { yarnDye: "원사", knitting: "편직", dyeing: "염색", other: "기타" } as const

function describeSpec(spec?: YarnSpec): string {
  if (!spec?.components.length) return "직접 입력"
  return spec.components.map((component) => {
    const mode = component.mode === "draft" ? ` ÷ ${component.factor ?? 3}` : component.mode === "overfeed" ? ` + ${component.factor ?? 0}%` : ""
    return `${component.fiber || "성분"} ${component.nominal || "-"}${component.unit}${mode}`
  }).join(" + ")
}

export async function exportCostSheetWorkbook(doc: CostSheetDoc): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("원가계산서")
  const { input, result } = doc.sheet
  const lineByIndex = result.lines
  const addTitle = (label: string) => {
    const row = sheet.addRow([label])
    row.font = { bold: true, color: { argb: "FFFFFFFF" } }
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } }
    sheet.mergeCells(row.number, 1, row.number, 9)
  }
  const addTableHeader = (values: string[]) => {
    const row = sheet.addRow(values)
    row.font = { bold: true }
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }
  }

  addTitle("머리")
  sheet.addRows([
    ["FL#", doc.flNo, "R&D No.", doc.storageNo ?? "", "Style No.", doc.styleNo, "Project", doc.project],
    ["Buyer", doc.buyer, "Season", doc.season, "Color", doc.color, "조직", doc.construction],
    ["계산일", new Date(doc.at), "버전", doc.version === 0 ? "임시" : doc.version, "담당", doc.owner],
  ])
  sheet.getCell("B4").numFmt = "yyyy-mm-dd"

  addTitle("기준")
  addTableHeader(["폭 inch", "중량 g/㎡", "gr/yd", "환율"])
  const basis = sheet.addRow([input.widthInch, input.gsm, result.grPerYd, input.fxRate])
  basis.getCell(1).numFmt = "0.00"
  basis.getCell(2).numFmt = "0.00"
  basis.getCell(3).numFmt = "0.00"
  basis.getCell(4).numFmt = "#,##0"

  addTitle("원사")
  addTableHeader(["표기", "해석", "투입%", "단가", "단위", "선염", "$/kg 기여", "비중%"])
  input.yarns.forEach((yarn, index) => {
    const row = sheet.addRow([yarn.name, describeSpec(yarn.spec), yarn.ratio, yarn.price, yarn.priceUnit, yarn.yarnDyed ? "Y" : "", lineByIndex[index]?.perKg ?? 0, lineByIndex[index]?.sharePct ?? 0])
    row.getCell(3).numFmt = "0.0\"%\""
    row.getCell(4).numFmt = "0.0000"
    row.getCell(7).numFmt = "0.0000"
    row.getCell(8).numFmt = "0.0\"%\""
  })

  addTitle("혼용율")
  sheet.addRow(["표기", doc.blend?.labelText ?? ""])
  sheet.addRow(["정확값", doc.blend?.label.map((item) => `${item.fiber} ${item.pct.toFixed(2)}%`).join(" · ") ?? ""])

  addTitle("공정")
  addTableHeader(["구분", "항목", "업체", "비고", "단가", "단위", "loss%", "$/kg 기여", "비중%"])
  input.fees.forEach((fee, index) => {
    const line = lineByIndex[input.yarns.length + index]
    const row = sheet.addRow([FEE_GROUP_LABEL[fee.group], fee.label, fee.mill ?? "", fee.remark ?? "", fee.rate, fee.unit, fee.loss, line?.perKg ?? 0, line?.sharePct ?? 0])
    row.getCell(5).numFmt = "0.0000"
    row.getCell(7).numFmt = "0.0\"%\""
    row.getCell(8).numFmt = "0.0000"
    row.getCell(9).numFmt = "0.0\"%\""
  })

  addTitle("결과")
  addTableHeader(["구분", "$/yd", "$/lb", "$/kg"])
  const net = sheet.addRow(["Net", result.netPerYd, result.netPerLb, result.netPerKg])
  if ((input.profitPct ?? 0) !== 0) sheet.addRow([`이익 포함 (${input.profitPct}%)`, result.totalPerYd, result.totalPerLb, result.totalPerKg])
  for (let rowNumber = net.number; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getCell(rowNumber, 2).numFmt = "0.0000"
    sheet.getCell(rowNumber, 3).numFmt = "0.0000"
    sheet.getCell(rowNumber, 4).numFmt = "0.0000"
  }

  sheet.columns = [{ width: 18 }, { width: 30 }, { width: 18 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }]
  sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: true } })
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: EXCEL_MIME })
}

export function costSheetFileName(doc: CostSheetDoc): string {
  const date = new Date(doc.at)
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  const key = (doc.flNo || doc.styleNo).trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "")
  return `원가_${key ? `${key}_` : ""}${stamp}_${doc.version === 0 ? "임시" : `v${doc.version}`}.xlsx`
}
