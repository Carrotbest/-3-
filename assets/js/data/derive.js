/* derive.js — 파생 집계 (Claude 관리)
   화면에서 숫자를 다시 계산하지 않도록, 집계는 전부 여기서 한 번만 한다. */

import { daysLeft, normalizeSeason } from '../core/format.js';
import { CATEGORIES, MEMBERS } from './schema.js';

/** 레코드 1건의 상태를 판정한다. STATUS 키를 돌려준다. */
export function statusOf(rec, today = new Date()) {
  if (rec.stage === '완료' || rec.flNo) return 'done';
  const d = daysLeft(rec.dueDate, today);
  if (d === null) return 'progress';
  if (d < 0) return 'late';
  if (d <= 3) return 'due';
  return 'progress';
}

export function kpis(records, today = new Date()) {
  let progress = 0, done = 0, late = 0, dueSoon = 0;
  for (const r of records) {
    switch (statusOf(r, today)) {
      case 'done': done++; break;
      case 'late': late++; progress++; break;
      case 'due': dueSoon++; progress++; break;
      default: progress++;
    }
  }
  return { total: records.length, progress, done, late, dueSoon };
}

export function countBy(records, key) {
  const m = new Map();
  for (const r of records) {
    const k = r[key] ?? '(미지정)';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export const byCategory = (records) =>
  CATEGORIES.map((c) => ({ label: c, count: records.filter((r) => r.category === c).length }));

export const byOwner = (records) =>
  MEMBERS.map((m) => ({ label: m.name, count: records.filter((r) => r.owner === m.name).length }));

/** 담당자 기준 내 업무 — 마감 급한 순 */
export function myTasks(records, owner, limit = 5, today = new Date()) {
  return records
    .filter((r) => r.owner === owner && statusOf(r, today) !== 'done')
    .map((r) => ({ ...r, _status: statusOf(r, today), _days: daysLeft(r.dueDate, today) }))
    .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999))
    .slice(0, limit);
}

/** 납기 임박·지연 전체 (HOME 알림·DEVELOPMENT 배지용) */
export const attentionItems = (records, today = new Date()) =>
  records
    .map((r) => ({ ...r, _status: statusOf(r, today), _days: daysLeft(r.dueDate, today) }))
    .filter((r) => r._status === 'late' || r._status === 'due')
    .sort((a, b) => (a._days ?? 9999) - (b._days ?? 9999));

/** 데이터 이상 항목 — 원본은 고치지 않고 목록만 만든다 */
export function anomalies(records) {
  const seasonOdd = [], dueBlank = [], ownerBlank = [];
  for (const r of records) {
    const s = normalizeSeason(r.season);
    if (s.normalized) seasonOdd.push({ styleNo: r.styleNo, raw: s.raw, suggested: s.value });
    if (!r.dueDate && r.stage !== '완료') dueBlank.push({ styleNo: r.styleNo, category: r.category });
    if (!r.owner) ownerBlank.push({ styleNo: r.styleNo, category: r.category });
  }
  return [
    { type: '시즌 표기 불일치', tone: 'warn', count: seasonOdd.length, samples: seasonOdd.slice(0, 5) },
    { type: '납기 공란', tone: 'crit', count: dueBlank.length, samples: dueBlank.slice(0, 5) },
    { type: '담당 미지정', tone: 'warn', count: ownerBlank.length, samples: ownerBlank.slice(0, 5) },
  ].filter((a) => a.count > 0);
}

/** 주간보고 2줄 — HOME에서 복사 버튼으로 내보낸다 */
export function weeklyLines(records, tsRows, today = new Date()) {
  const k = kpis(records, today);
  const tsNew = tsRows.filter((t) => t.state === '접수').length;
  const tsDone = tsRows.filter((t) => t.state === '완료').length;
  const tsQty = tsRows.reduce((s, t) => s + (t.orderQty || 0), 0);
  return [
    `· 개발: 진행 ${k.progress}건 / 완료 ${k.done}건 / 지연 ${k.late}건 (납기 임박 ${k.dueSoon}건)`,
    `· 기술지원: 접수 ${tsNew}건 / 완료 ${tsDone}건 / 발주 연결 ${tsQty.toLocaleString('ko-KR')} yds`,
  ];
}
