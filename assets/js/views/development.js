/* development.js — DEVELOPMENT 개발 현황 조회 */

import { el } from '../core/dom.js';
import { fmtDate, fmtNum, toDate } from '../core/format.js';
import { FIELDS, DEFAULT_COLUMNS, STAGES, STATUS } from '../data/schema.js';
import { statusOf, kpis } from '../data/derive.js';
import { createTable } from '../ui/table.js';
import { viewHead, badge, kpiRow, button, stageBar, emptyState } from '../ui/widgets.js';

const SUBS = {
  overview: { title: '개발 현황', name: 'Overview', category: null },
  eu: { title: 'EU Market', name: 'EU Market', category: 'EU MARKET' },
  season: { title: 'Season', name: 'Season', category: 'SEASON' },
  core: { title: 'Core', name: 'Core', category: 'CORE' },
  project: { title: 'Project', name: 'Project', category: 'PROJECT' },
};

const FILTER_KEYS = ['query', 'season', 'category', 'buyer', 'owner', 'stage'];
const SEARCH_KEYS = ['styleNo', 'buyer', 'owner', 'gdNo', 'saNo'];
const VIEW_LABELS = { list: '목록', board: '보드', timeline: '타임라인' };

const STYLE_TEXT = `
.development { display: grid; gap: var(--sp-6); }
.development > .view-head, .development > .kpis { margin-bottom: 0; }
.development__views { min-width: 0; }
.development__search { min-width: calc(var(--sp-12) * 4); }
.development__view-btn.is-active { border-color: var(--c-brand); background: var(--c-brand); color: var(--c-on-brand); }
.dev-board { display: grid; grid-template-columns: repeat(6, minmax(calc(var(--sp-12) * 3), 1fr)); gap: var(--sp-3); overflow-x: auto; }
.dev-board__column { display: grid; align-content: start; gap: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-lg); background: var(--c-paper-2); }
.dev-board__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.dev-board__title { font-size: var(--fs-h2); }
.dev-board__card { display: grid; gap: var(--sp-1); width: 100%; padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper); color: var(--c-ink); font: inherit; text-align: left; cursor: pointer; box-shadow: var(--shadow-1); }
.dev-board__card:hover, .dev-board__card:focus-visible { border-color: var(--c-brand); }
.dev-board__style { font-family: var(--font-mono); font-size: var(--fs-sm); }
.dev-board__meta { color: var(--c-muted); font-size: var(--fs-xs); }
.dev-timeline { overflow-x: auto; border: 1px solid var(--c-line); border-radius: var(--r-lg); background: var(--c-paper); }
.dev-timeline__axis, .dev-timeline__row { display: grid; grid-template-columns: calc(var(--sp-12) * 2) repeat(61, minmax(var(--sp-4), 1fr)); min-width: calc(var(--sp-12) * 24); }
.dev-timeline__owner, .dev-timeline__axis-label { position: sticky; z-index: 2; left: 0; display: grid; align-items: center; padding: var(--sp-2); border-right: 1px solid var(--c-line); background: var(--c-paper-2); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.dev-timeline__axis-label { color: var(--c-muted); }
.dev-timeline__day { min-height: var(--sp-9); border-left: 1px solid var(--c-line); }
.dev-timeline__day.is-today { background: var(--c-brand-tint); }
.dev-timeline__date { display: grid; place-items: center; color: var(--c-muted); font-size: var(--fs-2xs); }
.dev-timeline__dot { display: grid; width: var(--sp-3); height: var(--sp-3); margin: auto; padding: 0; border: 0; border-radius: var(--r-full); background: var(--c-brand); cursor: pointer; }
.dev-timeline__dot--warn { background: var(--c-warn); }
.dev-timeline__dot--crit { background: var(--c-crit); }
.dev-timeline__dot--ok { background: var(--c-ok); }
.detail { position: fixed; z-index: 30; inset: 0 0 0 auto; width: min(calc(var(--sp-12) * 10), 92vw); overflow-y: auto; padding: var(--sp-6); border-left: 1px solid var(--c-line); background: var(--c-paper); color: var(--c-ink); box-shadow: var(--shadow-2); }
.detail[hidden] { display: none; }
.detail__head { display: flex; align-items: start; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-6); }
.detail__title { font-size: var(--fs-h1); }
.detail__sub { margin-top: var(--sp-1); color: var(--c-muted); font-size: var(--fs-xs); }
.detail__section { display: grid; gap: var(--sp-3); margin-top: var(--sp-6); padding-top: var(--sp-4); border-top: 1px solid var(--c-line); }
.detail__section-title { font-size: var(--fs-h2); }
.detail__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.detail__field { min-width: 0; }
.detail__label { color: var(--c-muted); font-size: var(--fs-xs); }
.detail__value { margin-top: var(--sp-1); overflow-wrap: anywhere; font-size: var(--fs-sm); }
.detail__stage { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
.detail__source { padding: var(--sp-3); border-radius: var(--r-sm); background: var(--c-brand-tint); color: var(--c-brand-ink); font-size: var(--fs-sm); }
@media (max-width: 980px) { .dev-board { grid-template-columns: repeat(6, minmax(calc(var(--sp-12) * 3), 1fr)); } }
@media (max-width: 560px) { .detail__fields { grid-template-columns: minmax(0, 1fr); } .development__search { min-width: 100%; } }
@media (prefers-reduced-motion: reduce) { .detail { scroll-behavior: auto; } }
`;

let unsub = null;
let tableApi = null;
let cleanupRootEvents = null;
let activeRoot = null;
let lastTrigger = null;
let viewMode = 'list';

function teardown() {
  unsub?.();
  unsub = null;
  tableApi?.destroy();
  tableApi = null;
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  activeRoot = null;
  lastTrigger = null;
}

function field(label, control, className = '') {
  const id = `development-${control.name}`;
  control.id = id;
  return el(`div.field${className ? `.${className}` : ''}`, null, [
    el('label', { for: id, text: label }),
    control,
  ]);
}

function selectControl(name, label) {
  return field(label, el('select', { name }, el('option', { value: '', text: '전체' })));
}

function uniqueValues(records, key) {
  return [...new Set(records.map((record) => String(record[key] ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

function fillSelect(select, values, selected) {
  select.replaceChildren(el('option', { value: '', text: '전체' }));
  values.forEach((value) => select.append(el('option', { value, text: value })));
  select.value = values.includes(selected) ? selected : '';
}

function savedFilters(store) {
  const saved = store.get().filters?.development || {};
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, String(saved[key] ?? '')]));
}

function saveFilters(store, filters) {
  store.set({
    filters: {
      ...store.get().filters,
      development: { ...filters },
    },
  });
}

function filteredRecords(records, routeCategory, filters) {
  const query = filters.query.trim().toLocaleLowerCase('ko');
  return records.filter((record) => {
    if (routeCategory && record.category !== routeCategory) return false;
    if (query && !SEARCH_KEYS.some((key) => String(record[key] ?? '').toLocaleLowerCase('ko').includes(query))) return false;
    return ['season', 'category', 'buyer', 'owner', 'stage']
      .every((key) => !filters[key] || String(record[key] ?? '') === filters[key]);
  });
}

function displayField(record, definition) {
  const value = record[definition.key];
  if (value === null || value === undefined || value === '') return '—';
  if (definition.type === 'date') return fmtDate(value);
  if (definition.type === 'number' || definition.align === 'right' || definition.unit) {
    return fmtNum(value, definition.unit || '');
  }
  return String(value);
}

function stageIndex(record) {
  const index = STAGES.findIndex((stage) => stage.key === record.stage || stage.label === record.stage);
  return index < 0 ? 0 : index;
}

function openDetail(panel, record, trigger) {
  lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  const source = record._src || {};
  const sheet = source.sheet ? `${source.sheet}${/시트$/.test(source.sheet) ? '' : ' 시트'}` : '—';
  const currentStage = stageIndex(record);
  panel.replaceChildren(el('div.detail__head', null, [
    el('div', null, [
      el('h2.detail__title', { id: 'development-detail-title', text: record.styleNo || '개발 상세' }),
      el('p.detail__sub', { text: 'TDS 원본을 기준으로 표시한 읽기 전용 정보입니다.' }),
    ]),
    button('닫기', { variant: 'ghost', 'aria-label': '상세 패널 닫기', onClick: () => closeDetail(panel) }),
  ]));
  panel.append(el('div.detail__fields', null, FIELDS.map((definition) =>
    el('div.detail__field', null, [
      el('p.detail__label', { text: definition.label }),
      el('p.detail__value', { text: displayField(record, definition) }),
    ]))));
  panel.append(el('section.detail__section', null, [
    el('h3.detail__section-title', { text: '공정 타임라인' }),
    el('div.detail__stage', null, [stageBar(STAGES, currentStage), el('b', { text: STAGES[currentStage]?.label || record.stage || '—' })]),
  ]));
  panel.append(el('section.detail__section', null, [
    el('h3.detail__section-title', { text: '원본 위치' }),
    el('p.detail__source', { text: `원본은 엑셀입니다. ${sheet} ${source.row ?? '—'} 행에서 확인해 주세요.` }),
  ]));
  panel.hidden = false;
  panel.focus();
}

function closeDetail(panel) {
  if (panel.hidden) return;
  panel.hidden = true;
  panel.replaceChildren();
  if (lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
}

function decorateStatusCells(tableElement) {
  tableElement.querySelectorAll('tbody tr[data-row-key]').forEach((row) => {
    const cell = row.lastElementChild;
    const key = cell?.textContent;
    const status = STATUS[key];
    if (cell && status) cell.replaceChildren(badge(status.label, status.tone));
  });
}

function renderList(records, panel) {
  const columns = [
    ...DEFAULT_COLUMNS.map((key) => FIELDS.find((fieldDefinition) => fieldDefinition.key === key)).filter(Boolean),
    { key: '_status', label: '상태', width: 90 },
  ];
  const rows = records.map((record) => ({ ...record, _status: statusOf(record) }));
  tableApi = createTable({
    columns,
    rows,
    rowKey: (row, index) => `${row.styleNo || 'row'}-${index}`,
    onRowClick: (record) => openDetail(panel, record, document.activeElement),
    onRender: decorateStatusCells,
    empty: '조건에 맞는 개발 건이 없습니다.',
  });
  return tableApi.el;
}

function recordButton(record, className, children, panel, label) {
  return el(`button.${className}`, {
    type: 'button',
    'aria-label': label,
    onclick(event) { openDetail(panel, record, event.currentTarget); },
  }, children);
}

function renderBoard(records, panel) {
  return el('div.dev-board', null, STAGES.map((stage) => {
    const stageRecords = records.filter((record) => record.stage === stage.label || record.stage === stage.key);
    return el('section.dev-board__column', null, [
      el('div.dev-board__head', null, [
        el('h2.dev-board__title', { text: stage.label }),
        badge(`${stageRecords.length}건`, 'neutral'),
      ]),
      ...stageRecords.map((record) => recordButton(record, 'dev-board__card', [
        el('b.dev-board__style', { text: record.styleNo || '—' }),
        el('span.dev-board__meta', { text: `${record.buyer || '—'} · ${record.owner || '—'}` }),
        el('span.dev-board__meta', { text: `납기 ${fmtDate(record.dueDate)}` }),
      ], panel, `${record.styleNo || '개발 건'} 상세 보기`)),
    ]);
  }));
}

function shiftedDate(today, offset) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
}

function dateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderTimeline(records, panel) {
  const today = new Date();
  const days = Array.from({ length: 61 }, (_, index) => shiftedDate(today, index - 30));
  const owners = uniqueValues(records, 'owner');
  if (records.some((record) => !record.owner)) owners.push('(미지정)');
  const axis = el('div.dev-timeline__axis', null, [
    el('div.dev-timeline__axis-label', { text: '담당 / 납기' }),
    ...days.map((date, index) => el(`div.dev-timeline__date${index === 30 ? '.is-today' : ''}`, {
      text: index === 0 || index === 30 || index === 60 ? fmtDate(date) : '',
      title: fmtDate(date),
    })),
  ]);
  const rows = owners.map((owner) => {
    const ownerRecords = records.filter((record) => (record.owner || '(미지정)') === owner);
    const byDueDate = new Map();
    ownerRecords.forEach((record) => {
      const due = toDate(record.dueDate);
      if (!due) return;
      const key = dateKey(due);
      if (!byDueDate.has(key)) byDueDate.set(key, []);
      byDueDate.get(key).push(record);
    });
    return el('div.dev-timeline__row', null, [
      el('div.dev-timeline__owner', { text: owner }),
      ...days.map((date, index) => {
        const dueRecords = byDueDate.get(dateKey(date)) || [];
        return el(`div.dev-timeline__day${index === 30 ? '.is-today' : ''}`, null,
          dueRecords.map((record) => {
            const status = STATUS[statusOf(record)];
            return recordButton(record, `dev-timeline__dot.dev-timeline__dot--${status.tone}`, null, panel,
              `${record.styleNo || '개발 건'}, 납기 ${fmtDate(record.dueDate)} 상세 보기`);
          }));
      }),
    ]);
  });
  return el('div.dev-timeline', null, [axis, ...rows]);
}

function renderView(mode, records, panel) {
  if (!records.length) return emptyState('조건에 맞는 개발 건이 없습니다.');
  if (mode === 'board') return renderBoard(records, panel);
  if (mode === 'timeline') return renderTimeline(records, panel);
  return renderList(records, panel);
}

function build(root, store, route) {
  const sub = SUBS[route.sub] || SUBS.overview;
  const filters = savedFilters(store);
  const style = el('style', { text: STYLE_TEXT });
  const panel = el('aside.detail', {
    hidden: true,
    tabindex: '-1',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'development-detail-title',
  });
  const viewActions = Object.entries(VIEW_LABELS).map(([mode, label]) => button(label, {
    variant: 'ghost',
    class: 'development__view-btn',
    'data-view-mode': mode,
    'aria-pressed': String(mode === viewMode),
  }));
  const head = viewHead({
    eyebrow: `Fabric R&D / ${sub.name}`,
    title: sub.title,
    subtitle: '전체 개발 건을 한 기준으로 조회합니다. 원본 수정은 TDS에서만 수행합니다.',
    actions: viewActions,
  });
  const kpiHost = el('div');
  const search = el('input', {
    type: 'search', name: 'query', value: filters.query,
    placeholder: 'Style No. · Buyer · 담당 · GD# · SA#',
  });
  const toolbar = el('div.toolbar', null, [
    field('검색', search, 'development__search'),
    selectControl('season', '시즌'),
    selectControl('category', '카테고리'),
    selectControl('buyer', 'Buyer'),
    selectControl('owner', '담당'),
    selectControl('stage', '공정 단계'),
  ]);
  const reset = button('필터 초기화', { variant: 'ghost', disabled: true });
  toolbar.append(reset);
  const viewHost = el('div.development__views');
  root.replaceChildren(style, head, kpiHost, toolbar, viewHost, panel);

  const controls = Object.fromEntries(FILTER_KEYS.map((key) => [key, root.querySelector(`[name="${key}"]`)]));

  function routeRecords() {
    return store.get().records.filter((record) => !sub.category || record.category === sub.category);
  }

  function syncOptions() {
    const records = routeRecords();
    ['season', 'category', 'buyer', 'owner', 'stage'].forEach((key) => {
      fillSelect(controls[key], uniqueValues(records, key), filters[key]);
      filters[key] = controls[key].value;
    });
  }

  function updateButtons() {
    viewActions.forEach((viewButton) => {
      const active = viewButton.dataset.viewMode === viewMode;
      viewButton.classList.toggle('is-active', active);
      viewButton.setAttribute('aria-pressed', String(active));
    });
  }

  function renderResults() {
    closeDetail(panel);
    tableApi?.destroy();
    tableApi = null;
    const filtered = filteredRecords(store.get().records, sub.category, filters);
    const values = kpis(filtered);
    kpiHost.replaceChildren(kpiRow([
      { label: '전체', value: values.total, note: '현재 필터 기준' },
      { label: '진행', value: values.progress, note: '미완료 전체' },
      { label: '납기 임박', value: values.dueSoon, note: '3일 이내' },
      { label: '지연', value: values.late, note: values.late ? '즉시 확인 필요' : '없음', tone: values.late ? 'crit' : null },
    ]));
    viewHost.replaceChildren(renderView(viewMode, filtered, panel));
    reset.disabled = !FILTER_KEYS.some((key) => filters[key]);
    updateButtons();
  }

  function applyControls() {
    FILTER_KEYS.forEach((key) => { filters[key] = controls[key].value; });
    saveFilters(store, filters);
    renderResults();
  }

  syncOptions();
  saveFilters(store, filters);
  renderResults();

  const onInput = (event) => {
    if (event.target === search) applyControls();
  };
  const onChange = (event) => {
    if (event.target.matches('select')) applyControls();
  };
  const onClick = (event) => {
    const viewButton = event.target.closest('[data-view-mode]');
    if (viewButton && root.contains(viewButton)) {
      viewMode = viewButton.dataset.viewMode;
      renderResults();
    } else if (event.target === reset) {
      FILTER_KEYS.forEach((key) => {
        filters[key] = '';
        controls[key].value = '';
      });
      saveFilters(store, filters);
      renderResults();
      search.focus();
    }
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closeDetail(panel);
    }
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  cleanupRootEvents = () => {
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
  };
  unsub = store.subscribe('records', () => {
    syncOptions();
    saveFilters(store, filters);
    renderResults();
  });
}

export default {
  id: 'development',
  title: 'DEVELOPMENT',
  crumb: ['FABRIC R&D', 'DEVELOPMENT'],
  mount(root, { store, route }) {
    teardown();
    activeRoot = root;
    root.classList.add('development');
    build(root, store, route || {});
  },
  unmount() {
    activeRoot?.classList.remove('development');
    teardown();
  },
};
