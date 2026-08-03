/* schema.js — 데이터 계약 (Claude 관리 · Codex 수정 금지)
   IA_화면구성_v7 DEVELOPMENT 17개 항목 기준 */

export const FIELDS = [
  { key: 'styleNo',      label: 'Style No.', width: 110, mono: true,  sticky: true },
  { key: 'opt',          label: 'Opt',       width: 52,  mono: true,  align: 'center' },
  { key: 'season',       label: '시즌',       width: 74,  mono: true },
  { key: 'category',     label: '카테고리',    width: 110 },
  { key: 'buyer',        label: 'Buyer',     width: 100 },
  { key: 'owner',        label: '담당',       width: 80 },
  { key: 'gdNo',         label: 'GD#',       width: 96,  mono: true },
  { key: 'saNo',         label: 'SA#',       width: 96,  mono: true },
  { key: 'construction', label: '조직',       width: 110 },
  { key: 'weight',       label: '중량',       width: 84,  mono: true, align: 'right', unit: ' g/m²' },
  { key: 'color',        label: '컬러',       width: 90 },
  { key: 'dyeing',       label: '염색',       width: 90 },
  { key: 'stage',        label: '공정 단계',   width: 110 },
  { key: 'dueDate',      label: '납기',       width: 78,  mono: true, type: 'date' },
  { key: 'flNo',         label: 'FL#',       width: 96,  mono: true },
  { key: 'note',         label: '비고',       width: 180 },
];

/** 목록 기본 표시 컬럼 (나머지는 상세창) */
export const DEFAULT_COLUMNS = [
  'styleNo', 'opt', 'season', 'category', 'buyer', 'owner', 'construction', 'weight', 'stage', 'dueDate',
];

export const CATEGORIES = ['SEASON', 'CORE', 'EU MARKET', 'PROJECT'];

/** 공정 단계 — 순서가 진행률이다 */
export const STAGES = [
  { key: 'yarn',    label: '원사' },
  { key: 'knit',    label: '편직' },
  { key: 'dye',     label: '염색' },
  { key: 'finish',  label: '가공' },
  { key: 'test',    label: '시험' },
  { key: 'done',    label: '완료' },
];

export const STATUS = {
  progress: { key: 'progress', label: '진행',  tone: 'brand' },
  due:      { key: 'due',      label: '납기 임박', tone: 'warn' },
  late:     { key: 'late',     label: '지연',  tone: 'crit' },
  done:     { key: 'done',     label: '완료',  tone: 'ok' },
  hold:     { key: 'hold',     label: '보류',  tone: 'neutral' },
};

/** 팀 구성 — 담당자 필터·매트릭스의 기준 순서 */
export const MEMBERS = [
  { id: 'phg', name: '박향근', role: '소팀장' },
  { id: 'kjh', name: '김지현', role: '팀원' },
  { id: 'bjh', name: '변재휘', role: '팀원' },
  { id: 'jye', name: '진영은', role: '팀원' },
];

/** 민감 필드 — sensitiveUnlocked 가 false면 화면에 그리지 않는다 */
export const SENSITIVE_FIELDS = ['unitPrice', 'vendor', 'vendorCode'];

/** TDS 컬럼 헤더 → 내부 key 매핑. 헤더 표기 흔들림을 흡수한다. */
export const HEADER_MAP = {
  'style no': 'styleNo', 'style no.': 'styleNo', 'style': 'styleNo', '스타일': 'styleNo',
  'opt': 'opt', 'option': 'opt', '옵션': 'opt',
  'season': 'season', '시즌': 'season',
  'category': 'category', '카테고리': 'category', '구분': 'category',
  'buyer': 'buyer', '바이어': 'buyer',
  'owner': 'owner', '담당': 'owner', '담당자': 'owner',
  'gd': 'gdNo', 'gd#': 'gdNo', 'gd no': 'gdNo',
  'sa': 'saNo', 'sa#': 'saNo', 'sa no': 'saNo',
  'construction': 'construction', '조직': 'construction',
  'weight': 'weight', '중량': 'weight', 'g/m2': 'weight', 'gsm': 'weight',
  'color': 'color', '컬러': 'color', '색상': 'color',
  'dyeing': 'dyeing', '염색': 'dyeing',
  'stage': 'stage', '공정': 'stage', '공정단계': 'stage', '진행': 'stage',
  'due': 'dueDate', 'due date': 'dueDate', '납기': 'dueDate',
  'fl': 'flNo', 'fl#': 'flNo', 'fl no': 'flNo',
  'note': 'note', '비고': 'note', 'remark': 'note',
};

export function emptyRecord() {
  return Object.fromEntries(FIELDS.map((f) => [f.key, '']));
}
