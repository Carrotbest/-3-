import { useEffect, useMemo, useState, type ReactNode } from "react"
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
  rows: T[]
  getRowId: (row: T) => string
  enableSelection?: boolean
  pageSize?: number
  toolbar?: ReactNode
  emptyMessage?: string
  onRowClick?: (row: T) => void
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
  toolbar,
  emptyMessage = "표시할 데이터가 없습니다.",
  onRowClick,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(null)
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
  const pageRows = sortedRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)
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
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {enableSelection ? (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={togglePage}
                    aria-label="현재 페이지 전체 선택"
                  />
                </TableHead>
              ) : null}
              {columns.map((column) => {
                const active = sort?.id === column.id
                const sortable = column.sortable !== false && Boolean(column.accessor)
                return (
                  <TableHead
                    key={column.id}
                    className={cn("whitespace-nowrap px-3", column.headerClassName)}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 rounded-[calc(var(--radius)-2px)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)]"
                      >
                        {column.header}
                        {active ? (
                          sort.direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : column.header}
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
                    <TableCell key={column.id} className={cn("whitespace-nowrap px-3", column.className)}>
                      {column.cell ? column.cell(row) : String(column.accessor?.(row) ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              )
            }) : (
              <TableRow>
                <TableCell colSpan={columns.length + (enableSelection ? 1 : 0)} className="h-32 text-center text-[var(--muted-foreground)]">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
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
      </div>
    </div>
  )
}
