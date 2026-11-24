# R445 — DD MASTER 틀 고정 수정: 고정 3열은 늘 고정, 나머지는 선택 셀 기준

상태: 미착수. R444(틀 고정 도입)가 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일은 열지 않는다.

---

## 1. 무엇이 잘못됐나

R444는 담당·Status·Style No. 세 열의 강제 고정을 없애고 기본값만 `{ rows: 0, cols: 3 }`으로 뒀다. 2026-11-25 박향근 확인 결과 두 가지가 틀렸다.

**① 메뉴 첫 항목이 영영 `틀 고정 취소`다.** 2263행이

```ts
const freezeActive = freeze.rows !== 0 || freeze.cols !== 0
```

인데 기본값 `cols`가 3이라 `freezeActive`가 **처음부터 늘 참**이다. 그래서 첫 항목은 언제나 `틀 고정 취소`로만 뜨고 **`틀 고정`을 부를 길이 아예 없다.** 유일하게 누를 수 있는 그 항목을 누르면 `{ rows: 0, cols: 0 }`이 되어 **세 열의 고정까지 풀린다.** 쓰는 사람 눈에는 "틀 고정을 누를 수가 없고, 있는 메뉴를 누르면 멀쩡하던 고정이 사라진다"로 보인다.

**② 세 열은 풀 수 있으면 안 된다.** 담당·Status·Style No.는 어느 행을 보고 있는지 알려 주는 좌표라 늘 붙어 있어야 한다(2026-11-25 박향근 확정). 사용자가 고르는 것은 **그 위에 몇 열을 더 고정할지**다.

**③ `첫 행 고정`·`첫 열 고정`은 쓰이지 않는다.** 필요한 것은 "내가 고른 셀에서 고정"이다. 두 항목을 지운다.

R444의 렌더 구조(머리말 쪼개기, 행 높이 실측, sticky 좌표 계산)는 **고치지 않는다.** 바꾸는 것은 경계값을 정하는 규칙과 메뉴뿐이다.

## 2. 새 계약

```ts
/** 담당·Status·Style No. 는 늘 고정이다. 사용자가 고르는 경계는 이 값 아래로 못 내려간다. */
const MIN_FREEZE_COLS = PINNED_COLUMNS.length   // 3
```

- `freeze.cols`는 지금처럼 **`displayedColumns` 기준 절대 경계**다. 추가 개수가 아니다.
- 기본값은 `{ rows: 0, cols: MIN_FREEZE_COLS }`. 지금 화면과 같다.
- `틀 고정 취소`는 **0이 아니라 `MIN_FREEZE_COLS`로 되돌린다.** 세 열은 남는다.

## 3. 고칠 자리

### 3-1. 상수 (292~299행 `PINNED_COLUMNS` 바로 아래)

위 `MIN_FREEZE_COLS`를 더한다.

### 3-2. 기본값 (1670행대 `freeze` useState)

`loadViewNumbers` 폴백과 하한을 함께 고친다.

```ts
const [freeze, setFreeze] = useState<Freeze>(() => {
  const stored = loadViewNumbers(FREEZE_STORAGE_KEY, 0, 200)
  return {
    rows: Number.isInteger(stored.rows) ? stored.rows : 0,
    cols: Number.isInteger(stored.cols) ? Math.max(stored.cols, MIN_FREEZE_COLS) : MIN_FREEZE_COLS,
  }
})
```

**저장된 옛 값이 0이나 1이어도 3으로 올라온다.** R444를 써 본 브라우저에 `{cols:0}`이 남아 있을 수 있다.

### 3-3. 클램프 (2070행대 `freezeCols`)

지금:

```ts
const freezeCols = Math.max(0, Math.min(freeze.cols, displayedColumns.length - 1))
```

바꿀 것:

```ts
// 하한이 상한을 이긴다. 그룹을 전부 접으면 displayedColumns 가 세 열뿐이라
// length - 1 이 2가 되는데, 그때도 세 열은 고정이고 흐를 것이 없는 것이 정상이다.
const freezeCols = Math.min(
  Math.max(freeze.cols, MIN_FREEZE_COLS),
  Math.max(MIN_FREEZE_COLS, displayedColumns.length - 1),
)
```

`freezeRows`는 그대로 둔다.

### 3-4. `freezeActive` (2263행) — **이번 수정의 핵심**

```ts
const freezeActive = freeze.rows > 0 || freezeCols > MIN_FREEZE_COLS
```

`freeze.cols`가 아니라 **클램프를 거친 `freezeCols`**를 본다. 선언 순서상 `freezeCols`가 위에 있어야 한다. 아니면 `freezeActive` 선언을 `freezeCols` 아래로 옮긴다.

### 3-5. `freezeAtSelection`

```ts
const freezeAt = (cell: CellRef | null) => {
  if (!cell) return
  const rowIdx = rowIndexOf.get(cell.row)
  const colIdx = colIndexOf.get(cell.col)
  if (rowIdx === undefined || colIdx === undefined) return
  // 고른 셀의 왼쪽 열과 위쪽 행이 언다. 고정 3열 안쪽을 골라도 세 열은 그대로다.
  setFreeze({ rows: rowIdx, cols: Math.max(colIdx, MIN_FREEZE_COLS) })
}
const freezeAtSelection = () => freezeAt(range?.focus ?? null)
const clearFreeze = () => setFreeze({ rows: 0, cols: MIN_FREEZE_COLS })
```

### 3-6. 도구줄 드롭다운 (3752~3759행)

**항목을 둘로 줄인다. 라벨 토글을 쓰지 말 것.** 세 열이 늘 남으므로 "취소"가 완전한 해제가 아니고, 토글이면 한쪽을 부를 길이 막힌다(그것이 이번 버그다).

| 항목 | disabled | onClick |
|---|---|---|
| `틀 고정` | `!range?.focus` | `freezeAtSelection()` |
| `틀 고정 취소` | `!freezeActive` | `clearFreeze()` |

- `틀 고정`의 `title`은 선택이 없을 때 `"고정할 셀을 먼저 고르십시오"`.
- `틀 고정 취소`의 `title`은 비활성일 때 `"추가로 고정된 행과 열이 없습니다"`.
- **`첫 행 고정`과 `첫 열 고정` 버튼 두 줄(3757, 3758행)은 지운다.**
- 버튼 라벨, 바깥 클릭 오버레이, 팝업 상자 클래스는 그대로 둔다.

### 3-7. 셀 우클릭 메뉴에도 넣는다

"내가 지정한 셀"이 가장 자연스러운 자리다. 우클릭한 셀을 메뉴 상태에 담아 그 셀 기준으로 건다.

1. `menu` 상태 타입(1723행대)에 선택 필드를 더한다.

```ts
const [menu, setMenu] = useState<{ x: number; y: number; kind: "cells" | "bottom"; cell?: CellRef } | null>(null)
```

2. `openCellMenu`에서만 그 값을 채운다.

```ts
setMenu({ x: event.clientX, y: event.clientY, kind: "cells", cell: { row: rowId, col: colId } })
```

다른 `setMenu` 호출 세 곳(행 머리 `td`, 표 아래 빈 곳, `kind: "bottom"`)은 손대지 않는다. `cell`이 없으면 `range?.focus`로 떨어진다.

3. `menu.kind === "cells"` 가지의 구분선 아래, `요청 연결 해제` 위에 항목 둘을 넣는다. 그 블록의 기존 `<button role="menuitem">` 생김새를 그대로 따른다.

- `틀 고정` → `setMenu(null); freezeAt(menu.cell ?? range?.focus ?? null)`
- `틀 고정 취소` → `setMenu(null); clearFreeze()`, `disabled={!freezeActive}`

아이콘은 이미 import 된 것 중에서 쓴다. 새 아이콘을 import 하지 마라. `Columns3`이면 된다.

### 3-8. 측정 effect 의존성 (2077행대 `useLayoutEffect`)

지금 의존성이 `[freezeRows, filtered, colWidths, visibleGroups]`인데 `filtered`와 `visibleGroups`가 **매 렌더 새로 만들어지는 배열**이라 렌더마다 effect가 돌고 `ResizeObserver`를 떼었다 붙인다. 74열 수백 행이라 헛돈다.

```ts
}, [freezeRows, filtered.length, displayedColumns.length, colWidths])
```

로 바꾼다. 행 높이가 실제로 바뀌는 것은 `ResizeObserver`가 잡으므로 내용 변화는 의존성에 없어도 된다.

## 4. 하지 말 것

- **R444의 렌더 코드를 되돌리거나 다시 쓰지 마라.** 머리말 쪼개기(`frozenInGroup`, `frozenInRun`), `frozenRowTops` 실측, `GridCell`의 `frozenLeft`/`frozenTop`/`edgeStyle`, `scrollCellIntoView` 보정은 **그대로 둔다.** 이번 변경은 경계값 규칙과 메뉴뿐이다.
- **`PINNED_COLUMNS` 상수를 지우거나 비우지 마라.** `INTAKE_CORE`(552행), `RESIZABLE_COLUMNS`(473행), `EditorGroup label="고정 핵심"`(4282행대)이 쓴다. 전부 그대로 둔다.
- `MIN_FREEZE_COLS`를 숫자 3으로 적지 마라. `PINNED_COLUMNS.length`에서 받는다. 고정 열이 늘면 같이 따라와야 한다.
- 접수 그리드(`INTAKE_GRID_HEAD_H`, `INTAKE_WIDTH_KEY` 쪽)를 손대지 마라.
- 가상 스크롤을 넣지 마라.
- 행 높이를 32로 박지 마라.
- 셀 선택(`range`, `setRange`, `setCellAnchor`), 편집, 붙여넣기, 채우기 로직을 건드리지 마라. `openCellMenu`에서 더하는 것은 `cell` 필드 하나뿐이고 `if (!inside) setCellAnchor(...)` 줄은 그대로 둔다.
- `src/routes/Warehouse.tsx`를 열지 마라.
- `freeze`를 Firestore나 `CACHE_KEYS`에 넣지 마라. 개인 브라우저 저장이다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`은 2.5MB다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 5. 성공 기준

- `npm run build`가 통과한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx` 한 줄만 뜬다(지시서 파일 제외).
- 기본 상태에서 `틀 고정 취소`가 **비활성**이고 `틀 고정`은 셀을 고르면 활성이다.
- 어떤 셀을 고르고 `틀 고정`을 누르면 그 셀의 위쪽 행과 왼쪽 열이 언다. **담당·Status·Style No. 는 어떤 경우에도 풀리지 않는다.**
- 고정 3열 안쪽 셀(예: Status 칸)을 고르고 `틀 고정`을 눌러도 세 열은 그대로이고 행만 언다.
- `틀 고정 취소`를 누르면 추가 고정만 풀리고 세 열은 남는다.
- 도구줄 드롭다운 항목이 둘이다. `첫 행 고정`과 `첫 열 고정`은 없다.
- 셀을 우클릭하면 메뉴에 `틀 고정`과 `틀 고정 취소`가 있다.
- 새로고침해도 설정이 남고, 옛 저장값이 0이어도 세 열은 고정으로 올라온다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
