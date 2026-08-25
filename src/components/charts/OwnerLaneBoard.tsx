import { useMemo } from "react"

import {
  BOARD_STAGES,
  ownerLaneBoard,
  statusOf,
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
  /** 특정 담당자 이름을 화면 표시용으로 치환합니다(예: 퇴사자 익명화). 집계 로직에는 영향 없음. */
  ownerAliases?: Record<string, string>
}

const URGENCY_DOT: Record<LaneUrgency, string> = {
  normal: "bg-[var(--status-normal)]",
  soon: "bg-[var(--status-soon)]",
  danger: "bg-[var(--status-danger)]",
  done: "bg-[var(--status-done)]",
}

const STAGE_ACCENTS = [
  "from-[var(--gradient-1)] to-[var(--chart-4)]",
  "from-[var(--chart-2)] to-[var(--gradient-2)]",
  "from-[var(--chart-3)] to-[var(--gradient-1)]",
  "from-[var(--chart-4)] to-[var(--gradient-3)]",
] as const

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
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/80 bg-white/68 px-2 text-xs font-semibold text-[var(--foreground)] shadow-[0_5px_14px_-10px_rgba(15,23,42,0.2)] outline-none backdrop-blur transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:scale-105 hover:border-white hover:shadow-[0_9px_18px_-10px_rgba(15,23,42,0.28)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none"
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

export function OwnerLaneBoard({ rows, today = new Date(), onSelect, ownerAliases }: OwnerLaneBoardProps) {
  const board = useMemo(() => ownerLaneBoard(rows, today), [rows, today])
  const displayOwner = (owner: string) => ownerAliases?.[owner] ?? owner

  const urgencyCounts = useMemo(() => rows.reduce((counts, record) => {
    const status = statusOf(record, today)
    if (status === "done") { counts.done += 1; return counts }
    const remaining = daysLeft(record.dueDate, today)
    if (status === "late" || remaining === 0) counts.danger += 1
    else if (remaining !== null && remaining >= 1 && remaining <= 7) counts.soon += 1
    else counts.normal += 1
    return counts
  }, { normal: 0, soon: 0, danger: 0, done: 0 }), [rows, today])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative space-y-4 p-4">
        <section className="overflow-hidden rounded-[11px] border border-white/75 bg-white/48 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.18)] backdrop-blur" aria-labelledby="owner-lane-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/70 bg-white/36 px-4 py-3">
            <div>
              <h3 id="owner-lane-title" className="text-sm font-semibold text-[var(--foreground)]">담당자 레인</h3>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">같은 스타일의 OPT를 하나의 칩으로 묶었습니다. 담당별·공정별 합계를 함께 표시합니다.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">담당자별 공정 레인과 스타일 OPT 묶음, 담당별·공정별 합계</caption>
              <thead>
                <tr className="bg-white/48 text-[var(--muted-foreground)] backdrop-blur">
                  <th scope="col" className="sticky left-0 z-10 min-w-28 border-b border-r border-white/70 bg-white/78 px-3 py-3 text-left font-medium">담당자</th>
                  {BOARD_STAGES.map((stage, index) => <th key={stage.key} scope="col" className="relative min-w-36 border-b border-r border-white/70 px-3 py-3 text-center font-medium"><span aria-hidden="true" className={`absolute inset-x-8 top-0 h-0.5 rounded-full bg-gradient-to-r ${STAGE_ACCENTS[index % STAGE_ACCENTS.length]}`} />{stage.label}</th>)}
                  <th scope="col" className="min-w-20 border-b border-white/70 px-3 py-3 text-center font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => {
                  const owner = displayOwner(row.owner)
                  return (
                  <tr key={row.owner} className="transition-colors duration-200 hover:bg-white/45">
                    <th scope="row" className="sticky left-0 z-10 border-b border-b-[rgba(15,23,42,0.12)] border-r border-r-white/65 bg-white/82 px-3 py-3 text-left font-semibold text-[var(--foreground)] backdrop-blur">{owner}</th>
                    {row.cells.map((cell) => {
                      const stage = BOARD_STAGES.find((item) => item.key === cell.stageKey)!
                      return (
                        <td key={cell.stageKey} aria-label={`${owner} · ${stage.label} · ${cell.count}건`} className="h-14 border-b border-b-[rgba(15,23,42,0.12)] border-r border-r-white/60 px-2 py-2 align-middle">
                          {cell.groups.length ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex flex-wrap justify-center gap-1.5">{cell.groups.map((group) => <LaneChip key={group.styleNo} group={group} owner={owner} onSelect={onSelect} />)}</div>
                              <span className="text-[11px] font-medium tabular-nums text-[var(--muted-foreground)]">{cell.count.toLocaleString("ko-KR")}건</span>
                            </div>
                          ) : null}
                        </td>
                      )
                    })}
                    <td className="border-b border-b-[rgba(15,23,42,0.12)] px-3 py-3 text-center font-semibold text-[var(--foreground)]">{row.total.toLocaleString("ko-KR")}</td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-white/55 font-semibold text-[var(--foreground)] backdrop-blur">
                  <th scope="row" className="sticky left-0 z-10 border-r border-white/70 bg-white/82 px-3 py-2 text-left">공정 합계</th>
                  {board.stageTotals.map((total, index) => <td key={BOARD_STAGES[index].key} className="border-r border-white/70 px-3 py-2 text-center tabular-nums">{total.toLocaleString("ko-KR")}</td>)}
                  <td className="px-3 py-2 text-center tabular-nums">{board.total.toLocaleString("ko-KR")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/70 bg-white/38 px-4 py-3 text-xs text-[var(--muted-foreground)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="긴급도 범례">
              {([
                ["normal", "정상"],
                ["soon", "임박 D-7"],
                ["danger", "오늘·지연"],
                ["done", "완료"],
              ] as const).map(([urgency, label]) => <span key={urgency} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-2.5 rounded-full", URGENCY_DOT[urgency])} />{label}</span>)}
              <span>숫자 = OPT 수</span>
            </div>
            <p className="font-medium text-[var(--foreground)]">총 정상 {urgencyCounts.normal.toLocaleString("ko-KR")}건 · 지연 {urgencyCounts.danger.toLocaleString("ko-KR")}건</p>
          </div>
        </section>
      </div>
    </TooltipProvider>
  )
}
