# ARCHITECTURE — FABRIC R&D 웹앱 (redesign v2)

기준 문서: `웹앱_와이어프레임_v1.html`, `IA_화면구성_v7.xlsx`, `MASTER_PRD_v4.md`

## 0. 원칙

1. **빌드 없음.** 브라우저가 바로 실행하는 ES 모듈. GitHub Pages에 그대로 배포된다.
   번들러·트랜스파일러·프레임워크를 도입하지 않는다.
2. **원본은 엑셀.** 웹은 TDS 엑셀을 *읽기*만 한다. 쓰기 기능을 만들지 않는다.
   (예외: TS 관리·STUDY 점검 등 웹 자체 입력 화면 — 로컬 저장소에만 기록)
3. **합계가 맞지 않으면 화면에 올리지 않는다.** `reconcile.js`를 통과하지 못한 데이터셋은
   렌더 단계로 넘어가지 않는다.
4. **민감정보는 저장소에 없다.** 단가·협력사명·바이어 실명은 사용자가 로컬에서 TDS를 연
   세션 메모리에만 존재한다. 저장소에는 더미(`data/sample.js`)만 커밋한다.

   표시 규칙은 로그인이 아니라 **데이터 출처**로 정한다:
   `sensitiveUnlocked === (meta.mode === 'tds' && meta.passed)`.
   즉 자기 엑셀을 열어 대조를 통과한 사람에게만 보인다. 공개 URL을 그냥 연 사람은
   더미 데이터만 보므로 민감 필드가 존재하지도 않는다. 비밀번호를 두지 않는 이유가 이것이다.
   뷰는 `store.get().sensitiveUnlocked`가 false면 해당 칸을 **그리지 않는다**(가리지 말고 생략).
5. **화면에서 재계산하지 않는다.** 집계는 `data/` 계층에서 한 번만 수행하고
   `views/`는 받은 값을 그리기만 한다.

## 1. 디렉터리

```
/
├─ index.html              앱 셸 (유일한 진입점, SPA)
├─ assets/
│  ├─ css/
│  │   ├─ tokens.css       ★ 디자인 토큰. 색·타이포·간격·라운드·다크모드
│  │   ├─ base.css         리셋 + 타이포 + 유틸리티
│  │   ├─ layout.css       앱 셸: 사이드바 / 탑바 / 콘텐츠 그리드
│  │   └─ components.css   card, kpi, table, badge, toolbar, form, modal
│  └─ js/
│      ├─ main.js          부트스트랩: 라우터 기동, 셸 렌더, 초기 데이터 적재
│      ├─ core/
│      │   ├─ router.js    해시 라우팅 (#/development/season)
│      │   ├─ store.js     단일 상태 + 구독(pub/sub)
│      │   ├─ dom.js       el() 빌더, html 이스케이프, 위임 이벤트
│      │   └─ format.js    날짜·숫자·시즌코드·Style No. 정규화
│      ├─ data/
│      │   ├─ schema.js    ★ 필드 정의(17개 항목) + 카테고리/상태 상수
│      │   ├─ tds-loader.js SheetJS로 TDS 파싱 → 레코드 배열
│      │   ├─ reconcile.js  합계 대조 5종 → {passed, diffs[]}
│      │   ├─ derive.js     KPI·분포·타임라인 등 파생 집계
│      │   └─ sample.js     공개 저장소용 더미 데이터
│      ├─ ui/
│      │   ├─ table.js     정렬·필터·페이지네이션 데이터테이블
│      │   ├─ chart.js     Chart.js 래퍼 (토큰 색상 주입)
│      │   └─ widgets.js   kpi카드·배지·툴바·빈상태·스켈레톤
│      └─ views/
│          ├─ home.js  development.js  ts.js  study.js
│          └─ calendar.js  sync.js  rdda.js  setting.js
├─ legacy/                 기존 index.html·dashboard.html 보관 (참조용)
└─ docs/                   ARCHITECTURE / ROADMAP / codex 작업지시서
```

## 2. 계약 (이 경계는 누구도 임의로 바꾸지 않는다)

### store.js
```js
store.get()                    // 현재 상태 스냅샷 (읽기 전용)
store.set(patch)               // 얕은 병합 후 구독자에게 통지
store.subscribe(key, fn)       // key 변경 시 fn(value) 호출, 해제 함수 반환
```
상태 키: `records`, `meta`, `filters`, `route`, `theme`, `sensitiveUnlocked`

### 뷰 모듈 (views/*.js) — 모두 동일 시그니처
```js
export default {
  id: 'development',
  title: 'DEVELOPMENT',
  crumb: ['FABRIC R&D', 'DEVELOPMENT'],
  mount(root, ctx),   // root: HTMLElement, ctx: {store, route, params}
  unmount(),          // 구독·타이머 해제. 없으면 생략 가능
}
```
뷰는 `document.querySelector`로 자기 `root` 바깥을 만지지 않는다.

### 레코드 1건 (schema.js의 `FIELDS` 순서와 일치)
```js
{ styleNo, opt, season, category, buyer, owner, gdNo, saNo,
  construction, weight, color, dyeing, stage, dueDate, flNo, note,
  _src: { sheet, row } }        // 원본 시트/행 — 상세창에서 표시
```

### ui/table.js — createTable
```js
createTable({ columns, rows, sticky, sort, rowKey, onRowClick, onRender, empty, pageSize })
  -> { el, update(rows), setFilter(fn), setSort(key, dir), destroy() }
```
`onRender(tableEl, shownRows)`는 tbody가 다시 그려질 때마다(생성·정렬·필터·더보기) 불린다.
셀을 배지 등으로 꾸미는 일은 **반드시 이 훅에서** 한다.
`MutationObserver`로 tbody를 감시하면 콜백이 DOM을 고치는 순간 무한 루프가 된다.

### reconcile.js
```js
reconcile(records, rawWorkbook) -> {
  passed: boolean,
  checks: [{ name, excel, applied, diff, ok }],   // 5종
  anomalies: [{ type, count, samples[] }]         // 시즌표기·납기공란 등
}
```
`passed === false`면 `store.set({records})`를 호출하지 않는다.

## 3. 스타일 규약

### 어디에 쓰는가

- **공용 스타일**(`base` / `layout` / `components`)은 `assets/css/`에 둔다.
  두 화면 이상이 쓰는 것만 여기 올라온다.
- **그 화면에서만 쓰는 스타일**은 해당 뷰 모듈 안의 `STYLE_TEXT` 상수에 두고
  `build()`에서 `el('style', { text: STYLE_TEXT })`로 `root`에 붙인다.
  라우터가 화면을 떠날 때 `outlet`을 비우므로 자동으로 함께 사라진다. 누적되지 않는다.

  이렇게 나눈 이유: 여러 작업이 동시에 진행될 때 공용 CSS 파일에서 충돌이 나지 않고,
  화면과 그 화면의 스타일이 한 파일에 같이 있어 삭제·이동이 쉽다.
  다만 **토큰 규칙은 동일하게 적용된다** — 뷰 안의 스타일도 `var(--...)`만 쓴다.

- 색·간격·폰트는 **반드시** `tokens.css`의 CSS 변수로만 쓴다. 하드코딩 금지.
- 팔레트 기준은 와이어프레임 v1: navy `#162b46` 사이드바, primary `#3367e8`,
  semantic green/amber/red. 다크 테마는 `:root[data-theme="dark"]`로 토큰만 재정의한다.
- 클래스명은 `블록__요소--변형` (BEM 축약). 전역 요소 셀렉터에 스타일을 걸지 않는다.
- `!important` 금지.

## 4. 데이터 흐름

```
[사용자가 TDS.xlsx 선택]
        ↓  tds-loader.js  (SheetJS, 브라우저 로컬)
   raw rows
        ↓  schema.js      (컬럼 매핑·정규화)
   records[]
        ↓  reconcile.js   (합계 5종 대조)
   passed? ──No──→ 동기화 상태 화면에 불일치 표시, 이전 데이터 유지
        │Yes
        ↓  derive.js      (KPI·분포·타임라인 집계)
   store.set({records, meta})
        ↓  구독
   views/*  렌더
```

TDS를 열지 않은 상태에서는 `sample.js`의 더미로 화면이 동작한다(데모 모드).
데모 모드에서는 상단에 "예시 데이터" 표시가 항상 붙는다.

## 5. 실행

```bash
python -m http.server 5173
```
`file://`로는 ES 모듈이 동작하지 않는다. 반드시 로컬 서버로 연다.
