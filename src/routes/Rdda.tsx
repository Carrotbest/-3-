import { useState } from "react"
import { BarChart3, CalendarRange, Database, Sparkles } from "lucide-react"

import { BuyerTab } from "@/components/rdda/BuyerTab"
import { DirectionTab } from "@/components/rdda/DirectionTab"
import { LedgerTab } from "@/components/rdda/LedgerTab"
import { MaturityTab } from "@/components/rdda/MaturityTab"
import { RecommendTab } from "@/components/rdda/RecommendTab"
import { SupplierTab } from "@/components/rdda/SupplierTab"
import { TeamTab } from "@/components/rdda/TeamTab"
import { TrendTab } from "@/components/rdda/TrendTab"
import { DataUpload } from "@/components/upload/DataUpload"
import { sampleRddaReport, type RddaReportV2 } from "@/data/rdda-report"
import { ingestRddaReport } from "@/data/upload"
import { useAppStore } from "@/store/useAppStore"

const tabs = [
  { id: "buyer", label: "바이어", hint: "성과와 점유" },
  { id: "recommend", label: "원단 제안", hint: "추천 후보" },
  { id: "ledger", label: "전사 대비", hint: "팀 경쟁력" },
  { id: "supplier", label: "업체", hint: "소싱 성과" },
  { id: "direction", label: "개발 방향", hint: "소재 기회" },
  { id: "maturity", label: "성숙과 가격", hint: "효율 구간" },
  { id: "team", label: "팀 운영", hint: "등록 품질" },
  { id: "trend", label: "추이", hint: "주간·월간" },
] as const
type TabId = (typeof tabs)[number]["id"]

const fallback = sampleRddaReport()
const isReportV2 = (value: unknown): value is RddaReportV2 => Boolean(value && typeof value === "object" && "meta" in value && "buyers" in value && "recommend" in value)

export function Rdda() {
  const stored = useAppStore((state) => state.rdda)
  const ingest = useAppStore((state) => state.ingest)
  const [active, setActive] = useState<TabId>("buyer")
  const report = isReportV2(stored) ? stored : fallback
  const usingSample = !isReportV2(stored)

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]

  return <section className="-mt-1 min-w-0 space-y-5 pb-4">
    <header className="relative overflow-hidden rounded-[14px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_76%,transparent)] p-5 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:p-6">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-7 top-0 h-px bg-white/95" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[var(--gradient-1)] opacity-[0.08] blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full bg-[var(--gradient-3)] opacity-[0.07] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] text-white shadow-[0_10px_22px_-10px_rgba(76,91,212,0.7)]"><BarChart3 className="size-5" aria-hidden="true" /></span>
          <div><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gradient-1)]">Fabric intelligence</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${usingSample ? "border-amber-200 bg-amber-50/80 text-amber-700" : "border-emerald-200 bg-emerald-50/80 text-emerald-700"}`}>{usingSample ? "SAMPLE DATA" : "LIVE DATA"}</span></div><h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] text-[var(--foreground)] sm:text-[28px]">RDDA ANALYSIS</h1><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">바이어 반응과 팀 원단 경쟁력을 한 화면에서 비교하고 다음 개발 방향을 결정합니다.</p></div>
        </div>
        <DataUpload kind="rdda-report" label="집계 JSON 업로드" accept=".json,application/json" compact onFiles={(files) => void ingestRddaReport(files)} />
      </div>
      <div className="relative mt-6 grid gap-2.5 sm:grid-cols-3">
        {[{ icon: CalendarRange, label: "분석 기간", value: `${report.meta.periodFrom} – ${report.meta.periodTo}` }, { icon: Database, label: "분석 원단", value: `${report.summary.offers.toLocaleString()}건` }, { icon: Sparkles, label: "3팀 픽업률", value: `${report.summary.teamPickRate.toFixed(1)}%` }].map(({ icon: Icon, label, value }) => <div key={label} className="relative overflow-hidden rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-3 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted-foreground)]"><Icon className="size-3.5 text-[var(--gradient-1)]" aria-hidden="true" />{label}</div><p className="mt-1.5 font-semibold tracking-tight [font-variant-numeric:tabular-nums]">{value}</p></div>)}
      </div>
    </header>

    <nav className="overflow-x-auto rounded-[12px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_72%,transparent)] p-1.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] backdrop-blur-lg" role="tablist" aria-label="RDDA 분석 탭"><div className="flex min-w-max gap-1">{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={`group min-w-[112px] rounded-[9px] px-3.5 py-2.5 text-left outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${active === tab.id ? "bg-[var(--card)] text-[var(--foreground)] shadow-[0_7px_18px_-13px_rgba(15,23,42,0.4)]" : "text-[var(--muted-foreground)] hover:-translate-y-0.5 hover:bg-white/45 hover:text-[var(--foreground)]"}`}><span className="flex items-center gap-2"><span className={`text-[10px] font-semibold ${active === tab.id ? "text-[var(--gradient-1)]" : "opacity-50"}`}>{String(index + 1).padStart(2, "0")}</span><strong className="text-xs font-semibold">{tab.label}</strong></span><span className="mt-1 block pl-6 text-[10px] opacity-65">{tab.hint}</span></button>)}</div></nav>

    <div aria-live="polite"><div className="mb-3 flex items-center gap-2 px-1"><span className="size-1.5 rounded-full bg-[var(--gradient-1)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--gradient-1)_12%,transparent)]" /><p className="text-xs font-medium text-[var(--muted-foreground)]">{activeTab.label} · {activeTab.hint}</p></div>
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
  </section>
}
