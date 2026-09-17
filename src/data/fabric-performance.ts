import type { RddaDataset } from "./rdda-dataset"

/**
 * RDDA 원장 기준 원단 성과(R210). 창고·DD MASTER·REQUEST·원단 상세·폐기 라운드가 모두 이 모듈 하나로 수치를 본다.
 * 수치는 RDDA FL 원장의 누적값에서 폐기 리스트 미팅분을 뺀 것이다. 수집기가 차감해서 보낸다.
 * 수집 범위는 3팀 담당 FL이다. 그 밖의 FL은 조회 결과가 없다(null).
 */

export type FabricGrade = "order" | "best" | "hit" | "maturing" | "cold" | "unshown" | "normal"

export interface FabricPerformance {
  flNo: string
  /** 원장 등록월 YYYY-MM. 모르면 빈 문자열. */
  registered: string
  /** 등록 후 경과 개월. 등록월을 모르면 null. */
  ageMonths: number | null
  /** 제안된 미팅 수(누적). */
  offers: number
  /** 픽업 수(누적). 옛 데이터셋에는 없어 null. */
  picks: number | null
  /** 오더 수(누적). 옛 데이터셋에는 없어 null. */
  orders: number | null
  /** 제안 대비 픽업률(%). 제안이 없거나 픽업 수를 모르면 null. */
  pickRate: number | null
  grade: FabricGrade
}

/** 등급 기준. 바꿀 때는 여기만 고친다. */
export const GRADE_RULES = {
  bestPicks: 3,
  hitMinOffers: 3,
  hitPickRate: 40,
  maturingMonths: 24,
  coldMinOffers: 3,
} as const

export const GRADE_META: Record<FabricGrade, { label: string; hint: string; rank: number }> = {
  order: { label: "오더", hint: "오더 1회 이상", rank: 0 },
  best: { label: "베스트", hint: `픽업 ${GRADE_RULES.bestPicks}회 이상`, rank: 1 },
  hit: { label: "고적중", hint: `제안 ${GRADE_RULES.hitMinOffers}회 이상, 픽업률 ${GRADE_RULES.hitPickRate}% 이상`, rank: 2 },
  normal: { label: "보통", hint: "제안·픽업 이력 있음", rank: 3 },
  maturing: { label: "성숙 중", hint: `등록 ${GRADE_RULES.maturingMonths}개월 이내, 판단 보류`, rank: 4 },
  cold: { label: "반응 없음", hint: `제안 ${GRADE_RULES.coldMinOffers}회 이상, 픽업 0`, rank: 5 },
  unshown: { label: "미제안", hint: `등록 ${GRADE_RULES.maturingMonths}개월 경과, 제안 0`, rank: 6 },
}

/** 폐기 후보에서 자동 제외하는 등급. */
export const KEEP_GRADES: readonly FabricGrade[] = ["order", "best"]

export const normalizeFlKey = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toUpperCase()

const monthIndex = (ym: string): number | null => {
  const matched = /^(\d{4})-(\d{2})$/.exec(ym)
  return matched ? Number(matched[1]) * 12 + Number(matched[2]) : null
}

export function gradeOf(perf: Omit<FabricPerformance, "grade">): FabricGrade {
  const { offers, picks, orders, pickRate, ageMonths } = perf
  if (orders !== null && orders > 0) return "order"
  if (picks !== null && picks >= GRADE_RULES.bestPicks) return "best"
  if (offers >= GRADE_RULES.hitMinOffers && pickRate !== null && pickRate >= GRADE_RULES.hitPickRate) return "hit"
  const young = ageMonths === null || ageMonths <= GRADE_RULES.maturingMonths
  if (young && (picks ?? 0) === 0) return "maturing"
  if (offers >= GRADE_RULES.coldMinOffers && picks === 0) return "cold"
  if (offers === 0) return "unshown"
  return "normal"
}

const cache = new WeakMap<RddaDataset, Map<string, FabricPerformance>>()

export function buildPerformanceIndex(ds: RddaDataset): Map<string, FabricPerformance> {
  const cached = cache.get(ds)
  if (cached) return cached
  const now = monthIndex(ds.meta.lastMonth)
  const index = new Map<string, FabricPerformance>()
  for (const row of ds.team) {
    const [fl, ym, m, , , p, o] = row
    const flNo = ds.dict.fl[fl]
    if (!flNo) continue
    const reg = monthIndex(ym)
    const picks = typeof p === "number" ? p : null
    const base = {
      flNo,
      registered: ym,
      ageMonths: now !== null && reg !== null ? Math.max(0, now - reg) : null,
      offers: m,
      picks,
      orders: typeof o === "number" ? o : null,
      pickRate: picks !== null && m > 0 ? Math.round(Math.min(picks, m) / m * 1000) / 10 : null,
    }
    index.set(normalizeFlKey(flNo), { ...base, grade: gradeOf(base) })
  }
  cache.set(ds, index)
  return index
}

export function lookupPerformance(index: Map<string, FabricPerformance> | null, flNo: unknown): FabricPerformance | null {
  if (!index) return null
  const key = normalizeFlKey(flNo)
  return key ? index.get(key) ?? null : null
}
