/* schema.ts — 데이터 계약
   IA_화면구성_v7 DEVELOPMENT 17개 항목 기준 */

export interface DevRecordSource {
  sheet: string
  row: number
}

/** DD 원본의 확장 기술데이터. 값이 없으면 필드 자체를 생략한다. */
export interface DevTechnical {
  /** DD 64열 중 개발 DETAIL 원본 식별값. 상단 요약 필드와 별도로 원문을 보존한다. */
  development?: { developer?: string; co?: string; developmentNo?: string }
  /** 첨부 작업지시서에서 생성된 행의 중복 등록 방지용 원본 식별값. */
  intakeSource?: { kind: "zaji"; requestKey: string; optionKey: string }
  // 공정 작업처 (DD 공정 SCHEDULE 그룹의 Mill 컬럼)
  mills?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 공정별 완료일 (기존 processReached 판정에 쓰는 Status 원본값)
  processDates?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 개발 사양
  yarnDetail?: string
  arrangeNo?: string
  finishing?: string[]
  /** Finishing A~D의 빈 칸 위치까지 유지하기 위한 원본 슬롯. */
  finishingSlots?: { a?: string; b?: string; c?: string; d?: string }
  sampleDates?: { fds?: string; yds?: string }
  /**
   * FDS/YDS 요청서의 BODY 값. 비어 있으면 `opt`에서 만든다(B01, B02...).
   * GD가 작지 접수 순서를 바꾼 경우에만 사람이 채운다. 채워지면 `opt`보다 우선한다.
   */
  bodyNo?: string
  optionProgress?: string
  review?: string
  // ORIGINAL 분석
  original?: {
    brand?: string
    contents?: string
    construction?: string
    weight?: number | null
    yarn?: string
    comments?: string
  }
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
  /** 웹 신규 작지를 실제 DD MASTER에 등록한 시각. 기본 최신순 정렬에 사용한다. */
  registeredAt?: string
  receivedDate?: string
  /** 공정별 완료 여부 — 각 공정 Status(완료일)이 파싱일 이전·당일이면 true. FL# 있으면 전 공정 true. */
  processReached?: { yarn: boolean; knitting: boolean; dyeing: boolean; finishing: boolean }
  /** 수동 정렬 순서. 값이 있으면 요청일 정렬보다 우선한다(드래그로 재배치). */
  sortOrder?: number
  tech?: DevTechnical
  _src: DevRecordSource
}

/**
 * 1팀 소싱 차트의 스타일 1건. 엑셀 27열 중 스타일 단위로 공통인 값만 담는다.
 * 옵션별로 갈리는 값은 RequestOption이 갖는다.
 */
export interface RequestStyle {
  /** 내부 식별자. crypto.randomUUID 기반. 화면 표시는 chart + seq로 한다. */
  reqId: string
  /** 소속 차트명. 예: "26.FEB EU MARKET" */
  chart: string
  /** 진행 단계. 엑셀의 시트 두 개를 이 값 하나로 대신한다. */
  stage: "분석" | "개발"
  /** 차트 내 순번(엑셀 A열) */
  seq: number
  // ORIGINAL — 엑셀 B~G
  /** Storage 오브젝트 경로. 예: "requests/<reqId>/full.webp" */
  imagePath?: string
  /** 목록용 썸네일 경로 */
  imageThumbPath?: string
  /** 엑셀 C열. EU MARKET·SEASON 건은 DD의 Style No.와 같은 값을 쓰는 것이 관행이다. */
  garmentNo: string
  brand: string
  contents: string
  origConstruction: string
  origWeight: number | ""
  // 분석 — 엑셀 H~M
  yarnAnalysis: string
  devConstruction: string
  comment: string
  analyst: string
  // 의뢰 — 엑셀 N~Q
  urgent: boolean
  /** 1팀 의뢰 담당(엑셀 O열) */
  requester: string
  /** R&D 개발 담당(엑셀 P열) */
  developer: string
  /** 엑셀 Q열 "개발" */
  devPlan: string
  options: RequestOption[]
  createdAt: string
  updatedAt: string
}

/**
 * 스타일에서 파생된 옵션 라인 1건. DD MASTER 행과 1대1로 연결한다.
 * 개발처·Yarn ETA·READY DATE·FL#은 연결된 DD 행에서 읽어 표시하므로 여기 저장하지 않는다.
 */
export interface RequestOption {
  /** `${reqId}#${no}` */
  optId: string
  /** 옵션 번호. 1부터 */
  no: number
  /** 엑셀 S열 */
  yarnDetail: string
  /** 엑셀 T열 */
  color: string
  /** 엑셀 U열 */
  dyeingMethod: string
  /** 엑셀 Z열. 수기 유지 */
  remark: string
  /**
   * DD 행 연결. 값 기반 키라 DD 엑셀 재업로드 후에도 살아남는다.
   * R104에서 DD 쪽에도 optId를 심어 양방향으로 만든다.
   */
  ddLink?: { styleNo: string; opt: string }
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
  /** 덱 카드 날짜줄 우측에 표시할 부서(현재 TS 의뢰 부서에서 채움). */
  department?: string
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

/** 대장에 없는 건을 창고 화면에서 직접 등록할 때 쓰는 출처 표시. 대장 재업로드가 지우지 않는다. */
export const WEB_INTAKE_SHEET = "웹 등록"

export interface CompletedSample {
  /** 웹 저장용 고유 키. 엑셀 재업로드 없이도 유지되도록 파싱 시 부여한다(completedSampleId). */
  id?: string
  /** 샘플관리대장 창고보관·소진완료·폐기 시트의 4자리 R&D No. */
  storageNo?: string
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
  /** DD 레코드가 없는 과거 행을 창고 화면에 대장 그대로 보여주기 위한 원본 값. */
  ledger?: {
    /** 대장 원문. 창고 화면은 정규화된 값이 아니라 이 값을 보여준다. */
    seasonRaw?: string
    categoryRaw?: string
    originalRef?: string
    planner?: string
    yarnDetail?: string
    targetWeight?: number | null
    color?: string
    dyeingSide?: string
    dueDate?: string
    mills?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
    knitSpec?: { inch?: string; needles?: string; feeder?: string; loop?: string }
    greige?: { width?: number | null; weight?: number | null }
  }
}

/**
 * 완료 샘플의 안정적인 고유 키. FL#(정규화) 우선, 없으면 R&D No., 그것도 없으면 시트+스타일로 생성.
 * 엑셀 재업로드가 사라져도 웹 저장분을 이 값으로 식별·중복 판단한다.
 */
export function completedSampleId(sample: Pick<CompletedSample, "id" | "flNo" | "storageNo" | "styleNo" | "sourceSheet">): string {
  if (sample.id) return sample.id
  const fl = (sample.flNo ?? "").replace(/\s+/g, "").toUpperCase()
  if (fl) return `fl:${fl}`
  const rnd = (sample.storageNo ?? "").trim()
  if (rnd) return `rnd:${rnd}`
  return `s:${(sample.sourceSheet ?? "").trim()}:${(sample.styleNo ?? "").trim()}`
}

/** DD와 샘플관리대장을 하나의 업무 흐름으로 보여주기 위한 원단 상태. */
export type FabricLedgerStatus = "DEVELOPING" | "READY" | "WAREHOUSE" | "EXHAUSTED" | "DISPOSED" | "REMOVED"

export type FabricLedgerAction = "COMPLETE" | "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "OUTBOUND" | "EXHAUST" | "DISPOSE" | "RESTORE" | "REMOVE" | "NOTE"

/** 원본 엑셀은 그대로 두고 웹에서 변경한 운영 상태만 덧씌운다. */
export interface FabricLedgerOverride {
  key: string
  status: FabricLedgerStatus
  storageNo?: string
  yds?: number
  note?: string
  /**
   * 원단 상세에서 직접 고친 값. DD 레코드가 없는 샘플관리대장 행의 수정본이다.
   * DD가 붙은 행은 여기가 아니라 DevRecord에 저장한다(DD MASTER와 같이 움직여야 한다).
   */
  fields?: Record<string, string>
  updatedAt: string
  updatedBy: string
}

/** 모든 업무 처리는 이전/변경 상태를 남기는 추가형 이력으로 저장한다. */
export interface FabricLedgerEvent {
  id: string
  fabricKey: string
  action: FabricLedgerAction
  fromStatus: FabricLedgerStatus
  toStatus: FabricLedgerStatus
  /** 사용자가 고른 날짜(출고는 과거로 지정할 수 있다). 화면 표시에 쓴다. */
  occurredAt: string
  /**
   * 실제로 기록된 시각. 집계 순서는 이 값으로 정한다.
   * 배열 순서를 쓰면 안 된다. 팀 공유 병합이 새 기록을 배열 끝으로 보낼 수 있다.
   */
  recordedAt?: string
  actor: string
  note: string
  storageNo?: string
  qty?: number
  to?: string
  division?: string
  reason?: string
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

/** 팀 구성 — 담당자 드롭다운·필터·매트릭스의 기준 순서. 현재 재직 중인 3팀 담당자만 둔다. */
export const MEMBERS = [
  { id: "pkh", name: "박근후", role: "팀장" },
  { id: "phg", name: "박향근", role: "소팀장" },
  { id: "kjh", name: "김지현", role: "팀원" },
  { id: "bjh", name: "변재휘", role: "팀원" },
] as const

export type Member = (typeof MEMBERS)[number]

/**
 * 퇴사한 과거 3팀 담당자. 드롭다운·현재 담당자 목록에는 넣지 않는다.
 * 다만 과거 RDDA·DD 이력 집계에서는 3팀으로 인정해야 하므로 이 목록으로 보정한다.
 */
export const RETIRED_MEMBERS = ["이종현", "박세현", "진영은"] as const

/**
 * 샘플 개발 실적 보드(담당자별 현황·월별 트렌드) 전용 담당자 목록.
 * 박근후(팀장)는 샘플 개발을 직접 하지 않아 실적이 0이므로, 그 자리를 실제 개발 이력이 있는
 * 퇴사자 진영은으로 대체해 보여준다. 드롭다운·현재 담당자 목록(MEMBERS)과는 별개다.
 * `name`은 실데이터 매칭용(레코드 owner), `label`은 화면 표시용이다. 퇴사자는 이니셜로 익명 표기한다.
 */
export const SAMPLE_OWNERS = [
  { id: "jye", name: "진영은", label: "J", role: "팀원" },
  { id: "phg", name: "박향근", label: "박향근", role: "소팀장" },
  { id: "kjh", name: "김지현", label: "김지현", role: "팀원" },
  { id: "bjh", name: "변재휘", label: "변재휘", role: "팀원" },
] as const

/** 담당자 표시명 치환 규칙(실데이터 값 → 화면 표기). 퇴사자 익명화 등에 쓴다. */
const OWNER_DISPLAY_ALIASES = new Map<string, string>([["진영은", "J"]])

/**
 * 담당자 표시명. 실데이터의 owner/advisor 값을 화면 표기로 바꾼다(집계·매칭에는 쓰지 않는다).
 * "진영은/박근후"처럼 슬래시로 이어진 복수 담당자도 토큰별로 치환한다.
 */
export const ownerDisplayName = (name: string): string =>
  (name ?? "")
    .split("/")
    .map((part) => {
      const trimmed = part.trim()
      return OWNER_DISPLAY_ALIASES.get(trimmed) ?? trimmed
    })
    .join("/")

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
