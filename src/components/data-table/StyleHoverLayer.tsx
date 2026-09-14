import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react"

export type StyleTone = "late" | "due" | "progress" | "done" | null

export interface StyleHoverLayerHandle {
  show: (key: string) => void
  hide: () => void
}

interface Props {
  containerRef: RefObject<HTMLDivElement | null>
  toneOf: (key: string) => StyleTone
}

interface LayerState {
  key: string
  blocks: { top: number; height: number }[]
  left: number
  width: number
}

export const StyleHoverLayer = forwardRef<StyleHoverLayerHandle, Props>(function StyleHoverLayer({ containerRef, toneOf }, ref) {
  const [layer, setLayer] = useState<LayerState | null>(null)
  const rowCountRef = useRef(0)

  const hide = useCallback(() => {
    rowCountRef.current = 0
    setLayer(null)
  }, [])

  const show = useCallback((key: string) => {
    const container = containerRef.current
    const table = container?.querySelector<HTMLTableElement>("table[data-dd-master-grid]")
    if (!container || !table || !key) {
      hide()
      return
    }

    const containerRect = container.getBoundingClientRect()
    const blocks: { top: number; height: number }[] = []
    let firstRect: DOMRect | null = null
    let lastRect: DOMRect | null = null
    let rowCount = 0

    const finishBlock = () => {
      if (!firstRect || !lastRect) return
      const top = firstRect.top - containerRect.top + container.scrollTop
      const bottom = lastRect.bottom - containerRect.top + container.scrollTop
      blocks.push({ top, height: bottom - top })
      firstRect = null
      lastRect = null
    }

    table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr").forEach((row) => {
      if (row.dataset.styleKey === key) {
        const rect = row.getBoundingClientRect()
        firstRect ??= rect
        lastRect = rect
        rowCount += 1
      } else {
        finishBlock()
      }
    })
    finishBlock()

    if (!blocks.length) {
      hide()
      return
    }

    rowCountRef.current = rowCount
    setLayer({
      key,
      blocks,
      left: container.scrollLeft,
      width: Math.min(container.clientWidth, table.scrollWidth - container.scrollLeft),
    })
  }, [containerRef, hide])

  useImperativeHandle(ref, () => ({ show, hide }), [hide, show])

  useEffect(() => {
    if (!layer?.key) return
    const container = containerRef.current
    if (!container) return
    const key = layer.key
    let frame: number | null = null
    const scheduleMeasure = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        show(key)
      })
    }
    container.addEventListener("scroll", scheduleMeasure, { passive: true })
    window.addEventListener("resize", scheduleMeasure)
    return () => {
      container.removeEventListener("scroll", scheduleMeasure)
      window.removeEventListener("resize", scheduleMeasure)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [containerRef, layer?.key, show])

  if (!layer) return null

  const tone = toneOf(layer.key)
  const color = tone === "late"
    ? "var(--destructive)"
    : tone === "due"
      ? "var(--warning)"
      : tone === "done"
        ? "var(--chart-2)"
        : tone === "progress"
          ? "var(--chart-1)"
          : "var(--grid-selection)"

  return <>
    <style>{`@keyframes style-hover-lift { from { opacity: 0; transform: translateY(3px) scale(.997); } to { opacity: 1; transform: translateY(-1px) scale(1); } } @media (prefers-reduced-motion: reduce) { .dd-style-hover { animation: none !important; transform: none !important; } }`}</style>
    {layer.blocks.map((block, index) => <div
      key={`${layer.key}-${index}`}
      className="dd-style-hover pointer-events-none absolute left-0 top-0 z-[25]"
      style={{
        top: block.top,
        height: block.height,
        left: layer.left,
        width: layer.width,
        border: `2px solid ${color}`,
        borderRadius: 5,
        background: `color-mix(in oklab, ${color} 9%, transparent)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.55), 0 10px 24px -10px color-mix(in oklab, ${color} 55%, transparent), 0 3px 8px rgba(0,0,0,.14)`,
        animation: "style-hover-lift 180ms cubic-bezier(.2,.8,.2,1) both",
      }}
    >
      <span className="absolute -top-5 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ backgroundColor: color }}>
        {index === 0
          ? `${layer.key} · ${rowCountRef.current}행${layer.blocks.length >= 2 ? ` · ${layer.blocks.length}곳` : ""}`
          : layer.key}
      </span>
    </div>)}
  </>
})
