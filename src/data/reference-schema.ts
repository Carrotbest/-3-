export type ReferenceCategoryId =
  | "fundamentals"
  | "study"
  | "functional"
  | "sustainable"
  | "external"

export interface ReferenceCategory {
  id: ReferenceCategoryId
  label: string
  korean: string
  slot: 1 | 2 | 3 | 4 | 5
  hint: string
  topicOrder?: string[]
}

export interface ReferenceItem {
  id: string
  title: string
  displayTitle?: string
  category: string
  topic?: string
  kind?: "file" | "folder"
  tags: string[]
  keywords?: string[]
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
  { id: "fundamentals", label: "FUNDAMENTALS", korean: "기초 교육", slot: 1, hint: "공정별 기본기", topicOrder: ["섬유 원료", "방적", "편직", "염색", "프린트", "워싱", "가공", "기능성 원단", "지속가능성", "시험", "품질 불량", "생산 공정"] },
  { id: "study", label: "CASE STUDY", korean: "스터디", slot: 2, hint: "팀 사례 연구" },
  { id: "functional", label: "FUNCTIONAL", korean: "기능성 원단", slot: 3, hint: "기능별 소재와 가공" },
  { id: "sustainable", label: "SUSTAINABLE", korean: "친환경 소재", slot: 4, hint: "리사이클과 인증" },
  { id: "external", label: "EXTERNAL", korean: "외부 자료", slot: 5, hint: "시장과 업체 자료" },
]

export const categoryOf = (id: string) =>
  REFERENCE_CATEGORIES.find((category) => category.id === id)

export const titleOf = (item: ReferenceItem): string => item.displayTitle?.trim() || item.title

export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000).toLocaleString("ko-KR")} KB`
  return `${(bytes / 1_000_000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

export const displaySummaryOf = (item: ReferenceItem): string =>
  item.curatedSummary?.trim() || item.generatedSummary?.trim() || item.excerpt?.trim() || ""
