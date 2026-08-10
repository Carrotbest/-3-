/* ts.js — Technical Services 접수·처리 기록 */

import { el } from '../core/dom.js';
import { fmtDate, fmtNum } from '../core/format.js';
import { MEMBERS } from '../data/schema.js';
import { createTable } from '../ui/table.js';
import { createChart } from '../ui/chart.js';
import { badge, button, card, kpiRow, progress, viewHead } from '../ui/widgets.js';

const STORAGE_KEY = 'fabric.ts';
const STATES = ['접수', '처리중', '완료'];
const TYPES = ['이색 클레임', '신축 회복 불량', 'Pilling 등급 문의', '수축률 초과', '봉제부 터짐', '발수 지속성'];
const UNLINKED_REASONS = ['개발 검토 종료', '발주 연계 대상 아님', '기술 문의 종결'];
const COMPLETE_ERROR = '완료로 저장하려면 발주량 또는 발주 미연결 사유 중 하나를 입력해야 합니다.';

const STYLE_TEXT = `
.ts { display: grid; gap: var(--sp-6); }
.ts > .view-head, .ts > .kpis { margin-bottom: 0; }
.ts__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(var(--sp-12) * 4), 1fr)); gap: var(--sp-4); }
.ts__progress-card { border-color: var(--c-brand-soft); background: var(--c-brand-tint); }
.ts__progress-value { margin-bottom: var(--sp-3); color: var(--c-brand-ink); font-size: var(--fs-display); font-weight: var(--fw-black); letter-spacing: var(--ls-tight); }
.ts__progress-note { margin-top: var(--sp-2); color: var(--c-ink-2); font-size: var(--fs-sm); }
.ts__tabs { margin-bottom: var(--sp-3); }
.ts__tab-count { margin-left: var(--sp-1); }
.ts__form { display: grid; gap: var(--sp-5); }
.ts__form-block { min-width: 0; padding: 0; border: 0; }
.ts__form-title { margin-bottom: var(--sp-3); color: var(--c-ink); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.ts__form-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); padding-top: var(--sp-4); border-top: 1px solid var(--c-line); }
.ts__attachment { padding: var(--sp-3); border: 1px dashed var(--c-line-strong); border-radius: var(--r-sm); color: var(--c-muted); font-size: var(--fs-sm); }
.ts__attachment-note { margin-top: var(--sp-1); font-size: var(--fs-xs); }
.field__error { color: var(--c-crit); font-size: var(--fs-xs); }
.field [aria-invalid="true"] { border-color: var(--c-crit); }
.ts__saved { color: var(--c-ok); font-size: var(--fs-sm); }
.ts__saved:empty { display: none; }
.detail { position: fixed; z-index: 30; inset: 0 0 0 auto; width: min(calc(var(--sp-12) * 10), 92vw); overflow-y: auto; padding: var(--sp-6); border-left: 1px solid var(--c-line); background: var(--c-paper); color: var(--c-ink); box-shadow: var(--shadow-2); }
.detail[hidden] { display: none; }
.detail__head { display: flex; align-items: start; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-6); }
.detail__title { font-size: var(--fs-h1); }
.detail__sub { margin-top: var(--sp-1); color: var(--c-muted); font-size: var(--fs-xs); }
.detail__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.detail__field { min-width: 0; }
.detail__label { color: var(--c-muted); font-size: var(--fs-xs); }
.detail__value { margin-top: var(--sp-1); overflow-wrap: anywhere; font-size: var(--fs-sm); }
`;

let unsub = null;
let tableApi = null;
let chartApi = null;
let cleanupRootEvents = null;
let activeRoot = null;
let lastTrigger = null;

function teardown() {
  unsub?.();
  unsub = null;
  tableApi?.destroy();
  tableApi = null;
  chartApi?.destroy();
  chartApi = null;
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  activeRoot = null;
  lastTrigger = null;
}

function readRecords(store) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 저장소를 사용할 수 없으면 현재 세션의 store 값을 사용한다.
  }
  return Array.isArray(store.get().ts) ? store.get().ts : [];
}

function persist(store, records) {
  store.set({ ts: records });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // store 반영은 유지하고, 저장소 접근 실패가 화면 동작을 막지 않게 한다.
  }
}

function option(value, text = value) {
  return el('option', { value, text });
}

function field(name, label, control, { full = false, error = false } = {}) {
  const id = `ts-${name}`;
  control.id = id;
  control.name = name;
  if (error) control.setAttribute('aria-describedby', `${id}-error`);
  const children = [el('label', { for: id, text: label }), control];
  if (error) children.push(el('p.field__error', { id: `${id}-error`, hidden: true }));
  return el(`div.field${full ? '.field--full' : ''}`, null, children);
}

function input(type, attrs = {}) {
  return el('input', { type, ...attrs });
}

function select(values, attrs = {}) {
  return el('select', attrs, values.map((value) => option(value)));
}

function formBlock(title, fields) {
  return el('fieldset.ts__form-block', null, [
    el('legend.ts__form-title', { text: title }),
    el('div.form-grid', null, fields),
  ]);
}

function counts(records) {
  return {
    total: records.length,
    received: records.filter((record) => record.state === '접수').length,
    progress: records.filter((record) => record.state === '처리중').length,
    complete: records.filter((record) => record.state === '완료').length,
    unlinked: records.filter((record) => record.state === '완료' && !record.orderQty).length,
  };
}

function typeStats(records) {
  const result = new Map();
  records.forEach((record) => {
    const type = String(record.type || record.subject || '미분류').trim() || '미분류';
    result.set(type, (result.get(type) || 0) + 1);
  });
  return [...result.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

function stateTone(state) {
  if (state === '완료') return 'ok';
  if (state === '처리중') return 'brand';
  return 'neutral';
}

/* createTable의 onRender 훅에서 불린다. 첫 렌더 때는 tableApi가 아직 없으므로
   테이블 엘리먼트를 인자로 받는다. */
function decorateStateCells(tableElement) {
  const table = tableElement || tableApi?.el;
  if (!table) return;
  table.querySelectorAll('tbody tr[data-row-key]').forEach((row) => {
    const cell = row.children[5];
    const state = cell?.textContent?.trim();
    if (cell && STATES.includes(state)) cell.replaceChildren(badge(state, stateTone(state)));
  });
}

function display(value, type = 'text') {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'date') return fmtDate(value);
  if (type === 'number') return fmtNum(value);
  return String(value);
}

function closeDetail(panel) {
  if (panel.hidden) return;
  panel.hidden = true;
  panel.replaceChildren();
  if (lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
}

function openDetail(panel, record, trigger) {
  lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  const definitions = [
    ['접수일', 'receivedAt', 'date'], ['요청처', 'from'], ['담당', 'owner'], ['상태', 'state'],
    ['접수 경로', 'channel'], ['요청처 구분', 'sourceType'], ['Style No.', 'styleNo'], ['FL No.', 'flNo'],
    ['조직', 'construction'], ['유형', 'type'], ['원인', 'cause'], ['시험 항목', 'testItem'],
    ['처리 결과', 'result'], ['완료일', 'completedAt', 'date'], ['발주량', 'orderQty', 'number'],
    ['발주 미연결 사유', 'unlinkedReason'],
  ];
  panel.replaceChildren(el('div.detail__head', null, [
    el('div', null, [
      el('h2.detail__title', { id: 'ts-detail-title', text: record.id || 'TS 상세' }),
      el('p.detail__sub', { text: record.subject || record.type || '접수 기록' }),
    ]),
    button('닫기', { variant: 'ghost', 'aria-label': 'TS 상세 패널 닫기', onClick: () => closeDetail(panel) }),
  ]));
  panel.append(el('div.detail__fields', null, definitions.map(([label, key, type]) =>
    el('div.detail__field', null, [
      el('p.detail__label', { text: label }),
      key === 'state'
        ? el('p.detail__value', null, badge(display(record[key]), stateTone(record[key])))
        : el('p.detail__value', { text: display(record[key], type) }),
    ]))));
  panel.append(el('section.detail__field', null, [
    el('p.detail__label', { text: '첨부' }),
    el('p.detail__value', { text: '등록된 파일 없음 · 첨부는 팀즈 폴더 링크로 대체 예정' }),
  ]));
  panel.hidden = false;
  panel.focus();
}

function nextId(records) {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `TS${year}-`;
  const max = records.reduce((highest, record) => {
    if (!String(record.id || '').startsWith(prefix)) return highest;
    const sequence = Number(String(record.id).slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildForm(store) {
  const receivedAt = input('date', { required: true, value: today() });
  const channel = select(['팀즈', '이메일', '유선', '대면']);
  const owner = el('select', { required: true }, MEMBERS.map((member) => option(member.name)));
  const sourceType = select(['사업부', '협력사', '바이어']);
  const from = input('text', { required: true });
  const styleNo = input('text');
  const flNo = input('text');
  const construction = input('text');
  const type = select(TYPES, { required: true });
  const cause = el('textarea', { rows: '3' });
  const testItem = input('text');
  const state = select(STATES, { required: true });
  const result = el('textarea', { rows: '3' });
  const completedAt = input('date');
  const orderQty = input('number', { min: '1', step: '1', inputmode: 'numeric' });
  const unlinkedReason = el('select', null, [option('', '선택'), ...UNLINKED_REASONS.map((value) => option(value))]);
  const saved = el('p.ts__saved', { role: 'status', 'aria-live': 'polite' });

  const form = el('form.ts__form', null, [
    formBlock('접수', [
      field('receivedAt', '접수일', receivedAt),
      field('channel', '접수 경로', channel),
      field('owner', '담당', owner),
    ]),
    formBlock('출처', [
      field('sourceType', '요청처 구분', sourceType),
      field('from', '요청처명', from),
    ]),
    formBlock('대상', [
      field('styleNo', 'Style No.', styleNo),
      field('flNo', 'FL No.', flNo),
      field('construction', '조직', construction),
    ]),
    formBlock('분석', [
      field('type', '유형', type),
      field('cause', '원인', cause, { full: true }),
      field('testItem', '시험 항목', testItem),
      el('div.field.field--full', null, [
        el('span', { text: '첨부' }),
        el('div.ts__attachment', null, [
          el('p', { text: '등록된 파일 없음' }),
          el('p.ts__attachment-note', { text: '첨부는 팀즈 폴더 링크로 대체 예정' }),
        ]),
      ]),
    ]),
    formBlock('결과', [
      field('state', '상태', state),
      field('result', '처리 결과', result, { full: true }),
      field('completedAt', '완료일', completedAt),
      field('orderQty', '발주량', orderQty, { error: true }),
      field('unlinkedReason', '발주 미연결 사유', unlinkedReason, { error: true }),
    ]),
    el('div.ts__form-actions', null, [saved, button('등록 초기화', { variant: 'ghost', type: 'reset' }), button('저장', { variant: 'primary', type: 'submit' })]),
  ]);

  const controls = { receivedAt, channel, owner, sourceType, from, styleNo, flNo, construction, type, cause, testItem, state, result, completedAt, orderQty, unlinkedReason };
  const errorControls = [orderQty, unlinkedReason];

  function clearError() {
    errorControls.forEach((control) => {
      control.removeAttribute('aria-invalid');
      const error = form.querySelector(`#${control.id}-error`);
      error.hidden = true;
      error.textContent = '';
    });
  }

  function showError() {
    errorControls.forEach((control) => {
      control.setAttribute('aria-invalid', 'true');
      const error = form.querySelector(`#${control.id}-error`);
      error.hidden = false;
      error.textContent = COMPLETE_ERROR;
    });
    orderQty.focus();
  }

  function syncExclusiveFields() {
    const hasQty = orderQty.value.trim() !== '';
    const hasReason = unlinkedReason.value !== '';
    orderQty.disabled = hasReason;
    unlinkedReason.disabled = hasQty;
    if (state.value !== '완료' || hasQty || hasReason) clearError();
  }

  form.addEventListener('input', syncExclusiveFields);
  form.addEventListener('change', syncExclusiveFields);
  form.addEventListener('reset', () => {
    queueMicrotask(() => {
      receivedAt.value = today();
      saved.textContent = '';
      clearError();
      syncExclusiveFields();
    });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saved.textContent = '';
    const qtyValue = orderQty.value.trim();
    if (state.value === '완료' && !qtyValue && !unlinkedReason.value) {
      showError();
      return;
    }
    clearError();
    if (!form.reportValidity()) return;
    const current = Array.isArray(store.get().ts) ? store.get().ts : [];
    const record = {
      id: nextId(current),
      receivedAt: receivedAt.value,
      subject: type.value,
      from: from.value.trim(),
      owner: owner.value,
      state: state.value,
      orderQty: qtyValue ? Number(qtyValue) : null,
      unlinkedReason: unlinkedReason.value || null,
      channel: channel.value,
      sourceType: sourceType.value,
      styleNo: styleNo.value.trim(),
      flNo: flNo.value.trim(),
      construction: construction.value.trim(),
      type: type.value,
      cause: cause.value.trim(),
      testItem: testItem.value.trim(),
      result: result.value.trim(),
      completedAt: completedAt.value || null,
    };
    persist(store, [record, ...current]);
    form.reset();
    queueMicrotask(() => { saved.textContent = `${record.id} 저장 완료`; });
  });

  return { form, firstControl: receivedAt };
}

function build(root, store) {
  let activeFilter = '전체';
  const style = el('style', { text: STYLE_TEXT });
  const detail = el('aside.detail', {
    hidden: true,
    tabindex: '-1',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'ts-detail-title',
  });
  const formApi = buildForm(store);
  const formCard = card({ title: '신규 TS 등록', body: formApi.form, className: 'ts__form-card' });
  const newButton = button('+ 신규 접수', {
    variant: 'primary',
    onClick: () => {
      formCard.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      formApi.firstControl.focus();
    },
  });
  const head = viewHead({
    eyebrow: 'Technical Services',
    title: 'TS 관리',
    subtitle: 'Trouble Shooting 접수부터 원인 분석·조치 결과·발주 기여까지 한 흐름으로 기록합니다.',
    actions: [newButton],
  });
  const kpiHost = el('div');
  const progressHost = el('div');
  const chartHost = el('div');
  const tabs = el('div.tabs.ts__tabs', { role: 'tablist', 'aria-label': 'TS 상태 필터' });
  const tableHost = el('section', { 'aria-label': '접수 건 목록' }, [
    el('h2.card__title', { text: '접수 건 목록' }),
    tabs,
  ]);
  root.replaceChildren(style, head, kpiHost, el('div.ts__summary', null, [progressHost, chartHost]), tableHost, formCard, detail);

  const columns = [
    { key: 'id', label: 'TS#', width: 100, mono: true },
    { key: 'receivedAt', label: '접수일', width: 90, type: 'date' },
    { key: 'subject', label: 'Subject', width: 160 },
    { key: 'from', label: '요청처', width: 130 },
    { key: 'owner', label: '담당', width: 80 },
    { key: 'state', label: '상태', width: 80 },
    { key: 'orderQty', label: '발주량', width: 100, type: 'number', align: 'right' },
  ];
  tableApi = createTable({
    columns,
    rows: store.get().ts || [],
    sort: { key: 'receivedAt', dir: 'desc' },
    rowKey: (record) => record.id,
    onRowClick: (record) => openDetail(detail, record, document.activeElement),
    onRender: decorateStateCells,
    empty: '등록된 TS 접수 건이 없습니다.',
  });
  tableHost.append(tableApi.el);

  function applyFilter() {
    tableApi.setFilter(activeFilter === '전체' ? null : (record) => record.state === activeFilter);
    tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const active = tab.dataset.state === activeFilter;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    decorateStateCells();
  }

  function render(records) {
    const values = counts(records);
    kpiHost.replaceChildren(kpiRow([
      { label: '접수', value: values.received, note: '신규 확인 대기' },
      { label: '처리중', value: values.progress, note: '분석·시험 진행' },
      { label: '완료', value: values.complete, note: '처리 종결' },
      { label: '발주 미연결', value: values.unlinked, note: values.unlinked ? '사유 확인 필요' : '미연결 없음', tone: values.unlinked ? 'crit' : null },
    ]));
    const entered = records.filter((record) => record.state === '완료' && record.orderQty).length;
    const pct = values.complete ? (entered / values.complete) * 100 : 0;
    progressHost.replaceChildren(card({
      title: '발주량 기입률',
      className: 'ts__progress-card',
      body: [
        el('p.ts__progress-value', { text: `${Math.round(pct)}%` }),
        progress(pct, values.unlinked ? 'crit' : 'brand'),
        el('p.ts__progress-note', { text: `완료 ${values.complete}건 중 ${entered}건 기입` }),
      ],
    }));
    const stats = typeStats(records);
    if (!chartApi) {
      const body = el('div');
      chartHost.replaceChildren(card({ title: '유형별 통계', body }));
      chartApi = createChart(body, {
        type: 'bar', horizontal: true,
        labels: stats.map(([label]) => label),
        datasets: [{ label: '건수', data: stats.map(([, count]) => count) }],
      });
    } else {
      chartApi.update({
        labels: stats.map(([label]) => label),
        datasets: [{ label: '건수', data: stats.map(([, count]) => count) }],
      });
    }
    tabs.replaceChildren(...['전체', ...STATES].map((state) => {
      const count = state === '전체' ? values.total : records.filter((record) => record.state === state).length;
      return el(`button.tab${state === activeFilter ? '.is-active' : ''}`, {
        type: 'button', role: 'tab', dataset: { state },
        'aria-selected': String(state === activeFilter),
        tabindex: state === activeFilter ? '0' : '-1',
      }, [state, el('span.ts__tab-count', { text: String(count) })]);
    }));
    tableApi.update(records);
    applyFilter();
  }

  const onClick = (event) => {
    const tab = event.target.closest('[role="tab"][data-state]');
    if (!tab || !root.contains(tab)) return;
    activeFilter = tab.dataset.state;
    applyFilter();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && !detail.hidden) {
      event.preventDefault();
      closeDetail(detail);
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  cleanupRootEvents = () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
  };
  render(store.get().ts || []);
  unsub = store.subscribe('ts', (records) => {
    closeDetail(detail);
    render(Array.isArray(records) ? records : []);
  });
}

export default {
  id: 'ts',
  title: 'TS 관리',
  crumb: ['FABRIC R&D', 'TS 관리'],
  mount(root, { store }) {
    teardown();
    activeRoot = root;
    root.classList.add('ts');
    const records = readRecords(store);
    if (records !== store.get().ts) store.set({ ts: records });
    build(root, store);
  },
  unmount() {
    activeRoot?.classList.remove('ts');
    teardown();
  },
};
