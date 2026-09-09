/**
 * FABRIC REQUEST 차트 양식 — 내려받기와 업로드 파싱.
 *
 * 양식과 파서가 같은 열 정의(`TEMPLATE_COLUMNS`)를 쓴다. 하나만 고쳐서 어긋나는 일을 막는다.
 * 배치는 1팀이 쓰던 엑셀 차트와 같다. 1행 밴드, 2행 열 이름, 3행부터 데이터다.
 *
 * 옵션은 라인으로 푼다. Garment No.가 채워진 행이 스타일이고, 그 아래 Garment No.가 빈 행은
 * 직전 스타일의 옵션 라인이다. 스타일 행 자체에 옵션 값이 있으면 그것이 1번 옵션이 된다.
 *
 * 사진은 양식에 넣지 않는다. 엑셀 이미지 셀은 원본 차트에서도 #VALUE!로 깨져 있었다.
 * 사진은 웹 화면에서만 올린다.
 */
import * as XLSX from "xlsx"

import type { RequestOption, RequestStyle } from "./schema"

type Band = "기본" | "ORIGINAL" | "분석" | "의뢰" | "옵션"

interface TemplateColumn {
  band: Band
  head: string
  width: number
  /** 스타일 단위 값인지 옵션 라인 값인지 */
  scope: "style" | "option"
  key: string
}

/** 양식 열 순서. 파서도 이 순서를 읽는다. 순서를 바꾸면 기존 양식 파일이 깨진다. */
export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  { band: "기본", head: "순번", width: 6, scope: "style", key: "seq" },
  { band: "기본", head: "차트", width: 20, scope: "style", key: "chart" },
  { band: "기본", head: "단계", width: 7, scope: "style", key: "stage" },
  { band: "ORIGINAL", head: "Garment Number", width: 15, scope: "style", key: "garmentNo" },
  { band: "ORIGINAL", head: "Brand", width: 13, scope: "style", key: "brand" },
  { band: "ORIGINAL", head: "Fabric Contents", width: 24, scope: "style", key: "contents" },
  { band: "ORIGINAL", head: "Fabric Construction", width: 18, scope: "style", key: "origConstruction" },
  { band: "ORIGINAL", head: "Weight (g/m2)", width: 11, scope: "style", key: "origWeight" },
  { band: "분석", head: "Yarn analysis", width: 30, scope: "style", key: "yarnAnalysis" },
  { band: "분석", head: "Construction (개발)", width: 18, scope: "style", key: "devConstruction" },
  { band: "분석", head: "Comment", width: 24, scope: "style", key: "comment" },
  { band: "분석", head: "분석 담당", width: 11, scope: "style", key: "analyst" },
  { band: "의뢰", head: "URGENT", width: 8, scope: "style", key: "urgent" },
  { band: "의뢰", head: "의뢰자", width: 11, scope: "style", key: "requester" },
  { band: "의뢰", head: "개발 담당", width: 11, scope: "style", key: "developer" },
  { band: "의뢰", head: "개발", width: 30, scope: "style", key: "devPlan" },
  { band: "옵션", head: "Opt", width: 6, scope: "option", key: "no" },
  { band: "옵션", head: "YARN DETAIL", width: 30, scope: "option", key: "yarnDetail" },
  { band: "옵션", head: "COLOR", width: 18, scope: "option", key: "color" },
  { band: "옵션", head: "DYEING METHOD", width: 13, scope: "option", key: "dyeingMethod" },
  { band: "옵션", head: "REMARK", width: 26, scope: "option", key: "remark" },
]

const BAND_COLOR: Record<Band, string> = {
  "기본": "FF4B5563",
  "ORIGINAL": "FF1F4E5F",
  "분석": "FF538135",
  "의뢰": "FF2E5E8C",
  "옵션": "FFC55A11",
}

const HEADER_FILL = "FFEFF1F5"
const BORDER = "FFBFBFBF"

const columnIndex = (key: string): number => TEMPLATE_COLUMNS.findIndex((column) => column.key === key)

/** 밴드가 이어지는 구간을 병합 범위로 접는다. */
function bandRanges(): { band: Band; from: number; to: number }[] {
  const ranges: { band: Band; from: number; to: number }[] = []
  TEMPLATE_COLUMNS.forEach((column, index) => {
    const last = ranges[ranges.length - 1]
    if (last && last.band === column.band) last.to = index
    else ranges.push({ band: column.band, from: index, to: index })
  })
  return ranges
}

// ─────────────────────────────────────────────── 내려받기

const cellOf = (style: RequestStyle, option: RequestOption | null, key: string): string | number | null => {
  switch (key) {
    case "seq": return style.seq || null
    case "chart": return style.chart || null
    case "stage": return style.stage
    case "garmentNo": return style.garmentNo || null
    case "brand": return style.brand || null
    case "contents": return style.contents || null
    case "origConstruction": return style.origConstruction || null
    case "origWeight": return style.origWeight === "" ? null : style.origWeight
    case "yarnAnalysis": return style.yarnAnalysis || null
    case "devConstruction": return style.devConstruction || null
    case "comment": return style.comment || null
    case "analyst": return style.analyst || null
    case "urgent": return style.urgent ? "V" : null
    case "requester": return style.requester || null
    case "developer": return style.developer || null
    case "devPlan": return style.devPlan || null
    case "no": return option ? option.no : null
    case "yarnDetail": return option ? option.yarnDetail || null : null
    case "color": return option ? option.color || null : null
    case "dyeingMethod": return option ? option.dyeingMethod || null : null
    case "remark": return option ? option.remark || null : null
    default: return null
  }
}

/**
 * 양식 통합문서를 만든다. `styles`를 주면 현재 원장을 채워 내보내고, 비우면 빈 양식이다.
 * 스타일 1건은 옵션 수만큼 행을 쓴다. 스타일 값은 첫 행에만 적는다. 엑셀에서 읽기 좋고
 * 파서도 그 규칙으로 되읽는다.
 */
export async function buildRequestWorkbook(styles: readonly RequestStyle[] = []): Promise<Blob> {
  // exceljs는 CJS라 번들러와 Node에서 default 위치가 달라진다. 둘 다 받아 준다.
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Fabric R&D"
  workbook.created = new Date()

  const ws = workbook.addWorksheet("REQUEST", { views: [{ state: "frozen", xSplit: 4, ySplit: 2 }] })
  TEMPLATE_COLUMNS.forEach((column, index) => { ws.getColumn(index + 1).width = column.width })

  for (const range of bandRanges()) {
    if (range.to > range.from) ws.mergeCells(1, range.from + 1, 1, range.to + 1)
    const cell = ws.getCell(1, range.from + 1)
    cell.value = range.band
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_COLOR[range.band] } }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }
    cell.alignment = { horizontal: "center", vertical: "middle" }
  }
  ws.getRow(1).height = 18

  const headRow = ws.getRow(2)
  headRow.height = 28
  TEMPLATE_COLUMNS.forEach((column, index) => {
    const cell = headRow.getCell(index + 1)
    cell.value = column.head
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
    cell.font = { bold: true, size: 9 }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = {
      top: { style: "thin", color: { argb: BORDER } }, bottom: { style: "thin", color: { argb: BORDER } },
      left: { style: "thin", color: { argb: BORDER } }, right: { style: "thin", color: { argb: BORDER } },
    }
  })

  let rowIndex = 3
  for (const style of styles) {
    const options: (RequestOption | null)[] = style.options.length ? style.options : [null]
    options.forEach((option, offset) => {
      const row = ws.getRow(rowIndex++)
      TEMPLATE_COLUMNS.forEach((column, index) => {
        // 스타일 값은 첫 행에만. 아래 옵션 행은 비워 둬야 파서가 같은 스타일로 묶는다.
        const value = column.scope === "style" && offset > 0 ? null : cellOf(style, option, column.key)
        const cell = row.getCell(index + 1)
        cell.value = value
        cell.font = { size: 9 }
        cell.alignment = { vertical: "top", wrapText: true }
        cell.border = {
          top: { style: "hair", color: { argb: BORDER } }, bottom: { style: "hair", color: { argb: BORDER } },
          left: { style: "hair", color: { argb: BORDER } }, right: { style: "hair", color: { argb: BORDER } },
        }
      })
    })
  }

  // 안내 시트. 파서는 REQUEST 시트만 읽으므로 여기 내용은 자유다.
  const guide = workbook.addWorksheet("작성 안내")
  guide.getColumn(1).width = 100
  const lines = [
    "FABRIC REQUEST 양식 작성 안내",
    "",
    "1. REQUEST 시트의 3행부터 입력합니다. 1행(밴드)과 2행(열 이름)은 지우거나 옮기지 마세요.",
    "2. 스타일 1건에 옵션이 여러 개면 옵션 수만큼 행을 씁니다.",
    "   첫 행에만 Garment Number를 포함한 스타일 정보를 적고, 두 번째 옵션부터는",
    "   Opt / YARN DETAIL / COLOR / DYEING METHOD / REMARK 만 채웁니다.",
    "   Garment Number가 비어 있는 행은 바로 위 스타일의 옵션으로 읽습니다.",
    "3. 단계는 분석 또는 개발만 씁니다. 비우면 분석으로 들어갑니다.",
    "4. URGENT는 V 또는 O로 표시합니다. 비우면 해제입니다.",
    "5. Weight는 숫자만 씁니다. 단위는 g/m2 입니다.",
    "6. 업로드하면 차트명과 Garment Number가 같은 건은 갱신하고, 없으면 새로 추가합니다.",
    "   기존 건을 갱신할 때 웹에서 올린 garment 사진은 그대로 남습니다.",
    "7. garment 사진은 이 양식으로 올릴 수 없습니다. 웹 화면의 사진 칸에서 직접 올려 주세요.",
    "   엑셀에 붙인 이미지는 파일이 옮겨 다니면서 깨지기 때문에 웹에 보관합니다.",
  ]
  lines.forEach((line, index) => {
    const cell = guide.getCell(index + 1, 1)
    cell.value = line
    cell.font = { size: 10, bold: index === 0 }
    cell.alignment = { vertical: "middle" }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function requestTemplateFileName(date = new Date()): string {
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  return `FABRIC_REQUEST_양식_${stamp}.xlsx`
}

// ─────────────────────────────────────────────── 업로드 파싱

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return XLSX.SSF.format("yyyy-mm-dd", value)
  return String(value).trim()
}

const asNumber = (value: unknown): number | "" => {
  if (value === null || value === undefined || value === "") return ""
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : ""
}

/** V, O, Y, TRUE, 1 을 참으로 본다. 그 외 값과 빈 칸은 거짓이다. */
const asUrgent = (value: unknown): boolean => {
  const text = asText(value).toLocaleUpperCase("en-US")
  return text === "V" || text === "O" || text === "Y" || text === "TRUE" || text === "1"
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface RequestParseResult {
  styles: RequestStyle[]
  /** 사람이 고칠 수 있는 문제만 담는다. 치명적이면 throw 한다. */
  warnings: string[]
}

/**
 * 양식 통합문서를 읽어 스타일 목록을 만든다.
 * reqId와 optId는 여기서 새로 만든다. 기존 건과의 병합은 화면 쪽에서 차트+GarmentNo로 맞춘다.
 */
export function parseRequestWorkbook(workbook: XLSX.WorkBook): RequestParseResult {
  const sheetName = workbook.SheetNames.find((name) => name.trim().toUpperCase() === "REQUEST") ?? workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error("REQUEST 시트를 찾지 못했습니다. 내려받은 양식을 그대로 쓰세요.")

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null })
  if (grid.length < 3) throw new Error("데이터 행이 없습니다. 3행부터 입력해 주세요.")

  // 2행 열 이름이 양식과 맞는지 본다. 순서가 어긋난 파일을 조용히 잘못 읽는 것보다 낫다.
  const header = (grid[1] ?? []).map((value) => asText(value))
  const expected = TEMPLATE_COLUMNS.map((column) => column.head)
  const mismatch = expected.findIndex((head, index) => asText(header[index]) !== head)
  if (mismatch >= 0) {
    throw new Error(`양식이 다릅니다. 2행 ${mismatch + 1}번째 열이 "${expected[mismatch]}" 여야 하는데 "${header[mismatch] || "(빈칸)"}" 입니다.`)
  }

  const at = (row: unknown[], key: string): unknown => {
    const index = columnIndex(key)
    return index < 0 ? null : row[index] ?? null
  }

  const optionKeys = ["yarnDetail", "color", "dyeingMethod", "remark"]
  const styles: RequestStyle[] = []
  const warnings: string[] = []
  let current: RequestStyle | null = null

  for (let r = 2; r < grid.length; r += 1) {
    const row = grid[r] ?? []
    const excelRow = r + 1
    const garmentNo = asText(at(row, "garmentNo"))
    const hasOption = optionKeys.some((key) => asText(at(row, key)) !== "")
    const hasAnything = TEMPLATE_COLUMNS.some((column) => asText(at(row, column.key)) !== "")
    if (!hasAnything) continue

    if (garmentNo) {
      const now = new Date().toISOString()
      current = {
        reqId: newId(),
        chart: asText(at(row, "chart")),
        stage: asText(at(row, "stage")) === "개발" ? "개발" : "분석",
        seq: Number(asNumber(at(row, "seq"))) || styles.length + 1,
        garmentNo,
        brand: asText(at(row, "brand")),
        contents: asText(at(row, "contents")),
        origConstruction: asText(at(row, "origConstruction")),
        origWeight: asNumber(at(row, "origWeight")),
        yarnAnalysis: asText(at(row, "yarnAnalysis")),
        devConstruction: asText(at(row, "devConstruction")),
        comment: asText(at(row, "comment")),
        analyst: asText(at(row, "analyst")),
        urgent: asUrgent(at(row, "urgent")),
        requester: asText(at(row, "requester")),
        developer: asText(at(row, "developer")),
        devPlan: asText(at(row, "devPlan")),
        options: [],
        createdAt: now,
        updatedAt: now,
      }
      styles.push(current)
      // 스타일 행에 옵션 값이 같이 적혀 있으면 그것이 1번 옵션이다.
      if (hasOption) current.options.push(readOption(row, at, current.reqId, 1))
      continue
    }

    if (!hasOption) {
      warnings.push(`${excelRow}행: Garment Number도 옵션 값도 없어 건너뛰었습니다.`)
      continue
    }
    if (!current) {
      warnings.push(`${excelRow}행: 위에 스타일 행이 없는 옵션이라 건너뛰었습니다.`)
      continue
    }
    current.options.push(readOption(row, at, current.reqId, current.options.length + 1))
  }

  if (styles.length === 0) throw new Error("읽어 들인 스타일이 없습니다. Garment Number를 채웠는지 확인해 주세요.")
  return { styles, warnings }
}

function readOption(
  row: unknown[],
  at: (row: unknown[], key: string) => unknown,
  reqId: string,
  no: number,
): RequestOption {
  return {
    optId: `${reqId}#${no}`,
    no,
    yarnDetail: asText(at(row, "yarnDetail")),
    color: asText(at(row, "color")),
    dyeingMethod: asText(at(row, "dyeingMethod")),
    remark: asText(at(row, "remark")),
  }
}

export interface RequestMergeResult {
  merged: RequestStyle[]
  added: number
  updated: number
}

/**
 * 업로드분을 기존 원장에 얹는다. 같은 차트 + Garment No.면 갱신이고 아니면 추가다.
 * 갱신할 때 reqId와 사진 경로는 기존 것을 지킨다. 사진은 엑셀에 없기 때문에
 * 그냥 덮으면 재업로드마다 사진이 날아간다.
 */
export function mergeRequestStyles(existing: readonly RequestStyle[], incoming: readonly RequestStyle[]): RequestMergeResult {
  const keyOf = (style: RequestStyle) => `${style.chart.trim()}::${style.garmentNo.trim().toLocaleUpperCase("en-US")}`
  const byKey = new Map(existing.map((style) => [keyOf(style), style]))
  const merged = [...existing]
  let added = 0
  let updated = 0

  for (const style of incoming) {
    const previous = byKey.get(keyOf(style))
    if (!previous) {
      merged.push(style)
      added += 1
      continue
    }
    const next: RequestStyle = {
      ...style,
      reqId: previous.reqId,
      imagePath: previous.imagePath,
      imageThumbPath: previous.imageThumbPath,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
      // optId는 살아남은 reqId를 따라간다.
      options: style.options.map((option, index) => ({ ...option, no: index + 1, optId: `${previous.reqId}#${index + 1}` })),
    }
    merged[merged.indexOf(previous)] = next
    updated += 1
  }

  return { merged, added, updated }
}
