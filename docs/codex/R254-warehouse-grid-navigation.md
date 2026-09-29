# R254 WAREHOUSE 표 선택 조작 개선

상태: 미착수. 표 선택과 이동 동작만 바꾼다. 데이터, 저장, 동기화는 건드리지 않는다.

## 확인한 현재 상태

코드를 열어 확인한 사실이다. 추측이 아니다.

**1. 드래그 자동 스크롤이 없다.** `Warehouse.tsx`의 셀 `onMouseEnter`가 `cellDragRef.current`일 때 `setCellRange`로 focus만 옮긴다. 포인터가 표 가장자리에 닿아도 굴러가지 않는다. 화면 밖 행은 잡을 수 없다. `Warehouse.tsx`에 `autoScroll`, `startDragAutoScroll` 문자열이 하나도 없다.

**2. 키보드 셀 이동이 아예 없다.** `Warehouse.tsx`에 `ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight` 처리가 없다. window keydown 리스너는 복사(`onCopy`) 하나뿐이다. 그래서 방향키가 브라우저 기본 동작인 페이지 스크롤로 간다. 사용자가 말한 "스크롤락"이 이것이다.

**3. 선택 영역에 선이 두 겹으로 그려진다.** 1725행 `TableCell`이 두 가지를 동시에 그린다.
- `edges`: 범위 가장자리에만 `inset` box-shadow **1.5px** (1707~1712행). 이 계산 자체는 맞다.
- `cellActive`: `selectedCell`과 일치하는 칸에 `outline outline-2` **2px**.

`selectedCell`은 `onClick`에서 잡힌다. 드래그는 mouseup에서 click이 나므로 드래그가 끝난 칸에 2px 외곽선이 하나 더 생긴다. 굵기가 다른 초록 선 두 개가 같은 영역 안에 겹쳐 보인다.

**4. 셀에 위치 속성이 없다.** `Warehouse.tsx`에 `data-col-id`, `data-row-id`, `data-row-index`, `data-col-index`가 하나도 없다. 그래서 `document.elementFromPoint`로 포인터 아래 칸을 찾을 수 없다. 자동 스크롤과 키보드 이동을 넣으려면 이것부터 있어야 한다.

## 참고할 기존 구현

같은 저장소 안에 이미 있다. 새로 설계하지 말고 그대로 가져온다.

- 드래그 자동 스크롤: `src/routes/DevelopmentMasterSheet.tsx` 1408~1431행 `startDragAutoScroll`
- 포인터 아래 칸 재탐색: `src/routes/FabricRequest.tsx` 955~1012행 `extendAtPointerRef`와 `tick`
- 셀을 화면 안으로: `src/routes/DevelopmentMasterSheet.tsx` 1735행 `scrollCellIntoView`

스크롤 상자는 세 화면 모두 `document.querySelector("[data-route-scroll-root]")`다. `App.tsx`에 있다.

## 할 일

### A. 셀에 위치 속성을 붙인다

1725행 `TableCell`에 두 속성을 더한다. 기존 `data-no-range`는 그대로 둔다.

```
data-row-index={index}
data-col-index={colIndex}
```

### B. 드래그 중 자동 스크롤

`cellDragRef`가 true인 동안 도는 rAF 루프를 만든다. `DevelopmentMasterSheet`의 `startDragAutoScroll`과 같은 규칙이다.

- ref 세 개를 더한다. `dragPointerRef`(마지막 포인터 좌표), `dragFrameRef`(rAF id), `lastExtendRef`(마지막으로 넓힌 칸 키).
- 셀 `onMouseDown`에서 `cellDragRef.current = true` 다음 줄에 포인터 좌표를 저장하고 루프를 시작한다.
- 루프 한 번마다 이렇게 한다.
  - 스크롤 상자 `[data-route-scroll-root]`의 `getBoundingClientRect()`를 잡는다.
  - 머리글이 sticky이므로 위쪽 기준은 `thead`의 `getBoundingClientRect().bottom`과 상자 top 중 큰 값이다.
  - 포인터 y가 그 기준 + 24보다 위면 `scrollTop -= 16`, 상자 bottom - 48보다 아래면 `scrollTop += 16`.
  - 포인터 x가 상자 left + 80보다 왼쪽이면 `scrollLeft -= 16`, 상자 right - 48보다 오른쪽이면 `scrollLeft += 16`.
  - 좌표를 상자 안으로 당긴 뒤(`Math.min`, `Math.max`, 스크롤바 폭 14px 고려) `document.elementFromPoint`로 `[data-row-index][data-col-index]`를 찾아 `setCellRange((current) => current ? { ...current, fr, fc } : current)`를 부른다.
  - 같은 칸이면 `setCellRange`를 건너뛴다. `lastExtendRef`로 막는다. **막지 않으면 프레임마다 재렌더가 돌아 표가 멎는다.**
- window `mousemove`에서 포인터 좌표를 갱신하고 루프가 멈춰 있으면 다시 시작한다.
- window `mouseup`에서 `cancelAnimationFrame`하고 세 ref를 비운다. 기존 1401행 `stop` 함수 자리에 같이 넣는다.

**마우스가 멈춰도 루프가 계속 돌아야 한다.** 가장자리에 대고 기다리면 계속 굴러가면서 선택이 따라 넓어지는 것이 목적이다.

### C. 키보드 셀 이동

window `keydown` 리스너를 하나 더한다. 기존 복사 리스너와 별개로 둔다.

**동작 조건.** 아래 중 하나라도 맞으면 아무것도 하지 않고 반환한다.
- `editCell`이 있다(셀 편집 중).
- `document.activeElement`가 input, textarea, select이거나 `contentEditable`이다.
- `cellRange`가 없다.
- 열려 있는 Dialog가 있다(`document.querySelector("[role=dialog]")`).

**키 처리.**
- `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`: `event.preventDefault()`를 반드시 부른다. 이걸 빼면 페이지가 같이 스크롤된다.
  - Shift 없이: `setCellRange({ ar: r, ac: c, fr: r, fc: c })`로 한 칸짜리 선택을 옮기고 `setExtraCellRanges([])`로 추가 영역을 비운다.
  - Shift와 함께: anchor는 두고 focus만 옮긴다. `setCellRange((current) => ({ ...current, fr, fc }))`.
- 경계에서는 멈춘다. 행은 `0`에서 `visibleRows.length - 1`, 열은 `0`에서 `visibleColumns.length - 1`이다. 줄바꿈 이동(마지막 열에서 오른쪽 누르면 다음 행 첫 열)은 넣지 않는다.

**이동 뒤 화면 맞추기.** `scrollCellIntoView(rowIndex, colIndex)`를 새로 만든다. `DevelopmentMasterSheet` 1735행과 같은 방식이되 Warehouse는 인덱스 기준이라 선택자가 다르다.

```
const scrollCellIntoView = (rowIndex: number, colIndex: number) => {
  window.requestAnimationFrame(() => {
    const cell = document.querySelector<HTMLElement>(`td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`)
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" })
  })
}
```

`block: "nearest"`와 `inline: "nearest"`를 쓴다. `center`를 쓰면 한 칸 움직일 때마다 화면이 크게 튄다.

**활성 칸 표시도 같이 옮긴다.** 방향키로 이동할 때 `setSelectedCell({ row: visibleRows[rowIndex].key, col: visibleColumns[colIndex].id })`를 같이 불러야 표시가 따라온다.

### C-2. 실제 구현에서 바뀐 것 (2026-09-29)

- **스크롤 상자는 `gridRefs.current[tab]`이다.** `[data-route-scroll-root]`가 아니다. 창고 표는 `Warehouse.tsx` 1738행의 자체 `overflow-auto` 상자에서 구르고 바깥 섹션은 `overflow-hidden`이라 라우트 스크롤 루트가 움직이지 않는다. DD MASTER 코드를 그대로 옮기면 자동 스크롤이 조용히 아무 일도 안 한다.
- **Home은 같은 행 맨 왼쪽, End는 같은 행 맨 오른쪽이다.** 행은 바뀌지 않는다.
- **Ctrl+PageUp과 Ctrl+PageDown은 쓰지 않는다.** 크롬이 탭 전환으로 먼저 가져가 `preventDefault`가 듣지 않는다. 대신 **Ctrl+방향키 위아래**로 같은 열의 첫 행과 마지막 행에 간다. 다시 PageUp, PageDown으로 되돌리지 말 것.
- **`selectedCell`은 셀 `onMouseDown`과 `onContextMenu`에서도 잡는다.** `onClick`만으로는 드래그 때 mouseup이 다른 칸에서 끝나 click이 td에 오지 않아, 먼저 클릭해 둔 칸의 외곽선이 남는다.
- **`TableRow`의 `tabIndex={0}` 포커스 링을 `focus-visible`로 바꿨다.** 마우스 클릭에도 브라우저 기본 링이 떠서 행 위아래에 검정 가로선이 그어졌다. `focus:outline-none`으로 끄고 키보드 포커스에서만 초록 링을 그린다. `tabIndex`를 지우지 말 것. 상세 보기 키보드 진입이 사라진다.

### D. 선택 외곽선 정리

목표는 잡힌 영역마다 바깥 테두리 하나다. 안쪽에는 초록 선이 없다.

1. **`cellActive` 외곽선은 범위 안에서는 그리지 않는다.** 1725행의 `cellActive` 조건을 `cellActive && !inRange`로 바꾼다. 범위 안의 활성 칸은 배경만으로 구분한다.
2. **`edges` 굵기를 1.5px에서 2px로 올린다.** 활성 칸 외곽선과 같은 굵기로 맞춘다. 1708~1711행 네 줄의 `1.5px`를 `2px`로 바꾼다.
3. **범위 안 활성 칸은 배경을 한 단계 진하게 준다.** `inRange && cellActive`일 때 `bg-[color-mix(in_srgb,var(--grid-selection)_16%,transparent)]`를 쓴다. 일반 범위 칸은 지금처럼 8%다. 엑셀에서 앵커 칸이 다르게 보이는 것과 같은 역할이다.
4. **고정 열(`fixed`)의 `style.background`가 범위 배경을 덮는다.** 1725행에서 `fixed`일 때 `background`를 무조건 덮어쓰고 있다. `inRange`이면 덮지 않도록 조건을 더한다. 안 고치면 왼쪽 고정 열만 선택 색이 빠져 영역이 끊겨 보인다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/routes/Warehouse.tsx` | 유일한 수정 대상. A, B, C, D 전부 |

다른 파일은 열지 않는다. `DevelopmentMasterSheet.tsx`와 `FabricRequest.tsx`는 **읽기만** 한다.

## 손대지 말 것

- `rectTsv`, 복사 리스너, 붙여넣기, 지우기 로직
- `beginRangeSelect`, `extendRangeSelect`(행 머리글 드래그). 이번 범위 밖이다
- `extraCellRanges`의 Ctrl+클릭 누적 규칙. 방향키가 비우는 것만 더한다
- `openAction`, `applyFabricAction` 등 저장 경로
- 열 너비 조절(`startColumnResize`)과 필터 메뉴

## 반복 실수 방지

- **rAF 루프 안에서 같은 값으로 setState를 부르지 마라.** 프레임마다 재렌더가 돌아 표가 멎는다. `lastExtendRef`로 같은 칸을 걸러라.
- **ref 콜백 안에서 setState 하지 마라.** 무한 렌더로 화면이 백지가 된다(R119 창고 탭 전환 사고).
- **`mouseup`에서 rAF를 반드시 취소해라.** 안 하면 드래그가 끝나도 루프가 계속 돌아 CPU를 먹는다.
- 방향키에 `preventDefault`를 빼지 마라. 페이지가 같이 움직인다.

## 검증

```
npm run build
git status --short
```

빌드 오류 0이면 통과다. `git status --short`에 `src/routes/Warehouse.tsx`와 이 문서만 나와야 한다.

화면 확인은 사용자가 한다.
