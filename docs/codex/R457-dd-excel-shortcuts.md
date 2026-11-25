# R457 — DD MASTER 에 엑셀식 단축키 일곱 개를 더한다

상태: 미착수. 자리와 가드 확인 완료, 시공 대기.

## 요구

2026-11-25 박향근. "DD 화면 처음 만들 때부터 최대한 엑셀과 이질감 없이 동일하게 작업할 수 있는 환경 구축을 요청했었다. 속도나 기능 측면으로 부족한 것이 있을지 검토해봐."

검토 결과 중 키보드 쪽이다. 일곱 개가 빠져 있고 전부 `onKey`(3283행)에 분기가 없는 것을 읽어 확인했다. R456(Home·End)과 같은 자리이고 같은 틀을 쓴다.

| 키 | 하는 일 |
|---|---|
| Ctrl+방향키 | 데이터 블록 끝으로 뛴다 |
| Ctrl+Shift+방향키 | 같은 자리까지 선택을 넓힌다 |
| Ctrl+A | 보이는 표 전체 선택 |
| Ctrl+Space | 그 열 전체 선택 |
| PageUp, PageDown | 한 화면씩 |
| Ctrl+세미콜론 | 그 칸에 오늘 날짜 |
| Ctrl+F | 도구줄 검색칸으로 |

## 먼저 알아 둘 것

- 고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` **하나뿐이다.**
- 행은 `filtered`(걸러진 뒤 보이는 행), 열은 `displayedColumns`(숨긴 열과 접은 그룹을 뺀 열)다. 개수는 `filtered.length` 와 `displayedColumns.length` 다. **`records.length` 나 `GROUPS` 전체 열 수를 쓰지 말 것.** 화면에 없는 칸에 선택이 선다.
- `moveSelection`(2543행)이 선택 갱신, `extend` 처리, `scrollCellIntoView` 보정을 전부 한다. **새 이동 경로를 만들지 말 것.**
- 새 분기는 `moveSelection` 의 방향 사슬에서 **반드시 `right` 분기보다 앞**이다. 사슬의 마지막 `else` 가 `left` 를 받으므로 뒤에 붙이면 왼쪽 이동으로 떨어진다. R456 이 같은 함정을 적어 두었다.
- `moveSelection`(2543행)이 `rawCellText`(2605행)와 `pageRows` 를, `onKey`(3283행)가 `commitCell`(3558행)을 부른다. **선언이 뒤에 있다고 함수를 위로 옮기지 말 것.** 전부 같은 컴포넌트 본문의 `const` 이고 키 이벤트는 렌더가 끝난 뒤에 돌아서 그때는 값이 다 들어와 있다.

## 조치

### 1. `CellMove` 에 값 여섯을 더한다 (88행)

지금(R456 까지 반영된 모습):

```ts
/** `rowStart`·`rowEnd` 는 Home·End 로 그 행의 양 끝 칸, `sheetStart`·`sheetEnd` 는 Ctrl 을 함께 눌러 표의 양 끝 칸이다(R456). */
type CellMove = "up" | "down" | "left" | "right" | "rowStart" | "rowEnd" | "sheetStart" | "sheetEnd"
```

바꿀 것:

```ts
/** `rowStart`·`rowEnd` 는 Home·End 로 그 행의 양 끝 칸, `sheetStart`·`sheetEnd` 는 Ctrl 을 함께 눌러 표의 양 끝 칸이다(R456).
 *  `block*` 은 Ctrl+방향키로 데이터 블록 끝, `page*` 는 PageUp·PageDown 으로 한 화면이다(R457). */
type CellMove =
  | "up" | "down" | "left" | "right"
  | "rowStart" | "rowEnd" | "sheetStart" | "sheetEnd"
  | "blockUp" | "blockDown" | "blockLeft" | "blockRight"
  | "pageUp" | "pageDown"
```

### 2. 한 화면 행 수를 재는 함수 (`moveSelection` 바로 위, 2542행 근처)

```ts
  /**
   * PageUp·PageDown 한 번에 넘길 행 수. 보이는 행들의 **실제 높이 평균**으로 센다.
   *
   * **행 높이를 32 로 박지 말 것.** Alt+Enter 로 줄바꿈을 확정한 행은 그보다 높다(R437).
   * 창고가 쓰는 `ROW_HEIGHT = 32` 고정 방식은 그래서 이 표에 못 쓴다.
   * 머리말은 sticky 라 보이는 높이에서 뺀다. 마지막 한 줄은 눈이 따라가게 겹쳐 남긴다.
   */
  const pageRows = (): number => {
    const scroller = gridScrollRef.current
    const rows = scroller?.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")
    if (!scroller || !rows?.length) return 10
    let total = 0
    rows.forEach((row) => { total += row.getBoundingClientRect().height })
    const average = total / rows.length
    if (!(average > 0)) return 10
    const view = scroller.clientHeight - (theadRef.current?.getBoundingClientRect().height ?? 0)
    return Math.max(1, Math.floor(view / average) - 1)
  }
```

### 3. `moveSelection` 의 방향 사슬에 분기를 더한다 (2557행 근처)

R456 이 넣은 네 줄 **바로 뒤, `right` 분기 앞**이다.

```ts
    else if (direction === "sheetEnd") { rowIndex = rowCount - 1; colIndex = colCount - 1 }
    // PageUp·PageDown. 한 화면 행 수는 실측이다(R457).
    else if (direction === "pageUp") rowIndex = Math.max(0, rowIndex - pageRows())
    else if (direction === "pageDown") rowIndex = Math.min(rowCount - 1, rowIndex + pageRows())
    // Ctrl+방향키. 엑셀과 같은 규칙이다(R457). 아래 blockTarget 주석 참고.
    else if (direction === "blockUp" || direction === "blockDown") rowIndex = blockTarget(rowIndex, colIndex, direction === "blockUp" ? -1 : 1, true)
    else if (direction === "blockLeft" || direction === "blockRight") colIndex = blockTarget(rowIndex, colIndex, direction === "blockLeft" ? -1 : 1, false)
    else if (direction === "right") {
```

### 4. 블록 끝을 찾는 함수 (`pageRows` 바로 위)

```ts
  /**
   * Ctrl+방향키가 설 자리. **엑셀 규칙 그대로다.**
   *
   * 다음 칸이 비었으면 값이 있는 첫 칸까지 뛰고, 없으면 끝까지 간다.
   * 다음 칸에 값이 있으면 값이 이어지는 **블록의 마지막 칸**까지 뛴다.
   *
   * 단순히 행·열 끝으로 보내는 안은 버렸다. 그건 Ctrl+Home·Ctrl+End 가 이미 한다(R456).
   * DD 는 빈 칸이 흔해서, 값이 모인 덩어리 사이를 건너뛰는 엑셀 규칙이 실제로 쓸모가 있다.
   *
   * 값 판정은 `rawCellText` 다. 완료일이 비고 목표일만 적힌 칸은 화면에 기울임꼴로 보이는데
   * 그 함수가 목표일을 폴백으로 돌려주므로 **보이는 대로 값이 있는 칸으로 친다.**
   * `column.value` 를 직접 부르면 그 칸이 빈 칸으로 잡혀 눈에 보이는 것과 어긋난다.
   */
  const blockTarget = (rowIndex: number, colIndex: number, step: 1 | -1, vertical: boolean): number => {
    const limit = (vertical ? filtered.length : displayedColumns.length) - 1
    const from = vertical ? rowIndex : colIndex
    if (limit < 0) return from
    const filled = (at: number): boolean => {
      const record = vertical ? filtered[at] : filtered[rowIndex]
      const column = vertical ? displayedColumns[colIndex] : displayedColumns[at]
      return Boolean(record && column && rawCellText(record, column).trim())
    }
    const next = from + step
    if (next < 0 || next > limit) return from
    if (!filled(next)) {
      let cursor = next
      while (cursor >= 0 && cursor <= limit && !filled(cursor)) cursor += step
      return cursor < 0 || cursor > limit ? (step < 0 ? 0 : limit) : cursor
    }
    let cursor = next
    while (cursor + step >= 0 && cursor + step <= limit && filled(cursor + step)) cursor += step
    return cursor
  }
```

### 5. 열 전체 선택 (`selectWholeRow` 바로 아래, 2455행 근처)

`selectWholeRow` 와 짝이다. 글자까지 대칭으로 둔다.

```ts
  /** Ctrl+Space. `selectWholeRow` 의 짝이고 보이는 행 전체를 잡는다(R457). */
  const selectWholeColumn = (colId: string, extend = false) => {
    const first = filtered[0], last = filtered[filtered.length - 1]
    if (!first || !last) return
    const top = recordIdentity(first), bottom = recordIdentity(last)
    setRange((current) => extend && current
      ? { anchor: { row: top, col: current.anchor.col }, focus: { row: bottom, col: colId } }
      : { anchor: { row: top, col: colId }, focus: { row: bottom, col: colId } })
  }
```

### 6. `onKey` 에 분기를 더한다

`mod` 는 함수 앞머리(3288행)의 `event.ctrlKey || event.metaKey` 다. **새로 만들지 말 것.**

#### 6-1. Ctrl+F, Ctrl+A, Ctrl+세미콜론 (기존 `mod &&` 사슬 끝, `if (mod && key === "y")` 줄 바로 뒤)

```ts
    if (mod && key === "f") { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return }
    if (mod && key === "a") {
      event.preventDefault()
      const firstRow = filtered[0], lastRow = filtered[filtered.length - 1]
      const firstCol = displayedColumns[0], lastCol = displayedColumns[displayedColumns.length - 1]
      if (!firstRow || !lastRow || !firstCol || !lastCol) return
      setRange({ anchor: { row: recordIdentity(firstRow), col: firstCol.id }, focus: { row: recordIdentity(lastRow), col: lastCol.id } })
      return
    }
    if (mod && key === ";") {
      event.preventDefault()
      if (!editEnabled) { notify(editDeniedMessage); return }
      const focus = range?.focus
      const rowIndex = focus ? rowIndexOf.get(focus.row) : undefined
      const colIndex = focus ? colIndexOf.get(focus.col) : undefined
      const record = rowIndex === undefined ? undefined : filtered[rowIndex]
      const column = colIndex === undefined ? undefined : displayedColumns[colIndex]
      if (!record || !column) return
      if (!column.date) { notify("날짜 열에서만 오늘 날짜를 넣습니다."); return }
      if (isLockedCell(record, column, isAdmin)) { notify("고칠 수 없는 칸입니다."); return }
      const now = new Date()
      // 저장 형식은 `YYYY-MM-DD` 이고 **로컬 날짜**다. **`toISOString()` 을 쓰지 말 것.**
      // 그것은 UTC 라 한국(UTC+9)에서는 오전 9시 전에 어제 날짜가 들어간다.
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      void commitCell(record, column, today)
      return
    }
```

**Ctrl+A 가 `preventDefault` 를 빼면 브라우저가 페이지 글자를 통째로 잡는다.** 지금이 그 상태다.

**Ctrl+세미콜론은 포커스 칸 하나에만 넣는다.** 엑셀과 같다. 선택 전체에 같은 값을 넣는 것은 Ctrl+Enter 가 이미 한다. `commitCell` 은 `isAcceptableCellValue` 검사, `updateRecordCell`, `commitRecords`, 목표일 사유 창(`askDelayReason`)을 모두 지나는 **단 하나의 저장 길목이다. 우회로를 만들지 말 것.** 작업 이력과 되돌리기가 빠진다.

#### 6-2. Ctrl+Space (기존 `event.shiftKey && event.code === "Space"` 줄 **앞**)

```ts
    if (mod && event.code === "Space") { if (range) { event.preventDefault(); selectWholeColumn(range.focus.col, event.shiftKey) }; return }
```

**Shift+Space 분기보다 앞이다.** 뒤에 두면 Ctrl+Shift+Space 가 행 선택으로 먼저 걸린다.

#### 6-3. Ctrl+방향키, PageUp·PageDown (R456 이 넣은 Home·End 블록 뒤, `Tab` 분기 앞)

지금 `Arrow` 분기는 이렇다.

```ts
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      const direction = event.key.slice(5).toLowerCase() as CellMove
      moveSelection(direction, event.shiftKey)
      return
    }
```

바꿀 것. **Ctrl 을 보는 줄 하나가 더해진다.**

```ts
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      const arrow = event.key.slice(5) as "Up" | "Down" | "Left" | "Right"
      // Ctrl+방향키는 데이터 블록 끝으로 뛴다(R457). 그냥 방향키는 한 칸이다.
      moveSelection(mod ? `block${arrow}` as CellMove : arrow.toLowerCase() as CellMove, event.shiftKey)
      return
    }
```

그리고 Home·End 블록 뒤에 더한다.

```ts
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault()
      moveSelection(event.key === "PageUp" ? "pageUp" : "pageDown", event.shiftKey)
      return
    }
```

### 7. 검색칸에 `ref` 를 단다

선언은 다른 `useRef` 들 옆이다(1774행 `gridScrollRef` 근처).

```ts
  /** Ctrl+F 가 여기로 포커스를 보낸다(R457). */
  const searchRef = useRef<HTMLInputElement>(null)
```

3824행의 `<Input value={search} ... />` 에 `ref={searchRef}` 를 더한다. **다른 속성은 건드리지 말 것.** `Input` 은 `forwardRef` 라 그대로 받는다.

## 하지 말 것

- **`onKey` 맨 앞의 편집 중 가드(3286행)를 손대지 말 것.** 인라인 편집기나 모달 입력칸에 포커스가 있으면 거기서 바로 `return` 한다. 편집 중 Ctrl+A 와 Ctrl+F 는 **글자를 다루는 것이 맞다.** 가로채면 타자 중에 선택이 날아간다.
- **`records.length` 나 `GROUPS` 전체 열 수를 쓰지 말 것.** 전부 `filtered` 와 `displayedColumns` 기준이다.
- **새 방향 값을 `right` 분기 뒤에 붙이지 말 것.** 왼쪽 이동으로 떨어진다.
- **행 높이를 32 로 박지 말 것.** Alt+Enter 행이 더 높다(R437).
- **`toISOString()` 으로 오늘 날짜를 만들지 말 것.** UTC 라 오전에 어제가 들어간다.
- **`commitCell` 을 거치지 않는 저장 경로를 만들지 말 것.**
- **`moveSelection` 의 `wrap` 인자를 쓰지 말 것.** Tab 전용이다.
- **`selectWholeRow` 를 고치지 말 것.** `selectWholeColumn` 은 새로 만드는 짝이다.
- **다른 화면(`FabricRequest.tsx`, `Warehouse.tsx`)은 이번에 고치지 않는다.**
- **채우기 핸들, 가상 스크롤은 이번 범위가 아니다.** 따로 정한다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라. 고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다.

실제 키 동작은 박향근이 화면에서 본다. Codex 도 클로드도 로그인이 필요해 확인하지 못한다.
