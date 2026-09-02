import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react"

import { NumberTicker } from "@/components/motion/NumberTicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  fmtDelta,
  type KpiCard,
  type TrendArticle,
  type TrendFeed,
  type TrendKpi,
} from "@/data/trend"
import { fmtDate } from "@/data/format"
import { HOME_GLASS_STATIC, HOME_GLASS_SURFACE } from "@/lib/home-surface"
import { METRIC_GROUP_COLOR } from "@/lib/trend-metric-colors"
import { useInView } from "@/lib/useInView"
import { cn } from "@/lib/utils"

const HOME_METRICS = [
  "usdkrw",
  "us_real_gdp",
  "cotton_a_index",
  "crude_brent",
  "us_apparel_cpi",
  "us_apparel_inventory_ratio",
] as const

const METRIC_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"] as const
const MACRO_ROW_HEIGHT = 104

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return reducedMotion
}

function usePageVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" || document.visibilityState === "visible",
  )

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])

  return visible
}

function handleFocusLeave(event: FocusEvent<HTMLElement>, resume: () => void) {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume()
}

function FabricTrendStack({ articles }: { articles: TrendArticle[] }) {
  const reducedMotion = usePrefersReducedMotion()
  const pageVisible = usePageVisible()
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    setActiveIndex((current) => current % articles.length)
  }, [articles.length])

  useEffect(() => {
    if (reducedMotion || paused || !pageVisible || articles.length < 2) return
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % articles.length)
    }, 6000)
    return () => window.clearInterval(interval)
  }, [articles.length, pageVisible, paused, reducedMotion])

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + articles.length) % articles.length)
  }

  const stacked = articles.map((_, depth) => ({
    article: articles[(activeIndex + depth) % articles.length],
    depth,
  }))

  return (
    <Card
      className={`relative h-full overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => handleFocusLeave(event, () => setPaused(false))}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted-foreground)]">FABRIC</p>
            <h3 className="mt-1 truncate text-base font-semibold text-[var(--foreground)]">최근 소재 기술 기사</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs tabular-nums text-[var(--muted-foreground)]">{activeIndex + 1} / {articles.length}</span>
            <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px] [&_svg]:size-3.5">
              <Link to="/trend/fabric" aria-label="FABRIC TREND 전체 보기">전체 보기<ArrowUpRight aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-5 h-[22rem] sm:h-[20.5rem]">
          {stacked.slice().reverse().map(({ article, depth }) => {
            const active = depth === 0
            return (
              <button
                key={article.id}
                type="button"
                tabIndex={active ? 0 : -1}
                aria-hidden={!active}
                aria-label={`다음 기사 보기: ${article.t}`}
                onClick={() => active && move(1)}
                className="absolute inset-x-0 top-0 h-[18rem] w-full cursor-pointer overflow-hidden rounded-[var(--radius)] border border-white/75 bg-[var(--card)] text-left shadow-[var(--shadow-2)] outline-none transition-[transform,opacity,box-shadow] duration-[var(--t-lift)] ease-[var(--e-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none sm:h-72"
                style={{
                  zIndex: articles.length - depth,
                  opacity: Math.max(0.38, 1 - depth * 0.14),
                  transform: `translateY(${depth * 11}px) scale(${1 - depth * 0.025})`,
                  transformOrigin: "top center",
                }}
              >
                <span className="grid h-full sm:grid-cols-[46%_1fr]">
                  <span className="relative block min-h-0 overflow-hidden bg-[var(--muted)]">
                    <img
                      src={article.i}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = "none" }}
                      className="size-full object-cover"
                      style={{
                        clipPath: reducedMotion || active ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
                        transition: reducedMotion ? "none" : "clip-path var(--t-lift) var(--e-soft)",
                      }}
                    />
                    <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                  </span>
                  <span className="flex min-w-0 flex-col p-5 sm:p-6">
                    <Badge
                      variant="secondary"
                      className="w-fit border-transparent text-[10px]"
                      style={{ color: CATEGORY_COLOR[article.c] }}
                    >
                      {CATEGORY_LABEL[article.c]}
                    </Badge>
                    <strong className="mt-4 line-clamp-2 text-base leading-7 text-[var(--foreground)] sm:text-lg">{article.t}</strong>
                    <span className="mt-auto text-xs text-[var(--muted-foreground)]">{fmtDate(article.d)} · {article.m}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-label="기사 선택">
            {articles.map((article, index) => (
              <button
                key={article.id}
                type="button"
                aria-label={`${index + 1}번째 기사 보기`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "size-2.5 cursor-pointer rounded-full outline-none transition-[width,background-color] duration-[var(--t-lift)] ease-[var(--e-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transition-none",
                  index === activeIndex ? "w-6 bg-[var(--foreground)]" : "bg-[var(--border)] hover:bg-[var(--muted-foreground)]",
                )}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="이전 기사" onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="다음 기사" onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function sparklinePoints(card: KpiCard) {
  const values = card.points.slice(-12).map((point) => point.value)
  if (values.length < 2) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 96
    const y = 27 - ((value - min) / span) * 22
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
}

function MacroMetricRow({ card, drawLine }: { card: KpiCard; drawLine: boolean }) {
  const color = METRIC_COLORS[METRIC_GROUP_COLOR[card.metric] ?? 0]
  const rising = (card.yoy ?? 0) >= 0
  const TrendIcon = rising ? TrendingUp : TrendingDown
  const decimals = card.value === null ? 0 : Math.abs(card.value) >= 1000 ? 0 : Math.abs(card.value) >= 10 ? 1 : 2
  const points = sparklinePoints(card)

  return (
    <Link
      to="/trend/macro"
      className="group grid h-[104px] grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 border-b border-[var(--border)]/70 px-1 outline-none transition-colors duration-[var(--t-lift)] ease-[var(--e-soft)] hover:bg-white/28 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
    >
      <span className="min-w-0 pl-3">
        <span className="block truncate text-xs font-medium text-[var(--muted-foreground)]">{card.label}</span>
        <span className="mt-1.5 block text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {card.value === null ? "—" : <NumberTicker value={card.value} decimals={decimals} suffix={` ${card.unit}`} startOnView />}
        </span>
        <span className={cn("mt-1 flex items-center gap-1 text-[11px] tabular-nums", rising ? "text-[var(--chart-1)]" : "text-[var(--destructive)]") }>
          <TrendIcon aria-hidden="true" className="size-3" />전년 대비 {fmtDelta(card.yoy)}
        </span>
      </span>
      <svg viewBox="0 0 96 32" className="h-10 w-24 overflow-visible" aria-hidden="true">
        {points ? <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={drawLine ? 0 : 1}
          style={{ transition: drawLine ? "stroke-dashoffset 900ms var(--e-soft)" : "none" }}
        /> : null}
      </svg>
    </Link>
  )
}

function MacroTrendTicker({ cards }: { cards: KpiCard[] }) {
  const reducedMotion = usePrefersReducedMotion()
  const pageVisible = usePageVisible()
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.2 })
  const [paused, setPaused] = useState(false)
  const [tickerIndex, setTickerIndex] = useState(0)
  const [animateTicker, setAnimateTicker] = useState(true)

  useEffect(() => {
    if (reducedMotion) {
      setAnimateTicker(false)
      setTickerIndex(0)
      return
    }
    setAnimateTicker(true)
  }, [reducedMotion])

  useEffect(() => {
    if (reducedMotion || paused || !pageVisible || cards.length < 2) return
    const interval = window.setInterval(() => {
      setAnimateTicker(true)
      setTickerIndex((current) => current + 1)
    }, 4000)
    return () => window.clearInterval(interval)
  }, [cards.length, pageVisible, paused, reducedMotion])

  useEffect(() => {
    if (animateTicker || reducedMotion) return
    const frame = window.requestAnimationFrame(() => setAnimateTicker(true))
    return () => window.cancelAnimationFrame(frame)
  }, [animateTicker, reducedMotion])

  const resetLoop = () => {
    if (tickerIndex !== cards.length) return
    setAnimateTicker(false)
    setTickerIndex(0)
  }

  return (
    <Card
      ref={ref}
      className={`h-full overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => handleFocusLeave(event, () => setPaused(false))}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted-foreground)]">MACRO</p>
            <h3 className="mt-1 truncate text-base font-semibold text-[var(--foreground)]">주요 거시 지표</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="border-white/65 bg-white/34 text-[10px]">3 / {cards.length}</Badge>
            <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px] [&_svg]:size-3.5">
              <Link to="/trend/macro" aria-label="MACRO TREND 전체 보기">전체 보기<ArrowUpRight aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-5 overflow-hidden" style={{ height: MACRO_ROW_HEIGHT * 3 }} aria-label={`거시 지표 ${cards.length}개`}>
          <div
            onTransitionEnd={resetLoop}
            style={{
              transform: `translateY(-${tickerIndex * MACRO_ROW_HEIGHT}px)`,
              transition: reducedMotion || !animateTicker ? "none" : "transform var(--t-lift) var(--e-soft)",
            }}
          >
            {[...cards, ...cards].map((card, index) => (
              <MacroMetricRow key={`${card.metric}-${index}`} card={card} drawLine={reducedMotion || inView} />
            ))}
          </div>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-[var(--card)]/70 to-transparent" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--card)]/70 to-transparent" />
        </div>
      </CardContent>
    </Card>
  )
}

export function HomeTrendSection({ feed, kpi, loading }: { feed: TrendFeed | null; kpi: TrendKpi | null; loading: boolean }) {
  const articles = useMemo(() => [...(feed?.articles ?? [])]
    .filter((article) => Boolean(article.i))
    .sort((left, right) => Number(right.h > 1) - Number(left.h > 1) || right.d.localeCompare(left.d))
    .slice(0, 5), [feed])

  const metricOrder = useMemo(() => new Map<string, number>(HOME_METRICS.map((metric, index) => [metric, index])), [])
  const cards = useMemo(() => (kpi?.cards ?? [])
    .filter((card) => card.group === "gov" && metricOrder.has(card.metric))
    .sort((left, right) => metricOrder.get(left.metric)! - metricOrder.get(right.metric)!), [kpi, metricOrder])

  const hasData = articles.length > 0 || cards.length > 0

  return (
    <section aria-labelledby="trend-home-title">
      <div className="mb-5">
        <h2 id="trend-home-title" className="text-base font-semibold text-[var(--foreground)]">TREND</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">소재 기술 동향과 시장 거시 지표를 함께 봅니다.</p>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)]/55 p-5 text-sm text-[var(--muted-foreground)]">트렌드 데이터를 불러오는 중입니다.</div>
      ) : hasData ? (
        <div className="grid gap-5 xl:grid-cols-12">
          {articles.length ? <div className={cards.length ? "xl:col-span-7" : "xl:col-span-12"}><FabricTrendStack articles={articles} /></div> : null}
          {cards.length ? <div className={articles.length ? "xl:col-span-5" : "xl:col-span-12"}><MacroTrendTicker cards={cards} /></div> : null}
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)]/55 p-5 text-sm text-[var(--muted-foreground)]">트렌드 데이터가 준비되면 이곳에 표시됩니다.</div>
      )}
    </section>
  )
}
