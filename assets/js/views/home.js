/* home.js — HOME (Claude 관리 · 다른 뷰의 참조 구현)
   IA_화면구성_v7 HOME 행 기준:
   최우선 알림 1건 / KPI 카드 / 내 담당 업무 / 알림 피드 5건 / 주간보고 2줄 / 마지막 반영 시각 */

import { el } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { fmtDate, fmtDateFull } from '../core/format.js';
import { kpis, myTasks, attentionItems, weeklyLines } from '../data/derive.js';
import { viewHead, card, badge, kpiRow, button, cols, stack, copyBox, emptyState } from '../ui/widgets.js';

const ME = '박향근';
const TONE = { late: 'crit', due: 'warn', progress: 'brand', done: 'ok', hold: 'neutral' };
const LABEL = { late: '지연', due: '납기 임박', progress: '진행', done: '완료', hold: '보류' };

let unsub = null;

function taskRow(r) {
  const d = r._days;
  const when = d === null ? '납기 미정' : d < 0 ? `${Math.abs(d)}일 초과` : d === 0 ? '오늘 납기' : `D-${d}`;
  return el('div.task', { role: 'button', tabindex: '0', onclick: () => navigate('development') }, [
    el(`span.task__bar.task__bar--${TONE[r._status]}`),
    el('div.task__text', null, [
      el('b', { text: `${r.styleNo} · ${r.construction}` }),
      el('span', { text: `${r.buyer} · ${r.stage} · ${when}` }),
    ]),
    badge(LABEL[r._status], TONE[r._status]),
  ]);
}

function feedRow({ tone, title, desc }) {
  return el('div.feed__row', null, [
    el(`span.feed__dot.feed__dot--${tone}`),
    el('div', null, [el('b', { text: title }), el('p', { text: desc })]),
  ]);
}

function build(root, store) {
  const s = store.get();
  const k = kpis(s.records);
  const attention = attentionItems(s.records);
  const mine = myTasks(s.records, ME);
  const top = attention[0];

  root.replaceChildren();

  root.append(viewHead({
    eyebrow: 'Overview',
    title: '오늘, 우선 확인할 업무',
    subtitle: `${fmtDateFull(new Date())} · ${s.meta.mode === 'tds' ? '합계 대조를 통과한 데이터 기준' : '예시 데이터 기준'}`,
    actions: [button('동기화 상태 보기', { variant: 'ghost', onClick: () => navigate('sync') })],
  }));

  if (top) {
    root.append(el('div.alert.alert--warn', null, [
      el('p.alert__text', null, [
        el('b', { text: top._days < 0 ? '납기 초과' : '납기 주의' }),
        el('span', {
          text: ` · 지연 ${attention.filter((a) => a._status === 'late').length}건, `
              + `3일 이내 납기 ${attention.filter((a) => a._status === 'due').length}건. `
              + `가장 급한 건은 ${top.styleNo} (${top.owner} · ${fmtDate(top.dueDate)})입니다.`,
        }),
      ]),
      button('대상 보기', { onClick: () => navigate('development') }),
    ]));
  }

  root.append(kpiRow([
    { label: '진행 중 개발', value: k.progress, note: `전체 ${k.total}건` },
    { label: '완료', value: k.done, note: 'FL No. 발행 기준' },
    { label: '납기 임박', value: k.dueSoon, note: '3일 이내' },
    { label: '지연', value: k.late, note: k.late ? '즉시 확인 필요' : '없음', tone: k.late ? 'crit' : null },
  ]));

  const leftCards = stack([
    card({
      title: '내 담당 업무',
      meta: el('a.link', { href: '#/development', text: '전체 보기' }),
      body: mine.length
        ? mine.map(taskRow)
        : emptyState('담당 중인 미완료 건이 없습니다.'),
    }),
    card({
      title: '주간 보고 요약',
      meta: '엑셀에 붙여넣기',
      body: copyBox(weeklyLines(s.records, s.ts), '2줄 복사'),
    }),
  ]);

  const rightCards = stack([
    card({
      title: '최근 알림',
      meta: el('a.link', { href: '#/sync', text: '모두 보기' }),
      body: el('div.feed', null, [
        s.meta.mode === 'tds'
          ? feedRow({ tone: 'ok', title: '동기화 검증 완료', desc: `${s.records.length}건 · 합계 대조 통과` })
          : feedRow({ tone: 'brand', title: '예시 데이터로 보는 중', desc: 'TDS 파일을 열면 실제 값으로 바뀝니다.' }),
        ...attention.slice(0, 3).map((r) => feedRow({
          tone: TONE[r._status],
          title: `${r.styleNo} ${r._status === 'late' ? '납기 초과' : '납기 임박'}`,
          desc: `${r.owner} · ${r.stage} · ${fmtDate(r.dueDate)}`,
        })),
        ...(s.ts.filter((t) => t.state === '완료' && !t.orderQty && !t.unlinkedReason).slice(0, 1)
          .map((t) => feedRow({ tone: 'warn', title: `${t.id} 완료 정보 미입력`, desc: '발주량 또는 미연결 사유를 입력하세요.' }))),
      ]),
    }),
    card({
      title: '오늘 일정',
      meta: el('a.link', { href: '#/calendar', text: '캘린더' }),
      body: (() => {
        const today = new Date().toISOString().slice(0, 10);
        const rows = s.events.filter((e) => e.date === today);
        return rows.length
          ? el('div.feed', null, rows.map((e) => feedRow({
              tone: e.type === 'due' ? 'warn' : e.type === 'meeting' ? 'ok' : 'brand',
              title: e.title,
              desc: [e.time, e.place].filter(Boolean).join(' · ') || '종일',
            })))
          : emptyState('오늘 등록된 일정이 없습니다.');
      })(),
    }),
  ]);

  root.append(cols('2-1', [leftCards, rightCards]));
}

export default {
  id: 'home',
  title: 'HOME',
  crumb: ['HOME'],
  mount(root, { store }) {
    build(root, store);
    unsub = store.subscribe('records', () => build(root, store));
  },
  unmount() { unsub?.(); unsub = null; },
};
