import * as XLSX from "xlsx"

import type { AppState } from "@/store/useAppStore"
import { sampleMeta } from "./sample"
import { reconcile } from "./reconcile"
import { isExcludedDevelopment, parseDevelopment, parseSamples } from "./xlsx-parsers"

const ELEMENT_ID = "fabric-rnd-embedded-workbooks"
const SIGNATURE_KEY = "fabric-rnd-embedded-signature"

interface EmbeddedFile {
  name: string
  base64: string
}

interface EmbeddedWorkbookManifest {
  signature: string
  generatedAt: string
  development: EmbeddedFile
  samples: EmbeddedFile
}

export interface EmbeddedAppData {
  signature: string
  patch: Pick<AppState, "records" | "completed" | "meta">
}

function workbookFromBase64(value: string): XLSX.WorkBook {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return XLSX.read(bytes, { type: "array", cellDates: true })
}

function readManifest(): EmbeddedWorkbookManifest | null {
  const element = document.getElementById(ELEMENT_ID)
  if (!element?.textContent) return null
  try {
    const parsed = JSON.parse(element.textContent) as EmbeddedWorkbookManifest
    return parsed.signature && parsed.development?.base64 && parsed.samples?.base64 ? parsed : null
  } catch {
    return null
  }
}

function appliedSignature(): string {
  try {
    return window.localStorage.getItem(SIGNATURE_KEY) ?? ""
  } catch {
    return ""
  }
}

/** 단일 HTML 안에 포함된 실제 DD·샘플대장을 첫 실행 때 동일한 운영 파서로 읽는다. */
export async function loadEmbeddedAppData(cached: Partial<AppState>): Promise<EmbeddedAppData | null> {
  const manifest = readManifest()
  if (!manifest) return null
  if (appliedSignature() === manifest.signature && Array.isArray(cached.records) && Array.isArray(cached.completed)) return null

  // 큰 엑셀을 읽기 전에 첫 화면을 한 번 그릴 수 있도록 실행권을 양보한다.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  const developmentWorkbook = workbookFromBase64(manifest.development.base64)
  const sampleWorkbook = workbookFromBase64(manifest.samples.base64)
  const allRecords = parseDevelopment(developmentWorkbook)
  const records = allRecords.filter((record) => !isExcludedDevelopment(record))
  const completed = parseSamples(sampleWorkbook)
  const reconciliation = reconcile(allRecords, developmentWorkbook)

  const baseMeta = sampleMeta()
  const meta = {
    ...baseMeta,
    mode: "tds" as const,
    fileName: `${manifest.development.name} + ${manifest.samples.name}`,
    appliedAt: manifest.generatedAt,
    appliedBy: "공유본 내장 데이터",
    passed: true,
    checks: reconciliation.checks,
    anomalies: reconciliation.anomalies,
    history: [{
      appliedAt: manifest.generatedAt,
      appliedBy: "공유본 내장 데이터",
      fileName: `${manifest.development.name} + ${manifest.samples.name}`,
      count: records.length,
      passed: true,
      state: "사용 중" as const,
      reason: null,
    }],
  }

  return { signature: manifest.signature, patch: { records, completed, meta } }
}

export function markEmbeddedAppDataApplied(signature: string): void {
  try {
    window.localStorage.setItem(SIGNATURE_KEY, signature)
  } catch {
    // 파일 URL에서 저장소가 제한되어도 현재 세션의 내장 데이터는 계속 사용한다.
  }
}
