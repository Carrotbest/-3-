/* table.js — 정렬·필터·더 보기 데이터테이블 */

import { el, on } from '../core/dom.js';
import { fmtDate, fmtNum, toDate } from '../core/format.js';

const isBlank = (value) => value === null || value === undefined || value === '';

function isNumericColumn(column) {
  return column.type === 'number' || column.align === 'right' || Boolean(column.unit);
}

function displayValue(value, column) {
  if (isBlank(value)) return '—';
  if (column.type === 'date') return fmtDate(value);
  if (isNumericColumn(column)) return fmtNum(value, column.unit || '');
  return `${value}${column.unit || ''}`;
}

function compareValues(a, b, column, direction) {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0;
    return aBlank ? 1 : -1;
  }

  let result;
  if (column.type === 'date') {
    const aDate = toDate(a);
    const bDate = toDate(b);
    if (!aDate || !bDate) {
      if (!aDate && !bDate) result = String(a).localeCompare(String(b), 'ko');
      else return !aDate ? 1 : -1;
    } else {
      result = aDate.getTime() - bDate.getTime();
    }
  } else if (isNumericColumn(column)) {
    const aNumber = Number(a);
    const bNumber = Number(b);
    const aInvalid = Number.isNaN(aNumber);
    const bInvalid = Number.isNaN(bNumber);
    if (aInvalid || bInvalid) {
      if (aInvalid && bInvalid) result = String(a).localeCompare(String(b), 'ko');
      else return aInvalid ? 1 : -1;
    } else {
      result = aNumber - bNumber;
    }
  } else {
    result = String(a).localeCompare(String(b), 'ko');
  }

  return direction === 'desc' ? -result : result;
}

export function createTable({
  columns,
  rows,
  sticky = true,
  sort = null,
  rowKey = (row, index) => row.styleNo ?? index,
  onRowClick = null,
  onRender = null,
  empty = '표시할 항목이 없습니다.',
  pageSize = 50,
}) {
  let sourceRows = Array.isArray(rows) ? rows : [];
  let filter = null;
  let currentSort = sort && columns.some((column) => column.key === sort.key)
    ? { key: sort.key, dir: sort.dir === 'desc' ? 'desc' : 'asc' }
    : null;
  let visibleCount = Math.max(1, Number(pageSize) || 50);
  let destroyed = false;
  let bodyRows = new WeakMap();

  const headerCells = new Map();
  const headRow = el('tr');
  const colgroup = el('colgroup', null, columns.map((column) =>
    el('col', column.width ? { width: column.width } : null)));

  columns.forEach((column, index) => {
    const fixed = sticky && (index === 0 || column.sticky);
    const th = el(`th${fixed ? '.is-sticky' : ''}`, {
      scope: 'col',
      tabindex: '0',
      'data-sort-key': column.key,
      'aria-sort': 'none',
      text: column.label,
    });
    headerCells.set(column.key, th);
    headRow.append(th);
  });

  const thead = el('thead', null, headRow);
  let tbody = el('tbody');
  const table = el('table.grid', null, [colgroup, thead, tbody]);
  const tableWrap = el('div.table-wrap', null, table);
  const moreButton = el('button.btn', { type: 'button' });
  const moreWrap = el('div.table-more', null, moreButton);
  const root = el('article.card.table-card', null, [tableWrap, moreWrap]);

  function updateHeaders() {
    headerCells.forEach((th, key) => {
      const active = currentSort?.key === key;
      const direction = active ? currentSort.dir : null;
      th.setAttribute('aria-sort', direction === 'asc'
        ? 'ascending'
        : direction === 'desc' ? 'descending' : 'none');
      const column = columns.find((item) => item.key === key);
      th.textContent = `${column.label}${direction === 'asc' ? ' ▲' : direction === 'desc' ? ' ▼' : ''}`;
    });
  }

  function preparedRows() {
    const filtered = filter ? sourceRows.filter(filter) : sourceRows.slice();
    if (!currentSort) return filtered;
    const column = columns.find((item) => item.key === currentSort.key);
    if (!column) return filtered;

    return filtered
      .map((row, index) => ({ row, index }))
      .sort((a, b) => compareValues(
        a.row[column.key], b.row[column.key], column, currentSort.dir,
      ) || a.index - b.index)
      .map(({ row }) => row);
  }

  function renderBody() {
    if (destroyed) return;
    const prepared = preparedRows();
    const shown = prepared.slice(0, visibleCount);
    const nextBody = el('tbody');
    const nextBodyRows = new WeakMap();

    if (!shown.length) {
      nextBody.append(el('tr', null,
        el('td.table-empty', { colspan: columns.length, text: empty })));
    } else {
      shown.forEach((row, index) => {
        const attrs = { dataset: { rowKey: String(rowKey(row, index)) } };
        if (onRowClick) {
          attrs.tabindex = '0';
          attrs.role = 'button';
        }
        const tr = el('tr', attrs, columns.map((column, columnIndex) => {
          const classes = [];
          if (isNumericColumn(column)) classes.push('is-num');
          if (column.mono) classes.push('is-mono');
          if (sticky && (columnIndex === 0 || column.sticky)) classes.push('is-sticky');
          return el(`td${classes.map((name) => `.${name}`).join('')}`, {
            text: displayValue(row[column.key], column),
          });
        }));
        nextBodyRows.set(tr, row);
        nextBody.append(tr);
      });
    }

    tbody.replaceWith(nextBody);
    tbody = nextBody;
    bodyRows = nextBodyRows;

    const remaining = Math.max(0, prepared.length - shown.length);
    moreWrap.hidden = remaining === 0;
    moreButton.textContent = `더 보기 (${remaining}건 남음)`;
    updateHeaders();

    // 뷰가 셀을 꾸밀 기회. 정렬·필터·더보기 이후에도 항상 다시 불린다.
    // 뷰에서 MutationObserver로 tbody를 감시하지 마라 — 콜백이 DOM을 고치면 무한 루프가 된다.
    if (typeof onRender === 'function') {
      try { onRender(root, shown); } catch (e) { console.error('[table] onRender 실패', e); }
    }
  }

  function toggleSort(key) {
    const direction = currentSort?.key === key && currentSort.dir === 'asc' ? 'desc' : 'asc';
    currentSort = { key, dir: direction };
    visibleCount = Math.max(1, Number(pageSize) || 50);
    renderBody();
  }

  const removeHeaderClick = on(thead, 'click', 'th[data-sort-key]', (_event, th) => {
    toggleSort(th.dataset.sortKey);
  });
  const removeHeaderKey = on(thead, 'keydown', 'th[data-sort-key]', (event, th) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    toggleSort(th.dataset.sortKey);
  });
  const removeRowClick = on(tbody.parentElement, 'click', 'tbody tr[data-row-key]', (_event, tr) => {
    if (onRowClick) onRowClick(bodyRows.get(tr));
  });
  const removeRowKey = on(tbody.parentElement, 'keydown', 'tbody tr[data-row-key]', (event, tr) => {
    if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onRowClick(bodyRows.get(tr));
  });
  const removeMoreClick = on(moreWrap, 'click', 'button', () => {
    visibleCount += Math.max(1, Number(pageSize) || 50);
    renderBody();
  });

  renderBody();

  return {
    el: root,
    update(nextRows) {
      sourceRows = Array.isArray(nextRows) ? nextRows : [];
      renderBody();
    },
    setFilter(fn) {
      filter = typeof fn === 'function' ? fn : null;
      visibleCount = Math.max(1, Number(pageSize) || 50);
      renderBody();
    },
    setSort(key, dir = 'asc') {
      if (!columns.some((column) => column.key === key)) return;
      currentSort = { key, dir: dir === 'desc' ? 'desc' : 'asc' };
      visibleCount = Math.max(1, Number(pageSize) || 50);
      renderBody();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeHeaderClick();
      removeHeaderKey();
      removeRowClick();
      removeRowKey();
      removeMoreClick();
    },
  };
}
