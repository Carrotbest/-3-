import type { FabricLedgerItem } from "@/data/fabric-ledger"
import { mailBodyHtml, mailTableHtml, shortDate, storageNoSummary } from "@/data/mail-draft"

/**
 * 창고 입고 요청 메일. 입고대기에서 선택 입고로 R&D No.를 매긴 원단을 정산관리팀에 넘길 때 쓴다.
 * 받는 사람은 `mail-recipients.ts`의 고정 목록이다. Rack No. 열은 창고팀이 보관한 칸을 적어 회신하도록 비워 둔다.
 */
export interface InboundRequestMeta {
  requester: string
  /** 원단 전달 예정일. yyyy-mm-dd */
  deliveryDate: string
  note: string
}

export const INBOUND_REQUEST_COLUMNS = ["R&D No.", "Style No.", "FL#", "Buyer", "원단", "컬러", "수량(yds)", "Rack No."] as const

export function inboundRequestRows(items: readonly FabricLedgerItem[]): string[][] {
  return items.map((item) => [
    item.storageNo,
    item.styleNo,
    item.flNo,
    item.buyer,
    item.construction,
    item.color,
    item.yds === null ? "" : String(item.yds),
    item.rackNo ?? "",
  ])
}

export function inboundRequestSubject(items: readonly FabricLedgerItem[], today = new Date()): string {
  return `[원단 입고 요청] R&D No. ${storageNoSummary(items.map((item) => item.storageNo))} (${today.getMonth() + 1}/${today.getDate()})`
}

export function inboundRequestHtml(meta: InboundRequestMeta, items: readonly FabricLedgerItem[]): string {
  const lines = [
    "정산관리팀 담당자님,",
    "",
    "안녕하세요.",
    `아래 원단 ${items.length}건 입고 요청 드립니다.`,
    "",
    "{table}",
    "",
  ]
  if (meta.deliveryDate) lines.push(`전달 예정일: ${shortDate(meta.deliveryDate)}`)
  if (meta.note.trim()) lines.push(`비고: ${meta.note.trim()}`)
  lines.push("", meta.requester.trim() ? `${meta.requester.trim()} 드림` : "감사합니다.")
  return mailBodyHtml(lines, mailTableHtml(INBOUND_REQUEST_COLUMNS, inboundRequestRows(items)))
}
