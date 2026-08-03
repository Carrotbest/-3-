/* tds-loader.js — TDS 엑셀 → 레코드 (Claude 관리 · Codex 수정 금지)
   SheetJS(XLSX)는 index.html에서 CDN으로 미리 로드된다.
   파일은 브라우저 안에서만 읽힌다. 어디에도 전송하지 않는다. */

import { HEADER_MAP, FIELDS } from './schema.js';
import { toDate } from '../core/format.js';

const KEYS = new Set(FIELDS.map((f) => f.key));

/** 시트 이름이 집계/요약 시트인가 */
const isSummarySheet = (name) => /overview|전체|total|summary|현황/i.test(name);
/** 무시할 시트 (기준값·안내·차트 등) */
const isIgnoredSheet = (name) => /^(설정|기준|안내|guide|chart|pivot|sheet\d*)$/i.test(name.trim());

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[()[\]]/g, '');
}

/** 헤더 행을 찾는다. 상위 12행 중 매핑 히트가 가장 많은 행. */
function findHeaderRow(rows) {
  let best = { idx: -1, hits: 0, map: null };
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const map = {};
    let hits = 0;
    rows[i].forEach((cell, c) => {
      const key = HEADER_MAP[normalizeHeader(cell)];
      if (key && !(key in map)) { map[key] = c; hits++; }
    });
    if (hits > best.hits) best = { idx: i, hits, map };
  }
  return best.hits >= 4 ? best : null;
}

function rowToRecord(row, map, sheetName, rowNumber) {
  const rec = { _src: { sheet: sheetName, row: rowNumber } };
  for (const key of KEYS) {
    const col = map[key];
    let v = col === undefined ? '' : row[col];
    if (v === null || v === undefined) v = '';
    if (key === 'dueDate') {
      const d = toDate(v);
      v = d ? d.toISOString().slice(0, 10) : '';
    } else if (key === 'weight') {
      const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
      v = isNaN(n) ? '' : n;
    } else {
      v = String(v).trim();
    }
    rec[key] = v;
  }
  return rec;
}

/**
 * @returns {Promise<{records:Array, workbook:Object, sheets:{owner:string[],summary:string[]}}>}
 */
export async function loadTds(file) {
  if (typeof XLSX === 'undefined') throw new Error('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');

  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array', cellDates: true });

  const records = [];
  const sheets = { owner: [], summary: [], skipped: [] };

  for (const name of workbook.SheetNames) {
    if (isIgnoredSheet(name)) { sheets.skipped.push(name); continue; }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const head = findHeaderRow(rows);
    if (!head) { sheets.skipped.push(name); continue; }

    if (isSummarySheet(name)) { sheets.summary.push(name); continue; }   // 대조용 — 레코드로 넣지 않는다
    sheets.owner.push(name);

    for (let i = head.idx + 1; i < rows.length; i++) {
      const row = rows[i];
      const styleCol = head.map.styleNo;
      if (styleCol === undefined || !String(row[styleCol] ?? '').trim()) continue;   // 빈 행·소계 행 제외
      records.push(rowToRecord(row, head.map, name, i + 1));
    }
  }

  if (!records.length) {
    throw new Error('개발 건을 찾지 못했습니다. 시트 헤더에 Style No.·담당·납기 같은 항목이 있는지 확인해 주세요.');
  }

  return { records, workbook, sheets };
}

/** 시트 하나의 유효 행 수 (Style No.가 있는 행) */
function countRows(workbook, name) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, defval: '' });
  const head = findHeaderRow(rows);
  if (!head || head.map.styleNo === undefined) return 0;
  let n = 0;
  for (let i = head.idx + 1; i < rows.length; i++) {
    if (String(rows[i][head.map.styleNo] ?? '').trim()) n++;
  }
  return n;
}

/** 요약(전체 현황) 시트 이름들 */
export const summarySheetNames = (workbook) =>
  workbook.SheetNames.filter((n) => !isIgnoredSheet(n) && isSummarySheet(n));

/** 요약 시트들의 유효 행 수 합계 — reconcile 대조용 */
export const countSummaryRows = (workbook, sheetNames) =>
  sheetNames.reduce((sum, name) => sum + countRows(workbook, name), 0);

/** 담당자 시트별 유효 행 수 — reconcile 대조용 */
export function ownerSheetCounts(workbook) {
  const out = {};
  for (const name of workbook.SheetNames) {
    if (isIgnoredSheet(name) || isSummarySheet(name)) continue;
    const n = countRows(workbook, name);
    if (n > 0) out[name] = n;
  }
  return out;
}
