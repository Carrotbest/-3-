import type { RddaMonthlyReport, RddaReportV2, RddaWeeklySnapshot } from "./rdda-report"

const count = (value: number) => value.toLocaleString("ko-KR")
const rate = (value: number) => value.toFixed(1)
const names = (items: string[]) => items.join(", ")

function direction(delta: number): string {
  if (delta > 0) return "늘었다"
  if (delta < 0) return "줄었다"
  return "같았다"
}

function changeBody(current: RddaMonthlyReport["kpi"], previous?: RddaMonthlyReport["kpi"]): string {
  if (!previous) return "비교할 전월 기록이 없습니다."
  const offersDelta = current.offers - previous.offers
  const pickDelta = current.pickRate - previous.pickRate
  const shareDelta = current.teamShare - previous.teamShare
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`
  return [
    `제안은 전월 ${count(previous.offers)}건에서 ${count(current.offers)}건으로 ${direction(offersDelta)}.`,
    `픽업률은 ${rate(previous.pickRate)}%에서 ${rate(current.pickRate)}%로 ${signed(pickDelta)}%p 움직였다.`,
    `3팀 비중은 ${rate(previous.teamShare)}%에서 ${rate(current.teamShare)}%로 ${signed(shareDelta)}%p 변했다.`,
  ].join("\n")
}

export function withPreviousKpi(report: RddaMonthlyReport, previous?: RddaMonthlyReport["kpi"]): RddaMonthlyReport {
  return {
    ...report,
    prevKpi: previous,
    sections: report.sections.map((section) => section.id === "change" ? { ...section, body: changeBody(report.kpi, previous) } : section),
  }
}

export function buildMonthlyReport(report: RddaReportV2, snapshots: RddaWeeklySnapshot[], monthId: string): RddaMonthlyReport {
  void snapshots
  const now = new Date().toISOString()
  const month = Number(monthId.slice(5, 7))
  const meetingRows = [...report.buyers].filter((row) => row.meetings > 0).sort((a, b) => b.meetings - a.meetings).slice(0, 3)
  const shareRows = report.buyers.filter((row) => Number.isFinite(row.teamShare) && row.teamOffers > 0)
  const highestShare = [...shareRows].sort((a, b) => b.teamShare - a.teamShare)[0]
  const lowestShare = [...shareRows].sort((a, b) => a.teamShare - b.teamShare)[0]
  const pickupRows = report.buyers
    .filter((row) => Number.isFinite(row.teamPickRate) && Number.isFinite(row.pickRate))
    .map((row) => ({ ...row, delta: row.teamPickRate - row.pickRate }))
  const pickupHigh = pickupRows.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const pickupLow = pickupRows.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2)
  const gapHigh = [...report.gaps].filter((row) => row.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3)
  const fiberHigh = [...report.fibers].filter((row) => row.gap !== null && row.gap > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 2)
  const rising = [...report.trend.rising].sort((a, b) => b.delta - a.delta).slice(0, 3)
  const falling = [...report.trend.falling].sort((a, b) => a.delta - b.delta).slice(0, 3)
  const kpi = { meetings: report.meta.meetings, ...report.summary }

  const meetingBody = [
    report.meta.meetings > 0 ? `${month}월 바이어 미팅은 ${count(report.meta.meetings)}건이었다.` : "",
    meetingRows.length ? `${meetingRows.map((row, index) => `${index + 1}위 ${row.name} ${count(row.meetings)}건`).join(", ")} 순이었다.` : "",
  ].filter(Boolean).join("\n")
  const shareBody = [
    report.meta.offers > 0 ? `전체 제안 원단 ${count(report.meta.offers)}건 중 3팀 원단은 ${count(report.summary.teamOffers)}건으로 ${rate(report.summary.teamShare)}%를 차지했다.` : "",
    highestShare && lowestShare ? `바이어별로는 ${highestShare.name}가 ${rate(highestShare.teamShare)}%로 가장 높고 ${lowestShare.name}가 ${rate(lowestShare.teamShare)}%로 가장 낮다.` : "",
  ].filter(Boolean).join("\n")
  const pickupBody = [
    `전체 픽업률은 ${rate(report.summary.pickRate)}%, 3팀 원단 픽업률은 ${rate(report.summary.teamPickRate)}%다.`,
    pickupHigh.length ? `${names(pickupHigh.map((row) => row.name))}에서 3팀 원단이 평균보다 잘 선택됐다.` : "",
    pickupLow.length ? `${names(pickupLow.map((row) => row.name))}은 제안 방향 점검이 필요하다.` : "",
  ].filter(Boolean).join("\n")
  const materialBody = [
    gapHigh.length ? `조직별로는 ${names(gapHigh.map((row) => row.construction))}에서 3팀이 전사 평균을 앞섰다.` : "",
    fiberHigh.length ? `혼용률은 ${names(fiberHigh.map((row) => row.name))}가 강세다.` : "",
    rising.length || falling.length ? `전사 등록 비중이 늘고 있는 조직은 ${names(rising.map((row) => row.construction))}이고, 줄고 있는 조직은 ${names(falling.map((row) => row.construction))}다.` : "",
  ].filter(Boolean).join("\n")

  return {
    monthId,
    generatedAt: now,
    updatedAt: now,
    status: "draft",
    kpi,
    sections: [
      { id: "meetings", title: "월 바이어 미팅 현황", body: meetingBody },
      { id: "share", title: "전체 제안 대비 3팀 비율", body: shareBody },
      { id: "pickup", title: "바이어 selection 및 Pickup 현황", body: pickupBody },
      { id: "material", title: "소재 및 원단 트렌드", body: materialBody },
      { id: "change", title: "전월 대비 변화", body: changeBody(kpi) },
    ],
  }
}
