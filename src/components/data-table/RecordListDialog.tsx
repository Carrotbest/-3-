import { DataTable, type DataTableColumn } from "@/components/data-table/DataTable"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface RecordListDialogProps<T> {
  open: boolean
  title: string
  description?: string
  rows: readonly T[]
  columns: DataTableColumn<T>[]
  getRowId: (row: T) => string
  onOpenChange: (open: boolean) => void
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

/** 카드/KPI에서 여는 공통 중앙 목록 팝업. */
export function RecordListDialog<T>({
  open,
  title,
  description,
  rows,
  columns,
  getRowId,
  onOpenChange,
  onRowClick,
  emptyMessage = "해당 항목이 없습니다.",
}: RecordListDialogProps<T>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? `전체 ${rows.length.toLocaleString("ko-KR")}건`}</DialogDescription>
        </DialogHeader>
        <DialogBody className="overscroll-contain p-0">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={getRowId}
            paginate={false}
            onRowClick={onRowClick}
            emptyMessage={emptyMessage}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
