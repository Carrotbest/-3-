# R141 FABRIC REQUEST에 DD MASTER 편집 기능 이식 (선택·키보드·클립보드·되돌리기)

상태: 미착수. R139(스타일 병합 블럭)·R140(컴팩트 톤) 위에서 한다.

## 요구 (사용자)
FABRIC REQUEST 표에도 DD MASTER의 편집 기능을 대부분 넣는다. 키보드 단축키를 포함한다.

## 참고 구현 (`src/routes/DevelopmentMasterSheet.tsx`, 읽기만 하고 고치지 말 것)
| 기능 | 위치 |
|---|---|
| 타입 `CellRef`, `CellMove`, `CellRect`, `CellSel` | 55~75행 |
| `selectionShadow(sel)` 선택 테두리, `FillHandle` | 140행, 166행 |
| 인라인 편집기 키 처리 `editorKeyHandler` | 810행 (Enter/Shift+Enter 위아래, Tab/Shift+Tab 좌우, Ctrl+Enter 선택 영역 전체 적용, Esc 취소, `stopPropagation` 필수) |
| `range {anchor, focus}`, 메뉴, undo 스택 state | 1103~1105행 |
| `rect` 계산 | 1529행 |
| 행 머리 드래그 선택 `onRowMouseDown` | 1404행 |
| 채우기 핸들 `startFill` | 1607행 |
| 행 전체 선택 `selectWholeRow` | 1644행 |
| 이동 `moveSelection(direction, extend, wrap)` | 1672행 |
| 편집 시작 `beginCellEdit(cellRef, seed?)` | 1704행 |
| 아래로 채우기 `fillDown` | 1873행 |
| 복사·잘라내기 `copyRange(cut)` (TSV) | 2021행 |
| 지우기 `clearRange` | 2033행 |
| 붙여넣기 `pasteRange` (TSV) | 2053행 |
| 되돌리기 `undoLast`, 다시 실행 `redoLast` (스냅샷 스택 50개) | 2113~2131행 |
| 키보드 `onKey`와 window 리스너 1회 등록(`keyHandlerRef`) | 2133~2173행 |
| 우클릭 메뉴 항목 | 2600~2640행 근처 |
| 찾기·바꾸기 대화상자 `replaceOpen` | 1086행, 2759행 |

## 이식 범위
1. **셀 선택**
   - 클릭으로 활성 셀을 정한다. Shift+클릭으로 범위를 넓히고, 드래그로 범위를 잡는다.
   - 행 머리(#)를 클릭하면 블럭의 전체 줄을 선택한다. Shift를 누르고 클릭하면 확장한다.
   - 선택 모양은 DD MASTER와 같다. 범위 틴트는 `--grid-selection` 8%이고, 테두리는 `selectionShadow`다. 활성 셀 오른쪽 아래에 `FillHandle`을 둔다.
   - 선택 중에는 브라우저 기본 텍스트 선택을 막는다(CLAUDE.md 주의: 셀 `mousedown`에서 `preventDefault`, 버튼·입력칸 위에서는 걸지 않음).
2. **키보드** (`window` keydown 1회 등록, 입력칸·모달 포커스 중이면 무시, `isComposing` 무시)
   - 방향키로 이동하고, Shift+방향키로 범위를 넓힌다.
   - Tab/Shift+Tab은 좌우로 이동하고 줄 끝에서 다음 줄로 넘어간다. Enter/Shift+Enter는 위아래로 이동한다.
   - F2 또는 글자 입력으로 편집을 시작한다. 입력한 글자가 편집기 첫 값이 된다.
   - Esc는 선택과 메뉴를 해제한다.
   - Delete/Backspace는 범위 내용을 지운다.
   - Shift+Space는 줄 전체를 선택한다.
   - Ctrl+C 복사, Ctrl+X 잘라내기, Ctrl+V 붙여넣기, Ctrl+D 아래로 채우기다.
   - Ctrl+Z 되돌리기, Ctrl+Y 또는 Ctrl+Shift+Z 다시 실행이다.
   - Ctrl+H 찾기·바꾸기(선택 범위 또는 전체)다.
3. **인라인 편집기**: 기존 `CellEditor`(text, area, number, member)에 `editorKeyHandler`와 같은 키 규칙을 적용한다. Enter는 커밋 후 아래로 이동한다. `area`(여러 줄)는 Alt+Enter로 줄을 바꾼다. Ctrl+Enter는 선택 범위 전체에 같은 값을 넣는다. **키 이벤트에 `stopPropagation`을 반드시 건다**(CLAUDE.md 주의 항목).
4. **채우기 핸들 드래그**와 **Ctrl+D**: 범위 맨 윗줄 값을 아래로 복사한다.
5. **우클릭 메뉴**(DD MASTER 메뉴 모양): 복사, 잘라내기, 붙여넣기, 내용 지우기, 옵션 위에 삽입, 옵션 아래에 삽입, 옵션 삭제, 줄 전체 선택, 되돌리기, 다시 실행, 스타일 수정, 스타일 삭제. 단축키 힌트를 표시한다. 기존 `rowMenu`를 이 메뉴로 대체한다.
6. **되돌리기·다시 실행**: `requests` 배열 스냅샷 스택(최대 50)이다. 편집, 붙여넣기, 지우기, 채우기, 바꾸기, 옵션 삽입·삭제 직전에 넣는다. 복원은 `saveRequests(snapshot)`다. 작업 이력(`audit.ts`)은 `saveRequests` 길목에서 자동으로 남으니 따로 부르지 않는다.

## 병합 블럭 좌표 모델 (핵심, 이대로 구현)
- **격자 줄(slot)**: 스타일 블럭마다 `max(1, style.options.length)`개다. "옵션 추가" 줄은 격자에 넣지 않는다. 격자 줄 순서는 화면 순서(`visible` 스타일 순서, 스타일 안 옵션 순서)다.
- **격자 열**: `visibleColumns` 순서다. `image` 열은 선택만 되고 편집, 붙여넣기, 지우기에서 제외한다.
- **셀 해석** `resolveCell(slotIndex, columnId)`:
  - style 열은 그 slot이 속한 스타일이다(블럭 안 모든 slot이 같은 셀).
  - option 열은 `style.options[slot 안 순번]`이다. 옵션이 0개인 블럭의 유일한 slot은 "빈 옵션 자리"다.
- **이동**
  - style 열에서 위아래로 움직이면 블럭 단위로 건너뛴다(병합 셀을 한 칸으로 본다).
  - option 열에서는 slot 단위로 움직인다.
  - 좌우 이동은 열 단위다. option 열에서 style 열로 가면 같은 블럭의 병합 셀이 활성이 된다.
- **범위 표시**: 병합 셀은 그 블럭 slot 중 하나라도 범위 안이면 범위 안으로 칠한다.
- **복사(TSV)**: 범위의 slot×열을 돈다. style 열 값은 **블럭의 첫 slot에만** 쓰고, 나머지 slot은 빈 칸이다(엑셀 병합 셀 복사와 같다). toggle(URGENT)은 `Y` 또는 빈 칸이다.
- **붙여넣기(TSV)**: 활성 셀부터 slot×열로 채운다.
  - style 열은 블럭의 첫 slot 값만 반영하고, 같은 블럭 나머지 slot 값은 무시한다.
  - option 열에서 대상 slot이 "빈 옵션 자리"면 옵션 1개를 새로 만든다(`blankOption` + `renumber`). 붙여넣을 줄이 블럭의 옵션 수보다 많아도 **새 옵션을 자동으로 늘리지 않는다.** 다음 블럭 slot으로 이어진다.
  - 범위가 한 칸이고 클립보드도 한 칸이면 DD MASTER처럼 선택 범위 전체에 채운다.
  - toggle 값은 `y|yes|true|1|urgent|o`(대소문자 무시)면 참이다.
  - number 열은 숫자로 바꿀 수 없으면 건너뛰고, 건너뛴 수를 알림으로 보인다.
- **지우기**: style 열은 빈 문자열(toggle은 false), option 열은 빈 문자열이다. 옵션 행 자체는 지우지 않는다.
- **옵션 삽입·삭제**: 범위가 걸친 slot 기준이다. 삽입은 해당 스타일의 옵션 배열에 빈 옵션을 넣고 `renumber`한다. 삭제는 선택된 옵션들을 빼고 `renumber`한다. 여러 스타일에 걸치면 스타일마다 처리한다.
- **값 쓰기**: 기존 `commitCell(line, columnId, next)`의 값 변환을 그대로 쓴다. 여러 셀을 바꾸는 작업은 `requests`를 한 번에 새 배열로 만들어 `saveRequests`를 **한 번만** 부른다(셀마다 저장 금지, 동기화 비용).

## 파일
| 파일 | 조치 |
|---|---|
| `src/routes/FabricRequest.tsx` | 위 기능 전부. 편집 상태 `editCell`(문자열 키)는 `CellRef` 기반으로 바꿔도 된다. 기존 더블클릭 편집, URGENT 더블클릭 토글은 유지한다. |
| `src/components/data-table/grid-selection.tsx` (신규, 선택) | `CellRef`, `CellRect`, `CellSel`, `selectionShadow`, `FillHandle`을 FABRIC REQUEST에서 쓸 사본으로 둔다. **DD MASTER는 고치지 않는다**(DD MASTER를 이 파일로 옮기는 리팩터링은 이번 범위가 아니다). |
| `CLAUDE.md` | "## FABRIC REQUEST" 절에 3줄을 더한다. (1) 편집은 DD MASTER와 같은 단축키다. (2) 격자는 slot(블럭당 max(1, 옵션 수)) × visibleColumns다. style 열은 블럭 병합 셀이고, 복사는 첫 slot에만 값을 쓰며, 붙여넣기는 옵션을 자동으로 늘리지 않는다. (3) 여러 셀 작업은 saveRequests 한 번이다. |

## 제외 (이번에 넣지 않음)
- 행(스타일) 끌어 옮기기: 정렬 기준이 `seq` Select다.
- 열 머리 ▼ 필터 메뉴: 편집 기능이 아니다.
- DD MASTER의 "행 N개 추가", "복사한 행 삽입": 신규 의뢰 버튼과 옵션 추가 줄이 대신한다.

## 하지 말 것
- `DevelopmentMasterSheet.tsx`, `ColumnFilterMenu.tsx`, `StyleHoverLayer.tsx`를 고치지 않는다.
- 데이터 모델, `request-template.ts`, 업로드·양식, 사진 업로드 로직을 바꾸지 않는다.
- R139 병합 렌더 구조와 R140 모양을 바꾸지 않는다. 선택 틴트·테두리만 더한다.
- ref 콜백 안에서 setState 하지 않는다. window keydown 리스너를 렌더마다 다시 달지 않는다.
- R135~R140 미커밋 변경을 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `FabricRequest.tsx`, (선택) `grid-selection.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
