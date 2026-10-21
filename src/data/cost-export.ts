import type { CostSheetDoc } from "./cost-sheets"
import type { FeeGroup } from "./fabric-cost"

/*
 * 원가계산서 엑셀 내보내기.
 *
 * **팀이 쓰던 수기 양식을 그대로 재현한다**(2026-10-21 박향근 지시).
 * 칸 배치, 병합, 글꼴과 크기, 테두리, 열 너비와 행 높이, 인쇄 배율까지 원본과 같다.
 * 그 서식을 손으로 옮기면 반드시 어긋나므로 원본에서 **떠낸** 것을 쓴다.
 * 서식표는 `public/templates/cost-sheet-form.json` 이고 값이 들어가는 칸은 비워 두었다.
 * 그 파일에는 단가도 협력사명도 없다. 공개 저장소라 라벨과 서식만 남겼다.
 *
 * **수식은 넣지 않는다.** 원본 수식에는 `#REF!` 와 잘못된 참조가 있었고, 계산은 이미
 * 웹(`fabric-cost.ts`)이 검증된 기준값으로 한다. 여기서는 계산 결과만 적는다.
 * 엑셀에서 숫자를 고쳐도 다시 계산되지 않는다. 고칠 일이 있으면 웹에서 고치고 다시 뽑는다.
 */

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/cost-sheet-form.json`

type Edge = "thin" | "hair" | "medium" | "thick" | "double" | "dotted" | "dashed" | null
interface TemplateStyle {
  font: [string | null, number, boolean, string | null]
  fill: string | null
  bd: [Edge, Edge, Edge, Edge]
  bdc: [string | null, string | null, string | null, string | null]
  al: [string | null, string | null, boolean, number]
  nf: string
}
interface CostFormTemplate {
  cols: Record<string, number>
  rows: Record<string, number>
  merges: string[]
  /** 병합 칸의 바깥 테두리. 원본 네 모서리에서 합성해 둔 값이다. 쓰는 이유는 아래 주석 참조. */
  mergeBorders: Record<string, { bd: [Edge, Edge, Edge, Edge]; bdc: [string | null, string | null, string | null, string | null] }>
  page: { scale: number; margins: [number, number, number, number] }
  styles: TemplateStyle[]
  cells: ([string, number] | [string, number, string | number])[]
}

let templateCache: Promise<CostFormTemplate> | null = null
function loadTemplate(): Promise<CostFormTemplate> {
  if (!templateCache) {
    templateCache = fetch(TEMPLATE_URL).then((response) => {
      if (!response.ok) throw new Error("원가계산서 양식을 불러오지 못했습니다.")
      return response.json() as Promise<CostFormTemplate>
    }).catch((error) => { templateCache = null; throw error })
  }
  return templateCache
}

/**
 * 양식의 고정 칸 수. 원본이 병합으로 짜여 있어 줄을 늘리면 아래 칸이 전부 밀린다.
 * 넘치는 건은 싣지 않고 맨 아래에 몇 건이 빠졌는지 적는다. 조용히 버리지 않는다.
 */
const SLOTS: Record<"yarn" | FeeGroup, number[]> = {
  yarn: [10, 11, 12, 13, 14],
  yarnDye: [17, 18],
  knitting: [21],
  dyeing: [24],
  other: [27, 28, 29, 30, 31],
}

/** 원사 단가를 양식의 Ring / Lbs / Kg 세 칸 중 맞는 자리에 넣는다. */
const PRICE_COLUMN: Record<string, "F" | "G" | "H" | null> = {
  "USD/bale": "F", "USD/lb": "G", "USD/kg": "H", "KRW/kg": null,
}

export async function exportCostSheetWorkbook(doc: CostSheetDoc): Promise<Blob> {
  const [loaded, template] = await Promise.all([import("exceljs"), loadTemplate()])
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("원가계산서", {
    pageSetup: {
      paperSize: 9, orientation: "portrait", scale: template.page.scale,
      margins: { left: template.page.margins[0], right: template.page.margins[1], top: template.page.margins[2], bottom: template.page.margins[3], header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  })

  for (const [column, width] of Object.entries(template.cols)) sheet.getColumn(column).width = width
  for (const [row, height] of Object.entries(template.rows)) sheet.getRow(Number(row)).height = height

  const edge = (style: Edge, color: string | null) => style ? { style, ...(color ? { color: { argb: color } } : {}) } : undefined
  const applyStyles = () => {
    for (const entry of template.cells) {
      const style = template.styles[entry[1]]
      const cell = sheet.getCell(entry[0])
      cell.font = { name: style.font[0] ?? undefined, size: style.font[1], bold: style.font[2], ...(style.font[3] ? { color: { argb: style.font[3] } } : {}) }
      if (style.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } }
      const [t, r, b, l] = style.bd
      const [tc, rc, bc, lc] = style.bdc
      cell.border = { top: edge(t, tc), right: edge(r, rc), bottom: edge(b, bc), left: edge(l, lc) }
      // 엑셀 XML 은 세로 가운데를 `center` 로 적지만 ExcelJS 는 `middle` 로 받는다.
      // 그대로 넘기면 조용히 버려져 글자가 칸 위쪽에 붙는다. 서식표는 원본 표기를 담고 있다.
      const vertical = style.al[1] === "center" ? "middle" : style.al[1]
      cell.alignment = {
        ...(style.al[0] ? { horizontal: style.al[0] as "left" } : {}),
        ...(vertical ? { vertical: vertical as "top" } : {}),
        wrapText: style.al[2], ...(style.al[3] ? { indent: style.al[3] } : {}),
      }
      if (style.nf && style.nf !== "General") cell.numFmt = style.nf
    }
  }

  applyStyles()
  for (const entry of template.cells) if (entry.length > 2) sheet.getCell(entry[0]).value = entry[2] as string | number
  for (const range of template.merges) sheet.mergeCells(range)
  /*
   * 병합 뒤에 바깥 테두리를 대표 칸에 다시 입힌다.
   *
   * 엑셀은 병합 칸의 테두리를 범위를 이루는 칸들의 테두리로 그린다. 원본은 그 테두리를
   * 네 모서리에 나눠 들고 있는데, ExcelJS 는 병합하면서 딸린 칸을 전부 대표 칸 서식으로 덮는다.
   * 그래서 원본 네 모서리에서 합성해 둔 바깥 테두리를 대표 칸에 입혀야 선 굵기가 원본과 같아진다.
   *
   * **서식을 병합 뒤에 통째로 다시 입히면 안 된다.** ExcelJS 는 병합된 칸의 `getCell` 을
   * 대표 칸으로 연결하므로, 딸린 칸에 쓴다고 생각한 서식이 대표 칸을 덮어 글꼴과 정렬까지 날아간다.
   */
  for (const [range, box] of Object.entries(template.mergeBorders ?? {})) {
    const master = sheet.getCell(range.split(":")[0])
    const [t, r, b, l] = box.bd
    const [tc, rc, bc, lc] = box.bdc
    master.border = { top: edge(t, tc), right: edge(r, rc), bottom: edge(b, bc), left: edge(l, lc) }
  }

  const { input, result } = doc.sheet
  const lines = result.lines
  const put = (ref: string, value: string | number | Date | null | undefined) => {
    if (value === null || value === undefined || value === "") return
    sheet.getCell(ref).value = value as string | number | Date
  }

  /* 머리 */
  put("E2", new Date(doc.at))
  put("L2", input.fxRate)
  put("E3", doc.buyer)
  put("L3", doc.owner)
  put("E4", doc.styleNo)
  put("E5", doc.storageNo ?? "")
  put("E6", doc.flNo)
  put("E7", [doc.construction, doc.blend?.labelText].filter(Boolean).join("   "))
  put("J5", input.gsm)
  put("L5", input.widthInch)
  put("M5", Math.round(result.grPerYd))

  /* 원사. K 열은 loss 까지 반영된 $/kg 기여분이라 웹의 계산 결과를 그대로 쓴다. */
  const yarnSlots = SLOTS.yarn
  const yarns = input.yarns.slice(0, yarnSlots.length)
  yarns.forEach((yarn, index) => {
    const row = yarnSlots[index]
    const line = lines[index]
    put(`D${row}`, yarn.name)
    const column = PRICE_COLUMN[yarn.priceUnit] ?? null
    if (column) put(`${column}${row}`, yarn.price)
    else put(`H${row}`, yarn.price / input.fxRate)
    put(`I${row}`, line?.perKg != null && yarn.ratio ? line.perKg / (yarn.ratio / 100) : null)
    put(`J${row}`, yarn.ratio)
    put(`K${row}`, line?.perKg ?? 0)
    put(`L${row}`, yarn.yarnDyed ? "선염" : "")
  })
  put("J15", yarns.reduce((sum, yarn) => sum + yarn.ratio, 0))
  put("K15", yarns.reduce((sum, _yarn, index) => sum + (lines[index]?.perKg ?? 0), 0))

  /* 공정. 묶음마다 양식의 자리와 소계 줄이 정해져 있다. */
  const SUBTOTAL: Record<FeeGroup, { rows: number[]; loss: string; sum: string }> = {
    yarnDye: { rows: SLOTS.yarnDye, loss: "J19", sum: "K19" },
    knitting: { rows: SLOTS.knitting, loss: "J22", sum: "K22" },
    dyeing: { rows: SLOTS.dyeing, loss: "J25", sum: "K25" },
    other: { rows: SLOTS.other, loss: "J32", sum: "K32" },
  }
  let dropped = input.yarns.length - yarns.length
  for (const group of Object.keys(SUBTOTAL) as FeeGroup[]) {
    const slot = SUBTOTAL[group]
    const all = input.fees.map((fee, index) => ({ fee, line: lines[input.yarns.length + index] })).filter((item) => item.fee.group === group)
    const items = all.slice(0, slot.rows.length)
    dropped += all.length - items.length
    items.forEach((item, index) => {
      const row = slot.rows[index]
      put(`D${row}`, [item.fee.label, item.fee.remark].filter(Boolean).join(" · "))
      put(`I${row}`, item.fee.unit === "KRW/kg" ? item.fee.rate / input.fxRate : item.fee.rate)
      put(`J${row}`, item.fee.loss)
      put(`K${row}`, item.line?.perKg ?? 0)
      put(`L${row}`, item.fee.mill ?? "")
      if (item.fee.unit === "KRW/kg") put(`M${row}`, item.fee.rate)
    })
    put(slot.loss, items.reduce((sum, item) => sum + item.fee.loss, 0))
    put(slot.sum, items.reduce((sum, item) => sum + (item.line?.perKg ?? 0), 0))
  }

  /* 결과. 원본은 K 가 $/kg, M 이 $/yd, N 이 ₩/yd 다. */
  put("K33", result.netPerKg)
  put("M33", result.netPerYd)
  put("N33", result.netKrwPerYd)
  put("K34", result.netPerLb)
  const profit = input.profitPct ?? 0
  if (profit !== 0) {
    put("I35", profit)
    put("K35", result.totalPerKg - result.netPerKg)
    put("M35", result.totalPerYd - result.netPerYd)
    put("N35", Math.round(result.totalPerYd * input.fxRate) - result.netKrwPerYd)
    put("K36", result.totalPerKg)
    put("M36", result.totalPerYd)
    put("N36", Math.round(result.totalPerYd * input.fxRate))
  } else {
    put("K36", result.netPerKg)
    put("M36", result.netPerYd)
    put("N36", result.netKrwPerYd)
  }
  // 보험·운임·수수료는 웹이 받지 않는 값이다. 0 으로 채우지 않고 비워 사람이 적게 둔다.
  // CIF 는 그래서 이익 포함 값과 같다. 나중에 웹이 이 셋을 받으면 여기도 같이 더한다.
  put("K40", profit !== 0 ? result.totalPerKg : result.netPerKg)
  put("M40", profit !== 0 ? result.totalPerYd : result.netPerYd)
  put("N40", Math.round((profit !== 0 ? result.totalPerYd : result.netPerYd) * input.fxRate))
  put("K43", (profit !== 0 ? result.totalPerKg : result.netPerKg) / 2.2046)

  if (doc.note?.trim()) put("D44", doc.note.trim())
  put("C45", `${doc.version === 0 ? "임시" : `v${doc.version}`}  ·  ${new Date(doc.at).toLocaleString("ko-KR")}  ·  ${doc.by}`)
  if (dropped > 0) put("C46", `※ 양식 칸이 모자라 ${dropped}건을 싣지 못했습니다. 웹 화면에서 전부 확인하세요.`)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: EXCEL_MIME })
}

export function costSheetFileName(doc: CostSheetDoc): string {
  const date = new Date(doc.at)
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  const key = (doc.flNo || doc.styleNo).trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "")
  return `원가_${key ? `${key}_` : ""}${stamp}_${doc.version === 0 ? "임시" : `v${doc.version}`}.xlsx`
}
