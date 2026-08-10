/* schema.ts — 데이터 계약
   IA_화면구성_v7 DEVELOPMENT 17개 항목 기준 */

export interface DevRecordSource {
  sheet: string
  row: number
}

/** DD 원본의 확장 기술데이터. 값이 없으면 필드 자체를 생략한다. */
export interface DevTechnical {
  // 공정 작업처 (DD 공정 SCHEDULE 그룹의 Mill 컬럼)
  mills?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 공정별 완료일 (기존 processReached 판정에 쓰는 Status 원본값)
  processDates?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 개발 사양
  yarnDetail?: string
  arrangeNo?: string
  finishing?: string[]
  optionProgress?: string
  review?: string
  // ORIGINAL 분석
  original?: { brand?: string; contents?: string; yarn?: string; comments?: string }
  // 실측 물성
  actual?: {
    width?: number | null
    weight?: number | null
    balance?: number | null
    shrinkageLength?: number | null
    shrinkageWidth?: number | null
  }
  // 편직 사양
  knitSpec?: {
    inch?: string
    gauge?: string
    needles?: string
    loopF?: string
    loopT?: string
    loopB?: string
  }
  // 공정단계별 폭/중량
  stageData?: {
    greige?: { width?: number | null; weight?: number | null }
    tenter?: { width?: number | null; weight?: number | null }
    wash?: { width?: number | null; weight?: number | null }
  }
  finish?: { brush?: string; chemical?: string }
  // 리뷰
  passFail?: string
  failReason?: string
  styleHistory?: string
}

export interface DevRecord {
  styleNo: string
  opt: string
  season: string
  category: string
  buyer: string
  owner: string
  planner: string
  gdNo: string
  saNo: string
  construction: string
  weight: number | ""
  color: string
  dyeing: string
  stage: string
  dueDate: string
  flNo: string
  note: string
  devType?: "GD" | "국내"
  devStatus?: string
  requestDate?: string
  receivedDate?: string
  /** 공정별 완료 여부 — 각 공정 Status(완료일)이 파싱일 이전·당일이면 true. FL# 있으면 전 공정 true. */
  processReached?: { yarn: boolean; knitting: boolean; dyeing: boolean; finishing: boolean }
  tech?: DevTechnical
  _src: DevRecordSource
}

export interface FabricAnalysisRow {
  anNo: string
  requestDate: string
  completeDate: string
  item: string
  owner: string
}

export type MaterialKind = "TS" | "STUDY" | "MACRO" | "FABRIC" | "PORTFOLIO"

export interface MaterialDetailRow {
  label: string
  value: string
}

export interface MaterialItem {
  id: string
  kind: MaterialKind
  title: string
  summary?: string
  date?: string
  tags: string[]
  link?: string
  owner?: string
  source: "excel" | "manual" | "ts" | "study"
  detail?: MaterialDetailRow[]
  readOnly?: boolean
}

export interface MaterialDiagnostics {
  recognized: number
  byKind: Record<MaterialKind, number>
  unknownKind: number
  missingLink: number
}

export const MATERIAL_KINDS = ["TS", "STUDY", "MACRO", "FABRIC", "PORTFOLIO"] as const satisfies readonly MaterialKind[]

const normalizedMaterialKey = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "")

/** 링크가 있으면 링크, 없으면 제목을 기준으로 브라우저마다 같은 자료 ID를 만든다. */
export function materialIdOf(link: string | undefined, title: string): string {
  const key = normalizedMaterialKey(link?.trim() || title)
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `material-${(hash >>> 0).toString(36)}`
}

export function httpsMaterialLink(value: string | undefined): string | undefined {
  const candidate = value?.trim()
  if (!candidate?.startsWith("https://")) return undefined
  try {
    return new URL(candidate).protocol === "https:" ? candidate : undefined
  } catch {
    return undefined
  }
}

export interface CompletedSample {
  styleNo: string
  flNo: string
  season: string
  category: string
  buyer: string
  owner: string
  construction: string
  process: {
    yarn?: string
    knit: string
    dye: string
    finish: string
    remark: string
  }
  inhouse: {
    widthCm: number | null
    weightGsm: number | null
    shrinkagePct: number | {
      length: number | null
      width: number | null
    }
    pilling: number | null
  }
  completedAt: string
  requestDate?: string
  sourceSheet?: string
}

export type StudyState = "완료" | "진행" | "계획" | "미진행"

export interface StudyRecord {
  week: number
  owner: string
  topic: string
  category: string
  state: StudyState
  dueDate: string
  weekLabel?: string
  selectionReason?: string
  confirmedDate?: string
  completedDate?: string
  materialFile?: string
  reason?: string
}

export type DevRecordFieldKey = Exclude<keyof DevRecord, "_src" | "processReached" | "tech">

export interface FieldDefinition {
  key: DevRecordFieldKey
  label: string
  width: number
  mono?: boolean
  sticky?: boolean
  align?: "center" | "right"
  unit?: string
  type?: "date"
}

export const FIELDS = [
  { key: "styleNo", label: "Style No.", width: 110, mono: true, sticky: true },
  { key: "opt", label: "Opt", width: 52, mono: true, align: "center" },
  { key: "season", label: "시즌", width: 74, mono: true },
  { key: "category", label: "카테고리", width: 110 },
  { key: "buyer", label: "Buyer", width: 100 },
  { key: "owner", label: "담당", width: 80 },
  { key: "planner", label: "Planner", width: 90 },
  { key: "gdNo", label: "GD#", width: 96, mono: true },
  { key: "saNo", label: "SA#", width: 96, mono: true },
  { key: "construction", label: "조직", width: 110 },
  { key: "weight", label: "중량", width: 84, mono: true, align: "right", unit: " g/m²" },
  { key: "color", label: "컬러", width: 90 },
  { key: "dyeing", label: "염색", width: 90 },
  { key: "stage", label: "공정 단계", width: 110 },
  { key: "dueDate", label: "납기", width: 78, mono: true, type: "date" },
  { key: "flNo", label: "FL#", width: 96, mono: true },
  { key: "note", label: "비고", width: 180 },
] as const satisfies readonly FieldDefinition[]

/** 목록 기본 표시 컬럼 (나머지는 상세창) */
export const DEFAULT_COLUMNS = [
  "styleNo",
  "opt",
  "season",
  "category",
  "buyer",
  "owner",
  "construction",
  "weight",
  "stage",
  "dueDate",
] as const satisfies readonly DevRecordFieldKey[]

export const CATEGORIES = ["SEASON", "CORE", "EU MARKET", "PROJECT"] as const
export type Category = (typeof CATEGORIES)[number]

/** 공정 단계 — 순서가 진행률이다 */
export const STAGES = [
  { key: "yarn", label: "원사" },
  { key: "knit", label: "편직" },
  { key: "dye", label: "염색" },
  { key: "finish", label: "가공" },
  { key: "test", label: "시험" },
  { key: "done", label: "완료" },
] as const

export const STATUS = {
  progress: { key: "progress", label: "진행", tone: "brand" },
  due: { key: "due", label: "납기 임박", tone: "warn" },
  late: { key: "late", label: "지연", tone: "crit" },
  done: { key: "done", label: "완료", tone: "ok" },
  hold: { key: "hold", label: "보류", tone: "neutral" },
} as const

export type StatusKey = keyof typeof STATUS

/** 팀 구성 — 담당자 필터·매트릭스의 기준 순서 */
export const MEMBERS = [
  { id: "phg", name: "박향근", role: "소팀장" },
  { id: "kjh", name: "김지현", role: "팀원" },
  { id: "bjh", name: "변재휘", role: "팀원" },
  { id: "jye", name: "진영은", role: "팀원" },
] as const

export type Member = (typeof MEMBERS)[number]

/** 민감 필드 — sensitiveUnlocked 가 false면 화면에 그리지 않는다 */
export const SENSITIVE_FIELDS = ["unitPrice", "vendor", "vendorCode"] as const

/** TDS 컬럼 헤더 → 내부 key 매핑. 헤더 표기 흔들림을 흡수한다. */
export const HEADER_MAP = {
  "style no": "styleNo",
  "style no.": "styleNo",
  style: "styleNo",
  스타일: "styleNo",
  opt: "opt",
  option: "opt",
  옵션: "opt",
  season: "season",
  시즌: "season",
  category: "category",
  카테고리: "category",
  구분: "category",
  buyer: "buyer",
  바이어: "buyer",
  owner: "owner",
  담당: "owner",
  담당자: "owner",
  planner: "planner",
  플래너: "planner",
  gd: "gdNo",
  "gd#": "gdNo",
  "gd no": "gdNo",
  sa: "saNo",
  "sa#": "saNo",
  "sa no": "saNo",
  construction: "construction",
  조직: "construction",
  weight: "weight",
  중량: "weight",
  "g/m2": "weight",
  gsm: "weight",
  color: "color",
  컬러: "color",
  색상: "color",
  dyeing: "dyeing",
  염색: "dyeing",
  stage: "stage",
  공정: "stage",
  공정단계: "stage",
  진행: "stage",
  due: "dueDate",
  "due date": "dueDate",
  납기: "dueDate",
  fl: "flNo",
  "fl#": "flNo",
  "fl no": "flNo",
  note: "note",
  비고: "note",
  remark: "note",
} as const satisfies Record<string, DevRecordFieldKey>

export function emptyRecord(): Record<DevRecordFieldKey, ""> {
  return Object.fromEntries(FIELDS.map((field) => [field.key, ""])) as Record<
    DevRecordFieldKey,
    ""
  >
}
