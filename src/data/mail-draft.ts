/**
 * Outlook 메일 초안 파일(.eml)과 메일용 표 HTML.
 *
 * 기본은 `composeMail`이다. 본문과 표를 클립보드에 담고 `mailto:`로 Outlook 새 메일 창을 연다.
 * 서명이 붙은 빈 본문이 뜨고 사람이 붙여넣는다. 클립보드가 막히면 본문이 완성된 `.eml`로 떨어지는데,
 * 이때는 `X-Unsent: 1`이 붙어 보내기 전 새 메일로 열리는 대신 서명이 붙지 않는다.
 * 어느 쪽도 자동 발송이 아니다. 사람이 확인하고 보낸다.
 */
export interface MailAddress {
  name: string
  email: string
}

export const EMAIL_PATTERN = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const CELL_STYLE = "border:1px solid #bfbfbf; padding:4px 6px; font-size:9pt; font-family:'맑은 고딕',sans-serif;"
const TEXT_STYLE = "font-size:10pt; font-family:'맑은 고딕',sans-serif; margin:0;"

/** Outlook 본문과 클립보드에 같이 쓰는 표. 셀 스타일을 인라인으로 넣어야 Outlook이 서식을 지킨다. */
export function mailTableHtml(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const header = columns.map((head) => `<th style="${CELL_STYLE} background:#d6e4f0; font-weight:bold; text-align:center;">${escapeHtml(head)}</th>`).join("")
  const body = rows.map((cells) => `<tr>${cells.map((cell) => `<td style="${CELL_STYLE} vertical-align:top;">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
  return `<table style="border-collapse:collapse;"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
}

export function mailTableTsv(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  return [columns.join("\t"), ...rows.map((cells) => cells.map((cell) => cell.replace(/[\t\r\n]+/g, " ")).join("\t"))].join("\n")
}

/** 글 줄은 문단으로, `{table}` 자리는 표로 바꾼 메일 본문 HTML. */
export function mailBodyHtml(lines: readonly string[], table: string): string {
  const parts = lines.map((line) => line === "{table}"
    ? `<div style="margin:6px 0;">${table}</div>`
    : `<p style="${TEXT_STYLE}">${line ? escapeHtml(line) : "&nbsp;"}</p>`)
  return `<html><head><meta charset="utf-8"></head><body>${parts.join("")}</body></html>`
}

/** 아웃룩 본문에 붙이면 표로 들어간다. 실패하면 탭 구분 텍스트로 떨어진다(FDS/YDS 요청 표와 같은 방식). */
export async function copyMailTable(columns: readonly string[], rows: readonly (readonly string[])[]): Promise<"html" | "text"> {
  const tsv = mailTableTsv(columns, rows)
  // Blob과 ClipboardItem은 첫 await 전에, 클릭의 동기 실행 흐름에서 만든다.
  const htmlBlob = new Blob([mailTableHtml(columns, rows)], { type: "text/html" })
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

/** 첫 문장과 표를 함께 복사한다. mailto로 연 Outlook 본문 첫 줄에 붙여 넣기 위한 내용이다. */
export async function copyMailBody(lines: readonly string[], columns: readonly string[], rows: readonly (readonly string[])[]): Promise<"html" | "text"> {
  const table = mailTableHtml(columns, rows)
  const html = mailBodyHtml(lines, table)
  const plainLines = lines.map((line) => line === "{table}" ? mailTableTsv(columns, rows) : line)
  const plain = plainLines.join("\n")
  const htmlBlob = new Blob([html], { type: "text/html" })
  const textBlob = new Blob([plain], { type: "text/plain" })
  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })])
      return "html"
    }
  } catch { /* HTML 복사를 지원하지 않으면 일반 텍스트로 재시도한다. */ }
  await navigator.clipboard.writeText(plain)
  return "text"
}

const utf8Base64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

/** 한글 머리글은 RFC 2047 base64로 감싼다. */
const encodeHeader = (value: string): string => /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${utf8Base64(value)}?=`

const formatAddress = (address: MailAddress): string => {
  const name = address.name.trim().replace(/["\\]/g, "")
  return name ? `${encodeHeader(name)} <${address.email.trim()}>` : address.email.trim()
}

export function buildEml(options: { to: readonly MailAddress[]; cc?: readonly MailAddress[]; subject: string; html: string }): string {
  const headers = [
    "X-Unsent: 1",
    ...(options.to.length ? [`To: ${options.to.map(formatAddress).join(", ")}`] : []),
    ...(options.cc?.length ? [`Cc: ${options.cc.map(formatAddress).join(", ")}`] : []),
    `Subject: ${encodeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ]
  const body = utf8Base64(options.html).replace(/.{1,76}/g, "$&\r\n")
  return `${headers.join("\r\n")}\r\n\r\n${body}`
}

/** 브라우저 내려받기로 .eml을 떨군다. 사용자가 파일을 열면 Outlook 새 메일 창이 뜬다. */
export function downloadEml(fileName: string, eml: string): void {
  const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName.endsWith(".eml") ? fileName : `${fileName}.eml`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * mailto: 주소 목록은 **세미콜론으로 잇는다.** RFC 6068은 쉼표지만 Outlook은 쉼표로 이으면
 * 세 주소를 주소 하나로 읽어 받는 사람 확인이 안 된다(2026-09-23 실측). 쉼표로 되돌리지 말 것.
 * `.eml`의 `To:` 머리글은 RFC 5322를 따라 쉼표 그대로다(`buildEml`). 둘은 규칙이 다르다.
 */
const addressValue = (addresses: readonly MailAddress[]): string =>
  addresses.map((item) => item.email.trim()).filter(Boolean).join(";")

export interface ComposeDraft {
  /** 클립보드가 막혔을 때 떨구는 .eml 파일 이름 */
  fileName: string
  subject: string
  to: readonly MailAddress[]
  cc?: readonly MailAddress[]
  /** 본문 글 줄. `{table}` 자리에 표가 들어간다 */
  lines: readonly string[]
  columns: readonly string[]
  rows: readonly (readonly string[])[]
}

/** 받는 사람·참조·제목만 담아 Outlook 새 메일 창을 연다. 본문은 비어 있고 서명이 붙는다. */
export function openMailto(draft: Pick<ComposeDraft, "to" | "cc" | "subject">): void {
  const cc = addressValue(draft.cc ?? [])
  // 주소는 EMAIL_PATTERN을 통과한 값이라 인코딩하지 않는다. %40, %2C로 바꾸면 Outlook 버전에 따라 주소를 못 읽는다.
  const query = [...(cc ? [`cc=${cc}`] : []), `subject=${encodeURIComponent(draft.subject)}`]
  window.location.href = `mailto:${addressValue(draft.to)}?${query.join("&")}`
}

/**
 * 본문과 표를 클립보드에 담고 Outlook 새 메일 창을 연다. 사람이 본문 첫 줄에 붙여넣는다.
 * 클립보드가 막히면 본문이 완성된 .eml을 내려받는다(서명은 안 붙는다).
 *
 * 호출부는 클릭 핸들러에서 **첫 await 없이 바로** 불러야 한다. 클립보드 쓰기는 사용자 제스처
 * 안에서만 허용되고, 앞에 다른 await이 끼면 제스처가 끊겨 복사가 조용히 실패한다.
 */
export async function composeMail(draft: ComposeDraft): Promise<"mailto" | "eml"> {
  try {
    await copyMailBody(draft.lines, draft.columns, draft.rows)
    openMailto(draft)
    return "mailto"
  } catch {
    const html = mailBodyHtml(draft.lines, mailTableHtml(draft.columns, draft.rows))
    downloadEml(draft.fileName, buildEml({ to: draft.to, cc: draft.cc, subject: draft.subject, html }))
    return "eml"
  }
}

export const shortDate = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${Number(match[2])}/${Number(match[3])}` : value
}

/** 제목에 넣는 R&D No. 요약. 3건까지 적고 나머지는 건수로 줄인다. */
export function storageNoSummary(numbers: readonly string[]): string {
  const filled = numbers.filter(Boolean)
  const head = filled.slice(0, 3).join(", ")
  return filled.length > 3 ? `${head} 외 ${filled.length - 3}건` : head
}

export function fileDateStamp(today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${String(today.getFullYear()).slice(2)}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
}
