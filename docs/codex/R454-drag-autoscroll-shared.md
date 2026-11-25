# R454 — 드래그 자동 스크롤 속도를 REQUEST·WAREHOUSE 에도 넓히고 식을 한 곳으로 모은다

상태: 구현 완료. `npm run build` 통과. 화면 체감 확인 대기.

## 요구

2026-11-25 박향근. R453 으로 DD MASTER 만 고친 뒤 "둘 다 올려주세요". REQUEST 와 WAREHOUSE 표의 드래그 자동 스크롤도 같은 속도로 올린다.

## 지금 상태

같은 **프레임당 고정 16px** 코드가 세 화면에 있었고 R453 이 DD 만 고쳤다. 남은 둘이다.

- `src/routes/FabricRequest.tsx` 1500~1504행. `useEffect` 안 `tick`.
- `src/routes/Warehouse.tsx` 1548~1551행. `startDragAutoScroll` 안 `tick`.

그리고 R453 이 만든 상수 넷과 `dragScrollSpeed` 가 `DevelopmentMasterSheet.tsx` **모듈 레벨에만** 있다. 세 화면이 같은 속도를 써야 하는데 파일마다 복사하면 한 곳만 고치고 지나가게 된다. **먼저 공용 모듈로 옮기고 셋이 그것을 쓴다.**

## 조치

파일 넷이다. 새 파일 하나, 고치는 파일 셋.

### 1. 새 파일 `src/lib/drag-scroll.ts`

`DevelopmentMasterSheet.tsx` 61~76행의 상수 넷과 `dragScrollSpeed` 를 **그대로 옮긴다.** 숫자를 바꾸지 말 것. R453 에서 실측으로 맞춘 값이다. `dragScrollStep` 하나가 더해진다.

```ts
/** 표 드래그 자동 스크롤. 엑셀처럼 가장자리 밖으로 더 밀수록 빨라진다(R453, R454).
 *  속도는 px/초다. **프레임당 px 로 되돌리지 말 것.** 열이 많은 표라 프레임이 늦어지면 스크롤도 같이 느려진다.
 *  DD MASTER·DEVELOPMENT REQUEST·WAREHOUSE 세 표가 이 파일 하나를 쓴다. **파일마다 복사하지 말 것.** */
const DRAG_SCROLL_MIN = 400
const DRAG_SCROLL_MAX = 2600
/** 띠 안쪽 경계에서 이만큼 더 밀면 최고 속도다. */
const DRAG_SCROLL_RAMP = 110
/** 한 틱에 반영할 최대 경과 시간(초). 프레임이 길게 멈춰도 한 번에 한 화면씩 튀지 않게 묶는다. */
const DRAG_SCROLL_MAX_STEP = 0.05

/** 띠 안쪽 경계에서 얼마나 더 깊이 들어갔는지(px)로 초당 속도를 낸다. */
export function dragScrollSpeed(depth: number): number {
  if (depth <= 0) return 0
  const ratio = Math.min(depth / DRAG_SCROLL_RAMP, 1)
  return DRAG_SCROLL_MIN + (DRAG_SCROLL_MAX - DRAG_SCROLL_MIN) * ratio * ratio
}

/**
 * 이번 프레임에 반영할 경과 시간(초). 속도에 곱해 쓴다.
 *
 * **`Math.max` 를 빼지 말 것.** 첫 틱에서 `lastAt` 은 마우스 이벤트가 도는 중에 `performance.now()` 로
 * 잡은 값인데 `now` 는 그 프레임이 **시작한** 시각이라, 브라우저가 같은 프레임 안에서 마우스 이벤트를
 * 먼저 돌리면 `now` 가 `lastAt` 보다 앞선다. 그러면 음수가 되어 첫 프레임에 스크롤이 반대로 간다.
 */
export function dragScrollStep(now: number, lastAt: number): number {
  return Math.min(Math.max(now - lastAt, 0) / 1000, DRAG_SCROLL_MAX_STEP)
}
```

`ratio * ratio` 로 완만하게 올리는 것이 핵심이다. 띠 안쪽에서는 천천히 굴러 한 행씩 고를 수 있고, 밖으로 밀면 빨라진다. 선형으로 바꾸면 띠 안쪽이 이미 빨라 정밀하게 못 고른다.

### 2. `src/routes/DevelopmentMasterSheet.tsx`

**숫자와 동작은 안 바뀐다. 옮기기만 한다.**

- 61~76행(`/** 드래그 자동 스크롤 …` 주석부터 `dragScrollSpeed` 함수 닫는 괄호까지)을 **지운다.** 바로 위 `const FREEZE_EDGE = ...` 와 바로 아래 `type Freeze = ...` 는 그대로 둔다.
- import 에 더한다. 38행 `import { useViewportAnchor } from "@/lib/useViewportAnchor"` 근처다.

```ts
import { dragScrollSpeed, dragScrollStep } from "@/lib/drag-scroll"
```

- `startDragAutoScroll` 안(2146~2147행)의 두 줄

```ts
          // 프레임 간격을 직접 재서 px/초로 민다. 프레임이 늦어도 속도가 유지된다(R453).
          // 첫 틱은 lastAt 이 마우스 이벤트 시각이고 now 는 프레임 시작 시각이라 음수가 될 수 있다. 0으로 묶는다.
          const step = Math.min(Math.max(now - lastAt, 0) / 1000, DRAG_SCROLL_MAX_STEP)
```

를 아래로 바꾼다. 근거 주석은 `dragScrollStep` 쪽으로 갔다.

```ts
          // 프레임 간격을 직접 재서 px/초로 민다. 프레임이 늦어도 속도가 유지된다(R453).
          const step = dragScrollStep(now, lastAt)
```

### 3. `src/routes/FabricRequest.tsx`

import 에 더한다(54행 근처).

```ts
import { dragScrollSpeed, dragScrollStep } from "@/lib/drag-scroll"
```

`useEffect` 안 `tick`(1495~1512행)을 아래로 교체한다. 바뀌는 것은 스크롤 계산과 `tick` 인자뿐이다. `headBottom` 계산, 포인터 당기기, `extendAtPointerRef` 호출, 다음 프레임 예약은 그대로다.

```ts
    let lastAt = performance.now()
    const tick = (now: number) => {
      autoScrollFrameRef.current = null
      const pointer = pointerRef.current
      const scroller = scrollRef.current
      if (!pointer || !scroller || !dragRef.current) return
      // 프레임 간격을 직접 재서 px/초로 민다. 프레임이 늦어도 속도가 유지된다(R454).
      const step = dragScrollStep(now, lastAt)
      lastAt = now
      const box = scroller.getBoundingClientRect()
      // 머리글은 sticky라 표 위쪽 가장자리는 머리글 아래 선으로 본다.
      const headBottom = Math.max(box.top, scroller.querySelector("thead")?.getBoundingClientRect().bottom ?? box.top)
      const up = dragScrollSpeed(headBottom + 24 - pointer.y)
      const down = dragScrollSpeed(pointer.y - (box.bottom - 48))
      if (up > 0) scroller.scrollTop -= up * step
      else if (down > 0) scroller.scrollTop += down * step
      if (!rowDragRef.current) {
        const left = dragScrollSpeed(box.left + 80 - pointer.x)
        const right = dragScrollSpeed(pointer.x - (box.right - 48))
        if (left > 0) scroller.scrollLeft -= left * step
        else if (right > 0) scroller.scrollLeft += right * step
      }
      // 포인터가 표 밖으로 나가도 가장 가까운 안쪽 칸으로 선택을 넓힌다. 스크롤바 폭만큼 안으로 당긴다.
      const x = Math.min(Math.max(pointer.x, box.left + 2), box.right - 14)
      const y = Math.min(Math.max(pointer.y, headBottom + 2), box.bottom - 14)
      extendAtPointerRef.current(x, y)
      autoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
```

그리고 같은 effect 안 `move`(1514~1518행)에서 **프레임을 새로 걸 때 `lastAt` 을 다시 잡는다.** 지금:

```ts
      if (autoScrollFrameRef.current === null) autoScrollFrameRef.current = window.requestAnimationFrame(tick)
```

바꿀 것:

```ts
      if (autoScrollFrameRef.current === null) {
        // 드래그를 새로 시작할 때 기준 시각을 다시 잡는다. 안 잡으면 지난 드래그 끝 시각과의 간격이 들어온다(R454).
        lastAt = performance.now()
        autoScrollFrameRef.current = window.requestAnimationFrame(tick)
      }
```

`tick` 과 `lastAt` 과 `move` 가 모두 같은 `useEffect` 클로저 안이라 `ref` 를 새로 만들지 않는다. **만들지 말 것.**

### 4. `src/routes/Warehouse.tsx`

import 에 더한다(53행 근처).

```ts
import { dragScrollSpeed, dragScrollStep } from "@/lib/drag-scroll"
```

`startDragAutoScroll`(1537~1559행)을 아래로 교체한다.

```ts
  const startDragAutoScroll = (clientX: number, clientY: number) => {
    dragPointerRef.current = { x: clientX, y: clientY }
    if (dragFrameRef.current !== null) return
    let lastAt = performance.now()
    const tick = (now: number) => {
      dragFrameRef.current = null
      const pointer = dragPointerRef.current
      if (!pointer || !cellDragRef.current) return
      // 프레임 간격을 직접 재서 px/초로 민다. 프레임이 늦어도 속도가 유지된다(R454).
      const step = dragScrollStep(now, lastAt)
      lastAt = now
      const scroller = gridRefs.current[tab]
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const headBottom = Math.max(box.top, scroller.querySelector("thead")?.getBoundingClientRect().bottom ?? box.top)
        const up = dragScrollSpeed(headBottom + 24 - pointer.y)
        const down = dragScrollSpeed(pointer.y - (box.bottom - 48))
        if (up > 0) scroller.scrollTop -= up * step
        else if (down > 0) scroller.scrollTop += down * step
        const left = dragScrollSpeed(box.left + 80 - pointer.x)
        const right = dragScrollSpeed(pointer.x - (box.right - 48))
        if (left > 0) scroller.scrollLeft -= left * step
        else if (right > 0) scroller.scrollLeft += right * step
        const x = Math.min(Math.max(pointer.x, box.left + 2), box.right - 14)
        const y = Math.min(Math.max(pointer.y, headBottom + 2), box.bottom - 14)
        extendDragAtPointerRef.current(x, y)
      }
      dragFrameRef.current = window.requestAnimationFrame(tick)
    }
    dragFrameRef.current = window.requestAnimationFrame(tick)
  }
```

창고는 `move` 쪽을 안 고친다. 프레임이 null 이면 `startDragAutoScroll` 을 다시 부르는 구조라 `lastAt` 이 거기서 새로 잡힌다(1588행). **그 호출을 `requestAnimationFrame` 직접 호출로 바꾸지 말 것.**

## 하지 말 것

- **프레임당 px 로 되돌리지 말 것.** 그것이 이번 수정의 핵심이다.
- **상수와 `dragScrollSpeed` 를 파일마다 복사하지 말 것.** 세 표가 같은 속도여야 한다. 공용 모듈 하나다.
- **`dragScrollStep` 안의 `Math.max` 를 빼지 말 것.** 첫 프레임에 스크롤이 반대로 간다.
- **띠 크기를 바꾸지 말 것.** REQUEST·WAREHOUSE 는 위쪽이 `headBottom + 24`, 아래 48, 왼쪽 80, 오른쪽 48 이다. DD 와 위쪽 값이 다른데 그것은 머리글이 sticky 라 기준선이 다르기 때문이다. **DD 의 48 로 맞추지 말 것.** 어디서 스크롤이 시작되는지는 불만 사항이 아니다.
- **`extendAtPointerRef.current(x, y)`(REQUEST)와 `extendDragAtPointerRef.current(x, y)`(WAREHOUSE) 줄을 건드리거나 띄엄띄엄 부르지 말 것.** 마우스가 멈춰도 선택이 따라 넓어지는 것이 이 줄이다. 포인터를 상자 안으로 당기는 `Math.min`·`Math.max` 네 줄도 그대로 둔다.
- **`stopAutoScroll`(REQUEST)과 `stopDragAutoScroll`(WAREHOUSE)을 손대지 말 것.**
- **`ref` 를 새로 만들지 말 것.** `lastAt` 은 클로저 지역 변수다.
- **WAREHOUSE 의 세로 스크롤에 `wholeRowDrag` 같은 가드를 새로 넣지 말 것.** 그 화면은 가로도 늘 구른다. 지금 동작 그대로다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라. 워킹트리에 R452·R453 수정이 들어 있다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 파일을 삭제하지 마라. 새로 만드는 파일은 `src/lib/drag-scroll.ts` 하나다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다. `DevelopmentMasterSheet.tsx` 에서 상수를 지우고 import 를 빠뜨리면 거기서 걸린다.

실제 체감 속도는 박향근이 화면에서 본다. Codex 도 클로드도 로그인이 필요해 확인하지 못한다.

## 기대값 (행 높이 32px 기준)

세 화면이 같다.

| 포인터 자리 | px/s | 행/s |
|---|---|---|
| 띠 안쪽 경계 바로 안 | 400 | 12.5 |
| 띠 밖 30px | 1506 | 47.1 |
| 띠 밖 62px 이상 | 2600 | 81.3 |

띠 안쪽은 전보다 느리다. 한 행씩 고를 수 있어야 해서 일부러 낮췄다.
