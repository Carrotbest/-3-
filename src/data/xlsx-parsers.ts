import * as XLSX from "xlsx"

import { normalizeSeason, toDate } from "./format"
import type {
  RddaDistribution,
  RddaPerspective,
  RddaReport,
  RddaScope,
  RddaSnapshot,
  TsRecord,
} from "./sample"
import { httpsMaterialLink, materialIdOf, MEMBERS } from "./schema"
import type {
  CompletedSample,
  DevRecord,
  DevTechnical,
  FabricAnalysisRow,
  MaterialDiagnostics,
  MaterialItem,
  MaterialKind,
  StudyRecord,
  StudyState,
} from "./schema"

type Row = unknown[]
type ColumnMap<T> = { [K in keyof T]: number }

const DEV_DEFAULT_COLUMNS = {
  owner: 0,
  status: 1,
  styleNo: 2,
  opt: 3,
  season: 4,
  buyer: 5,
  category: 6,
  planner: 7,
  requestDate: 8,
  dueDate: 9,
  origBrand: 10,
  origContents: 11,
  constructionPrimary: 12,
  originalWeight: 13,
  origYarn: 14,
  origComments: 15,
  constructionSecondary: 21,
  targetWeight: 22,
  color: 23,
  dyeing: 24,
  finishingA: 25,
  finishingB: 26,
  finishingC: 27,
  finishingD: 28,
  remark: 29,
  // 공정 도달 판정은 각 공정의 Status(완료일) 컬럼 기준. 30/32/34/36 은 Mill(업체명)이라
  // 항상 채워져 있어 완료 판정에 쓰면 안 된다. 완료일은 그 오른쪽 칸(31/33/35/37).
  yarnMill: 30,
  yarnStatus: 31,
  knittingMill: 32,
  knittingStatus: 33,
  dyeingMill: 34,
  dyeingStatus: 35,
  finishingMill: 36,
  finishingStatus: 37,
  receivedDate: 38,
  co: 17,
  developmentNo: 18,
  arrangeNo: 19,
  yarnDetail: 20,
  flNo: 39,
  optionProgress: 40,
  review: 41,
  actualWidth: 42,
  actualWeight: 43,
  actualBalance: 44,
  shrinkageLength: 45,
  shrinkageWidth: 46,
  knitInch: 47,
  knitGauge: 48,
  knitNeedles: 49,
  loopF: 50,
  loopT: 51,
  loopB: 52,
  greigeWidth: 53,
  greigeWeight: 54,
  tenterWidth: 55,
  tenterWeight: 56,
  washWidth: 57,
  washWeight: 58,
  finishBrush: 59,
  finishChemical: 60,
  passFail: 61,
  failReason: 62,
  styleHistory: 63,
} as const

const SAMPLE_DEFAULT_COLUMNS = {
  season: 1,
  buyer: 2,
  category: 3,
  owner: 6,
  styleNo: 7,
  flNo: 8,
  construction: 10,
  requestDate: 17,
  width: 13,
  weight: 14,
  yarnStatus: 19,
  knittingStatus: 21,
  dyeingStatus: 23,
  finishingStatus: 25,
  completedAt: 26,
  remark: 28,
  shrinkageLength: 29,
  shrinkageWidth: 30,
} as const

const compact = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s._#/'’"()\-[\]]+/g, "")

const text = (value: unknown): string => String(value ?? "").trim()

const firstText = (row: Row, ...columns: number[]): string => {
  for (const column of columns) {
    const value = text(row[column])
    if (value) return value
  }
  return ""
}

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const normalized = text(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  if (!normalized) return null
  const parsed = Number(normalized[0])
  return Number.isFinite(parsed) ? parsed : null
}

const isoDate = (value: unknown): string => {
  // SheetJS의 Date 객체를 toISOString()으로 자르면 한국 시간대에서 하루 전 날짜가 된다.
  // SSF는 엑셀 셀에 표시되는 달력 날짜를 그대로 보존한다.
  if (value instanceof Date) return XLSX.SSF.format("yyyy-mm-dd", value)
  const date = toDate(value)
  return date
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
    : ""
}

const sheetName = (workbook: XLSX.WorkBook, wanted: string): string => {
  const key = compact(wanted)
  const found = workbook.SheetNames.find((name) => compact(name) === key)
  if (!found) throw new Error(`'${wanted}' 시트를 찾을 수 없습니다.`)
  return found
}

const sheetRows = (sheet: XLSX.WorkSheet): Row[] =>
  XLSX.utils.sheet_to_json<Row>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  })

const columnWith = (headers: readonly unknown[], aliases: readonly string[]): number | null => {
  const normalizedAliases = aliases.map(compact)
  for (let column = 0; column < headers.length; column++) {
    const header = compact(headers[column])
    if (normalizedAliases.some((alias) => header === alias || header.includes(alias))) return column
  }
  return null
}

const columnWithAfter = (
  headers: readonly unknown[],
  aliases: readonly string[],
  after: number,
): number | null => {
  const normalizedAliases = aliases.map(compact)
  for (let column = after + 1; column < headers.length; column++) {
    const header = compact(headers[column])
    if (normalizedAliases.some((alias) => header === alias || header.includes(alias))) return column
  }
  return null
}

function mergedCellText(sheet: XLSX.WorkSheet, row: number, column: number): string {
  let targetRow = row
  let targetColumn = column
  const range = sheet["!merges"]?.find(
    (merge) => row >= merge.s.r && row <= merge.e.r && column >= merge.s.c && column <= merge.e.c,
  )
  if (range) {
    targetRow = range.s.r
    targetColumn = range.s.c
  }
  const cell = sheet[XLSX.utils.encode_cell({ r: targetRow, c: targetColumn })]
  return text(cell?.v)
}

function combinedHeaders(sheet: XLSX.WorkSheet, startRow: number, span: number): string[] {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")
  const headers: string[] = []
  for (let column = 0; column <= range.e.c; column++) {
    const parts = new Set<string>()
    for (let row = startRow; row < startRow + span; row++) {
      const value = mergedCellText(sheet, row, column)
      if (value) parts.add(value)
    }
    headers[column] = [...parts].join(" ")
  }
  return headers
}

function findHeaderStart(sheet: XLSX.WorkSheet, sample = false): number | null {
  for (let row = 0; row < 10; row++) {
    const headers = combinedHeaders(sheet, row, sample ? 2 : 1)
    const hasStyle = columnWith(headers, sample ? ["style/#", "style"] : ["style no", "style"]) !== null
    const hasAnchor = sample
      ? columnWith(headers, ["fl.#", "fl#"]) !== null
      : columnWith(headers, ["담당", "owner"]) !== null
    if (hasStyle && hasAnchor) return row
  }
  return null
}

const normalizeCategory = (value: unknown): string => {
  const key = compact(value)
  if (key === "seasondev" || key === "season") return "SEASON"
  if (key === "coreupdate" || key === "core") return "CORE"
  if (key === "eumarket") return "EU MARKET"
  if (key === "project") return "PROJECT"
  return text(value).toUpperCase()
}

const developmentType = (value: unknown): "GD" | "국내" =>
  compact(value).includes("gd") ? "GD" : "국내"

const isSubtotal = (value: unknown): boolean => /^(소계|합계|총계|total|subtotal|계)$/i.test(text(value))

const dayValue = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

const progressed = (value: unknown, today: Date): boolean => {
  // 공정 Status 컬럼은 완료일(날짜)을 담는다. 실제 날짜이면서 파싱(동기화)일 이전·당일이면 완료.
  // 미래 날짜, TBD/TBA/컬러미정 등 텍스트, 빈칸은 모두 미완료로 본다.
  let date: Date | null = null
  if (value instanceof Date && !Number.isNaN(value.getTime())) date = value
  else if (typeof value === "number" && Number.isFinite(value)) date = toDate(value)
  return date ? dayValue(date) <= dayValue(today) : false
}

function stageOf(row: Row, columns: ColumnMap<typeof DEV_DEFAULT_COLUMNS>, today: Date): string {
  if (text(row[columns.flNo])) return "완료"
  const stages = [
    [columns.yarnStatus, "원사"],
    [columns.knittingStatus, "편직"],
    [columns.dyeingStatus, "염색"],
    [columns.finishingStatus, "가공"],
  ] as const
  let stage = "원사"
  for (const [column, label] of stages) {
    if (progressed(row[column], today)) stage = label
  }
  return stage
}

function devColumns(sheet: XLSX.WorkSheet, headerRow: number): ColumnMap<typeof DEV_DEFAULT_COLUMNS> {
  const headers = combinedHeaders(sheet, headerRow, headerRow === 3 ? 2 : 1)
  const requestOwner = columnWith(headers, ["담당", "owner"])
  const fallbackForSheet = (fallback: number): number =>
    requestOwner === null && fallback > DEV_DEFAULT_COLUMNS.owner ? fallback - 1 : fallback
  const locate = (aliases: readonly string[], fallback: number): number =>
    columnWith(headers, aliases) ?? fallbackForSheet(fallback)
  const locateAfter = (aliases: readonly string[], fallback: number, after: number): number =>
    columnWithAfter(headers, aliases, after) ?? fallbackForSheet(fallback)

  const owner = locate(["담당", "owner", "developer"], DEV_DEFAULT_COLUMNS.owner)
  const status = locate(["status", "상태"], DEV_DEFAULT_COLUMNS.status)
  const styleNo = locate(["style no", "style"], DEV_DEFAULT_COLUMNS.styleNo)
  const opt = locate(["# of opt", "opt", "option"], DEV_DEFAULT_COLUMNS.opt)
  const season = locate(["season", "시즌"], DEV_DEFAULT_COLUMNS.season)
  const buyer = locate(["buyer", "바이어"], DEV_DEFAULT_COLUMNS.buyer)
  const category = locate(["category", "카테고리"], DEV_DEFAULT_COLUMNS.category)
  const planner = locate(["planner", "플래너"], DEV_DEFAULT_COLUMNS.planner)
  const requestDate = locate(
    ["request date", "requested date", "requestdate", "요청일"],
    DEV_DEFAULT_COLUMNS.requestDate,
  )
  const dueDate = locate(["due date", "납기"], DEV_DEFAULT_COLUMNS.dueDate)
  const origBrand = locateAfter(["brand"], DEV_DEFAULT_COLUMNS.origBrand, dueDate)
  const origContents = locateAfter(
    ["contents", "material composition", "composition"],
    DEV_DEFAULT_COLUMNS.origContents,
    origBrand,
  )
  const constructionPrimary = locateAfter(
    ["cons.", "cons", "construction", "structure", "조직"],
    DEV_DEFAULT_COLUMNS.constructionPrimary,
    origContents,
  )
  const originalWeight = locateAfter(
    ["org. weight", "org weight", "original weight"],
    DEV_DEFAULT_COLUMNS.originalWeight,
    constructionPrimary,
  )
  const origYarn = locateAfter(["yarn (분석)", "yarn 분석", "yarn"], DEV_DEFAULT_COLUMNS.origYarn, originalWeight)
  const origComments = locateAfter(["comments", "comment"], DEV_DEFAULT_COLUMNS.origComments, origYarn)
  const developer = locateAfter(["developer"], 16, origComments)
  const co = locateAfter(["co"], DEV_DEFAULT_COLUMNS.co, developer)
  const developmentNo = locateAfter(["gd#/sa#", "gdsa"], DEV_DEFAULT_COLUMNS.developmentNo, co)
  const arrangeNo = locateAfter(["arrange#", "arrange"], DEV_DEFAULT_COLUMNS.arrangeNo, developmentNo)
  const yarnDetail = locateAfter(["yarn detail", "yarndetail"], DEV_DEFAULT_COLUMNS.yarnDetail, arrangeNo)
  const constructionSecondary = locateAfter(
    ["cons.", "cons", "construction", "structure", "조직"],
    DEV_DEFAULT_COLUMNS.constructionSecondary,
    yarnDetail,
  )
  const targetWeight = locateAfter(
    ["t.weight", "t weight", "target weight", "weight"],
    DEV_DEFAULT_COLUMNS.targetWeight,
    constructionSecondary,
  )
  const color = locateAfter(["color", "색상"], DEV_DEFAULT_COLUMNS.color, targetWeight)
  const dyeing = locateAfter(["dyeing side", "dyeings", "염색"], DEV_DEFAULT_COLUMNS.dyeing, color)
  const finishingA = locateAfter(["finishing a", "finishing"], DEV_DEFAULT_COLUMNS.finishingA, dyeing)
  const finishingB = locateAfter(["finishing b", "finishing"], DEV_DEFAULT_COLUMNS.finishingB, finishingA)
  const finishingC = locateAfter(["finishing c", "finishing"], DEV_DEFAULT_COLUMNS.finishingC, finishingB)
  const finishingD = locateAfter(["finishing d", "finishing"], DEV_DEFAULT_COLUMNS.finishingD, finishingC)
  const remark = locateAfter(["remark", "비고"], DEV_DEFAULT_COLUMNS.remark, finishingD)
  const yarnMill = locateAfter(
    ["yarn in-fac mill", "yarn in-fac"],
    DEV_DEFAULT_COLUMNS.yarnMill,
    remark,
  )
  const yarnStatus = locateAfter(
    ["yarn in-fac status", "yarn status", "yarn in-fac"],
    DEV_DEFAULT_COLUMNS.yarnStatus,
    yarnMill,
  )
  const knittingMill = locateAfter(["knitting mill", "knitting"], DEV_DEFAULT_COLUMNS.knittingMill, yarnStatus)
  const knittingStatus = locateAfter(
    ["knitting status", "knitting"],
    DEV_DEFAULT_COLUMNS.knittingStatus,
    knittingMill,
  )
  const dyeingMill = locateAfter(["dyeing mill", "dyeing"], DEV_DEFAULT_COLUMNS.dyeingMill, knittingStatus)
  const dyeingStatus = locateAfter(["dyeing status", "dyeing"], DEV_DEFAULT_COLUMNS.dyeingStatus, dyeingMill)
  const finishingMill = locateAfter(
    ["finishing mill", "finishing"],
    DEV_DEFAULT_COLUMNS.finishingMill,
    dyeingStatus,
  )
  const finishingStatus = locateAfter(
    ["finishing status", "finishing"],
    DEV_DEFAULT_COLUMNS.finishingStatus,
    finishingMill,
  )
  const receivedDate = locateAfter(
    ["received date", "received", "접수일", "접수완료일"],
    DEV_DEFAULT_COLUMNS.receivedDate,
    finishingStatus,
  )
  const flNo = locateAfter(["fl#", "fl"], DEV_DEFAULT_COLUMNS.flNo, receivedDate)
  const optionProgress = locateAfter(
    ["옵션 완료 (완료/전체)", "option progress"],
    DEV_DEFAULT_COLUMNS.optionProgress,
    flNo,
  )
  const review = locateAfter(["review"], DEV_DEFAULT_COLUMNS.review, optionProgress)
  const actualWidth = locateAfter(["actual width", "actual"], DEV_DEFAULT_COLUMNS.actualWidth, review)
  const actualWeight = locateAfter(["actual weight", "actual"], DEV_DEFAULT_COLUMNS.actualWeight, actualWidth)
  const actualBalance = locateAfter(["actual balance", "actual"], DEV_DEFAULT_COLUMNS.actualBalance, actualWeight)
  const shrinkageLength = locateAfter(
    ["actual 축률(l)%", "축률(l)%", "actual"],
    DEV_DEFAULT_COLUMNS.shrinkageLength,
    actualBalance,
  )
  const shrinkageWidth = locateAfter(
    ["actual 축률(w)%", "축률(w)%", "actual"],
    DEV_DEFAULT_COLUMNS.shrinkageWidth,
    shrinkageLength,
  )
  const knitInch = locateAfter(["knitting inch", "knitting"], DEV_DEFAULT_COLUMNS.knitInch, shrinkageWidth)
  const knitGauge = locateAfter(["knitting gauge", "knitting"], DEV_DEFAULT_COLUMNS.knitGauge, knitInch)
  const knitNeedles = locateAfter(["knitting needles", "knitting"], DEV_DEFAULT_COLUMNS.knitNeedles, knitGauge)
  const loopF = locateAfter(["knitting loop(f)", "loop(f)", "knitting"], DEV_DEFAULT_COLUMNS.loopF, knitNeedles)
  const loopT = locateAfter(["knitting loop(t)", "loop(t)", "knitting"], DEV_DEFAULT_COLUMNS.loopT, loopF)
  const loopB = locateAfter(["knitting loop(b)", "loop(b)", "knitting"], DEV_DEFAULT_COLUMNS.loopB, loopT)
  const greigeWidth = locateAfter(["greige width", "greige"], DEV_DEFAULT_COLUMNS.greigeWidth, loopB)
  const greigeWeight = locateAfter(["greige weight", "greige"], DEV_DEFAULT_COLUMNS.greigeWeight, greigeWidth)
  const tenterWidth = locateAfter(["tenter width", "tenter"], DEV_DEFAULT_COLUMNS.tenterWidth, greigeWeight)
  const tenterWeight = locateAfter(["tenter weight", "tenter"], DEV_DEFAULT_COLUMNS.tenterWeight, tenterWidth)
  const washWidth = locateAfter(["wash width", "wash"], DEV_DEFAULT_COLUMNS.washWidth, tenterWeight)
  const washWeight = locateAfter(["wash weight", "wash"], DEV_DEFAULT_COLUMNS.washWeight, washWidth)
  const finishBrush = locateAfter(["finish brush", "finish"], DEV_DEFAULT_COLUMNS.finishBrush, washWeight)
  const finishChemical = locateAfter(["finish chemical", "finish"], DEV_DEFAULT_COLUMNS.finishChemical, finishBrush)
  const passFail = locateAfter(["pass/fail", "passfail"], DEV_DEFAULT_COLUMNS.passFail, finishChemical)
  const failReason = locateAfter(["fail 사유", "fail reason"], DEV_DEFAULT_COLUMNS.failReason, passFail)
  const styleHistory = locateAfter(
    ["style history", "historical record", "history"],
    DEV_DEFAULT_COLUMNS.styleHistory,
    failReason,
  )

  return {
    owner,
    status,
    styleNo,
    opt,
    season,
    buyer,
    category,
    planner,
    requestDate,
    dueDate,
    origBrand,
    origContents,
    constructionPrimary,
    originalWeight,
    origYarn,
    origComments,
    constructionSecondary,
    targetWeight,
    color,
    dyeing,
    finishingA,
    finishingB,
    finishingC,
    finishingD,
    remark,
    yarnMill,
    yarnStatus,
    knittingMill,
    knittingStatus,
    dyeingMill,
    dyeingStatus,
    finishingMill,
    finishingStatus,
    receivedDate,
    co,
    developmentNo,
    arrangeNo,
    yarnDetail,
    flNo,
    optionProgress,
    review,
    actualWidth,
    actualWeight,
    actualBalance,
    shrinkageLength,
    shrinkageWidth,
    knitInch,
    knitGauge,
    knitNeedles,
    loopF,
    loopT,
    loopB,
    greigeWidth,
    greigeWeight,
    tenterWidth,
    tenterWeight,
    washWidth,
    washWeight,
    finishBrush,
    finishChemical,
    passFail,
    failReason,
    styleHistory,
  }
}

const optionalText = (value: unknown): string | undefined => text(value) || undefined

const optionalNumber = (value: unknown): number | null | undefined =>
  text(value) ? numberOrNull(value) : undefined

const optionalProcessDate = (value: unknown): string | undefined => {
  const original = text(value)
  if (!original) return undefined
  return isoDate(value) || original
}

const withDefinedFields = <T extends Record<string, unknown>>(value: T): T | undefined => {
  const entries = Object.entries(value).filter(([, field]) => field !== undefined)
  return entries.length ? Object.fromEntries(entries) as T : undefined
}

function technicalOf(
  row: Row,
  columns: ColumnMap<typeof DEV_DEFAULT_COLUMNS>,
): DevTechnical | undefined {
  const mills = withDefinedFields({
    yarn: optionalText(row[columns.yarnMill]),
    knitting: optionalText(row[columns.knittingMill]),
    dyeing: optionalText(row[columns.dyeingMill]),
    finishing: optionalText(row[columns.finishingMill]),
  })
  const processDates = withDefinedFields({
    yarn: optionalProcessDate(row[columns.yarnStatus]),
    knitting: optionalProcessDate(row[columns.knittingStatus]),
    dyeing: optionalProcessDate(row[columns.dyeingStatus]),
    finishing: optionalProcessDate(row[columns.finishingStatus]),
  })
  const finishing = [
    row[columns.finishingA],
    row[columns.finishingB],
    row[columns.finishingC],
    row[columns.finishingD],
  ].map(optionalText).filter((value): value is string => value !== undefined)
  const original = withDefinedFields({
    brand: optionalText(row[columns.origBrand]),
    contents: optionalText(row[columns.origContents]),
    yarn: optionalText(row[columns.origYarn]),
    comments: optionalText(row[columns.origComments]),
  })
  const actual = withDefinedFields({
    width: optionalNumber(row[columns.actualWidth]),
    weight: optionalNumber(row[columns.actualWeight]),
    balance: optionalNumber(row[columns.actualBalance]),
    shrinkageLength: optionalNumber(row[columns.shrinkageLength]),
    shrinkageWidth: optionalNumber(row[columns.shrinkageWidth]),
  })
  const knitSpec = withDefinedFields({
    inch: optionalText(row[columns.knitInch]),
    gauge: optionalText(row[columns.knitGauge]),
    needles: optionalText(row[columns.knitNeedles]),
    loopF: optionalText(row[columns.loopF]),
    loopT: optionalText(row[columns.loopT]),
    loopB: optionalText(row[columns.loopB]),
  })
  const greige = withDefinedFields({
    width: optionalNumber(row[columns.greigeWidth]),
    weight: optionalNumber(row[columns.greigeWeight]),
  })
  const tenter = withDefinedFields({
    width: optionalNumber(row[columns.tenterWidth]),
    weight: optionalNumber(row[columns.tenterWeight]),
  })
  const wash = withDefinedFields({
    width: optionalNumber(row[columns.washWidth]),
    weight: optionalNumber(row[columns.washWeight]),
  })
  const stageData = withDefinedFields({ greige, tenter, wash })
  const finish = withDefinedFields({
    brush: optionalText(row[columns.finishBrush]),
    chemical: optionalText(row[columns.finishChemical]),
  })

  return withDefinedFields({
    mills,
    processDates,
    yarnDetail: optionalText(row[columns.yarnDetail]),
    arrangeNo: optionalText(row[columns.arrangeNo]),
    finishing: finishing.length ? finishing : undefined,
    optionProgress: optionalText(row[columns.optionProgress]),
    review: optionalText(row[columns.review]),
    original,
    actual,
    knitSpec,
    stageData,
    finish,
    passFail: optionalText(row[columns.passFail]),
    failReason: optionalText(row[columns.failReason]),
    styleHistory: optionalText(row[columns.styleHistory]),
  })
}

export const isExcludedDevelopment = (record: DevRecord): boolean =>
  /^(drop|reject)$/i.test(text(record.devStatus))

export function parseDevelopment(workbook: XLSX.WorkBook, today = new Date()): DevRecord[] {
  const name = sheetName(workbook, "전체현황")
  const sheet = workbook.Sheets[name]
  const rows = sheetRows(sheet)
  const headerRow = findHeaderStart(sheet) ?? 3
  const columns = devColumns(sheet, headerRow)
  const dataStart = headerRow === 3 ? 5 : headerRow + 2
  const records: DevRecord[] = []

  for (let index = dataStart; index < rows.length; index++) {
    const row = rows[index]
    const styleNo = text(row[columns.styleNo])
    if (!styleNo || isSubtotal(styleNo)) continue
    const devType = developmentType(row[columns.co])
    const developmentNo = text(row[columns.developmentNo])
    const weight = numberOrNull(row[columns.targetWeight]) ?? numberOrNull(row[columns.originalWeight])
    const flDone = Boolean(text(row[columns.flNo]))
    const tech = technicalOf(row, columns)
    const processReached = {
      yarn: flDone || progressed(row[columns.yarnStatus], today),
      knitting: flDone || progressed(row[columns.knittingStatus], today),
      dyeing: flDone || progressed(row[columns.dyeingStatus], today),
      finishing: flDone || progressed(row[columns.finishingStatus], today),
    }
    records.push({
      styleNo,
      opt: text(row[columns.opt]),
      season: normalizeSeason(row[columns.season]).value,
      category: normalizeCategory(row[columns.category]),
      requestDate: isoDate(row[columns.requestDate]),
      receivedDate: isoDate(row[columns.receivedDate]),
      buyer: text(row[columns.buyer]),
      owner: text(row[columns.owner]),
      planner: text(row[columns.planner]),
      gdNo: devType === "GD" ? developmentNo : "",
      saNo: devType === "국내" ? developmentNo : "",
      construction: firstText(row, columns.constructionSecondary, columns.constructionPrimary),
      weight: weight ?? "",
      color: text(row[columns.color]),
      dyeing: text(row[columns.dyeing]),
      stage: stageOf(row, columns, today),
      processReached,
      dueDate: isoDate(row[columns.dueDate]).slice(0, 10),
      flNo: text(row[columns.flNo]),
      note: text(row[columns.remark]),
      devType,
      devStatus: text(row[columns.status]),
      ...(tech ? { tech } : {}),
      _src: { sheet: name, row: index + 1 },
    })
  }

  if (!records.length) {
    throw new Error("'전체현황' 시트에서 Style No.가 있는 개발 건을 찾지 못했습니다.")
  }
  return records
}

function sampleColumns(sheet: XLSX.WorkSheet, headerRow: number): ColumnMap<typeof SAMPLE_DEFAULT_COLUMNS> {
  const headers = combinedHeaders(sheet, headerRow, 2)
  if (headerRow === 3 && compact(headers[7]).includes("style") && compact(headers[8]).includes("fl")) {
    return SAMPLE_DEFAULT_COLUMNS
  }
  const locate = (aliases: readonly string[], fallback: number): number =>
    columnWith(headers, aliases) ?? fallback
  return {
    season: locate(["season", "시즌"], SAMPLE_DEFAULT_COLUMNS.season),
    buyer: locate(["buyer division", "buyer"], SAMPLE_DEFAULT_COLUMNS.buyer),
    category: locate(["category", "카테고리"], SAMPLE_DEFAULT_COLUMNS.category),
    owner: locate(["developer", "담당"], SAMPLE_DEFAULT_COLUMNS.owner),
    styleNo: locate(["style/#", "style"], SAMPLE_DEFAULT_COLUMNS.styleNo),
    flNo: locate(["fl.#", "fl#", "fl"], SAMPLE_DEFAULT_COLUMNS.flNo),
    construction: locate(["cons.", "cons", "construction"], SAMPLE_DEFAULT_COLUMNS.construction),
    requestDate: locate(["request date", "requestdate", "요청일"], SAMPLE_DEFAULT_COLUMNS.requestDate),
    width: locate(["final data width", "finaldatawidth"], SAMPLE_DEFAULT_COLUMNS.width),
    weight: locate(["final data weight", "finaldataweight"], SAMPLE_DEFAULT_COLUMNS.weight),
    yarnStatus: SAMPLE_DEFAULT_COLUMNS.yarnStatus,
    knittingStatus: SAMPLE_DEFAULT_COLUMNS.knittingStatus,
    dyeingStatus: SAMPLE_DEFAULT_COLUMNS.dyeingStatus,
    finishingStatus: SAMPLE_DEFAULT_COLUMNS.finishingStatus,
    completedAt: locate(["finish date", "완료일"], SAMPLE_DEFAULT_COLUMNS.completedAt),
    remark: locate(["remark/issue", "remark", "issue"], SAMPLE_DEFAULT_COLUMNS.remark),
    shrinkageLength: locate(["shrinkage length", "shrinkagelength"], SAMPLE_DEFAULT_COLUMNS.shrinkageLength),
    shrinkageWidth: locate(["shrinkage width", "shrinkagewidth"], SAMPLE_DEFAULT_COLUMNS.shrinkageWidth),
  }
}

function parseSampleSheet(workbook: XLSX.WorkBook, wanted: string, detectedHeaderRow?: number): CompletedSample[] {
  const name = sheetName(workbook, wanted)
  const sheet = workbook.Sheets[name]
  const rows = sheetRows(sheet)
  const headerRow = detectedHeaderRow ?? findHeaderStart(sheet, true) ?? 3
  const columns = sampleColumns(sheet, headerRow)
  const dataStart = headerRow === 3 ? 5 : headerRow + 2
  const samples: CompletedSample[] = []

  for (let index = dataStart; index < rows.length; index++) {
    const row = rows[index]
    const styleNo = text(row[columns.styleNo])
    if (!styleNo || isSubtotal(styleNo)) continue
    samples.push({
      styleNo,
      flNo: text(row[columns.flNo]),
      season: normalizeSeason(row[columns.season]).value,
      category: normalizeCategory(row[columns.category]),
      buyer: text(row[columns.buyer]),
      owner: text(row[columns.owner]),
      construction: text(row[columns.construction]),
      requestDate: isoDate(row[columns.requestDate]),
      sourceSheet: name,
      process: {
        yarn: text(row[columns.yarnStatus]),
        knit: text(row[columns.knittingStatus]),
        dye: text(row[columns.dyeingStatus]),
        finish: text(row[columns.finishingStatus]),
        remark: text(row[columns.remark]),
      },
      inhouse: {
        widthCm: numberOrNull(row[columns.width]),
        weightGsm: numberOrNull(row[columns.weight]),
        shrinkagePct: {
          length: numberOrNull(row[columns.shrinkageLength]),
          width: numberOrNull(row[columns.shrinkageWidth]),
        },
        pilling: null,
      },
      completedAt: isoDate(row[columns.completedAt]),
    })
  }
  return samples
}

export function parseSamples(workbook: XLSX.WorkBook): CompletedSample[] {
  // 샘플관리대장에서 이름이 고정된 일부 시트만 고르지 않는다.
  // Style/# + FL.# 헤더가 있는 모든 시트(현황·창고보관·소진완료·폐기 및 향후 추가 시트)를 읽는다.
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name]
    const headerRow = findHeaderStart(sheet, true)
    return headerRow === null ? [] : parseSampleSheet(workbook, name, headerRow)
  })
}

/** 팀 폴더에서 내보낸 원단분석 파일. 헤더 위치와 표기 흔들림을 흡수한다. */
export function parseFabricAnalysis(workbook: XLSX.WorkBook): FabricAnalysisRow[] {
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name])
    for (let headerRow = 0; headerRow < Math.min(rows.length, 15); headerRow++) {
      const headers = rows[headerRow]
      const locate = (aliases: readonly string[]): number | null => columnWith(headers, aliases)
      const columns = {
        anNo: locate(["AN", "AN번호", "AN No"]),
        requestDate: locate(["의뢰일", "접수일", "Request"]),
        completeDate: locate(["완료일", "완료", "Complete"]),
        item: locate(["항목", "제목", "Subject"]),
        owner: locate(["담당", "담당자", "Owner"]),
      }
      if (columns.anNo === null || columns.requestDate === null || columns.item === null) continue
      const parsed: FabricAnalysisRow[] = []
      for (let index = headerRow + 1; index < rows.length; index++) {
        const row = rows[index]
        const anNo = text(row[columns.anNo])
        if (!anNo || isSubtotal(anNo)) continue
        parsed.push({
          anNo,
          requestDate: isoDate(row[columns.requestDate]),
          completeDate: columns.completeDate === null ? "" : isoDate(row[columns.completeDate]),
          item: text(row[columns.item]),
          owner: columns.owner === null ? "" : text(row[columns.owner]),
        })
      }
      return parsed
    }
  }
  return []
}

export interface MaterialParseResult {
  items: MaterialItem[]
  diagnostics: MaterialDiagnostics
}

const emptyMaterialDiagnostics = (): MaterialDiagnostics => ({
  recognized: 0,
  byKind: { TS: 0, STUDY: 0, MACRO: 0, FABRIC: 0, PORTFOLIO: 0 },
  unknownKind: 0,
  missingLink: 0,
})

function normalizeMaterialKind(value: unknown): MaterialKind | null {
  const key = compact(value)
  if (key === "ts" || key === compact("기술지원")) return "TS"
  if (key === "study" || key === compact("교육")) return "STUDY"
  if (key === "macro" || key === "macrotrend") return "MACRO"
  if (key === "fabric" || key === "fabrictrend") return "FABRIC"
  if (key === "portfolio") return "PORTFOLIO"
  return null
}

const materialTags = (value: unknown): string[] =>
  [...new Set(text(value).split(/[,/\s]+/).map((tag) => tag.trim()).filter(Boolean))]

/** 자료목록은 열 순서를 고정하지 않고 kind·title 헤더가 함께 발견되는 표를 읽는다. */
export function parseMaterials(workbook: XLSX.WorkBook): MaterialParseResult {
  const diagnostics = emptyMaterialDiagnostics()
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name])
    for (let headerRow = 0; headerRow < Math.min(rows.length, 20); headerRow += 1) {
      const headers = rows[headerRow]
      const columns = {
        kind: columnWith(headers, ["구분", "분류", "kind", "category"]),
        title: columnWith(headers, ["제목", "title", "자료명"]),
        summary: columnWith(headers, ["요약", "설명", "summary", "description"]),
        date: columnWith(headers, ["날짜", "작성일", "date"]),
        tags: columnWith(headers, ["태그", "tag", "키워드"]),
        link: columnWith(headers, ["링크", "link", "url", "주소"]),
        owner: columnWith(headers, ["담당", "작성자", "owner"]),
      }
      if (columns.kind === null || columns.title === null) continue

      const unique = new Map<string, MaterialItem>()
      for (let index = headerRow + 1; index < rows.length; index += 1) {
        const row = rows[index]
        const title = text(row[columns.title])
        if (!title || isSubtotal(title)) continue
        const kind = normalizeMaterialKind(row[columns.kind])
        if (!kind) {
          diagnostics.unknownKind += 1
          continue
        }
        const rawLink = columns.link === null ? "" : text(row[columns.link])
        const link = httpsMaterialLink(rawLink)
        const item: MaterialItem = {
          id: materialIdOf(link, title),
          kind,
          title,
          summary: columns.summary === null ? undefined : text(row[columns.summary]) || undefined,
          date: columns.date === null ? undefined : isoDate(row[columns.date]) || undefined,
          tags: columns.tags === null ? [] : materialTags(row[columns.tags]),
          link,
          owner: columns.owner === null ? undefined : text(row[columns.owner]) || undefined,
          source: "excel",
        }
        unique.set(item.id, item)
      }
      const items = [...unique.values()]
      diagnostics.recognized = items.length
      diagnostics.missingLink = items.filter((item) => !item.link).length
      items.forEach((item) => { diagnostics.byKind[item.kind] += 1 })
      return { items, diagnostics }
    }
  }
  return { items: [], diagnostics }
}

const normalizeStudyState = (value: unknown): StudyState => {
  const key = compact(value)
  if (key.includes("미진행") || key.includes("미제출") || key.includes("미착수")) return "미진행"
  if (key.includes("완료") || key.includes("제출")) return "완료"
  if (key.includes("진행") || key.includes("작성중")) return "진행"
  return "계획"
}

export function parseStudy(workbook: XLSX.WorkBook): StudyRecord[] {
  const records: StudyRecord[] = []

  for (const name of workbook.SheetNames) {
    if (compact(name) === compact("Summary")) continue
    const rows = sheetRows(workbook.Sheets[name])

    for (let index = 2; index < rows.length; index++) {
      const row = rows[index]
      const topic = text(row[3])
      const weekValue = numberOrNull(row[1])
      if (!topic || weekValue === null) continue

      records.push({
        week: Math.trunc(weekValue),
        weekLabel: text(row[2]),
        owner: name.trim(),
        topic,
        category: text(row[4]),
        state: normalizeStudyState(row[10]),
        dueDate: isoDate(row[7]).slice(0, 10),
        selectionReason: text(row[5]),
        confirmedDate: isoDate(row[6]).slice(0, 10),
        completedDate: isoDate(row[8]).slice(0, 10),
        materialFile: text(row[9]),
        reason: text(row[11]),
      })
    }
  }

  return records
}

function technicalServiceId(value: unknown, receivedAt: unknown): string {
  const original = text(value)
  if (!/^\d+(?:\.0+)?$/.test(original)) return original
  const sequence = Math.trunc(Number(original))
  const received = toDate(receivedAt)
  const year = String(received?.getFullYear() ?? new Date().getFullYear()).slice(-2)
  return `TS${year}-${String(sequence).padStart(3, "0")}`
}

/**
 * 기존 연도별 TS 대장을 웹 원천 데이터로 한 번 가져오기 위한 파서다.
 * 엑셀에는 상태가 없으므로 Result가 있으면 완료, 없으면 처리중으로만 추론한다.
 */
export function parseTechnicalServices(workbook: XLSX.WorkBook): TsRecord[] {
  const name = sheetName(workbook, "TS")
  const sheet = workbook.Sheets[name]
  const rows = sheetRows(sheet)
  let headerRow = -1
  let headers: string[] = []

  for (let row = 0; row < Math.min(5, rows.length); row++) {
    const candidate = combinedHeaders(sheet, row, 1)
    if (columnWith(candidate, ["# T/S", "#T/S"]) !== null && columnWith(candidate, ["Subject"]) !== null) {
      headerRow = row
      headers = candidate
      break
    }
  }
  if (headerRow < 0) {
    throw new Error("'TS' 시트 상단 5행에서 '# T/S'와 'Subject' 헤더를 찾을 수 없습니다.")
  }

  const locate = (aliases: readonly string[]): number | null => columnWith(headers, aliases)
  const idColumn = locate(["# T/S", "#T/S"])
  const dateColumn = locate(["Date", "접수일"])
  const subjectColumn = locate(["Subject"])
  const advisorColumn = locate(["Advisor", "담당"])
  if (idColumn === null || subjectColumn === null) {
    throw new Error("'TS' 시트의 필수 헤더('# T/S', 'Subject')가 올바르지 않습니다.")
  }

  // From/Inquiry가 있으면 2026 레이아웃, 없으면 2025 레이아웃이다. 실제 매핑은 두 경우 모두 헤더명으로 한다.
  const currentLayout = locate(["From"]) !== null || locate(["Inquiry"]) !== null
  const relatedColumns = headers
    .map((header, column) => ({ header: compact(header), column }))
    .filter(({ header }) => header.startsWith(compact("유관부서")))
    .map(({ column }) => column)
  const fromColumn = currentLayout ? locate(["From"]) : null
  const inquiryColumn = locate(["Inquiry"])
  const causesColumn = locate(["Causes", "Cause", "원인"])
  const analysisColumn = locate(["Analysis", "분석"])
  const actionColumn = locate(["Action", "조치"])
  const resultColumn = locate(["Result", "결과"])
  const productionColumn = locate(["생산처", "Production"])
  const orderVolumeColumn = locate(["Order Volume", "Order Qty", "발주량"])
  const attnColumn = locate(["Attn"])
  const records: TsRecord[] = []

  for (let index = headerRow + 1; index < rows.length; index++) {
    const row = rows[index]
    const rawId = text(row[idColumn])
    if (!rawId || isSubtotal(rawId)) continue
    const receivedValue = dateColumn === null ? "" : row[dateColumn]
    const result = resultColumn === null ? "" : text(row[resultColumn])
    const relatedDepartment = relatedColumns.map((column) => text(row[column])).filter(Boolean).join(" / ")
    const from = fromColumn === null ? relatedDepartment : text(row[fromColumn]) || relatedDepartment
    // 원본에는 상태가 없으므로 결과가 작성된 건만 완료, 나머지는 최소 처리중으로 가져온다.
    const state = result ? "완료" : "처리중"

    records.push({
      id: technicalServiceId(rawId, receivedValue),
      receivedAt: isoDate(receivedValue).slice(0, 10),
      from,
      subject: text(row[subjectColumn]),
      relatedDepartment,
      attn: attnColumn === null ? "" : text(row[attnColumn]),
      advisor: advisorColumn === null ? "" : text(row[advisorColumn]),
      inquiry: inquiryColumn === null ? "" : text(row[inquiryColumn]),
      analysis: analysisColumn === null ? "" : text(row[analysisColumn]),
      causes: causesColumn === null ? "" : text(row[causesColumn]),
      action: actionColumn === null ? "" : text(row[actionColumn]),
      result,
      productionSite: productionColumn === null ? "" : text(row[productionColumn]),
      orderVolume: orderVolumeColumn === null ? "" : text(row[orderVolumeColumn]),
      state,
      source: "excel",
    })
  }

  if (!records.length) throw new Error("'TS' 시트에서 '# T/S' 번호가 있는 데이터를 찾지 못했습니다.")
  return records
}

const RDDA_DISTRIBUTION_LIMIT = 8
const RDDA_TEAM3 = new Set(["박향근", "김지현", "변재휘", "진영은"].map(compact))

type RddaItemAggregate = {
  meeting: number
  pickup: number
  originalFabric: string
  vendor: string
}

type RddaAggregate = {
  meetingTotal: number
  pickupTotal: number
  meetingByCustomer: Map<string, number>
  pickupByCustomer: Map<string, number>
  origins: Map<string, number>
  items: Map<string, RddaItemAggregate>
}

export interface ParseRddaOptions {
  month?: number
  snapshots?: RddaSnapshot[]
}

function cellValue(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v
}

function locateRddaHeader<T extends string>(
  sheet: XLSX.WorkSheet,
  fields: Record<T, readonly string[]>,
  scanLimit = 50,
): { headerRow: number; columns: Record<T, number> } {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")
  const keys = Object.keys(fields) as T[]
  const lastRow = Math.min(range.e.r, range.s.r + scanLimit - 1)

  for (let row = range.s.r; row <= lastRow; row++) {
    const headers = combinedHeaders(sheet, row, 1)
    const located = keys.map((key) => columnWith(headers, fields[key]))
    if (located.every((column) => column !== null)) {
      return {
        headerRow: row,
        columns: Object.fromEntries(keys.map((key, index) => [key, located[index]])) as Record<T, number>,
      }
    }
  }

  throw new Error(`'${keys.join(", ")}' 헤더를 찾을 수 없습니다.`)
}

function increment(map: Map<string, number>, value: unknown): void {
  const label = text(value) || "기타"
  map.set(label, (map.get(label) ?? 0) + 1)
}

function topDistribution(map: Map<string, number>, limit = RDDA_DISTRIBUTION_LIMIT): RddaDistribution[] {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
  const top = sorted.slice(0, limit).map(([label, count]) => ({ label, count }))
  const other = sorted.slice(limit).reduce((sum, [, count]) => sum + count, 0)
  if (other) {
    const existing = top.find((row) => row.label === "기타")
    if (existing) existing.count += other
    else top.push({ label: "기타", count: other })
  }
  return top
}

function itemAggregate(map: Map<string, RddaItemAggregate>, flNo: string): RddaItemAggregate {
  const existing = map.get(flNo)
  if (existing) return existing
  const created = { meeting: 0, pickup: 0, originalFabric: "", vendor: "" }
  map.set(flNo, created)
  return created
}

function createRddaAggregate(): RddaAggregate {
  return {
    meetingTotal: 0,
    pickupTotal: 0,
    meetingByCustomer: new Map(),
    pickupByCustomer: new Map(),
    origins: new Map(),
    items: new Map(),
  }
}

const normalizedRddaName = (value: unknown): string =>
  text(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\.+$/, "").trim()

const isHansoll = (supplier: unknown, customer: unknown): boolean =>
  normalizedRddaName(supplier) === "hansoll textile ltd"
  || normalizedRddaName(customer) === "hansoll textile ltd"

function rddaScopes(member: unknown): RddaScope[] {
  return RDDA_TEAM3.has(compact(member)) ? ["all", "team3"] : ["all"]
}

function incrementCustomer(map: Map<string, number>, value: unknown): void {
  const name = text(value) || "미기재"
  map.set(name, (map.get(name) ?? 0) + 1)
}

function customerMetrics(aggregate: RddaAggregate): RddaPerspective["pickupByCustomer"] {
  const names = new Set([
    ...aggregate.meetingByCustomer.keys(),
    ...aggregate.pickupByCustomer.keys(),
  ])
  return [...names].map((name) => {
    const meetingCount = aggregate.meetingByCustomer.get(name) ?? 0
    const pickupCount = aggregate.pickupByCustomer.get(name) ?? 0
    return {
      name,
      pickupCount,
      meetingCount,
      rate: meetingCount ? (pickupCount / meetingCount) * 100 : 0,
    }
  }).sort((a, b) =>
    b.pickupCount - a.pickupCount
    || b.meetingCount - a.meetingCount
    || a.name.localeCompare(b.name, "ko-KR"),
  )
}

function bestItems(aggregate: RddaAggregate): RddaPerspective["bestItems"] {
  const sorted = [...aggregate.items.entries()]
    .filter(([, item]) => item.pickup >= 2 && item.meeting >= 3)
    .sort((a, b) =>
      b[1].pickup - a[1].pickup
      || b[1].meeting - a[1].meeting
      || a[0].localeCompare(b[0], "ko-KR", { numeric: true }),
    )
  let previousPickup: number | null = null
  let rank = 0
  return sorted.map(([flNo, item], index) => {
    if (item.pickup !== previousPickup) rank = index + 1
    previousPickup = item.pickup
    return {
      rank,
      flNo,
      construction: item.originalFabric,
      weight: null,
      pickupCount: item.pickup,
      meetingCount: item.meeting,
      pickup: item.pickup,
      meeting: item.meeting,
      unitPrice: null,
      vendor: item.vendor || null,
    }
  })
}

function perspectiveFrom(aggregate: RddaAggregate): RddaPerspective {
  return {
    meetingTotal: aggregate.meetingTotal,
    pickupTotal: aggregate.pickupTotal,
    pickupRate: aggregate.meetingTotal ? (aggregate.pickupTotal / aggregate.meetingTotal) * 100 : 0,
    pickupByCustomer: customerMetrics(aggregate),
    origin: topDistribution(aggregate.origins),
    bestItems: bestItems(aggregate),
  }
}

function basicRddaHeader(sheet: XLSX.WorkSheet) {
  return locateRddaHeader(sheet, {
    flNo: ["FL_NUMBER", "FL NUMBER"],
    supplierName: ["SupplierName", "Supplier Name"],
    customer: ["CustomerName", "Customer Name"],
  })
}

function countRddaRows(sheet: XLSX.WorkSheet): number {
  const header = basicRddaHeader(sheet)
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")
  let total = 0
  for (let row = header.headerRow + 1; row <= range.e.r; row++) {
    const flNo = text(cellValue(sheet, row, header.columns.flNo))
    if (!flNo || isSubtotal(flNo)) continue
    if (isHansoll(
      cellValue(sheet, row, header.columns.supplierName),
      cellValue(sheet, row, header.columns.customer),
    )) continue
    total += 1
  }
  return total
}

/** 과거 YTD 파일은 상세 그룹을 만들지 않고 Hansoll 제외 총계만 한 번 센다. */
export function parseRddaSnapshot(workbook: XLSX.WorkBook, month: number): RddaSnapshot {
  const meeting = countRddaRows(workbook.Sheets[sheetName(workbook, "Meeting")])
  const pickup = countRddaRows(workbook.Sheets[sheetName(workbook, "Pickup")])
  return { month, meeting, pickup, rate: meeting ? (pickup / meeting) * 100 : 0 }
}

/**
 * Meeting/Pickup 원본 행은 반환하거나 상태에 보관하지 않고, 각 시트를 한 번씩 순회해 집계만 반환한다.
 */
export function parseRdda(workbook: XLSX.WorkBook, options: ParseRddaOptions = {}): RddaReport {
  const meetingSheet = workbook.Sheets[sheetName(workbook, "Meeting")]
  const pickupSheet = workbook.Sheets[sheetName(workbook, "Pickup")]

  const meetingHeader = locateRddaHeader(meetingSheet, {
    flNo: ["FL_NUMBER", "FL NUMBER"],
    supplierName: ["SupplierName", "Supplier Name"],
    originalFabric: ["OriginalFabric", "Original Fabric"],
    origin: ["CountryOfOrigin", "Country Of Origin"],
    customer: ["CustomerName", "Customer Name"],
    member: ["MemberName", "Member Name"],
  })
  const meetingRange = XLSX.utils.decode_range(meetingSheet["!ref"] ?? "A1:A1")
  const members = new Map<string, number>()
  const fabrics = new Map<string, number>()
  const aggregates: Record<RddaScope, RddaAggregate> = {
    all: createRddaAggregate(),
    team3: createRddaAggregate(),
  }

  for (let row = meetingHeader.headerRow + 1; row <= meetingRange.e.r; row++) {
    const flNo = text(cellValue(meetingSheet, row, meetingHeader.columns.flNo))
    if (!flNo || isSubtotal(flNo)) continue
    const supplier = cellValue(meetingSheet, row, meetingHeader.columns.supplierName)
    const customer = cellValue(meetingSheet, row, meetingHeader.columns.customer)
    if (isHansoll(supplier, customer)) continue
    const member = cellValue(meetingSheet, row, meetingHeader.columns.member)
    increment(members, member)
    increment(fabrics, cellValue(meetingSheet, row, meetingHeader.columns.originalFabric))
    for (const scope of rddaScopes(member)) {
      const aggregate = aggregates[scope]
      aggregate.meetingTotal += 1
      incrementCustomer(aggregate.meetingByCustomer, customer)
      increment(aggregate.origins, cellValue(meetingSheet, row, meetingHeader.columns.origin))
      const item = itemAggregate(aggregate.items, flNo)
      item.meeting += 1
      item.originalFabric ||= text(cellValue(meetingSheet, row, meetingHeader.columns.originalFabric))
      item.vendor ||= text(supplier)
    }
  }

  const pickupHeader = locateRddaHeader(pickupSheet, {
    flNo: ["FL_NUMBER", "FL NUMBER"],
    supplierName: ["SupplierName", "Supplier Name"],
    originalFabric: ["OriginalFabric", "Original Fabric"],
    customer: ["CustomerName", "Customer Name"],
    member: ["MemberName", "Member Name"],
  })
  const pickupRange = XLSX.utils.decode_range(pickupSheet["!ref"] ?? "A1:A1")
  for (let row = pickupHeader.headerRow + 1; row <= pickupRange.e.r; row++) {
    const flNo = text(cellValue(pickupSheet, row, pickupHeader.columns.flNo))
    if (!flNo || isSubtotal(flNo)) continue
    const supplier = cellValue(pickupSheet, row, pickupHeader.columns.supplierName)
    const customer = cellValue(pickupSheet, row, pickupHeader.columns.customer)
    if (isHansoll(supplier, customer)) continue
    const member = cellValue(pickupSheet, row, pickupHeader.columns.member)
    for (const scope of rddaScopes(member)) {
      const aggregate = aggregates[scope]
      aggregate.pickupTotal += 1
      incrementCustomer(aggregate.pickupByCustomer, customer)
      const item = itemAggregate(aggregate.items, flNo)
      item.pickup += 1
      item.originalFabric ||= text(cellValue(pickupSheet, row, pickupHeader.columns.originalFabric))
      item.vendor ||= text(supplier)
    }
  }

  const perspectives = {
    all: perspectiveFrom(aggregates.all),
    team3: perspectiveFrom(aggregates.team3),
  }
  const snapshots = [...(options.snapshots ?? [])]
  if (options.month !== undefined) {
    snapshots.push({
      month: options.month,
      meeting: perspectives.all.meetingTotal,
      pickup: perspectives.all.pickupTotal,
      rate: perspectives.all.pickupRate,
    })
  }
  const uniqueSnapshots = [...new Map(
    snapshots.sort((a, b) => a.month - b.month).map((snapshot) => [snapshot.month, snapshot]),
  ).values()]
  const year = 2026
  const monthly = uniqueSnapshots.map((snapshot) => ({
    month: `${year}.${String(snapshot.month).padStart(2, "0")}`,
    registered: snapshot.meeting,
    meeting: snapshot.meeting,
    pickup: snapshot.pickup,
  }))

  return {
    source: "folder",
    latestMonth: options.month ?? null,
    perspectives,
    snapshots: uniqueSnapshots,
    monthly,
    yearly: [{ year, suggested: perspectives.all.meetingTotal, pickup: perspectives.all.pickupTotal, rate: perspectives.all.pickupRate }],
    cumulative: [{ year, stored: perspectives.all.meetingTotal, used: perspectives.all.pickupTotal, discarded: 0 }],
    origin: perspectives.all.origin,
    byCustomer: perspectives.all.pickupByCustomer.map((row) => ({ label: row.name, count: row.pickupCount })),
    byMember: topDistribution(members),
    construction: topDistribution(fabrics),
    bestItems: perspectives.all.bestItems,
  }
}
