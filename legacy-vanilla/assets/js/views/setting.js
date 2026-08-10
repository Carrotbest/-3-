/* SETTING — 기준값, 권한, 알림 규칙을 브라우저 로컬 저장소에 관리한다. */

import { el } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { checkStyleNo, normalizeSeason } from '../core/format.js';
import { CATEGORIES, MEMBERS, STAGES } from '../data/schema.js';
import { badge, button, card, emptyState, viewHead } from '../ui/widgets.js';

const STORAGE_KEY = 'fabric.settings';
const SUBS = {
  standards: '기준값', users: '사용자', alerts: '알림 규칙', history: '변경 이력',
};
const STANDARD_GROUPS = [
  { key: 'construction', label: '조직', values: ['Interlock', 'Single Jersey', 'Rib 1x1', 'Fleece', 'Terry', 'Mesh'] },
  { key: 'dyeing', label: '가공/염색', values: ['Piece', 'Yarn', 'Solution', 'Garment'] },
  { key: 'season', label: '시즌', values: ["SS'27", "FW'27", "SS'26", "FW'26"] },
  { key: 'category', label: '카테고리', values: CATEGORIES },
  { key: 'owner', label: '담당자', values: MEMBERS.map((member) => member.name) },
  { key: 'buyer', label: 'Buyer', values: [] },
];
const DEFAULT_ALERTS = [
  { key: 'dueSoon', label: '납기 임박 알림', enabled: true, value: '3', unit: '일 전' },
  { key: 'overdue', label: '납기 초과 알림', enabled: true, value: '당일', unit: '' },
  { key: 'tdsStale', label: 'TDS 미반영 알림', enabled: true, value: '7', unit: '일' },
  { key: 'studyDue', label: 'STUDY 마감 알림', enabled: true, value: '목요일 1일 전', unit: '' },
];
const DEFAULT_USERS = MEMBERS.map((member, index) => ({
  id: member.id, name: member.name, role: member.role, permission: index === 0 ? '관리자' : '등록·처리', active: true,
}));
const STYLE_TEXT = `
.setting { display: grid; gap: var(--sp-6); }
.setting > .view-head { margin-bottom: 0; }
.setting__tabs { display: flex; gap: var(--sp-1); overflow-x: auto; border-bottom: 1px solid var(--c-line); }
.setting__tab { flex: 0 0 auto; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--c-muted); padding: var(--sp-3) var(--sp-4); font: inherit; font-weight: var(--fw-bold); cursor: pointer; }
.setting__tab.is-active { color: var(--c-brand); border-bottom-color: var(--c-brand); }
.setting__layout { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr); gap: var(--sp-5); }
.setting__menu { display: grid; gap: var(--sp-2); align-content: start; }
.setting__menu-btn { width: 100%; text-align: left; }
.setting__menu-btn.is-active { border-color: var(--c-brand-line); background: var(--c-brand-tint); color: var(--c-brand); }
.setting__list { display: grid; gap: var(--sp-2); }
.setting__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.setting__row-main { display: grid; gap: var(--sp-1); flex: 1 1 12rem; }
.setting__row-title { font-weight: var(--fw-bold); }
.setting__row-meta, .setting__hint { color: var(--c-muted); font-size: var(--fs-xs); }
.setting__preview { display: grid; gap: var(--sp-2); padding: var(--sp-4); border: 1px solid var(--c-line); border-radius: var(--r-sm); background: var(--c-paper-2); }
.setting__preview-result { font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.setting__users { display: grid; gap: var(--sp-3); }
.setting__user { display: grid; grid-template-columns: minmax(7rem, 1fr) minmax(7rem, 1fr) minmax(8rem, 1fr) auto; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border-bottom: 1px solid var(--c-line); }
.setting__user:last-child { border-bottom: 0; }
.setting__form-row { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: center; }
.setting__form-row input, .setting__form-row select { flex: 1 1 10rem; }
.setting__switch { display: inline-flex; align-items: center; justify-content: flex-start; width: calc(var(--sp-9) + var(--sp-2)); height: var(--sp-6); padding: var(--sp-1); border: 1px solid var(--c-line); border-radius: var(--r-pill); background: var(--c-paper-2); cursor: pointer; }
.setting__switch::after { content: ''; width: var(--sp-4); height: var(--sp-4); border-radius: 50%; background: var(--c-muted); transition: transform var(--t-fast); }
.setting__switch[aria-checked="true"] { border-color: var(--c-ok-line); background: var(--c-ok-tint); }
.setting__switch[aria-checked="true"]::after { transform: translateX(var(--sp-4)); background: var(--c-ok); }
.setting__toast { min-height: var(--sp-5); color: var(--c-ok); font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.setting__history { display: grid; gap: var(--sp-2); }
.setting__history-row { display: grid; grid-template-columns: minmax(8rem, 1fr) minmax(7rem, 1fr) minmax(0, 3fr); gap: var(--sp-3); padding: var(--sp-3); border-bottom: 1px solid var(--c-line); font-size: var(--fs-sm); }
@media (max-width: 760px) { .setting__layout { grid-template-columns: 1fr; } .setting__user { grid-template-columns: 1fr; gap: var(--sp-2); } .setting__history-row { grid-template-columns: 1fr; gap: var(--sp-1); } }
`;

let activeRoot = null;
let cleanupEvents = null;
let toastTimer = null;

function defaults() {
  return {
    standards: Object.fromEntries(STANDARD_GROUPS.map((group) => [group.key, group.values.map((value) => ({ value, active: true }))])),
    users: DEFAULT_USERS.map((user) => ({ ...user })),
    alerts: DEFAULT_ALERTS.map((rule) => ({ ...rule })),
    history: [],
  };
}

function loadSettings() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return base;
    return {
      standards: { ...base.standards, ...(saved.standards || {}) },
      users: Array.isArray(saved.users) ? saved.users : base.users,
      alerts: Array.isArray(saved.alerts) ? saved.alerts : base.alerts,
      history: Array.isArray(saved.history) ? saved.history : [],
    };
  } catch { return base; }
}

function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

function audit(settings, item, before, after) {
  settings.history.unshift({
    at: new Date().toISOString(), by: '현재 사용자', item, before: String(before), after: String(after),
  });
  settings.history = settings.history.slice(0, 100);
}

function recordCount(records, key, value) {
  return (records || []).filter((record) => String(record[key] || '') === String(value)).length;
}

function groupValues(group, settings, records) {
  const stored = settings.standards[group.key] || [];
  if (group.key !== 'buyer') return stored;
  const inferred = [...new Set((records || []).map((record) => record.buyer).filter(Boolean))];
  const existing = new Set(stored.map((item) => item.value));
  return [...stored, ...inferred.filter((value) => !existing.has(value)).map((value) => ({ value, active: true }))];
}

function input(value, attrs = {}) {
  return el('input', { type: 'text', value, ...attrs });
}

function renderStandards(settings, records, selected) {
  const group = STANDARD_GROUPS.find((item) => item.key === selected) || STANDARD_GROUPS[0];
  const values = groupValues(group, settings, records);
  const menu = el('nav.setting__menu', { 'aria-label': '기준값 항목' }, STANDARD_GROUPS.map((item) =>
    button(item.label, { class: `setting__menu-btn${item.key === group.key ? ' is-active' : ''}`, 'data-standard-group': item.key })));
  const rows = values.length ? values.map((item, index) => {
    const used = recordCount(records, group.key, item.value);
    return el('div.setting__row', null, [
      el('div.setting__row-main', null, [
        el('strong.setting__row-title', { text: item.value }),
        el('span.setting__row-meta', { text: `사용 ${used}건` }),
      ]),
      badge(item.active ? '사용' : '비활성', item.active ? 'ok' : 'neutral'),
      button(item.active ? '비활성화' : '되돌리기', {
        variant: 'ghost', 'data-standard-index': String(index), 'data-standard-key': group.key,
      }),
    ]);
  }) : [emptyState('등록된 기준값이 없습니다.')];
  const preview = group.key === 'season'
    ? el('div.setting__preview', null, [
      el('strong', { text: '시즌 표기 정규화 미리보기' }),
      input('SP27', { name: 'season-preview', 'aria-label': '시즌 표기 예시' }),
      el('p.setting__hint', { text: '원본 값은 변경하지 않고 화면 표시만 통일합니다.' }),
      el('output.setting__preview-result', { 'data-season-output': '', text: "SS'27" }),
    ])
    : null;
  const styleCheck = group.key === 'season'
    ? el('div.setting__preview', null, [
      el('strong', { text: 'Style No. 형식 점검' }),
      el('p.setting__hint', { text: `현재 데이터 중 형식 불일치 ${records.filter((record) => !checkStyleNo(record.styleNo).ok).length}건` }),
      el('p.setting__hint', { text: '형식: 영문 2자 + 숫자 2자 - 숫자 3~4자 (예: GD26-1042)' }),
    ])
    : null;
  return el('div.setting__layout', null, [menu, el('div.stack', null, [
    card({ title: `${group.label} 기준값`, meta: '삭제 대신 비활성화로 관리', body: el('div.setting__list', null, rows) }),
    preview, styleCheck,
  ])]);
}

function permissionHelp(permission) {
  return { '조회': '조회·다운로드', '등록·처리': 'TS 등록·처리', '관리자': '기준값 변경·되돌리기' }[permission] || '';
}

function renderUsers(settings) {
  const users = settings.users.map((user) => el('div.setting__user', null, [
    el('strong', { text: user.name }),
    el('span.setting__hint', { text: user.role || '팀원' }),
    el('div', null, [
      el('select', { 'data-user-permission': user.id, 'aria-label': `${user.name} 권한` }, ['조회', '등록·처리', '관리자'].map((value) =>
        el('option', { value, selected: value === user.permission, text: value }))),
      el('p.setting__hint', { text: permissionHelp(user.permission) }),
    ]),
    badge(user.active ? '사용' : '비활성', user.active ? 'ok' : 'neutral'),
  ]));
  return card({ title: '사용자 권한', meta: '권한은 저장 버튼을 눌러 반영합니다.', body: el('div.setting__users', null, users) });
}

function renderAlerts(settings) {
  const rules = settings.alerts.map((rule) => el('div.setting__row', null, [
    el('button.setting__switch', {
      type: 'button', role: 'switch', 'aria-checked': String(rule.enabled), 'data-alert-switch': rule.key,
      'aria-label': `${rule.label} ${rule.enabled ? '켜짐' : '꺼짐'}`,
    }),
    el('div.setting__row-main', null, [el('strong.setting__row-title', { text: rule.label }), el('span.setting__row-meta', { text: rule.enabled ? '사용 중' : '꺼짐' })]),
    input(rule.value, { 'data-alert-value': rule.key, 'aria-label': `${rule.label} 기준값` }),
    el('span.setting__hint', { text: rule.unit }),
  ]));
  return card({ title: '알림 규칙', meta: '변경 후 저장 버튼을 눌러 반영합니다.', body: el('div.setting__list', null, rules) });
}

function renderHistory(settings) {
  if (!settings.history.length) return emptyState('아직 변경 이력이 없습니다.');
  return el('div.setting__history', null, settings.history.map((item) => el('div.setting__history-row', null, [
    el('span.setting__hint', { text: new Date(item.at).toLocaleString('ko-KR') }),
    el('strong', { text: item.by }),
    el('span', { text: `${item.item}: ${item.before} → ${item.after}` }),
  ])));
}

function teardown() {
  cleanupEvents?.();
  cleanupEvents = null;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = null;
  activeRoot = null;
}

function build(root, store, route) {
  const settings = loadSettings();
  const sub = SUBS[route.sub] ? route.sub : 'standards';
  let selectedGroup = 'construction';
  const content = el('div.setting__content');
  const toast = el('p.setting__toast', { 'aria-live': 'polite' });
  const tabs = el('nav.setting__tabs', { 'aria-label': 'SETTING 메뉴' }, Object.entries(SUBS).map(([key, label]) =>
    button(label, { class: `setting__tab${key === sub ? ' is-active' : ''}`, 'data-setting-tab': key, 'aria-current': key === sub ? 'page' : null })));

  function draw() {
    const records = store.get().records || [];
    if (sub === 'standards') content.replaceChildren(renderStandards(settings, records, selectedGroup));
    else if (sub === 'users') content.replaceChildren(renderUsers(settings));
    else if (sub === 'alerts') content.replaceChildren(renderAlerts(settings));
    else content.replaceChildren(card({ title: '변경 이력', meta: `${settings.history.length}건`, body: renderHistory(settings) }));
  }
  function showToast() {
    toast.textContent = '저장했습니다.';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.textContent = ''; }, 3000);
  }
  function saveUsers() {
    const selects = root.querySelectorAll('[data-user-permission]');
    let valid = true;
    selects.forEach((select) => {
      const user = settings.users.find((item) => item.id === select.dataset.userPermission);
      if (!user || user.permission === select.value) return;
      if (user.permission === '관리자' && select.value !== '관리자' && settings.users.filter((item) => item.permission === '관리자').length === 1) {
        valid = false;
        return;
      }
      audit(settings, `${user.name} 권한`, user.permission, select.value);
      user.permission = select.value;
    });
    if (!valid) { toast.textContent = '관리자는 최소 1명이 필요합니다.'; return; }
    saveSettings(settings); showToast(); draw();
  }
  function saveAlerts() {
    root.querySelectorAll('[data-alert-value]').forEach((field) => {
      const rule = settings.alerts.find((item) => item.key === field.dataset.alertValue);
      if (!rule || rule.value === field.value) return;
      audit(settings, `${rule.label} 기준`, rule.value, field.value);
      rule.value = field.value;
    });
    saveSettings(settings); showToast(); draw();
  }
  draw();
  const actions = el('div', null, [toast, button('저장', { variant: 'primary', 'data-setting-save': sub })]);
  root.replaceChildren(el('style', { text: STYLE_TEXT }), viewHead({ eyebrow: 'Operations / Administrator', title: 'SETTING', subtitle: '기준값·사용자 권한·알림 규칙을 관리합니다.', actions: [actions] }), tabs, content);
  const onClick = (event) => {
    const tab = event.target.closest('[data-setting-tab]');
    if (tab) { navigate('setting', tab.dataset.settingTab); return; }
    const group = event.target.closest('[data-standard-group]');
    if (group) { selectedGroup = group.dataset.standardGroup; draw(); return; }
    const standard = event.target.closest('[data-standard-index]');
    if (standard) {
      const items = settings.standards[standard.dataset.standardKey] || [];
      const item = items[Number(standard.dataset.standardIndex)];
      if (item) { const before = item.active ? '사용' : '비활성'; item.active = !item.active; audit(settings, `${standard.dataset.standardKey} ${item.value}`, before, item.active ? '사용' : '비활성'); saveSettings(settings); showToast(); draw(); }
      return;
    }
    const switchButton = event.target.closest('[data-alert-switch]');
    if (switchButton) { const rule = settings.alerts.find((item) => item.key === switchButton.dataset.alertSwitch); if (rule) { rule.enabled = !rule.enabled; switchButton.setAttribute('aria-checked', String(rule.enabled)); switchButton.setAttribute('aria-label', `${rule.label} ${rule.enabled ? '켜짐' : '꺼짐'}`); } return; }
    const save = event.target.closest('[data-setting-save]');
    if (save) { if (save.dataset.settingSave === 'users') saveUsers(); else if (save.dataset.settingSave === 'alerts') saveAlerts(); else { saveSettings(settings); showToast(); } }
  };
  const onInput = (event) => {
    if (event.target.name !== 'season-preview') return;
    const result = normalizeSeason(event.target.value);
    const output = root.querySelector('[data-season-output]');
    if (output) output.textContent = result.value || '입력값 없음';
  };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  cleanupEvents = () => { root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); };
}

export default {
  id: 'setting',
  title: 'SETTING',
  crumb: ['OPERATIONS', 'SETTING'],
  mount(root, { store, route }) {
    teardown();
    activeRoot = root;
    root.classList.add('setting');
    build(root, store, route || {});
  },
  unmount() {
    activeRoot?.classList.remove('setting');
    teardown();
  },
};
