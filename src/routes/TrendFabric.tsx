import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Copy, ExternalLink, Flame, RotateCcw, Sparkles, Star, Users } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { Magnetic } from "@/components/motion/Magnetic"
import { NumberTicker } from "@/components/motion/NumberTicker"
import { Reveal } from "@/components/motion/Reveal"
import { Tilt3D } from "@/components/motion/Tilt3D"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { auth } from "@/data/firebase"
import { articleToStar, pushMyStars, subscribeTeamStars, type TeamTrendStars, type TrendStarItem } from "@/data/trend-stars"
import {
  CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER, SORTS, loadTrendFeed,
  readStars, sortArticles, writeStars,
  type SortKey, type TrendArticle, type TrendCategory, type TrendFeed,
} from "@/data/trend"
import { HOME_GLASS_HOVER, HOME_GLASS_STATIC, HOME_GLASS_SURFACE } from "@/lib/home-surface"
import { useInView } from "@/lib/useInView"
import { cn } from "@/lib/utils"

const PAGE = 40      // 한 번에 그리는 기사 수
// 급상승·처음 등장 카드는 "무슨 소재가 뜨나"에 답하는 자리다.
// 이벤트·지역·기업 태그는 건수가 크게 튀어 소재 신호를 덮는다. 순위에서만 뺀다.
// 태그 필터와 기사 목록에는 그대로 다 남는다.
const TREND_CARD_EXCLUDE = new Set([
  "전시회", "베트남", "인도네시아", "방글라데시", "중미", "렌징", "효성",
])
const RANGES = [
  { value: 7, label: "7일" },
  { value: 30, label: "30일" },
  { value: 120, label: "전체" },
] as const

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

interface CategorySummaryRow {
  category: TrendCategory
  count: number
}

const CATEGORY_GRADIENT: Record<TrendCategory, string> = {
  MATERIAL: "linear-gradient(90deg,color-mix(in oklab,var(--chart-1) 72%,black),var(--chart-1),color-mix(in oklab,var(--chart-1) 55%,white))",
  YARN: "linear-gradient(90deg,color-mix(in oklab,var(--chart-2) 72%,black),var(--chart-2),color-mix(in oklab,var(--chart-2) 55%,white))",
  FABRIC: "linear-gradient(90deg,color-mix(in oklab,var(--chart-3) 72%,black),var(--chart-3),color-mix(in oklab,var(--chart-3) 55%,white))",
  CHEMICAL: "linear-gradient(90deg,color-mix(in oklab,var(--chart-4) 72%,black),var(--chart-4),color-mix(in oklab,var(--chart-4) 55%,white))",
  RETAIL: "linear-gradient(90deg,color-mix(in oklab,var(--chart-5) 72%,black),var(--chart-5),color-mix(in oklab,var(--chart-5) 55%,white))",
  ETC: "linear-gradient(90deg,color-mix(in oklab,var(--muted-foreground) 72%,black),var(--muted-foreground),color-mix(in oklab,var(--muted-foreground) 48%,white))",
}

const TREND_BAR_TRANSITION = "duration-[1950ms] [transition-timing-function:linear] motion-reduce:transition-none"
const KEYWORD_CARD_BACKGROUND = [
  "linear-gradient(135deg,color-mix(in oklab,var(--chart-1) 30%,var(--card)),color-mix(in oklab,var(--chart-3) 18%,var(--card)))",
  "linear-gradient(135deg,color-mix(in oklab,var(--chart-1) 24%,var(--card)),color-mix(in oklab,var(--chart-3) 14%,var(--card)))",
  "linear-gradient(135deg,color-mix(in oklab,var(--chart-1) 18%,var(--card)),color-mix(in oklab,var(--chart-3) 10%,var(--card)))",
  "linear-gradient(135deg,color-mix(in oklab,var(--chart-1) 13%,var(--card)),color-mix(in oklab,var(--chart-3) 7%,var(--card)))",
] as const

type ArticleExcerpt = Pick<TrendArticle, "t" | "u" | "d" | "c" | "m"> & { s?: string; x?: string; i?: string }

function ArticleThumbnail({ article, className, showCategory = true }: { article: Pick<ArticleExcerpt, "i" | "c">; className?: string; showCategory?: boolean }) {
  return <div className={cn("relative overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]", className)} style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${CATEGORY_COLOR[article.c]} 25%, var(--card)), var(--muted))` }}>
    {article.i ? <img src={article.i} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none" onError={(event) => { event.currentTarget.style.display = "none" }} /> : null}
    {showCategory ? <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white">{article.c}</span> : null}
  </div>
}

function FabricHero({ categories, onCategory }: {
  categories: CategorySummaryRow[]
  onCategory: (category: TrendCategory) => void
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true, threshold: 0.25 })
  const total = categories.reduce((sum, row) => sum + row.count, 0)
  return (
    <Reveal>
      <Card className={`relative overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-32 rounded-full bg-[var(--gradient-1)] opacity-[0.055] blur-2xl" />
        <CardContent className="relative p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">최근 30일 기사 분류</p>
              <p className="text-xs tabular-nums text-[var(--muted-foreground)]">피드 {total}건</p>
            </div>
            <div ref={ref} className="mt-4 flex h-6 overflow-hidden rounded-full bg-[var(--muted)] shadow-inner" aria-label={`최근 30일 기사 분류 합계 ${total}건`}>
              {categories.map((row) => (
                <button
                  key={row.category}
                  type="button"
                  onClick={() => onCategory(row.category)}
                  className={`group/bar relative outline-none transition-[width,filter] ${TREND_BAR_TRANSITION} hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-white`}
                  style={{ width: `${inView && total ? (row.count / total) * 100 : 0}%`, background: CATEGORY_GRADIENT[row.category] }}
                  aria-label={`${CATEGORY_LABEL[row.category]} ${row.count}건 보기`}
                  title={`${CATEGORY_LABEL[row.category]} ${row.count}건`}
                >
                  {row.count / Math.max(total, 1) > 0.12 ? <span className="text-[10px] font-semibold text-white drop-shadow-sm">{row.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {categories.map((row) => (
                <button key={row.category} type="button" onClick={() => onCategory(row.category)} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: CATEGORY_COLOR[row.category] }} />
                  <span>{CATEGORY_LABEL[row.category]}</span>
                  <span className="tabular-nums text-[var(--foreground)]">{row.count}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  )
}

function TrendKpiCard({ icon, label, value, rangeLabel, caption, sourceBadge, accent, delay, pressed, onClick }: {
  icon: ReactNode
  label: string
  value: number
  rangeLabel?: string
  caption: string
  sourceBadge?: string
  accent: string
  delay: number
  pressed: boolean
  onClick: () => void
}) {
  return (
    <Reveal delay={delay} className="h-full">
      {/* tilt는 0이다. 3D 회전 안에 backdrop-filter 카드가 들어가면 호버 중 내용이 다시 래스터화되어 흐려진다. */}
      <Magnetic strength={5} lift={4} tilt={0} className="h-full">
        <button type="button" onClick={onClick} aria-pressed={pressed} className="group h-full w-full rounded-[12px] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
          <Card className={cn(`relative h-full overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_HOVER}`, pressed && "border-white/90 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_22px_44px_-24px_rgba(76,91,212,0.22)]")}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
            <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-32 rounded-full opacity-[0.055] blur-2xl transition-[opacity,transform] duration-500 group-hover:scale-110 group-hover:opacity-[0.11] motion-reduce:transition-none" style={{ background: accent }} />
            <CardContent className="relative flex h-full flex-col p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-[9px] border border-white/70 shadow-[0_7px_16px_-12px_rgba(15,23,42,0.28)] transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none" style={{ color: accent, background: `color-mix(in oklab, ${accent} 11%, var(--card))` }}>{icon}</span>
                {sourceBadge ? <Badge variant="outline" className="border-white/65 bg-white/34 text-[10px] font-medium text-[var(--muted-foreground)]">{sourceBadge}</Badge> : null}
              </div>
              <p className="mt-5 text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-[-0.035em] text-[var(--foreground)]">
                <NumberTicker value={value} startOnView /><span className="ml-1.5 text-xs font-normal tracking-normal text-[var(--muted-foreground)]">건</span>
              </p>
              {rangeLabel ? <p className="mt-3 text-sm font-medium tracking-[-0.01em] text-[var(--foreground)]">{rangeLabel}</p> : null}
              <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{caption}</p>
            </CardContent>
          </Card>
        </button>
      </Magnetic>
    </Reveal>
  )
}

function ExcerptDialog({ article, children }: { article: ArticleExcerpt; children: ReactNode }) {
  return <Dialog><DialogTrigger asChild>{children}</DialogTrigger><DialogContent>
    <DialogHeader><DialogTitle className="pr-8 text-lg leading-7">{article.t}</DialogTitle><DialogDescription>{article.m} · {article.d} · RSS 제공 내용 인용</DialogDescription></DialogHeader>
    <DialogBody className="space-y-4">
      <ArticleThumbnail article={article} className="h-56 w-full" />
      <blockquote className="border-l-4 border-[var(--border)] pl-4 text-sm leading-7 text-[var(--foreground)]">{article.x || article.s || "피드에 제공된 본문 내용이 없습니다."}</blockquote>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">저작권 보호를 위해 RSS 발행자가 제공한 본문 또는 요약 일부만 표시합니다. 전체 내용은 원문에서 확인하십시오.</p>
    </DialogBody>
    <DialogFooter><Button asChild><a href={article.u} target="_blank" rel="noreferrer noopener">원문 기사 열기<ExternalLink className="ml-1 size-4" /></a></Button></DialogFooter>
  </DialogContent></Dialog>
}

interface PanelProps {
  range: number
  onRange: (value: number) => void
  gate: "material" | "retail" | null
  onGate: (value: "material" | "retail" | null) => void
  category: TrendCategory | null
  onCategory: (value: TrendCategory | null) => void
  categoryCounts: Record<TrendCategory, number>
  tag: string | null
  onTag: (value: string | null) => void
  tagFacets: Array<{ key: string; n: number }>
  media: string | null
  onMedia: (value: string | null) => void
  mediaFacets: Array<{ key: string; n: number }>
  starOnly: boolean
  onStarOnly: (value: boolean) => void
  starCount: number
  onReset: () => void
}

const CHIP = "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none"
const CHIP_ON = "border-[var(--ring)] bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] text-[var(--foreground)]"
const CHIP_OFF = "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
const PILL_OPTION = "flex-1 rounded-full px-2.5 py-1 text-xs font-medium outline-none transition-[background-color,box-shadow,color] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
const PILL_ON = "bg-white text-[var(--foreground)] shadow-sm"
const PILL_OFF = "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
const ROW = "flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none"
const ROW_ON = "bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] font-medium text-[var(--foreground)]"
const ROW_OFF = "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"

/** 왼쪽 필터 패널. 분류를 목록으로 세워 두어야 카테고리 구분이 눈에 들어온다. */
function FilterPanel({
  range, onRange, gate, onGate, category, onCategory, categoryCounts, tag, onTag, tagFacets,
  media, onMedia, mediaFacets, starOnly, onStarOnly, starCount, onReset,
}: PanelProps) {
  const total = CATEGORY_ORDER.reduce((sum, item) => sum + categoryCounts[item], 0)

  return (
    <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
      <div className={`relative space-y-5 overflow-hidden p-4 ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" />
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">필터</p>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <RotateCcw aria-hidden="true" className="size-3" />
            초기화
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--foreground)]">기간</p>
          <div className="flex rounded-full border border-white/80 bg-white/60 p-1">
            {RANGES.map((item) => (
              <button key={item.value} type="button" onClick={() => onRange(item.value)}
                className={cn(PILL_OPTION, range === item.value ? PILL_ON : PILL_OFF)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--foreground)]">기사 범위</p>
          <div className="flex gap-1.5">
            {([
              { value: "material", label: "소재만" },
              { value: "retail", label: "유통만" },
            ] as const).map((item) => (
              <button key={item.value} type="button"
                onClick={() => onGate(gate === item.value ? null : item.value)}
                className={cn(CHIP, "flex-1", gate === item.value ? CHIP_ON : CHIP_OFF)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--foreground)]">소재 분류</p>
          <ul className="space-y-1">
            <li>
              <button type="button" onClick={() => onCategory(null)}
                className={cn(ROW, category === null ? ROW_ON : ROW_OFF)}>
                <span className="size-2.5 shrink-0 rounded-[2px] bg-[var(--muted-foreground)]" />
                <span className="flex-1">전체</span>
                <span className="tabular-nums">{total}</span>
              </button>
            </li>
            {CATEGORY_ORDER.map((cat) => {
              const count = categoryCounts[cat]
              const active = category === cat
              return (
                <li key={cat}>
                  <button type="button" onClick={() => onCategory(active ? null : cat)} disabled={!count && !active}
                    className={cn(ROW, active ? ROW_ON : ROW_OFF)}>
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: CATEGORY_COLOR[cat] }} />
                    <span className="flex-1 truncate">
                      <span className="font-mono text-[10px] opacity-70">{cat}</span>{" "}
                      {CATEGORY_LABEL[cat]}
                    </span>
                    <span className="tabular-nums">{count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--foreground)]">태그</p>
          <div className="flex flex-wrap gap-1.5">
            {tagFacets.map((item) => (
              <button key={item.key} type="button"
                onClick={() => onTag(tag === item.key ? null : item.key)}
                className={cn(CHIP, tag === item.key ? CHIP_ON : CHIP_OFF)}>
                {item.key}
                <span className="ml-1 tabular-nums opacity-60">{item.n}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--foreground)]">매체</p>
          <ul className="space-y-0.5">
            {mediaFacets.map((item) => (
              <li key={item.key}>
                <button type="button"
                  onClick={() => onMedia(media === item.key ? null : item.key)}
                  className={cn(ROW, "py-1", media === item.key ? ROW_ON : ROW_OFF)}>
                  <span className="flex-1 truncate">{item.key}</span>
                  <span className="tabular-nums">{item.n}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button type="button" onClick={() => onStarOnly(!starOnly)}
          className={cn(CHIP, "w-full py-1.5", starOnly ? CHIP_ON : CHIP_OFF)}>
          별표만 보기
          <span className="ml-1 tabular-nums opacity-60">{starCount}</span>
        </button>
      </div>
    </aside>
  )
}

function ArticleRow({ article, starred, onStar }: {
  article: TrendArticle
  starred: boolean
  onStar: () => void
}) {
  const translated = Boolean(article.o) && article.o !== article.t
  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <ExcerptDialog article={article}><button type="button" className="shrink-0 text-left" aria-label={`${article.t} 내용 보기`}><ArticleThumbnail article={article} className="h-24 w-32 sm:h-28 sm:w-40" /></button></ExcerptDialog>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <a
              href={article.u}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 items-start gap-1 text-base font-semibold leading-7 text-[var(--foreground)] hover:underline md:text-lg"
            >
              <span className="min-w-0">{article.t}</span>
              <ExternalLink aria-hidden="true" className="mt-1.5 size-3 shrink-0 text-[var(--muted-foreground)]" />
            </a>
            {article.h > 1 ? (
              <span
                title={`${article.ms.join(", ")} 등 ${article.h}곳이 같이 다뤘습니다`}
                className="mt-1 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[color-mix(in_oklab,var(--warning)_18%,var(--card))] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--warning)]"
              >
                <Flame aria-hidden="true" className="size-3" />
                {article.h}
              </span>
            ) : null}
          </div>
          {translated ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]" title={article.o}>
              {article.o}
            </p>
          ) : null}
          {article.s ? <ExcerptDialog article={article}><button type="button" className="mt-2 line-clamp-2 w-full text-left text-sm leading-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">{article.s}</button></ExcerptDialog> : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              <span className="font-mono opacity-70">{article.c}</span>
              <span className="ml-1">{CATEGORY_LABEL[article.c]}</span>
            </Badge>
            {article.g.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] font-medium">{tag}</Badge>
            ))}
            <span className="text-[11px] text-[var(--muted-foreground)]">{article.m}</span>
            <time className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{article.d}</time>
          </div>
        </div>
        <button
          type="button"
          onClick={onStar}
          aria-pressed={starred}
          aria-label={starred ? "별표 해제" : "별표"}
          className="shrink-0 rounded-[var(--radius)] p-1 text-[var(--muted-foreground)] outline-none hover:text-[var(--foreground)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
        >
          <Star aria-hidden="true" className={cn("size-4", starred && "fill-[var(--warning)] text-[var(--warning)]")} />
        </button>
      </div>
    </article>
  )
}

const FEATURE_CATEGORIES = CATEGORY_ORDER.filter((category) => category !== "ETC")

function heatScore(article: TrendArticle) {
  const age = Math.floor((Date.now() - new Date(`${article.d}T00:00:00`).getTime()) / 86_400_000)
  const recency = age <= 3 ? 6 : age <= 7 ? 4 : age <= 14 ? 2 : 0
  return (article.h - 1) * 5 + article.v + recency
}

function getHighlightArticles(articles: TrendArticle[]) {
  const cut = daysAgo(21)
  return FEATURE_CATEGORIES.flatMap((category) => articles
    .filter((article) => article.c === category && article.d >= cut)
    .sort((a, b) => heatScore(b) - heatScore(a) || b.d.localeCompare(a.d)).slice(0, 4))
}

function HighlightGrid({ rows, stars, onStar }: {
  rows: TrendArticle[]; stars: Set<string>; onStar: (article: TrendArticle) => void
}) {
  if (!rows.length) return <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">최근 21일 하이라이트가 없습니다.</p>
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{rows.map((article, index) => (
    <Reveal key={article.id} delay={index * 75} className="h-full">
      <Tilt3D max={10} lift={12} className="h-full">
        <Card className="group relative h-full overflow-hidden">
          <ExcerptDialog article={article}>
            <button type="button" className="relative block aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-[var(--chart-3)] via-[var(--chart-2)] to-[var(--chart-1)] text-left" aria-label={`${article.t} 내용 보기`}>
              {article.i ? <img src={article.i} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none" onError={(event) => { event.currentTarget.style.display = "none" }} /> : <Sparkles aria-hidden="true" className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white/80" />}
              <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <Badge
                  variant="outline"
                  className="backdrop-blur-md"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${CATEGORY_COLOR[article.c]} 22%, rgb(255 255 255 / 76%))`,
                    borderColor: `color-mix(in oklab, ${CATEGORY_COLOR[article.c]} 52%, black)`,
                    color: `color-mix(in oklab, ${CATEGORY_COLOR[article.c]} 68%, black)`,
                  }}
                >
                  <span className="font-mono text-[10px]">{article.c}</span><span className="ml-1">{CATEGORY_LABEL[article.c]}</span>
                </Badge>
                {article.h > 1 ? <Badge variant="secondary" className="trend-hit-badge gap-1 text-[10px] [text-shadow:0_0_6px_color-mix(in_oklab,var(--warning)_55%,transparent)]"><Flame aria-hidden="true" className="size-3 drop-shadow-[0_0_4px_color-mix(in_oklab,var(--warning)_65%,transparent)]" />HIT {article.h}</Badge> : null}
              </span>
            </button>
          </ExcerptDialog>
          <CardContent className="p-4">
            <a href={article.u} target="_blank" rel="noreferrer noopener" className="line-clamp-2 text-sm font-semibold leading-6 text-[var(--foreground)] hover:underline">{article.t}</a>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
              <span className="truncate">{article.d} · {article.m}</span>
              <button type="button" onClick={() => onStar(article)} aria-label={stars.has(article.id) ? "별표 해제" : "별표"} className="shrink-0 rounded-sm p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"><Star aria-hidden="true" className={cn("size-4", stars.has(article.id) && "fill-[var(--warning)] text-[var(--warning)]")} /></button>
            </div>
          </CardContent>
        </Card>
      </Tilt3D>
    </Reveal>
  ))}</div>
}

function HotKeywordStrip({ rows, freshTags, onSelect }: {
  rows: TrendFeed["momentum"]
  freshTags: TrendFeed["fresh"]
  onSelect: (tag: string) => void
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--foreground)]">급상승 키워드</h2>
        {freshTags?.length ? <p className="text-xs text-[var(--muted-foreground)]">처음 등장 · {freshTags.slice(0, 4).map((row) => row.tag).join(" · ")}</p> : null}
      </div>
      {rows.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row, index) => (
          <Reveal key={row.tag} delay={0} className="h-full">
            <button
              type="button"
              onClick={() => onSelect(row.tag)}
              className="group relative flex min-h-40 w-full flex-col overflow-hidden rounded-[var(--radius)] border border-white/70 p-4 text-left shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] outline-none transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-white hover:shadow-[0_20px_38px_-24px_rgba(15,23,42,0.5)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none motion-reduce:transition-none"
              style={{ background: KEYWORD_CARD_BACKGROUND[index] }}
              aria-label={`${index + 1}위 ${row.tag} 기사 ${row.recent}건 보기`}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/0 transition-colors duration-300 group-hover:bg-white/15 motion-reduce:transition-none" />
              <span className="relative flex items-start justify-between gap-3">
                <Badge variant="outline" className="border-white/80 bg-white/55 text-[10px] font-semibold text-[var(--foreground)] shadow-sm">{index + 1}위</Badge>
                <Badge variant="outline" className="border-white/80 bg-white/55 text-[10px] font-semibold tabular-nums text-[var(--foreground)] shadow-sm">
                  {row.prior > 0 ? `+${row.delta}` : "신규"}
                </Badge>
              </span>
              <span className="relative mt-3 min-w-0">
                <strong className="block truncate text-2xl font-bold uppercase leading-none tracking-[-0.035em] text-[var(--foreground)]" title={row.label_en || row.tag}>{row.label_en || row.tag}</strong>
                {row.label_en ? <span className="mt-1.5 block truncate text-xs font-medium text-[var(--muted-foreground)]">{row.tag}</span> : null}
              </span>
              <span className="relative mt-auto flex items-end justify-between gap-3 pt-4">
                <span className="text-xs tabular-nums text-[var(--muted-foreground)]">
                  최근 4주 <strong className="font-semibold text-[var(--foreground)]">{row.recent}건</strong> · 직전 {row.prior}건 · {row.prior > 0 ? `${(row.recent / row.prior).toFixed(1)}배` : "신규"}
                </span>
                <span className="shrink-0 translate-x-1 rounded-full border border-white/75 bg-white/45 px-2 py-1 text-[10px] font-semibold text-[var(--foreground)] opacity-70 transition-[transform,opacity,background-color] duration-300 group-hover:translate-x-0 group-hover:bg-white/75 group-hover:opacity-100 motion-reduce:transform-none motion-reduce:transition-none">기사 {row.recent}건 보기</span>
              </span>
            </button>
          </Reveal>
        ))}
      </div> : <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted-foreground)]">오른 소재 태그가 아직 없습니다.</p>}
    </div>
  )
}

function SavedList({ team, mineOnly, onMineOnly, category, onCategory, onRemove }: {
  team: TeamTrendStars[]; mineOnly: boolean; onMineOnly: (value: boolean) => void
  category: TrendCategory | null; onCategory: (value: TrendCategory | null) => void; onRemove: (id: string) => void
}) {
  const uid = auth.currentUser?.uid
  const grouped = new Map<string, { item: TrendStarItem; users: Array<{ uid: string; email: string }> }>()
  for (const user of team) for (const item of user.items) {
    if (mineOnly && user.uid !== uid) continue
    if (category && item.c !== category) continue
    const row = grouped.get(item.id) ?? { item, users: [] }
    row.users.push({ uid: user.uid, email: user.email }); grouped.set(item.id, row)
  }
  const rows = [...grouped.values()].sort((a, b) => b.item.d.localeCompare(a.item.d))
  const copy = () => void navigator.clipboard.writeText(rows.map(({ item }) => `${item.t}\t${item.u}`).join("\n"))
  return <Card className={`relative overflow-hidden ${HOME_GLASS_SURFACE} ${HOME_GLASS_STATIC}`}><span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/80" /><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>팀 저장 기사</CardTitle><CardDescription>팀원이 표시한 기사를 한 번만 모아 봅니다.</CardDescription></div><Button variant="outline" size="sm" onClick={copy} disabled={!rows.length}><Copy className="mr-1 size-3.5" />현재 목록 복사</Button></div>
    <div className="flex flex-wrap gap-1.5 pt-2"><button type="button" className={cn(CHIP, !mineOnly ? CHIP_ON : CHIP_OFF)} onClick={() => onMineOnly(false)}>전체</button><button type="button" className={cn(CHIP, mineOnly ? CHIP_ON : CHIP_OFF)} onClick={() => onMineOnly(true)}>내 별표</button>{CATEGORY_ORDER.map((cat) => <button key={cat} type="button" className={cn(CHIP, category === cat ? CHIP_ON : CHIP_OFF)} onClick={() => onCategory(category === cat ? null : cat)}>{CATEGORY_LABEL[cat]}</button>)}</div>
  </CardHeader><CardContent><div className="space-y-4">{rows.length ? rows.map(({ item, users }) => <article key={item.id} className="flex items-start gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4 shadow-sm"><ExcerptDialog article={item}><button type="button" className="shrink-0"><ArticleThumbnail article={item} className="h-20 w-28 sm:h-24 sm:w-36" /></button></ExcerptDialog><div className="min-w-0 flex-1"><a href={item.u} target="_blank" rel="noreferrer noopener" className="text-base font-semibold leading-7 hover:underline md:text-lg">{item.t}</a>{item.s ? <ExcerptDialog article={item}><button type="button" className="mt-1 line-clamp-2 w-full text-left text-sm leading-6 text-[var(--muted-foreground)]">{item.s}</button></ExcerptDialog> : null}<p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{CATEGORY_LABEL[item.c]} · {item.m} · {item.d} · ★ {users.length} · {users.map((user) => user.email.split("@")[0]).join(", ")}</p></div>{users.some((user) => user.uid === uid) ? <button type="button" onClick={() => onRemove(item.id)} className="p-1" aria-label="내 별표 해제"><Star className="size-4 fill-[var(--warning)] text-[var(--warning)]" /></button> : null}</article>) : <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">저장한 기사가 없습니다.</p>}</div></CardContent></Card>
}

export function TrendFabric() {
  const [feed, setFeed] = useState<TrendFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<number>(30)
  const [gate, setGate] = useState<"material" | "retail" | null>(null)
  const [category, setCategory] = useState<TrendCategory | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [media, setMedia] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [starOnly, setStarOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>("recent")
  const [stars, setStars] = useState<Set<string>>(() => new Set<string>())
  const [limit, setLimit] = useState(PAGE)
  const [tab, setTab] = useState<"highlight" | "all" | "saved">("highlight")
  const [teamStars, setTeamStars] = useState<TeamTrendStars[]>([])
  const [ownItems, setOwnItems] = useState<TrendStarItem[]>([])
  const [savedMineOnly, setSavedMineOnly] = useState(false)
  const [savedCategory, setSavedCategory] = useState<TrendCategory | null>(null)

  useEffect(() => {
    setStars(readStars())
    void loadTrendFeed().then((nextFeed) => {
      setFeed(nextFeed)
      setLoading(false)
    })
  }, [])

  useEffect(() => subscribeTeamStars((rows) => {
    setTeamStars(rows)
    const own = rows.find((row) => row.uid === auth.currentUser?.uid)
    if (own) {
      setOwnItems(own.items)
      setStars(new Set(own.items.map((item) => item.id)))
      writeStars(new Set(own.items.map((item) => item.id)))
    }
  }), [])

  useEffect(() => {
    if (!feed || ownItems.length) return
    const local = readStars()
    const items = feed.articles.filter((article) => local.has(article.id)).map(articleToStar)
    setOwnItems(items)
    const uid = auth.currentUser?.uid
    if (uid && items.length) setTeamStars((team) => [...team.filter((row) => row.uid !== uid), { uid, email: auth.currentUser?.email ?? uid, items }])
  }, [feed, ownItems.length])

  const toggleStar = (article: TrendArticle) => {
    setStars((current) => {
      const next = new Set(current)
      if (next.has(article.id)) next.delete(article.id)
      else next.add(article.id)
      writeStars(next)
      setOwnItems((items) => {
        const updated = next.has(article.id)
          ? [...items.filter((item) => item.id !== article.id), articleToStar(article)]
          : items.filter((item) => item.id !== article.id)
        pushMyStars(updated)
        const uid = auth.currentUser?.uid
        if (uid) setTeamStars((team) => [...team.filter((row) => row.uid !== uid), { uid, email: auth.currentUser?.email ?? uid, items: updated }])
        return updated
      })
      return next
    })
  }

  const removeSaved = (id: string) => {
    const article = articles.find((row) => row.id === id)
    if (article) toggleStar(article)
    else setOwnItems((items) => {
      const updated = items.filter((item) => item.id !== id)
      const nextStars = new Set(stars); nextStars.delete(id); setStars(nextStars); writeStars(nextStars); pushMyStars(updated)
      const uid = auth.currentUser?.uid
      if (uid) setTeamStars((team) => [...team.filter((row) => row.uid !== uid), { uid, email: auth.currentUser?.email ?? uid, items: updated }])
      return updated
    })
  }

  const articles = useMemo(() => feed?.articles ?? [], [feed])
  const since = useMemo(() => daysAgo(range), [range])
  const needle = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    const passes = (article: TrendArticle, skip: "category" | "tag" | "media" | null) => {
      if (article.d < since) return false
      if (gate && article.w !== gate) return false
      if (skip !== "category" && category && article.c !== category) return false
      if (skip !== "tag" && tag && !article.g.includes(tag)) return false
      if (skip !== "media" && media && article.m !== media) return false
      if (starOnly && !stars.has(article.id)) return false
      // 검색은 번역 제목과 원문 제목, 요약을 모두 본다.
      if (needle && !`${article.t} ${article.o} ${article.s}`.toLowerCase().includes(needle)) return false
      return true
    }

    const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((item) => [item, 0])) as Record<TrendCategory, number>
    const tagCounts = new Map<string, number>()
    const mediaCounts = new Map<string, number>()

    for (const article of articles) {
      if (passes(article, "category")) categoryCounts[article.c] += 1
      if (passes(article, "tag")) {
        for (const item of new Set(article.g)) tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1)
      }
      if (passes(article, "media")) mediaCounts.set(article.m, (mediaCounts.get(article.m) ?? 0) + 1)
    }

    const byCount = (a: { key: string; n: number }, b: { key: string; n: number }) => b.n - a.n || a.key.localeCompare(b.key, "ko")
    return {
      rows: articles.filter((article) => passes(article, null)),
      categoryCounts,
      tagFacets: [...tagCounts].map(([key, n]) => ({ key, n })).sort(byCount).slice(0, 22),
      mediaFacets: [...mediaCounts].map(([key, n]) => ({ key, n })).sort(byCount).slice(0, 14),
    }
  }, [articles, since, gate, category, tag, media, starOnly, stars, needle])

  const visible = useMemo(() => sortArticles(filtered.rows, sort), [filtered.rows, sort])
  const highlightArticles = useMemo(() => getHighlightArticles(articles), [articles])

  useEffect(() => { setLimit(PAGE) }, [range, gate, category, tag, media, starOnly, needle, sort])

  // 상단 카드는 필터와 무관하게 피드 전체를 본다. 화면에 들어오자마자 읽는 브리핑 자리다.
  //
  // 소재 기사는 관련도 소재 게이트를 통과한 건(w === "material")이다. 카테고리가 아니다.
  // 게이트는 통과했는데 카테고리가 ETC로 떨어진 건도 소재로 센다.
  // 분모는 그 기간 피드에 실린 전량, 즉 소재 + 유통이다. 노이즈 포함 수집 전량이 아니다.
  const gateStat = useMemo(() => {
    const count = (days: number) => {
      const cut = daysAgo(days)
      const rows = articles.filter((article) => article.d >= cut)
      const material = rows.filter((article) => article.w === "material").length
      return { material, retail: rows.length - material, total: rows.length,
        pct: rows.length ? Math.round((material / rows.length) * 100) : 0 }
    }
    return { d30: count(30), d7: count(7) }
  }, [articles])

  // 급상승 소재 태그 1~4위. 이벤트·지역·기업 태그는 제외하고 오른 것만 본다.
  const rising = useMemo(
    () => (feed?.momentum ?? []).filter((row) => row.delta > 0 && !TREND_CARD_EXCLUDE.has(row.tag)).slice(0, 4),
    [feed],
  )

  const categorySummary = useMemo(() => {
    const cut = daysAgo(30)
    return CATEGORY_ORDER.map((item) => ({
      category: item,
      count: articles.filter((article) => article.d >= cut && article.c === item).length,
    })).filter((row) => row.count > 0)
  }, [articles])

  // 처음 등장한 소재 태그. 1건짜리는 아직 신호로 보기 어려워 2건부터 센다.
  const freshTags = useMemo(
    () => (feed?.fresh ?? []).filter((row) => row.n > 1 && !TREND_CARD_EXCLUDE.has(row.tag)),
    [feed],
  )

  // 팀이 담은 기사. 같은 기사를 여러 명이 담아도 한 건으로 센다.
  const savedStat = useMemo(() => {
    const ids = new Set<string>()
    for (const user of teamStars) for (const item of user.items) ids.add(item.id)
    return { total: ids.size, members: teamStars.filter((user) => user.items.length).length }
  }, [teamStars])

  if (loading) {
    return <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">수집 자료를 불러오는 중입니다.</p>
  }

  if (!feed) {
    return (
      <SectionCard title="수집 자료가 없습니다" subtitle="아직 한 번도 수집이 돌지 않았습니다.">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">tools/trend</code>에서{" "}
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">python run.py collect</code>를 한 번 돌리거나,
          GitHub Actions의 Trend collect 워크플로를 수동 실행하십시오.
        </p>
      </SectionCard>
    )
  }

  const reset = () => {
    setRange(30); setGate(null); setCategory(null); setTag(null); setMedia(null)
    setStarOnly(false); setQuery(""); setSort("recent")
  }

  const applyCardFilter = (next: {
    range?: number
    gate?: "material" | "retail" | null
    category?: TrendCategory | null
    tag?: string | null
  }) => {
    setMedia(null); setStarOnly(false); setQuery(""); setSort("recent")
    setRange(next.range ?? 30)
    setGate(next.gate ?? null)
    setCategory(next.category ?? null)
    setTag(next.tag ?? null)
    setTab("all")
  }

  const feedTitle = tag
    ? `${tag} 태그 기사`
    : category
      ? `${category} 기사`
      : media
        ? `${media} 기사`
        : gate
          ? `${gate === "material" ? "소재" : "유통"} 기사`
          : "신소재 피드"

  const intake7 = feed.intake?.days["7"]
  const intake7Pct = intake7?.scanned ? Math.round((intake7.kept / intake7.scanned) * 100) : 0
  const sourceTotal = feed.intake?.source_total
  const sourceBadge = sourceTotal ? `RSS ${sourceTotal}곳` : undefined
  const activeTabIndex = tab === "highlight" ? 0 : tab === "all" ? 1 : 2

  return (
    <section className="min-w-0 space-y-5">
      <Reveal delay={0}>
        <HotKeywordStrip rows={rising} freshTags={freshTags} onSelect={(next) => applyCardFilter({ range: 30, tag: next })} />
      </Reveal>

      <Reveal delay={60} className="[transition-delay:60ms]">
        <div className="grid gap-5 sm:grid-cols-2">
          <TrendKpiCard icon={<Sparkles className="size-4" />} label="최근 7일 소재 기사" value={gateStat.d7.material}
            rangeLabel={intake7 && sourceTotal ? `소스 ${sourceTotal}곳 중 ${intake7.sources}곳에서 ${intake7.scanned}건을 훑어 ${intake7.kept}건 채택 (${intake7Pct}%)` : undefined}
            caption={intake7 ? `그중 소재 게이트 통과 ${intake7.material}건` : `피드 ${gateStat.d7.total}건의 ${gateStat.d7.pct}% · 나머지 유통 ${gateStat.d7.retail}건`}
            sourceBadge={sourceBadge} accent="var(--chart-2)" delay={0} onClick={() => applyCardFilter({ range: 7, gate: "material" })}
            pressed={tab === "all" && range === 7 && gate === "material" && !category && !tag && !media && !starOnly && !needle} />
          <TrendKpiCard icon={<Users className="size-4" />} label="저장된 기사" value={savedStat.total}
            rangeLabel="팀 별표" caption={savedStat.members ? `팀원 ${savedStat.members}명이 표시` : "아직 표시한 기사가 없습니다"}
            sourceBadge={sourceBadge} accent="var(--chart-4)" delay={0} onClick={() => setTab("saved")} pressed={tab === "saved"} />
        </div>
      </Reveal>

      <Reveal delay={120} className="[transition-delay:120ms]">
        <FabricHero categories={categorySummary} onCategory={(next) => applyCardFilter({ range: 30, category: next })} />
      </Reveal>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList aria-label="TREND FABRIC 보기" className="relative grid h-auto w-full grid-cols-3 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-1 sm:w-fit">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%_-_0.5rem)/3)] rounded-[calc(var(--radius)-2px)] bg-[var(--primary)] shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeTabIndex * 100}%)` }}
          />
          <TabsTrigger value="highlight" className="relative z-10 gap-2 rounded-[calc(var(--radius)-2px)] px-4 py-2.5 text-base font-semibold text-[var(--foreground)] transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-[var(--primary-foreground)] data-[state=active]:shadow-none motion-reduce:transition-none">
            <span>하이라이트</span><span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold tabular-nums opacity-75">{highlightArticles.length}</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="relative z-10 gap-2 rounded-[calc(var(--radius)-2px)] px-4 py-2.5 text-base font-semibold text-[var(--foreground)] transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-[var(--primary-foreground)] data-[state=active]:shadow-none motion-reduce:transition-none">
            <span>전체 기사</span><span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold tabular-nums opacity-75">{visible.length}</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="relative z-10 gap-2 rounded-[calc(var(--radius)-2px)] px-4 py-2.5 text-base font-semibold text-[var(--foreground)] transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-[var(--primary-foreground)] data-[state=active]:shadow-none motion-reduce:transition-none">
            <span>저장 기사</span><span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold tabular-nums opacity-75">{savedStat.total}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "highlight" ? (
        <HighlightGrid rows={highlightArticles} stars={stars} onStar={toggleStar} />
      ) : null}

      {tab === "saved" ? (
        <SavedList team={teamStars} mineOnly={savedMineOnly} onMineOnly={setSavedMineOnly}
          category={savedCategory} onCategory={setSavedCategory} onRemove={removeSaved} />
      ) : null}

      {tab === "all" ? <>

      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <FilterPanel
          range={range} onRange={setRange}
          gate={gate} onGate={setGate}
          category={category} onCategory={setCategory} categoryCounts={filtered.categoryCounts}
          tag={tag} onTag={setTag} tagFacets={filtered.tagFacets}
          media={media} onMedia={setMedia} mediaFacets={filtered.mediaFacets}
          starOnly={starOnly} onStarOnly={setStarOnly}
          starCount={stars.size}
          onReset={reset}
        />

        {/* 목록이 뷰포트보다 훨씬 길어 Reveal(SectionCard)로 감싸면 등장 임계값을 못 넘긴다. */}
        <Card className="min-w-0">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{feedTitle} <span className="ml-1 text-sm font-medium tabular-nums text-[var(--muted-foreground)]">{visible.length}건</span></CardTitle>
              </div>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목·요약 검색"
                className="h-9 w-44 shrink-0 sm:w-60"
                aria-label="기사 검색"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--muted-foreground)]">정렬</span>
              <div className="flex rounded-full border border-white/80 bg-white/60 p-1">
                {SORTS.map((item) => (
                  <button key={item.value} type="button" onClick={() => setSort(item.value)}
                    className={cn(PILL_OPTION, "flex-none", sort === item.value ? PILL_ON : PILL_OFF)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0">
            {visible.length ? (
              <>
                <div className="space-y-4">{visible.slice(0, limit).map((article) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    starred={stars.has(article.id)}
                    onStar={() => toggleStar(article)}
                  />
                ))}</div>
                {visible.length > limit ? (
                  <div className="pt-4 text-center">
                    <Button variant="outline" onClick={() => setLimit((current) => current + PAGE)}>
                      더 보기 ({visible.length - limit}건 남음)
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">조건에 맞는 기사가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
      </> : null}

    </section>
  )
}
