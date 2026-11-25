# R453 — DD MASTER 드래그 자동 스크롤을 엑셀 속도로 올린다

상태: 구현 완료. `npm run build` 통과. 화면 체감 확인 대기.

**상수와 `dragScrollSpeed` 는 R454 에서 `src/lib/drag-scroll.ts` 로 옮겼다.** 아래 「1. 상수를 파일 상단 상수 자리에 더한다」는 그때의 기록이고 지금 그 자리에 없다. 속도를 고칠 때는 공용 모듈을 본다. REQUEST·WAREHOUSE 도 같은 식을 쓴다.

## 요구

2026-11-25 박향근. "DD에서 드래그해서 이동할 때 스크롤되는 속도가 너무 느리다. 엑셀 정도의 속도로 올릴 수 있을까."

## 무엇이 느린가

자리는 `src/routes/DevelopmentMasterSheet.tsx` 의 `startDragAutoScroll`(2120행)이다. 선택 드래그, 행 머리 드래그, 채우기 핸들, 선택 영역 이동 네 가지가 모두 이 함수 하나를 쓴다.

지금 코드는 `requestAnimationFrame` 틱마다 **고정 16px** 을 민다.

```ts
        if (pointer.y < box.top + 48) scroller.scrollTop -= 16
        else if (pointer.y > box.bottom - 48) scroller.scrollTop += 16
        const wholeRowDrag = moveDrag?.wholeRows === true || rowSelectingRef.current
        if (!wholeRowDrag && pointer.x < box.left + 80) scroller.scrollLeft -= 16
        else if (!wholeRowDrag && pointer.x > box.right - 48) scroller.scrollLeft += 16
```

느린 이유가 둘이다.

1. **속도가 시간이 아니라 프레임 수에 묶여 있다.** 16px/프레임이라 60fps 에서 960px/s(행 높이 32px 기준 초당 30행)다. 그런데 이 표는 74열에 수백 행이고 가상 스크롤이 없으며, 같은 틱 안에서 `gridMouseRef.current.moveAt` 이 `elementFromPoint` 와 상태 갱신을 돌려 표를 다시 그린다. 프레임이 늦어지는 만큼 스크롤도 그대로 느려진다. 프레임이 절반으로 떨어지면 속도도 절반이다.
2. **가속이 없다.** 포인터를 가장자리 밖으로 더 밀어도 속도가 그대로다. 엑셀은 더 밀수록 빨라져서 사람이 속도를 조절한다. 여기는 조절할 수단이 없다.

## 조치

파일 하나다. `src/routes/DevelopmentMasterSheet.tsx`. 고치는 함수는 `startDragAutoScroll` 하나다.

### 1. 상수를 파일 상단 상수 자리에 더한다

`const FREEZE_EDGE = ...`(60행) 근처, 모듈 레벨이다.

```ts
/** 드래그 자동 스크롤. 엑셀처럼 가장자리 밖으로 더 밀수록 빨라진다(R453).
 *  속도는 px/초다. **프레임당 px 로 되돌리지 말 것.** 74열 표라 프레임이 늦어지면 스크롤도 같이 느려진다. */
const DRAG_SCROLL_MIN = 400
const DRAG_SCROLL_MAX = 2600
/** 띠 안쪽 경계에서 이만큼 더 밀면 최고 속도다. */
const DRAG_SCROLL_RAMP = 110
/** 한 틱에 반영할 최대 경과 시간(초). 프레임이 길게 멈춰도 한 번에 한 화면씩 튀지 않게 묶는다. */
const DRAG_SCROLL_MAX_STEP = 0.05

/** 띠 안쪽 경계에서 얼마나 더 깊이 들어갔는지(px)로 초당 속도를 낸다. */
function dragScrollSpeed(depth: number): number {
  if (depth <= 0) return 0
  const ratio = Math.min(depth / DRAG_SCROLL_RAMP, 1)
  return DRAG_SCROLL_MIN + (DRAG_SCROLL_MAX - DRAG_SCROLL_MIN) * ratio * ratio
}
```

`ratio * ratio` 로 완만하게 올리는 것이 핵심이다. 띠 안쪽에서는 천천히 굴러 한 행씩 고를 수 있고, 밖으로 밀면 빨라진다. 선형으로 바꾸면 띠 안쪽이 이미 빨라 정밀하게 못 고른다.

### 2. `startDragAutoScroll` 을 경과 시간 기준으로 바꾼다 (2120~2144행)

지금 함수를 아래로 교체한다. 바뀌는 것은 스크롤 계산뿐이고 나머지 구조(활성 판정, `moveAt` 재조회, 다음 프레임 예약)는 그대로다.

```ts
  const startDragAutoScroll = (clientX: number, clientY: number) => {
    lastDragPointerRef.current = { x: clientX, y: clientY }
    if (dragAutoScrollFrameRef.current !== null) return
    let lastAt = performance.now()
    const tick = (now: number) => {
      dragAutoScrollFrameRef.current = null
      const pointer = lastDragPointerRef.current
      const moveDrag = moveDragRef.current
      const dragActive = Boolean(moveDrag || fillDragRef.current || rowSelectingRef.current || selectingRef.current)
      if (!pointer || !dragActive) return
      // 프레임 간격을 직접 재서 px/초로 민다. 프레임이 늦어도 속도가 유지된다(R453).
      const step = Math.min((now - lastAt) / 1000, DRAG_SCROLL_MAX_STEP)
      lastAt = now
      const scroller = gridScrollRef.current
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const up = dragScrollSpeed(box.top + 48 - pointer.y)
        const down = dragScrollSpeed(pointer.y - (box.bottom - 48))
        if (up > 0) scroller.scrollTop -= up * step
        else if (down > 0) scroller.scrollTop += down * step
        const wholeRowDrag = moveDrag?.wholeRows === true || rowSelectingRef.current
        if (!wholeRowDrag) {
          const left = dragScrollSpeed(box.left + 80 - pointer.x)
          const right = dragScrollSpeed(pointer.x - (box.right - 48))
          if (left > 0) scroller.scrollLeft -= left * step
          else if (right > 0) scroller.scrollLeft += right * step
        }
      }
      // 스크롤 뒤 포인터 아래 대상을 매 프레임 다시 찾아, 마우스가 멈춰도 선택·미리보기를 확장한다.
      gridMouseRef.current.moveAt(pointer.x, pointer.y)
      dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
  }
```

바뀐 점을 정리하면 이렇다.

- `tick` 이 `requestAnimationFrame` 이 주는 타임스탬프(`now`)를 받는다. 지금은 인자가 없다.
- `lastAt` 을 클로저에 두고 프레임 간격을 잰다. `ref` 를 새로 만들지 않는다. 드래그 한 번에 `startDragAutoScroll` 이 한 번 돌고 그 안에서만 쓰는 값이다.
- 띠 경계값 48, 80, 48 은 **지금 값 그대로 둔다.** 왼쪽만 80인 것은 고정 3열(담당·Status·Style No.) 때문이다. 어디서 스크롤이 시작되는지는 불만 사항이 아니다. 바꾸지 말 것.
- `document.querySelector("[data-route-scroll-root]")` 를 `gridScrollRef.current` 로 바꾼다. 같은 div 다(3828행 `<div ref={gridScrollRef} data-route-scroll-root ...>`). 매 프레임 DOM 을 뒤지지 않는다.
- 위아래와 좌우가 각각 `else if` 로 갈려 한 방향만 먹는 것은 그대로다. 대각선으로 밀면 세로와 가로가 함께 구른다(지금과 같다).

## 기대값

행 높이 32px 기준이다.

| 포인터 자리 | 지금 | 수정 후 |
|---|---|---|
| 띠 안쪽 경계 | 60fps 에서 초당 30행, 프레임이 늦으면 그만큼 느림 | 초당 12.5행, 프레임과 무관 |
| 표 가장자리 | 같음(초당 30행) | 초당 약 26행 |
| 가장자리 밖 60px 이상 | 같음(초당 30행) | 초당 81행 |

즉 띠 안쪽은 지금보다 느려서 한 행씩 고를 수 있고, 밖으로 밀면 2.7배 빨라진다. **프레임이 늦어도 속도가 안 떨어지는 것이 실제 체감에서 가장 큰 몫이다.**

## 하지 말 것

- **프레임당 px 로 되돌리지 말 것.** 그것이 이번 수정의 핵심이다.
- **띠 크기(48, 80, 48)를 바꾸지 말 것.** 왼쪽 80은 고정 3열 때문이다.
- **`gridMouseRef.current.moveAt(pointer.x, pointer.y)` 줄을 건드리거나 띄엄띄엄 부르지 말 것.** 마우스가 멈춰도 선택과 미리보기가 따라 넓어지는 것이 이 줄이다. 프레임을 건너뛰면 스크롤만 가고 선택이 안 따라온다.
- **`stopDragAutoScroll` 을 손대지 말 것.** 호출처가 셋이다(2231, 2268행과 cleanup).
- **`src/routes/FabricRequest.tsx`(1500~1504행)와 `src/routes/Warehouse.tsx`(1548~1551행)의 같은 16px 코드는 이번에 고치지 않는다.** 박향근이 DD 만 말했다. 따로 정한다.
- **자동 스크롤을 `scrollBy({ behavior: "smooth" })` 로 바꾸지 말 것.** 매 프레임 호출하면 브라우저가 앞 애니메이션을 취소하며 뭉개진다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 파일을 삭제하지 마라. 고치는 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다.

실제 체감 속도는 박향근이 화면에서 본다. Codex 도 클로드도 로그인이 필요해 확인하지 못한다.

## 시공 뒤 보완 (클로드)

`step` 을 0 아래로 못 내려가게 묶었다.

```ts
const step = Math.min(Math.max(now - lastAt, 0) / 1000, DRAG_SCROLL_MAX_STEP)
```

첫 틱에서만 생기는 문제다. `lastAt` 은 마우스 이벤트가 도는 중에 `performance.now()` 로 잡는데 `now` 는 그 프레임이 **시작한** 시각이라, 브라우저가 같은 프레임 안에서 마우스 이벤트를 먼저 돌리면 `now` 가 `lastAt` 보다 앞선다. 그러면 `step` 이 음수가 되어 첫 프레임에 스크롤이 반대로 간다. 두 번째 틱부터는 `lastAt = now` 라 둘 다 프레임 시각이어서 이런 일이 없다. **이 `Math.max` 를 빼지 말 것.**

## 수식 실측 (행 높이 32px 기준)

| 포인터 자리 | px/s | 행/s |
|---|---|---|
| 띠 안쪽 경계 바로 안 | 400 | 12.5 |
| 띠 한가운데(24px) | 505 | 15.8 |
| 표 가장자리(48px) | 819 | 25.6 |
| 가장자리 밖 30px | 1506 | 47.1 |
| 가장자리 밖 60px | 2521 | 78.8 |
| 가장자리 밖 62px 이상 | 2600 | 81.3 |

프레임이 50ms 로 늘어져도 한 틱에 130px(4.1행)까지만 움직인다(`DRAG_SCROLL_MAX_STEP`).
