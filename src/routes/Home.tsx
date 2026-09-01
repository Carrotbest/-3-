import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUpRight, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList,
  Layers3, LoaderCircle, RefreshCw, TimerReset, TrendingUp, Wrench,
} from "lucide-react"
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { MaterialDeck, MaterialDetailSheet, MaterialFormSheet } from "@/components/cards/MaterialDeck"
import { OwnerLaneBoard } from "@/components/charts/OwnerLaneBoard"
import { HomeTrendSection } from "@/components/dashboard/HomeTrendSection"
import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Magnetic } from "@/components/motion/Magnetic"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  homeKpiRecordDetails,
  homeSectionCards,
  defaultHomeDateRanges,
  isInProgress,
  materialsOf,
  monthlyDevelopmentTrend,
  studyMaterials as deriveStudyMaterials,
  tsMaterials as deriveTsMaterials,
  type HomeKpiDetailGroups,
  type HomeKpiDetailKind,
  type HomeKpiRanges,
  type MonthlyDevelopmentDatum,
  type ProcessFunnelKey,
} from "@/data/derive"
import { fmtDateFull } from "@/data/format"
import { stageOf, type ChemicalCategory, type ChemicalPortfolio } from "@/data/chemical"
import { loadTrendFeed, loadTrendKpi, type TrendFeed, type TrendKpi } from "@/data/trend"
import type { DevRecord, MaterialItem, MaterialKind } from "@/data/schema"
import { ingestDevelopment } from "@/data/upload"
import { hoverLift } from "@/lib/motion"
import { HOME_GLASS_HOVER, HOME_GLASS_STATIC, HOME_GLASS_SURFACE } from "@/lib/home-surface"
import { useAppStore } from "@/store/useAppStore"

function KpiCard({ icon, label, value, rangeLabel, caption, accent, delay = 0, children, onClick, onCalendarClick }: {
  icon: ReactNode
  label: string
  value: number
  /** 카드 본문에 크게 노출하는 조회 기간. */
  rangeLabel: string
  caption: string
  accent: string
  delay?: number
  children?: ReactNode
  onClick: () => void
  onCalendarClick?: () => void
}) {
  return (
    <Reveal delay={delay}>
      <Magnetic strength={5} lift={4} tilt={1.2}>
      <Card className={`group relative h-full overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_HOVER}`}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-32 rounded-full opacity-[0.055] blur-2xl transition-[opacity,transform] duration-500 group-hover:scale-110 group-hover:opacity-[0.11] motion-reduce:transition-none" style={{ background: accent }} />
        <CardContent className="relative flex h-full flex-col p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 items-center justify-center rounded-[9px] border border-white/70 shadow-[0_7px_16px_-12px_rgba(15,23,42,0.28)] transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none" style={{ color: accent, background: `color-mix(in oklab, ${accent} 11%, var(--card))` }}>{icon}</span>
            <div className="flex items-center gap-2">
              {onCalendarClick ? (
                <Button type="button" variant="ghost" size="icon" className="size-8 text-[var(--muted-foreground)]" aria-label={`${label} 기간 설정`} onClick={onCalendarClick}>
                  <CalendarDays className="size-3.5" />
                </Button>
              ) : null}
              <Badge variant="outline" className="border-white/65 bg-white/34 text-[10px] font-medium text-[var(--muted-foreground)]">DD 전체현황</Badge>
            </div>
          </div>
          <button type="button" aria-haspopup="dialog" onClick={onClick} className="mt-5 w-full cursor-pointer rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
            <p className="text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
            <p className="mt-1.5 text-4xl font-semibold tracking-[-0.035em] text-[var(--foreground)]">
              <NumberTicker value={value} /><span className="ml-1.5 text-xs font-normal tracking-normal text-[color-mix(in_oklab,var(--muted-foreground)_78%,transparent)]">건</span>
            </p>
            <p className="mt-3 text-sm font-medium tracking-[-0.01em] text-[color-mix(in_oklab,var(--foreground)_86%,transparent)]">{rangeLabel}</p>
            <p className="mt-1.5 text-xs font-normal text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)]">{caption}</p>
          </button>
          {children}
        </CardContent>
      </Card>
      </Magnetic>
    </Reveal>
  )
}

function ScheduleCard({ dueSoon, late, onClick }: { dueSoon: number; late: number; onClick: () => void }) {
  return (
    <Reveal delay={150}>
      <button type="button" aria-haspopup="dialog" onClick={onClick} className="group block h-full w-full cursor-pointer rounded-[12px] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
        <Magnetic strength={5} lift={4} tilt={1.2}>
        <Card className={`relative h-full overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_HOVER}`}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
          <CardContent className="relative flex h-full flex-col p-6 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 items-center justify-center rounded-[9px] border border-white/70 bg-[color-mix(in_oklab,var(--warning)_11%,var(--card))] text-[var(--warning)] shadow-[0_7px_16px_-12px_rgba(15,23,42,0.28)] transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none"><CalendarDays className="size-4" /></span>
              <Badge variant="outline" className="border-white/65 bg-white/34 text-[10px] font-medium text-[var(--muted-foreground)]">DD 전체현황</Badge>
            </div>
            <p className="mt-5 text-sm font-medium text-[var(--muted-foreground)]">스케줄</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="relative border-t border-[color-mix(in_oklab,var(--warning)_52%,var(--border))] px-1 pt-3">
                <p className="text-xs font-medium text-[color-mix(in_oklab,var(--warning)_70%,var(--muted-foreground))]">납기 임박 <span className="font-semibold">D-7</span></p>
                <p className="mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]"><NumberTicker value={dueSoon} /><span className="ml-1.5 text-xs font-normal tracking-normal text-[var(--muted-foreground)]">건</span></p>
              </div>
              <div className="relative border-t border-[color-mix(in_oklab,var(--destructive)_50%,var(--border))] px-1 pt-3">
                <p className="text-xs font-medium text-[color-mix(in_oklab,var(--destructive)_70%,var(--muted-foreground))]">납기 지연 <span className="font-semibold">D+</span></p>
                <p className="mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]"><NumberTicker value={late} /><span className="ml-1.5 text-xs font-normal tracking-normal text-[var(--muted-foreground)]">건</span></p>
              </div>
            </div>
            <p className="mt-3 text-xs font-normal text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)]">진행 중 · Due Date 기준</p>
          </CardContent>
        </Card>
        </Magnetic>
      </button>
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
    title: "신규 접수 상세",
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
  yarn: "Yarn in-fac",
  knitting: "Knitting",
  dyeing: "Dyeing",
  finishing: "Finishing",
}

const PROCESS_GRADIENT: Record<string, string> = {
  yarn: "from-[#F6B29B] to-[#B83E24]",
  knitting: "from-[#6FCEC3] to-[#14655B]",
  dyeing: "from-[#6E93A2] to-[#122C36]",
  finishing: "from-[#F5DFA6] to-[#BE8D1F]",
}

interface PendingStyleSummary {
  styleNo: string
  optCount: number
}

type PendingProcessStyles = Record<ProcessFunnelKey, PendingStyleSummary[]>

const PROCESS_KEYS = ["yarn", "knitting", "dyeing", "finishing"] as const satisfies readonly ProcessFunnelKey[]
const PROCESS_MINIMUM: Record<ProcessFunnelKey, number> = { yarn: 0, knitting: 1, dyeing: 2, finishing: 3 }

function pendingStylesByProcess(records: readonly DevRecord[]): PendingProcessStyles {
  const active = records.filter(isInProgress)
  const stageOrder = ["원사", "편직", "염색", "가공", "시험", "완료"]
  const result: PendingProcessStyles = { yarn: [], knitting: [], dyeing: [], finishing: [] }

  for (const processKey of PROCESS_KEYS) {
    const grouped = new Map<string, { opts: Set<string>; rows: number }>()
    for (const record of active) {
      const reached = record.processReached
        ? record.processReached[processKey]
        : stageOrder.indexOf(record.stage) >= PROCESS_MINIMUM[processKey]
      if (reached) continue
      const styleNo = record.styleNo.trim() || "Style 미기재"
      const bucket = grouped.get(styleNo) ?? { opts: new Set<string>(), rows: 0 }
      if (record.opt.trim()) bucket.opts.add(record.opt.trim())
      bucket.rows += 1
      grouped.set(styleNo, bucket)
    }
    result[processKey] = [...grouped.entries()]
      .map(([styleNo, bucket]) => ({ styleNo, optCount: bucket.opts.size || bucket.rows }))
      .sort((left, right) => right.optCount - left.optCount || left.styleNo.localeCompare(right.styleNo, "ko-KR", { numeric: true }))
  }
  return result
}

function ProcessFunnel({ process, pendingStyles, reduceMotion, onNavigate }: {
  process: readonly { key: ProcessFunnelKey; label: string; pct: number; done: number; total: number }[]
  pendingStyles: PendingProcessStyles
  reduceMotion: boolean
  onNavigate: () => void
}) {
  return (
    <div className="relative mt-7" role="group" aria-label={`공정 누적 도달률 — ${process.map((item) => `${PROCESS_LABEL_EN[item.key] ?? item.label} ${item.done}건 ${item.pct}%`).join(", ")}`}>
      <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-[11px] border border-white/58 bg-[color-mix(in_oklab,var(--border)_56%,transparent)] sm:grid-cols-4">
        {process.map((item, index) => (
          <div key={item.key} className="group/card h-[10.5rem] min-w-0 bg-[var(--card)]/88 [perspective:1000px]">
            <button type="button" onClick={onNavigate} className="block size-full cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--ring)]">
              <span className="sr-only">{PROCESS_LABEL_EN[item.key] ?? item.label} 미완료 대표 스타일 확인 후 개발 현황으로 이동</span>
              <div className="relative size-full transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] [transform-style:preserve-3d] group-hover/card:[transform:rotateY(180deg)] group-focus-within/card:[transform:rotateY(180deg)] motion-reduce:duration-0">
                <div className="absolute inset-0 flex flex-col bg-[color-mix(in_oklab,var(--card)_94%,transparent)] p-5 [backface-visibility:hidden]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color-mix(in_oklab,var(--foreground)_88%,transparent)]">{PROCESS_LABEL_EN[item.key] ?? item.label}</p>
                    <p className="mt-1 text-xs tabular-nums text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)]">{item.done}/{item.total}건</p>
                  </div>
                  <p className="mt-auto text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]"><NumberTicker value={item.pct} decimals={Number.isInteger(item.pct) ? 0 : 1} suffix="%" duration={1000} /></p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${PROCESS_GRADIENT[item.key] ?? ""}`} style={{ width: `${item.pct}%`, animation: reduceMotion ? undefined : `gaugeGrow 1000ms cubic-bezier(.22,.61,.36,1) ${index * 80}ms backwards` }} />
                  </div>
                </div>

                <div className="absolute inset-0 flex flex-col bg-[color-mix(in_oklab,var(--card)_97%,var(--muted))] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/70 pb-2">
                    <p className="text-xs font-medium text-[var(--foreground)]">미완료 대표 스타일</p>
                    <span className="text-[10px] tabular-nums text-[var(--muted-foreground)]">{Math.max(0, item.total - item.done)} OPT</span>
                  </div>
                  <div className="mt-2 min-h-0 flex-1">
                    {pendingStyles[item.key].length ? (
                      <ul className="space-y-1.5">
                        {pendingStyles[item.key].slice(0, 3).map((style) => (
                          <li key={style.styleNo} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate font-medium text-[color-mix(in_oklab,var(--foreground)_84%,transparent)]">{style.styleNo}</span>
                            <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">OPT {style.optCount}</span>
                          </li>
                        ))}
                        {pendingStyles[item.key].length > 3 ? <li className="text-[10px] text-[var(--muted-foreground)]">외 {pendingStyles[item.key].length - 3}개 스타일</li> : null}
                      </ul>
                    ) : <p className="pt-3 text-xs text-[var(--muted-foreground)]">미완료 스타일이 없습니다.</p>}
                  </div>
                  <p className="mt-2 text-[10px] font-medium text-[var(--muted-foreground)]">클릭하여 개발 현황에서 확인 →</p>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const TREND_TABS = [
  { kind: "PORTFOLIO", label: "PORTFOLIO" },
] as const satisfies ReadonlyArray<{ kind: MaterialKind; label: string }>

type PortfolioVisualKind = "cooling" | "antibacterial" | "warmth" | "thermal" | "moisture" | "shape" | "soft" | "sustainability" | "recovery" | "skincare" | "dwr" | "default"

interface PortfolioVisualMeta {
  kind: PortfolioVisualKind
  keywords: readonly string[]
  accent: string
  tint: string
}

const PORTFOLIO_VISUALS: readonly PortfolioVisualMeta[] = [
  { kind: "cooling", keywords: ["cooling", "냉감"], accent: "var(--feature-cooling)", tint: "var(--feature-cooling-tint)" },
  { kind: "antibacterial", keywords: ["anti-bacterial", "antibacterial", "anti-odor", "항균", "항취"], accent: "var(--feature-antibacterial)", tint: "var(--feature-antibacterial-tint)" },
  { kind: "warmth", keywords: ["heat generation", "warmth", "발열", "보온"], accent: "var(--feature-warmth)", tint: "var(--feature-warmth-tint)" },
  { kind: "thermal", keywords: ["thermal regulation", "온도 조절"], accent: "var(--feature-thermal)", tint: "var(--feature-thermal-tint)" },
  { kind: "moisture", keywords: ["moisture", "sweat", "땀 관리"], accent: "var(--feature-moisture)", tint: "var(--feature-moisture-tint)" },
  { kind: "shape", keywords: ["durable press", "shape", "형태안정", "구김"], accent: "var(--feature-shape)", tint: "var(--feature-shape-tint)" },
  { kind: "soft", keywords: ["soft touch", "hand-feel", "hand feel", "촉감"], accent: "var(--feature-soft)", tint: "var(--feature-soft-tint)" },
  { kind: "sustainability", keywords: ["sustainability", "microplastic", "친환경"], accent: "var(--feature-sustainability)", tint: "var(--feature-sustainability-tint)" },
  { kind: "recovery", keywords: ["recovery", "restorative", "회복"], accent: "var(--feature-recovery)", tint: "var(--feature-recovery-tint)" },
  { kind: "skincare", keywords: ["skin care", "skincare", "microbiome", "마이크로바이옴"], accent: "var(--feature-skincare)", tint: "var(--feature-skincare-tint)" },
  { kind: "dwr", keywords: ["dwr", "water repellency", "발수"], accent: "var(--feature-dwr)", tint: "var(--feature-dwr-tint)" },
] as const

const DEFAULT_PORTFOLIO_VISUAL: PortfolioVisualMeta = {
  kind: "default", keywords: [], accent: "var(--feature-default)", tint: "var(--feature-default-tint)",
}

const PORTFOLIO_FLOATING_LAYOUTS = [
  { left: 3, top: 6, width: 24, height: 29, radius: "34% 66% 58% 42% / 42% 34% 66% 58%", drift: "portfolioFloatA" },
  { left: 31, top: 3, width: 19, height: 22, radius: "48% 52% 42% 58% / 62% 38% 62% 38%", drift: "portfolioFloatB" },
  { left: 54, top: 8, width: 17, height: 24, radius: "50%", drift: "portfolioFloatC" },
  { left: 76, top: 4, width: 21, height: 29, radius: "28% 72% 36% 64% / 56% 35% 65% 44%", drift: "portfolioFloatA" },
  { left: 11, top: 41, width: 18, height: 23, radius: "58% 42% 65% 35% / 37% 61% 39% 63%", drift: "portfolioFloatC" },
  { left: 34, top: 34, width: 22, height: 29, radius: "30% 70% 62% 38% / 51% 31% 69% 49%", drift: "portfolioFloatB" },
  { left: 62, top: 39, width: 17, height: 22, radius: "46% 54% 34% 66% / 65% 44% 56% 35%", drift: "portfolioFloatA" },
  { left: 82, top: 40, width: 15, height: 21, radius: "50% 50% 41% 59% / 39% 61% 39% 61%", drift: "portfolioFloatC" },
  { left: 3, top: 72, width: 22, height: 23, radius: "36% 64% 44% 56% / 66% 32% 68% 34%", drift: "portfolioFloatB" },
  { left: 31, top: 70, width: 18, height: 25, radius: "50%", drift: "portfolioFloatA" },
  { left: 56, top: 68, width: 31, height: 27, radius: "28% 72% 58% 42% / 46% 34% 66% 54%", drift: "portfolioFloatC" },
] as const

const shuffledFloatingLayouts = () => {
  const layouts = [...PORTFOLIO_FLOATING_LAYOUTS]
  for (let index = layouts.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    const current = layouts[index]
    layouts[index] = layouts[target]
    layouts[target] = current
  }
  return layouts
}

interface MagneticPose {
  factor: number
  x: number
  y: number
}

const restPoses = (count: number): MagneticPose[] => Array.from({ length: count }, () => ({ factor: 0, x: 0, y: 0 }))

const portfolioVisualOf = (category: ChemicalCategory): PortfolioVisualMeta => {
  const searchable = `${category.name} ${category.labelEn} ${category.labelKo}`.normalize("NFKC").toLocaleLowerCase("en-US")
  return PORTFOLIO_VISUALS.find((visual) => visual.keywords.some((keyword) => searchable.includes(keyword))) ?? DEFAULT_PORTFOLIO_VISUAL
}

function FeatureIllustration({ kind, accent, tint, id }: { kind: PortfolioVisualKind; accent: string; tint: string; id: string }) {
  const surfaceId = `${id}-surface`
  const softId = `${id}-soft`
  const shadowId = `${id}-shadow`
  const artwork = (() => {
    if (kind === "cooling") return <g filter={`url(#${shadowId})`}><path d="M80 13C62 39 47 54 47 72a33 33 0 0 0 66 0c0-18-15-33-33-59Z" fill={`url(#${surfaceId})`} /><path d="M62 48c6-11 12-18 18-26" stroke="white" strokeWidth="7" strokeLinecap="round" opacity=".55" /><path d="M80 47v35M64 56l32 18m0-18L64 74" stroke="white" strokeWidth="3" strokeLinecap="round" /><circle cx="69" cy="87" r="3" fill={accent} /><circle cx="91" cy="87" r="3" fill={accent} /><path d="M73 96c5 4 9 4 14 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /></g>
    if (kind === "antibacterial") return <g filter={`url(#${shadowId})`}><path d="M80 18c23 0 40 15 40 37 0 26-18 40-40 48-22-8-40-22-40-48 0-22 17-37 40-37Z" fill={`url(#${surfaceId})`} /><circle cx="80" cy="59" r="18" fill="white" opacity=".76" /><path d="M80 48v22M69 59h22" stroke={accent} strokeWidth="5" strokeLinecap="round" /><circle cx="58" cy="39" r="5" fill="white" opacity=".5" /><path d="m117 25 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={accent} /></g>
    if (kind === "warmth") return <g filter={`url(#${shadowId})`}><circle cx="80" cy="59" r="36" fill={`url(#${surfaceId})`} /><g stroke={accent} strokeWidth="6" strokeLinecap="round"><path d="M80 10v9M80 99v9M31 59h9M120 59h9M45 24l7 7M108 87l7 7M115 24l-7 7M52 87l-7 7" /></g><circle cx="68" cy="57" r="3.5" fill={accent} /><circle cx="92" cy="57" r="3.5" fill={accent} /><path d="M67 71c8 8 18 8 26 0" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" /><ellipse cx="64" cy="39" rx="11" ry="7" fill="white" opacity=".42" /></g>
    if (kind === "thermal") return <g filter={`url(#${shadowId})`}><path d="M80 16a43 43 0 1 0 0 86Z" fill={`url(#${surfaceId})`} /><path d="M80 16a43 43 0 1 1 0 86Z" fill={`url(#${softId})`} /><rect x="73" y="31" width="14" height="45" rx="7" fill="white" opacity=".8" /><circle cx="80" cy="79" r="13" fill="white" /><path d="M80 42v36" stroke={accent} strokeWidth="6" strokeLinecap="round" /><path d="M57 28c7-5 13-7 20-8" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".45" /></g>
    if (kind === "moisture") return <g filter={`url(#${shadowId})`}><path d="M80 13C61 42 44 59 44 77a36 36 0 0 0 72 0c0-18-17-35-36-64Z" fill={`url(#${surfaceId})`} /><ellipse cx="67" cy="43" rx="10" ry="18" fill="white" opacity=".45" transform="rotate(32 67 43)" /><circle cx="69" cy="82" r="3" fill={accent} /><circle cx="91" cy="82" r="3" fill={accent} /><path d="M70 93c7 5 13 5 20 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /><circle cx="126" cy="38" r="9" fill={`url(#${softId})`} /><circle cx="33" cy="66" r="6" fill={`url(#${softId})`} /></g>
    if (kind === "shape") return <g filter={`url(#${shadowId})`}><path d="m80 16 43 22v48L80 106 37 84V37Z" fill={`url(#${surfaceId})`} /><path d="m37 37 43 22 43-21M80 59v47" fill="none" stroke="white" strokeWidth="3" opacity=".58" /><path d="m54 28 43 22 17-9-42-22Z" fill="white" opacity=".33" /><path d="M55 70c8 7 17 7 25 0M80 70c8 7 17 7 25 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /></g>
    if (kind === "soft") return <g filter={`url(#${shadowId})`}><path d="M40 84c-17-9-17-34 0-43 8-20 36-25 50-10 20-8 40 9 36 29 12 16 0 41-20 40H53c-6 0-10-2-13-5Z" fill={`url(#${surfaceId})`} /><ellipse cx="61" cy="48" rx="15" ry="9" fill="white" opacity=".45" transform="rotate(-22 61 48)" /><circle cx="70" cy="73" r="3" fill={accent} /><circle cx="92" cy="73" r="3" fill={accent} /><path d="M74 84c5 4 9 4 14 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /></g>
    if (kind === "sustainability") return <g filter={`url(#${shadowId})`}><circle cx="80" cy="64" r="38" fill={`url(#${surfaceId})`} /><path d="M80 101V57" stroke="white" strokeWidth="4" strokeLinecap="round" /><path d="M78 65C54 62 45 48 47 30c21 0 36 12 31 35Zm4 11c25-2 35-15 34-34-22 0-37 12-34 34Z" fill="white" opacity=".72" /><circle cx="67" cy="82" r="3" fill={accent} /><circle cx="91" cy="82" r="3" fill={accent} /><path d="M72 91c5 4 11 4 16 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /><ellipse cx="58" cy="40" rx="10" ry="7" fill="white" opacity=".34" /></g>
    if (kind === "recovery") return <g filter={`url(#${shadowId})`}><path d="M37 76c0-27 20-48 46-48 24 0 43 19 43 42 0 20-15 36-34 36-17 0-30-13-30-29 0-13 10-23 22-23 11 0 19 8 19 18 0 8-6 14-14 14-6 0-11-5-11-10" fill="none" stroke={`url(#${surfaceId})`} strokeWidth="15" strokeLinecap="round" /><path d="M44 54c4-8 10-13 16-17" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".45" /><circle cx="47" cy="85" r="4" fill={accent} /><path d="m119 24 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={accent} /></g>
    if (kind === "skincare") return <g filter={`url(#${shadowId})`}><circle cx="80" cy="60" r="37" fill={`url(#${surfaceId})`} /><g fill="white" opacity=".72"><circle cx="80" cy="34" r="9" /><circle cx="105" cy="50" r="9" /><circle cx="96" cy="79" r="9" /><circle cx="64" cy="79" r="9" /><circle cx="55" cy="50" r="9" /></g><circle cx="80" cy="60" r="16" fill={`url(#${softId})`} /><circle cx="74" cy="58" r="2.5" fill={accent} /><circle cx="87" cy="58" r="2.5" fill={accent} /><path d="M75 68c4 3 7 3 11 0" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" /><circle cx="122" cy="26" r="6" fill={accent} opacity=".65" /></g>
    if (kind === "dwr") return <g filter={`url(#${shadowId})`}><path d="M28 65a52 52 0 0 1 104 0c-9-8-18-8-26 0-9-8-18-8-26 0-9-8-18-8-26 0-9-8-17-8-26 0Z" fill={`url(#${surfaceId})`} /><path d="M80 65v29c0 13 19 13 19 0" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" /><path d="M51 40c8-10 17-15 27-17" stroke="white" strokeWidth="6" strokeLinecap="round" opacity=".48" /><path d="M126 75c-7 11-11 16-11 23a11 11 0 0 0 22 0c0-7-4-12-11-23Z" fill={`url(#${softId})`} /></g>
    return <g filter={`url(#${shadowId})`}><path d="M80 13 96 42l33 6-23 24 5 33-31-15-31 15 5-33-23-24 33-6Z" fill={`url(#${surfaceId})`} /><circle cx="68" cy="64" r="3" fill={accent} /><circle cx="92" cy="64" r="3" fill={accent} /><path d="M71 75c6 5 12 5 18 0" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" /></g>
  })()

  return (
    <svg viewBox="0 0 160 118" preserveAspectRatio="xMidYMid meet" className="size-full" aria-hidden="true">
      <defs>
        <radialGradient id={surfaceId} cx="32%" cy="22%" r="78%">
          <stop stopColor="white" stopOpacity=".95" />
          <stop offset=".36" stopColor={tint} />
          <stop offset="1" stopColor={accent} />
        </radialGradient>
        <linearGradient id={softId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="white" stopOpacity=".9" />
          <stop offset="1" stopColor={accent} stopOpacity=".72" />
        </linearGradient>
        <filter id={shadowId} x="-35%" y="-35%" width="170%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor={accent} floodOpacity=".3" /></filter>
      </defs>
      {artwork}
    </svg>
  )
}

function PortfolioCategoryDialog({ category, onOpenChange }: { category: ChemicalCategory | null; onOpenChange: (open: boolean) => void }) {
  const visual = category ? portfolioVisualOf(category) : DEFAULT_PORTFOLIO_VISUAL
  const summary = category?.strategy || category?.items.find((item) => item.description.trim())?.description || "기능성 원단 개발 방향과 관련 자료를 관리하는 카테고리입니다."
  const done = category?.items.filter((item) => stageOf(item.state) === "done").length ?? 0
  const progress = category?.items.filter((item) => stageOf(item.state) === "progress").length ?? 0
  const plan = category?.items.filter((item) => stageOf(item.state) === "plan").length ?? 0
  return (
    <Dialog open={Boolean(category)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl motion-reduce:animate-none">
        {category ? <>
          <DialogHeader className="pr-12">
            <DialogTitle className="text-xl">{category.labelKo || category.labelEn}</DialogTitle>
            <DialogDescription>{category.labelEn}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid items-center gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="aspect-square rounded-[38%_62%_54%_46%/48%_38%_62%_52%]" style={{ background: visual.tint }}><FeatureIllustration kind={visual.kind} accent={visual.accent} tint={visual.tint} id="portfolio-dialog" /></div>
              <div>
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{summary}</p>
                <div className="mt-4 flex flex-wrap gap-2" aria-label="기능 개발 현황">
                  <Badge variant="secondary">등록 {category.items.length}건</Badge>
                  <Badge variant="outline">검토 {plan}건</Badge>
                  <Badge variant="outline">진행 {progress}건</Badge>
                  <Badge variant="outline">완료 {done}건</Badge>
                </div>
              </div>
            </div>
            {category.items.length ? <div className="mt-5 divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {category.items.map((item) => <article key={item.id} className="py-4 first:pt-5 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-semibold text-[var(--foreground)]">{item.chemical || "개발건 제목 미등록"}</h4>{item.state ? <Badge variant="secondary">{item.state}</Badge> : null}</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-foreground)]">{item.description || "등록된 설명이 없습니다."}</p>
              </article>)}
            </div> : null}
          </DialogBody>
        </> : null}
      </DialogContent>
    </Dialog>
  )
}

function PortfolioPreview({ portfolio, onNavigate }: { portfolio: ChemicalPortfolio | null; onNavigate: (path: string) => void }) {
  const deckRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const targetPoses = useRef<MagneticPose[]>([])
  const currentPoses = useRef<MagneticPose[]>([])
  const animationFrame = useRef(0)
  const [poses, setPoses] = useState<MagneticPose[]>([])
  const [selectedCategory, setSelectedCategory] = useState<ChemicalCategory | null>(null)
  const [floatingLayouts] = useState(shuffledFloatingLayouts)
  const categoryCount = portfolio?.categories.length ?? 0

  useEffect(() => {
    cancelAnimationFrame(animationFrame.current)
    animationFrame.current = 0
    targetPoses.current = restPoses(categoryCount)
    currentPoses.current = restPoses(categoryCount)
    setPoses(restPoses(categoryCount))
    cardRefs.current = cardRefs.current.slice(0, categoryCount)
    return () => {
      cancelAnimationFrame(animationFrame.current)
      animationFrame.current = 0
    }
  }, [categoryCount])

  const animateTowardTarget = () => {
    if (animationFrame.current) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) {
      currentPoses.current = targetPoses.current.map((pose) => ({ ...pose }))
      setPoses(currentPoses.current.map((pose) => ({ ...pose })))
      return
    }
    const step = () => {
      let moving = false
      const next = currentPoses.current.map((current, index) => {
        const target = targetPoses.current[index] ?? { factor: 0, x: 0, y: 0 }
        const factorDelta = target.factor - current.factor
        const xDelta = target.x - current.x
        const yDelta = target.y - current.y
        if (Math.abs(factorDelta) + Math.abs(xDelta) + Math.abs(yDelta) <= 0.01) return { ...target }
        moving = true
        return { factor: current.factor + factorDelta * 0.18, x: current.x + xDelta * 0.18, y: current.y + yDelta * 0.18 }
      })
      currentPoses.current = next
      setPoses(next.map((pose) => ({ ...pose })))
      animationFrame.current = moving ? requestAnimationFrame(step) : 0
    }
    animationFrame.current = requestAnimationFrame(step)
  }

  const aimDeck = (next: MagneticPose[]) => {
    targetPoses.current = next
    animateTowardTarget()
  }

  const aimAtPointer = (clientX: number, clientY: number, hoveredIndex: number) => {
    const root = deckRef.current
    if (!root) return
    const influence = Math.max(190, Math.min(380, root.getBoundingClientRect().width * 0.32))
    aimDeck(cardRefs.current.map((node, index) => {
      if (!node) return { factor: 0, x: 0, y: 0 }
      const rect = node.getBoundingClientRect()
      const dx = clientX - (rect.left + rect.width / 2)
      const dy = clientY - (rect.top + rect.height / 2)
      const distance = Math.hypot(dx, dy)
      const proximity = Math.max(0, 1 - distance / influence)
      const factor = index === hoveredIndex ? 1 : proximity * proximity * (3 - 2 * proximity)
      return { factor, x: Math.max(-8, Math.min(8, dx * 0.035)) * factor, y: Math.max(-8, Math.min(8, dy * 0.035)) * factor }
    }))
  }

  if (!portfolio) {
    return <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-5"><p className="text-sm text-[var(--muted-foreground)]">SETTING에서 기능성 개발 List를 업로드하면 포트폴리오가 표시됩니다.</p><Button type="button" variant="outline" onClick={() => onNavigate("/setting")}>SETTING 열기</Button></div>
  }

  const isDemo = portfolio.items.length > 0 && portfolio.items.every((item) => item.id.startsWith("chemical-demo-"))
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return (
    <div className="w-full overflow-hidden bg-[var(--card)] p-0">
      <style>{`
        @keyframes portfolioFloatA { 0%,100% { transform: translate3d(-6px,5px,0); } 32% { transform: translate3d(12px,-17px,0); } 68% { transform: translate3d(-11px,12px,0); } }
        @keyframes portfolioFloatB { 0%,100% { transform: translate3d(5px,-8px,0); } 38% { transform: translate3d(-15px,9px,0); } 72% { transform: translate3d(14px,13px,0); } }
        @keyframes portfolioFloatC { 0%,100% { transform: translate3d(-9px,-4px,0); } 35% { transform: translate3d(14px,15px,0); } 70% { transform: translate3d(8px,-16px,0); } }
        .portfolio-emoji { transition: transform .22s cubic-bezier(.2,.72,.2,1); }
        .portfolio-floating-button:hover .portfolio-emoji { transform: translateY(-2px) scale(1.05); }
        @media (prefers-reduced-motion: reduce) { .portfolio-emoji { transition: none; } .portfolio-floating-button:hover .portfolio-emoji { transform: none; } }
      `}</style>
      <div className="flex min-w-0 items-start gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--foreground)]"><Layers3 className="size-5" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold text-[var(--foreground)]">기능성 원단 포트폴리오</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">기능별 대표 이미지를 선택하면 개발 내용과 관련 자료를 확인할 수 있습니다.{isDemo ? " · 현재 익명 데모 데이터" : ""}</p></div>
      </div>

      {portfolio.categories.length ? <div
        ref={deckRef}
        className="relative mt-4 grid grid-cols-2 gap-4 overflow-hidden bg-[var(--card)] px-0 py-6 sm:block sm:h-[30.8rem] sm:p-0 lg:h-[29.4rem]"
        aria-label="자유롭게 떠다니는 기능성 원단 포트폴리오"
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return
          const hovered = (event.target as Element).closest<HTMLButtonElement>("[data-portfolio-index]")
          aimAtPointer(event.clientX, event.clientY, Number(hovered?.dataset.portfolioIndex ?? -1))
        }}
        onPointerLeave={() => aimDeck(restPoses(categoryCount))}
      >
        {portfolio.categories.map((category, index) => {
          const pose = poses[index] ?? { factor: 0, x: 0, y: 0 }
          const visual = portfolioVisualOf(category)
          const layout = floatingLayouts[index % floatingLayouts.length]
          const floatingStyle = {
            "--float-left": `${layout.left}%`,
            "--float-top": `${layout.top}%`,
            "--float-width": `${layout.width}%`,
            "--float-height": `${layout.height}%`,
            animationName: reduceMotion ? "none" : layout.drift,
            animationDuration: `${5.1 + (index % 4) * 0.65}s`,
            animationDelay: `${-index * 0.63}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            zIndex: Math.ceil(pose.factor * 10),
          } as CSSProperties
          return <div key={category.name} className="relative h-28 min-w-0 sm:absolute sm:left-[var(--float-left)] sm:top-[var(--float-top)] sm:h-[var(--float-height)] sm:w-[var(--float-width)]" style={floatingStyle}>
            <button
              ref={(node) => { cardRefs.current[index] = node }}
              type="button"
              data-portfolio-index={index}
              aria-haspopup="dialog"
              aria-label={`${category.labelKo || category.labelEn} 상세 내용 열기`}
              onFocus={() => aimDeck(restPoses(categoryCount).map((item, itemIndex) => itemIndex === index ? { factor: 1, x: 0, y: -5 } : item))}
              onBlur={(event) => { if (!deckRef.current?.contains(event.relatedTarget)) aimDeck(restPoses(categoryCount)) }}
              onClick={() => setSelectedCategory(category)}
              className="portfolio-floating-button group relative size-full cursor-pointer overflow-visible bg-transparent text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none"
              style={{
                opacity: 0.5 + pose.factor * 0.5,
                transform: `translate3d(${pose.x}px,${pose.y}px,0) scale(${1 + pose.factor * 0.035})`,
                transition: reduceMotion ? "none" : "filter 180ms ease",
                filter: pose.factor > 0.65 ? "drop-shadow(0 0.75rem 1rem color-mix(in oklab, var(--foreground) 14%, transparent))" : "none",
              }}
            >
              <span className="portfolio-emoji absolute inset-x-[8%] bottom-[44%] top-0"><FeatureIllustration kind={visual.kind} accent={visual.accent} tint={visual.tint} id={`portfolio-card-${index}`} /></span>
              <span className="absolute inset-x-0 bottom-[2%] text-center"><strong className="block text-sm font-semibold leading-5 text-[var(--foreground)] sm:text-base">{category.labelKo || category.labelEn}</strong><span className="mt-0.5 line-clamp-1 block text-[11px] text-[var(--muted-foreground)]">{category.labelEn}</span></span>
            </button>
          </div>
        })}
      </div> : <div className="mt-5 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">등록된 기능 카테고리가 없습니다.</div>}

      <div className="mt-2 flex justify-end"><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onNavigate("/trend/portfolio")}>전체 현황 바로가기<ArrowUpRight aria-hidden="true" className="size-3.5" /></Button></div>
      <PortfolioCategoryDialog category={selectedCategory} onOpenChange={(open) => { if (!open) setSelectedCategory(null) }} />
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

interface CumulativeRddaDatum extends MonthlyDevelopmentDatum {
  monthly: Pick<MonthlyDevelopmentDatum, "total" | "gd" | "domestic" | "production" | "purchase" | "other">
  totalSolid: number | null
  totalCurrent: number | null
}

function RddaTrendTooltip({ active, payload }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: CumulativeRddaDatum }>
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
          const monthlyValue = item.monthly[series.key]
          const cumulativeValue = item[series.key]
          return (
            <div key={series.key} className="flex items-center justify-between gap-5 text-xs">
              <span className="flex items-center gap-2 text-[var(--muted-foreground)]"><i className="size-2 rounded-full" style={{ background: series.color }} />{series.label}</span>
              <strong>그 달 {monthlyValue}건 <span className="font-normal text-[var(--muted-foreground)]">/ 누적 {cumulativeValue}건</span></strong>
            </div>
          )
        })}
        {item.monthly.other || item.other ? <div className="flex items-center justify-between gap-5 text-xs text-[var(--muted-foreground)]"><span>기타</span><strong className="text-[var(--foreground)]">그 달 {item.monthly.other}건 <span className="font-normal text-[var(--muted-foreground)]">/ 누적 {item.other}건</span></strong></div> : null}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm"><span className="font-medium">TOTAL</span><strong>그 달 {item.monthly.total}건 <span className="font-normal text-[var(--muted-foreground)]">/ 누적 {item.total}건</span></strong></div>
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
  const cumulativeMonthly = useMemo<CumulativeRddaDatum[]>(() => {
    const cumulative = { total: 0, gd: 0, domestic: 0, production: 0, purchase: 0, other: 0 }
    const lastIndex = monthly.length - 1
    return monthly.map((item, index) => {
      const monthlyValues = {
        total: item.total,
        gd: item.gd,
        domestic: item.domestic,
        production: item.production,
        purchase: item.purchase,
        other: item.other,
      }
      cumulative.total += monthlyValues.total
      cumulative.gd += monthlyValues.gd
      cumulative.domestic += monthlyValues.domestic
      cumulative.production += monthlyValues.production
      cumulative.purchase += monthlyValues.purchase
      cumulative.other += monthlyValues.other
      return {
        ...item,
        ...cumulative,
        monthly: monthlyValues,
        totalSolid: index < lastIndex ? cumulative.total : null,
        totalCurrent: index >= Math.max(0, lastIndex - 1) ? cumulative.total : null,
      }
    })
  }, [monthly])
  const lastMonth = cumulativeMonthly.at(-1)?.month

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
    <div ref={rootRef} className="h-[25rem] w-full" role="img" aria-label="FL 번호 기준 생산처별 누적 등록 흐름과 월별 등록 건수 차트">
      {started ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={cumulativeMonthly} margin={{ top: 28, right: 12, bottom: 0, left: -18 }} barCategoryGap="32%" onMouseMove={(state: unknown) => { const index = (state as { activeTooltipIndex?: number }).activeTooltipIndex; setHoveredMonth(typeof index === "number" ? index : null) }} onMouseLeave={() => setHoveredMonth(null)}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="month" tickFormatter={(value: string) => `${value.slice(2, 4)}.${value.slice(5)}월`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval={cumulativeMonthly.length > 14 ? 1 : 0} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ stroke: "var(--gradient-1)", strokeOpacity: 0.25, strokeDasharray: "4 4" }} content={<RddaTrendTooltip />} />
        {RDDA_SERIES.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label} stackId="production-source" fill={series.color} isAnimationActive={false} shape={(props: unknown) => { const bar = props as AnimatedRddaBarProps; return <AnimatedRddaBar {...bar} active={bar.index === hoveredMonth} reduceMotion={reduceMotion} /> }} />)}
        <Line type="natural" dataKey="totalSolid" name="TOTAL" stroke="var(--gradient-1)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--background)", stroke: "var(--gradient-1)", strokeWidth: 1.5 }} activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)", stroke: "var(--gradient-1)" }} isAnimationActive={!reduceMotion} animationDuration={1950} animationEasing="linear" />
        <Line type="linear" dataKey="totalCurrent" name="진행 중 TOTAL" stroke="var(--gradient-1)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2.5, fill: "var(--background)", stroke: "var(--gradient-1)", strokeWidth: 1.5 }} activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)", stroke: "var(--gradient-1)" }} isAnimationActive={!reduceMotion} animationDuration={1950} animationEasing="linear">
          <LabelList dataKey="total" valueAccessor={(entry: { payload?: CumulativeRddaDatum }) => entry.payload?.month === lastMonth ? entry.payload?.total ?? "" : ""} position="top" offset={10} fill="var(--muted-foreground)" fontSize={10} fontWeight={600} />
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
  const ts = useAppStore((state) => state.ts)
  const study = useAppStore((state) => state.study)
  const materialsManual = useAppStore((state) => state.materialsManual)
  const chemical = useAppStore((state) => state.chemical)
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const [materialFormKind, setMaterialFormKind] = useState<MaterialKind | null>(null)
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null)
  const [trendFeed, setTrendFeed] = useState<TrendFeed | null>(null)
  const [trendKpi, setTrendKpi] = useState<TrendKpi | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const sections = useMemo(() => homeSectionCards(records, today, kpiRanges), [records, today, kpiRanges])
  const processPendingStyles = useMemo(() => pendingStylesByProcess(records), [records])
  const kpiDetails = useMemo(() => homeKpiRecordDetails(records, today, kpiRanges), [records, today, kpiRanges])
  const monthly = useMemo(() => monthlyDevelopmentTrend(records, completed, today, rddaMonths), [records, completed, today, rddaMonths])
  const monthlyKpis = useMemo(() => monthly.reduce((summary, item) => ({
    total: summary.total + item.total,
    gd: summary.gd + item.gd,
    domestic: summary.domestic + item.domestic,
    production: summary.production + item.production,
    purchase: summary.purchase + item.purchase,
  }), { total: 0, gd: 0, domestic: 0, production: 0, purchase: 0 }), [monthly])
  const tsDeckMaterials = useMemo(() => materialsOf("TS", deriveTsMaterials(ts), materialsManual), [materialsManual, ts])
  const studyDeckMaterials = useMemo(() => materialsOf("STUDY", deriveStudyMaterials(study), materialsManual), [materialsManual, study])
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  useEffect(() => {
    window.localStorage.setItem(HOME_KPI_RANGE_STORAGE_KEY, JSON.stringify(kpiRanges))
  }, [kpiRanges])

  useEffect(() => {
    window.localStorage.setItem(RDDA_MONTHS_STORAGE_KEY, String(rddaMonths))
  }, [rddaMonths])

  useEffect(() => {
    let active = true
    Promise.all([loadTrendFeed(), loadTrendKpi()])
      .then(([feed, kpi]) => {
        if (!active) return
        setTrendFeed(feed)
        setTrendKpi(kpi)
      })
      .catch(() => {
        if (!active) return
        setTrendFeed(null)
        setTrendKpi(null)
      })
      .finally(() => {
        if (active) setTrendLoading(false)
      })
    return () => { active = false }
  }, [])

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

  const openMaterialForm = (kind: MaterialKind, item: MaterialItem | null = null) => {
    setSelectedMaterial(null)
    setEditingMaterial(item)
    setMaterialFormKind(kind)
  }

  return (
    <section className="-mt-1 min-w-0 space-y-8">
      <PageHeader title="대시보드" subtitle="DD 전체현황을 기준으로 개발 업무와 최신 정보를 확인합니다." actions={<div className="flex flex-wrap justify-end gap-2"><DataUpload kind="home-dd" label="DD 업로드" accept=".xlsx,.xls" compact onFiles={(files) => { if (files[0]) void ingestDevelopment(files[0]) }} /><Button type="button" variant="outline" onClick={() => navigate("/sync")}><RefreshCw aria-hidden="true" />데이터 상태</Button></div>} />

      <Reveal>
        <div className="group block w-full rounded-[12px] text-left">
          <Card className={`relative overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/80" />
            <CardContent className="relative p-6 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-[10px] border border-white/70 bg-[color-mix(in_oklab,var(--gradient-1)_11%,var(--card))] text-[var(--gradient-1)] shadow-[0_8px_18px_-14px_rgba(15,23,42,0.28)]"><LoaderCircle className="size-4.5 transition-transform duration-700 group-hover:rotate-90 motion-reduce:transition-none" /></span>
                  <div>
                    <p className="text-xs font-medium tracking-[0.04em] text-[color-mix(in_oklab,var(--muted-foreground)_78%,transparent)]">Overall status</p>
                    <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)]"><NumberTicker value={sections.progress.total} /><span className="ml-1.5 text-xs font-normal tracking-normal text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)]">건 진행 중</span></p>
                  </div>
                </div>
                <Badge variant="outline" className="border-white/65 bg-white/32 text-[10px] font-medium text-[var(--muted-foreground)] backdrop-blur">DD 전체현황</Badge>
              </div>
              <ProcessFunnel process={sections.progress.process} pendingStyles={processPendingStyles} reduceMotion={reduceMotion} onNavigate={() => navigate("/development")} />
            </CardContent>
          </Card>
        </div>
      </Reveal>

      <div className="grid gap-5 sm:grid-cols-3">
        <KpiCard icon={<TimerReset className="size-4" />} label="신규 접수" value={sections.thisWeekNew} rangeLabel={rangeLabel("new")} caption="Request Date 기준" accent="var(--gradient-1)" onClick={() => setKpiDetailKind("new")} onCalendarClick={() => setKpiDetailKind("new")} />
        <KpiCard icon={<CheckCircle2 className="size-4" />} label="완료" value={sections.lastWeekDone} rangeLabel={rangeLabel("completed")} caption="Received Date 기준" accent="var(--chart-2)" delay={75} onClick={() => setKpiDetailKind("completed")} onCalendarClick={() => setKpiDetailKind("completed")} />
        <ScheduleCard dueSoon={sections.scheduleDueSoon} late={sections.scheduleLate} onClick={() => setKpiDetailKind("schedule")} />
      </div>

      <KpiDetailSheet kind={kpiDetailKind} details={kpiDetails} ranges={kpiRanges} onRangeChange={updateKpiRange} onOpenChange={(open) => { if (!open) setKpiDetailKind(null) }} />

      <Reveal>
        <Card className={`group relative overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/95" />
          <CardContent className="relative p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--chart-2)] to-[var(--gradient-1)] text-white shadow-[0_7px_18px_-6px_rgba(76,91,212,0.65)]"><TrendingUp className="size-4" aria-hidden="true" /></span><div><h2 className="text-base font-semibold text-[var(--foreground)]">FL 등록 현황</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">생산처별 누적 등록 흐름</p></div></div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 rounded-full border border-white/80 bg-white/60 p-1 shadow-sm backdrop-blur" role="group" aria-label="FL 등록 현황 조회 기간 선택">
                {RDDA_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    aria-pressed={rddaMonths === option.months}
                    onClick={() => setRddaMonths(option.months)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium outline-none transition-[color,background-color,transform] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${rddaMonths === option.months ? "bg-white text-[var(--foreground)] shadow-[0_4px_12px_-6px_rgba(15,23,42,0.18)]" : "text-[var(--muted-foreground)] hover:-translate-y-0.5 hover:text-[var(--foreground)]"}`}
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
            <Magnetic strength={8} lift={6} tilt={3}>
            <div className="group/item relative h-full overflow-hidden rounded-[10px] border border-white/75 bg-white/60 p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.2)] backdrop-blur transition-[box-shadow] duration-[var(--t-lift)] ease-[var(--e-soft)] hover:shadow-[0_14px_26px_-16px_rgba(15,23,42,0.26)] motion-reduce:transition-none">
              <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)]" />
              <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{rddaMonths}개월 TOTAL</p><p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis.total} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
            </div>
            </Magnetic>
            {RDDA_SERIES.map((series) => (
              <Magnetic key={series.key} strength={8} lift={6} tilt={3}>
              <div className="group/item relative h-full overflow-hidden rounded-[10px] border border-white/75 bg-white/60 p-3 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.18)] backdrop-blur transition-[box-shadow] duration-[var(--t-lift)] ease-[var(--e-soft)] hover:shadow-[0_14px_26px_-16px_rgba(15,23,42,0.24)] motion-reduce:transition-none">
                <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full" style={{ background: series.color }} />
                <span aria-hidden="true" className="absolute -right-4 -top-5 size-12 rounded-full opacity-10 blur-xl transition-opacity duration-300 group-hover/item:opacity-25" style={{ background: series.color }} />
                <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{series.label}</p><span className="text-[10px] text-[var(--muted-foreground)]">{series.range}</span></div>
                <p className="mt-1 text-2xl font-semibold tracking-tight"><NumberTicker value={monthlyKpis[series.key]} /><span className="ml-1 text-xs text-[var(--muted-foreground)]">건</span></p>
              </div>
              </Magnetic>
            ))}
          </div>
          <div className="mt-5 rounded-[12px] border border-white/75 bg-white/48 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur"><RddaTrendChart key={rddaMonths} monthly={monthly} reduceMotion={reduceMotion} /></div>
        </CardContent></Card>
      </Reveal>

      <section aria-labelledby="owner-board-title">
        <div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--gradient-3)] to-[var(--gradient-1)] text-white shadow-[0_7px_18px_-6px_rgba(76,91,212,0.65)]"><ClipboardList className="size-4" aria-hidden="true" /></span><div><h2 id="owner-board-title" className="text-base font-semibold text-[var(--foreground)]">담당자별 진행 현황</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">담당자·공정 단계별 진행 중 스타일 분포입니다.</p></div></div>
        <Card className={`relative overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}><OwnerLaneBoard rows={records} onSelect={() => navigate("/development")} /></Card>
      </section>

      <section aria-labelledby="work-report-title">
        <div className="mb-5"><h2 id="work-report-title" className="text-base font-semibold text-[var(--foreground)]">Work report</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">연결된 업무 화면의 핵심 현황입니다.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { kind: "TS" as const, title: "TS 관리", description: "사고사례·불량 trouble shoot", path: "/ts", icon: Wrench, items: tsDeckMaterials, empty: "SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다." },
            { kind: "STUDY" as const, title: "TECHNICAL REFERENCES", description: "섬유 교육자료", path: "/study", icon: BookOpenCheck, items: studyDeckMaterials, empty: "SETTING에서 STUDY 엑셀을 업로드하면 교육 과제가 카드로 표시됩니다." },
          ].map((deck, index) => {
            const Icon = deck.icon
            return (
              <Reveal key={deck.kind} delay={index * 75}>
                <Card className="h-full overflow-hidden [--hover-lift:0px] hover:shadow-sm">
                  <CardContent className="flex h-full flex-col p-6 sm:p-7">
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
        </div>
      </section>

      <HomeTrendSection feed={trendFeed} kpi={trendKpi} loading={trendLoading} />

      <section aria-labelledby="trend-issue-title">
        <div className="mb-5"><h2 id="trend-issue-title" className="text-base font-semibold text-[var(--foreground)]">기능성 포트폴리오</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">기능성 원단을 카테고리별로 살펴보고 관련 자료를 연결합니다.</p></div>
        <div className="min-w-0" aria-label={`${TREND_TABS[0].label} 미리보기`}>
          <PortfolioPreview portfolio={chemical} onNavigate={navigate} />
        </div>
      </section>

      <MaterialDetailSheet item={selectedMaterial} onOpenChange={(open) => { if (!open) setSelectedMaterial(null) }} onEdit={(item) => openMaterialForm(item.kind, item)} onNavigate={selectedMaterial && ["TS", "STUDY", "PORTFOLIO"].includes(selectedMaterial.kind) ? (item) => navigate(item.kind === "TS" ? "/ts" : item.kind === "STUDY" ? "/study" : "/trend/portfolio") : undefined} />
      <MaterialFormSheet open={materialFormKind !== null} defaultKind={materialFormKind ?? "MACRO"} item={editingMaterial} onOpenChange={(open) => { if (!open) { setMaterialFormKind(null); setEditingMaterial(null) } }} />
    </section>
  )
}
