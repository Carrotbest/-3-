import { el } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { fmtDate, fmtDateFull, fmtNum } from '../core/format.js';
import { kpis, attentionItems, weeklyLines } from '../data/derive.js';
import { createChart } from '../ui/chart.js';
import { viewHead, card, badge, kpiRow, button, progress, cols, stack, copyBox, emptyState } from '../ui/widgets.js';

const TONE = { late: 'crit', due: 'warn', progress: 'brand', done: 'ok' };
const LABEL = { late: '납기 지연', due: '마감 임박', progress: '진행', done: '완료' };
let unsub = null;
let chartApi = null;

const STYLE_TEXT = `
.home__visual { display:grid; grid-template-columns:minmax(0,2fr) minmax(15rem,1fr); gap:var(--sp-4); align-items:stretch; }
.home__chart { min-height:250px; }
.home__goal-stack { display:grid; grid-template-rows:1fr auto; gap:var(--sp-4); }
.home__goal { display:flex; min-height:15.6rem; padding:var(--sp-6); flex-direction:column; justify-content:space-between; border-radius:var(--r-lg); background:var(--c-navy); color:var(--c-on-brand); box-shadow:var(--shadow-2); }
.home__goal-kicker { margin:0 0 var(--sp-2); color:var(--c-navy-muted); font-size:var(--fs-2xs); font-weight:var(--fw-black); letter-spacing:var(--ls-wide); }
.home__goal-title { margin:0; font-family:var(--font-display); font-size:var(--fs-h1); font-weight:var(--fw-black); letter-spacing:var(--ls-tight); }
.home__goal-stat { display:flex; align-items:end; justify-content:space-between; gap:var(--sp-3); margin-bottom:var(--sp-2); }
.home__goal-stat strong { font-family:var(--font-display); font-size:calc(var(--fs-kpi) + 8px); line-height:1; letter-spacing:var(--ls-tight); }
.home__goal-stat span { padding-bottom:2px; color:var(--c-navy-muted); font-size:var(--fs-xs); }
.home__goal .progress { background:var(--c-navy-hover); }.home__goal .progress__fill { background:var(--c-on-brand); }
.home__insight { display:grid; grid-template-columns:auto 1fr; gap:var(--sp-3); align-items:start; padding:var(--sp-4); border:1px solid var(--c-line); border-radius:var(--r-lg); background:var(--c-paper-2); }
.home__insight-mark,.home__news-mark { display:grid; place-items:center; width:var(--sp-7); height:var(--sp-7); border-radius:var(--r-md); background:var(--c-brand-tint); color:var(--c-brand); font-family:var(--font-display); font-weight:var(--fw-black); }
.home__insight b { display:block; margin-bottom:var(--sp-1); font-family:var(--font-display); font-size:var(--fs-sm); }.home__insight p { margin:0; color:var(--c-muted); font-size:var(--fs-xs); line-height:var(--lh-body); }
.home__news { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--sp-3); }.home__news-card { display:grid; gap:var(--sp-2); min-height:9rem; padding:var(--sp-4); border:1px solid var(--c-line); border-radius:var(--r-lg); background:var(--c-paper); color:var(--c-ink); text-align:left; font:inherit; cursor:pointer; transition:transform var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease); }
.home__news-card:hover,.home__news-card:focus-visible { transform:translateY(-4px); border-color:var(--c-brand-soft); box-shadow:var(--shadow-2); }.home__news-card b { font-family:var(--font-display); font-weight:var(--fw-black); letter-spacing:var(--ls-tight); }.home__news-copy { color:var(--c-muted); font-size:var(--fs-xs); }.home__news-link { color:var(--c-brand); font-size:var(--fs-xs); font-weight:var(--fw-bold); }
@media (max-width:980px) { .home__visual { grid-template-columns:1fr; }.home__goal-stack { grid-template-columns:1fr 1fr; grid-template-rows:none; }.home__news { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:560px) { .home__goal-stack,.home__news { grid-template-columns:1fr; } }
`;

function feedRow({ tone, title, desc }) {
  return el('div.feed__row', null, [el(`span.feed__dot.feed__dot--${tone}`), el('div', null, [el('b', { text: title }), el('p', { text: desc })])]);
}

function taskRow(record) {
  const dayLabel = record._days === null ? '마감 미정' : record._days < 0 ? `${Math.abs(record._days)}일 초과` : record._days === 0 ? '오늘 마감' : `D-${record._days}`;
  return el('div.task', { role: 'button', tabindex: '0', onclick: () => navigate('development') }, [
    el(`span.task__bar.task__bar--${TONE[record._status] || 'neutral'}`),
    el('div.task__text', null, [el('b', { text: `${record.styleNo || '-'} · ${record.construction || '-'}` }), el('span', { text: `${record.buyer || '-'} · ${record.stage || '-'} · ${dayLabel}` })]),
    badge(LABEL[record._status] || '확인', TONE[record._status] || 'neutral'),
  ]);
}

function newsCard({ title, copy, route, mark }) {
  return el('button.home__news-card', { type: 'button', onclick: () => navigate(route) }, [
    el('span.home__news-mark', { text: mark, 'aria-hidden': 'true' }), el('b', { text: title }), el('span.home__news-copy', { text: copy }), el('span.home__news-link', { text: '상세 보기 →' }),
  ]);
}

function goalStack(values, tsOpen) {
  const onTime = values.total ? Math.max(0, Math.round(((values.total - values.late) / values.total) * 100)) : 0;
  return el('aside.home__goal-stack', { 'aria-label': '핵심 목표와 인사이트' }, [
    el('section.home__goal', null, [el('div', null, [el('p.home__goal-kicker', { text: 'PRIMARY GOAL' }), el('h2.home__goal-title', { text: '개발 납기 준수율' })]), el('div', null, [el('div.home__goal-stat', null, [el('strong', { text: `${onTime}%` }), el('span', { text: '목표: 90%' })]), progress(onTime, 'brand')])]),
    el('section.home__insight', null, [el('span.home__insight-mark', { text: 'TS', 'aria-hidden': 'true' }), el('div', null, [el('b', { text: 'Trouble Shooting 인사이트' }), el('p', { text: `처리 중인 기술 이슈 ${tsOpen}건을 원인 분석과 조치 이력으로 추적합니다.` })])]),
  ]);
}

function visualBlock(state, values) {
  chartApi?.destroy();
  const monthly = state.rdda?.monthly || [];
  const chartHost = el('div.home__chart');
  chartApi = createChart(chartHost, { type: 'line', height: 250, labels: monthly.map((row) => row.month), datasets: [{ label: 'RDDA 등록', data: monthly.map((row) => row.registered) }, { label: '영업 Pickup', data: monthly.map((row) => row.pickup) }] });
  const registered = monthly.reduce((total, row) => total + (Number(row.registered) || 0), 0);
  const tsOpen = (state.ts || []).filter((item) => item.state !== '완료').length;
  return [
    el('section.home__visual', null, [card({ title: 'RDDA 실적 추이', meta: '월별 등록 · 영업 Pickup', body: chartHost }), goalStack(values, tsOpen)]),
    el('section.home__news', { 'aria-label': '업무 카드뉴스' }, [
      newsCard({ title: 'DEVELOPMENT', copy: `진행 ${values.progress}건 · 납기 리스크 ${values.dueSoon + values.late}건`, route: 'development', mark: 'D' }),
      newsCard({ title: 'RDDA REPORT', copy: `등록 ${fmtNum(registered, '건')} · Best Items`, route: 'rdda', mark: 'R' }),
      newsCard({ title: 'TS / TROUBLE SHOOTING', copy: `처리 중 ${tsOpen}건 · 분석과 조치 이력`, route: 'ts', mark: 'TS' }),
      newsCard({ title: 'TREND REPORT', copy: 'Macro Trend · Fabric Trend · Portfolio', route: 'trend-macro', mark: 'T' }),
    ]),
  ];
}

function build(root, store) {
  const state = store.get();
  const values = kpis(state.records || []);
  const attention = attentionItems(state.records || []);
  root.replaceChildren();
  root.append(el('style', { text: STYLE_TEXT }));
  root.append(viewHead({ eyebrow: 'Overview', title: '오늘, 우선 확인할 업무', subtitle: `${fmtDateFull(new Date())} · 실시간 업무 현황`, actions: [button('동기화 상태 보기', { variant: 'ghost', onClick: () => navigate('sync') })] }));
  if (attention[0]) root.append(el('div.alert.alert--warn', null, [el('p.alert__text', null, [el('b', { text: attention[0]._days < 0 ? '납기 초과' : '납기 주의' }), el('span', { text: ` · 지연 ${values.late}건, 3일 이내 마감 ${values.dueSoon}건을 확인하세요.` })]), button('개발 현황 보기', { onClick: () => navigate('development') })]));
  root.append(kpiRow([{ label: '진행 중 개발', value: values.progress, note: `전체 ${values.total}건` }, { label: '완료', value: values.done, note: 'FL No. 발행 기준' }, { label: '납기 임박', value: values.dueSoon, note: '3일 이내' }, { label: '지연', value: values.late, note: values.late ? '즉시 확인 필요' : '없음', tone: values.late ? 'crit' : null }]));
  root.append(...visualBlock(state, values));
  const taskCard = card({ title: '우선 확인할 개발 업무', meta: el('a.link', { href: '#/development', text: '전체 보기' }), body: attention.length ? attention.slice(0, 5).map(taskRow) : emptyState('현재 납기 주의 업무가 없습니다.') });
  const reportCard = card({ title: '주간 보고 요약', meta: '복사하여 붙여넣기', body: copyBox(weeklyLines(state.records || [], state.ts || []), '요약 복사') });
  const feed = attention.slice(0, 3).map((record) => feedRow({ tone: TONE[record._status], title: `${record.styleNo} ${LABEL[record._status]}`, desc: `${record.owner || '담당 미정'} · ${record.stage || '-' } · ${fmtDate(record.dueDate)}` }));
  const notices = card({ title: '최근 알림', meta: el('a.link', { href: '#/sync', text: '모두 보기' }), body: feed.length ? el('div.feed', null, feed) : emptyState('새로운 알림이 없습니다.') });
  root.append(cols('2-1', [stack([taskCard, reportCard]), stack([notices]) ]));
}

export default { id: 'home', title: 'HOME', crumb: ['HOME'], mount(root, { store }) { build(root, store); unsub = store.subscribe('records', () => build(root, store)); }, unmount() { unsub?.(); unsub = null; chartApi?.destroy(); chartApi = null; } };
