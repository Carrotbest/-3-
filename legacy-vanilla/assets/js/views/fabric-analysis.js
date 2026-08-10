/* FABRIC ANALYSIS — FL No. 기준 물성·구조 비교를 위한 2차 조회 화면. */
import { el } from '../core/dom.js';
import { createChart } from '../ui/chart.js';
import { createTable } from '../ui/table.js';
import { card, emptyState, viewHead, cols } from '../ui/widgets.js';

const STYLE_TEXT = `
.fabric-analysis { display: grid; gap: var(--sp-6); }.fabric-analysis__chart { min-height: calc(var(--sp-12) * 5); }.fabric-analysis__note { color: var(--c-muted); font-size: var(--fs-xs); }
`;
let chartApi = null; let tableApi = null; let unsub = null; let activeRoot = null;
function teardown() { chartApi?.destroy(); chartApi = null; tableApi?.destroy(); tableApi = null; unsub?.(); unsub = null; activeRoot = null; }
function render(root, store) { chartApi?.destroy(); chartApi = null; tableApi?.destroy(); tableApi = null; const rows = (store.get().records || []).filter((record) => record.flNo); if (!rows.length) { root.replaceChildren(el('style', { text: STYLE_TEXT }), viewHead({ eyebrow: 'Technical Services / Phase 2', title: 'FABRIC ANALYSIS', subtitle: 'FL No. 기준으로 조직·중량·물성 이력을 비교합니다.' }), emptyState('비교할 FL No. 데이터가 없습니다.')); return; }
  const chartHost = el('div.fabric-analysis__chart'); chartApi = createChart(chartHost, { type: 'bar', height: 240, labels: rows.slice(0, 10).map((row) => row.flNo), datasets: [{ label: '중량 g/m²', data: rows.slice(0, 10).map((row) => Number(row.weight) || 0) }] });
  tableApi = createTable({ columns: [{ key: 'flNo', label: 'FL No.', mono: true, width: 110 }, { key: 'styleNo', label: 'Style No.', mono: true, width: 120 }, { key: 'construction', label: '조직', width: 150 }, { key: 'weight', label: '중량', type: 'number', unit: ' g/m²', width: 110 }, { key: 'dyeing', label: '염색', width: 110 }, { key: 'stage', label: '공정 단계', width: 110 }], rows, sort: { key: 'flNo', dir: 'asc' }, pageSize: 10, empty: '표시할 분석 이력이 없습니다.' });
  root.replaceChildren(el('style', { text: STYLE_TEXT }), viewHead({ eyebrow: 'Technical Services / Phase 2', title: 'FABRIC ANALYSIS', subtitle: 'FL No. 기준으로 조직·중량·물성 이력을 비교합니다.' }), cols('1-1', [card({ title: 'FL No. 중량 비교', meta: '상위 10건', body: chartHost }), card({ title: '분석 범위', meta: '조회 전용', body: el('p.fabric-analysis__note', { text: '시험 결과·Pass/Fail 이력·재테스트 현황은 데이터 연결 후 확장됩니다.' }) })]), card({ title: 'FL No. 이력', meta: `${rows.length}건`, body: tableApi.el })); }
export default { id: 'fabric-analysis', title: 'FABRIC ANALYSIS', crumb: ['TECHNICAL SERVICES', 'FABRIC ANALYSIS'], mount(root, { store }) { teardown(); activeRoot = root; root.classList.add('fabric-analysis'); render(root, store); unsub = store.subscribe('records', () => render(root, store)); }, unmount() { activeRoot?.classList.remove('fabric-analysis'); teardown(); } };
