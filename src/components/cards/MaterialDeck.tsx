import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { materialsOf, sortMaterialsNewest } from "@/data/derive"
import { fmtDateFull } from "@/data/format"
import { httpsMaterialLink, MATERIAL_KINDS, type MaterialItem, type MaterialKind } from "@/data/schema"
import { deleteManualMaterial, saveManualMaterial, useAppStore } from "@/store/useAppStore"

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  TS: "TS",
  STUDY: "STUDY",
  MACRO: "MACRO TREND",
  FABRIC: "FABRIC TREND",
  PORTFOLIO: "PORTFOLIO",
}

const PAGE_SIZE = 20

export const MATERIAL_CARD_PALETTES = [
  {
    from: "#6366f1",
    to: "#8b5cf6",
    background: "bg-[linear-gradient(145deg,#6366f1,#8b5cf6)]",
    glow: "bg-[#6366f1]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(99,102,241,0.4)]",
  },
  {
    from: "#0ea5e9",
    to: "#22d3ee",
    background: "bg-[linear-gradient(145deg,#0ea5e9,#22d3ee)]",
    glow: "bg-[#0ea5e9]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(14,165,233,0.4)]",
  },
  {
    from: "#f59e0b",
    to: "#f43f5e",
    background: "bg-[linear-gradient(145deg,#f59e0b,#f43f5e)]",
    glow: "bg-[#f59e0b]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(245,158,11,0.4)]",
  },
  {
    from: "#10b981",
    to: "#34d399",
    background: "bg-[linear-gradient(145deg,#10b981,#34d399)]",
    glow: "bg-[#10b981]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(16,185,129,0.4)]",
  },
  {
    from: "#8b5cf6",
    to: "#ec4899",
    background: "bg-[linear-gradient(145deg,#8b5cf6,#ec4899)]",
    glow: "bg-[#8b5cf6]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(139,92,246,0.4)]",
  },
  {
    from: "#fb923c",
    to: "#f43f5e",
    background: "bg-[linear-gradient(145deg,#fb923c,#f43f5e)]",
    glow: "bg-[#fb923c]",
    activeShadow: "shadow-[0_1.5rem_3rem_-0.5rem_rgba(251,146,60,0.4)]",
  },
] as const

const INACTIVE_CARD_SHADOW = "shadow-sm"
const MATERIAL_DECK_VISIBLE_CARDS = 9

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return reduced
}

const COVERFLOW_SPACING_FALLOFF = 0.55
const COVERFLOW_SCALE_STEP = 0.08
const MATERIAL_DECK_SPREAD = 0.65
const MATERIAL_DECK_ROTATE_MAX = 52
const MATERIAL_DECK_DEPTH_STEP = 120
const HOME_DECK_ROTATE_MAX = 38
const HOME_DECK_DEPTH_STEP = 80
const DEAD_ZONE = 0.28
const MIN_V = 1.2
const MAX_V = 7
const VELOCITY_LERP = 0.18
const MAX_FRAME_SECONDS = 0.05
const STOP_VELOCITY = 0.025

function cardTransform(distance: number, cardWidth: number, stageWidth: number, visibleCards: number, deepPerspective = false): string {
  const abs = Math.abs(distance)
  const dir = Math.sign(distance)
  const radius = Math.max(1, (visibleCards - 1) / 2)
  const cappedAbs = Math.min(abs, radius)
  const depthDistance = Math.min(cappedAbs, 4)
  const isHomeDeck = visibleCards === 5
  const spacing = (1 - Math.exp(-cappedAbs * COVERFLOW_SPACING_FALLOFF))
    / (1 - Math.exp(-radius * COVERFLOW_SPACING_FALLOFF))
  const scale = 1 - depthDistance * COVERFLOW_SCALE_STEP
  const rotateMax = isHomeDeck ? HOME_DECK_ROTATE_MAX : MATERIAL_DECK_ROTATE_MAX
  const tilt = Math.min(cappedAbs * rotateMax, rotateMax) * -dir
  const depthStep = (isHomeDeck ? HOME_DECK_DEPTH_STEP : MATERIAL_DECK_DEPTH_STEP) * (deepPerspective ? 1.2 : 1)
  const translateZ = -depthDistance * depthStep
  const projectedHalfWidth = cardWidth * scale * Math.max(0.2, Math.cos(Math.abs(tilt) * Math.PI / 180)) / 2
  const edgeTravel = Math.max(deepPerspective ? cardWidth * 0.9 : cardWidth * 0.72, stageWidth / 2 - projectedHalfWidth)
  const spread = isHomeDeck ? 1 : (deepPerspective ? 0.95 : MATERIAL_DECK_SPREAD)
  const tx = dir * edgeTravel * spacing * spread
  return `translateX(calc(-50% + ${tx.toFixed(2)}px)) translateZ(${translateZ.toFixed(2)}px) rotateY(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`
}

export function useCoverflowMotion(itemCount: number, reduced: boolean) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const posRef = useRef(0) // fractional centre — the single source of truth
  const targetRef = useRef(0) // where the current settle is headed
  const widthRef = useRef(0)
  const settleRafRef = useRef<number | null>(null)
  const autoRafRef = useRef<number | null>(null)
  const targetVelocityRef = useRef(0)
  const velocityRef = useRef(0)
  const lastFrameRef = useRef<number | null>(null)
  const activeRef = useRef(0)
  const [active, setActive] = useState(0)

  const clamp = useCallback(
    (pos: number) => Math.max(0, Math.min(Math.max(0, itemCount - 1), pos)),
    [itemCount],
  )

  const paint = useCallback(() => {
    const stage = rootRef.current
    if (!stage) return
    // 초기 렌더·탭 비활성·뷰 밖 등으로 폭 측정이 아직 0이면, 페인트 시점에 지연 측정해 자가복구한다.
    // (측정이 한 번도 안 잡히면 카드가 opacity-0인 채 스테이지가 비어 보인다.)
    let cardWidth = widthRef.current
    if (!cardWidth) {
      const measured = cardRefs.current.find(Boolean)?.offsetWidth ?? 0
      if (measured) {
        widthRef.current = measured
        cardWidth = measured
      }
    }
    if (!cardWidth) return
    const visibleCards = Number(stage.dataset.coverflowVisible) || MATERIAL_DECK_VISIBLE_CARDS
    const visibleRadius = Math.max(1, (visibleCards - 1) / 2)
    const stageWidth = stage.clientWidth
    const pos = posRef.current
    cardRefs.current.forEach((card, index) => {
      if (!card) return
      const distance = index - pos
      const abs = Math.abs(distance)
      if (abs >= visibleRadius + 0.5) {
        if (card.style.visibility !== "hidden") {
          card.style.visibility = "hidden"
          card.style.pointerEvents = "none"
          card.style.opacity = "0"
        }
        return
      }
      card.style.transform = cardTransform(distance, cardWidth, stageWidth, visibleCards, stage.dataset.coverflowDeep === "true")
      const opacity = 1 - 0.4 * Math.min(1, abs)
      card.style.opacity = opacity.toFixed(3)
      card.style.filter = "none"
      card.style.zIndex = String(100 - Math.round(abs * 10))
      card.style.pointerEvents = "auto"
      card.style.visibility = "visible"
    })
  }, [])

  const updateActive = useCallback((index: number) => {
    if (index === activeRef.current) return
    activeRef.current = index
    setActive(index)
  }, [])

  const settle = useCallback(
    (target: number) => {
      const goal = clamp(target)
      targetRef.current = goal
      updateActive(Math.round(goal))
      if (settleRafRef.current !== null) {
        cancelAnimationFrame(settleRafRef.current)
        settleRafRef.current = null
      }
      if (reduced) {
        posRef.current = goal
        paint()
        return
      }
      const step = () => {
        const remaining = targetRef.current - posRef.current
        if (Math.abs(remaining) < 0.0006) {
          posRef.current = targetRef.current
          paint()
          settleRafRef.current = null
          return
        }
        posRef.current += remaining * 0.18
        paint()
        settleRafRef.current = requestAnimationFrame(step)
      }
      settleRafRef.current = requestAnimationFrame(step)
    },
    [clamp, paint, reduced, updateActive],
  )

  const cancelAuto = useCallback(() => {
    if (autoRafRef.current !== null) {
      cancelAnimationFrame(autoRafRef.current)
      autoRafRef.current = null
    }
    targetVelocityRef.current = 0
    velocityRef.current = 0
    lastFrameRef.current = null
  }, [])

  const stopAuto = useCallback(() => {
    if (autoRafRef.current !== null) {
      targetVelocityRef.current = 0
      return
    }
    cancelAuto()
  }, [cancelAuto])

  const startContinuous = useCallback((targetVelocity: number) => {
    targetVelocityRef.current = targetVelocity
    if (settleRafRef.current !== null) {
      cancelAnimationFrame(settleRafRef.current)
      settleRafRef.current = null
    }
    targetRef.current = posRef.current
    if (autoRafRef.current !== null) return

    const step = (timestamp: number) => {
      const previous = lastFrameRef.current
      const dt = previous === null ? 0 : Math.min(MAX_FRAME_SECONDS, Math.max(0, (timestamp - previous) / 1000))
      lastFrameRef.current = timestamp
      const targetVelocityNow = targetVelocityRef.current
      velocityRef.current += (targetVelocityNow - velocityRef.current) * VELOCITY_LERP

      const previousPos = posRef.current
      posRef.current = clamp(previousPos + velocityRef.current * dt)
      // dt가 0인 첫 프레임은 위치가 그대로인 게 정상이다. 이때를 경계 도달로 오판하면
      // 루프가 첫 프레임에 스스로 종료돼 자동 넘김이 아예 동작하지 않는다.
      const hitBoundary = dt > 0 && posRef.current === previousPos && Math.abs(velocityRef.current) > STOP_VELOCITY
      if (hitBoundary) {
        targetVelocityRef.current = 0
        velocityRef.current = 0
      }

      paint()
      updateActive(Math.round(posRef.current))

      if (targetVelocityRef.current === 0 && Math.abs(velocityRef.current) < STOP_VELOCITY) {
        velocityRef.current = 0
        lastFrameRef.current = null
        autoRafRef.current = null
        settle(Math.round(posRef.current))
        return
      }
      autoRafRef.current = requestAnimationFrame(step)
    }
    autoRafRef.current = requestAnimationFrame(step)
  }, [clamp, paint, settle, updateActive])

  const move = useCallback((direction: -1 | 1) => {
    cancelAuto()
    settle(Math.round(posRef.current) + direction)
  }, [cancelAuto, settle])
  const goTo = useCallback((index: number) => {
    cancelAuto()
    settle(index)
  }, [cancelAuto, settle])

  useEffect(() => {
    posRef.current = clamp(posRef.current)
    targetRef.current = clamp(targetRef.current)
    cancelAuto()
    updateActive(Math.round(posRef.current))
    paint()
  }, [cancelAuto, clamp, itemCount, paint, updateActive])

  useEffect(() => {
    const frame = rootRef.current
    if (!frame) return
    const measure = () => {
      const card = cardRefs.current.find(Boolean)
      if (!card) return
      // offsetWidth가 0인 순간(레이아웃 미확정)에는 기존 폭을 덮어쓰지 않는다.
      if (card.offsetWidth) widthRef.current = card.offsetWidth
      paint()
    }
    measure()
    // 첫 측정이 0으로 잡히는 레이스를 대비해 다음 프레임·짧은 지연에 한 번 더 측정한다.
    const raf = requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 80)
    // 탭이 비활성 상태로 로드된 뒤 다시 보일 때 재측정·재페인트한다.
    const onVisible = () => { if (document.visibilityState === "visible") measure() }
    document.addEventListener("visibilitychange", onVisible)
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      observer.disconnect()
    }
  }, [paint])

  useEffect(
    () => () => {
      if (settleRafRef.current !== null) cancelAnimationFrame(settleRafRef.current)
      cancelAuto()
    },
    [cancelAuto],
  )

  useEffect(() => {
    if (!reduced) return
    cancelAuto()
    settle(Math.round(posRef.current))
  }, [cancelAuto, reduced, settle])

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return
    if (reduced) {
      stopAuto()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const x = (event.clientX - rect.left) / rect.width
    if (x < 0 || x > 1) return
    const d = (x - 0.5) * 2
    if (Math.abs(d) < DEAD_ZONE) {
      stopAuto()
      return
    }
    const speedProgress = Math.min(1, (Math.abs(d) - DEAD_ZONE) / (1 - DEAD_ZONE))
    const targetVelocity = Math.sign(d) * (MIN_V + (MAX_V - MIN_V) * speedProgress * speedProgress)
    startContinuous(targetVelocity)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    const direction = event.key === "ArrowRight" ? 1 : -1
    if ((active === 0 && direction < 0) || (active === itemCount - 1 && direction > 0)) return
    event.preventDefault()
    move(direction as -1 | 1)
  }

  return {
    active,
    move,
    goTo,
    rootRef,
    setCardRef: (index: number) => (node: HTMLElement | null) => {
      cardRefs.current[index] = node
    },
    wasDragged: () => false,
    rootProps: {
      onPointerMove,
      onPointerLeave: stopAuto,
      onKeyDown,
    },
  }
}

type MaterialCardTone = "surface" | "onColor"

function SourceBadge({ source, tone = "surface" }: { source: MaterialItem["source"]; tone?: MaterialCardTone }) {
  const labels: Record<MaterialItem["source"], string> = {
    excel: "엑셀",
    manual: "직접등록",
    ts: "TS 엑셀",
    study: "STUDY 엑셀",
  }
  return <Badge variant="outline" className={tone === "onColor" ? "border-white/25 bg-white/15 text-white hover:bg-white/15" : undefined}>{labels[source]}</Badge>
}

interface MaterialDeckProps {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
  visibleCards?: number
  hideBadges?: boolean
  expandInline?: boolean
  deepPerspective?: boolean
}

export function MaterialDeck({
  items,
  emptyMessage,
  onOpen,
  onAdd,
  visibleCards = MATERIAL_DECK_VISIBLE_CARDS,
  hideBadges = false,
  expandInline = false,
  deepPerspective = false,
}: MaterialDeckProps) {
  const deckItems = useMemo(() => sortMaterialsNewest(items), [items])
  const reduced = useReducedMotion()
  const { active, move, goTo, rootRef, setCardRef, rootProps } = useCoverflowMotion(deckItems.length, reduced)
  const newestItemId = deckItems[0]?.id
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  useEffect(() => {
    if (newestItemId) goTo(0)
  }, [goTo, newestItemId])

  useEffect(() => {
    setExpandedItemId(null)
  }, [active])

  if (!deckItems.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>
        {onAdd ? <Button type="button" size="sm" className="mt-4" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}
      </div>
    )
  }

  const activeItem = deckItems[active] ?? deckItems[0]
  const expandedItem = expandInline && expandedItemId === activeItem.id ? activeItem : null
  const dotWindowStart = Math.max(0, Math.min(active - 5, deckItems.length - 12))
  const dotItems = deckItems.slice(dotWindowStart, dotWindowStart + 12)
  const openItem = (item: MaterialItem, index: number) => {
    goTo(index)
    if (!expandInline) {
      onOpen(item)
      return
    }
    if (index !== active) {
      setExpandedItemId(null)
      return
    }
    setExpandedItemId((current) => current === item.id ? null : item.id)
  }

  return (
    <div className="relative">
      <div
        ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="자료 카드 덱"
      tabIndex={0}
      data-coverflow-visible={visibleCards}
      data-coverflow-deep={deepPerspective}
      onPointerMove={rootProps.onPointerMove}
      onKeyDown={rootProps.onKeyDown}
      onPointerLeave={rootProps.onPointerLeave}
      className="group/deck relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
    >
      <div
        className={`relative min-h-[21rem] touch-pan-y rounded-t-2xl [perspective-origin:50%_45%] [transform-style:preserve-3d] ${deepPerspective ? "[perspective:560px]" : "[perspective:720px]"}`}
      >
        <div className="relative z-20 h-[6.5rem] overflow-hidden px-4 pb-2 pt-3 sm:px-5" aria-live="polite">
          {!hideBadges ? <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{MATERIAL_KIND_LABELS[activeItem.kind]}</Badge>
            <SourceBadge source={activeItem.source} />
          </div> : null}
          <button
            type="button"
            aria-expanded={expandInline ? Boolean(expandedItem) : undefined}
            onClick={() => openItem(activeItem, active)}
            className={`${hideBadges ? "mt-3" : "mt-1.5"} block max-w-full cursor-pointer text-left outline-none focus-visible:rounded-[var(--radius)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]`}
          >
            <strong className="line-clamp-1 block text-base font-semibold leading-5 tracking-tight text-[var(--foreground)]">{activeItem.title}</strong>
            {!hideBadges ? <span className="mt-0.5 line-clamp-1 block text-xs leading-4 text-[var(--muted-foreground)]">{activeItem.summary || "요약이 등록되지 않았습니다."}</span> : null}
          </button>
          {!hideBadges ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--muted-foreground)]">
            <span>{activeItem.date ? fmtDateFull(activeItem.date) : "날짜 미등록"}{activeItem.owner ? ` · ${activeItem.owner}` : ""}</span>
            {activeItem.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-[var(--muted)] px-2 py-0.5">#{tag}</span>)}
          </div> : null}
        </div>

        <div className="absolute inset-x-0 top-[6.5rem] h-[12.5rem] [transform-style:preserve-3d]">
          {deckItems.map((item, index) => {
            const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]
            const isActive = index === active
            return (
              <button
                key={item.id}
                ref={setCardRef(index)}
                type="button"
                tabIndex={isActive ? 0 : -1}
                aria-hidden={!isActive}
                aria-expanded={expandInline && isActive ? expandedItemId === item.id : undefined}
                onClick={() => openItem(item, index)}
                className={`absolute left-1/2 top-2 flex h-44 [width:clamp(230px,25%,340px)] cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left text-[var(--foreground)] opacity-0 outline-none transition-shadow duration-300 [backface-visibility:hidden] [transform-style:preserve-3d] will-change-transform focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${isActive ? palette.activeShadow : INACTIVE_CARD_SHADOW}`}
              >
                <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${palette.background}`} />
                <span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-20 bg-[var(--foreground)] transition-opacity duration-300 motion-reduce:transition-none ${isActive ? "opacity-0" : "opacity-[0.06]"}`} />
                {hideBadges ? (
                  <span className="relative z-10 flex h-full flex-col">
                    <span className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                      <span>{item.date ? fmtDateFull(item.date) : "날짜 미등록"}</span>
                      {item.department ? <span className="min-w-0 truncate text-right">{item.department}</span> : null}
                    </span>
                    <strong className="mt-3 line-clamp-2 text-base leading-6 text-[var(--foreground)]">{item.title}</strong>
                    <span className="mt-auto line-clamp-2 border-t border-[var(--border)] pt-2 text-xs leading-4 text-[var(--muted-foreground)]">{item.summary || "의뢰 내용이 등록되지 않았습니다."}</span>
                  </span>
                ) : (
                  <span className="relative z-10 flex h-full flex-col">
                  <span className="flex items-start justify-between gap-3">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-white ${palette.glow}`}><FileText className="size-4" aria-hidden="true" /></span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums text-[var(--muted-foreground)]">{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <strong className="mt-2 line-clamp-1 text-sm leading-5 text-[var(--foreground)]">{item.title}</strong>
                  <span className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</span>
                  <span className="mt-auto text-[10px] text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative z-20 flex items-center justify-center gap-3 border-t border-[var(--border)]/70 px-4 py-3">
        <Button type="button" variant="outline" size="icon" disabled={active === 0} aria-label="이전 자료" onClick={() => move(-1)} className="text-[var(--foreground)]"><ArrowLeft /></Button>
        <div role="tablist" aria-label="자료 카드 선택" className="flex min-w-0 max-w-56 items-center justify-center gap-1.5 overflow-hidden">
          {dotItems.map((item, visibleIndex) => {
            const index = dotWindowStart + visibleIndex
            const isActive = index === active
            const palette = MATERIAL_CARD_PALETTES[index % MATERIAL_CARD_PALETTES.length]
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${index + 1}번째 자료: ${item.title}`}
                onClick={() => goTo(index)}
                className={`h-2 rounded-full outline-none transition-[width,background-color] duration-300 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${isActive ? `w-6 ${palette.background}` : "w-2 bg-[var(--muted-foreground)]/30 hover:bg-[var(--muted-foreground)]/50"}`}
              />
            )
          })}
        </div>
        <Button type="button" variant="outline" size="icon" disabled={active === deckItems.length - 1} aria-label="다음 자료" onClick={() => move(1)} className="text-[var(--foreground)]"><ArrowRight /></Button>
      </div>
      </div>

      {expandInline && expandedItem ? (
        <div
          className="absolute left-1/2 top-[7rem] z-50 w-[clamp(230px,25%,340px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1.5rem_3rem_-0.5rem_rgba(16,24,64,0.35)] transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-[var(--muted-foreground)]">{expandedItem.date ? fmtDateFull(expandedItem.date) : "날짜 미등록"}</p>
              <strong className="mt-1 block text-base leading-6 text-[var(--foreground)]">{expandedItem.title}</strong>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="상세 접기" onClick={() => setExpandedItemId(null)}><X aria-hidden="true" /></Button>
          </div>
          <div className="mt-3 max-h-[22rem] overflow-y-auto">
            {expandedItem.detail?.length ? (
              <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                {expandedItem.detail.map((row) => (
                  <div key={row.label} className="grid gap-1 border-b border-[var(--border)] p-3 last:border-b-0">
                    <dt className="text-[11px] font-semibold text-[var(--muted-foreground)]">{row.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{expandedItem.summary || "상세 내용이 등록되지 않았습니다."}</p>}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MaterialDetailSheet({ item, onOpenChange, onEdit, onDeleted, onNavigate }: {
  item: MaterialItem | null
  onOpenChange: (open: boolean) => void
  onEdit?: (item: MaterialItem) => void
  onDeleted?: () => void
  onNavigate?: (item: MaterialItem) => void
}) {
  const link = httpsMaterialLink(item?.link)
  const remove = async () => {
    if (!item || item.source !== "manual" || !window.confirm("이 자료를 삭제할까요?")) return
    await deleteManualMaterial(item.id)
    onOpenChange(false)
    onDeleted?.()
  }
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {item ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{MATERIAL_KIND_LABELS[item.kind]}</Badge><SourceBadge source={item.source} /></div>
              <DialogTitle className="pt-2">{item.title}</DialogTitle>
              <DialogDescription>{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              {item.detail?.length ? (
                <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                  {item.detail.map((row) => (
                    <div key={row.label} className="grid gap-1 border-b border-[var(--border)] p-4 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-xs font-semibold text-[var(--muted-foreground)]">{row.label}</dt>
                      <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">요약</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</p></div>
              )}
              <div><p className="text-xs font-semibold text-[var(--muted-foreground)]">태그</p><div className="mt-2 flex flex-wrap gap-2">{item.tags.length ? item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>) : <span className="text-sm text-[var(--muted-foreground)]">태그 없음</span>}</div></div>
              {link ? <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-4"><Button asChild className="w-full"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button></div> : null}
              {onNavigate ? <Button type="button" variant="outline" className="w-full" onClick={() => { onNavigate(item); onOpenChange(false) }}><ArrowRight aria-hidden="true" />상세 화면으로 이동</Button> : null}
              {!item.readOnly && item.source === "manual" ? <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => onEdit?.(item)}><Pencil aria-hidden="true" />수정</Button><Button type="button" variant="destructive" onClick={() => { void remove() }}><Trash2 aria-hidden="true" />삭제</Button></div> : null}
            </DialogBody>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface MaterialFormValues {
  title: string
  kind: MaterialKind
  summary: string
  date: string
  tags: string
  link: string
  owner: string
}

const emptyForm = (kind: MaterialKind): MaterialFormValues => ({ title: "", kind, summary: "", date: "", tags: "", link: "", owner: "" })

export function MaterialFormSheet({ open, defaultKind, item, onOpenChange, onSaved }: {
  open: boolean
  defaultKind: MaterialKind
  item?: MaterialItem | null
  onOpenChange: (open: boolean) => void
  onSaved?: (item: MaterialItem) => void
}) {
  const [form, setForm] = useState<MaterialFormValues>(() => emptyForm(defaultKind))
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm(item ? {
      title: item.title,
      kind: item.kind,
      summary: item.summary ?? "",
      date: item.date ?? "",
      tags: item.tags.join(", "),
      link: item.link ?? "",
      owner: item.owner ?? "",
    } : emptyForm(defaultKind))
    setError("")
  }, [defaultKind, item, open])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.title.trim()) { setError("제목을 입력하세요."); return }
    const link = form.link.trim()
    if (link && !httpsMaterialLink(link)) { setError("https:// 로 시작하는 공유 링크를 입력하세요"); return }
    setSaving(true)
    setError("")
    try {
      const saved = await saveManualMaterial({
        title: form.title.trim(),
        kind: form.kind,
        summary: form.summary.trim() || undefined,
        date: form.date || undefined,
        tags: [...new Set(form.tags.split(/[,/\s]+/).map((tag) => tag.trim()).filter(Boolean))],
        link: link || undefined,
        owner: form.owner.trim() || undefined,
      }, item?.id)
      onSaved?.(saved)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-xl">
        <SheetHeader className="border-b border-[var(--border)] p-6 pr-12"><SheetTitle>{item ? "자료 수정" : "자료 추가"}</SheetTitle><SheetDescription>SharePoint 공유 링크와 자료 정보를 등록합니다.</SheetDescription></SheetHeader>
        <form className="grid gap-5 p-6" noValidate onSubmit={(event) => { void submit(event) }}>
          <div className="space-y-2"><Label htmlFor="material-title">제목</Label><Input id="material-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} aria-required="true" /></div>
          <div className="space-y-2"><Label htmlFor="material-kind">구분</Label><select id="material-kind" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as MaterialKind }))} className="h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]">{MATERIAL_KINDS.map((kind) => <option key={kind} value={kind}>{MATERIAL_KIND_LABELS[kind]}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="material-summary">요약</Label><textarea id="material-summary" rows={4} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} className="w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-[3px] focus:ring-[var(--ring)]" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="material-date">날짜</Label><Input id="material-date" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="material-owner">담당</Label><Input id="material-owner" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} /></div></div>
          <div className="space-y-2"><Label htmlFor="material-tags">태그</Label><Input id="material-tags" value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="쉼표, 슬래시 또는 공백으로 구분" /></div>
          <div className="space-y-2"><Label htmlFor="material-link">공유 링크</Label><Input id="material-link" type="url" value={form.link} onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))} placeholder="https://" aria-describedby="material-link-help material-form-error" /><p id="material-link-help" className="text-xs text-[var(--muted-foreground)]">Teams의 SharePoint 공유 링크를 붙여 넣으세요.</p></div>
          <p id="material-form-error" role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--destructive)]">{error}</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={saving}>{saving ? "저장 중" : "저장"}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function MaterialSearchList({ items, emptyMessage, onOpen, onAdd }: {
  items: MaterialItem[]
  emptyMessage: string
  onOpen: (item: MaterialItem) => void
  onAdd?: () => void
}) {
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState("__all__")
  const [sort, setSort] = useState("latest")
  const [page, setPage] = useState(1)
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b, "ko-KR")), [items])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR")
    return items.filter((item) => {
      const searchable = [item.title, item.summary, ...item.tags].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR")
      return (!normalized || searchable.includes(normalized)) && (tag === "__all__" || item.tags.includes(tag))
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ko-KR") : (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title, "ko-KR"))
  }, [items, query, sort, tag])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, sort, tag])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-[var(--foreground)]">자료 검색 목록</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">총 {items.length.toLocaleString("ko-KR")}건</p></div>{onAdd ? <Button type="button" onClick={onAdd}><Plus aria-hidden="true" />자료 추가</Button> : null}</div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative block"><span className="sr-only">자료 검색</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·태그·요약 검색" className="pl-9" /></label>
        <Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="자료 정렬"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">최신순</SelectItem><SelectItem value="title">제목순</SelectItem></SelectContent></Select>
      </div>
      {tags.length ? <div className="flex flex-wrap gap-2" aria-label="태그 필터"><Button type="button" size="sm" variant={tag === "__all__" ? "secondary" : "outline"} onClick={() => setTag("__all__")}>전체</Button>{tags.map((value) => <Button key={value} type="button" size="sm" variant={tag === value ? "secondary" : "outline"} onClick={() => setTag(value)}>{value}</Button>)}</div> : null}
      {shown.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((item) => {
        const link = httpsMaterialLink(item.link)
        return <Card key={item.id} className="flex h-full flex-col"><CardHeader className="p-4 pb-2"><CardTitle className="line-clamp-2 text-base leading-5">{item.title}</CardTitle><p className="text-xs text-[var(--muted-foreground)]">{item.date ? fmtDateFull(item.date) : "날짜 미등록"}{item.owner ? ` · ${item.owner}` : ""}</p></CardHeader><CardContent className="flex flex-1 flex-col px-4 pb-4"><p className="line-clamp-2 min-h-10 text-sm text-[var(--muted-foreground)]">{item.summary || "요약이 등록되지 않았습니다."}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.tags.slice(0, 5).map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div><div className="mt-auto grid gap-2 pt-4"><Button type="button" variant="default" size="default" className="w-full" onClick={() => onOpen(item)}>상세</Button>{link ? <Button asChild variant="outline" size="default" className="w-full"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />SharePoint에서 열기</a></Button> : null}</div></CardContent></Card>
      })}</div> : <div className="flex min-h-32 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">{items.length ? "검색 조건에 맞는 자료가 없습니다." : emptyMessage}</div>}
      {pageCount > 1 ? <div className="flex items-center justify-center gap-3"><Button type="button" variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>이전</Button><span className="text-sm tabular-nums text-[var(--muted-foreground)]">{safePage} / {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>다음</Button></div> : null}
    </div>
  )
}

function useMaterialSection(kind: MaterialKind) {
  const excel = useAppStore((state) => state.materials)
  const manual = useAppStore((state) => state.materialsManual)
  return useMemo(() => materialsOf(kind, excel, manual), [excel, kind, manual])
}

export function MaterialDeckSection({ kind, title, description, emptyMessage, items: providedItems, allowAdd = true, visibleCards, hideBadges, expandInline, deepPerspective }: { kind: MaterialKind; title: string; description: string; emptyMessage: string; items?: MaterialItem[]; allowAdd?: boolean; visibleCards?: number; hideBadges?: boolean; expandInline?: boolean; deepPerspective?: boolean }) {
  const storedItems = useMaterialSection(kind)
  const items = providedItems ?? storedItems
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [editing, setEditing] = useState<MaterialItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (item?: MaterialItem) => { setSelected(null); setEditing(item ?? null); setFormOpen(true) }
  return <Card><CardHeader className="flex-row items-start justify-between gap-3 space-y-0"><div><CardTitle>{title}</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p></div>{allowAdd ? <Button type="button" variant="outline" size="sm" onClick={() => openForm()}><Plus aria-hidden="true" />자료 추가</Button> : null}</CardHeader><CardContent><MaterialDeck items={items} emptyMessage={emptyMessage} onOpen={setSelected} onAdd={allowAdd ? () => openForm() : undefined} visibleCards={visibleCards} hideBadges={hideBadges} expandInline={expandInline} deepPerspective={deepPerspective} /></CardContent>{expandInline ? null : <MaterialDetailSheet item={selected} onOpenChange={(open) => { if (!open) setSelected(null) }} onEdit={openForm} />}<MaterialFormSheet open={formOpen} defaultKind={kind} item={editing} onOpenChange={setFormOpen} /></Card>
}

export function MaterialSearchSection({ kind, emptyMessage, items: providedItems, allowAdd = true }: { kind: MaterialKind; emptyMessage: string; items?: MaterialItem[]; allowAdd?: boolean }) {
  const storedItems = useMaterialSection(kind)
  const items = providedItems ?? storedItems
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [editing, setEditing] = useState<MaterialItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (item?: MaterialItem) => { setSelected(null); setEditing(item ?? null); setFormOpen(true) }
  return <Card><CardContent className="p-6"><MaterialSearchList items={items} emptyMessage={emptyMessage} onOpen={setSelected} onAdd={allowAdd ? () => openForm() : undefined} /></CardContent><MaterialDetailSheet item={selected} onOpenChange={(open) => { if (!open) setSelected(null) }} onEdit={openForm} /><MaterialFormSheet open={formOpen} defaultKind={kind} item={editing} onOpenChange={setFormOpen} /></Card>
}
