import type { AuditAction } from "./audit"
import { ownerIncludes, ownerNames, type DevRecord } from "./schema"

/** 감사 로그의 `k` 와 같은 값이어야 한다. 다르면 접수자를 못 찾는다. */
const rowKey = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`

export type OwnerCleanupReason = "ok" | "no-audit" | "creator-outside"

export interface OwnerCleanupRow {
  /** `sheet::row` */
  key: string
  styleNo: string
  opt: string
  flNo: string
  /** 지금 담당. 묶음 값이다. */
  current: string
  /** 이 행을 고를 수 있는 사람 목록. `ownerNames(current)` 와 같다. */
  choices: string[]
  /** 감사 로그가 말하는 접수자. 못 찾으면 "" */
  creator: string
  /** 접수 시각 ISO. 못 찾으면 "" */
  at: string
  /** 접수 뒤에 이 행을 고친 사람들. 접수자는 뺀다. 최근 순. */
  editors: string[]
  /** 마지막으로 고친 시각 ISO. 없으면 "" */
  lastEditAt: string
  /**
   * 접수자 말고 **묶음 안의 다른 사람**이 이 행을 고친 적이 있는가.
   * 참이면 접수자만 보고 정하면 안 된다. 기본 선택에서 뺀다.
   */
  conflict: boolean
  /** 기본 제안. 정할 수 없으면 "" */
  proposed: string
  reason: OwnerCleanupReason
}

/** 담당이 두 사람 이상인 행만 추린다. */
export function multiOwnerRecords(records: readonly DevRecord[]): DevRecord[] {
  return records.filter((record) => ownerNames(record.owner).length > 1)
}

/**
 * 감사 로그에서 행이 처음 생긴 작업을 뽑는다.
 * 같은 키가 여러 번 나오면 가장 이른 것을 쓴다. 그것이 접수다.
 */
export function creatorsByRowKey(actions: readonly AuditAction[]): Map<string, { name: string; at: string }> {
  const creators = new Map<string, { name: string; at: string }>()
  for (const action of actions) {
    for (const change of action.ch) {
      if (change.c !== "*" || change.a !== "(추가)") continue
      const current = creators.get(change.k)
      if (!current || action.at < current.at) creators.set(change.k, { name: action.name, at: action.at })
    }
  }
  return creators
}

/** 같은 작업이 두 조회에 겹쳐 들어올 수 있다. id 로 한 번만 남긴다. */
export function mergeAuditActions(...lists: readonly (readonly AuditAction[])[]): AuditAction[] {
  const merged = new Map<string, AuditAction>()
  for (const list of lists) {
    for (const action of list) if (!merged.has(action.id)) merged.set(action.id, action)
  }
  return [...merged.values()].sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * 접수 뒤의 편집자. 행이 생긴 작업(`c === "*"`)은 빼고 셀을 고친 작업만 본다.
 * 같은 사람은 한 번만 담고 최근 순으로 둔다.
 */
export function editorsByRowKey(actions: readonly AuditAction[]): Map<string, { names: string[]; at: string }> {
  const editors = new Map<string, { names: string[]; at: string }>()
  for (const action of [...actions].sort((a, b) => b.at.localeCompare(a.at))) {
    for (const change of action.ch) {
      if (change.c === "*") continue
      const current = editors.get(change.k)
      if (!current) editors.set(change.k, { names: [action.name], at: action.at })
      else if (!current.names.includes(action.name)) current.names.push(action.name)
    }
  }
  return editors
}

/** 감사 로그를 조회할 날짜 창. 웹 접수 행의 `_src.row` 가 마이크로초 타임스탬프다. */
export function cleanupAuditWindow(records: readonly DevRecord[]): { from?: string; to?: string } {
  const earliest = Date.UTC(2020, 0, 1)
  const latest = Date.now()
  const times = records.flatMap((record) => {
    if (record._src.sheet !== "웹 접수") return []
    const time = Number(record._src.row) / 1000
    return Number.isFinite(time) && time >= earliest && time <= latest ? [time] : []
  })
  if (!times.length) return {}
  const day = 86400000
  return {
    from: new Date(Math.min(...times) - day).toISOString().slice(0, 10),
    to: new Date(Math.max(...times) + day).toISOString().slice(0, 10),
  }
}

/** 정리 계획. styleNo, opt 순으로 정렬해 돌려준다. */
export function buildOwnerCleanupPlan(
  records: readonly DevRecord[],
  actions: readonly AuditAction[],
): OwnerCleanupRow[] {
  const creators = creatorsByRowKey(actions)
  const editorsOf = editorsByRowKey(actions)
  return multiOwnerRecords(records).map((record) => {
    const key = rowKey(record)
    const found = creators.get(key)
    const creator = found?.name ?? ""
    const seen = editorsOf.get(key)
    const editors = (seen?.names ?? []).filter((name) => name !== creator)
    const lastEditAt = seen?.at ?? ""
    const conflict = editors.some((name) => ownerIncludes(record.owner, name))
    const proposed = creator && ownerIncludes(record.owner, creator) ? creator : ""
    const reason: OwnerCleanupReason = !found ? "no-audit" : proposed ? "ok" : "creator-outside"
    return {
      key,
      styleNo: record.styleNo,
      opt: record.opt,
      flNo: record.flNo,
      current: record.owner,
      choices: ownerNames(record.owner),
      creator,
      at: found?.at ?? "",
      editors,
      lastEditAt,
      conflict,
      proposed,
      reason,
    }
  }).sort((a, b) => a.styleNo.localeCompare(b.styleNo, "ko-KR") || Number(a.opt) - Number(b.opt))
}
