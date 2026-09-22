import { create } from "zustand"

import { saveCache, saveCacheLocal } from "@/data/cache"
import { diffByKey, diffDevRecords, diffFabricEvents, diffRequestBoards, diffRequests, diffTsRecords, logAction, planRevert, type AuditAction, type AuditChange, type AuditKind } from "@/data/audit"
import { mergeChemicalPortfolio, type ChemicalItem, type ChemicalPortfolio } from "../data/chemical"
import { recalculateDevelopmentRecords } from "../data/dd-workflow"
import { buildFabricLedger, canceledOutboundIds, fabricRecordIdIndex, fabricRecordIdOf, fabricRecordIdentity, isFabricBalanceExhausted, type FabricLedgerItem } from "../data/fabric-ledger"
import type { DisposalCompletionEntry } from "@/data/disposal-round"
import { MEMBERS, materialIdOf, type CompletedSample, type DevRecord, type DisposalRound, type FabricAnalysisRow, type FabricLedgerAction, type FabricLedgerEvent, type FabricLedgerOverride, type FabricLedgerStatus, type MaterialDiagnostics, type MaterialItem, type RequestArchive, type RequestBoard, type RequestStyle, type StudyRecord } from "../data/schema"
import { FABRIC1_INTAKE_SHEET, WEB_INTAKE_SHEET } from "@/data/schema"
import {
  sampleCompleted,
  sampleChemicalPortfolio,
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
import { tsSeed, TS_SEED_VERSION } from "@/data/ts-seed"
import { isTsWellFormed } from "@/data/ts-health"
import type { RddaMonthlyReport, RddaReportV2, RddaWeeklySnapshot } from "@/data/rdda-report"
import type { RddaDataset } from "@/data/rdda-dataset"

export type Theme = "light" | "dark"
export type AppFilters = Record<string, unknown>
export const TS_STORAGE_KEY = "fabric.ts"
const TS_SEED_VERSION_KEY = "fabric.ts.seedVersion"
/** localStorage 전용이던 TS를 팀 공유 데이터로 1회 이관했는지 표시한다. */
const TS_SYNC_MIGRATED_KEY = "fabric.ts.syncMigrated"

export type IngestStep = "reading" | "parsing" | "validating" | "done" | "error"

/** DD 편집 저장 진행 상태. 편집은 즉시 반영하고 저장만 뒤로 미루므로 화면에 진행 상황을 알린다. */
export type RecordsSaveState = "idle" | "pending" | "saving" | "saved" | "error"

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
  rdda: RddaReport | RddaReportV2 | RddaDataset | null
  orgMembers: OrgMember[]
  materials: MaterialItem[]
  materialsManual: MaterialItem[]
  materialDiagnostics: MaterialDiagnostics
  fabricOverrides: FabricLedgerOverride[]
  fabricEvents: FabricLedgerEvent[]
  requests: RequestStyle[]
  requestBoards: RequestBoard[]
  requestArchive: RequestArchive[]
  disposalRounds: DisposalRound[]
  rddaSnapshots: RddaWeeklySnapshot[]
  rddaReports: RddaMonthlyReport[]
  trends: TrendItem[]
  chemical: ChemicalPortfolio | null
  chemicalManual: ChemicalItem[]
  chemicalLinks: Record<string, string>
  filters: AppFilters
  theme: Theme
  sensitiveUnlocked: boolean
  ingest: IngestState
  recordsSaveState: RecordsSaveState
}

export type AppStatePatch = Partial<Omit<AppState, "sensitiveUnlocked">>

/**
 * 캐시·Firestore에서 들어온 레코드에 파생값을 다시 입힌다.
 *
 * `recalculateDevelopmentRecords`는 업로드와 저장 때만 돈다. 그래서 `stage`·`devStatus` 같은
 * 파생값이 "저장하던 시점의 규칙"으로 굳은 채 캐시에 남는다. 판정 규칙을 바꿔도(예: 완료를
 * FL# 형식 기준으로) 이미 저장된 행에는 영영 반영되지 않는다. 불러오는 길목에서 한 번 다시 계산해
 * 화면·집계·내보내기가 같은 기준을 보게 한다.
 *
 * 되돌리기 경로(`writeDevelopmentRecords(records, false)`)는 여기를 거치지 않는다. 그쪽은
 * 값을 그대로 복원해야 하므로 손대지 않는다.
 */
export function normalizeLoadedRecords(patch: AppStatePatch): AppStatePatch {
  if (!Array.isArray(patch.records)) return patch
  return { ...patch, records: recalculateDevelopmentRecords(patch.records) }
}

const sensitiveFrom = (meta: DataMeta): boolean => meta.mode === "tds" && meta.passed

export function createInitialAppState(): AppState {
  const records = sampleRecords()
  const completed = sampleCompleted()
  const fabricAnalysis = sampleFabricAnalysis()
  const ts: TsRecord[] = tsSeed()
  const study = sampleStudy()
  const events = sampleEvents()
  const rdda = sampleRdda()
  const trends = sampleTrends()
  const chemical = sampleChemicalPortfolio()
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
    fabricOverrides: [],
    fabricEvents: [],
    requests: [],
    requestBoards: [],
    requestArchive: [],
    disposalRounds: [],
    rddaSnapshots: [],
    rddaReports: [],
    trends,
    chemical,
    chemicalManual: [],
    chemicalLinks: {},
    filters: {},
    theme: "light",
    sensitiveUnlocked: sensitiveFrom(meta),
    ingest: { active: false, kind: null, fileName: null, step: "done", message: null },
    recordsSaveState: "idle",
  }
}

export const useAppStore = create<AppState>(() => createInitialAppState())

/** 기존 store.set처럼 얕게 병합하되 민감 필드는 meta에서만 파생한다. */
export function setAppState(patch: AppStatePatch): void {
  useAppStore.setState((state) => {
    const meta = patch.meta ?? state.meta
    const chemicalManual = patch.chemicalManual ?? state.chemicalManual
    const shouldMergeChemical = Object.prototype.hasOwnProperty.call(patch, "chemical")
      || Object.prototype.hasOwnProperty.call(patch, "chemicalManual")
    const chemical = shouldMergeChemical
      ? mergeChemicalPortfolio(patch.chemical ?? state.chemical, chemicalManual)
      : state.chemical
    return {
      ...patch,
      ...(shouldMergeChemical ? { chemical, chemicalManual } : {}),
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

export function setChemicalPortfolio(chemical: ChemicalPortfolio): void {
  setAppState({ chemical })
}

export async function saveChemicalLinks(patch: Record<string, string>): Promise<void> {
  const next = { ...useAppStore.getState().chemicalLinks }
  Object.entries(patch).forEach(([key, value]) => {
    const trimmed = value.trim()
    if (trimmed) next[key] = trimmed
    else delete next[key]
  })
  setAppState({ chemicalLinks: next })
  await saveCache("chemicalLinks", next)
}

/** FABRIC REQUEST 원장 저장. IndexedDB 캐시와 팀 공유(Firestore)에 함께 반영한다. */
export function saveRequests(requests: RequestStyle[], kind: AuditKind = "edit"): void {
  const before = useAppStore.getState().requests
  setAppState({ requests })
  void saveCache("requests", requests)
  void logAction({ kind, screen: "request", changes: diffRequests(before, requests) })
}

export function saveRequestBoards(boards: RequestBoard[], kind: AuditKind = "edit"): void {
  const before = useAppStore.getState().requestBoards
  setAppState({ requestBoards: boards })
  void saveCache("requestBoards", boards)
  void logAction({ kind, screen: "request", changes: diffRequestBoards(before, boards) })
}

export function saveRequestsAndBoards(requests: RequestStyle[], boards: RequestBoard[], kind: AuditKind = "edit"): void {
  saveRequests(requests, kind)
  saveRequestBoards(boards, kind)
}

export function saveRequestArchive(list: RequestArchive[]): void {
  setAppState({ requestArchive: list })
  void saveCache("requestArchive", list)
}

export function saveDisposalRounds(list: DisposalRound[]): void {
  setAppState({ disposalRounds: list })
  void saveCache("disposalRounds", list)
}

export function saveRddaSnapshots(list: RddaWeeklySnapshot[]): void {
  setAppState({ rddaSnapshots: list })
  void saveCache("rddaSnapshots", list)
}

export function saveRddaReports(list: RddaMonthlyReport[]): void {
  const before = useAppStore.getState().rddaReports
  setAppState({ rddaReports: list })
  void saveCache("rddaReports", list)
  void logAction({ kind: "edit", screen: "rdda", changes: diffByKey(before, list, (item) => item.monthId) })
}

export function addTeamEvent(event: CalendarEvent): void {
  const id = event.id ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now())
  const next = [...useAppStore.getState().events, { ...event, id }]
  setAppState({ events: next })
  void saveCache("events", next)
}

export function deleteTeamEvent(id: string): void {
  const next = useAppStore.getState().events.filter((event) => event.id !== id)
  setAppState({ events: next })
  void saveCache("events", next)
}

export function updateTeamEvent(event: CalendarEvent): void {
  if (!event.id) return
  const next = useAppStore.getState().events.map((item) => item.id === event.id ? { ...item, ...event } : item)
  setAppState({ events: next })
  void saveCache("events", next)
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

/**
 * TS 목록을 저장한다. 다른 데이터와 동일하게 IndexedDB에 캐시하고,
 * 소유자로 로그인한 경우 Firestore 중앙 DB로도 반영해 팀원 화면에 실시간 공유된다.
 * localStorage 기록은 이전 버전과의 호환·로컬 백업 용도로만 남긴다(복구 시 사용).
 */
export function saveTsRecords(records: TsRecord[], kind: AuditKind = "edit"): void {
  const before = useAppStore.getState().ts
  const sorted = sortTsByDate(records)
  setAppState({ ts: sorted })
  persistTsRecords(sorted)
  void saveCache("ts", sorted)
  void logAction({ kind, screen: "ts", changes: diffTsRecords(before, sorted) })
}

/**
 * seed 버전이 바뀌면 로컬(IndexedDB) TS를 seed로 1회 교체한다.
 * seed는 내장 기준 데이터이므로 Firestore로는 올리지 않는다(saveCacheLocal).
 * 중앙에 실데이터가 있으면 로그인 후 스냅샷이 이 값을 덮어쓴다.
 */
export async function ensureTsSeed(): Promise<void> {
  let applied: string | null = null
  try { applied = window.localStorage.getItem(TS_SEED_VERSION_KEY) } catch { /* noop */ }
  if (applied === TS_SEED_VERSION) return
  const seed = sortTsByDate(tsSeed())
  setAppState({ ts: seed })
  persistTsRecords(seed)
  try { await saveCacheLocal("ts", seed) } catch { /* noop */ }
  try { window.localStorage.setItem(TS_SEED_VERSION_KEY, TS_SEED_VERSION) } catch { /* noop */ }
}

/**
 * TS는 예전에 localStorage에만 저장됐다(팀 공유 대상 밖).
 * 팀 공유(IndexedDB+Firestore)로 전환하면서, 그 시절 웹으로 등록·수정한 건이
 * 화면에서 사라지지 않도록 최초 1회만 현재 목록과 합친다.
 * 같은 id는 localStorage 값(=마지막으로 화면에 보이던 값)을 우선한다.
 * 1회 실행 뒤 플래그를 남겨, 이후 삭제한 건이 되살아나지 않게 한다.
 */
export async function migrateLocalTsIntoSync(): Promise<void> {
  try {
    if (window.localStorage.getItem(TS_SYNC_MIGRATED_KEY) === "1") return
  } catch {
    return
  }
  const stored = loadTsRecords()
  const current = useAppStore.getState().ts
  if (stored && stored.length) {
    const byId = new Map<string, TsRecord>()
    for (const record of current) byId.set(record.id.trim(), record)
    for (const record of stored) byId.set(record.id.trim(), record)
    const merged = sortTsByDate([...byId.values()])
    setAppState({ ts: merged })
    try { await saveCacheLocal("ts", merged) } catch { /* noop */ }
  }
  try { window.localStorage.setItem(TS_SYNC_MIGRATED_KEY, "1") } catch { /* noop */ }
}

/**
 * 구버전 파서가 만든 낡은 TS(접수일 없음 → "날짜 미등록"·월별 그래프 0)가
 * 중앙에서 내려와 로컬 캐시까지 덮은 경우를 되돌린다.
 * 복구 우선순위: localStorage 백업 → 내장 seed. 정상 데이터일 때는 아무것도 하지 않는다.
 */
export async function repairTsData(): Promise<boolean> {
  const current = useAppStore.getState().ts
  if (isTsWellFormed(current)) return false
  const backup = loadTsRecords()
  const source = isTsWellFormed(backup) ? backup! : tsSeed()
  if (!isTsWellFormed(source)) return false
  const repaired = sortTsByDate(source)
  setAppState({ ts: repaired })
  persistTsRecords(repaired)
  try { await saveCacheLocal("ts", repaired) } catch { /* noop */ }
  return true
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

const recordIdentity = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

type FabricState = Pick<AppState, "records" | "completed" | "fabricOverrides" | "fabricEvents">

function recordIdForFabricKey(state: FabricState, key: string, index?: ReadonlyMap<string, string>): string | undefined {
  const recordIds = index ?? fabricRecordIdIndex(buildFabricLedger(
    state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true },
  ))
  return recordIds.get(key)
}

function previousFabricOverride(
  overrides: readonly FabricLedgerOverride[],
  key: string,
  recordId?: string,
): FabricLedgerOverride | undefined {
  return overrides.find((entry) => entry.key === key)
    ?? (recordId ? overrides.find((entry) => entry.recordId === recordId) : undefined)
}

function normalizedIntakePart(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase()
}

function intakeSourceKey(record: DevRecord): string | null {
  const source = record.tech?.intakeSource
  if (source?.requestKey && source.optionKey) {
    return [source.kind, source.requestKey, source.optionKey].map(normalizedIntakePart).join("::")
  }
  const requestLink = record.tech?.requestLink
  if (!requestLink?.reqId || !requestLink.lineId) return null
  return ["request", requestLink.reqId, requestLink.lineId].map(normalizedIntakePart).join("::")
}

/** 원본 식별값이 없던 기존 웹 접수 행과 비교하기 위한 보수적인 대체 키. */
function legacyIntakeKey(record: DevRecord): string {
  const mills = record.tech?.mills
  return [
    record.owner, record.styleNo, record.season, record.requestDate, record.dueDate,
    record.buyer, record.planner, record.color, record.construction, record.weight,
    record.dyeing, record.tech?.yarnDetail, mills?.yarn, mills?.knitting, mills?.dyeing, mills?.finishing,
  ].map(normalizedIntakePart).join("::")
}

/** DD의 공통 업무 항목을 로컬 원장에 신규 등록하거나 수정한다. */
/**
 * DD 편집 저장 지연 계층.
 * 셀 하나 고칠 때마다 전체 레코드를 IndexedDB·Firestore 로 쓰면 타이핑마다 왕복이 생긴다.
 * 화면 상태는 즉시 갱신하고, 실제 저장은 마지막 편집에서 RECORDS_SAVE_DELAY 만큼 조용해진 뒤 한 번만 한다.
 * 저장 시점에는 항상 그 순간의 최신 records 를 쓴다(중간 스냅샷을 쌓지 않는다).
 */
const RECORDS_SAVE_DELAY = 500
let recordsSaveTimer: ReturnType<typeof setTimeout> | null = null
let recordsSaveChain: Promise<void> = Promise.resolve()
let savedNoticeTimer: ReturnType<typeof setTimeout> | null = null

function setRecordsSaveState(state: RecordsSaveState): void {
  useAppStore.setState({ recordsSaveState: state })
}

async function persistRecordsNow(): Promise<void> {
  if (recordsSaveTimer) { clearTimeout(recordsSaveTimer); recordsSaveTimer = null }
  setRecordsSaveState("saving")
  try {
    await saveCache("records", useAppStore.getState().records)
    setRecordsSaveState("saved")
    if (savedNoticeTimer) clearTimeout(savedNoticeTimer)
    savedNoticeTimer = setTimeout(() => {
      if (useAppStore.getState().recordsSaveState === "saved") setRecordsSaveState("idle")
    }, 2000)
  } catch (error) {
    // 저장에 실패해도 화면의 편집 결과는 유지한다. 사용자에게 실패만 알린다.
    setRecordsSaveState("error")
    throw error
  }
}

/** 편집 후 호출. 저장을 뒤로 미루되 마지막 호출 기준으로 한 번만 실행한다. */
function scheduleRecordsSave(): void {
  setRecordsSaveState("pending")
  if (recordsSaveTimer) clearTimeout(recordsSaveTimer)
  recordsSaveTimer = setTimeout(() => {
    recordsSaveTimer = null
    recordsSaveChain = recordsSaveChain.then(persistRecordsNow).catch(() => {})
  }, RECORDS_SAVE_DELAY)
}

/**
 * 대기 중인 저장을 즉시 내보낸다.
 * 화면 이탈·탭 전환·언마운트 시점에 반드시 호출해야 편집이 유실되지 않는다.
 */
export async function flushDevelopmentRecords(): Promise<void> {
  if (!recordsSaveTimer && useAppStore.getState().recordsSaveState !== "pending") {
    await recordsSaveChain
    return
  }
  recordsSaveChain = recordsSaveChain.then(persistRecordsNow).catch(() => {})
  await recordsSaveChain
}

if (typeof window !== "undefined") {
  // 탭을 닫거나 숨길 때 남은 편집을 흘려보낸다. beforeunload 에서는 비동기를 기다릴 수 없어 즉시 기동만 한다.
  window.addEventListener("beforeunload", () => { void flushDevelopmentRecords() })
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flushDevelopmentRecords() })
}

/**
 * 고른 작업을 되돌린다. 관리자 화면에서만 부른다.
 *
 * **현재 값이 그 작업의 결과와 다르면 건너뛴다.** 그 사이 다른 사람이 같은 칸을 고쳤다는 뜻이라,
 * 그냥 덮으면 그 사람 작업이 지워진다. 되돌린 사실 자체도 이력에 남긴다.
 *
 * 지금은 DD MASTER만 실제로 되돌린다. 창고 입출고는 이력이 곧 원장이라
 * 값을 되돌리는 대신 반대 작업(입고 취소·폐기 복구)을 화면에서 하는 것이 맞다.
 */
export async function applyAuditRevert(actions: readonly AuditAction[]): Promise<{ applied: number; conflicted: number }> {
  const records = useAppStore.getState().records
  const byKey = new Map(records.map((record) => [`${record._src.sheet}::${record._src.row}`, record]))
  const readCell = (key: string, field: string): string | null => {
    const record = byKey.get(key)
    if (!record) return null
    const value = field.split(".").reduce<unknown>((node, part) =>
      node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, record)
    return value === null || value === undefined ? "" : String(value)
  }

  const plans = planRevert(actions, readCell)
  const ddPlan = plans.find((plan) => plan.screen === "dd")
  const conflicted = plans.reduce((sum, plan) => sum + plan.conflicted, 0)
  if (!ddPlan || ddPlan.applicable === 0) return { applied: 0, conflicted }

  const drafts = new Map<string, DevRecord>()
  const undone: AuditChange[] = []
  for (const row of ddPlan.rows) {
    if (!row.ok) continue
    const key = row.change.k
    const base = drafts.get(key) ?? byKey.get(key)
    if (!base) continue
    // 되돌리기는 되돌리기다. 되돌린 값이 다시 이력에 "이후 값"으로 남아야 재되돌리기가 된다.
    drafts.set(key, writeNestedField(base, row.change.c, row.change.b))
    undone.push({ k: key, c: row.change.c, b: row.change.a, a: row.change.b })
  }
  if (!drafts.size) return { applied: 0, conflicted }

  const next = recalculateDevelopmentRecords(records.map((record) => {
    const key = `${record._src.sheet}::${record._src.row}`
    return drafts.get(key) ?? record
  }))
  setAppState({ records: next })
  scheduleRecordsSave()
  await logAction({ kind: "revert", screen: "dd", changes: undone })
  return { applied: undone.length, conflicted }
}

/** `tech.actual.weight` 같은 경로에 값을 넣은 사본을 만든다. 원본은 건드리지 않는다. */
function writeNestedField(record: DevRecord, field: string, value: string): DevRecord {
  const parts = field.split(".")
  const clone = structuredClone(record) as unknown as Record<string, unknown>
  let node: Record<string, unknown> = clone
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    const child = node[key]
    if (!child || typeof child !== "object") node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  const last = parts[parts.length - 1]
  const previous = node[last]
  // 원래 숫자였던 칸은 숫자로 되돌린다. 문자열로 넣으면 집계가 어긋난다.
  node[last] = typeof previous === "number" && value !== "" && Number.isFinite(Number(value)) ? Number(value) : value
  return clone as unknown as DevRecord
}

export async function saveDevelopmentRecord(record: DevRecord, previousIdentity?: string, kind: AuditKind = "edit"): Promise<void> {
  const current = useAppStore.getState().records
  const identity = previousIdentity ?? recordIdentity(record)
  const exists = current.some((item) => recordIdentity(item) === identity)
  const next = recalculateDevelopmentRecords(exists
    ? current.map((item) => recordIdentity(item) === identity ? record : item)
    : [record, ...current])
  setAppState({ records: next })
  scheduleRecordsSave()
  void logAction({ kind, screen: "dd", changes: diffDevRecords(current, next) })
}

export interface SaveDevelopmentIntakeResult {
  added: number
  skipped: number
  addedIdentities: string[]
}

/**
 * 첨부 작지의 옵션 행을 한 번에 저장한다.
 * 같은 작지 번호·Part·Color 조합은 재등록하지 않고, 식별값 도입 전 행은 주요 DD 필드로 대조한다.
 */
export async function saveDevelopmentIntakeRecords(records: readonly DevRecord[]): Promise<SaveDevelopmentIntakeResult> {
  const current = useAppStore.getState().records
  const existingSourceKeys = new Set(current.map(intakeSourceKey).filter((key): key is string => Boolean(key)))
  const legacyKeys = new Set(current.filter((record) => !intakeSourceKey(record)).map(legacyIntakeKey))
  const pendingSourceKeys = new Set<string>()
  const additions: DevRecord[] = []
  let skipped = 0

  for (const record of records) {
    const sourceKey = intakeSourceKey(record)
    const duplicate = sourceKey
      ? existingSourceKeys.has(sourceKey) || pendingSourceKeys.has(sourceKey) || legacyKeys.has(legacyIntakeKey(record))
      : false
    if (duplicate) {
      skipped += 1
      continue
    }
    if (sourceKey) pendingSourceKeys.add(sourceKey)
    additions.push(record)
  }

  if (additions.length) {
    const next = recalculateDevelopmentRecords([...additions, ...current])
    setAppState({ records: next })
    // 신규 접수는 중복 확인 결과를 곧바로 보여 주므로 저장까지 확실히 끝내고 넘어간다.
    await persistRecordsNow()
  }
  return { added: additions.length, skipped, addedIdentities: additions.map(recordIdentity) }
}

/** DD 행(샘플 옵션)을 원장에서 삭제한다. */
export async function deleteDevelopmentRecord(identity: string): Promise<void> {
  const state = useAppStore.getState()
  const current = state.records
  const next = current.filter((item) => recordIdentity(item) !== identity)
  if (next.length === current.length) return
  setAppState({ records: next })
  scheduleRecordsSave()

  // 창고에서 숨겨 둔 행의 DD 원본을 지우면 숨김 기록도 같이 지운다.
  // 남겨 두면 같은 내용으로 다시 등록했을 때 원장 key가 겹쳐 또 숨은 채로 나타난다.
  // 채번·재고·출고 기록(다른 상태의 오버라이드)은 건드리지 않는다.
  const hidden = buildFabricLedger(current, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true })
    .find((item) => item.status === "REMOVED" && fabricRecordIdentity(item.record) === identity)
  if (!hidden) return
  const fabricOverrides = state.fabricOverrides.filter((item) => item.key !== hidden.key)
  const fabricEvents = state.fabricEvents.filter((event) => !(event.fabricKey === hidden.key && event.action === "REMOVE"))
  if (fabricOverrides.length === state.fabricOverrides.length && fabricEvents.length === state.fabricEvents.length) return
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([saveCache("fabricOverrides", fabricOverrides), saveCache("fabricEvents", fabricEvents)])
}

/**
 * 화면에 보이는 순서(identity 배열)를 그대로 수동 정렬 순서로 굳힌다.
 * 배열에 담긴 레코드에는 index 기반 sortOrder 를 부여하고, 나머지는 그대로 둔다.
 * 필터가 없는 전체 목록에서만 호출하므로 모든 레코드에 순서가 매겨진다.
 */
/**
 * 여러 행을 한 번에 저장한다(붙여넣기·내용 지우기·되돌리기).
 * recalculate=false 면 값을 그대로 복원한다(되돌리기 전용).
 */
export async function writeDevelopmentRecords(records: DevRecord[], recalculate = true, kind: AuditKind = "paste"): Promise<void> {
  const before = useAppStore.getState().records
  const next = recalculate ? recalculateDevelopmentRecords(records) : records
  setAppState({ records: next })
  scheduleRecordsSave()
  void logAction({ kind, screen: "dd", changes: diffDevRecords(before, next) })
}

export async function reorderDevelopmentRecords(orderedIdentities: readonly string[]): Promise<void> {
  const rank = new Map(orderedIdentities.map((identity, index) => [identity, index]))
  const current = useAppStore.getState().records
  const next = current.map((record) => {
    const order = rank.get(recordIdentity(record))
    return order === undefined ? record : { ...record, sortOrder: order }
  })
  setAppState({ records: next })
  scheduleRecordsSave()
}

export interface ApplyFabricActionInput {
  fabricKey: string
  action: FabricLedgerAction
  fromStatus: FabricLedgerStatus
  toStatus: FabricLedgerStatus
  actor?: string
  note?: string
  storageNo?: string
  roll?: boolean
  autoExhaust?: boolean
  yds?: number
  /** 보유 재고를 비운다. 값을 지우는 것과 값을 안 건드리는 것을 구분한다. */
  clearYds?: boolean
  qty?: number
  to?: string
  division?: string
  reason?: string
  date?: string
  recordIdentity?: string
  targetEventId?: string
}

export interface FabricUndoEntry {
  /** 이 동작이 추가한 이벤트 id. */
  eventIds: string[]
  /** 이 동작이 바꾼 원단별 상태. before가 undefined면 이 동작이 새로 만든 것. */
  overrides: { key: string; before: FabricLedgerOverride | undefined; after: FabricLedgerOverride }[]
  /** 이 동작이 바꾼 DD 행. */
  records: { id: string; before: DevRecord; after: DevRecord }[]
  /** 알림을 보낸 동작이면 되돌릴 때 판단하는 종류. */
  kind: FabricLedgerAction
}

/** 상태 변경과 변경 이력을 함께 저장한다. 원본 엑셀은 수정하지 않는다. */
/** 대장에 없는 건(yds 만 수취한 경우 등)을 입고 대기에 빈 행으로 추가한다. 값은 그리드에서 직접 채운다. */
export async function addManualIntake(): Promise<string> {
  const state = useAppStore.getState()
  const today = new Date().toISOString().slice(0, 10)
  const id = `web:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  const sample: CompletedSample = {
    id,
    storageNo: "",
    styleNo: "",
    flNo: "",
    season: "",
    category: "",
    buyer: "",
    owner: "",
    construction: "",
    requestDate: today,
    sourceSheet: WEB_INTAKE_SHEET,
    process: { knit: "", dye: "", finish: "", remark: "" },
    inhouse: { widthCm: null, weightGsm: null, shrinkagePct: { length: null, width: null }, pilling: null },
    completedAt: today,
  }
  const completed = [...state.completed, sample]
  setAppState({ completed })
  await saveCache("completed", completed)
  return id
}

/** 그리드에서 고친 값을 웹 등록 행에 반영한다. 대장·DD 에서 온 행은 대상이 아니다. */
export async function updateManualIntake(id: string, columnId: string, raw: string): Promise<void> {
  const state = useAppStore.getState()
  const value = raw.trim()
  const completed = state.completed.map((sample) => {
    if (sample.id !== id || (sample.sourceSheet !== WEB_INTAKE_SHEET && sample.sourceSheet !== FABRIC1_INTAKE_SHEET)) return sample
    const ledger = { ...(sample.ledger ?? {}) }
    switch (columnId) {
      case "styleNo": return { ...sample, styleNo: value }
      case "flNo": return { ...sample, flNo: value }
      case "buyer": return { ...sample, buyer: value }
      case "season": return { ...sample, season: value }
      case "category": return { ...sample, category: value }
      case "owner": return { ...sample, owner: value }
      case "construction": return { ...sample, construction: value }
      case "requestDate": return { ...sample, requestDate: value, completedAt: sample.sourceSheet === FABRIC1_INTAKE_SHEET ? value : sample.completedAt }
      case "note": return { ...sample, process: { ...sample.process, remark: value } }
      case "originalRef": ledger.originalRef = value; return { ...sample, ledger }
      case "planner": ledger.planner = value; return { ...sample, ledger }
      case "yarnDetail": ledger.yarnDetail = value; return { ...sample, ledger }
      case "color": ledger.color = value; return { ...sample, ledger }
      case "dyeing": ledger.dyeingSide = value; return { ...sample, ledger }
      default: return sample
    }
  })
  setAppState({ completed })
  await saveCache("completed", completed)
}

/**
 * 엑셀 대장에서 넘어온 기존 재고를 한 번에 확인 처리한다.
 * applyFabricAction 을 건마다 부르면 저장이 그만큼 반복되므로 이벤트를 모아 한 번만 쓴다.
 * 대장의 회색 표시는 셀 서식이라 파싱되지 않는다. 그래서 어느 건이 확인됐는지 알 수 없고,
 * 이관 시점에 창고에 있는 재고를 확인된 것으로 본다. 이력에는 이관이라고 남긴다.
 */
export async function confirmWarehouseBaseline(entries: ReadonlyArray<{ key: string; storageNo: string }>, actor = "관리자"): Promise<number> {
  if (entries.length === 0) return 0
  const state = useAppStore.getState()
  const recordIds = fabricRecordIdIndex(buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true }))
  const occurredAt = new Date().toISOString()
  const events: FabricLedgerEvent[] = entries.map((entry, index) => ({
    id: `confirm-baseline-${occurredAt}-${index}`,
    fabricKey: entry.key,
    recordId: recordIdForFabricKey(state, entry.key, recordIds),
    action: "CONFIRM",
    fromStatus: "WAREHOUSE",
    toStatus: "WAREHOUSE",
    occurredAt,
    recordedAt: occurredAt,
    actor,
    note: "기존 재고 일괄 확인 (엑셀 대장 이관)",
    storageNo: entry.storageNo,
  }))
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricEvents })
  await saveCache("fabricEvents", fabricEvents)
  return events.length
}

/**
 * 폐기 라운드 최종 확정. 폐기·컷팅으로 판정된 원단을 창고 보관에서 이력(DISPOSED)으로 한 번에 옮긴다.
 * applyFabricAction 을 건마다 부르면 라운드 건수만큼 전체 저장이 반복되므로
 * confirmWarehouseBaseline 처럼 오버라이드와 이벤트를 모아 한 번만 쓴다.
 */
export async function applyDisposalRoundCompletion(
  entries: ReadonlyArray<DisposalCompletionEntry>,
  options: { reason: string; actor: string },
): Promise<number> {
  if (entries.length === 0) return 0
  const state = useAppStore.getState()
  const recordIds = fabricRecordIdIndex(buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true }))
  const occurredAt = new Date().toISOString()
  const actor = options.actor.trim() || "관리자"
  const overrides: FabricLedgerOverride[] = []
  const events: FabricLedgerEvent[] = []
  const replacedKeys = new Set<string>()
  const replacedRecordIds = new Set<string>()
  entries.forEach((entry, index) => {
    const recordId = recordIdForFabricKey(state, entry.key, recordIds)
    const previous = previousFabricOverride(state.fabricOverrides, entry.key, recordId)
    replacedKeys.add(entry.key)
    if (previous) replacedKeys.add(previous.key)
    if (recordId) replacedRecordIds.add(recordId)
    const storageNo = entry.storageNo.trim() || previous?.storageNo
    overrides.push({
      key: entry.key,
      recordId: recordId ?? previous?.recordId,
      status: "DISPOSED",
      storageNo,
      yds: previous?.yds,
      // 창고를 떠나므로 rack 칸을 비운다. applyFabricAction 과 같은 규칙이다.
      rackNo: undefined,
      roll: previous?.roll,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt: occurredAt,
      updatedBy: actor,
    })
    events.push({
      id: `disposal-round-${occurredAt}-${index}`,
      fabricKey: entry.key,
      recordId: recordId ?? previous?.recordId,
      action: "DISPOSE",
      fromStatus: entry.fromStatus,
      toStatus: "DISPOSED",
      occurredAt,
      recordedAt: occurredAt,
      actor,
      note: entry.note,
      storageNo,
      reason: options.reason,
    })
  })
  const fabricOverrides = [...overrides, ...state.fabricOverrides.filter((entry) =>
    !replacedKeys.has(entry.key) && !(entry.recordId && replacedRecordIds.has(entry.recordId)))]
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
  ])
  return entries.length
}

const numberOrNull = (value: string): number | null => {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : null
}

/** 원단 상세에서 고친 값 하나를 DD 레코드에 반영한다. 모르는 필드는 null을 돌려준다. */
function applyFabricFieldToRecord(record: DevRecord, field: string, value: string): DevRecord | null {
  const tech = record.tech ?? {}
  switch (field) {
    case "styleNo": case "flNo": case "season": case "category": case "buyer":
    case "owner": case "planner": case "construction": case "color": case "dyeing":
    case "note": case "requestDate": case "dueDate":
      return { ...record, [field]: value }
    case "weight": {
      const parsed = Number(value)
      return { ...record, weight: value.trim() && Number.isFinite(parsed) ? parsed : "" }
    }
    case "completedAt": return { ...record, receivedDate: value }
    case "yarnDetail": return { ...record, tech: { ...tech, yarnDetail: value } }
    case "review": return { ...record, tech: { ...tech, review: value } }
    case "passFail": return { ...record, tech: { ...tech, passFail: value } }
    case "millYarn": return { ...record, tech: { ...tech, mills: { ...tech.mills, yarn: value } } }
    case "millKnitting": return { ...record, tech: { ...tech, mills: { ...tech.mills, knitting: value } } }
    case "millDyeing": return { ...record, tech: { ...tech, mills: { ...tech.mills, dyeing: value } } }
    case "millFinishing": return { ...record, tech: { ...tech, mills: { ...tech.mills, finishing: value } } }
    case "fds": return { ...record, tech: { ...tech, sampleDates: { ...tech.sampleDates, fds: value } } }
    case "yds": return { ...record, tech: { ...tech, sampleDates: { ...tech.sampleDates, yds: value } } }
    case "actualWidth": return { ...record, tech: { ...tech, actual: { ...tech.actual, width: numberOrNull(value) } } }
    case "actualWeight": return { ...record, tech: { ...tech, actual: { ...tech.actual, weight: numberOrNull(value) } } }
    case "shrinkageLength": return { ...record, tech: { ...tech, actual: { ...tech.actual, shrinkageLength: numberOrNull(value) } } }
    case "shrinkageWidth": return { ...record, tech: { ...tech, actual: { ...tech.actual, shrinkageWidth: numberOrNull(value) } } }
    default: return null
  }
}

/**
 * 원단 상세에서 고친 값을 한 번에 저장한다.
 * DD 레코드가 붙은 행은 DevRecord에 쓴다. 그래야 DD MASTER의 같은 옵션 행이 함께 움직인다.
 * DD가 없는 샘플관리대장 행은 원장 오버라이드에 수정본을 쌓는다(대장 원본은 그대로 둔다).
 */
export async function saveFabricFields(item: FabricLedgerItem, patch: Record<string, string>): Promise<void> {
  const entries = Object.entries(patch)
  if (!entries.length) return
  if (item.record) {
    // 한 번에 모아 저장한다. 칸마다 저장하면 그때마다 전체 레코드가 중앙으로 올라간다.
    let next = item.record
    let changed = false
    for (const [field, value] of entries) {
      const applied = applyFabricFieldToRecord(next, field, value)
      if (!applied) continue
      next = applied
      changed = true
    }
    if (!changed) return
    await saveDevelopmentRecord(next, recordIdentity(item.record))
    await flushDevelopmentRecords()
    return
  }
  const state = useAppStore.getState()
  const previous = state.fabricOverrides.find((entry) => entry.key === item.key)
  const override: FabricLedgerOverride = {
    key: item.key,
    recordId: previous?.recordId,
    status: previous?.status ?? item.status,
    storageNo: previous?.storageNo ?? (item.storageNo || undefined),
    yds: previous?.yds ?? (item.yds ?? undefined),
    rackNo: previous?.rackNo,
    roll: previous?.roll,
    note: previous?.note,
    fields: { ...previous?.fields, ...patch },
    updatedAt: new Date().toISOString(),
    updatedBy: "관리자",
  }
  const fabricOverrides = [override, ...state.fabricOverrides.filter((entry) => entry.key !== item.key)]
  setAppState({ fabricOverrides })
  await saveCache("fabricOverrides", fabricOverrides)
}

const FABRIC1_SAMPLE_FIELDS = new Set(["flNo", "color", "construction", "owner", "requestDate", "note", "season", "buyer"])
const FABRIC1_OVERRIDE_FIELDS = new Set(["millRef", "content", "actualWidth", "actualWeight", "priceYd", "priceLb", "supplier"])

/** 1팀 창고 표에서 선택한 여러 셀을 저장소별로 모아 한 번씩 비운다. */
export async function clearFabric1Cells(entries: ReadonlyArray<{ item: FabricLedgerItem; columnId: string }>): Promise<number> {
  if (!entries.length) return 0
  const state = useAppStore.getState()
  const sampleTargets = new Map<string, Set<string>>()
  const fieldTargets = new Map<string, { item: FabricLedgerItem; fields: Set<string> }>()

  for (const { item, columnId } of entries) {
    if (item.sample?.sourceSheet !== FABRIC1_INTAKE_SHEET) continue
    const sampleId = item.sample.id
    if (!sampleId) continue
    if (FABRIC1_SAMPLE_FIELDS.has(columnId)) {
      const fields = sampleTargets.get(sampleId) ?? new Set<string>()
      fields.add(columnId)
      sampleTargets.set(sampleId, fields)
    } else if (FABRIC1_OVERRIDE_FIELDS.has(columnId)) {
      const target = fieldTargets.get(item.key) ?? { item, fields: new Set<string>() }
      target.fields.add(columnId)
      fieldTargets.set(item.key, target)
    }
  }

  let changed = 0
  let completedChanged = false
  const completed = state.completed.map((sample) => {
    const fields = sample.id ? sampleTargets.get(sample.id) : undefined
    if (!fields?.size || sample.sourceSheet !== FABRIC1_INTAKE_SHEET) return sample
    let next = sample
    for (const field of fields) {
      if (field === "flNo" && next.flNo) { next = { ...next, flNo: "" }; changed += 1 }
      else if (field === "color" && next.ledger?.color) { next = { ...next, ledger: { ...next.ledger, color: "" } }; changed += 1 }
      else if (field === "construction" && next.construction) { next = { ...next, construction: "" }; changed += 1 }
      else if (field === "owner" && next.owner) { next = { ...next, owner: "" }; changed += 1 }
      else if (field === "requestDate" && next.requestDate) { next = { ...next, requestDate: "", completedAt: "" }; changed += 1 }
      else if (field === "note" && next.process.remark) { next = { ...next, process: { ...next.process, remark: "" } }; changed += 1 }
      else if (field === "season" && next.season) { next = { ...next, season: "" }; changed += 1 }
      else if (field === "buyer" && next.buyer) { next = { ...next, buyer: "" }; changed += 1 }
    }
    if (next !== sample) completedChanged = true
    return next
  })

  const updatedAt = new Date().toISOString()
  const replacements = new Map<string, FabricLedgerOverride>()
  for (const { item, fields } of fieldTargets.values()) {
    const previous = state.fabricOverrides.find((entry) => entry.key === item.key)
    const nextFields = { ...previous?.fields }
    let itemChanged = false
    for (const field of fields) {
      if (!(item.fields[field] ?? "").trim()) continue
      nextFields[field] = ""
      itemChanged = true
      changed += 1
    }
    if (!itemChanged) continue
    replacements.set(item.key, {
      key: item.key,
      recordId: previous?.recordId,
      status: previous?.status ?? item.status,
      storageNo: previous?.storageNo ?? (item.storageNo || undefined),
      yds: previous?.yds ?? (item.yds ?? undefined),
      rackNo: previous?.rackNo ?? item.rackNo,
      roll: previous?.roll ?? item.roll,
      note: previous?.note,
      fields: nextFields,
      updatedAt,
      updatedBy: "관리자",
    })
  }

  if (completedChanged) {
    setAppState({ completed })
    await saveCache("completed", completed)
  }
  if (replacements.size) {
    const fabricOverrides = [...replacements.values(), ...state.fabricOverrides.filter((entry) => !replacements.has(entry.key))]
    setAppState({ fabricOverrides })
    await saveCache("fabricOverrides", fabricOverrides)
  }
  return changed
}

/**
 * 창고보관 원단의 rack 칸 번호를 저장한다. 빈 문자열이면 지정 해제다.
 * 형식 검사는 호출부(`normalizeRackNo`)가 한다. 원단별 상태 한 건만 바꾸고 다른 값은 그대로 물려준다.
 */
export async function saveFabricRackNo(item: FabricLedgerItem, rackNo: string): Promise<void> {
  await saveFabricRackNos([{ item, rackNo }])
}

/**
 * 여러 원단의 rack 번호를 한 번에 저장한다(Delete로 여러 칸 지우기 등).
 * 원단마다 따로 저장하면 앞 저장을 뒤 저장이 덮어쓸 수 있어 새 배열을 한 번만 만든다.
 */
export async function saveFabricRackNos(entries: ReadonlyArray<{ item: FabricLedgerItem; rackNo: string }>): Promise<number> {
  const state = useAppStore.getState()
  const updatedAt = new Date().toISOString()
  const replacements = new Map<string, FabricLedgerOverride>()
  const replacedKeys = new Set<string>()
  const replacedRecordIds = new Set<string>()
  let changed = 0
  for (const { item, rackNo } of entries) {
    const recordId = fabricRecordIdOf(item)
    const previous = previousFabricOverride(state.fabricOverrides, item.key, recordId)
    const nextRack = rackNo.trim() || undefined
    if (previous ? previous.rackNo === nextRack : !nextRack) continue
    const next: FabricLedgerOverride = {
      key: item.key,
      recordId: recordId ?? previous?.recordId,
      status: previous?.status ?? item.status,
      storageNo: previous?.storageNo ?? (item.storageNo || undefined),
      yds: previous?.yds ?? (item.yds ?? undefined),
      rackNo: nextRack,
      roll: previous?.roll,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt,
      updatedBy: "관리자",
    }
    replacements.set(recordId ? `record:${recordId}` : `key:${item.key}`, next)
    replacedKeys.add(item.key)
    if (previous) replacedKeys.add(previous.key)
    if (next.recordId) replacedRecordIds.add(next.recordId)
    changed += 1
  }
  if (!changed) return 0
  const fabricOverrides = [
    ...replacements.values(),
    ...state.fabricOverrides.filter((entry) =>
      !replacedKeys.has(entry.key) && !(entry.recordId && replacedRecordIds.has(entry.recordId))),
  ]
  setAppState({ fabricOverrides })
  await saveCache("fabricOverrides", fabricOverrides)
  return changed
}

export interface Fabric1IntakeInput {
  storageNo: string
  flNo: string
  color: string
  construction: string
  owner: string
  requestDate: string
  note: string
  yds: number | null
  roll: boolean
  /** 1팀 대장 Season, Brand(= buyer). R242에서 표에 더했다. 비우면 빈 칸. */
  season?: string
  buyer?: string
  /** 입고 이력 시각. 비우면 지금이다. 기존 대장 이관은 입고 요청일을 넣어 이번 주 창고 보고에 잡히지 않게 한다. */
  occurredAt?: string
  /** 입고 이력 메모. 비우면 "1팀 신규 입고". */
  eventNote?: string
  /** millRef, content, actualWidth, actualWeight, priceYd, priceLb, supplier */
  fields: Record<string, string>
}

/** 1팀은 실물을 받은 뒤 등록하므로 샘플·창고 상태·입고 이력을 한 작업으로 저장한다. */
export async function addFabric1Intake(inputs: readonly Fabric1IntakeInput[]): Promise<void> {
  if (!inputs.length) return
  const state = useAppStore.getState()
  const now = new Date().toISOString()
  const samples: CompletedSample[] = inputs.map((input, index) => ({
    id: `f1:${Date.now()}:${index}:${Math.random().toString(36).slice(2, 8)}`,
    storageNo: input.storageNo.trim(),
    styleNo: "",
    flNo: input.flNo.trim(),
    season: input.season?.trim() ?? "",
    category: "",
    buyer: input.buyer?.trim() ?? "",
    owner: input.owner.trim(),
    construction: input.construction.trim(),
    requestDate: input.requestDate,
    sourceSheet: FABRIC1_INTAKE_SHEET,
    ledger: { color: input.color.trim() },
    process: { knit: "", dye: "", finish: "", remark: "" },
    inhouse: { widthCm: null, weightGsm: null, shrinkagePct: { length: null, width: null }, pilling: null },
    completedAt: input.requestDate,
  }))
  samples.forEach((sample, index) => { sample.process.remark = inputs[index].note.trim() })
  const completed = [...state.completed, ...samples]
  setAppState({ completed })
  await saveCache("completed", completed)

  const created = buildFabricLedger(state.records, completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true })
  const keys = inputs.map((input) => created.find((item) => item.storageNo === input.storageNo.trim() && item.sourceSheet === FABRIC1_INTAKE_SHEET)?.key)
  if (keys.some((key) => !key)) throw new Error("신규 입고 원단을 원장에서 찾지 못했습니다.")

  const replacements = new Map<string, FabricLedgerOverride>()
  inputs.forEach((input, index) => {
    const key = keys[index] as string
    replacements.set(key, {
      key,
      status: "WAREHOUSE",
      storageNo: input.storageNo.trim(),
      ...(input.yds === null ? {} : { yds: input.yds }),
      ...(input.roll ? { roll: true } : {}),
      fields: Object.fromEntries(Object.entries(input.fields).filter(([, value]) => value.trim())),
      updatedAt: now,
      updatedBy: input.owner.trim() || "관리자",
    })
  })
  const fabricOverrides = [...replacements.values(), ...state.fabricOverrides.filter((entry) => !replacements.has(entry.key))]
  setAppState({ fabricOverrides })
  await saveCache("fabricOverrides", fabricOverrides)

  const newEvents: FabricLedgerEvent[] = inputs.map((input, index) => ({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    fabricKey: keys[index] as string,
    action: "RECEIVE",
    fromStatus: "READY",
    toStatus: "WAREHOUSE",
    occurredAt: input.occurredAt || now,
    recordedAt: now,
    actor: input.owner.trim() || "관리자",
    note: input.eventNote || "1팀 신규 입고",
    storageNo: input.storageNo.trim(),
    qty: input.yds ?? undefined,
  }))
  const fabricEvents = [...newEvents].reverse().concat(state.fabricEvents)
  setAppState({ fabricEvents })
  await saveCache("fabricEvents", fabricEvents)
}

/**
 * 선택한 원단의 롤 표시를 한 번에 켜고 끈다.
 * 원단마다 따로 저장하면 앞 저장을 뒤 저장이 덮어쓸 수 있어 새 배열을 한 번만 만든다.
 */
export async function saveFabricRolls(entries: ReadonlyArray<{ item: FabricLedgerItem; roll: boolean }>): Promise<number> {
  const state = useAppStore.getState()
  const updatedAt = new Date().toISOString()
  const replacements = new Map<string, FabricLedgerOverride>()
  const replacedKeys = new Set<string>()
  const replacedRecordIds = new Set<string>()
  let changed = 0
  for (const { item, roll } of entries) {
    const recordId = fabricRecordIdOf(item)
    const previous = previousFabricOverride(state.fabricOverrides, item.key, recordId)
    if ((previous?.roll ?? false) === roll) continue
    const next: FabricLedgerOverride = {
      key: item.key,
      recordId: recordId ?? previous?.recordId,
      status: previous?.status ?? item.status,
      storageNo: previous?.storageNo ?? (item.storageNo || undefined),
      yds: previous?.yds ?? (item.yds ?? undefined),
      rackNo: previous?.rackNo,
      roll: roll || undefined,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt,
      updatedBy: "관리자",
    }
    replacements.set(recordId ? `record:${recordId}` : `key:${item.key}`, next)
    replacedKeys.add(item.key)
    if (previous) replacedKeys.add(previous.key)
    if (next.recordId) replacedRecordIds.add(next.recordId)
    changed += 1
  }
  if (!changed) return 0
  const fabricOverrides = [
    ...replacements.values(),
    ...state.fabricOverrides.filter((entry) =>
      !replacedKeys.has(entry.key) && !(entry.recordId && replacedRecordIds.has(entry.recordId))),
  ]
  setAppState({ fabricOverrides })
  await saveCache("fabricOverrides", fabricOverrides)
  return changed
}

export async function applyFabricActions(inputs: ReadonlyArray<ApplyFabricActionInput>): Promise<FabricUndoEntry> {
  if (!inputs.length) return { eventIds: [], overrides: [], records: [], kind: "NOTE" }
  const state = useAppStore.getState()
  const beforeEvents = state.fabricEvents
  const recordIds = fabricRecordIdIndex(buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true }))
  const occurredAt = new Date().toISOString()
  const overrideMap = new Map<string, FabricLedgerOverride>()
  state.fabricOverrides.forEach((item) => {
    overrideMap.set(`key:${item.key}`, item)
    if (item.recordId && !overrideMap.has(`record:${item.recordId}`)) overrideMap.set(`record:${item.recordId}`, item)
  })
  const replacements = new Map<string, FabricLedgerOverride>()
  const undoOverrides: FabricUndoEntry["overrides"] = []
  const replacedKeys = new Set<string>()
  const replacedRecordIds = new Set<string>()
  const outboundTotals = new Map<string, number>()
  const canceledOutbounds = canceledOutboundIds(state.fabricEvents)
  state.fabricEvents.forEach((event) => {
    if (event.action !== "OUTBOUND" || canceledOutbounds.has(event.id) || typeof event.qty !== "number" || !Number.isFinite(event.qty) || event.qty <= 0) return
    const identity = event.recordId ?? recordIdForFabricKey(state, event.fabricKey, recordIds) ?? event.fabricKey
    outboundTotals.set(identity, (outboundTotals.get(identity) ?? 0) + event.qty)
  })
  const newEvents: FabricLedgerEvent[] = []
  let records = state.records

  for (const input of inputs) {
    const actor = input.actor?.trim() || "관리자"
    const recordId = recordIdForFabricKey(state, input.fabricKey, recordIds) ?? input.recordIdentity
    const previous = overrideMap.get(`key:${input.fabricKey}`)
      ?? (recordId ? overrideMap.get(`record:${recordId}`) : undefined)
    let targetOutbound: FabricLedgerEvent | undefined
    if (input.action === "UNOUTBOUND") {
      if (!input.targetEventId) throw new Error("취소할 출고 기록이 없습니다.")
      targetOutbound = state.fabricEvents.find((event) => event.id === input.targetEventId)
      const sameFabric = targetOutbound && (recordId && targetOutbound.recordId
        ? targetOutbound.recordId === recordId
        : targetOutbound.fabricKey === input.fabricKey)
      if (!targetOutbound || targetOutbound.action !== "OUTBOUND" || !sameFabric || canceledOutbounds.has(targetOutbound.id)) {
        throw new Error("취소할 수 없는 출고 기록입니다.")
      }
      canceledOutbounds.add(targetOutbound.id)
    }
    const yds = input.yds === undefined ? previous?.yds : Number.isFinite(input.yds) && input.yds >= 0 ? input.yds : undefined
    if (input.yds !== undefined && yds === undefined) throw new Error("보유 재고는 0 이상의 숫자여야 합니다.")
    const qty = input.qty === undefined ? undefined : Number.isFinite(input.qty) && input.qty > 0 ? input.qty : undefined
    if (input.action === "OUTBOUND" && qty === undefined) throw new Error("출고 수량은 0보다 커야 합니다.")
    const recipient = input.to?.trim()
    if (input.action === "OUTBOUND" && !recipient) throw new Error("출고 수령자를 입력해야 합니다.")
    const ledgerIdentity = recordId ?? input.fabricKey
    const outboundTotal = Math.max(0, (outboundTotals.get(ledgerIdentity) ?? 0)
      + (input.action === "OUTBOUND" ? qty ?? 0 : 0)
      - (input.action === "UNOUTBOUND" ? targetOutbound?.qty ?? 0 : 0))
    const autoExhaust = input.autoExhaust !== false
    const shouldAutoExhaust = autoExhaust && (input.action === "OUTBOUND" || (input.yds !== undefined && input.action !== "RESTORE" && input.action !== "DISPOSE"))
    const resolvedToStatus = input.action === "UNOUTBOUND"
      ? (previous?.status ?? input.fromStatus) === "EXHAUSTED" ? "WAREHOUSE" : previous?.status ?? input.fromStatus
      : shouldAutoExhaust && isFabricBalanceExhausted(yds, outboundTotal) ? "EXHAUSTED"
        : input.action === "OUTBOUND" ? previous?.status ?? input.fromStatus : input.toStatus
    const selectedDate = input.date?.trim()
    const selectedDateValue = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? new Date(`${selectedDate}T12:00:00`) : null
    const eventOccurredAt = selectedDateValue && !Number.isNaN(selectedDateValue.getTime()) ? selectedDateValue.toISOString() : occurredAt
    const override: FabricLedgerOverride = {
      key: input.fabricKey, status: resolvedToStatus,
      recordId: recordId ?? previous?.recordId,
      storageNo: resolvedToStatus === "READY" ? undefined : input.storageNo?.trim() || previous?.storageNo,
      yds: resolvedToStatus === "READY" || input.clearYds ? undefined : yds,
      rackNo: resolvedToStatus === "WAREHOUSE" ? previous?.rackNo : undefined,
      roll: input.roll ?? previous?.roll,
      note: input.note?.trim() || previous?.note, fields: previous?.fields, updatedAt: occurredAt, updatedBy: actor,
    }
    const replacementKey = override.recordId ? `record:${override.recordId}` : `key:${input.fabricKey}`
    undoOverrides.push({ key: input.fabricKey, before: previous, after: override })
    replacements.set(replacementKey, override)
    overrideMap.set(`key:${input.fabricKey}`, override)
    if (override.recordId) overrideMap.set(`record:${override.recordId}`, override)
    replacedKeys.add(input.fabricKey)
    if (previous) replacedKeys.add(previous.key)
    if (override.recordId) replacedRecordIds.add(override.recordId)
    if (input.action === "OUTBOUND" || input.action === "UNOUTBOUND") outboundTotals.set(ledgerIdentity, outboundTotal)
    newEvents.push({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fabricKey: input.fabricKey, action: input.action, fromStatus: input.fromStatus, toStatus: resolvedToStatus,
      recordId: recordId ?? previous?.recordId,
      occurredAt: eventOccurredAt, recordedAt: occurredAt, actor, note: input.note?.trim() || "",
      storageNo: input.storageNo?.trim() || previous?.storageNo, qty, to: recipient,
      division: input.division?.trim() || undefined, reason: input.reason?.trim() || undefined,
      targetEventId: input.targetEventId,
    })
    if (input.action === "COMPLETE" && input.recordIdentity) {
      records = records.map((record) => recordIdentity(record) === input.recordIdentity
        ? { ...record, devStatus: "완료", stage: "완료", receivedDate: record.receivedDate || occurredAt.slice(0, 10) }
        : record)
    }
  }
  const fabricOverrides = [...replacements.values(), ...state.fabricOverrides.filter((item) =>
    !replacedKeys.has(item.key) && !(item.recordId && replacedRecordIds.has(item.recordId)))]
  const fabricEvents = [...newEvents].reverse().concat(state.fabricEvents)
  setAppState({ fabricOverrides, fabricEvents, records })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
    records === state.records ? Promise.resolve() : saveCache("records", records),
  ])
  void logAction({ kind: "warehouse", screen: "warehouse", changes: diffFabricEvents(beforeEvents, useAppStore.getState().fabricEvents) })
  const beforeRecords = new Map(state.records.map((record) => [recordIdentity(record), record]))
  const undoRecords = records.flatMap((record) => {
    const id = recordIdentity(record)
    const before = beforeRecords.get(id)
    return before && JSON.stringify(before) !== JSON.stringify(record) ? [{ id, before, after: record }] : []
  })
  return { eventIds: newEvents.map((event) => event.id), overrides: undoOverrides, records: undoRecords, kind: inputs[0].action }
}

export async function applyFabricAction(input: ApplyFabricActionInput): Promise<FabricUndoEntry> {
  return applyFabricActions([input])
}

/** 방금 실행한 창고 동작을, 현재 값이 그대로일 때만 되돌린다. */
export async function undoFabricEntry(entry: FabricUndoEntry): Promise<{ applied: number; conflicted: number }> {
  const state = useAppStore.getState()
  const eventById = new Map(state.fabricEvents.map((event) => [event.id, event]))
  let fabricOverrides = state.fabricOverrides
  let records = state.records
  const removedEventIds = new Set<string>()
  let applied = 0
  let conflicted = 0

  entry.eventIds.forEach((eventId, index) => {
    const event = eventById.get(eventId)
    if (!event) return
    const change = entry.overrides[index]
    const recordChanges = entry.records.filter((record) => record.id === event.recordId)
    const currentOverride = change
      ? previousFabricOverride(fabricOverrides, change.after.key, change.after.recordId)
      : undefined
    const overrideConflict = Boolean(change) && JSON.stringify(currentOverride) !== JSON.stringify(change.after)
    const recordConflict = recordChanges.some(({ id, after }) => {
      const current = records.find((record) => recordIdentity(record) === id)
      return JSON.stringify(current) !== JSON.stringify(after)
    })
    if (overrideConflict || recordConflict) {
      conflicted += 1
      return
    }

    if (change) {
      fabricOverrides = fabricOverrides.filter((item) => item.key !== change.after.key
        && !(change.after.recordId && item.recordId === change.after.recordId))
      if (change.before) fabricOverrides = [change.before, ...fabricOverrides]
    }
    for (const recordChange of recordChanges) {
      records = records.map((record) => recordIdentity(record) === recordChange.id ? recordChange.before : record)
    }
    removedEventIds.add(eventId)
    applied += 1
  })

  const fabricEvents = state.fabricEvents.filter((event) => !removedEventIds.has(event.id))
  if (!applied) return { applied, conflicted }
  setAppState({ fabricOverrides, fabricEvents, records })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
    records === state.records ? Promise.resolve() : saveCache("records", records),
  ])
  void logAction({
    kind: "revert",
    screen: "warehouse",
    changes: [...diffFabricEvents(state.fabricEvents, fabricEvents), ...diffDevRecords(state.records, records)],
  })
  return { applied, conflicted }
}

/**
 * 입고 대기에서 잘못 올라온 행을 목록에서 숨긴다.
 * 원본(DD 레코드·샘플관리대장 등록 행)은 지우지 않고 웹 상태만 덮어쓴다.
 * completed 배열을 건드리면 직접 등록 행의 인덱스 기반 key가 바뀌어 채번 기록이 어긋난다.
 */
export async function removeFabricRows(
  entries: ReadonlyArray<{ key: string; fromStatus: FabricLedgerStatus }>,
  actor = "관리자",
): Promise<void> {
  if (!entries.length) return
  const state = useAppStore.getState()
  const recordIds = fabricRecordIdIndex(buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true }))
  const occurredAt = new Date().toISOString()
  const keys = new Set(entries.map((entry) => entry.key))
  const removedRecordIds = new Set<string>()

  const overrides: FabricLedgerOverride[] = entries.map((entry) => {
    const recordId = recordIdForFabricKey(state, entry.key, recordIds)
    if (recordId) removedRecordIds.add(recordId)
    const previous = previousFabricOverride(state.fabricOverrides, entry.key, recordId)
    if (previous) keys.add(previous.key)
    return {
      key: entry.key,
      recordId: recordId ?? previous?.recordId,
      status: "REMOVED",
      storageNo: previous?.storageNo,
      yds: previous?.yds,
      roll: previous?.roll,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt: occurredAt,
      updatedBy: actor,
    }
  })
  const events: FabricLedgerEvent[] = entries.map((entry, index) => ({
    id: `remove-${occurredAt}-${index}`,
    fabricKey: entry.key,
    recordId: recordIdForFabricKey(state, entry.key, recordIds),
    action: "REMOVE",
    fromStatus: entry.fromStatus,
    toStatus: "REMOVED",
    occurredAt,
    recordedAt: occurredAt,
    actor,
    note: "입고 대기 목록에서 삭제",
  }))

  const fabricOverrides = [...overrides, ...state.fabricOverrides.filter((item) =>
    !keys.has(item.key) && !(item.recordId && removedRecordIds.has(item.recordId)))]
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([saveCache("fabricOverrides", fabricOverrides), saveCache("fabricEvents", fabricEvents)])
}

/** 기존 창고 기록 중 현재 원장에서 확실히 찾을 수 있는 DD 행에만 고유번호를 보충한다. */
export async function backfillFabricRecordIds(): Promise<number> {
  const state = useAppStore.getState()
  const ledger = buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true })
  const recordIds = fabricRecordIdIndex(ledger)
  let filled = 0
  let overridesChanged = false
  let eventsChanged = false
  const fabricOverrides = state.fabricOverrides.map((entry) => {
    if (entry.recordId) return entry
    const recordId = recordIds.get(entry.key)
    if (!recordId) return entry
    filled += 1
    overridesChanged = true
    return { ...entry, recordId }
  })
  const fabricEvents = state.fabricEvents.map((event) => {
    if (event.recordId) return event
    const recordId = recordIds.get(event.fabricKey)
    if (!recordId) return event
    filled += 1
    eventsChanged = true
    return { ...event, recordId }
  })
  if (!filled) return 0
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([
    overridesChanged ? saveCache("fabricOverrides", fabricOverrides) : Promise.resolve(),
    eventsChanged ? saveCache("fabricEvents", fabricEvents) : Promise.resolve(),
  ])
  return filled
}
