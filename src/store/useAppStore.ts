import { create } from "zustand"

import { saveCache } from "../data/cache"
import { MEMBERS, materialIdOf, type CompletedSample, type DevRecord, type FabricAnalysisRow, type MaterialDiagnostics, type MaterialItem, type StudyRecord } from "../data/schema"
import {
  sampleCompleted,
  sampleEvents,
  sampleFabricAnalysis,
  sampleMeta,
  sampleRdda,
  sampleRecords,
  sampleStudy,
  sampleTrends,
  type CalendarEvent,
  type DataMeta,
  type RddaReport,
  type TsRecord,
  type TrendItem,
} from "../data/sample"

export type Theme = "light" | "dark"
export type AppFilters = Record<string, unknown>
export const TS_STORAGE_KEY = "fabric.ts"

export type IngestStep = "reading" | "parsing" | "validating" | "done" | "error"

export interface IngestState {
  active: boolean
  kind: string | null
  fileName: string | null
  step: IngestStep
  message: string | null
}

export interface OrgMember {
  name: string
  title: string
  rank: number
}

export interface AppState {
  records: DevRecord[]
  completed: CompletedSample[]
  fabricAnalysis: FabricAnalysisRow[]
  meta: DataMeta
  ts: TsRecord[]
  study: StudyRecord[]
  studyFiles: string[]
  events: CalendarEvent[]
  rdda: RddaReport | null
  orgMembers: OrgMember[]
  materials: MaterialItem[]
  materialsManual: MaterialItem[]
  materialDiagnostics: MaterialDiagnostics
  trends: TrendItem[]
  filters: AppFilters
  theme: Theme
  sensitiveUnlocked: boolean
  ingest: IngestState
}

export type AppStatePatch = Partial<Omit<AppState, "sensitiveUnlocked">>

const sensitiveFrom = (meta: DataMeta): boolean => meta.mode === "tds" && meta.passed

export function createInitialAppState(): AppState {
  const records = sampleRecords()
  const completed = sampleCompleted()
  const fabricAnalysis = sampleFabricAnalysis()
  const ts: TsRecord[] = []
  const study = sampleStudy()
  const events = sampleEvents()
  const rdda = sampleRdda()
  const trends = sampleTrends()
  const meta = sampleMeta()
  const orgMembers = MEMBERS.map((member, rank) => ({
    name: member.name,
    title: member.role,
    rank: 4 + rank,
  }))
  return {
    records,
    completed,
    fabricAnalysis,
    meta,
    ts,
    study,
    studyFiles: [],
    events,
    rdda,
    orgMembers,
    materials: [],
    materialsManual: [],
    materialDiagnostics: {
      recognized: 0,
      byKind: { TS: 0, STUDY: 0, MACRO: 0, FABRIC: 0, PORTFOLIO: 0 },
      unknownKind: 0,
      missingLink: 0,
    },
    trends,
    filters: {},
    theme: "light",
    sensitiveUnlocked: sensitiveFrom(meta),
    ingest: { active: false, kind: null, fileName: null, step: "done", message: null },
  }
}

export const useAppStore = create<AppState>(() => createInitialAppState())

/** 기존 store.set처럼 얕게 병합하되 민감 필드는 meta에서만 파생한다. */
export function setAppState(patch: AppStatePatch): void {
  useAppStore.setState((state) => {
    const meta = patch.meta ?? state.meta
    return {
      ...patch,
      sensitiveUnlocked: sensitiveFrom(meta),
    }
  })
}

/** 대조 실패 시 meta만 갱신하고 이전 records는 그대로 유지한다. */
export function applyTdsResult(records: DevRecord[], meta: DataMeta): void {
  if (!meta.passed) {
    setAppState({ meta })
    return
  }
  setAppState({ records, meta })
}

export function setIngestState(patch: Partial<IngestState>): void {
  useAppStore.setState((state) => ({
    ingest: { ...state.ingest, ...patch },
  }))
}

function persistTsRecords(records: readonly TsRecord[]): void {
  try {
    window.localStorage.setItem(TS_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // 저장소를 사용할 수 없어도 현재 세션의 웹 입력은 유지한다.
  }
}

export function loadTsRecords(): TsRecord[] | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TS_STORAGE_KEY) ?? "null") as unknown
    return Array.isArray(stored) ? stored as TsRecord[] : null
  } catch {
    return null
  }
}

/** TS 목록은 접수일(receivedAt) 기준 정렬로 유지한다 — 최신이 위로. */
const sortTsByDate = (records: readonly TsRecord[]): TsRecord[] =>
  [...records].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))

export function saveTsRecords(records: TsRecord[]): void {
  const sorted = sortTsByDate(records)
  setAppState({ ts: sorted })
  persistTsRecords(sorted)
}

export async function clearTsRecords(): Promise<void> {
  const empty: TsRecord[] = []
  setAppState({ ts: empty })
  persistTsRecords(empty)
  await saveCache("ts", empty)
}

/** 기존 웹 입력을 우선하고, 처음 보는 id만 뒤에 추가한다. */
export function mergeTsRecords(imported: readonly TsRecord[]): { added: number; total: number } {
  const current = useAppStore.getState().ts
  const ids = new Set(current.map((record) => record.id.trim()))
  const additions = imported.filter((record) => {
    const id = record.id.trim()
    if (!id || ids.has(id)) return false
    ids.add(id)
    return true
  })
  const merged = [...current, ...additions]
  saveTsRecords(merged)
  return { added: additions.length, total: merged.length }
}

export type ManualMaterialInput = Omit<MaterialItem, "id" | "source">

export async function saveManualMaterial(input: ManualMaterialInput, previousId?: string): Promise<MaterialItem> {
  const item: MaterialItem = {
    ...input,
    id: materialIdOf(input.link, input.title),
    source: "manual",
  }
  const current = useAppStore.getState().materialsManual
  const next = [item, ...current.filter((material) => material.id !== (previousId ?? item.id) && material.id !== item.id)]
  setAppState({ materialsManual: next })
  await saveCache("materialsManual", next)
  return item
}

export async function deleteManualMaterial(id: string): Promise<void> {
  const next = useAppStore.getState().materialsManual.filter((material) => material.id !== id)
  setAppState({ materialsManual: next })
  await saveCache("materialsManual", next)
}
