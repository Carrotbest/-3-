import { toDate } from "./format"
import type { DevRecord } from "./schema"

export const DD_STATUS_OPTIONS = ["진행중", "완료", "HOLD", "DROP", "REJECT"] as const

/** Status별 컬러 블럭. 현황판에서 상태를 색으로 즉시 식별한다(볼드 대신 색 구분).
 *  실 DD Status(진행중·완료·HOLD·DROP·REJECT)와 시드/공정단계(원사~시험)를 모두 색 매핑해
 *  어느 어휘가 들어와도 블럭이 명확히 보인다. */
export const DD_STATUS_STYLE: Record<string, { label: string; block: string; dot: string; row: string }> = {
  진행중: { label: "진행중", block: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30", dot: "bg-sky-500", row: "border-l-sky-500" },
  완료: { label: "완료", block: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30", dot: "bg-emerald-500", row: "border-l-emerald-500" },
  HOLD: { label: "HOLD", block: "bg-amber-500/18 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/35", dot: "bg-amber-500", row: "border-l-amber-500" },
  DROP: { label: "DROP", block: "bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-500/30", dot: "bg-slate-500", row: "border-l-slate-400" },
  REJECT: { label: "REJECT", block: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/30", dot: "bg-rose-500", row: "border-l-rose-500" },
  원사: { label: "원사", block: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/30", dot: "bg-violet-500", row: "border-l-violet-500" },
  편직: { label: "편직", block: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-500/30", dot: "bg-indigo-500", row: "border-l-indigo-500" },
  염색: { label: "염색", block: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-500/30", dot: "bg-cyan-500", row: "border-l-cyan-500" },
  가공: { label: "가공", block: "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-teal-500/30", dot: "bg-teal-500", row: "border-l-teal-500" },
  시험: { label: "시험", block: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30", dot: "bg-amber-400", row: "border-l-amber-400" },
}

export function ddStatusStyle(status: string | undefined): { label: string; block: string; dot: string; row: string } {
  const key = String(status ?? "").trim()
  return DD_STATUS_STYLE[key] ?? { label: key || "미지정", block: "bg-[var(--muted)] text-[var(--muted-foreground)] ring-1 ring-inset ring-[var(--border)]", dot: "bg-[var(--muted-foreground)]", row: "border-l-transparent" }
}
export const DD_SEASON_OPTIONS = ["SS'26", "FW'26", "SS'27", "FW'27", "SS'28", "FW'28", "SS'29", "FW'29"] as const
export const DD_CATEGORY_OPTIONS = ["EU MARKET", "SEASON", "CORE", "PROJECT"] as const
export const DD_COMPANY_OPTIONS = ["GD", "국내", "생산"] as const
export const DD_DYEING_OPTIONS = ["SD", "DD", "PSD", "YD", "SOAP", "PFD", "기타"] as const
export const DD_PASS_FAIL_OPTIONS = ["PASS", "FAIL"] as const

const normalizedStatus = (record: DevRecord): string => String(record.devStatus ?? "").trim().toUpperCase()
const identity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

function dayValue(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function reached(value: string | undefined, today: Date): boolean {
  const date = toDate(value)
  return Boolean(date && dayValue(date) <= dayValue(today))
}

/**
 * 담당자 DD의 행 수식을 웹 데이터에 재현한다.
 * C열 옵션순번, AN열 완료/전체, AR열 실측 Balance와 공정 도달 상태를 매 저장 때 다시 계산한다.
 */
export function recalculateDevelopmentRecords(records: readonly DevRecord[], today = new Date()): DevRecord[] {
  const groups = new Map<string, DevRecord[]>()
  records.forEach((record) => {
    const styleNo = record.styleNo.normalize("NFKC").trim().toUpperCase()
    // Style No.가 없는 빈 행끼리 한 옵션 그룹으로 묶여 순번이 누적되지 않게 계산에서 제외한다.
    if (!styleNo) return
    const key = `${record.owner.normalize("NFKC")}::${styleNo}`
    const list = groups.get(key) ?? []
    list.push(record)
    groups.set(key, list)
  })

  const calculated = new Map<string, { opt: string; optionProgress: string }>()
  groups.forEach((group) => {
    const sorted = [...group].sort((left, right) => left._src.row - right._src.row)
    const done = sorted.filter((record) => normalizedStatus(record) === "완료").length
    sorted.forEach((record, index) => calculated.set(identity(record), { opt: String(index + 1), optionProgress: `${done} / ${sorted.length}` }))
  })

  return records.map((record) => {
    const hasStyleNo = Boolean(record.styleNo.normalize("NFKC").trim())
    const processDates = record.tech?.processDates
    const processReached = {
      yarn: Boolean(record.flNo) || reached(processDates?.yarn, today),
      knitting: Boolean(record.flNo) || reached(processDates?.knitting, today),
      dyeing: Boolean(record.flNo) || reached(processDates?.dyeing, today),
      finishing: Boolean(record.flNo) || reached(processDates?.finishing, today),
    }
    const stage = hasStyleNo
      ? record.flNo
        ? "완료"
        : processReached.finishing ? "가공"
          : processReached.dyeing ? "염색"
            : processReached.knitting ? "편직"
              : "원사"
      : record.stage
    const formula = calculated.get(identity(record))
    const targetWeight = typeof record.weight === "number" ? record.weight : Number(record.weight)
    const actualWeight = record.tech?.actual?.weight
    const balance = targetWeight && typeof actualWeight === "number" ? (actualWeight - targetWeight) / targetWeight : record.tech?.actual?.balance
    const tech = {
      ...record.tech,
      optionProgress: hasStyleNo ? formula?.optionProgress ?? record.tech?.optionProgress : "",
      actual: record.tech?.actual ? { ...record.tech.actual, balance } : record.tech?.actual,
    }
    return { ...record, opt: hasStyleNo ? formula?.opt ?? record.opt : "", stage, processReached, tech }
  })
}

export interface DdWarning {
  key: "status" | "due" | "fl" | "arrange" | "fail" | "process"
  label: string
}

/** Excel 조건부 서식과 입력 쌍 규칙을 행 단위 경고로 변환한다. */
export function ddWarnings(record: DevRecord, today = new Date()): DdWarning[] {
  const warnings: DdWarning[] = []
  const status = normalizedStatus(record)
  const due = toDate(record.dueDate)
  if (record.receivedDate && !["완료", "REJECT"].includes(status)) warnings.push({ key: "status", label: "완료일 입력 · Status 확인" })
  if (due && dayValue(due) < dayValue(today) && status !== "완료") warnings.push({ key: "due", label: "Due Date 경과" })
  if (record.receivedDate && !record.flNo.trim() && status !== "DROP") warnings.push({ key: "fl", label: "FL 미입력" })
  if (record.tech?.arrangeNo && record.tech?.development?.co && record.tech.development.co !== "GD") warnings.push({ key: "arrange", label: "Arrange#는 GD만 입력" })
  if (record.tech?.passFail === "FAIL" && !record.tech.failReason) warnings.push({ key: "fail", label: "Fail 사유 미입력" })

  const pairs = [
    [record.tech?.mills?.yarn, record.tech?.processDates?.yarn],
    [record.tech?.mills?.knitting, record.tech?.processDates?.knitting],
    [record.tech?.mills?.dyeing, record.tech?.processDates?.dyeing],
    [record.tech?.mills?.finishing, record.tech?.processDates?.finishing],
  ]
  if (pairs.some(([mill, date]) => Boolean(mill) !== Boolean(date))) warnings.push({ key: "process", label: "공정 업체·날짜 짝 미완성" })
  return warnings
}

export function receivedDevelopment(record: DevRecord): DevRecord {
  const today = new Date().toISOString().slice(0, 10)
  return { ...record, devStatus: "진행중", requestDate: record.requestDate || today }
}

export function completedDevelopment(record: DevRecord): DevRecord {
  const today = new Date().toISOString().slice(0, 10)
  return { ...record, devStatus: "완료", receivedDate: record.receivedDate || today }
}

let webIntakeSeq = 0

/** 웹에서 새 작지를 접수할 때 쓰는 빈 레코드. _src 는 웹 접수 전용 네임스페이스로 고유 식별한다.
 *  옵션 여러 개를 같은 밀리초에 만들어도 충돌하지 않도록 순번을 더한다. */
export function createBlankDevRecord(owner = ""): DevRecord {
  const today = new Date().toISOString().slice(0, 10)
  return {
    styleNo: "", opt: "1", season: "", category: "", buyer: "", owner, planner: "",
    gdNo: "", saNo: "", construction: "", weight: "", color: "", dyeing: "",
    stage: "접수", dueDate: "", flNo: "", note: "",
    devStatus: "진행중", requestDate: today, receivedDate: "",
    _src: { sheet: "웹 접수", row: Date.now() * 1000 + (webIntakeSeq++ % 1000) },
  }
}
