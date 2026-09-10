# R113 창고 보관 탭 흰 화면

상태: 적용했으나 **원인 진단은 틀렸다.** 진짜 원인은 R119 에 있다.

> **정정 (2026-09-10).** 흰 화면은 표 안이 비는 것이 아니라 React 트리가 통째로 언마운트되는 것이었다.
> ref 콜백 안의 setState 로 생긴 무한 렌더가 원인이다. `docs/codex/R119-warehouse-ref-render-loop.md` 를 볼 것.
> 아래 조치는 그 자체로 맞는 정리라 남겼지만, 화이트아웃을 멈춘 것은 R119 다.

## 증상

`/warehouse` 에서 입고 대기 탭에서 창고 보관 탭으로 넘어가면 표가 비고 흰 여백만 보인다. 잠시 뒤 나타나는 경우도 있다.
F5 직후 첫 방문은 정상이다. 탭을 한 바퀴 돌고 돌아오면 재현된다.

## 원인

이 그리드는 스크롤 위치를 두 곳에 따로 들고 있다.

- 상태: `viewports[탭] = { top, height }` 로 탭별
- DOM: 스크롤 컨테이너의 `scrollTop`. 1062행 div 에 `key` 가 없어 세 탭이 같은 노드를 재사용한다

탭이 바뀌면 이 둘이 어긋난다.

1. 창고 보관 탭을 열면 950행 effect 가 목록 맨 아래로 스크롤한다. `viewports["WAREHOUSE"].top` 이 큰 값이 된다.
2. 입고 대기로 가면 같은 노드의 내용이 짧아져 브라우저가 `scrollTop` 을 작은 값으로 깎는다. 이때 `onScroll`(1063행)이 돌지만 현재 `gridId` 인 `"READY"` 칸에만 기록한다. `"WAREHOUSE"` 칸은 큰 값 그대로 남는다.
3. 다시 창고 보관을 누르면 상태는 맨 아래, 실제 스크롤은 위쪽이다. 행 40개는 `topPad`(1098행 빈 `<tr>`) 아래쪽에 그려지고, 사용자가 보는 자리에는 그 빈 여백만 잡힌다. 이것이 흰 화면이다.
4. 950행의 `requestAnimationFrame` 이 페인트 뒤에 돌아 스크롤을 맨 아래로 옮기면 그제서야 행이 보인다. 이 프레임이 늦거나, `visibleRows.length` 변화로 effect 가 재실행되며 취소되면 흰 화면이 남는다.

`measure`(1055행)는 높이가 바뀔 때만 `viewports` 를 갱신한다. 탭만 오갈 때는 높이가 그대로라 어긋난 값을 고쳐 주지 못한다.

F5 직후가 멀쩡한 이유는 `viewports` 가 비어 있어 기본값 `{ top: 0, height: 900 }`(1048행)을 쓰기 때문이다. 행이 맨 위에 그려지므로 어긋날 것이 없다.

## 아니었던 것. 다시 시도하지 말 것

- 데이터 양이나 정렬 비용이 아니다. `ledger` 와 `visibleRows` 는 메모이즈되어 있고 `warehouseOrderKey` 는 상수 시간이다.
- 예외로 인한 크래시가 아니다. 크래시라면 F5 직후 첫 방문도 깨져야 한다.
- 빈 `<tr>` 스페이서가 브라우저에서 무시되는 문제가 아니다. 무시된다면 스크롤 높이가 40행 분량으로 줄어 다른 증상이 난다.

## 유지할 동작

세 탭 모두 열었을 때 목록 맨 아래를 먼저 보여 준다. 창고 보관도 마찬가지다. 사용자 확정 사항이므로 바꾸지 않는다.

## 파일별 조치

| 파일 | 위치 | 조치 |
|---|---|---|
| `src/routes/Warehouse.tsx` | 1행 | `useLayoutEffect` import 추가 |
| `src/routes/Warehouse.tsx` | 401~414행 | `TabFade` 컴포넌트 삭제 |
| `src/routes/Warehouse.tsx` | 1239~1241행 | `TabFade` 래핑 제거 |
| `src/routes/Warehouse.tsx` | 614~619행 | `changeTab` 에서 대상 탭 `viewports` 초기화 |
| `src/routes/Warehouse.tsx` | 949~958행 | `useEffect` + rAF 를 `useLayoutEffect` 로 교체 |
| `src/routes/Warehouse.tsx` | 1062행 | 스크롤 div 에 `key={gridId}` 추가 |

다른 파일은 건드리지 않는다.

## 수정 후 동작

- `key={gridId}` 로 탭마다 스크롤 상자가 새로 생긴다. `scrollTop` 이 탭을 넘어 남지 않는다.
- `changeTab` 이 대상 탭의 `top` 을 0으로 초기화한다. 새 노드의 `scrollTop` 0과 처음부터 일치한다.
- `useLayoutEffect` 가 페인트 전에 맨 아래로 맞춘다. 중간 상태가 화면에 나오지 않는다.
- 만에 하나 맨 아래 이동이 실패해도 화면은 목록 맨 위를 보여 준다. 흰 여백으로 떨어지지 않는다.

알려진 절충: `visibleRows.length` 의존성을 유지하므로, 목록 중간을 보고 있을 때 팀 동기화로 건수가 바뀌면 맨 아래로 튄다. 기존 동작과 같다. 이번 범위 밖이다.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과할 것.
- `git status --short` 에 `src/routes/Warehouse.tsx` 와 이 문서 외의 변경이 없을 것.

## 하지 말 것

- **931행 `useEffect` 의 의존성 배열을 건드리지 마라.** 지금 배열이 없는 것은 맞지 않지만, `[]` 를 넣으면 `rangeRect` 와 `copyRange` 가 첫 렌더 값으로 굳어 Ctrl+C 범위 복사가 깨진다. 별건으로 다룬다.
- `actionCell`(895행)의 아이콘 버튼 4개를 건드리지 마라. 렌더 비용은 이번 범위가 아니다.
- `ROW_HEIGHT`, `ROW_OVERSCAN`, `topPad`, `bottomPad` 계산식을 바꾸지 마라.
- 가상 스크롤을 외부 라이브러리로 교체하지 마라.
- `onScroll` 과 `measure` 의 기존 갱신 조건을 바꾸지 마라.
