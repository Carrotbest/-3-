import { storageNoLabel, type FabricLedgerItem } from "@/data/fabric-ledger"
import { mailBodyHtml, mailTableHtml, shortDate, storageNoSummary } from "@/data/mail-draft"

/**
 * 창고 원단 출고(컷팅) 요청 메일 초안(C형).
 * 받는 사람은 코드에 넣지 않는다(공개 저장소). 사람이 Outlook에서 입력한다.
 * 표가 본문에 들어간 .eml로 열고, 실제 출고 기록은 정산관리팀 회신 뒤 기존 출고 버튼으로 남긴다.
 */
export interface OutboundRequestLine {
  item: FabricLedgerItem
  /** 요청 수량(yds). 사람이 입력한 원문 */
  qty: string
  note: string
}

export interface OutboundRequestMeta {
  /** 요청 부서. 메일 본문에 "부서:"로 나간다 */
  division: string
  requester: string
  /** yyyy-mm-dd. 창을 열 때 오늘 날짜가 채워지고 사람이 고칠 수 있다 */
  wantedDate: string
}

export const OUTBOUND_REQUEST_COLUMNS = ["R&D No.", "Rack No.", "요청(yds)", "재고(yds)", "FL#", "원단", "비고"] as const

export function stockYds(item: FabricLedgerItem): number | null {
  return item.balance ?? item.yds
}

export function outboundRequestRows(lines: readonly OutboundRequestLine[]): string[][] {
  return lines.map((line) => {
    const stock = stockYds(line.item)
    return [
      storageNoLabel(line.item),
      line.item.rackNo ?? "",
      line.qty.trim(),
      stock === null ? "" : String(stock),
      line.item.flNo,
      line.item.construction,
      line.note.trim(),
    ]
  })
}

export function outboundRequestSubject(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[], today = new Date()): string {
  const division = meta.division.trim() ? `${meta.division.trim()} ` : ""
  return `[원단 출고 요청] ${division}R&D No. ${storageNoSummary(lines.map((line) => line.item.storageNo))} (${today.getMonth() + 1}/${today.getDate()})`
}

export function outboundRequestHtml(meta: OutboundRequestMeta, lines: readonly OutboundRequestLine[]): string {
  const rows = [
    "정산관리팀 담당자님,",
    "",
    "안녕하세요.",
    `아래 원단 ${lines.length}건 컷팅 및 출고 요청 드립니다.`,
    "",
    "{table}",
    "",
  ]
  if (meta.division.trim()) rows.push(`부서: ${meta.division.trim()}`)
  if (meta.requester.trim()) rows.push(`요청자: ${meta.requester.trim()}`)
  if (meta.wantedDate) rows.push(`희망 컷팅일: ${shortDate(meta.wantedDate)}`)
  rows.push("", "컷팅 완료되면 픽업 가능 일정 회신 부탁드립니다.", "", "감사합니다.")
  return mailBodyHtml(rows, mailTableHtml(OUTBOUND_REQUEST_COLUMNS, outboundRequestRows(lines)))
}
