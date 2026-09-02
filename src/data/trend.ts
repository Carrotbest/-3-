// TREND REPORT 데이터 로더.
// tools/trend의 파이썬 수집기가 public/data/trend/*.json을 덮어쓰고, 이 화면은 그 파일만 읽는다.
// 서버도 DB도 없다. 수집은 GitHub Actions가 매일 돌린다(.github/workflows/trend.yml).

export type TrendCategory = "MATERIAL" | "YARN" | "FABRIC" | "CHEMICAL" | "RETAIL" | "ETC"

export interface TrendArticle {
  id: string
  d: string       // 발행일 YYYY-MM-DD
  t: string       // 표시 제목. 한국어 번역이 있으면 그것, 없으면 원문
  o: string       // 원문 제목
  u: string       // 원문 링크
  s: string       // RSS 요약 원문. 가공하지 않는다
  x: string       // RSS가 제공한 본문 또는 요약 인용
  i: string       // RSS 대표 이미지 URL
  c: TrendCategory
  g: string[]     // 태그
  m: string       // 대표 매체
  ms: string[]    // 같은 기사를 다룬 매체 전체
  r: string       // 국내 / 해외
  v: number       // 관련도 점수
  h: number       // HIT. 같은 기사를 다룬 매체 수
  e: string[]     // 관련 바이어 키
  w: "material" | "retail" | "none"
}

export interface TrendFacet { key: string; n: number }

export interface TrendEntityFacet extends TrendFacet { label: string }

export interface TrendFeed {
  generated_at: string
  window_days: number
  total: number
  translated: number
  filtered_out: number
  facets: {
    categories: TrendFacet[]
    sources: TrendFacet[]
    tags: TrendFacet[]
    entities: TrendEntityFacet[]
  }
  daily: Array<{ date: string; total: number; by: Record<string, number> }>
  momentum: Array<{ tag: string; label_en?: string; recent: number; prior: number; delta: number; weeks: number[] }>
  /** 직전 기간에 없다가 최근 28일에 처음 나온 태그. publish.py의 _fresh가 만든다.
   *  보관 이력이 짧은 초기에는 과다 검출된다. 비교할 과거분이 아직 얇기 때문이다. */
  fresh?: Array<{ tag: string; label_en?: string; n: number; first: string }>
  intake?: {
    source_total: number
    days: Record<string, { sources: number; scanned: number; kept: number; material: number }>
  }
  articles: TrendArticle[]
}

export interface KpiPoint { period: string; value: number; end?: string }

export interface KpiCard {
  metric: string
  label: string
  unit: string
  freq: string
  group: "buyer" | "gov"
  side: "buyer" | ""
  entity: string
  kind: "level" | "share"
  note: string
  source_name: string
  source_url: string
  points: KpiPoint[]
  value: number | null
  period: string | null
  period_end: string | null
  prev: number | null
  yoy: number | null
  stale: boolean
}

export interface BuyerNewsItem { d: string; t: string; o: string; u: string; m: string }

export interface TrendKpi {
  generated_at: string
  cards: KpiCard[]
  entity_keys: Record<string, string>      // 바이어명에서 키를 찾는다
  entity_sides: Record<string, "buyer">
  entity_codes: Record<string, string>
  news: Record<string, BuyerNewsItem[]>    // 바이어 키별 최근 기사
}

export interface TrendSourceStatus {
  name: string
  region: string
  via: string
  last_ok: string | null
  fail_count: number
  last_error: string | null
  resting: boolean
}

export interface TrendStatus {
  generated_at: string
  sources: TrendSourceStatus[]
  healthy: number
  source_total: number
  archive_total: number
  archive_relevant: number
  runs: Array<Record<string, unknown>>
}

export const CATEGORY_LABEL: Record<TrendCategory, string> = {
  MATERIAL: "원료 · 섬유",
  YARN: "원사 · 방적",
  FABRIC: "원단 · 편직",
  CHEMICAL: "염색 · 가공",
  RETAIL: "리테일 · 브랜드",
  ETC: "기타",
}

export const CATEGORY_ORDER: TrendCategory[] = ["MATERIAL", "YARN", "FABRIC", "CHEMICAL", "RETAIL", "ETC"]

// 분류별 색. --chart-* 토큰을 그대로 쓴다.
export const CATEGORY_COLOR: Record<TrendCategory, string> = {
  MATERIAL: "var(--chart-1)",
  YARN: "var(--chart-2)",
  FABRIC: "var(--chart-3)",
  CHEMICAL: "var(--chart-4)",
  RETAIL: "var(--chart-5)",
  ETC: "var(--muted-foreground)",
}

async function readJson<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/trend/${name}`, { cache: "no-cache" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    // 수집이 한 번도 돌지 않았거나 오프라인이면 화면은 안내 문구만 띄운다.
    return null
  }
}

export const loadTrendFeed = () => readJson<TrendFeed>("feed.json")
export const loadTrendKpi = () => readJson<TrendKpi>("kpi.json")
export const loadTrendStatus = () => readJson<TrendStatus>("status.json")

const STAR_KEY = "trend.starred"

export function readStars(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STAR_KEY)
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set<string>()
  }
}

export function writeStars(ids: Set<string>) {
  try {
    window.localStorage.setItem(STAR_KEY, JSON.stringify([...ids]))
  } catch {
    // 사파리 프라이빗 모드 등에서 막힌다. 별표는 개인 표시라 실패해도 화면은 그대로 쓴다.
  }
}

/** 회계분기 라벨은 달력과 어긋난다. 실제 종료일을 함께 보여 준다. */
export function periodLabel(card: Pick<KpiCard, "period" | "period_end">): string {
  if (!card.period) return "미수집"
  if (!card.period_end) return card.period
  return `${card.period} · ~${card.period_end}`
}

export function fmtValue(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return "—"
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`
}

export const SORTS = [
  { value: "recent", label: "최신순" },
  { value: "hit", label: "HIT순" },
  { value: "score", label: "관련도순" },
] as const

export type SortKey = (typeof SORTS)[number]["value"]

export function sortArticles(rows: TrendArticle[], key: SortKey): TrendArticle[] {
  const copy = [...rows]
  if (key === "hit") return copy.sort((a, b) => b.h - a.h || b.d.localeCompare(a.d))
  if (key === "score") return copy.sort((a, b) => b.v - a.v || b.d.localeCompare(a.d))
  return copy.sort((a, b) => b.d.localeCompare(a.d))
}

export function fmtDelta(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "—"
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`
}
