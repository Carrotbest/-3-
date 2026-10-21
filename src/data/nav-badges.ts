import { create } from "zustand"

import { useAuthStore } from "./auth"
import { loadTrendStatus } from "./trend"
import { useAppStore } from "../store/useAppStore"

/**
 * 사이드바 신규 표시(R341).
 *
 * 두 종류다. 의뢰가 쌓이는 화면은 건수를 세고, 수집·보고 자료 화면은 갱신 여부만 보인다.
 * 읽음 기준선은 사용자 계정별로 그 브라우저에만 남는다(localStorage). 기기 사이로 따라오지 않는다.
 */
export type NavBadgeKind = "count" | "updated"

export interface NavBadgeSource {
  /** 저장 키. 경로가 바뀌어도 기준선이 살아 있도록 경로와 분리한다. */
  key: string
  /** 정확히 일치하는 라우트 경로 */
  path: string
  kind: NavBadgeKind
}

export interface NavBadge {
  kind: NavBadgeKind
  /** updated 종류는 0이다. */
  count: number
}

export const NAV_BADGE_SOURCES: NavBadgeSource[] = [
  { key: "request", path: "/request", kind: "count" },
  { key: "analysis", path: "/fabric-analysis", kind: "count" },
  { key: "ts", path: "/ts", kind: "count" },
  { key: "rdda", path: "/rdda", kind: "updated" },
  { key: "trendFabric", path: "/trend/fabric", kind: "updated" },
  { key: "trendMacro", path: "/trend/macro", kind: "updated" },
]

const sourceByPath = new Map(NAV_BADGE_SOURCES.map((source) => [source.path, source]))

export const navBadgeKeyForPath = (path: string): string | null => sourceByPath.get(path)?.key ?? null

const storageKey = (uid: string) => `fabric.nav-seen.v1.${uid}`

interface NavSeenState {
  uid: string | null
  /** 키 → 마지막으로 그 화면을 본 시각(ISO) */
  seen: Record<string, string>
  /** 수집기 실행 시각. status.json에서 한 번만 읽는다. */
  trendGeneratedAt: string | null
}

const useNavSeenStore = create<NavSeenState>(() => ({ uid: null, seen: {}, trendGeneratedAt: null }))

function readStored(uid: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey(uid))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value
    }
    return result
  } catch {
    // 시크릿 창은 접근 자체가 예외를 던진다. 표시를 포기하고 화면은 멀쩡히 둔다.
    return {}
  }
}

function writeStored(uid: string, seen: Record<string, string>): void {
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(seen))
  } catch {
    // 저장이 막히면 이번 세션에만 남는다. 뱃지가 다시 뜰 뿐이라 화면을 멈추지 않는다.
  }
}

let trendRequested = false

/** status.json의 generated_at을 앱 수명 동안 한 번만 읽는다. feed.json(2.7MB)은 절대 건드리지 않는다. */
function requestTrendGeneratedAt(): void {
  if (trendRequested) return
  trendRequested = true
  void loadTrendStatus()
    .then((status) => {
      if (status?.generated_at) useNavSeenStore.setState({ trendGeneratedAt: status.generated_at })
    })
    .catch(() => undefined)
}

/**
 * 로그인 사용자의 기준선을 올린다.
 *
 * **기록이 없는 화면은 지금 시각을 기준선으로 적고 뱃지를 0으로 둔다.**
 * 이 장치가 없으면 기능이 처음 깔리는 순간, 또 처음 쓰는 브라우저에서
 * 과거 데이터 전부가 신규로 잡혀 수백 건짜리 숫자가 뜬다.
 */
export function initNavSeen(uid: string | null): void {
  if (!uid) {
    useNavSeenStore.setState({ uid: null, seen: {} })
    return
  }
  const stored = readStored(uid)
  const now = new Date().toISOString()
  let changed = false
  for (const source of NAV_BADGE_SOURCES) {
    if (!stored[source.key]) {
      stored[source.key] = now
      changed = true
    }
  }
  if (changed) writeStored(uid, stored)
  useNavSeenStore.setState({ uid, seen: stored })
  requestTrendGeneratedAt()
}

/** 그 화면을 봤다고 적는다. 등록되지 않은 경로는 아무것도 하지 않는다. */
export function markNavSeen(path: string): void {
  const source = sourceByPath.get(path)
  if (!source) return
  const { uid, seen } = useNavSeenStore.getState()
  if (!uid) return
  const next = { ...seen, [source.key]: new Date().toISOString() }
  writeStored(uid, next)
  useNavSeenStore.setState({ seen: next })
}

const parse = (value: string | undefined | null): number => {
  if (!value) return Number.NaN
  return Date.parse(value)
}

/** 기준선보다 뒤에 생긴 건수. 시각이 없는 행은 신규가 아니다(추측해서 채우지 않는다). */
function countNewer(rows: ReadonlyArray<{ createdAt?: string }>, since: number): number {
  if (Number.isNaN(since)) return 0
  let total = 0
  for (const row of rows) {
    const at = parse(row.createdAt)
    if (!Number.isNaN(at) && at > since) total += 1
  }
  return total
}

function latest(values: ReadonlyArray<string | undefined>): number {
  let best = Number.NaN
  for (const value of values) {
    const at = parse(value)
    if (Number.isNaN(at)) continue
    if (Number.isNaN(best) || at > best) best = at
  }
  return best
}

/** 사이드바와 상단바가 함께 쓰는 뱃지 목록. 신규가 없는 키는 아예 빠진다. */
export function useNavBadges(): Record<string, NavBadge> {
  const status = useAuthStore((state) => state.status)
  const isOwner = useAuthStore((state) => state.isOwner)
  const approval = useAuthStore((state) => state.approval)
  const seen = useNavSeenStore((state) => state.seen)
  const trendGeneratedAt = useNavSeenStore((state) => state.trendGeneratedAt)
  const requests = useAppStore((state) => state.requests)
  const analysisRequests = useAppStore((state) => state.analysisRequests)
  const ts = useAppStore((state) => state.ts)
  const rddaReports = useAppStore((state) => state.rddaReports)

  // 로그인 전과 승인 전에는 띄우지 않는다. 저장할 곳도 없고 볼 자격도 아직 없다.
  if (status !== "signed-in" || (!isOwner && approval !== "approved")) return {}

  const badges: Record<string, NavBadge> = {}

  const requestCount = countNewer(requests, parse(seen.request))
  if (requestCount > 0) badges.request = { kind: "count", count: requestCount }

  const analysisCount = countNewer(analysisRequests, parse(seen.analysis))
  if (analysisCount > 0) badges.analysis = { kind: "count", count: analysisCount }

  const tsCount = countNewer(ts, parse(seen.ts))
  if (tsCount > 0) badges.ts = { kind: "count", count: tsCount }

  const rddaAt = latest(rddaReports.map((report) => report.updatedAt))
  const rddaSeen = parse(seen.rdda)
  if (!Number.isNaN(rddaAt) && !Number.isNaN(rddaSeen) && rddaAt > rddaSeen) {
    badges.rdda = { kind: "updated", count: 0 }
  }

  const trendAt = parse(trendGeneratedAt)
  if (!Number.isNaN(trendAt)) {
    const fabricSeen = parse(seen.trendFabric)
    if (!Number.isNaN(fabricSeen) && trendAt > fabricSeen) badges.trendFabric = { kind: "updated", count: 0 }
    const macroSeen = parse(seen.trendMacro)
    if (!Number.isNaN(macroSeen) && trendAt > macroSeen) badges.trendMacro = { kind: "updated", count: 0 }
  }

  return badges
}
