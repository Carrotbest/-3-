# R311 — FABRIC REQUEST 완료 행 흐리게

상태: 미착수.

대상 파일은 `src/routes/FabricRequest.tsx` 하나다. 다른 파일은 열지 않는다.

**워킹트리는 깨끗하다.** 직전 작업(R305, R306, R308~R310)은 `00894f8`로 커밋했다.

## 왜

보드에서 끝난 건과 남은 건이 같은 색으로 보인다. FL#이 나온 건을 뒤로 물려서 남은 일이
눈에 들어오게 한다. 2026-10-07 박향근 지시다.

**단위는 둘이다.**
- 스타일의 **모든** 옵션에 FL#이 있으면 그 스타일 블록을 통째로 흐리게 한다(병합된 스타일 칸 포함).
- 일부만 FL#이 있으면 **그 옵션 줄의 옵션 칸만** 흐리게 한다. 병합된 스타일 칸은 그대로 둔다.

## 틀렸던 가설

**FL#은 요청 데이터에 없다.** 스타일에도 옵션에도 FL 필드가 없다. 연결된 DD 행에서 읽는다.
`requestDdStatus(ddByLine, option)`가 돌려주는 `tone === "done"`이 유효한 FL#이 있다는 뜻이다
(`src/data/request-link.ts`, `isCompletedFlNo`). **`RequestStyle.result`(진행중·완료·드롭·보류)를
쓰지 마라.** 그건 사람이 손으로 고르는 보드 결과값이라 FL#과 다른 값이다.

`requestDdStatus`를 셀마다 부르지 마라. 셀 하나당 옵션 수만큼 도는 꼴이라 큰 보드에서 느려진다.
2단계처럼 렌더당 한 번만 계산한다.

## 지금 코드

**759행** — 이미 있다.
```ts
  const ddByLine = useMemo(() => ddRecordsByLineId(ddRecords), [ddRecords])
```

**986행** — 이 아래에 2단계를 넣는다.
```ts
  const slots = visible.flatMap((style) => Array.from({ length: Math.max(1, style.options.length) }, (_, optionIndex) => ({ style, optionIndex, option: style.options[optionIndex] })))
```

**1697~1712행** — `renderDataCell`의 머리와 지역 변수
```ts
  const renderDataCell = (
    line: Line,
    column: RequestColumn,
    slotIndex: number,
    height: number,
    maxHeight: number,
    rowSpan?: number,
  ): ReactNode => {
    const fixed = FIXED_COLUMNS.some((item) => item.id === column.id)
    const kind = editKindOf(column.id)
    const editable = kind !== null
    const cellRef = { row: slotIndex, col: column.id }
    const editing = editable && editCell?.row === slotIndex && editCell.col === column.id && kind !== "toggle"
    const isOption = line.kind === "option"
    const sel = selectionFor(slotIndex, column)
```

**1718행** — 데이터 셀 className. 배경을 고르는 삼항이 그 안에 있다.
```
${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : column.id === "remark" ? "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]" : "bg-[var(--card)]"}
```

**행 번호 칸(좌측 sticky)** — `TableCell`의 className이다. `data-row-start`가 붙은 그 칸이다.
```tsx
                      className="relative sticky left-0 z-20 select-none border-b border-r border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--muted)] p-0 text-center align-top text-[10px] font-medium tabular-nums text-[var(--muted-foreground)]"
```

**2058~2060행** — 이미 같은 판정을 쓰는 자리가 있다. 2단계를 만든 뒤 여기도 그것을 쓰게 바꾼다.
```tsx
                        const statuses = style.options.map((option) => requestDdStatus(ddByLine, option))
                        const linkedCount = statuses.filter((status) => status.tone !== "none").length
                        const allDone = statuses.every((status) => status.tone === "done")
```

## 할 일

### 1. 흐리게 색 상수

파일 위쪽 상수 모음(`MIN_COLUMN_WIDTH`, `COL_WIDTHS_KEY` 근처)에 더한다.

```ts
/** 완료(FL# 나온) 칸 배경. 선택 강조보다 약해야 해서 연하게 쓴다. */
const DONE_CELL_BG = "bg-[color-mix(in_srgb,var(--muted-foreground)_14%,var(--card))] text-[var(--muted-foreground)]"
```

### 2. 스타일별 완료 색인

986행 `slots` 바로 아래에 더한다.

```ts
  /**
   * FL# 완료 색인. 렌더당 한 번만 만든다.
   * `all`은 스타일의 모든 옵션에 FL#이 있다는 뜻이고, `options`는 FL#이 나온 옵션 id다.
   * 옵션이 없는 스타일은 완료로 보지 않는다.
   */
  const doneByStyle = useMemo(() => {
    const map = new Map<string, { all: boolean; options: Set<string> }>()
    for (const style of visible) {
      const options = new Set<string>()
      for (const option of style.options) {
        if (requestDdStatus(ddByLine, option).tone === "done") options.add(option.optId)
      }
      map.set(style.reqId, { all: style.options.length > 0 && options.size === style.options.length, options })
    }
    return map
  }, [ddByLine, visible])
```

### 3. 셀마다 흐림 여부

`renderDataCell` 안, `const sel = selectionFor(slotIndex, column)` **바로 아래**에 더한다.

```ts
    // 전부 완료면 병합된 스타일 칸까지, 일부만 완료면 그 옵션 줄의 옵션 칸만 흐리게 한다.
    const done = doneByStyle.get(line.style.reqId)
    const dimmed = Boolean(done && (done.all || (line.kind === "option" && done.options.has(line.option.optId))))
```

### 4. 셀 배경

1718행 className의 배경 삼항에 `dimmed`를 **`sel.inRange` 바로 뒤**에 끼운다. 선택이 흐림보다 세다.
DD MASTER도 `dimmed && !sel.inRange`로 같은 순서를 쓴다. 나머지 조건은 손대지 마라.

바꾸기 전
```
${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : column.id === "remark" ? "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]" : "bg-[var(--card)]"}
```
바꾼 뒤
```
${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : dimmed ? DONE_CELL_BG : column.id === "remark" ? "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]" : "bg-[var(--card)]"}
```

### 5. 행 번호 칸

스타일 전체가 완료일 때만 행 번호 칸도 흐리게 한다. `className`을 템플릿 문자열로 바꾸고
`bg-[var(--muted)]`만 조건부로 만든다. **나머지 클래스와 `style`, `data-row-start`,
세 개의 마우스 핸들러는 그대로 둔다.**

```tsx
                      className={`relative sticky left-0 z-20 select-none border-b border-r border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] p-0 text-center align-top text-[10px] font-medium tabular-nums text-[var(--muted-foreground)] ${doneByStyle.get(style.reqId)?.all ? "bg-[color-mix(in_srgb,var(--muted-foreground)_18%,var(--muted))]" : "bg-[var(--muted)]"}`}
```

### 6. 2058~2060행을 색인으로 바꾼다

같은 계산을 두 번 하지 않는다. `statuses`는 `linkedCount`에 아직 필요하므로 남기고
`allDone`만 색인에서 가져온다.

```tsx
                        const statuses = style.options.map((option) => requestDdStatus(ddByLine, option))
                        const linkedCount = statuses.filter((status) => status.tone !== "none").length
                        const allDone = doneByStyle.get(style.reqId)?.all ?? false
```

## 하지 말 것

- **`RequestStyle.result`로 판정하지 마라.** 사람이 고르는 보드 결과값이라 FL#과 다르다. 지시는 FL# 기준이다.
- **`requestDdStatus`를 `renderDataCell` 안에서 부르지 마라.** 2단계 색인만 본다.
- **선택 강조를 흐림보다 약하게 만들지 마라.** `sel.inRange`가 먼저다. 선택한 칸이 흐려지면 어디를 골랐는지 안 보인다.
- **`opacity`를 쓰지 마라.** 칸 전체가 반투명해지면 선택 테두리(`box-shadow`)와 채우기 미리보기 점선까지 같이 흐려진다. 배경색과 글자색으로만 처리한다.
- **옵션이 없는 스타일을 완료로 보지 마라.** `style.options.length > 0` 조건을 빼지 마라. 빈 스타일이 전부 회색이 된다.
- **`inFillPreview`의 점선과 `selectionShadow`를 건드리지 마라.**
- `TableCell`의 `onMouseDown`, `onDoubleClick`, `onContextMenu`, `onMouseEnter`를 손대지 마라.
- 행 번호 칸의 `data-row-start`와 세 마우스 핸들러를 손대지 마라. 행 전체 선택과 드래그가 거기 걸려 있다.
- 완료 건을 목록에서 빼거나 접는 기능을 만들지 마라. 흐리게만 한다.
- `src/data/request-link.ts`, `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/Warehouse.tsx`는 열지 않는다.
- 새 패키지를 넣지 마라. 새 import 도 넣지 마라. `requestDdStatus`와 `useMemo`는 이미 들여온다.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `doneByStyle`이 **4번** 나와야 한다(선언 1, renderDataCell 1, 행 번호 칸 1, allDone 1).
- `DONE_CELL_BG`가 **2번**(선언 1, 사용 1).
- `git status --short`에 `src/routes/FabricRequest.tsx` 하나만 `M`이어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 세 가지, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
