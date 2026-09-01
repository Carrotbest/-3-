import { useEffect, useId, useMemo, useState } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { AlertTriangle, ExternalLink, Landmark, Newspaper, TrendingDown, TrendingUp } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { readChartTheme, tooltipStyle } from "@/components/charts/chart-theme"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  fmtDelta, fmtValue, loadTrendKpi, periodLabel,
  type BuyerNewsItem, type KpiCard, type TrendKpi,
} from "@/data/trend"
import { useInView } from "@/lib/useInView"
import { HOME_GLASS_STATIC, HOME_GLASS_SURFACE } from "@/lib/home-surface"
import { METRIC_GROUP_COLOR } from "@/lib/trend-metric-colors"
import { cn } from "@/lib/utils"

function shortPeriod(period: string) {
  const quarter = period.match(/^(\d{4})-Q([1-4])$/)
  if (quarter) return `${quarter[1].slice(2)}'Q${quarter[2]}`
  const month = period.match(/^(\d{4})-(\d{2})$/)
  if (month) return `${month[1].slice(2)}.${month[2]}`
  return period.length > 7 ? period.slice(2, 7) : period
}

function shortNumber(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`
  return String(Number(value.toFixed(1)))
}

function yearAgoPeriod(period: string) {
  const match = period.match(/^(\d{4})(.*)$/)
  return match ? `${Number(match[1]) - 1}${match[2]}` : ""
}

/** 지표 하나. 값, 직전 대비, 전년 대비, 추이, 출처를 한 장에 담는다. */
function MetricTile({ card, chart, compact = false, animateOnView = false, featured = false }: {
  card: KpiCard
  chart: "bar" | "line"
  compact?: boolean
  animateOnView?: boolean
  featured?: boolean
}) {
  const theme = readChartTheme()
  const gradientId = `metric-fill-${useId().replace(/:/g, "")}`
  const { ref: chartRef, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  const points = card.points.map((point) => ({ period: point.period, short: shortPeriod(point.period), value: point.value }))
  const rising = (card.yoy ?? 0) >= 0
  const Trend = rising ? TrendingUp : TrendingDown
  const color = theme.chart[METRIC_GROUP_COLOR[card.metric] ?? 0]
  const values = points.map((point) => point.value)
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 0
  const span = hi - lo || Math.abs(hi) * 0.05 || 1
  const pad = span * 0.18
  const domain: [number, number] = [lo - pad, hi + pad]
  const latest = points.at(-1)
  const yearAgo = latest ? points.find((point) => point.period === yearAgoPeriod(latest.period)) : undefined
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const showChart = !animateOnView || reducedMotion || inView
  const animateChart = animateOnView && !reducedMotion
  const value = card.value
  const decimals = value === null ? 0 : Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 1 : 2

  return (
    <div
      className={cn(
        `relative flex h-full min-w-0 flex-col overflow-hidden p-4 ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`,
        card.stale && "border-[var(--warning)]",
      )}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">{card.label}</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
            {card.freq} · {periodLabel(card)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {featured ? <Badge variant="outline" className="border-white/65 bg-white/34 text-[10px]">핵심 원가</Badge> : null}
          {card.stale ? <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle aria-hidden="true" className="size-3" />
            갱신 지연
          </Badge> : null}
        </div>
      </div>

      <p className="mt-3 text-xl font-semibold tracking-tight tabular-nums text-[var(--foreground)]">
        {animateOnView && value !== null ? (
          <NumberTicker value={value} decimals={decimals} suffix={` ${card.unit}`} startOnView />
        ) : fmtValue(value, card.unit)}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs tabular-nums">
        <span className="text-[var(--muted-foreground)]">
          직전 <span className="text-[var(--foreground)]">{fmtDelta(card.prev)}</span>
        </span>
        <span className={cn("flex items-center gap-1", rising ? "text-[var(--chart-1)]" : "text-[var(--destructive)]")}>
          <Trend aria-hidden="true" className="size-3.5" />
          전년 {fmtDelta(card.yoy)}
        </span>
      </div>

      <div ref={chartRef} className={cn("mt-3 min-w-0", compact ? "h-24" : "h-28")}>
        {points.length >= 2 ? (
          showChart ? <ResponsiveContainer width="100%" height="100%">
            {chart === "bar" ? (
              <BarChart data={points} margin={{ top: 6, right: 8, bottom: 2, left: 2 }}>
                <CartesianGrid stroke={theme.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="short" tick={{ fontSize: 9, fill: theme.mutedForeground }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tickFormatter={shortNumber} tick={{ fontSize: 9, fill: theme.mutedForeground }} tickLine={false} axisLine={false} width={48} />
                <Tooltip contentStyle={tooltipStyle(theme)} formatter={(value: number) => fmtValue(value, card.unit)} />
                <Bar dataKey="value" fill={theme.chart[0]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            ) : (
              <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 2, left: 2 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.34} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={theme.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="short" tick={{ fontSize: 9, fill: theme.mutedForeground }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tickFormatter={shortNumber} tick={{ fontSize: 9, fill: theme.mutedForeground }} tickLine={false} axisLine={false} width={48} domain={domain} />
                <Tooltip contentStyle={tooltipStyle(theme)} formatter={(value: number) => fmtValue(value, card.unit)} />
                {yearAgo ? <ReferenceLine y={yearAgo.value} stroke={theme.mutedForeground} strokeDasharray="4 4" strokeOpacity={0.7} /> : null}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={1.25}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={animateChart}
                  animationDuration={700}
                />
                {latest ? <ReferenceDot x={latest.short} y={latest.value} r={2.5} fill={color} stroke={theme.card} strokeWidth={2} /> : null}
              </AreaChart>
            )}
          </ResponsiveContainer> : null
        ) : (
          <p className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">
            추이를 그리려면 기간이 2개 이상 필요합니다.
          </p>
        )}
      </div>

      {card.note ? (
        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">
          {card.note}
        </p>
      ) : null}

      <a
        href={card.source_url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
      >
        {card.source_name}
        <ExternalLink aria-hidden="true" className="size-3" />
      </a>
    </div>
  )
}

function NewsList({ items }: { items: BuyerNewsItem[] }) {
  if (!items.length) {
    return (
      <p className="py-6 text-center text-xs text-[var(--muted-foreground)]">
        최근 90일 안에 잡힌 기사가 없습니다.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => (
        <li key={item.u} className="py-2">
          <div className="flex items-start gap-2">
            <time className="w-12 shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {item.d.slice(5)}
            </time>
            <div className="min-w-0 flex-1">
              <a
                href={item.u}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-start gap-1 text-xs leading-5 text-[var(--foreground)] hover:underline"
              >
                <span className="min-w-0">{item.t}</span>
                <ExternalLink aria-hidden="true" className="mt-1 size-3 shrink-0 text-[var(--muted-foreground)]" />
              </a>
              {item.o && item.o !== item.t ? (
                <p className="truncate text-[10px] text-[var(--muted-foreground)]" title={item.o}>{item.o}</p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function BuyerSparkline({ card }: { card?: KpiCard }) {
  const theme = readChartTheme()
  const points = card?.points.slice(-12) ?? []
  if (points.length < 2) return <span className="h-7 w-16" aria-hidden="true" />
  return (
    <span className="h-7 w-16 shrink-0" aria-label={`${card?.label ?? "매출"} 최근 ${points.length}개 분기 추이`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <Line type="monotone" dataKey="value" stroke={theme.chart[0]} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </span>
  )
}

function GovernmentIndicators({ cards }: { cards: KpiCard[] }) {
  const preferred = [
    "usdkrw", "us_apparel_cpi", "us_apparel_inventory_ratio",
    "us_real_gdp", "cotton_a_index", "crude_brent",
  ]
  const byMetric = new Map(cards.map((card) => [card.metric, card]))
  const ordered = preferred.map((metric) => byMetric.get(metric)).filter((card): card is KpiCard => Boolean(card))
  return <SectionCard
    title="정부 통계 · 거시 지표"
    subtitle="원달러 환율, 미국 의류 CPI·소매 재고율·실질 GDP와 면화·유가를 6개 핵심 지표로 봅니다."
    actions={<span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"><Landmark aria-hidden="true" className="size-4" />{ordered.length}개 지표</span>}
  >
    {ordered.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{ordered.map((card, index) => (
      <Reveal key={card.metric} delay={index * 75} className="h-full">
        <MetricTile card={card} chart="line" animateOnView featured={card.metric === "cotton_a_index" || card.metric === "crude_brent"} />
      </Reveal>
    ))}</div>
      : <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">정부 통계 지표가 없습니다.</p>}
  </SectionCard>
}

interface BuyerRow {
  entity: string
  key: string
  revenue?: KpiCard
  operating?: KpiCard
  inventory?: KpiCard
}

export function TrendMacro() {
  const [kpi, setKpi] = useState<TrendKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedBuyer, setSelectedBuyer] = useState<string | null>(null)

  useEffect(() => {
    void loadTrendKpi().then((next) => {
      setKpi(next)
      setLoading(false)
    })
  }, [])

  const companies = useMemo<BuyerRow[]>(() => {
    const byEntity = new Map<string, BuyerRow>()
    for (const [entity, side] of Object.entries(kpi?.entity_sides ?? {})) {
      if (side === "buyer") {
        byEntity.set(entity, { entity, key: kpi?.entity_keys?.[entity] ?? entity })
      }
    }
    for (const card of kpi?.cards ?? []) {
      if (card.group !== "buyer") continue
      const key = kpi?.entity_keys?.[card.entity] ?? card.entity
      const row = byEntity.get(card.entity) ?? { entity: card.entity, key }
      if (card.metric.includes("revenue")) row.revenue = card
      else if (card.metric.includes("operating")) row.operating = card
      else if (card.metric.includes("inventory")) row.inventory = card
      byEntity.set(card.entity, row)
    }
    return [...byEntity.values()].sort((a, b) => (b.revenue?.value ?? 0) - (a.revenue?.value ?? 0))
  }, [kpi])

  const buyers = useMemo(() => companies.filter((row) => (kpi?.entity_sides?.[row.entity] ?? "buyer") === "buyer"), [companies, kpi])

  const gov = useMemo(() => (kpi?.cards ?? []).filter((card) => card.group === "gov"), [kpi])

  useEffect(() => {
    if (!selectedBuyer && buyers.length) setSelectedBuyer(buyers[0].entity)
  }, [buyers, selectedBuyer])

  const shown = buyers
  const selected = selectedBuyer
  const current = shown.find((row) => row.entity === selected) ?? shown[0]
  if (loading) {
    return <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">지표를 불러오는 중입니다.</p>
  }

  if (!kpi || !kpi.cards.length) {
    return (
      <SectionCard title="지표가 없습니다" subtitle="아직 KPI 수집이 돌지 않았습니다.">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">tools/trend</code>에서{" "}
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">python run.py kpi</code>를 돌리십시오.
          바이어 매출은 <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">SEC_CONTACT</code>,
          미국 수입 통계는 <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">CENSUS_API_KEY</code> 환경변수가 필요합니다.
        </p>
      </SectionCard>
    )
  }

  const news = (current && kpi.news?.[current.key]) || []

  return (
    <section className="min-w-0 space-y-8">
      <GovernmentIndicators cards={gov} />
      {/* 기업 모니터링. 왼쪽에서 바이어를 고르고 오른쪽에서 실적과 기사를 함께 본다. */}
      <Card className="flex h-[760px] min-w-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <div><CardTitle>기업 모니터링</CardTitle>
          <CardDescription>
            미국 SEC 공시에서 분기 매출, 영업이익, 분기말 재고를 받습니다.
            소매업 회계연도가 달력과 어긋나므로 실제 종료일을 함께 표시합니다.
          </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 min-w-0 flex-1">
          <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col">
              <p className="mb-2 shrink-0 text-[10px] leading-4 text-[var(--muted-foreground)]">
                증감률: 최근 분기 매출의 전년 동기 대비(YoY)
              </p>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {shown.map((row) => {
                const active = current?.entity === row.entity
                const yoy = row.revenue?.yoy ?? null
                const latestPeriod = row.revenue?.period
                return (
                  <li key={row.entity}>
                    <button
                      type="button"
                      onClick={() => setSelectedBuyer(row.entity)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
                        active
                          ? "border-[var(--ring)] bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]"
                          : "border-[var(--border)] hover:bg-[var(--muted)]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                          {row.entity}
                        </span>
                        <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                          {kpi.entity_codes?.[row.entity] ? `${kpi.entity_codes[row.entity]} · ` : ""}{latestPeriod ? shortPeriod(latestPeriod) : "미수집"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <BuyerSparkline card={row.revenue} />
                        <span className={cn(
                          "w-12 text-right text-xs font-semibold tabular-nums",
                          yoy === null ? "text-[var(--muted-foreground)]"
                            : yoy > 0 ? "text-red-600 dark:text-red-400"
                              : yoy < 0 ? "text-blue-600 dark:text-blue-400" : "text-[var(--muted-foreground)]",
                        )}>
                          {fmtDelta(yoy)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
              </ul>
            </div>

            <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
              {current ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-3">
                    {current.revenue ? <MetricTile card={current.revenue} chart="bar" compact /> : null}
                    {current.operating ? <MetricTile card={current.operating} chart="bar" compact /> : null}
                    {current.inventory ? <MetricTile card={current.inventory} chart="line" compact /> : null}
                  </div>

                  {!current.revenue && !current.operating && !current.inventory ? (
                    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                      <p className="text-sm font-medium text-[var(--foreground)]">공개 분기 재무제표가 아직 수집되지 않았습니다.</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">SEC 공시에서 이 회사가 쓰는 XBRL 태그를 아직 못 찾았습니다. tools/trend/trendbot/kpi/sec_edgar.py의 태그 목록을 넓히면 들어옵니다.</p>
                    </div>
                  ) : null}

                  <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                      <Newspaper aria-hidden="true" className="size-4" />
                      {current.entity} 최신 동향
                    </p>
                    <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">
                      소싱과 실적 기사만 따로 받습니다. 소재 피드에는 올라오지 않습니다.
                    </p>
                    <NewsList items={news} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-[var(--muted-foreground)]">
        자동 수집이 안 되는 지표(H&amp;M·패스트리테일링 실적, 베트남·한국 섬유 수출액)는{" "}
        <code className="rounded bg-[var(--muted)] px-1 py-0.5">tools/trend/config/kpi_manual.csv</code>에
        metric·period·value로 넣으면 같은 카드로 나옵니다. 사내 실적·단가는 저장소가 공개이므로 넣지 않습니다.
        갱신 {new Date(kpi.generated_at).toLocaleString("ko-KR")}.
      </p>
    </section>
  )
}
