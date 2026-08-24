import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type SortDirection = "asc" | "desc"

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  accessor?: (row: T) => unknown
  cell?: (row: T) => ReactNode
  sortable?: boolean
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: readonly T[]
  getRowId: (row: T) => string
  enableSelection?: boolean
  pageSize?: number
  paginate?: boolean
  toolbar?: ReactNode
  emptyMessage?: string
  onRowClick?: (row: T) => void
  /** 헤더 경계를 드래그해 각 열 너비를 수동 조절한다. */
  resizableColumns?: boolean
  /** 열 너비를 localStorage에 저장/복원할 때 쓰는 키(resizableColumns와 함께 사용). */
  storageKey?: string
  fillToPageSize?: boolean
}

const MIN_COLUMN_WIDTH = 56

function loadColumnWidths(enabled: boolean, storageKey?: string): Record<string, number> {
  if (!enabled || !storageKey || typeof window === "undefined") return {}
  try {
    const stored = JSON.parse(window.localStorage.getItem(`datatable-widths:${storageKey}`) ?? "{}") as unknown
    return stored && typeof stored === "object" ? stored as Record<string, number> : {}
  } catch {
    return {}
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right
  return String(left ?? "").localeCompare(String(right ?? ""), "ko-KR", {
    numeric: true,
    sensitivity: "base",
  })
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  enableSelection = false,
  pageSize = 10,
  paginate = true,
  toolbar,
  emptyMessage = "표시할 데이터가 없습니다.",
  onRowClick,
  resizableColumns = false,
  storageKey,
  fillToPageSize = false,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(null)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => loadColumnWidths(resizableColumns, storageKey))
  const headerCellRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
  const measuredRef = useRef(false)

  // 저장된 너비가 없는 열은 첫 렌더의 실제 콘텐츠 너비로 1회 시드한다(초기 모습 유지 후 고정).
  useLayoutEffect(() => {
    if (!resizableColumns || measuredRef.current) return
    const seeded: Record<string, number> = {}
    let need = false
    columns.forEach((column) => {
      if (columnWidths[column.id] == null) {
        const el = headerCellRefs.current[column.id]
        if (el) { seeded[column.id] = Math.round(el.getBoundingClientRect().width); need = true }
      }
    })
    if (need) setColumnWidths((current) => ({ ...seeded, ...current }))
    measuredRef.current = true
  }, [resizableColumns, columns, columnWidths])

  useEffect(() => {
    if (!resizableColumns || !storageKey) return
    try { window.localStorage.setItem(`datatable-widths:${storageKey}`, JSON.stringify(columnWidths)) } catch { /* noop */ }
  }, [columnWidths, resizableColumns, storageKey])

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, columnId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const el = headerCellRefs.current[columnId]
    const startWidth = columnWidths[columnId] ?? (el ? el.getBoundingClientRect().width : 160)
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)))
      setColumnWidths((current) => ({ ...current, [columnId]: next }))
    }
    const onUp = () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = ""
    }
    document.body.style.userSelect = "none"
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  const fixedLayout = resizableColumns && columns.every((column) => columnWidths[column.id] != null)
  const totalWidth = fixedLayout
    ? columns.reduce((sum, column) => sum + (columnWidths[column.id] ?? 0), 0) + (enableSelection ? 40 : 0)
    : undefined
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(pageSize)
  const pageSizeOptions = useMemo(
    () => [...new Set([10, 20, 30, 50, pageSize])].sort((left, right) => left - right),
    [pageSize],
  )

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((item) => item.id === sort.id)
    if (!column?.accessor) return rows
    return [...rows].sort((left, right) => {
      const compared = compareValues(column.accessor?.(left), column.accessor?.(right))
      return sort.direction === "asc" ? compared : -compared
    })
  }, [columns, rows, sort])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage))
  const safePage = Math.min(currentPage, pageCount)
  const pageRows = paginate ? sortedRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage) : sortedRows
  const fillerCount = paginate && fillToPageSize ? Math.max(0, rowsPerPage - pageRows.length) : 0
  const pageIds = pageRows.map(getRowId)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const somePageSelected = pageIds.some((id) => selected.has(id))

  useEffect(() => {
    setCurrentPage(1)
  }, [rows, rowsPerPage, sort])

  useEffect(() => {
    const validIds = new Set(rows.map(getRowId))
    setSelected((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)))
      if (next.size === current.size) return current
      return next
    })
  }, [getRowId, rows])

  const toggleSort = (column: DataTableColumn<T>) => {
    if (column.sortable === false || !column.accessor) return
    setSort((current) => {
      if (current?.id !== column.id) return { id: column.id, direction: "asc" }
      return { id: column.id, direction: current.direction === "asc" ? "desc" : "asc" }
    })
  }

  const togglePage = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleRow = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-w-0">
      {toolbar ? <div className="border-b border-[var(--border)] p-4">{toolbar}</div> : null}
      <div className="max-w-full overflow-x-auto">
        <Table className={cn("min-w-max", fixedLayout && "table-fixed")} style={totalWidth ? { width: totalWidth } : undefined}>
          {resizableColumns ? (
            <colgroup>
              {enableSelection ? <col style={{ width: 40 }} /> : null}
              {columns.map((column) => (
                <col key={column.id} style={columnWidths[column.id] != null ? { width: columnWidths[column.id] } : undefined} />
              ))}
            </colgroup>
          ) : null}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {enableSelection ? (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={togglePage}
                    aria-label={paginate ? "현재 페이지 전체 선택" : "전체 목록 선택"}
                  />
                </TableHead>
              ) : null}
              {columns.map((column) => {
                const active = sort?.id === column.id
                const sortable = column.sortable !== false && Boolean(column.accessor)
                return (
                  <TableHead
                    key={column.id}
                    ref={resizableColumns ? (el) => { headerCellRefs.current[column.id] = el } : undefined}
                    className={cn("whitespace-nowrap px-3", resizableColumns && "relative overflow-hidden text-ellipsis", column.headerClassName)}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex max-w-full items-center gap-1 truncate rounded-[calc(var(--radius)-2px)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
                      >
                        {column.header}
                        {active ? (
                          sort.direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5 shrink-0" /> : <ArrowDown aria-hidden="true" className="size-3.5 shrink-0" />
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="size-3.5 shrink-0 opacity-50" />
                        )}
                      </button>
                    ) : column.header}
                    {resizableColumns ? (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`${typeof column.header === "string" ? column.header : "열"} 너비 조절`}
                        onPointerDown={(event) => startResize(event, column.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-[var(--ring)]/50"
                      />
                    ) : null}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length ? pageRows.map((row) => {
              const rowId = getRowId(row)
              const isSelected = selected.has(rowId)
              return (
                <TableRow
                  key={rowId}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || !onRowClick || (event.key !== "Enter" && event.key !== " ")) return
                    event.preventDefault()
                    onRowClick(row)
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? "상세 보기" : undefined}
                >
                  {enableSelection ? (
                    <TableCell className="px-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(rowId)}
                        aria-label="행 선택"
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((column) => (
                    <TableCell key={column.id} className={cn("whitespace-nowrap px-3", resizableColumns && "overflow-hidden text-ellipsis", column.className)}>
                      {column.cell ? column.cell(row) : String(column.accessor?.(row) ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              )
            }) : fillToPageSize ? null : (
              <TableRow>
                <TableCell colSpan={columns.length + (enableSelection ? 1 : 0)} className="h-32 text-center text-[var(--muted-foreground)]">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {fillerCount > 0 ? Array.from({ length: fillerCount }).map((_, index) => (
              <TableRow key={`__filler-${index}`} aria-hidden="true" className="pointer-events-none">
                {enableSelection ? <TableCell className="px-3">{"\u00a0"}</TableCell> : null}
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn("whitespace-nowrap px-3", resizableColumns && "overflow-hidden text-ellipsis", column.className)}>{"\u00a0"}</TableCell>
                ))}
              </TableRow>
            )) : null}
          </TableBody>
        </Table>
      </div>
      {paginate ? <div className="flex flex-col gap-3 border-t border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select value={String(rowsPerPage)} onValueChange={(value) => setRowsPerPage(Number(value))}>
            <SelectTrigger className="w-20" aria-label="페이지당 행 수">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="mr-1 whitespace-nowrap">Page {safePage} of {pageCount}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            aria-label="이전 페이지"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(Math.min(pageCount, safePage + 1))}
            disabled={safePage >= pageCount}
            aria-label="다음 페이지"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div> : null}
    </div>
  )
}
