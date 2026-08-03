/* store.js — 단일 상태 + 구독 (Claude 관리)
   계약: docs/ARCHITECTURE.md §2 */

const state = {
  records: [],          // 개발 건 레코드 배열 (schema.js FIELDS)
  meta: {               // 데이터 출처·검증 결과
    mode: 'demo',       // 'demo' | 'tds'
    fileName: null,
    appliedAt: null,
    appliedBy: null,
    checks: [],
    anomalies: [],
    passed: true,
  },
  ts: [],               // 기술지원 접수 건
  study: [],            // STUDY 과제
  events: [],           // 캘린더 일정
  rdda: null,           // RDDA REPORT 집계 (월별·누적·분포·Best Items)
  filters: {},
  route: { view: 'home', params: {} },
  theme: 'light',
  sensitiveUnlocked: false,   // 단가·협력사명 표시 여부
};

const subs = new Map();       // key -> Set<fn>

export const store = {
  get() { return state; },

  set(patch) {
    const changed = [];
    for (const [k, v] of Object.entries(patch)) {
      if (state[k] === v) continue;
      state[k] = v;
      changed.push(k);
    }
    changed.forEach((k) => {
      const set = subs.get(k);
      if (set) set.forEach((fn) => fn(state[k], state));
    });
    return state;
  },

  /** subscribe('records', fn) -> unsubscribe */
  subscribe(key, fn) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    return () => subs.get(key)?.delete(fn);
  },
};

/* 테마는 상태이자 DOM 속성 — 한 곳에서만 처리한다. */
export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('fabric.theme', t); } catch { /* 시크릿 모드 */ }
  store.set({ theme: t });
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('fabric.theme'); } catch { /* noop */ }
  const prefers = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || prefers);
}
