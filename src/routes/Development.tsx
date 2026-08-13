import { useEffect, useMemo, useState } from "react"
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Layers3,
  RotateCcw,
  Search,
  Shapes,
  TimerReset,
  TriangleAlert,
  Workflow,
} from "lucide-react"
import { useParams } from "react-router-dom"

import { RadialKpi, type RadialKpiTone } from "@/components/charts/RadialKpi"
import { LeadTimeGantt } from "@/components/charts/LeadTimeGantt"
import { OwnerLaneBoard } from "@/components/charts/OwnerLaneBoard"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { StatCard } from "@/components/dashboard/StatCard"
import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import { StatusBadge } from "@/components/data-table/StatusBadge"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Tilt3D } from "@/components/motion/Tilt3D"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  byOwnerDetailed,
  categoryOverview,
  categoryStyleList,
  completedLibrary,
  devTypeSplit,
  isInProgress,
  kpis,
  processFunnel,
  receiptStatus,
  sampleLeadTimeline,
  statusOf,
  subpageCardStats,
  type CategoryOverviewDatum,
  type CategoryStyleRow,
  type CompletedLibraryItem,
  type OwnerProcessKey,
} from "@/data/derive"
import { fmtDate, fmtDateFull, fmtNum, toDate } from "@/data/format"
import {
  DEFAULT_COLUMNS,
  FIELDS,
  STATUS,
  type CompletedSample,
  type DevRecord,
  type DevRecordFieldKey,
  type FieldDefinition,
} from "@/data/schema"
import { useAppStore } from "@/store/useAppStore"
import { ingestDevelopment, ingestSamples } from "@/data/upload"
import { hoverLift } from "@/lib/motion"
import { DevelopmentMasterSheet } from "@/routes/DevelopmentMasterSheet"

const ALL = "__all__"
const SUB_CATEGORY: Record<string, string | null> = {
  overview: null,
  workspace: null,
  eu: "EU MARKET",
  season: "SEASON",
  core: "CORE",
  project: "PROJECT",
}

const RADIAL_TONES: RadialKpiTone[] = ["one", "two", "three", "four"]
const PROCESS_STYLE: Record<OwnerProcessKey, { gradient: string; glow: string; dot: string }> = {
  unreceived: { gradient: "linear-gradient(90deg,#334155,#64748b,#94a3b8)", glow: "rgba(100,116,139,.4)", dot: "#64748b" },
  knitting: { gradient: "linear-gradient(90deg,#0e7490,#06b6d4,#a5f3fc)", glow: "rgba(6,182,212,.5)", dot: "#06b6d4" },
  dyeing: { gradient: "linear-gradient(90deg,#5b21b6,#8b5cf6,#ddd6fe)", glow: "rgba(139,92,246,.5)", dot: "#8b5cf6" },
  registration: { gradient: "linear-gradient(90deg,#065f46,#10b981,#6ee7b7)", glow: "rgba(16,185,129,.5)", dot: "#10b981" },
}
const CATEGORY_BAR_CLASS = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
]
type StatusFilter = "all" | "progress" | "due" | "late"

const MINI_MIX_CLASS = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
]
const FIVE_STAGE_CLASS = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
  "bg-[var(--chart-2)]",
]

function useAnimatedPercent(target: number): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target)
      return
    }
    setValue(0)
    const frame = window.requestAnimationFrame(() => setValue(target))
    return () => window.cancelAnimationFrame(frame)
  }, [target])

  return value
}

interface AnimatedBarProps {
  pct: number
  className: string
  label: string
}

function AnimatedBar({ pct, className, label }: AnimatedBarProps) {
  const animatedPct = useAnimatedPercent(pct)
  return (
    <div
      className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${className}`}
      style={{ width: `${animatedPct}%` }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    />
  )
}

interface ProcessStatusProps {
  owner: string
  total: number
  process: ReadonlyArray<{
    key: OwnerProcessKey
    label: string
    count: number
    pct: number
  }>
}

interface ProcessSegmentProps {
  owner: string
  total: number
  segment: ProcessStatusProps["process"][number]
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
}

function ProcessSegment({ owner, total, segment, active, onActivate, onDeactivate }: ProcessSegmentProps) {
  const animatedPct = useAnimatedPercent(segment.pct)
  return (
    <div
      className="group relative h-full min-w-0 first:rounded-l-full last:rounded-r-full outline-none transition-[width,filter,box-shadow] duration-700 ease-out hover:z-10 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
      style={{
        width: `${animatedPct}%`,
        background: PROCESS_STYLE[segment.key].gradient,
        boxShadow: active ? `0 0 0.75rem ${PROCESS_STYLE[segment.key].glow}` : undefined,
      }}
      role="progressbar"
      aria-label={`${owner} ${segment.label} ${segment.count}건, ${segment.pct}%`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={segment.count}
      tabIndex={segment.count ? 0 : -1}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      {/* 폭이 충분한(≥12%) 세그먼트는 막대 안에 % 를 직접 노출한다. */}
      {segment.pct >= 12 ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/95 drop-shadow-sm">{segment.pct}%</span>
      ) : null}
      <div className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] px-2.5 py-1.5 text-xs font-medium text-[var(--popover-foreground)] shadow-md group-hover:block group-focus-visible:block" role="tooltip">
        {segment.label}: {segment.count}건 ({segment.pct}%)
      </div>
    </div>
  )
}

function ProcessStatus({ owner, total, process }: ProcessStatusProps) {
  const [active, setActive] = useState<OwnerProcessKey | null>(null)
  const [countCycle, setCountCycle] = useState(0)

  const activate = (key: OwnerProcessKey) => {
    setActive(key)
    setCountCycle((cycle) => cycle + 1)
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Process status</p>
        <p className="shrink-0 text-xs text-[var(--muted-foreground)]">총 <strong className="font-semibold text-[var(--foreground)]">{total}</strong>건</p>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-[var(--muted)] shadow-inner" role="group" aria-label={`${owner} 공정별 누적 현황`}>
        {process.filter((segment) => segment.count > 0).map((segment) => (
          <ProcessSegment
            key={segment.key}
            owner={owner}
            total={total}
            segment={segment}
            active={active === segment.key}
            onActivate={() => activate(segment.key)}
            onDeactivate={() => setActive(null)}
          />
        ))}
        {total === 0 ? <span className="flex w-full items-center justify-center text-[10px] text-[var(--muted-foreground)]">데이터 없음</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="list" aria-label={`${owner} 공정별 범례`}>
        {process.map((segment) => {
          const isActive = active === segment.key
          return (
            <button
              key={segment.key}
              type="button"
              role="listitem"
              tabIndex={segment.count ? 0 : -1}
              onMouseEnter={() => activate(segment.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => activate(segment.key)}
              onBlur={() => setActive(null)}
              className={`min-w-0 rounded-[var(--radius)] border p-2 text-left outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${isActive ? "border-[var(--foreground)]/25 bg-[var(--muted)]" : "border-[var(--border)] bg-transparent hover:bg-[var(--muted)]"}`}
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: PROCESS_STYLE[segment.key].dot }} />
                <span className="truncate text-xs text-[var(--muted-foreground)]">{segment.label}</span>
              </span>
              <span className="mt-1 flex items-baseline gap-1">
                <strong className="text-lg font-semibold tabular-nums leading-none text-[var(--foreground)]"><NumberTicker key={`${segment.key}-${isActive ? countCycle : 0}`} value={segment.count} /></strong>
                <span className="text-[10px] text-[var(--muted-foreground)]">건 · {segment.pct}%</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface MiniSplitDonutProps {
  gd: number
  dom: number
  gdPct: number
  owner: string
}

function MiniSplitDonut({ gd, dom, gdPct, owner }: MiniSplitDonutProps) {
  const hasWork = gd + dom > 0
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${owner} GD ${gd}건, 국내 ${dom}건`}>
      <svg aria-hidden="true" viewBox="0 0 44 44" className="size-12 -rotate-90 shrink-0">
        <circle cx="22" cy="22" r="17" pathLength="100" fill="none" strokeWidth="6" className={hasWork ? "stroke-[var(--chart-4)]" : "stroke-[var(--muted)]"} />
        <circle
          cx="22"
          cy="22"
          r="17"
          pathLength="100"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${gdPct} ${100 - gdPct}`}
          className="stroke-[var(--chart-2)]"
        />
      </svg>
      <div className="space-y-1 text-xs">
        <p className="flex items-center gap-1.5 text-[var(--muted-foreground)]"><span className="size-2 rounded-full bg-[var(--chart-2)]" />GD <strong className="font-semibold text-[var(--foreground)]"><NumberTicker value={gd} duration={700} /></strong></p>
        <p className="flex items-center gap-1.5 text-[var(--muted-foreground)]"><span className="size-2 rounded-full bg-[var(--chart-4)]" />국내 <strong className="font-semibold text-[var(--foreground)]"><NumberTicker value={dom} duration={700} /></strong></p>
      </div>
    </div>
  )
}

function DevelopmentOverview({ records }: { records: readonly DevRecord[] }) {
  const completed = useAppStore((state) => state.completed)
  // DD 주간요약과 동일하게 오버뷰는 "진행중(Status=진행중)"만 집계한다(완료·HOLD 제외).
  const active = useMemo(() => records.filter(isInProgress), [records])
  const split = useMemo(() => devTypeSplit(active), [active])
  const activeTotal = active.length
  const receipt = useMemo(() => receiptStatus(active), [active])
  const funnel = useMemo(() => processFunnel(active), [active])
  const owners = useMemo(() => byOwnerDetailed(active), [active])
  const categories = useMemo(() => categoryOverview(active), [active])
  const [categoryDetail, setCategoryDetail] = useState<CategoryOverviewDatum | null>(null)
  const categoryStyles = useMemo(
    () => (categoryDetail ? categoryStyleList(active, categoryDetail.key) : []),
    [active, categoryDetail],
  )

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="DEVELOPMENT"
        subtitle="샘플 개발 유형과 공정 도달률, 담당자별 현황을 한눈에 확인합니다."
        actions={<div className="flex flex-wrap justify-end gap-2"><DataUpload kind="development-dd-overview" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} /><DataUpload kind="development-samples-overview" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} /></div>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
        <Reveal className="xl:col-span-2" delay={0}>
        <Card className="h-full overflow-hidden">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]">
              <Boxes aria-hidden="true" className="size-5" />
            </div>
            <div className="mt-8">
              <p className="text-sm font-medium text-[var(--muted-foreground)]">총 개발 (진행중)</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={activeTotal} duration={700} /></p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">진행중 반영 데이터 기준</p>
            </div>
          </CardContent>
        </Card>
        </Reveal>

        <Reveal className="xl:col-span-6" delay={75}>
        <Card className="h-full overflow-hidden">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium text-[var(--muted-foreground)]">개발 유형 (GD · 국내, 진행중)</p>
              <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">총 <NumberTicker value={split.total} duration={700} />건</span>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]"><span className="size-2 rounded-full bg-[var(--chart-2)]" aria-hidden="true" />GD개발</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={split.gd} duration={700} /><span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">건 · <NumberTicker value={split.gdPct} duration={700} suffix="%" /></span></p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]"><span className="size-2 rounded-full bg-[var(--chart-4)]" aria-hidden="true" />국내개발</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={split.dom} duration={700} /><span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">건 · <NumberTicker value={split.domPct} duration={700} suffix="%" /></span></p>
              </div>
            </div>
            <div className="mt-auto pt-5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--muted)]" role="img" aria-label={`GD ${split.gd}건 ${split.gdPct}%, 국내 ${split.dom}건 ${split.domPct}%`}>
                <div className="h-full bg-[var(--chart-2)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${split.gdPct}%` }} />
                <div className="h-full bg-[var(--chart-4)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${split.domPct}%` }} />
              </div>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">진행중 개발 중 GD·국내 비중</p>
            </div>
          </CardContent>
        </Card>
        </Reveal>

        <Reveal className="xl:col-span-4" delay={150}>
        <Card className="h-full overflow-hidden">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--chart-1)]">
              <CheckCircle2 aria-hidden="true" className="size-5" />
            </div>
            <div className="mt-8">
              <p className="text-sm font-medium text-[var(--muted-foreground)]">접수현황 <span className="text-[var(--chart-2)]">GD</span></p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={receipt.received} duration={700} /><span className="mx-1 text-base text-[var(--muted-foreground)]">/</span><NumberTicker value={receipt.total} duration={700} /></p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">GD개발 진행중 · GD# 기입 <NumberTicker value={receipt.receivedPct} duration={700} suffix="%" /> · 미기입 <NumberTicker value={receipt.missing} duration={700} suffix="건" /></p>
            </div>
          </CardContent>
        </Card>
        </Reveal>
      </div>

      <SectionCard title="4공정 KPI" subtitle="현재 단계 기준 누적 공정 도달률입니다." contentClassName="pt-2">
        <div className="grid gap-8 py-3 sm:grid-cols-2 xl:grid-cols-4">
          {funnel.map((item, index) => (
            <RadialKpi
              key={item.key}
              label={item.label}
              done={item.done}
              total={item.total}
              pct={item.pct}
              tone={RADIAL_TONES[index]}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="담당자별 현황" subtitle="개발 건수와 국내/GD 구성, 현재 공정 분포입니다." contentClassName="space-y-3">
        {owners.map((owner, index) => (
          <Reveal key={owner.id} delay={index * 75}>
          <article className={`grid gap-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,2.4fr)] lg:items-center ${hoverLift}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-semibold text-[var(--foreground)]">{owner.name.slice(0, 1)}</div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">{owner.name}</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">{owner.role}</p>
                </div>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={owner.total} /><span className="ml-1 text-xs font-medium text-[var(--muted-foreground)]">건</span></p>
            </div>

            <MiniSplitDonut gd={owner.gd} dom={owner.dom} gdPct={owner.gdPct} owner={owner.name} />

            <ProcessStatus owner={owner.name} total={owner.total} process={owner.process} />
          </article>
          </Reveal>
        ))}
      </SectionCard>

      <SectionCard title="Categories" subtitle="카테고리별 샘플 건수와 OPT 분포입니다. 카드를 클릭하면 대표 스타일을 확인할 수 있습니다.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((item, index) => (
            <Reveal key={item.key} delay={index * 75}>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setCategoryDetail(item)}
              className={`h-full w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${hoverLift}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]">
                  {index % 2 === 0 ? <Layers3 aria-hidden="true" className="size-4" /> : <ClipboardList aria-hidden="true" className="size-4" />}
                </div>
                <span className="text-xs font-semibold text-[var(--muted-foreground)]"><NumberTicker value={item.pct} suffix="%" /></span>
              </div>
              <h3 className="mt-5 text-sm font-semibold text-[var(--foreground)]">{item.label}</h3>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-3xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={item.count} /><span className="ml-1 text-xs font-medium text-[var(--muted-foreground)]">건</span></p>
                <p className="text-xs text-[var(--muted-foreground)]">OPT <strong className="font-semibold text-[var(--foreground)]"><NumberTicker value={item.options} /></strong></p>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                <AnimatedBar pct={item.pct} className={CATEGORY_BAR_CLASS[index % CATEGORY_BAR_CLASS.length]} label={`${item.label} 비율 ${item.pct}%`} />
              </div>
              <p className="mt-3 text-[11px] font-medium text-[var(--muted-foreground)]">대표 스타일 보기 →</p>
            </button>
            </Reveal>
          ))}
        </div>
      </SectionCard>

      <CompletedSampleLibrary records={records} samples={completed} />

      <CategoryStyleSheet category={categoryDetail} styles={categoryStyles} onOpenChange={(open) => { if (!open) setCategoryDetail(null) }} />
    </section>
  )
}

/** 카테고리 카드 클릭 시 대표 스타일 목록(담당자 포함) 팝업. */
function CategoryStyleSheet({
  category,
  styles,
  onOpenChange,
}: {
  category: CategoryOverviewDatum | null
  styles: CategoryStyleRow[]
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={category !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-2xl">
        {category ? (
          <>
            <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-[var(--foreground)]">{category.label} 대표 스타일</SheetTitle>
                <Badge variant="secondary">{styles.length}개 스타일</Badge>
                <Badge variant="outline">{category.count}건 · OPT {category.options}</Badge>
              </div>
              <SheetDescription className="text-[var(--muted-foreground)]">진행중 개발 기준 · 동일 Style No.는 OPT 수를 합쳐 표시합니다.</SheetDescription>
            </SheetHeader>
            {styles.length ? (
              <div className="p-4 sm:p-6">
                <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="whitespace-nowrap px-4">Style No.</TableHead>
                        <TableHead className="whitespace-nowrap px-4">담당자</TableHead>
                        <TableHead className="whitespace-nowrap px-4">Buyer</TableHead>
                        <TableHead className="whitespace-nowrap px-4">시즌</TableHead>
                        <TableHead className="whitespace-nowrap px-4 text-right">OPT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {styles.map((row) => (
                        <TableRow key={row.styleNo}>
                          <TableCell className="whitespace-nowrap px-4 font-mono font-medium text-[var(--foreground)]">{row.styleNo}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-[var(--foreground)]">{row.owners.length ? row.owners.join(", ") : "미지정"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-[var(--foreground)]">{row.buyer || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-[var(--foreground)]">{row.season || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-right font-semibold text-[var(--foreground)]">{row.options}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex min-h-52 items-center justify-center p-6 text-center text-sm text-[var(--muted-foreground)]">해당 카테고리의 진행중 스타일이 없습니다.</div>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

const rowId = (row: DevRecord) => `${row.styleNo}-${row.opt}-${row._src.sheet}-${row._src.row}`
const normalizedDateKey = (value: unknown) => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""
}

function displayField(row: DevRecord, key: DevRecordFieldKey, fullDate = false): string {
  const field = FIELDS.find((item) => item.key === key) as FieldDefinition | undefined
  const value = row[key]
  if (field?.type === "date") return fullDate ? fmtDateFull(value) : fmtDate(value)
  if (key === "weight") return fmtNum(value, field?.unit)
  return value === "" ? "—" : String(value)
}

function uniqueValues(rows: DevRecord[], key: DevRecordFieldKey): string[] {
  return [...new Set(rows.map((row) => String(row[key] ?? "")).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true }))
}

interface FilterSelectProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-36" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label} 전체</SelectItem>
        {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function CategoryMiniVisual({ items }: { items: ReturnType<typeof subpageCardStats>["categoryMix"] }) {
  const shown = items.slice(0, 4)
  return (
    <div role="img" aria-label={shown.length ? shown.map((item) => `${item.label} ${item.count}건`).join(", ") : "카테고리 데이터 없음"}>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        {shown.map((item, index) => (
          <span key={item.label} className={MINI_MIX_CLASS[index % MINI_MIX_CLASS.length]} style={{ width: `${item.pct}%` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {shown.length ? shown.map((item, index) => (
          <span key={item.label} className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className={`size-2 shrink-0 rounded-full ${MINI_MIX_CLASS[index % MINI_MIX_CLASS.length]}`} />
            <span className="truncate">{item.label}</span>
            <strong className="ml-auto font-semibold text-[var(--foreground)]">{item.count}</strong>
          </span>
        )) : <span className="col-span-2 text-xs text-[var(--muted-foreground)]">분류 데이터 없음</span>}
      </div>
    </div>
  )
}

function ProcessMiniVisual({ items }: { items: ReturnType<typeof subpageCardStats>["processMix"] }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  return (
    <div className="grid grid-cols-5 gap-1.5" role="img" aria-label={items.map((item) => `${item.label} ${item.count}건`).join(", ")}>
      {items.map((item, index) => (
        <span key={item.key} className="min-w-0 text-center">
          <span className="flex h-10 items-end justify-center rounded-[calc(var(--radius)-2px)] bg-[var(--muted)] px-1">
            <span className={`w-full rounded-t-sm transition-[height] duration-700 motion-reduce:transition-none ${FIVE_STAGE_CLASS[index]}`} style={{ height: `${item.count ? Math.max(18, (item.count / max) * 100) : 0}%` }} />
          </span>
          <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">{item.label}</span>
        </span>
      ))}
    </div>
  )
}

function BucketMiniVisual({ items, tone }: { items: Array<{ label: string; count: number }>; tone: "warning" | "destructive" }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  return (
    <div className="grid grid-cols-3 gap-2" role="img" aria-label={items.map((item) => `${item.label} ${item.count}건`).join(", ")}>
      {items.map((item) => (
        <span key={item.label} className="text-center">
          <span className="flex h-10 items-end justify-center rounded-[calc(var(--radius)-2px)] bg-[var(--muted)] px-2">
            <span className={`w-full rounded-t-sm transition-[height] duration-700 motion-reduce:transition-none ${tone === "warning" ? "bg-[var(--warning)]" : "bg-[var(--destructive)]"}`} style={{ height: `${item.count ? Math.max(18, (item.count / max) * 100) : 0}%` }} />
          </span>
          <span className="mt-1 flex items-center justify-center gap-1 text-xs text-[var(--muted-foreground)]"><span>{item.label}</span><strong className="font-semibold text-[var(--foreground)]">{item.count}</strong></span>
        </span>
      ))}
    </div>
  )
}

const completedLibraryRowId = (item: CompletedLibraryItem) => item.key

function completedOptions(
  items: readonly CompletedLibraryItem[],
  accessor: (item: CompletedLibraryItem) => string,
): string[] {
  return [...new Set(items.map(accessor).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR", { numeric: true }))
}

function monthFromDate(value: string): string {
  return normalizedDateKey(value).slice(0, 7)
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-")
  return `${year}년 ${Number(monthNumber)}월`
}

function CompletedSampleLibrary({ records, samples }: { records: readonly DevRecord[]; samples: readonly CompletedSample[] }) {
  const library = useMemo(() => completedLibrary(records, samples), [records, samples])
  const [search, setSearch] = useState("")
  const [season, setSeason] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [selectedItem, setSelectedItem] = useState<CompletedLibraryItem | null>(null)
  const latestMonth = useMemo(() => library.map((item) => monthFromDate(item.completedAt)).find(Boolean) || monthFromDate(new Date().toISOString()), [library])
  const [calendarMonth, setCalendarMonth] = useState("")

  useEffect(() => {
    if (latestMonth) setCalendarMonth(latestMonth)
  }, [latestMonth])

  const options = useMemo(() => ({
    season: completedOptions(library, (item) => item.season),
    category: completedOptions(library, (item) => item.category),
  }), [library])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return library.filter((item) => {
      if (season !== ALL && item.season !== season) return false
      if (category !== ALL && item.category !== category) return false
      if (!query) return true
      const buyer = item.record?.buyer || item.sample?.buyer || ""
      return [item.styleNo, item.flNo, item.construction, buyer, item.owner]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(query))
    })
  }, [category, library, search, season])

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return []
    const [year, monthNumber] = calendarMonth.split("-").map(Number)
    const first = new Date(year, monthNumber - 1, 1)
    const mondayOffset = (first.getDay() + 6) % 7
    const start = new Date(year, monthNumber - 1, 1 - mondayOffset)
    const byDate = new Map<string, CompletedLibraryItem[]>()
    for (const item of filteredItems) {
      const key = normalizedDateKey(item.completedAt)
      if (!key) continue
      const current = byDate.get(key) ?? []
      current.push(item)
      byDate.set(key, current)
    }
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      const key = normalizedDateKey(date)
      return { key, day: date.getDate(), inMonth: date.getMonth() === monthNumber - 1, items: byDate.get(key) ?? [] }
    })
  }, [calendarMonth, filteredItems])

  const columns = useMemo<DataTableColumn<CompletedLibraryItem>[]>(() => [
    { id: "styleNo", header: "Style No.", accessor: (item) => item.styleNo, cell: (item) => <span className="font-mono font-semibold">{item.styleNo || "—"}</span> },
    { id: "flNo", header: "FL No.", accessor: (item) => item.flNo, cell: (item) => <span className="font-mono">{item.flNo || "—"}</span> },
    { id: "season", header: "시즌", accessor: (item) => item.season },
    { id: "category", header: "카테고리", accessor: (item) => item.category },
    { id: "construction", header: "조직", accessor: (item) => item.construction },
    { id: "owner", header: "담당", accessor: (item) => item.owner },
    { id: "completedAt", header: "완료일", accessor: (item) => item.completedAt, cell: (item) => fmtDateFull(item.completedAt) },
    { id: "source", header: "출처", accessor: (item) => item.source, cell: (item) => <Badge variant={item.source === "DD" ? "default" : "outline"}>{item.source}</Badge> },
  ], [])

  const resetFilters = () => {
    setSearch("")
    setSeason(ALL)
    setCategory(ALL)
  }

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative block min-w-0 flex-1 lg:max-w-md">
        <span className="sr-only">완료 샘플 검색</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Style, FL, 조직, Buyer, 담당 검색" className="pl-9" />
      </label>
      <div className="flex flex-wrap gap-2">
        <FilterSelect label="시즌" value={season} options={options.season} onChange={setSeason} />
        <FilterSelect label="카테고리" value={category} options={options.category} onChange={setCategory} />
        <Button type="button" variant="outline" onClick={resetFilters}><RotateCcw aria-hidden="true" />초기화</Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <SectionCard title="완료 캘린더" subtitle="DD 완료건과 샘플대장 아카이브를 완료일 기준으로 통합했습니다." contentClassName="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <Button type="button" variant="outline" size="icon" onClick={() => setCalendarMonth((month) => shiftMonth(month || latestMonth, -1))} aria-label="이전 달"><ChevronLeft aria-hidden="true" /></Button>
          <div className="text-center"><p className="font-semibold text-[var(--foreground)]">{calendarMonth ? monthLabel(calendarMonth) : "—"}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">검색 조건과 연동 · 날짜 카드를 눌러 상세 보기</p></div>
          <Button type="button" variant="outline" size="icon" onClick={() => setCalendarMonth((month) => shiftMonth(month || latestMonth, 1))} aria-label="다음 달"><ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--muted)]/50 text-center text-xs font-medium text-[var(--muted-foreground)]">
          {['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day} className="py-2">{day}</span>)}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => (
            <div key={day.key} className={`min-h-28 border-b border-r border-[var(--border)] p-1.5 last:border-r-0 ${day.inMonth ? "bg-[var(--card)]" : "bg-[var(--muted)]/35 text-[var(--muted-foreground)]"}`}>
              <span className="block px-1 text-xs font-medium">{day.day}</span>
              <div className="mt-1 grid gap-1">
                {day.items.slice(0, 3).map((item) => (
                  <Tilt3D key={item.key} max={5} lift={4} glare={false}>
                    <button type="button" onClick={() => setSelectedItem(item)} className="flex w-full items-center gap-1 rounded-[calc(var(--radius)-2px)] border border-[var(--border)] bg-[var(--background)] px-1.5 py-1 text-left shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${item.source === "DD" ? "bg-[var(--chart-1)]" : "bg-[var(--chart-4)]"}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--foreground)]">{item.styleNo || item.flNo}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{item.source}</span>
                    </button>
                  </Tilt3D>
                ))}
                {day.items.length > 3 ? <span className="px-1 text-xs font-semibold text-[var(--muted-foreground)]">+{day.items.length - 3}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="전체 완료 샘플" subtitle={`전체 ${library.length.toLocaleString("ko-KR")}건 · 검색 결과 ${filteredItems.length.toLocaleString("ko-KR")}건 · DD 우선 병합`} contentClassName="p-0">
        <DataTable columns={columns} rows={filteredItems} getRowId={completedLibraryRowId} pageSize={20} toolbar={toolbar} onRowClick={setSelectedItem} emptyMessage="조건에 맞는 완료 샘플이 없습니다." />
      </SectionCard>

      <DevelopmentDetailSheet libraryItem={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} />
    </div>
  )
}

const hasValue = (value: unknown): boolean => value !== undefined && value !== null && value !== ""
const hasObjectValue = (value: object | undefined): boolean => Boolean(value && Object.values(value).some((item) => typeof item === "object" && item !== null ? hasObjectValue(item) : Array.isArray(item) ? item.some(hasValue) : hasValue(item)))
const detailValue = (value: unknown, unit = ""): string => hasValue(value) ? `${String(value)}${unit}` : "—"

function DetailPairs({ pairs }: { pairs: Array<[string, unknown, string?]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      {pairs.map(([label, value, unit]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
          <dd className="mt-1 break-words text-sm text-[var(--foreground)]">{detailValue(value, unit)}</dd>
        </div>
      ))}
    </dl>
  )
}

function DevelopmentDetailSheet({ record = null, libraryItem = null, onOpenChange }: { record?: DevRecord | null; libraryItem?: CompletedLibraryItem | null; onOpenChange: (open: boolean) => void }) {
  const resolvedRecord = libraryItem?.record ?? record
  const sample = libraryItem?.sample ?? null
  const tech = resolvedRecord?.tech
  const open = Boolean(resolvedRecord || libraryItem)
  const ddProcessTechnical = Boolean(
    hasObjectValue(tech?.mills) || hasObjectValue(tech?.processDates)
    || hasValue(tech?.yarnDetail) || Boolean(tech?.finishing?.some(hasValue)),
  )
  const processVisible = Boolean(
    ddProcessTechnical || hasValue(resolvedRecord?.note)
    || (sample && Object.values(sample.process).some(hasValue)),
  )
  const physicalVisible = Boolean(
    hasObjectValue(tech?.actual) || hasObjectValue(tech?.stageData) || hasObjectValue(tech?.finish)
    || (sample && (hasValue(sample.inhouse.widthCm) || hasValue(sample.inhouse.weightGsm)
      || (typeof sample.inhouse.shrinkagePct === "number" ? hasValue(sample.inhouse.shrinkagePct) : hasObjectValue(sample.inhouse.shrinkagePct)))),
  )
  const fabricVisible = Boolean(hasObjectValue(tech?.knitSpec) || hasObjectValue(tech?.original))
  const historyVisible = Boolean(tech && [tech.passFail, tech.failReason, tech.styleHistory, tech.review, tech.arrangeNo, tech.optionProgress].some(hasValue))
  const title = resolvedRecord?.styleNo || libraryItem?.styleNo || sample?.styleNo || "완료 샘플"
  const detailKey = `${libraryItem?.key ?? (resolvedRecord ? rowId(resolvedRecord) : "closed")}-${open}`
  const tabCount = 1 + Number(processVisible) + Number(physicalVisible) + Number(fabricVisible) + Number(historyVisible)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-3xl">
        {open ? (
          <>
            <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-[var(--foreground)]">{title}{resolvedRecord?.opt ? ` · ${resolvedRecord.opt}` : ""}</SheetTitle>
                {resolvedRecord ? <StatusBadge status={STATUS[statusOf(resolvedRecord)].label} /> : null}
                {libraryItem ? <Badge variant={libraryItem.source === "DD" ? "default" : "outline"}>{libraryItem.source === "DD" ? "DD · 기술데이터" : "대장 아카이브 · DD 미연결"}</Badge> : null}
              </div>
              <SheetDescription className="text-[var(--muted-foreground)]">{libraryItem ? `${libraryItem.flNo || "FL 미기재"} · 완료 ${fmtDateFull(libraryItem.completedAt)}` : "개발 항목과 공정·물성·이력 기술데이터입니다."}</SheetDescription>
            </SheetHeader>

            <Tabs key={detailKey} defaultValue="overview" className="min-w-0 p-6">
              <TabsList className="flex h-auto w-full justify-start overflow-x-auto" aria-label={`개발 상세 ${tabCount}개 탭`}>
                <TabsTrigger value="overview">개요</TabsTrigger>
                {processVisible ? <TabsTrigger value="process">공정</TabsTrigger> : null}
                {physicalVisible ? <TabsTrigger value="physical">물성</TabsTrigger> : null}
                {fabricVisible ? <TabsTrigger value="fabric">편직·원단</TabsTrigger> : null}
                {historyVisible ? <TabsTrigger value="history">이력</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                {resolvedRecord ? (
                  <>
                    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                      {FIELDS.map((field) => (
                        <div key={field.key} className={field.key === "note" ? "sm:col-span-2" : undefined}>
                          <dt className="text-xs font-medium text-[var(--muted-foreground)]">{field.label}</dt>
                          <dd className="mt-1 break-words text-sm text-[var(--foreground)]">{displayField(resolvedRecord, field.key, true)}</dd>
                        </div>
                      ))}
                      <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">접수일</dt><dd className="mt-1 text-sm text-[var(--foreground)]">{fmtDateFull(resolvedRecord.requestDate)}</dd></div>
                      <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">완료일</dt><dd className="mt-1 text-sm text-[var(--foreground)]">{fmtDateFull(resolvedRecord.receivedDate)}</dd></div>
                      <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">Status</dt><dd className="mt-1 text-sm text-[var(--foreground)]">{resolvedRecord.devStatus || STATUS[statusOf(resolvedRecord)].label}</dd></div>
                    </dl>
                    <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4"><p className="text-xs font-medium text-[var(--muted-foreground)]">원본 위치</p><p className="mt-1 text-sm text-[var(--foreground)]">{resolvedRecord._src.sheet} · {resolvedRecord._src.row}행</p></div>
                  </>
                ) : libraryItem ? (
                  <DetailPairs pairs={[["Style No.", libraryItem.styleNo], ["FL No.", libraryItem.flNo], ["시즌", libraryItem.season], ["카테고리", libraryItem.category], ["Buyer", sample?.buyer], ["담당", libraryItem.owner], ["조직", libraryItem.construction], ["완료일", fmtDateFull(libraryItem.completedAt)], ["원본 시트", sample?.sourceSheet]]} />
                ) : null}
              </TabsContent>

              {processVisible ? (
                <TabsContent value="process" className="mt-6 space-y-5">
                  {tech && ddProcessTechnical ? (
                    <div className="rounded-[var(--radius)] border border-[var(--border)]">
                      {[
                        ["원사", tech.mills?.yarn, tech.processDates?.yarn],
                        ["편직", tech.mills?.knitting, tech.processDates?.knitting],
                        ["염색", tech.mills?.dyeing, tech.processDates?.dyeing],
                        ["가공", tech.mills?.finishing, tech.processDates?.finishing],
                      ].map(([label, mill, date], index) => (
                        <div key={label} className="relative grid gap-2 border-b border-[var(--border)] px-4 py-4 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)_8rem] sm:items-center">
                          <span className={`absolute bottom-0 left-0 top-0 w-1 ${MINI_MIX_CLASS[index]}`} aria-hidden="true" />
                          <strong className="text-sm text-[var(--foreground)]">{label}</strong><span className="text-sm text-[var(--foreground)]">{detailValue(mill)}</span><span className="text-xs text-[var(--muted-foreground)]">{fmtDateFull(date)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {sample && !ddProcessTechnical ? <DetailPairs pairs={[["원사", sample.process.yarn], ["편직", sample.process.knit], ["염색", sample.process.dye], ["가공", sample.process.finish], ["Remark", sample.process.remark]]} /> : null}
                  {resolvedRecord ? <DetailPairs pairs={[["Yarn Detail", tech?.yarnDetail], ["Finishing A~D", tech?.finishing?.join(" · ")], ["Remark", resolvedRecord.note]]} /> : null}
                </TabsContent>
              ) : null}

              {physicalVisible ? (
                <TabsContent value="physical" className="mt-6 space-y-5">
                  {tech?.actual ? <DetailPairs pairs={[["Actual Width", tech.actual.width, " cm"], ["Actual Weight", tech.actual.weight, " g/m²"], ["Balance", tech.actual.balance], ["축률 L", tech.actual.shrinkageLength, " %"], ["축률 W", tech.actual.shrinkageWidth, " %"]]} /> : null}
                  {sample && !tech?.actual ? <DetailPairs pairs={[["폭", sample.inhouse.widthCm, " cm"], ["중량", sample.inhouse.weightGsm, " g/m²"], ["축률", typeof sample.inhouse.shrinkagePct === "number" ? sample.inhouse.shrinkagePct : `장 ${detailValue(sample.inhouse.shrinkagePct.length)} % · 폭 ${detailValue(sample.inhouse.shrinkagePct.width)} %`]]} /> : null}
                  {tech?.stageData ? (
                    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]"><Table><TableHeader><TableRow><TableHead>단계</TableHead><TableHead>폭</TableHead><TableHead>중량</TableHead></TableRow></TableHeader><TableBody>{[["Greige", tech.stageData.greige], ["Tenter", tech.stageData.tenter], ["Wash", tech.stageData.wash]].map(([label, data]) => { const metric = data as { width?: number | null; weight?: number | null } | undefined; return <TableRow key={label as string}><TableCell className="font-medium">{label as string}</TableCell><TableCell>{fmtNum(metric?.width, " cm")}</TableCell><TableCell>{fmtNum(metric?.weight, " g/m²")}</TableCell></TableRow> })}</TableBody></Table></div>
                  ) : null}
                  {tech?.finish ? <DetailPairs pairs={[["Finish Brush", tech.finish.brush], ["Finish Chemical", tech.finish.chemical]]} /> : null}
                </TabsContent>
              ) : null}

              {fabricVisible ? (
                <TabsContent value="fabric" className="mt-6 space-y-6">
                  {tech?.knitSpec ? <div><h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">편직 사양</h3><DetailPairs pairs={[["Inch", tech.knitSpec.inch], ["Gauge", tech.knitSpec.gauge], ["Needles", tech.knitSpec.needles], ["Loop F", tech.knitSpec.loopF], ["Loop T", tech.knitSpec.loopT], ["Loop B", tech.knitSpec.loopB]]} /></div> : null}
                  {tech?.original ? <div className="border-t border-[var(--border)] pt-6"><h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">ORIGINAL 분석</h3><DetailPairs pairs={[["Brand", tech.original.brand], ["Contents", tech.original.contents], ["Yarn", tech.original.yarn], ["Org./Target Weight", resolvedRecord?.weight, " g/m²"], ["Comments", tech.original.comments]]} /></div> : null}
                </TabsContent>
              ) : null}

              {historyVisible ? <TabsContent value="history" className="mt-6"><DetailPairs pairs={[["Pass/Fail", tech?.passFail], ["Fail 사유", tech?.failReason], ["Style History", tech?.styleHistory], ["Review", tech?.review], ["Arrange#", tech?.arrangeNo], ["옵션 완료", tech?.optionProgress]]} /></TabsContent> : null}
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export function Development() {
  const { sub } = useParams<{ sub?: string }>()
  const records = useAppStore((state) => state.records)
  const overview = !sub || sub === "overview"

  if (overview) return <DevelopmentOverview records={records} />
  if (sub === "workspace") return <DevelopmentMasterPage />
  return <DevelopmentList />
}

function DevelopmentMasterPage() {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-4 pt-4 sm:px-6 lg:px-8">
      <PageHeader
        title="DD MASTER"
        subtitle="Development Dashboard 64열을 기준으로 접수·수정·완료와 샘플대장 연결을 관리합니다."
        actions={<div className="flex flex-wrap justify-end gap-2"><DataUpload kind="development-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} /><DataUpload kind="development-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} /></div>}
      />
      <DevelopmentMasterSheet />
    </section>
  )
}

function DevelopmentList() {
  const { sub } = useParams<{ sub?: string }>()
  const records = useAppStore((state) => state.records)
  const [view, setView] = useState("list")
  const [search, setSearch] = useState("")
  const [season, setSeason] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [buyer, setBuyer] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  const [stage, setStage] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [selectedRecord, setSelectedRecord] = useState<DevRecord | null>(null)
  const today = useMemo(() => new Date(), [])

  const routeCategory = SUB_CATEGORY[sub ?? "overview"] ?? null
  const scopedRecords = useMemo(
    () => routeCategory ? records.filter((row) => row.category === routeCategory) : records,
    [records, routeCategory],
  )
  const options = useMemo(() => ({
    season: uniqueValues(scopedRecords, "season"),
    category: uniqueValues(scopedRecords, "category"),
    buyer: uniqueValues(scopedRecords, "buyer"),
    owner: uniqueValues(scopedRecords, "owner"),
    stage: uniqueValues(scopedRecords, "stage"),
  }), [scopedRecords])

  const scopedFiltered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR")
    return scopedRecords.filter((row) => {
      if (season !== ALL && row.season !== season) return false
      if (category !== ALL && row.category !== category) return false
      if (buyer !== ALL && row.buyer !== buyer) return false
      if (owner !== ALL && row.owner !== owner) return false
      if (stage !== ALL && row.stage !== stage) return false
      if (!query) return true
      return FIELDS.some((field) => String(row[field.key] ?? "").toLocaleLowerCase("ko-KR").includes(query))
    })
  }, [buyer, category, owner, scopedRecords, search, season, stage])

  const summary = useMemo(() => kpis(scopedFiltered, today), [scopedFiltered, today])
  const cardStats = useMemo(() => subpageCardStats(scopedFiltered, today), [scopedFiltered, today])
  const visibleRows = useMemo(
    () => statusFilter === "all" ? scopedFiltered : scopedFiltered.filter((row) => statusOf(row, today) === statusFilter),
    [scopedFiltered, statusFilter, today],
  )
  const boardRows = useMemo(() => visibleRows.filter((row) => row.stage !== "시험"), [visibleRows])
  const timeline = useMemo(() => sampleLeadTimeline(visibleRows, today), [today, visibleRows])
  const columns = useMemo<DataTableColumn<DevRecord>[]>(() => {
    const base = DEFAULT_COLUMNS.map((key) => {
      const field = FIELDS.find((item) => item.key === key) as FieldDefinition
      return {
        id: key,
        header: field.label,
        accessor: (row: DevRecord) => row[key],
        cell: (row: DevRecord) => displayField(row, key),
        className: field.align === "right" ? "text-right" : field.align === "center" ? "text-center" : undefined,
        headerClassName: field.align === "right" ? "text-right" : field.align === "center" ? "text-center" : undefined,
      }
    })
    return [
      ...base,
      {
        id: "status",
        header: "상태",
        accessor: (row) => STATUS[statusOf(row, today)].label,
        cell: (row) => <StatusBadge status={STATUS[statusOf(row, today)].label} />,
      },
    ]
  }, [today])

  const resetFilters = () => {
    setSearch("")
    setSeason(ALL)
    setCategory(ALL)
    setBuyer(ALL)
    setOwner(ALL)
    setStage(ALL)
    setStatusFilter("all")
  }

  const toolbar = (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <label className="relative block min-w-0 flex-1 xl:max-w-sm">
        <span className="sr-only">개발 건 검색</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Style No., Buyer, 담당 검색" className="pl-9" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:flex">
        <FilterSelect label="시즌" value={season} options={options.season} onChange={setSeason} />
        <FilterSelect label="카테고리" value={category} options={options.category} onChange={setCategory} />
        <FilterSelect label="Buyer" value={buyer} options={options.buyer} onChange={setBuyer} />
        <FilterSelect label="담당" value={owner} options={options.owner} onChange={setOwner} />
        <FilterSelect label="공정 단계" value={stage} options={options.stage} onChange={setStage} />
        <Button type="button" variant="outline" onClick={resetFilters}>
          <RotateCcw aria-hidden="true" />
          초기화
        </Button>
      </div>
    </div>
  )

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="DEVELOPMENT"
        subtitle={view === "completed"
          ? "카테고리 라우트와 무관한 전체 완료 샘플 아카이브입니다."
          : routeCategory
            ? `${routeCategory} 카테고리 개발 현황입니다.`
            : "개발 건의 전체 진행 현황을 확인합니다."}
        actions={<div className="flex flex-wrap justify-end gap-2"><DataUpload kind="development-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} /><DataUpload kind="development-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} /></div>}
      />

      {view !== "completed" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tilt3D max={9} lift={10}>
            <StatCard icon={<Shapes aria-hidden="true" className="size-4" />} label="전체" value={summary.total} caption="현재 검색·선택 필터 기준" info="상태 필터 적용 전 전체 건수입니다." revealDelay={0} pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")} visual={<CategoryMiniVisual items={cardStats.categoryMix} />} />
          </Tilt3D>
          <Tilt3D max={9} lift={10}>
            <StatCard icon={<Workflow aria-hidden="true" className="size-4" />} label="진행" value={summary.progress} caption="완료 전 개발 건" info="카드를 다시 누르면 전체 보기로 돌아갑니다." revealDelay={75} pressed={statusFilter === "progress"} onClick={() => setStatusFilter((current) => current === "progress" ? "all" : "progress")} visual={<ProcessMiniVisual items={cardStats.processMix} />} />
          </Tilt3D>
          <Tilt3D max={9} lift={10}>
            <StatCard icon={<TimerReset aria-hidden="true" className="size-4" />} label="임박" value={summary.dueSoon} caption="납기까지 3일 이내" info="D-7 일정 분포와 임박 상태 건을 함께 확인합니다." tone="warning" revealDelay={150} pressed={statusFilter === "due"} onClick={() => setStatusFilter((current) => current === "due" ? "all" : "due")} visual={<BucketMiniVisual items={cardStats.dueBuckets} tone="warning" />} />
          </Tilt3D>
          <Tilt3D max={9} lift={10}>
            <StatCard icon={<TriangleAlert aria-hidden="true" className="size-4" />} label="지연" value={summary.late} caption="납기일 경과" info="지연 일수 구간별 건수입니다." tone="destructive" revealDelay={200} pressed={statusFilter === "late"} onClick={() => setStatusFilter((current) => current === "late" ? "all" : "late")} visual={<BucketMiniVisual items={cardStats.lateBuckets} tone="destructive" />} />
          </Tilt3D>
        </div>
      ) : null}

      <Tabs value={view} onValueChange={setView} className="min-w-0">
        <TabsList aria-label="개발 현황 보기">
          <TabsTrigger value="list">목록</TabsTrigger>
          <TabsTrigger value="board">보드</TabsTrigger>
          <TabsTrigger value="timeline">타임라인</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-6">
          <SectionCard
            title="개발 목록"
            subtitle={`필터 결과 ${visibleRows.length.toLocaleString("ko-KR")}건 · 행을 선택하면 상세를 확인할 수 있습니다.`}
            contentClassName="p-0"
          >
            <DataTable
              columns={columns}
              rows={visibleRows}
              getRowId={rowId}
              enableSelection
              pageSize={10}
              toolbar={toolbar}
              onRowClick={setSelectedRecord}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="board" className="mt-6">
          <SectionCard title="공정 보드" subtitle={`필터 결과 ${boardRows.length.toLocaleString("ko-KR")}건 · 시험 단계는 보드에서 제외 · 조회 전용`} contentClassName="p-0">
            <div className="border-b border-[var(--border)] p-4">{toolbar}</div>
            <OwnerLaneBoard rows={boardRows} today={today} onSelect={setSelectedRecord} />
          </SectionCard>
        </TabsContent>
        <TabsContent value="timeline" className="mt-6">
          <SectionCard title="샘플 리드타임" subtitle={`필터 결과 ${visibleRows.length.toLocaleString("ko-KR")}건 · 접수일부터 완료일/납기일까지`} contentClassName="p-0">
            <div className="border-b border-[var(--border)] p-4">{toolbar}</div>
            <LeadTimeGantt rows={timeline.rows} minDate={timeline.minDate} maxDate={timeline.maxDate} todayPct={timeline.todayPct} today={today} onSelect={setSelectedRecord} />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <DevelopmentDetailSheet record={selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecord(null) }} />
    </section>
  )
}
