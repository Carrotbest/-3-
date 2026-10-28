# R355 — 가져오기 보드 고르기와 행 전체 삭제

**상태: 미착수.** R352~R354는 구현과 빌드를 마쳤다.

2026-10-28 박향근 요구 둘이다. 서로 무관하지만 고치는 파일이 겹쳐 한 건으로 묶는다.

1. 분석 완료 건을 개발로 넘길 때 **어느 보드에 넣을지 고르는 화면**이 떠야 하고, 그 화면에서 **새 보드를 만들어 바로 적용**할 수 있어야 한다.
2. DEVELOPMENT REQUEST 화면에 **행 전체 삭제**를 넣는다.

## 지금 흐름

분석 화면에서 「개발 의뢰로 넘기기」를 누르면 `/request?fromAnalysis=<id들>`로 가고, `FabricRequest.tsx`가 `AnalysisImportDialog`를 띄운다. 가져오기는 **그때 열려 있던 탭(활성 보드)** 으로 들어간다. 전체 탭이나 보관함이면 `blockedReason`으로 막고 "받을 보드를 먼저 고르세요"만 띄운다. 고를 수단은 팝업 안에 없다.

## 1. 팝업에서 보드를 고른다

### 1-1. `src/components/request/AnalysisImportDialog.tsx`

`Props`를 이렇게 바꾼다. `boardName`은 지우고 네 개를 더한다.

```ts
interface Props {
  targets: AnalysisRequest[]
  /** 고를 수 있는 진행 중 보드. 이름순이 아니라 화면 탭 순서 그대로 받는다. */
  boards: readonly { boardId: string; name: string }[]
  /** 지금 고른 보드. 아직 안 골랐으면 null이다. */
  boardId: string | null
  /** 보드를 고를 수 없는 사유(권한 없음 등). 없으면 가져올 수 있다. */
  blockedReason: string | null
  /** 새 보드 버튼을 보일지. 보드 편집 권한이 있을 때만 참이다. */
  canCreateBoard: boolean
  busy: boolean
  onSelectBoard: (boardId: string) => void
  onCreateBoard: () => void
  onConfirm: () => void
  onClose: () => void
}
```

`DialogDescription` 아래, 표 위에 고르는 줄을 둔다. `Select`와 `Button`은 이 저장소의 `@/components/ui/select`, `@/components/ui/button`을 쓴다. `RequestBoardDialog.tsx`에 쓰는 방식 그대로다.

```tsx
<div className="mb-3 flex items-end gap-2">
  <label className="grid flex-1 gap-1 text-xs">받을 보드
    <Select value={boardId ?? ""} onValueChange={onSelectBoard}>
      <SelectTrigger><SelectValue placeholder="보드를 고르세요" /></SelectTrigger>
      <SelectContent>{boards.map((board) => <SelectItem key={board.boardId} value={board.boardId}>{board.name}</SelectItem>)}</SelectContent>
    </Select>
  </label>
  {canCreateBoard ? <Button type="button" variant="outline" onClick={onCreateBoard}>새 보드</Button> : null}
</div>
```

설명 문구는 고른 보드 이름을 쓴다. 안 골랐으면 건수만 말한다.

```tsx
{blockedReason
  ? blockedReason
  : boardId
    ? <>고른 보드에 스타일 {targets.length}건을 만듭니다. 옵션은 빈 줄 하나로 시작하며 개발 사양은 직접 적습니다.</>
    : <>받을 보드를 고르면 스타일 {targets.length}건을 만듭니다.</>}
```

확인 버튼을 보드 없이 누르지 못하게 한다.

```tsx
<Button type="button" disabled={busy || Boolean(blockedReason) || !boardId} onClick={onConfirm}>
```

**`targets.length > 0`인 동안 팝업이 열려 있는 구조를 바꾸지 마라.** 새 보드 팝업이 이 위에 겹쳐 떴다가 닫혀도 이 팝업은 그대로 있어야 한다.

### 1-2. `src/routes/FabricRequest.tsx`

**보드를 고르면 그 탭으로 옮긴다.** 저장 길목 `commitRequests`가 `readOnly`(= 활성 보드가 전체 탭이나 보관함)를 보기 때문이다. 팝업 안에서만 보드를 들고 있으면 전체 탭에서 가져오기가 저장 단계에서 거부된다. **`commitRequests`의 `readOnly` 검사를 풀어 우회하지 마라.** 고르기와 확인은 사람의 두 동작이라 그 사이에 화면이 다시 그려지고 `readOnly`가 풀린다.

2445행의 `<AnalysisImportDialog ... />`를 이렇게 바꾼다.

```tsx
      <AnalysisImportDialog
        targets={analysisImport}
        boards={openBoards.map((board) => ({ boardId: board.boardId, name: board.name }))}
        boardId={activeBoard === ALL_BOARDS || activeBoard === ARCHIVE_VIEW ? null : activeBoard}
        blockedReason={openBoards.length === 0
          ? "진행 중인 보드가 없습니다. 새 보드를 먼저 만드세요."
          : null}
        canCreateBoard={currentUserCanEditKey("requestBoards")}
        busy={analysisBusy}
        onSelectBoard={(boardId) => setActiveBoard(boardId)}
        onCreateBoard={() => setBoardDialog("create")}
        onConfirm={() => void importFromAnalysis()}
        onClose={() => setAnalysisImport([])}
      />
```

`importFromAnalysis`는 **고치지 마라.** 이미 `activeBoard`와 `activeBoardInfo`를 읽고, 보드가 없으면 막는 줄이 그대로 남아 있어야 한다. 그 줄이 마지막 방어다.

`submitBoard`도 **고치지 마라.** 새 보드를 만들 때 이미 `setActiveBoard(board.boardId)`를 부른다(1940행). 그래서 팝업에서 새 보드를 만들면 그 보드가 그대로 선택된 상태가 된다.

`openBoards`, `currentUserCanEditKey`, `ALL_BOARDS`, `ARCHIVE_VIEW`는 이 파일에 이미 있다. 새 import를 더하지 마라.

## 2. 행 전체 삭제

**무엇을 지우는지.** 선택한 범위가 걸친 **스타일 묶음 전체**다. 옵션 한 줄이 아니라 그 Garment Number 건이 통째로 사라진다. 지금은 우클릭 `스타일 삭제`로 **한 건씩만** 지울 수 있다. 여러 건을 골라 한 번에 지우는 길이 없다.

### 2-1. 여러 건을 지우는 함수

1044행 `remove`를 다음으로 바꾼다. 기존 단건 삭제는 이 함수에 넘긴다.

```ts
  /**
   * 고른 스타일을 통째로 지운다(R355). 옵션, DD 연결, 사진이 함께 사라진다.
   * 되돌리기 스택에 넣지 않는다. 사진 파일은 되돌릴 수 없어 스택에 넣으면 반쪽만 되살아난다.
   */
  const removeStyles = (targets: readonly RequestStyle[], anchor: { x: number; y: number }) => {
    setRowMenu(null)
    if (!targets.length) return
    const ids = new Set(targets.map((style) => style.reqId))
    const optionCount = targets.reduce((sum, style) => sum + style.options.length, 0)
    const message = targets.length === 1
      ? `${targets[0].garmentNo || "이 의뢰"} 건을 삭제할까요?\n옵션 ${optionCount}건이 함께 지워집니다.`
      : `고른 ${targets.length}건을 삭제할까요?\n옵션 ${optionCount}건이 함께 지워집니다.`
    askConfirm(anchor, message, () => {
      commitRequests(requests.filter((item) => !ids.has(item.reqId)))
      void dropDdLinks(targets.flatMap((style) => style.options.map((option) => option.lineId)))
      // 사진은 없으면 조용히 넘어간다. 실패해도 원장 삭제는 그대로 둔다.
      targets.forEach((style) => { void deleteRequestImage(style.reqId).catch(() => undefined) })
    }, { confirmLabel: "삭제", danger: true })
  }

  const remove = (style: RequestStyle, anchor: { x: number; y: number }) => removeStyles([style], anchor)
```

`remove`를 쓰는 곳(2266행 버튼, 2337행 우클릭 메뉴)은 **그대로 둔다.**

**한 번의 `commitRequests`로 끝내라.** 건마다 부르면 작업 이력이 건수만큼 쌓이고 중간 실패 때 반쯤 지워진다. `dropDdLinks`도 한 번이다.

### 2-2. 선택 범위가 걸친 스타일을 모은다

`cellLine`(1201행) 근처에 둔다. `slots`와 `range`는 이미 이 파일에 있다.

```ts
  /** 지금 선택 범위가 걸친 스타일 묶음. 위에서 아래 순서를 지키고 같은 스타일은 한 번만 담는다. */
  const selectedStyles = useMemo(() => {
    if (!range) return []
    const from = Math.min(range.anchor.row, range.focus.row)
    const to = Math.max(range.anchor.row, range.focus.row)
    const seen = new Set<string>()
    const picked: RequestStyle[] = []
    for (let row = from; row <= to; row += 1) {
      const style = slots[row]?.style
      if (!style || seen.has(style.reqId)) continue
      seen.add(style.reqId)
      picked.push(style)
    }
    return picked
  }, [range, slots])
```

### 2-3. 우클릭 메뉴에 줄을 더한다

2337행의 `{menuLine && !readOnly ? <>…</> : null}` 묶음 안, **`스타일 삭제` 바로 위**에 넣는다. 고른 범위가 두 건 이상일 때만 보인다. 한 건이면 아래 `스타일 삭제`와 같은 말이라 보이지 않는다.

```tsx
{selectedStyles.length > 1 ? <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[var(--destructive)] hover:bg-[var(--muted)]" onClick={() => removeStyles(selectedStyles, { x: rowMenu.x, y: rowMenu.y })}><Trash2 className="size-3.5" />고른 행 {selectedStyles.length}건 삭제</button> : null}
```

`Trash2`는 이미 이 파일에서 쓰고 있다.

## 하지 말 것

- **`commitRequests` 말고 다른 저장 경로를 만들지 마라.** 전체 탭 편집 차단과 보드 이력이 그 함수에 붙어 있다.
- **`importFromAnalysis`의 가드(`readOnly || !activeBoardInfo`)를 지우지 마라.**
- **삭제를 되돌리기 스택(`pushSnapshot`)에 넣지 마라.** 사진 파일은 Storage에서 지워져 되살아나지 않는다. 지금 `remove`도 넣지 않는다.
- 키보드 Delete 동작을 바꾸지 마라. Delete는 값 지우기이고 이번 건은 행 삭제다. 둘을 합치면 실수로 행이 날아간다.
- `AnalysisImportDialog`의 표와 사진 안내 문구를 지우지 마라.
- 화면 열 구성, 엑셀 양식(`request-template.ts`), 분석 화면은 이번 건에서 건드리지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 둘이다. `src/components/request/AnalysisImportDialog.tsx`, `src/routes/FabricRequest.tsx`.

화면 확인은 박향근이 한다. 분석 완료 탭에서 몇 건을 체크해 「개발 의뢰로 넘기기」를 누르고, 뜬 팝업에서 보드를 고르거나 새 보드를 만들어 가져오는지 본다. 의뢰 화면에서는 행 머리를 여러 줄 끌어 고른 뒤 우클릭해 「고른 행 N건 삭제」가 뜨는지 본다.
