# R143 FABRIC REQUEST 열 너비 개별 조절, 스타일 행 높이 조절, 세로 스크롤

상태: 미착수. R141(편집 기능)과 R142(요청 불러오기) 뒤에 한다. 줄 번호는 앞 작업으로 바뀌므로 이름으로 찾는다.

## 요구 (사용자)
1. 열 너비를 조절하면 그 열만 바뀌어야 한다. 지금은 표 전체 폭 범위만 바뀐다.
2. 스타일 행(블럭) 높이를 사용자가 바꿀 수 있어야 한다.
3. 글자가 칸을 넘으면 **위아래 방향 스크롤바만** 단다. 가로 스크롤바는 없다.

## 원인 (확인됨, 다시 추측하지 말 것)
- `src/routes/FabricRequest.tsx`의 `<table className="w-full table-fixed border-separate border-spacing-0 text-xs" style={{ width: tableWidth, minWidth: tableWidth }}>`에 **`<colgroup>`이 없다.**
- `table-fixed`는 첫 줄 셀 너비로 열 너비를 정한다. 그런데 첫 헤더 줄은 `#`·고정 열(rowSpan 2)과 그룹 밴드(colSpan)라 개별 열 너비가 없다. 그래서 2행 `TableHead`의 `width`가 무시되고, `tableWidth`(합계)만 반영돼 남는 폭이 열 전체에 비율로 퍼진다.
- `startColumnResize`, `startGroupResize`, `colWidths`, `widthOf`, 저장 키 `fabric.request.colWidths`는 정상이다. 바꾸지 않는다.

## 파일별 조치
### `src/routes/FabricRequest.tsx`
**1. 열 너비**
- `<table>` 바로 안 첫 자식으로 `<colgroup>`을 둔다. 열 순서는 행 머리, `visibleColumns`, 액션이다.
  ```tsx
  <colgroup>
    <col style={{ width: ROW_NO_WIDTH }} />
    {visibleColumns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
    <col style={{ width: ACTION_WIDTH }} />
  </colgroup>
  ```
- table className에서 `w-full`을 뺀다. `style={{ width: tableWidth, minWidth: tableWidth }}`는 유지한다.
- 헤더·셀의 기존 `width` 스타일은 그대로 둔다(해가 없다).

**2. 스타일 행 높이 조절**
- 저장: 브라우저 개인 설정이다(CLAUDE.md "보기 설정" 규칙). 키는 `fabric.request.rowHeights`, 값은 `Record<reqId, number>`다. `src/data/view-prefs.ts`의 기존 load/save 헬퍼를 쓴다(이름은 파일에서 확인한다). 없으면 `colWidths`를 저장하는 방식과 같게 한다.
- 기본 블럭 높이는 지금 계산식(`blockHeight`)이다. 옵션 열이 보이면 `optionRowHeight * slots + ADD_ROW_HEIGHT`이고, 아니면 `STYLE_ROW_HEIGHT`다. 이것을 `defaultBlockHeight`라 부른다.
- 적용 높이는 `Math.max(defaultBlockHeight, rowHeights[reqId] ?? 0)`이고 최대 800이다. 옵션 열이 보이면 늘어난 높이를 옵션 줄에 고르게 나눈다. `optionRowHeight = Math.max(OPTION_ROW_HEIGHT, Math.floor((blockHeight - ADD_ROW_HEIGHT) / slots))`, `blockHeight = optionRowHeight * slots + ADD_ROW_HEIGHT`다.
- 손잡이: 행 머리(`#`) 셀 맨 아래에 `absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize select-none hover:bg-[var(--primary)]` span을 둔다. 행 머리 셀은 `relative`다.
  - `onMouseDown`: `preventDefault()`, `stopPropagation()`(행 선택 드래그와 겹치지 않게)를 부른다. 시작 Y와 시작 높이를 기억하고, `mousemove`에서 높이를 계산해 state를 갱신한다(`requestAnimationFrame`으로 한 프레임에 한 번). `mouseup`에서 저장하고 리스너를 뗀다. 기존 `startColumnResize`의 cleanup ref 방식을 따른다. 드래그 중 `document.body.style.userSelect = "none"`, 커서는 `row-resize`다.
  - `onDoubleClick`: 그 스타일의 저장값을 지워 기본 높이로 되돌린다.
  - `title="끌어서 행 높이 조절 · 더블클릭: 기본 높이"`
- 툴바의 `너비 초기화` 옆에 같은 모양 `높이 초기화` 버튼을 두고, 누르면 `rowHeights`를 비우고 저장한다.

**3. 넘치는 글자는 세로 스크롤만**
- 모든 데이터 셀(스타일 병합 셀과 옵션 셀)의 내용 div는 같은 규칙이다. `h-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] [scrollbar-width:thin] px-2 py-1 leading-snug`, `style={{ maxHeight: 셀 높이 }}`.
- 옵션 셀의 한 줄 말줄임(`truncate` span)을 없애고 위 규칙으로 바꾼다. `title` 툴팁은 남겨도 된다.
- 셀 `TableCell`에도 `overflow-hidden`을 준다. 내용 div만 스크롤한다.
- 편집기(`CellEditor`)는 그대로 둔다.

**4. 빈 곳 우클릭으로 스타일 추가** (사용자 추가 요청)
- 대상 영역은 두 곳이다. 표를 감싼 스크롤 영역에서 `table` 밖(표 아래 빈 공간)과, 의뢰가 0건일 때의 빈 상태 영역이다. `onContextMenu`에서 `event.target.closest("table")`이면 무시한다(셀 메뉴는 R141 것 그대로). 아니면 `preventDefault` 후 메뉴를 연다. DD MASTER의 `kind: "bottom"` 메뉴와 같은 방식이다(`DevelopmentMasterSheet.tsx`의 `data-route-scroll-root` `onContextMenu`, 메뉴 항목 `append-one`·`append-five`).
- 메뉴 모양은 R141 셀 메뉴와 같다. 항목은 세 개다.
  - `스타일 1개 추가`(힌트 "목록 맨 아래")
  - `스타일 5개 추가`(힌트 "목록 맨 아래")
  - `신규 의뢰 창으로 추가`(기존 `setDraft(blankStyle())`)
- 추가 규칙 `appendBlankStyles(count)`:
  - `blankStyle()`로 만들되 네 값을 바꾼다.
    - `chart`: 현재 차트 필터가 `전체`가 아니면 그 값, 전체면 `""`
    - `stage`: 현재 단계 탭이 `전체`가 아니면 그 값, 전체면 `"분석"`
    - `seq`: 같은 `chart`인 기존 스타일의 `seq` 최댓값 + 1부터 차례로
    - `options`: `renumber(reqId, [blankOption(reqId, 1)])`로 빈 옵션 1개
  - 기존 여러 셀 작업과 같은 저장 경로(R141의 `saveMutation` 등, 되돌리기 스냅샷 포함)로 `requests` 끝에 붙여 **한 번만** 저장한다.
  - 추가 뒤 첫 새 스타일의 `garmentNo` 칸을 활성 셀로 선택하고 그 행을 `scrollIntoView({ block: "nearest" })`로 보인다. 편집기는 열지 않는다.
  - URGENT만 보기가 켜져 있으면 새 스타일이 가려지므로, 추가할 때 `urgentOnly`를 끄고 알림 `URGENT만 보기를 해제하고 추가했습니다.`를 띄운다.

### `CLAUDE.md`
- "## FABRIC REQUEST" 절
  - 빈 곳 우클릭 추가 한 줄: 현재 차트·단계 필터 값을 넣고, seq는 같은 차트 최댓값+1이며, 빈 옵션 1개를 붙인다. 필터에 가려지지 않게 하려는 규칙이다.
  - **`<colgroup>`을 지우지 말 것**을 이유와 함께 한 줄로 적는다. 첫 헤더 줄이 병합 칸이라 없으면 열 너비가 무시되고 전체 폭만 퍼진다.
  - 행 높이 조절 한 줄: 행 머리 아래 손잡이, `fabric.request.rowHeights`, 더블클릭 초기화, 기본보다 작게 못 줄임.
  - R140 문장 "옵션 칸은 한 줄 말줄임"을 "모든 셀은 줄바꿈하고 넘치면 세로 스크롤만(가로 없음)"으로 바꾼다.
- "## 보기 설정" 절 키 목록에 `fabric.request.rowHeights`를 더한다.

## 하지 말 것
- `startColumnResize`, `startGroupResize`, `colWidths` 저장 형식을 바꾸지 않는다.
- R139 병합 구조, R141 선택·키보드·클립보드, R142 불러오기 코드를 바꾸지 않는다.
- 행 높이를 `requests` 데이터나 Firestore에 저장하지 않는다(개인 보기 설정이다).
- ref 콜백 안에서 setState 하지 않는다.
- R135~R142 미커밋 변경을 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `FabricRequest.tsx`, `CLAUDE.md`, (필요 시) `view-prefs.ts`, 이 문서만 더해진다.
