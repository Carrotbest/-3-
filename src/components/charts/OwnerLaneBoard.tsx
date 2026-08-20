import { useEffect, useMemo, useState } from "react"

import {
  BOARD_STAGES,
  ownerLaneBoard,
  statusOf,
  type LaneCell,
  type LaneStyleGroup,
  type LaneUrgency,
} from "@/data/derive"
import { daysLeft } from "@/data/format"
import type { DevRecord } from "@/data/schema"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface OwnerLaneBoardProps {
  rows: readonly DevRecord[]
  today?: Date
  onSelect: (record: DevRecord) => void
}

interface CellSelection {
  owner: string
  stageKey: string
}

const URGENCY_DOT: Record<LaneUrgency, string> = {
  normal: "bg-[var(--status-normal)]",
  soon: "bg-[var(--status-soon)]",
  danger: "bg-[var(--status-danger)]",
  done: "bg-[var(--status-done)]",
}

const NORMAL_DENSITY = [
  "bg-[color-mix(in_oklab,var(--status-normal)_7%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-normal)_13%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-normal)_20%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-normal)_28%,var(--card))]",
]

const DONE_DENSITY = [
  "bg-[color-mix(in_oklab,var(--status-done)_7%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-done)_13%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-done)_20%,var(--card))]",
  "bg-[color-mix(in_oklab,var(--status-done)_28%,var(--card))]",
]

function densityClass(cell: LaneCell, maxCell: number): string {
  if (!cell.count) return ""
  if (cell.urgency === "danger") return "bg-[color-mix(in_oklab,var(--status-danger)_18%,var(--card))]"
  if (cell.urgency === "soon") return "bg-[color-mix(in_oklab,var(--status-soon)_22%,var(--card))]"
  const level = Math.min(3, Math.max(0, Math.ceil((cell.count / Math.max(1, maxCell)) * 4) - 1))
  return (cell.urgency === "done" ? DONE_DENSITY : NORMAL_DENSITY)[level]
}

function dueLabel(group: LaneStyleGroup): string {
  if (group.urgency === "done") return "완료"
  if (group.dayOffset === null) return "납기 미기재"
  if (group.dayOffset < 0) return `D+${Math.abs(group.dayOffset)}`
  if (group.dayOffset === 0) return "오늘 마감"
  return `D-${group.dayOffset}`
}

function groupLabel(group: LaneStyleGroup, owner: string): string {
  const options = group.opts.length ? group.opts.join("·") : "미기재"
  return `${group.styleNo} · OPT ${options} · ${owner} · ${dueLabel(group)}`
}

function LaneChip({ group, owner, onSelect }: { group: LaneStyleGroup; owner: string; onSelect: (record: DevRecord) => void }) {
  const label = groupLabel(group, owner)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold text-[var(--foreground)] shadow-sm outline-none transition-[transform,box-shadow,border-color] hover:scale-105 hover:border-[var(--ring)] hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
          aria-label={label}
          onClick={() => onSelect(group.records[0])}
        >
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", URGENCY_DOT[group.urgency])} />
          <span>{group.records.length}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function OwnerLaneBoard({ rows, today = new Date(), onSelect }: OwnerLaneBoardProps) {
  const board = useMemo(() => ownerLaneBoard(rows, today), [rows, today])
  const [selection, setSelection] = useState<CellSelection | null>(null)

  useEffect(() => {
    if (!selection) return
    const selectedRow = board.rows.find((row) => row.owner === selection.owner)
    const selectedCell = selectedRow?.cells.find((cell) => cell.stageKey === selection.stageKey)
    if (!selectedCell?.count) setSelection(null)
  }, [board, selection])

  const busiest = board.rows.reduce<(typeof board.rows)[number] | null>((current, row) =>
    !current || row.total > current.total ? row : current,
  null)
  const dangerCount = rows.filter((record) => {
    const status = statusOf(record, today)
    return status !== "done" && (status === "late" || daysLeft(record.dueDate, today) === 0)
  }).length
  const insight = [
    busiest && busiest.total ? `${busiest.owner} ${busiest.total.toLocaleString("ko-KR")}건` : "",
    dangerCount ? `오늘·지연 ${dangerCount.toLocaleString("ko-KR")}건` : "",
  ].filter(Boolean).join(" · ")
  const laneRows = selection ? board.rows.filter((row) => row.owner === selection.owner) : board.rows

  const toggleCell = (owner: string, stageKey: string) => {
    setSelection((current) => current?.owner === owner && current.stageKey === stageKey ? null : { owner, stageKey })
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4 p-4">
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]" aria-labelledby="owner-bottleneck-title">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 id="owner-bottleneck-title" className="text-sm font-semibold text-[var(--foreground)]">병목 히트맵</h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">셀을 선택하면 아래 담당자 레인이 해당 공정으로 좁아집니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">담당자와 공정별 개발 건수 병목 히트맵</caption>
              <thead>
                <tr className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <th scope="col" className="sticky left-0 z-10 min-w-28 border-b border-r border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-left font-medium">담당자</th>
                  {BOARD_STAGES.map((stage) => <th key={stage.key} scope="col" className="min-w-24 border-b border-r border-[var(--border)] px-3 py-2 text-center font-medium">{stage.label}</th>)}
                  <th scope="col" className="min-w-20 border-b border-[var(--border)] px-3 py-2 text-center font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.owner}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left font-semibold text-[var(--foreground)]">{row.owner}</th>
                    {row.cells.map((cell) => {
                      const pressed = selection?.owner === row.owner && selection.stageKey === cell.stageKey
                      const stage = BOARD_STAGES.find((item) => item.key === cell.stageKey)!
                      return (
                        <td key={cell.stageKey} className="border-b border-r border-[var(--border)] p-1 text-center">
                          {cell.count ? (
                            <button
                              type="button"
                              aria-label={`${row.owner} · ${stage.label} · ${cell.count}건`}
                              aria-pressed={pressed}
                              onClick={() => toggleCell(row.owner, cell.stageKey)}
                              className={cn(
                                "flex min-h-9 w-full items-center justify-center rounded-[calc(var(--radius)-2px)] px-2 font-semibold text-[var(--foreground)] outline-none transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none",
                                densityClass(cell, board.maxCell),
                                pressed && "ring-2 ring-[var(--ring)]",
                              )}
                            >
                              {cell.count.toLocaleString("ko-KR")}
                            </button>
                          ) : <span className="block min-h-9" aria-label={`${row.owner} · ${stage.label} · 0건`} />}
                        </td>
                      )
                    })}
                    <td className="border-b border-[var(--border)] px-3 py-2 text-center font-semibold text-[var(--foreground)]">{row.total.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--muted)] font-semibold text-[var(--foreground)]">
                  <th scope="row" className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-left">공정 합계</th>
                  {board.stageTotals.map((total, index) => <td key={BOARD_STAGES[index].key} className="border-r border-[var(--border)] px-3 py-2 text-center">{total.toLocaleString("ko-KR")}</td>)}
                  <td className="px-3 py-2 text-center">{board.total.toLocaleString("ko-KR")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {insight ? <p className="border-t border-[var(--border)] px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">{insight}</p> : null}
        </section>

        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]" aria-labelledby="owner-lane-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h3 id="owner-lane-title" className="text-sm font-semibold text-[var(--foreground)]">담당자 레인</h3>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">같은 스타일의 OPT를 하나의 칩으로 묶었습니다.</p>
            </div>
            {selection ? (
              <button type="button" onClick={() => setSelection(null)} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]">
                {selection.owner} · {BOARD_STAGES.find((stage) => stage.key === selection.stageKey)?.label} 선택 해제
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">담당자별 공정 레인과 스타일 OPT 묶음</caption>
              <thead>
                <tr className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                  <th scope="col" className="sticky left-0 z-10 min-w-28 border-b border-r border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-left font-medium">담당자</th>
                  {BOARD_STAGES.map((stage) => <th key={stage.key} scope="col" className="min-w-36 border-b border-r border-[var(--border)] px-3 py-2 text-center font-medium">{stage.label}</th>)}
                  <th scope="col" className="min-w-20 border-b border-[var(--border)] px-3 py-2 text-center font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {laneRows.map((row) => {
                  const selectedCellCount = selection
                    ? row.cells.find((cell) => cell.stageKey === selection.stageKey)?.count ?? 0
                    : row.total
                  return (
                    <tr key={row.owner}>
                      <th scope="row" className="sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left font-semibold text-[var(--foreground)]">{row.owner}</th>
                      {row.cells.map((cell) => {
                        const stage = BOARD_STAGES.find((item) => item.key === cell.stageKey)!
                        const groups = selection?.stageKey === cell.stageKey || !selection ? cell.groups : []
                        return (
                          <td key={cell.stageKey} aria-label={`${row.owner} · ${stage.label} · ${groups.reduce((sum, group) => sum + group.records.length, 0)}건`} className="h-14 border-b border-r border-[var(--border)] px-2 py-2 align-middle">
                            {groups.length ? <div className="flex flex-wrap justify-center gap-1.5">{groups.map((group) => <LaneChip key={group.styleNo} group={group} owner={row.owner} onSelect={onSelect} />)}</div> : null}
                          </td>
                        )
                      })}
                      <td className="border-b border-[var(--border)] px-3 py-3 text-center font-semibold text-[var(--foreground)]">{selectedCellCount.toLocaleString("ko-KR")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted-foreground)]" aria-label="긴급도 범례">
            {([
              ["normal", "정상"],
              ["soon", "임박 D-7"],
              ["danger", "오늘·지연"],
              ["done", "완료"],
            ] as const).map(([urgency, label]) => <span key={urgency} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-2.5 rounded-full", URGENCY_DOT[urgency])} />{label}</span>)}
            <span>숫자 = OPT 수</span>
          </div>
        </section>
      </div>
    </TooltipProvider>
  )
}
