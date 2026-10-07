import { isDateValue, toDate } from "./format"
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
  // REJECT 는 반려로 끝난 종료건이다. 빨강은 "지금 조치가 필요하다"는 뜻이라 DROP 과 같은 회색으로 맞춘다(2026-10-06 박향근 확정).
  REJECT: { label: "REJECT", block: "bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-500/30", dot: "bg-slate-500", row: "border-l-slate-400" },
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

/** Category별 글자색. 블럭·배경을 두면 Status 칩과 색이 부딪히므로 텍스트 색만 바꾼다.
 *  SEASON=블루, CORE=레드, PROJECT=오렌지, EU MARKET=그린. */
export const DD_CATEGORY_TEXT: Record<string, string> = {
  SEASON: "text-blue-500",
  CORE: "text-red-500",
  PROJECT: "text-orange-500",
  "EU MARKET": "text-green-500",
}

/** 목록에 없는 값은 색을 주지 않고 기본 글자색으로 둔다. */
export function ddCategoryTextClass(category: string | undefined): string {
  return DD_CATEGORY_TEXT[String(category ?? "").trim().toUpperCase()] ?? ""
}
export const DD_COMPANY_OPTIONS = ["GD", "국내", "생산"] as const
export const DD_DYEING_OPTIONS = ["CSD", "PSD", "DD", "SOAP", "YD", "PFD"] as const
export const DD_PASS_FAIL_OPTIONS = ["PASS", "FAIL"] as const

/**
 * 완료로 인정하는 FL 번호인지 본다. 공백을 걷고 대문자로 맞춘 뒤 FL + 숫자 8자리만 통과시킨다.
 * "확인중", "FL 대기" 같은 메모가 들어간 칸을 완료로 올리지 않기 위한 것이다.
 * 채번 규칙(`FL+YY+MM+4자리`)과 자릿수가 같다. RDDA 집계 기준은 건드리지 않는다.
 */
/**
 * 개발처가 GD인가. `Co` 값이 비어 있으면 `devType`으로 본다.
 * FDS·YDS 공정과 창고 입고 대기 판정이 이 값으로 갈린다.
 */
export function isGdRecord(record: DevRecord): boolean {
  return String(record.tech?.development?.co || record.devType || "").trim().toUpperCase() === "GD"
}

export function isCompletedFlNo(flNo: string | undefined): boolean {
  return /^FL\d{8}$/.test(String(flNo ?? "").replace(/\s+/g, "").toUpperCase())
}

const normalizedStatus = (record: DevRecord): string => String(record.devStatus ?? "").trim().toUpperCase()
const identity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

/**
 * 사람이 멈춘 행인가. HOLD·DROP·REJECT 다.
 * 이 행들은 경고를 띄우지 않는다. 받을 것도 채울 것도 없는데 삼각형이 붙으면
 * 진짜로 빠뜨린 건과 섞여 경고 전체가 무의미해진다(2026-10-06 박향근 확정).
 * 판정 어휘는 `derive.ts` `isScheduleOpen` 과 같게 유지한다.
 */
/**
 * 멈춘 행의 상태를 DD 원문 표기로 돌려준다. 멈춘 행이 아니면 null이다.
 * 옛 한글 표기 "보류"는 HOLD로 받는다(R316과 같은 규칙).
 *
 * **표시 전용이다. 이 글자를 셀 값으로 저장하지 말 것.** FL# 칸에 글자가 들어가면 원장이
 * 그 글자로 행을 묶는다. 2026-10-02에 DD FL 칸에 DROP을 붙여넣어 창고보관 3건이 사라지고
 * 1건이 다른 원단으로 보였다(R287~R290). DD FL#는 새 입력에 FL+8자리만 받는다.
 */
export function stoppedStatusLabel(record: DevRecord): "HOLD" | "DROP" | "REJECT" | null {
  const status = normalizedStatus(record).replace(/\s+/g, "")
  if (status === "HOLD" || status === "보류") return "HOLD"
  if (status === "DROP") return "DROP"
  if (status === "REJECT") return "REJECT"
  return null
}
/** 판정과 표기가 갈라지지 않게 `stoppedStatusLabel` 하나만 본다. */
export function isStoppedRecord(record: DevRecord): boolean {
  return stoppedStatusLabel(record) !== null
}

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
    // 완료 판정은 결과 RESULT의 FL#이 형식에 맞을 때만이다. 메모가 적힌 칸은 완료가 아니다.
    const flDone = isCompletedFlNo(record.flNo)
    const processDates = record.tech?.processDates
    const processReached = {
      yarn: flDone || reached(processDates?.yarn, today),
      knitting: flDone || reached(processDates?.knitting, today),
      dyeing: flDone || reached(processDates?.dyeing, today),
      finishing: flDone || reached(processDates?.finishing, today),
    }
    const stage = hasStyleNo
      ? flDone
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
    // 자동으로는 올리기만 한다. 유효한 FL#이 들어오면 완료로 올린다.
    // **사람이 고른 상태는 절대 내리지 않는다.** FL 없이 YDS만 입고해 두는 경우가 있어
    // 수동 완료를 그대로 둬야 한다. HOLD·DROP·REJECT도 같은 이유로 유지한다.
    const currentStatus = normalizedStatus(record)
    const devStatus = flDone && (!currentStatus || currentStatus === "진행중")
      ? "완료"
      : record.devStatus
    return { ...record, devStatus, opt: hasStyleNo ? formula?.opt ?? record.opt : "", stage, processReached, tech }
  })
}

export interface DdWarning {
  key: "due" | "fl" | "arrange" | "fail" | "process" | "dateFormat"
  label: string
}

/** Excel 조건부 서식과 입력 쌍 규칙을 행 단위 경고로 변환한다. */
export function ddWarnings(record: DevRecord, today = new Date()): DdWarning[] {
  const warnings: DdWarning[] = []
  const status = normalizedStatus(record)
  const received = String(record.receivedDate ?? "").trim().length > 0

  // Fail 사유는 종료 행에서도 띄운다. REJECT 는 대개 FAIL 의 결과라, 사유가 비면
  // 왜 반려됐는지 나중에 추적할 길이 없다(2026-10-06 박향근 확정).
  if (record.tech?.passFail === "FAIL" && !record.tech.failReason) warnings.push({ key: "fail", label: "Fail 사유 미입력" })

  // HOLD·DROP·REJECT 는 여기서 끝낸다. 아래 경고는 모두 "지금 조치하라"는 뜻이다.
  if (isStoppedRecord(record)) return warnings

  // Style History 에 사유를 적었으면 FL 경고를 끈다.
  // "Matching RIB으로 등록 불필요"처럼 FL을 안 딴 이유가 기록된 건이다.
  const explained = String(record.tech?.styleHistory ?? "").trim().length > 0
  // FL 채번은 FDS 를 받아야 가능하다. GD 건은 FDS 날짜가 들어온 뒤부터 묻는다.
  // FDS·YDS 열은 GD 전용(`GD_ONLY_COLUMN_IDS`)이라 국내·생산 건은 채울 수 없다.
  // 그 쪽은 실물 도착(Received date)을 기준으로 둔다. **두 기준을 하나로 합치지 말 것.**
  // FDS 하나로 합치면 국내·생산 건이 경고 대상에서 통째로 빠진다(2026-10-06 박향근 확정, R298).
  const flGate = isGdRecord(record)
    ? String(record.tech?.sampleDates?.fds ?? "").trim().length > 0
    : received
  const flMissing = flGate && !isCompletedFlNo(record.flNo) && !explained
  if (flMissing) warnings.push({ key: "fl", label: record.flNo.trim() ? "FL 형식 확인" : "FL 미등록" })
  // **`완료일 입력 · Status 확인` 경고는 없앴다**(2026-10-06 박향근 지시, R299).
  // `Received date 있음 + Status ≠ 완료` 로 떴는데, 화면 완료 기준은 FL#이라 FL 채번 전인 행은
  // 완료가 아닌 것이 정상이다. `recalculateDevelopmentRecords` 도 유효한 FL# 없이는 완료로 올리지 않아
  // 담당자가 경고를 끄려면 규칙을 어겨야 했다. R298 로 FL 경고 기준이 FDS 로 바뀐 뒤에는
  // FDS 대기 중인 GD 행에서 FL 경고 자리를 그대로 이어받아 글자만 바뀐 꼴이 됐다. **되살리지 말 것.**

  // 행거가 도착한 건은 일정이 닫힌 것으로 본다. HOME 임박·지연(`derive.ts` `isScheduleOpen`)과 기준을 맞춘다.
  // Status 만 보면 FL 채번 전인 도착 건이 DD MASTER 에서만 계속 빨갛다.
  const due = toDate(record.dueDate)
  if (due && !received && status !== "완료" && dayValue(due) < dayValue(today)) warnings.push({ key: "due", label: "Due Date 경과" })

  if (record.tech?.arrangeNo && record.tech?.development?.co && record.tech.development.co !== "GD") warnings.push({ key: "arrange", label: "Arrange#는 GD만 입력" })

  // 날짜 열 아홉 개 전부를 본다. 예전에는 넷만 봐서 Request Date 와 공정 완료일의 오기재가 지나갔다.
  const dateCells: [string, unknown][] = [
    ["Request Date", record.requestDate],
    ["Due Date", record.dueDate],
    ["원사 완료일", record.tech?.processDates?.yarn],
    ["편직 완료일", record.tech?.processDates?.knitting],
    ["염색 완료일", record.tech?.processDates?.dyeing],
    ["가공 완료일", record.tech?.processDates?.finishing],
    ["Received date", record.receivedDate],
    ["FDS", record.tech?.sampleDates?.fds],
    ["YDS", record.tech?.sampleDates?.yds],
  ]
  const badDates = dateCells.filter(([, value]) => String(value ?? "").trim() && !isDateValue(value))
  if (badDates.length) {
    warnings.push({ key: "dateFormat", label: `${badDates.map(([name]) => name).join(", ")} 날짜 형식 아님` })
  }

  // 날짜가 있는데 업체가 빈 경우만 누락이다. 반대 방향(업체만 있음)은 공정이 진행 중인 정상 상태라
  // 경고로 잡으면 진행 중인 행 대부분에 삼각형이 붙는다(2026-10-06 박향근 확정).
  const pairs = [
    [record.tech?.mills?.yarn, record.tech?.processDates?.yarn],
    [record.tech?.mills?.knitting, record.tech?.processDates?.knitting],
    [record.tech?.mills?.dyeing, record.tech?.processDates?.dyeing],
    [record.tech?.mills?.finishing, record.tech?.processDates?.finishing],
  ]
  if (pairs.some(([mill, date]) => Boolean(date) && !mill)) warnings.push({ key: "process", label: "공정 완료일에 업체 미입력" })
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
