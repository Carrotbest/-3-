import type { RddaBuyerRow, RddaRecommend, RddaReportV2 } from "./rdda-report"

export interface RddaDataset {
  kind: "rdda-dataset"
  version: 3
  meta: { generatedAt: string; firstMonth: string; lastMonth: string; ledgerTotal: number; teamTotal: number }
  dict: { fl: string[]; con: string[]; fiber: string[]; cust: string[]; brand: string[]; season: string[]; gender: string[] }
  flCon: number[]
  flFiber: number[]
  team: [fl: number, ym: string, m: number, con: number, wt: number, picks?: number, orders?: number][]
  meets: [ym: string, cust: number, brand: number, season: number, gender: number, offered: number[], picked: number[]][]
  cumulative: Pick<RddaReportV2, "ledger" | "origins" | "suppliers" | "gaps" | "trend" | "price" | "maturity" | "teamYears">
}

type Range = { from: string; to: string }
type Meet = RddaDataset["meets"][number]
type TallyRow = {
  key: number
  name: string
  offers: number
  pickRate: number
  teamOffers: number
  teamShare: number
  teamPickRate: number | null
  gap: number | null
}

const num = (value: number) => Math.round(value * 10) / 10
const rate = (value: number, total: number) => total ? num(value / total * 100) : 0

export function isRddaDataset(value: unknown): value is RddaDataset {
  if (!value || typeof value !== "object") return false
  const ds = value as Partial<RddaDataset>
  return Boolean(
    ds.kind === "rdda-dataset"
    && ds.version === 3
    && ds.meta && typeof ds.meta.lastMonth === "string"
    && ds.dict && Array.isArray(ds.dict.fl)
    && Array.isArray(ds.flCon)
    && Array.isArray(ds.team)
    && Array.isArray(ds.meets)
    && ds.cumulative && Array.isArray(ds.cumulative.ledger),
  )
}

export function addMonths(ym: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!match) return ym
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function monthsOf(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) return []
  const months: string[] = []
  for (let current = from; current <= to; current = addMonths(current, 1)) months.push(current)
  return months
}

export function defaultRange(ds: RddaDataset): Range {
  return { from: addMonths(ds.meta.lastMonth, -11), to: ds.meta.lastMonth }
}

/** 기간 픽업률만 빠르게 센다(전년·전월 대비용). 기간이 데이터 밖이거나 제안이 없으면 null. */
export function periodRates(ds: RddaDataset, from: string, to: string): { pickRate: number | null; teamPickRate: number | null } {
  if (from < ds.meta.firstMonth || to > ds.meta.lastMonth || from > to) return { pickRate: null, teamPickRate: null }
  const teamSet = new Set(ds.team.map(([fl]) => fl))
  let offers = 0, picks = 0, teamOffers = 0, teamPicks = 0
  for (const meet of ds.meets) {
    if (meet[0] < from || meet[0] > to) continue
    const picked = new Set(meet[6])
    for (const fl of meet[5]) {
      const isPicked = picked.has(fl)
      offers += 1
      picks += Number(isPicked)
      if (teamSet.has(fl)) { teamOffers += 1; teamPicks += Number(isPicked) }
    }
  }
  return { pickRate: offers ? rate(picks, offers) : null, teamPickRate: teamOffers ? rate(teamPicks, teamOffers) : null }
}

export function buildRddaReport(ds: RddaDataset, from: string, to: string): RddaReportV2 {
  const months = monthsOf(from, to)
  const threshold = (base: number) => Math.max(10, Math.round(base * Math.min(1, months.length / 12)))
  const meets = ds.meets.filter((meet) => meet[0] >= from && meet[0] <= to)
  const teamSet = new Set(ds.team.map(([fl]) => fl))

  const tally = (dict: string[], keyOf: (meet: Meet, fl: number) => number, minOffers: number): TallyRow[] => {
    const totals = new Map<number, { off: number; pic: number; t: number; tp: number }>()
    for (const meet of meets) {
      const picked = new Set(meet[6])
      for (const fl of meet[5]) {
        const key = keyOf(meet, fl)
        if (key < 0 || !dict[key]) continue
        const row = totals.get(key) ?? { off: 0, pic: 0, t: 0, tp: 0 }
        const isPicked = picked.has(fl)
        const isTeam = teamSet.has(fl)
        row.off += 1
        row.pic += Number(isPicked)
        row.t += Number(isTeam)
        row.tp += Number(isTeam && isPicked)
        totals.set(key, row)
      }
    }
    return [...totals.entries()].filter(([, row]) => row.off >= minOffers).map(([key, row]) => {
      const enough = row.t >= threshold(20)
      const otherRate = row.off - row.t ? (row.pic - row.tp) / (row.off - row.t) * 100 : 0
      return {
        key,
        name: dict[key],
        offers: row.off,
        pickRate: rate(row.pic, row.off),
        teamOffers: row.t,
        teamShare: rate(row.t, row.off),
        teamPickRate: enough ? rate(row.tp, row.t) : null,
        gap: enough ? num(rate(row.tp, row.t) - otherRate) : null,
      }
    }).sort((a, b) => b.offers - a.offers)
  }

  let offers = 0
  let picks = 0
  let teamOffers = 0
  let teamPicks = 0
  for (const meet of meets) {
    const picked = new Set(meet[6])
    offers += meet[5].length
    picks += meet[5].filter((fl) => picked.has(fl)).length
    teamOffers += meet[5].filter((fl) => teamSet.has(fl)).length
    teamPicks += meet[5].filter((fl) => teamSet.has(fl) && picked.has(fl)).length
  }

  const buyerMeetings = new Map<number, number>()
  for (const meet of meets) buyerMeetings.set(meet[1], (buyerMeetings.get(meet[1]) ?? 0) + 1)
  const buyerTallies = tally(ds.dict.cust, (meet) => meet[1], threshold(50))
  const buyers: RddaBuyerRow[] = buyerTallies.map((row) => ({
    name: row.name,
    meetings: buyerMeetings.get(row.key) ?? 0,
    offers: row.offers,
    pickRate: row.pickRate,
    teamOffers: row.teamOffers,
    teamShare: row.teamShare,
    teamPickRate: row.teamPickRate ?? 0,
  }))

  const teamByFl = new Map(ds.team.map((row) => [row[0], row] as const))
  const weightBands = [
    { min: 0, max: 140, band: "0~140" },
    { min: 140, max: 180, band: "140~180" },
    { min: 180, max: 220, band: "180~220" },
    { min: 220, max: 260, band: "220~260" },
    { min: 260, max: 300, band: "260~300" },
    { min: 300, max: Infinity, band: "300+" },
  ]
  const weightTotals = weightBands.map(() => ({ offers: 0, picks: 0 }))
  for (const meet of meets) {
    const picked = new Set(meet[6])
    for (const fl of meet[5]) {
      const team = teamByFl.get(fl)
      // 수집기 v2와 같이 중량이 없는 원단(0)은 구간에 넣지 않는다.
      if (!team || !(team[4] > 0)) continue
      const index = weightBands.findIndex((band) => team[4] >= band.min && team[4] < band.max)
      if (index < 0) continue
      weightTotals[index].offers += 1
      weightTotals[index].picks += Number(picked.has(fl))
    }
  }

  const monthRows = months.map((ym) => {
    const rows = meets.filter((meet) => meet[0] === ym)
    let monthOffers = 0
    let monthPicks = 0
    let monthTeamOffers = 0
    let monthTeamPicks = 0
    for (const meet of rows) {
      const picked = new Set(meet[6])
      monthOffers += meet[5].length
      monthPicks += meet[5].filter((fl) => picked.has(fl)).length
      monthTeamOffers += meet[5].filter((fl) => teamSet.has(fl)).length
      monthTeamPicks += meet[5].filter((fl) => teamSet.has(fl) && picked.has(fl)).length
    }
    return {
      month: ym.slice(2),
      offers: monthOffers,
      pickRate: rate(monthPicks, monthOffers),
      picks: monthPicks,
      teamOffers: monthTeamOffers,
      teamPicks: monthTeamPicks,
      teamPickRate: rate(monthTeamPicks, monthTeamOffers),
      teamShare: rate(monthTeamOffers, monthOffers),
    }
  })

  const recommend: Record<string, RddaRecommend> = {}
  for (const buyer of buyers.slice(0, 6)) {
    const buyerIndex = ds.dict.cust.indexOf(buyer.name)
    const buyerMeets = meets.filter((meet) => meet[1] === buyerIndex)
    const offered = new Set<number>()
    const constructionTotals = new Map<number, { offers: number; picks: number }>()
    for (const meet of buyerMeets) {
      const picked = new Set(meet[6])
      for (const fl of meet[5]) {
        offered.add(fl)
        const con = ds.flCon[fl] ?? -1
        if (con < 0 || !ds.dict.con[con]) continue
        const row = constructionTotals.get(con) ?? { offers: 0, picks: 0 }
        row.offers += 1
        row.picks += Number(picked.has(fl))
        constructionTotals.set(con, row)
      }
    }
    const preferences = [...constructionTotals.entries()]
      .filter(([, row]) => row.offers >= threshold(25))
      .map(([con, row]) => ({ con, name: ds.dict.con[con], offers: row.offers, picks: row.picks, pickRate: rate(row.picks, row.offers) }))
      .sort((a, b) => b.pickRate - a.pickRate)
    if (!preferences.length) continue
    const topConstructions = new Set(preferences.filter((row) => row.pickRate > 0).slice(0, 6).map((row) => row.con))
    const cutoff = `${Number(to.slice(0, 4)) - 2}-01`
    const candidates = ds.team.filter(([fl, ym, , con]) => topConstructions.has(con) && !offered.has(fl) && ym >= cutoff)
    const mixCounts = new Map<number, number>()
    for (const [, , , con] of candidates) mixCounts.set(con, (mixCounts.get(con) ?? 0) + 1)
    const mix = [...mixCounts.entries()]
      .map(([con, count]) => ({ name: ds.dict.con[con], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
    const items = candidates.filter(([, , meetingCount]) => meetingCount === 0)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 8)
      .map(([fl, , , con]) => ({ flNo: ds.dict.fl[fl], construction: ds.dict.con[con] }))
    const simplePreferences = preferences.map(({ con: _con, ...row }) => row)
    recommend[buyer.name] = {
      buyer: buyer.name,
      candidates: candidates.length,
      teamPickRate: buyer.teamPickRate,
      allPickRate: buyer.pickRate,
      top: simplePreferences[0]!,
      avoid: simplePreferences.at(-1)!,
      preferences: simplePreferences.slice(0, 10),
      mix,
      items,
    }
  }

  return {
    meta: {
      generatedAt: ds.meta.generatedAt,
      periodFrom: from,
      periodTo: to,
      meetings: meets.length,
      offers,
      picks,
      ledgerTotal: ds.meta.ledgerTotal,
      teamTotal: ds.meta.teamTotal,
    },
    summary: {
      offers,
      picks,
      pickRate: rate(picks, offers),
      teamOffers,
      teamShare: rate(teamOffers, offers),
      teamPicks,
      teamPickRate: rate(teamPicks, teamOffers),
    },
    buyers,
    brands: tally(ds.dict.brand, (meet) => meet[2], threshold(150)).slice(0, 16),
    genders: tally(ds.dict.gender, (meet) => meet[4], threshold(200)),
    seasons: tally(ds.dict.season, (meet) => meet[3], threshold(150)),
    fibers: tally(ds.dict.fiber, (_meet, fl) => ds.flFiber[fl] ?? -1, threshold(150)).map(({ name, offers: count, pickRate, teamOffers: teamCount, teamShare, gap }) => ({ name, offers: count, pickRate, teamOffers: teamCount, teamShare, gap })),
    weights: weightBands.map((band, index) => ({ band: band.band, offers: weightTotals[index].offers, pickRate: rate(weightTotals[index].picks, weightTotals[index].offers) })).filter((row) => row.offers >= threshold(30)),
    months: monthRows,
    recommend,
    ...ds.cumulative,
  }
}
