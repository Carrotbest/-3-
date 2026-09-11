/**
 * 주간 업무 보고용 집계.
 *
 * **웹 화면의 완료 판정과 기준이 다르다. 일부러 다르다.**
 * DD MASTER는 FL#이 형식에 맞게 들어오면 완료로 올린다(`recalculateDevelopmentRecords`).
 * 그런데 팀이 보고할 때 쓰는 완료는 **원단 실물을 받은 날(Received date)**이다.
 * 리뷰용 원단을 받는 날과 FL 등록에 필요한 FDS를 받는 날 사이 간격이 커서, 이번 주에 원단을
 * 받아 리뷰까지 끝냈는데 FDS가 늦어 FL은 다음 주에 등록되는 일이 흔하다. 그런 건은 화면에서는
 * 진행 중이지만 팀 기준으로는 이번 주 완료다.
 *
 * 그래서 화면은 화면대로 두고, 보고용 숫자만 이 파일에서 따로 센다.
 * 두 기준을 하나로 합치려 하지 말 것. 합치면 둘 중 한쪽이 반드시 틀어진다.
 *
 * 담당별 문장은 DD에 적힌 것까지만 만든다. "as is ok", "overweight 로 중량 개선 재가공 요청"
 * 같은 판단과 협의 내용은 데이터에 없다. 뼈대를 뽑아 주고 나머지는 사람이 채운다.
 */
import { normalizeCategory } from "./xlsx-parsers"
import { toDate } from "./format"
import { ownerDisplayName, type DevRecord } from "./schema"

/** 보고서 카테고리 순서와 표기. DD의 `CATEGORIES` 네 값을 보고서 어휘로 옮긴다. */
const REPORT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "EU MARKET", label: "EU" },
  { key: "SEASON", label: "Season" },
  { key: "CORE", label: "Core" },
  { key: "PROJECT", label: "Project" },
]

const EXCLUDED_STATUS = new Set(["DROP", "HOLD", "REJECT"])

/** 공정 진행 순서. 상태 문장과 정렬에 같은 순서를 쓴다. */
const PROCESS_STEPS = [
  { key: "yarn", label: "원사 입고" },
  { key: "knitting", label: "편직" },
  { key: "dyeing", label: "염색" },
  { key: "finishing", label: "가공" },
] as const

const pad = (value: number): string => String(value).padStart(2, "0")
const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const slashDate = (date: Date): string => `${date.getMonth() + 1}/${date.getDate()}`

const statusOf = (record: DevRecord): string =>
  String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()

/** 보고 대상에서 빼는 건. DROP·HOLD·REJECT는 진행도 완료도 아니다. */
const isCounted = (record: DevRecord): boolean => !EXCLUDED_STATUS.has(statusOf(record))

/** 보고 기준 완료. FL#이 아니라 실물 도착일이다. */
const receivedKey = (record: DevRecord): string | null => {
  const date = toDate(record.receivedDate)
  return date ? dayKey(date) : null
}

const requestKey = (record: DevRecord): string | null => {
  const date = toDate(record.requestDate)
  return date ? dayKey(date) : null
}

const ownerOf = (record: DevRecord): string => ownerDisplayName(record.owner).trim() || "담당 미지정"

export interface WeeklyReportOwnerRow {
  owner: string
  /** 실물 미도착 건 */
  progress: number
  /** 구간 내 실물 도착 건 */
  done: number
}

/** 담당별 보고에 들어가는 카테고리 묶음. 데이터가 있는 카테고리만 만든다. */
export interface WeeklyReportSection {
  label: string
  lines: string[]
}

export interface WeeklyReport {
  /** 집계 구간 (YYYY-MM-DD) */
  from: string
  to: string
  /** `9/5~9/11` 형태의 사람용 구간 표기 */
  rangeLabel: string
  /** 담당 이름. 전체 보고서는 빈 문자열이다. */
  owner: string
  /** 실물 미도착 = 보고 기준 진행 중 */
  progress: number
  /** 진행 중 가운데 구간 안에 접수된 건 */
  fresh: number
  /** 진행 중 가운데 구간 전에 접수된 건 */
  ongoing: number
  /** 구간 안에 실물이 도착한 건 */
  done: number
  categories: Array<{ label: string; count: number }>
  /** 분류 표기가 네 값에 안 맞는 진행 건. 0이 아니면 보고 전에 DD를 손봐야 한다. */
  uncategorized: number
  owners: WeeklyReportOwnerRow[]
  /** 개발 건 이름으로 묶은 요약. 담당 보고서의 기본이다. */
  sections: WeeklyReportSection[]
  /** FL#과 조직까지 적은 상세. 팝업에서 골라 쓴다. */
  detailSections: WeeklyReportSection[]
}

/**
 * 한 건의 현재 상태 문장.
 *
 * 지나간 공정일 중 가장 앞선 것을 완료로 보고, 그 다음 공정에 미래 날짜가 잡혀 있으면 예정으로 적는다.
 * DD의 공정 Status 칸에는 예정일이 먼저 들어오는 경우가 있어 날짜가 있다고 다 끝난 것이 아니다.
 */
function stateOf(record: DevRecord, today: Date): { order: number; label: string } {
  if (receivedKey(record)) return { order: 6, label: "샘플 수취 완료" }
  const dates = record.tech?.processDates
  const todayKey = dayKey(today)
  let passed = -1
  let planned = -1
  PROCESS_STEPS.forEach((step, index) => {
    const date = toDate(dates?.[step.key])
    if (!date) return
    if (dayKey(date) <= todayKey) passed = Math.max(passed, index)
    else if (planned < 0) planned = index
  })
  // 예정은 같은 공정의 완료보다 덜 진행된 것이라 0.5 만큼 낮게 둔다. 줄 순서가 진행 순서를 따른다.
  if (planned >= 0 && planned > passed) return { order: planned + 0.5, label: `${PROCESS_STEPS[planned].label} 예정` }
  if (passed >= 0) return { order: passed + 1, label: `${PROCESS_STEPS[passed].label} 완료` }
  return { order: 0, label: "작지 접수" }
}

/** 상세 문장에 쓸 건 이름. FL#이 있으면 그것이 먼저다. 담당들이 상세 보고에 FL#으로 적는다. */
function detailSubject(record: DevRecord): string {
  const fl = String(record.flNo ?? "").replace(/\s+/g, "").toUpperCase()
  const head = /^FL\d{8}$/.test(fl) ? fl : String(record.styleNo ?? "").trim() || "Style 미기재"
  const construction = String(record.construction ?? "").trim()
  return construction ? `${head} ${construction}` : head
}

/**
 * 요약 문장의 묶음 이름 = 개발 건 이름(Style No.).
 *
 * **FL#으로 묶지 않는다.** FL#은 스타일과 조직 조합마다 따로 나가서, 그것으로 묶으면
 * 같은 개발 건이 열 줄로 흩어진다. 담당들이 쓰는 보고서도 "Adalin NI", "Purepress" 처럼
 * 개발 건 이름으로 묶는다.
 */
function summarySubject(record: DevRecord): string {
  const style = String(record.styleNo ?? "").trim()
  if (style) return style
  return String(record.construction ?? "").trim() || "Style 미기재"
}

const byProgress = (left: { order: number }, right: { order: number }): number => right.order - left.order

/** 조직 이름 목록. 두 개까지 적고 나머지는 종 수로 줄인다. 줄이 길어지면 요약이 아니다. */
function constructionLabel(names: readonly string[]): string {
  const unique = [...new Set(names.filter(Boolean))]
  if (!unique.length) return ""
  const head = unique.slice(0, 2).join("/")
  return unique.length > 2 ? `${head} 외 ${unique.length - 2}종` : head
}

export type ReportDetailLevel = "summary" | "detail"

/**
 * 담당 보고서의 카테고리 묶음.
 *
 * `detail`은 FL#과 조직까지 적고 상태마다 줄을 나눈다. 실제 보고서의 상세 항목과 같다.
 * `summary`는 개발 건 이름으로 묶어 한 줄에 상태를 이어 붙인다. 건수가 많은 주에는
 * 상세가 스무 줄을 넘어 읽히지 않으므로 기본은 요약이다.
 */
function buildSections(
  rows: readonly DevRecord[],
  today: Date,
  freshRows: Set<DevRecord>,
  level: ReportDetailLevel,
): WeeklyReportSection[] {
  return REPORT_CATEGORIES.flatMap((category) => {
    const scoped = rows.filter((record) => normalizeCategory(record.category) === category.key)
    if (!scoped.length) return []
    const progress = scoped.filter((record) => !receivedKey(record)).length
    const label = `${category.label} (진행 ${progress}건 / 완료 ${scoped.length - progress}건)`

    if (level === "detail") {
      const groups = new Map<string, { order: number; subject: string; state: string; count: number; fresh: number }>()
      scoped.forEach((record) => {
        const state = stateOf(record, today)
        const subject = detailSubject(record)
        const key = `${subject}|${state.label}`
        const group = groups.get(key) ?? { order: state.order, subject, state: state.label, count: 0, fresh: 0 }
        group.count += 1
        if (freshRows.has(record)) group.fresh += 1
        groups.set(key, group)
      })
      const lines = [...groups.values()]
        .sort((left, right) => byProgress(left, right) || left.subject.localeCompare(right.subject, "ko-KR", { numeric: true }))
        .map((group) => `- ${group.fresh === group.count ? "신규 " : ""}${group.subject} ${group.state} (${group.count}건)`)
      return [{ label, lines }]
    }

    // 요약: 개발 건 이름으로 묶는다.
    //
    // **완료 건과 진행 건을 한 줄에 섞지 않는다.** 섞으면 "샘플 수취 완료 4건, 가공 완료 1건"
    // 처럼 끝난 것과 남은 것이 한 줄에 붙어 무엇을 보고해야 하는지 흐려진다.
    // 완료는 따로 모아 앞에 세운다. 보고서에서 먼저 읽는 것이 그 주에 끝낸 것이다.
    const summarize = (rows: readonly DevRecord[], withState: boolean): string[] => {
      const groups = new Map<string, {
        subject: string
        constructions: string[]
        states: Map<string, { order: number; count: number }>
        count: number
        fresh: number
      }>()
      rows.forEach((record) => {
        const subject = summarySubject(record)
        const group = groups.get(subject)
          ?? { subject, constructions: [] as string[], states: new Map<string, { order: number; count: number }>(), count: 0, fresh: 0 }
        const state = stateOf(record, today)
        const seen = group.states.get(state.label) ?? { order: state.order, count: 0 }
        seen.count += 1
        group.states.set(state.label, seen)
        group.constructions.push(String(record.construction ?? "").trim())
        group.count += 1
        if (freshRows.has(record)) group.fresh += 1
        groups.set(subject, group)
      })
      return [...groups.values()]
        .map((group) => {
          const states = [...group.states.entries()]
            .map(([state, value]) => ({ state, ...value }))
            .sort(byProgress)
          const fabric = constructionLabel(group.constructions)
          const head = `${group.fresh === group.count ? "신규 " : ""}${group.subject}${fabric ? ` ${fabric}` : ""}`
          // 완료 묶음은 상태가 "샘플 수취 완료" 하나뿐이라 되풀이하지 않고 건수만 적는다.
          const tail = withState ? ` : ${states.map((item) => `${item.state} ${item.count}건`).join(", ")}` : ` ${group.count}건`
          return { order: states[0]?.order ?? 0, text: `- ${head}${tail}` }
        })
        .sort((left, right) => byProgress(left, right) || left.text.localeCompare(right.text, "ko-KR", { numeric: true }))
        .map((item) => item.text)
    }

    const doneLines = summarize(scoped.filter((record) => receivedKey(record)), false)
    const progressLines = summarize(scoped.filter((record) => !receivedKey(record)), true)
    const lines = doneLines.length && progressLines.length
      ? ["[완료]", ...doneLines, "[진행]", ...progressLines]
      : [...doneLines, ...progressLines]
    return [{ label, lines }]
  })
}

/**
 * 보고용 집계.
 *
 * 구간은 오늘에서 `days`일 전부터 오늘까지다. 목요일 오후에 눌러도 주말과 월요일 건이
 * 빠지지 않게 달력 주로 끊지 않는다. `owner`를 주면 그 담당 건만 센다.
 */
export function buildWeeklyReport(
  records: readonly DevRecord[],
  today = new Date(),
  days = 7,
  owner = "",
): WeeklyReport {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)
  const from = dayKey(start)
  const to = dayKey(today)
  const counted = records
    .filter(isCounted)
    .filter((record) => !owner || ownerOf(record) === owner)

  const inRange = (key: string | null): boolean => Boolean(key && key >= from && key <= to)

  // 보고 기준 진행 중 = 실물이 아직 안 온 건. 화면의 진행 중(FL# 기준)과 다르다.
  const progressRows = counted.filter((record) => !receivedKey(record))
  const doneRows = counted.filter((record) => inRange(receivedKey(record)))
  const freshRows = progressRows.filter((record) => inRange(requestKey(record)))

  const categoryCount = new Map<string, number>()
  let uncategorized = 0
  for (const record of progressRows) {
    const key = normalizeCategory(record.category)
    if (REPORT_CATEGORIES.some((item) => item.key === key)) {
      categoryCount.set(key, (categoryCount.get(key) ?? 0) + 1)
    } else {
      uncategorized += 1
    }
  }

  const ownerMap = new Map<string, WeeklyReportOwnerRow>()
  const bump = (record: DevRecord, field: "progress" | "done") => {
    const name = ownerOf(record)
    const row = ownerMap.get(name) ?? { owner: name, progress: 0, done: 0 }
    row[field] += 1
    ownerMap.set(name, row)
  }
  progressRows.forEach((record) => bump(record, "progress"))
  doneRows.forEach((record) => bump(record, "done"))

  return {
    from,
    to,
    rangeLabel: `${slashDate(start)}~${slashDate(today)}`,
    owner,
    progress: progressRows.length,
    fresh: freshRows.length,
    ongoing: progressRows.length - freshRows.length,
    done: doneRows.length,
    categories: REPORT_CATEGORIES.map((item) => ({ label: item.label, count: categoryCount.get(item.key) ?? 0 })),
    uncategorized,
    owners: [...ownerMap.values()].sort((left, right) =>
      right.done - left.done || right.progress - left.progress || left.owner.localeCompare(right.owner, "ko-KR")),
    // 진행 건과 이번 구간 완료 건을 함께 적는다. 예전에 끝난 건은 보고서에 올릴 내용이 없다.
    sections: owner ? buildSections([...progressRows, ...doneRows], today, new Set(freshRows), "summary") : [],
    detailSections: owner ? buildSections([...progressRows, ...doneRows], today, new Set(freshRows), "detail") : [],
  }
}

/** 보고서에 올릴 담당 목록. 전체 집계에서 뽑는다. */
export function reportOwnerNames(report: WeeklyReport): string[] {
  return report.owners.map((row) => row.owner)
}

/**
 * 보고서에 붙일 문장.
 *
 * 담당들이 쓰는 양식 첫 항목(`1. Total Sample Status Summary`)을 그대로 만들고,
 * 담당 보고서에는 데이터가 있는 카테고리를 2번부터 번호를 달아 잇는다.
 */
export function weeklyReportText(report: WeeklyReport, level: ReportDetailLevel = "summary"): string {
  const mix = report.categories.map((item) => `${item.label} ${item.count}건`).join(" + ")
  const lines = [
    "1. Total Sample Status Summary",
    `- 전체 진행 ${report.progress}건 (${mix})`,
    `- 신규 : ${report.fresh}건 / 공정 중 : ${report.ongoing}건 / 완료 : ${report.done}건`,
  ]
  if (report.uncategorized) lines.push(`- 분류 미기재 ${report.uncategorized}건 (DD Category 확인 필요)`)

  if (report.owner) {
    const sections = level === "detail" ? report.detailSections : report.sections
    sections.forEach((section, index) => {
      lines.push("")
      lines.push(`${index + 2}. ${section.label}`)
      section.lines.forEach((line) => lines.push(line))
    })
    return lines.join("\n")
  }

  if (report.owners.length) {
    lines.push("")
    lines.push(`[담당별] 진행 / 완료 (${report.rangeLabel})`)
    report.owners.forEach((row) => lines.push(`- ${row.owner} : 진행 ${row.progress}건 / 완료 ${row.done}건`))
  }
  return lines.join("\n")
}
