import type { ComposeDraft, MailAddress } from "./mail-draft"
import { buildEml, composeMail, downloadEml, fileDateStamp, mailBodyHtml, mailTableHtml } from "./mail-draft"
import type { AnalysisRequest } from "./schema"

const requestColumns = ["AN No.", "Requested date", "Request type", "Requester", "Gender", "Brand", "Construction", "Weight", "Contents", "Source code", "Request item"] as const
const finishColumns = ["AN No.", "Finished date", "Request type", "In charge", "Brand", "Construction", "Contents", "Source code", "Analysis result", "Comment"] as const
const value = (input: string | number): string => input === "" ? "" : String(input)
const suffix = (items: readonly AnalysisRequest[]): string => items.length === 1 ? items[0].anNo : `${items[0]?.anNo ?? ""} 외 ${items.length - 1}건`

type AnalysisMailDraft = ComposeDraft

const requestDraft = (items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): AnalysisMailDraft => ({
  fileName: `원단분석요청_${fileDateStamp()}.eml`,
  subject: `[Fabric Analysis Request] 분석 요청 ${suffix(items)}`,
  lines: [items.length === 1 ? `Analysis request number: ${items[0].anNo} 로 분석을 요청합니다.` : `아래 ${items.length}건의 원단 분석을 요청합니다.`, "", "{table}"],
  columns: requestColumns,
  rows: items.map((item) => [item.anNo, item.requestedAt, item.requestType, item.requester, item.gender, item.brand, item.construction, value(item.weight), item.contents, item.sourceCode, item.description]),
  to: recipients,
})

const finishedDraft = (items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): AnalysisMailDraft => ({
  fileName: `원단분석완료_${fileDateStamp()}.eml`,
  subject: `[Fabric Analysis Request] 분석 완료 ${suffix(items)}`,
  lines: [items.length === 1 ? `Analysis request number: ${items[0].anNo} 분석이 완료되었습니다.` : `아래 ${items.length}건의 분석이 완료되었습니다.`, "", "{table}"],
  columns: finishColumns,
  rows: items.map((item) => [item.anNo, item.finishedAt, item.requestType, item.inCharge, item.brand, item.constructionRnd || item.construction, item.contents, item.sourceCode, item.yarnDescription, item.commentRnd]),
  to: [...new Map(items.filter((item) => item.requesterEmail.trim()).map((item) => [item.requesterEmail.trim().toLowerCase(), { name: item.requester, email: item.requesterEmail.trim() }])).values()],
  cc: recipients,
})

const downloadDraft = (draft: AnalysisMailDraft): void => {
  const html = mailBodyHtml(draft.lines, mailTableHtml(draft.columns, draft.rows))
  downloadEml(draft.fileName, buildEml({ to: draft.to, cc: draft.cc, subject: draft.subject, html }))
}

export function openAnalysisRequestMail(items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): Promise<"mailto" | "eml"> {
  return composeMail(requestDraft(items, recipients))
}

export function openAnalysisFinishedMail(items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): Promise<"mailto" | "eml"> {
  return composeMail(finishedDraft(items, recipients))
}

export function downloadAnalysisRequestEml(items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): void {
  if (items.length) downloadDraft(requestDraft(items, recipients))
}

export function downloadAnalysisFinishedEml(items: readonly AnalysisRequest[], recipients: readonly MailAddress[]): void {
  if (items.length) downloadDraft(finishedDraft(items, recipients))
}
