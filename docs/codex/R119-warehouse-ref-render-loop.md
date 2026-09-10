# R119 창고 탭 전환 화이트아웃 진짜 원인 — ref 콜백 안의 setState

상태: 구현 완료, 빌드 통과. 화면 확인 대기.

## 증상

`/warehouse` 에서 입고 대기, 창고 보관, 이력 탭을 오갈 때 잠깐 멈췄다가 **화면 전체가 백지**가 된다.
표만 비는 것이 아니라 사이드바까지 포함해 아무것도 안 뜬다. 새로고침해야 돌아온다.

## R113 은 원인이 아니었다

R113 에서는 가상 스크롤의 `viewports` 와 실제 `scrollTop` 이 어긋나 topPad 빈 줄만 보이는 것으로 봤다.
그 진단은 틀렸다. 표 안이 비는 것이 아니라 **React 트리가 통째로 언마운트**되는 것이었다.

가려낸 방법은 ErrorBoundary 다. 이 앱에는 ErrorBoundary 가 하나도 없어서 렌더 예외가 나면
React 18 이 루트를 언마운트하고 화면에 아무 단서도 남기지 않았다. R118 로 넣고 나서 메시지가 잡혔다.

## 원인

```
Maximum update depth exceeded.
    at measure (Warehouse.tsx:1383)
    at commitAttachRef
    at commitLayoutEffectOnFiber
```

`measure` 는 그리드 스크롤 상자의 **인라인 ref 콜백**이었다.

```tsx
const measure = (element: HTMLDivElement | null) => {
  gridRefs.current[gridId] = element
  if (!element) return
  const height = element.clientHeight
  setViewports((current) => current[gridId]?.height === height ? current : { ... })
}
```

렌더마다 새 함수가 만들어지므로 React 는 **커밋마다** 예전 ref 를 null 로 떼고 새 ref 를 붙인다.
붙일 때마다 `setViewports` 가 불린다. 커밋 → ref 재부착 → setState → 렌더 → 커밋 이 끝없이 돈다.
React 가 중첩 업데이트 한도에서 끊고 예외를 던진다.

**값이 같으면 같은 객체를 돌려주는 방어로는 못 막는다.** 그 방어는 React 의 조기 탈출(eager state)에 기대는데,
렌더가 연달아 도는 중에는 fiber 에 대기 중인 업데이트가 있어 조기 탈출 조건이 성립하지 않는다. 그대로 예약된다.

## 왜 창고 보관과 이력 탭에서만 터지나

입고 대기는 28건이라 커밋이 짧고 몇 바퀴 만에 가라앉는다.
창고 보관 651건, 이력 4,485건은 커밋이 길고, 탭 전환 시 맨 아래 스크롤이 만드는 scroll 이벤트까지 겹쳐
업데이트가 계속 이어진다. 그래서 한도를 넘긴다.

F5 직후 첫 진입이 멀쩡한 경우가 있던 것도 같은 이유다. 재렌더가 덜 겹치면 살아남는다.

## 조치

`src/routes/Warehouse.tsx`

- ref 콜백을 `useCallback(..., [tab])` 로 고정한 `attachGrid` 로 바꾼다. **ref 는 담기만 하고 상태를 건드리지 않는다.**
- 높이 측정은 두 곳으로 옮긴다.
  - 탭 전환 `useLayoutEffect`: 이미 `clientHeight` 를 읽어 저장한다.
  - `ResizeObserver`: 창 크기가 실제로 변할 때만 부른다. observe 직후 한 번 불려 첫 높이도 여기서 잡힌다.
- ResizeObserver 는 렌더 결과가 상자 크기를 바꾸지 않으므로 되먹임이 없다.

## 같은 실수가 다른 데 있는지

`grep -rn "ref={(" src/ | grep "set[A-Z]"` 결과 없음. 이 파일 하나뿐이었다.

## R113 에서 한 것은 남긴다

원인은 아니었지만 그 자체로 맞는 정리다.

- 스크롤 상자 `key={gridId}`: 탭 간 `scrollTop` 오염을 막는다
- `changeTab` 의 viewports 초기화: 새 노드의 scrollTop 0 과 상태를 맞춘다
- `useLayoutEffect`: 페인트 전에 위치를 맞춰 표 영역이 한 프레임 비는 것을 없앤다
- `TabFade` 제거: 무거운 커밋 도중의 상태 변경을 하나 줄인다

## 하지 말 것

- **ref 콜백 안에서 setState 하지 마라.** 꼭 재야 하면 ResizeObserver 나 layout effect 를 쓴다.
- ref 콜백을 인라인 함수로 두지 마라. `useCallback` 으로 고정한다.
- 값 비교로 막았으니 괜찮다고 보지 마라. 이번 코드가 그 방어를 넣고도 터진 사례다.
