/* sample.js — 공개 저장소용 더미 데이터 (Claude 관리)
   실데이터는 절대 여기 넣지 않는다. 단가·협력사명도 포함하지 않는다.
   시드 고정이라 새로고침해도 값이 바뀌지 않는다. */

import { MEMBERS, CATEGORIES } from './schema.js';

let seed = 20260803;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const BUYERS = ['Walmart', "Kohl's", 'Target', 'H&M', 'Costco', 'Decathlon'];
const CONSTR = ['Interlock', 'Single Jersey', 'Rib 1x1', 'Fleece', 'Terry', 'Mesh', 'Ponte'];
const COLORS = ['Black', 'Navy', 'Heather Grey', 'Olive', 'Off White', 'Burgundy'];
const DYEING = ['Piece', 'Yarn', 'Solution', 'Garment'];
const STAGE_LABELS = ['원사', '편직', '염색', '가공', '시험', '완료'];
const SEASONS = ["SS'27", "FW'27", "SS'26", "FW'26"];

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => iso(new Date(Date.now() + days * 86400000));

export function sampleRecords(n = 48) {
  seed = 20260803;
  const out = [];
  for (let i = 0; i < n; i++) {
    const cat = pick(CATEGORIES);
    const prefix = cat === 'EU MARKET' ? 'EU' : cat === 'PROJECT' ? 'PJ' : 'GD';
    const stageIdx = int(0, 5);
    out.push({
      styleNo: `${prefix}26-${1000 + i * 7}`,
      opt: String(int(1, 3)).padStart(2, '0'),
      season: pick(SEASONS),
      category: cat,
      buyer: cat === 'PROJECT' ? '내부' : pick(BUYERS),
      owner: pick(MEMBERS).name,
      gdNo: `GD-${4300 + i * 3}`,
      saNo: `SA-${1100 + i * 2}`,
      construction: pick(CONSTR),
      weight: int(110, 340),
      color: pick(COLORS),
      dyeing: pick(DYEING),
      stage: STAGE_LABELS[stageIdx],
      dueDate: shift(int(-9, 45)),
      flNo: stageIdx >= 4 ? `FL-26${String(i).padStart(3, '0')}` : '',
      note: '',
      _src: { sheet: `${pick(MEMBERS).name} 시트`, row: 12 + i * 3 },
    });
  }
  return out;
}

export function sampleTs() {
  seed = 771;
  const subjects = ['이색 클레임', '신축 회복 불량', 'Pilling 등급 문의', '수축률 초과', '봉제부 터짐', '발수 지속성'];
  const froms = ['사업10부 3팀', 'Walmart', "Kohl's", '협력사(편직)', '사업7부 1팀'];
  const states = ['접수', '처리중', '완료'];
  return Array.from({ length: 16 }, (_, i) => {
    const state = i < 2 ? states[0] : i < 5 ? states[1] : states[2];
    return {
      id: `TS26-${String(18 - i).padStart(3, '0')}`,
      receivedAt: shift(-(i * 4 + 2)),
      subject: pick(subjects),
      from: pick(froms),
      owner: pick(MEMBERS).name,
      state,
      orderQty: state === '완료' && i % 3 === 0 ? int(500, 4200) : null,
      unlinkedReason: state === '완료' && i % 3 !== 0 ? '개발 검토 종료' : null,
    };
  });
}

export function sampleStudy() {
  seed = 4412;
  const topics = [
    '이색 발생 공정 구간 정리', 'Span 수치와 신축 회복률', 'RDS 인증 요구 항목',
    '가공 전후 중량 변화', '니트 컬링 원인', '재생 폴리 원사 비교',
    '봉제 터짐 사고 사례', '발수 가공 내구성', '염색 견뢰도 기준',
  ];
  const cats = ['품질사고', '공정 개념', '환경', '특정분야'];
  const states = ['완료', '완료', '진행', '계획', '미진행'];
  const rows = [];
  [29, 30, 31].forEach((wk) => {
    MEMBERS.filter((m) => m.role === '팀원').forEach((m) => {
      rows.push({
        week: wk,
        owner: m.name,
        topic: pick(topics),
        category: pick(cats),
        state: wk === 31 ? pick(['진행', '계획']) : pick(states),
        dueDate: shift((wk - 31) * 7 + 3),
      });
    });
  });
  return rows;
}

export function sampleEvents() {
  return [
    { date: shift(0), type: 'meeting', title: '팀 주간 점검 미팅', time: '10:00', place: '회의실 A' },
    { date: shift(0), type: 'due', title: 'GD26-1042 납기' },
    { date: shift(1), type: 'external', title: 'EU Sample Review', time: '15:00' },
    { date: shift(3), type: 'due', title: 'GD26-1057 납기' },
    { date: shift(8), type: 'meeting', title: 'R&D 미팅', time: '14:00' },
    { date: shift(9), type: 'due', title: 'EU-026 납기' },
  ];
}

/* RDDA REPORT — 부서 전체 원단 등록·미팅·픽업 실적.
   unitPrice·vendor는 민감 필드다. sensitiveUnlocked가 false면 뷰가 그리지 않는다.
   여기 값은 전부 더미이며 실제 단가·협력사명이 아니다. */
export function sampleRdda() {
  seed = 90210;
  const months = ['01', '02', '03', '04', '05', '06', '07', '08'];
  return {
    monthly: months.map((m) => ({
      month: `2026.${m}`,
      registered: int(28, 74),
      meeting: int(6, 22),
      pickup: int(3, 16),
    })),
    cumulative: [
      { year: 2024, stored: 412, used: 288, discarded: 61 },
      { year: 2025, stored: 503, used: 361, discarded: 74 },
      { year: 2026, stored: 318, used: 197, discarded: 39 },
    ],
    origin: [
      { label: '국내', count: 214 }, { label: '베트남', count: 168 },
      { label: '중국', count: 141 }, { label: '인도네시아', count: 63 },
      { label: '기타', count: 37 },
    ],
    construction: [
      { label: 'Single Jersey', count: 152 }, { label: 'Interlock', count: 118 },
      { label: 'Fleece', count: 97 }, { label: 'Rib', count: 84 },
      { label: 'Terry', count: 71 }, { label: 'Mesh', count: 41 },
    ],
    bestItems: Array.from({ length: 8 }, (_, i) => ({
      rank: i + 1,
      flNo: `FL-25${String(140 + i * 9).padStart(3, '0')}`,
      construction: ['Interlock', 'Single Jersey', 'Fleece', 'Rib 1x1', 'Terry', 'Mesh', 'Ponte', 'Pique'][i],
      weight: int(130, 320),
      pickup: int(9, 41),
      meeting: int(12, 58),
      unitPrice: null,   // 민감 — 실데이터에서만 채워진다
      vendor: null,      // 민감 — 실데이터에서만 채워진다
    })),
  };
}

/** 데모 모드에서도 동기화 화면이 비지 않도록 대조 결과 5종을 채워 둔다.
    구조는 reconcile()이 실제로 돌려주는 것과 동일하다. */
export function sampleChecks(total = 48) {
  return [
    { name: '담당자별 시트 합', excel: total, applied: total, diff: 0, ok: true, note: '박향근 14 · 김지현 12 · 변재휘 11 · 진영은 11' },
    { name: '전체 현황 시트 합', excel: total, applied: total, diff: 0, ok: true, note: 'Overview' },
    { name: '카테고리별 합',   excel: total, applied: total, diff: 0, ok: true, note: '미분류 없음' },
    { name: '시즌별 합',       excel: total, applied: total, diff: 0, ok: true, note: "SS'27 18 · FW'27 14 · SS'26 9 · FW'26 7" },
    { name: 'Opt 단위 행 수',  excel: total, applied: total, diff: 0, ok: true, note: '중복 없음' },
  ];
}

/** 반영 이력 — 최근 3건. 가운데 1건은 대조 실패로 전송이 막힌 사례다. */
export function sampleHistory() {
  const at = (d, h, m) => new Date(2026, 7, d, h, m).toISOString();
  return [
    { appliedAt: at(3, 8, 40),  appliedBy: '박향근', fileName: '통원부3팀 TDS.xlsx', count: 48, passed: true,  state: '사용 중', reason: null },
    { appliedAt: at(2, 17, 20), appliedBy: '박향근', fileName: '통원부3팀 TDS.xlsx', count: null, passed: false, state: '전송 안 됨', reason: '담당자별 시트 합 3건 차이 (진영은 · SEASON)' },
    { appliedAt: at(1, 9, 5),   appliedBy: '팀장',   fileName: '통원부3팀 TDS.xlsx', count: 45, passed: true,  state: '교체됨', reason: null },
  ];
}

export function sampleMeta() {
  return {
    mode: 'demo',
    fileName: null,
    appliedAt: null,
    appliedBy: null,
    passed: true,
    checks: sampleChecks(),
    anomalies: [],
    history: sampleHistory(),
  };
}
