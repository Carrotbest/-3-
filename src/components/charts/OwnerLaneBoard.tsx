import { useMemo, useState, type CSSProperties } from "react"
import { ArrowUpRight } from "lucide-react"

import {
  BOARD_STAGES,
  ownerLaneBoard,
  type LaneCell,
  type LaneStyleGroup,
  type LaneUrgency,
} from "@/data/derive"
import { ownerDisplayName, type DevRecord } from "@/data/schema"
import { Magnetic } from "@/components/motion/Magnetic"
import { Button } from "@/components/ui/button"
import { useInView } from "@/lib/useInView"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface OwnerLaneBoardProps {
  rows: readonly DevRecord[]
  today?: Date
  onSelect: (record: DevRecord) => void
  ownerAliases?: Record<string, string>
}

const CHART_WIDTH = 1200
const STAGE_X = [225, 420, 615, 810, 1005] as const
const ROW_START = 135
const ROW_GAP = 82

const STAGE_COLORS = [
  "var(--gradient-1)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--gradient-3)",
] as const

const OWNER_COLORS = [
  "var(--gradient-1)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--gradient-3)",
  "var(--chart-3)",
] as const

const URGENCY_COLORS: Record<LaneUrgency, string> = {
  normal: "var(--status-normal)",
  soon: "var(--status-soon)",
  danger: "var(--status-danger)",
}

const URGENCY_ORDER = ["normal", "soon", "danger"] as const
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 46
const GAUGE_DELAYS: Record<LaneUrgency, string> = {
  normal: "0ms",
  soon: "140ms",
  danger: "280ms",
}

function dueLabel(group: LaneStyleGroup): string {
  if (group.dayOffset === null) return "납기 미기재"
  if (group.dayOffset < 0) return `D+${Math.abs(group.dayOffset)}`
  if (group.dayOffset === 0) return "오늘 마감"
  return `D-${group.dayOffset}`
}

function urgencyText(cell: LaneCell): string {
  const parts = []
  if (cell.urgencyCounts.danger) parts.push(`오늘·지연 ${cell.urgencyCounts.danger}`)
  if (cell.urgencyCounts.soon) parts.push(`임박 ${cell.urgencyCounts.soon}`)
  if (cell.urgencyCounts.normal) parts.push(`정상 ${cell.urgencyCounts.normal}`)
  return parts.join(" · ") || "진행 없음"
}

function nodeStyle(stageIndex: number, ownerIndex: number, urgency: LaneUrgency): CSSProperties {
  const stageColor = STAGE_COLORS[stageIndex]
  const ownerColor = OWNER_COLORS[ownerIndex % OWNER_COLORS.length]
  return {
    background: `linear-gradient(145deg, color-mix(in oklab, var(--card) 94%, ${stageColor}), color-mix(in oklab, var(--card) 82%, ${ownerColor}))`,
    boxShadow: `0 9px 18px -14px color-mix(in oklab, ${ownerColor} 62%, transparent), 0 0 0 3px color-mix(in oklab, ${URGENCY_COLORS[urgency]} 9%, transparent)`,
  }
}

function FlowNode({
  cell,
  owner,
  ownerIndex,
  stageIndex,
  x,
  y,
  maxCell,
  inView,
  onActivate,
  onDeactivate,
  onOpen,
}: {
  cell: LaneCell
  owner: string
  ownerIndex: number
  stageIndex: number
  x: number
  y: number
  maxCell: number
  inView: boolean
  onActivate: () => void
  onDeactivate: () => void
  onOpen: () => void
}) {
  const stage = BOARD_STAGES[stageIndex]
  const density = maxCell ? cell.count / maxCell : 0
  const size = 38 + Math.sqrt(density) * 12
  if (!cell.count) {
    return <span aria-hidden="true" className="absolute z-[2] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--border)] bg-[var(--card)]" style={{ left: `${(x / CHART_WIDTH) * 100}%`, top: y }} />
  }

  let cumulativeRatio = 0
  const gaugeSegments = URGENCY_ORDER.flatMap((urgency) => {
    const count = cell.urgencyCounts[urgency]
    if (!count) return []
    const ratio = count / cell.count
    const segment = {
      urgency,
      length: GAUGE_CIRCUMFERENCE * ratio,
      rotation: cumulativeRatio * 360,
    }
    cumulativeRatio += ratio
    return [segment]
  })

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(x / CHART_WIDTH) * 100}%`, top: y, width: 68, height: 68 }}
      onPointerEnter={onActivate}
      onPointerLeave={onDeactivate}
      onFocusCapture={onActivate}
      onBlurCapture={onDeactivate}
    >
      <Magnetic strength={2} tilt={4} lift={5} scale={1.035} stiffness={105} damping={18} className="grid place-items-center rounded-full">
        <button
          type="button"
          aria-label={`${owner} · ${stage.label} · ${cell.count} OPT · ${urgencyText(cell)} · 옵션 목록 열기`}
          onClick={onOpen}
          className="relative grid place-items-center rounded-full text-[var(--foreground)] outline-none transition-[box-shadow] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
          style={{ width: size, height: size, ...nodeStyle(stageIndex, ownerIndex, cell.urgency) }}
        >
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--border)" strokeWidth="8" opacity="0.42" />
            <g transform="rotate(-90 50 50)">
              {gaugeSegments.map(({ urgency, length, rotation }) => (
                <circle
                  key={urgency}
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke={URGENCY_COLORS[urgency]}
                  strokeWidth="8"
                  strokeLinecap="butt"
                  strokeDasharray={`${length} ${GAUGE_CIRCUMFERENCE - length}`}
                  strokeDashoffset={inView ? 0 : length}
                  transform={`rotate(${rotation} 50 50)`}
                  className="motion-reduce:transition-none"
                  style={{
                    transition: "stroke-dashoffset 520ms cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: GAUGE_DELAYS[urgency],
                  }}
                />
              ))}
            </g>
          </svg>
          <span className="flex flex-col items-center leading-none">
            <strong className="text-sm font-bold tabular-nums">{cell.count.toLocaleString("ko-KR")}</strong>
            <span className="mt-0.5 text-[7px] font-semibold tracking-[0.08em] text-[var(--muted-foreground)]">OPT</span>
          </span>
        </button>
      </Magnetic>
    </div>
  )
}

interface SelectedProcess {
  owner: string
  stageIndex: number
  cell: LaneCell
}

export function OwnerLaneBoard({ rows, today = new Date(), onSelect, ownerAliases }: OwnerLaneBoardProps) {
  const { ref: boardRef, inView } = useInView<HTMLDivElement>()
  const board = useMemo(() => ownerLaneBoard(rows, today), [rows, today])
  const [activeOwner, setActiveOwner] = useState<number | null>(null)
  const [selectedProcess, setSelectedProcess] = useState<SelectedProcess | null>(null)
  const chartHeight = Math.max(300, ROW_START + Math.max(0, board.rows.length - 1) * ROW_GAP + 58)
  const displayOwner = (owner: string) => ownerAliases?.[owner] ?? ownerDisplayName(owner)

  const selectedStage = selectedProcess ? BOARD_STAGES[selectedProcess.stageIndex] : null
  const selectedRecord = selectedProcess?.cell.groups[0]?.records[0]

  return (
    <>
      <div ref={boardRef} className="relative p-4">
        <section className="overflow-hidden rounded-[14px] border border-white/70 bg-white/44 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.26)] backdrop-blur" aria-labelledby="owner-lane-title">
          <div className="overflow-x-auto px-4 py-4">
            <div className="min-w-[1120px]">
              <div
                className="relative isolate overflow-hidden rounded-[14px] border border-white/65 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--card)_90%,transparent),color-mix(in_oklab,var(--muted)_28%,transparent))]"
                style={{ height: chartHeight }}
                role="group"
                aria-label="담당자별 접수, 원사, 편직, 염색, 가공 진행 흐름"
                onPointerLeave={() => setActiveOwner(null)}
              >
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    {board.rows.map((row, rowIndex) => (
                      <linearGradient key={row.owner} id={`owner-track-${rowIndex}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor={OWNER_COLORS[rowIndex % OWNER_COLORS.length]} stopOpacity="0.45" />
                        <stop offset="0.5" stopColor={OWNER_COLORS[rowIndex % OWNER_COLORS.length]} stopOpacity="0.9" />
                        <stop offset="1" stopColor={OWNER_COLORS[rowIndex % OWNER_COLORS.length]} stopOpacity="0.55" />
                      </linearGradient>
                    ))}
                  </defs>

                  {STAGE_X.map((x, index) => (
                    <g key={BOARD_STAGES[index].key}>
                      <rect x={x - 72} y="80" width="144" height={chartHeight - 100} rx="20" fill={`color-mix(in oklab, ${STAGE_COLORS[index]} 3%, transparent)`} />
                      <line x1={x} y1="82" x2={x} y2={chartHeight - 18} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 8" opacity="0.65" />
                    </g>
                  ))}

                  {board.rows.map((row, rowIndex) => {
                    const y = ROW_START + rowIndex * ROW_GAP
                    const selected = activeOwner === rowIndex
                    const subdued = activeOwner !== null && !selected
                    return (
                      <g key={row.owner} opacity={subdued ? 0.18 : 1} style={{ transition: "opacity 220ms ease" }}>
                        <line x1={STAGE_X[0]} y1={y} x2={STAGE_X[4]} y2={y} stroke="var(--border)" strokeWidth="1" opacity="0.55" />
                        <line x1={STAGE_X[0]} y1={y} x2={STAGE_X[4]} y2={y} stroke={`url(#owner-track-${rowIndex})`} strokeWidth={selected ? 5 : 3} strokeLinecap="round" opacity={selected ? 1 : 0.68} style={{ transition: "stroke-width 220ms ease, opacity 220ms ease" }} />
                      </g>
                    )
                  })}
                </svg>

                <div className="absolute inset-x-0 top-0 h-[82px] border-b border-white/55 bg-white/28 backdrop-blur-sm" aria-hidden="true" />
                <span id="owner-lane-title" className="absolute left-3 top-6 w-24 text-center text-[10px] font-semibold tracking-[0.08em] text-[var(--muted-foreground)]">담당자</span>

                {BOARD_STAGES.map((stage, stageIndex) => {
                  const total = board.stageTotals[stageIndex]
                  const share = board.total ? Math.round((total / board.total) * 100) : 0
                  return (
                    <div key={stage.key} className="absolute top-4 z-[3] w-28 -translate-x-1/2 text-center" style={{ left: `${(STAGE_X[stageIndex] / CHART_WIDTH) * 100}%` }}>
                      <span className="mx-auto mb-1.5 block h-0.5 w-7 rounded-full" style={{ background: STAGE_COLORS[stageIndex] }} aria-hidden="true" />
                      <strong className="block text-sm font-semibold text-[var(--foreground)]">{stage.label}</strong>
                      <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--muted-foreground)]">{total.toLocaleString("ko-KR")} OPT · {share}%</span>
                    </div>
                  )
                })}

                {board.rows.map((row, rowIndex) => {
                  const owner = displayOwner(row.owner)
                  const y = ROW_START + rowIndex * ROW_GAP
                  const selected = activeOwner === rowIndex
                  const subdued = activeOwner !== null && !selected
                  return (
                    <div key={row.owner} className="contents">
                      <button
                        type="button"
                        className="absolute left-3 z-10 w-24 -translate-y-1/2 rounded-lg px-1.5 py-2 text-center outline-none transition-[opacity,background-color] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
                        style={{ top: y, opacity: subdued ? 0.32 : 1, background: selected ? `color-mix(in oklab, ${OWNER_COLORS[rowIndex % OWNER_COLORS.length]} 9%, transparent)` : "transparent" }}
                        aria-label={`${owner} 레인 · ${row.total} OPT`}
                        onPointerEnter={() => setActiveOwner(rowIndex)}
                        onPointerLeave={() => setActiveOwner(null)}
                        onFocus={() => setActiveOwner(rowIndex)}
                        onBlur={() => setActiveOwner(null)}
                      >
                        <span className="flex items-center justify-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: OWNER_COLORS[rowIndex % OWNER_COLORS.length] }} aria-hidden="true" /><strong className="truncate text-sm font-semibold text-[var(--foreground)]">{owner}</strong></span>
                        <span className="mt-1 block text-[9px] tabular-nums text-[var(--muted-foreground)]">{row.total.toLocaleString("ko-KR")} OPT</span>
                      </button>

                      {row.cells.map((cell, stageIndex) => (
                        <FlowNode
                          key={cell.stageKey}
                          cell={cell}
                          owner={owner}
                          ownerIndex={rowIndex}
                          stageIndex={stageIndex}
                          x={STAGE_X[stageIndex]}
                          y={y}
                          maxCell={board.maxCell}
                          inView={inView}
                          onActivate={() => setActiveOwner(rowIndex)}
                          onDeactivate={() => setActiveOwner(null)}
                          onOpen={() => setSelectedProcess({ owner, stageIndex, cell })}
                        />
                      ))}

                      <div className="absolute right-6 z-[3] -translate-y-1/2 text-right" style={{ top: y, opacity: subdued ? 0.32 : 1 }}>
                        <strong className="block text-sm font-bold tabular-nums text-[var(--foreground)]">{row.total.toLocaleString("ko-KR")}</strong>
                        <span className="text-[8px] font-semibold text-[var(--muted-foreground)]">TOTAL</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/65 px-5 py-3 text-xs text-[var(--muted-foreground)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="차트 범례">
              <span>노드 크기 = OPT 밀도</span>
              {(["normal", "soon", "danger"] as const).map((urgency) => <span key={urgency} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: URGENCY_COLORS[urgency] }} aria-hidden="true" />{{ normal: "정상", soon: "임박 D-7", danger: "오늘·지연" }[urgency]}</span>)}
            </div>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(selectedProcess)} onOpenChange={(open) => { if (!open) setSelectedProcess(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selectedProcess?.owner} · {selectedStage?.label} 옵션</DialogTitle>
            <DialogDescription>
              {selectedProcess ? `${selectedProcess.cell.groups.length.toLocaleString("ko-KR")}개 스타일 · ${selectedProcess.cell.count.toLocaleString("ko-KR")} OPT · ${urgencyText(selectedProcess.cell)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-3">
            <div className="max-h-[52vh] divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
              {selectedProcess?.cell.groups.map((group) => (
                <div key={group.styleNo} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-[var(--foreground)]">{group.styleNo}</strong>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(group.opts.length ? group.opts : ["미기재"]).map((opt) => (
                        <span key={opt} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--foreground)]">OPT {opt}</span>
                      ))}
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-xs font-medium text-[var(--muted-foreground)]">{dueLabel(group)}</span>
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              disabled={!selectedRecord}
              onClick={() => {
                if (!selectedRecord) return
                setSelectedProcess(null)
                onSelect(selectedRecord)
              }}
            >
              전체보기
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
