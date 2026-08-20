import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowUpRight, CalendarDays, CircleDashed, Droplets, ExternalLink,
  Feather, FileText, Flame, HardHat, Layers3, Leaf, Link2, Moon, Move, Pencil, Plus,
  Search, ShieldCheck, Shirt, Snowflake, Sparkles, SwatchBook, Thermometer, Trash2,
  Umbrella, UserRound, type LucideIcon,
} from "lucide-react"

import { PortfolioForm } from "@/components/portfolio/PortfolioForm"
import { SplitPane } from "@/components/portfolio/SplitPane"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  flYearDistribution, mergeChemicalPortfolio, stageOf, type ChemicalAttachment, type ChemicalCategory,
  type ChemicalItem, type ChemicalPortfolio, type ChemicalStage,
} from "@/data/chemical"
import { portfolioStore } from "@/data/portfolio-store"
import { httpsMaterialLink } from "@/data/schema"
import { hoverLift } from "@/lib/motion"
import { useInView } from "@/lib/useInView"
import { cn } from "@/lib/utils"
import { saveChemicalLinks, setAppState, useAppStore } from "@/store/useAppStore"

const STATE_FILTERS = [
  { value: "all", label: "전체" },
  { value: "plan", label: "설계" },
  { value: "progress", label: "진행" },
  { value: "done", label: "완료" },
  { value: "drop", label: "중단" },
] as const
type StateFilter = (typeof STATE_FILTERS)[number]["value"]

const STAGE_LABELS: Record<ChemicalStage, string> = {
  plan: "설계",
  progress: "진행",
  done: "완료",
  drop: "중단",
}

const STAGE_ORDER = ["plan", "progress", "done"] as const
const STAGE_COLORS: Record<(typeof STAGE_ORDER)[number], string> = {
  plan: "bg-[var(--stage-plan)]",
  progress: "bg-[var(--stage-progress)]",
  done: "bg-[var(--stage-done)]",
}

const STAGE_GRADIENTS: Record<(typeof STAGE_ORDER)[number], string> = {
  plan: "bg-[linear-gradient(90deg,var(--stage-plan),color-mix(in_oklab,var(--stage-plan)_78%,white))]",
  progress: "bg-[linear-gradient(90deg,var(--stage-progress),color-mix(in_oklab,var(--stage-progress)_78%,white))]",
  done: "bg-[linear-gradient(90deg,var(--stage-done),color-mix(in_oklab,var(--stage-done)_78%,white))]",
}

const STAGGER_CLASSES = [
  "delay-0", "delay-[50ms]", "delay-[100ms]", "delay-[150ms]",
  "delay-[200ms]", "delay-[250ms]", "delay-[300ms]",
] as const

interface FeatureMeta {
  keywords: readonly string[]
  labelEn: string
  labelKo: string
  icon: LucideIcon
  iconTone: string
  borderTone: string
  selectedTone: string
}

const FEATURE_META: readonly FeatureMeta[] = [
  { keywords: ["cooling"], labelEn: "Cooling", labelKo: "냉감", icon: Snowflake, iconTone: "bg-[var(--feature-cooling-tint)] text-[var(--feature-cooling)]", borderTone: "border-l-[var(--feature-cooling)]", selectedTone: "border-[var(--feature-cooling)] bg-[var(--feature-cooling-tint)]" },
  { keywords: ["anti-bacterial", "anti bacterial", "antibacterial", "anti-odor", "anti odor"], labelEn: "Anti-bacterial / Anti-Odor", labelKo: "항균·항취", icon: ShieldCheck, iconTone: "bg-[var(--feature-antibacterial-tint)] text-[var(--feature-antibacterial)]", borderTone: "border-l-[var(--feature-antibacterial)]", selectedTone: "border-[var(--feature-antibacterial)] bg-[var(--feature-antibacterial-tint)]" },
  { keywords: ["heat generation", "warmth"], labelEn: "Heat Generation / Warmth", labelKo: "발열·보온", icon: Flame, iconTone: "bg-[var(--feature-warmth-tint)] text-[var(--feature-warmth)]", borderTone: "border-l-[var(--feature-warmth)]", selectedTone: "border-[var(--feature-warmth)] bg-[var(--feature-warmth-tint)]" },
  { keywords: ["thermal regulation"], labelEn: "Thermal Regulation", labelKo: "온도 조절", icon: Thermometer, iconTone: "bg-[var(--feature-thermal-tint)] text-[var(--feature-thermal)]", borderTone: "border-l-[var(--feature-thermal)]", selectedTone: "border-[var(--feature-thermal)] bg-[var(--feature-thermal-tint)]" },
  { keywords: ["moisture", "sweat"], labelEn: "Moisture / Sweat", labelKo: "땀 관리", icon: Droplets, iconTone: "bg-[var(--feature-moisture-tint)] text-[var(--feature-moisture)]", borderTone: "border-l-[var(--feature-moisture)]", selectedTone: "border-[var(--feature-moisture)] bg-[var(--feature-moisture-tint)]" },
  { keywords: ["durable press", "shape"], labelEn: "Durable Press / Shape", labelKo: "형태안정", icon: Shirt, iconTone: "bg-[var(--feature-shape-tint)] text-[var(--feature-shape)]", borderTone: "border-l-[var(--feature-shape)]", selectedTone: "border-[var(--feature-shape)] bg-[var(--feature-shape-tint)]" },
  { keywords: ["anti-pilling", "anti pilling"], labelEn: "Anti-Pilling", labelKo: "필링 방지", icon: CircleDashed, iconTone: "bg-[var(--feature-pilling-tint)] text-[var(--feature-pilling)]", borderTone: "border-l-[var(--feature-pilling)]", selectedTone: "border-[var(--feature-pilling)] bg-[var(--feature-pilling-tint)]" },
  { keywords: ["soft touch", "hand-feel", "hand feel"], labelEn: "Soft Touch / Hand-feel", labelKo: "촉감", icon: Feather, iconTone: "bg-[var(--feature-soft-tint)] text-[var(--feature-soft)]", borderTone: "border-l-[var(--feature-soft)]", selectedTone: "border-[var(--feature-soft)] bg-[var(--feature-soft-tint)]" },
  { keywords: ["durability", "workwear"], labelEn: "Durability / Workwear", labelKo: "내구성", icon: HardHat, iconTone: "bg-[var(--feature-durability-tint)] text-[var(--feature-durability)]", borderTone: "border-l-[var(--feature-durability)]", selectedTone: "border-[var(--feature-durability)] bg-[var(--feature-durability-tint)]" },
  { keywords: ["stretch"], labelEn: "Stretch / Recovery", labelKo: "신축·복원", icon: Move, iconTone: "bg-[var(--feature-stretch-tint)] text-[var(--feature-stretch)]", borderTone: "border-l-[var(--feature-stretch)]", selectedTone: "border-[var(--feature-stretch)] bg-[var(--feature-stretch-tint)]" },
  { keywords: ["sustainability", "microplastic"], labelEn: "Sustainability / Microplastic", labelKo: "친환경", icon: Leaf, iconTone: "bg-[var(--feature-sustainability-tint)] text-[var(--feature-sustainability)]", borderTone: "border-l-[var(--feature-sustainability)]", selectedTone: "border-[var(--feature-sustainability)] bg-[var(--feature-sustainability-tint)]" },
  { keywords: ["recovery", "restorative"], labelEn: "Recovery / Restorative", labelKo: "회복", icon: Moon, iconTone: "bg-[var(--feature-recovery-tint)] text-[var(--feature-recovery)]", borderTone: "border-l-[var(--feature-recovery)]", selectedTone: "border-[var(--feature-recovery)] bg-[var(--feature-recovery-tint)]" },
  { keywords: ["skin care", "skincare", "microbiome"], labelEn: "Skin Care / Microbiome", labelKo: "마이크로바이옴", icon: Sparkles, iconTone: "bg-[var(--feature-skincare-tint)] text-[var(--feature-skincare)]", borderTone: "border-l-[var(--feature-skincare)]", selectedTone: "border-[var(--feature-skincare)] bg-[var(--feature-skincare-tint)]" },
  { keywords: ["dwr", "water repellency"], labelEn: "DWR / Water Repellency", labelKo: "발수", icon: Umbrella, iconTone: "bg-[var(--feature-dwr-tint)] text-[var(--feature-dwr)]", borderTone: "border-l-[var(--feature-dwr)]", selectedTone: "border-[var(--feature-dwr)] bg-[var(--feature-dwr-tint)]" },
]

const DEFAULT_FEATURE_META: FeatureMeta = {
  keywords: [], labelEn: "Functional Technology", labelKo: "기능성",
  icon: Sparkles,
  iconTone: "bg-[var(--feature-default-tint)] text-[var(--feature-default)]",
  borderTone: "border-l-[var(--feature-default)]",
  selectedTone: "border-[var(--feature-default)] bg-[var(--feature-default-tint)]",
}

const featureMetaOf = (category: Pick<ChemicalCategory, "name" | "labelEn">): FeatureMeta => {
  const searchable = `${category.labelEn} ${category.name}`.normalize("NFKC").toLocaleLowerCase("en-US")
  return FEATURE_META.find((meta) => meta.keywords.some((keyword) => searchable.includes(keyword))) ?? DEFAULT_FEATURE_META
}

const categoryLabels = (category: ChemicalCategory, meta = featureMetaOf(category)) => ({
  en: category.labelEn || meta.labelEn,
  ko: category.labelKo || meta.labelKo,
})

const stageCounts = (items: readonly ChemicalItem[]): Record<ChemicalStage, number> => items.reduce((counts, item) => {
  counts[stageOf(item.state)] += 1
  return counts
}, { plan: 0, progress: 0, done: 0, drop: 0 })

interface DdConnection {
  key: string
  source: "DD" | "완료대장"
  styleNo: string
  owner: string
  completedAt: string
}

const normalizeFl = (value: string): string => value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "")
const flValues = (value: string): string[] => {
  const normalized = normalizeFl(value)
  return normalized.match(/FL\d{8,10}/g) ?? (normalized ? [normalized] : [])
}
const categoryLinkKey = (category: string): string => `category:${category}`
const itemLinkKey = (itemId: string): string => `item:${itemId}`

const stageBadgeTone = (stage: ChemicalStage): string => {
  if (stage === "done") return "border-[var(--stage-done)] bg-[color-mix(in_oklab,var(--stage-done)_14%,transparent)] text-[var(--stage-done)]"
  if (stage === "progress") return "border-[var(--stage-progress)] bg-[color-mix(in_oklab,var(--stage-progress)_14%,transparent)] text-[var(--stage-progress)]"
  if (stage === "drop") return "border-[var(--stage-drop)] bg-[color-mix(in_oklab,var(--stage-drop)_14%,transparent)] text-[var(--stage-drop)]"
  return "border-[var(--stage-plan)] bg-[color-mix(in_oklab,var(--stage-plan)_14%,transparent)] text-[var(--stage-plan)]"
}

function StateBadge({ state }: { state: string }) {
  const stage = stageOf(state)
  return (
    <Badge
      variant="outline"
      className={cn("font-semibold", stageBadgeTone(stage))}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  )
}

function FeatureIdentity({ category, large = false }: { category: ChemicalCategory; large?: boolean }) {
  const meta = featureMetaOf(category)
  const labels = categoryLabels(category, meta)
  const Icon = meta.icon
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className={cn("flex shrink-0 items-center justify-center rounded-[var(--radius)]", large ? "size-12" : "size-9", meta.iconTone)}><Icon className={large ? "size-6" : "size-4"} aria-hidden="true" /></span>
      <span className="min-w-0">
        <strong title={labels.en} className={cn("block truncate font-semibold text-[var(--foreground)]", large ? "text-xl" : "text-sm")}>{labels.en}</strong>
        <span className="mt-0.5 block whitespace-nowrap text-xs text-[var(--muted-foreground)]">{labels.ko}</span>
      </span>
    </span>
  )
}

function StageBar({ items, labels = false }: { items: readonly ChemicalItem[]; labels?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  const counts = stageCounts(items)
  const activeTotal = counts.plan + counts.progress + counts.done
  const summary = STAGE_ORDER.map((stage) => `${STAGE_LABELS[stage]} ${counts[stage]}건`).join(" · ")
  return (
    <div ref={ref}>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)]" role="img" aria-label={`${summary}${counts.drop ? ` · 중단 ${counts.drop}건` : ""}`}>
        {activeTotal ? <div className={cn("flex size-full origin-left gap-px overflow-hidden rounded-full transition-transform duration-[1000ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transform-none motion-reduce:transition-none", inView ? "scale-x-100" : "scale-x-0")}>
          {STAGE_ORDER.filter((stage) => counts[stage] > 0).map((stage) => <span key={stage} className={cn("min-w-0 rounded-full", STAGE_GRADIENTS[stage])} style={{ flexGrow: counts[stage] }} />)}
        </div> : null}
      </div>
      {labels ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
        {STAGE_ORDER.map((stage) => <span key={stage}><span className={cn("mr-1.5 inline-block size-2 rounded-full", STAGE_COLORS[stage])} />{STAGE_LABELS[stage]} <strong className="text-[var(--foreground)]">{counts[stage]}</strong> <span className="tabular-nums">({activeTotal ? Math.round((counts[stage] / activeTotal) * 100) : 0}%)</span></span>)}
        {counts.drop ? <Badge variant="outline" className={stageBadgeTone("drop")}>중단 {counts.drop}</Badge> : null}
      </div> : null}
    </div>
  )
}

function CompletionDonut({ rate }: { rate: number }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.4 })
  return (
    <div ref={ref} className="relative size-28 shrink-0" role="img" aria-label={`완료율 ${rate}%`}>
      <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="21" cy="21" r="16" fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle cx="21" cy="21" r="16" fill="none" pathLength="100" stroke="var(--stage-done)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${rate} ${100 - rate}`} strokeDashoffset={inView ? 0 : rate} className="transition-[stroke-dashoffset] duration-[1000ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-none" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-[var(--foreground)]"><NumberTicker value={rate} suffix="%" startOnView /></span>
    </div>
  )
}

function FlYearTrend({ portfolio }: { portfolio: ChemicalPortfolio }) {
  const distribution = useMemo(() => flYearDistribution(portfolio), [portfolio])
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.25 })
  if (!distribution.length) return null
  const maxCount = Math.max(...distribution.map(({ count }) => count), 1)
  return (
    <Reveal className="mt-4">
      <div ref={ref} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--foreground)]">FL 등록 연도별 추이</p><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">고유 FL 기준 개발 이력</p></div><strong className="text-sm text-[var(--foreground)]"><NumberTicker value={distribution.reduce((sum, entry) => sum + entry.count, 0)} startOnView />건</strong></div>
        <div className="mt-3 grid h-20 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${distribution.length}, minmax(0, 1fr))` }}>
          {distribution.map(({ year, count }) => (
            <div key={year} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" title={`${year}년 ${count}건`}>
              <span className="text-[0.65rem] tabular-nums text-[var(--muted-foreground)]"><NumberTicker value={count} startOnView /></span>
              <span className="flex min-h-0 w-full flex-1 items-end justify-center"><span className={cn("w-full max-w-8 origin-bottom rounded-t-sm bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_78%,white),var(--primary))] transition-transform duration-[1000ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transform-none motion-reduce:transition-none", inView ? "scale-y-100" : "scale-y-0")} style={{ height: `${Math.max(12, (count / maxCount) * 100)}%` }} /></span>
              <span className="text-[0.65rem] tabular-nums text-[var(--muted-foreground)]">{year.slice(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  )
}

function CoverageSummary({ portfolio }: { portfolio: ChemicalPortfolio }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.4 })
  const covered = portfolio.categories.filter((category) => category.items.some((item) => stageOf(item.state) === "done")).length
  const total = portfolio.categories.length
  if (!total) return null
  const rate = Math.round((covered / total) * 100)
  return (
    <Reveal className="mt-4">
      <div ref={ref} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--foreground)]">기능 커버리지</p><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">완료 자산을 보유한 기능</p></div><strong className="whitespace-nowrap text-sm text-[var(--foreground)]"><NumberTicker value={covered} startOnView /> / {total}</strong></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]" role="progressbar" aria-label={`전체 ${total}개 기능 중 완료 자산 보유 ${covered}개`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={covered}><span className={cn("block h-full origin-left rounded-full bg-[linear-gradient(90deg,var(--stage-done),color-mix(in_oklab,var(--stage-done)_78%,white))] transition-transform duration-[1000ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transform-none motion-reduce:transition-none", inView ? "scale-x-100" : "scale-x-0")} style={{ width: `${rate}%` }} /></div>
      </div>
    </Reveal>
  )
}

function RecentUpdates({ portfolio }: { portfolio: ChemicalPortfolio }) {
  const updates = useMemo(() => portfolio.items
    .filter((item) => item.source === "web" && item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)))
    .sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))
    .slice(0, 3), [portfolio])
  if (!updates.length) return null
  return (
    <Reveal className="mt-4">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
        <p className="text-xs font-semibold text-[var(--foreground)]">최근 업데이트</p>
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {updates.map((item) => <li key={item.id} className="flex min-w-0 items-center gap-2 py-2 first:pt-0 last:pb-0"><span className="min-w-0 flex-1 truncate text-xs text-[var(--foreground)]" title={item.chemical}>{item.chemical || "명칭 미등록"}</span><StateBadge state={item.state} /><time dateTime={item.updatedAt} className="shrink-0 text-[0.65rem] tabular-nums text-[var(--muted-foreground)]">{new Date(item.updatedAt ?? "").toLocaleDateString("ko-KR")}</time></li>)}
        </ul>
      </div>
    </Reveal>
  )
}

function PortfolioSummary({ portfolio }: { portfolio: ChemicalPortfolio }) {
  const activeTotal = portfolio.totals.items - portfolio.totals.dropped
  const completionRate = activeTotal ? Math.round((portfolio.totals.done / activeTotal) * 100) : 0
  return (
    <Reveal className="h-[clamp(20rem,38vh,26rem)] min-h-0 xl:h-full">
      <section id="portfolio-overview-panel" className="h-full min-h-0 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm" aria-labelledby="portfolio-summary-title">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Overview</p><h2 id="portfolio-summary-title" className="mt-1 text-base font-semibold text-[var(--foreground)]">전체 개발 현황</h2></div><Layers3 className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" /></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-5">
          <div><p className="text-4xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={portfolio.totals.items} startOnView /></p><p className="mt-1 text-xs text-[var(--muted-foreground)]">전체 개발 건수{portfolio.totals.dropped ? ` · 중단 ${portfolio.totals.dropped}건 별도` : ""}</p></div>
          <div className="flex items-center gap-3"><CompletionDonut rate={completionRate} /><div><strong className="block text-sm text-[var(--foreground)]">완료율</strong><span className="mt-1 block max-w-24 text-xs leading-5 text-[var(--muted-foreground)]">중단을 제외한 개발 건 기준</span></div></div>
        </div>
        <div className="mt-5"><StageBar items={portfolio.items} labels /></div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4"><span className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><ShieldCheck className="size-4 text-[var(--stage-done)]" aria-hidden="true" />검증 통과</span><strong className="mt-2 block text-2xl text-[var(--foreground)]"><NumberTicker value={portfolio.totals.pass} startOnView /></strong><span className="text-xs text-[var(--muted-foreground)]">PASS 건수</span></div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4"><span className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><SwatchBook className="size-4" aria-hidden="true" />연결 원단</span><strong className="mt-2 block text-2xl text-[var(--foreground)]"><NumberTicker value={portfolio.totals.fl} startOnView /></strong><span className="text-xs text-[var(--muted-foreground)]">고유 FL</span></div>
        </div>
        <FlYearTrend portfolio={portfolio} />
        <CoverageSummary portfolio={portfolio} />
        <RecentUpdates portfolio={portfolio} />
      </section>
    </Reveal>
  )
}

function CategoryChart({ categories, onSelect }: { categories: readonly ChemicalCategory[]; onSelect: (name: string) => void }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.12 })
  const sorted = useMemo(() => [...categories].sort((left, right) => right.items.length - left.items.length || left.name.localeCompare(right.name, "ko-KR")), [categories])
  const maxActive = Math.max(1, ...sorted.map((category) => {
    const counts = stageCounts(category.items)
    return counts.plan + counts.progress + counts.done
  }))
  return (
    <Reveal delay={50} className="h-[clamp(20rem,38vh,26rem)] min-h-0 delay-[50ms] xl:h-full">
      <section id="portfolio-category-mix-panel" ref={ref} className="flex h-full min-h-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm" aria-labelledby="portfolio-chart-title">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Category Mix</p><h2 id="portfolio-chart-title" className="mt-1 text-base font-semibold text-[var(--foreground)]">카테고리별 개발 단계</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">막대를 선택하면 해당 카테고리로 이동합니다.</p></div>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">{STAGE_ORDER.map((stage) => <span key={stage}><span className={cn("mr-1.5 inline-block size-2 rounded-full", STAGE_COLORS[stage])} />{STAGE_LABELS[stage]}</span>)}<span><span className="mr-1.5 inline-block size-2 rounded-full bg-[var(--stage-drop)]" />중단(막대 제외)</span></div>
        <TooltipProvider delayDuration={150}>
          <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {sorted.map((category) => {
              const counts = stageCounts(category.items)
              const activeTotal = counts.plan + counts.progress + counts.done
              return (
                <Tooltip key={category.name}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => onSelect(category.name)} className="grid w-full cursor-pointer grid-cols-[minmax(8rem,12rem)_minmax(4rem,1fr)_auto] items-center gap-3 rounded-[var(--radius)] px-2 py-2 text-left outline-none transition-colors hover:bg-[var(--muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none" aria-label={`${category.name}, 설계 ${counts.plan}건, 진행 ${counts.progress}건, 완료 ${counts.done}건, 합계 ${category.items.length}건`}>
                      <FeatureIdentity category={category} />
                      <span className="flex h-3 overflow-hidden rounded-full bg-[var(--muted)]">
                        <span className={cn("flex size-full origin-left gap-px transition-transform duration-[1000ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transform-none motion-reduce:transition-none", inView ? "scale-x-100" : "scale-x-0")}>
                          {STAGE_ORDER.filter((stage) => counts[stage] > 0).map((stage) => <span key={stage} className={cn("min-w-0 rounded-full", STAGE_GRADIENTS[stage])} style={{ flexGrow: counts[stage] }} />)}
                          {maxActive > activeTotal ? <span className="min-w-0 bg-transparent" style={{ flexGrow: maxActive - activeTotal }} /> : null}
                        </span>
                      </span>
                      <span className="flex min-w-8 items-center justify-end gap-1 text-xs tabular-nums text-[var(--muted-foreground)]">{category.items.length}{counts.drop ? <span className="size-1.5 rounded-full bg-[var(--stage-drop)]" aria-label={`중단 ${counts.drop}건`} /> : null}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{categoryLabels(category).en} · 설계 {counts.plan} · 진행 {counts.progress} · 완료 {counts.done}{counts.drop ? ` · 중단 ${counts.drop}` : ""} · 합계 {category.items.length}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>
      </section>
    </Reveal>
  )
}

function ItemCard({ item, category, onOpen, onEdit, onDelete }: {
  item: ChemicalItem
  category: ChemicalCategory
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isWeb = item.source === "web"
  const meta = featureMetaOf(category)
  const Icon = meta.icon
  return (
    <article className={cn("group flex h-full min-h-56 flex-col rounded-[var(--radius)] border border-l-4 border-[var(--border)] bg-[var(--card)] p-4 focus-within:border-[var(--ring)]", meta.borderTone, hoverLift)}>
      <button type="button" aria-haspopup="dialog" onClick={onOpen} className="flex min-h-0 flex-1 cursor-pointer flex-col text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
        <span className="flex w-full items-start justify-between gap-3"><span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)]", meta.iconTone)}><Icon className="size-4" aria-hidden="true" /></span><span className="flex flex-wrap justify-end gap-2"><Badge variant="outline">{isWeb ? "웹 등록" : "엑셀 출처 · 읽기 전용"}</Badge><StateBadge state={item.state} /></span></span>
        <span className="mt-4 block text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Chemical / Brand</span>
        <strong className="mt-1 line-clamp-2 text-lg font-semibold leading-6 text-[var(--foreground)]">{item.chemical || "명칭 미등록"}</strong>
        <span className="mt-1 text-xs text-[var(--muted-foreground)]">{categoryLabels(category).en} · {categoryLabels(category).ko}</span>
        <span className="mt-4 line-clamp-3 text-sm leading-5 text-[var(--muted-foreground)]">{item.description || "설명이 등록되지 않았습니다."}</span>
        <span className="mt-auto flex items-end justify-between gap-3 pt-5"><span className="flex flex-wrap gap-2"><Badge variant="secondary">FL {item.flNos.length}</Badge>{item.passCount ? <Badge className="bg-[var(--stage-done)] text-white">PASS {item.passCount}</Badge> : null}</span><span className="flex items-center gap-1 text-xs font-medium text-[var(--foreground)]">상세 보기<ArrowUpRight className="size-3" /></span></span>
      </button>
      {isWeb ? <div className="mt-3 flex justify-end gap-1 border-t border-[var(--border)] pt-3 opacity-100 transition-opacity motion-reduce:transition-none md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"><Button type="button" size="sm" variant="ghost" onClick={onEdit}><Pencil aria-hidden="true" />수정</Button><Button type="button" size="sm" variant="ghost" className="text-[var(--destructive)]" onClick={onDelete}><Trash2 aria-hidden="true" />삭제</Button></div> : null}
    </article>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      <div className="text-sm leading-6 text-[var(--muted-foreground)]">{children}</div>
    </section>
  )
}

function AttachmentGallery({ attachments }: { attachments: ChemicalAttachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [previewId, setPreviewId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const created: string[] = []
    setUrls({})
    setPreviewId(null)
    void Promise.all(attachments.map(async (attachment) => {
      const url = await portfolioStore.getAttachmentUrl(attachment.id)
      if (url) created.push(url)
      return [attachment.id, url] as const
    })).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))))
      else created.forEach((url) => URL.revokeObjectURL(url))
    })
    return () => {
      active = false
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [attachments])

  if (!attachments.length) return null
  const preview = attachments.find((attachment) => attachment.id === previewId)
  return (
    <DetailSection title="첨부 자료">
      {preview?.kind === "image" && urls[preview.id] ? <div className="mb-4 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]"><img src={urls[preview.id]} alt={`${preview.name} 원본 미리보기`} className="max-h-[60vh] w-full object-contain" /></div> : null}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {attachments.map((attachment) => {
          const url = urls[attachment.id]
          if (attachment.kind === "image") return <button key={attachment.id} type="button" disabled={!url} onClick={() => setPreviewId((current) => current === attachment.id ? null : attachment.id)} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"><span className="block aspect-video overflow-hidden">{url ? <img src={url} alt={attachment.name} className="size-full object-cover" /> : <span className="flex size-full items-center justify-center">불러오는 중</span>}</span><span className="block truncate px-3 py-2 text-xs text-[var(--foreground)]">{attachment.name}</span></button>
          return url ? <a key={attachment.id} href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3 text-[var(--foreground)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"><FileText className="size-5 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-xs">{attachment.name}</span><ExternalLink className="size-3 shrink-0" aria-hidden="true" /></a> : <div key={attachment.id} className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3"><FileText className="size-5" aria-hidden="true" /><span className="truncate text-xs">{attachment.name}</span></div>
        })}
      </div>
    </DetailSection>
  )
}

export function Portfolio() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const chemical = useAppStore((state) => state.chemical)
  const chemicalLinks = useAppStore((state) => state.chemicalLinks)
  const records = useAppStore((state) => state.records)
  const completed = useAppStore((state) => state.completed)
  const portfolio = useMemo(() => chemical ?? mergeChemicalPortfolio(null, []), [chemical])
  const [stateFilter, setStateFilter] = useState<StateFilter>("all")
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const categoryContentRef = useRef<HTMLDivElement>(null)
  const [selectedItem, setSelectedItem] = useState<ChemicalItem | null>(null)
  const [activeFl, setActiveFl] = useState<string | null>(null)
  const [categoryLink, setCategoryLink] = useState("")
  const [itemLink, setItemLink] = useState("")
  const [linkMessage, setLinkMessage] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ChemicalItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChemicalItem | null>(null)
  const [deleteMessage, setDeleteMessage] = useState("")
  const [deleting, setDeleting] = useState(false)
  const requestedCategory = searchParams.get("category")

  useEffect(() => portfolioStore.subscribe((items) => setAppState({ chemicalManual: items })), [])

  useEffect(() => {
    if (requestedCategory && portfolio.categories.some((category) => category.name === requestedCategory)) {
      setSelectedCategory(requestedCategory)
      return
    }
    setSelectedCategory((current) => current && portfolio.categories.some((category) => category.name === current) ? current : portfolio.categories[0]?.name ?? null)
  }, [portfolio, requestedCategory])

  useEffect(() => {
    if (!selectedItem) return
    setActiveFl(null)
    setCategoryLink(chemicalLinks[categoryLinkKey(selectedItem.category)] ?? "")
    setItemLink(chemicalLinks[itemLinkKey(selectedItem.id)] ?? "")
    setLinkMessage("")
  }, [chemicalLinks, selectedItem])

  const ddConnections = useMemo(() => {
    const map = new Map<string, DdConnection[]>()
    const add = (flNo: string, connection: DdConnection) => {
      flValues(flNo).forEach((key) => {
        const current = map.get(key) ?? []
        if (!current.some((item) => item.key === connection.key)) map.set(key, [...current, connection])
      })
    }
    records.forEach((record) => add(record.flNo, {
      key: `dd:${record._src.sheet}:${record._src.row}`,
      source: "DD",
      styleNo: record.styleNo,
      owner: record.owner,
      completedAt: record.receivedDate || record.dueDate,
    }))
    completed.forEach((sample, index) => add(sample.flNo, {
      key: `completed:${sample.flNo}:${index}`,
      source: "완료대장",
      styleNo: sample.styleNo,
      owner: sample.owner,
      completedAt: sample.completedAt,
    }))
    return map
  }, [completed, records])

  const categoryEntries = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    return portfolio.categories.map((category, originalIndex) => ({
      category,
      originalIndex,
      items: category.items.filter((item) => {
        if (stateFilter !== "all" && stageOf(item.state) !== stateFilter) return false
        if (!normalizedQuery) return true
        const searchable = [item.chemical, item.fabrication, item.description, item.market, ...item.flNos]
          .join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR")
        return searchable.includes(normalizedQuery)
      }),
    }))
  }, [portfolio, query, stateFilter])

  const selectedEntry = categoryEntries.find((entry) => entry.category.name === selectedCategory) ?? categoryEntries[0]
  const matchingItemCount = categoryEntries.reduce((total, entry) => total + entry.items.length, 0)
  const isDemo = Boolean(portfolio.items.length && portfolio.items.every((item) => item.id.startsWith("chemical-demo-")))
  const activeConnections = activeFl ? ddConnections.get(normalizeFl(activeFl)) ?? [] : []
  const selectedMeta = selectedEntry ? featureMetaOf(selectedEntry.category) : DEFAULT_FEATURE_META

  const selectCategory = (name: string, scroll = false) => {
    setSelectedCategory(name)
    if (!scroll) return
    requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      categoryContentRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
    })
  }

  const saveLinks = async () => {
    if (!selectedItem) return
    if ((categoryLink && !httpsMaterialLink(categoryLink)) || (itemLink && !httpsMaterialLink(itemLink))) {
      setLinkMessage("공유 링크는 https:// 로 시작해야 합니다.")
      return
    }
    await saveChemicalLinks({
      [categoryLinkKey(selectedItem.category)]: categoryLink,
      [itemLinkKey(selectedItem.id)]: itemLink,
    })
    setLinkMessage("링크를 이 브라우저에 저장했습니다.")
  }

  const openNew = () => {
    setEditingItem(null)
    setFormOpen(true)
  }
  const openEdit = (item: ChemicalItem) => {
    if (item.source !== "web") return
    setSelectedItem(null)
    setEditingItem(item)
    setFormOpen(true)
  }
  const removeItem = async () => {
    if (!deleteTarget || deleteTarget.source !== "web") return
    setDeleting(true)
    setDeleteMessage("")
    try {
      await Promise.all((deleteTarget.attachments ?? []).map((attachment) => portfolioStore.deleteAttachment(attachment.id)))
      await portfolioStore.deleteManual(deleteTarget.id)
      if (selectedItem?.id === deleteTarget.id) setSelectedItem(null)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "삭제하지 못했습니다. 다시 시도해 주세요.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex h-[calc(100dvh-6rem)] min-h-0 min-w-0 flex-col gap-4 overflow-hidden sm:h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-7rem)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">PORTFOLIO</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">기능성 원단 포트폴리오</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">팀이 개발하고 검증한 기능성 원단 자산을 한곳에서 확인합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{isDemo ? <Button type="button" variant="outline" onClick={() => navigate("/setting")}>익명 데모 · 파일 연결하기</Button> : <Badge variant="secondary">업로드 + 웹 등록 데이터</Badge>}<Button type="button" onClick={openNew}><Plus aria-hidden="true" />신규 등록</Button></div>
      </div>

      <p className="shrink-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-xs text-[var(--muted-foreground)]">웹 등록 자료는 현재 이 브라우저에 저장됩니다.</p>

      <SplitPane
        orientation="horizontal"
        storageKey="portfolio-split-main"
        defaultRatio={35}
        min={20}
        max={65}
        ariaLabel="상단 현황과 기능 카테고리 높이 조절"
        className="min-h-0 flex-1"
        first={(
          <SplitPane
            orientation="vertical"
            storageKey="portfolio-split"
            defaultRatio={45}
            min={30}
            max={70}
            ariaLabel="OVERVIEW와 CATEGORY MIX 너비 조절"
            className="h-full"
            first={<PortfolioSummary portfolio={portfolio} />}
            second={<CategoryChart categories={portfolio.categories} onSelect={(name) => selectCategory(name, true)} />}
          />
        )}
        second={(
          <SectionCard
            title="기능 카테고리"
            subtitle={`전체 ${portfolio.totals.categories}개 기능 · 현재 조건 ${matchingItemCount.toLocaleString("ko-KR")}건`}
            wrapperClassName="min-h-0"
            className="flex min-h-0 flex-col xl:overflow-hidden"
            contentClassName="flex min-h-0 flex-1 flex-col xl:overflow-hidden"
          >
            <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" aria-label="상태 필터">
                {STATE_FILTERS.map((state) => (
                  <Button key={state.value} type="button" size="sm" variant={stateFilter === state.value ? "default" : "outline"} aria-pressed={stateFilter === state.value} onClick={() => setStateFilter(state.value)}>
                    {state.label}
                  </Button>
                ))}
              </div>
              <label className="relative block w-full lg:max-w-sm">
                <span className="sr-only">약품명, 원단 또는 FL 검색</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="약품명 · 원단 · FL 검색" className="pl-9" />
              </label>
            </div>

            {categoryEntries.length && selectedEntry ? (
              <SplitPane
                orientation="vertical"
                storageKey="portfolio-split-category"
                defaultRatio={22}
                min={15}
                max={45}
                ariaLabel="카테고리 목록과 카드 영역 너비 조절"
                className="mt-5 xl:flex-1"
                first={(
                  <nav aria-label="기능 카테고리 목록" className="h-[32rem] min-h-0 min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2 xl:h-full">
                    <div className="h-full min-h-0 space-y-1 overflow-y-auto pr-1">
                      {categoryEntries.map(({ category, items, originalIndex }) => {
                        const meta = featureMetaOf(category)
                        const active = category.name === selectedEntry.category.name
                        const filtered = items.length !== category.items.length
                        return (
                          <Reveal key={category.name} delay={Math.min(originalIndex, 6) * 50} className={STAGGER_CLASSES[Math.min(originalIndex, 6)]}>
                            <button type="button" aria-current={active ? "true" : undefined} onClick={() => selectCategory(category.name)} className={cn("grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius)] border border-l-4 px-3 py-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none", active ? meta.selectedTone : "border-transparent border-l-transparent hover:bg-[var(--card)]", !items.length && "opacity-60")}>
                              <FeatureIdentity category={category} />
                              <Badge variant={active ? "default" : "secondary"}>{filtered ? `${items.length}/${category.items.length}` : category.items.length}</Badge>
                            </button>
                          </Reveal>
                        )
                      })}
                    </div>
                  </nav>
                )}
                second={(
                  <div ref={categoryContentRef} className="h-[clamp(32rem,64vh,46rem)] min-h-0 min-w-0 scroll-mt-6 overflow-y-auto pb-8 pr-1 xl:h-full">
                    <div key={selectedEntry.category.name} className="animate-in fade-in slide-in-from-bottom-1 pb-8 duration-300 motion-reduce:animate-none">
                      <header className={cn("rounded-[var(--radius)] border border-l-4 border-[var(--border)] bg-[var(--card)] p-5", selectedMeta.borderTone)}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <FeatureIdentity category={selectedEntry.category} large />
                          <div className="text-right"><strong className="block text-2xl tabular-nums text-[var(--foreground)]">{selectedEntry.category.items.length}</strong><span className="text-xs text-[var(--muted-foreground)]">전체 개발 건</span></div>
                        </div>
                        <div className="mt-5"><StageBar items={selectedEntry.category.items} labels /></div>
                        <div className={cn("mt-5 border-l-4 bg-[var(--muted)] px-4 py-3", selectedMeta.borderTone)}><p className="text-xs font-semibold text-[var(--foreground)]">적용 대상 및 이유</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{selectedEntry.category.strategy || "카테고리 전략이 등록되지 않았습니다."}</p></div>
                      </header>

                      {selectedEntry.items.length ? <div className="mt-4 grid auto-rows-max items-start gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3">
                        {selectedEntry.items.map((item, index) => <Reveal key={item.id} delay={Math.min(index, 6) * 50} className={cn("self-start", STAGGER_CLASSES[Math.min(index, 6)])}><ItemCard item={item} category={selectedEntry.category} onOpen={() => setSelectedItem(item)} onEdit={() => openEdit(item)} onDelete={() => { setDeleteMessage(""); setDeleteTarget(item) }} /></Reveal>)}
                      </div> : <p className="mt-4 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">선택한 카테고리에서 조건에 맞는 개발 항목이 없습니다.</p>}
                    </div>
                  </div>
                )}
              />
            ) : (
              <p className="mt-5 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5 text-center text-sm text-[var(--muted-foreground)]">조건에 맞는 기능성 개발 항목이 없습니다.</p>
            )}
          </SectionCard>
        )}
      />

      <Dialog open={selectedItem !== null} onOpenChange={(open) => { if (!open) setSelectedItem(null) }}>
        <DialogContent className="max-w-3xl motion-reduce:animate-none motion-reduce:transition-none">
          {selectedItem ? (
            <>
              <DialogHeader className="pr-12">
                <div className="flex flex-wrap items-center gap-2"><StateBadge state={selectedItem.state} /><Badge variant="secondary">{selectedItem.category}</Badge><Badge variant={selectedItem.source === "web" ? "default" : "outline"}>{selectedItem.source === "web" ? "웹 등록" : "엑셀 출처 · 읽기 전용"}</Badge></div>
                <DialogTitle className="mt-2 text-xl">{selectedItem.chemical || "명칭 미등록"}</DialogTitle>
                <DialogDescription>기능성 개발 항목 상세</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-6 px-5 py-5 sm:px-7">
                <DetailSection title="Description & Effect"><p className="whitespace-pre-wrap">{selectedItem.description || "등록된 설명이 없습니다."}</p></DetailSection>
                <DetailSection title="Fabrication">
                  {selectedItem.fabrication ? (
                    <ol className="list-decimal space-y-1 pl-5">
                      {selectedItem.fabrication.split(/\r?\n|[;•]+/).map((line) => line.trim()).filter(Boolean).map((line, index) => <li key={`${line}-${index}`}>{line.replace(/^\d+[.)]\s*/, "")}</li>)}
                    </ol>
                  ) : <p>등록된 원단 정보가 없습니다.</p>}
                </DetailSection>
                <DetailSection title="Market Product Analysis"><p className="whitespace-pre-wrap">{selectedItem.market || "등록된 비교 정보가 없습니다."}</p></DetailSection>
                {selectedItem.source === "web" ? <DetailSection title="등록 정보"><div className="flex flex-wrap gap-4">{selectedItem.owner ? <span className="flex items-center gap-1"><UserRound className="size-4" aria-hidden="true" />등록자 {selectedItem.owner}</span> : null}{selectedItem.createdAt ? <span className="flex items-center gap-1"><CalendarDays className="size-4" aria-hidden="true" />등록일 {new Date(selectedItem.createdAt).toLocaleDateString("ko-KR")}</span> : null}</div></DetailSection> : null}
                <DetailSection title="FL# 연결">
                  {selectedItem.flNos.length ? (
                    <TooltipProvider delayDuration={200}>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.flNos.map((flNo) => {
                          const connections = ddConnections.get(normalizeFl(flNo)) ?? []
                          return connections.length ? (
                            <button key={flNo} type="button" onClick={() => setActiveFl(flNo)} aria-pressed={activeFl === flNo} className={cn("rounded-[var(--radius)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]", activeFl === flNo && "ring-2 ring-[var(--ring)]")}>
                              <Badge className="cursor-pointer bg-[var(--primary)] text-[var(--primary-foreground)]">{flNo}<Link2 className="ml-1 size-3" /></Badge>
                            </button>
                          ) : (
                            <Tooltip key={flNo}>
                              <TooltipTrigger asChild><span tabIndex={0} className="rounded-[var(--radius)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"><Badge variant="outline" className="text-[var(--muted-foreground)]">{flNo}</Badge></span></TooltipTrigger>
                              <TooltipContent>DD에 없는 과거 건</TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </TooltipProvider>
                  ) : <p>연결된 FL이 없습니다.</p>}
                  {selectedItem.passNotes.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedItem.passNotes.map((note, index) => <Badge key={`${note}-${index}`} className="bg-[var(--chart-2)] text-[var(--primary-foreground)]">PASS · {note}</Badge>)}</div> : null}
                  {activeFl ? (
                    <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{activeFl} DD 연결 정보</p>
                      {activeConnections.map((connection) => (
                        <dl key={connection.key} className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                          <dt>출처</dt><dd className="text-[var(--foreground)]">{connection.source}</dd>
                          <dt>스타일</dt><dd className="text-[var(--foreground)]">{connection.styleNo || "-"}</dd>
                          <dt>담당</dt><dd className="text-[var(--foreground)]">{connection.owner || "-"}</dd>
                          <dt>완료일</dt><dd className="text-[var(--foreground)]">{connection.completedAt ? connection.completedAt.slice(0, 10) : "-"}</dd>
                        </dl>
                      ))}
                    </div>
                  ) : null}
                </DetailSection>
                <AttachmentGallery attachments={selectedItem.attachments ?? []} />
                <DetailSection title="원본 자료 링크">
                  <div className="grid gap-4">
                    <div className="space-y-2"><Label htmlFor="portfolio-category-link">카테고리 링크</Label><Input id="portfolio-category-link" type="url" value={categoryLink} onChange={(event) => setCategoryLink(event.target.value)} placeholder="https://" /></div>
                    <div className="space-y-2"><Label htmlFor="portfolio-item-link">항목 링크</Label><Input id="portfolio-item-link" type="url" value={itemLink} onChange={(event) => setItemLink(event.target.value)} placeholder="https://" /></div>
                    <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={() => { void saveLinks() }}>링크 저장</Button><p aria-live="polite" className="text-xs text-[var(--muted-foreground)]">{linkMessage || "SharePoint 또는 OneDrive의 https 공유 링크를 저장합니다."}</p></div>
                  </div>
                </DetailSection>
              </DialogBody>
              <DialogFooter>
                {selectedItem.source === "web" ? <><Button type="button" variant="outline" onClick={() => openEdit(selectedItem)}><Pencil aria-hidden="true" />수정</Button><Button type="button" variant="destructive" onClick={() => { setDeleteMessage(""); setDeleteTarget(selectedItem) }}><Trash2 aria-hidden="true" />삭제</Button></> : null}
                {httpsMaterialLink(selectedItem.link) || httpsMaterialLink(itemLink) || httpsMaterialLink(categoryLink) ? <Button asChild><a href={httpsMaterialLink(selectedItem.link) ?? httpsMaterialLink(itemLink) ?? httpsMaterialLink(categoryLink)} target="_blank" rel="noopener noreferrer"><ExternalLink />원본 자료 열기</a></Button> : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <PortfolioForm open={formOpen} item={editingItem} categories={portfolio.categories} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingItem(null) }} />
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md motion-reduce:animate-none motion-reduce:transition-none">
          <DialogHeader><DialogTitle>웹 등록 항목 삭제</DialogTitle><DialogDescription>“{deleteTarget?.chemical}” 항목과 연결된 첨부 파일을 함께 삭제합니다. 이 작업은 되돌릴 수 없습니다.</DialogDescription></DialogHeader>
          {deleteMessage ? <DialogBody><p role="alert" className="text-sm text-[var(--destructive)]">{deleteMessage}</p></DialogBody> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</Button><Button type="button" variant="destructive" disabled={deleting} onClick={() => { void removeItem() }}>{deleting ? "삭제 중" : "삭제"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
