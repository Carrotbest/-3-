/* widgets.js — 공용 UI 조각 (Claude 관리 · 모든 뷰가 이걸 쓴다)
   여기 정의된 클래스명이 components.css의 계약이다. */

import { el, append } from '../core/dom.js';

/** 화면 머리말 */
export function viewHead({ eyebrow, title, subtitle, actions }) {
  return el('header.view-head', null, [
    el('div.view-head__text', null, [
      eyebrow && el('p.eyebrow', { text: eyebrow }),
      el('h1.view-head__title', { text: title }),
      subtitle && el('p.view-head__sub', { text: subtitle }),
    ]),
    actions && el('div.view-head__actions', null, actions),
  ]);
}

export function card({ title, meta, body, foot, className }) {
  return el(`article.card${className ? '.' + className : ''}`, null, [
    (title || meta) && el('div.card__head', null, [
      title && el('h2.card__title', { text: title }),
      meta && (typeof meta === 'string' ? el('span.card__meta', { text: meta }) : meta),
    ]),
    el('div.card__body', null, body),
    foot && el('div.card__foot', null, foot),
  ]);
}

/** tone: brand | ok | warn | crit | neutral */
export const badge = (text, tone = 'neutral') =>
  el(`span.badge.badge--${tone}`, { text });

export function kpi({ label, value, note, tone }) {
  return el('div.kpi', null, [
    el('p.kpi__label', { text: label }),
    el('p.kpi__value', { text: String(value) }),
    note && el('p', { class: `kpi__note${tone ? ' kpi__note--' + tone : ''}`, text: note }),
  ]);
}

export const kpiRow = (items) => el('div.kpis', null, items.map(kpi));

export function button(text, { variant = 'default', onClick, type = 'button', ...rest } = {}) {
  return el(`button.btn${variant !== 'default' ? '.btn--' + variant : ''}`, {
    type, onclick: onClick, ...rest, text,
  });
}

/** 진행 막대 */
export function progress(pct, tone = 'brand') {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return el('div.progress', { role: 'progressbar', 'aria-valuenow': Math.round(v) },
    el(`div.progress__fill.progress__fill--${tone}`, { style: `width:${v}%` }));
}

/** 공정 단계 표시 — done/now/todo */
export function stageBar(stages, currentIndex) {
  return el('span.stage', null, stages.map((s, i) =>
    el(`i.stage__seg${i < currentIndex ? '.is-done' : i === currentIndex ? '.is-now' : ''}`,
      { title: s.label || s })));
}

export const emptyState = (msg, action) =>
  el('div.empty', null, [el('p.empty__msg', { text: msg }), action]);

export const skeleton = (rows = 3) =>
  el('div.skeleton', null, Array.from({ length: rows }, () => el('div.skeleton__row')));

/** 두 줄 요약 + 복사 */
export function copyBox(lines, label = '복사') {
  const box = el('div.copybox', null, [
    el('div.copybox__lines', null, lines.map((l) => el('p.copybox__line', { text: l }))),
  ]);
  const btn = button(label, {
    variant: 'ghost',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(lines.join('\n'));
        btn.textContent = '복사했습니다';
        setTimeout(() => { btn.textContent = label; }, 1600);
      } catch {
        btn.textContent = '복사 실패 — 직접 선택해 주세요';
      }
    },
  });
  append(box, btn);
  return box;
}

/** 좌우 배치 섹션 그리드. ratio: '2-1' | '1-1' | '1-2' */
export const cols = (ratio, children) => el(`div.cols.cols--${ratio}`, null, children);
export const stack = (children) => el('div.stack', null, children);
