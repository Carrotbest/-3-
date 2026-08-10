/* study.js — STUDY 과제 및 자료 라이브러리 조회 */

import { el } from '../core/dom.js';
import { fmtDate, fmtDateFull, toDate } from '../core/format.js';
import { MEMBERS } from '../data/schema.js';
import { createTable } from '../ui/table.js';
import { createChart } from '../ui/chart.js';
import { viewHead, badge, button, card, emptyState } from '../ui/widgets.js';

const CATEGORIES = ['품질사고', '공정 개념', '환경', '특정분야'];
const STATE_TONES = { 완료: 'ok', 진행: 'warn', 계획: 'neutral', 미진행: 'crit' };
const TEAM_MEMBERS = MEMBERS.filter((member) => member.role === '팀원');

const STYLE_TEXT = `
.study { display: grid; gap: var(--sp-6); }
.study > .view-head { margin-bottom: 0; }
.study__nav { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.study__nav-btn.is-active { border-color: var(--c-brand); background: var(--c-brand); color: var(--c-on-brand); }
.study__section { display: grid; gap: var(--sp-3); min-width: 0; }
.study__section-head { display: flex; align-items: end; justify-content: space-between; gap: var(--sp-3); }
.study__section-title { font-size: var(--fs-h1); }
.study__section-note { color: var(--c-muted); font-size: var(--fs-xs); }
.study-matrix { overflow-x: auto; border: 1px solid var(--c-line); border-radius: var(--r-lg); background: var(--c-paper); box-shadow: var(--shadow-1); }
.study-matrix__row { display: grid; grid-template-columns: calc(var(--sp-12) * 2) repeat(3, minmax(calc(var(--sp-12) * 3), 1fr)); min-width: calc(var(--sp-12) * 11); border-top: 1px solid var(--c-line); }
.study-matrix__row:first-child { border-top: 0; }
.study-matrix__head { padding: var(--sp-3); background: var(--c-paper-2); color: var(--c-muted); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.study-matrix__owner { width: 100%; padding: 0; border: 0; background: transparent; color: var(--c-brand-ink); font: inherit; font-weight: var(--fw-bold); text-align: left; cursor: pointer; }
.study-matrix__owner:hover, .study-matrix__owner:focus-visible { color: var(--c-brand); }
.study-matrix__week { padding: var(--sp-4); color: var(--c-ink-2); font-weight: var(--fw-bold); }
.study-matrix__cell { display: grid; align-content: start; gap: var(--sp-2); min-width: 0; padding: var(--sp-4); border-left: 1px solid var(--c-line); }
.study-matrix__topic { overflow-wrap: anywhere; }
.study-matrix__empty { color: var(--c-faint); }
.study__split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
.study__chart-host { min-width: 0; }
.study-missed { display: grid; gap: var(--sp-2); }
.study-missed__item { display: grid; gap: var(--sp-1); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.study-missed__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.study-missed__meta, .study-missed__reason { color: var(--c-muted); font-size: var(--fs-xs); }
.study-library__toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: var(--sp-3); }
.study-library__field { display: grid; gap: var(--sp-1); min-width: calc(var(--sp-12) * 3); }
.study-library__field--search { flex: 1 1 calc(var(--sp-12) * 5); }
.study-library__field label { color: var(--c-muted); font-size: var(--fs-xs); }
.study-library__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(var(--sp-12) * 5), 1fr)); gap: var(--sp-4); }
.study-file__meta { display: grid; gap: var(--sp-1); color: var(--c-muted); font-size: var(--fs-xs); }
.study-file__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.study-file__example { border-style: dashed; }
.study-file__placeholder { color: var(--c-faint); }
.study-audit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.study-audit__item { display: grid; gap: var(--sp-1); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.study-audit__value { font-size: var(--fs-h1); font-weight: var(--fw-bold); }
.study-audit__rule { color: var(--c-muted); font-family: var(--font-mono); font-size: var(--fs-xs); }
.study-detail { position: fixed; z-index: 30; inset: 0 0 0 auto; width: min(calc(var(--sp-12) * 12), 92vw); overflow-y: auto; padding: var(--sp-6); border-left: 1px solid var(--c-line); background: var(--c-paper); color: var(--c-ink); box-shadow: var(--shadow-2); }
.study-detail[hidden] { display: none; }
.study-detail__head { display: flex; align-items: start; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-4); }
.study-detail__title { font-size: var(--fs-h1); }
@media (max-width: 980px) { .study__split { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .study-audit { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .study-detail { scroll-behavior: auto; } }
`;

let activeRoot = null;
let cleanupRootEvents = null;
let unsubStudy = null;
let unsubStudyFiles = null;
let chartApi = null;
let detailTableApi = null;
let lastTrigger = null;

function teardown() {
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  unsubStudy?.();
  unsubStudy = null;
  unsubStudyFiles?.();
  unsubStudyFiles = null;
  chartApi?.destroy();
  chartApi = null;
  detailTableApi?.destroy();
  detailTableApi = null;
  activeRoot = null;
  lastTrigger = null;
}

function recordsFrom(store) {
  const records = store.get().study;
  return Array.isArray(records) ? records : [];
}

function filesFrom(store) {
  const files = store.get().studyFiles;
  return Array.isArray(files) ? files : [];
}

function subActions(activeSub) {
  return el('div.study__nav', { 'aria-label': 'STUDY 화면 전환' }, [
    button('진행 현황', {
      variant: 'ghost',
      class: `study__nav-btn${activeSub === 'progress' ? ' is-active' : ''}`,
      'aria-pressed': String(activeSub === 'progress'),
      onClick: () => { globalThis.location.hash = '#/study/progress'; },
    }),
    button('자료 라이브러리', {
      variant: 'ghost',
      class: `study__nav-btn${activeSub === 'library' ? ' is-active' : ''}`,
      'aria-pressed': String(activeSub === 'library'),
      onClick: () => { globalThis.location.hash = '#/study/library'; },
    }),
  ]);
}

function heading(activeSub) {
  return viewHead({
    eyebrow: 'Technical Services',
    title: 'STUDY 과제',
    subtitle: '팀원별 주간 과제의 주제·마감·완료 상태를 한 곳에서 확인합니다.',
    actions: subActions(activeSub),
  });
}

function localDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function thisThursday(today = new Date()) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset + 3);
  return date;
}

function dayDifference(target, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86400000);
}

function deadlineAlert(records) {
  const thursday = thisThursday();
  const deadlineKey = localDateKey(thursday);
  const missing = records.filter((record) => {
    const due = toDate(record.dueDate);
    return due && localDateKey(due) === deadlineKey && ['계획', '미진행'].includes(record.state);
  });
  if (!missing.length) return null;

  const days = dayDifference(thursday);
  const timing = days > 0 ? `${days}일 남음` : days === 0 ? '오늘 마감' : `${Math.abs(days)}일 지남`;
  return el('div.alert.alert--warn', { role: 'status' },
    el('p.alert__text', {
      text: `이번 주 목요일(${fmtDate(thursday)}) 마감까지 ${timing} · 미제출 ${missing.length}건`,
    }));
}

function groupedByWeek(records) {
  const weeks = [...new Set(records.map((record) => Number(record.week)).filter(Number.isFinite))];
  return weeks.sort((a, b) => b - a);
}

function matrixCell(record) {
  if (!record) return el('div.study-matrix__cell', null, el('span.study-matrix__empty', { text: '—' }));
  return el('div.study-matrix__cell', null, [
    el('p.study-matrix__topic', { text: record.topic || '—' }),
    badge(record.state || '—', STATE_TONES[record.state] || 'neutral'),
  ]);
}

function renderMatrix(records, panel) {
  const weeks = groupedByWeek(records);
  const header = el('div.study-matrix__row', null, [
    el('div.study-matrix__head', { text: '주차' }),
    ...TEAM_MEMBERS.map((member) => el('div.study-matrix__head',
      button(member.name, {
        variant: 'ghost',
        class: 'study-matrix__owner',
        'data-owner': member.name,
        'aria-label': `${member.name} 개인 과제 상세 보기`,
      }))),
  ]);

  const rows = weeks.map((week) => el('div.study-matrix__row', null, [
    el('div.study-matrix__week', { text: `${week}주차` }),
    ...TEAM_MEMBERS.map((member) => matrixCell(
      records.find((record) => Number(record.week) === week && record.owner === member.name),
    )),
  ]));

  const body = weeks.length
    ? el('div.study-matrix', null, [header, ...rows])
    : emptyState('표시할 STUDY 과제가 없습니다.');

  return el('section.study__section', null, [
    el('div.study__section-head', null, [
      el('h2.study__section-title', { text: '주차별 매트릭스' }),
      el('p.study__section-note', { text: '팀원 이름을 누르면 개인 상세를 확인할 수 있습니다.' }),
    ]),
    body,
    panel,
  ]);
}

function renderCategoryChart(records) {
  const host = el('div.study__chart-host');
  chartApi = createChart(host, {
    type: 'bar',
    horizontal: true,
    labels: CATEGORIES,
    datasets: [{
      label: '과제 수',
      data: CATEGORIES.map((category) => records.filter((record) => record.category === category).length),
    }],
  });
  return card({
    title: '분류별 누적',
    meta: '주제 쏠림 확인',
    body: host,
  });
}

function renderMissed(records) {
  const missed = records.filter((record) => record.state === '미진행');
  const body = missed.length
    ? el('div.study-missed', null, missed.map((record) => el('article.study-missed__item', null, [
      el('div.study-missed__head', null, [
        el('b', { text: record.topic || '—' }),
        badge('미진행', 'crit'),
      ]),
      el('p.study-missed__meta', {
        text: `${record.owner || '—'} · ${record.week ?? '—'}주차 · 마감 ${fmtDate(record.dueDate)}`,
      }),
      el('p.study-missed__reason', { text: '사유 미기재' }),
    ])))
    : emptyState('미진행 과제가 없습니다.');

  return card({
    title: '미진행 건과 사유',
    meta: `${missed.length}건`,
    body,
    foot: '사유는 개인 시트에 적어 주세요.',
  });
}

function decorateStateCells(tableElement) {
  tableElement.querySelectorAll('tbody tr[data-row-key]').forEach((row) => {
    const stateCell = row.children[3];
    const state = stateCell?.textContent;
    if (stateCell && state) stateCell.replaceChildren(badge(state, STATE_TONES[state] || 'neutral'));
  });
}

function closeDetail(panel) {
  if (panel.hidden) return;
  detailTableApi?.destroy();
  detailTableApi = null;
  panel.hidden = true;
  panel.replaceChildren();
  if (lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
}

function openDetail(panel, owner, records, trigger) {
  closeDetail(panel);
  lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  const ownerRecords = records
    .filter((record) => record.owner === owner)
    .sort((a, b) => Number(b.week) - Number(a.week));
  detailTableApi = createTable({
    columns: [
      { key: 'week', label: '주차', width: 72, type: 'number' },
      { key: 'topic', label: '주제', width: 220 },
      { key: 'category', label: '분류', width: 100 },
      { key: 'state', label: '상태', width: 80 },
      { key: 'dueDate', label: '마감일', width: 90, type: 'date' },
    ],
    rows: ownerRecords,
    rowKey: (record, index) => `${owner}-${record.week ?? index}-${index}`,
    sort: { key: 'week', dir: 'desc' },
    onRender: decorateStateCells,
    empty: '표시할 개인 과제가 없습니다.',
  });
  panel.replaceChildren(
    el('div.study-detail__head', null, [
      el('div', null, [
        el('h2.study-detail__title', { id: 'study-detail-title', text: `${owner} 과제 상세` }),
        el('p.study__section-note', { text: `전체 ${ownerRecords.length}건` }),
      ]),
      button('닫기', {
        variant: 'ghost',
        'aria-label': '개인 상세 패널 닫기',
        onClick: () => closeDetail(panel),
      }),
    ]),
    detailTableApi.el,
  );
  panel.hidden = false;
  panel.focus();
}

function renderProgress(root, store) {
  chartApi?.destroy();
  chartApi = null;
  detailTableApi?.destroy();
  detailTableApi = null;
  const records = recordsFrom(store);
  const panel = el('aside.study-detail', {
    hidden: true,
    tabindex: '-1',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'study-detail-title',
  });
  const alert = deadlineAlert(records);
  root.replaceChildren(...[
    el('style', { text: STYLE_TEXT }),
    heading('progress'),
    alert,
    renderMatrix(records, panel),
    el('div.study__split', null, [renderCategoryChart(records), renderMissed(records)]),
  ].filter(Boolean));

  const onClick = (event) => {
    const ownerButton = event.target.closest('[data-owner]');
    if (ownerButton && root.contains(ownerButton)) {
      openDetail(panel, ownerButton.dataset.owner, recordsFrom(store), ownerButton);
    }
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closeDetail(panel);
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  cleanupRootEvents = () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
  };
}

function fileValue(file, keys) {
  const key = keys.find((candidate) => file[candidate] !== undefined && file[candidate] !== null);
  return key ? file[key] : '';
}

function fileCard(file, example = false) {
  const title = example ? '자료 제목' : fileValue(file, ['title', 'topic', 'name', 'fileName']) || '제목 없음';
  const author = example ? '작성자' : fileValue(file, ['author', 'owner', 'createdBy']) || '—';
  const createdAt = example ? '—' : fmtDateFull(fileValue(file, ['createdAt', 'date', 'writtenAt']));
  const category = example ? '—' : fileValue(file, ['category', 'type']) || '—';
  const openUrl = example ? '' : fileValue(file, ['url', 'openUrl', 'webUrl']);
  const downloadUrl = example ? '' : fileValue(file, ['downloadUrl', 'download']);
  const actions = el('div.study-file__actions', null, [
    button('열기', {
      variant: 'ghost',
      disabled: !openUrl,
      onClick: () => { if (openUrl) globalThis.open(openUrl, '_blank', 'noopener,noreferrer'); },
    }),
    button('내려받기', {
      variant: 'ghost',
      disabled: !downloadUrl,
      onClick: () => {
        if (!downloadUrl) return;
        const link = el('a', { href: downloadUrl, download: '' });
        link.click();
      },
    }),
  ]);
  return card({
    title,
    meta: example ? '예시 구조' : category,
    className: `study-file${example ? ' study-file__example' : ''}`,
    body: el('div.study-file__meta', null, [
      el('span', { text: `작성자 · ${author}` }),
      el('span', { text: `작성일 · ${createdAt}` }),
      el('span', { text: `분류 · ${category}` }),
    ]),
    foot: actions,
  });
}

function auditCard() {
  return card({
    title: '점검 결과',
    body: el('div.study-audit', null, [
      el('div.study-audit__item', null, [
        el('span.study__section-note', { text: '파일명 규칙 위반' }),
        el('strong.study-audit__value', { text: '—' }),
      ]),
      el('div.study-audit__item', null, [
        el('span.study__section-note', { text: '취합 엑셀과 짝 불일치' }),
        el('strong.study-audit__value', { text: '—' }),
      ]),
    ]),
    foot: el('p.study-audit__rule', { text: '파일명 규칙: YYYY.MM.DD 주제 (작성자)' }),
  });
}

function renderLibrary(root, store) {
  const query = el('input', {
    type: 'search',
    placeholder: '주제 · 작성자 · 분류 · 연도 검색',
    'aria-label': '자료 검색',
  });
  const category = el('select', { 'aria-label': '자료 분류 필터' }, [
    el('option', { value: '', text: '전체 분류' }),
    ...CATEGORIES.map((value) => el('option', { value, text: value })),
  ]);
  const cardsHost = el('div.study-library__cards');
  const emptyHost = el('div');

  function filteredFiles() {
    const needle = query.value.trim().toLocaleLowerCase('ko');
    return filesFrom(store).filter((file) => {
      const fileCategory = String(fileValue(file, ['category', 'type']) || '');
      if (category.value && fileCategory !== category.value) return false;
      if (!needle) return true;
      return [
        fileValue(file, ['title', 'topic', 'name', 'fileName']),
        fileValue(file, ['author', 'owner', 'createdBy']),
        fileCategory,
        fileValue(file, ['createdAt', 'date', 'writtenAt']),
      ].some((value) => String(value || '').toLocaleLowerCase('ko').includes(needle));
    });
  }

  function renderCards() {
    const currentFiles = filteredFiles();
    cardsHost.replaceChildren(...(filesFrom(store).length
      ? currentFiles.map((file) => fileCard(file))
      : [fileCard({}, true)]));
    if (!filesFrom(store).length) {
      emptyHost.replaceChildren(emptyState('연결 예정 — 팀즈 「자료」 폴더의 파일 목록을 읽어 채웁니다.'));
    } else if (!currentFiles.length) {
      emptyHost.replaceChildren(emptyState('검색 조건에 맞는 자료가 없습니다.'));
    } else {
      emptyHost.replaceChildren();
    }
  }

  root.replaceChildren(
    el('style', { text: STYLE_TEXT }),
    heading('library'),
    el('section.study__section', null, [
      el('h2.study__section-title', { text: '자료 라이브러리' }),
      el('div.study-library__toolbar', null, [
        el('div.study-library__field.study-library__field--search', null, [
          el('label', { text: '검색' }),
          query,
        ]),
        el('div.study-library__field', null, [
          el('label', { text: '분류' }),
          category,
        ]),
      ]),
      cardsHost,
      emptyHost,
    ]),
    auditCard(),
  );
  renderCards();

  const onInput = () => renderCards();
  query.addEventListener('input', onInput);
  category.addEventListener('change', onInput);
  cleanupRootEvents = () => {
    query.removeEventListener('input', onInput);
    category.removeEventListener('change', onInput);
  };
}

function build(root, store, route) {
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  chartApi?.destroy();
  chartApi = null;
  detailTableApi?.destroy();
  detailTableApi = null;
  const sub = route?.sub === 'library' ? 'library' : 'progress';
  if (sub === 'library') renderLibrary(root, store);
  else renderProgress(root, store);
}

export default {
  id: 'study',
  title: 'STUDY',
  crumb: ['FABRIC R&D', 'STUDY'],
  mount(root, { store, route }) {
    teardown();
    activeRoot = root;
    root.classList.add('study');
    build(root, store, route || {});
    unsubStudy = store.subscribe('study', () => build(root, store, route || {}));
    unsubStudyFiles = store.subscribe('studyFiles', () => build(root, store, route || {}));
  },
  unmount() {
    activeRoot?.classList.remove('study');
    teardown();
  },
};
