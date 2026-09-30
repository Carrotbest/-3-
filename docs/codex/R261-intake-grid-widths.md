# R261 신규 작지 접수 옵션 그리드 Yarn 칸 넓히기와 너비 조절

상태: 미착수. 추론 강도 **low**(상수와 표 머리 한 곳이다. 데이터 계약은 안 바뀐다).

신규 작지 접수 팝업의 옵션 그리드에서 `Yarn`(Yarn Detail) 칸이 좁아 원사 사양이 한눈에 안 들어온다. 기본 너비를 바꾸고, 열 너비를 끌어서 조절할 수 있게 한다. 두 가지를 같이 한다.

## 확인한 사실

`src/routes/DevelopmentMasterSheet.tsx` 427~433행 `INTAKE_GRID_WIDTHS`가 이 그리드의 열 너비를 정한다. `IntakeOptionGrid`(479행)는 그 값을 `<colgroup>`에 그대로 박는다. 지금은 사용자가 바꿀 방법이 없다.

표는 이미 가로 스크롤이고(전체 폭 약 2230px) 오른쪽 삭제 칸이 고정이다. 그래서 Yarn을 넓히면서 공정 칸을 조금씩 줄이면 화면에 보이는 범위는 지금과 거의 같다.

## A. 기본 너비 (427~433행 교체)

지금

```ts
const INTAKE_GRID_WIDTHS: Record<string, number> = {
  yarnDetail: 200, construction: 118, targetWeight: 76, color: 120, dyeing: 96,
  yarnMill: 70, yarnStatus: 100, knittingMill: 70, knittingStatus: 100,
  dyeingMill: 70, dyeingStatus: 100, finishingMill: 70, finishingStatus: 100,
  co: 66, developmentNo: 110, arrangeNo: 100,
  finishingA: 84, finishingB: 84, finishingC: 84, finishingD: 84, remark: 200,
}
```

바꾼 뒤. Yarn을 100px 넓히고 공정 여덟 칸과 옆 칸에서 66px을 걷었다.

```ts
/**
 * 접수 그리드 기본 너비. Yarn 은 원사 사양을 한 줄로 읽어야 해서 가장 넓다(R261).
 * 공정 업체·완료일은 줄였다. 완료일은 날짜 입력과 달력 아이콘이 들어가므로 94 아래로 내리지 마라. 글자가 잘린다.
 * 사용자가 열 끝을 끌어 바꾼 값은 localStorage(INTAKE_WIDTH_KEY)에 남고 이 기본값을 덮는다.
 */
const INTAKE_GRID_WIDTHS: Record<string, number> = {
  yarnDetail: 300, construction: 112, targetWeight: 72, color: 112, dyeing: 96,
  yarnMill: 64, yarnStatus: 94, knittingMill: 64, knittingStatus: 94,
  dyeingMill: 64, dyeingStatus: 94, finishingMill: 64, finishingStatus: 94,
  co: 66, developmentNo: 110, arrangeNo: 100,
  finishingA: 84, finishingB: 84, finishingC: 84, finishingD: 84, remark: 200,
}
/** 접수 그리드 열 너비 저장 키. 개인 브라우저에만 남는다(Firestore로 올라가지 않는다). */
const INTAKE_WIDTH_KEY = "dd-intake-col-widths-v1"
const INTAKE_MIN_WIDTH = 56
const INTAKE_MAX_WIDTH = 600
```

## B. `IntakeOptionGrid`에 너비 조절 (479행 함수)

### B-1. import

이 파일 위쪽 import 목록에 더한다. 이미 있으면 그대로 둔다.

```ts
import { loadViewNumbers, saveViewPref } from "@/data/view-prefs"
```

`react` import에 `useEffect`, `useRef`, `useState`, 그리고 타입 `type MouseEvent as ReactMouseEvent`가 이미 있다. 없으면 더한다.

### B-2. 함수 첫 줄

지금

```tsx
function IntakeOptionGrid({ records, optionsById, onChangeRow, onRemoveRow }: { ... }) {
  const columns = INTAKE_OPTION_COLUMNS
  const runs = subRuns(columns)
  const tableWidth = INTAKE_NO_WIDTH + columns.reduce((sum, column) => sum + column.width, 0) + INTAKE_DEL_WIDTH
```

`const columns = INTAKE_OPTION_COLUMNS` 와 `const runs = ...` 사이에 너비 상태를 넣고, `tableWidth` 계산을 `widthOf` 기준으로 바꾼다.

```tsx
  const columns = INTAKE_OPTION_COLUMNS
  // 열 너비는 개인 브라우저에만 남는다. 저장된 값이 없으면 INTAKE_GRID_WIDTHS 기본값을 쓴다.
  const [widths, setWidths] = useState<Record<string, number>>(() => loadViewNumbers(INTAKE_WIDTH_KEY, INTAKE_MIN_WIDTH, INTAKE_MAX_WIDTH))
  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanup.current?.(), [])
  const widthOf = (column: MasterColumn) => widths[column.id] ?? column.width
  const startResize = (column: MasterColumn, event: ReactMouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeCleanup.current?.()
    const startX = event.clientX
    const startWidth = widthOf(column)
    const previousUserSelect = document.body.style.userSelect
    let next = { ...widths }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const width = Math.min(INTAKE_MAX_WIDTH, Math.max(INTAKE_MIN_WIDTH, startWidth + moveEvent.clientX - startX))
      next = { ...next, [column.id]: width }
      setWidths(next)
    }
    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", cleanup)
      document.body.style.userSelect = previousUserSelect
      saveViewPref(INTAKE_WIDTH_KEY, next)
      if (resizeCleanup.current === cleanup) resizeCleanup.current = null
    }
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", cleanup)
    resizeCleanup.current = cleanup
  }
  /** 손잡이 더블클릭이면 그 열만 기본 너비로 되돌린다. */
  const resetWidth = (column: MasterColumn) => setWidths((current) => {
    const next = { ...current }
    delete next[column.id]
    saveViewPref(INTAKE_WIDTH_KEY, next)
    return next
  })
  const runs = subRuns(columns)
  const tableWidth = INTAKE_NO_WIDTH + columns.reduce((sum, column) => sum + widthOf(column), 0) + INTAKE_DEL_WIDTH
```

### B-3. 손잡이 조각

`const headCell = ...` 다음 줄에 손잡이를 만드는 함수를 넣는다.

```tsx
  const handle = (column: MasterColumn) => <span
    aria-hidden="true"
    title={`${column.label} 너비 조절 · 더블클릭하면 기본값`}
    onMouseDown={(event) => startResize(column, event)}
    onDoubleClick={() => resetWidth(column)}
    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
  />
```

### B-4. 머리 칸 세 곳에 손잡이를 붙인다

`headTop`의 단독 열 칸. 지금

```tsx
      columns.slice(start, start + run.span).forEach((column) => headTop.push(
        <th key={column.id} rowSpan={2} title={column.label} className={`sticky top-0 z-30 truncate bg-[var(--muted)] ${headCell}`}>{column.label}</th>,
      ))
```

바꾼 뒤

```tsx
      columns.slice(start, start + run.span).forEach((column) => headTop.push(
        <th key={column.id} rowSpan={2} title={column.label} className={`relative sticky top-0 z-30 truncate bg-[var(--muted)] ${headCell}`}>{column.label}{handle(column)}</th>,
      ))
```

둘째 줄 하위 머리. 지금

```tsx
          {columns.filter((column) => column.sub).map((column) => (
            <th key={column.id} title={column.label} style={{ top: INTAKE_GRID_HEAD_H }} className={`sticky z-30 truncate bg-[var(--muted)] ${headCell}`}>{column.label}</th>
          ))}
```

바꾼 뒤

```tsx
          {columns.filter((column) => column.sub).map((column) => (
            <th key={column.id} title={column.label} style={{ top: INTAKE_GRID_HEAD_H }} className={`relative sticky z-30 truncate bg-[var(--muted)] ${headCell}`}>{column.label}{handle(column)}</th>
          ))}
```

`<colgroup>`의 열 너비. 지금

```tsx
        {columns.map((column) => <col key={column.id} style={{ width: column.width }} />)}
```

바꾼 뒤

```tsx
        {columns.map((column) => <col key={column.id} style={{ width: widthOf(column) }} />)}
```

상위 병합 머리(`sub-${run.key}`)에는 손잡이를 붙이지 마라. 그 칸은 여러 열을 덮어서 어느 열을 줄일지 정할 수 없다.

## C. 안내 문구 한 줄

접수 팝업 옵션 그리드 위 안내 문구(`칸을 눌러 바로 고칩니다. 맨 윗줄 공정 완료일은 아래 옵션에도 같이 채워집니다. 8줄까지 보이고 그 아래는 표 안에서 스크롤합니다.`)의 끝에 한 문장을 더한다. 이 문자열을 찾아 그 자리에서만 고쳐라.

```
열 머리 오른쪽 끝을 끌면 너비가 바뀌고 더블클릭하면 기본값으로 돌아갑니다.
```

## D. `CLAUDE.md` 보기 설정 키 목록

`## 보기 설정 (src/data/view-prefs.ts)` 절의 `키:` 줄에 `dd-intake-col-widths-v1` 를 `dd-col-widths-v2` 다음 자리에 더한다. 그 절의 다른 줄은 고치지 마라.

## 하지 말 것

- DD MASTER 본 표의 `loadColumnWidths`, `saveColumnWidths`, `COL_WIDTHS_STORAGE_KEY`, `MIN_COLUMN_WIDTH`를 쓰거나 고치지 마라. 저장 키가 섞이면 본 표 너비가 접수 팝업 때문에 바뀐다.
- 완료일 열(`*Status`) 기본 너비를 94 아래로 내리지 마라. 날짜 입력이 잘린다.
- 열 순서(`INTAKE_GRID_ORDER`)와 라벨(`INTAKE_GRID_LABELS`)을 바꾸지 마라.
- 새 저장 키를 `CACHE_KEYS`에 넣지 마라. 열 너비는 개인 브라우저 값이다.
- 이 파일의 다른 그리드(본 표, 창고)는 손대지 마라.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/routes/DevelopmentMasterSheet.tsx` | A, B-1~B-4, C |
| `CLAUDE.md` | D, 한 줄 |

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. 화면 확인은 사용자가 한다. 신규 작지 접수 팝업에서 Yarn 칸이 넓어졌는지, 열 머리 오른쪽 끝을 끌면 너비가 바뀌고 팝업을 닫았다 열어도 그 너비가 남는지 본다.
