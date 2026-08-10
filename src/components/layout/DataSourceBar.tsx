import { Database } from "lucide-react"

import { fmtDateFull, fmtTime } from "@/data/format"
import { useAppStore } from "@/store/useAppStore"

export function DataSourceBar() {
  const meta = useAppStore((state) => state.meta)
  const source = meta.mode === "tds"
    ? `${meta.fileName ?? "업로드 파일"} · ${meta.appliedAt ? `${fmtDateFull(meta.appliedAt)} ${fmtTime(meta.appliedAt)}` : "업로드 시각 없음"}`
    : "예시 데이터 · SETTING에서 파일 업로드"
  return <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-2 text-xs text-[var(--muted-foreground)] sm:px-6" aria-label="데이터 출처 상태">
    <Database aria-hidden="true" className="size-4 shrink-0" />
    <p className="min-w-0 flex-1 break-words" role="status">현재 데이터 출처: {source}</p>
  </div>
}
