import { GRADE_META, GRADE_RULES } from "@/data/fabric-performance"
import { PerfBadge, useFabricPerformance, usePerformanceIndex } from "./PerfBadge"

/** 원단 상세의 RDDA 성과 칸(R211). FL No. 하나로 원장 누적 수치를 보여 준다. */
export function FabricPerformancePanel({ flNo }: { flNo: string }) {
  const index = usePerformanceIndex()
  const perf = useFabricPerformance(flNo)

  let message = ""
  if (!index) message = "RDDA 데이터가 없습니다. RDDA 화면에서 RDDA 갱신을 실행하면 표시됩니다."
  else if (!flNo.trim()) message = "FL No.가 없어 RDDA 성과를 찾을 수 없습니다."
  else if (!perf) message = "3팀 담당 FL이 아니어서 RDDA 수집 범위에 없습니다."

  const stats = perf ? [
    { label: "제안", value: `${perf.offers}회` },
    { label: "픽업", value: perf.picks === null ? "–" : `${perf.picks}회`, strong: Boolean(perf.picks) },
    { label: "오더", value: perf.orders === null ? "–" : `${perf.orders}회`, strong: Boolean(perf.orders) },
    { label: "픽업률", value: perf.pickRate === null ? "–" : `${perf.pickRate.toFixed(1)}%` },
    { label: "등록 후", value: perf.ageMonths === null ? "–" : `${perf.ageMonths}개월` },
  ] : []

  return <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">RDDA 성과 {perf ? <PerfBadge perf={perf} /> : null}</h2>
      <span className="text-[11px] text-[var(--muted-foreground)]">RDDA 원장 누적, 폐기 리스트 미팅 제외</span>
    </div>
    {message ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">{message}</p> : <>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((stat) => <div key={stat.label} className="rounded-[8px] border border-[var(--border)] px-3 py-2">
          <dt className="text-[11px] text-[var(--muted-foreground)]">{stat.label}</dt>
          <dd className={`mt-0.5 text-sm tabular-nums ${stat.strong ? "font-semibold text-[var(--foreground)]" : "font-medium"}`}>{stat.value}</dd>
        </div>)}
      </dl>
      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{perf ? GRADE_META[perf.grade].hint : ""}. 등록 {GRADE_RULES.maturingMonths}개월 이내 원단은 아직 성숙 중이라 낮은 수치를 실패로 보지 않습니다.</p>
    </>}
  </section>
}
