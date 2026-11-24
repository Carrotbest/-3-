# R444 — DD MASTER 틀 고정(엑셀과 같게)

상태: 미착수.

DD MASTER 표에 엑셀의 "틀 고정"을 그대로 넣는다. 지금은 `PINNED_COLUMNS` 세 개(담당, Status, Style No.)가 코드에 박혀 항상 왼쪽에 고정돼 있고 사용자가 바꿀 수 없다. 이것을 사용자가 정하는 고정 경계로 바꾸고, 데이터 행 고정을 새로 만든다.

고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일은 열지 않는다.

---

## 1. 엑셀과의 대응

표의 어느 부분이 엑셀의 무엇인지 먼저 맞춘다. 이 대응이 설계의 전부다.

| 엑셀 | 이 표 | 고정 여부 |
|---|---|---|
| 열 머리글 바 (A, B, C) | `<thead>` 세 줄 (그룹 라벨, 하위 라벨, 열 이름) | **항상 고정. 설정과 무관.** 지금 `sticky top-0 z-30`이 이미 한다. 건드리지 않는다 |
| 행 머리글 (1, 2, 3) | `#` 행 번호 `td` (`data-row-header`) | **항상 고정. 설정과 무관.** 지금 `sticky left-0`이 이미 한다. 건드리지 않는다 |
| 틀 고정 대상 | 데이터 행과 데이터 열 | 사용자가 정한다. 이번 작업 범위 |

즉 틀 고정은 머리글이 아니라 **데이터 영역에만** 적용된다.

## 2. 상태 계약

```ts
type Freeze = { rows: number; cols: number }
```

- `rows` — 위에서부터 고정할 **데이터 행 수**. `filtered` 배열 기준.
- `cols` — 왼쪽에서부터 고정할 **데이터 열 수**. `displayedColumns` 배열 기준.
- 기본값 `{ rows: 0, cols: 3 }`. 지금 화면과 똑같이 보인다(담당, Status, Style No. 고정).

**저장은 개인 브라우저에만 한다.** `src/data/view-prefs.ts`를 쓴다. `CACHE_KEYS`에 넣지 않는다. Firestore로 올라가면 안 된다. 한 사람이 고정해도 팀원 화면은 그대로여야 한다.

파일 머리(49~53행 저장소 키들 옆)에 키를 더한다.

```ts
const FREEZE_STORAGE_KEY = "dd-freeze-v1"
```

상태 초기화는 `openGroups`, `hiddenColumns` 바로 옆(1669~1674행 근처)에 둔다. `loadViewNumbers`가 이미 숫자 맵을 범위 검사해 돌려주므로 새 헬퍼를 만들지 않는다.

```ts
const [freeze, setFreeze] = useState<Freeze>(() => {
  const stored = loadViewNumbers(FREEZE_STORAGE_KEY, 0, 200)
  return {
    rows: Number.isInteger(stored.rows) ? stored.rows : 0,
    cols: Number.isInteger(stored.cols) ? stored.cols : 3,
  }
})
useEffect(() => { saveViewPref(FREEZE_STORAGE_KEY, freeze) }, [freeze])
```

**클램프.** 화면에 쓸 때는 반드시 아래 두 값을 거쳐서 쓴다. 저장값을 날것으로 쓰지 않는다. 열을 숨기거나 그룹을 접으면 `displayedColumns`가 줄어드는데, 그때도 스크롤할 것이 최소 하나는 남아야 한다.

```ts
const freezeCols = Math.max(0, Math.min(freeze.cols, displayedColumns.length - 1))
const freezeRows = Math.max(0, Math.min(freeze.rows, Math.max(0, filtered.length - 1)))
```

`freeze` 자체는 고치지 않는다. 열을 다시 펼치면 원래 경계로 돌아와야 한다.

## 3. 메뉴

도구줄 **3677행** `전체 64열` 버튼이 든 `<div role="group" aria-label="열 보기 전환">`(3674행에서 시작)이 닫힌 **바로 뒤**에 `틀 고정` 드롭다운을 넣는다.

드롭다운 여닫이는 같은 파일 **3711~3712행의 `hiddenMenuOpen` 패턴을 그대로 복사한다.** 바깥 클릭을 먹는 `<span className="fixed inset-0 z-[80]" onMouseDown={...} />` 하나와 `<span className="absolute left-0 top-full z-[81] mt-1 block ...">` 목록 하나다. 새 팝오버 라이브러리를 쓰지 않는다.

항목은 엑셀과 같은 순서로 셋이다.

| 항목 | 조건 | 동작 |
|---|---|---|
| `틀 고정` | `freeze.rows === 0 && freeze.cols === 0` 일 때 이 라벨 | 선택 셀 기준으로 설정(아래) |
| `틀 고정 취소` | 그 밖(= 지금 고정 중) | `setFreeze({ rows: 0, cols: 0 })` |
| `첫 행 고정` | 항상 | `setFreeze({ rows: 1, cols: 0 })` |
| `첫 열 고정` | 항상 | `setFreeze({ rows: 0, cols: 1 })` |

첫째 항목은 라벨만 토글된다. 엑셀과 같다. 둘째, 셋째는 늘 보인다.

**선택 셀 기준 설정.** 엑셀은 선택 셀의 **위쪽 행 전부와 왼쪽 열 전부**를 고정한다. 선택 셀 자신은 고정에 들어가지 않는다.

```ts
const freezeAtSelection = () => {
  const cell = range?.focus ?? null
  if (!cell) return
  const rowIdx = rowIndexOf.get(cell.row)
  const colIdx = colIndexOf.get(cell.col)
  if (rowIdx === undefined || colIdx === undefined) return
  setFreeze({ rows: rowIdx, cols: colIdx })
}
```

`rowIndexOf`는 2209행, `colIndexOf`는 2210행에 이미 있다. 새로 만들지 않는다.

선택 셀이 없으면 `틀 고정` 항목을 `disabled`로 두고 `title="고정할 셀을 먼저 고르십시오"`를 붙인다.

## 4. 렌더 — 공통 헬퍼

**2047~2049행**의 아래 두 줄을 `displayedColumns` 기준으로 일반화한다. 기존 이름은 버리고 새 이름을 쓴다.

지금 코드:

```ts
  // 핀 고정 열도 너비 조절 대상이므로 sticky left 오프셋을 현재 너비로 계산한다.
  const pinnedLeft = (index: number) => ROW_HEADER_WIDTH + PINNED_COLUMNS.slice(0, index).reduce((sum, column) => sum + widthOf(column), 0)
  const pinnedTotal = PINNED_COLUMNS.reduce((sum, column) => sum + widthOf(column), 0)
```

바꿀 코드:

```ts
  // 고정 열도 너비 조절 대상이므로 sticky left 오프셋을 현재 너비로 계산한다.
  // index 는 displayedColumns 안의 자리다. PINNED_COLUMNS 가 그 앞 세 자리를 차지한다.
  const frozenLeft = (index: number) => ROW_HEADER_WIDTH + displayedColumns.slice(0, index).reduce((sum, column) => sum + widthOf(column), 0)
  const frozenTotal = displayedColumns.slice(0, freezeCols).reduce((sum, column) => sum + widthOf(column), 0)
  const isFrozenCol = (index: number) => index < freezeCols
```

`pinnedLeft`와 `pinnedTotal`의 호출처는 둘뿐이다(3743행, 3813행, 2394행). 전부 새 이름으로 바꾼다.

**경계선.** 엑셀은 고정 경계에 가는 실선을 긋는다. 마지막 고정 열과 마지막 고정 행에만 붙인다.

```ts
const FREEZE_EDGE = "color-mix(in srgb, var(--foreground) 32%, transparent)"
const freezeColEdge = (index: number) => index === freezeCols - 1 ? { borderRight: `2px solid ${FREEZE_EDGE}` } : null
const freezeRowEdge = (rowIdx: number) => rowIdx === freezeRows - 1 ? { borderBottom: `2px solid ${FREEZE_EDGE}` } : null
```

## 5. 렌더 — 고정 행의 top 값

행 높이는 `h-8`(32px)이지만 **고정값으로 박으면 안 된다.** Alt+Enter 줄바꿈을 확정한 행은 그보다 높아진다(R437). 머리말 높이도 보이는 그룹에 하위 열이 있느냐에 따라 `rowSpan`이 1이나 2로 달라져 바뀐다.

`<thead>`(3740행)에 `ref={theadRef}`를 붙이고 실측한다.

```ts
const theadRef = useRef<HTMLTableSectionElement | null>(null)
const [frozenRowTops, setFrozenRowTops] = useState<number[]>([])
```

`useLayoutEffect`에서 머리말 높이부터 쌓아 올린다.

```ts
useLayoutEffect(() => {
  const head = theadRef.current
  if (!head) { setFrozenRowTops((cur) => cur.length ? [] : cur); return }
  const measure = () => {
    const table = head.closest("table")
    const rows = table ? [...table.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")].slice(0, freezeRows) : []
    const tops: number[] = []
    let acc = head.getBoundingClientRect().height
    rows.forEach((tr) => { tops.push(acc); acc += tr.getBoundingClientRect().height })
    // ResizeObserver 안에서 같은 값을 다시 넣으면 무한 루프가 된다. 길이와 값이 같으면 건너뛴다.
    setFrozenRowTops((cur) => cur.length === tops.length && cur.every((v, i) => Math.abs(v - tops[i]) < 0.5) ? cur : tops)
  }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(head)
  const table = head.closest("table")
  if (table) table.querySelectorAll<HTMLElement>("tbody tr[data-row-id]").forEach((tr, i) => { if (i < freezeRows) observer.observe(tr) })
  return () => observer.disconnect()
}, [freezeRows, filtered, colWidths, visibleGroups])
```

`frozenRowTops[rowIdx]`가 그 행의 `top`이다. 배열에 자리가 없으면 그 행은 고정하지 않는다(`isFrozenRow = rowIdx < frozenRowTops.length`).

## 6. 렌더 — 머리말 세 줄

`<thead>`는 그대로 `sticky top-0`이다. 달라지는 것은 가로 고정뿐이다.

### 6-1. 1행 — PINNED_COLUMNS 칸 (3743행)

지금은 세 칸 전부 `sticky z-40`에 `left: pinnedLeft(index)`다. 이제 `isFrozenCol(index)`일 때만 sticky를 준다.

- `isFrozenCol(index)` 참 → `sticky z-40`, `style`에 `left: frozenLeft(index)`와 `...freezeColEdge(index)`
- 거짓 → `sticky`, `z-40`, `left` 모두 빼고 보통 칸으로 그린다

`relative` 클래스와 리사이즈 손잡이, `ColumnFilterMenu`, 정렬 아이콘은 그대로 둔다.

### 6-2. 1행 — 그룹 라벨 칸 (3744행)

여기가 이번 작업의 핵심이다. 그룹 라벨은 `colSpan`으로 여러 열을 덮는데, **고정 경계가 그룹 한가운데에 떨어지면 한 칸을 반만 고정할 수 없다.** 그래서 경계에서 칸을 둘로 쪼갠다.

그룹 `group`의 첫 열이 `displayedColumns`에서 차지하는 자리를 `g0`라 하자. `visibleGroups`를 돌 때 누적으로 구한다. 시작값은 `PINNED_COLUMNS.length`다.

```ts
const frozenInGroup = Math.max(0, Math.min(group.columns.length, freezeCols - g0))
```

- `frozenInGroup === 0` → 지금 코드 그대로. 하나의 `th`, sticky 없음.
- `frozenInGroup === group.columns.length` → 하나의 `th`에 `sticky z-40`, `left: frozenLeft(g0)`.
- 그 사이 → **`th` 두 개로 쪼갠다.** 왼쪽은 `colSpan={frozenInGroup}`에 `sticky z-40 left={frozenLeft(g0)}`, 오른쪽은 `colSpan={group.columns.length - frozenInGroup}`에 sticky 없음.

쪼갠 두 칸의 규칙:

- **라벨은 양쪽 다 쓴다.** 오른쪽으로 스크롤했을 때 그룹 이름이 사라지면 안 된다.
- **`rowSpan`은 양쪽이 같다.** 지금과 같이 `group.columns.some((column) => column.sub) ? 1 : 2`를 쓴다. 반쪽끼리 따로 계산하면 2행과 어긋난다.
- **Finishing `+/-` 버튼(`group.key === "detail"`)과 그룹 너비 조절 손잡이(`startGroupResize`)는 오른쪽 조각에만 붙인다.** 둘 다 그룹의 오른쪽 끝에 있어야 한다. 쪼개지지 않은 경우에는 지금처럼 그 하나에 붙는다.
- 배경색과 글자색(`group.color`)은 양쪽 같다.
- `key`는 `${group.key}-head-left` / `${group.key}-head-right`로 가른다.

### 6-3. 2행 — 하위 라벨 칸 (3747행)

`subRuns(group.columns)`가 돌려주는 각 `run`도 `colSpan`을 쓴다. 1행과 **똑같은 규칙으로** 쪼갠다. run의 시작 자리는 `g0 + (그 그룹 안에서 앞선 run들의 span 합)`이다.

```ts
const frozenInRun = Math.max(0, Math.min(run.span, freezeCols - runStart))
```

쪼개면 왼쪽 조각이 `sticky z-40 left={frozenLeft(runStart)}`를 받는다. 라벨은 양쪽 다 쓴다. 빈 라벨일 때 `"·"`를 넣는 지금 동작은 그대로다.

### 6-4. 3행 — 열 이름 칸 (3750행)

각 열의 전역 자리 `idx = colIndexOf.get(column.id)`를 쓴다. `isFrozenCol(idx)`이면 `sticky z-40`에 `left: frozenLeft(idx)`와 `...freezeColEdge(idx)`를 준다. 아니면 지금 그대로다.

## 7. 렌더 — 본문

`filtered.map` 안에서 `rowIdx`를 이미 구하고 있다. 아래 셋을 미리 계산해 세 군데에 똑같이 먹인다.

```ts
const rowFrozen = rowIdx !== undefined && rowIdx < frozenRowTops.length
const rowTop = rowFrozen ? frozenRowTops[rowIdx] : undefined
const rowEdge = rowFrozen ? freezeRowEdge(rowIdx) : null
```

### 7-1. `#` 행 번호 칸 (3811행)

지금 `sticky left-0 z-20`이다. 고정 행이면 `top: rowTop`을 더하고 z를 올린다.

- `rowFrozen` → `style`에 `top: rowTop`, 클래스의 `z-20`을 `z-[23]`으로
- `...rowEdge`를 `style`에 더한다

가로는 지금처럼 늘 고정이다. 바뀌지 않는다.

### 7-2. PINNED_COLUMNS 칸 (3812~3853행)

`stickyBase`(3817행)와 `cellStyle`(3818행)을 조건부로 바꾼다. 세 갈래 반환문(`active` 편집기, `status`, 기본)이 둘 다 쓰므로 **한 군데만 고치면 셋에 다 먹는다.**

```ts
const colFrozen = isFrozenCol(index)
const z = rowFrozen && colFrozen ? "z-[22]" : rowFrozen ? "z-[21]" : colFrozen ? "z-20" : "z-0"
const stickyBase = `relative ${rowFrozen || colFrozen ? "sticky" : ""} ${z} h-8 border-b border-r border-[var(--border)] ...(나머지 지금 그대로)`
const cellStyle = {
  width, minWidth: width,
  ...(colFrozen ? { left: frozenLeft(index) } : null),
  ...(rowFrozen ? { top: rowTop } : null),
  ...freezeColEdge(index), ...rowEdge,
  boxShadow: selectionShadow(sel), ...(나머지 지금 그대로)
}
```

`index === 0`일 때 붙는 `border-l-4 ${rowStyle.row}`(상태 색 띠)는 그대로 둔다.

### 7-3. 그룹 열 칸 — `GridCell` (3855~3861행 호출부, 1439~1526행 정의부)

`GridCell`은 지금 sticky를 모른다. props 넷을 더한다. `GridCellProps`(1439행)에:

```ts
  frozenLeft?: number    // 가로 고정일 때 left 픽셀. 아니면 undefined
  frozenTop?: number     // 세로 고정일 때 top 픽셀. 아니면 undefined
  edgeStyle?: CSSProperties   // 고정 경계선. freezeColEdge + freezeRowEdge 를 합쳐 넘긴다
```

호출부에서 `const idx = colIndexOf.get(column.id) ?? -1`로 자리를 구해 넘긴다.

정의부에서:

```ts
const frozen = frozenLeft !== undefined || frozenTop !== undefined
const zClass = frozenLeft !== undefined && frozenTop !== undefined ? "z-[22]" : frozenTop !== undefined ? "z-[21]" : frozenLeft !== undefined ? "z-20" : ""
```

`selectionStyle`(1499행)에 `...(frozenLeft !== undefined ? { left: frozenLeft } : null)`, `...(frozenTop !== undefined ? { top: frozenTop } : null)`, `...edgeStyle`을 더한다.

**`<td>` 두 곳(1502행, 1523행)의 `className`에 `${frozen ? \`sticky ${zClass}\` : ""}`를 더한다.**

**배경을 반드시 준다.** `GridCell`의 `td`에는 지금 배경 클래스가 없다. 배경은 `<tr>`의 `bg-[var(--card)]`가 깔아 준다. 그런데 sticky가 되면 그 칸이 떠서 아래 행이 그대로 비친다. 그래서 `frozen`일 때만 `bg-[var(--card)] group-hover:bg-[var(--accent)]`를 클래스에 더한다. `highlight`, `dimStyle`, `companyColorStyle`, `pastScheduleStyle`, `overdueStyle`은 전부 인라인 `style`이거나 뒤에 오는 클래스라 지금처럼 이긴다. **이 배경을 빠뜨리면 고정 행이 투명하게 겹쳐 보인다.**

`GridCell`은 `memo`다. 새 props가 바뀌면 다시 그려져야 하는데 비교 함수를 따로 주지 않았으므로 기본 얕은 비교가 알아서 잡는다. **비교 함수를 새로 만들지 마라.**

## 8. 스크롤 진입 보정 (2383~2398행 `scrollCellIntoView`)

지금은 가로만 본다.

```ts
      if (!scroller || colIndex === undefined || colIndex < PINNED_COLUMNS.length) return
      const cellBox = cell.getBoundingClientRect()
      const scrollBox = scroller.getBoundingClientRect()
      const stickyEdge = scrollBox.left + ROW_HEADER_WIDTH + pinnedTotal
      if (cellBox.left < stickyEdge) scroller.scrollLeft -= stickyEdge - cellBox.left
```

가로는 `PINNED_COLUMNS.length` → `freezeCols`, `pinnedTotal` → `frozenTotal`로 바꾸고, 세로를 같은 모양으로 더한다. 고정 행 블록 밑으로 셀이 숨으면 키보드 이동 때 활성 셀이 안 보인다.

```ts
      if (!scroller || colIndex === undefined) return
      const cellBox = cell.getBoundingClientRect()
      const scrollBox = scroller.getBoundingClientRect()
      if (colIndex >= freezeCols) {
        const stickyEdge = scrollBox.left + ROW_HEADER_WIDTH + frozenTotal
        if (cellBox.left < stickyEdge) scroller.scrollLeft -= stickyEdge - cellBox.left
      }
      const headH = theadRef.current?.getBoundingClientRect().height ?? 0
      const frozenBottom = scrollBox.top + headH + (frozenRowTops.length ? (frozenRowTops[frozenRowTops.length - 1] + 32) - headH : 0)
      if (cellBox.top < frozenBottom) scroller.scrollTop -= frozenBottom - cellBox.top
```

마지막 고정 행의 바닥은 실측값으로 잡는다. `frozenRowTops`가 비면 머리말 바닥만 쓴다.

## 9. 하지 말 것

- **`PINNED_COLUMNS` 상수(292행)를 지우거나 비우지 마라.** 세 곳이 쓴다. `INTAKE_CORE`(549행, 신규 작지 접수 그리드), `RESIZABLE_COLUMNS`(470행, 너비 조절 대상), `EditorGroup label="고정 핵심"`(4160행, 74열 수정 모달). **이 셋은 사용자의 틀 고정 설정을 따라가면 안 된다.** 접수 그리드와 수정 모달은 표와 다른 화면이다. 전부 지금 그대로 둔다.
- **접수 그리드(592~830행 근처, `INTAKE_GRID_HEAD_H`, `INTAKE_WIDTH_KEY`)를 손대지 마라.** 자기 sticky를 따로 갖고 있다. 이번 작업과 무관하다.
- **가상 스크롤을 넣지 마라.** DD MASTER는 `filtered.map`으로 전 행을 그린다. 그래서 행 고정이 가능하다. 창고의 `ROW_HEIGHT = 32` 가상 스크롤 방식을 여기 들여오지 마라.
- **행 높이를 32로 박지 마라.** 5절대로 실측한다.
- `commitRecords`, 셀 선택(`range`, `setRangeState`), 편집(`beginCellEdit`, `commitCell`), 채우기(`startFill`), 행 이동 로직을 건드리지 마라.
- `src/routes/Warehouse.tsx`를 열지 마라.
- `freeze`를 Firestore나 `CACHE_KEYS`에 넣지 마라. 개인 브라우저 저장이다.
- `<tr>`에 `position: sticky`를 주지 마라. `td`에 준다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`은 2.5MB다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 10. 성공 기준

- `npm run build`가 통과한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx` 한 줄만 뜬다(이 지시서 파일 제외).
- 기본 상태에서 화면이 지금과 똑같다. 담당, Status, Style No. 세 열이 왼쪽에 붙어 있고 머리말이 위에 붙어 있다.
- 도구줄 `전체 64열` 오른쪽에 `틀 고정` 드롭다운이 있고 항목이 셋이다.
- `첫 행 고정`을 누르면 데이터 첫 줄이 머리말 바로 밑에 붙고 세 열의 가로 고정은 풀린다.
- `틀 고정 취소`를 누르면 세 열까지 전부 풀려 다 흐른다.
- 어떤 셀을 고르고 `틀 고정`을 누르면 그 셀 위쪽 행과 왼쪽 열이 함께 언다.
- 새로고침해도 설정이 남는다.
- 고정 경계에 가는 선이 보인다.
- 고정 행이 투명하지 않다. 아래 행이 비쳐 보이면 7-3의 배경을 빠뜨린 것이다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
