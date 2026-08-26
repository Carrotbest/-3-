/* format.ts — 표기 정규화
   원본 값은 절대 바꾸지 않는다. 표시용 변환만 한다. */

const PAD = (n: number) => String(n).padStart(2, "0")

export function toDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v as unknown as number) ? null : v
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return isNaN(d as unknown as number) ? null : d
  }
  const raw = String(v).trim()
  const direct = new Date(raw)
  if (!isNaN(direct as unknown as number)) return direct
  const normalized = raw.replace(/[.\s]+/g, "-").replace(/-+$/, "")
  const d = new Date(normalized)
  return isNaN(d as unknown as number) ? null : d
}

export const fmtDate = (v: unknown): string => {
  const d = toDate(v)
  return d ? `${PAD(d.getMonth() + 1)}.${PAD(d.getDate())}` : "—"
}

export const fmtDateFull = (v: unknown): string => {
  const d = toDate(v)
  return d
    ? `${d.getFullYear()}.${PAD(d.getMonth() + 1)}.${PAD(d.getDate())}`
    : "—"
}

export const fmtTime = (v: unknown): string => {
  const d = toDate(v) || (v instanceof Date ? v : null)
  return d ? `${PAD(d.getHours())}:${PAD(d.getMinutes())}` : "—"
}

/** 오늘 기준 남은 일수. 음수면 지연. */
export function daysLeft(v: unknown, from = new Date()): number | null {
  const d = toDate(v)
  if (!d) return null
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export const fmtNum = (n: unknown, unit = ""): string =>
  n === null || n === undefined || n === "" || isNaN(n as number)
    ? "—"
    : Number(n).toLocaleString("ko-KR") + unit

export const fmtPct = (n: unknown, digits = 0): string =>
  n === null || n === undefined || isNaN(n as number)
    ? "—"
    : `${Number(n).toFixed(digits)}%`

export interface NormalizedSeason {
  value: string
  raw: string
  normalized: boolean
}

/**
 * 시즌 표기 정규화: SP27 / SS'27 / ss 27 -> SS'27
 * 원본이 규칙에서 벗어나면 normalized:true 로 알린다.
 */
export function normalizeSeason(raw: unknown): NormalizedSeason {
  const s = String(raw ?? "").trim()
  if (!s) return { value: "", raw: s, normalized: false }
  const m = s
    .toUpperCase()
    .replace(/[\s'"]/g, "")
    .match(/^(SS|SP|FW|FA|AW)(\d{2,4})$/)
  if (!m) return { value: s, raw: s, normalized: false }
  const half = ({ SP: "SS", FA: "FW", AW: "FW" } as Record<string, string>)[m[1]] || m[1]
  const yy = m[2].slice(-2)
  const value = `${half}'${yy}`
  return { value, raw: s, normalized: value !== s }
}

/** Style No. 패턴 확인 — 값은 바꾸지 않고 적합 여부만 돌려준다. */
export function checkStyleNo(
  raw: unknown,
  pattern = /^[A-Z]{2}\d{2}-\d{3,4}$/,
): { value: string; ok: boolean } {
  const s = String(raw ?? "").trim()
  return { value: s, ok: pattern.test(s) }
}

export const initials = (name: unknown): string =>
  String(name ?? "").trim().slice(0, 2) || "—"

export interface TsRequester {
  dept: string
  name: string
}

const TS_REQUESTER_TITLE = "차장|부장|과장|대리|이사|주임|사원|전무|상무|팀장|실장|본부장|수석|책임|선임"
const TS_REQUESTER_RE = new RegExp(
  `^(.*?)\\s*([가-힣]{2,4}\\s?(?:${TS_REQUESTER_TITLE})(?:\\s*\\(.*\\))?)$`,
)

/**
 * TS 요청자 값을 의뢰 부서와 이름으로 분리한다.
 * - fromDept가 채워진 레코드(신규·수정분)는 그 값을 그대로 쓴다.
 * - 없으면 기존 free-text `from`에서 끝의 "이름+직급"을 이름으로, 그 앞을 부서로 추정한다.
 *   추정이 안 되면 전체를 이름으로 두고 부서는 빈 값으로 둔다(원본 훼손 방지).
 */
export function tsRequester(record: { from?: string; fromDept?: string }): TsRequester {
  const dept = (record.fromDept ?? "").trim()
  const name = (record.from ?? "").trim()
  if (dept) return { dept, name }
  const m = name.match(TS_REQUESTER_RE)
  if (m && m[1].trim()) return { dept: m[1].trim(), name: m[2].trim() }
  return { dept: "", name }
}
