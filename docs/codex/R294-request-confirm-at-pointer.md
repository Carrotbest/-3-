# R294 — DEVELOPMENT REQUEST 확인창을 클릭 지점에 띄운다

추론 강도: **medium**. 파일 1개(`src/routes/FabricRequest.tsx`). 상태 하나와 렌더 블록 하나를 더하고, 확인을 쓰는 함수 네 개를 콜백 방식으로 바꾼다.

## 상태

미착수. **R293 뒤에 적용한다.** 아래 "현재 코드"는 R293이 넣은 `window.confirm`이 들어 있는 상태다.

## 왜

R293으로 옵션 추가와 삭제에 확인을 넣었는데, 브라우저 기본 `window.confirm`이 **창 맨 위 가운데**에 뜬다. 표 아래쪽 행에서 버튼을 누르면 확인창이 화면 반대편에 나타나 시선과 마우스가 멀리 간다. 2026-10-06에 박향근이 클릭 지점 근처로 옮기라고 지시했다.

`window.confirm`의 위치는 브라우저가 정한다. 바꿀 방법이 없다. 그래서 화면 안에서 직접 그리는 작은 확인 상자로 교체한다. 이 파일에는 이미 클릭 좌표에 뜨는 우클릭 메뉴(`rowMenu`, 1880행대)가 있다. 덮개 + `fixed` 배치 + 화면 밖으로 안 나가게 자르는 방식까지 그대로 따른다. **새 공용 컴포넌트를 만들지 말고 이 파일 안에서 끝낸다.**

## 적용 대상

이 화면에서 클릭으로 뜨는 확인 네 개 전부다. 하나만 바꾸면 같은 화면에서 확인창 모양이 두 가지가 된다.

| 함수 | 길 |
|---|---|
| `addOption` | 표 안 "옵션 추가" 줄 버튼, 우클릭 메뉴 |
| `removeOption` | Opt 칸 휴지통 버튼 |
| `changeOptions` | 우클릭 메뉴 삽입·삭제 |
| `remove` | 액션 칸 스타일 삭제 버튼 |

## 1. 상태와 헬퍼

`const [rowMenu, setRowMenu] = useState(...)` 선언 근처에 넣는다.

```ts
/**
 * 클릭 지점에 띄우는 확인 상자(R294).
 * 브라우저 기본 confirm 은 창 맨 위 가운데에 떠서 표 아래쪽을 누르면 시선이 멀리 간다.
 * 좌표는 누른 지점이고 `danger`는 지우는 동작에만 준다.
 */
interface ConfirmPrompt {
  x: number
  y: number
  message: string
  confirmLabel: string
  danger: boolean
  run: () => void
}
```

컴포넌트 안:

```ts
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null)
  const askConfirm = (anchor: { x: number; y: number }, message: string, run: () => void, options?: { confirmLabel?: string; danger?: boolean }) =>
    setConfirmPrompt({ x: anchor.x, y: anchor.y, message, run, confirmLabel: options?.confirmLabel ?? "확인", danger: options?.danger ?? false })
```

## 2. 함수 네 개를 콜백 방식으로

지금은 `if (!window.confirm(...)) return` 뒤에 실행이 이어진다. 확인 상자는 비동기라 이 모양을 쓸 수 없다. **실행부를 `askConfirm`의 콜백 안으로 옮긴다.**

각 함수는 누른 지점을 받는 매개변수 `anchor: { x: number; y: number }`를 더한다.

### 2-1. `addOption`

R293 적용 뒤 현재 코드:

```ts
  const addOption = (style: RequestStyle) => {
    if (!window.confirm(`${style.garmentNo || "이 의뢰"}에 옵션 ${style.options.length + 1}번을 추가할까요?`)) { setRowMenu(null); return }
    saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, [...style.options, blankOption(style.reqId, style.options.length + 1)]), updatedAt: new Date().toISOString() } : item))
    setRowMenu(null)
  }
```

→

```ts
  const addOption = (style: RequestStyle, anchor: { x: number; y: number }) => {
    setRowMenu(null)
    askConfirm(anchor, `${style.garmentNo || "이 의뢰"}에 옵션 ${style.options.length + 1}번을 추가할까요?`, () => {
      saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, [...style.options, blankOption(style.reqId, style.options.length + 1)]), updatedAt: new Date().toISOString() } : item))
    }, { confirmLabel: "추가" })
  }
```

### 2-2. `removeOption`

```ts
  const removeOption = (style: RequestStyle, option: RequestOption, anchor: { x: number; y: number }) => {
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod].some((value) => text(value).trim())
    const warning = filled ? "\n적어 둔 값이 함께 지워집니다." : ""
    setRowMenu(null)
    askConfirm(anchor, `옵션 ${option.no}번을 삭제할까요?${warning}`, () => {
      saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, style.options.filter((item) => item.optId !== option.optId)), updatedAt: new Date().toISOString() } : item))
    }, { confirmLabel: "삭제", danger: true })
  }
```

주석(`/** 옵션 라인 한 줄을 지운다. ... */`)은 그대로 둔다.

### 2-3. `changeOptions`

R293이 넣은 `lineCount`, `scope`, `question` 계산은 그대로 쓰고, `window.confirm` 자리만 바꾼다. 실행부(`const now` 이후 전부)를 콜백 안으로 옮긴다.

```ts
  const changeOptions = (mode: "above" | "below" | "delete", anchor: { x: number; y: number }) => {
    if (!rect) return
    const targets = new Map<string, Set<number>>()
    for (let r = rect.top; r <= rect.bottom; r += 1) { const slot = slots[r]; if (!slot) continue; const set = targets.get(slot.style.reqId) ?? new Set<number>(); set.add(slot.optionIndex); targets.set(slot.style.reqId, set) }
    const lineCount = [...targets.values()].reduce((sum, set) => sum + set.size, 0)
    if (lineCount === 0) { setRowMenu(null); return }
    const scope = targets.size > 1 ? `스타일 ${targets.size}건의 ` : ""
    const question = mode === "delete"
      ? `${scope}옵션 ${lineCount}줄을 삭제할까요?\n적어 둔 값이 함께 지워집니다.`
      : `${scope}선택한 ${lineCount}줄 ${mode === "below" ? "아래" : "위"}에 빈 옵션을 넣을까요?`
    setRowMenu(null)
    askConfirm(anchor, question, () => {
      const now = new Date().toISOString()
      const next = requests.map((style) => { const indices = targets.get(style.reqId); if (!indices) return style; let options = [...style.options]; if (mode === "delete") options = options.filter((_, i) => !indices.has(i)); else [...indices].sort((a,b) => b-a).forEach((i) => options.splice(i + (mode === "below" ? 1 : 0), 0, blankOption(style.reqId, 1))); return { ...style, options: renumber(style.reqId, options), updatedAt: now } })
      saveMutation(next)
    }, { confirmLabel: mode === "delete" ? "삭제" : "삽입", danger: mode === "delete" })
  }
```

`const next = requests.map(...)` 줄의 내용은 한 글자도 바꾸지 마라. 들여쓰기만 맞춘다.

### 2-4. `remove` (스타일 삭제, 849행대)

```ts
  const remove = (style: RequestStyle, anchor: { x: number; y: number }) => {
    setRowMenu(null)
    askConfirm(anchor, `${style.garmentNo || "이 의뢰"} 건을 삭제할까요?\n옵션 ${style.options.length}건이 함께 지워집니다.`, () => {
      commitRequests(requests.filter((item) => item.reqId !== style.reqId))
      // 사진은 없으면 조용히 넘어간다. 실패해도 원장 삭제는 그대로 둔다.
      void deleteRequestImage(style.reqId).catch(() => undefined)
    }, { confirmLabel: "삭제", danger: true })
  }
```

## 3. 호출부에 좌표 넘기기

### 3-1. "옵션 추가" 줄 버튼 (1850행대)

`onClick={() => addOption(style)}` → `onClick={(event) => addOption(style, { x: event.clientX, y: event.clientY })}`

### 3-2. Opt 칸 휴지통 버튼 (1520행대)

```tsx
onClick={(event) => { event.stopPropagation(); removeOption(line.style, line.option) }}
```

→

```tsx
onClick={(event) => { event.stopPropagation(); removeOption(line.style, line.option, { x: event.clientX, y: event.clientY }) }}
```

### 3-3. 액션 칸 스타일 삭제 버튼 (1839행대)

`onClick={() => remove(style)}` → `onClick={(event) => remove(style, { x: event.clientX, y: event.clientY })}`

### 3-4. 우클릭 메뉴 항목 (1893~1895행대)

메뉴는 눌리는 순간 `setRowMenu(null)`로 닫히므로 **좌표를 미리 잡아 둬야 한다.** `rowMenu.x`, `rowMenu.y`가 그 좌표다.

```tsx
            { key: "above", label: "옵션 위에 삽입", hint: "", icon: <Plus className="size-3.5" />, run: () => changeOptions("above", { x: rowMenu.x, y: rowMenu.y }) },
            { key: "below", label: "옵션 아래에 삽입", hint: "", icon: <Plus className="size-3.5" />, run: () => changeOptions("below", { x: rowMenu.x, y: rowMenu.y }) },
            { key: "delete-option", label: "옵션 삭제", hint: "", icon: <Trash2 className="size-3.5" />, run: () => changeOptions("delete", { x: rowMenu.x, y: rowMenu.y }) },
```

같은 메뉴 안이나 다른 곳에 `addOption(style)`을 부르는 항목이 더 있으면 같은 방식으로 좌표를 넘긴다.

## 4. 렌더

`{rowMenu ? <> ... </> : null}` 블록 **바로 뒤**에 넣는다. 덮개 `z-[95]`, 상자 `z-[100]`으로 우클릭 메뉴(85/90)보다 위에 둔다.

```tsx
      {confirmPrompt ? <>
        {/* 덮개가 먼저 클릭을 받아 취소로 닫는다. 바깥을 누르면 아무 일도 일어나지 않는다. */}
        <div className="fixed inset-0 z-[95]" onMouseDown={() => setConfirmPrompt(null)} onContextMenu={(event) => { event.preventDefault(); setConfirmPrompt(null) }} />
        <div
          role="alertdialog"
          aria-label="확인"
          className="fixed z-[100] w-64 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(8, confirmPrompt.x - 24), window.innerWidth - 272), top: Math.min(Math.max(8, confirmPrompt.y - 12), window.innerHeight - 136) }}
        >
          <p className="whitespace-pre-wrap leading-snug">{confirmPrompt.message}</p>
          <div className="mt-3 flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 px-3" onClick={() => setConfirmPrompt(null)}>취소</Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3"
              autoFocus
              style={confirmPrompt.danger ? { backgroundColor: "var(--destructive)", color: "var(--card)" } : undefined}
              onClick={() => { const run = confirmPrompt.run; setConfirmPrompt(null); run() }}
            >
              {confirmPrompt.confirmLabel}
            </Button>
          </div>
        </div>
      </> : null}
```

좌표는 누른 지점에서 왼쪽 위로 살짝 당겨 마우스가 바로 버튼 쪽에 오게 하고, 화면 밖으로 나가지 않도록 양쪽을 자른다.

## 5. 키보드

`onKey`(1370행대)의 Escape 처리 줄:

```ts
    if (event.key === "Escape") { setRange(null); setRowMenu(null); return }
```

확인 상자가 열려 있으면 **표 단축키가 돌지 않게 먼저 끊는다.** `onKey` 함수 맨 앞, `if (event.isComposing) return` 바로 아래에 넣는다.

```ts
    // 확인 상자가 열려 있는 동안에는 표 단축키를 막는다. Esc 는 취소다(R294).
    if (confirmPrompt) {
      if (event.key === "Escape") { event.preventDefault(); setConfirmPrompt(null) }
      return
    }
```

확인 버튼에 `autoFocus`가 있어 Enter 와 Space 는 버튼이 직접 받는다. 여기서 Enter 를 따로 처리하지 마라. 두 번 실행된다.

## 하지 말 것

- `window.confirm`을 이 네 곳에 남기지 마라. 모양이 두 가지가 된다.
- 공용 confirm 컴포넌트나 훅을 새 파일로 만들지 마라. 이 파일 안에서 끝낸다.
- `DialogContent`를 쓰지 마라. 화면 가운데로 가서 이번 지시의 목적과 반대다.
- `DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라(이 저장소의 알려진 함정). 이번 작업에서는 아예 쓰지 않는다.
- 확인 상자 좌표를 `rowMenu`와 같은 state 에 합치지 마라. 우클릭 메뉴는 닫히고 확인 상자가 떠야 한다.
- `saveMutation`, `commitRequests`, `renumber`, `blankOption`, `deleteRequestImage`의 동작을 바꾸지 마라. 실행 시점만 콜백 안으로 옮긴다.
- `changeOptions`의 `targets` 계산식과 `next` 생성식 내용을 바꾸지 마라.
- 확인을 건너뛰는 설정이나 "다시 묻지 않기"를 만들지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라. 다른 파일 10개에 검증 대기 중인 수정이 있다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 수정을 마친 뒤 한 번만 돌려라.
- `legacy/`, `legacy-vanilla/`, `backup/`, `public/data`는 읽지 마라.

## 검증

```
npm run build
```

오류 0이면 성공이다. `addOption`, `removeOption`, `changeOptions`, `remove` 의 인자 개수가 호출부와 안 맞으면 여기서 걸린다. 걸리면 3번 항목에서 빠뜨린 호출부를 찾아라.

```
git status --short
```

이번 작업으로 바뀌는 파일은 `src/routes/FabricRequest.tsx` 하나다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
