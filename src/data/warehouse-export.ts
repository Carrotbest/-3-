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

export interface WarehouseExportData {
  from: string
  to: string
  days: WarehouseDayRows[]
  list: WarehouseListRow[]
  totals: { inbound: number; outboundDone: number; listCount: number }
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

  return { from, to, days, list, totals: {
    inbound: days.reduce((sum, day) => sum + day.inbound.length, 0),
    outboundDone: days.reduce((sum, day) => sum + day.outboundDone.length, 0),
    listCount: list.length,
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

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

export function warehouseExportFileName(from: string, to: string): string {
  return `창고팀_자료_${from.slice(5).replace("-", "")}_${to.slice(5).replace("-", "")}.xlsx`
}
