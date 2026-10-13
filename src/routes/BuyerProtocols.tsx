import { useMemo, useState, type CSSProperties } from "react"
import { useSearchParams } from "react-router-dom"

import { GROUP_FIGURES } from "@/components/protocol/TechFigures"
import { displaySummaryOf, titleOf, type ReferenceItem } from "@/data/reference-schema"
import { useBuyerProtocols } from "@/data/references"
import {
  isNotApplicable,
  methodKey,
  useProtocolMatrix,
  type ProtocolBuyer,
  type ProtocolDiff,
  type ProtocolGroup,
  type ProtocolRevision,
  type ProtocolTest,
  type ProtocolVerification,
} from "@/data/protocol-matrix"
import { FolderCard, FolderDialog, ReferenceDialog, type FolderAccent, type FolderGroup } from "@/routes/TechnicalReferences"

type TabId = "matrix" | "buyer" | "revisions" | "manuals"
type PendingDiff = ProtocolDiff & { revDate: string }

const TAB_ITEMS: Array<{ id: TabId; no: string; label: string; hint: string }> = [
  { id: "matrix", no: "01", label: "MATRIX", hint: "기준표" },
  { id: "buyer", no: "02", label: "BY BUYER", hint: "바이어별" },
  { id: "revisions", no: "03", label: "REVISIONS", hint: "개정 이력" },
  { id: "manuals", no: "04", label: "SOURCE MANUALS", hint: "원문 매뉴얼" },
]

const BUYER_ALL = "전 바이어"
const manualAccent: FolderAccent = { color: "var(--ref-cat-5)", label: "바이어 시험 기준", sortByDate: false }

/* 매트릭스 필터 버튼: 모두 같은 높이, 칸을 꽉 채우는 너비 */
const FILTER_BUTTON = "inline-flex h-9 w-full min-w-0 items-center gap-1.5 rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-3 font-mono text-[11px] outline-none hover:border-[color-mix(in_oklab,var(--foreground)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
const GROUP_ON = "border-[var(--ref-cat-1)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)] text-[var(--ref-cat-1)]"

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR")
const compact = (value: string) => normalize(value).replace(/\s+/g, "")

/* 바이어 시그니처 색. 색 값은 데이터(buyers[].color)에서 온다. */
const buyerColor = (buyer?: Pick<ProtocolBuyer, "color">) => buyer?.color ?? "var(--muted-foreground)"
const buyerSelected = (buyer: Pick<ProtocolBuyer, "color">): CSSProperties => ({ borderColor: buyerColor(buyer), background: `color-mix(in oklab, ${buyerColor(buyer)} 10%, var(--card))` })
const buyerBar = (buyer?: Pick<ProtocolBuyer, "color">): CSSProperties => ({ boxShadow: `inset 3px 0 0 ${buyerColor(buyer)}` })

function Swatch({ buyer, size = 8 }: { buyer?: Pick<ProtocolBuyer, "color">; size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-[2px] align-middle" style={{ width: size, height: size, background: buyerColor(buyer) }} />
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

function distributionFor(test: ProtocolTest, buyers: ProtocolBuyer[]) {
  const counts = new Map<string, number>()
  buyers.forEach((buyer) => {
    const method = test.cells[buyer.id]?.[0]?.method ?? ""
    if (method.trim()) {
      const key = methodKey(method)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  })
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
}

function majorityMethod(test: ProtocolTest, buyers: ProtocolBuyer[]) {
  return distributionFor(test, buyers)[0]?.[0] ?? ""
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

function SectionLabel({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="border border-[var(--border)] px-3 py-2">
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</p>
    <p className={`mt-1 text-sm ${warning ? "text-[var(--warning)]" : ""}`}>{value}</p>
  </div>
}

function TabNav({ active, onSelect }: { active: TabId; onSelect: (tab: TabId) => void }) {
  return <nav role="tablist" aria-label="바이어 시험 기준 탭" className="grid grid-cols-2 overflow-hidden rounded-[6px] border border-[var(--border)] sm:grid-cols-4">
    {TAB_ITEMS.map((tab, index) => {
      const selected = active === tab.id
      return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => onSelect(tab.id)} className={`relative flex h-12 items-center justify-center gap-2 px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${index > 0 ? "border-l border-[var(--border)]" : ""} ${index >= 2 ? "border-t border-[var(--border)] sm:border-t-0" : ""} ${index === 2 ? "border-l-0 sm:border-l" : ""} ${selected ? "bg-[var(--card)] text-[var(--foreground)]" : "bg-[color-mix(in_oklab,var(--muted)_55%,var(--card))] text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"}`}>
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${selected ? "bg-[var(--ref-cat-1)]" : "bg-transparent"}`} />
        <span className={`font-mono text-[10px] tracking-[0.14em] ${selected ? "text-[var(--ref-cat-1)]" : ""}`}>{tab.no}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">{tab.label}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{tab.hint}</span>
      </button>
    })}
  </nav>
}

function HeaderBlock({ master, pendingCount }: { master: ProtocolRevision; pendingCount: number }) {
  const buyers = master.buyers ?? []
  const tests = master.tests ?? []
  return <header className="relative overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1px_0_var(--border)] sm:p-5">
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
    <div className="relative">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">HANSOLL FABRIC R&D  ·  TECHNICAL STANDARD</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Buyer Test Protocol Matrix</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">바이어별 원단 시험 방법과 기준 (취합본 기준)</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4">
          <SectionLabel label="DOC NO." value="HTP-MATRIX" />
          <SectionLabel label="REV." value={master.revDate} />
          <SectionLabel label="SCOPE" value={`${buyers.length} BUYERS · ${tests.length} TESTS`} />
          <SectionLabel label="STATUS" value={pendingCount ? `미반영 수정 ${pendingCount}건` : "최신"} warning={pendingCount > 0} />
        </div>
      </div>
    </div>
  </header>
}

function CellNotes({ verification, diffs, field }: { verification?: ProtocolVerification; diffs: PendingDiff[]; field: ProtocolDiff["field"] }) {
  const fieldDiffs = diffs.filter((diff) => diff.field === field)
  return <>
    {verification ? <p className="mt-1 text-[11px] text-[var(--warning)]">원문: {verification.source}  ({verification.doc})</p> : null}
    {fieldDiffs.map((diff, index) => <p key={`${diff.field}-${index}`} className="mt-1 text-[11px] text-[var(--ref-cat-1)]">미반영 수정 {diff.revDate}: {firstLine(diff.value)}</p>)}
  </>
}

function SpecTable({ test, buyers, verifications, diffs }: { test: ProtocolTest; buyers: ProtocolBuyer[]; verifications: Map<string, ProtocolVerification[]>; diffs: Map<string, PendingDiff[]> }) {
  const majority = majorityMethod(test, buyers)
  return <div className="overflow-x-auto border border-[var(--border)]">
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
          const differentMethod = cell.method.trim() && majority && methodKey(cell.method) !== majority
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
  const [groupFilter, setGroupFilter] = useState("ALL")
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const selectedBuyerRows = selectedBuyers.length ? buyers.filter((buyer) => selectedBuyers.includes(buyer.id)) : buyers
  const needle = compact(query)
  const verifications = useMemo(() => byTestBuyer(master.verification ?? []), [master.verification])
  const diffs = useMemo(() => byTestBuyer(pendingDiffs), [pendingDiffs])
  const visibleTests = useMemo(() => tests.filter((test) => (groupFilter === "ALL" || test.group === groupFilter) && (!needle || searchableTest(test).includes(needle))), [groupFilter, needle, tests])
  const visibleIds = visibleTests.map((test) => test.id)
  const toggleBuyer = (buyerId: string) => setSelectedBuyers((current) => current.includes(buyerId) ? current.filter((id) => id !== buyerId) : [...current, buyerId])
  const openAll = () => setExpanded(visibleIds)
  const closeAll = () => setExpanded([])

  return <div className="space-y-5">
    <div className="border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button type="button" onClick={() => setGroupFilter("ALL")} aria-pressed={groupFilter === "ALL"} className={`${FILTER_BUTTON} justify-center ${groupFilter === "ALL" ? GROUP_ON : ""}`}>ALL</button>
        {groups.map((group) => <button key={group.id} type="button" onClick={() => setGroupFilter(group.id)} aria-pressed={groupFilter === group.id} className={`${FILTER_BUTTON} justify-center ${groupFilter === group.id ? GROUP_ON : ""}`}>{group.label} <span className="ml-1.5 font-sans text-[11px]">{group.korean}</span></button>)}
      </div>
      <div className="my-3 border-t border-[var(--border)]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-10">{buyers.map((buyer) => {
        const selected = selectedBuyers.includes(buyer.id)
        return <button key={buyer.id} type="button" onClick={() => toggleBuyer(buyer.id)} aria-pressed={selected} title={buyer.name} className={FILTER_BUTTON} style={selected ? buyerSelected(buyer) : undefined}><Swatch buyer={buyer} /><span className="truncate">{buyer.name}</span></button>
      })}
        <button type="button" onClick={() => setSelectedBuyers([])} disabled={!selectedBuyers.length} className={`${FILTER_BUTTON} justify-center font-sans text-[var(--muted-foreground)] disabled:opacity-50`}>선택 해제</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border border-[var(--border)] bg-[var(--card)] p-3">
      <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="시험 항목, 규격 코드, 기준값 검색 (예: AATCC 135, pilling, 75 ppm)" className="h-9 min-w-[240px] flex-1 rounded-[4px] border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" />
      <button type="button" onClick={openAll} className={`${FILTER_BUTTON} w-auto justify-center px-4 font-sans`}>모두 펼치기</button>
      <button type="button" onClick={closeAll} className={`${FILTER_BUTTON} w-auto justify-center px-4 font-sans`}>모두 접기</button>
    </div>
    {groups.map((group: ProtocolGroup, groupIndex) => {
      const groupTests = visibleTests.filter((test) => test.group === group.id)
      if (!groupTests.length) return null
      const Figure = GROUP_FIGURES[group.id]
      return <section key={group.id} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] pb-2">
          <div><span className="font-mono text-sm text-[var(--ref-cat-1)]">§ {groupIndex + 1}</span><h2 className="inline pl-3 text-base font-semibold uppercase tracking-[0.08em]">{group.label}</h2><span className="pl-2 text-sm text-[var(--muted-foreground)]">{group.korean}</span></div>
          <span className="font-mono text-[11px] text-[var(--muted-foreground)]">{groupTests.length} ITEMS</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <figure><div className="border border-[var(--border)] p-2 text-[var(--foreground)]/75"><Figure className="h-auto w-full" /></div><figcaption className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">FIG. {groupIndex + 1}</figcaption></figure>
          <div className="space-y-2">{groupTests.map((test) => {
            const open = Boolean(needle) || expanded.includes(test.id)
            const summary = distributionFor(test, selectedBuyerRows)
            const hasVerification = selectedBuyerRows.some((buyer) => verifications.has(`${test.id}::${buyer.id}`))
            return <article key={test.id} className="border border-[var(--border)] bg-[var(--card)]">
              <button type="button" onClick={() => setExpanded((current) => current.includes(test.id) ? current.filter((id) => id !== test.id) : [...current, test.id])} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-[var(--muted)]/30">
                <span className="font-mono text-xs text-[var(--ref-cat-1)]">{test.no}</span>
                <strong className="text-sm">{test.name}</strong>
                <span className="text-xs text-[var(--muted-foreground)]">{test.korean}</span>
                {hasVerification ? <span className="size-2 rounded-full bg-[var(--warning)]" aria-label="원문 대조 불일치" /> : null}
                <span className="ml-auto flex flex-wrap justify-end gap-1">{summary.map(([key, count]) => <span key={key} className="border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]">{key} ×{count}</span>)}</span>
              </button>
              {open ? <div className="p-3 pt-0"><SpecTable test={test} buyers={selectedBuyerRows} verifications={verifications} diffs={diffs} /></div> : null}
            </article>
          })}</div>
        </div>
      </section>
    })}
    {!visibleTests.length ? <p className="px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">선택한 조건에 맞는 자료가 없습니다.</p> : null}
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

  return <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="space-y-1">{buyers.map((buyer) => {
      const selected = selectedBuyer?.id === buyer.id && !pendingBuyer
      return <button key={buyer.id} type="button" onClick={() => onSelectBuyer(buyer.id)} aria-pressed={selected} className="w-full border border-[var(--border)] px-3 py-2 text-left" style={selected ? buyerSelected(buyer) : buyerBar(buyer)}>
        <span className="flex items-center gap-2 text-sm font-medium"><Swatch buyer={buyer} />{buyer.name}</span><span className="font-mono text-[11px] text-[var(--muted-foreground)]">{buyer.lightSources.join(" / ") || "-"}</span>
      </button>
    })}
      {master.pendingBuyers?.map((buyer) => <button key={buyer.name} type="button" onClick={() => onSelectBuyer(`pending:${buyer.name}`)} className={`w-full border px-3 py-2 text-left text-[var(--muted-foreground)] ${selectedBuyerId === `pending:${buyer.name}` ? "border-[var(--ref-cat-1)]" : "border-[var(--border)]"}`}>{buyer.name} (본표 미등재)</button>)}
    </aside>
    <div className="min-w-0 space-y-5">
      {pendingBuyer ? <section className="border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-xl font-semibold">{pendingBuyer.name}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{pendingBuyer.note}</p>
        {pendingBuyer.answers?.length ? <div className="mt-4 border border-[var(--border)] bg-[var(--muted)]/25 p-3"><p className="mb-2 text-sm font-medium">바이어 질의 회신</p>{pendingBuyer.answers.map((answer, index) => <div key={index} className="mb-3 last:mb-0"><p className="text-sm">Q. {answer.q}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">A. {answer.a}</p></div>)}</div> : null}
      </section> : null}
      {selectedBuyer && !pendingBuyer ? <section className="space-y-4">
        <div className="border border-[var(--border)] bg-[var(--card)] p-4" style={{ borderTop: `3px solid ${buyerColor(selectedBuyer)}` }}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><Swatch buyer={selectedBuyer} size={12} />{selectedBuyer.name}</h2><p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">LIGHT SOURCE  {selectedBuyer.lightSources.join(" / ") || "-"}</p></div><button type="button" onClick={() => onManuals(selectedBuyer.id)} className="border border-[var(--border)] px-3 py-1.5 text-sm">원문 {manualCount}건</button></div>
          {selectedBuyer.notes?.length ? <div className="mt-4 border border-[var(--border)] bg-[var(--muted)]/25 p-3"><p className="mb-2 text-sm font-medium">바이어 질의 회신</p>{selectedBuyer.notes.map((note, index) => <div key={index} className="mb-3 last:mb-0"><p className="text-sm">Q. {note.q}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">A. {note.a}</p></div>)}</div> : null}
        </div>
        {groups.map((group) => <section key={group.id} className="space-y-2"><h3 className="border-b border-[var(--border)] pb-1 text-sm font-semibold uppercase tracking-[0.08em]">{group.label} <span className="font-normal text-[var(--muted-foreground)]">{group.korean}</span></h3>
          <div className="overflow-x-auto border border-[var(--border)]"><table className="w-full min-w-[720px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="w-20 border-b border-r border-[var(--border)] px-3 py-2 font-normal">NO.</th><th className="w-56 border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="w-56 border-b border-r border-[var(--border)] px-3 py-2 font-normal">METHOD</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">REQUIREMENT</th></tr></thead><tbody>
            {tests.filter((test) => test.group === group.id).map((test) => {
              const cells = test.cells[selectedBuyer.id]?.length ? test.cells[selectedBuyer.id] : [{ method: "", requirement: "" }]
              const key = `${test.id}::${selectedBuyer.id}`
              const verification = verifications.get(key)?.[0]
              const pendingCellDiffs = diffs.get(key) ?? []
              return cells.map((cell, index) => <tr key={`${test.id}-${index}`} className={verification ? "bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]" : ""}>
                <td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs">{index === 0 ? test.no : ""}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 align-top">{index === 0 ? <><p className="font-medium">{test.name}</p><p className="text-xs text-[var(--muted-foreground)]">{test.korean}</p></> : null}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 align-top font-mono text-xs"><span className={cell.method ? "" : "text-[var(--muted-foreground)]"}>{cell.method || "해당 없음"}</span><CellNotes verification={verification} diffs={pendingCellDiffs} field="method" /></td><td className="whitespace-pre-line border-t border-[var(--border)] px-3 py-2 align-top"><span className={isNotApplicable(cell.requirement) ? "text-[var(--muted-foreground)]" : ""}>{isNotApplicable(cell.requirement) ? "N/A" : cell.requirement || "해당 없음"}</span><CellNotes verification={verification} diffs={pendingCellDiffs} field="requirement" /></td>
              </tr>)
            })}
          </tbody></table></div>
        </section>)}
      </section> : null}
    </div>
  </div>
}

function RevisionsTab({ master, revisions }: { master: ProtocolRevision; revisions: ProtocolRevision[] }) {
  const testsById = new Map((master.tests ?? []).map((test) => [test.id, test]))
  const buyersById = new Map((master.buyers ?? []).map((buyer) => [buyer.id, buyer]))
  const buyerName = (id: string) => { const buyer = buyersById.get(id); return buyer ? <span className="inline-flex items-center gap-2"><Swatch buyer={buyer} />{buyer.name}</span> : id }
  return <div className="space-y-5">{revisions.map((revision) => {
    const isMaster = revision.kind === "master"
    return <section key={revision.id} className="relative border-l border-[var(--border)] pl-5">
      <span className={`absolute -left-[5px] top-1 size-2.5 rounded-full border border-[var(--ref-cat-1)] ${isMaster ? "bg-[var(--ref-cat-1)]" : "bg-[var(--card)]"}`} />
      <div className="border border-[var(--border)] bg-[var(--card)] p-4" style={!isMaster && revision.buyerScope ? buyerBar(buyersById.get(revision.buyerScope)) : undefined}>
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">REV. {revision.revDate}</span><h2 className="text-sm font-semibold">{revision.label}</h2><span className="text-xs text-[var(--muted-foreground)]">{revision.sourceFile}</span><span className={`border border-[var(--border)] px-2 py-0.5 text-xs ${revision.status === "pending" ? "text-[var(--warning)]" : ""}`}>{statusLabel(revision.status)}</span></div>
        {isMaster ? <div className="mt-4"><p className="mb-2 text-sm text-[var(--muted-foreground)]">취합본 값과 바이어 원문 매뉴얼이 다른 칸입니다. 원문 기준으로 확인이 필요합니다.</p><div className="overflow-x-auto border border-[var(--border)]"><table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">BUYER</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">취합본</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">원문</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">근거 문서</th></tr></thead><tbody>{(revision.verification ?? []).map((item, index) => <tr key={index}><td className="border-r border-t border-[var(--border)] px-3 py-2">{testsById.get(item.testId)?.no} {testsById.get(item.testId)?.name}</td><td className="border-r border-t border-[var(--border)] px-3 py-2" style={buyerBar(buyersById.get(item.buyerId))}>{buyerName(item.buyerId)}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{item.sheet}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{item.source}</td><td className="border-t border-[var(--border)] px-3 py-2">{item.doc}</td></tr>)}</tbody></table></div></div>
          : <div className="mt-4">{revision.diffs?.length ? <div className="overflow-x-auto border border-[var(--border)]"><table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead className="bg-[var(--muted)]/35"><tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">TEST</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">FIELD</th><th className="border-b border-r border-[var(--border)] px-3 py-2 font-normal">기준본</th><th className="border-b border-[var(--border)] px-3 py-2 font-normal">수정본</th></tr></thead><tbody>{revision.diffs.map((diff, index) => <tr key={index}><td className="border-r border-t border-[var(--border)] px-3 py-2">{testsById.get(diff.testId)?.no} {testsById.get(diff.testId)?.name}</td><td className="border-r border-t border-[var(--border)] px-3 py-2 font-mono text-xs">{fieldLabel(diff.field)}</td><td className="whitespace-pre-line border-r border-t border-[var(--border)] px-3 py-2">{diff.base}</td><td className="whitespace-pre-line border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)] px-3 py-2">{diff.value}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--muted-foreground)]">기준본과 차이 없음</p>}</div>}
      </div>
    </section>
  })}</div>
}

function ManualsTab({ items, buyerName, onOpen }: { items: ReferenceItem[]; buyerName: string; onOpen: (item: ReferenceItem) => void }) {
  const [openFolder, setOpenFolder] = useState<FolderGroup | null>(null)
  const visible = buyerName ? items.filter((item) => protocolBuyer(item) === buyerName) : items
  /* 바이어 카드는 선택과 관계없이 항상 전체를 보여 준다. 아래 문서 목록만 선택한 바이어로 거른다. */
  const groups = useMemo(() => buildBuyerGroups(items), [items])
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{groups.length ? groups.map((group) => <FolderCard key={group.name} accent={manualAccent} folder={group} onOpen={setOpenFolder} />) : <p className="px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">선택한 조건에 맞는 자료가 없습니다.</p>}</div>
    {visible.length ? <div className="overflow-hidden border border-[var(--border)]">{visible.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--muted)]/35"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{titleOf(item)}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</span></span><span className="font-mono text-[11px] text-[var(--muted-foreground)]">{protocolBuyer(item)}</span></button>)}</div> : null}
    <FolderDialog accent={manualAccent} folder={openFolder} onOpenChange={(open) => { if (!open) setOpenFolder(null) }} />
  </div>
}

export function BuyerProtocols() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get("tab")
  const active: TabId = rawTab === "buyer" || rawTab === "revisions" || rawTab === "manuals" ? rawTab : "matrix"
  const [query, setQuery] = useState("")
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null)
  const { revisions, master, loading, error } = useProtocolMatrix()
  const manuals = useBuyerProtocols()
  const manualItems = manuals.items.filter((item) => protocolBuyer(item) !== BUYER_ALL)
  const pendingRevisions = revisions.filter((revision) => revision.status === "pending")
  const pendingDiffs = pendingRevisions.flatMap((revision) => (revision.diffs ?? []).map((diff) => ({ ...diff, revDate: revision.revDate })))
  const buyerParam = searchParams.get("buyer") ?? ""
  const buyerName = master?.buyers?.find((buyer) => buyer.id === buyerParam)?.manualTopic ?? ""

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

  return <section className="-mt-1 min-w-0 space-y-5 pb-4">
    <HeaderBlock master={master} pendingCount={pendingRevisions.length} />
    <TabNav active={active} onSelect={selectTab} />
    <div aria-live="polite" className="min-h-[70vh]">
      {active === "matrix" ? <MatrixTab master={master} pendingDiffs={pendingDiffs} query={query} onQuery={setQuery} /> : null}
      {active === "buyer" ? <BuyerTab master={master} manuals={manualItems} pendingDiffs={pendingDiffs} selectedBuyerId={buyerParam} onSelectBuyer={selectBuyer} onManuals={openManuals} /> : null}
      {active === "revisions" ? <RevisionsTab master={master} revisions={revisions} /> : null}
      {active === "manuals" ? <ManualsTab items={manualItems} buyerName={buyerName} onOpen={setSelectedItem} /> : null}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]"><span>SOURCE  Buyer별 Test protocols 취합본, Teams Test Protocols 폴더</span><span>REV. {master.revDate}</span></footer>
    <ReferenceDialog item={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} />
  </section>
}
