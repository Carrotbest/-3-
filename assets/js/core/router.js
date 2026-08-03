/* router.js — 해시 라우터 (Claude 관리)
   #/development/season  ->  { view:'development', params:{ sub:'season' } } */

import { store } from './store.js';

let routes = {};        // id -> view module
let current = null;     // 현재 마운트된 view module
let outlet = null;
let onChange = () => {};

function parse() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [view, sub, ...rest] = raw.split('/').filter(Boolean);
  return { view: view || 'home', params: { sub: sub || null, rest } };
}

async function render() {
  const route = parse();
  const mod = routes[route.view] || routes.home;
  if (!mod) return;

  // 같은 뷰에서 서브 라우트만 바뀌어도 mount가 다시 불린다.
  // 이때 unmount를 건너뛰면 구독·이벤트가 중복되므로, 마운트된 것이 있으면 항상 정리한다.
  if (current && typeof current.unmount === 'function') {
    try { current.unmount(); } catch (e) { console.error('[router] unmount 실패', e); }
  }

  store.set({ route: { view: mod.id, params: route.params } });
  outlet.replaceChildren();
  outlet.scrollTop = 0;

  try {
    await mod.mount(outlet, { store, route: route.params });
  } catch (e) {
    console.error(`[router] ${mod.id} mount 실패`, e);
    outlet.replaceChildren(Object.assign(document.createElement('div'), {
      className: 'view-error',
      textContent: `화면을 여는 중 오류가 발생했습니다: ${e.message}`,
    }));
  }

  current = mod;
  onChange(mod, route.params);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

export function initRouter({ outlet: outletEl, views, onNavigate }) {
  outlet = outletEl;
  routes = Object.fromEntries(views.map((v) => [v.id, v]));
  onChange = onNavigate || (() => {});
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  return render();
}

export function navigate(view, sub) {
  location.hash = '#/' + [view, sub].filter(Boolean).join('/');
}
