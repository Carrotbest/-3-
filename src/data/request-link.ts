import { createBlankDevRecord } from "@/data/dd-workflow"
import type { DevRecord, RequestOption, RequestStyle } from "@/data/schema"

export const normalizeStyleKey = (value: string): string =>
  value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "")

export function linkedLineIds(records: readonly DevRecord[]): Set<string> {
  return new Set(records.flatMap((record) => record.tech?.requestLink?.lineId ? [record.tech.requestLink.lineId] : []))
}

export function ensureRequestLineIds(requests: readonly RequestStyle[]): { next: RequestStyle[]; changed: boolean } {
  let changed = false
  const next = requests.map((style) => {
    if (style.options.every((option) => option.lineId)) return style
    changed = true
    return {
      ...style,
      options: style.options.map((option) => option.lineId ? option : { ...option, lineId: crypto.randomUUID() }),
    }
  })
  return { next, changed }
}

export interface RequestCandidate {
  style: RequestStyle
  total: number
  unlinked: number
  exact: boolean
}

export function requestCandidates(
  requests: readonly RequestStyle[],
  records: readonly DevRecord[],
  styleNo: string,
  query: string,
  includeLinked: boolean,
): RequestCandidate[] {
  const linked = linkedLineIds(records)
  const needle = query.trim().toLocaleLowerCase("ko-KR")
  const styleKey = normalizeStyleKey(styleNo)
  return requests
    .filter((style) => !needle || [style.garmentNo, style.brand, style.chart, style.developer]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(needle)))
    .map((style) => ({
      style,
      total: style.options.length,
      unlinked: style.options.filter((option) => !option.lineId || !linked.has(option.lineId)).length,
      exact: Boolean(styleKey) && normalizeStyleKey(style.garmentNo) === styleKey,
    }))
    .filter((candidate) => includeLinked || candidate.unlinked > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact)
      || Date.parse(b.style.updatedAt) - Date.parse(a.style.updatedAt))
}

export function requestToIntakeRecords(style: RequestStyle, options: readonly RequestOption[]): DevRecord[] {
  return options.flatMap((option) => {
    if (!option.lineId) return []
    const record = createBlankDevRecord(style.developer)
    return [{
      ...record,
      styleNo: style.garmentNo,
      buyer: style.brand,
      owner: style.developer,
      planner: style.requester,
      color: option.color,
      dyeing: option.dyeingMethod,
      note: option.remark,
      tech: {
        ...record.tech,
        yarnDetail: option.yarnDetail,
        requestLink: { reqId: style.reqId, lineId: option.lineId },
      },
    }]
  })
}
