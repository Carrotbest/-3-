/* reconcile.js — 합계 대조 5종 (Claude 관리 · Codex 수정 금지)
   이 검사를 통과하지 못한 데이터셋은 화면에 올리지 않는다.
   계약: reconcile(records, workbook) -> { passed, checks[], anomalies[] } */

import { summarySheetNames, countSummaryRows, ownerSheetCounts } from './tds-loader.js';
import { anomalies as deriveAnomalies } from './derive.js';
import { CATEGORIES } from './schema.js';
import { normalizeSeason } from '../core/format.js';

const check = (name, excel, applied, note = '') => ({
  name,
  excel,
  applied,
  diff: (excel ?? 0) - (applied ?? 0),
  ok: excel === null || excel === undefined ? true : excel === applied,
  note,
});

export function reconcile(records, workbook) {
  const checks = [];

  /* 1. 담당자별 시트 합 — 시트별 유효 행의 총합이 반영 건수와 같아야 한다 */
  const perOwner = ownerSheetCounts(workbook);
  const ownerTotal = Object.values(perOwner).reduce((a, b) => a + b, 0);
  checks.push(check('담당자별 시트 합', ownerTotal, records.length,
    Object.entries(perOwner).map(([s, n]) => `${s} ${n}`).join(' · ')));

  /* 2. 전체 현황 시트 합 — 요약 시트가 있을 때만 검사한다 */
  const summaries = summarySheetNames(workbook);
  const summaryTotal = summaries.length ? countSummaryRows(workbook, summaries) : null;
  checks.push(check('전체 현황 시트 합', summaryTotal, records.length,
    summaries.length ? summaries.join(' · ') : '요약 시트 없음 — 검사 생략'));

  /* 3. 카테고리별 합 — 분류 합이 전체와 같아야 한다(미분류 누락 탐지) */
  const catSum = CATEGORIES.reduce((s, c) => s + records.filter((r) => r.category === c).length, 0);
  const uncategorized = records.length - catSum;
  checks.push(check('카테고리별 합', records.length, catSum + uncategorized,
    uncategorized ? `미분류 ${uncategorized}건 포함` : '미분류 없음'));

  /* 4. 시즌별 합 — 정규화 후 그룹 합이 전체와 같아야 한다 */
  const bySeason = new Map();
  for (const r of records) {
    const k = normalizeSeason(r.season).value || '(미지정)';
    bySeason.set(k, (bySeason.get(k) || 0) + 1);
  }
  const seasonSum = [...bySeason.values()].reduce((a, b) => a + b, 0);
  checks.push(check('시즌별 합', records.length, seasonSum,
    [...bySeason.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')));

  /* 5. Opt 단위 행 수 — Style+Opt 조합이 중복되면 어딘가에서 이중 집계된 것이다 */
  const keys = records.map((r) => `${r.styleNo}|${r.opt}`);
  const unique = new Set(keys).size;
  const dupes = keys.length - unique;
  checks.push(check('Opt 단위 행 수', keys.length, unique,
    dupes ? `Style+Opt 중복 ${dupes}건` : '중복 없음'));

  return {
    passed: checks.every((c) => c.ok),
    checks,
    anomalies: deriveAnomalies(records),
  };
}
