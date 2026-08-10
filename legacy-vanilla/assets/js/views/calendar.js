/* calendar.js — CALENDAR 일정 조회 */

import { el } from '../core/dom.js';
import { fmtDateFull, toDate } from '../core/format.js';
import { MEMBERS } from '../data/schema.js';
import { viewHead, card, badge, button, emptyState } from '../ui/widgets.js';

const TYPE = {
  meeting: { label: '미팅', tone: 'ok' },
  due: { label: '납기', tone: 'warn' },
  external: { label: '외부', tone: 'brand' },
  leave: { label: '휴가', tone: 'neutral' },
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const STYLE_TEXT = `
.calendar { display: grid; gap: var(--sp-6); }
.calendar > .view-head { margin-bottom: 0; }
.calendar__period { display: inline-flex; align-items: center; padding-inline: var(--sp-2); color: var(--c-ink); font-weight: var(--fw-bold); white-space: nowrap; }
.calendar__controls { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--sp-4); }
.calendar__filter { display: grid; gap: var(--sp-1); min-width: calc(var(--sp-12) * 3); }
.calendar__filter-label { color: var(--c-muted); font-size: var(--fs-xs); font-weight: var(--fw-medium); }
.calendar__filter-select { min-width: 0; padding: var(--sp-2); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper); color: var(--c-ink); font: inherit; }
.calendar__legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.calendar__layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(calc(var(--sp-12) * 5), 1fr); gap: var(--sp-4); align-items: start; }
.calendar__board { min-width: 0; overflow-x: auto; border: 1px solid var(--c-line); border-radius: var(--r-lg); background: var(--c-paper); box-shadow: var(--shadow-1); }
.calendar__grid { display: grid; grid-template-columns: repeat(7, minmax(calc(var(--sp-12) * 2), 1fr)); min-width: calc(var(--sp-12) * 14); }
.calendar__weekday { padding: var(--sp-2); border-bottom: 1px solid var(--c-line); background: var(--c-paper-2); color: var(--c-muted); font-size: var(--fs-xs); font-weight: var(--fw-bold); text-align: center; }
.calendar__cell { min-width: 0; border-right: 1px solid var(--c-line); border-bottom: 1px solid var(--c-line); }
.calendar__cell:nth-child(7n) { border-right: 0; }
.calendar__day { display: grid; align-content: start; gap: var(--sp-2); width: 100%; min-height: calc(var(--sp-12) * 2); padding: var(--sp-2); border: 0; background: var(--c-paper); color: var(--c-ink); font: inherit; text-align: left; cursor: pointer; transition: background-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
.calendar__day:hover, .calendar__day:focus-visible { background: var(--c-brand-tint); }
.calendar__day.is-other-month { background: var(--c-paper-2); color: var(--c-faint); }
.calendar__day.is-other-month .calendar__events { opacity: .7; }
.calendar__day.is-today { box-shadow: inset 0 0 0 2px var(--c-brand); background: var(--c-brand-tint); }
.calendar__day-number { display: inline-grid; place-items: center; justify-self: start; min-width: var(--sp-6); min-height: var(--sp-6); border-radius: var(--r-full); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.calendar__day.is-today .calendar__day-number { background: var(--c-brand); color: var(--c-on-brand); }
.calendar__events { display: grid; gap: var(--sp-1); min-width: 0; }
.calendar__event { display: block; overflow: hidden; padding: var(--sp-1) var(--sp-2); border-left: var(--sp-1) solid var(--c-neutral); border-radius: var(--r-sm); background: var(--c-neutral-tint); color: var(--c-neutral); font-size: var(--fs-2xs); font-weight: var(--fw-medium); text-overflow: ellipsis; white-space: nowrap; }
.calendar__event--meeting { border-left-color: var(--c-ok); background: var(--c-ok-tint); color: var(--c-ok); }
.calendar__event--due { border-left-color: var(--c-warn); background: var(--c-warn-tint); color: var(--c-warn); }
.calendar__event--external { border-left-color: var(--c-brand); background: var(--c-brand-tint); color: var(--c-brand-ink); }
.calendar__event-more { color: var(--c-muted); font-size: var(--fs-2xs); font-weight: var(--fw-bold); }
.calendar__grid--week .calendar__day { min-height: calc(var(--sp-12) * 6); }
.calendar__pending .empty { padding-block: var(--sp-5); }
.calendar__flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); margin: 0; padding: 0; list-style: none; }
.calendar__flow-step { display: grid; justify-items: center; gap: var(--sp-1); padding: var(--sp-2); border-radius: var(--r-sm); background: var(--c-paper-2); color: var(--c-muted); font-size: var(--fs-xs); text-align: center; }
.calendar__flow-number { display: grid; place-items: center; width: var(--sp-6); height: var(--sp-6); border-radius: var(--r-full); background: var(--c-neutral-tint); color: var(--c-neutral); font-weight: var(--fw-bold); }
.calendar-panel { position: fixed; z-index: 30; inset: 0 0 0 auto; width: min(calc(var(--sp-12) * 9), 92vw); overflow-y: auto; padding: var(--sp-6); border-left: 1px solid var(--c-line); background: var(--c-paper); color: var(--c-ink); box-shadow: var(--shadow-2); }
.calendar-panel[hidden] { display: none; }
.calendar-panel__head { display: flex; align-items: start; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-6); }
.calendar-panel__title { font-size: var(--fs-h1); }
.calendar-panel__sub { margin-top: var(--sp-1); color: var(--c-muted); font-size: var(--fs-xs); }
.calendar-panel__list { display: grid; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }
.calendar-panel__item { display: grid; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.calendar-panel__item-head { display: flex; align-items: center; gap: var(--sp-2); }
.calendar-panel__item-title { overflow-wrap: anywhere; }
.calendar-panel__meta { color: var(--c-muted); font-size: var(--fs-xs); }
@media (max-width: 980px) { .calendar__layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .calendar__controls { align-items: stretch; } .calendar__filter { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .calendar__day { transition: none; } }
`;

let activeRoot = null;
let cleanupRootEvents = null;
let unsubRecords = null;
let unsubEvents = null;
let lastTrigger = null;

function teardown() {
  unsubRecords?.();
  unsubRecords = null;
  unsubEvents?.();
  unsubEvents = null;
  cleanupRootEvents?.();
  cleanupRootEvents = null;
  activeRoot = null;
  lastTrigger = null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(value) {
  const date = value instanceof Date ? value : toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayDate(date, offset) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function startOfWeek(date) {
  return dayDate(date, -date.getDay());
}

function monthDays(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const count = Math.ceil((leading + lastDay) / 7) * 7;
  return Array.from({ length: count }, (_, index) => dayDate(first, index - leading));
}

function weekDays(cursor) {
  const first = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => dayDate(first, index));
}

function combinedEvents(state) {
  const registered = (state.events || []).map((event) => ({
    ...event,
    date: dateKey(event.date),
  })).filter((event) => event.date && TYPE[event.type]);
  const deadlines = (state.records || []).map((record) => {
    const due = toDate(record.dueDate);
    if (!due) return null;
    return {
      date: dateKey(due),
      type: 'due',
      title: `${record.styleNo || 'Style No. 미지정'} 납기`,
      owner: record.owner || '',
    };
  }).filter(Boolean);
  return [...registered, ...deadlines].sort((a, b) => (
    a.date.localeCompare(b.date)
    || String(a.time || '').localeCompare(String(b.time || ''))
    || String(a.title || '').localeCompare(String(b.title || ''), 'ko')
  ));
}

function periodText(mode, cursor) {
  if (mode === 'month') return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const first = startOfWeek(cursor);
  const last = dayDate(first, 6);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월 ${first.getDate()}일–${last.getFullYear()}년 ${last.getMonth() + 1}월 ${last.getDate()}일`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월 ${first.getDate()}일–${last.getMonth() + 1}월 ${last.getDate()}일`;
  }
  return `${first.getFullYear()}년 ${first.getMonth() + 1}월 ${first.getDate()}–${last.getDate()}일`;
}

function eventText(event) {
  const type = TYPE[event.type] || TYPE.leave;
  return `${type.label} · ${event.time ? `${event.time} ` : ''}${event.title || '제목 없음'}`;
}

function closePanel(panel, restoreFocus = true) {
  if (panel.hidden) return;
  panel.hidden = true;
  panel.replaceChildren();
  if (restoreFocus && lastTrigger?.isConnected) lastTrigger.focus();
  lastTrigger = null;
}

function openPanel(panel, date, events, trigger) {
  lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  panel.replaceChildren(el('div.calendar-panel__head', null, [
    el('div', null, [
      el('h2.calendar-panel__title', { id: 'calendar-panel-title', text: fmtDateFull(date) }),
      el('p.calendar-panel__sub', { text: `${WEEKDAYS[date.getDay()]}요일 일정 ${events.length}건` }),
    ]),
    button('닫기', {
      variant: 'ghost',
      'aria-label': '일정 패널 닫기',
      onClick: () => closePanel(panel),
    }),
  ]));
  if (events.length) {
    panel.append(el('ul.calendar-panel__list', null, events.map((event) => {
      const type = TYPE[event.type] || TYPE.leave;
      const meta = [event.time || '종일', event.place, event.owner && `담당 ${event.owner}`].filter(Boolean).join(' · ');
      return el('li.calendar-panel__item', null, [
        el('div.calendar-panel__item-head', null, [
          badge(type.label, type.tone),
          el('b.calendar-panel__item-title', { text: event.title || '제목 없음' }),
        ]),
        el('p.calendar-panel__meta', { text: meta }),
      ]);
    })));
  } else {
    panel.append(emptyState('이 날짜에는 등록된 일정이 없습니다.'));
  }
  panel.hidden = false;
  panel.focus();
}

function setRovingFocus(grid, targetIndex) {
  const buttons = Array.from(grid.querySelectorAll('[data-calendar-day]'));
  if (!buttons.length) return;
  const index = Math.max(0, Math.min(buttons.length - 1, targetIndex));
  buttons.forEach((dayButton, buttonIndex) => {
    dayButton.tabIndex = buttonIndex === index ? 0 : -1;
  });
  buttons[index].focus();
}

function dayButton(date, events, options) {
  const { currentMonth, todayKey, tabKey, mode, panel, onSelect } = options;
  const key = dateKey(date);
  const visibleEvents = mode === 'month' ? events.slice(0, 3) : events;
  const suffix = events.length ? `, 일정 ${events.length}건` : ', 일정 없음';
  const classes = [
    'calendar__day',
    mode === 'month' && date.getMonth() !== currentMonth ? 'is-other-month' : '',
    key === todayKey ? 'is-today' : '',
  ].filter(Boolean).join(' ');
  return el('button', {
    class: classes,
    type: 'button',
    tabindex: key === tabKey ? '0' : '-1',
    'data-calendar-day': key,
    'aria-label': `${fmtDateFull(date)} ${WEEKDAYS[date.getDay()]}요일${suffix}`,
    onclick(event) {
      onSelect(key);
      openPanel(panel, date, events, event.currentTarget);
    },
  }, [
    el('span.calendar__day-number', { text: String(date.getDate()), 'aria-hidden': 'true' }),
    el('span.calendar__events', { 'aria-hidden': 'true' }, [
      ...visibleEvents.map((calendarEvent) => el(`span.calendar__event.calendar__event--${calendarEvent.type}`, {
        text: eventText(calendarEvent),
        title: eventText(calendarEvent),
      })),
      mode === 'month' && events.length > 3
        ? el('span.calendar__event-more', { text: `+${events.length - 3}건` })
        : null,
    ]),
  ]);
}

function pendingCard() {
  return card({
    title: '메일에서 뽑아낸 일정',
    meta: badge('확인 대기', 'neutral'),
    className: 'calendar__pending',
    body: [
      emptyState('연결 예정 — 주간 미팅 요약 메일에서 일정을 뽑아 여기에 쌓입니다. 확인 후 반영됩니다.'),
      el('ol.calendar__flow', { 'aria-label': '메일 일정 반영 흐름' }, ['추출', '확인', '반영'].map((label, index) =>
        el('li.calendar__flow-step', null, [
          el('span.calendar__flow-number', { text: String(index + 1), 'aria-hidden': 'true' }),
          el('span', { text: label }),
        ]))),
    ],
  });
}

function build(root, store) {
  const today = new Date();
  const todayKey = dateKey(today);
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let selectedKey = todayKey;
  let viewMode = 'month';
  let owner = '';

  const panel = el('aside.calendar-panel', {
    hidden: true,
    tabindex: '-1',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'calendar-panel-title',
  });
  const period = el('span.calendar__period', { 'aria-live': 'polite' });
  const previous = button('‹', { variant: 'ghost', 'aria-label': '이전 달' });
  const next = button('›', { variant: 'ghost', 'aria-label': '다음 달' });
  const goToday = button('오늘', { variant: 'ghost' });
  const head = viewHead({
    eyebrow: 'Operations',
    title: '캘린더',
    subtitle: '미팅, 납기, 외부 일정을 한 흐름으로 확인합니다.',
    actions: [previous, period, next, goToday],
  });
  const monthTab = el('button.tab.is-active', {
    type: 'button', role: 'tab', id: 'calendar-tab-month',
    'aria-selected': 'true', 'aria-controls': 'calendar-board', text: '월 보기',
  });
  const weekTab = el('button.tab', {
    type: 'button', role: 'tab', id: 'calendar-tab-week',
    'aria-selected': 'false', 'aria-controls': 'calendar-board', text: '주 보기',
  });
  const tabs = el('div.tabs', { role: 'tablist', 'aria-label': '캘린더 보기 방식' }, [monthTab, weekTab]);
  const ownerSelect = el('select.calendar__filter-select', { id: 'calendar-owner' }, [
    el('option', { value: '', text: '전체 담당자' }),
    ...MEMBERS.map((member) => el('option', { value: member.name, text: `${member.name} · ${member.role}` })),
  ]);
  const controls = el('div.calendar__controls', null, [
    tabs,
    el('label.calendar__filter', { for: 'calendar-owner' }, [
      el('span.calendar__filter-label', { text: '담당자' }),
      ownerSelect,
    ]),
  ]);
  const legend = el('div.calendar__legend', { 'aria-label': '일정 유형 범례' }, Object.values(TYPE).map((type) =>
    badge(type.label, type.tone)));
  const board = el('div.calendar__board', {
    id: 'calendar-board', role: 'tabpanel', 'aria-labelledby': 'calendar-tab-month',
  });
  const layout = el('div.calendar__layout', null, [board, pendingCard()]);
  root.replaceChildren(el('style', { text: STYLE_TEXT }), head, controls, legend, layout, panel);

  function renderCalendar() {
    closePanel(panel, false);
    const allEvents = combinedEvents(store.get());
    const filtered = owner ? allEvents.filter((event) => event.owner === owner) : allEvents;
    const byDate = new Map();
    filtered.forEach((event) => {
      if (!byDate.has(event.date)) byDate.set(event.date, []);
      byDate.get(event.date).push(event);
    });
    const dates = viewMode === 'month' ? monthDays(cursor) : weekDays(cursor);
    const visibleKeys = new Set(dates.map(dateKey));
    const firstPreferred = dates.find((date) => viewMode === 'week' || date.getMonth() === cursor.getMonth()) || dates[0];
    const tabKey = visibleKeys.has(selectedKey)
      ? selectedKey
      : visibleKeys.has(todayKey) ? todayKey : dateKey(firstPreferred);
    const grid = el(`div.calendar__grid.calendar__grid--${viewMode}`, {
      role: 'grid',
      'aria-label': periodText(viewMode, cursor),
      'aria-rowcount': String(dates.length / 7 + 1),
      'aria-colcount': '7',
    }, [
      ...WEEKDAYS.map((weekday) => el('div.calendar__weekday', { role: 'columnheader', text: weekday })),
      ...dates.map((date) => el('div.calendar__cell', { role: 'gridcell' }, dayButton(date, byDate.get(dateKey(date)) || [], {
        currentMonth: cursor.getMonth(), todayKey, tabKey, mode: viewMode, panel,
        onSelect(key) { selectedKey = key; },
      }))),
    ]);
    board.replaceChildren(grid);
    period.textContent = periodText(viewMode, cursor);
    board.setAttribute('aria-labelledby', viewMode === 'month' ? 'calendar-tab-month' : 'calendar-tab-week');
    previous.setAttribute('aria-label', viewMode === 'month' ? '이전 달' : '이전 주');
    next.setAttribute('aria-label', viewMode === 'month' ? '다음 달' : '다음 주');
    monthTab.classList.toggle('is-active', viewMode === 'month');
    weekTab.classList.toggle('is-active', viewMode === 'week');
    monthTab.setAttribute('aria-selected', String(viewMode === 'month'));
    weekTab.setAttribute('aria-selected', String(viewMode === 'week'));
  }

  function movePeriod(direction) {
    cursor = viewMode === 'month'
      ? new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
      : dayDate(cursor, direction * 7);
    selectedKey = dateKey(cursor);
    renderCalendar();
  }

  previous.addEventListener('click', () => movePeriod(-1));
  next.addEventListener('click', () => movePeriod(1));
  goToday.addEventListener('click', () => {
    cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    selectedKey = todayKey;
    renderCalendar();
    board.querySelector(`[data-calendar-day="${todayKey}"]`)?.focus();
  });
  monthTab.addEventListener('click', () => {
    viewMode = 'month';
    renderCalendar();
  });
  weekTab.addEventListener('click', () => {
    viewMode = 'week';
    renderCalendar();
  });
  ownerSelect.addEventListener('change', () => {
    owner = ownerSelect.value;
    renderCalendar();
  });

  const onKeydown = (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closePanel(panel);
      return;
    }
    const day = event.target.closest('[data-calendar-day]');
    if (!day || !board.contains(day)) return;
    const grid = day.closest('.calendar__grid');
    const buttons = Array.from(grid.querySelectorAll('[data-calendar-day]'));
    const index = buttons.indexOf(day);
    const movement = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (movement === undefined) return;
    event.preventDefault();
    const targetIndex = Math.max(0, Math.min(buttons.length - 1, index + movement));
    selectedKey = buttons[targetIndex].dataset.calendarDay;
    setRovingFocus(grid, targetIndex);
  };
  root.addEventListener('keydown', onKeydown);
  cleanupRootEvents = () => root.removeEventListener('keydown', onKeydown);
  unsubRecords = store.subscribe('records', renderCalendar);
  unsubEvents = store.subscribe('events', renderCalendar);
  renderCalendar();
}

export default {
  id: 'calendar',
  title: 'CALENDAR',
  crumb: ['FABRIC R&D', 'CALENDAR'],
  mount(root, { store }) {
    teardown();
    activeRoot = root;
    root.classList.add('calendar');
    build(root, store);
  },
  unmount() {
    activeRoot?.classList.remove('calendar');
    teardown();
  },
};
