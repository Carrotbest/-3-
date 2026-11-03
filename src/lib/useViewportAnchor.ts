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
