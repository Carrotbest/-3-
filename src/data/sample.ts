/* sample.ts — 공개 저장소용 더미 데이터
   실데이터는 절대 여기 넣지 않는다. 단가·협력사명도 포함하지 않는다.
   시드 고정이라 새로고침해도 값이 바뀌지 않는다. */

import type { DataAnomaly } from "./derive"
import type { ReconcileCheck } from "./reconcile"
import { CATEGORIES, MEMBERS, type CompletedSample, type DevRecord, type FabricAnalysisRow } from "./schema"

export type SampleDevType = "GD" | "국내"
export type SampleDevRecord = DevRecord & { devType: SampleDevType }

let seed = 20260803
const rnd = (): number =>
  ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]
const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1))

const BUYERS = ["Walmart", "Kohl's", "Target", "H&M", "Costco", "Decathlon"] as const
const CONSTRUCTIONS = [
  "Interlock",
  "Single Jersey",
  "Rib 1x1",
  "Fleece",
  "Terry",
  "Mesh",
  "Ponte",
] as const
const COLORS = ["Black", "Navy", "Heather Grey", "Olive", "Off White", "Burgundy"] as const
const DYEING = ["Piece", "Yarn", "Solution", "Garment"] as const
const STAGE_LABELS = ["원사", "편직", "염색", "가공", "시험", "완료"] as const
const SEASONS = ["SS'27", "FW'27", "SS'26", "FW'26"] as const

const iso = (date: Date): string => date.toISOString().slice(0, 10)
const shift = (days: number): string => iso(new Date(Date.now() + days * 86400000))

export function sampleRecords(n = 48): SampleDevRecord[] {
  seed = 20260803
  const records: SampleDevRecord[] = []
  const domesticTarget = Math.round(n * 0.18)
  const isDomestic = (index: number): boolean =>
    n > 0 &&
    Math.floor(((index + 1) * domesticTarget) / n) >
      Math.floor((index * domesticTarget) / n)
  for (let i = 0; i < n; i++) {
    const category = pick(CATEGORIES)
    const prefix = category === "EU MARKET" ? "EU" : category === "PROJECT" ? "PJ" : "GD"
    const stageIndex = int(0, 5)
    records.push({
      styleNo: `${prefix}26-${1000 + i * 7}`,
      opt: String(int(1, 3)).padStart(2, "0"),
      season: pick(SEASONS),
      category,
      buyer: category === "PROJECT" ? "내부" : pick(BUYERS),
      owner: pick(MEMBERS).name,
      planner: "데모 플래너",
      gdNo: `GD-${4300 + i * 3}`,
      saNo: `SA-${1100 + i * 2}`,
      construction: pick(CONSTRUCTIONS),
      weight: int(110, 340),
      color: pick(COLORS),
      dyeing: pick(DYEING),
      stage: STAGE_LABELS[stageIndex],
      devType: isDomestic(i) ? "국내" : "GD",
      requestDate: shift(-(i % 9 === 0 ? int(0, 6) : int(7, 330))),
      dueDate: shift(int(-9, 45)),
      flNo: stageIndex >= 4 ? `FL-26${String(i).padStart(3, "0")}` : "",
      receivedDate: stageIndex >= 4 ? shift(-(i % 56)) : "",
      note: "",
      _src: { sheet: `${pick(MEMBERS).name} 시트`, row: 12 + i * 3 },
    })
  }
  return records
}

/** 원단분석 내보낸 파일 연결 전 HOME 검증용 더미. */
export function sampleFabricAnalysis(): FabricAnalysisRow[] {
  return [
    { anNo: "AN-DEMO-001", requestDate: shift(-1), completeDate: shift(0), item: "혼용률 분석", owner: MEMBERS[0].name },
    { anNo: "AN-DEMO-002", requestDate: shift(-3), completeDate: "", item: "중량 확인", owner: MEMBERS[1].name },
    { anNo: "AN-DEMO-003", requestDate: shift(-6), completeDate: shift(-2), item: "조직 분석", owner: MEMBERS[2].name },
    { anNo: "AN-DEMO-004", requestDate: shift(-12), completeDate: shift(-5), item: "염색 견뢰도", owner: MEMBERS[3].name },
    { anNo: "AN-DEMO-005", requestDate: shift(-20), completeDate: shift(-15), item: "수축률 분석", owner: MEMBERS[0].name },
  ]
}

const COMPLETED_KNIT = [
  "28GG Single Knit",
  "24GG Interlock",
  "20GG Rib Knit",
  "18GG Terry Knit",
] as const
const COMPLETED_DYE = [
  "Reactive Piece Dye",
  "Disperse Piece Dye",
  "Yarn Dye",
  "Solution Dye",
] as const
const COMPLETED_FINISH = [
  "Bio Wash + Compact",
  "Heat Set + Softener",
  "Peach + Tumble",
  "Brush + Shear",
] as const
const COMPLETED_REMARK = [
  "개발 검증용 더미 공정 이력",
  "유사 조직 비교용 더미 샘플",
  "재개발 참고용 더미 기록",
] as const

/** 완료 샘플 라이브러리용 고정 시드 더미 데이터. */
export function sampleCompleted(n = 24): CompletedSample[] {
  const count = Math.max(0, Math.floor(n))
  const baseRecords = sampleRecords(count)
  seed = 260804

  return baseRecords.map((record, index) => ({
    styleNo: record.styleNo,
    flNo: record.flNo || `FL-26${String(300 + index).padStart(3, "0")}`,
    season: record.season,
    category: record.category,
    buyer: record.buyer,
    owner: record.owner,
    construction: record.construction,
    process: {
      knit: pick(COMPLETED_KNIT),
      dye: pick(COMPLETED_DYE),
      finish: pick(COMPLETED_FINISH),
      remark: pick(COMPLETED_REMARK),
    },
    inhouse: {
      widthCm: int(150, 190),
      weightGsm: typeof record.weight === "number" ? record.weight : int(110, 340),
      shrinkagePct: Number((-2 + rnd() * 6).toFixed(1)),
      pilling: int(3, 5),
    },
    completedAt: new Date(Date.UTC(2026, 6, 31 - index)).toISOString(),
    requestDate: new Date(Date.UTC(2026, Math.max(0, 6 - Math.floor(index / 4)), 4 + (index % 20))).toISOString(),
  }))
}

export interface TrendItem {
  title: string
  tag: string
  date: string
  image: string
  source: string
}

/** 외부 트렌드 소스 연결 전 레이아웃 검증용 공개 더미. */
export function sampleTrends(): TrendItem[] {
  return [
    { title: "바이오 기반 발수 가공의 상용화", tag: "FINISHING", date: "2026-08-01", image: "", source: "R&D 데모" },
    { title: "저온 염색 공정과 에너지 절감", tag: "DYEING", date: "2026-07-28", image: "", source: "R&D 데모" },
    { title: "경량 스트레치 조직 개발 방향", tag: "KNITTING", date: "2026-07-22", image: "", source: "R&D 데모" },
    { title: "재생 원사 추적성 표준 동향", tag: "MATERIAL", date: "2026-07-16", image: "", source: "R&D 데모" },
  ]
}

export type TsState = "접수" | "처리중" | "완료"

export interface TsRecord {
  id: string
  receivedAt: string
  subject: string
  from: string
  relatedDepartment: string
  attn: string
  advisor: string
  inquiry: string
  analysis: string
  causes: string
  action: string
  result: string
  productionSite: string
  orderVolume: string
  attachment?: string
  state: TsState
  source?: "excel" | "web"
}

export function sampleTs(): TsRecord[] {
  seed = 771
  const subjects = [
    "이색 클레임",
    "신축 회복 불량",
    "Pilling 등급 문의",
    "수축률 초과",
    "봉제부 터짐",
    "발수 지속성",
  ] as const
  const froms = ["사업10부 3팀", "Walmart", "Kohl's", "협력사(편직)", "사업7부 1팀"] as const
  const inquiries = ["발생 조건과 재현 여부 확인 요청", "원단 물성 및 공정 조건 검토 요청", "품질 기준 충족 여부와 개선 방향 문의"] as const
  const analyses = ["공정 이력과 시험 결과를 비교 검토함", "발생 구간별 조건 차이를 확인함", "유사 사례와 원단 상태를 함께 분석함"] as const
  const causes = ["공정 조건 편차 가능성", "원단 물성 편차 영향", "작업 조건과 소재 특성의 복합 영향"] as const
  const actions = ["관련 조건을 조정하고 재시험 진행", "관리 기준을 보완해 후속 생산에 적용", "재현 시험 후 개선 조건을 안내"] as const
  const results = ["개선 조건 적용 후 결과 확인", "후속 생산 모니터링 진행", "검토 결과와 관리 기준 회신"] as const
  const productionSites = ["국내", "베트남", ""] as const
  const states = ["접수", "처리중", "완료"] as const
  return Array.from({ length: 16 }, (_, i) => {
    const state = i < 2 ? states[0] : i < 5 ? states[1] : states[2]
    return {
      id: `TS26-${String(18 - i).padStart(3, "0")}`,
      receivedAt: shift(-(i * 4 + 2)),
      subject: pick(subjects),
      from: pick(froms),
      relatedDepartment: pick(froms),
      attn: i % 2 === 0 ? pick(froms) : "",
      advisor: pick(MEMBERS).name,
      inquiry: pick(inquiries),
      analysis: state === "접수" ? "" : pick(analyses),
      causes: state === "접수" ? "" : pick(causes),
      action: state === "완료" ? pick(actions) : "",
      result: state === "완료" ? pick(results) : "",
      productionSite: pick(productionSites),
      orderVolume: i % 4 === 0 ? "후속 오더 검토 중" : "",
      state,
      source: "web" as const,
    }
  })
}

export type StudyCategory = "품질사고" | "공정 개념" | "환경" | "특정분야"
export type StudyState = "완료" | "진행" | "계획" | "미진행"

export interface StudyRecord {
  week: number
  owner: string
  topic: string
  category: StudyCategory
  state: StudyState
  dueDate: string
}

export function sampleStudy(): StudyRecord[] {
  seed = 4412
  const topics = [
    "이색 발생 공정 구간 정리",
    "Span 수치와 신축 회복률",
    "RDS 인증 요구 항목",
    "가공 전후 중량 변화",
    "니트 컬링 원인",
    "재생 폴리 원사 비교",
    "봉제 터짐 사고 사례",
    "발수 가공 내구성",
    "염색 견뢰도 기준",
  ] as const
  const categories = ["품질사고", "공정 개념", "환경", "특정분야"] as const
  const states = ["완료", "완료", "진행", "계획", "미진행"] as const
  const rows: StudyRecord[] = []
  ;[29, 30, 31].forEach((week) => {
    MEMBERS.filter((member) => member.role === "팀원").forEach((member) => {
      rows.push({
        week,
        owner: member.name,
        topic: pick(topics),
        category: pick(categories),
        state: week === 31 ? pick(["진행", "계획"] as const) : pick(states),
        dueDate: shift((week - 31) * 7 + 3),
      })
    })
  })
  return rows
}

export type EventType = "meeting" | "due" | "external" | "leave" | "trip"

export interface CalendarEvent {
  id?: string
  date: string
  type: EventType
  title: string
  time?: string
  place?: string
  owner?: string
}

export function sampleEvents(): CalendarEvent[] {
  return [
    { id: "demo-team-meeting-weekly", date: shift(0), type: "meeting", title: "팀 주간 점검 미팅", time: "10:00", place: "회의실 A", owner: MEMBERS[0].name },
    { date: shift(0), type: "due", title: "GD26-1042 납기" },
    { id: "demo-team-external-review", date: shift(1), type: "external", title: "EU Sample Review", time: "15:00", owner: MEMBERS[1].name },
    { id: "demo-team-leave", date: shift(2), type: "leave", title: "연차", owner: MEMBERS[2].name },
    { date: shift(3), type: "due", title: "GD26-1057 납기" },
    { id: "demo-team-trip", date: shift(5), type: "trip", title: "협력사 출장", time: "09:00", place: "데모 협력사", owner: MEMBERS[3].name },
    { id: "demo-team-meeting-rnd", date: shift(8), type: "meeting", title: "R&D 미팅", time: "14:00", owner: MEMBERS[0].name },
    { date: shift(9), type: "due", title: "EU-026 납기" },
  ]
}

export interface RddaMonthly {
  month: string
  registered: number
  meeting: number
  pickup: number
}

export interface RddaCumulative {
  year: number
  stored: number
  used: number
  discarded: number
}

export interface RddaYearly {
  year: number
  suggested: number
  pickup: number
  rate: number
}

export interface RddaDistribution {
  label: string
  count: number
}

export interface RddaBestItem {
  rank: number
  flNo: string
  construction: string
  weight: number | null
  pickupCount: number
  meetingCount: number
  pickup: number
  meeting: number
  unitPrice: number | null
  vendor: string | null
}

export type RddaScope = "all" | "team3"

export interface RddaCustomerMetric {
  name: string
  pickupCount: number
  meetingCount: number
  rate: number
}

export interface RddaPerspective {
  meetingTotal: number
  pickupTotal: number
  pickupRate: number
  pickupByCustomer: RddaCustomerMetric[]
  origin: RddaDistribution[]
  bestItems: RddaBestItem[]
}

export interface RddaSnapshot {
  month: number
  meeting: number
  pickup: number
  rate: number
}

export interface RddaReport {
  source: "sample" | "folder"
  latestMonth: number | null
  perspectives: Record<RddaScope, RddaPerspective>
  snapshots: RddaSnapshot[]
  /** 아래 필드는 HOME 등 기존 소비자와의 호환을 위해 전체 관점으로 유지한다. */
  monthly: RddaMonthly[]
  yearly: RddaYearly[]
  cumulative: RddaCumulative[]
  origin: RddaDistribution[]
  byCustomer: RddaDistribution[]
  byMember: RddaDistribution[]
  construction: RddaDistribution[]
  bestItems: RddaBestItem[]
}

/* RDDA REPORT — 부서 전체 원단 등록·미팅·픽업 실적.
   unitPrice·vendor는 민감 필드다. sensitiveUnlocked가 false면 뷰가 그리지 않는다. */
export function sampleRdda(): RddaReport {
  seed = 90210
  const snapshots: RddaSnapshot[] = [
    { month: 3, meeting: 121, pickup: 65, rate: 53.7 },
    { month: 4, meeting: 184, pickup: 105, rate: 57.1 },
    { month: 5, meeting: 247, pickup: 149, rate: 60.3 },
    { month: 6, meeting: 318, pickup: 197, rate: 61.9 },
  ]
  const bestItems = Array.from({ length: 8 }, (_, i) => {
    const pickup = 11 - Math.floor(i / 2)
    const meeting = pickup + 5 + i
    return {
      rank: Math.floor(i / 2) * 2 + 1,
      flNo: `FL-25${String(140 + i * 9).padStart(3, "0")}`,
      construction: [
        "Interlock",
        "Single Jersey",
        "Fleece",
        "Rib 1x1",
        "Terry",
        "Mesh",
        "Ponte",
        "Pique",
      ][i],
      weight: int(130, 320),
      pickupCount: pickup,
      meetingCount: meeting,
      pickup,
      meeting,
      unitPrice: null,
      vendor: null,
    }
  })
  const allCustomers: RddaCustomerMetric[] = [
    { name: "Walmart", pickupCount: 55, meetingCount: 82, rate: 67.1 },
    { name: "Kohl's", pickupCount: 44, meetingCount: 71, rate: 62.0 },
    { name: "Target", pickupCount: 38, meetingCount: 64, rate: 59.4 },
    { name: "H&M", pickupCount: 31, meetingCount: 55, rate: 56.4 },
    { name: "기타", pickupCount: 29, meetingCount: 46, rate: 63.0 },
  ]
  const allOrigin = [
    { label: "국내", count: 109 },
    { label: "베트남", count: 86 },
    { label: "중국", count: 72 },
    { label: "인도네시아", count: 32 },
    { label: "기타", count: 19 },
  ]
  const teamCustomers: RddaCustomerMetric[] = [
    { name: "Walmart", pickupCount: 37, meetingCount: 58, rate: 63.8 },
    { name: "Kohl's", pickupCount: 31, meetingCount: 52, rate: 59.6 },
    { name: "Target", pickupCount: 24, meetingCount: 43, rate: 55.8 },
    { name: "H&M", pickupCount: 18, meetingCount: 34, rate: 52.9 },
    { name: "기타", pickupCount: 14, meetingCount: 24, rate: 58.3 },
  ]
  const teamOrigin = [
    { label: "국내", count: 74 },
    { label: "베트남", count: 56 },
    { label: "중국", count: 45 },
    { label: "인도네시아", count: 23 },
    { label: "기타", count: 13 },
  ]
  return {
    source: "sample",
    latestMonth: 6,
    perspectives: {
      all: {
        meetingTotal: 318,
        pickupTotal: 197,
        pickupRate: 61.9,
        pickupByCustomer: allCustomers,
        origin: allOrigin,
        bestItems,
      },
      team3: {
        meetingTotal: 211,
        pickupTotal: 124,
        pickupRate: 58.8,
        pickupByCustomer: teamCustomers,
        origin: teamOrigin,
        bestItems: bestItems.slice(0, 6),
      },
    },
    snapshots,
    monthly: snapshots.map(({ month, meeting, pickup }) => ({
      month: `2026.${String(month).padStart(2, "0")}`,
      registered: meeting,
      meeting,
      pickup,
    })),
    yearly: [{ year: 2026, suggested: 318, pickup: 197, rate: 61.9 }],
    cumulative: [{ year: 2026, stored: 318, used: 197, discarded: 0 }],
    origin: allOrigin,
    byCustomer: allCustomers.map((row) => ({ label: row.name, count: row.pickupCount })),
    byMember: MEMBERS.map((member, index) => ({ label: member.name, count: 91 - index * 9 })),
    construction: [
      { label: "Single Jersey", count: 152 },
      { label: "Interlock", count: 118 },
      { label: "Fleece", count: 97 },
      { label: "Rib", count: 84 },
      { label: "Terry", count: 71 },
      { label: "Mesh", count: 41 },
    ],
    bestItems,
  }
}

/** 데모 모드에서도 동기화 화면이 비지 않도록 대조 결과 5종을 채워 둔다. */
export function sampleChecks(total = 48): ReconcileCheck[] {
  return [
    { name: "담당자별 시트 합", excel: total, applied: total, diff: 0, ok: true, note: "박향근 14 · 김지현 12 · 변재휘 11 · 진영은 11" },
    { name: "전체 현황 시트 합", excel: total, applied: total, diff: 0, ok: true, note: "Overview" },
    { name: "카테고리별 합", excel: total, applied: total, diff: 0, ok: true, note: "미분류 없음" },
    { name: "시즌별 합", excel: total, applied: total, diff: 0, ok: true, note: "SS'27 18 · FW'27 14 · SS'26 9 · FW'26 7" },
    { name: "Opt 단위 행 수", excel: total, applied: total, diff: 0, ok: true, note: "중복 없음" },
  ]
}

export type HistoryState = "사용 중" | "전송 안 됨" | "교체됨"

export interface ApplyHistoryEntry {
  appliedAt: string
  appliedBy: string
  fileName: string
  count: number | null
  passed: boolean
  state: HistoryState
  reason: string | null
}

/** 반영 이력 — 최근 3건. 가운데 1건은 대조 실패로 전송이 막힌 사례다. */
export function sampleHistory(): ApplyHistoryEntry[] {
  const at = (day: number, hour: number, minute: number): string =>
    new Date(2026, 7, day, hour, minute).toISOString()
  return [
    { appliedAt: at(3, 8, 40), appliedBy: "박향근", fileName: "통원부3팀 TDS.xlsx", count: 48, passed: true, state: "사용 중", reason: null },
    { appliedAt: at(2, 17, 20), appliedBy: "박향근", fileName: "통원부3팀 TDS.xlsx", count: null, passed: false, state: "전송 안 됨", reason: "담당자별 시트 합 3건 차이 (진영은 · SEASON)" },
    { appliedAt: at(1, 9, 5), appliedBy: "팀장", fileName: "통원부3팀 TDS.xlsx", count: 45, passed: true, state: "교체됨", reason: null },
  ]
}

export type DataMode = "demo" | "tds"

export interface DataMeta {
  mode: DataMode
  fileName: string | null
  appliedAt: Date | string | null
  appliedBy: string | null
  passed: boolean
  checks: ReconcileCheck[]
  anomalies: DataAnomaly[]
  history: ApplyHistoryEntry[]
}

export function sampleMeta(): DataMeta {
  return {
    mode: "demo",
    fileName: null,
    appliedAt: null,
    appliedBy: null,
    passed: true,
    checks: sampleChecks(),
    anomalies: [],
    history: sampleHistory(),
  }
}
