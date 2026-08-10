/* dom.js — DOM 빌더 & 이벤트 유틸 (Claude 관리) */

/** HTML 특수문자 이스케이프. 사용자/엑셀에서 온 값은 반드시 통과시킬 것. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * el('div.card', {id:'x'}, [child, 'text'])
 * 태그는 'tag.cls1.cls2' 형태를 지원한다.
 */
export function el(spec, attrs = null, children = null) {
  const [tag, ...cls] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (cls.length) node.className = cls.join(' ');

  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'html') node.innerHTML = v;              // 신뢰된 문자열만
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  if (children === null || children === undefined || children === false) return parent;
  if (Array.isArray(children)) { children.forEach((c) => append(parent, c)); return parent; }
  parent.append(children instanceof Node ? children : document.createTextNode(String(children)));
  return parent;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** 이벤트 위임. 해제 함수를 돌려준다. */
export function on(root, type, selector, handler) {
  const fn = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
