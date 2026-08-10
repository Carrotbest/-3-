import { Pin } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const ROTATION_CLASSES = ["-rotate-1", "rotate-1", "-rotate-1", "rotate-2", "-rotate-1", "rotate-1", "-rotate-2", "rotate-1", "-rotate-1"] as const

export interface PinBoardItem {
  title: string
  description: string
  path: string
  icon: LucideIcon
}

export function PinBoard({ items, onNavigate }: { items: readonly PinBoardItem[]; onNavigate: (path: string) => void }) {
  return <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 shadow-inner"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => { const Icon = item.icon; return <button key={item.path} type="button" onClick={() => onNavigate(item.path)} className={`group relative min-h-32 cursor-pointer rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-5 pb-5 pt-9 text-left shadow-[var(--shadow-1)] outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:rotate-0 hover:shadow-[var(--shadow-2)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none motion-reduce:transition-none ${ROTATION_CLASSES[index % ROTATION_CLASSES.length]}`}><Pin aria-hidden="true" className="absolute left-1/2 top-2 size-5 -translate-x-1/2 text-[var(--primary)] drop-shadow-sm" /><span className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--muted)]"><Icon className="size-4" aria-hidden="true" /></span><span><strong className="block text-sm text-[var(--foreground)]">{item.title}</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">{item.description}</span></span></span></button> })}</div></div>
}
