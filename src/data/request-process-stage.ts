import { isCompletedFlNo, isGdRecord } from "@/data/dd-workflow"
import { toDate } from "@/data/format"
import type { DevRecord, RequestOption } from "@/data/schema"

export type ProcessStepKey = "intake" | "yarn" | "knitting" | "dyeing" | "finishing" | "received" | "yds" | "fds" | "fl"

export interface ProcessStep {
  key: ProcessStepKey
  label: string
  date?: string
  state: "done" | "current" | "planned" | "todo"
  color: string
}

export interface ProcessStage {
  linked: boolean
  steps: ProcessStep[]
  currentIndex: number
  label: string
  color: string
  halted?: "보류" | "드롭" | "반려"
  record?: DevRecord
}

const STEP_LABELS: Record<ProcessStepKey, string> = {
  intake: "접수",
  yarn: "원사",
  knitting: "편직",
  dyeing: "염색",
  finishing: "가공",
  received: "수취",
  yds: "YDS",
  fds: "FDS",
  fl: "FL완료",
}

export const PROCESS_STEP_ORDER: readonly ProcessStepKey[] = ["intake", "yarn", "knitting", "dyeing", "finishing", "received", "yds", "fds", "fl"]

const displayDate = (value: unknown): string | undefined => {
  const date = toDate(value)
  return date ? `${date.getMonth() + 1}/${date.getDate()}` : undefined
}

const onOrBeforeToday = (value: unknown, today: Date): boolean => {
  const date = toDate(value)
  if (!date) return false
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return day <= currentDay
}

const stepColor = (index: number, count: number): string => {
  const hue = Math.round(4 + (132 - 4) * index / Math.max(1, count - 1))
  return `hsl(${hue} 72% 44%)`
}

export function processStepColor(key: ProcessStepKey): string {
  return stepColor(PROCESS_STEP_ORDER.indexOf(key), PROCESS_STEP_ORDER.length)
}

export function requestProcessStage(byLine: Map<string, DevRecord[]>, option: RequestOption, today = new Date()): ProcessStage {
  const rows = option.lineId ? byLine.get(option.lineId) ?? [] : []
  const record = rows.find((row) => isCompletedFlNo(row.flNo))
    ?? rows.find((row) => String(row.receivedDate ?? "").trim())
    ?? rows[0]
  const keys: ProcessStepKey[] = record && !isGdRecord(record)
    ? ["intake", "yarn", "knitting", "dyeing", "finishing", "received", "fds", "fl"]
    : ["intake", "yarn", "knitting", "dyeing", "finishing", "received", "yds", "fds", "fl"]

  if (!record) {
    return {
      linked: false,
      currentIndex: -1,
      label: "대기",
      color: "var(--muted-foreground)",
      steps: keys.map((key, index) => ({ key, label: STEP_LABELS[key], state: "todo", color: stepColor(index, keys.length) })),
    }
  }

  const valueOf = (key: ProcessStepKey): unknown => {
    if (key === "intake") return record.requestDate
    if (key === "received") return record.receivedDate
    if (key === "yds" || key === "fds") return record.tech?.sampleDates?.[key]
    if (key === "fl") return undefined
    return record.tech?.processDates?.[key]
  }
  const reached = (key: ProcessStepKey): boolean => {
    if (key === "intake") return true
    if (key === "fl") return isCompletedFlNo(record.flNo)
    if (key === "received" || key === "yds" || key === "fds") return Boolean(String(valueOf(key) ?? "").trim())
    return onOrBeforeToday(valueOf(key), today)
  }
  const reachedFlags = keys.map(reached)
  let currentIndex = 0
  reachedFlags.forEach((done, index) => { if (done) currentIndex = index })
  const steps = keys.map((key, index): ProcessStep => {
    const rawDate = valueOf(key)
    const date = displayDate(rawDate)
    const future = Boolean(toDate(rawDate)) && !onOrBeforeToday(rawDate, today)
    const state: ProcessStep["state"] = index < currentIndex
      ? "done"
      : index === currentIndex ? "current"
        : future ? "planned" : "todo"
    return { key, label: STEP_LABELS[key], date, state, color: stepColor(index, keys.length) }
  })
  const normalizedStatus = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  const halted = normalizedStatus === "HOLD" || normalizedStatus === "보류"
    ? "보류"
    : normalizedStatus === "DROP" ? "드롭"
      : normalizedStatus === "REJECT" ? "반려" : undefined
  const color = halted === "보류"
    ? "var(--warning)"
    : halted ? "var(--muted-foreground)" : steps[currentIndex].color

  return {
    linked: true,
    steps,
    currentIndex,
    label: halted ?? steps[currentIndex].label,
    color,
    halted,
    record,
  }
}
