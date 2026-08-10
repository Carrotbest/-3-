/* RDDA REPORT — 월별 실적과 등록 자산을 조회하는 화면 */

import { el } from '../core/dom.js';
import { fmtNum, fmtPct } from '../core/format.js';
import { createChart } from '../ui/chart.js';
import { createTable } from '../ui/table.js';
import { card, cols, emptyState, kpiRow, viewHead } from '../ui/widgets.js';

const STYLE_TEXT = `
.rdda { display: grid; gap: var(--sp-6); }
.rdda > .view-head, .rdda > .kpis { margin-bottom: 0; }
.rdda__grid { display: grid; gap: var(--sp-5); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rdda__chart-card .card__body { min-width: 0; }
.rdda__table-note { color: var(--c-muted); font-size: var(--fs-xs); }
@media (max-width: 760px) { .rdda__grid { grid-template-columns: 1fr; } }
`;

let charts = [];
let tableApi = null;
let unsub = null;
let activeRoot = null;

function teardown() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
  tableApi?.destroy();
  tableApi = null;
  unsub?.();
  unsub = null;
  activeRoot = null;
}

function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function chartCard(title, meta, config) {
  const host = el('div');
  const api = createChart(host, config);
  charts.push(api);
  return card({ title, meta, className: 'rdda__chart-card', body: host });
}

function buildBestItems(items, sensitiveUnlocked) {
  const columns = [
    { key: 'rank', label: '순위', type: 'number', width: 60 },
    { key: 'flNo', label: 'FL No.', mono: true, width: 110 },
    { key: 'construction', label: '조직', width: 150 },
    { key: 'weight', label: '중량', type: 'number', unit: ' g/m²', width: 110 },
    { key: 'pickup', label: '픽업', type: 'number', width: 90 },
    { key: 'meeting', label: '미팅', type: 'number', width: 90 },
  ];
  if (sensitiveUnlocked) {
    columns.push(
      { key: 'unitPrice', label: '단가', type: 'number', width: 100 },
      { key: 'vendor', label: '협력사', width: 120 },
    );
  }
  tableApi = createTable({
    columns,
    rows: items || [],
    rowKey: (row) => row.flNo,
    sort: { key: 'pickup', dir: 'desc' },
    pageSize: 10,
    empty: 'Best Items 데이터가 없습니다.',
  });
  return card({
    title: 'Best Items',
    meta: sensitiveUnlocked ? '내부 데이터' : '픽업 기준 상위 항목',
    body: tableApi.el,
    foot: el('p.rdda__table-note', {
      text: sensitiveUnlocked
        ? '단가 및 협력사 정보는 검증된 TDS 데이터가 반영된 내부 화면에서만 표시됩니다.'
        : '월별 실적 원본을 읽어 집계합니다. (IT부 데이터 다운로드 연동 예정)',
    }),
  });
}

function render(root, store) {
  charts.forEach((chart) => chart.destroy());
  charts = [];
  tableApi?.destroy();
  tableApi = null;

  const state = store.get();
  const rdda = state.rdda;
  if (!rdda) {
    root.replaceChildren(
      el('style', { text: STYLE_TEXT }),
      viewHead({
        eyebrow: 'Fabric R&D',
        title: 'RDDA REPORT',
        subtitle: '부서 전체의 원단 등록·미팅·픽업 실적을 월 단위로 확인합니다.',
      }),
      emptyState('RDDA 데이터가 아직 연결되지 않았습니다.'),
    );
    return;
  }

  const monthly = rdda.monthly || [];
  const registered = sum(monthly, 'registered');
  const meeting = sum(monthly, 'meeting');
  const pickup = sum(monthly, 'pickup');
  const pickupRate = meeting ? (pickup / meeting) * 100 : 0;
  const labels = monthly.map((row) => row.month);

  const monthlyChart = chartCard('월별 등록 추이', '등록 · 미팅 · 픽업', {
    type: 'line', labels, height: 250,
    datasets: [
      { label: '등록', data: monthly.map((row) => row.registered), tension: 0.3 },
      { label: '미팅', data: monthly.map((row) => row.meeting), tension: 0.3 },
      { label: '픽업', data: monthly.map((row) => row.pickup), tension: 0.3 },
    ],
  });
  const cumulativeChart = chartCard('연도별 누적', '창고보관 · 소진 · 폐기', {
    type: 'bar', stacked: true, height: 250,
    labels: (rdda.cumulative || []).map((row) => String(row.year)),
    datasets: [
      { label: '창고보관', data: (rdda.cumulative || []).map((row) => row.stored) },
      { label: '소진', data: (rdda.cumulative || []).map((row) => row.used) },
      { label: '폐기', data: (rdda.cumulative || []).map((row) => row.discarded) },
    ],
  });
  const originChart = chartCard('원산지 분포', '등록 원단 기준', {
    type: 'doughnut', height: 240,
    labels: (rdda.origin || []).map((row) => row.label),
    datasets: [{ label: '원단 수', data: (rdda.origin || []).map((row) => row.count) }],
  });
  const constructionChart = chartCard('조직 분포', '등록 원단 기준', {
    type: 'bar', horizontal: true, height: 240,
    labels: (rdda.construction || []).map((row) => row.label),
    datasets: [{ label: '원단 수', data: (rdda.construction || []).map((row) => row.count) }],
  });

  root.replaceChildren(
    el('style', { text: STYLE_TEXT }),
    viewHead({
      eyebrow: 'Fabric R&D',
      title: 'RDDA REPORT',
      subtitle: '부서 전체의 원단 등록·미팅·픽업 실적을 월 단위로 확인합니다.',
    }),
    kpiRow([
      { label: '누적 등록', value: fmtNum(registered, '건'), note: `${monthly.length}개월 기준` },
      { label: '누적 미팅', value: fmtNum(meeting, '건'), note: '등록 원단 미팅 실적' },
      { label: '누적 픽업', value: fmtNum(pickup, '건'), note: '샘플 픽업 실적' },
      { label: '픽업율', value: fmtPct(pickupRate, 1), note: '픽업 ÷ 미팅' },
    ]),
    cols('1-1', [monthlyChart, cumulativeChart]),
    cols('1-1', [originChart, constructionChart]),
    buildBestItems(rdda.bestItems, state.sensitiveUnlocked),
  );
}

export default {
  id: 'rdda',
  title: 'RDDA REPORT',
  crumb: ['FABRIC R&D', 'RDDA REPORT'],
  mount(root, { store }) {
    teardown();
    activeRoot = root;
    root.classList.add('rdda');
    render(root, store);
    unsub = store.subscribe('sensitiveUnlocked', () => render(root, store));
  },
  unmount() {
    activeRoot?.classList.remove('rdda');
    teardown();
  },
};
