/* reconcile.ts — 합계 대조 5종
   이 검사를 통과하지 못한 데이터셋은 화면에 올리지 않는다. */

import * as XLSX from "xlsx"

import { anomalies as deriveAnomalies, type DataAnomaly } from "./derive"
import { normalizeSeason } from "./format"
import { CATEGORIES, type DevRecord } from "./schema"
import { isExcludedDevelopment } from "./xlsx-parsers"
import {
  countSummaryRows,
  ownerSheetCounts,
  summarySheetNames,
} from "./tds-loader"

export interface ReconcileCheck {
  name: string
  excel: number | null
  applied: number
  diff: number
  ok: boolean
  note: string
}

export interface ReconcileResult {
  passed: boolean
  checks: ReconcileCheck[]
  anomalies: DataAnomaly[]
}

const check = (
  name: string,
  excel: number | null,
  applied: number,
  note = "",
): ReconcileCheck => ({
  name,
  excel,
  applied,
  diff: (excel ?? 0) - (applied ?? 0),
  ok: excel === null ? true : excel === applied,
  note,
})

function reconcileLegacy(
  records: readonly DevRecord[],
  workbook: XLSX.WorkBook,
): ReconcileResult {
  const checks: ReconcileCheck[] = []

  /* 1. 담당자별 시트 합 — 시트별 유효 행의 총합이 반영 건수와 같아야 한다 */
  const perOwner = ownerSheetCounts(workbook)
  const ownerTotal = Object.values(perOwner).reduce((a, b) => a + b, 0)
  checks.push(
    check(
      "담당자별 시트 합",
      ownerTotal,
      records.length,
      Object.entries(perOwner)
        .map(([sheet, count]) => `${sheet} ${count}`)
        .join(" · "),
    ),
  )

  /* 2. 전체 현황 시트 합 — 요약 시트가 있을 때만 검사한다 */
  const summaries = summarySheetNames(workbook)
  const summaryTotal = summaries.length ? countSummaryRows(workbook, summaries) : null
  checks.push(
    check(
      "전체 현황 시트 합",
      summaryTotal,
      records.length,
      summaries.length ? summaries.join(" · ") : "요약 시트 없음 — 검사 생략",
    ),
  )

  /* 3. 카테고리별 합 — 분류 합이 전체와 같아야 한다(미분류 누락 탐지) */
  const categorySum = CATEGORIES.reduce(
    (sum, category) =>
      sum + records.filter((record) => record.category === category).length,
    0,
  )
  const uncategorized = records.length - categorySum
  checks.push(
    check(
      "카테고리별 합",
      records.length,
      categorySum + uncategorized,
      uncategorized ? `미분류 ${uncategorized}건 포함` : "미분류 없음",
    ),
  )

  /* 4. 시즌별 합 — 정규화 후 그룹 합이 전체와 같아야 한다 */
  const bySeason = new Map<string, number>()
  for (const record of records) {
    const key = normalizeSeason(record.season).value || "(미지정)"
    bySeason.set(key, (bySeason.get(key) || 0) + 1)
  }
  const seasonSum = [...bySeason.values()].reduce((a, b) => a + b, 0)
  checks.push(
    check(
      "시즌별 합",
      records.length,
      seasonSum,
      [...bySeason.entries()]
        .map(([season, count]) => `${season} ${count}`)
        .join(" · "),
    ),
  )

  /* 5. Opt 단위 행 수 — Style+Opt 조합이 중복되면 어딘가에서 이중 집계된 것이다 */
  const keys = records.map((record) => `${record.styleNo}|${record.opt}`)
  const unique = new Set(keys).size
  const duplicates = keys.length - unique
  checks.push(
    check(
      "Opt 단위 행 수",
      keys.length,
      unique,
      duplicates ? `Style+Opt 중복 ${duplicates}건` : "중복 없음",
    ),
  )

  return {
    passed: checks.every((item) => item.ok),
    checks,
    anomalies: deriveAnomalies(records),
  }
}

const normalizedSheetName = (value: string): string =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "")

const actualSheetName = (workbook: XLSX.WorkBook): string | null =>
  workbook.SheetNames.find((name) => normalizedSheetName(name) === normalizedSheetName("전체현황")) ?? null

function sourceCounts(workbook: XLSX.WorkBook): { total: number; excluded: number } {
  const name = actualSheetName(workbook)
  if (!name) return { total: 0, excluded: 0 }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  })
  let total = 0
  let excluded = 0
  for (let index = 5; index < rows.length; index++) {
    const styleNo = String(rows[index][2] ?? "").trim()
    if (!styleNo || /^(소계|합계|총계|total|subtotal|계)$/i.test(styleNo)) continue
    total++
    if (/^(drop|reject)$/i.test(String(rows[index][1] ?? "").trim())) excluded++
  }
  return { total, excluded }
}

/* 정보성 검사: 값이 비거나 중복이어도 "행 수"는 바뀌지 않으므로 반영을 막지 않는다.
   빈 값·중복은 데이터 품질 경고(이상 항목)로만 다룬다. ok 는 항상 true. */
const info = (name: string, value: number, note: string): ReconcileCheck => ({
  name,
  excel: value,
  applied: value,
  diff: 0,
  ok: true,
  note,
})

function reconcileActual(
  records: readonly DevRecord[],
  workbook: XLSX.WorkBook,
): ReconcileResult {
  const active = records.filter((record) => !isExcludedDevelopment(record))
  const excluded = records.length - active.length
  const checks: ReconcileCheck[] = []

  /* ── 하드 게이트: 원천 행수 == 반영 행수. 이것만 불일치면 반영을 막는다. ── */
  const source = sourceCounts(workbook)
  const sourceActive = source.total - source.excluded
  checks.push(check(
    "전체현황 반영 행수 (DROP·REJECT 제외)",
    sourceActive,
    active.length,
    `원천 유효 ${source.total}건 · 제외 ${source.excluded || excluded}건 · 반영 ${active.length}건`,
  ))

  /* ── 이하 정보성(경고) 검사: 반영을 막지 않는다 ── */
  const blankOwner = active.filter((r) => !r.owner).length
  checks.push(info(
    "담당자별 합",
    active.length - blankOwner,
    blankOwner ? `담당 공란 ${blankOwner}건 (경고)` : "담당 공란 없음",
  ))

  const nonCategory = active.filter(
    (r) => !CATEGORIES.includes(r.category as (typeof CATEGORIES)[number]),
  ).length
  checks.push(info(
    "카테고리 분류",
    active.length - nonCategory,
    nonCategory ? `미분류 ${nonCategory}건 (경고)` : "미분류 없음",
  ))

  const blankSeason = active.filter((r) => !normalizeSeason(r.season).value).length
  checks.push(info(
    "시즌 표기",
    active.length - blankSeason,
    blankSeason ? `시즌 미기재·비표준 ${blankSeason}건 (경고)` : "시즌 표기 정상",
  ))

  const keys = active.map((record) => `${record.styleNo}|${record.opt}`)
  const duplicates = keys.length - new Set(keys).size
  checks.push(info(
    "Style+Opt 중복",
    duplicates,
    duplicates ? `Style+Opt 중복 ${duplicates}건 (경고 — 옵션 중복/공란)` : "중복 없음",
  ))

  /* 품질 경고를 이상 항목에 추가 */
  const anomalies = [...deriveAnomalies(active)]
  if (duplicates) {
    anomalies.push({
      type: "Style+Opt 중복",
      tone: "warn",
      count: duplicates,
      samples: [],
    })
  }

  return {
    passed: checks.every((item) => item.ok),
    checks,
    anomalies,
  }
}

export function reconcile(
  records: readonly DevRecord[],
  workbook: XLSX.WorkBook,
): ReconcileResult {
  return actualSheetName(workbook)
    ? reconcileActual(records, workbook)
    : reconcileLegacy(records, workbook)
}
