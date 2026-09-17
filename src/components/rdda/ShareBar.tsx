import { AnimatedNumber, useFill } from "./motion"

/**
 * 소싱 / 3팀 점유 막대(R215). 축구 점유율 표시처럼 왼쪽 소싱, 오른쪽 3팀이 양끝에서 차올라 비율 경계에서 만난다.
 * teamShare = 제안 건수 중 3팀 담당 FL 비율. 누가 미팅에서 걸었는지는 보지 않는다.
 */
export function ShareBar({ teamShare, offers, teamOffers }: { teamShare: number; offers?: number; teamOffers?: number }) {
  const fill = useFill(1300)
  const team = Math.max(0, Math.min(100, teamShare))
  const sourcing = 100 - team
  const title = offers !== undefined && teamOffers !== undefined
    ? `전체 제안 ${offers.toLocaleString()}건 중 소싱 ${(offers - teamOffers).toLocaleString()}건, 3팀 담당 FL ${teamOffers.toLocaleString()}건`
    : `소싱 ${sourcing.toFixed(1)}% / 3팀 ${team.toFixed(1)}%`
  return <div className="min-w-44" title={title}>
    <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold [font-variant-numeric:tabular-nums]">
      <span className="text-slate-500">소싱 <AnimatedNumber value={sourcing} decimals={1} suffix="%" fill={fill} /></span>
      <span className="text-[var(--gradient-1)]"><AnimatedNumber value={team} decimals={1} suffix="%" fill={fill} /> 3팀</span>
    </div>
    <div className="relative h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--muted)_70%,transparent)] shadow-inner">
      <span className="absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-slate-400 to-slate-300" style={{ width: `${sourcing * fill}%` }} />
      <span className="absolute inset-y-0 right-0 rounded-r-full bg-gradient-to-l from-[var(--gradient-1)] to-[var(--gradient-3)] shadow-[0_0_8px_color-mix(in_oklab,var(--gradient-1)_40%,transparent)]" style={{ width: `${team * fill}%` }} />
      <span aria-hidden="true" className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white transition-opacity duration-300" style={{ left: `${sourcing}%`, opacity: fill > 0.98 ? 1 : 0 }} />
    </div>
  </div>
}
