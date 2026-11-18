# R437 — 셀 편집 키를 엑셀과 같게 (Alt+Enter 줄바꿈, 여러 줄 표시)

상태: 미착수

## 범위

**이번에 고치는 파일은 셋뿐이다.**

- `src/routes/DevelopmentMasterSheet.tsx` (DD MASTER 그리드)
- `src/routes/FabricRequest.tsx` (REQUEST 표)
- `src/data/dd-export.ts` (내보내기 줄바꿈 표시)

창고(`src/routes/Warehouse.tsx`), 1팀 입고 대화상자(`src/components/warehouse/Fabric1IntakeDialog.tsx`),
DD 74열 수정 모달, DD 접수 그리드는 **R438에서 따로 한다. 이번에 손대지 마라.**

## 이미 되어 있는 것 — 다시 만들지 마라

아래는 전부 지금 동작한다. 같은 기능을 새로 짜면 키가 두 번 먹어 선택이 두 칸씩 건너뛴다.

- `DevelopmentMasterSheet.tsx`의 `editorKeyHandler`: Enter 확정+아래, Shift+Enter 위,
  Tab 오른쪽, Shift+Tab 왼쪽, Ctrl+Enter 범위 채우기, Esc 취소.
- `FabricRequest.tsx`의 `CellEditor` 안 `shared.onKeyDown`: 위와 같다.
- `src/data/range-tsv.ts`의 `parseTsvGrid`와 `tsvCell`: 줄바꿈이 든 칸을 RFC4180 따옴표로
  감싸고 되읽는다. 복사·붙여넣기는 이미 맞다. **이 파일을 열지 마라.**

**틀렸던 가설: "Enter가 아래로 안 간다."** 아니다. DD와 REQUEST는 간다. 못 가는 것은 창고뿐이고
그것은 R438이다. 이 가정으로 DD나 REQUEST의 이동 로직을 새로 짜지 마라.

## 1. DD MASTER — 여러 줄을 받을 열 판정

`src/routes/DevelopmentMasterSheet.tsx`.

`editorKeyHandler` 함수 정의 **바로 위**(약 1243행. `COMPUTED_COLUMN_IDS` 선언이 835행이므로
그보다 뒤다)에 아래를 그대로 추가한다.

```ts
/**
 * 이 열이 칸 안 줄바꿈(Alt+Enter)을 받는가. 엑셀은 모든 칸이 받지만 여기서는 자유 글자 열만 연다.
 * 날짜·숫자·선택형은 `isAcceptableCellValue` 가 줄바꿈 든 값을 거부해 값이 조용히 안 들어간다.
 * `suggest` 열(담당·Buyer)은 제안 목록이 `<input list>` 에만 붙어 textarea 로 못 바꾼다.
 * `styleNo` 와 `flNo` 는 REQUEST·샘플대장과 맞추는 키라 줄바꿈이 섞이면 매칭이 조용히 깨진다.
 */
const MULTILINE_BLOCKED_IDS = new Set(["flNo", "styleNo"])
function isMultilineColumn(column: MasterColumn): boolean {
  if (MULTILINE_BLOCKED_IDS.has(column.id)) return false
  if (column.date || column.number || column.suggest) return false
  if (column.options && column.options.length) return false
  if (COMPUTED_COLUMN_IDS.has(column.id)) return false
  return true
}
```

## 2. DD MASTER — `editorKeyHandler` 에 Alt+Enter 분기

현재 코드(약 1244~1257행):

```ts
function editorKeyHandler<T extends HTMLInputElement | HTMLSelectElement>(
  onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void,
  onCancel: () => void,
) {
  return (event: ReactKeyboardEvent<T>) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
    else if (event.key === "Escape") { event.preventDefault(); onCancel() }
    else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
    }
  }
}
```

이것으로 바꾼다. 제네릭에 `HTMLTextAreaElement` 를 더하고, 세 번째 인자 `multiline` 을 받는다.

```ts
function editorKeyHandler<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
  onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void,
  onCancel: () => void,
  multiline = false,
) {
  return (event: ReactKeyboardEvent<T>) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
    // Alt+Enter 는 칸 안 줄바꿈이다. 확정하지 않는다.
    // 브라우저 기본 동작에 맡기지 않고 직접 넣는다. 크롬은 textarea 에서 Alt+Enter 를
    // 수식키 조합으로 보고 아무 글자도 넣지 않는 경우가 있다.
    if (multiline && event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const el = event.currentTarget as HTMLTextAreaElement
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      el.value = `${el.value.slice(0, start)}\n${el.value.slice(end)}`
      el.selectionStart = el.selectionEnd = start + 1
      // 높이 자동 조절(`onInput`)을 깨운다. defaultValue 로 도는 비제어 입력이라 안전하다.
      el.dispatchEvent(new Event("input", { bubbles: true }))
      return
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit(event.currentTarget.value, undefined, true) }
    else if (event.key === "Escape") { event.preventDefault(); onCancel() }
    else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      onCommit(event.currentTarget.value, event.key === "Enter" ? event.shiftKey ? "up" : "down" : event.shiftKey ? "left" : "right")
    }
  }
}
```

## 3. DD MASTER — 여러 줄 편집기 추가

`InlineFlNoEditor` 정의 바로 뒤, `InlineEditor` 정의 **앞**에 넣는다.

```tsx
/** 편집기가 아래로 자랄 수 있는 최대 높이(px). 넘으면 편집기 안에서 스크롤한다. */
const MULTILINE_EDITOR_MAX_H = 240

/**
 * 자유 글자 칸의 인라인 편집기. 엑셀처럼 Alt+Enter 로 줄을 늘린다.
 *
 * **편집기는 `absolute` 로 아래 행을 덮으며 자란다.** 표 행 높이는 편집하는 동안 바뀌지 않는다.
 * 행이 늘어나는 것은 확정한 뒤 셀이 여러 줄로 그려질 때다. 편집 중에 행을 늘리면 아래 행들이
 * 글자마다 밀려 내려가 커서가 따라다니는 것처럼 보인다.
 */
function InlineTextEditor({ initialValue, onCommit, onCancel }: { initialValue: string; onCommit: (raw: string, move?: CellMove, fillRange?: boolean) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 32), MULTILINE_EDITOR_MAX_H)}px`
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.setSelectionRange(el.value.length, el.value.length)
    grow(el)
  }, [])
  return <textarea
    ref={ref}
    autoFocus
    rows={1}
    defaultValue={initialValue}
    onInput={(event) => grow(event.currentTarget)}
    onBlur={(event) => onCommit(event.target.value)}
    onKeyDown={editorKeyHandler(onCommit, onCancel, true)}
    className="absolute left-0 top-0 z-50 w-full resize-none overflow-y-auto rounded-none border-0 bg-[var(--card)] px-1.5 py-[7px] text-xs leading-snug text-[var(--foreground)] outline-none ring-2 ring-inset ring-[var(--ring)]"
  />
}
```

`useRef` 와 `useEffect` 는 이 파일이 이미 가져오고 있다. import 를 더하지 마라.

## 4. DD MASTER — `InlineEditor` 가 자유 글자 열에 새 편집기를 쓰게 한다

현재 코드(약 1295~1314행)의 분기 순서는 이렇다.

```tsx
  if (column.date) return <InlineDateEditor ... />
  if (column.id === "flNo") return <InlineFlNoEditor ... />
  if (initial !== undefined) {
    return <input autoFocus type={column.number ? "number" : "text"} ... />
  }
  if (opts && !column.suggest) { ... select ... }
  const listId = `inline-${column.id}`
  return <><input ... /></>
```

`if (column.id === "flNo")` 줄 **바로 다음**에 한 줄을 끼운다. 다른 분기는 건드리지 마라.

```tsx
  if (isMultilineColumn(column)) return <InlineTextEditor initialValue={initialValue} onCommit={onCommit} onCancel={onCancel} />
```

**`if (initial !== undefined)` 보다 앞에 두어야 한다.** 타자를 쳐서 편집이 시작된 경우에도
같은 편집기가 떠야 한다. 뒤에 두면 더블클릭으로 열 때만 줄바꿈이 되고 타자로 열면 안 된다.

## 5. DD MASTER — 여러 줄 값을 표에 그린다 (행이 늘어난다)

`GridCell` 의 마지막 `return <td ...>`(약 1412~1414행). 지금 className 머리가 이렇다.

```
relative h-8 max-w-0 truncate border-b border-r border-[var(--border)] px-2 text-xs font-normal
```

`handleDoubleClick` 정의 바로 뒤, `return` 앞에 한 줄을 둔다.

```tsx
  // 줄바꿈이 든 칸만 줄 수만큼 세로로 벌린다. 표의 `h-8` 은 table-cell 에서 최소 높이라
  // 내용이 길면 행이 저절로 늘어난다. 한 줄짜리 칸은 지금처럼 잘라서 보여 준다(`truncate`).
  const wrapped = typeof content === "string" && content.includes("\n")
```

그리고 className 안의 `h-8 max-w-0 truncate` 만 아래로 바꾼다. **다른 클래스는 그대로 둔다.**

```
h-8 max-w-0 ${wrapped ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere] py-1 align-top leading-snug" : "truncate"}
```

`content` 는 같은 함수 안 약 1396~1398행에서 이미 만들어져 있다. 새로 계산하지 마라.
`displayedContent` 가 아니라 `content` 를 본다. `displayedContent` 는 원가계산 링크일 때
`<span>` 으로 감싸여 문자열이 아니다.

행 머리 번호 칸과 고정 열(담당·Status·Style)은 **고치지 마라.** 같은 `<tr>` 안에 있어
행이 늘어나면 따라 늘어난다.

## 6. FABRIC REQUEST — Alt+Enter 를 직접 넣는다

`src/routes/FabricRequest.tsx`, `CellEditor` 안의 `shared` 객체(약 793~805행).

현재:

```ts
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
      if (event.key === "Escape") { event.preventDefault(); cancel() }
      else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(undefined, true) }
      else if (event.key === "Enter" && kind === "area" && event.altKey) return
      else if (event.key === "Enter" || event.key === "Tab") {
```

`else if (event.key === "Enter" && kind === "area" && event.altKey) return` 한 줄만 아래로 바꾼다.

```ts
      // Alt+Enter 는 칸 안 줄바꿈이다. 크롬이 수식키 조합을 삼키는 경우가 있어 직접 넣는다.
      else if (event.key === "Enter" && kind === "area" && event.altKey) {
        event.preventDefault()
        const el = event.currentTarget as HTMLTextAreaElement
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? start
        const next = `${el.value.slice(0, start)}\n${el.value.slice(end)}`
        setValue(next)
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 1 })
      }
```

`setValue` 는 `CellEditor` 안에 이미 있는 상태 설정 함수다(약 806~812행의 `textarea` 가
`onChange={(event) => setValue(event.target.value)}` 로 쓰고 있다). 새로 만들지 마라.

**`text`·`suggest` 종류는 그대로 둔다.** REQUEST 는 긴 글 열을 이미 `area` 로 갈라 놨다
(`editKindOf`, 약 686~690행: contents, yarnAnalysis, comment, devPlan, keyPoint, teamOpinion,
yarnDetail, remark). 나머지는 Style No. 나 Brand 같은 짧은 값이다.

## 7. 내보내기 — 줄바꿈이 든 칸만 줄 바꿈 표시

`src/data/dd-export.ts` 218행. 지금은 이렇다.

```ts
        cell.alignment = { vertical: "middle" }
```

이것으로 바꾼다.

```ts
        // 줄바꿈이 든 값은 wrapText 를 켜야 엑셀에서도 여러 줄로 보인다. 안 켜면 한 줄로 뭉친다.
        cell.alignment = typeof cell.value === "string" && cell.value.includes("\n")
          ? { vertical: "top", wrapText: true }
          : { vertical: "middle" }
```

## 하지 말 것

- `src/data/range-tsv.ts` 를 열지 마라. 복사·붙여넣기는 이미 맞다.
- `isAcceptableCellValue` 와 `updateRecordCell` 을 고치지 마라. 자유 글자 열은 줄바꿈이 든 값을
  이미 통과시킨다. 선택형·날짜·숫자 열이 거부하는 것은 의도한 동작이다.
- 선택형·날짜·숫자·`suggest` 열의 편집기를 textarea 로 바꾸지 마라.
- 행 높이를 끌어서 조절하는 기능을 만들지 마라. 이번 범위가 아니다.
- 창고, 1팀 입고 대화상자, DD 74열 수정 모달, DD 접수 그리드를 고치지 마라(R438).
- 한글 문구를 영어로 바꾸지 마라. 파일은 `Get-Content -Encoding UTF8` 로 읽어라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 를 **모든 수정을 마친 뒤 한 번만** 돌린다. 통과하면 끝이다.
다른 검증은 하지 마라.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
