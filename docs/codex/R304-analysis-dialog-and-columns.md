# R304 — 새 분석 의뢰 팝업 크기와 열 너비 조절, 목록 열 순서 고정

상태: 미착수

## 배경

2026-10-07 박향근 요청이다.

**A. 새 분석 의뢰 팝업** (`src/components/analysis/AnalysisRequestDialog.tsx`)
1. 너무 넓게 뜬다. 스크린샷 비율(뷰포트 가로의 약 80%)로 줄인다.
2. 표의 열 너비를 사람이 끌어서 조절할 수 있게 한다.
3. Contents 열을 넓힌다.
4. Request item 열을 줄인다.

**B. 분석 의뢰 목록 표** (`src/routes/FabricAnalysis.tsx`)
5. 상태 열을 맨 앞 체크박스 바로 뒤로 옮긴다.
6. 탭을 옮겨도 열 너비가 흔들리지 않게 고정한다.

6번의 원인은 표에 `colgroup`이 없어 브라우저가 내용에 맞춰 폭을 정하기 때문이다. 탭마다 들어 있는 글자가 달라 폭이 매번 다시 잡힌다. 열 이름 순서는 이미 탭 사이에 같다.

**워킹트리에 커밋 안 된 R300~R303 변경이 여러 파일에 있다.** `git reset`, `git checkout`, `git stash`, `git restore` 로 되돌리지 마라.

---

# A. `src/components/analysis/AnalysisRequestDialog.tsx`

## A-1. import (1행)

현재:
```tsx
import { useEffect, useMemo, useRef, useState } from "react"
```
교체:
```tsx
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
```

## A-2. 열 기본 너비 상수

파일 상단, 다른 상수들 옆(예: `QUICK_ITEM_COLORS` 근처)에 넣는다.

```tsx
/**
 * 일괄 의뢰 표의 열 기본 너비(px). `colgroup` 순서와 1대1로 맞춘다.
 * Contents 는 성분이 길어 넓히고, Request item 은 빠른 입력 버튼으로 채우는 칸이라 줄였다
 * (2026-10-07 박향근 지시). 열 수가 바뀌면 이 배열도 같이 고쳐야 한다.
 */
const BATCH_COL_DEFAULTS = [32, 44, 100, 110, 130, 100, 100, 95, 140, 230, 64, 100, 200, 56, 150, 40]
const BATCH_COL_MIN = 32
const BATCH_COL_MAX = 600
/** 열 너비는 개인 브라우저에만 남는다. `CACHE_KEYS`에 넣지 말 것(팀 공유 값이 아니다). */
const BATCH_COL_WIDTHS_KEY = "fabric.analysis.batchColWidths"
```

순서는 `#`, 사진, AN No., Source, Source code, Brand, Season/Year, Gender/Age, Construction, **Contents(150→230)**, Weight, Objective, **Request item(300→200)**, Urgent, Comment, 삭제다.

## A-3. 너비 상태와 저장

일괄 의뢰 표를 그리는 컴포넌트 함수 안, 다른 `useState` 들 옆에 넣는다.

```tsx
  const [colWidths, setColWidths] = useState<number[]>(() => {
    const base = [...BATCH_COL_DEFAULTS]
    if (typeof window === "undefined") return base
    try {
      const raw = window.localStorage.getItem(BATCH_COL_WIDTHS_KEY)
      if (!raw) return base
      const stored = JSON.parse(raw) as unknown
      if (!Array.isArray(stored) || stored.length !== base.length) return base
      return base.map((value, index) => {
        const next = stored[index]
        return typeof next === "number" && next >= BATCH_COL_MIN && next <= BATCH_COL_MAX ? next : value
      })
    } catch {
      return base
    }
  })

  useEffect(() => {
    try { window.localStorage.setItem(BATCH_COL_WIDTHS_KEY, JSON.stringify(colWidths)) } catch { /* 저장소를 못 써도 화면은 기본값으로 돈다 */ }
  }, [colWidths])

  const resizeRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null)
  const startResize = (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = { index, startX: event.clientX, startWidth: colWidths[index] }
  }
  const moveResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current
    if (!drag) return
    const next = Math.min(BATCH_COL_MAX, Math.max(BATCH_COL_MIN, drag.startWidth + (event.clientX - drag.startX)))
    setColWidths((current) => current.map((value, index) => index === drag.index ? next : value))
  }
  const endResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!resizeRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    resizeRef.current = null
  }
  const resetColWidth = (index: number) => setColWidths((current) => current.map((value, at) => at === index ? BATCH_COL_DEFAULTS[index] : value))
```

`stopPropagation` 을 빼지 마라. 팝업 머리글이 드래그 이동을 받고 있어 손잡이를 끌면 창이 같이 움직인다.

## A-4. colgroup 교체 (458~463행)

현재:
```tsx
        <colgroup>
          <col className="w-8" /><col className="w-11" /><col className="w-[100px]" /><col className="w-[110px]" />
          <col className="w-[130px]" /><col className="w-[100px]" /><col className="w-[100px]" /><col className="w-[95px]" />
          <col className="w-[140px]" /><col className="w-[150px]" /><col className="w-16" /><col className="w-[100px]" />
          <col className="w-[300px]" /><col className="w-14" /><col className="w-[150px]" /><col className="w-10" />
        </colgroup>
```
교체:
```tsx
        <colgroup>{colWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
```

표는 이미 `table-fixed` 라 `colgroup` 폭을 그대로 지킨다. `table-fixed` 를 떼지 마라.

## A-5. 머리글에 손잡이 달기 (465행)

465행 `<tr>{[...].map((label, index) => <th ...>{requiredLabel(label)}</th>)}</tr>` 의 `<th>` 를 바꾼다.

현재 `<th>` 의 className:
```
"h-9 whitespace-nowrap border-b border-r border-[var(--border)] px-1 text-center font-medium last:sticky last:right-0 last:z-10 last:border-l last:border-r-0 last:bg-[var(--muted)]"
```
맨 앞에 `relative ` 를 더하고, `{requiredLabel(label)}` 뒤에 손잡이를 붙인다.

```tsx
<th key={`${label}-${index}`} className="relative h-9 whitespace-nowrap border-b border-r border-[var(--border)] px-1 text-center font-medium last:sticky last:right-0 last:z-10 last:border-l last:border-r-0 last:bg-[var(--muted)]">{requiredLabel(label)}{index < colWidths.length - 1 ? <span role="separator" aria-label={`${label || "마지막"} 열 너비 조절`} title="끌어서 너비 조절, 두 번 누르면 기본값" onPointerDown={startResize(index)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onDoubleClick={() => resetColWidth(index)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-teal-500/40" /> : null}</th>
```

마지막 열(삭제 칸)에는 손잡이를 달지 않는다. `sticky right-0` 이라 손잡이가 겹친다.

## A-6. 팝업 너비 (511행)

현재:
```tsx
<DialogContent className={record ? "w-[96vw] max-w-5xl" : "flex max-h-[88vh] w-[98vw] max-w-none flex-col"}>
```
교체:
```tsx
<DialogContent className={record ? "w-[96vw] max-w-5xl" : "flex max-h-[88vh] w-[80vw] max-w-[1520px] flex-col"}>
```

스크린샷에서 창이 뷰포트 가로의 약 80%를 차지했다. 큰 모니터에서 끝없이 늘어나지 않게 1520px 로 막는다.

**세로는 건드리지 마라.** `max-h-[88vh]` 는 상한일 뿐이고 실제 높이는 줄 수를 따라간다. 고정 높이를 주면 줄이 늘었을 때 표가 잘린다.

팝업은 이미 끌어서 크기를 바꿀 수 있다(`win11-window`). 이 값은 처음 열릴 때의 크기다.

---

# B. `src/routes/FabricAnalysis.tsx`

## B-1. 머리글 순서 (216행)

현재 배열:
```tsx
{['사진','AN No.','의뢰일','구분','Requester','Brand','Source code','Construction','Contents','Weight','Request item','상태','In charge','완료일','Analysis result','']
```
교체:
```tsx
{['상태','사진','AN No.','의뢰일','구분','Requester','Brand','Source code','Construction','Contents','Weight','Request item','In charge','완료일','Analysis result','']
```
`상태` 를 맨 앞으로 옮기고 원래 자리에서 뺀다. 개수는 16개 그대로다. 체크박스 머리글은 215행에 따로 있어 건드리지 않는다.

## B-2. 본문 셀 순서 (219행)

219행 안에서 **상태 칩이 든 `<TableCell>` 하나를 통째로 잘라** 체크박스 `<TableCell>` 바로 뒤, 사진 `<TableCell>` 앞으로 옮긴다.

옮길 조각은 이것 하나다. 내용을 고치지 말고 위치만 바꾼다.
```tsx
<TableCell><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${stateClass[item.state]}`}><i className={`size-1.5 rounded-full ${stateDot[item.state]}`} />{item.state}</span></TableCell>
```

옮긴 뒤 본문 셀 순서가 머리글 순서(체크박스, 상태, 사진, AN No., 의뢰일, 구분, Requester, Brand, Source code, Construction, Contents, Weight, Request item, In charge, 완료일, Analysis result, 액션)와 같아야 한다. **한 칸이라도 어긋나면 값이 다른 열에 들어간다. 반드시 다시 세어 봐라.**

## B-3. 열 너비 고정 (214행)

현재:
```tsx
<Table className="min-w-[1700px] text-xs [&_td]:py-1">
```
교체:
```tsx
<Table className="min-w-[1750px] table-fixed text-xs [&_td]:py-1">
      <colgroup>{[40, 86, 48, 108, 92, 72, 90, 88, 118, 124, 150, 64, 200, 88, 92, 220, 70].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
```
`<colgroup>` 은 `<TableHeader>` 앞에 와야 한다. `Table` 은 `<table>` 을 바로 그리므로 첫 자식으로 둘 수 있다.

너비 17개는 머리글 17칸(체크박스 포함)과 1대1이고 합이 1750px 다. `table-fixed` 가 있어야 이 값이 지켜지고, 그래야 탭을 옮겨도 폭이 다시 잡히지 않는다. **`table-fixed` 를 빼지 마라. 그러면 이 작업이 통째로 무의미해진다.**

`max-w-56`·`max-w-64` 자르기가 걸린 칸은 그대로 둔다.

---

## 하지 말 것

- `src/components/ui/table.tsx` 와 `src/components/ui/dialog.tsx` 를 고치지 마라. 전 화면 공유다.
- 목록 표에서 `table-fixed` 나 `colgroup` 을 빼지 마라.
- 일괄 의뢰 표에서 `table-fixed` 를 빼지 마라.
- 열 너비 저장 키를 `CACHE_KEYS` 에 넣지 마라. 개인 브라우저 값이다.
- 팝업 세로 크기에 고정값을 주지 마라.
- 열 손잡이에서 `stopPropagation` 을 빼지 마라. 창이 같이 끌린다.
- 본문 셀을 옮길 때 내용을 고치지 마라. 위치만 바꾼다.
- 워킹트리의 R300~R303 변경을 git 명령으로 되돌리지 마라.
- `firestore.rules`, `public/data` 아래 JSON, `legacy/`, `backup/` 을 열지 마라.

## 성공 기준

- `npm run build` 통과(`tsc --noEmit` 포함). 실패하면 고치고 다시 돌려라.
- `git status --short` 에 이번에 새로 바뀐 파일이 `src/components/analysis/AnalysisRequestDialog.tsx` 와 `src/routes/FabricAnalysis.tsx` 둘이다. R300~R303으로 바뀐 파일들은 그대로 남아 있어야 한다.
- `grep -c "w-\[98vw\]" src/components/analysis/AnalysisRequestDialog.tsx` 결과가 0이다.
- `grep -c "table-fixed" src/routes/FabricAnalysis.tsx` 결과가 1이다.
- 목록 표 머리글 17칸과 본문 `<TableCell>` 17개의 순서가 같다.
