import { useMemo, useState } from "react"
import { BookOpenCheck, ExternalLink, Folder, Search } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { AnimatedNumber, MotionSection, RddaMotionContext } from "@/components/rdda/motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  REFERENCE_CATEGORIES,
  categoryOf,
  displaySummaryOf,
  formatSize,
  titleOf,
  type ReferenceCategory,
  type ReferenceCategoryId,
  type ReferenceItem,
} from "@/data/reference-schema"
import { useReferenceItems } from "@/data/references"
import { ownerDisplayName } from "@/data/schema"

type TabId = "overview" | ReferenceCategoryId
type TopicCount = { topic: string; count: number }

const UNASSIGNED_TOPIC = "주제 미지정"
const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "")
const categoryColor = (category: ReferenceCategory) => `var(--ref-cat-${category.slot})`
const dateText = (value?: string) => {
  if (!value) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("ko-KR")
}
const topicOf = (item: ReferenceItem) => item.topic?.trim() || UNASSIGNED_TOPIC

function countTopics(items: ReferenceItem[], category?: ReferenceCategory): TopicCount[] {
  const counts = new Map<string, number>()
  items.forEach((item) => counts.set(topicOf(item), (counts.get(topicOf(item)) ?? 0) + 1))
  const configured = category?.topicOrder ?? []
  return [...counts].map(([topic, count]) => ({ topic, count })).sort((a, b) => {
    if (a.topic === UNASSIGNED_TOPIC) return 1
    if (b.topic === UNASSIGNED_TOPIC) return -1
    if (configured.length) {
      const ai = configured.indexOf(a.topic)
      const bi = configured.indexOf(b.topic)
      if (ai >= 0 || bi >= 0) return (ai < 0 ? configured.length : ai) - (bi < 0 ? configured.length : bi)
    }
    return b.count - a.count || a.topic.localeCompare(b.topic, "ko-KR")
  })
}

function ItemRow({ item, onOpen, compact = false }: { item: ReferenceItem; onOpen: (item: ReferenceItem) => void; compact?: boolean }) {
  return <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 border-b border-[var(--border)]/60 px-4 py-3 text-left outline-none last:border-b-0 hover:bg-[var(--muted)]/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]">
    {item.kind === "folder" ? <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" /> : null}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{titleOf(item)}</span>
      <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{compact ? `${categoryOf(item.category)?.korean ?? "미분류"}${item.topic ? ` · ${item.topic}` : ""}` : displaySummaryOf(item) || "요약이 아직 없습니다"}</span>
    </span>
    <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{dateText(item.documentDate || item.modifiedAt)}</span>
  </button>
}

function ReferenceDialog({ item, onOpenChange }: { item: ReferenceItem | null; onOpenChange: (open: boolean) => void }) {
  const category = item ? categoryOf(item.category) : undefined
  return <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      {item ? <>
        <DialogHeader className="pr-12">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: category ? categoryColor(category) : "color-mix(in oklab,var(--muted-foreground) 40%,transparent)" }} />{category?.korean ?? "미분류"}</Badge>
            {item.topic ? <Badge variant="outline">{item.topic}</Badge> : null}
            {item.needsReview ? <Badge variant="outline" className="border-[var(--warning)] text-[var(--warning)]">확인 필요</Badge> : null}
          </div>
          <DialogTitle className="text-xl leading-snug">{titleOf(item)}</DialogTitle>
          <DialogDescription className="sr-only">자료 상세 정보</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          {item.tags.length ? <div className="flex flex-wrap gap-2">{item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div> : null}
          <section><h3 className="mb-2 text-sm font-semibold">요약</h3><p className="text-sm leading-6 text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</p></section>
          <Separator />
          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
            {item.displayTitle ? <><dt className="text-[var(--muted-foreground)]">원본 파일명</dt><dd className="break-all">{item.title}</dd></> : null}
            <dt className="text-[var(--muted-foreground)]">작성자</dt><dd>{ownerDisplayName(item.owner ?? "") || "-"}</dd>
            <dt className="text-[var(--muted-foreground)]">자료일</dt><dd>{dateText(item.documentDate)}</dd>
            <dt className="text-[var(--muted-foreground)]">원본 수정일</dt><dd>{dateText(item.modifiedAt)}</dd>
            <dt className="text-[var(--muted-foreground)]">형식</dt><dd className="uppercase">{item.kind === "folder" ? "folder" : item.format}</dd>
            <dt className="text-[var(--muted-foreground)]">크기</dt><dd>{item.kind === "folder" ? "-" : formatSize(item.sizeBytes)}</dd>
          </dl>
        </DialogBody>
        <DialogFooter>
          {item.webUrl
            ? <Button asChild><a href={item.webUrl} target="_blank" rel="noreferrer"><ExternalLink />{item.kind === "folder" ? "폴더 열기" : "원본 열기"}</a></Button>
            : <><Button disabled><ExternalLink />{item.kind === "folder" ? "폴더 열기" : "원본 열기"}</Button><p className="text-xs text-[var(--muted-foreground)]">원본 링크가 아직 연결되지 않았습니다</p></>}
        </DialogFooter>
      </> : null}
    </DialogContent>
  </Dialog>
}

function CompositionBar({ items, onSelect }: { items: ReferenceItem[]; onSelect: (id: ReferenceCategoryId) => void }) {
  const parts = REFERENCE_CATEGORIES.map((category) => ({ category, count: items.filter((item) => item.category === category.id).length }))
  const uncategorized = items.filter((item) => !categoryOf(item.category)).length
  const total = items.length
  if (!total) return <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">표시할 자료가 없습니다.</p>
  return <div className="flex h-[22px] gap-[2px]" aria-label="카테고리 구성">
    {parts.map(({ category, count }) => count ? <button key={category.id} type="button" onClick={() => onSelect(category.id)} title={`${category.korean} ${count}건 (${Math.round(count / total * 100)}%)`} className="min-w-1 first:rounded-l-[4px] last:rounded-r-[4px]" style={{ flexGrow: count, backgroundColor: categoryColor(category) }}><span className="sr-only">{category.korean} {count}건</span></button> : null)}
    {uncategorized ? <span title={`미분류 ${uncategorized}건 (${Math.round(uncategorized / total * 100)}%)`} className="min-w-1 last:rounded-r-[4px]" style={{ flexGrow: uncategorized, backgroundColor: "color-mix(in oklab,var(--muted-foreground) 40%,transparent)" }}><span className="sr-only">미분류 {uncategorized}건</span></span> : null}
  </div>
}

function Overview({ items, onSelect, onOpen }: { items: ReferenceItem[]; onSelect: (id: ReferenceCategoryId) => void; onOpen: (item: ReferenceItem) => void }) {
  const total = items.length
  const recent = [...items].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 6)
  const review = items.filter((item) => item.needsReview).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 10)
  return <div className="space-y-5">
    <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium">자료 구성</CardTitle></CardHeader><CardContent><CompositionBar items={items} onSelect={onSelect} /></CardContent></Card>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{REFERENCE_CATEGORIES.map((category) => {
      const categoryItems = items.filter((item) => item.category === category.id)
      const topics = countTopics(categoryItems, category).slice().sort((a, b) => b.count - a.count).slice(0, 3)
      return <button key={category.id} type="button" onClick={() => onSelect(category.id)} className="h-full text-left outline-none">
        <Card className="h-full transition-colors hover:border-[var(--border)]"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><span className="size-2.5 rounded-sm" style={{ backgroundColor: categoryColor(category) }} />{category.korean}</div>
          <p className="mt-1 text-[10px] tracking-[0.08em] text-[var(--muted-foreground)]">{category.label}</p>
          <div className="mt-4 flex items-baseline justify-between gap-2"><span className="text-2xl font-semibold tabular-nums">{categoryItems.length}</span><span className="text-xs tabular-nums text-[var(--muted-foreground)]">{total ? Math.round(categoryItems.length / total * 100) : 0}%</span></div>
          <p className="mt-3 line-clamp-2 min-h-8 text-xs leading-4 text-[var(--muted-foreground)]">{topics.map(({ topic }) => topic).join(", ") || "주제 미지정"}</p>
        </CardContent></Card>
      </button>
    })}</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader className="flex-row items-center justify-between py-4"><CardTitle className="text-sm font-medium">최근 추가</CardTitle><span className="text-xs text-[var(--muted-foreground)]">최대 6건</span></CardHeader><CardContent className="p-0">{recent.length ? recent.map((item) => <ItemRow key={item.id} item={item} onOpen={onOpen} compact />) : <p className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">자료가 없습니다.</p>}</CardContent></Card>
      <Card><CardHeader className="flex-row items-center justify-between py-4"><CardTitle className="text-sm font-medium">분류 확인 필요</CardTitle><span className="text-xs tabular-nums text-[var(--muted-foreground)]">{review.length}건</span></CardHeader><CardContent className="p-0">{review.length ? review.map((item) => <ItemRow key={item.id} item={item} onOpen={onOpen} compact />) : <p className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">확인이 필요한 자료가 없습니다.</p>}</CardContent></Card>
    </div>
  </div>
}

function CategoryTab({ category, items, onOpen }: { category: ReferenceCategory; items: ReferenceItem[]; onOpen: (item: ReferenceItem) => void }) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const topics = useMemo(() => countTopics(items, category), [items, category])
  const topicIndex = useMemo(() => new Map(topics.map(({ topic }, index) => [topic, index])), [topics])
  const rows = useMemo(() => items.filter((item) => !selectedTopic || topicOf(item) === selectedTopic).sort((a, b) => {
    if (category.id === "study") return (b.documentDate || b.modifiedAt).localeCompare(a.documentDate || a.modifiedAt)
    const topicOrder = (topicIndex.get(topicOf(a)) ?? topics.length) - (topicIndex.get(topicOf(b)) ?? topics.length)
    return topicOrder || titleOf(a).localeCompare(titleOf(b), "ko-KR")
  }), [category.id, items, selectedTopic, topicIndex, topics.length])
  const maxTopic = Math.max(1, ...topics.map(({ count }) => count))
  const owners = category.id === "study" ? [...items.reduce((map, item) => {
    const owner = ownerDisplayName(item.owner ?? "") || "작성자 미지정"
    map.set(owner, (map.get(owner) ?? 0) + 1)
    return map
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR")) : []

  return <div className="space-y-5">
    <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-medium">주제 분포</CardTitle></CardHeader><CardContent className="space-y-2.5">
      {topics.length ? topics.map(({ topic, count }) => {
        const active = selectedTopic === topic
        return <button key={topic} type="button" aria-pressed={active} onClick={() => setSelectedTopic(active ? null : topic)} className={`grid w-full grid-cols-[8rem_1fr_3rem] items-center gap-3 rounded-md px-2 py-1 text-left outline-none hover:bg-[var(--muted)]/40 focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "bg-[var(--muted)]/60" : ""}`}>
          <span className="truncate text-xs text-[var(--foreground)]">{topic}</span><span className="h-3 overflow-hidden rounded-[4px] bg-[var(--muted)]"><span className="block h-full rounded-[4px]" style={{ width: `${count / maxTopic * 100}%`, backgroundColor: categoryColor(category) }} /></span><span className="text-right text-xs tabular-nums text-[var(--muted-foreground)]">{count}건</span>
        </button>
      }) : <p className="py-5 text-center text-sm text-[var(--muted-foreground)]">표시할 주제가 없습니다.</p>}
    </CardContent></Card>
    {category.id === "study" && owners.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[var(--muted-foreground)]">작성자별</span>{owners.map(([owner, count]) => <Badge key={owner} variant="secondary" className="font-normal">{owner} <span className="ml-1 tabular-nums text-[var(--muted-foreground)]">{count}</span></Badge>)}</div> : null}
    <div className="overflow-hidden rounded-lg border border-[var(--border)]/70">
      <div className="flex items-center justify-between border-b border-[var(--border)]/70 px-4 py-3"><h2 className="text-sm font-medium">자료 목록</h2><span className="text-xs tabular-nums text-[var(--muted-foreground)]">{rows.length}건</span></div>
      {rows.length ? <div className="overflow-x-auto"><Table className="min-w-[880px] text-[13px]">
        <TableHeader className="bg-[var(--muted)]/40"><TableRow><TableHead>제목</TableHead><TableHead>주제</TableHead><TableHead>작성자</TableHead><TableHead>자료일</TableHead><TableHead>형식</TableHead><TableHead className="text-right">크기</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((item) => <TableRow key={item.id} tabIndex={0} className="cursor-pointer outline-none hover:bg-[var(--muted)]/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]" onClick={() => onOpen(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item) } }}>
          <TableCell className="max-w-md"><div className="flex items-center gap-2">{item.kind === "folder" ? <Folder className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" /> : null}<span className="font-medium">{titleOf(item)}</span>{item.needsReview ? <Badge variant="outline" className="shrink-0 border-[var(--warning)] text-[var(--warning)]">확인 필요</Badge> : null}</div><p className="mt-1 line-clamp-1 text-xs text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</p></TableCell>
          <TableCell>{item.topic || UNASSIGNED_TOPIC}</TableCell><TableCell>{ownerDisplayName(item.owner ?? "") || "-"}</TableCell><TableCell className="whitespace-nowrap">{dateText(item.documentDate)}</TableCell><TableCell className="uppercase">{item.kind === "folder" ? "folder" : item.format}</TableCell><TableCell className="text-right tabular-nums">{item.kind === "folder" ? "-" : formatSize(item.sizeBytes)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div> : <p className="px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">선택한 조건에 맞는 자료가 없습니다.</p>}
    </div>
  </div>
}

export function TechnicalReferences() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get("tab")
  const active: TabId = rawTab === "overview" || REFERENCE_CATEGORIES.some(({ id }) => id === rawTab) ? rawTab as TabId : "overview"
  const [query, setQuery] = useState("")
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null)
  const { items, loading, error } = useReferenceItems()
  const searched = useMemo(() => {
    const needle = normalize(query)
    return items.filter((item) => !needle || normalize([titleOf(item), item.title, item.topic ?? "", displaySummaryOf(item), ...item.tags, item.owner ?? ""].join(" ")).includes(needle))
  }, [items, query])
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const latest = items.reduce((value, item) => item.modifiedAt > value ? item.modifiedAt : value, "")
  const tabs = [{ id: "overview" as const, label: "OVERVIEW", hint: "전체 구성", count: searched.length }, ...REFERENCE_CATEGORIES.map((category) => ({ id: category.id, label: category.label, hint: category.hint, count: searched.filter((item) => item.category === category.id).length }))]
  const activeCategory = active === "overview" ? undefined : categoryOf(active)
  const activeItems = activeCategory ? searched.filter((item) => item.category === activeCategory.id) : searched
  const selectTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", tab)
    next.delete("category")
    setSearchParams(next)
  }

  return <RddaMotionContext.Provider value="references"><section className="-mt-1 min-w-0 space-y-5 pb-4">
    <header className="relative z-20 rounded-[14px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_76%,transparent)] px-4 py-3 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:px-5 sm:py-3.5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]"><span className="absolute inset-x-7 top-0 h-px bg-white/95" /><span className="absolute -right-16 -top-20 size-56 rounded-full bg-[var(--gradient-1)] opacity-[0.08] blur-3xl" /><span className="absolute -bottom-24 left-1/3 size-48 rounded-full bg-[var(--gradient-3)] opacity-[0.07] blur-3xl" /></div>
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[var(--gradient-1)] to-[var(--gradient-3)] text-white shadow-[0_10px_22px_-10px_rgba(76,91,212,0.7)]"><BookOpenCheck className="size-5" aria-hidden="true" /></span><div><h1 className="text-lg font-semibold tracking-tight">Fabric references</h1><p className="text-xs text-[var(--muted-foreground)]">팀 자료 라이브러리</p></div></div>
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 요약, 주제로 검색" className="bg-white/48 pl-9 backdrop-blur" /></div>
      </div>
      <MotionSection className="relative mt-3 grid items-stretch gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "전체 자료", value: items.length }, { label: "이번 달 신규", value: items.filter((item) => item.modifiedAt.startsWith(thisMonth)).length }, { label: "분류 확인 필요", value: items.filter((item) => item.needsReview).length }].map(({ label, value }) => <div key={label} className="rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{label}</p><p className="mt-0.5 font-semibold"><AnimatedNumber value={value} suffix="건" locale /></p></div>)}
        <div className="rounded-[11px] border border-white/75 bg-white/48 px-3.5 py-2 shadow-[0_9px_22px_-20px_rgba(15,23,42,0.28)] backdrop-blur"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">최근 갱신</p><p className="mt-0.5 font-semibold tabular-nums">{dateText(latest)}</p></div>
      </MotionSection>
    </header>

    <nav className="rounded-[12px] border border-white/70 bg-[color-mix(in_oklab,var(--card)_72%,transparent)] p-1.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] backdrop-blur-lg" role="tablist" aria-label="자료 라이브러리 탭">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">{tabs.map((tab, index) => {
        const selected = active === tab.id
        return <button key={tab.id} type="button" role="tab" aria-selected={selected} onClick={() => selectTab(tab.id)} className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[9px] border px-3 pb-2 pt-2.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] ${selected ? "border-[color-mix(in_oklab,var(--gradient-1)_35%,transparent)] bg-[linear-gradient(160deg,var(--card)_55%,color-mix(in_oklab,var(--gradient-1)_7%,var(--card)))] shadow-[0_7px_18px_-13px_rgba(15,23,42,0.4)]" : "border-[var(--border)]/60 bg-white/35 hover:border-[var(--border)] hover:bg-white/60"}`}>
          <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--gradient-1)] to-[var(--gradient-3)] transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`} /><span className={`absolute left-2 top-2 text-[9px] font-semibold tabular-nums tracking-[0.08em] ${selected ? "text-[var(--gradient-1)]" : "text-[var(--muted-foreground)] opacity-60"}`}>{String(index + 1).padStart(2, "0")}</span><strong className={`mt-1 block w-full truncate px-4 text-center text-[13px] font-semibold uppercase tracking-[0.06em] ${selected ? "text-[var(--foreground)]" : "text-[color-mix(in_oklab,var(--foreground)_72%,transparent)]"}`}>{tab.label}</strong><span className="mt-1.5 flex w-full min-w-0 items-center justify-end gap-1.5"><span aria-hidden="true" className={`size-1 shrink-0 rounded-full ${selected ? "bg-[var(--gradient-3)]" : "bg-[var(--muted-foreground)] opacity-40"}`} /><span className={`truncate rounded-full px-2 py-[1px] text-[10.5px] ${selected ? "bg-[color-mix(in_oklab,var(--gradient-1)_9%,transparent)] text-[color-mix(in_oklab,var(--gradient-1)_75%,var(--foreground))]" : "bg-[var(--muted)]/60 text-[var(--muted-foreground)]"}`}>{tab.hint} · {tab.count}</span></span>
        </button>
      })}</div>
    </nav>

    <div aria-live="polite" className="min-h-[70vh]">
      {loading ? <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">자료를 불러오는 중입니다.</p>
        : error ? <p className="px-5 py-16 text-center text-sm text-[var(--destructive)]">{error}</p>
        : items.length === 0 ? <p className="px-5 py-16 text-center text-sm text-[var(--muted-foreground)]">아직 색인된 자료가 없습니다. Teams 자료 폴더 색인이 올라오면 여기 표시됩니다.</p>
        : active === "overview" ? <Overview items={activeItems} onSelect={selectTab} onOpen={setSelectedItem} />
        : activeCategory ? <CategoryTab key={activeCategory.id} category={activeCategory} items={activeItems} onOpen={setSelectedItem} /> : null}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/70 px-1 pt-3 text-[11px] text-[var(--muted-foreground)]"><span>Teams 자료 폴더 색인 기준</span><span>전체 {items.length.toLocaleString("ko-KR")}건</span></footer>
    <ReferenceDialog item={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} />
  </section></RddaMotionContext.Provider>
}
