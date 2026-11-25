# R456 — DD MASTER 에서 Home·End 로 행의 양 끝 칸, Ctrl 과 함께면 표의 양 끝 칸으로 간다

상태: 미착수. 자리 확인 완료, 시공 대기.

## 요구

2026-11-25 박향근. "DD에서 키보드 Home이나 End 키를 눌렀을 때 셀의 가장 왼쪽, 가장 오른쪽으로 이동할 수 있도록 해줘." 이어서 "Ctrl + 기능도 같이 해줘".

지금은 두 키가 아무 일도 하지 않는다. `onKey`(3283행)에 분기가 없어 그냥 빠져나간다.

약속은 엑셀과 같다.

| 키 | 가는 곳 |
|---|---|
| Home | 그 행의 첫 칸 |
| End | 그 행의 끝 칸 |
| Ctrl+Home | 표의 첫 행 첫 칸 |
| Ctrl+End | 표의 끝 행 끝 칸 |

넷 다 Shift 를 같이 누르면 거기까지 선택이 넓어진다. 방향키와 같은 약속이다.

## 조치

파일 하나다. `src/routes/DevelopmentMasterSheet.tsx`. 고치는 자리가 셋이고 **기존 이동 함수 `moveSelection` 을 그대로 쓴다. 새 이동 경로를 만들지 말 것.** 그 함수가 선택 갱신, 추가 영역 처리, `scrollCellIntoView` 보정을 이미 한다.

### 1. `CellMove` 에 값 넷을 더한다 (88행)

지금:

```ts
type CellMove = "up" | "down" | "left" | "right"
```

바꿀 것:

```ts
/** `rowStart`·`rowEnd` 는 Home·End 로 그 행의 양 끝 칸, `sheetStart`·`sheetEnd` 는 Ctrl 을 함께 눌러 표의 양 끝 칸이다(R456). */
type CellMove = "up" | "down" | "left" | "right" | "rowStart" | "rowEnd" | "sheetStart" | "sheetEnd"
```

### 2. `moveSelection` 의 방향 분기에 네 줄을 끼운다 (2557~2566행)

지금:

```ts
    if (direction === "up") rowIndex = Math.max(0, rowIndex - 1)
    else if (direction === "down") rowIndex = Math.min(rowCount - 1, rowIndex + 1)
    else if (direction === "right") {
```

바꿀 것:

```ts
    if (direction === "up") rowIndex = Math.max(0, rowIndex - 1)
    else if (direction === "down") rowIndex = Math.min(rowCount - 1, rowIndex + 1)
    // Home·End 와 Ctrl 조합. 보이는 행과 열 기준이라 거른 행, 숨긴 열, 접은 그룹은 건너뛴다(R456).
    else if (direction === "rowStart") colIndex = 0
    else if (direction === "rowEnd") colIndex = colCount - 1
    else if (direction === "sheetStart") { rowIndex = 0; colIndex = 0 }
    else if (direction === "sheetEnd") { rowIndex = rowCount - 1; colIndex = colCount - 1 }
    else if (direction === "right") {
```

**반드시 `right` 분기보다 앞에 넣어라.** 이 사슬은 마지막 `else` 가 `left` 를 받는 구조다(`else colIndex = Math.max(0, colIndex - 1)`). 뒤에 붙이면 새 값이 왼쪽 이동으로 떨어진다.

`rowCount` 는 `filtered.length`, `colCount` 는 `displayedColumns.length` 다. **`records.length` 나 `GROUPS` 전체 열 수를 쓰지 말 것.** 검색·필터에 걸러진 행이나 숨긴 열로 가면 선택이 화면에 없는 칸에 선다. 두 값은 함수 앞머리에서 이미 잡아 둔 것을 그대로 쓴다.

나머지(`setRange`, `scrollCellIntoView`, `extend` 처리)는 그대로 쓴다. **손대지 말 것.**

### 3. `onKey` 에 분기를 더한다 (3302행 `Arrow` 블록 바로 뒤, `Tab` 분기 앞)

지금:

```ts
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      const direction = event.key.slice(5).toLowerCase() as CellMove
      moveSelection(direction, event.shiftKey)
      return
    }
    if (event.key === "Tab") { event.preventDefault(); moveSelection(event.shiftKey ? "left" : "right", false, true); return }
```

바꿀 것(가운데 블록이 새로 들어간다):

```ts
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      const direction = event.key.slice(5).toLowerCase() as CellMove
      moveSelection(direction, event.shiftKey)
      return
    }
    // Home·End 는 그 행의 양 끝 칸, Ctrl 을 함께 누르면 표의 양 끝 칸이다. 엑셀과 같다(R456).
    // 방향키와 같이 Shift 를 누르면 선택이 거기까지 넓어진다.
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const home = event.key === "Home"
      moveSelection(mod ? (home ? "sheetStart" : "sheetEnd") : (home ? "rowStart" : "rowEnd"), event.shiftKey)
      return
    }
    if (event.key === "Tab") { event.preventDefault(); moveSelection(event.shiftKey ? "left" : "right", false, true); return }
```

`mod` 는 함수 앞머리(3288행)에서 이미 `event.ctrlKey || event.metaKey` 로 잡아 둔 값이다. **새로 만들지 말 것.**

`event.preventDefault()` 를 빼지 말 것. 브라우저가 기본으로 화면을 맨 위·맨 아래로 굴린다.

## 하지 말 것

- **위쪽 `mod && key === ...` 사슬에 Home·End 를 끼우지 말 것.** 그 자리(3291~3298행)는 `key` 가 `event.key.toLowerCase()` 이고 Home 은 `"home"` 이라 `"h"` 분기와 부딪히지 않는다. 새 분기는 **Arrow 블록 뒤 한 곳**이다. 두 자리로 갈라 놓으면 Ctrl 유무에 따라 다른 코드가 돈다.
- **`onKey` 맨 앞의 편집 중 가드를 손대지 말 것.** 인라인 편집기나 모달 입력칸에 포커스가 있으면 그 위에서 바로 `return` 한다(3286행). 편집 중 Home·End 는 **글자 커서를 줄 양 끝으로 보내는 것이 맞다.** 표 이동으로 가로채면 타자 중에 선택이 날아간다.
- **`moveSelection` 의 `wrap` 인자를 쓰지 말 것.** 그것은 Tab 전용이고 행 끝에서 다음 행으로 넘어가는 동작이다. Home·End 는 그 행에 머문다.
- **방향키 분기의 `as CellMove` 캐스팅을 건드리지 말 것.** `event.key.slice(5).toLowerCase()` 가 내는 값은 네 방향뿐이라 새 값이 섞이지 않는다.
- **새 이동 함수나 새 상태를 만들지 말 것.** `moveSelection` 하나를 지난다.
- **다른 화면(`FabricRequest.tsx`, `Warehouse.tsx`)은 이번에 고치지 않는다.** 박향근이 DD 만 말했다. 따로 정한다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라. 워킹트리에 드래그 자동 스크롤 수정(R455)이 같은 파일에 들어 있다. **그 변경을 지우지 마라.**
- 파일을 삭제하지 마라. 고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다.

실제 동작은 박향근이 화면에서 본다. Codex 도 클로드도 로그인이 필요해 확인하지 못한다. 볼 것은 넷이다. Home 으로 담당 칸까지 가는지, End 로 마지막 보이는 열까지 가는지, Ctrl+Home 과 Ctrl+End 가 표의 첫 칸과 끝 칸으로 가는지, Shift 를 같이 누르면 그 사이가 선택되는지.
