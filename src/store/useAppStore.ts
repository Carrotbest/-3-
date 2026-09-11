import { create } from "zustand"

import { saveCache, saveCacheLocal } from "@/data/cache"
import { diffDevRecords, diffFabricEvents, diffRequests, diffTsRecords, logAction, planRevert, type AuditAction, type AuditChange, type AuditKind } from "@/data/audit"
import { mergeChemicalPortfolio, type ChemicalItem, type ChemicalPortfolio } from "../data/chemical"
import { recalculateDevelopmentRecords } from "../data/dd-workflow"
import { buildFabricLedger, fabricRecordIdentity, isFabricBalanceExhausted, type FabricLedgerItem } from "../data/fabric-ledger"
import { MEMBERS, materialIdOf, type CompletedSample, type DevRecord, type FabricAnalysisRow, type FabricLedgerAction, type FabricLedgerEvent, type FabricLedgerOverride, type FabricLedgerStatus, type MaterialDiagnostics, type MaterialItem, type RequestStyle, type StudyRecord } from "../data/schema"
import { WEB_INTAKE_SHEET } from "@/data/schema"
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
  rdda: RddaReport | null
  orgMembers: OrgMember[]
  materials: MaterialItem[]
  materialsManual: MaterialItem[]
  materialDiagnostics: MaterialDiagnostics
  fabricOverrides: FabricLedgerOverride[]
  fabricEvents: FabricLedgerEvent[]
  requests: RequestStyle[]
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

function normalizedIntakePart(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase()
}

function intakeSourceKey(record: DevRecord): string | null {
  const source = record.tech?.intakeSource
  if (!source?.requestKey || !source.optionKey) return null
  return [source.kind, source.requestKey, source.optionKey].map(normalizedIntakePart).join("::")
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
    if (sample.id !== id || sample.sourceSheet !== WEB_INTAKE_SHEET) return sample
    const ledger = { ...(sample.ledger ?? {}) }
    switch (columnId) {
      case "styleNo": return { ...sample, styleNo: value }
      case "flNo": return { ...sample, flNo: value }
      case "buyer": return { ...sample, buyer: value }
      case "season": return { ...sample, season: value }
      case "category": return { ...sample, category: value }
      case "owner": return { ...sample, owner: value }
      case "construction": return { ...sample, construction: value }
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
  const occurredAt = new Date().toISOString()
  const events: FabricLedgerEvent[] = entries.map((entry, index) => ({
    id: `confirm-baseline-${occurredAt}-${index}`,
    fabricKey: entry.key,
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
    status: previous?.status ?? item.status,
    storageNo: previous?.storageNo ?? (item.storageNo || undefined),
    yds: previous?.yds ?? (item.yds ?? undefined),
    note: previous?.note,
    fields: { ...previous?.fields, ...patch },
    updatedAt: new Date().toISOString(),
    updatedBy: "관리자",
  }
  const fabricOverrides = [override, ...state.fabricOverrides.filter((entry) => entry.key !== item.key)]
  setAppState({ fabricOverrides })
  await saveCache("fabricOverrides", fabricOverrides)
}

export async function applyFabricAction(input: ApplyFabricActionInput): Promise<void> {
  const beforeEvents = useAppStore.getState().fabricEvents
  const state = useAppStore.getState()
  const occurredAt = new Date().toISOString()
  const actor = input.actor?.trim() || "관리자"
  const previous = state.fabricOverrides.find((item) => item.key === input.fabricKey)
  const yds = input.yds === undefined
    ? previous?.yds
    : Number.isFinite(input.yds) && input.yds >= 0 ? input.yds : undefined
  if (input.yds !== undefined && yds === undefined) throw new Error("보유 재고는 0 이상의 숫자여야 합니다.")

  const qty = input.qty === undefined
    ? undefined
    : Number.isFinite(input.qty) && input.qty > 0 ? input.qty : undefined
  if (input.action === "OUTBOUND" && qty === undefined) throw new Error("출고 수량은 0보다 커야 합니다.")
  const recipient = input.to?.trim()
  if (input.action === "OUTBOUND" && !recipient) throw new Error("출고 수령자를 입력해야 합니다.")

  const previousOutboundTotal = state.fabricEvents.reduce((sum, event) =>
    event.fabricKey === input.fabricKey && event.action === "OUTBOUND" && typeof event.qty === "number" && Number.isFinite(event.qty) && event.qty > 0
      ? sum + event.qty
      : sum, 0)
  const outboundTotal = previousOutboundTotal + (input.action === "OUTBOUND" ? qty ?? 0 : 0)
  // 잔량이 0이 되어도 소진 완료로 옮길지는 사용자가 정한다. 기본은 옮긴다.
  const autoExhaust = input.autoExhaust !== false
  const shouldAutoExhaust = autoExhaust && (input.action === "OUTBOUND" || (input.yds !== undefined && input.action !== "RESTORE" && input.action !== "DISPOSE"))
  const resolvedToStatus = shouldAutoExhaust && isFabricBalanceExhausted(yds, outboundTotal)
    ? "EXHAUSTED"
    : input.action === "OUTBOUND"
      ? previous?.status ?? input.fromStatus
      : input.toStatus
  const selectedDate = input.date?.trim()
  const selectedDateValue = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? new Date(`${selectedDate}T12:00:00`) : null
  const eventOccurredAt = selectedDateValue && !Number.isNaN(selectedDateValue.getTime()) ? selectedDateValue.toISOString() : occurredAt
  const override: FabricLedgerOverride = {
    key: input.fabricKey,
    status: resolvedToStatus,
    // 입고 대기로 내려가면 채번을 취소한다. 그 번호는 다시 쓸 수 있게 풀린다.
    // 되돌리기(UNRECEIVE)든 이력에서의 복구(RESTORE)든 도착 상태가 기준이다.
    storageNo: resolvedToStatus === "READY" ? undefined : input.storageNo?.trim() || previous?.storageNo,
    // 같은 이유로 보유 재고도 비운다. 남겨 두면 입고한 적 없는 행에 재고가 붙어 있게 된다.
    yds: resolvedToStatus === "READY" || input.clearYds ? undefined : yds,
    note: input.note?.trim() || previous?.note,
    // 원단 상세에서 고친 값은 창고 동작(입고·확인·출고 등)과 무관하다. 그대로 물려준다.
    fields: previous?.fields,
    updatedAt: occurredAt,
    updatedBy: actor,
  }
  const event: FabricLedgerEvent = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fabricKey: input.fabricKey,
    action: input.action,
    fromStatus: input.fromStatus,
    toStatus: resolvedToStatus,
    occurredAt: eventOccurredAt,
    recordedAt: occurredAt,
    actor,
    note: input.note?.trim() || "",
    storageNo: input.storageNo?.trim() || previous?.storageNo,
    qty,
    to: recipient,
    division: input.division?.trim() || undefined,
    reason: input.reason?.trim() || undefined,
  }
  const fabricOverrides = [override, ...state.fabricOverrides.filter((item) => item.key !== input.fabricKey)]
  const fabricEvents = [event, ...state.fabricEvents]

  let records = state.records
  if (input.action === "COMPLETE" && input.recordIdentity) {
    records = records.map((record) => recordIdentity(record) === input.recordIdentity
      ? { ...record, devStatus: "완료", stage: "완료", receivedDate: record.receivedDate || occurredAt.slice(0, 10) }
      : record)
  }

  setAppState({ fabricOverrides, fabricEvents, records })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
    records === state.records ? Promise.resolve() : saveCache("records", records),
  ])
  void logAction({ kind: "warehouse", screen: "warehouse", changes: diffFabricEvents(beforeEvents, useAppStore.getState().fabricEvents) })
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
  const occurredAt = new Date().toISOString()
  const keys = new Set(entries.map((entry) => entry.key))

  const overrides: FabricLedgerOverride[] = entries.map((entry) => {
    const previous = state.fabricOverrides.find((item) => item.key === entry.key)
    return {
      key: entry.key,
      status: "REMOVED",
      storageNo: previous?.storageNo,
      yds: previous?.yds,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt: occurredAt,
      updatedBy: actor,
    }
  })
  const events: FabricLedgerEvent[] = entries.map((entry, index) => ({
    id: `remove-${occurredAt}-${index}`,
    fabricKey: entry.key,
    action: "REMOVE",
    fromStatus: entry.fromStatus,
    toStatus: "REMOVED",
    occurredAt,
    recordedAt: occurredAt,
    actor,
    note: "입고 대기 목록에서 삭제",
  }))

  const fabricOverrides = [...overrides, ...state.fabricOverrides.filter((item) => !keys.has(item.key))]
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([saveCache("fabricOverrides", fabricOverrides), saveCache("fabricEvents", fabricEvents)])
}
