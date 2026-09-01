import * as XLSX from "xlsx"

import { downloadBlob } from "./dd-export"
import type { CompletedSample } from "./schema"
import { parseSamples } from "./xlsx-parsers"

const ARCHIVE_PATH = "data/ledger/archive.json"
const CUTOVER_DATE = "2026-09-02"

interface LedgerArchiveEnvelope {
  generatedAt: string
  sourceFile: string
  cutoverDate: string
  count: number
  samples: CompletedSample[]
}

/**
 * 저장소에 고정된 샘플관리대장 아카이브를 읽는다.
 *
 * 파일이 없거나 깨졌으면 null을 준다. 빈 배열이 아니다.
 * 이 둘을 구분하지 않으면, 아카이브를 아직 커밋하지 않은 상태로 배포했을 때
 * 호출부가 빈 배열을 정상 결과로 받아 IndexedDB의 기존 대장을 지워 버린다.
 * Firestore 동기화에서 completed를 뺐기 때문에 그렇게 지워지면 되돌릴 방법이 없다.
 */
export async function loadLedgerArchive(): Promise<CompletedSample[] | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${ARCHIVE_PATH}`, { cache: "no-cache" })
    if (!response.ok) return null
    const archive = (await response.json()) as Partial<LedgerArchiveEnvelope>
    return Array.isArray(archive.samples) ? archive.samples : null
  } catch {
    return null
  }
}

/** 앱의 실전 파서로 대장 엑셀을 읽어 저장소용 아카이브 JSON을 내려받는다. */
export async function downloadLedgerArchive(file: File): Promise<number> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true })
  const samples = parseSamples(workbook)
  const archive: LedgerArchiveEnvelope = {
    generatedAt: new Date().toISOString(),
    sourceFile: file.name,
    cutoverDate: CUTOVER_DATE,
    count: samples.length,
    samples,
  }
  downloadBlob(new Blob([JSON.stringify(archive)], { type: "application/json;charset=utf-8" }), "archive.json")
  return samples.length
}
