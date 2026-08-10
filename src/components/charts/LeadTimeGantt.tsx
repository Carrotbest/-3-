import { CalendarDays } from "lucide-react"

import type { LeadTimelineRow } from "@/data/derive"
import { daysLeft, fmtDateFull } from "@/data/format"
import type { DevRecord } from "@/data/schema"
import { cn } from "@/lib/utils"

interface LeadTimeGanttProps {
  rows: readonly LeadTimelineRow[]
  minDate: string
  maxDate: string
  todayPct: number
  today?: Date
  onSelect: (record: DevRecord) => void
}

const STATE_COPY: Record<LeadTimelineRow["state"], string> = {
  progress: "진행",
  due: "납기 임박",
  late: "지연",
  done: "완료",
}

function dueLabel(row: LeadTimelineRow, today: Date): string {
  if (row.state === "done") return `완료 ${fmtDateFull(row.end)}`
  const days = daysLeft(row.record.dueDate, today)
  if (days === null) return "납기 미기재"
  if (days < 0) return `D+${Math.abs(days)}`
  if (days === 0) return "오늘 마감"
  return `D-${days}`
}

function energyClass(state: LeadTimelineRow["state"]): string {
  if (state === "late") return "from-[var(--destructive)] via-[color-mix(in_oklab,var(--destructive)_65%,var(--warning))] to-[var(--destructive)]"
  if (state === "due") return "from-[var(--warning)] via-[color-mix(in_oklab,var(--warning)_65%,var(--chart-3))] to-[var(--warning)]"
  if (state === "done") return "from-[var(--chart-2)] via-[color-mix(in_oklab,var(--chart-2)_70%,var(--chart-1))] to-[var(--chart-2)]"
  return "from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-1)]"
}

export function LeadTimeGantt({ rows, minDate, maxDate, todayPct, today = new Date(), onSelect }: LeadTimeGanttProps) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center px-5 py-16 text-center">
        <CalendarDays aria-hidden="true" className="size-9 text-[var(--muted-foreground)]" />
        <p className="mt-3 text-sm font-medium text-[var(--foreground)]">표시할 리드타임이 없습니다.</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">접수일 또는 납기일이 있는 개발 건을 확인해 주세요.</p>
      </div>
    )
  }

  const markerPct = Math.min(100, Math.max(0, todayPct))
  const markerOutside = todayPct < 0 || todayPct > 100

  return (
    <div className="overflow-x-auto">
      <style>{`@keyframes lead-energy-flow { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }`}</style>
      <div className="min-w-[56rem] p-4">
        <div className="grid grid-cols-[12rem_minmax(0,1fr)] items-end gap-4 border-b border-[var(--border)] pb-3 text-xs text-[var(--muted-foreground)]">
          <div>Style No. · 담당</div>
          <div className="relative flex justify-between">
            <span>{fmtDateFull(minDate)}</span>
            <span>{fmtDateFull(maxDate)}</span>
            <span
              className="absolute bottom-[-0.85rem] -translate-x-1/2 rounded-full bg-[var(--foreground)] px-2 py-0.5 text-[var(--background)]"
              style={{ left: `${markerPct}%` }}
              title={markerOutside ? "오늘이 표시 범위 밖에 있어 가장 가까운 끝에 표시됩니다." : undefined}
            >
              TODAY
            </span>
          </div>
        </div>

        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[12rem_minmax(0,1fr)] gap-4">
            <span />
            <span className="relative">
              <span className="absolute bottom-0 top-0 w-px bg-[var(--foreground)]/35" style={{ left: `${markerPct}%` }} />
            </span>
          </span>
          {rows.map((row) => (
            <div key={`${row.record.styleNo}-${row.record.opt}-${row.record._src.sheet}-${row.record._src.row}`} className="grid grid-cols-[12rem_minmax(0,1fr)] items-center gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{row.record.styleNo} · {row.record.opt}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{row.record.owner || "미지정"} · {row.record.stage || "공정 미지정"}</p>
              </div>
              <div className="relative h-10 rounded-[var(--radius)] bg-[var(--muted)]/55">
                <button
                  type="button"
                  onClick={() => onSelect(row.record)}
                  className={cn(
                    "group absolute top-1/2 h-7 -translate-y-1/2 overflow-visible rounded-[calc(var(--radius)-2px)] border bg-[var(--card)] text-left shadow-sm outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-[55%] hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none",
                    row.state === "late" ? "border-[var(--destructive)]" : row.state === "due" ? "border-[var(--warning)]" : row.state === "done" ? "border-[var(--chart-2)]" : "border-[var(--chart-1)]",
                  )}
                  style={{ left: `${row.offsetPct}%`, width: `${Math.min(100 - row.offsetPct, row.widthPct)}%` }}
                  aria-label={`${row.record.styleNo} 리드타임 상세 보기, ${STATE_COPY[row.state]}, 진행도 ${row.progressPct}%`}
                  title={`${row.record.styleNo} · ${row.record.owner || "미지정"} · ${STATE_COPY[row.state]} · ${dueLabel(row, today)}`}
                >
                  <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
                    <span
                      aria-hidden="true"
                      className={cn("block h-full animate-[lead-energy-flow_1.8s_linear_infinite] bg-gradient-to-r bg-[length:200%_100%] opacity-90 motion-reduce:animate-none", energyClass(row.state))}
                      style={{ width: `${row.progressPct}%` }}
                    />
                  </span>
                  <span className="relative z-[1] block truncate px-2 py-1 text-xs font-semibold text-[var(--foreground)] mix-blend-normal">
                    {row.record.styleNo}
                  </span>
                  <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-30 hidden w-max max-w-xs -translate-x-1/2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] px-3 py-2 text-xs font-normal text-[var(--popover-foreground)] shadow-md group-hover:block group-focus-visible:block">
                    <strong className="block font-semibold">{row.record.styleNo} · {row.record.owner || "미지정"}</strong>
                    <span className="mt-1 block">{row.record.stage || "공정 미지정"} · {STATE_COPY[row.state]} · {dueLabel(row, today)}</span>
                    <span className="mt-1 block text-[var(--muted-foreground)]">{fmtDateFull(row.start)} ~ {fmtDateFull(row.end)} · 진행도 {row.progressPct}%</span>
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
