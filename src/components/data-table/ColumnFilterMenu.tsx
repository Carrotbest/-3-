import { useMemo, useState } from "react"
import { ChevronDown, ListFilter } from "lucide-react"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

type ColumnFilterOption = { key: string; label: string }

interface ColumnFilterMenuProps {
  label: string
  active: boolean
  sortDir: "asc" | "desc" | null
  loadOptions: () => ColumnFilterOption[]
  selected: string[] | null
  onSort: (dir: "asc" | "desc") => void
  onApply: (selected: string[] | null) => void
}

export function ColumnFilterMenu({ label, active, sortDir, loadOptions, selected, onSort, onApply }: ColumnFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ColumnFilterOption[]>([])
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")

  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    return needle ? options.filter((option) => option.label.toLocaleLowerCase("ko-KR").includes(needle)) : options
  }, [options, query])
  const visibleSelected = visibleOptions.filter((option) => draft.has(option.key)).length
  const allVisibleSelected = visibleOptions.length > 0 && visibleSelected === visibleOptions.length
  const someVisibleSelected = visibleSelected > 0 && !allVisibleSelected

  const changeOpen = (next: boolean) => {
    if (next) {
      const loaded = loadOptions()
      setOptions(loaded)
      setDraft(new Set(selected ?? loaded.map((option) => option.key)))
      setQuery("")
    }
    setOpen(next)
  }
  const chooseSort = (dir: "asc" | "desc") => {
    onSort(dir)
    setOpen(false)
  }
  const clearFilter = () => {
    onApply(null)
    setOpen(false)
  }
  const toggleVisible = () => setDraft((current) => {
    const next = new Set(current)
    for (const option of visibleOptions) allVisibleSelected ? next.delete(option.key) : next.add(option.key)
    return next
  })
  const apply = () => {
    const allSelected = draft.size === options.length && options.every((option) => draft.has(option.key))
    onApply(allSelected ? null : Array.from(draft))
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${label} 필터`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={`ml-auto inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
        >
          {active ? <ListFilter className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="z-[80] w-72 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-2 text-xs shadow-lg outline-none"
        >
          <button type="button" onClick={() => chooseSort("asc")} className={`flex w-full rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] ${sortDir === "asc" ? "font-semibold text-[var(--primary)]" : ""}`}>텍스트 오름차순 정렬</button>
          <button type="button" onClick={() => chooseSort("desc")} className={`flex w-full rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] ${sortDir === "desc" ? "font-semibold text-[var(--primary)]" : ""}`}>텍스트 내림차순 정렬</button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button type="button" disabled={!active} onClick={clearFilter} className="flex w-full rounded px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40">&quot;{label}&quot;에서 필터 해제</button>
          <div className="my-1 border-t border-[var(--border)]" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" className="mb-2 h-7 text-xs" />
          <div className="max-h-64 overflow-auto">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--muted)]">
              <Checkbox checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} disabled={!visibleOptions.length} onCheckedChange={toggleVisible} />
              <span>(모두 선택)</span>
            </label>
            {visibleOptions.map((option) => (
              <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-[var(--muted)]">
                <Checkbox checked={draft.has(option.key)} onCheckedChange={(checked) => setDraft((current) => {
                  const next = new Set(current)
                  if (checked) next.add(option.key); else next.delete(option.key)
                  return next
                })} />
                <span className="min-w-0 truncate" title={option.label}>{option.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1 border-t border-[var(--border)] pt-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>취소</Button>
            <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={draft.size === 0} onClick={apply}>확인</Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
