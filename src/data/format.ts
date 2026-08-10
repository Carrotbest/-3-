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
