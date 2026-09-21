import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"

import type { FabricLedgerItem } from "./fabric-ledger"
import { auth, db } from "./firebase"
import { storageNoSummary } from "./mail-draft"
import { stockYds, type OutboundRequestLine, type OutboundRequestMeta } from "./outbound-request-mail"

/**
 * Teams 채널 알림 주소. 공개 저장소라 주소를 코드에 넣지 않고 Firestore에 둔다.
 *
 * 문서는 `state/teamsWebhook` 하나다. 동기화 구독은 `CACHE_KEYS`에 없는 문서를 건너뛰므로
 * 화면 데이터와 섞이지 않는다.
 */
const WEBHOOK_DOC = ["state", "teamsWebhook"] as const

interface InboundCardItem {
  item: FabricLedgerItem
  storageNo: string
  yds?: number
}

export interface InboundCardInput {
  registrant: string
  registeredDate: string
  items: readonly InboundCardItem[]
}

export interface OutboundCardInput {
  meta: OutboundRequestMeta
  lines: readonly OutboundRequestLine[]
}

export interface OutboundConfirmCardItem {
  item: FabricLedgerItem
  qty: number
  balanceAfter: number | null
}

export interface OutboundConfirmCardInput {
  to: string
  division: string
  date: string
  items: readonly OutboundConfirmCardItem[]
}

export interface OutboundCancelCardInput {
  canceler: string
  canceledDate: string
  items: readonly { item: FabricLedgerItem; qty: number; outboundDate: string }[]
}

interface CardOptions {
  title: string
  color: "Accent" | "Warning" | "Good" | "Attention"
  description: string
  facts: { title: string; value: string }[]
  lines: string[]
  closing: string
}

const warehouseUrl = (): string => `${window.location.origin}${import.meta.env.BASE_URL}#/warehouse`

const listText = (lines: readonly string[]): string => {
  const visible = lines.slice(0, 15)
  if (lines.length > 15) visible.push(`외 ${lines.length - 15}건`)
  return visible.join("\n\n")
}

const buildCard = ({ title, color, description, facts, lines, closing }: CardOptions): unknown => ({
  type: "AdaptiveCard",
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  version: "1.4",
  body: [
    { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", color, spacing: "None" },
    { type: "TextBlock", text: description, wrap: true, spacing: "Small" },
    { type: "FactSet", facts, spacing: "Medium" },
    { type: "TextBlock", text: "대상", weight: "Bolder", size: "Small", spacing: "Medium" },
    { type: "TextBlock", text: listText(lines), wrap: true, size: "Small", spacing: "Small" },
    { type: "TextBlock", text: closing, wrap: true, size: "Small", isSubtle: true, spacing: "Medium" },
  ],
  actions: [{ type: "Action.OpenUrl", title: "창고 화면 열기", url: warehouseUrl() }],
})

export async function loadTeamsWebhook(): Promise<string> {
  const snap = await getDoc(doc(db, ...WEBHOOK_DOC))
  return snap.exists() ? String(snap.data().url ?? "").trim() : ""
}

export async function saveTeamsWebhook(url: string): Promise<string> {
  const savedUrl = url.trim().startsWith("https://") ? url.trim() : ""
  await setDoc(doc(db, ...WEBHOOK_DOC), {
    url: savedUrl,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email ?? "",
  }, { merge: true })
  return savedUrl
}

export async function notifyTeams(card: unknown): Promise<"sent" | "skipped"> {
  const url = await loadTeamsWebhook()
  if (!url) return "skipped"
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card }),
  })
  if (!response.ok) throw new Error(`Teams notification failed: ${response.status}`)
  return "sent"
}

export function buildInboundCard(input: InboundCardInput): unknown {
  const storageNos = input.items.map(({ storageNo }) => storageNo)
  return buildCard({
    title: "입고 등록",
    color: "Accent",
    description: `원단 ${input.items.length}건이 입고 등록되었습니다. 실물 확인 부탁드립니다.`,
    facts: [
      { title: "등록자", value: input.registrant || "미지정" },
      { title: "등록일", value: input.registeredDate },
      { title: "건수", value: `${input.items.length}건` },
      { title: "R&D No.", value: storageNoSummary(storageNos) },
    ],
    lines: input.items.map(({ item, storageNo, yds }) => {
      const quantity = yds === undefined ? "" : `  ${yds} yds`
      return `${storageNo}  FL ${item.flNo}  ${item.rackNo ? `Rack ${item.rackNo}` : "Rack 미지정"}${quantity}`
    }),
    closing: "실물을 받으시면 창고 화면에서 입고 확인을 눌러 주십시오.",
  })
}

export function buildOutboundCard({ meta, lines }: OutboundCardInput): unknown {
  const facts = [
    { title: "요청자", value: meta.requester || "미지정" },
    ...(meta.division.trim() ? [{ title: "사업부", value: meta.division.trim() }] : []),
    { title: "희망 컷팅일", value: meta.wantedDate },
    { title: "건수", value: `${lines.length}건` },
  ]
  return buildCard({
    title: "출고 요청",
    color: "Warning",
    description: `원단 ${lines.length}건 출고를 요청합니다.`,
    facts,
    lines: lines.map((line) => {
      const stock = stockYds(line.item)
      const balance = stock === null ? "" : `  잔량 ${stock} yds`
      return `${line.item.storageNo}  FL ${line.item.flNo}  요청 ${line.qty.trim()} yds${balance}`
    }),
    closing: "상세 요청서는 메일로 따로 보내 드립니다.",
  })
}

export function buildOutboundConfirmCard(input: OutboundConfirmCardInput): unknown {
  return buildCard({
    title: "출고 확정",
    color: "Good",
    description: `요청하신 원단 ${input.items.length}건 출고가 완료되었습니다.`,
    facts: [
      { title: "출고일", value: input.date },
      { title: "받는 곳", value: input.to },
      ...(input.division.trim() ? [{ title: "사업부", value: input.division.trim() }] : []),
      { title: "건수", value: `${input.items.length}건` },
    ],
    lines: input.items.map(({ item, qty, balanceAfter }) => {
      const balance = balanceAfter === null ? "" : balanceAfter === 0 ? "  잔량 없음" : `  잔량 ${balanceAfter} yds`
      return `${item.storageNo}  FL ${item.flNo}  출고 ${qty} yds${balance}`
    }),
    closing: "원단을 수령하시면 확인 부탁드립니다.",
  })
}

export function buildOutboundCancelCard(input: OutboundCancelCardInput): unknown {
  return buildCard({
    title: "출고 취소",
    color: "Attention",
    description: `원단 ${input.items.length}건의 출고가 취소되었습니다.`,
    facts: [
      { title: "취소자", value: input.canceler || "미지정" },
      { title: "취소일", value: input.canceledDate },
      { title: "건수", value: `${input.items.length}건` },
    ],
    lines: input.items.map(({ item, qty, outboundDate }) =>
      `${item.storageNo}  FL ${item.flNo}  취소 ${qty} yds  원래 출고일 ${outboundDate}`),
    closing: "컷팅 전이면 작업을 멈춰 주십시오.",
  })
}
