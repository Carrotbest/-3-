import * as XLSX from "xlsx"

import type { DataMeta, HistoryState, RddaSnapshot } from "./sample"
import type { CompletedSample, DevRecord } from "./schema"
import { WEB_INTAKE_SHEET } from "./schema"
import { parseChemicalPortfolio } from "./chemical"
import { reconcile, type ReconcileResult } from "./reconcile"
import { loadTds } from "./tds-loader"
import { isExcludedDevelopment, parseDevelopment, parseFabricAnalysis, parseMaterials, parseRdda, parseRddaSnapshot, parseSamples, parseStudy, parseTechnicalServices } from "./xlsx-parsers"
import { saveCache } from "./cache"
import { mergeTsRecords, setAppState, setChemicalPortfolio, setIngestState, useAppStore, type OrgMember } from "../store/useAppStore"

export interface UploadResult {
  records: DevRecord[]
  completed: CompletedSample[]
  reconciliation: ReconcileResult
  meta: DataMeta
}

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "")
const messageOf = (error: unknown) => error instanceof Error ? error.message : "파일을 처리하지 못했습니다."
const workbookOf = async (file: File) => XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })

function nextHistory(meta: DataMeta, fileName: string, appliedAt: string, passed: boolean, count: number | null, reason: string | null): DataMeta["history"] {
  const state: HistoryState = passed ? "사용 중" : "전송 안 됨"
  const previous = passed ? meta.history.map((entry) => entry.state === "사용 중" ? { ...entry, state: "교체됨" as const } : entry) : meta.history
  return [{ appliedAt, appliedBy: "파일 업로드", fileName, count, passed, state, reason }, ...previous].slice(0, 100)
}

function buildMeta(label: string, result: ReconcileResult, appliedAt: string, count: number): DataMeta {
  const previous = useAppStore.getState().meta
  const reason = result.passed ? null : result.checks.filter((item) => !item.ok).map((item) => `${item.name} ${Math.abs(item.diff)}건 차이`).join(" · ")
  return { mode: "tds", fileName: label, appliedAt, appliedBy: "파일 업로드", passed: result.passed, checks: result.checks, anomalies: result.anomalies, history: nextHistory(previous, label, appliedAt, result.passed, result.passed ? count : null, reason) }
}

/** 기존 대조 계약: 실패하면 records를 반영하지 않고 meta만 갱신한다. */
export function applyParsed(allRecords: DevRecord[], completed: CompletedSample[], workbook: XLSX.WorkBook, label: string): UploadResult {
  const reconciliation = reconcile(allRecords, workbook)
  const records = allRecords.filter((record) => !isExcludedDevelopment(record))
  const meta = buildMeta(label, reconciliation, new Date().toISOString(), records.length)
  setAppState(reconciliation.passed ? { records, completed, meta } : { meta })
  return { records, completed, reconciliation, meta }
}

async function run(kind: string, fileName: string, action: () => Promise<void>): Promise<void> {
  setIngestState({ active: true, kind, fileName, step: "reading", message: null })
  try {
    await action()
    setIngestState({ step: "done", message: "업로드한 데이터를 반영했습니다." })
  } catch (error) {
    setIngestState({ active: true, step: "error", message: messageOf(error) })
  }
}

export async function ingestDevelopment(file: File): Promise<void> {
  return run("development", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const hasOverview = workbook.SheetNames.some((name) => normalized(name) === normalized("전체현황"))
    const records = hasOverview ? parseDevelopment(workbook) : (await loadTds(file)).records
    setIngestState({ step: "validating" })
    const completed = useAppStore.getState().completed
    const result = applyParsed(records, completed, workbook, file.name)
    await Promise.all([saveCache("meta", result.meta), saveCache("completed", completed), ...(result.reconciliation.passed ? [saveCache("records", result.records)] : [])])
    if (!result.reconciliation.passed) throw new Error("합계 대조가 맞지 않아 이전 데이터를 유지했습니다.")
  })
}

export async function ingestSamples(file: File): Promise<void> {
  return run("samples", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const parsed = parseSamples(workbook)
    // 웹에서 직접 등록한 건은 대장에 없다. 재업로드가 통째로 갈아치우므로 따로 살려 붙인다.
    const manual = useAppStore.getState().completed.filter((sample) => sample.sourceSheet === WEB_INTAKE_SHEET)
    const completed = [...parsed, ...manual]
    setIngestState({ step: "validating" })
    setAppState({ completed })
    await saveCache("completed", completed)
  })
}

/** STUDY 현황 엑셀(Capability Improvement)만 업로드 — 자료 파일 목록(studyFiles)은 건드리지 않는다. */
export async function ingestStudyWorkbook(file: File): Promise<void> {
  return run("study", file.name, async () => {
    setIngestState({ step: "parsing" })
    const study = parseStudy(await workbookOf(file))
    setIngestState({ step: "validating" })
    setAppState({ study })
    await saveCache("study", study)
  })
}

/** STUDY 교육 자료 파일들 — STUDY 화면 라이브러리 탭에서 업로드. 기존 목록에 신규만 누적한다. */
export async function ingestStudyFiles(files: File[]): Promise<void> {
  const materials = files.filter((file) => !/\.xlsx?$/i.test(file.name))
  return run("study", materials.map((file) => file.name).join(", "), async () => {
    if (!materials.length) throw new Error("업로드할 교육 자료 파일(ppt·pdf·doc 등)을 선택해 주세요.")
    setIngestState({ step: "parsing" })
    const existing = useAppStore.getState().studyFiles
    const merged = [...new Set([...existing, ...materials.map((file) => file.name)])].sort((a, b) => a.localeCompare(b, "ko-KR"))
    setIngestState({ step: "validating" })
    setAppState({ studyFiles: merged })
    await saveCache("studyFiles", merged)
  })
}

const rddaMonth = (name: string) => Number(name.normalize("NFKC").match(/26\s*년\s*(1[0-2]|0?[1-9])\s*월/i)?.[1] ?? 0)
/**
 * RDDA 업로드 — 매월 초 전월(YTD 누적) 파일 1개 업로드가 기본. 여러 개를 한 번에 올려도 된다.
 * 기존에 올린 월별 스냅샷에 이번 파일들을 누적(같은 월은 교체)하고, 가장 최신 월 파일로 전체 리포트를 다시 만든다.
 */
export async function ingestRdda(files: File[]): Promise<void> {
  return run("rdda", files.map((file) => file.name).join(", "), async () => {
    const candidates = files.filter((file) => /\.xlsx$/i.test(file.name)).map((file) => ({ file, month: rddaMonth(file.name) })).filter((item) => item.month > 0).sort((a, b) => a.month - b.month)
    if (!candidates.length) throw new Error("파일명에서 '26년 N월'을 확인할 수 있는 RDDA 엑셀을 선택해 주세요.")
    setIngestState({ step: "parsing" })
    // 기존 스냅샷에 이번 업로드 월들을 누적(같은 월 교체)
    const snapMap = new Map<number, RddaSnapshot>((useAppStore.getState().rdda?.snapshots ?? []).map((snapshot) => [snapshot.month, snapshot]))
    const workbooks = new Map<number, Awaited<ReturnType<typeof workbookOf>>>()
    for (const candidate of candidates) {
      const workbook = await workbookOf(candidate.file)
      workbooks.set(candidate.month, workbook)
      snapMap.set(candidate.month, parseRddaSnapshot(workbook, candidate.month))
    }
    const latest = candidates.at(-1)!
    const priorSnaps = [...snapMap.values()].filter((snapshot) => snapshot.month < latest.month).sort((a, b) => a.month - b.month)
    const report = parseRdda(workbooks.get(latest.month)!, { month: latest.month, snapshots: priorSnaps })
    const rdda = { ...report, snapshots: [...snapMap.values()].sort((a, b) => a.month - b.month) }
    setIngestState({ step: "validating" })
    setAppState({ rdda })
    await saveCache("rdda", rdda)
  })
}

export async function ingestFabric(file: File): Promise<void> {
  return run("fabric", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const fabricAnalysis = parseFabricAnalysis(workbook)
    setIngestState({ step: "validating" })
    setAppState({ fabricAnalysis })
    await saveCache("fabricAnalysis", fabricAnalysis)
  })
}

export async function ingestMaterials(file: File): Promise<void> {
  return run("materials", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const { items: materials, diagnostics: materialDiagnostics } = parseMaterials(workbook)
    setIngestState({ step: "validating" })
    setAppState({ materials, materialDiagnostics })
    await Promise.all([
      saveCache("materials", materials),
      saveCache("materialDiagnostics", materialDiagnostics),
    ])
  })
}

export async function ingestChemical(file: File): Promise<void> {
  return run("chemical", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const chemical = parseChemicalPortfolio(workbook)
    setIngestState({ step: "validating" })
    setChemicalPortfolio(chemical)
    await saveCache("chemical", chemical)
  })
}

export async function ingestTs(file: File): Promise<void> {
  return run("ts", file.name, async () => {
    const workbook = await workbookOf(file)
    setIngestState({ step: "parsing" })
    const imported = parseTechnicalServices(workbook)
    setIngestState({ step: "validating" })
    mergeTsRecords(imported)
    await saveCache("ts", useAppStore.getState().ts)
  })
}

const TITLE_ORDER = ["부장", "차장", "과장", "대리"] as const
function fallbackMember(fileName: string): OrgMember {
  const match = fileName.normalize("NFKC").replace(/\.json$/i, "").trim().match(new RegExp(`^(.+?)\\s+(${TITLE_ORDER.join("|")})$`))
  if (!match) throw new Error(`'${fileName}' 파일명에서 이름과 직급을 확인할 수 없습니다.`)
  return { name: match[1].trim(), title: match[2], rank: TITLE_ORDER.indexOf(match[2] as typeof TITLE_ORDER[number]) }
}
function findString(value: unknown, keys: string[]): string | null {
  const queue = [value]
  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== "object") continue
    if (Array.isArray(current)) { queue.push(...current); continue }
    for (const [key, nested] of Object.entries(current)) {
      if (keys.includes(normalized(key)) && typeof nested === "string" && nested.trim()) return nested.trim()
      if (nested && typeof nested === "object") queue.push(nested)
    }
  }
  return null
}
export async function ingestOrg(files: File[]): Promise<void> {
  return run("org", files.map((file) => file.name).join(", "), async () => {
    setIngestState({ step: "parsing" })
    const members = await Promise.all(files.filter((file) => /\.json$/i.test(file.name)).map(async (file) => {
      const fallback = fallbackMember(file.name)
      let value: unknown = null
      try { value = JSON.parse(await file.text()) as unknown } catch { return fallback }
      const name = findString(value, ["이름", "성명", "name", "membername"]) ?? fallback.name
      const rawTitle = findString(value, ["직급", "직책", "title", "position", "rank"])
      const title = TITLE_ORDER.find((item) => rawTitle?.includes(item)) ?? fallback.title as typeof TITLE_ORDER[number]
      return { name, title, rank: TITLE_ORDER.indexOf(title) }
    }))
    if (!members.length) throw new Error("조직도 JSON 파일을 선택해 주세요.")
    setIngestState({ step: "validating" })
    const orgMembers = [...new Map(members.map((member) => [normalized(member.name), member])).values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko-KR"))
    setAppState({ orgMembers })
    await saveCache("orgMembers", orgMembers)
  })
}

export async function ingestHomeFiles(files: File[]): Promise<void> {
  for (const file of files) {
    if (normalized(file.name).includes(normalized("샘플 관리 대장"))) {
      await ingestSamples(file)
      continue
    }
    try {
      const workbook = await workbookOf(file)
      const sampleSheet = workbook.SheetNames.some((name) => normalized(name).includes(normalized("샘플")))
      const developmentSheet = workbook.SheetNames.some((name) => normalized(name) === normalized("전체현황"))
      if (sampleSheet && !developmentSheet) await ingestSamples(file)
      else await ingestDevelopment(file)
    } catch {
      await ingestDevelopment(file)
    }
  }
}
