# R33 — DD 마스터 시트: Developer 삭제·정렬·열너비 드래그·가운데정렬·Balance %

## 목적
DD 마스터 현황판(`src/routes/DevelopmentMasterSheet.tsx`)의 표시/조작을 다음과 같이 개선한다.
**이 작업은 `DevelopmentMasterSheet.tsx` 한 파일로 한정**한다(데이터/파서/저장 로직 불변).

---

## 1. Developer 열 삭제 (담당과 중복)
- `GROUPS`의 `detail` 그룹에서 `{ id: "developer", label: "Developer", … }` 컬럼을 **제거**한다.
- 표시에서만 제거하는 것이며, `DevTechnical.development.developer` 타입과 파싱/저장 경로는 그대로 둔다.
- 부수 정리: `optionsById`의 `developer` 키(더 이상 UI에서 안 씀)는 남겨도 무해하나, 안 쓰면 제거해도 된다. `TECH_PATHS.developer`, `updateRecordCell`의 관련 분기는 **건드리지 말 것**(다른 경로에서 참조 가능성 — 안전상 유지).
- 수정(64열) 모달·접수 팝업에서도 detail 그룹을 공유하므로 Developer 필드가 자동으로 사라진다. 그 외 필드는 그대로.

## 2. 목록 정렬: Request Date 오래된 순
- 표의 행 나열을 **Request Date 오름차순(오래된 것 먼저)** 으로 한다.
- `filtered` 결과에 정렬을 추가한다(원본 `records`/저장 순서는 변경 금지, **표시용 정렬만**).
  - 비교 함수: `requestDate`를 정규화해 비교. 값이 비었으면(빈 문자열/undefined) **맨 뒤**로 보낸다.
  - 날짜 형식은 `YYYY.MM.DD`(점 구분) 위주다. 안전하게 하려면 `.`/`-`/`/`를 `-`로 통일 후 `Date.parse`, 실패 시 문자열 비교로 폴백. 파싱 실패·빈 값은 뒤로.
  - 안정 정렬 유지(동일 날짜의 기존 상대순서 보존).
- 정렬은 `useMemo`로 `filtered` 뒤 단계에 두거나 `filtered` 계산 마지막에 `.sort(...)`(불변 복사본에) 적용.

## 3. 열 너비 드래그 조절(엑셀식), 행 높이는 고정
- **그룹(스크롤) 컬럼**들의 너비를 헤더 경계 드래그로 조절 가능하게 한다. **고정(PINNED) 3열(담당·Status·Style No.)은 고정 너비 유지**(sticky left 계산 단순화를 위해 리사이즈 대상 제외).
- 구현 개요:
  - 컬럼별 현재 너비를 담는 상태 `colWidths: Record<string, number>` 를 만든다. 초기값은 각 `MasterColumn.width`. `localStorage`("dd-col-widths")에서 복원하고 변경 시 저장(파싱 실패 방어). 저장은 그룹 컬럼 id만.
  - 너비 조회 헬퍼 `widthOf(column) = colWidths[column.id] ?? column.width`.
  - 렌더에서 그룹 컬럼의 `style={{ width, minWidth }}`(헤더 3행째 `th`, 그리고 `GridCell`의 `td`)에 `widthOf(column)`을 사용하도록 바꾼다. **PINNED 컬럼과 병합 헤더(colSpan)는 기존 `column.width` 기반 유지**.
  - 각 그룹 컬럼의 **데이터 헤더 셀(3번째 thead 행, line 549 부근)** 오른쪽 가장자리에 드래그 핸들을 둔다:
    - `<span>` 형태의 4~6px 폭 리사이저를 `th`를 `relative`로 만들고 `absolute right-0 top-0 h-full w-1 cursor-col-resize select-none`로 배치. hover 시 색 표시.
    - `onMouseDown`에서 시작 X와 시작 너비를 기록하고, `window`에 `mousemove`/`mouseup` 리스너를 붙여 `newWidth = max(56, startWidth + (e.clientX - startX))`로 `colWidths[id]` 갱신, `mouseup`에서 리스너 해제 + localStorage 저장. (드래그 중 텍스트 선택 방지: `document.body.style.userSelect='none'` 후 복원.)
    - 드래그 핸들 `onMouseDown`은 정렬/편집 트리거와 겹치지 않도록 `e.preventDefault()`/`e.stopPropagation()`.
  - **행 높이는 고정**(현재 `h-8`/`h-6` 유지, 변경 금지).
  - 초기화 수단: 프리셋 버튼들(핵심 보기/공정·결과/전체 64열) 옆에 작은 "열 너비 초기화" 버튼을 추가해 `colWidths`를 비우고 localStorage 키를 제거(선택 구현, 없으면 생략 가능).
- 리사이즈는 **너비만** 바꾸고 컬럼 순서/표시 여부/편집 동작에는 영향 없어야 한다.

## 4. 정렬(가운데) — 지정 열 제외 전부 가운데 정렬
그룹 컬럼의 셀·헤더 정렬 규칙을 다음으로 바꾼다(고정 PINNED 3열은 현행 유지: 담당=좌+아이콘, Status=칩, Style No.=좌).

- **좌측 정렬로 남길 컬럼**(아래 id) — 이들만 왼쪽, **나머지 그룹 컬럼은 전부 가운데**:
  - `styleNo`(고정열이라 이미 좌측)
  - `developmentNo`(GD#/SA#), `arrangeNo`(Arrange#), `yarnDetail`(Yarn Detail), `construction`(개발 DETAIL의 Cons.), `color`(Color), `remark`(Remark)
  - `receivedDate`(Received Date), `flNo`(FL#), `review`(Review)
  - `failReason`(Fail 사유), `styleHistory`(Style History)
  - **ORIGINAL 분석 그룹 전체**: `origBrand`, `origContents`, `origConstruction`, `origWeight`, `origYarn`, `origComments`
- 구현: `LEFT_ALIGN_IDS = new Set([...위 id들])` 상수를 만들고, 그룹 컬럼 정렬을 결정하는 헬퍼
  `alignOf(column) => LEFT_ALIGN_IDS.has(column.id) ? "left" : "center"` 를 둔다.
  - 기존 컬럼별 `align: "right"|"center"` 대신 **이 헬퍼 결과를 헤더 th·`GridCell` td에 적용**한다(즉 숫자 우측정렬 컬럼도 규칙상 가운데가 됨). `tabular-nums`는 숫자성 컬럼(가운데여도)에 유지해도 무방.
  - 헤더(line 549)와 `GridCell`(line 340 부근 `align` 계산)에서 동일하게 반영. 인라인 편집 입력의 정렬까지 바꿀 필요는 없음(값 표시 셀 기준).
- PINNED 헤더/셀은 바꾸지 않는다.

## 5. 실측 Balance: 부호 포함 백분율(소수점 1자리)
- `data` 그룹의 `actualBalance`(label "Balance", `value: row.tech?.actual?.balance`, COMPUTED) 셀 표시를 **부호 포함 %**로 바꾼다.
  - `render`를 추가: 값이 `null`/`undefined`면 `—`. 숫자면 `${n>=0?"+":""}${n.toFixed(1)}%` (예: `+2.5%`, `-1.0%`, `0.0%`은 `+0.0%`).
  - 값 자체(저장/원본)는 변경하지 않고 **표시만** 포맷.
  - 정렬은 위 4번 규칙에 따라 가운데(Balance는 좌측 목록에 없음).

---

## 검증
- `npm run build`(tsc + vite) 통과.
- 개발 DETAIL에 Developer 열이 없다(담당만 존재).
- 표가 Request Date 오래된 순으로 정렬된다(빈 날짜는 맨 아래).
- 그룹 컬럼 헤더 경계를 드래그하면 해당 열 너비가 바뀌고 새로고침 후에도 유지된다. 행 높이는 그대로.
- Style No./GD#/Arrange#/Yarn Detail/Cons.(DETAIL)/Color/Remark/ORIGINAL 전체/Received Date/FL#/Review/Fail 사유/Style History만 좌측, 나머지 그룹 컬럼은 가운데 정렬.
- Balance가 `+2.5%`처럼 부호·소수점 1자리·% 로 표시된다.

## 절대 금지
- 데이터 파서(`src/data/zaji.ts`)·저장(`saveDevelopmentRecord`)·`updateRecordCell`의 값 변환 로직·접수 필수검증(R30)·현황판 필터 동작 회귀 금지.
- PINNED(고정 3열) sticky 동작·수정(64열) 모달 구조 회귀 금지.
- 다른 화면/레이아웃(R32 결과) 변경 금지 — 이 작업은 `DevelopmentMasterSheet.tsx` 한정.
- git commit/reset/checkout 금지. 실제 데이터 값을 로그·문서에 남기지 말 것.
