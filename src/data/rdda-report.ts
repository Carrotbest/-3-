export interface RddaReportV2 {
  meta: {
    generatedAt: string
    periodFrom: string
    periodTo: string
    meetings: number
    offers: number
    picks: number
    ledgerTotal: number
    teamTotal: number
  }
  summary: {
    offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
  }
  buyers: RddaBuyerRow[]
  brands: RddaSegmentRow[]
  genders: RddaSegmentRow[]
  fibers: RddaFiberRow[]
  weights: { band: string; offers: number; pickRate: number }[]
  months: { month: string; offers: number; pickRate: number }[]
  seasons: RddaSegmentRow[]
  ledger: RddaLedgerRow[]
  origins: { name: string; count: number; hitRate: number; teamCount: number; note: string }[]
  suppliers: RddaSupplierRow[]
  gaps: RddaGapRow[]
  trend: { rising: RddaTrendRow[]; falling: RddaTrendRow[] }
  price: { band: string; count: number; pickRate: number; orderRate: number; note: string }[]
  maturity: { band: string; count: number; hitRate: number }[]
  teamYears: { year: string; registered: number; neverShownRate: number }[]
  recommend: Record<string, RddaRecommend>
}

export interface RddaWeeklySnapshot {
  weekId: string
  capturedAt: string
  periodFrom: string
  periodTo: string
  kpi: {
    offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
    ledgerHitRate: number
    teamHitRate: number
    teamTotal: number
  }
  buyers: {
    name: string; offers: number; picks: number
    teamOffers: number; teamPickRate: number
  }[]
}

export interface RddaMonthlyReport {
  monthId: string
  generatedAt: string
  updatedAt: string
  status: "draft" | "confirmed"
  confirmedAt?: string
  kpi: {
    meetings: number; offers: number; picks: number; pickRate: number
    teamOffers: number; teamShare: number; teamPicks: number; teamPickRate: number
  }
  prevKpi?: RddaMonthlyReport["kpi"]
  sections: { id: string; title: string; body: string }[]
}

export function toWeekId(date: Date): string {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = thursday.getUTCDay() || 7
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day)
  const year = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${year}-W${String(week).padStart(2, "0")}`
}

export function buildSnapshot(report: RddaReportV2): RddaWeeklySnapshot {
  const capturedAt = new Date().toISOString()
  const companyLedger = report.ledger.find((row) => !row.lead) ?? report.ledger[0]
  const teamLedger = report.ledger.find((row) => row.lead) ?? report.ledger[1]
  return {
    weekId: toWeekId(new Date(capturedAt)),
    capturedAt,
    periodFrom: report.meta.periodFrom,
    periodTo: report.meta.periodTo,
    kpi: {
      ...report.summary,
      ledgerHitRate: companyLedger?.hitRate ?? 0,
      teamHitRate: teamLedger?.hitRate ?? 0,
      teamTotal: report.meta.teamTotal,
    },
    buyers: [...report.buyers]
      .sort((a, b) => b.offers - a.offers)
      .slice(0, 10)
      .map((buyer) => ({
        name: buyer.name,
        offers: buyer.offers,
        picks: Math.round(buyer.offers * buyer.pickRate / 100),
        teamOffers: buyer.teamOffers,
        teamPickRate: buyer.teamPickRate,
      })),
  }
}

export function pruneSnapshots(list: RddaWeeklySnapshot[], max = 104): RddaWeeklySnapshot[] {
  return [...list].sort((a, b) => b.weekId.localeCompare(a.weekId)).slice(0, max)
}

export interface RddaBuyerRow {
  name: string; meetings: number; offers: number; pickRate: number
  teamOffers: number; teamShare: number; teamPickRate: number
  limited?: boolean
}

export interface RddaSegmentRow {
  name: string; offers: number; pickRate: number
  teamOffers: number; teamShare: number
  teamPickRate: number | null
  gap: number | null
}

export interface RddaFiberRow {
  name: string; offers: number; pickRate: number
  teamOffers: number; teamShare: number; gap: number | null
}

export interface RddaLedgerRow {
  scope: string
  count: number; shownRate: number; avgShown: number
  hitRate: number; shownHitRate: number; orderRate: number
  lead?: boolean
}

export interface RddaSupplierRow {
  name: string; count: number; hitRate: number
  avgPrice: number; teamCount: number; topConstructions: string
}

export interface RddaGapRow {
  construction: string; allCount: number; allHitRate: number
  teamCount: number; teamHitRate: number; gap: number
}

export interface RddaTrendRow {
  construction: string; before: number; after: number; delta: number
}

export interface RddaRecommend {
  buyer: string; candidates: number
  teamPickRate: number; allPickRate: number
  top: { name: string; pickRate: number; picks: number; offers: number }
  avoid: { name: string; pickRate: number; picks: number; offers: number }
  preferences: { name: string; offers: number; picks: number; pickRate: number }[]
  mix: { name: string; count: number }[]
  items: { flNo: string; construction: string }[]
}

const segments = (prefix: string): RddaSegmentRow[] => [
  { name: `${prefix} A`, offers: 2380, pickRate: 17.8, teamOffers: 412, teamShare: 17.3, teamPickRate: 24.1, gap: 6.3 },
  { name: `${prefix} B`, offers: 1940, pickRate: 15.2, teamOffers: 351, teamShare: 18.1, teamPickRate: 18.8, gap: 3.6 },
  { name: `${prefix} C`, offers: 1510, pickRate: 13.6, teamOffers: 96, teamShare: 6.4, teamPickRate: 9.4, gap: -4.2 },
  { name: `${prefix} D`, offers: 980, pickRate: 18.1, teamOffers: 14, teamShare: 1.4, teamPickRate: null, gap: null },
]

export function sampleRddaReport(): RddaReportV2 {
  return {
    meta: { generatedAt: "2026-09-16", periodFrom: "2025-10", periodTo: "2026-09", meetings: 711, offers: 10988, picks: 1734, ledgerTotal: 85415, teamTotal: 5538 },
    summary: { offers: 10988, picks: 1734, pickRate: 15.8, teamOffers: 1864, teamShare: 17, teamPicks: 371, teamPickRate: 19.9 },
    buyers: [
      { name: "Buyer A", meetings: 186, offers: 2850, pickRate: 16.4, teamOffers: 520, teamShare: 18.2, teamPickRate: 23.1 },
      { name: "Buyer B", meetings: 154, offers: 2410, pickRate: 14.9, teamOffers: 401, teamShare: 16.6, teamPickRate: 17.2 },
      { name: "Buyer C", meetings: 132, offers: 1980, pickRate: 18.2, teamOffers: 278, teamShare: 14, teamPickRate: 13.7 },
      { name: "Buyer D", meetings: 91, offers: 1260, pickRate: 12.8, teamOffers: 18, teamShare: 1.4, teamPickRate: 11.1, limited: true },
      { name: "Buyer E", meetings: 76, offers: 1040, pickRate: 15.1, teamOffers: 127, teamShare: 12.2, teamPickRate: 21.3 },
    ],
    brands: segments("Brand"),
    genders: [
      { name: "Women", offers: 4760, pickRate: 17.2, teamOffers: 801, teamShare: 16.8, teamPickRate: 21.1, gap: 3.9 },
      { name: "Men", offers: 3520, pickRate: 14.3, teamOffers: 642, teamShare: 18.2, teamPickRate: 18.8, gap: 4.5 },
      { name: "Kids", offers: 1690, pickRate: 13.5, teamOffers: 286, teamShare: 16.9, teamPickRate: 12.9, gap: -0.6 },
      { name: "Unisex", offers: 1018, pickRate: 18.1, teamOffers: 135, teamShare: 13.3, teamPickRate: 24.4, gap: 6.3 },
    ],
    fibers: [
      { name: "Cotton/Spandex", offers: 2910, pickRate: 18.4, teamOffers: 452, teamShare: 15.5, gap: 8.1 },
      { name: "Polyester/Spandex", offers: 2460, pickRate: 14.8, teamOffers: 510, teamShare: 20.7, gap: 3.6 },
      { name: "Cotton", offers: 1840, pickRate: 15.2, teamOffers: 321, teamShare: 17.4, gap: 1.8 },
      { name: "Rayon Blend", offers: 1120, pickRate: 13.7, teamOffers: 48, teamShare: 4.3, gap: null },
      { name: "Nylon/Spandex", offers: 870, pickRate: 17.1, teamOffers: 198, teamShare: 22.8, gap: 9.2 },
    ],
    weights: [
      { band: "Under 140", offers: 1410, pickRate: 12.4 }, { band: "140–179", offers: 2980, pickRate: 16.8 },
      { band: "180–219", offers: 3270, pickRate: 19.1 }, { band: "220–259", offers: 2010, pickRate: 14.5 },
      { band: "260+", offers: 1318, pickRate: 11.9 },
    ],
    months: [
      { month: "2026-04", offers: 864, pickRate: 14.2 }, { month: "2026-05", offers: 921, pickRate: 16.7 },
      { month: "2026-06", offers: 890, pickRate: 15.8 }, { month: "2026-07", offers: 1012, pickRate: 18.3 },
      { month: "2026-08", offers: 948, pickRate: 17.1 }, { month: "2026-09", offers: 905, pickRate: 19.2 },
    ],
    seasons: segments("Season"),
    ledger: [
      { scope: "전사 전체", count: 85415, shownRate: 42.8, avgShown: 3.4, hitRate: 14.7, shownHitRate: 34.3, orderRate: 5.8 },
      { scope: "우리 팀", count: 5538, shownRate: 51.2, avgShown: 4.1, hitRate: 19.9, shownHitRate: 38.9, orderRate: 7.3, lead: true },
      { scope: "타팀 소싱", count: 79877, shownRate: 42.2, avgShown: 3.3, hitRate: 14.3, shownHitRate: 33.9, orderRate: 5.7 },
    ],
    origins: [
      { name: "Korea", count: 28140, hitRate: 18.7, teamCount: 2640, note: "핵심 소싱" },
      { name: "China", count: 31920, hitRate: 13.4, teamCount: 1680, note: "규모 우위" },
      { name: "Vietnam", count: 10980, hitRate: 14.9, teamCount: 712, note: "안정적" },
      { name: "Other", count: 14375, hitRate: 10.8, teamCount: 506, note: "선별 운영" },
    ],
    suppliers: [
      { name: "Vendor A", count: 940, hitRate: 22.1, avgPrice: 0, teamCount: 188, topConstructions: "Single Jersey, Interlock" },
      { name: "Vendor B", count: 810, hitRate: 18.4, avgPrice: 0, teamCount: 242, topConstructions: "French Terry, Rib" },
      { name: "Vendor C", count: 690, hitRate: 15.7, avgPrice: 0, teamCount: 104, topConstructions: "Jacquard, Mesh" },
      { name: "Vendor D", count: 540, hitRate: 11.9, avgPrice: 0, teamCount: 88, topConstructions: "Pique, Fleece" },
      { name: "Vendor E", count: 430, hitRate: 20.2, avgPrice: 0, teamCount: 61, topConstructions: "Tricot, Jersey" },
    ],
    gaps: [
      { construction: "Single Jersey", allCount: 1820, allHitRate: 16.1, teamCount: 242, teamHitRate: 35.2, gap: 19.1 },
      { construction: "Interlock", allCount: 1160, allHitRate: 15.3, teamCount: 210, teamHitRate: 25.4, gap: 10.1 },
      { construction: "French Terry", allCount: 980, allHitRate: 14.8, teamCount: 188, teamHitRate: 18.6, gap: 3.8 },
      { construction: "Rib", allCount: 870, allHitRate: 18.2, teamCount: 144, teamHitRate: 16.3, gap: -1.9 },
      { construction: "Jacquard", allCount: 520, allHitRate: 16.9, teamCount: 73, teamHitRate: 11.2, gap: -5.7 },
    ],
    trend: {
      rising: [{ construction: "Mesh", before: 82, after: 145, delta: 63 }, { construction: "Interlock", before: 118, after: 169, delta: 51 }, { construction: "Pique", before: 74, after: 112, delta: 38 }, { construction: "Tricot", before: 56, after: 81, delta: 25 }],
      falling: [{ construction: "Fleece", before: 139, after: 91, delta: -48 }, { construction: "Rib", before: 157, after: 122, delta: -35 }, { construction: "French Terry", before: 126, after: 103, delta: -23 }, { construction: "Jersey", before: 208, after: 194, delta: -14 }],
    },
    price: [
      { band: "Band A", count: 1160, pickRate: 12.8, orderRate: 4.2, note: "가격 경쟁" },
      { band: "Band B", count: 1840, pickRate: 17.6, orderRate: 6.1, note: "주력" },
      { band: "Band C", count: 1320, pickRate: 20.4, orderRate: 8.3, note: "성과 우수" },
      { band: "Band D", count: 680, pickRate: 14.1, orderRate: 5.2, note: "선별 제안" },
    ],
    maturity: [{ band: "0–1 year", count: 1720, hitRate: 12.1 }, { band: "2–3 years", count: 2180, hitRate: 19.4 }, { band: "4–5 years", count: 980, hitRate: 17.8 }, { band: "6+ years", count: 658, hitRate: 13.3 }],
    teamYears: [{ year: "2022", registered: 720, neverShownRate: 41.2 }, { year: "2023", registered: 910, neverShownRate: 35.8 }, { year: "2024", registered: 1120, neverShownRate: 29.6 }, { year: "2025", registered: 1340, neverShownRate: 24.1 }, { year: "2026", registered: 1448, neverShownRate: 19.3 }],
    recommend: {
      "Buyer A": { buyer: "Buyer A", candidates: 42, teamPickRate: 23.1, allPickRate: 16.4, top: { name: "Single Jersey", pickRate: 31.4, picks: 27, offers: 86 }, avoid: { name: "Fleece", pickRate: 5.6, picks: 2, offers: 36 }, preferences: [{ name: "Single Jersey", offers: 86, picks: 27, pickRate: 31.4 }, { name: "Interlock", offers: 61, picks: 17, pickRate: 27.9 }, { name: "Mesh", offers: 48, picks: 11, pickRate: 22.9 }, { name: "Rib", offers: 57, picks: 9, pickRate: 15.8 }], mix: [{ name: "Cotton/Spandex", count: 18 }, { name: "Polyester/Spandex", count: 12 }, { name: "Cotton", count: 8 }, { name: "Nylon/Spandex", count: 4 }], items: [{ flNo: "FL-SAMPLE-001", construction: "Single Jersey" }, { flNo: "FL-SAMPLE-002", construction: "Interlock" }, { flNo: "FL-SAMPLE-003", construction: "Mesh" }, { flNo: "FL-SAMPLE-004", construction: "Pique" }] },
      "Buyer B": { buyer: "Buyer B", candidates: 31, teamPickRate: 17.2, allPickRate: 14.9, top: { name: "Interlock", pickRate: 25, picks: 15, offers: 60 }, avoid: { name: "Jacquard", pickRate: 7.1, picks: 2, offers: 28 }, preferences: [{ name: "Interlock", offers: 60, picks: 15, pickRate: 25 }, { name: "French Terry", offers: 49, picks: 10, pickRate: 20.4 }, { name: "Single Jersey", offers: 72, picks: 13, pickRate: 18.1 }, { name: "Rib", offers: 41, picks: 6, pickRate: 14.6 }], mix: [{ name: "Polyester/Spandex", count: 13 }, { name: "Cotton/Spandex", count: 9 }, { name: "Rayon Blend", count: 6 }, { name: "Cotton", count: 3 }], items: [{ flNo: "FL-SAMPLE-005", construction: "Interlock" }, { flNo: "FL-SAMPLE-006", construction: "French Terry" }, { flNo: "FL-SAMPLE-007", construction: "Single Jersey" }, { flNo: "FL-SAMPLE-008", construction: "Rib" }] },
    },
  }
}
