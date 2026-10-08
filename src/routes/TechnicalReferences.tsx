import { useMemo, useState } from "react"
import { ExternalLink, Search } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { REFERENCE_DEMO } from "@/data/reference-demo"
import {
  REFERENCE_CATEGORIES,
  categoryOf,
  displaySummaryOf,
  formatSize,
  type ReferenceCategoryId,
  type ReferenceItem,
} from "@/data/reference-schema"
import { ownerDisplayName } from "@/data/schema"

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "")
const dateText = (value?: string) => value ? new Date(value).toLocaleDateString("ko-KR") : "-"

function CategoryCard({ category, items, selected, onClick }: {
  category: (typeof REFERENCE_CATEGORIES)[number]
  items: ReferenceItem[]
  selected: boolean
  onClick: () => void
}) {
  const recent = [...items].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 2)
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className="h-full text-left outline-none">
      <Card className={`h-full transition-colors hover:border-[var(--chart-1)] ${selected ? "border-[var(--chart-1)] ring-1 ring-[var(--chart-1)]" : "border-[var(--border)]/60"}`}>
        <CardContent className="flex h-full min-h-56 flex-col p-5">
          <div className="flex items-start gap-3">
            <span className="pt-1 font-mono text-xs text-[var(--muted-foreground)]">{category.code}</span>
            <div>
              <p className="text-base font-semibold tracking-wide text-[var(--foreground)]">{category.label}</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{category.korean}</p>
            </div>
          </div>
          <div className="mt-7">
            {category.pending && items.length === 0
              ? <p className="text-base font-semibold text-[var(--muted-foreground)]">자료원 연결 대기</p>
              : <p><span className="text-3xl font-semibold tabular-nums">{items.length}</span><span className="ml-1 text-sm text-[var(--muted-foreground)]">건</span></p>}
          </div>
          <div className="mt-auto min-h-12 space-y-1.5 pt-5 text-xs text-[var(--muted-foreground)]">
            {[0, 1].map((index) => <p key={index} className="line-clamp-1 min-h-4">{recent[index]?.title ?? ""}</p>)}
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

function ReferenceSheet({ item, onOpenChange }: { item: ReferenceItem | null; onOpenChange: (open: boolean) => void }) {
  const category = item ? categoryOf(item.category) : undefined
  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        {item ? <>
          <SheetHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{category?.korean ?? item.category}</Badge>
              {item.needsReview ? <Badge variant="outline" className="border-[var(--warning)] text-[var(--warning)]">확인 필요</Badge> : null}
            </div>
            <SheetTitle className="text-xl leading-snug">{item.title}</SheetTitle>
            <SheetDescription className="sr-only">자료 상세 정보</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap gap-2">{item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
            <section>
              <h3 className="mb-2 text-sm font-semibold">요약</h3>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</p>
            </section>
            <Separator />
            <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-[var(--muted-foreground)]">작성자</dt><dd>{ownerDisplayName(item.owner ?? "") || "-"}</dd>
              <dt className="text-[var(--muted-foreground)]">자료일</dt><dd>{dateText(item.documentDate)}</dd>
              <dt className="text-[var(--muted-foreground)]">원본 수정일</dt><dd>{dateText(item.modifiedAt)}</dd>
              <dt className="text-[var(--muted-foreground)]">형식</dt><dd className="uppercase">{item.format}</dd>
              <dt className="text-[var(--muted-foreground)]">크기</dt><dd>{formatSize(item.sizeBytes)}</dd>
            </dl>
          </div>
          <SheetFooter className="border-t border-[var(--border)]">
            {item.webUrl
              ? <Button asChild><a href={item.webUrl} target="_blank" rel="noreferrer"><ExternalLink />원본 열기</a></Button>
              : <><Button disabled><ExternalLink />원본 열기</Button><p className="text-xs text-[var(--muted-foreground)]">원본 링크가 아직 연결되지 않았습니다</p></>}
          </SheetFooter>
        </> : null}
      </SheetContent>
    </Sheet>
  )
}

export function TechnicalReferences() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawCategory = searchParams.get("category")
  const selectedCategory = REFERENCE_CATEGORIES.some(({ id }) => id === rawCategory) ? rawCategory as ReferenceCategoryId : null
  const [query, setQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedItem, setSelectedItem] = useState<ReferenceItem | null>(null)

  const categoryItems = useMemo(() => Object.fromEntries(REFERENCE_CATEGORIES.map((category) => [category.id, REFERENCE_DEMO.filter((item) => item.category === category.id)])) as Record<ReferenceCategoryId, ReferenceItem[]>, [])
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    REFERENCE_DEMO.forEach((item) => item.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
  }, [])
  const rows = useMemo(() => {
    const needle = normalize(query)
    return REFERENCE_DEMO.filter((item) => !selectedCategory || item.category === selectedCategory)
      .filter((item) => selectedTags.every((tag) => item.tags.includes(tag)))
      .filter((item) => !needle || normalize([item.title, displaySummaryOf(item), ...item.tags, item.owner ?? ""].join(" ")).includes(needle))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }, [query, selectedCategory, selectedTags])
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const kpis = [
    ["전체 자료", REFERENCE_DEMO.length],
    ["이번 달 신규", REFERENCE_DEMO.filter((item) => item.modifiedAt.startsWith(thisMonth)).length],
    ["요약 있음", REFERENCE_DEMO.filter((item) => Boolean(displaySummaryOf(item))).length],
    ["분류 확인 필요", REFERENCE_DEMO.filter((item) => item.needsReview).length],
  ] as const
  const filtered = Boolean(selectedCategory || selectedTags.length || query.trim())

  const toggleCategory = (category: ReferenceCategoryId) => {
    const next = new URLSearchParams(searchParams)
    if (selectedCategory === category) next.delete("category")
    else next.set("category", category)
    setSearchParams(next)
  }

  return <section className="min-w-0 space-y-6">
    <PageHeader title="TECHNICAL REFERENCES" />

    <Card className="border-[var(--border)]/60">
      <CardContent className="grid p-0 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value], index) => <div key={label} className={`px-5 py-4 ${index ? "border-t border-[var(--border)] sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-l-0 xl:border-l" : ""}`}>
          <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("ko-KR")}</p>
        </div>)}
      </CardContent>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {REFERENCE_CATEGORIES.map((category) => <CategoryCard key={category.id} category={category} items={categoryItems[category.id]} selected={selectedCategory === category.id} onClick={() => toggleCategory(category.id)} />)}
    </div>

    <div className="space-y-3">
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 요약, 태그로 검색" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-2">
        {tagCounts.map(([tag, count]) => {
          const active = selectedTags.includes(tag)
          return <button key={tag} type="button" aria-pressed={active} onClick={() => setSelectedTags((current) => active ? current.filter((value) => value !== tag) : [...current, tag])} className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? "border-[var(--chart-1)] bg-[var(--chart-1)] text-white" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{tag} <span className="tabular-nums opacity-70">{count}</span></button>
        })}
      </div>
    </div>

    <Card className="border-[var(--border)]/60">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-medium">자료 목록</CardTitle>
        <span className="text-sm tabular-nums text-[var(--muted-foreground)]">{rows.length}건</span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? <div className="overflow-x-auto"><Table className="min-w-[980px] text-[13px]">
          <TableHeader className="bg-[var(--muted)]/40"><TableRow><TableHead>제목</TableHead><TableHead>카테고리</TableHead><TableHead>태그</TableHead><TableHead>작성자</TableHead><TableHead>자료일</TableHead><TableHead>형식</TableHead><TableHead className="text-right">크기</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((item) => {
            const category = categoryOf(item.category)
            return <TableRow key={item.id} tabIndex={0} className="cursor-pointer outline-none hover:bg-[var(--muted)]/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]" onClick={() => setSelectedItem(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedItem(item) } }}>
              <TableCell className="max-w-md"><div className="flex items-center gap-2"><span className="font-medium">{item.title}</span>{item.needsReview ? <Badge variant="outline" className="shrink-0 border-[var(--warning)] text-[var(--warning)]">확인 필요</Badge> : null}</div><p className="mt-1 line-clamp-1 text-xs text-[var(--muted-foreground)]">{displaySummaryOf(item) || "요약이 아직 없습니다"}</p></TableCell>
              <TableCell>{category?.korean ?? item.category}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{item.tags.map((tag) => <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>)}</div></TableCell>
              <TableCell>{ownerDisplayName(item.owner ?? "") || "-"}</TableCell><TableCell className="whitespace-nowrap">{dateText(item.documentDate)}</TableCell><TableCell className="uppercase">{item.format}</TableCell><TableCell className="text-right tabular-nums">{formatSize(item.sizeBytes)}</TableCell>
            </TableRow>
          })}</TableBody>
        </Table></div> : <p className="px-5 py-12 text-center text-sm text-[var(--muted-foreground)]">{filtered ? "선택한 조건에 맞는 자료가 없습니다." : "등록된 자료가 없습니다."}</p>}
      </CardContent>
    </Card>

    <ReferenceSheet item={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }} />
  </section>
}
