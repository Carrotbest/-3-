import { useEffect, useMemo, useState } from "react"
import { BarChart3, CalendarRange, Database, Percent, RefreshCw, Sparkles } from "lucide-react"

import { BuyerTab } from "@/components/rdda/BuyerTab"
import { DirectionTab } from "@/components/rdda/DirectionTab"
import { LedgerTab } from "@/components/rdda/LedgerTab"
import { MaturityTab } from "@/components/rdda/MaturityTab"
import { AnimatedNumber, MotionSection, RddaMotionContext } from "@/components/rdda/motion"
import { RangePicker } from "@/components/rdda/RangePicker"
import { RecommendTab } from "@/components/rdda/RecommendTab"
import { SupplierTab } from "@/components/rdda/SupplierTab"
import { TeamTab } from "@/components/rdda/TeamTab"
import { TrendTab } from "@/components/rdda/TrendTab"
import { ShinyActionButton } from "@/components/ui/shiny-action-button"
import { DataUpload } from "@/components/upload/DataUpload"
import { addMonths, buildRddaReport, defaultRange, isRddaDataset, monthsOf, periodRates, type RddaDataset } from "@/data/rdda-dataset"
import { sampleRddaReport, type RddaReportV2 } from "@/data/rdda-report"
import { startRddaSync } from "@/data/rdda-sync"
import { ingestRddaReport } from "@/data/upload"
import { useAppStore } from "@/store/useAppStore"

const tabs = [
  { id: "buyer", label: "Buyers", hint: "바이어별 반응 비교" },
  { id: "recommend", label: "Recommend", hint: "다음 제안 후보" },
  { id: "ledger", label: "Benchmark", hint: "전사 대비 경쟁력" },
  { id: "supplier", label: "Suppliers", hint: "업체별 소싱 성과" },
  { id: "direction", label: "Opportunities", hint: "소재 개발 기회" },
  { id: "maturity", label: "Maturity & Price", hint: "원단 나이·가격 효율" },
  { id: "team", label: "Library Health", hint: "등록 원단 활용도" },
  { id: "trend", label: "Trends", hint: "주간·월간 흐름 추적" },
] as const
type TabId = (typeof tabs)[number]["id"]

const fallback = sampleRddaReport()
const isReportV2 = (value: unknown): value is RddaReportV2 => Boolean(value && typeof value === "object" && "meta" in value && "buyers" in value && "recommend" in value)
const inDatasetRange = (ds: RddaDataset, range: { from: string; to: string }) => range.from >= ds.meta.firstMonth && range.to <= ds.meta.lastMonth && range.from <= range.to
const readRange = (ds: RddaDataset) => {
  try {
    const saved = JSON.parse(localStorage.getItem("rdda.range") ?? "null") as { from?: unknown; to?: unknown } | null
    const next = { from: typeof saved?.from === "string" ? saved.from : "", to: typeof saved?.to === "string" ? saved.to : "" }
    if (inDatasetRange(ds, next)) return next
  } catch { /* 기본 기간을 사용한다. */ }
  return defaultRange(ds)
}
const num = (value: number) => Math.round(value * 10) / 10

type Compare = { label: string; delta: number | null; title: string }

/** 카드 하단 전년·전월 대비(R214). 차이는 %p다. */
function DeltaRow({ items }: { items: Compare[] }) {
  return <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--muted-foreground)]">{items.map((item) => <span key={item.label} title={item.title} className="inline-flex items-center gap-1 whitespace-nowrap">{item.label}<strong className={`tabular-nums ${item.delta === null ? "font-medium" : item.delta > 0 ? "text-emerald-600" : item.delta < 0 ? "text-rose-600" : ""}`}>{item.delta === null ? "–" : `${item.delta > 0 ? "▲" : item.delta < 0 ? "▼" : ""}${Math.abs(item.delta).toFixed(1)}%p`}</strong></span>)}</div>
}

export function Rdda() {
  const stored = useAppStore((state) => state.rdda)
  const ingest = useAppStore((state) => state.ingest)
  const [active, setActive] = useState<TabId>("buyer")
  const ds = isRddaDataset(stored) ? stored : null
  const storedReport = isReportV2(stored) ? stored : null
  const [range, setRange] = useState(() => ds ? readRange(ds) : { from: "", to: "" })
  const effectiveRange = ds ? (inDatasetRange(ds, range) ? range : defaultRange(ds)) : null
  const report = useMemo(() => ds && effectiveRange ? buildRddaReport(ds, effectiveRange.from, effectiveRange.to) : storedReport ?? fallback, [ds, effectiveRange?.from, effectiveRange?.to, storedReport])
  const usingSample = !ds && !storedReport

  useEffect(() => {
    if (ds && !inDatasetRange(ds, range)) setRange(readRange(ds))
  }, [ds, range])
  useEffect(() => {
    if (!ds || !inDatasetRange(ds, range)) return
    try { localStorage.setItem("rdda.range", JSON.stringify(range)) } catch { /* 다음 접속에는 기본 기간을 사용한다. */ }
  }, [ds, range])

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]

  const monthCount = monthsOf(report.meta.periodFrom, report.meta.periodTo).length
  const pickupGap = num(report.summary.teamPickRate - report.summary.pickRate)
  // 전년 대비는 같은 길이의 1년 전 기간, 전월 대비는 기간 마지막 달과 그 전달이다.
  const compare = useMemo(() => {
    if (!ds || !effectiveRange) return null
    const { from, to } = effectiveRange
    const lastYear = periodRates(ds, addMonths(from, -12), addMonths(to, -12))
    const lastMonth = periodRates(ds, to, to)
    const prevMonth = periodRates(ds, addMonths(to, -1), addMonths(to, -1))
    const diff = (a: number | null, b: number | null) => a === null || b === null ? null : num(a - b)
    const yoyTitle = `${from} – ${to} 기간 픽업률 − ${addMonths(from, -12)} – ${addMonths(to, -12)} 기간 픽업률`
    const momTitle = `${to} 한 달 픽업률 − ${addMonths(to, -1)} 한 달 픽업률`
    return {
      all: [{ label: "전년대비", delta: diff(report.summary.pickRate, lastYear.pickRate), title: yoyTitle }, { label: "전월대비", delta: diff(lastMonth.pickRate, prevMonth.pickRate), title: momTitle }],
      team: [{ label: "전년대비", delta: diff(report.summary.teamPickRate, lastYear.teamPickRate), title: yoyTitle }, { label: "전월대비", delta: diff(lastMonth.teamPickRate, prevMonth.teamPickRate), title: momTitle }],
    }
  }, [ds, effectiveRange?.from, effectiveRange?.to, report.summary.pickRate, report.summary.teamPickRate])
  const noCompare: Compare[] = [{ label: "전년대비", delta: null, title: "RDDA 갱신으로 전 기간 데이터를 받으면 표시됩니다" }, { label: "전월대비", delta: null, title: "RDDA 갱신으로 전 기간 데이터를 받으면 표시됩니다" }]
  const unavailableTitle = storedReport ? "RDDA 갱신으로 다시 수집하면 기간을 바꿀 수 있습니다." : "전 기간 데이터셋을 수집하면 기간을 바꿀 수 있습니다."

  return <RddaMotionContext.Provider value={`${report.meta.periodFrom}|${report.meta.periodTo}`}><section className="-mt-1 min-w-0 space-y-5 pb-4">
    {/* 헤더에 overflow-hidden 을 걸지 말 것. 기간 설정 팝오버가 잘려 버튼이 안 먹는 것처럼 보인다(R214). 장식만 안쪽 상자에서 자른다. */}
    <header className="relative z-20 rounded-[14px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_76%,transparent)] px-4 py-3 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:px-5 sm:py-3.5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
        <span className="absolute inset-x-7 top-0 h-px bg-white/95" />
        <span className="absolute -right-16 -top-20 size-56 rounded-full bg-[var(--gradient-1)] opacity-[0.08] blur-3xl" />
        <span className="absolute -bottom-24 left-1/3 size-48 rounded-full bg-[var(--gradient-3)] opacity-[0.07] blur-3xl" />
      </div>
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] text-white shadow-[0_10px_22px_-10px_rgba(76,91,212,0.7)]"><BarChart3 className="size-5" aria-hidden="true" /></span>
          <div className="self-center"><div className="flex flex-wrap items-center gap-2.5"><h1 className="text-lg font-semibold uppercase tracking-[0.14em] text-[var(--gradient-1)]">Fabric intelligence</h1><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${usingSample ? "border-amber-200 bg-amber-50/80 text-amber-700" : "border-emerald-200 bg-emerald-50/80 text-emerald-700"}`}>{usingSample ? "SAMPLE DATA" : "LIVE DATA"}</span></div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShinyActionButton tone="sky" size="sm" iconMotion="spin" icon={<RefreshCw aria-hidden="true" />} onClick={startRddaSync}>RDDA 갱신</ShinyActionButton>
          <DataUpload kind="rdda-report" label="집계 JSON 업로드" accept=".json,application/json" compact onFiles={(files) => void ingestRddaReport(files)} />
        </div>
      </div>
      <MotionSection className="relative mt-3 grid items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ds && effectiveRange ? <RangePicker firstMonth={ds.meta.firstMonth} lastMonth={ds.meta.lastMonth} value={effectiveRange} onChange={setRange} /> : <button type="button" disabled title={unavailableTitle} className="relative w-full cursor-not-allowed overflow-hidden rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 text-left opacity-80 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><span className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted-foreground)]"><CalendarRange className="size-3.5 text-[var(--gradient-1)]" aria-hidden="true" />분석 기간</span><span className="mt-0.5 block font-semibold tracking-tight tabular-nums">{report.meta.periodFrom} – {report.meta.periodTo}</span><span className="block text-[10px] text-[var(--muted-foreground)]">{monthCount}개월</span></button>}
        <div className="relative overflow-hidden rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted-foreground)]"><Database className="size-3.5 text-[var(--gradient-1)]" aria-hidden="true" />분석 원단</div><p className="mt-0.5 font-semibold tracking-tight"><AnimatedNumber value={report.summary.offers} suffix="건" locale /></p></div>
        <div className="relative overflow-hidden rounded-[11px] border border-[color-mix(in_oklab,var(--gradient-1)_22%,white)] bg-[color-mix(in_oklab,var(--gradient-1)_5%,var(--card))] px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)]"><span aria-hidden="true" className="absolute inset-x-3.5 top-0 h-[2px] rounded-b-full bg-[color-mix(in_oklab,var(--gradient-1)_55%,transparent)]" /><div className="flex items-center gap-2 text-[11px] font-medium text-[color-mix(in_oklab,var(--gradient-1)_80%,var(--foreground))]"><Sparkles className="size-3.5" aria-hidden="true" />3팀 픽업률</div><p className="mt-0.5 flex items-baseline gap-1.5 font-semibold tracking-tight text-[var(--foreground)]"><AnimatedNumber value={report.summary.teamPickRate} decimals={1} suffix="%" /><span className={`text-[10px] font-medium ${pickupGap > 0 ? "text-emerald-600" : pickupGap < 0 ? "text-rose-600" : "text-[var(--muted-foreground)]"}`} title="전체 픽업률과의 차이">전체 {pickupGap > 0 ? "+" : ""}{pickupGap.toFixed(1)}%p</span></p><DeltaRow items={compare?.team ?? noCompare} /></div>
        <div className="relative overflow-hidden rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted-foreground)]"><Percent className="size-3.5 text-[var(--gradient-1)]" aria-hidden="true" />전체 픽업률</div><p className="mt-0.5 font-semibold tracking-tight"><AnimatedNumber value={report.summary.pickRate} decimals={1} suffix="%" /></p><DeltaRow items={compare?.all ?? noCompare} /></div>
      </MotionSection>
    </header>

    {/* 탭은 가로 한 줄을 채우는 같은 폭 카드다. 선택이 바뀌어도 크기·테두리 두께·위치가 변하지 않게 색만 바꾼다(R216). */}
    <nav className="rounded-[12px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_72%,transparent)] p-1.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] backdrop-blur-lg" role="tablist" aria-label="RDDA 분석 탭">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">{tabs.map((tab, index) => {
        const selected = active === tab.id
        return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => setActive(tab.id)} className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[9px] border px-3 pb-2 pt-2.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected ? "border-[color-mix(in_oklab,var(--gradient-1)_35%,transparent)] bg-[linear-gradient(160deg,var(--card)_55%,color-mix(in_oklab,var(--gradient-1)_7%,var(--card)))] shadow-[0_7px_18px_-13px_rgba(15,23,42,0.4)]" : "border-[var(--border)]/60 bg-white/35 hover:border-[var(--border)] hover:bg-white/60"}`}>
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)] transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`} />
          <span className={`absolute left-2 top-2 text-[9px] font-semibold tabular-nums tracking-[0.08em] ${selected ? "text-[var(--gradient-1)]" : "text-[var(--muted-foreground)] opacity-60"}`}>{String(index + 1).padStart(2, "0")}</span>
          <strong className={`mt-1 block w-full truncate px-4 text-center text-[13px] font-semibold uppercase tracking-[0.06em] ${selected ? "text-[var(--foreground)]" : "text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"}`}>{tab.label}</strong>
          <span className="mt-1.5 flex w-full min-w-0 items-center justify-end gap-1.5">
            <span aria-hidden="true" className={`size-1 shrink-0 rounded-full ${selected ? "bg-[var(--gradient-3)]" : "bg-[var(--muted-foreground)] opacity-40"}`} />
            <span className={`truncate rounded-full px-2 py-[1px] text-[10.5px] ${selected ? "bg-[color-mix(in_oklab,var(--gradient-1)_9%,transparent)] text-[color-mix(in_oklab,var(--gradient-1)_75%,var(--foreground))]" : "bg-[var(--muted)]/60 text-[var(--muted-foreground)]"}`}>{tab.hint}</span>
          </span>
        </button>
      })}</div>
    </nav>

    {/* 탭마다 내용 길이가 달라 전환 때 아래 푸터가 튀지 않게 최소 높이를 둔다. */}
    <div aria-live="polite" className="min-h-[70vh]"><div className="mb-3 flex items-center gap-2 px-1"><span className="size-1.5 rounded-full bg-[var(--gradient-1)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--gradient-1)_12%,transparent)]" /><p className="text-xs font-medium text-[var(--muted-foreground)]">{activeTab.label} · {activeTab.hint}</p></div>
      {active === "buyer" && <BuyerTab report={report} />}
      {active === "recommend" && <RecommendTab report={report} />}
      {active === "ledger" && <LedgerTab report={report} />}
      {active === "supplier" && <SupplierTab report={report} />}
      {active === "direction" && <DirectionTab report={report} />}
      {active === "maturity" && <MaturityTab report={report} />}
      {active === "team" && <TeamTab report={report} />}
      {active === "trend" && <TrendTab report={report} />}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/70 px-1 pt-3 text-[11px] text-[var(--muted-foreground)]"><span>{usingSample ? "RDDA 집계 JSON이 없어 익명 샘플을 표시합니다." : `${report.meta.generatedAt} 생성 집계`}</span>{ingest.kind === "rdda-report" && ingest.message ? <span>{ingest.message}</span> : null}</footer>
  </section></RddaMotionContext.Provider>
}
