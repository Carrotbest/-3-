import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUpRight, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList,
  FlaskConical, Layers3, LoaderCircle, Microscope, RefreshCw,
  Plus, Sparkles, TimerReset, TrendingUp, Waves, Wrench,
} from "lucide-react"
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { CoverflowGallery } from "@/components/cards/CoverflowGallery"
import { MaterialDeck, MaterialDetailSheet, MaterialFormSheet } from "@/components/cards/MaterialDeck"
import type { PinBoardItem } from "@/components/cards/PinBoard"
import { OwnerLaneBoard } from "@/components/charts/OwnerLaneBoard"
import { TeamSchedule } from "@/components/dashboard/TeamSchedule"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Tilt3D } from "@/components/motion/Tilt3D"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  homeKpiRecordDetails,
  homeSectionCards,
  defaultHomeDateRanges,
  homeTrendCards,
  homeWorkSummary,
  materialsOf,
  monthlyDevelopmentTrend,
  RDDA_ARCHIVE_CUTOFF_MONTH,
  studyMaterials as deriveStudyMaterials,
  tsMaterials as deriveTsMaterials,
  type HomeKpiDetailGroups,
  type HomeKpiDetailKind,
  type HomeKpiRanges,
  type MonthlyDevelopmentDatum,
  type TrendCard,
} from "@/data/derive"
import { fmtDate, fmtDateFull } from "@/data/format"
import type { ChemicalPortfolio } from "@/data/chemical"
import type { MaterialItem, MaterialKind } from "@/data/schema"
import { ingestDevelopment, ingestSamples } from "@/data/upload"
import { hoverLift } from "@/lib/motion"
import { useAppStore } from "@/store/useAppStore"

function KpiCard({ icon, label, value, rangeLabel, caption, delay = 0, children, onClick, onCalendarClick }: {
  icon: ReactNode
  label: string
  value: number
  /** 카드 본문에 크게 노출하는 조회 기간. */
  rangeLabel: string
  caption: string
  delay?: number
  children?: ReactNode
  onClick: () => void
  onCalendarClick?: () => void
}) {
  return (
    <Reveal delay={delay}>
      <Card className={`h-full overflow-hidden ${hoverLift}`}>
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]">{icon}</span>
            <div className="flex items-center gap-2">
              {onCalendarClick ? (
                <Button type="button" variant="outline" size="icon" className="size-8" aria-label={`${label} 기간 설정`} onClick={onCalendarClick}>
                  <CalendarDays className="size-4" />
                </Button>
              ) : null}
              <Badge variant="secondary">DD 전체현황</Badge>
            </div>
          </div>
          <button type="button" aria-haspopup="dialog" onClick={onClick} className="mt-4 w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
            <p className="mt-5 text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
              <NumberTicker value={value} /><span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">건</span>
            </p>
            <p className="mt-2 text-base font-semibold tracking-tight text-[var(--foreground)]">{rangeLabel}</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{caption}</p>
          </button>
          {children}
        </CardContent>
      </Card>
    </Reveal>
  )
}

function ScheduleCard({ dueSoon, late, onClick }: { dueSoon: number; late: number; onClick: () => void }) {
  return (
    <Reveal delay={150}>
      <button type="button" aria-haspopup="dialog" onClick={onClick} className={`block h-full w-full cursor-pointer rounded-[var(--radius)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${hoverLift}`}>
        <Card className="h-full overflow-hidden">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><CalendarDays className="size-4" /></span>
              <Badge variant="secondary">DD 전체현황</Badge>
            </div>
            <p className="mt-5 text-sm font-medium text-[var(--muted-foreground)]">스케줄</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div className="rounded-[var(--radius)] border-l-[3px] border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2">
                <p className="text-xs font-medium text-[var(--warning)]">납기 임박 <span className="font-semibold">D-7</span></p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--warning)]"><NumberTicker value={dueSoon} /><span className="ml-1 text-sm font-medium opacity-80">건</span></p>
              </div>
              <div className="rounded-[var(--radius)] border-l-[3px] border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] px-3 py-2">
                <p className="text-xs font-medium text-[var(--destructive)]">납기 지연 <span className="font-semibold">D+</span></p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--destructive)]"><NumberTicker value={late} /><span className="ml-1 text-sm font-medium opacity-80">건</span></p>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">진행 중 · Due Date 기준</p>
          </CardContent>
        </Card>
      </button>
    </Reveal>
  )
}

const QUICK_ACCESS_ACCENTS = [
  "from-[#5B6CFF] to-[#8B5CF6]",
  "from-[#8B5CF6] to-[#EC4899]",
  "from-[#0EA5E9] to-[#22D3EE]",
  "from-[#34D399] to-[#10B981]",
  "from-[#F59E0B] to-[#F97316]",
  "from-[#6366F1] to-[#3B82F6]",
  "from-[#14B8A6] to-[#0EA5E9]",
  "from-[#A855F7] to-[#6366F1]",
] as const

function QuickAccessGrid({ items, onNavigate }: { items: readonly PinBoardItem[]; onNavigate: (path: string) => void }) {
  return (
    <Reveal delay={120}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => {
            const Icon = item.icon
            const accent = QUICK_ACCESS_ACCENTS[index % QUICK_ACCESS_ACCENTS.length]
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                className="group relative flex min-h-[6.5rem] items-center gap-3 overflow-hidden rounded-[10px] border border-white/70 bg-white/55 px-3 text-left shadow-[0_1px_2px_rgba(16,24,64,0.05),0_12px_24px_-14px_rgba(76,91,212,0.4)] outline-none backdrop-blur-md transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(16,24,64,0.07),0_18px_34px_-12px_rgba(76,91,212,0.55)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none motion-reduce:transition-none"
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-px bg-white/90" />
                <span aria-hidden="true" className={`pointer-events-none absolute -right-5 -top-7 size-16 rounded-full bg-gradient-to-br ${accent} opacity-[0.14] blur-xl transition-opacity duration-300 group-hover:opacity-40 motion-reduce:transition-none`} />
                <span className={`relative flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br ${accent} text-white shadow-[0_5px_12px_-3px_rgba(76,91,212,0.6)]`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="relative min-w-0 flex-1">
                  <strong className="block truncate text-[13px] font-semibold text-[var(--foreground)]">{item.title}</strong>
                  <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{item.description}</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="relative size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:text-[var(--foreground)] motion-reduce:transition-none" />
              </button>
            )
          })}
      </div>
    </Reveal>
  )
}

const KPI_DETAIL_COPY: Record<HomeKpiDetailKind, {
  title: string
  description: string
  dateLabel: string
  empty: string
}> = {
  completed: {
    title: "완료 상세",
    description: "DD 전체현황 · Received Date 기준",
    dateLabel: "완료일",
    empty: "선택한 기간에 완료된 개발 건이 없습니다.",
  },
  new: {
    title: "접수 상세",
    description: "DD 전체현황 · Request Date 기준",
    dateLabel: "접수일",
    empty: "선택한 기간에 접수된 개발 건이 없습니다.",
  },
  schedule: {
    title: "스케줄 상세",
    description: "DD 전체현황 · 진행 중 Due Date 기준",
    dateLabel: "Due Date",
    empty: "현재 납기가 지연된 개발 건이 없습니다.",
  },
}

function KpiDetailSheet({
  kind,
  details,
  ranges,
  onRangeChange,
  onOpenChange,
}: {
  kind: HomeKpiDetailKind | null
  details: HomeKpiDetailGroups
  ranges: HomeKpiRanges
  onRangeChange: (kind: "completed" | "new", field: "from" | "to", value: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const copy = kind ? KPI_DETAIL_COPY[kind] : null
  const rows = kind === "schedule" ? [...details.due, ...details.late] : kind ? details[kind] : []
  const range = kind === "completed" || kind === "new" ? ranges[kind] : null

  return (
    <Sheet open={kind !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-3xl">
        {copy ? (
          <>
            <SheetHeader className="border-b border-[var(--border)] p-6 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-[var(--foreground)]">{copy.title}</SheetTitle>
                {kind === "schedule" ? (
                  <>
                    <Badge className="border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]">납기임박 {details.due.length}건</Badge>
                    <Badge variant="destructive">납기지연 {details.late.length}건</Badge>
                  </>
                ) : <Badge variant="secondary">총 {rows.length}건</Badge>}
              </div>
              <SheetDescription className="text-[var(--muted-foreground)]">{copy.description}{range ? ` · ${fmtDateFull(range.from)} ~ ${fmtDateFull(range.to)}` : ""}</SheetDescription>
            </SheetHeader>
            {range && (kind === "completed" || kind === "new") ? (
              <div className="grid gap-3 border-b border-[var(--border)] p-4 sm:grid-cols-2 sm:p-6">
                <label className="grid gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">시작일
                  <input type="date" value={range.from} max={range.to} onInput={(event) => onRangeChange(kind, "from", event.currentTarget.value)} className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]" />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">종료일
                  <input type="date" value={range.to} min={range.from} onInput={(event) => onRangeChange(kind, "to", event.currentTarget.value)} className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]" />
                </label>
              </div>
            ) : null}
            {rows.length ? (
              <div className="p-4 sm:p-6">
                <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="whitespace-nowrap px-4">개발 담당</TableHead>
                        <TableHead className="whitespace-nowrap px-4">플래너</TableHead>
                        <TableHead className="whitespace-nowrap px-4">Style No.</TableHead>
                        <TableHead className="whitespace-nowrap px-4">{copy.dateLabel}</TableHead>
                        {kind === "schedule" ? <><TableHead className="whitespace-nowrap px-4">구분</TableHead><TableHead className="whitespace-nowrap px-4 text-right">Schedule</TableHead></> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((item) => (
                        <TableRow key={`${item.record._src.sheet}-${item.record._src.row}`}>
                          <TableCell className="whitespace-nowrap px-4 font-medium text-[var(--foreground)]">{item.record.owner || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-[var(--foreground)]">{item.record.planner || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 font-mono text-[var(--foreground)]">{item.record.styleNo || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 text-[var(--foreground)]">{fmtDateFull(item.date)}</TableCell>
                          {kind === "schedule" ? <>
                            <TableCell className="whitespace-nowrap px-4"><Badge className={item.scheduleState === "late" ? "border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)]" : "border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]"}>{item.scheduleState === "late" ? "납기지연" : "납기임박"}</Badge></TableCell>
                            <TableCell className={`whitespace-nowrap px-4 text-right font-semibold ${item.scheduleState === "late" ? "text-[var(--destructive)]" : "text-[var(--warning)]"}`}>
                              {item.dayOffset === null ? "—" : item.scheduleState === "late" ? `D+${Math.abs(item.dayOffset)}` : `D-${item.dayOffset}`}
                            </TableCell>
                          </> : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex min-h-52 items-center justify-center p-6 text-center text-sm text-[var(--muted-foreground)]">{copy.empty}</div>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

const PROCESS_LABEL_EN: Record<string, string> = {
  yarn: "yarn in-fac",
  knitting: "knitting",
  dyeing: "dyeing",
  finishing: "finishing",
}

const PROCESS_GRADIENT: Record<string, string> = {
  yarn: "from-[#F6B29B] to-[#B83E24]",
  knitting: "from-[#6FCEC3] to-[#14655B]",
  dyeing: "from-[#6E93A2] to-[#122C36]",
  finishing: "from-[#F5DFA6] to-[#BE8D1F]",
}

function ProcessFunnel({ process, reduceMotion }: {
  process: readonly { key: string; label: string; pct: number; done: number; total: number }[]
  reduceMotion: boolean
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {process.map((item) => (
          <div key={item.key} className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[13px] font-medium text-[var(--foreground)]">{PROCESS_LABEL_EN[item.key] ?? item.label}</span>
              <span className="shrink-0 text-[13px] font-semibold text-[var(--foreground)]"><NumberTicker value={item.pct} decimals={Number.isInteger(item.pct) ? 0 : 1} suffix="%" duration={1000} /></span>
            </div>
            <p className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{item.done}/{item.total}건</p>
          </div>
        ))}
      </div>
      <div className="flex h-3.5 w-full gap-1.5" role="img" aria-label={`공정 누적 도달률 — ${process.map((item) => `${PROCESS_LABEL_EN[item.key] ?? item.label} ${item.done}건 ${item.pct}%`).join(", ")}`}>
        {process.map((item, index) => (
          <div key={item.key} className="relative h-full flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${PROCESS_GRADIENT[item.key] ?? ""}`}
              style={{ width: `${item.pct}%`, animation: reduceMotion ? undefined : `gaugeGrow 1000ms cubic-bezier(.22,.61,.36,1) ${index * 80}ms backwards` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
        진행중 {(process[0]?.total ?? 0).toLocaleString("ko-KR")}건 기준 · 현재 단계까지 도달한 누적 비율입니다 (DEVELOPMENT 4공정 KPI와 동일 기준).
      </p>
    </div>
  )
}

const CALENDAR_ACCENT = "var(--chart-4)"

const QUICK_ACCESS = [
  { title: "Overview", description: "개발 전체 현황", path: "/development", icon: FlaskConical },
  { title: "RDDA", description: "미팅·픽업 분석", path: "/rdda", icon: ClipboardList },
  { title: "CALENDAR", description: "일정과 납기", path: "/calendar", icon: CalendarDays },
  { title: "FABRIC ANALYSIS", description: "원단 물성 분석", path: "/fabric-analysis", icon: Microscope },
  { title: "TS 관리", description: "기술지원 업무", path: "/ts", icon: Wrench },
  { title: "MACRO TREND", description: "시장 거시 동향", path: "/trend/macro", icon: TrendingUp },
  { title: "FABRIC TREND", description: "소재 기술 동향", path: "/trend/fabric", icon: Waves },
  { title: "PORTFOLIO", description: "개발 포트폴리오", path: "/trend/portfolio", icon: Layers3 },
] as const

const TREND_TABS = [
  { kind: "PORTFOLIO", label: "PORTFOLIO" },
  { kind: "MACRO", label: "MACRO TREND" },
  { kind: "FABRIC", label: "FABRIC TREND" },
] as const satisfies ReadonlyArray<{ kind: MaterialKind; label: string }>

function PortfolioPreview({ portfolio, onNavigate }: { portfolio: ChemicalPortfolio | null; onNavigate: (path: string) => void }) {
  if (!portfolio) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5">
        <p className="text-sm text-[var(--muted-foreground)]">SETTING에서 기능성 개발 List를 업로드하면 포트폴리오가 표시됩니다.</p>
        <Button type="button" variant="outline" onClick={() => onNavigate("/setting")}>SETTING 열기</Button>
      </div>
    )
  }

  const miniKpis = [
    { label: "보유 기능", value: portfolio.totals.categories, suffix: "개" },
    { label: "개발 완료", value: portfolio.totals.done, suffix: "건" },
    { label: "검증 통과", value: portfolio.totals.pass, suffix: "건" },
  ]
  const isDemo = portfolio.items.length > 0 && portfolio.items.every((item) => item.id.startsWith("chemical-demo-"))
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-[var(--foreground)]">기능성 개발 자산</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{isDemo ? "익명 데모 데이터" : "업로드한 Chemical 개발 List 기준"}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("/trend/portfolio")}>전체 보기<ArrowUpRight /></Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {miniKpis.map((kpi) => (
          <div key={kpi.label} className="rounded-[var(--radius)] bg-[var(--muted)] p-4">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">{kpi.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={kpi.value} suffix={kpi.suffix} startOnView /></p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="기능성 포트폴리오 카테고리">
        {portfolio.categories.map((category) => (
          <button key={category.name} type="button" onClick={() => onNavigate(`/trend/portfolio?category=${encodeURIComponent(category.name)}`)} className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none">
            {category.labelKo || category.labelEn}<Badge variant="secondary">{category.items.length}</Badge>
          </button>
        ))}
      </div>
    </div>
  )
}

function DemoTrendGrid({ items, onNavigate }: { items: TrendCard[]; onNavigate: (path: string) => void }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <Reveal key={`${item.href}-${item.title}`} delay={index * 75}>
          <Tilt3D max={10} lift={12}>
            <button
              type="button"
              onClick={() => onNavigate(item.href.replace(/^#/, ""))}
              className="group relative h-full w-full cursor-pointer overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 -top-1 h-2 rounded-b-[var(--radius)] border-x border-b border-[var(--border)] bg-[var(--muted)] opacity-70 [transform:translateZ(-18px)]" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 -top-0.5 h-2 rounded-b-[var(--radius)] border-x border-b border-[var(--border)] bg-[var(--card)] [transform:translateZ(-8px)]" />
              <span className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--chart-3)] via-[var(--chart-2)] to-[var(--chart-1)]">
                {item.image
                  ? <img src={item.image} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none" />
                  : <Sparkles className="size-8 text-[var(--primary-foreground)] opacity-80 transition-transform duration-500 group-hover:scale-125 group-hover:rotate-12 motion-reduce:transition-none" />}
                <Badge className="absolute left-3 top-3 [transform:translateZ(45px)]" variant="secondary">{item.tag}</Badge>
              </span>
              <span className="block p-4 [transform:translateZ(26px)]">
                <strong className="line-clamp-2 block text-sm leading-6 text-[var(--foreground)]">{item.title}</strong>
                <span className="mt-3 block text-xs text-[var(--muted-foreground)]">{item.date ? `${fmtDate(item.date)} · ` : ""}{item.source}</span>
              </span>
            </button>
          </Tilt3D>
        </Reveal>
      ))}
    </div>
  )
}

const HOME_KPI_RANGE_STORAGE_KEY = "fabric-rnd-home-kpi-ranges-v1"
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function loadHomeKpiRanges(): HomeKpiRanges {
  const fallback = defaultHomeDateRanges()
  if (typeof window === "undefined") return fallback
  try {
    const stored = JSON.parse(window.localStorage.getItem(HOME_KPI_RANGE_STORAGE_KEY) ?? "null") as Partial<HomeKpiRanges> | null
    const read = (kind: "completed" | "new") => {
      const candidate = stored?.[kind]
      return candidate && ISO_DAY_PATTERN.test(candidate.from ?? "") && ISO_DAY_PATTERN.test(candidate.to ?? "") && candidate.from! <= candidate.to!
        ? { from: candidate.from!, to: candidate.to! }
        : fallback[kind]
    }
    return { completed: read("completed"), new: read("new") }
  } catch {
    return fallback
  }
}

const RDDA_RANGE_OPTIONS = [
  { months: 6, label: "6개월" },
  { months: 12, label: "1년" },
  { months: 24, label: "2년" },
] as const

const RDDA_MONTHS_STORAGE_KEY = "fabric-rnd-home-rdda-months-v1"

function loadRddaMonths(): number {
  if (typeof window === "undefined") return 12
  const stored = Number(window.localStorage.getItem(RDDA_MONTHS_STORAGE_KEY))
  return RDDA_RANGE_OPTIONS.some((option) => option.months === stored) ? stored : 12
}

const RDDA_SERIES = [
  { key: "gd", label: "GD", range: "9천번대", color: "var(--chart-1)" },
  { key: "domestic", label: "국내", range: "5천번대", color: "var(--chart-2)" },
  { key: "production", label: "생산", range: "0천번대", color: "var(--chart-3)" },
  { key: "purchase", label: "사입", range: "2천번대", color: "var(--chart-4)" },
] as const

function RddaTrendTooltip({ active, payload }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: MonthlyDevelopmentDatum }>
}) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return (
    <div className="min-w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-3 text-[var(--popover-foreground)] shadow-xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-2">
        <p className="text-sm font-semibold">{item.month.replace("-", ".")}월</p>
        <Badge variant="secondary">{item.source}</Badge>
      </div>
      <div className="mt-2 space-y-1.5">
        {RDDA_SERIES.map((series) => {
          const value = item[series.key]
          return (
            <div key={series.key} className="flex items-center justify-between gap-5 text-xs">
              <span className="flex items-center gap-2 text-[var(--muted-foreground)]"><i className="size-2 rounded-full" style={{ background: series.color }} />{series.label}</span>
              <strong>{value}건 <span className="font-normal text-[var(--muted-foreground)]">({item.total ? Math.round(value / item.total * 100) : 0}%)</span></strong>
            </div>
          )
        })}
        {item.other ? <div className="flex items-center justify-between gap-5 text-xs text-[var(--muted-foreground)]"><span>기타</span><strong className="text-[var(--foreground)]">{item.other}건</strong></div> : null}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm"><span className="font-medium">TOTAL</span><strong>{item.total}건</strong></div>
    </div>
  )
}

interface AnimatedRddaBarProps {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  index?: number
  reduceMotion?: boolean
  active?: boolean
}

function AnimatedRddaBar({ x = 0, y = 0, width = 0, height = 0, fill = "currentColor", reduceMotion = false, active = false }: AnimatedRddaBarProps) {
  return <rect x={x} y={y} width={width} height={height} rx={2} fill={fill} style={{ transformBox: "fill-box", transformOrigin: "center bottom", transform: active ? "scaleY(1)" : "scaleY(0)", opacity: active ? 0.9 : 0, transition: reduceMotion ? "none" : "transform 480ms cubic-bezier(.16,.8,.24,1), opacity 180ms ease-out" }} />
}

function RddaTrendChart({ monthly, reduceMotion }: { monthly: MonthlyDevelopmentDatum[]; reduceMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(reduceMotion)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)

  useEffect(() => {
    const node = rootRef.current
    if (!node || started) return
    if (!("IntersectionObserver" in window)) { setStarted(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setStarted(true)
      observer.disconnect()
    }, { threshold: 0.3 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [started])

  return (
    <div ref={rootRef} className="h-[25rem] w-full" role="img" aria-label="FL 번호 기준 월별 RDDA 등록 전체 추이와 GD, 국내, 생산, 사입 비율 차트">
      {started ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly} margin={{ top: 28, right: 12, bottom: 0, left: -18 }} barCategoryGap="32%" onMouseMove={(state: unknown) => { const index = (state as { activeTooltipIndex?: number }).activeTooltipIndex; setHoveredMonth(typeof index === "number" ? index : null) }} onMouseLeave={() => setHoveredMonth(null)}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="month" tickFormatter={(value: string) => `${value.slice(2, 4)}.${value.slice(5)}월`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval={monthly.length > 14 ? 1 : 0} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ stroke: "#2563eb", strokeOpacity: 0.25, strokeDasharray: "4 4" }} content={<RddaTrendTooltip />} />
        {RDDA_SERIES.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label} stackId="production-source" fill={series.color} isAnimationActive={false} shape={(props: unknown) => { const bar = props as AnimatedRddaBarProps; return <AnimatedRddaBar {...bar} active={bar.index === hoveredMonth} reduceMotion={reduceMotion} /> }} />)}
        <Line type="natural" dataKey="total" name="TOTAL" stroke="#2563eb" strokeWidth={1.75} dot={{ r: 2.5, fill: "var(--background)", stroke: "#2563eb", strokeWidth: 1.5 }} activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)", stroke: "#2563eb" }} isAnimationActive={!reduceMotion} animationDuration={1950} animationEasing="linear">
          <LabelList dataKey="total" position="top" offset={10} fill="var(--muted-foreground)" fontSize={10} fontWeight={600} />
        </Line>
      </ComposedChart></ResponsiveContainer> : null}
    </div>
  )
}

export function Home() {
  const navigate = useNavigate()
  const [kpiDetailKind, setKpiDetailKind] = useState<HomeKpiDetailKind | null>(null)
  const [kpiRanges, setKpiRanges] = useState<HomeKpiRanges>(loadHomeKpiRanges)
  const [rddaMonths, setRddaMonths] = useState<number>(loadRddaMonths)
  const today = useMemo(() => new Date(), [])
  const records = useAppStore((state) => state.records)
  const completed = useAppStore((state) => state.completed)
  const fabricAnalysis = useAppStore((state) => state.fabricAnalysis)
  const ts = useAppStore((state) => state.ts)
  const study = useAppStore((state) => state.study)
  const studyFiles = useAppStore((state) => state.studyFiles)
  const events = useAppStore((state) => state.events)
  const trends = useAppStore((state) => state.trends)
  const materials = useAppStore((state) => state.materials)
  const materialsManual = useAppStore((state) => state.materialsManual)
  const chemical = useAppStore((state) => state.chemical)
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const [materialFormKind, setMaterialFormKind] = useState<MaterialKind | null>(null)
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null)
  const [trendKind, setTrendKind] = useState<MaterialKind>("PORTFOLIO")
  const sections = useMemo(() => homeSectionCards(records, today, kpiRanges), [records, today, kpiRanges])
  const kpiDetails = useMemo(() => homeKpiRecordDetails(records, today, kpiRanges), [records, today, kpiRanges])
  const monthly = useMemo(() => monthlyDevelopmentTrend(records, completed, today, rddaMonths), [records, completed, today, rddaMonths])
  const monthlyKpis = useMemo(() => monthly.reduce((summary, item) => ({
    total: summary.total + item.total,
    gd: summary.gd + item.gd,
    domestic: summary.domestic + item.domestic,
    production: summary.production + item.production,
    purchase: summary.purchase + item.purchase,
  }), { total: 0, gd: 0, domestic: 0, production: 0, purchase: 0 }), [monthly])
  const work = useMemo(() => homeWorkSummary(records, ts, study, fabricAnalysis, events), [records, ts, study, fabricAnalysis, events])
  const news = useMemo(() => homeTrendCards(ts, studyFiles, trends), [ts, studyFiles, trends])
  const tsDeckMaterials = useMemo(() => materialsOf("TS", deriveTsMaterials(ts), materialsManual), [materialsManual, ts])
  const studyDeckMaterials = useMemo(() => materialsOf("STUDY", deriveStudyMaterials(study), materialsManual), [materialsManual, study])
  const trendMaterials = useMemo(() => ({
    MACRO: materialsOf("MACRO", materials, materialsManual),
    FABRIC: materialsOf("FABRIC", materials, materialsManual),
    PORTFOLIO: materialsOf("PORTFOLIO", materials, materialsManual),
  }), [materials, materialsManual])
  const fabricStages = useMemo(() => ([
    { key: "request", label: "의뢰 접수", rows: fabricAnalysis.filter((item) => !item.completeDate && !item.requestDate) },
    { key: "analysis", label: "분석 중", rows: fabricAnalysis.filter((item) => !item.completeDate && Boolean(item.requestDate)) },
    { key: "complete", label: "완료", rows: fabricAnalysis.filter((item) => Boolean(item.completeDate)) },
  ].map((stage) => ({
    ...stage,
    rows: [...stage.rows].sort((a, b) =>
      (b.completeDate || b.requestDate).localeCompare(a.completeDate || a.requestDate)
      || b.anNo.localeCompare(a.anNo, "ko-KR", { numeric: true }),
    ),
  }))), [fabricAnalysis])
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  useEffect(() => {
    window.localStorage.setItem(HOME_KPI_RANGE_STORAGE_KEY, JSON.stringify(kpiRanges))
  }, [kpiRanges])

  useEffect(() => {
    window.localStorage.setItem(RDDA_MONTHS_STORAGE_KEY, String(rddaMonths))
  }, [rddaMonths])

  const updateKpiRange = (kind: "completed" | "new", field: "from" | "to", value: string) => {
    if (!ISO_DAY_PATTERN.test(value)) return
    setKpiRanges((current) => {
      const next = { ...current[kind], [field]: value }
      if (field === "from" && next.from > next.to) next.to = next.from
      if (field === "to" && next.to < next.from) next.from = next.to
      return { ...current, [kind]: next }
    })
  }

  const rangeLabel = (kind: "completed" | "new") =>
    `${fmtDateFull(kpiRanges[kind].from)} ~ ${fmtDateFull(kpiRanges[kind].to)}`

  const demoTrendCards = (kind: MaterialKind) => {
    const tag = kind === "MACRO" ? "MACRO" : kind === "FABRIC" ? "FABRIC" : "PORTFOLIO"
    const matched = news.filter((item) => item.tag === tag)
    return matched.length ? matched : news
  }

  const openMaterialForm = (kind: MaterialKind, item: MaterialItem | null = null) => {
    setSelectedMaterial(null)
    setEditingMaterial(item)
    setMaterialFormKind(kind)
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader title="대시보드" subtitle="DD 전체현황을 기준으로 개발 업무와 최신 정보를 확인합니다." actions={<div className="flex flex-wrap justify-end gap-2"><DataUpload kind="home-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} /><DataUpload kind="home-samples" label="샘플대장 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestSamples(files[0]) }} /><Button type="button" variant="outline" onClick={() => navigate("/sync")}><RefreshCw aria-hidden="true" />데이터 상태</Button></div>} />

      <Reveal>
        <button type="button" onClick={() => navigate("/development")} className={`block w-full cursor-pointer rounded-[var(--radius)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${hoverLift}`}>
          <Card className="overflow-hidden">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><LoaderCircle className="size-4" /></span>
                  <div>
                    <p className="text-sm font-medium text-[var(--muted-foreground)]">전체 개발 진행</p>
                    <p className="text-3xl font-semibold tracking-tight text-[var(--foreground)]"><NumberTicker value={sections.progress.total} /><span className="ml-1 text-sm font-medium text-[var(--muted-foreground)]">건</span></p>
                  </div>
                </div>
                <Badge variant="secondary">DD 전체현황</Badge>
              </div>
              <ProcessFunnel process={sections.progress.process} reduceMotion={reduceMotion} />
            </CardContent>
          </Card>
        </button>
      </Reveal>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={<CheckCircle2 className="size-4" />} label="완료" value={sections.lastWeekDone} rangeLabel={rangeLabel("completed")} caption="Received Date 기준" onClick={() => setKpiDetailKind("completed")} onCalendarClick={() => setKpiDetailKind("completed")} />
        <KpiCard icon={<TimerReset className="size-4" />} label="접수" value={sections.thisWeekNew} rangeLabel={rangeLabel("new")} caption="Request Date 기준" delay={75} onClick={() => setKpiDetailKind("new")} onCalendarClick={() => setKpiDetailKind("new")} />
        <ScheduleCard dueSoon={sections.scheduleDueSoon} late={sections.scheduleLate} onClick={() => setKpiDetailKind("schedule")} />
      </div>

      <KpiDetailSheet kind={kpiDetailKind} details={kpiDetails} ranges={kpiRanges} onRangeChange={updateKpiRange} onOpenChange={(open) => { if (!open) setKpiDetailKind(null) }} />

      <Reveal>
        <Card className="overflow-hidden"><CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-base font-semibold text-[var(--foreground)]">RDDA 등록 현황</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">최근 {rddaMonths}개월 · {RDDA_ARCHIVE_CUTOFF_MONTH.replace("-", ".")}까지 전체 시트 FL.#의 YYMM 기준 · 이후 DD 자동 반영 · 동일 FL 1건</p></div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] p-1" role="group" aria-label="RDDA 조회 기간 선택">
                {RDDA_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    aria-pressed={rddaMonths === option.months}
                    onClick={() => setRddaMonths(option.months)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${rddaMonths === option.months ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
                {RDDA_SERIES.map((series) => <span key={series.key} className="flex items-center gap-1.5"><i className="size-2.5 rounded-full shadow-sm" style={{ background: series.color }} />{series.label} <span className="opacity-70">{series.range}</span></span>)}
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <div className="group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]/80 p-3 transition duration-300 hover:-translate-y-1 hover:border-[var(--chart-1)] hover:shadow-md motion-reduce:transition-none">
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{rddaMonths}개월 TOTAL</p><p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis.total} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
            </div>
            {RDDA_SERIES.map((series) => (
              <div key={series.key} className="group rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]/80 p-3 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none" style={{ borderTopColor: series.color, borderTopWidth: 2 }}>
                <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{series.label}</p><span className="text-[10px] text-[var(--muted-foreground)]">{series.range}</span></div>
                <p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis[series.key]} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
              </div>
            ))}
          </div>
          <div className="mt-5"><RddaTrendChart key={rddaMonths} monthly={monthly} reduceMotion={reduceMotion} /></div>
        </CardContent></Card>
      </Reveal>
        </div>
        <aside className="xl:col-span-4">
          <TeamSchedule />
        </aside>
      </div>

      <section aria-labelledby="owner-board-title">
        <div className="mb-4"><h2 id="owner-board-title" className="text-base font-semibold text-[var(--foreground)]">담당자별 진행 현황</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">담당자·공정 단계별 진행 중 스타일 분포와 병목입니다. 셀을 누르면 상세 레인이 좁아집니다.</p></div>
        <Card className="overflow-hidden"><OwnerLaneBoard rows={records} onSelect={() => navigate("/development")} /></Card>
      </section>

      <section aria-labelledby="work-report-title">
        <div className="mb-4"><h2 id="work-report-title" className="text-base font-semibold text-[var(--foreground)]">Work report</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">연결된 업무 화면의 핵심 현황입니다.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { kind: "TS" as const, title: "TS 관리", description: "사고사례·불량 trouble shoot", path: "/ts", icon: Wrench, items: tsDeckMaterials, empty: "SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다." },
            { kind: "STUDY" as const, title: "STUDY 과제", description: "섬유 교육자료", path: "/study", icon: BookOpenCheck, items: studyDeckMaterials, empty: "SETTING에서 STUDY 엑셀을 업로드하면 교육 과제가 카드로 표시됩니다." },
          ].map((deck, index) => {
            const Icon = deck.icon
            return (
              <Reveal key={deck.kind} delay={index * 75}>
                <Card className="h-full overflow-hidden">
                  <CardContent className="flex h-full flex-col p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><Icon className="size-5" aria-hidden="true" /></span>
                        <div><h3 className="text-sm font-semibold text-[var(--foreground)]">{deck.title}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{deck.description}</p></div>
                      </div>
                    </div>
                    <div className="mt-4"><MaterialDeck items={deck.items} emptyMessage={deck.empty} onOpen={setSelectedMaterial} /></div>
                    <div className="mt-4 flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => navigate(deck.path)}>전체 보기<ArrowUpRight aria-hidden="true" /></Button></div>
                  </CardContent>
                </Card>
              </Reveal>
            )
          })}
          <Reveal delay={150} className="lg:col-span-1">
            <Card className="overflow-hidden">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><Microscope className="size-5" aria-hidden="true" /></span><div><h3 className="text-sm font-semibold text-[var(--foreground)]">FABRIC ANALYSIS</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">분석 의뢰 보드</p></div></div>
                  <Button type="button" onClick={() => navigate("/fabric-analysis")}><Plus aria-hidden="true" />분석 의뢰하기</Button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {fabricStages.map((stage) => (
                    <button key={stage.key} type="button" onClick={() => navigate("/fabric-analysis")} className="min-h-36 cursor-pointer rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                      <span className="flex items-center justify-between gap-3"><strong className="text-sm text-[var(--foreground)]">{stage.label}</strong><Badge variant="secondary">{stage.rows.length.toLocaleString("ko-KR")}건</Badge></span>
                      {stage.rows.length ? <span className="mt-4 grid gap-2">{stage.rows.slice(0, 3).map((item) => <span key={`${stage.key}-${item.anNo}`} className="block truncate text-xs text-[var(--muted-foreground)]">{[item.anNo, item.item, item.owner].filter(Boolean).join("-")}</span>)}</span> : <span className="mt-8 block text-center text-2xl font-semibold text-[var(--muted-foreground)] opacity-50">0</span>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Reveal>
          <Reveal delay={225} className="lg:col-span-1">
            <Tilt3D max={7} lift={8}>
              <button type="button" onClick={() => navigate("/calendar")} className="group relative h-full w-full cursor-pointer overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-80" style={{ background: `linear-gradient(90deg, ${CALENDAR_ACCENT}, transparent)` }} />
                <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40 motion-reduce:transition-none" style={{ background: CALENDAR_ACCENT }} />
                <span className="relative flex items-start justify-between [transform:translateZ(30px)]"><span className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)]" style={{ color: CALENDAR_ACCENT }}><CalendarDays className="size-5" aria-hidden="true" /></span><ArrowUpRight className="size-4 text-[var(--muted-foreground)] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" /></span>
                <span className="relative mt-5 block text-sm font-semibold text-[var(--foreground)] [transform:translateZ(22px)]">CALENDAR</span>
                <span className="relative mt-2 block text-2xl font-semibold tracking-tight text-[var(--foreground)] [transform:translateZ(38px)]">오늘 {work.calendar.today} / 이번주 {work.calendar.week}</span>
                <span className="relative mt-2 block text-xs text-[var(--muted-foreground)] [transform:translateZ(16px)]">예정된 일정</span>
              </button>
            </Tilt3D>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="trend-issue-title">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="trend-issue-title" className="text-base font-semibold text-[var(--foreground)]">기능성 포트폴리오</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">팀이 개발한 기능성 원단 자산 · 트렌드 자료</p></div>{trendKind !== "PORTFOLIO" ? <Button type="button" variant="outline" size="sm" onClick={() => openMaterialForm(trendKind)}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>
        <Tabs value={trendKind} onValueChange={(value) => setTrendKind(value as MaterialKind)} className="min-w-0">
          <TabsList className="h-auto flex-wrap" aria-label="트렌드 자료 구분">{TREND_TABS.map((tab) => <TabsTrigger key={tab.kind} value={tab.kind}>{tab.label}</TabsTrigger>)}</TabsList>
          {TREND_TABS.map((tab) => {
            if (tab.kind === "PORTFOLIO") return <TabsContent key={tab.kind} value={tab.kind} className="mt-5"><PortfolioPreview portfolio={chemical} onNavigate={navigate} /></TabsContent>
            const items = trendMaterials[tab.kind]
            return <TabsContent key={tab.kind} value={tab.kind} className="mt-5">{items.length
              ? <CoverflowGallery items={items} emptyMessage={`${tab.label} 자료가 없습니다.`} onOpen={setSelectedMaterial} />
              : <div className="space-y-4"><p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">등록된 {tab.label} 자료가 없어 데모 카드를 표시합니다.</p><DemoTrendGrid items={demoTrendCards(tab.kind)} onNavigate={navigate} /></div>}
            </TabsContent>
          })}
        </Tabs>
      </section>

      <section aria-labelledby="quick-access-title">
        <div className="mb-4"><h2 id="quick-access-title" className="text-base font-semibold text-[var(--foreground)]">Quick access</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">자주 사용하는 업무 화면으로 바로 이동합니다.</p></div>
        <QuickAccessGrid items={QUICK_ACCESS} onNavigate={navigate} />
      </section>

      <MaterialDetailSheet item={selectedMaterial} onOpenChange={(open) => { if (!open) setSelectedMaterial(null) }} onEdit={(item) => openMaterialForm(item.kind, item)} />
      <MaterialFormSheet open={materialFormKind !== null} defaultKind={materialFormKind ?? "MACRO"} item={editingMaterial} onOpenChange={(open) => { if (!open) { setMaterialFormKind(null); setEditingMaterial(null) } }} />
    </section>
  )
}
