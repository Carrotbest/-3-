import type { FabricLedgerItem } from "@/data/fabric-ledger"

/**
 * 창고 원단 출고(컷팅) 요청 메일 초안(C형).
 * 받는 사람은 코드에 넣지 않는다(공개 저장소). Outlook 새 메일을 제목과 본문 틀만 채워 열고,
 * 요청 표는 클립보드에 넣어 본문에 붙여넣게 한다. 실제 출고 기록은 정산관리팀 회신 뒤 기존 출고 버튼으로 남긴다.
 */
export interface OutboundRequestLine {
  item: FabricLedgerItem
  /** 요청 수량(yds). 사람이 입력한 원문 */
  qty: string
  note: string
}

export interface OutboundRequestMeta {
  division: string
  requester: string
  /** yyyy-mm-dd */
  wantedDate: string
  note: string
}

export const OUTBOUND_REQUEST_COLUMNS = ["R&D No.", "Style No.", "FL#", "원단", "컬러", "재고(yds)", "요청(yds)", "비고"] as const

export function stockYds(item: FabricLedgerItem): number | null {
  return item.balance ?? item.yds
}

const lineCells = (line: OutboundRequestLine): string[] => {
  const stock = stockYds(line.item)
  return [
    line.item.storageNo,
    line.item.styleNo,
    line.item.flNo,
    line.item.construction,
    line.item.color,
    stock === null ? "" : String(stock),
    line.qty.trim(),
    line.note.trim(),
  ]
}

const shortDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${Number(match[2])}/${Number(match[3])}` : value
}

export function outboundRequestSubject(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[], today = new Date()): string {
  const numbers = lines.map((line) => line.item.storageNo).filter(Boolean)
  const head = numbers.slice(0, 3).join(", ")
  const rest = numbers.length > 3 ? ` 외 ${numbers.length - 3}건` : ""
  const division = meta.division.trim() ? `${meta.division.trim()} ` : ""
  return `[원단 출고 요청] ${division}R&D No. ${head}${rest} (${today.getMonth() + 1}/${today.getDate()})`
}

export function outboundRequestBody(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[]): string {
  const rows = [
    "정산관리팀 담당자님,",
    "",
    "안녕하세요.",
    `아래 원단 ${lines.length}건 컷팅 및 출고 요청 드립니다.`,
    "",
    "(여기에 요청 표를 붙여넣어 주세요. Ctrl+V)",
    "",
  ]
  if (meta.division.trim()) rows.push(`사업부: ${meta.division.trim()}`)
  if (meta.requester.trim()) rows.push(`요청자: ${meta.requester.trim()}`)
  if (meta.wantedDate) rows.push(`희망 컷팅일: ${shortDate(meta.wantedDate)}`)
  if (meta.note.trim()) rows.push(`비고: ${meta.note.trim()}`)
  rows.push("", "컷팅 완료되면 픽업 가능 일정 회신 부탁드립니다.", "", "감사합니다.")
  return rows.join("\r\n")
}

/** 받는 사람 없이 제목과 본문만 채운 Outlook 새 메일 주소. */
export function outboundRequestMailto(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** 아웃룩 본문에 붙이면 표로 들어간다. 실패하면 탭 구분 텍스트로 떨어진다(FDS/YDS 요청 표와 같은 방식). */
export async function copyOutboundRequestTable(lines: readonly OutboundRequestLine[]): Promise<"html" | "text"> {
  const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const cellStyle = "border:1px solid #bfbfbf; padding:4px 6px; font-size:12px;"
  const header = OUTBOUND_REQUEST_COLUMNS.map((head) => `<th style="${cellStyle} background:#d6e4f0; font-weight:bold; text-align:center;">${escapeHtml(head)}</th>`).join("")
  const body = lines.map((line) => `<tr>${lineCells(line).map((cell) => `<td style="${cellStyle} vertical-align:top;">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
  const html = `<table style="border-collapse:collapse;"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
  const tsv = [OUTBOUND_REQUEST_COLUMNS.join("\t"), ...lines.map((line) => lineCells(line).map((cell) => cell.replace(/[\t\r\n]+/g, " ")).join("\t"))].join("\n")
  // Blob과 ClipboardItem은 첫 await 전에, 클릭의 동기 실행 흐름에서 만든다.
  const htmlBlob = new Blob([html], { type: "text/html" })
  const textBlob = new Blob([tsv], { type: "text/plain" })
  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })])
      return "html"
    }
  } catch { /* HTML 복사를 지원하지 않으면 탭 구분 텍스트로 재시도한다. */ }
  await navigator.clipboard.writeText(tsv)
  return "text"
}
