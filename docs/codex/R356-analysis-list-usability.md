# R356 — 분석 목록 조작성

**상태: 미착수.** R352~R354는 구현과 빌드를 마쳤다. R355는 별건이며 이 건과 고치는 파일이 겹치지 않는다.

2026-10-28 박향근 요구 셋이다. 전부 `src/routes/FabricAnalysis.tsx` 한 파일이다.

1. 체크박스를 **끌어서 여러 건을 한 번에** 고를 수 있게 한다.
2. 「.eml로 받기」 버튼을 **없앤다.**
3. 「분석 의뢰 목록」 카드 머리(탭·버튼 줄·검색)와 **표 열 이름이 스크롤해도 늘 보이게** 고정한다.

## 1. 체크박스 끌어서 여러 건 고르기

지금은 체크박스를 한 건씩 눌러야 한다(357행 근처).

```tsx
{previewOnly ? null : <TableCell onClick={(event) => event.stopPropagation()}><Checkbox … checked={selected.has(item.id)} onCheckedChange={() => setSelected(…)} aria-label={`${item.anNo} 선택`} /></TableCell>}
```

**누르는 동작은 지금 그대로 두고, 끄는 동작만 더한다.** 체크박스의 `onCheckedChange`를 지우고 mousedown에서 직접 토글하면 키보드(Space)로 고를 수 없게 되고, 한 번 누를 때 두 번 뒤집히기 쉽다.

컴포넌트 안에 상태를 둔다. 다시 그릴 필요가 없는 값이라 `useRef`다.

```ts
  /**
   * 체크박스 끌어서 여러 건 고르기(R356).
   * `mode`는 끄는 동안 칠할 값이다. 처음 누른 행이 꺼져 있었으면 켜면서 끌고, 켜져 있었으면 끄면서 끈다.
   * `moved`는 끈 적이 있는지다. 끌고 나서 올라온 mouseup이 행 클릭(상세 팝업)으로 이어지는 것을 막는다.
   */
  const dragSelect = useRef<{ mode: boolean; moved: boolean } | null>(null)
```

끝내는 자리는 window다. 표 밖에서 손을 떼도 끝나야 한다. **비우는 일은 한 틱 미룬다.** `mouseup`이 `click`보다 먼저 와서, 바로 비우면 아래 행 클릭 막기가 동작하지 않는다.

```ts
  useEffect(() => {
    const stop = () => { window.setTimeout(() => { dragSelect.current = null }, 0) }
    window.addEventListener("mouseup", stop)
    return () => window.removeEventListener("mouseup", stop)
  }, [])
```

체크 칸을 이렇게 바꾼다. `TableCell`에 `onMouseDown`과 `onMouseEnter`를 단다.

```tsx
{previewOnly ? null : <TableCell
  onClick={(event) => { event.stopPropagation() }}
  onMouseDown={() => { dragSelect.current = { mode: !selected.has(item.id), moved: false } }}
  onMouseEnter={() => {
    const drag = dragSelect.current
    if (!drag) return
    drag.moved = true
    setSelected((current) => {
      const next = new Set(current)
      if (drag.mode) next.add(item.id); else next.delete(item.id)
      return next
    })
  }}
><Checkbox className="data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600" checked={selected.has(item.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} aria-label={`${item.anNo} 선택`} /></TableCell>}
```

**처음 누른 행은 체크박스가 스스로 뒤집는다.** `onMouseDown`은 `mode`만 적어 둔다. 거기서 같이 뒤집으면 뒤이어 오는 클릭이 한 번 더 뒤집어 제자리로 돌아온다.

**행 클릭이 상세 팝업을 여는 것을 막아야 한다.** 356행 `<TableRow … onClick={() => setDetail(item)}>`를 이렇게 바꾼다.

```tsx
onClick={() => { if (dragSelect.current?.moved) return; setDetail(item) }}
```

**`mousedown`에 `preventDefault`를 걸지 마라.** 체크박스가 포커스를 못 받아 키보드로 못 고르게 된다. 끄는 동안 글자가 파랗게 끌리면 체크 칸(`TableCell`)에 `select-none`만 더한다.

**드래그 선택은 체크 칸에서만 시작한다.** 행 전체에 걸면 상세를 열려고 누른 손놀림이 선택으로 바뀐다.

## 2. 「.eml로 받기」 버튼을 없앤다

345행이다.

```tsx
<Button size="sm" variant="ghost" disabled={!draftSelected.length && !requestedSelected.length && !finishedSelected.length} onClick={downloadSelectedEml}><FileDown />.eml로 받기</Button>
```

이 줄을 지운다. 그리고 **이 파일 안에서** 쓰이지 않게 된 것을 같이 지운다.

- `downloadSelectedEml` 함수 정의
- `FileDown` 아이콘 import (다른 곳에서 쓰면 남긴다)
- 그 함수만 쓰던 import

**`src/data` 아래 파일은 지우지 마라.** 쓰이지 않는 export가 남는 것은 괜찮다. 메일 만드는 함수는 다른 버튼(「완료 메일 발송」, 행의 「메일」)이 함께 쓴다. 지우기 전에 반드시 호출처를 세어라.

`npm run build`가 `noUnusedLocals`로 막으면 그 이름만 지우면 된다.

## 3. 카드 머리와 열 이름 고정

### 3-1. 지금 구조

```tsx
<Card …>
  <CardHeader className="gap-3"> … 탭 · 버튼 줄 · 검색 … </CardHeader>
  <CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[1750px] table-fixed text-xs …">
```

`overflow-x-auto`만 걸린 상자는 **세로로도 스크롤 상자가 된다.** 그 안에서 `sticky top-0`을 줘도 상자 자체가 세로로 움직이지 않아 붙어 보이지 않는다. 그래서 표 상자에 **높이 상한**을 줘 그 안에서 세로로 구르게 해야 한다. DEVELOPMENT REQUEST와 WAREHOUSE가 같은 구조다.

상단 바(`Topbar`)는 `sticky top-0 z-20 h-16`이다. 페이지에 붙이는 것은 **`top-16`** 이고 z는 **20보다 낮아야** 상단 바 아래로 지나간다.

### 3-2. 고칠 것

`CardHeader`(329행)의 className을 바꾼다. **보기 전용(인쇄 미리보기)에서는 걸지 않는다.**

```tsx
<CardHeader className={`gap-3${previewOnly ? "" : " sticky top-16 z-10 rounded-t-xl border-b border-[var(--border)]/60 bg-[var(--card)]"}`}>
```

표 상자(351행)를 바꾼다.

```tsx
<CardContent className="p-0"><div className={previewOnly ? "overflow-x-auto" : "max-h-[calc(100vh-20rem)] overflow-auto"}>
```

열 이름 줄(353행)을 바꾼다.

```tsx
<TableHeader className={previewOnly ? "bg-[var(--muted)]/40" : "sticky top-0 z-20 bg-[var(--card)] shadow-sm"}>
```

**`th`에도 배경을 줘야 한다.** `thead`에만 주면 브라우저에 따라 아래 행이 비쳐 보인다. 354행 체크 칸 `TableHead`와 355행 `.map`으로 그리는 `TableHead` 둘 다 className 끝에 다음을 더한다(보기 전용이면 더하지 않는다).

```
sticky top-0 z-20 bg-[var(--muted)]
```

### 3-3. 하지 말 것

- **`position: fixed`를 쓰지 마라.** 이 저장소는 그것으로 인쇄가 한 자리에 포개진 적이 있다(R343).
- `max-h`를 `h`로 바꾸지 마라. 건수가 적을 때 빈 상자가 길게 남는다.
- 표 안 셀에 `backdrop-filter`나 `transform`을 넣지 마라. 고정 칸이 밀린다(CLAUDE.md 주의 항목).
- 상단 KPI 카드와 그래프는 그대로 둔다. 같이 고정하면 표가 볼 자리가 없어진다.

## 전체 하지 말 것

- 선택 상태(`selected`)의 의미를 바꾸지 마라. 탭을 옮기면 체크를 푸는 규칙(2026-10-21)은 그대로다.
- 출력·메일 버튼의 조건을 바꾸지 마라. 이번 건에서 없애는 것은 「.eml로 받기」 하나다.
- `src/data` 아래 파일을 고치거나 지우지 마라.
- 다른 화면(`FabricRequest.tsx`, DD MASTER, 창고)을 건드리지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 하나다. `src/routes/FabricAnalysis.tsx`.

화면 확인은 박향근이 한다. 목록에서 체크박스를 누른 채 아래로 끌어 여러 건이 한 번에 잡히는지, 끌고 나서 상세 팝업이 뜨지 않는지, 아래로 스크롤해도 탭 줄과 열 이름이 남는지 본다.
