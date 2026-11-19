# R438 — 새로고침 팝업에 변경 내용 표시 + 셀 편집 키 2단계

상태: 미착수

두 건을 한 지시서에 묶었다. 서로 겹치는 파일이 없다.

- **A. 새로고침 팝업에 이번 변경 내용을 보인다.** `release-notes.json`(신규), `vite.config.ts`,
  `src/vite-env.d.ts`, `src/data/app-version.ts`, `src/components/layout/UpdateBanner.tsx`
- **B. 셀 편집 키를 남은 화면에 넓힌다.** `src/routes/Warehouse.tsx`,
  `src/components/warehouse/Fabric1IntakeDialog.tsx`, `src/routes/DevelopmentMasterSheet.tsx`

## 이미 되어 있는 것 — 다시 만들지 마라

- R437이 DD MASTER 그리드와 REQUEST 표에 Alt+Enter 줄바꿈을 넣었다. `isMultilineColumn`,
  `editorKeyHandler(onCommit, onCancel, multiline)`, `InlineTextEditor`가 그 결과다.
  **그 셋을 고치지 마라. 이번에는 가져다 쓰기만 한다.**
- DD MASTER와 REQUEST 그리드의 Enter 확정·아래 이동은 R437 이전부터 있었다.
- `version.json`은 `vite.config.ts`의 `emit-version-json` 플러그인이 만들고 지금은
  `{ buildId }` 하나뿐이다. `useUpdateAvailable`이 60초마다 받아 자기 `__BUILD_ID__`와
  비교한다. **그 비교 로직과 주기를 바꾸지 마라.**

**틀렸던 가설: "창고 표도 행을 늘리면 된다."** 아니다. 창고는 가상 스크롤이다
(`Warehouse.tsx` 196행 `const ROW_HEIGHT = 32`, 1851~1855행이 `viewport.top / ROW_HEIGHT`로
보이는 구간을 계산하고 위아래 빈 줄 높이를 `ROW_HEIGHT` 곱셈으로 만든다). 행 높이가
32px이 아니게 되면 스크롤 위치 계산이 통째로 어긋난다. **창고에는 Alt+Enter를 넣지 마라.
이동만 넣는다.** DD MASTER는 가상 스크롤이 아니라서(`filtered.map` 전량 렌더) 행이 늘어도 된다.

---

# A. 새로고침 팝업에 변경 내용 표시

## A-1. `release-notes.json` 신규 (저장소 루트)

`package.json`과 같은 자리에 만든다. **최신 항목이 맨 앞이다.**

```json
[
  {
    "id": "R438",
    "date": "2026-11-18",
    "items": [
      "새로고침 안내 팝업에 이번에 무엇이 바뀌었는지 함께 보입니다.",
      "창고 표에서 Enter를 누르면 확정하고 아래 칸으로 내려갑니다. Tab은 오른쪽입니다.",
      "1팀 신규 입고 창에서 Enter로 아래 줄 같은 칸으로 내려갑니다.",
      "DD MASTER 수정 모달과 접수 창에서도 Alt+Enter로 줄을 바꿉니다."
    ]
  },
  {
    "id": "R437",
    "date": "2026-11-18",
    "items": [
      "DD MASTER와 DEVELOPMENT REQUEST 칸에서 Alt+Enter로 줄을 바꿉니다.",
      "줄바꿈이 든 칸은 줄 수만큼 행이 늘어납니다.",
      "엑셀로 내보낼 때도 여러 줄로 나갑니다."
    ]
  }
]
```

**이 파일은 공개 저장소에 올라가고 `version.json`을 거쳐 누구나 받을 수 있다.**
실데이터, 단가, 협력사명, 사람 이름, 사내 경로를 적지 마라.

## A-2. `vite.config.ts`

현재 머리 부분:

```ts
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const BUILD_ID = new Date().toISOString()
```

`node:fs` import 를 더하고 `BUILD_ID` 아래에 읽기 함수를 둔다.

```ts
import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const BUILD_ID = new Date().toISOString()

/**
 * `release-notes.json` 맨 앞 항목의 `items` 를 읽는다. 빌드할 때 한 번만 읽고
 * `version.json` 과 번들 양쪽에 같은 값을 심는다.
 * **파일이 없거나 깨져도 빌드를 멈추지 않는다.** 안내문은 있으면 좋은 것이지
 * 없다고 배포를 막을 값이 아니다. 그때는 빈 배열이고 팝업은 예전 모습 그대로다.
 */
function readLatestNotes(): string[] {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "release-notes.json"), "utf8")
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list) || !list.length) return []
    const first: unknown = list[0]
    if (typeof first !== "object" || first === null || !("items" in first)) return []
    const items = (first as { items: unknown }).items
    if (!Array.isArray(items)) return []
    return items.filter((item): item is string => typeof item === "string").slice(0, 5)
  } catch {
    return []
  }
}

const BUILD_NOTES = readLatestNotes()
```

`define` 줄에 하나를 더한다.

```ts
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_NOTES__: JSON.stringify(BUILD_NOTES) },
```

`emit-version-json` 플러그인의 `source` 를 바꾼다.

```ts
          source: JSON.stringify({ buildId: BUILD_ID, notes: BUILD_NOTES }),
```

**`__dirname` 은 이 파일이 이미 `path.resolve(__dirname, "./src")` 로 쓰고 있다.** 그대로 쓴다.
`import.meta.url` 로 바꾸지 마라.

## A-3. `src/vite-env.d.ts`

현재:

```ts
/// <reference types="vite/client" />

declare const __BUILD_ID__: string
```

한 줄을 더한다.

```ts
declare const __BUILD_NOTES__: readonly string[]
```

## A-4. `src/data/app-version.ts`

반환 타입과 상태를 늘린다. **비교 주기(`CHECK_INTERVAL_MS`)와 `buildId` 비교 조건은 건드리지 마라.**

함수 시그니처:

```ts
export function useUpdateAvailable(): { available: boolean; notes: readonly string[] } {
  const [available, setAvailable] = useState(false)
  const [notes, setNotes] = useState<readonly string[]>([])
```

`setAvailable(true)` 를 하는 `if` 블록 안에서 안내문도 같이 담는다. 지금은 이렇다.

```ts
        if (
          active
          && typeof data === "object"
          && data !== null
          && "buildId" in data
          && typeof data.buildId === "string"
          && data.buildId !== __BUILD_ID__
        ) {
          setAvailable(true)
        }
```

이렇게 바꾼다.

```ts
        if (
          active
          && typeof data === "object"
          && data !== null
          && "buildId" in data
          && typeof data.buildId === "string"
          && data.buildId !== __BUILD_ID__
        ) {
          const incoming = "notes" in data && Array.isArray(data.notes)
            ? data.notes.filter((item): item is string => typeof item === "string")
            : []
          // 내 빌드에 박힌 안내문과 같으면 보이지 않는다. TREND 수집기가 매일 자동 커밋을
          // 올려 배포가 한 번 더 도는데, 그때 지난 기능 배포의 안내문을 다시 띄우면
          // 무엇이 바뀌었다는 말이 거짓이 된다. 상태를 따로 저장할 필요 없이 이 비교로 갈린다.
          const same = JSON.stringify(incoming) === JSON.stringify([...__BUILD_NOTES__])
          setNotes(same ? [] : incoming)
          setAvailable(true)
        }
```

마지막 반환:

```ts
  return import.meta.env.DEV ? { available: false, notes: [] } : { available, notes }
```

## A-5. `src/components/layout/UpdateBanner.tsx`

첫 줄을 바꾼다.

```ts
  const { available, notes } = useUpdateAvailable()
```

막는 팝업(파일 마지막 `createPortal`) 안, `<h2 id="update-dialog-title">` 과 그 아래
`<p className="mt-3 …">` **사이**에 넣는다. 위쪽 유예 중 띠(`role="status"`)는 한 줄짜리라
**건드리지 마라.**

```tsx
        {notes.length ? (
          <div className="mt-4 rounded-[calc(var(--radius)-2px)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">이번 변경</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-6 text-[var(--foreground)]">
              {notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ) : null}
```

---

# B. 셀 편집 키 2단계

## B-1. 창고 — Enter 확정 후 아래, Tab 오른쪽

`src/routes/Warehouse.tsx`. 인라인 편집 `<input>` 의 `onKeyDown`(약 1973~1978행)이 지금은 이렇다.

```tsx
                          onKeyDown={(event) => {
                            // 편집기 키가 표 단축키로 번지지 않게 막는다(CLAUDE.md 인라인 편집기 주의).
                            if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
                            if (event.key === "Escape") { event.preventDefault(); setEditCell(null) }
                            else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); event.currentTarget.blur() }
                          }}
```

이렇게 바꾼다. `index` 와 `colIndex` 는 그 자리 스코프에 이미 있다(같은 `td` 가
`data-row-index={index} data-col-index={colIndex}` 로 쓰고 있다).

```tsx
                          onKeyDown={(event) => {
                            // 편집기 키가 표 단축키로 번지지 않게 막는다(CLAUDE.md 인라인 편집기 주의).
                            if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") event.stopPropagation()
                            if (event.key === "Escape") { event.preventDefault(); setEditCell(null) }
                            else if (event.key === "Enter" || event.key === "Tab") {
                              event.preventDefault()
                              // blur 가 onBlur 로 저장을 돌리고 편집을 닫는다. 그 뒤에 선택만 옮긴다.
                              // 엑셀과 같이 옮긴 칸의 편집기를 열지는 않는다.
                              event.currentTarget.blur()
                              moveEditedSelection(index, colIndex, event.key === "Enter" ? (event.shiftKey ? -1 : 1) : 0, event.key === "Tab" ? (event.shiftKey ? -1 : 1) : 0)
                            }
                          }}
```

그리고 `scrollCellIntoView` 정의(약 1552~1557행) **바로 아래**에 helper 를 둔다.

```tsx
  /**
   * 칸을 확정한 뒤 선택을 한 칸 옮긴다(엑셀과 같다). Enter 는 아래, Shift+Enter 는 위,
   * Tab 은 오른쪽, Shift+Tab 은 왼쪽이다. 끝에 닿으면 그 자리에 머문다.
   * 좌표는 `visibleRows`·`visibleColumns` 기준이고 이것은 화살표 이동(`onCellNavigation`)과 같은 기준이다.
   * 가상 스크롤이라도 행 render 의 `index` 는 `start + offset` 이라 전체 기준 번호다.
   */
  const moveEditedSelection = (rowIndex: number, colIndex: number, rowDelta: number, colDelta: number) => {
    if (!visibleRows.length || !visibleColumns.length) return
    const nextRow = Math.min(Math.max(rowIndex + rowDelta, 0), visibleRows.length - 1)
    const nextCol = Math.min(Math.max(colIndex + colDelta, 0), visibleColumns.length - 1)
    setCellRange({ ar: nextRow, ac: nextCol, fr: nextRow, fc: nextCol })
    setExtraCellRanges([])
    setSelectedCell({ row: visibleRows[nextRow].key, col: visibleColumns[nextCol].id })
    scrollCellIntoView(nextRow, nextCol)
  }
```

**창고에 Alt+Enter 를 넣지 마라.** 위 "틀렸던 가설" 항목에 이유가 있다.

## B-2. 1팀 신규 입고 창 — Enter 로 아래 줄

`src/components/warehouse/Fabric1IntakeDialog.tsx`.

`handleLastTab` 정의(222~228행) **바로 아래**에 넣는다.

```tsx
  /**
   * 엑셀처럼 Enter 로 아래 줄 같은 칸에 내려간다. Shift+Enter 는 위다.
   * **칸마다 달지 않고 표 하나에 걸어 위임한다.** 칸이 열세 개라 각각 달면 한 곳을 빠뜨린다.
   * 자리는 `tr[data-row-id]` 와 `td[data-paste-column]` 으로 찾는다. 붙여넣기가 쓰는 표식과 같다.
   * 마지막 줄에서 Enter 는 줄을 늘리지 않고 칸을 떠나기만 한다. 줄 늘리기는 Tab 담당이다(`handleLastTab`).
   */
  const handleGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.key !== "Enter") return
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    const cell = target.closest<HTMLElement>("[data-paste-column]")
    const rowElement = target.closest<HTMLElement>("[data-row-id]")
    if (!cell || !rowElement) return
    const column = cell.dataset.pasteColumn
    const index = rows.findIndex((row) => row.id === rowElement.dataset.rowId)
    if (index === -1) return
    event.preventDefault()
    const nextIndex = event.shiftKey ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= rows.length) { target.blur(); return }
    const nextRow = document.querySelector<HTMLElement>(`[data-row-id="${rows[nextIndex].id}"]`)
    const nextInput = nextRow?.querySelector<HTMLInputElement>(`[data-paste-column="${column}"] input`)
    if (!nextInput) return
    nextInput.focus()
    nextInput.select()
  }
```

`KeyboardEvent` 타입은 이 파일이 이미 react 에서 가져오고 있다(`handleLastTab` 시그니처). import 를 더하지 마라.

표 태그(약 394행)에 핸들러를 건다. 지금은 이렇다.

```tsx
          <table className="w-max min-w-full table-fixed border-collapse text-xs" onPaste={handlePaste}>
```

이렇게 바꾼다.

```tsx
          <table className="w-max min-w-full table-fixed border-collapse text-xs" onPaste={handlePaste} onKeyDown={handleGridKeyDown}>
```

## B-3. DD MASTER 수정 모달과 접수 창 — Alt+Enter

`src/routes/DevelopmentMasterSheet.tsx`.

### B-3-1. 공용 입력칸 추가

파일 첫 줄의 react import 에 `useLayoutEffect` 를 더한다. 지금은 이렇다.

```ts
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
```

`useLayoutEffect` 를 `useEffect` 뒤에 끼운다. 다른 항목은 건드리지 마라.

`IntakeCell` 함수 정의(약 651행) **바로 앞**에 아래를 둔다.

```tsx
/**
 * 수정 모달과 접수 그리드가 함께 쓰는 여러 줄 입력칸.
 * Alt+Enter 로 줄을 바꾸고 그냥 Enter 는 칸을 떠난다. `GuardedTextInput` 과 같은 약속이다.
 * 이 앱에서 Enter 는 언제나 확정이다. textarea 기본 동작(Enter 가 줄바꿈)에 맡기지 않는다.
 * 높이는 내용을 따라가고 상한을 넘으면 칸 안에서 구른다.
 */
function AutoGrowTextarea({ value, disabled, className, maxHeight = 160, onChange }: { value: string; disabled?: boolean; className?: string; maxHeight?: number; onChange: (raw: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, maxHeight])
  return <textarea
    ref={ref}
    rows={1}
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return
      event.stopPropagation()
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        const el = event.currentTarget
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? start
        onChange(`${el.value.slice(0, start)}\n${el.value.slice(end)}`)
        // 제어 입력이라 값이 부모를 거쳐 돌아온 뒤에 커서를 되돌려야 한다.
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 1 })
        return
      }
      event.preventDefault()
      event.currentTarget.blur()
    }}
    className={`resize-none overflow-y-auto ${className ?? ""}`}
  />
}
```

**`isMultilineColumn` 은 약 1238행에 있고 이 함수보다 뒤다. 옮기지 마라.** 함수 선언은
끌어올려지고 `MULTILINE_BLOCKED_IDS` 와 `COMPUTED_COLUMN_IDS` 는 모듈이 다 돈 뒤인
render 때 읽히므로 문제가 없다.

### B-3-2. 접수 그리드 (`IntakeCell`)

`IntakeCell` 마지막 줄이 지금 이렇다.

```tsx
  return <input type={column.number ? "number" : "text"} value={value} disabled={disabled} onChange={(event) => set(event.target.value)} className={box} />
```

그 앞에 한 줄을 끼운다. **마지막 `return` 은 그대로 둔다.**

```tsx
  if (isMultilineColumn(column)) return <AutoGrowTextarea value={value} disabled={disabled} onChange={set} className={`${box} min-h-7 py-1 leading-snug`} maxHeight={120} />
```

`box` 안의 `h-7` 이 `min-h-7` 보다 앞에 오므로 tailwind-merge 없이 그대로 두면 높이가
고정된다. **`box` 에서 `h-7` 을 빼지 말고** 위처럼 뒤에 `min-h-7` 을 붙여라. 인라인 style 로
높이를 덮어쓰는 것은 `AutoGrowTextarea` 쪽이라 클래스 순서와 무관하게 동작한다.

### B-3-3. 수정 모달 (`EditorField`)

`EditorField` 마지막 줄이 지금 이렇다.

```tsx
  return <div className="grid min-w-0 gap-1">{label}<Input type={column.number ? "number" : "text"} value={value} disabled={disabled} aria-invalid={invalid} onChange={(event) => set(event.target.value)} className={`text-sm ${disabled ? "bg-[var(--muted)]" : ""} ${invalidClass}`} /></div>
```

그 앞에 한 줄을 끼운다. **마지막 `return` 은 그대로 둔다.**

```tsx
  if (isMultilineColumn(column)) return <div className="grid min-w-0 gap-1">{label}<AutoGrowTextarea value={value} disabled={disabled} onChange={set} className={`flex min-h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-1.5 text-sm leading-6 text-[var(--foreground)] shadow-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${disabled ? "bg-[var(--muted)]" : ""} ${invalidClass}`} /></div>
```

클래스는 `src/components/ui/input.tsx` 의 기본값에서 `h-9` 를 `min-h-9` 로 바꾸고
`leading-6` 을 더한 것이다. **`Input` 컴포넌트를 textarea 로 바꾸지 마라.** 그 컴포넌트는
앱 전체가 쓴다.

---

## 하지 말 것

- R437이 만든 `isMultilineColumn`, `editorKeyHandler`, `InlineTextEditor` 를 고치지 마라.
- 창고에 Alt+Enter 나 행 높이 변경을 넣지 마라. 가상 스크롤이 깨진다.
- `useUpdateAvailable` 의 검사 주기(60초)와 `buildId` 비교 조건을 바꾸지 마라.
- `src/components/ui/input.tsx` 를 고치지 마라.
- `src/data/range-tsv.ts` 를 열지 마라.
- `release-notes.json` 에 실데이터, 단가, 협력사명, 사람 이름, 사내 경로를 적지 마라. 공개된다.
- 한글 문구를 영어로 바꾸지 마라. 파일은 `Get-Content -Encoding UTF8` 로 읽어라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 삭제하지 마라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 를 **모든 수정을 마친 뒤 한 번만** 돌린다. 통과하면 끝이다.
빌드 결과물 `dist/version.json` 에 `notes` 가 네 줄 들어갔는지만 눈으로 확인하고 보고해라.
다른 검증은 하지 마라.

## 보고

수정한 파일 목록, 빌드 결과, `dist/version.json` 내용, 판단이 필요했던 지점만 적어라.
바꾼 코드를 다시 붙이지 마라.
