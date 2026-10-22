import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Droplets,
  FlaskConical,
  Gauge,
  History,
  LayoutGrid,
  RotateCcw,
  Ruler,
  Search,
  ShieldCheck,
  Table2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { GROUP_FIGURES } from "@/components/protocol/TechFigures"
import { AnimatedNumber, MotionSection, RddaMotionContext } from "@/components/rdda/motion"
import { useScreenAccess } from "@/data/auth"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { displaySummaryOf, titleOf, type ReferenceItem } from "@/data/reference-schema"
import { useBuyerProtocols } from "@/data/references"
import {
  applyApprovedReviews,
  dismissReviewBatch,
  isStale,
  liveValue,
  setReviewDecision,
  useProtocolReviews,
  type ReviewBatch,
  type ReviewDecision,
  type ReviewItem,
} from "@/data/protocol-review"
import {
  isNotApplicable,
  methodKey,
  useProtocolMatrix,
  type ProtocolBuyer,
  type ProtocolDiff,
  type ProtocolGroup,
  type ProtocolGroupId,
  type ProtocolRevision,
  type ProtocolTest,
  type ProtocolVerification,
} from "@/data/protocol-matrix"
import { FolderCard, FolderDialog, ReferenceDialog, type FolderAccent, type FolderGroup } from "@/routes/TechnicalReferences"

type TabId = "matrix" | "buyer" | "revisions" | "manuals" | "review"
type PendingDiff = ProtocolDiff & { revDate: string }

const TAB_ITEMS: Array<{ id: TabId; no: string; label: string; hint: string; icon: LucideIcon }> = [
  { id: "matrix", no: "01", label: "MATRIX", hint: "기준표", icon: Table2 },
  { id: "buyer", no: "02", label: "BY BUYER", hint: "바이어별", icon: Users },
  { id: "revisions", no: "03", label: "REVISIONS", hint: "개정 이력", icon: History },
  { id: "manuals", no: "04", label: "SOURCE MANUALS", hint: "원문", icon: BookOpen },
  { id: "review", no: "05", label: "REVIEW", hint: "검토 대기", icon: ClipboardCheck },
]

const BUYER_ALL = "전 바이어"
const manualAccent: FolderAccent = { color: "var(--ref-cat-5)", label: "바이어 시험 기준", sortByDate: false }

/* 시험군별 아이콘과 색 슬롯. 순서가 곧 --ref-cat-1~4 순서다(/study와 같은 팔레트). */
const GROUP_ICONS: Record<ProtocolGroupId, LucideIcon> = { physical: Ruler, colorfastness: Droplets, safety: ShieldCheck, performance: Gauge }
const GROUP_SLOT: Record<ProtocolGroupId, number> = { physical: 1, colorfastness: 2, safety: 3, performance: 4 }
const groupColor = (id: ProtocolGroupId) => `var(--ref-cat-${GROUP_SLOT[id] ?? 1})`

/* 보조 버튼(검토 탭, 대화상자). 본문 필터는 아래 세그먼트와 드롭다운이 맡는다. */
const FILTER_BUTTON = "inline-flex h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 font-mono text-[11px] outline-none hover:border-[color-mix(in_oklab,var(--foreground)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
const GROUP_ON = "border-[var(--ref-cat-1)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)] text-[var(--ref-cat-1)]"
/* 머리말과 탭 바에만 쓰는 유리 표면. 표와 칸 안에는 절대 쓰지 않는다(CLAUDE.md 2026-10-07 사고). */
const GLASS = "border border-white/70 bg-[color-mix(in_oklab,var(--card)_76%,transparent)] backdrop-blur-xl"
const PILL = "inline-flex items-center gap-1.5 rounded-full border border-white/75 bg-white/55 px-2.5 py-1 text-[11px] backdrop-blur"

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR")
const compact = (value: string) => normalize(value).replace(/\s+/g, "")

/* 바이어 시그니처 색. 색 값은 데이터(buyers[].color)에서 온다. */
const buyerColor = (buyer?: Pick<ProtocolBuyer, "color">) => buyer?.color ?? "var(--muted-foreground)"
const buyerSelected = (buyer: Pick<ProtocolBuyer, "color">): CSSProperties => ({ borderColor: buyerColor(buyer), background: `color-mix(in oklab, ${buyerColor(buyer)} 10%, var(--card))` })
const buyerBar = (buyer?: Pick<ProtocolBuyer, "color">): CSSProperties => ({ boxShadow: `inset 3px 0 0 ${buyerColor(buyer)}` })

function Swatch({ buyer, size = 8 }: { buyer?: Pick<ProtocolBuyer, "color">; size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-full align-middle" style={{ width: size, height: size, background: buyerColor(buyer) }} />
}

function protocolBuyer(item: ReferenceItem) {
  return item.topic?.trim() || "바이어 미지정"
}

function latestModified(items: ReferenceItem[]) {
  return items.reduce((value, item) => item.modifiedAt > value ? item.modifiedAt : value, "")
}

function dateText(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("ko-KR")
}

function buildBuyerGroups(items: ReferenceItem[]): FolderGroup[] {
  const groups = new Map<string, FolderGroup>()
  items.forEach((item) => {
    const name = protocolBuyer(item)
    const current = groups.get(name)
    if (current) current.items.push(item)
    else groups.set(name, { name, description: "", items: [item] })
  })
  return [...groups.values()]
    .map((group) => ({ ...group, description: `최근 갱신 ${dateText(latestModified(group.items))}` }))
    .sort((a, b) => {
      if (a.name === BUYER_ALL) return -1
      if (b.name === BUYER_ALL) return 1
      return a.name.localeCompare(b.name, "ko-KR")
    })
}

function searchableTest(test: ProtocolTest) {
  return compact([
    test.name,
    test.korean,
    ...Object.values(test.cells).flat().flatMap((cell) => [cell.method, cell.requirement]),
  ].join(" "))
}

function firstLine(value: string) {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim()
}

function byTestBuyer<T extends { testId: string; buyerId: string }>(items: T[]) {
  const map = new Map<string, T[]>()
  items.forEach((item) => {
    const key = `${item.testId}::${item.buyerId}`
    map.set(key, [...(map.get(key) ?? []), item])
  })
  return map
}

/**
 * 규격별로 그 방법을 쓰는 **바이어 수**를 센다. 한 바이어가 소재별로 여러 조건을 가져도 한 번만 센다.
 * 화면 표시용 집계다. 데이터는 건드리지 않는다.
 */
function methodUsage(test: ProtocolTest, buyers: ProtocolBuyer[]) {
  const counts = new Map<string, number>()
  buyers.forEach((buyer) => {
    const keys = new Set((test.cells[buyer.id] ?? []).map((cell) => cell.method.trim() ? methodKey(cell.method) : "").filter(Boolean))
    keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))
  })
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** 가장 많이 쓰는 방법. 동률이면 모두 최다로 본다. */
function majorityKeys(usage: ReturnType<typeof methodUsage>) {
  const top = usage[0]?.count ?? 0
  return new Set(top ? usage.filter((item) => item.count === top).map((item) => item.key) : [])
}

function fieldLabel(field: ProtocolDiff["field"]) {
  return field === "method" ? "METHOD" : "REQUIREMENT"
}

function statusLabel(status: ProtocolRevision["status"]) {
  if (status === "current") return "최신"
  if (status === "superseded") return "과거 버전"
  if (status === "baseline") return "기준본"
  if (status === "merged") return "반영됨"
  return "미반영"
}

function TabNav({ active, onSelect, badges, tabs }: { active: TabId; onSelect: (tab: TabId) => void; badges?: Partial<Record<TabId, number>>; tabs: typeof TAB_ITEMS }) {
  return <nav role="tablist" aria-label="바이어 시험 기준 탭" className={`rounded-[12px] p-1.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] ${GLASS}`}>
    <div className={`grid grid-cols-2 gap-1.5 sm:grid-cols-3 ${tabs.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{tabs.map((tab) => {
      const selected = active === tab.id
      const badge = badges?.[tab.id] ?? 0
      const Icon = tab.icon
      return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => onSelect(tab.id)} className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[9px] border px-3 pb-2 pt-2.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected ? "border-[color-mix(in_oklab,var(--gradient-1)_35%,transparent)] bg-[linear-gradient(160deg,var(--card)_55%,color-mix(in_oklab,var(--gradient-1)_7%,var(--card)))] shadow-[0_7px_18px_-13px_rgba(15,23,42,0.4)]" : "border-[var(--border)]/60 bg-white/35 hover:border-[var(--border)] hover:bg-white/60"}`}>
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)] transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`} />
        <span className={`absolute left-2 top-2 text-[9px] font-semibold tabular-nums tracking-[0.08em] ${selected ? "text-[var(--gradient-1)]" : "text-[var(--muted-foreground)] opacity-60"}`}>{tab.no}</span>
        <span className="mt-1 flex w-full min-w-0 items-center justify-center gap-1.5 px-3">
          <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${selected ? "text-[var(--gradient-1)]" : "text-[var(--muted-foreground)] opacity-70"}`} />
          <strong className={`truncate text-[13px] font-semibold uppercase tracking-[0.06em] ${selected ? "text-[var(--foreground)]" : "text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"}`}>{tab.label}</strong>
        </span>
        <span className="mt-1.5 flex w-full min-w-0 items-center justify-end gap-1.5">
          <span aria-hidden="true" className={`size-1 shrink-0 rounded-full ${selected ? "bg-[var(--gradient-3)]" : "bg-[var(--muted-foreground)] opacity-40"}`} />
          <span className={`truncate rounded-full px-2 py-[1px] text-[10.5px] ${selected ? "bg-[color-mix(in_oklab,var(--gradient-1)_9%,transparent)] text-[color-mix(in_oklab,var(--gradient-1)_75%,var(--foreground))]" : "bg-[var(--muted)]/60 text-[var(--muted-foreground)]"}`}>{tab.hint}</span>
          {badge > 0 ? <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--warning)]">{badge}</span> : null}
        </span>
      </button>
    })}</div>
  </nav>
}

function HeaderBlock({ master, pendingCount }: { master: ProtocolRevision; pendingCount: number }) {
  const buyers = master.buyers ?? []
  const tests = master.tests ?? []
  return <header className={`relative z-20 rounded-[14px] px-4 py-3 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.4)] sm:px-5 sm:py-3.5 ${GLASS}`}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]"><span className="absolute inset-x-7 top-0 h-px bg-white/95" /><span className="absolute -right-16 -top-20 size-56 rounded-full bg-[var(--gradient-1)] opacity-[0.08] blur-3xl" /><span className="absolute -bottom-24 left-1/3 size-48 rounded-full bg-[var(--gradient-3)] opacity-[0.07] blur-3xl" /></div>
    <div className="relative flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] text-white shadow-[0_10px_22px_-10px_rgba(76,91,212,0.7)]"><FlaskConical className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0"><h1 className="text-lg font-semibold leading-tight tracking-tight">Buyer Test Protocol Matrix</h1><p className="text-xs text-[var(--muted-foreground)]">바이어별 원단 시험 방법과 기준 (취합본 기준)</p></div>
      </div>
      <MotionSection className="flex flex-wrap items-center gap-1.5">
        <span className={PILL}><Users className="size-3 text-[var(--muted-foreground)]" aria-hidden="true" />바이어 <strong className="font-semibold"><AnimatedNumber value={buyers.length} suffix="곳" /></strong></span>
        <span className={PILL}><Table2 className="size-3 text-[var(--muted-foreground)]" aria-hidden="true" />시험 <strong className="font-semibold"><AnimatedNumber value={tests.length} suffix="개" /></strong></span>
        <span className={`${PILL} tabular-nums text-[var(--muted-foreground)]`}>REV. {master.revDate}</span>
        {pendingCount > 0
          ? <span className={`${PILL} border-[color-mix(in_oklab,var(--warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,var(--card))] font-medium text-[var(--warning)]`}>미반영 개정 {pendingCount}건</span>
          : <span className={`${PILL} border-[color-mix(in_oklab,var(--ref-cat-1)_40%,transparent)] bg-[color-mix(in_oklab,var(--ref-cat-1)_10%,var(--card))] font-medium text-[var(--ref-cat-1)]`}><Check className="size-3" aria-hidden="true" />최신</span>}
      </MotionSection>
    </div>
  </header>
}

/**
 * 화면의 주인공. 칸 전체에 초록 음영을 깔고 초록 테두리로 띄운다.
 * 초록은 검증된 팔레트의 --ref-cat-3이다. 새 색을 만들지 않는다.
 */
function SearchHero({ query, onQuery, resultCount }: { query: string; onQuery: (value: string) => void; resultCount: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return <div className="rounded-[16px] bg-gradient-to-r from-[var(--ref-cat-3)] via-[color-mix(in_oklab,var(--ref-cat-3)_62%,var(--ref-cat-1))] to-[var(--ref-cat-3)] p-[2px] shadow-[0_18px_42px_-24px_color-mix(in_oklab,var(--ref-cat-3)_90%,transparent)]">
    <div className="flex items-center gap-3 rounded-[14px] bg-[var(--card)] px-2.5 py-2.5 sm:px-3">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--ref-cat-3)] to-[color-mix(in_oklab,var(--ref-cat-3)_55%,var(--ref-cat-1))] text-white shadow-[0_10px_20px_-10px_color-mix(in_oklab,var(--ref-cat-3)_95%,transparent)]"><Search className="size-5" /></span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label="시험 항목, 규격 코드, 기준값 검색"
        className="h-11 min-w-0 flex-1 border-0 bg-transparent text-base font-medium outline-none md:text-lg [&::-webkit-search-cancel-button]:appearance-none"
      />
      {query
        ? <><span className="shrink-0 text-xs tabular-nums text-[color-mix(in_oklab,var(--ref-cat-3)_80%,var(--foreground))]">시험 <strong className="font-semibold">{resultCount}</strong>개</span><button type="button" onClick={() => onQuery("")} aria-label="검색어 지우기" className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] outline-none hover:bg-[color-mix(in_oklab,var(--ref-cat-3)_14%,transparent)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><X className="size-4" /></button></>
        : <kbd className="mr-1.5 hidden shrink-0 rounded-[6px] border border-[color-mix(in_oklab,var(--ref-cat-3)_30%,transparent)] bg-[color-mix(in_oklab,var(--ref-cat-3)_10%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[color-mix(in_oklab,var(--ref-cat-3)_70%,var(--foreground))] sm:inline">/</kbd>}
    </div>
  </div>
}

/** 바이어 19곳을 모두 깐다. 고른 곳은 그 바이어 색으로 칠해 한눈에 몇 곳인지 보이게 한다. */
function BuyerChips({ buyers, selected, onToggle, onClear }: { buyers: ProtocolBuyer[]; selected: string[]; onToggle: (id: string) => void; onClear: () => void }) {
  return <div>
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]"><Users className="size-3.5" aria-hidden="true" />비교 바이어<span className="rounded-full bg-[var(--muted)]/60 px-1.5 tabular-nums">{selected.length ? `${selected.length}곳` : `전체 ${buyers.length}곳`}</span></span>
      <button type="button" onClick={onClear} disabled={!selected.length} className="inline-flex h-6 items-center rounded-full px-2 text-[11px] text-[var(--muted-foreground)] outline-none hover:bg-[var(--muted)]/60 hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[var(--ring)]">선택 해제</button>
    </div>
    <div className="flex flex-wrap gap-1.5">{buyers.map((buyer) => {
      const on = selected.includes(buyer.id)
      const color = buyerColor(buyer)
      return <button key={buyer.id} type="button" onClick={() => onToggle(buyer.id)} aria-pressed={on} title={buyer.name} className={`inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${on ? "font-semibold shadow-[0_4px_10px_-6px_rgba(15,23,42,0.5)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:border-[color-mix(in_oklab,var(--foreground)_28%,transparent)] hover:text-[var(--foreground)]"}`} style={on ? { borderColor: color, background: `color-mix(in oklab, ${color} 14%, var(--card))`, color: "var(--foreground)" } : undefined}>
        {on ? <Check className="size-3 shrink-0" style={{ color }} aria-hidden="true" /> : <Swatch buyer={buyer} size={7} />}
        <span className="truncate">{buyer.name}</span>
      </button>
    })}</div>
  </div>
}

function CellNotes({ verification, diffs, field }: { verification?: ProtocolVerification; diffs: PendingDiff[]; field: ProtocolDiff["field"] }) {
  const fieldDiffs = diffs.filter((diff) => diff.field === field)
  return <>
    {verification ? <p className="mt-1 text-[11px] text-[var(--warning)]">원문: {verification.source}  ({verification.doc})</p> : null}
    {fieldDiffs.map((diff, index) => <p key={`${diff.field}-${index}`} className="mt-1 text-[11px] text-[var(--ref-cat-1)]">미반영 수정 {diff.revDate}: {firstLine(diff.value)}</p>)}
  </>
}

function SpecTable({ test, buyers, verifications, diffs }: { test: ProtocolTest; buyers: ProtocolBuyer[]; verifications: Map<string, ProtocolVerification[]>; diffs: Map<string, PendingDiff[]> }) {
  const majority = majorityKeys(methodUsage(test, buyers))
  return <div className="overflow-x-auto rounded-[8px] border border-[var(--border)]">
    <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
      <thead className="bg-[var(--muted)]/35">
        <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          <th className="w-40 border-b border-r border-[var(--border)] px-3 py-2 font-normal">BUYER</th>
          <th className="w-64 border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST METHOD</th>
          <th className="border-b border-[var(--border)] px-3 py-2 font-normal">REQUIREMENT</th>
        </tr>
      </thead>
      <tbody>{buyers.map((buyer) => {
        const cells = test.cells[buyer.id]?.length ? test.cells[buyer.id] : [{ method: "", requirement: "" }]
        return cells.map((cell, index) => {
          const key = `${test.id}::${buyer.id}`
          const verification = verifications.get(key)?.[0]
          const pendingDiffs = diffs.get(key) ?? []
          const differentMethod = cell.method.trim() && majority.size && !majority.has(methodKey(cell.method))
          return <tr key={`${buyer.id}-${index}`} className={verification ? "bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]" : ""}>
            <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs" style={buyerBar(buyer)}>{index === 0 ? <span className="inline-flex items-center gap-2"><Swatch buyer={buyer} />{buyer.name}</span> : ""}</td>
            <td className={`border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs ${differentMethod ? "border-l-2 border-l-[var(--ref-cat-1)]" : ""}`} title={differentMethod ? "다수 방법과 다름" : undefined}>
              <span className={cell.method ? "" : "text-[var(--muted-foreground)]"}>{cell.method || "해당 없음"}</span>
              <CellNotes verification={verification} diffs={pendingDiffs} field="method" />
            </td>
            <td className="whitespace-pre-line border-t border-[var(--border)] px-3 py-2 align-top text-[13px]">
              <span className={isNotApplicable(cell.requirement) ? "text-[var(--muted-foreground)]" : ""}>{isNotApplicable(cell.requirement) ? "N/A" : cell.requirement || "해당 없음"}</span>
              <CellNotes verification={verification} diffs={pendingDiffs} field="requirement" />
            </td>
          </tr>
        })
      })}</tbody>
    </table>
  </div>
}

function MatrixTab({ master, pendingDiffs, query, onQuery }: { master: ProtocolRevision; pendingDiffs: PendingDiff[]; query: string; onQuery: (value: string) => void }) {
  const groups = master.groups ?? []
  const tests = master.tests ?? []
  const buyers = master.buyers ?? []
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([])
  /* 시험군이 네 세로줄로 서면 칸이 좁다. 바이어 비교표는 줄 안에 펼치지 않고 넓은 팝업으로 연다. */
  const [openTest, setOpenTest] = useState<ProtocolTest | null>(null)
  const selectedBuyerRows = selectedBuyers.length ? buyers.filter((buyer) => selectedBuyers.includes(buyer.id)) : buyers
  const needle = compact(query)
  const verifications = useMemo(() => byTestBuyer(master.verification ?? []), [master.verification])
  const diffs = useMemo(() => byTestBuyer(pendingDiffs), [pendingDiffs])
  const visibleTests = useMemo(() => tests.filter((test) => !needle || searchableTest(test).includes(needle)), [needle, tests])
  const visibleGroups = groups.map((group) => ({ group, items: visibleTests.filter((test) => test.group === group.id) })).filter(({ items }) => items.length > 0)
  const dirty = Boolean(query) || selectedBuyers.length > 0
  const resetAll = () => {
    onQuery("")
    setSelectedBuyers([])
  }

  return <div className="space-y-3">
    <div className="space-y-3 rounded-[18px] border border-[var(--border)] bg-[color-mix(in_oklab,var(--muted)_28%,var(--card))] p-3 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.55)] sm:p-3.5">
      <SearchHero query={query} onQuery={onQuery} resultCount={visibleTests.length} />
      <BuyerChips buyers={buyers} selected={selectedBuyers} onToggle={(id) => setSelectedBuyers((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onClear={() => setSelectedBuyers([])} />
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <p aria-live="polite" className="text-[11px] text-[var(--muted-foreground)]">
        시험 <strong className="text-xs font-semibold tabular-nums text-[var(--foreground)]">{visibleTests.length}</strong>개
        <span className="mx-1.5 opacity-40">|</span>
        항목을 누르면 바이어별 방법과 기준이 열립니다
        {selectedBuyers.length ? <><span className="mx-1.5 opacity-40">|</span>검색은 전 바이어, 비교는 {selectedBuyers.length}곳</> : null}
      </p>
      <button type="button" onClick={resetAll} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border bg-[var(--card)] px-3 text-[11px] font-medium shadow-sm outline-none transition-colors hover:bg-[var(--muted)]/50 focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${dirty ? "border-[color-mix(in_oklab,var(--ref-cat-3)_50%,transparent)] text-[color-mix(in_oklab,var(--ref-cat-3)_80%,var(--foreground))]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}><RotateCcw className="size-3.5" aria-hidden="true" />초기화</button>
    </div>

    <div className="grid items-start gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">{visibleGroups.map(({ group, items }, columnIndex) => {
      const Figure = GROUP_FIGURES[group.id]
      const color = groupColor(group.id)
      return <section key={group.id} className="min-w-0">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b-2 pb-2" style={{ borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }}>
          <span className="font-mono text-sm" style={{ color }}>§ {columnIndex + 1}</span>
          <h2 className="text-base font-semibold uppercase tracking-[0.08em]">{group.label}</h2>
          <span className="text-sm text-[var(--muted-foreground)]">{group.korean}</span>
          <span className="ml-auto font-mono text-[11px] text-[var(--muted-foreground)]">{items.length} ITEMS</span>
        </div>
        <figure className="mt-3">
          <div className="border border-[var(--border)] p-2 text-[var(--foreground)]/75"><Figure className="h-auto w-full" /></div>
          <figcaption className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">FIG. {columnIndex + 1}</figcaption>
        </figure>
        <div className="mt-3 border-t border-[var(--border)]">{items.map((test) => {
          const hasVerification = selectedBuyerRows.some((buyer) => verifications.has(`${test.id}::${buyer.id}`))
          return <button key={test.id} type="button" onClick={() => setOpenTest(test)} className="flex w-full items-start gap-2 border-b border-[var(--border)] px-2 py-2.5 text-left outline-none hover:bg-[var(--muted)]/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]">
            <span className="shrink-0 pt-px font-mono text-xs tabular-nums" style={{ color }}>{test.no}</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <strong className="font-semibold">{test.name}</strong>
              <span className="ml-1.5 text-xs text-[var(--muted-foreground)]">{test.korean}</span>
              {hasVerification ? <span className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--warning)] align-middle" title="원문 대조 불일치" /> : null}
            </span>
          </button>
        })}</div>
      </section>
    })}</div>
    {!visibleTests.length ? <div className="rounded-[14px] border border-dashed border-[var(--border)] px-5 py-16 text-center"><Search className="mx-auto size-6 text-[var(--muted-foreground)] opacity-50" aria-hidden="true" /><p className="mt-3 text-sm text-[var(--muted-foreground)]">검색 결과가 없습니다.</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">규격 코드(AATCC, ASTM, ISO)나 한글 시험명으로 찾아 보십시오.</p></div> : null}

    <Dialog open={Boolean(openTest)} onOpenChange={(open) => { if (!open) setOpenTest(null) }}>
      <DialogContent className="max-w-5xl">
        {openTest ? <>
          <DialogHeader className="pr-12">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tabular-nums" style={{ color: groupColor(openTest.group) }}>{openTest.no}</span>
              <span className="rounded-full bg-[var(--muted)]/60 px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">{groups.find((group) => group.id === openTest.group)?.korean ?? "-"}</span>
            </div>
            <DialogTitle className="text-xl leading-snug">{openTest.name}</DialogTitle>
            <DialogDescription>{openTest.korean}  비교 바이어 {selectedBuyerRows.length}곳</DialogDescription>
          </DialogHeader>
          <DialogBody><SpecTable test={openTest} buyers={selectedBuyerRows} verifications={verifications} diffs={diffs} /></DialogBody>
        </> : null}
      </DialogContent>
    </Dialog>
  </div>
}

function BuyerTab({ master, manuals, pendingDiffs, selectedBuyerId, onSelectBuyer, onManuals }: { master: ProtocolRevision; manuals: ReferenceItem[]; pendingDiffs: PendingDiff[]; selectedBuyerId: string; onSelectBuyer: (buyerId: string) => void; onManuals: (buyerId: string) => void }) {
  const buyers = master.buyers ?? []
  const tests = master.tests ?? []
  const groups = master.groups ?? []
  const selectedBuyer = buyers.find((buyer) => buyer.id === selectedBuyerId) ?? buyers[0] ?? null
  const pendingBuyer = master.pendingBuyers?.find((buyer) => `pending:${buyer.name}` === selectedBuyerId)
  const verifications = useMemo(() => byTestBuyer(master.verification ?? []), [master.verification])
  const diffs = useMemo(() => byTestBuyer(pendingDiffs), [pendingDiffs])
  const manualCount = selectedBuyer ? manuals.filter((item) => item.topic === selectedBuyer.manualTopic).length : 0

  return <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside className="h-fit space-y-1 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-1.5 lg:sticky lg:top-2">
      {buyers.map((buyer) => {
        const selected = selectedBuyer?.id === buyer.id && !pendingBuyer
        return <button key={buyer.id} type="button" onClick={() => onSelectBuyer(buyer.id)} aria-pressed={selected} className={`flex w-full items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${selected ? "" : "border-transparent hover:bg-[var(--muted)]/45"}`} style={selected ? buyerSelected(buyer) : undefined}>
          <Swatch buyer={buyer} size={9} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{buyer.name}</span><span className="block truncate font-mono text-[10px] text-[var(--muted-foreground)]">{buyer.lightSources.join(" / ") || "-"}</span></span>
          {selected ? <Check className="size-3.5 shrink-0" style={{ color: buyerColor(buyer) }} aria-hidden="true" /> : null}
        </button>
      })}
      {master.pendingBuyers?.map((buyer) => <button key={buyer.name} type="button" onClick={() => onSelectBuyer(`pending:${buyer.name}`)} className={`flex w-full items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left text-sm text-[var(--muted-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${selectedBuyerId === `pending:${buyer.name}` ? "border-[var(--ref-cat-1)] bg-[color-mix(in_oklab,var(--ref-cat-1)_7%,transparent)]" : "border-dashed border-[var(--border)] hover:bg-[var(--muted)]/45"}`}><span className="size-2.5 shrink-0 rounded-full border border-dashed border-[var(--muted-foreground)]" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{buyer.name}</span><span className="shrink-0 text-[10px]">미등재</span></button>)}
    </aside>
    <div className="min-w-0 space-y-5">
      {pendingBuyer ? <section className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-xl font-semibold">{pendingBuyer.name}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{pendingBuyer.note}</p>
        {pendingBuyer.answers?.length ? <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--muted)]/25 p-3"><p className="mb-2 text-sm font-medium">바이어 질의 회신</p>{pendingBuyer.answers.map((answer, index) => <div key={index} className="mb-3 last:mb-0"><p className="text-sm">Q. {answer.q}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">A. {answer.a}</p></div>)}</div> : null}
      </section> : null}
      {selectedBuyer && !pendingBuyer ? <section className="space-y-4">
        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]">
          <span aria-hidden="true" className="block h-1" style={{ background: buyerColor(selectedBuyer) }} />
          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-xl font-semibold"><Swatch buyer={selectedBuyer} size={12} />{selectedBuyer.name}</h2>
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)]/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]"><Droplets className="size-3" aria-hidden="true" />LIGHT SOURCE  {selectedBuyer.lightSources.join(" / ") || "-"}</p>
            </div>
            <button type="button" onClick={() => onManuals(selectedBuyer.id)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 text-sm outline-none hover:border-[color-mix(in_oklab,var(--foreground)_30%,transparent)] hover:bg-[var(--muted)]/40 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"><BookOpen className="size-3.5" aria-hidden="true" />원문 <strong className="font-semibold tabular-nums">{manualCount}</strong>건</button>
          </div>
          {selectedBuyer.notes?.length ? <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 p-4"><p className="mb-2 text-sm font-medium">바이어 질의 회신</p>{selectedBuyer.notes.map((note, index) => <div key={index} className="mb-3 last:mb-0"><p className="text-sm">Q. {note.q}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">A. {note.a}</p></div>)}</div> : null}
        </div>
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group.id] ?? LayoutGrid
          const color = groupColor(group.id)
          return <section key={group.id} className="space-y-2">
            <h3 className="flex items-center gap-2 border-b border-[var(--border)] pb-1.5 text-sm font-semibold"><Icon className="size-3.5" style={{ color }} aria-hidden="true" />{group.korean}<span className="font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{group.label}</span></h3>
            <div className="overflow-x-auto rounded-[8px] border border-[var(--border)]"><table className="w-full min-w-[720px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="w-20 border-b border-r border-[var(--border)] px-3 py-2 font-normal">NO.</th><th className="w-56 border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="w-56 border-b border-r border-[var(--border)] px-3 py-2 font-normal">METHOD</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">REQUIREMENT</th></tr></thead><tbody>
              {tests.filter((test) => test.group === group.id).map((test) => {
                const cells = test.cells[selectedBuyer.id]?.length ? test.cells[selectedBuyer.id] : [{ method: "", requirement: "" }]
                const key = `${test.id}::${selectedBuyer.id}`
                const verification = verifications.get(key)?.[0]
                const pendingCellDiffs = diffs.get(key) ?? []
                return cells.map((cell, index) => <tr key={`${test.id}-${index}`} className={verification ? "bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]" : ""}>
                  <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs">{index === 0 ? test.no : ""}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 align-top">{index === 0 ? <><p className="font-medium">{test.korean || test.name}</p><p className="font-mono text-[11px] text-[var(--muted-foreground)]">{test.name}</p></> : null}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs"><span className={cell.method ? "" : "text-[var(--muted-foreground)]"}>{cell.method || "해당 없음"}</span><CellNotes verification={verification} diffs={pendingCellDiffs} field="method" /></td><td className="whitespace-pre-line border-t border-[var(--border)] px-3 py-2 align-top"><span className={isNotApplicable(cell.requirement) ? "text-[var(--muted-foreground)]" : ""}>{isNotApplicable(cell.requirement) ? "N/A" : cell.requirement || "해당 없음"}</span><CellNotes verification={verification} diffs={pendingCellDiffs} field="requirement" /></td>
                </tr>)
              })}
            </tbody></table></div>
          </section>
        })}
      </section> : null}
    </div>
  </div>
}

function RevisionsTab({ master, revisions }: { master: ProtocolRevision; revisions: ProtocolRevision[] }) {
  const testsById = new Map((master.tests ?? []).map((test) => [test.id, test]))
  const buyersById = new Map((master.buyers ?? []).map((buyer) => [buyer.id, buyer]))
  const buyerName = (id: string) => { const buyer = buyersById.get(id); return buyer ? <span className="inline-flex items-center gap-2"><Swatch buyer={buyer} />{buyer.name}</span> : id }
  return <div className="space-y-4">{revisions.map((revision) => {
    const isMaster = revision.kind === "master"
    return <section key={revision.id} className="relative border-l border-[var(--border)] pl-5">
      <span className={`absolute -left-[5px] top-4 size-2.5 rounded-full border-2 border-[var(--ref-cat-1)] ${isMaster ? "bg-[var(--ref-cat-1)]" : "bg-[var(--card)]"}`} />
      <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]" style={!isMaster && revision.buyerScope ? buyerBar(buyersById.get(revision.buyerScope)) : undefined}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <span className="rounded-full bg-[var(--muted)]/50 px-2.5 py-0.5 font-mono text-[11px] tabular-nums">REV. {revision.revDate}</span>
          <h2 className="text-sm font-semibold">{revision.label}</h2>
          <span className="text-xs text-[var(--muted-foreground)]">{revision.sourceFile}</span>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium ${revision.status === "pending" ? "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[var(--warning)]" : "bg-[var(--muted)]/60 text-[var(--muted-foreground)]"}`}>{statusLabel(revision.status)}</span>
        </div>
        {isMaster ? <div className="p-4"><p className="mb-2 text-sm text-[var(--muted-foreground)]">취합본 값과 바이어 원문 매뉴얼이 다른 칸입니다. 원문 기준으로 확인이 필요합니다.</p><div className="overflow-x-auto rounded-[8px] border border-[var(--border)]"><table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">BUYER</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">취합본</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">원문</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">근거 문서</th></tr></thead><tbody>{(revision.verification ?? []).map((item, index) => <tr key={index}><td className="border-r border-t border-[var(--border)] px-3 py-2">{testsById.get(item.testId)?.no} {testsById.get(item.testId)?.name}</td><td className="border-r border-t border-[var(--border)] px-3 py-2" style={buyerBar(buyersById.get(item.buyerId))}>{buyerName(item.buyerId)}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{item.sheet}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{item.source}</td><td className="border-t border-[var(--border)] px-3 py-2">{item.doc}</td></tr>)}</tbody></table></div></div>
          : <div className="p-4">{revision.diffs?.length ? <div className="overflow-x-auto rounded-[8px] border border-[var(--border)]"><table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">FIELD</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">기준본</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">수정본</th></tr></thead><tbody>{revision.diffs.map((diff, index) => <tr key={index}><td className="border-r border-t border-[var(--border)] px-3 py-2">{testsById.get(diff.testId)?.no} {testsById.get(diff.testId)?.name}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 font-mono text-xs">{fieldLabel(diff.field)}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{diff.base}</td><td className="whitespace-pre-line border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)] px-3 py-2">{diff.value}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--muted-foreground)]">기준본과 차이 없음</p>}</div>}
      </div>
    </section>
  })}</div>
}

function nextReviewVersion(version?: string) {
  const [major = 1, minor = 0] = (version || "1.0").split(".").map(Number)
  return `${major}.${minor + 1}`
}

function reviewItemOrder(a: ReviewItem, b: ReviewItem, batch: ReviewBatch, latest: ProtocolRevision, testsById: Map<string, ProtocolTest>) {
  const rank = (item: ReviewItem) => {
    if (isStale(latest, batch, item)) return 3
    if (item.decision === "pending") return 0
    return item.decision === "approved" ? 1 : 2
  }
  return rank(a) - rank(b)
    || (testsById.get(a.testId)?.no ?? a.testId).localeCompare(testsById.get(b.testId)?.no ?? b.testId, undefined, { numeric: true })
    || a.variant - b.variant
    || (a.field === b.field ? 0 : a.field === "method" ? -1 : 1)
}

function ReviewBatchCard({ batch, latest, buyersById, testsById, onAction }: { batch: ReviewBatch; latest: ProtocolRevision; buyersById: Map<string, ProtocolBuyer>; testsById: Map<string, ProtocolTest>; onAction: () => void }) {
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [editingId, setEditingId] = useState("")
  const [editValue, setEditValue] = useState("")
  const buyer = buyersById.get(batch.buyerId)
  const open = batch.status === "open"
  const sortedItems = [...batch.items].sort((a, b) => reviewItemOrder(a, b, batch, latest, testsById))

  const decide = async (item: ReviewItem, decision: ReviewDecision, editedValue?: string) => {
    onAction()
    setBusy(true)
    setSaveError("")
    try {
      await setReviewDecision(batch, item.id, decision, editedValue)
      setEditingId("")
    } catch {
      setSaveError("판정을 저장하지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }

  const decideMany = async (items: ReviewItem[], decision: ReviewDecision) => {
    if (!items.length) return
    onAction()
    setBusy(true)
    setSaveError("")
    let working = batch
    try {
      for (const item of items) {
        await setReviewDecision(working, item.id, decision)
        working = { ...working, items: working.items.map((current) => current.id === item.id ? { ...current, decision, decidedAt: new Date().toISOString() } : current) }
      }
    } catch {
      setSaveError("판정을 저장하지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    if (!window.confirm("이 배치를 버립니다. 판정 기록은 남지만 반영 대상에서 빠집니다.")) return
    onAction()
    setBusy(true)
    setSaveError("")
    try {
      await dismissReviewBatch(batch)
    } catch {
      setSaveError("판정을 저장하지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }

  const highPending = batch.items.filter((item) => item.confidence === "high" && item.decision === "pending" && !isStale(latest, batch, item))
  const allPending = batch.items.filter((item) => item.decision === "pending")

  return <article className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]" style={buyerBar(buyer)}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold"><Swatch buyer={buyer} />{buyer?.name ?? batch.buyerId}</span>
      <span className="text-xs">{batch.sourceFile}</span>
      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">원문 {batch.sourceDate ?? "-"}</span>
      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">추출 {batch.extractedAt.slice(0, 10)} {batch.extractedBy}</span>
      <span className="font-mono text-[11px] text-[var(--muted-foreground)]">기준 Ver. {batch.baseVersion}</span>
      <span className="ml-auto">
        {open ? <button type="button" disabled={busy} onClick={() => void dismiss()} className={`${FILTER_BUTTON} w-auto disabled:opacity-40`}>배치 버리기</button> : null}
        {batch.status === "applied" ? <span className="text-xs text-[var(--ref-cat-1)]">Ver. {batch.appliedVersion}에 반영됨</span> : null}
        {batch.status === "dismissed" ? <span className="text-xs text-[var(--muted-foreground)]">버림</span> : null}
      </span>
    </div>
    {saveError ? <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--destructive)]">{saveError}</p> : null}
    {open ? <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-4 py-2">
      <button type="button" disabled={busy || !highPending.length} onClick={() => void decideMany(highPending, "approved")} className={`${FILTER_BUTTON} w-auto disabled:opacity-40`}>신뢰도 높음 모두 승인</button>
      <button type="button" disabled={busy || !allPending.length} onClick={() => void decideMany(allPending, "rejected")} className={`${FILTER_BUTTON} w-auto disabled:opacity-40`}>남은 칸 모두 거절</button>
    </div> : null}
    <div className="overflow-x-auto">
      <table className="table-fixed w-full min-w-[960px] border-collapse text-left text-[13px]">
        <colgroup><col style={{ width: 220 }} /><col style={{ width: 110 }} /><col /><col /><col style={{ width: 220 }} /><col style={{ width: 150 }} /></colgroup>
        <thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          <th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th>
          <th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">FIELD</th>
          <th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">현재 값</th>
          <th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">원문 값</th>
          <th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">근거</th>
          <th className="border-b border-[var(--border)] px-3 py-2 font-normal">판정</th>
        </tr></thead>
        <tbody>{sortedItems.map((item) => {
          const test = testsById.get(item.testId)
          const stale = isStale(latest, batch, item)
          const current = liveValue(latest, batch.buyerId, item)
          const proposed = item.editedValue ?? item.proposed
          return <tr key={item.id}>
            <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top">
              <p className="font-mono text-xs">{test ? `${test.no} ${test.name}` : item.testId}</p>
              {test ? <p className="text-xs text-[var(--muted-foreground)]">{test.korean}</p> : null}
              {item.variant > 0 ? <p className="font-mono text-[11px] text-[var(--muted-foreground)]">조건 {item.variant + 1}</p> : null}
            </td>
            <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs">{fieldLabel(item.field)}</td>
            <td className={`whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2 align-top ${stale ? "bg-[color-mix(in_oklab,var(--warning)_9%,transparent)]" : ""}`}>
              <span className={current ? "" : "text-[var(--muted-foreground)]"}>{current || "-"}</span>
              {stale ? <p className="mt-1 text-xs text-[var(--warning)]">추출 이후 기준표가 바뀌었습니다. 다시 추출하거나 거절하십시오.</p> : null}
            </td>
            <td className="whitespace-pre-line border-r border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)] px-3 py-2 align-top">
              {proposed}
              {item.editedValue !== undefined ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">수정함 (원문: {firstLine(item.proposed)})</p> : null}
            </td>
            <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top">
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">{item.page ? `p.${item.page}` : "-"}</p>
              {item.quote ? <p className="mt-1 line-clamp-4 text-xs" title={item.quote}>“{item.quote}”</p> : null}
              <p className={`mt-1 font-mono text-[10px] uppercase tracking-[0.14em] ${item.confidence === "low" ? "text-[var(--warning)]" : "text-[var(--muted-foreground)]"}`}>CONFIDENCE {item.confidence.toUpperCase()}</p>
              {item.note ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.note}</p> : null}
            </td>
            <td className="border-t border-[var(--border)] px-3 py-2 align-top">
              {open ? editingId === item.id ? <div className="space-y-2">
                <textarea rows={3} value={editValue} onChange={(event) => setEditValue(event.target.value)} disabled={busy} className="w-full rounded-[4px] border border-[var(--border)] bg-[var(--card)] p-2 text-[13px]" />
                <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void decide(item, "approved", editValue)} className={`${FILTER_BUTTON} disabled:opacity-40`}>저장</button><button type="button" disabled={busy} onClick={() => setEditingId("")} className={`${FILTER_BUTTON} disabled:opacity-40`}>취소</button></div>
              </div> : <div className="space-y-2">
                <button type="button" disabled={busy || stale} onClick={() => void decide(item, item.decision === "approved" ? "pending" : "approved")} className={`${FILTER_BUTTON} disabled:opacity-40 ${item.decision === "approved" ? GROUP_ON : ""}`}>승인</button>
                <button type="button" disabled={busy} onClick={() => void decide(item, item.decision === "rejected" ? "pending" : "rejected")} className={`${FILTER_BUTTON} disabled:opacity-40 ${item.decision === "rejected" ? "border-[var(--muted-foreground)] bg-[var(--muted)]/40" : ""}`}>거절</button>
                <button type="button" disabled={busy || stale} onClick={() => { onAction(); setEditingId(item.id); setEditValue(item.editedValue ?? item.proposed) }} className={`${FILTER_BUTTON} disabled:opacity-40`}>값 고쳐 승인</button>
              </div> : <span className="text-sm">{item.decision === "approved" ? "승인" : item.decision === "rejected" ? "거절" : "대기"}</span>}
            </td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </article>
}

function ReviewTab({ latest, batches, loading, error }: { latest: ProtocolRevision; batches: ReviewBatch[]; loading: boolean; error: string }) {
  const [pastOpen, setPastOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [label, setLabel] = useState("원문 매뉴얼 검토 반영")
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState("")
  const [notice, setNotice] = useState("")
  const buyersById = new Map((latest.buyers ?? []).map((buyer) => [buyer.id, buyer]))
  const testsById = new Map((latest.tests ?? []).map((test) => [test.id, test]))
  const openBatches = batches.filter((batch) => batch.status === "open")
  const pastBatches = batches.filter((batch) => batch.status !== "open")
  const openItems = openBatches.flatMap((batch) => batch.items.map((item) => ({ batch, item })))
  const pending = openItems.filter(({ batch, item }) => item.decision === "pending" && !isStale(latest, batch, item)).length
  const approved = openItems.filter(({ item }) => item.decision === "approved").length
  const rejected = openItems.filter(({ item }) => item.decision === "rejected").length
  const stale = openItems.filter(({ batch, item }) => isStale(latest, batch, item)).length
  const approvedReady = openItems.some(({ batch, item }) => item.decision === "approved" && !isStale(latest, batch, item))

  const openConfirm = () => {
    setNotice("")
    setApplyError("")
    setLabel("원문 매뉴얼 검토 반영")
    setConfirmOpen(true)
  }

  const apply = async () => {
    setApplying(true)
    setApplyError("")
    try {
      const result = await applyApprovedReviews(latest.id, openBatches.map((batch) => batch.id), label.trim() || "원문 매뉴얼 검토 반영")
      if (!result) {
        setApplyError("반영할 칸이 없습니다.")
        return
      }
      setNotice(`Ver. ${result.version} 반영 완료: ${result.applied}칸${result.skipped > 0 ? ` (기준표가 바뀐 ${result.skipped}칸 제외)` : ""}`)
      setConfirmOpen(false)
    } catch (caught) {
      setApplyError(caught instanceof Error && caught.message ? caught.message : "반영하지 못했습니다.")
    } finally {
      setApplying(false)
    }
  }

  const card = (batch: ReviewBatch) => <ReviewBatchCard key={batch.id} batch={batch} latest={latest} buyersById={buyersById} testsById={testsById} onAction={() => setNotice("")} />

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div><h2 className="text-sm font-semibold">원문 매뉴얼 검토</h2><p className="text-sm text-[var(--muted-foreground)]">원문에서 뽑은 값 중 현재 기준표와 다른 칸만 올라옵니다. 승인한 칸만 새 버전에 반영됩니다.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-[var(--muted)]/60 px-2.5 py-1">대기 <strong className="tabular-nums">{pending}</strong></span>
          <span className="rounded-full bg-[color-mix(in_oklab,var(--ref-cat-1)_10%,transparent)] px-2.5 py-1 text-[var(--ref-cat-1)]">승인 <strong className="tabular-nums">{approved}</strong></span>
          <span className="rounded-full bg-[var(--muted)]/60 px-2.5 py-1 text-[var(--muted-foreground)]">거절 <strong className="tabular-nums">{rejected}</strong></span>
          {stale > 0 ? <span className="rounded-full bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] px-2.5 py-1 text-[var(--warning)]">낡음 <strong className="tabular-nums">{stale}</strong></span> : null}
        </span>
        <button type="button" disabled={!approvedReady} onClick={openConfirm} className="inline-flex h-9 items-center rounded-[9px] border border-transparent bg-[var(--ref-cat-1)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">승인 칸 새 버전으로 반영</button>
      </div>
    </div>
    {notice ? <p className="text-sm text-[var(--ref-cat-1)]">{notice}</p> : null}
    {loading ? <p className="text-sm text-[var(--muted-foreground)]">검토 목록을 불러오는 중입니다.</p> : null}
    {!loading && error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}
    {!loading && !error && !batches.length ? <div className="rounded-[12px] border border-dashed border-[var(--border)] px-5 py-12 text-center text-[var(--muted-foreground)]"><p className="text-sm">검토할 원문 매뉴얼이 없습니다.</p><p className="mt-1 text-sm">새 매뉴얼을 Teams 바이어 폴더에 넣고 Claude Code에서 추출을 요청하면 여기에 올라옵니다.</p></div> : null}
    {!loading && !error && batches.length ? <>
      {openBatches.length ? <div className="space-y-4">{openBatches.map(card)}</div> : <p className="text-sm text-[var(--muted-foreground)]">열린 검토가 없습니다.</p>}
      {pastBatches.length ? <div className="space-y-4"><button type="button" onClick={() => setPastOpen((current) => !current)} className={`${FILTER_BUTTON} w-auto`}>지난 검토 {pastBatches.length}</button>{pastOpen ? <div className="space-y-4">{pastBatches.map(card)}</div> : null}</div> : null}
    </> : null}
    <Dialog open={confirmOpen} onOpenChange={(open) => { if (!applying) setConfirmOpen(open) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Ver. {nextReviewVersion(latest.version)}으로 반영합니다</DialogTitle><DialogDescription>승인 {approved}칸을 반영해 새 버전을 만듭니다. 이전 버전은 과거 버전으로 남습니다.</DialogDescription></DialogHeader>
        <DialogBody><label className="block text-sm font-medium" htmlFor="review-version-label">버전 설명</label><input id="review-version-label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={applying} className="mt-2 h-9 w-full rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-3 text-sm" />{applyError ? <p className="mt-3 text-sm text-[var(--destructive)]">{applyError}</p> : null}</DialogBody>
        <DialogFooter><button type="button" disabled={applying} onClick={() => setConfirmOpen(false)} className={`${FILTER_BUTTON} w-auto disabled:opacity-40`}>취소</button><button type="button" disabled={applying} onClick={() => void apply()} className="inline-flex h-9 items-center rounded-[9px] border border-transparent bg-[var(--ref-cat-1)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">{applying ? "반영 중…" : "반영"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}

function ManualsTab({ items, buyerName, onOpen }: { items: ReferenceItem[]; buyerName: string; onOpen: (item: ReferenceItem) => void }) {
  const [openFolder, setOpenFolder] = useState<FolderGroup | null>(null)
  const visible = buyerName ? items.filter((item) => protocolBuyer(item) === buyerName) : items
  /* 바이어 카드는 선택과 관계없이 항상 전체를 보여 준다. 아래 문서 목록만 선택한 바이어로 거른다. */
  const groups = useMemo(() => buildBuyerGroups(items), [items])
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{groups.length ? groups.map((group) => <FolderCard key={group.name} accent={manualAccent} folder={group} onOpen={setOpenFolder} />) : <p className="px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">선택한 조건에 맞는 자료가 없습니다.</p>}</div>
    {visible.length ? <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)]">{visible.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 border-b border-[var(--border)]/60 px-4 py-3 text-left outline-none last:border-b-0 hover:bg-[var(--muted)]/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"><BookOpen className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{titleOf(item)}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</span></span><span className="shrink-0 rounded-full bg-[var(--muted)]/60 px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">{protocolBuyer(item)}</span></button>)}</div> : null}
    <FolderDialog accent={manualAccent} folder={openFolder} onOpenChange={(open) => { if (!open) setOpenFolder(null) }} />
  </div>
}

export function BuyerProtocols() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get("tab")
  // 검토(REVIEW)는 기준표를 개정하는 소유자 작업이다. 읽기 권한만 있는 팀원에게는 탭 자체를 주지 않는다(R342).
  const protocolAccess = useScreenAccess("/protocol")
  const canEdit = protocolAccess === "edit"
  const canView = canEdit || protocolAccess === "read"
  const tabs = canEdit ? TAB_ITEMS : TAB_ITEMS.filter((tab) => tab.id !== "review")
  const requested = rawTab === "buyer" || rawTab === "revisions" || rawTab === "manuals" || rawTab === "review" ? rawTab : "matrix"
  const active: TabId = tabs.some((tab) => tab.id === requested) ? requested : "matrix"
  const [query, setQuery] = useState("")
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null)
  const { revisions, latest, master, loading, error } = useProtocolMatrix()
  const reviews = useProtocolReviews()
  const manuals = useBuyerProtocols(canView)
  const manualItems = manuals.items.filter((item) => protocolBuyer(item) !== BUYER_ALL)
  const pendingRevisions = revisions.filter((revision) => revision.status === "pending")
  const pendingDiffs = pendingRevisions.flatMap((revision) => (revision.diffs ?? []).map((diff) => ({ ...diff, revDate: revision.revDate })))
  const buyerParam = searchParams.get("buyer") ?? ""
  const buyerName = master?.buyers?.find((buyer) => buyer.id === buyerParam)?.manualTopic ?? ""
  const reviewBase = latest ?? master
  const reviewPending = reviews.batches
    .filter((batch) => batch.status === "open")
    .flatMap((batch) => batch.items.map((item) => ({ batch, item })))
    .filter(({ batch, item }) => item.decision === "pending" && !isStale(reviewBase, batch, item)).length

  const selectTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", tab)
    setSearchParams(next)
  }
  const selectBuyer = (buyerId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", "buyer")
    next.set("buyer", buyerId)
    setSearchParams(next)
  }
  const openManuals = (buyerId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", "manuals")
    next.set("buyer", buyerId)
    setSearchParams(next)
  }

  if (loading) return <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">기준표를 불러오는 중입니다.</p>
  if (error) return <p className="px-5 py-16 text-center text-sm text-[var(--destructive)]">{error}</p>
  if (!master) return <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">등록된 기준표가 없습니다.</p>

  return <RddaMotionContext.Provider value="protocol"><section className="-mt-1 min-w-0 space-y-4 pb-4">
    <HeaderBlock master={master} pendingCount={pendingRevisions.length} />
    <TabNav active={active} onSelect={selectTab} badges={{ review: reviewPending }} tabs={tabs} />
    <div aria-live="polite" className="min-h-[70vh]">
      {active === "matrix" ? <MatrixTab master={master} pendingDiffs={pendingDiffs} query={query} onQuery={setQuery} /> : null}
      {active === "buyer" ? <BuyerTab master={master} manuals={manualItems} pendingDiffs={pendingDiffs} selectedBuyerId={buyerParam} onSelectBuyer={selectBuyer} onManuals={openManuals} /> : null}
      {active === "revisions" ? <RevisionsTab master={master} revisions={revisions} /> : null}
      {active === "manuals" ? <ManualsTab items={manualItems} buyerName={buyerName} onOpen={setSelectedItem} /> : null}
      {active === "review" ? <ReviewTab latest={latest ?? master} batches={reviews.batches} loading={reviews.loading} error={reviews.error} /> : null}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/70 px-1 pt-3 text-[11px] text-[var(--muted-foreground)]"><span>DOC. HTP-MATRIX  Buyer별 Test protocols 취합본, Teams Test Protocols 폴더</span><span className="tabular-nums">REV. {master.revDate}</span></footer>
    <ReferenceDialog item={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} />
  </section></RddaMotionContext.Provider>
}
