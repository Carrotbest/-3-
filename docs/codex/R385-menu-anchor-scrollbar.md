# R385 — 우클릭 팝업 잘림과 가로 스크롤바 두께

고칠 파일은 넷이다. 이 밖의 파일은 열지도 고치지도 마라.

- `src/lib/useViewportAnchor.ts` (새로 만든다)
- `src/routes/FabricRequest.tsx`
- `src/routes/DevelopmentMasterSheet.tsx`
- `src/routes/Warehouse.tsx`
- `src/index.css`

파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 주석도 한글로 쓴다.

## 배경

우클릭 팝업의 세로 위치를 **높이 상수로 어림하고 있다.** 항목이 늘면 그만큼 아래가 잘린다.
2026-11-04 DD MASTER에서 실제로 잘렸다. 메뉴가 아홉 줄인데 상수는 210px 이었다.

같은 문제를 `FabricRequest.tsx`가 R357에 이미 풀어 놓았다. `useViewportAnchor`가
그려 놓고 `getBoundingClientRect`로 실제 높이를 재서 옮긴다. **그 훅을 공용으로 빼서
세 화면이 같이 쓴다.** 새 로직을 짜지 마라.

## 작업 A — 훅을 `src/lib`로 옮긴다

`src/lib/useViewportAnchor.ts`를 새로 만든다. 내용은 `FabricRequest.tsx` 52~70줄의
함수를 그대로 옮기고 `export`만 붙인 것이다. 주석도 그대로 가져간다.

```ts
import { useLayoutEffect, useRef, useState } from "react"

/**
 * 뷰포트 밖으로 넘치는 팝업을 안쪽으로 밀어 넣는다(R357, R385).
 * 높이를 상수로 어림하면 항목이 늘 때마다 아래가 잘린다. 그려 놓고 실제로 재서 옮긴다.
 * 첫 칠에서는 `pos`가 null이라 호출처가 `visibility: hidden`으로 숨기고, 자리를 잡은 뒤에 보인다.
 *
 * **`anchor`로 넘기는 값은 state 여야 한다.** 매 렌더 새 객체를 만들어 넘기면
 * `useLayoutEffect`가 매번 돌아 다시 그리기가 끝나지 않는다. 가공이 필요하면 `useMemo`로 감싼다.
 */
export function useViewportAnchor(anchor: { x: number; y: number } | null, gap = 8) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return }
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const left = Math.max(gap, Math.min(anchor.x, window.innerWidth - box.width - gap))
    const top = Math.max(gap, Math.min(anchor.y, window.innerHeight - box.height - gap))
    setPos({ left, top })
  }, [anchor, gap])
  return { ref, pos }
}
```

그 다음 `src/routes/FabricRequest.tsx`에서 **52~70줄의 함수 정의를 지우고** 대신
`import { useViewportAnchor } from "@/lib/useViewportAnchor"`를 파일 위쪽 import 들과
같은 자리에 넣는다. 852줄과 855줄의 호출은 그대로 둔다.

함수를 지운 뒤 `useLayoutEffect`가 그 파일에서 더 쓰이지 않으면 react import 에서 뺀다.
`useRef`와 `useState`는 다른 곳에서도 쓰므로 확인하고 지워라. **쓰이는 것을 지우지 마라.**

## 작업 B — 세 팝업에 훅을 건다

### B-1. `FabricRequest.tsx`의 `bottomMenu`

2460줄 근처의 현재 코드다.

```tsx
        <div role="menu" className="fixed z-[90] min-w-44 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: Math.min(bottomMenu.x, window.innerWidth - 192), top: Math.min(bottomMenu.y, window.innerHeight - 130) }}>
```

`rowMenuPos` 선언 옆(852줄 근처)에 `const bottomMenuPos = useViewportAnchor(bottomMenu)`를
더하고, 위 줄을 이렇게 바꾼다.

```tsx
        <div role="menu" ref={bottomMenuPos.ref} className="fixed z-[90] min-w-44 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: bottomMenuPos.pos?.left ?? bottomMenu.x, top: bottomMenuPos.pos?.top ?? bottomMenu.y, visibility: bottomMenuPos.pos ? "visible" : "hidden" }}>
```

`bottomMenu` state 선언이 `rowMenuPos`보다 아래에 있으면 훅 호출을 그 state 선언 **아래**에
둔다. 선언 순서만 맞추고 다른 것은 옮기지 마라.

### B-2. `DevelopmentMasterSheet.tsx`의 `menu`

3705줄의 현재 코드다.

```tsx
        <div role="menu" className="fixed z-[91] min-w-44 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] py-1 text-sm shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - (menu.kind === "bottom" ? 100 : 210)) }}>
```

이렇게 바꾼다.

```tsx
        <div role="menu" ref={menuPos.ref} className="fixed z-[91] min-w-44 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] py-1 text-sm shadow-lg" style={{ left: menuPos.pos?.left ?? menu.x, top: menuPos.pos?.top ?? menu.y, visibility: menuPos.pos ? "visible" : "hidden" }}>
```

`menu` state 선언 아래에 `const menuPos = useViewportAnchor(menu)`를 더한다.
`menu`는 `{ x, y, kind }` 형태의 state 라 그대로 넘기면 된다. **`useMemo`로 감싸지 마라.**
`kind` 분기(`"bottom" ? 100 : 210`)는 이제 필요 없으니 같이 없앤다.
파일 위쪽에 `import { useViewportAnchor } from "@/lib/useViewportAnchor"`를 더한다.

### B-3. `Warehouse.tsx`의 `cellMenu`

2119줄의 현재 코드다.

```tsx
      <div role="menu" className="fixed z-[90] w-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: Math.min(cellMenu.x, window.innerWidth - 176), top: Math.min(cellMenu.y, window.innerHeight - 120) }}>
```

이렇게 바꾼다.

```tsx
      <div role="menu" ref={cellMenuPos.ref} className="fixed z-[90] w-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-1 text-xs shadow-lg" style={{ left: cellMenuPos.pos?.left ?? cellMenu.x, top: cellMenuPos.pos?.top ?? cellMenu.y, visibility: cellMenuPos.pos ? "visible" : "hidden" }}>
```

`cellMenu` state 선언 아래에 `const cellMenuPos = useViewportAnchor(cellMenu)`를 더하고
파일 위쪽에 import 를 더한다.

## 작업 C — 가로 스크롤바를 두 배로

`src/index.css` 452~470줄이 스크롤바 규칙이다. thumb 이 투명 테두리 2px 를 두르고
`content-box` 로 칠해서 **실제로 보이는 두께는 트랙에서 4px 를 뺀 값**이다.
지금 가로는 트랙 8px, 보이는 두께 4px 다. 보이는 두께를 8px 로 만든다.

459줄을 이렇게 바꾼다.

```css
::-webkit-scrollbar { width: 8px; height: 16px; }
```

그리고 `::-webkit-scrollbar-thumb:hover` 줄 **위에** 다음을 더한다.

```css
/* 가로 스크롤바만 두 배로(R385, 2026-11-04 박향근 요구). 표를 좌우로 끄는 일이 많아
   잡기 쉬워야 한다. 트랙 16px 에 테두리 4px 라 보이는 두께는 8px 이고 세로의 두 배다. */
::-webkit-scrollbar-thumb:horizontal { border-width: 4px; }
```

**세로 스크롤바(`width`)는 건드리지 마라.** 8px 그대로다.
**`scrollbar-width: thin`도 건드리지 마라.** 파이어폭스용이고 이 규칙과 별개다.

## 하지 말 것

- 새 위치 계산 로직을 짜지 마라. `useViewportAnchor` 하나만 쓴다.
- 팝업을 위로 뒤집는(flip) 동작을 넣지 마라. 안쪽으로 미는 것으로 충분하다.
- `FabricRequest.tsx`의 `rowMenuPos`와 `confirmPos` 호출을 건드리지 마라. 이미 맞다.
- `menu`, `bottomMenu`, `cellMenu` state 의 모양을 바꾸지 마라.
- 커밋하지 마라. 푸시하지 마라. 어떤 파일도 지우지 마라.
- `git reset --hard`나 `git checkout --`를 쓰지 마라.

## 성공 기준

1. `npm run build`가 통과한다.
2. `git status --short`에 위에 적은 다섯 파일만 뜬다(문서 제외).
3. `grep -rn "window.innerHeight -" src/routes` 결과가 **한 건도 없다.**
4. `useViewportAnchor`가 `src/lib/useViewportAnchor.ts` 한 곳에만 정의돼 있다.
5. 화면 문구가 영어로 바뀐 곳이 없다.
