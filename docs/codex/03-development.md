# 작업지시 03 — DEVELOPMENT 화면

## 맡을 파일 (이 1개만 새로 만든다)

- `assets/js/views/development.js`

CSS·core·data·ui 는 이미 완성돼 있다. **읽기만** 하고 고치지 마라. `legacy/`는 열지 마라.

## 먼저 읽을 것

1. `assets/js/views/home.js` — 뷰 모듈의 계약과 코드 스타일. **이 형태를 그대로 따른다.**
2. `assets/js/ui/widgets.js` — viewHead / card / badge / kpiRow / button / cols / stack / stageBar / emptyState
3. `assets/js/ui/table.js` — createTable 사용법
4. `assets/js/data/schema.js` — FIELDS, DEFAULT_COLUMNS, CATEGORIES, STAGES, MEMBERS
5. `assets/js/data/derive.js` — statusOf, kpis, countBy, byCategory, byOwner, attentionItems
6. `assets/js/core/router.js` — navigate(view, sub), 라우트 파라미터는 `ctx.route.sub`로 들어온다

## 만들 것 (IA_화면구성_v7 DEVELOPMENT 행 기준)

### 서브 메뉴 = 라우트 파라미터

`#/development/<sub>` 의 `sub` 값에 따라 같은 화면이 필터만 달리 걸린다.

| sub | 필터 | 화면 제목 |
|---|---|---|
| `overview` 또는 없음 | 전체 | 개발 현황 |
| `eu` | `category === 'EU MARKET'` | EU Market |
| `season` | `category === 'SEASON'` | Season |
| `core` | `category === 'CORE'` | Core |
| `project` | `category === 'PROJECT'` | Project |

서브가 바뀌면 `mount`가 다시 호출된다. 뷰 내부에서 라우팅을 새로 만들지 마라.

### 구성

1. **viewHead** — eyebrow는 `Fabric R&D / <서브명>`, 제목은 위 표,
   subtitle은 `전체 개발 건을 한 기준으로 조회합니다. 원본 수정은 TDS에서만 수행합니다.`
   actions에 보기 전환 버튼 3개(목록 / 보드 / 타임라인).
2. **KPI 4장** — 현재 필터 기준으로 전체 / 진행 / 납기 임박 / 지연. `kpis()`를 쓴다.
3. **툴바** (`.toolbar`) — 검색 입력 1개 + select 5개.
   - 검색: Style No. · Buyer · 담당 · GD# · SA# 를 부분일치(대소문자 무시)로 훑는다
   - select: 시즌 / 카테고리 / Buyer / 담당 / 공정 단계 — 옵션은 현재 데이터에서 뽑는다(하드코딩 금지)
   - 우측에 "필터 초기화" 버튼. 필터가 하나라도 걸려 있을 때만 활성
   - 필터 상태는 `store.set({filters})`에 넣어 화면을 떠났다 와도 유지한다
4. **보기 3종**
   - **목록**: `createTable`로 그린다. 컬럼은 `DEFAULT_COLUMNS`. 상태 배지 컬럼을 하나 덧붙인다
     (`statusOf()` 결과를 `badge()`로). 행 클릭 시 상세 패널을 연다.
   - **보드**: 공정 단계(`STAGES`)를 열로 하는 칸반. 각 카드에 Style No.·Buyer·담당·납기.
     드래그는 만들지 마라(웹은 조회 전용이다).
   - **타임라인**: 오늘 기준 ±30일 가로 축에 납기를 점으로 찍는다. 행은 담당자별.
     라이브러리 쓰지 말고 CSS 그리드로 만든다.
   - 보기 전환은 데이터를 다시 계산하지 않는다. 필터 결과 배열을 세 렌더러가 나눠 쓴다.
5. **상세 패널** — 화면 우측에서 밀려 나오는 패널(`.detail`). 내용:
   - 17개 항목 전부 (`FIELDS` 순회, 빈 값은 `—`)
   - 공정 타임라인 (`stageBar` + 단계명)
   - **원본 위치**: `rec._src.sheet` 시트 `rec._src.row` 행 — "원본은 엑셀"을 상기시키는 문구와 함께
   - 닫기 버튼, `Esc` 키로도 닫힌다. 열릴 때 포커스를 패널로 옮기고 닫을 때 원래 행으로 되돌린다.

### 성능·정확성

- 필터는 한 번만 돌려 배열을 만들고 KPI·표·보드·타임라인이 그 배열을 공유한다.
- `store.subscribe('records', ...)`로 데이터가 바뀌면 다시 그린다. `unmount()`에서 반드시 해제한다.
- 데이터가 없으면 `emptyState('조건에 맞는 개발 건이 없습니다.')`.

## 확인

`python -m http.server 5173` 후 `http://localhost:5173/#/development`

- [ ] 서브 메뉴 5개가 각각 다른 건수를 보여준다
- [ ] 검색·필터·초기화가 KPI와 표에 동시에 반영된다
- [ ] 보기 3종이 모두 그려지고 전환이 즉시 된다
- [ ] 행을 클릭하면 상세 패널에 원본 시트·행이 표시된다
- [ ] Esc로 닫히고 포커스가 원래 자리로 돌아온다
- [ ] 콘솔 에러 없음
