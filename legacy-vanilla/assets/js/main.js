/* main.js — 부트스트랩 (Claude 관리) */

import { store, initTheme, applyTheme } from './core/store.js';
import { initRouter } from './core/router.js';
import { el, qs } from './core/dom.js';
import { fmtDateFull, fmtTime } from './core/format.js';
import { sampleRecords, sampleTs, sampleStudy, sampleEvents, sampleMeta, sampleRdda } from './data/sample.js';
import home from './views/home.js';

/* ── 뷰 등록 ────────────────────────────────
   아직 구현되지 않은 화면은 자리표시자로 뜬다. 파일이 생기면 자동으로 붙는다. */
const LAZY = [
  { id: 'development', title: 'DEVELOPMENT', crumb: ['FABRIC R&D', 'DEVELOPMENT'] },
  { id: 'rdda',        title: 'RDDA REPORT', crumb: ['FABRIC R&D', 'RDDA REPORT'] },
  { id: 'ts',          title: 'TS 관리',      crumb: ['TECHNICAL SERVICES', 'TS 관리'] },
  { id: 'fabric-analysis', title: 'FABRIC ANALYSIS', crumb: ['TECHNICAL SERVICES', 'FABRIC ANALYSIS'] },
  { id: 'construction-guide', title: 'CONSTRUCTION GUIDE', crumb: ['TECHNICAL SERVICES', 'CONSTRUCTION GUIDE'] },
  { id: 'study',       title: 'STUDY 과제',   crumb: ['TECHNICAL SERVICES', 'STUDY 과제'] },
  { id: 'calendar',    title: 'CALENDAR',    crumb: ['OPERATIONS', 'CALENDAR'] },
  { id: 'sync',        title: '동기화 상태',   crumb: ['OPERATIONS', '동기화 상태'] },
  { id: 'setting',     title: 'SETTING',     crumb: ['OPERATIONS', 'SETTING'] },
  { id: 'trend-macro', title: 'MACRO TREND', crumb: ['TREND REPORT', 'MACRO TREND'] },
  { id: 'trend-fabric', title: 'FABRIC TREND', crumb: ['TREND REPORT', 'FABRIC TREND'] },
  { id: 'portfolio', title: 'PORTFOLIO', crumb: ['TREND REPORT', 'PORTFOLIO'] },
  { id: 'process-innovation', title: 'PROCESS INNOVATION', crumb: ['PROCESS INNOVATION'] },
];

function lazyView(def) {
  let real = null;
  return {
    ...def,
    async mount(root, ctx) {
      if (!real) {
        try {
          real = (await import(`./views/${def.id}.js`)).default;
        } catch (e) {
          console.info(`[view] ${def.id} 미구현 — 자리표시자 표시`, e.message);
          real = false;
        }
      }
      if (real) return real.mount(root, ctx);
      root.append(el('div.placeholder', null, [
        el('p.placeholder__title', { text: `${def.title} 화면은 준비 중입니다.` }),
        el('p.placeholder__desc', { text: 'IA_화면구성_v7의 구성안에 따라 구현 예정입니다.' }),
      ]));
      return undefined;
    },
    unmount() { if (real && real.unmount) real.unmount(); },
  };
}

const views = [home, ...LAZY.map(lazyView)];

/* ── 셸 배선 ──────────────────────────────── */
function syncNav(mod) {
  const hash = location.hash;
  document.querySelectorAll('.nav').forEach((a) => {
    const own = a.getAttribute('href');
    a.classList.toggle('is-active', own === hash || (a.dataset.view === mod.id && !a.classList.contains('nav--sub')));
    if (a.dataset.view === mod.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  qs('#crumb').textContent = mod.title;
  document.title = `${mod.title} · FABRIC R&D`;
  qs('#side')?.classList.remove('is-open');
  qs('#btn-menu')?.setAttribute('aria-expanded', 'false');
}

function renderDataBar() {
  const { meta } = store.get();
  const bar = qs('#databar');
  const src = qs('#side-datasource');
  if (!bar) return;
  bar.dataset.mode = meta.mode;
  if (meta.mode === 'tds') {
    bar.querySelector('.databar__badge').textContent = '실데이터';
    bar.querySelector('.databar__msg').textContent =
      `${meta.fileName} · ${fmtDateFull(meta.appliedAt)} ${fmtTime(meta.appliedAt)} 기준 · 합계 대조 통과`;
    if (src) src.textContent = `${meta.fileName} 기준`;
  } else {
    bar.querySelector('.databar__badge').textContent = '예시 데이터';
    bar.querySelector('.databar__msg').textContent =
      'TDS 엑셀을 열면 실제 값으로 바뀝니다. 파일은 이 브라우저 안에서만 읽히며 어디에도 전송되지 않습니다.';
    if (src) src.textContent = '예시 데이터로 보는 중';
  }
}

async function handleFile(file) {
  if (!file) return;
  const bar = qs('#databar');
  bar.dataset.mode = 'loading';
  bar.querySelector('.databar__msg').textContent = `${file.name} 읽는 중…`;
  try {
    const { loadTds } = await import('./data/tds-loader.js');
    const { reconcile } = await import('./data/reconcile.js');
    const { records, workbook } = await loadTds(file);
    const result = reconcile(records, workbook);

    const prev = store.get().meta;
    const failed = result.checks.filter((c) => !c.ok);
    const entry = {
      appliedAt: new Date().toISOString(), appliedBy: '박향근', fileName: file.name,
      count: result.passed ? records.length : null,
      passed: result.passed,
      state: result.passed ? '사용 중' : '전송 안 됨',
      reason: result.passed ? null : failed.map((c) => `${c.name} ${Math.abs(c.diff)}건 차이`).join(' · '),
    };
    const history = [entry, ...(prev.history || []).map((h) => (h.state === '사용 중' ? { ...h, state: '교체됨' } : h))].slice(0, 10);

    if (!result.passed) {
      bar.dataset.mode = 'failed';
      bar.querySelector('.databar__badge').textContent = '반영 중단';
      bar.querySelector('.databar__msg').textContent =
        `합계가 맞지 않아 반영하지 않았습니다 — ${failed.map((c) => c.name).join(', ')}. 이전 데이터를 그대로 보여줍니다.`;
      store.set({ meta: { ...prev, checks: result.checks, anomalies: result.anomalies, passed: false, history } });
      return;
    }

    store.set({
      records,
      meta: {
        mode: 'tds', fileName: file.name, appliedAt: new Date(), appliedBy: '박향근',
        checks: result.checks, anomalies: result.anomalies, passed: true, history,
      },
    });
    renderDataBar();
  } catch (e) {
    console.error('[tds] 읽기 실패', e);
    bar.dataset.mode = 'failed';
    bar.querySelector('.databar__badge').textContent = '읽기 실패';
    bar.querySelector('.databar__msg').textContent = `${file.name}을 읽지 못했습니다: ${e.message}`;
  }
}

function bindShell() {
  qs('#btn-theme')?.addEventListener('click', () => {
    applyTheme(store.get().theme === 'dark' ? 'light' : 'dark');
  });

  qs('#btn-menu')?.addEventListener('click', (e) => {
    const side = qs('#side');
    const open = side.classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  qs('#tds-file')?.addEventListener('change', (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  });

  // 민감 필드(단가·협력사명)는 사용자가 자기 TDS를 연 상태에서만 보인다.
  // 공개 URL에 더미만 있는 상태에서는 어떤 경로로도 표시되지 않는다.
  store.subscribe('meta', (meta) => {
    renderDataBar();
    const unlocked = meta.mode === 'tds' && meta.passed === true;
    if (unlocked !== store.get().sensitiveUnlocked) store.set({ sensitiveUnlocked: unlocked });
    document.body.dataset.sensitive = unlocked ? 'on' : 'off';
  });
  document.body.dataset.sensitive = 'off';
}

/* ── 시동 ─────────────────────────────────── */
initTheme();
store.set({
  records: sampleRecords(),
  ts: sampleTs(),
  study: sampleStudy(),
  events: sampleEvents(),
  rdda: sampleRdda(),
  meta: sampleMeta(),
});
bindShell();
renderDataBar();
initRouter({ outlet: qs('#main'), views, onNavigate: syncNav });
