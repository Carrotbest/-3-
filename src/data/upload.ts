import * as XLSX from "xlsx"

import { parseFabricAnalysis, parseStudy } from "./xlsx-parsers"
import { saveCache } from "./cache"
import { saveRddaSnapshots, setAppState, setIngestState, useAppStore } from "../store/useAppStore"
import { buildSnapshot, pruneSnapshots, type RddaReportV2 } from "./rdda-report"
import { buildRddaReport, defaultRange, isRddaDataset } from "./rdda-dataset"

/*
 * 엑셀 업로드는 쓰지 않는다(2026-09-22, R241). DD 비상용, 샘플대장, TS, 자료 목록, 기능성 개발, RDDA 엑셀,
 * 조직도 업로드와 통째 교체 경로를 없앴다. 남은 것은 STUDY, FABRIC ANALYSIS 화면의 자체 업로드와
 * RDDA 집계(북마크 수집, JSON)뿐이다. 새 업로드 경로를 만들지 않는다.
 */

const messageOf = (error: unknown) => error instanceof Error ? error.message : "파일을 처리하지 못했습니다."
const workbookOf = async (file: File) => XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })

async function run(kind: string, fileName: string, action: () => Promise<void>): Promise<void> {
  setIngestState({ active: true, kind, fileName, step: "reading", message: null })
  try {
    await action()
    setIngestState({ step: "done", message: "업로드한 데이터를 반영했습니다." })
  } catch (error) {
    setIngestState({ active: true, step: "error", message: messageOf(error) })
  }
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

function isRddaReportV2(value: unknown): value is RddaReportV2 {
  if (!value || typeof value !== "object") return false
  const report = value as Partial<RddaReportV2>
  return Boolean(
    report.meta && typeof report.meta.generatedAt === "string"
    && report.summary && typeof report.summary.pickRate === "number"
    && Array.isArray(report.buyers) && Array.isArray(report.ledger)
    && Array.isArray(report.suppliers) && Array.isArray(report.teamYears)
    && report.recommend && typeof report.recommend === "object",
  )
}

export async function applyRddaReport(value: unknown): Promise<void> {
  setIngestState({ step: "validating" })
  const dataset = isRddaDataset(value) ? value : null
  const v2 = isRddaReportV2(value) ? value : null
  const stored = dataset ?? v2
  if (!stored) throw new Error("RDDA 집계 JSON 형식이 올바르지 않습니다.")
  const report = dataset ? (() => {
    const { from, to } = defaultRange(dataset)
    return buildRddaReport(dataset, from, to)
  })() : v2!
  setAppState({ rdda: stored })
  await saveCache("rdda", stored)
  const snapshot = buildSnapshot(report)
  const existing = useAppStore.getState().rddaSnapshots
  saveRddaSnapshots(pruneSnapshots([...existing.filter((item) => item.weekId !== snapshot.weekId), snapshot]))
}

/** RDDA API 집계 JSON 한 개를 검증해 공용 state/rdda에 저장한다. */
export async function ingestRddaReport(files: File[]): Promise<void> {
  const jsonFiles = files.filter((file) => /\.json$/i.test(file.name))
  return run("rdda-report", jsonFiles.map((file) => file.name).join(", ") || files.map((file) => file.name).join(", "), async () => {
    if (jsonFiles.length !== 1 || files.length !== 1) throw new Error("RDDA 집계 JSON 파일 한 개를 선택해 주세요.")
    setIngestState({ step: "parsing" })
    const parsed: unknown = JSON.parse(await jsonFiles[0].text())
    await applyRddaReport(parsed)
  })
}

export async function ingestRddaMessage(report: unknown): Promise<boolean> {
  await run("rdda-report", "RDDA 자동 수집", () => applyRddaReport(report))
  return useAppStore.getState().ingest.step !== "error"
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
