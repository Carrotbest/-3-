import type { MouseEvent as ReactMouseEvent } from "react"

export interface CellRef { row: number; col: string }
export type CellMove = "up" | "down" | "left" | "right"
export interface CellRect { top: number; bottom: number; left: number; right: number }
export interface CellSel { inRange: boolean; isActive: boolean; top: boolean; bottom: boolean; left: boolean; right: boolean; handle: boolean }

export function selectionShadow(sel: CellSel): string | undefined {
  if (!sel.inRange) return undefined
  const parts: string[] = []
  if (sel.top) parts.push("inset 0 1.5px 0 0 var(--grid-selection)")
  if (sel.bottom) parts.push("inset 0 -1.5px 0 0 var(--grid-selection)")
  if (sel.left) parts.push("inset 1.5px 0 0 0 var(--grid-selection)")
  if (sel.right) parts.push("inset -1.5px 0 0 0 var(--grid-selection)")
  return parts.length ? parts.join(", ") : undefined
}

export function FillHandle({ visible, onMouseDown }: { visible: boolean; onMouseDown: (event: ReactMouseEvent<HTMLSpanElement>) => void }) {
  return visible ? <span data-fill-handle aria-hidden="true" onMouseDown={onMouseDown} className="absolute -bottom-1 -right-1 z-30 size-[7px] cursor-crosshair border border-white bg-[var(--grid-selection)]" /> : null
}
