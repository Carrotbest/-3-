import type { DevRecord, RequestOption, RequestStyle } from "./schema"

/** Style No.와 Garment No. 비교용. 공백은 없애고 대문자로 맞춘다. */
export const normalizeStyleKey = (value: string): string =>
  value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")

const norm = (value: unknown): string => String(value ?? "").trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ")

/** Yarn Detail 같은 자유 서술을 비교할 토큰으로 쪼갠다. 한 글자는 버린다. */
function tokens(value: unknown): Set<string> {
  return new Set(String(value ?? "").toLocaleUpperCase("en-US").split(/[^A-Z0-9']+/).filter((token) => token.length >= 2))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  a.forEach((token) => { if (b.has(token)) hit += 1 })
  return hit / (a.size + b.size - hit)
}

/** 숫자만 떼어 비교한다. HMP26-0413과 HMP260413은 같은 번호다. */
function sameDigits(left: string, right: string): boolean {
  const a = left.replace(/\D/g, "")
  const b = right.replace(/\D/g, "")
  return a.length >= 6 && a === b
}

export interface StyleMatch {
  style: RequestStyle
  /** 0~100. 큰 값이 먼저 온다. */
  score: number
  /** 점수 근거. 화면 보조 문구로 그대로 쓴다. */
  reasons: string[]
  total: number
  unlinked: number
  /** Style No.와 Garment No.가 완전히 같은가. 자동 연결 판정은 이것만 본다. */
  exact: boolean
}

/** 이 점수 아래는 추천으로 올리지 않는다. 약한 우연 일치 스타일을 도우미로 못 믿는다. */
export const MATCH_MIN_SCORE = 20
/** 검색어 없이 미리 고를 수 있을 만큼 확실한 후보로 본다. */
export const MATCH_STRONG_SCORE = 40

/** 요청 스타일 하나가 DD 행 묶음과 얼마나 맞는지 점수를 낸다. */
export function scoreStyleForRows(
  style: RequestStyle,
  styleNo: string,
  rows: readonly DevRecord[],
  blockedLineIds: ReadonlySet<string>,
): StyleMatch {
  const reasons: string[] = []
  let score = 0
  const head = rows[0]
  const styleKey = normalizeStyleKey(styleNo || head?.styleNo || "")
  const garmentKey = normalizeStyleKey(style.garmentNo)
  const exact = Boolean(styleKey) && styleKey === garmentKey
  // 번호 신호가 하나라도 맞았는지. 사양만 닮은 건은 확실한 후보로 올리지 않는다(아래 상한).
  let numberHit = true
  if (exact) { score += 50; reasons.push("Style No. 일치") }
  else if (styleKey && garmentKey && sameDigits(styleKey, garmentKey)) { score += 34; reasons.push("번호 일치(표기 다름)") }
  else if (styleKey.length >= 5 && garmentKey.length >= 5 && (styleKey.includes(garmentKey) || garmentKey.includes(styleKey))) { score += 26; reasons.push("Style No. 부분 일치") }
  else numberHit = false

  if (norm(head?.buyer) && norm(head?.buyer) === norm(style.brand)) { score += 12; reasons.push("Buyer 일치") }
  if (norm(head?.owner) && norm(head?.owner) === norm(style.developer)) { score += 10; reasons.push("개발 담당 일치") }
  if (norm(head?.planner) && norm(head?.planner) === norm(style.requester)) { score += 6; reasons.push("의뢰 담당 일치") }

  let bestYarn = 0
  let colorHit = false
  let consHit = false
  let weightHit = false
  rows.forEach((row) => style.options.forEach((option) => {
    bestYarn = Math.max(bestYarn, jaccard(tokens(row.tech?.yarnDetail), tokens(option.yarnDetail)))
    if (norm(row.color) && norm(row.color) === norm(option.color)) colorHit = true
    if (norm(row.construction) && norm(row.construction) === norm(option.construction)) consHit = true
    if (row.weight !== "" && option.weight !== "" && option.weight != null
      && Math.abs(Number(row.weight) - Number(option.weight)) <= 10) weightHit = true
  }))
  if (bestYarn >= 0.3) { score += Math.round(bestYarn * 24); reasons.push(`Yarn Detail ${Math.round(bestYarn * 100)}%`) }
  if (consHit) { score += 8; reasons.push("조직 일치") }
  if (colorHit) { score += 8; reasons.push("Color 일치") }
  if (weightHit) { score += 5; reasons.push("중량 근접") }

  const unlinked = style.options.filter((option) => !option.lineId || !blockedLineIds.has(option.lineId)).length
  if (rows.length > 0 && unlinked === rows.length) { score += 6; reasons.push("옵션 수 일치") }
  if (!unlinked) { score -= 25; reasons.push("남은 옵션 없음") }

  // 같은 원사·조직·색이 여러 스타일에 되풀이되므로, 번호가 안 맞는 건은 자동 선택 문턱 아래로 묶어 둔다.
  const capped = Math.max(0, Math.min(100, score))
  const limited = numberHit ? capped : Math.min(capped, MATCH_STRONG_SCORE - 1)
  return { style, score: limited, reasons, total: style.options.length, unlinked, exact }
}

/** 점수 하한을 넘는 후보만 점수순으로 준다. 도우미 추천 탭과 연결 팝업이 같이 쓴다. */
export function suggestStylesForRows(
  requests: readonly RequestStyle[],
  styleNo: string,
  rows: readonly DevRecord[],
  blockedLineIds: ReadonlySet<string>,
  limit = 5,
): StyleMatch[] {
  return requests
    .map((style) => scoreStyleForRows(style, styleNo, rows, blockedLineIds))
    .filter((match) => match.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact) || Date.parse(b.style.updatedAt) - Date.parse(a.style.updatedAt))
    .slice(0, limit)
}

export interface RowMatch {
  record: DevRecord
  score: number
  reasons: string[]
  /** 이 행이 이미 다른 요청 옵션에 연결되어 있는가. 고르면 그 연결은 새 옵션으로 옮겨간다. */
  linkedElsewhere: boolean
}

/**
 * DD 행 하나가 요청 옵션 하나와 얼마나 잘 맞는지. scoreStyleForRows와 반대 방향이고 배점 규칙은 같다.
 * 요청 화면 Link 칸에서 DD 후보를 고를 때 쓴다.
 */
export function scoreRowForOption(record: DevRecord, style: RequestStyle, option: RequestOption): RowMatch {
  const reasons: string[] = []
  let score = 0
  const styleKey = normalizeStyleKey(record.styleNo)
  const garmentKey = normalizeStyleKey(style.garmentNo)
  let numberHit = true
  if (styleKey && styleKey === garmentKey) { score += 50; reasons.push("Style No. 일치") }
  else if (styleKey && garmentKey && sameDigits(styleKey, garmentKey)) { score += 34; reasons.push("번호 일치(표기 다름)") }
  else if (styleKey.length >= 5 && garmentKey.length >= 5 && (styleKey.includes(garmentKey) || garmentKey.includes(styleKey))) { score += 26; reasons.push("Style No. 부분 일치") }
  else numberHit = false

  if (norm(record.buyer) && norm(record.buyer) === norm(style.brand)) { score += 12; reasons.push("Buyer 일치") }
  if (norm(record.owner) && norm(record.owner) === norm(style.developer)) { score += 10; reasons.push("개발 담당 일치") }
  if (norm(record.planner) && norm(record.planner) === norm(style.requester)) { score += 6; reasons.push("의뢰 담당 일치") }

  const yarn = jaccard(tokens(record.tech?.yarnDetail), tokens(option.yarnDetail))
  if (yarn >= 0.3) { score += Math.round(yarn * 24); reasons.push(`Yarn Detail ${Math.round(yarn * 100)}%`) }
  if (norm(record.construction) && norm(record.construction) === norm(option.construction)) { score += 8; reasons.push("조직 일치") }
  if (norm(record.color) && norm(record.color) === norm(option.color)) { score += 8; reasons.push("Color 일치") }
  if (record.weight !== "" && option.weight !== "" && option.weight != null
    && Math.abs(Number(record.weight) - Number(option.weight)) <= 10) { score += 5; reasons.push("중량 근접") }
  if (Number(record.opt) === option.no) { score += 4; reasons.push("옵션 번호 일치") }

  const status = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  if (status === "DROP" || status === "REJECT") { score -= 15; reasons.push(status) }
  const linkedElsewhere = Boolean(record.tech?.requestLink && record.tech.requestLink.lineId !== option.lineId)
  if (linkedElsewhere) { score -= 25; reasons.push("다른 요청에 연결됨") }

  // 번호가 하나도 안 맞는 건은 자동 선택 문턱 아래로 묶는다. 같은 사양은 여러 스타일에 되풀이된다.
  const capped = Math.max(0, Math.min(100, score))
  return { record, score: numberHit ? capped : Math.min(capped, MATCH_STRONG_SCORE - 1), reasons, linkedElsewhere }
}
