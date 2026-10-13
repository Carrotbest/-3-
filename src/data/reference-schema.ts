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
}

export interface ReferenceItem {
  id: string
  title: string
  displayTitle?: string
  category: string
  topic?: string
  folder?: string
  docType?: string
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
  { id: "fundamentals", label: "FUNDAMENTALS", korean: "기초 교육", slot: 1, hint: "공정별 기본기" },
  { id: "study", label: "CASE STUDY", korean: "스터디", slot: 2, hint: "팀 사례 연구" },
  { id: "functional", label: "FUNCTIONAL", korean: "기능성 원단", slot: 3, hint: "기능별 소재와 가공" },
  { id: "sustainable", label: "SUSTAINABLE", korean: "친환경 소재", slot: 4, hint: "리사이클과 인증" },
  { id: "external", label: "EXTERNAL", korean: "외부 자료", slot: 5, hint: "시장과 업체 자료" },
]

export interface ReferenceFolder { name: string; description: string }

export const REFERENCE_FOLDERS: Record<ReferenceCategoryId, ReferenceFolder[]> = {
  fundamentals: [
    { name: "원료와 방적", description: "섬유 분류, 원사, 방적 공정" },
    { name: "편직", description: "편성 원리와 편직 불량" },
    { name: "염색과 프린트", description: "색의 원리, 염색, 프린트 기법" },
    { name: "워싱과 가공", description: "가먼트 워싱과 후가공 종류" },
    { name: "시험", description: "견뢰도, 이화학 시험, 광원과 CCM" },
    { name: "생산 공정과 불량", description: "생산 흐름과 원단 불량 원인" },
    { name: "기능성과 지속가능성", description: "기능성 원단 키워드와 ESG" },
  ],
  study: [
    { name: "가공", description: "후가공 공정 정리와 현장 입회 보고" },
    { name: "염색", description: "염색성, Shade, 견뢰도, 이염" },
    { name: "원사와 소재", description: "원사 구조와 섬유 비교" },
    { name: "편직과 조직", description: "조직 구조와 편직 사양 추정" },
    { name: "품질 사고", description: "사고 원인 분석과 관리법" },
    { name: "환경과 규제", description: "환경 부하, 인증, 규제 검토" },
    { name: "제안 자료", description: "바이어 트렌드 제안과 협업 제안" },
  ],
  functional: [
    { name: "항균 소취 가공", description: "후가공으로 넣는 항균, 소취제와 시험 결과" },
    { name: "항균 섬유", description: "원사 단계에서 항균 성분을 넣은 섬유" },
    { name: "항바이러스", description: "바이러스 저감 가공과 시험" },
    { name: "발열 보온", description: "흡습발열, 광발열, 원적외선 소재" },
    { name: "냉감과 온도 조절", description: "접촉 냉감과 체온 반응형 가공" },
    { name: "흡한속건", description: "흡수와 건조, 일방향 수분 이동" },
    { name: "웰니스 스킨케어", description: "콜라겐, 아연, 프로바이오틱 피부 케어 소재" },
    { name: "발수와 형태 안정", description: "비불소 발수, 형태 안정, 항필링, 촉감 가공" },
    { name: "신소재와 종합 자료", description: "그래핀, 형광 면 염색, 가공제 종합 카탈로그" },
  ],
  sustainable: [
    { name: "인증과 기준", description: "GRS, OCS, RCS, BCI 인증 기준과 인증서" },
    { name: "리사이클", description: "리사이클 폴리, 면, 원착사와 탄소발자국" },
    { name: "생분해와 바이오", description: "생분해 원사, PLA, PHA, 바이오 원료" },
    { name: "친환경 염색 공정", description: "양이온 면, 냉패드배치 등 물과 약품을 줄이는 염색" },
    { name: "무염색과 유기농 면", description: "무염색, 컬러드, 유기농, 재생농업 면" },
    { name: "재생 셀룰로스", description: "모달, 라이오셀, 대나무, 리사이클 레이온" },
  ],
  external: [
    { name: "소재 업체 소개", description: "원사, 소재 업체의 회사와 제품 소개" },
    { name: "면화 세미나 2026", description: "미국 면화 수급, 교역, 추적성 발표" },
    { name: "면화 세미나 2021~2022", description: "면화 전망과 지속가능성 발표" },
    { name: "기사", description: "소재 관련 언론 기사" },
  ],
}

export const DOC_TYPE_ORDER = ["소개 자료", "기술 자료", "시험 성적", "인증과 기준", "교육 자료", "팀 스터디", "발표 자료", "기사"]
export const UNASSIGNED_FOLDER = "폴더 미지정"
export const folderOf = (item: ReferenceItem) => item.folder?.trim() || UNASSIGNED_FOLDER

export const categoryOf = (id: string) =>
  REFERENCE_CATEGORIES.find((category) => category.id === id)

export const titleOf = (item: ReferenceItem): string => item.displayTitle?.trim() || item.title

export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000).toLocaleString("ko-KR")} KB`
  return `${(bytes / 1_000_000).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

export const displaySummaryOf = (item: ReferenceItem): string =>
  item.curatedSummary?.trim() || item.generatedSummary?.trim() || item.excerpt?.trim() || ""
