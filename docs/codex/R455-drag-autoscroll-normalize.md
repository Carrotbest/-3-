# R455 — 드래그 자동 스크롤 속도가 방향마다 다른 것을 고친다

상태: 미착수. 원인 규명과 수치 확인 완료, 시공 대기.

## 요구

2026-11-25 박향근. "왼쪽 스크롤은 빠른데 오른쪽은 왜 느리지?"

## 무엇이 틀렸나

R453·R454 가 넣은 `dragScrollSpeed(depth)` 가 **띠 안쪽 경계에서 들어간 깊이(px)를 그대로 속도 눈금으로 썼다.** 그런데 띠 폭이 방향마다 다르다.

- 왼쪽 80px. 고정 3열(담당·Status·Style No.)이 왼쪽 가장자리를 덮고 있어 그 위에서도 스크롤이 걸려야 한다.
- 오른쪽·아래 48px.
- REQUEST·WAREHOUSE 위쪽은 머리글 아래 24px.

띠가 넓으면 같은 자리에서 깊이가 더 깊게 잡힌다. 그래서 **포인터가 표 가장자리에 똑같이 닿아 있어도 속도가 갈렸다.** 실측이다.

| 방향 | 띠 폭 | 표 가장자리 속도 | 가장자리 밖 30px |
|---|---|---|---|
| 왼쪽 | 80px | 1564 px/s (48.9 행/s) | 2600 px/s |
| 오른쪽·아래 | 48px | 819 px/s (25.6 행/s) | 1506 px/s |
| 위(REQUEST·WAREHOUSE) | 24px | 505 px/s (15.8 행/s) | 930 px/s |

왼쪽이 오른쪽의 1.9배다. 띠 폭은 **어디서 스크롤이 시작되는지**를 정하는 값이지 속도와 상관이 없어야 한다. 두 가지를 한 숫자로 쓴 것이 잘못이다.

## 조치

**띠 폭으로 나눠 정규화한다.** 띠 안쪽 경계에서 0, 표 가장자리에서 1이 되는 비율로 바꾸면 띠가 몇 px 이든 네 방향이 같아진다.

파일 넷이다.

### 1. `src/lib/drag-scroll.ts` — 상수와 `dragScrollSpeed` 교체

상수 셋(`DRAG_SCROLL_MIN`, `DRAG_SCROLL_MAX`, `DRAG_SCROLL_RAMP`)과 `dragScrollSpeed` 를 아래로 바꾼다. `DRAG_SCROLL_MAX_STEP` 과 `dragScrollStep` 은 **그대로 둔다.**

```ts
/** 띠 안쪽 경계에 막 들어섰을 때. 한 행씩 고를 수 있어야 해서 낮다. */
const DRAG_SCROLL_MIN = 400
/** 포인터가 표 가장자리에 닿았을 때. */
const DRAG_SCROLL_EDGE = 1500
/** 가장자리 밖으로 `DRAG_SCROLL_OUT` 이상 밀었을 때. */
const DRAG_SCROLL_MAX = 2600
/** 가장자리 밖으로 이만큼 더 밀면 최고 속도다. */
const DRAG_SCROLL_OUT = 60

/**
 * 초당 스크롤 px. `inside` 는 표 가장자리에서 포인터까지의 거리이고 안쪽이 +, 밖이 −다.
 * `band` 는 그 방향에서 자동 스크롤이 걸리는 띠 폭이다.
 *
 * **띠 안쪽은 `band` 로 나눠 정규화한다. 깊이(px)를 그대로 눈금으로 쓰지 말 것(R455).**
 * 띠 폭이 방향마다 다르다. 왼쪽만 80px 인 것은 고정 열이 가장자리를 덮기 때문이고
 * 속도와는 상관이 없다. 나누지 않으면 포인터가 가장자리에 똑같이 닿아 있어도
 * 왼쪽이 오른쪽의 1.9배로 구른다.
 *
 * 띠 안쪽만 제곱이다. 경계 근처를 완만하게 눌러 한 행씩 고르려는 것이다.
 * **선형으로 바꾸지 말 것.** 가장자리 밖은 선형이라 미는 만큼 바로 붙는다.
 */
export function dragScrollSpeed(inside: number, band: number): number {
  const depth = band - inside
  if (depth <= 0) return 0
  if (depth <= band) {
    const ratio = depth / band
    return DRAG_SCROLL_MIN + (DRAG_SCROLL_EDGE - DRAG_SCROLL_MIN) * ratio * ratio
  }
  const out = Math.min((depth - band) / DRAG_SCROLL_OUT, 1)
  return DRAG_SCROLL_EDGE + (DRAG_SCROLL_MAX - DRAG_SCROLL_EDGE) * out
}
```

**인자가 하나에서 둘로 바뀐다.** 호출처 열두 곳을 모두 고쳐야 하고 하나라도 빠뜨리면 `tsc` 가 잡는다.

### 2. `src/routes/DevelopmentMasterSheet.tsx` (2137~2144행)

지금:

```ts
        const up = dragScrollSpeed(box.top + 48 - pointer.y)
        const down = dragScrollSpeed(pointer.y - (box.bottom - 48))
```
```ts
          const left = dragScrollSpeed(box.left + 80 - pointer.x)
          const right = dragScrollSpeed(pointer.x - (box.right - 48))
```

바꿀 것:

```ts
        const up = dragScrollSpeed(pointer.y - box.top, 48)
        const down = dragScrollSpeed(box.bottom - pointer.y, 48)
```
```ts
          const left = dragScrollSpeed(pointer.x - box.left, 80)
          const right = dragScrollSpeed(box.right - pointer.x, 48)
```

띠 폭 숫자가 한 줄에 한 번만 나오는 꼴이다. **48 이나 80 을 더하거나 빼는 옛 형태로 되돌리지 말 것.** 두 곳에 같은 숫자가 생겨 한쪽만 고치게 된다.

### 3. `src/routes/FabricRequest.tsx` (1505~1511행)

지금:

```ts
      const up = dragScrollSpeed(headBottom + 24 - pointer.y)
      const down = dragScrollSpeed(pointer.y - (box.bottom - 48))
```
```ts
        const left = dragScrollSpeed(box.left + 80 - pointer.x)
        const right = dragScrollSpeed(pointer.x - (box.right - 48))
```

바꿀 것:

```ts
      const up = dragScrollSpeed(pointer.y - headBottom, 24)
      const down = dragScrollSpeed(box.bottom - pointer.y, 48)
```
```ts
        const left = dragScrollSpeed(pointer.x - box.left, 80)
        const right = dragScrollSpeed(box.right - pointer.x, 48)
```

위쪽 기준이 `box.top` 이 아니라 `headBottom` 인 것은 머리글이 sticky 라서다. **`box.top` 으로 바꾸지 말 것.**

### 4. `src/routes/Warehouse.tsx` (1553~1558행)

`FabricRequest.tsx` 와 글자까지 같은 네 줄이다. 같은 식으로 바꾼다.

```ts
        const up = dragScrollSpeed(pointer.y - headBottom, 24)
        const down = dragScrollSpeed(box.bottom - pointer.y, 48)
```
```ts
        const left = dragScrollSpeed(pointer.x - box.left, 80)
        const right = dragScrollSpeed(box.right - pointer.x, 48)
```

## 기대값

네 방향, 세 화면이 모두 같아진다. 행 높이 32px 기준이다.

| 포인터 자리 | px/s | 행/s |
|---|---|---|
| 띠 안쪽 경계 바로 안 | 400 | 12.5 |
| 띠 한가운데 | 675 | 21.1 |
| 표 가장자리 | 1500 | 46.9 |
| 가장자리 밖 30px | 2050 | 64.1 |
| 가장자리 밖 60px 이상 | 2600 | 81.3 |

왼쪽은 가장자리에서 1564 였으니 거의 그대로이고, 오른쪽과 아래가 819 에서 1500 으로 올라와 왼쪽에 맞춰진다. REQUEST·WAREHOUSE 위쪽은 505 에서 1500 이다. 셋 중 가장 느렸다.

프레임이 50ms 로 늘어져도 한 틱에 130px 까지만 움직인다(`DRAG_SCROLL_MAX_STEP`, 그대로다).

## 하지 말 것

- **띠 폭(48, 80, 24)을 바꾸지 말 것.** 어디서 스크롤이 시작되는지는 불만 사항이 아니다. 왼쪽 80 은 고정 열, 위쪽 24 는 sticky 머리글 때문이다. 이번 수정은 그 숫자가 **속도까지 정하던 것**을 끊는 것이다.
- **깊이(px)를 그대로 눈금으로 쓰는 옛 식으로 되돌리지 말 것.** 그것이 이번 버그다.
- **프레임당 px 로 되돌리지 말 것**(R453).
- **`dragScrollStep` 과 그 안의 `Math.max` 를 손대지 말 것**(R453). 첫 프레임에 스크롤이 반대로 간다.
- **상수와 식을 화면 파일로 다시 퍼뜨리지 말 것**(R454). 공용 모듈 하나다.
- **`gridMouseRef.current.moveAt`(DD), `extendAtPointerRef.current`(REQUEST), `extendDragAtPointerRef.current`(WAREHOUSE) 줄과 포인터를 상자 안으로 당기는 `Math.min`·`Math.max` 줄을 건드리지 말 것.**
- **`stopDragAutoScroll`·`stopAutoScroll` 과 `move` 핸들러를 손대지 말 것.**
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라. 고치는 파일은 위 넷뿐이다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다. 호출처를 빠뜨리면 인자 개수에서 걸린다.

수치 대조는 클로드가 저장소 밖에서 한다. 실제 체감은 박향근이 화면에서 본다.
