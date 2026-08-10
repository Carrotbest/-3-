/* format.js — 표기 정규화 (Claude 관리)
   원본 값은 절대 바꾸지 않는다. 표시용 변환만 한다. */

const PAD = (n) => String(n).padStart(2, '0');

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') {            // 엑셀 serial
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim().replace(/[.\s]+/g, '-').replace(/-+$/, '');
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export const fmtDate = (v) => {
  const d = toDate(v);
  return d ? `${PAD(d.getMonth() + 1)}.${PAD(d.getDate())}` : '—';
};

export const fmtDateFull = (v) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}.${PAD(d.getMonth() + 1)}.${PAD(d.getDate())}` : '—';
};

export const fmtTime = (v) => {
  const d = toDate(v) || (v instanceof Date ? v : null);
  return d ? `${PAD(d.getHours())}:${PAD(d.getMinutes())}` : '—';
};

/** 오늘 기준 남은 일수. 음수면 지연. */
export function daysLeft(v, from = new Date()) {
  const d = toDate(v);
  if (!d) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
}

export const fmtNum = (n, unit = '') => (
  n === null || n === undefined || n === '' || isNaN(n)
    ? '—'
    : Number(n).toLocaleString('ko-KR') + unit
);

export const fmtPct = (n, digits = 0) => (
  n === null || n === undefined || isNaN(n) ? '—' : `${Number(n).toFixed(digits)}%`
);

/**
 * 시즌 표기 정규화: SP27 / SS'27 / ss 27 -> SS'27
 * 원본이 규칙에서 벗어나면 { value, raw, normalized:true } 로 알린다.
 */
export function normalizeSeason(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: '', raw: s, normalized: false };
  const m = s.toUpperCase().replace(/[\s'"]/g, '').match(/^(SS|SP|FW|FA|AW)(\d{2,4})$/);
  if (!m) return { value: s, raw: s, normalized: false };
  const half = { SP: 'SS', FA: 'FW', AW: 'FW' }[m[1]] || m[1];
  const yy = m[2].slice(-2);
  const value = `${half}'${yy}`;
  return { value, raw: s, normalized: value !== s };
}

/** Style No. 패턴 확인 — 값은 바꾸지 않고 적합 여부만 돌려준다. */
export function checkStyleNo(raw, pattern = /^[A-Z]{2}\d{2}-\d{3,4}$/) {
  const s = String(raw ?? '').trim();
  return { value: s, ok: pattern.test(s) };
}

export const initials = (name) => String(name ?? '').trim().slice(0, 2) || '—';
