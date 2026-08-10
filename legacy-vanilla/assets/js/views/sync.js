/* sync.js — TDS 반영 기준 시각과 합계 대조 결과 */

import { el } from '../core/dom.js';
import { fmtDateFull, fmtNum, fmtTime, toDate } from '../core/format.js';
import { viewHead, badge, kpiRow, button, card, emptyState } from '../ui/widgets.js';

const STYLE_TEXT = `
.sync { display: grid; gap: var(--sp-6); }
.sync > .view-head, .sync > .kpis { margin-bottom: 0; }
.sync-banner { display: grid; gap: var(--sp-2); padding: var(--sp-5); border: 1px solid var(--c-line); border-radius: var(--r-lg); background: var(--c-paper); }
.sync-banner--ok { border-color: var(--c-ok-line); background: var(--c-ok-tint); }
.sync-banner--crit { border-color: var(--c-crit-line); background: var(--c-crit-tint); }
.sync-banner--neutral { background: var(--c-neutral-tint); }
.sync-banner__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.sync-banner__title { font-size: var(--fs-h1); line-height: var(--lh-h1); }
.sync-banner__meta, .sync-banner__detail, .sync-banner__action { color: var(--c-ink-2); font-size: var(--fs-sm); }
.sync-banner__action { font-weight: var(--fw-bold); }
.sync-section { min-width: 0; }
.sync-table-wrap { max-width: 100%; overflow-x: auto; }
.sync-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.sync-table__head { background: var(--c-paper-2); color: var(--c-muted); text-align: left; white-space: nowrap; }
.sync-table__cell { padding: var(--sp-3); border-bottom: 1px solid var(--c-line); vertical-align: top; }
.sync-table__cell--number { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sync-table__cell--status { display: grid; gap: var(--sp-1); min-width: calc(var(--sp-12) * 2); }
.sync-table__reason, .sync-table__skip { color: var(--c-muted); font-size: var(--fs-xs); }
.sync-table__skip { display: block; margin-top: var(--sp-1); }
.sync-anomalies { display: grid; gap: var(--sp-3); }
.sync-anomaly { display: grid; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.sync-anomaly__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.sync-anomaly__samples { color: var(--c-ink-2); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.sync-guidance { color: var(--c-muted); font-size: var(--fs-xs); }
.sync-admin { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
.sync-admin__message { color: var(--c-ink-2); font-size: var(--fs-sm); }
`;

const TONES = new Set(['brand', 'ok', 'warn', 'crit', 'neutral']);

let unsub = null;
let cleanupRootEvents = null;
let activeRoot = null;

function teardown() {
  unsub?.();
  unsub = null;
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  activeRoot = null;
}

function dateTime(value) {
  if (!toDate(value)) return '—';
  return `${fmtDateFull(value)} ${fmtTime(value)}`;
}

function passedHistory(meta) {
  return (meta.history || []).filter((item) => item.passed);
}

function appliedSnapshot(meta) {
  const latest = passedHistory(meta)[0] || {};
  return {
    appliedAt: meta.appliedAt || latest.appliedAt || null,
    appliedBy: meta.appliedBy || latest.appliedBy || null,
    count: latest.count ?? meta.checks?.[0]?.applied ?? null,
  };
}

function elapsedDays(value) {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function failedSummary(checks) {
  const failed = (checks || []).filter((item) => !item.ok);
  if (!failed.length) return '대조 결과에서 불일치 항목을 확인해 주세요.';
  return failed.map((item) => `${item.name} ${fmtNum(Math.abs(Number(item.diff) || 0), '건')} 차이`).join(' · ');
}

function renderBanner(meta, snapshot) {
  const isDemo = meta.mode === 'demo';
  const tone = isDemo ? 'neutral' : meta.passed ? 'ok' : 'crit';
  const title = isDemo
    ? `예시 데이터입니다 · 합계 대조 ${fmtNum(snapshot.count, '건')}`
    : meta.passed
      ? `합계 대조를 통과했습니다 · ${fmtNum(snapshot.count, '건')}`
      : '합계가 맞지 않아 반영하지 않았습니다';
  const children = [
    el('div.sync-banner__head', null, [
      badge(isDemo ? '예시 데이터' : meta.passed ? '통과' : '반영 안 됨', tone),
      el('h2.sync-banner__title', { text: title }),
    ]),
    el('p.sync-banner__meta', {
      text: isDemo
        ? '화면 구성 확인을 위한 값이며 실제 TDS 반영 결과가 아닙니다.'
        : `반영 시각 ${dateTime(snapshot.appliedAt)} · 반영자 ${snapshot.appliedBy || '—'}`,
    }),
  ];
  if (!isDemo && !meta.passed) {
    children.push(
      el('p.sync-banner__detail', { text: failedSummary(meta.checks) }),
      el('p.sync-banner__detail', { text: `이전 반영 값(${dateTime(snapshot.appliedAt)})을 그대로 보여주고 있습니다.` }),
      el('p.sync-banner__action', { text: 'TDS에서 해당 항목을 확인한 후 다시 열어 주세요.' }),
    );
  }
  return el(`section.sync-banner.sync-banner--${tone}`, {
    'aria-label': '현재 동기화 상태',
  }, children);
}

function renderKpis(meta, snapshot) {
  const checks = meta.checks || [];
  const passedCount = checks.filter((item) => item.ok).length;
  const days = elapsedDays(snapshot.appliedAt);
  const stale = days !== null && days >= 7;
  return kpiRow([
    { label: '마지막 반영 시각', value: dateTime(snapshot.appliedAt), note: snapshot.appliedBy ? `${snapshot.appliedBy} 반영` : '반영 기록 없음' },
    { label: '대조 통과', value: `${passedCount}/5`, note: meta.passed ? '모든 대조 항목 확인' : '불일치 항목 확인 필요', tone: meta.passed ? null : 'crit' },
    { label: '반영 건수', value: fmtNum(snapshot.count, '건'), note: meta.passed ? '현재 화면 기준' : '이전 통과 값 기준' },
    { label: '마지막 반영 후 경과일', value: days === null ? '—' : `${days}일`, note: stale ? 'HOME에 안내가 표시됩니다' : '최근 반영 기준', tone: stale ? 'warn' : null },
  ]);
}

function tableHead(labels) {
  return el('thead.sync-table__head', null,
    el('tr', null, labels.map((label) => el('th.sync-table__cell', { scope: 'col', text: label }))));
}

function renderChecks(checks) {
  const rows = (checks || []).map((item) => {
    const skipped = item.excel === null || item.excel === undefined;
    return el('tr', null, [
      el('th.sync-table__cell', { scope: 'row', text: item.name || '—' }),
      el('td.sync-table__cell.sync-table__cell--number', null, [
        el('span', { text: skipped ? '—' : fmtNum(item.excel) }),
        skipped && el('span.sync-table__skip', { text: '검사 생략' }),
      ]),
      el('td.sync-table__cell.sync-table__cell--number', { text: fmtNum(item.applied) }),
      el('td.sync-table__cell.sync-table__cell--number', { text: skipped ? '—' : fmtNum(item.diff) }),
      el('td.sync-table__cell', null, badge(item.ok ? '통과' : '불일치', item.ok ? 'ok' : 'crit')),
      el('td.sync-table__cell', { text: item.note || '—' }),
    ]);
  });
  return card({
    title: '합계 대조 결과',
    meta: `${rows.length}개 항목`,
    className: 'sync-section',
    body: rows.length
      ? el('div.sync-table-wrap', null, el('table.sync-table', null, [
        tableHead(['대조 방법', '엑셀 합', '반영 값', '차이', '판정', '비고']),
        el('tbody', null, rows),
      ]))
      : emptyState('대조 결과가 없습니다.'),
  });
}

function renderHistory(history, sensitiveUnlocked) {
  const rows = (history || []).map((item) => el('tr', null, [
    el('td.sync-table__cell', { text: dateTime(item.appliedAt) }),
    el('td.sync-table__cell', { text: item.fileName || '—' }),
    el('td.sync-table__cell.sync-table__cell--number', { text: fmtNum(item.count, '건') }),
    el('td.sync-table__cell', null, badge(item.passed ? '통과' : '실패', item.passed ? 'ok' : 'crit')),
    el('td.sync-table__cell.sync-table__cell--status', null, [
      badge(item.state || (item.passed ? '반영됨' : '전송 안 됨'), item.passed ? 'neutral' : 'crit'),
      !item.passed && item.reason && el('p.sync-table__reason', { text: item.reason }),
    ]),
  ]));
  const rollback = button('이전 통과 건으로 되돌리기', {
    variant: 'ghost',
    class: 'sync-rollback',
    disabled: !sensitiveUnlocked,
    title: sensitiveUnlocked ? '관리자 승인 후 되돌리기를 요청합니다.' : '관리자 권한을 확인해야 사용할 수 있습니다.',
  });
  const message = el('p.sync-admin__message', { 'aria-live': 'polite' });
  return card({
    title: '반영 이력',
    meta: `${rows.length}건`,
    className: 'sync-section',
    body: rows.length
      ? el('div.sync-table-wrap', null, el('table.sync-table', null, [
        tableHead(['반영 시각', '파일', '건수', '검증', '상태']),
        el('tbody', null, rows),
      ]))
      : emptyState('반영 이력이 없습니다.'),
    foot: el('div.sync-admin', null, [rollback, message]),
  });
}

function renderAnomalies(anomalies) {
  const items = (anomalies || []).map((item) => {
    const tone = TONES.has(item.tone) ? item.tone : 'warn';
    const samples = (item.samples || []).slice(0, 5)
      .map((sample) => typeof sample === 'object' ? sample.styleNo : sample)
      .filter(Boolean);
    return el('article.sync-anomaly', null, [
      el('div.sync-anomaly__head', null, [
        el('h3', { text: item.type || '확인 필요' }),
        badge(`${fmtNum(item.count, '건')}`, tone),
      ]),
      el('p.sync-anomaly__samples', { text: samples.length ? `Style No. ${samples.join(' · ')}` : 'Style No. 예시 없음' }),
    ]);
  });
  return card({
    title: '데이터 이상 항목',
    meta: items.length ? `${items.length}개 유형` : '확인 완료',
    className: 'sync-section',
    body: items.length ? el('div.sync-anomalies', null, items) : emptyState('정리할 데이터가 없습니다.'),
    foot: el('p.sync-guidance', { text: '원본은 고치지 않습니다. 확인 후 TDS에서 직접 수정해 주세요.' }),
  });
}

function build(root, store) {
  const meta = store.get().meta || {};
  const snapshot = appliedSnapshot(meta);
  root.replaceChildren(
    el('style', { text: STYLE_TEXT }),
    viewHead({
      eyebrow: 'Operations / Data assurance',
      title: '동기화 상태',
      subtitle: '팀이 보는 숫자의 기준 시각과 검증 결과를 확인합니다.',
    }),
    renderBanner(meta, snapshot),
    renderKpis(meta, snapshot),
    renderChecks(meta.checks),
    renderHistory(meta.history, store.get().sensitiveUnlocked),
    renderAnomalies(meta.anomalies),
  );

  const onClick = (event) => {
    const rollback = event.target.closest('.sync-rollback');
    if (!rollback || !root.contains(rollback) || rollback.disabled) return;
    if (window.confirm('이전 통과 건으로 되돌리기를 요청하시겠습니까?')) {
      const message = root.querySelector('.sync-admin__message');
      if (message) message.textContent = '되돌리기는 관리자 승인 후 동작합니다.';
    }
  };
  root.addEventListener('click', onClick);
  cleanupRootEvents = () => root.removeEventListener('click', onClick);
}

export default {
  id: 'sync',
  title: '동기화 상태',
  crumb: ['OPERATIONS', '동기화 상태'],
  mount(root, { store }) {
    teardown();
    activeRoot = root;
    root.classList.add('sync');
    build(root, store);
    unsub = store.subscribe('meta', () => {
      cleanupRootEvents?.();
      cleanupRootEvents = null;
      build(root, store);
    });
  },
  unmount() {
    activeRoot?.classList.remove('sync');
    teardown();
  },
};
