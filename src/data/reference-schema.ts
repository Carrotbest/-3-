export type ReferenceCategoryId =
  | "fundamentals"
  | "process"
  | "quality"
  | "materials"
  | "market"
  | "testing"

export interface ReferenceCategory {
  id: ReferenceCategoryId
  label: string
  korean: string
  code: string
  pending?: boolean
}

export interface ReferenceItem {
  id: string
  title: string
  category: ReferenceCategoryId
  tags: string[]
  format: string
  sizeBytes: number
  documentDate?: string
  modifiedAt: string
  owner?: string
  webUrl?: string
  excerpt?: string
  curatedSummary?: string
  generatedSummary?: string
  needsReview?: boolean
}

export const REFERENCE_CATEGORIES: ReferenceCategory[] = [
  { code: "01", id: "fundamentals", label: "FUNDAMENTALS", korean: "기초 교육" },
  { code: "02", id: "process", label: "PROCESS", korean: "공정 관리" },
  { code: "03", id: "quality", label: "QUALITY", korean: "품질 사고" },
  { code: "04", id: "materials", label: "MATERIALS", korean: "소재 기술" },
  { code: "05", id: "market", label: "MARKET", korean: "시장 인증" },
  { code: "06", id: "testing", label: "TESTING", korean: "시험 규격", pending: true },
]

export const categoryOf = (id: ReferenceCategoryId) =>
  REFERENCE_CATEGORIES.find((category) => category.id === id)

export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000).toLocaleString("ko-KR")} KB`
  return `${(bytes / 1_000_000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

export const displaySummaryOf = (item: ReferenceItem): string =>
  item.curatedSummary?.trim() || item.generatedSummary?.trim() || item.excerpt?.trim() || ""
