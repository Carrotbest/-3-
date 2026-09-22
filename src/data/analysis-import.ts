import { matchConstruction } from "./constructions"
import { DD_SEASON_OPTIONS } from "./dd-workflow"

export const ANALYSIS_IMPORT_COLUMNS = {
  anNo: ["Analysis request number"],
  photo: ["RDDA", "Photo", "Image", "사진"],
  department: ["Department"],
  customer: ["Customer name"],
  objective: ["Objective of analysis"],
  description: ["Analysis Description", "Request item"],
  requesterComment: ["Comment (Requester)", "Comment"],
  source: ["Original Fabric Source"],
  sourceCode: ["Source code"],
  season: ["Season/Year", "Season"],
  gender: ["Gender/Age", "Gender"],
  brand: ["Brand"],
  construction: ["Construction Name", "Construction"],
  contents: ["Fabric Content", "Contents"],
  weight: ["Fabric weight (gsm)", "Weight"],
  requestType: ["Request type"],
} as const

type ImportField = Exclude<keyof typeof ANALYSIS_IMPORT_COLUMNS, "photo">

export interface AnalysisImportRow {
  department: string
  customer: string
  objective: string
  description: string
  requesterComment: string
  source: string
  sourceCode: string
  season: string
  gender: string
  brand: string
  construction: string
  contents: string
  weight: number | ""
  requestType: "Normal" | "Urgent"
  image?: File
  warnings: string[]
}

const normalizeHeader = (value: string): string => value.toLocaleLowerCase("en-US").replace(/[\s()*]/g, "")
const aliasEntries = Object.entries(ANALYSIS_IMPORT_COLUMNS).flatMap(([field, aliases]) => aliases.map((alias) => [normalizeHeader(alias), field] as const))
const aliasByHeader = new Map(aliasEntries)

const cellText = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "string" || typeof value === "number") return String(value).trim()
  if (typeof value === "object") {
    const candidate = value as { text?: string; result?: unknown; richText?: Array<{ text?: string }> }
    if (typeof candidate.text === "string") return candidate.text.trim()
    if (candidate.result != null) return cellText(candidate.result)
    if (candidate.richText) return candidate.richText.map((item) => item.text ?? "").join("").trim()
  }
  return String(value).trim()
}

export async function parseAnalysisWorkbook(file: File): Promise<{ rows: AnalysisImportRow[]; warnings: string[] }> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer() as never)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return { rows: [], warnings: ["첫 번째 시트를 찾지 못했습니다."] }

  let headerRow = 0
  let columns = new Map<number, keyof typeof ANALYSIS_IMPORT_COLUMNS>()
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const found = new Map<number, keyof typeof ANALYSIS_IMPORT_COLUMNS>()
    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const field = aliasByHeader.get(normalizeHeader(cellText(cell.value)))
      if (field) found.set(columnNumber, field as keyof typeof ANALYSIS_IMPORT_COLUMNS)
    })
    if (new Set(found.values()).size >= 3) { headerRow = rowNumber; columns = found; break }
  }
  if (!headerRow) return { rows: [], warnings: ["1~10행에서 분석 양식 머리글을 찾지 못했습니다."] }

  const imagesByRow = new Map<number, File>()
  for (const placed of worksheet.getImages()) {
    const image = workbook.getImage(Number(placed.imageId)) as { buffer?: ArrayBuffer | Uint8Array; extension?: string } | undefined
    const nativeRow = (placed.range as { tl?: { nativeRow?: number } }).tl?.nativeRow
    if (nativeRow == null || !image?.buffer || imagesByRow.has(nativeRow + 1)) continue
    const extension = image.extension?.toLocaleLowerCase("en-US") === "png" ? "png" : "jpeg"
    const type = extension === "png" ? "image/png" : "image/jpeg"
    const source = image.buffer instanceof ArrayBuffer ? new Uint8Array(image.buffer) : Uint8Array.from(image.buffer)
    const copy = new Uint8Array(source.byteLength)
    copy.set(source)
    imagesByRow.set(nativeRow + 1, new File([copy.buffer], `analysis-import-${nativeRow + 1}.${extension === "png" ? "png" : "jpg"}`, { type }))
  }

  const warnings: string[] = []
  let warnedAnNo = false
  const rows: AnalysisImportRow[] = []
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = {} as Record<ImportField | "anNo", string>
    columns.forEach((field, columnNumber) => {
      if (field !== "photo") values[field] = cellText(worksheet.getCell(rowNumber, columnNumber).value)
    })
    const contentValues = Object.entries(values).filter(([field]) => field !== "anNo").map(([, value]) => value)
    if (!contentValues.some(Boolean) && !imagesByRow.has(rowNumber)) continue
    if (values.anNo && !warnedAnNo) {
      warnings.push("엑셀의 AN 번호는 쓰지 않고 새로 매깁니다")
      warnedAnNo = true
    }
    const rowWarnings: string[] = []
    const constructionMatch = matchConstruction(values.construction ?? "")
    const construction = constructionMatch == null ? values.construction ?? "" : constructionMatch
    if (constructionMatch == null) rowWarnings.push(`Construction 목록에 없는 값: ${construction}`)
    const season = values.season ?? ""
    if (season && !(DD_SEASON_OPTIONS as readonly string[]).includes(season)) rowWarnings.push(`Season 목록에 없는 값: ${season}`)
    const rawWeight = values.weight ?? ""
    const weightNumber = rawWeight === "" ? "" : Number(rawWeight.replace(/,/g, ""))
    const validWeight = typeof weightNumber === "number" && Number.isFinite(weightNumber)
    if (rawWeight && !validWeight) rowWarnings.push(`Weight를 숫자로 읽지 못함: ${rawWeight}`)
    rows.push({
      department: values.department ?? "", customer: values.customer ?? "", objective: values.objective ?? "",
      description: values.description ?? "", requesterComment: values.requesterComment ?? "", source: values.source ?? "",
      sourceCode: values.sourceCode ?? "", season, gender: values.gender ?? "", brand: values.brand ?? "",
      construction, contents: values.contents ?? "", weight: validWeight ? weightNumber : "",
      requestType: (values.requestType ?? "").toLocaleLowerCase("en-US").includes("urgent") ? "Urgent" : "Normal",
      image: imagesByRow.get(rowNumber), warnings: rowWarnings,
    })
    rowWarnings.forEach((warning) => warnings.push(`${rowNumber}행: ${warning}`))
  }
  return { rows, warnings }
}
