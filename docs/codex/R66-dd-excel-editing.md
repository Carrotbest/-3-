# R66 — DD MASTER 엑셀식 편집 (키보드 조작 · 채우기 · 행 삽입삭제 · 정렬 · 찾기바꾸기 · 선택 표시)

상태: **미착수**. Codex가 처음부터 구현한다.
선행 작업(R65 이후 Claude가 구현·검증 완료, 아직 미커밋)은 이미 워킹트리에 반영돼 있다. `npx tsc --noEmit` 통과 상태에서 시작한다.

대상 파일: `src/routes/DevelopmentMasterSheet.tsx` (거의 전부), 필요 시 `src/store/useAppStore.ts`.

---

## 0. 지금 이미 되어 있는 것 (건드리지 말고 위에 얹을 것)

`src/routes/DevelopmentMasterSheet.tsx` 현재 상태:

- **행 머리글**: 좌측 고정 번호 칸. `<td data-row-header>`, 폭 상수 `ROW_HEADER_WIDTH = 40`. 클릭=행 전체 선택(`selectWholeRow`), 끌기=행 순서 이동(담당 필터가 걸린 경우만), 우클릭=메뉴.
- **범위 선택**: `range: { anchor: CellRef; focus: CellRef } | null` + 파생 `rect: {top,bottom,left,right} | null`. 인덱스 맵 `rowIndexOf`(filtered 기준), `colIndexOf`(displayedColumns 기준). 셀 `<td data-col-id={column.id}>`.
- **마우스**: `onRowMouseDown`이 tr에 걸려 있고, 전역 `mousemove/mouseup` useEffect가 범위 드래그(`selectingRef`)와 행 이동 드래그(`dragStartRef`/`dragRowRef`/`dragOverRef`)를 함께 처리한다.
- **클립보드**: `copyRange(cut)`, `pasteRange()`, `clearRange()`, `insertCopiedRows()`. TSV(`\t`,`\n`)로 엑셀과 상호 복사 가능. `clipRef`(내부 버퍼), `cutRangeRef`. 수식/대장연결 열은 `isFixedColumn`으로 건너뜀.
- **되돌리기**: `undoSnapshot: DevRecord[] | null` 1단계. `commitRecords(build)`가 저장 직전 `rankOf(before)`로 **편집 전 순서를 sortOrder에 고정**(행이 튀지 않게)한 뒤 `writeDevelopmentRecords(next)` 호출.
- **스토어**: `writeDevelopmentRecords(records, recalculate = true)`, `reorderDevelopmentRecords(orderedIdentities)`, `deleteDevelopmentRecord(identity)`.
- **우클릭 메뉴**: `menu: {x,y}` 상태. 항목 = 복사 / 잘라내기 / 붙여넣기 / 복사한 행 삽입 / 내용 지우기 / 행 전체 선택 / 되돌리기.
- **단축키(기존)**: Ctrl+C/X/V/Z, Delete, Shift+Space, Escape. 전역 `keydown` useEffect(의존성 배열 없음 → 매 렌더 재등록, 최신 클로저 유지)에서 처리. 입력요소에 포커스가 있으면 가로채지 않는다.
- **정렬 모델**: `compareManualOrder` = `sortOrder` 있으면 우선(오름차순), 없으면 `compareRequestDate`(접수일 **오래된 순**). `sortOrder` 없는 행은 아래로.

용어: `recordIdentity(record)` = `` `${record._src.sheet}::${record._src.row}` ``.

---

## 1. 선택 표시를 실제 엑셀과 동일하게 (최우선, 눈에 바로 보임)

현재는 선택 셀마다 연회색 채움 + 활성 셀에 `ring-2`. 이걸 엑셀과 같게 바꾼다.

요구사항:
1. **범위 채움**: 선택 영역은 연한 파란 채움. `bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]`.
2. **활성 셀은 채우지 않는다**. 엑셀에서 활성 셀만 흰색으로 남는 그 모양. 단일 셀 선택이면 테두리만 보인다.
3. **범위 바깥 변에만 두꺼운 테두리**. 셀마다 그리지 말고, 사각형의 top/bottom/left/right 변에 해당하는 셀에만 `box-shadow: inset` 으로 2px 선을 넣어 한 덩어리로 보이게 한다.
4. **우하단 채우기 핸들**: 사각형 오른쪽 아래 모서리에 작은 정사각형(약 7px, 흰 테두리, `var(--primary)` 배경). 3절의 채우기 드래그 시작점.

구현 힌트(참고용, 그대로 쓸 필요 없음):

```tsx
interface CellSel { inRange: boolean; isActive: boolean; top: boolean; bottom: boolean; left: boolean; right: boolean; handle: boolean }

function selectionShadow(sel: CellSel): string | undefined {
  if (!sel.inRange) return undefined
  const parts: string[] = []
  if (sel.top) parts.push("inset 0 2px 0 0 var(--primary)")
  if (sel.bottom) parts.push("inset 0 -2px 0 0 var(--primary)")
  if (sel.left) parts.push("inset 2px 0 0 0 var(--primary)")
  if (sel.right) parts.push("inset -2px 0 0 0 var(--primary)")
  return parts.length ? parts.join(", ") : undefined
}
```

행 렌더 안에서 `cellSel(colId): CellSel`을 한 번 만들어 고정 열(`PINNED_COLUMNS`)과 그룹 열(`GridCell`) 양쪽에 같은 규칙을 적용한다.
`GridCell`의 기존 `highlighted` / `selected` prop을 `sel: CellSel` 하나로 교체하고, 채우기 핸들은 `sel.handle`인 셀에만 렌더한다(그 `<td>`에 `relative` 필요).
고정 열 셀도 동일하게 처리해서 행 전체 선택 시 좌측 고정 영역까지 한 덩어리로 보이게 한다.

## 2. 드래그할 때 브라우저 텍스트 선택이 잡히지 않게

현재 셀을 끌면 브라우저 기본 텍스트 선택(파란 하이라이트)이 줄 단위로 잡힌다. 엑셀에는 없는 현상이다.

- 표(`<table>`)에 `select-none`을 준다.
- 단, 인라인 편집기 `<input>`/`<textarea>` 안에서는 텍스트 선택이 되어야 한다 → `[&_input]:select-text [&_textarea]:select-text` 같은 식으로 예외를 둔다.
- 기존 전역 mousemove 핸들러가 드래그 중 `document.body.style.userSelect = "none"`을 넣는 코드가 있는데, 위 처리와 중복되면 정리한다.

---

## 3. 우선순위 높음 묶음 — 키보드 조작

전역 `keydown` useEffect를 확장한다. 입력요소 포커스 중에는 기존처럼 가로채지 않는다(단, 인라인 편집기 내부의 Enter/Tab/Esc는 편집기 자체에서 처리).

### 3-1. 방향키 셀 이동
- `ArrowUp/Down/Left/Right`: 활성 셀을 한 칸 이동. `range`를 `{anchor: 새셀, focus: 새셀}`로 재설정(단일 셀 선택).
- 이동 범위: 행은 `filtered` 0..length-1, 열은 `displayedColumns` 0..length-1로 클램프.
- **이동한 셀이 화면 밖이면 스크롤**해서 보이게 한다. `[data-route-scroll-root]` 컨테이너 기준으로 `scrollIntoView({ block: "nearest", inline: "nearest" })` 또는 직접 scrollTop/scrollLeft 계산. 좌측 고정 열(`sticky`)에 가려지지 않도록 주의.
- `range`가 없으면 첫 셀(0,0)을 선택한다.

### 3-2. Shift+방향키 범위 확장
- `anchor`는 그대로 두고 `focus`만 한 칸 이동. 즉 `extendTo`.
- 확장된 `focus` 셀이 보이도록 스크롤.

### 3-3. Enter / Tab 이동
- **Tab**: 오른쪽 한 칸. 마지막 열이면 다음 행 첫 열로 넘어간다. **Shift+Tab**은 반대.
- **Enter**: 아래 한 칸. 마지막 행이면 그대로 둔다. **Shift+Enter**는 위로.
- 편집 중일 때 Enter/Tab을 누르면 **값을 저장하고 그 방향으로 이동**한다. 이게 이 묶음에서 제일 중요하다(연속 입력 속도).
  - 구현: `InlineEditor`의 `onCommit` 시그니처를 `(raw: string, move?: "up"|"down"|"left"|"right") => void`로 넓히고, 편집기 내부 `onKeyDown`에서 Enter→`down`, Shift+Enter→`up`, Tab→`right`, Shift+Tab→`left`를 실어 보낸다(해당 키는 `preventDefault`).
  - `commitCell`이 저장 후 그 방향으로 활성 셀을 옮긴다.
- Tab의 브라우저 기본 포커스 이동은 `preventDefault`로 막는다.

### 3-4. F2 / 바로 타이핑해서 편집
- **F2**: 활성 셀의 인라인 편집기를 연다(기존 값 유지). 수정 불가 열(`isFixedColumn`)이면 무시.
- **인쇄 가능한 문자 키**(길이 1, Ctrl/Alt/Meta 없음): 편집기를 열고 **그 글자로 값을 대체**해서 시작한다(엑셀 동작).
  - `InlineEditor`에 `initial?: string` prop을 추가해 `defaultValue` 대신 쓰게 한다.
  - 컴포넌트 쪽에 `editSeed: string | undefined` 상태를 두고 편집 시작 시 함께 세팅, 편집 종료 시 비운다.
- 한글 입력(IME) 주의: `event.isComposing`이면 가로채지 말 것.

### 3-5. 되돌리기 여러 단계 + 다시 실행
- `undoSnapshot` 단일 값을 **스택 2개**로 교체한다.
  - `undoStack: DevRecord[][]`, `redoStack: DevRecord[][]`
  - `commitRecords`: 저장 전 `before`를 `undoStack`에 push(상한 **50**, 넘으면 오래된 것부터 버림), `redoStack`은 비운다.
  - `undo`: `undoStack` pop → 현재 `records`를 `redoStack`에 push → pop한 값을 `writeDevelopmentRecords(값, false)`로 복원.
  - `redo`: 반대.
- 단축키: `Ctrl+Z`(되돌리기), `Ctrl+Y` **및** `Ctrl+Shift+Z`(다시 실행).
- 툴바 버튼: 기존 "되돌리기" 옆에 **"다시 실행"** 추가. 각각 스택이 비면 `disabled`. 아이콘은 `Undo2` / `Redo2`(lucide).
- 우클릭 메뉴에도 "다시 실행" 추가.
- `insertCopiedRows`, `confirmDeleteRecord`, `handleRowDrop` 등 기존에 `setUndoSnapshot`을 부르던 자리도 전부 스택 push로 바꾼다.

---

## 4. 다음 묶음 — 편집 보조

### 4-1. 채우기 핸들 드래그
- 1절에서 만든 우하단 핸들을 끌면, 끄는 방향(아래 또는 오른쪽)으로 선택 영역이 늘어나고 **원본 값이 반복 채워진다**.
- 드래그 중에는 대상 범위를 점선 테두리 등으로 미리 보여준다.
- 놓으면 `commitRecords`로 일괄 저장(되돌리기 대상).
- 원본이 여러 셀이면 패턴을 반복한다(예: 원본 2행 → 아래로 6행 채우면 2행 패턴 3회).
- 숫자 연속 증가(1,2,3...)까지는 하지 않는다. **단순 반복 복사만** 한다.
- 수식/대장연결 열은 건너뛴다.

### 4-2. Ctrl+D — 위 값 아래로 채우기
- 선택 영역의 **첫 행** 값을 나머지 행에 채운다. 열 여러 개면 열별로 각각.
- 선택이 단일 셀이면 바로 위 셀 값을 복사해 넣는다.

### 4-3. Ctrl+Enter — 선택 영역 일괄 입력
- **편집 중** Ctrl+Enter: 지금 입력한 값을 선택 영역 전체에 넣고 편집을 닫는다.
- 편집 중이 아니면 무시.

### 4-4. 행 삽입 / 행 삭제 (우클릭 메뉴)
- **위에 행 삽입** / **아래에 행 삽입**: 빈 행(`createBlankDevRecord()`)을 선택 행 위/아래에 넣는다. 선택된 행이 N개면 N개 삽입(엑셀과 동일).
- **행 삭제**: 선택된 행 전부 삭제. 2행 이상이면 확인 다이얼로그를 띄운다(기존 `confirmDelete` 다이얼로그를 여러 행 지원으로 확장).
- 삽입 시 순서는 `insertCopiedRows`와 같은 방식으로 `sortOrder`를 최종 위치 인덱스로 재부여한다.
- 전부 되돌리기 대상.

### 4-5. 열 머리글 클릭 정렬
- 열 머리글(`<th>`) 클릭 → 그 열 기준 **오름차순 → 내림차순 → 해제(기본 순서)** 3단 토글.
- 상태: `sortBy: { col: string; dir: "asc" | "desc" } | null`.
- 정렬 중일 때 머리글에 방향 아이콘(`ChevronUp`/`ChevronDown`) 표시.
- 값 비교는 `column.value()` 기준. 숫자 열(`column.number`)은 숫자 비교, 날짜 열(`column.date`)은 날짜 비교, 나머지는 `localeCompare(…, "ko-KR", { numeric: true })`. 빈 값은 항상 뒤로.
- **정렬이 걸려 있는 동안은 행 드래그 이동을 막는다**(`dragEnabled`에 `sortBy === null` 조건 추가). 머리글 옆이나 툴바에 "정렬 해제" 수단을 둔다.
- 열 너비 조절 핸들(`onMouseDown`으로 리사이즈 시작하는 `<span>`)과 클릭이 충돌하지 않게 할 것 — 리사이즈 핸들 위 클릭은 정렬을 트리거하지 않는다.

### 4-6. 찾기 · 바꾸기 (Ctrl+H)
- 다이얼로그: 찾을 내용 / 바꿀 내용 / 대상(선택 영역 · 전체) / 대소문자 구분 체크.
- 버튼: **모두 바꾸기**만 있으면 된다(하나씩 바꾸기는 생략).
- 부분 문자열 치환. 수식·대장연결 열은 제외.
- 결과를 알림으로 표시(예: `12개 셀을 바꿨습니다`). 되돌리기 대상.
- 기존 `Dialog` 컴포넌트(`src/components/ui/dialog.tsx`) 사용. 이 파일은 배경 투명 버그 때문에 `var(--card)`를 명시해 쓰는 규칙이 있으니 기존 다이얼로그들을 따라갈 것.

---

## 5. 지켜야 할 것

- **기존 동작을 깨지 말 것**: 행 머리글 드래그 이동, 담당 필터별 부분 재배치(`handleRowDrop`이 `ordered`/`globalOrdered`로 다른 담당 자리를 보존하는 로직), 신규 접수 행 상단 고정(`recentIntakeRows`), 인라인 편집, 열 너비 조절, 그룹 접기/펴기, 클립보드 4종.
- **편집 시 순서 고정 규칙 유지**: `commitRecords`가 `rankOf(before)`로 sortOrder를 굳히는 동작은 그대로 둔다. 새로 만드는 편집 경로(채우기, Ctrl+D, 찾기바꾸기 등)도 전부 `commitRecords`를 거치게 해서 같은 규칙을 타게 할 것.
- **수식·대장연결 열 보호**: 모든 쓰기 경로에서 `isFixedColumn(column)` 확인.
- 검증: `npm run build`(= `tsc --noEmit && vite build`) 통과해야 한다.
- 실데이터·단가·협력사명을 로그나 주석에 넣지 말 것. 공개 저장소다.
- 커밋하지 말 것. 사용자가 지시할 때만 커밋한다.
- 주석은 한국어로, **왜 그렇게 했는지**를 적는다. 자명한 코드에 주석을 달지 말 것.
- 기존 코드 스타일(세미콜론 없음, 2칸 들여쓰기, 한 줄 JSX 선호)을 따를 것.

## 6. 권장 작업 순서

1절(선택 표시) → 2절(텍스트 선택 차단) → 3절(키보드) → 4절(편집 보조) 순서로 하고, 각 절이 끝날 때마다 `npx tsc --noEmit`을 돌려 깨진 곳을 바로 잡는다.
1·2절은 눈에 바로 보이므로 먼저 끝내는 편이 확인하기 좋다.
