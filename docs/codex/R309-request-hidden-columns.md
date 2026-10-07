# R309 — FABRIC REQUEST 열 숨기기 (DD MASTER와 같은 규칙)

상태: 미착수.

대상 파일은 `src/routes/FabricRequest.tsx` 하나다. 다른 파일은 열지 않는다.

**R305, R306, R307, R308을 적용한 워킹트리 위에서 한다.** 커밋 전 변경이
`FabricRequest.tsx`와 `DevelopmentMasterSheet.tsx`에 있다. **되돌리지 마라.**

## 왜

REQUEST에는 열을 숨기는 길이 없다. 밴드(ORIGINAL, 분석, 의뢰, 옵션)를 통째로 접는 것뿐이라
밴드 안에서 쓰지 않는 열 한두 개만 치울 수 없다. DD MASTER에는 있다.

**열 너비와 밴드 펼침은 이미 저장된다.** `fabric.request.colWidths`, `fabric.request.openGroups`,
`fabric.request.rowHeights`로 브라우저에 남는다(`startColumnResize`의 `cleanup`이
`saveColumnWidths`를 부르는 것까지 확인했다). 이번에 더하는 것은 **숨긴 열 하나뿐이다.**
너비 저장 코드를 다시 만들지 마라.

DD MASTER의 같은 기능은 `src/routes/DevelopmentMasterSheet.tsx`의 45행, 334행, 1307~1308행,
1588~1596행, 3077~3083행, 3120행이다. **그 파일을 열지 마라.** 필요한 내용은 아래에 다 옮겼다.

## 틀렸던 가설

없다. 위 사실은 코드에서 확인했다. 다시 조사하지 말고 바로 고쳐라.

한 가지만 못 박는다. **`loadViewGroups`는 `defaults`에 있는 키만 되읽는다**
(`src/data/view-prefs.ts` 22행 `if (name in next ...)`). 그래서 기본값을 `{}`로 주면
저장된 값이 전부 버려진다. 아래 2단계처럼 모든 열 id를 `false`로 채운 기본값을 만들어야 한다.

## 지금 코드

**47행**
```ts
import { loadViewNumbers, saveViewPref } from "@/data/view-prefs"
```

**120~122행**
```ts
const COL_WIDTHS_KEY = "fabric.request.colWidths"
const OPEN_GROUPS_KEY = "fabric.request.openGroups"
const ROW_HEIGHTS_KEY = "fabric.request.rowHeights"
```

**125~126행**
```ts
const ALL_COLUMNS = [...FIXED_COLUMNS, ...COLUMN_GROUPS.flatMap((group) => group.columns)]
const COLUMN_IDS = new Set(ALL_COLUMNS.map((column) => column.id))
```

**968~971행** — R308 뒤에 몇 줄 밀린다. 코드 조각으로 찾아라.
```ts
  const visibleGroups = COLUMN_GROUPS.filter((group) => openGroups[group.key])
  const boardColumn: RequestColumn = { id: "boardName", label: "보드", width: 120, scope: "style" }
  const visibleColumns = readOnly ? [...FIXED_COLUMNS, boardColumn, ...visibleGroups.flatMap((group) => group.columns)] : [...FIXED_COLUMNS, ...visibleGroups.flatMap((group) => group.columns)]
```

**열 머리글 두 번째 줄** — 밴드 안 열 머리글이다.
```tsx
                {visibleGroups.flatMap((group) => group.columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={`relative sticky top-6 z-30 h-8 truncate border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-xs font-normal text-[var(--muted-foreground)]`}
                    style={{ width: widthOf(column) }}
                    title={column.label}
                  >
                    {column.label}
                    <span
                      aria-hidden="true"
                      title={`${column.label} 너비 조절`}
                      onMouseDown={(event) => startColumnResize(column, event)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
                    />
                  </TableHead>
                )))}
```

**도구줄 오른쪽** — "너비 초기화" 버튼
```tsx
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-[var(--muted-foreground)]" onClick={resetColumnWidths} title="열 너비를 기본값으로 되돌립니다">
              <RotateCcw className="size-3.5" />너비 초기화
            </Button>
```

## 할 일

### 1. import와 저장 키

47행을 바꾼다.
```ts
import { loadViewGroups, loadViewNumbers, saveViewPref } from "@/data/view-prefs"
```

122행 아래에 더한다.
```ts
const HIDDEN_COLS_KEY = "fabric.request.hiddenCols"
```

### 2. 기본값

126행 아래에 더한다.

```ts
const GROUP_COLUMNS = COLUMN_GROUPS.flatMap((group) => group.columns)
/** 숨김 기본값. `loadViewGroups`가 여기 있는 키만 되읽으므로 모든 열을 적어 둬야 한다. */
const DEFAULT_HIDDEN: Record<string, boolean> = Object.fromEntries(GROUP_COLUMNS.map((column) => [column.id, false]))
```

좌측 고정 열(사진, Garment No.)과 보기 전용 `보드` 열은 넣지 않는다. 숨길 수 없는 열이다.

### 3. 상태

`const [openGroups, ...]` 선언 바로 아래에 더한다.

```ts
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>(() => loadViewGroups(HIDDEN_COLS_KEY, DEFAULT_HIDDEN))
  const [hiddenMenuOpen, setHiddenMenuOpen] = useState(false)
```

### 4. 숨기기 함수

`const visibleGroups = ...` 바로 위에 더한다.

```ts
  const hiddenColumnList = GROUP_COLUMNS.filter((column) => hiddenColumns[column.id])
  const setHidden = (next: Record<string, boolean>) => { setHiddenColumns(next); saveViewPref(HIDDEN_COLS_KEY, next) }
  const hideColumn = (columnId: string) => setHidden({ ...hiddenColumns, [columnId]: true })
  const showColumn = (columnId: string) => setHidden({ ...hiddenColumns, [columnId]: false })
  const showAllColumns = () => setHidden({ ...DEFAULT_HIDDEN })
```

### 5. 숨긴 열을 표에서 뺀다

`visibleGroups`를 바꾼다. **밴드 안 열을 거르고, 전부 숨긴 밴드는 밴드째 뺀다.**

```ts
  const visibleGroups = COLUMN_GROUPS
    .filter((group) => openGroups[group.key])
    .map((group) => ({ ...group, columns: group.columns.filter((column) => !hiddenColumns[column.id]) }))
    .filter((group) => group.columns.length > 0)
```

`visibleColumns`와 `tableWidth`는 `visibleGroups`를 쓰므로 그대로 두면 따라온다. 고치지 마라.

밴드 머리의 `colSpan={group.columns.length}`, 밴드 접기 버튼, `startGroupResize(group.columns, ...)`도
모두 걸러진 `columns`를 보게 되므로 그대로 둔다.

타입이 어긋나면 `RequestGroup` 인터페이스의 `columns: readonly RequestColumn[]`에 맞춰
`.map`의 결과를 `RequestGroup[]`로 명시해라. 인터페이스 자체는 고치지 마라.

### 6. 열 머리글의 숨김 버튼

열 머리글 `TableHead`의 className 맨 앞에 `group/col `을 붙이고, `{column.label}` 바로 아래에
버튼을 넣는다. **너비 조절 `span`과 `style`, `title`, `key`는 그대로 둔다.**

```tsx
                  <TableHead
                    key={column.id}
                    className={`group/col relative sticky top-6 z-30 h-8 truncate border-b border-r border-[var(--border)] bg-[var(--muted)] px-2 text-center text-xs font-normal text-[var(--muted-foreground)]`}
                    style={{ width: widthOf(column) }}
                    title={column.label}
                  >
                    {column.label}
                    <button
                      type="button"
                      aria-label={`${column.label} 열 숨기기`}
                      title={`${column.label} 열 숨기기`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); hideColumn(column.id) }}
                      className="absolute left-0.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded border border-current bg-[var(--card)] text-[10px] leading-none opacity-0 transition-opacity hover:bg-[var(--muted)] group-hover/col:opacity-100"
                    >
                      −
                    </button>
                    <span
                      aria-hidden="true"
                      title={`${column.label} 너비 조절`}
                      onMouseDown={(event) => startColumnResize(column, event)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none transition-colors hover:bg-[var(--primary)]"
                    />
                  </TableHead>
```

글자는 하이픈이 아니라 뺄셈 기호 `−`(U+2212)다. DD MASTER와 같은 글자를 쓴다.

### 7. 도구줄의 "숨긴 열 N"

"너비 초기화" 버튼 **바로 위**에 넣는다.

```tsx
            {hiddenColumnList.length ? <span className="relative shrink-0">
              <button type="button" aria-expanded={hiddenMenuOpen} onClick={() => setHiddenMenuOpen((current) => !current)} className="flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--muted-foreground)] hover:text-[var(--foreground)]">숨긴 열 <span className="tabular-nums">{hiddenColumnList.length}</span></button>
              {hiddenMenuOpen ? <>
                <span className="fixed inset-0 z-[80]" onMouseDown={() => setHiddenMenuOpen(false)} />
                <span className="absolute right-0 top-full z-[81] mt-1 block max-h-64 w-44 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg">
                  <button type="button" onClick={() => { showAllColumns(); setHiddenMenuOpen(false) }} className="mb-1 block w-full rounded px-2 py-1 text-left text-[11px] font-medium hover:bg-[var(--muted)]">모두 다시 보이기</button>
                  {hiddenColumnList.map((column) => <button key={column.id} type="button" onClick={() => showColumn(column.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--muted)]">{column.label}</button>)}
                </span>
              </> : null}
            </span> : null}
```

## 하지 말 것

- **열 너비 저장 코드를 다시 만들지 마라.** `loadColumnWidths`, `saveColumnWidths`, `startColumnResize`, `startGroupResize`, `resetColumnWidths`는 이미 동작한다. 손대지 마라.
- **`loadViewGroups`의 기본값을 `{}`로 주지 마라.** 저장된 값이 전부 버려진다. 2단계대로 모든 열을 `false`로 채운다.
- **좌측 고정 열(사진, Garment No.)과 `boardColumn`을 숨길 수 있게 만들지 마라.** 숨김 버튼은 밴드 안 열 머리글에만 단다.
- **`visibleColumns`와 `tableWidth`를 직접 고치지 마라.** `visibleGroups`만 바꾸면 따라온다.
- **`RequestGroup` 인터페이스를 고치지 마라.**
- **`<colgroup>`을 지우거나 바꾸지 마라.** 첫 헤더 줄이 병합 칸이라 없으면 열 너비가 통째로 무시된다.
- **숨김 상태를 `CACHE_KEYS`나 Firestore에 올리지 마라.** 보기 설정은 브라우저에만 남는다. DD MASTER와 같은 규칙이다.
- `TableCell`의 `onMouseDown`, `onDoubleClick`, `onContextMenu`, `onMouseEnter`를 손대지 마라.
- R305, R306, R308이 넣은 것(`fillPreview`, `commitFillRef`, `startFill`, `scrollCellIntoView`, `inFillPreview`, `dragOver`, `dragLeave`, `drop`, `dropping`, `removeImage`, `onDelete`)을 건드리지 마라.
- `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/Warehouse.tsx`, `src/data/view-prefs.ts`는 열지도 고치지도 마라.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `src/routes/FabricRequest.tsx`에서 `hiddenColumns`가 **5번** 나와야 한다(상태 1, setHidden 안 1, hideColumn 1, showColumn 1, visibleGroups 1).
- `HIDDEN_COLS_KEY`가 **3번**(선언 1, loadViewGroups 1, saveViewPref 1).
- `git status --short`에 `src/routes/FabricRequest.tsx`와 `src/routes/DevelopmentMasterSheet.tsx`가 둘 다 `M`으로 남아 있어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 세 가지, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
