import type { FabricLedgerItem } from "./fabric-ledger"
import type { FabricLedgerEvent } from "./schema"

export interface WarehouseDayRows {
  date: string
  inbound: { storageNo: string; date: string }[]
  outboundDone: { storageNo: string; date: string }[]
}

export interface WarehouseListRow {
  /** M/D 텍스트. 날짜 셀로 변환하지 않는다. */
  requestDate: string
  requester: string
  division: string
  qty: number | ""
  storageNo: string
  fabric: string
  width: number | ""
  weight: number | ""
}

/** 창고보관 전체 목록 1행. 기간과 무관한 현재 시점 스냅샷이다. */
export interface WarehouseStockRow {
  storageNo: string
  styleNo: string
  flNo: string
  season: string
  buyer: string
  owner: string
  fabric: string
  construction: string
  color: string
  weight: number | ""
  balance: number | ""
}

export interface WarehouseExportData {
  from: string
  to: string
  days: WarehouseDayRows[]
  list: WarehouseListRow[]
  stock: WarehouseStockRow[]
  totals: { inbound: number; outboundDone: number; listCount: number; stockCount: number }
}

/** 입고 쪽 이력. UNRECEIVE(입고 취소)가 마지막이면 입고로 보지 않는다. */
const INBOUND_ACTIONS = new Set(["RECEIVE", "CONFIRM", "UNRECEIVE"])
/** 출고 완료 쪽 이력. RESTORE(되돌리기)가 마지막이면 완료로 보지 않는다. */
const OUTBOUND_DONE_ACTIONS = new Set(["EXHAUST", "DISPOSE", "RESTORE"])

/** R&D No.는 원본이 숫자 셀이다. 숫자로 읽히면 숫자로, 아니면 문자열 그대로 넣는다. */
const storageCell = (storageNo: string): string | number | null => {
  const trimmed = String(storageNo ?? "").trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && String(parsed) === trimmed ? parsed : trimmed
}

/** 집계 순서 기준. 배열 순서를 쓰면 팀 공유 병합 때 뒤바뀐다. */
const eventTime = (event: FabricLedgerEvent): string => event.recordedAt ?? event.occurredAt ?? ""

export function collectWarehouseExport(
  events: readonly FabricLedgerEvent[],
  ledger: readonly FabricLedgerItem[],
  from: string,
  to: string,
): WarehouseExportData {
  const days: WarehouseDayRows[] = []
  const end = new Date(`${to}T00:00:00Z`).getTime()
  for (let time = new Date(`${from}T00:00:00Z`).getTime(); time <= end; time += 86400000) {
    days.push({ date: new Date(time).toISOString().slice(0, 10), inbound: [], outboundDone: [] })
  }
  const byDate = new Map(days.map((day) => [day.date, day]))
  const byStorageNo = new Map(ledger.map((item) => [item.storageNo, item]))

  // 같은 R&D No.에 입고확인이 여러 번 찍히면 이력이 그만큼 쌓인다. 보고서에는 최종 1건만 올린다.
  // 기간 밖 이력까지 봐야 "기간 안에서 입고했다가 뒤에 취소된 건"을 걸러낼 수 있다.
  const ordered = [...events].sort((a, b) => eventTime(a).localeCompare(eventTime(b)))
  const lastInbound = new Map<string, FabricLedgerEvent>()
  const lastOutboundDone = new Map<string, FabricLedgerEvent>()
  for (const event of ordered) {
    const storageNo = event.storageNo ?? ""
    if (!storageNo) continue
    if (INBOUND_ACTIONS.has(event.action)) lastInbound.set(storageNo, event)
    if (OUTBOUND_DONE_ACTIONS.has(event.action)) lastOutboundDone.set(storageNo, event)
  }

  const push = (
    final: Map<string, FabricLedgerEvent>,
    undone: string,
    pick: (day: WarehouseDayRows) => { storageNo: string; date: string }[],
  ) => {
    const rows: { storageNo: string; date: string }[] = []
    final.forEach((event, storageNo) => {
      if (event.action === undone) return
      const date = (event.occurredAt ?? "").slice(0, 10)
      if (byDate.has(date)) rows.push({ storageNo, date })
    })
    rows.sort((a, b) => a.date.localeCompare(b.date)
      || a.storageNo.localeCompare(b.storageNo, undefined, { numeric: true }))
    for (const row of rows) pick(byDate.get(row.date)!).push(row)
  }
  push(lastInbound, "UNRECEIVE", (day) => day.inbound)
  push(lastOutboundDone, "RESTORE", (day) => day.outboundDone)

  // 출고 요청은 건마다 별개다. 같은 R&D No.가 여러 번 나가면 그만큼 줄이 생긴다. 합치지 않는다.
  const list: WarehouseListRow[] = events
    .filter((event) => event.action === "OUTBOUND" && byDate.has((event.occurredAt ?? "").slice(0, 10)))
    .sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? "")
      || (a.storageNo ?? "").localeCompare(b.storageNo ?? "", undefined, { numeric: true }))
    .map((event) => {
      const date = (event.occurredAt ?? "").slice(0, 10)
      const storageNo = event.storageNo ?? ""
      const tech = byStorageNo.get(storageNo)?.record?.tech
      return {
        requestDate: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
        requester: event.to ?? "", division: event.division ?? "", qty: event.qty ?? "",
        storageNo, fabric: tech?.yarnDetail ?? "",
        width: tech?.actual?.width ?? "", weight: tech?.actual?.weight ?? "",
      }
    })

  // 창고보관 전체는 기간과 무관하다. 지금 창고에 있는 것만 담는다.
  const stock: WarehouseStockRow[] = ledger
    .filter((item) => item.status === "WAREHOUSE")
    .map((item) => {
      const tech = item.record?.tech
      return {
        storageNo: item.storageNo ?? "",
        styleNo: item.record?.styleNo ?? item.sample?.styleNo ?? "",
        flNo: item.record?.flNo ?? item.sample?.flNo ?? "",
        season: item.record?.season ?? "",
        buyer: item.record?.buyer ?? "",
        owner: item.record?.owner ?? "",
        fabric: tech?.yarnDetail ?? "",
        construction: item.record?.construction ?? "",
        color: item.record?.color ?? "",
        weight: typeof item.record?.weight === "number" ? item.record.weight : ("" as const),
        balance: typeof item.balance === "number" ? item.balance : ("" as const),
      }
    })
    .sort((a, b) => a.storageNo.localeCompare(b.storageNo, undefined, { numeric: true }))

  return { from, to, days, list, stock, totals: {
    inbound: days.reduce((sum, day) => sum + day.inbound.length, 0),
    outboundDone: days.reduce((sum, day) => sum + day.outboundDone.length, 0),
    listCount: list.length,
    stockCount: stock.length,
  } }
}

/**
 * 창고팀 보고 양식 그대로 만든다. 색·글자 크기·열 너비·행 높이·날짜 서식은
 * 원본 .xls 두 개에서 직접 읽어 온 값이다. 눈으로 맞춘 값이 아니다. 바꾸지 마라.
 */
const MALGUN = "맑은 고딕"
/** 요약행 머리(3행) 연두색 */
const HEAD_LIME = "FFCCFFCC"
/** 목록 머리(8행 등) 진초록 */
const HEAD_GREEN = "FF339966"
/** LIST 시트 머리 초록 */
const LIST_GREEN = "FF008000"
const THIN = { style: "thin" } as const
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN } as const

export async function buildWarehouseWorkbook(data: WarehouseExportData): Promise<Blob> {
  const loaded = await import("exceljs")
  const ExcelJS = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded)
  const workbook = new ExcelJS.Workbook()

  /**
   * 입출고 시트. `blankRows`는 입고 목록과 출고완료 블록 사이의 빈 줄 수다.
   * 원본이 일자별 2줄, 주차(요약) 1줄이라 그대로 맞춘다.
   * 창고팀이 시트를 통째로 복사해 붙이므로 행 위치가 어긋나면 안 된다.
   */
  const movementSheet = (name: string, inbound: WarehouseDayRows["inbound"], outboundDone: WarehouseDayRows["outboundDone"], blankRows: 1 | 2) => {
    const sheet = workbook.addWorksheet(name)
    sheet.getColumn(1).width = 8.88
    ;[2, 3, 4].forEach((col) => { sheet.getColumn(col).width = 14.75 })
    sheet.getColumn(5).width = 20.75

    const put = (row: number, col: number, value: unknown, opts: { size: number; bold?: boolean; fill?: string; numFmt?: string; box?: boolean }) => {
      const cell = sheet.getCell(row, col)
      if (value !== undefined) cell.value = value as never
      cell.font = { name: MALGUN, size: opts.size, bold: opts.bold ?? false }
      cell.alignment = { horizontal: "center", vertical: "middle" }
      if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } }
      if (opts.numFmt) cell.numFmt = opts.numFmt
      if (opts.box !== false) cell.border = BOX
      sheet.getRow(row).height = 16.55
    }

    // 3행 요약 머리 — 연두, 굵기 없음, 11pt
    ;["부서명", "입고", "RND 출고 완료건"].forEach((label, i) => put(3, i + 2, label, { size: 11, fill: HEAD_LIME }))
    put(4, 2, "R&D", { size: 11 })
    put(4, 3, inbound.length || null, { size: 11 })
    put(4, 4, outboundDone.length || null, { size: 11 })

    /** 목록 블록 하나. 제목(굵게 12pt, 테두리 없음) + 머리(진초록 9pt) + 데이터. */
    const block = (titleRow: number, title: string, dateHead: string, entries: WarehouseDayRows["inbound"]) => {
      put(titleRow, 2, title, { size: 12, bold: true, box: false })
      ;["부서명", "R&D No.", dateHead].forEach((label, i) => put(titleRow + 1, i + 2, label, { size: 9, fill: HEAD_GREEN }))
      const start = titleRow + 2
      // 비어 있어도 "R&D" 한 줄은 남긴다. 원본이 그렇다.
      put(start, 2, "R&D", { size: 11 })
      put(start, 3, undefined, { size: 9 })
      put(start, 4, undefined, { size: 9, numFmt: 'mm"월" dd"일"' })
      entries.forEach((entry, i) => {
        put(start + i, 2, "R&D", { size: 11 })
        put(start + i, 3, storageCell(entry.storageNo), { size: 9 })
        put(start + i, 4, new Date(`${entry.date}T00:00:00Z`), { size: 9, numFmt: 'mm"월" dd"일"' })
      })
      return start + Math.max(1, entries.length) - 1
    }

    const inboundLast = block(7, "입고 현황", "입고일자", inbound)
    block(inboundLast + blankRows + 1, "RND 출고 완료 현황", "폐기일자", outboundDone)
  }

  movementSheet("요약", data.days.flatMap((day) => day.inbound), data.days.flatMap((day) => day.outboundDone), 1)
  data.days.forEach((day) => movementSheet(day.date.slice(5).replace("-", "."), day.inbound, day.outboundDone, 2))

  const list = workbook.addWorksheet("LIST")
  list.getColumn(1).width = 3.75
  ;[6.5, 8.75, 8.75, 10.75, 15.75, 8.75, 8.75, 75.5, 8.75, 8.75].forEach((width, i) => { list.getColumn(i + 2).width = width })
  list.getColumn(12).width = 8.88
  const listHeads = ["요청일", "전산출고 요청", "요청자", "사용바이어", "용도", "출고량(yd)", "Style No.", "Fabric & Yarn", "폭", "중량(G/M2)"]
  listHeads.forEach((label, i) => {
    const cell = list.getCell(2, i + 2)
    cell.value = label
    cell.font = { name: MALGUN, size: 9, bold: true, color: { argb: "FFFFFFFF" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIST_GREEN } }
    cell.border = BOX
  })
  list.getRow(2).height = 13.6
  data.list.forEach((row, i) => {
    const values: unknown[] = [row.requestDate, "Fabric R&D", row.requester, row.division, "DEVELOP SAMPLE",
      row.qty, storageCell(row.storageNo), row.fabric, row.width, row.weight]
    values.forEach((value, c) => {
      const cell = list.getCell(3 + i, c + 2)
      cell.value = (value === "" ? null : value) as never
      cell.font = { name: MALGUN, size: 9 }
      // 원단명만 왼쪽 정렬이다. 나머지는 가운데. 원본이 그렇다.
      cell.alignment = { horizontal: c === 7 ? "left" : "center", vertical: "middle" }
      if (c === 0) cell.numFmt = "@"
      cell.border = BOX
    })
    list.getRow(3 + i).height = 13.6
  })

  buildRequestSummarySheet(workbook, data)
  buildLookupSheet(workbook, data)
  buildStockSheet(workbook, data)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

/** exceljs를 동적 import 하므로 정적 타입이 없다. 패키지 타입에서 끌어 쓴다. */
type ExcelWorkbook = InstanceType<typeof import("exceljs")["Workbook"]>

/** 원본 주차 시트의 청록 머리. */
const TEAL = "FF008080"
/** 통합원단부 줄 강조색. 원본이 노랑이다. */
const OUR_ROW = "FFFFFF00"

/** 좌측 부서 목록. 원본 순서를 그대로 쓴다. 우리 부서만 값이 찬다. */
const DEPARTMENTS = ["사업1부", "사업2부", "사업3부", "사업4부", "사업6부", "사업7부", "OBM", "사업10부", "사업11부", "통합원단부"] as const
/** 우측 팀별 목록. Buyer 문구는 원본 파일이 관리하므로 팀 이름만 채운다. */
const TEAMS = [
  "사업1부1팀", "사업1부2팀", "사업2부1팀", "사업2부2팀", "사업2부3팀",
  "사업3부1팀", "사업3부2팀", "사업3부3팀", "사업3부4팀",
  "사업4부1팀", "사업4부2팀", "사업4부3팀", "사업4부4팀",
  "사업6부1팀", "사업6부2팀", "사업6부3팀", "사업6부4팀",
  "사업7부1팀", "사업7부2팀", "사업7부3팀", "사업7부4팀",
  "OBM", "사업10부1팀", "사업10부2팀", "사업11부1팀", "사업11부2팀", "통합원단부",
] as const

const OURS = "통합원단부"

/**
 * 전산출고요청 현황표의 주차 시트. 부서별·팀별 집계 틀을 원본 그대로 만든다.
 *
 * **다른 부서 숫자는 우리가 알 수 없어 0으로 둔다.** 창고팀이 각 부서 것을 합치는 자리다.
 * 틀을 맞춰 두면 통합원단부 줄만 옮겨 붙이면 된다.
 */
function buildRequestSummarySheet(workbook: ExcelWorkbook, data: WarehouseExportData): void {
  const ws = workbook.addWorksheet("주차 집계")
  ;[4, 12.25, 13.5, 12, 6, 11.38, 11.62, 45.88, 8.88].forEach((width, i) => { ws.getColumn(i + 1).width = width })

  const put = (row: number, col: number, value: unknown, o: { bold?: boolean; fill?: string; size?: number; numFmt?: string; left?: boolean } = {}) => {
    const cell = ws.getCell(row, col)
    if (value !== undefined) cell.value = value as never
    cell.font = { name: MALGUN, size: o.size ?? 11, bold: o.bold ?? false }
    cell.alignment = { horizontal: o.left ? "left" : "center", vertical: "middle" }
    if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } }
    if (o.numFmt) cell.numFmt = o.numFmt
    cell.border = BOX
  }

  ws.mergeCells(2, 2, 2, 4)
  const title = ws.getCell(2, 2)
  title.value = `${data.from.replace(/-/g, ".")} ~ ${data.to.replace(/-/g, ".")} 전산출고 요청`
  title.font = { name: MALGUN, size: 12, bold: true }
  title.alignment = { horizontal: "center", vertical: "middle" }
  ws.getRow(2).height = 20.3

  const total = data.totals.listCount
  ;["부서명", "전산출고 요청", "출고 비율"].forEach((label, i) => put(3, i + 2, label, { bold: true, fill: TEAL }))
  ;["부서팀명", "전산출고 요청", "Buyer"].forEach((label, i) => put(3, i + 6, label, { bold: true, fill: TEAL }))
  ws.getRow(3).height = 16.6

  DEPARTMENTS.forEach((name, i) => {
    const row = 4 + i
    const mine = name === OURS
    put(row, 2, name, { fill: mine ? OUR_ROW : "FFFFFFFF" })
    put(row, 3, mine ? total : 0)
    put(row, 4, mine && total ? 1 : 0, { numFmt: "0%" })
    ws.getRow(row).height = 16.6
  })
  const sumRow = 4 + DEPARTMENTS.length
  put(sumRow, 2, "합계", { bold: true, fill: TEAL })
  put(sumRow, 3, total, { bold: true, fill: TEAL })
  put(sumRow, 4, total ? 1 : 0, { bold: true, fill: TEAL, numFmt: "0%" })

  TEAMS.forEach((name, i) => {
    const row = 4 + i
    const mine = name === OURS
    put(row, 6, name, { fill: mine ? OUR_ROW : "FFFFFFFF" })
    put(row, 7, mine ? total : 0)
    put(row, 8, undefined, { size: 9, left: true })
  })
  const teamSum = 4 + TEAMS.length
  put(teamSum, 6, "합계", { bold: true, fill: TEAL })
  put(teamSum, 7, total, { bold: true, fill: TEAL })
  put(teamSum, 8, undefined, { size: 9, left: true })
}

/** 원본 `데이터` 시트. LIST에서 R&D No.로 원단명을 끌어 쓰는 참조표다. */
function buildLookupSheet(workbook: ExcelWorkbook, data: WarehouseExportData): void {
  const ws = workbook.addWorksheet("데이터")
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 12
  ws.getColumn(3).width = 60
  ;["Style No.", "원단명"].forEach((label, i) => {
    const cell = ws.getCell(2, i + 2)
    cell.value = label
    cell.font = { name: MALGUN, size: 9, bold: true }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_LIME } }
    cell.border = BOX
  })
  data.stock.forEach((row, i) => {
    const at = 3 + i
    const no = ws.getCell(at, 2)
    no.value = storageCell(row.storageNo)
    no.font = { name: MALGUN, size: 9 }
    no.alignment = { horizontal: "center", vertical: "middle" }
    no.border = BOX
    const name = ws.getCell(at, 3)
    name.value = row.fabric || null
    name.font = { name: MALGUN, size: 9 }
    name.alignment = { horizontal: "left", vertical: "middle" }
    name.border = BOX
  })
}

const STOCK_COLUMNS: readonly { key: keyof WarehouseStockRow; head: string; width: number; left?: boolean }[] = [
  { key: "storageNo", head: "R&D No.", width: 10 },
  { key: "styleNo", head: "Style/#", width: 14 },
  { key: "flNo", head: "FL.#", width: 13 },
  { key: "season", head: "Season", width: 9 },
  { key: "buyer", head: "Buyer", width: 12 },
  { key: "owner", head: "Developer", width: 10 },
  { key: "fabric", head: "Yarn", width: 46, left: true },
  { key: "construction", head: "Cons.", width: 16, left: true },
  { key: "color", head: "Color", width: 14, left: true },
  { key: "weight", head: "중량", width: 8 },
  { key: "balance", head: "재고(yds)", width: 10 },
]

/** 창고보관 전체 목록. 기간과 무관한 현재 시점 스냅샷이다. */
function buildStockSheet(workbook: ExcelWorkbook, data: WarehouseExportData): void {
  const ws = workbook.addWorksheet("창고보관 현황")
  ws.getColumn(1).width = 4
  STOCK_COLUMNS.forEach((column, i) => { ws.getColumn(i + 2).width = column.width })

  const title = ws.getCell(1, 2)
  title.value = `창고보관 ${data.stock.length.toLocaleString("ko-KR")}건 · ${new Date().toISOString().slice(0, 10)} 기준`
  title.font = { name: MALGUN, size: 11, bold: true }

  STOCK_COLUMNS.forEach((column, i) => {
    const cell = ws.getCell(2, i + 2)
    cell.value = column.head
    cell.font = { name: MALGUN, size: 9, bold: true }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_GREEN } }
    cell.border = BOX
  })
  ws.getRow(2).height = 16.6

  data.stock.forEach((row, i) => {
    STOCK_COLUMNS.forEach((column, c) => {
      const cell = ws.getCell(3 + i, c + 2)
      const value = column.key === "storageNo" ? storageCell(row.storageNo) : row[column.key]
      cell.value = (value === "" ? null : value) as never
      cell.font = { name: MALGUN, size: 9 }
      cell.alignment = { horizontal: column.left ? "left" : "center", vertical: "middle" }
      cell.border = BOX
    })
  })
  if (data.stock.length) {
    ws.autoFilter = { from: { row: 2, column: 2 }, to: { row: 2 + data.stock.length, column: 1 + STOCK_COLUMNS.length } }
  }
}

export function warehouseExportFileName(from: string, to: string): string {
  return `창고팀_자료_${from.slice(5).replace("-", "")}_${to.slice(5).replace("-", "")}.xlsx`
}
