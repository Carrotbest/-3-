import { useMemo } from "react"
import { Award, Flame, Star } from "lucide-react"

import { buildPerformanceIndex, GRADE_META, lookupPerformance, type FabricGrade, type FabricPerformance } from "@/data/fabric-performance"
import { isRddaDataset } from "@/data/rdda-dataset"
import { useAppStore } from "@/store/useAppStore"

/** 저장된 RDDA 데이터셋에서 FL 성과 색인을 꺼낸다. 데이터셋이 없으면 null. */
export function usePerformanceIndex(): Map<string, FabricPerformance> | null {
  const rdda = useAppStore((state) => state.rdda)
  return useMemo(() => isRddaDataset(rdda) ? buildPerformanceIndex(rdda) : null, [rdda])
}

export function useFabricPerformance(flNo: unknown): FabricPerformance | null {
  const index = usePerformanceIndex()
  return useMemo(() => lookupPerformance(index, flNo), [index, flNo])
}

const GRADE_STYLE: Record<FabricGrade, string> = {
  order: "border-amber-300 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-800 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_3px_10px_-4px_rgba(217,119,6,0.55)]",
  best: "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_3px_10px_-6px_rgba(16,185,129,0.6)]",
  hit: "border-emerald-300 bg-white/70 text-emerald-700",
  normal: "border-slate-200 bg-slate-50 text-slate-600",
  maturing: "border-slate-200 bg-transparent text-slate-500",
  cold: "border-slate-200 bg-transparent text-slate-400",
  unshown: "border-dashed border-slate-200 bg-transparent text-slate-400",
}

/** 행 강조용 클래스. 표 행(tr)이나 카드에 붙인다. */
export const GRADE_ROW_CLASS: Partial<Record<FabricGrade, string>> = {
  order: "perf-row-order",
  best: "perf-row-best",
  hit: "perf-row-hit",
  cold: "perf-row-dim",
  unshown: "perf-row-dim",
}

export function perfTitle(perf: FabricPerformance): string {
  const meta = GRADE_META[perf.grade]
  const parts = [
    `${meta.label}: ${meta.hint}`,
    `제안 ${perf.offers}회`,
    perf.picks !== null ? `픽업 ${perf.picks}회` : "",
    perf.orders !== null ? `오더 ${perf.orders}회` : "",
    perf.pickRate !== null ? `픽업률 ${perf.pickRate.toFixed(1)}%` : "",
    perf.registered ? `등록 ${perf.registered}` : "",
    "RDDA 원장 누적, 폐기 리스트 미팅 제외",
  ]
  return parts.filter(Boolean).join("\n")
}

export function PerfBadge({ perf, compact = false }: { perf: FabricPerformance | null; compact?: boolean }) {
  if (!perf) return null
  const meta = GRADE_META[perf.grade]
  const Icon = perf.grade === "order" ? Award : perf.grade === "best" ? Star : perf.grade === "hit" ? Flame : null
  return <span title={perfTitle(perf)} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold leading-none ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"} ${GRADE_STYLE[perf.grade]}`}>
    {Icon ? <Icon className={compact ? "size-3" : "size-3.5"} aria-hidden="true" /> : null}
    {meta.label}
  </span>
}

/** 제안·픽업·오더를 한 줄로. 표 칸에 쓴다. */
export function PerfCounts({ perf }: { perf: FabricPerformance | null }) {
  if (!perf) return <span className="text-[var(--muted-foreground)]">–</span>
  return <span title={perfTitle(perf)} className="whitespace-nowrap text-xs [font-variant-numeric:tabular-nums]">
    <span className="text-[var(--muted-foreground)]">{perf.offers}</span>
    <span className="mx-0.5 opacity-40">/</span>
    <strong className={perf.picks ? "text-emerald-700" : "text-[var(--muted-foreground)]"}>{perf.picks ?? "–"}</strong>
    <span className="mx-0.5 opacity-40">/</span>
    <strong className={perf.orders ? "text-amber-700" : "text-[var(--muted-foreground)]"}>{perf.orders ?? "–"}</strong>
  </span>
}

/**
 * 좁은 FL 칸에 붙이는 표식(R213). 오더·베스트·고적중만 아이콘을 보이고 나머지는 그리지 않는다.
 * 표 설정(열 정의) 안에서도 쓸 수 있게 FL 문자열만 받는다.
 */
export function FlPerfMark({ flNo }: { flNo: unknown }) {
  const perf = useFabricPerformance(flNo)
  if (!perf || !(perf.grade === "order" || perf.grade === "best" || perf.grade === "hit")) return null
  const Icon = perf.grade === "order" ? Award : perf.grade === "best" ? Star : Flame
  const tone = perf.grade === "order" ? "text-amber-500" : "text-emerald-600"
  return <span title={perfTitle(perf)} className={`ml-1 inline-flex shrink-0 align-[-2px] ${tone}`}><Icon className={`size-3 ${perf.grade === "order" ? "fill-amber-300" : perf.grade === "best" ? "fill-emerald-200" : ""}`} aria-label={GRADE_META[perf.grade].label} /></span>
}
