# 작업지시 02 — 데이터테이블 · 차트 래퍼

## 맡을 파일 (이 2개만 새로 만든다)

- `assets/js/ui/table.js`
- `assets/js/ui/chart.js`

다른 파일은 **읽기만** 한다. `legacy/`는 열지 마라. CSS는 손대지 마라(다른 작업에서 처리 중).

## 먼저 읽을 것

1. `assets/js/data/schema.js` — 컬럼 정의(`FIELDS`)의 형태. `{key,label,width,mono,align,unit,type,sticky}`
2. `assets/js/core/dom.js` — `el()`, `esc()`, `on()`. **DOM 생성은 반드시 이걸 쓴다.** innerHTML 문자열 조립 금지.
3. `assets/js/ui/widgets.js` — 코드 스타일과 export 방식의 본보기
4. `assets/js/core/format.js` — 날짜·숫자 표시는 여기 함수를 쓴다

## table.js — 정렬·필터되는 데이터테이블

```js
export function createTable({
  columns,        // FIELDS 형태의 배열
  rows,           // 객체 배열
  sticky = true,  // 첫 컬럼 좌측 고정
  sort = null,    // { key, dir: 'asc'|'desc' }
  rowKey = (r, i) => r.styleNo ?? i,
  onRowClick = null,
  empty = '표시할 항목이 없습니다.',
  pageSize = 50,
}) -> {
  el,                 // <article class="card table-card"> 루트
  update(nextRows),   // 데이터 교체 후 다시 그림 (스크롤 위치·정렬 유지)
  setFilter(fn),      // 행 필터. null이면 해제
  setSort(key, dir),
  destroy(),          // 이벤트 해제
}
```

구현 요구:

- 마크업은 `docs/codex/01-css.md`의 표 계약을 따른다:
  `.card.table-card > .table-wrap > table.grid > thead/tbody`,
  숫자 칸 `td.is-num`, 코드 칸 `td.is-mono`, 고정 칸 `.is-sticky`.
- `th`는 클릭·엔터로 정렬 토글. `aria-sort`를 `ascending|descending|none`으로 갱신한다.
  정렬 방향 표시는 텍스트 화살표(▲▼)로 충분하다.
- 정렬 비교: `type:'date'`는 날짜, 숫자형은 숫자, 나머지는 `localeCompare('ko')`.
  빈 값은 방향과 무관하게 항상 뒤로 보낸다.
- `pageSize`를 넘으면 하단에 "더 보기 (n건 남음)" 버튼. 페이지네이션 UI는 만들지 마라.
- 행 클릭은 이벤트 위임(`on()`) 한 번으로 처리한다. 행마다 리스너를 달지 마라.
- 500행에서도 버벅이지 않아야 한다. 재정렬 시 `tbody`만 교체한다.
- 값 렌더링: `col.unit`이 있으면 붙이고, `col.type==='date'`면 `fmtDate()`, 빈 값은 `—`.

## chart.js — Chart.js 래퍼

Chart.js 4는 `index.html`에서 전역 `Chart`로 이미 로드돼 있다. import 하지 마라.

```js
export function seriesColors(n = 6)   // tokens.css의 --c-series-1..6 실제 색 문자열 배열
export function createChart(container, {
  type,            // 'bar' | 'line' | 'doughnut'
  labels,
  datasets,        // [{ label, data }]  — 색은 래퍼가 주입한다
  horizontal = false,
  stacked = false,
  height = 240,
}) -> { el, update({labels, datasets}), destroy() }
```

구현 요구:

- 색·격자선·글자색은 **`getComputedStyle(document.documentElement).getPropertyValue('--c-...')`**로
  토큰에서 읽는다. hex 하드코딩 금지.
- 테마가 바뀌면(`document.documentElement`의 `data-theme` 속성 변경) 색을 다시 읽어 갱신한다.
  `MutationObserver`로 감시하고 `destroy()`에서 해제한다.
- `Chart`가 아직 로드되지 않았을 수 있다. 없으면 300ms 간격으로 최대 10회 기다리고,
  그래도 없으면 컨테이너에 "차트를 불러오지 못했습니다" 문구를 넣고 조용히 끝낸다. 예외를 던지지 마라.
- 기본 옵션: `responsive:true`, `maintainAspectRatio:false`, 범례는 데이터셋이 2개 이상일 때만 표시,
  툴팁 활성, 애니메이션은 `prefers-reduced-motion`이면 끈다.
- 컨테이너에는 `height`px 고정 높이 래퍼(`div.chart`)를 만들고 그 안에 `<canvas>`를 넣는다.

## 확인

`python -m http.server 5173` 으로 띄운 뒤, 브라우저 콘솔에서 다음이 에러 없이 동작하는지 확인하고 보고한다.

```js
const { createTable } = await import('/assets/js/ui/table.js');
const { sampleRecords } = await import('/assets/js/data/sample.js');
const { DEFAULT_COLUMNS, FIELDS } = await import('/assets/js/data/schema.js');
const cols = FIELDS.filter(f => DEFAULT_COLUMNS.includes(f.key));
const t = createTable({ columns: cols, rows: sampleRecords() });
document.querySelector('#main').append(t.el);
```

- [ ] 표가 그려지고 헤더 클릭으로 정렬된다
- [ ] 콘솔 에러 없음
- [ ] 좁은 화면에서 표만 가로 스크롤되고 페이지 본문은 스크롤되지 않는다
