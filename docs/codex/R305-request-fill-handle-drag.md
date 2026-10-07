# R305 — FABRIC REQUEST 채우기 핸들 끌어 채우기와 포커스 셀 스크롤

상태: 미착수.

대상 파일은 `src/routes/FabricRequest.tsx` 하나다. 다른 파일은 열지 않는다.

## 왜

REQUEST 표는 DD MASTER와 같은 셀 범위 선택, 드래그 선택, 자동 스크롤, 복사·붙여넣기, Ctrl+D를
이미 갖췄다. 그런데 **채우기 핸들(선택 영역 오른쪽 아래 작은 사각형)이 값을 채우지 않는다.**
1557행에서 핸들을 누르면 `fillRef.current = rect`만 넣고 드래그를 켜는데, 끌면 선택 범위만
넓어지고 마우스를 놓으면 1077행이 `fillRef.current = null`로 지운다. 채우는 코드가 없다.

엑셀에서 가장 많이 쓰는 동작이 보이는데 안 먹는 상태다. 이번에 이것과 화살표 이동 때
포커스 셀을 보이게 하는 것까지 둘만 한다.

DD MASTER의 같은 기능은 `src/routes/DevelopmentMasterSheet.tsx`의 `startFill`(1930행),
`updateDragAt`의 fill 분기(1738행), `commitFill`(2201행)이다. **규칙만 따르고 코드를 그대로
베끼지 마라.** DD는 행 식별자가 문자열이고 REQUEST는 slot 인덱스라 좌표 계가 다르다.

## 틀렸던 가설

없다. 위 증상은 코드에서 확인했다. 다시 조사하지 말고 바로 고쳐라.

## 지금 코드

**776행** — 이미 있다. 타입을 그대로 쓴다.
```ts
  const fillRef = useRef<CellRect | null>(null)
```

**1015~1019행**
```ts
  const onCellMouseDown = (event: React.MouseEvent, cell: CellRef) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select,[role=menu]")) return
    event.preventDefault(); dragRef.current = true; rowDragRef.current = false; lastExtendRef.current = ""; setCellAnchor(cell, event.shiftKey)
  }
  const onCellEnter = (cell: CellRef) => { if (dragRef.current) setRange((current) => current ? { ...current, focus: cell } : current) }
```

**1020~1024행** — `extendAtPointerRef.current`의 시작부
```ts
  extendAtPointerRef.current = (x, y) => {
    const target = document.elementFromPoint(x, y)
    if (!(target instanceof Element) || !scrollRef.current?.contains(target)) return
    const cellEl = target.closest<HTMLElement>("[data-slot-index][data-col-id]")
    if (rowDragRef.current) {
```

**1074~1079행** — 드래그 종료
```ts
    const up = () => {
      dragRef.current = false
      rowDragRef.current = false
      fillRef.current = null
      stopAutoScroll()
    }
```

**1140행** — `fillDown`. 바로 아래에 `commitFill`을 둔다.
```ts
  const fillDown = () => { if (!rect || rect.bottom <= rect.top) return; let next = requests; for (let r = rect.top + 1; r <= rect.bottom; r += 1) for (let c = rect.left; c <= rect.right; c += 1) { const source = cellLine({ row: rect.top, col: visibleColumns[c].id }); if (source) next = updateCell(next, { row: r, col: visibleColumns[c].id }, rawValue(source, visibleColumns[c].id)).next } if (next !== requests) saveMutation(next) }
```

**1325~1341행** — `moveSelection`의 마지막 두 줄
```ts
    row = Math.max(0, Math.min(slots.length - 1, row)); col = Math.max(0, Math.min(visibleColumns.length - 1, col))
    setCellAnchor({ row, col: visibleColumns[col].id }, extend)
  }
```

**1557행** — 채우기 핸들
```tsx
        <FillHandle visible={sel.handle} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); fillRef.current = rect; dragRef.current = true }} />
```

**1528행** — 데이터 셀 `TableCell`의 className. 끝부분이 이렇게 끝난다.
```
${fixed ? "sticky z-10" : ""} ${readOnly ? "cursor-default" : "cursor-cell"}`}
```

## 할 일

### 1. 채우기 미리보기 상태

`fillRef`(776행) 바로 아래에 더한다.

```ts
  const fillPreviewRef = useRef<CellRect | null>(null)
  const [fillPreview, setFillPreview] = useState<CellRect | null>(null)
```

`useState`는 11행에서 이미 들여온다. 새 import는 없다.

### 2. `startFill`

`onCellMouseDown`(1015행) 바로 위에 더한다.

```ts
  /** 채우기 핸들 드래그 시작. 선택 넓히기와 달리 끌고 간 쪽으로 값을 복사한다. */
  const startFill = (event: React.MouseEvent) => {
    if (readOnly || !rect) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = true
    rowDragRef.current = false
    lastExtendRef.current = ""
    fillRef.current = { ...rect }
    fillPreviewRef.current = { ...rect }
    setFillPreview({ ...rect })
  }
```

`rect`는 943행에서 `useMemo`로 만들고 `startFill`보다 위에 있다. 그대로 쓴다.

1557행을 이렇게 바꾼다.

```tsx
        <FillHandle visible={sel.handle && !readOnly} onMouseDown={startFill} />
```

### 3. 드래그 중 미리보기 갱신

`extendAtPointerRef.current`(1020행) 안에서 `if (rowDragRef.current) {` **바로 앞에** fill 분기를
넣는다. 행 드래그 분기보다 먼저 와야 한다.

```ts
    if (fillRef.current) {
      if (!cellEl) return
      const row = Number(cellEl.dataset.slotIndex)
      const col = colIndexOf.get(cellEl.dataset.colId ?? "")
      if (!Number.isInteger(row) || col === undefined) return
      const source = fillRef.current
      // 엑셀과 같다. 아래로 더 끌었으면 아래로만, 오른쪽으로 더 끌었으면 오른쪽으로만 넓힌다.
      const down = Math.max(0, row - source.bottom)
      const right = Math.max(0, col - source.right)
      const next = !down && !right ? source : down >= right ? { ...source, bottom: row } : { ...source, right: col }
      const key = `fill:${next.top}:${next.bottom}:${next.left}:${next.right}`
      if (lastExtendRef.current === key) return
      lastExtendRef.current = key
      fillPreviewRef.current = next
      setFillPreview(next)
      return
    }
```

### 4. 드래그 종료에서 채우기

1074~1079행의 `up`을 바꾼다. **`stopAutoScroll()`을 먼저 부르고 ref를 비운 뒤 채운다.**

```ts
    const up = () => {
      const fillSource = fillRef.current
      const fillTarget = fillPreviewRef.current
      dragRef.current = false
      rowDragRef.current = false
      fillRef.current = null
      fillPreviewRef.current = null
      stopAutoScroll()
      if (fillSource && fillTarget) {
        setFillPreview(null)
        commitFillRef.current(fillSource, fillTarget)
      }
    }
```

**`commitFill`을 직접 부르면 안 된다.** 이 `up`은 `useEffect(..., [])` 안에 있어서 첫 렌더의
`requests`와 `visibleColumns`를 영구히 붙잡는다. 그대로 부르면 옛 원장에 덮어써서 그 사이 고친
값이 사라진다. 같은 파일 1019행 아래의 `extendAtPointerRef`가 이미 이 문제를 ref로 피하고 있다.
같은 방식으로 `commitFillRef`를 쓴다. `fillPreviewRef`와 `commitFillRef` 선언은
`useEffect`보다 위에 있어야 한다(1단계 위치면 맞다).

`fillPreviewRef` 아래에 더한다.

```ts
  const commitFillRef = useRef<(source: CellRect, target: CellRect) => void>(() => undefined)
```

### 5. `commitFill`

`fillDown`(1140행) **바로 아래**에 더한다. 그리고 그 아래 줄에 ref 대입을 둔다.

```ts
  /**
   * 채우기 핸들로 끌어 놓은 범위에 원본 값을 되풀이해 넣는다.
   * 아래로 끌면 원본 높이로 되풀이하고, 오른쪽으로 끌면 원본 너비로 되풀이한다.
   * 스타일 열은 스타일의 첫 줄에만 쓴다. 아래 옵션 줄은 같은 값을 가리켜 두 번 쓸 필요가 없다.
   */
  const commitFill = (source: CellRect, target: CellRect) => {
    if (readOnly) { commitRequests(requests); return }
    if (target.bottom === source.bottom && target.right === source.right) return
    let next = requests
    const skipCounts: SkipCounts = { number: 0, construction: 0, result: 0 }
    const write = (row: number, col: number, sourceRow: number, sourceCol: number) => {
      const column = visibleColumns[col], fromColumn = visibleColumns[sourceCol]
      if (!column || !fromColumn || !slots[row]) return
      if (column.scope === "style" && row > 0 && slots[row - 1]?.style.reqId === slots[row]?.style.reqId) return
      const cell = { row, col: column.id }
      if (!editableCell(cell)) return
      const from = cellLine({ row: sourceRow, col: fromColumn.id })
      if (!from) return
      const raw = fromColumn.id === "urgent" ? (from.style.urgent ? "Y" : "") : rawValue(from, fromColumn.id)
      const result = updateCell(next, cell, raw)
      next = result.next
      countSkip(skipCounts, result.skipped)
    }
    if (target.bottom > source.bottom) {
      const height = source.bottom - source.top + 1
      for (let row = source.bottom + 1; row <= target.bottom; row += 1) {
        const sourceRow = source.top + ((row - source.top) % height)
        for (let col = source.left; col <= source.right; col += 1) write(row, col, sourceRow, col)
      }
    } else if (target.right > source.right) {
      const width = source.right - source.left + 1
      for (let row = source.top; row <= source.bottom; row += 1) {
        for (let col = source.right + 1; col <= target.right; col += 1) {
          write(row, col, row, source.left + ((col - source.left) % width))
        }
      }
    }
    if (next !== requests) saveMutation(next)
    noticeSkips(skipCounts)
    const firstCol = visibleColumns[target.left], lastCol = visibleColumns[target.right]
    if (firstCol && lastCol) setRange({ anchor: { row: target.top, col: firstCol.id }, focus: { row: target.bottom, col: lastCol.id } })
  }
  commitFillRef.current = commitFill
```

`rawValue`는 1225행, `updateCell`은 1100행, `SkipCounts`·`countSkip`·`noticeSkips`는 1090행대에
있다. `rawValue`가 `commitFill`보다 아래에 선언되지만 호출은 mouseup 뒤라 문제 없다. 바로 위
`fillDown`이 이미 같은 모양으로 `rawValue`를 쓴다. **선언 순서를 바꾸지 마라.**

### 6. 미리보기 점선 표시

`commitFill` 아래에 더한다.

```ts
  /** 채우기 미리보기 중 원본 선택 밖으로 나간 칸. 점선 테두리를 둘러 어디까지 채울지 보여 준다. */
  const inFillPreview = (row: number, colId: string): boolean => {
    if (!fillPreview) return false
    const col = colIndexOf.get(colId)
    if (col === undefined) return false
    const inside = row >= fillPreview.top && row <= fillPreview.bottom && col >= fillPreview.left && col <= fillPreview.right
    return inside && (!rect || row < rect.top || row > rect.bottom || col < rect.left || col > rect.right)
  }
```

1528행 className의 끝을 바꾼다. 다른 조건식은 손대지 않는다.

바꾸기 전
```
${fixed ? "sticky z-10" : ""} ${readOnly ? "cursor-default" : "cursor-cell"}`}
```
바꾼 뒤
```
${fixed ? "sticky z-10" : ""} ${readOnly ? "cursor-default" : "cursor-cell"} ${inFillPreview(slotIndex, column.id) ? "outline outline-1 outline-dashed outline-[var(--grid-selection)] -outline-offset-1" : ""}`}
```

### 7. 화살표 이동 때 포커스 셀 보이기

지금은 화살표나 Tab, Enter로 선택을 옮겨도 표가 따라 굴러가지 않아 선택이 화면 밖으로 나간다.

`moveSelection`(1325행) 위에 더한다.

```ts
  /**
   * 포커스 셀을 화면 안으로 굴린다.
   * 스타일 열은 rowSpan으로 묶여 있어 그 줄에 td가 없을 수 있다. 위로 올라가며 묶음의 첫 칸을 찾는다.
   */
  const scrollCellIntoView = (cell: CellRef) => {
    window.requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return
      for (let row = cell.row; row >= 0; row -= 1) {
        const found = root.querySelector<HTMLElement>(`td[data-slot-index="${row}"][data-col-id="${CSS.escape(cell.col)}"]`)
        if (found) { found.scrollIntoView({ block: "nearest", inline: "nearest" }); return }
      }
    })
  }
```

`moveSelection`의 마지막 줄 뒤에 한 줄 더한다.

```ts
    setCellAnchor({ row, col: visibleColumns[col].id }, extend)
    scrollCellIntoView({ row, col: visibleColumns[col].id })
  }
```

## 하지 말 것

- **`up` 안에서 `commitFill`을 직접 부르지 마라.** 5단계 설명대로 `commitFillRef`를 쓴다. 저장이 사라진다.
- **`onCellMouseDown`의 `event.preventDefault()`를 없애지 마라.** 없애면 브라우저 기본 선택이 같이 시작돼 화면 전체가 반투명 사본으로 끌려다닌다(`CLAUDE.md` 주의 항목).
- **`onCellMouseDown`의 `closest("button,input,textarea,select,[role=menu]")` 가드를 건드리지 마라.** 셀 안에 DD 연결 버튼, FL# 버튼, 보드 칩, 옵션 삭제 버튼, 사진 버튼이 들어 있다. 이 가드가 그것들을 지킨다.
- **`TableCell`의 `onDoubleClick`(1534행)을 손대지 마라.** 더블클릭 편집과 URGENT 토글이 거기 있다. mousedown에서 `preventDefault`를 걸어도 더블클릭은 그대로 온다.
- **`onContextMenu`(1533행)를 손대지 마라.**
- `selectionFor`(993행)와 `selectionShadow`를 바꾸지 마라. 선택 테두리는 지금 그대로 둔다.
- `src/components/data-table/grid-selection.tsx`를 고치지 마라. DD MASTER와 WAREHOUSE가 같이 쓴다.
- `DevelopmentMasterSheet.tsx`, `Warehouse.tsx`는 열지 않는다. 이번 작업 대상이 아니다.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. `tsc --noEmit`이 포함돼 있다.
성공이면 `vite build`가 `dist/`를 쓰고 끝난다. 다른 검증은 하지 마라. 화면은 사람이 본다.

확인할 것 하나. 바꾼 뒤 `src/routes/FabricRequest.tsx`에서 `commitFillRef` 가 세 번 나와야 한다.
선언 1회, `up` 안 호출 1회, `commitFillRef.current = commitFill` 1회다.

## 보고

수정한 파일, `npm run build` 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
