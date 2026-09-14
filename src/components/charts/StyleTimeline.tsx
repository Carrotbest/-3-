import { useMemo, useState, type CSSProperties } from "react"
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react"

import { styleTimeline, type StyleTimelineOption, type StyleTimelineRow } from "@/data/derive"
import { daysLeft, fmtDateFull, toDate } from "@/data/format"
import { ownerDisplayName, type DevRecord } from "@/data/schema"
import { useInView } from "@/lib/useInView"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface StyleTimelineProps {
  records: readonly DevRecord[]
  today: Date
  onSelect: (record: DevRecord) => void
  hideOwnerCategoryFilters?: boolean
}

type TimelineState = StyleTimelineRow["state"]
type RangeKey = "3" | "6" | "all"

const ALL = "__all__"
const EMPTY = "__empty__"
const DAY_MS = 86_400_000
const EASE_IN = "cubic-bezier(0.32, 0, 0.67, 0)"
const STATE_OPTIONS: Array<{ key: TimelineState; label: string }> = [
  { key: "progress", label: "진행" },
  { key: "due", label: "임박" },
  { key: "late", label: "지연" },
  { key: "done", label: "완료" },
]

const STATE_COPY: Record<TimelineState, string> = {
  progress: "진행",
  due: "납기 임박",
  late: "지연",
  done: "완료",
}

function dateValue(value: string): number {
  return toDate(value)?.getTime() ?? 0
}

function localDay(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

function rangeStart(today: Date, range: RangeKey): Date | null {
  if (range === "all") return null
  return new Date(today.getFullYear(), today.getMonth() - Number(range), today.getDate())
}

function stateClass(state: TimelineState): string {
  if (state === "late") return "border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_10%,var(--card))]"
  if (state === "due") return "border-[var(--warning)] bg-[color-mix(in_oklab,var(--warning)_12%,var(--card))]"
  if (state === "done") return "border-[var(--chart-2)] bg-[color-mix(in_oklab,var(--chart-2)_10%,var(--card))]"
  return "border-[var(--chart-1)] bg-[color-mix(in_oklab,var(--chart-1)_10%,var(--card))]"
}

function fillClass(state: TimelineState): string {
  if (state === "late") return "from-[color-mix(in_oklab,var(--destructive)_35%,transparent)] to-[color-mix(in_oklab,var(--destructive)_70%,transparent)]"
  if (state === "due") return "from-[color-mix(in_oklab,var(--warning)_35%,transparent)] to-[color-mix(in_oklab,var(--warning)_70%,transparent)]"
  if (state === "done") return "from-[color-mix(in_oklab,var(--chart-2)_35%,transparent)] to-[color-mix(in_oklab,var(--chart-2)_70%,transparent)]"
  return "from-[color-mix(in_oklab,var(--chart-1)_35%,transparent)] to-[color-mix(in_oklab,var(--chart-1)_70%,transparent)]"
}

function dueLabel(row: StyleTimelineRow, today: Date): string {
  if (row.state === "done") return `완료 ${fmtDateFull(row.end)}`
  const remaining = row.options
    .filter((option) => option.state !== "done")
    .map((option) => daysLeft(option.record.dueDate, today))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)[0]
  if (remaining === undefined) return "납기 미기재"
  if (remaining < 0) return `D+${Math.abs(remaining)}`
  if (remaining === 0) return "오늘 마감"
  return `D-${remaining}`
}

function optionDueLabel(option: StyleTimelineOption, today: Date): string {
  if (option.state === "done") return `완료 ${fmtDateFull(option.end)}`
  const remaining = daysLeft(option.record.dueDate, today)
  if (remaining === null) return "납기 미기재"
  if (remaining < 0) return `D+${Math.abs(remaining)}`
  if (remaining === 0) return "오늘 마감"
  return `D-${remaining}`
}

export function StyleTimeline({ records, today, onSelect, hideOwnerCategoryFilters = false }: StyleTimelineProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15, once: true })
  const rows = useMemo(() => styleTimeline(records, today), [records, today])
  const [owner, setOwner] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [states, setStates] = useState<Set<TimelineState>>(() => new Set(["progress", "due", "late"]))
  const [range, setRange] = useState<RangeKey>("3")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const owners = useMemo(() => [...new Set(rows.map((row) => row.owner))].sort((a, b) => ownerDisplayName(a).localeCompare(ownerDisplayName(b), "ko-KR")), [rows])
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category))].sort((a, b) => (a || "미지정").localeCompare(b || "미지정", "ko-KR")), [rows])
  const cutoff = rangeStart(today, range)
  const visibleRows = rows.filter((row) =>
    (owner === ALL || (owner === EMPTY ? !row.owner : row.owner === owner))
    && (category === ALL || (category === EMPTY ? !row.category : row.category === category))
    && states.has(row.state)
    && (!cutoff || dateValue(row.end) >= cutoff.getTime()),
  )

  const minRowTime = Math.min(...visibleRows.map((row) => dateValue(row.start)))
  const maxRowTime = Math.max(...visibleRows.map((row) => dateValue(row.end)))
  const axisStartTime = visibleRows.length ? Math.max(minRowTime, cutoff?.getTime() ?? Number.NEGATIVE_INFINITY) : 0
  const axisEndTime = visibleRows.length ? Math.max(maxRowTime, axisStartTime + DAY_MS) : 0
  const axisSpan = Math.max(DAY_MS, axisEndTime - axisStartTime)
  const pct = (time: number) => ((time - axisStartTime) / axisSpan) * 100
  const clippedPosition = (start: string, end: string) => {
    const startTime = dateValue(start)
    const endTime = dateValue(end)
    if (endTime < axisStartTime || startTime > axisEndTime) return { left: 0, width: 0 }
    const left = Math.max(0, Math.min(100, pct(startTime)))
    const right = Math.max(0, Math.min(100, pct(endTime)))
    return { left, width: Math.max(0.45, right - left) }
  }
  const todayPct = Math.max(0, Math.min(100, pct(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime())))
  const monthTicks: Array<{ key: string; label: string; pct: number }> = []
  if (visibleRows.length) {
    const start = new Date(axisStartTime)
    const tick = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    while (tick.getTime() <= axisEndTime) {
      monthTicks.push({ key: localDay(tick), label: `${tick.getMonth() + 1}월`, pct: pct(tick.getTime()) })
      tick.setMonth(tick.getMonth() + 1)
    }
  }

  const toggleState = (state: TimelineState) => setStates((current) => {
    const next = new Set(current)
    if (next.has(state)) next.delete(state); else next.add(state)
    return next
  })
  const toggleExpanded = (styleNo: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(styleNo)) next.delete(styleNo); else next.add(styleNo)
    return next
  })
  const optionCount = visibleRows.reduce((sum, row) => sum + row.options.length, 0)
  const gridLines = () => (
    <>
      {monthTicks.map((tick) => <span key={tick.key} aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--border)]/65" style={{ left: `${tick.pct}%` }} />)}
    </>
  )

  return (
    <div ref={ref} className="style-timeline">
      <style>{`
        @media (prefers-reduced-motion: reduce) { .style-timeline * { animation: none !important; } }
        @keyframes style-bar-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        @keyframes style-gauge-fill { from { width: 0%; } to { width: var(--gauge); } }
        @keyframes style-today-glow {
          0%, 100% { opacity: .8; box-shadow: 0 0 4px 1px color-mix(in oklab, var(--primary) 55%, transparent), 0 0 12px 3px color-mix(in oklab, var(--primary) 30%, transparent); }
          50% { opacity: 1; box-shadow: 0 0 7px 2px color-mix(in oklab, var(--primary) 80%, transparent), 0 0 22px 6px color-mix(in oklab, var(--primary) 45%, transparent); }
        }
      `}</style>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
        {!hideOwnerCategoryFilters ? (
          <>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="담당 필터"><SelectValue placeholder="담당" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>담당 전체</SelectItem>
                {owners.map((value) => <SelectItem key={value || EMPTY} value={value || EMPTY}>{ownerDisplayName(value) || "미지정"}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="카테고리 필터"><SelectValue placeholder="카테고리" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>카테고리 전체</SelectItem>
                {categories.map((value) => <SelectItem key={value || EMPTY} value={value || EMPTY}>{value || "미지정"}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        ) : null}
        <div className="flex flex-wrap gap-1" role="group" aria-label="상태 필터">
          {STATE_OPTIONS.map((option) => (
            <button key={option.key} type="button" aria-pressed={states.has(option.key)} onClick={() => toggleState(option.key)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]", states.has(option.key) ? stateClass(option.key) : "border-[var(--border)] text-[var(--muted-foreground)]")}>{option.label}</button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="조회 기간">
          {([{ key: "3", label: "3개월" }, { key: "6", label: "6개월" }, { key: "all", label: "전체" }] as const).map((option) => (
            <button key={option.key} type="button" aria-pressed={range === option.key} onClick={() => setRange(option.key)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]", range === option.key ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)] text-[var(--muted-foreground)]")}>{option.label}</button>
          ))}
        </div>
        <p className="ml-auto text-xs tabular-nums text-[var(--muted-foreground)]">스타일 {visibleRows.length} · 옵션 {optionCount} · 지연 {visibleRows.filter((row) => row.state === "late").length} · 임박 {visibleRows.filter((row) => row.state === "due").length}</p>
      </div>

      {!visibleRows.length ? (
        <div className="flex flex-col items-center px-5 py-16 text-center">
          <CalendarDays aria-hidden="true" className="size-9 text-[var(--muted-foreground)]" />
          <p className="mt-3 text-sm font-medium text-[var(--foreground)]">조건에 맞는 스타일이 없습니다.</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">필터나 조회 기간을 바꿔 확인해 주세요.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[64rem]">
            <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-end gap-4 border-b border-[var(--border)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
              <div>Style No. · 담당</div>
              <div className="relative h-7">
                <span className="absolute left-0 top-0">{fmtDateFull(localDay(new Date(axisStartTime)))}</span>
                <span className="absolute right-0 top-0">{fmtDateFull(localDay(new Date(axisEndTime)))}</span>
                {monthTicks.map((tick) => <span key={tick.key} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${tick.pct}%` }}>{tick.label}</span>)}
                <span className="absolute bottom-[-0.8rem] z-30 -translate-x-1/2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[var(--primary-foreground)] motion-reduce:[animation:none]" style={{ left: `${todayPct}%`, animation: "style-today-glow 2.4s ease-in-out infinite" }}>TODAY<span aria-hidden="true" className="absolute left-1/2 top-full h-3 w-0.5 -translate-x-1/2 bg-[var(--primary)]" /></span>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              <div key={`${owner}|${category}|${[...states].sort().join(",")}|${range}`} className="relative">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 grid grid-cols-[14rem_minmax(0,1fr)] gap-4 px-4">
                  <span />
                  <span className="relative">
                    <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--primary)] motion-reduce:[animation:none]" style={{ left: `${todayPct}%`, animation: "style-today-glow 2.4s ease-in-out infinite" }} />
                  </span>
                </div>
                {visibleRows.map((row, index) => {
                const ownerChanged = index === 0 || visibleRows[index - 1].owner !== row.owner
                const ownerStyleCount = visibleRows.filter((item) => item.owner === row.owner).length
                const open = expanded.has(row.styleNo)
                const stylePosition = clippedPosition(row.start, row.end)
                const delay = Math.min(index, 24) * 40
                return (
                  <div key={row.styleNo}>
                    {ownerChanged ? (
                      <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-4 border-b border-[var(--border)] bg-[var(--muted)]/45 px-4 py-2 text-xs font-semibold text-[var(--foreground)]">
                        <div>{ownerDisplayName(row.owner) || "미지정"} <span className="font-normal text-[var(--muted-foreground)]">· 스타일 {ownerStyleCount}</span></div>
                        <div />
                      </div>
                    ) : null}
                    <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-center gap-4 border-b border-[var(--border)] px-4 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <button type="button" aria-expanded={open} onClick={() => toggleExpanded(row.styleNo)} className="mt-0.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}<span className="sr-only">{row.styleNo} 옵션 {open ? "접기" : "펼치기"}</span></button>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--foreground)]">{row.styleNo}</p><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{row.category || "미지정"} · {row.buyer || "Buyer 미지정"} · 옵션 {row.doneCount}/{row.options.length}</p></div>
                      </div>
                      <div className="relative h-10 rounded-[var(--radius)] bg-[var(--muted)]/55">
                        {gridLines()}
                        <button type="button" onClick={() => toggleExpanded(row.styleNo)} className={cn("absolute top-1/2 z-10 h-7 -translate-y-1/2 overflow-hidden rounded-md border text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_3px_rgba(0,0,0,0.10),0_2px_5px_rgba(0,0,0,0.14)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:[animation:none]", stateClass(row.state))} style={{ left: `${stylePosition.left}%`, width: `${Math.min(100 - stylePosition.left, stylePosition.width)}%`, animation: `style-bar-reveal 900ms ${EASE_IN} ${delay}ms both`, animationPlayState: inView ? "running" : "paused" }} title={`${fmtDateFull(row.start)} ~ ${fmtDateFull(row.end)} · ${STATE_COPY[row.state]} · ${dueLabel(row, today)} · 옵션 완료 ${row.doneCount}/${row.options.length}`}>
                          <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 bg-gradient-to-r after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-white/60 motion-reduce:[animation:none]", fillClass(row.state))} style={{ "--gauge": `${row.progressPct}%`, width: "var(--gauge)", animation: `style-gauge-fill 1100ms ${EASE_IN} ${delay + 300}ms both`, animationPlayState: inView ? "running" : "paused" } as CSSProperties} />
                          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/2 rounded-t-md bg-gradient-to-b from-white/40 to-transparent" />
                          <span className="relative z-20 block truncate px-2 py-1 text-xs font-semibold text-[var(--foreground)]">{row.styleNo} · {row.progressPct}%</span>
                        </button>
                      </div>
                    </div>
                    {open ? row.options.map((option) => {
                      const position = clippedPosition(option.start, option.end)
                      return (
                        <div key={`${option.record.opt}-${option.record._src.sheet}-${option.record._src.row}`} className="grid grid-cols-[14rem_minmax(0,1fr)] items-center gap-4 border-b border-[var(--border)] bg-[var(--muted)]/20 px-4 py-2">
                          <p className="truncate pl-8 text-xs text-[var(--muted-foreground)]">OPT {option.record.opt || "미지정"} · {option.record.stage || "공정 미지정"}</p>
                          <div className="relative h-8 rounded-[var(--radius)] bg-[var(--muted)]/45">
                            {gridLines()}
                            <button type="button" onClick={() => onSelect(option.record)} className={cn("absolute top-1/2 z-10 h-5 -translate-y-1/2 rounded-sm border outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:[animation:none]", stateClass(option.state))} style={{ left: `${position.left}%`, width: `${Math.min(100 - position.left, position.width)}%`, animation: `style-bar-reveal 600ms ${EASE_IN} both` }} title={`${fmtDateFull(option.start)} ~ ${fmtDateFull(option.end)} · ${STATE_COPY[option.state]} · ${optionDueLabel(option, today)}`}><span className="sr-only">{row.styleNo} OPT {option.record.opt} 상세 보기</span></button>
                          </div>
                        </div>
                      )
                    }) : null}
                  </div>
                )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
