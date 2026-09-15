import { useMemo } from "react"

import type { FabricLedgerItem } from "@/data/fabric-ledger"
import { RACK_LEVELS, RACK_ROW_ORDER, RACK_ROWS, RACK_SLOTS } from "@/data/warehouse-rack"

interface RackMapProps {
  /** 창고보관 상태 원단. 다른 상태는 호출부에서 거른다. */
  items: readonly FabricLedgerItem[]
  /** 칸을 누르면 그 번호로 창고보관 목록을 연다. 빈 문자열은 Rack No. 미지정 원단이다. */
  onOpenSlot: (rackNo: string) => void
}

interface SlotStat {
  count: number
  yds: number
  items: FabricLedgerItem[]
}

const ACCENT = "#059669"

const formatYds = (value: number): string => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })

/**
 * 통합원단부 전용 rack 2D 배치도. 칸마다 원단 수와 보유 yds를 색 농도로 보여 빈 칸이 바로 보이게 한다.
 * 위치는 `warehouse-rack.ts`의 `RACK_SLOTS`만 읽는다. 화면 상태를 갖지 않아 다른 경로로 옮겨도 그대로 쓴다.
 */
export function RackMap({ items, onOpenSlot }: RackMapProps) {
  const { bySlot, unassigned, outside, maxYds } = useMemo(() => {
    const map = new Map<string, SlotStat>(RACK_SLOTS.map((slot) => [slot.id, { count: 0, yds: 0, items: [] }]))
    const missing: FabricLedgerItem[] = []
    const unknown: FabricLedgerItem[] = []
    for (const item of items) {
      if (!item.rackNo) { missing.push(item); continue }
      const stat = map.get(item.rackNo)
      if (!stat) { unknown.push(item); continue }
      stat.count += 1
      stat.yds += Math.max(0, item.balance ?? item.yds ?? 0)
      stat.items.push(item)
    }
    const max = Math.max(0, ...[...map.values()].map((stat) => stat.yds))
    return { bySlot: map, unassigned: missing, outside: unknown, maxYds: max }
  }, [items])

  const usedSlots = [...bySlot.values()].filter((stat) => stat.count > 0).length
  const totalSlots = RACK_SLOTS.length

  const fillFor = (stat: SlotStat): { background: string; strong: boolean } => {
    if (!stat.count) return { background: "var(--card)", strong: false }
    // 원단은 있는데 재고를 안 적었으면 가장 옅은 단계로 둔다.
    const ratio = maxYds > 0 ? stat.yds / maxYds : 0
    const pct = Math.round(16 + ratio * 64)
    return { background: `color-mix(in srgb, ${ACCENT} ${pct}%, var(--card))`, strong: pct >= 52 }
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-t-4 border-[var(--border)] bg-[var(--card)]" style={{ borderTopColor: ACCENT }}>
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] px-3 py-2 text-xs">
      <span className="font-medium">Rack 배치도</span>
      <span className="text-[var(--muted-foreground)]">사용 칸 <strong className="tabular-nums text-[var(--foreground)]">{usedSlots}</strong>/{totalSlots}</span>
      <span className="text-[var(--muted-foreground)]">빈 칸 <strong className="tabular-nums text-[var(--foreground)]">{totalSlots - usedSlots}</strong></span>
      <button type="button" disabled={!unassigned.length} onClick={() => onOpenSlot("")} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted-foreground)] enabled:hover:bg-[var(--muted)] disabled:opacity-50" title="Rack No.가 비어 있는 창고보관 원단 목록으로 이동">
        Rack No. 미지정 <strong className={`tabular-nums ${unassigned.length ? "text-[var(--destructive)]" : "text-[var(--foreground)]"}`}>{unassigned.length}</strong>건
      </button>
      {outside.length ? <span className="text-[var(--warning)]" title={outside.map((item) => `${item.storageNo} ${item.rackNo}`).join("\n")}>규칙 밖 번호 {outside.length}건</span> : null}
      <span className="ml-auto flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
        <span className="inline-block size-3 rounded-sm border border-dashed border-[var(--border)] bg-[var(--card)]" />빈 칸
        <span className="inline-block h-3 w-16 rounded-sm" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${ACCENT} 16%, var(--card)), ${ACCENT})` }} />보유 yds 적음, 많음
      </span>
    </div>

    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="flex min-w-max flex-col gap-6">
        {RACK_ROW_ORDER.map((row) => {
          const racks = RACK_ROWS[row]
          return <section key={row} aria-label={`${row}열`} className="flex gap-3">
            <div className="flex w-10 shrink-0 flex-col">
              <div className="flex h-6 items-center text-sm font-semibold">{row}열</div>
              {Array.from({ length: RACK_LEVELS }, (_, level) => <div key={level} className="flex h-16 items-center text-[10px] text-[var(--muted-foreground)]">{level + 1}칸{level === 0 ? "(위)" : ""}</div>)}
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${racks}, 5.5rem)` }}>
              {Array.from({ length: racks }, (_, rackIndex) => {
                const rack = rackIndex + 1
                return <div key={rack} className="flex flex-col gap-1">
                  <div className="flex h-5 items-center justify-center font-mono text-[11px] text-[var(--muted-foreground)]">{row}-{rack}</div>
                  {Array.from({ length: RACK_LEVELS }, (_, levelIndex) => {
                    const id = `${row}-${rack}-${levelIndex + 1}`
                    const stat = bySlot.get(id) ?? { count: 0, yds: 0, items: [] }
                    const fill = fillFor(stat)
                    const preview = stat.items.slice(0, 8).map((item) => `${item.storageNo || "번호 없음"} ${item.styleNo || item.flNo}`).join("\n")
                    const more = stat.items.length > 8 ? `\n외 ${stat.items.length - 8}건` : ""
                    return <button
                      key={id}
                      type="button"
                      onClick={() => onOpenSlot(id)}
                      aria-label={stat.count ? `${id} 원단 ${stat.count}건, ${formatYds(stat.yds)}yds` : `${id} 빈 칸`}
                      title={stat.count ? `${id}\n${preview}${more}` : `${id} 빈 칸`}
                      className={`flex h-[3.75rem] flex-col items-center justify-center rounded-md border font-mono transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${stat.count ? "border-transparent" : "border-dashed border-[var(--border)]"}`}
                      style={{ background: fill.background, color: fill.strong ? "#ffffff" : undefined }}
                    >
                      {stat.count
                        ? <>
                          <span className="text-sm font-semibold leading-none tabular-nums">{stat.count}건</span>
                          <span className={`mt-1 text-[10px] leading-none tabular-nums ${fill.strong ? "text-white/85" : "text-[var(--muted-foreground)]"}`}>{formatYds(stat.yds)}yds</span>
                        </>
                        : <span className="text-[10px] text-[var(--muted-foreground)]">빈 칸</span>}
                    </button>
                  })}
                </div>
              })}
            </div>
          </section>
        })}
      </div>
    </div>
    <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">칸을 누르면 그 칸에 보관한 원단 목록으로 이동합니다. yds는 출고를 뺀 잔량 기준입니다. 칸 번호는 위층부터 1, 2, 3입니다.</div>
  </div>
}
