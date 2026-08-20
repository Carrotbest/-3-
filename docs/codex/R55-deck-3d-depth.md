# R55 — 자료 덱 3D 입체감 강화 + 메인 덱 간격 축소

대상(쓰기): `src/components/cards/MaterialDeck.tsx`(TS·STUDY 덱), `src/components/cards/CoverflowGallery.tsx`(HOME 덱).
무변경: `TS.tsx`·`Study.tsx`·`Home.tsx`, export명·props.

## 선행 사실 (이미 수정됨 — 건드리지 말 것)
자동 넘김이 동작하지 않던 **근본 원인은 이미 고쳤다.** `MaterialDeck.tsx`의 rAF 루프에서
```ts
const hitBoundary = dt > 0 && posRef.current === previousPos && Math.abs(...) > STOP_VELOCITY
```
`dt > 0` 가드가 없어서, 첫 프레임(dt=0 → 위치 불변)을 "경계 도달"로 오판해 루프가 즉시 종료됐다. 이 수정은 검증 완료(오른쪽 0→8, 왼쪽 8→0, 중앙 정지). **이 가드를 제거하거나 되돌리지 말 것.**

## 배경 (사용자 피드백)
1. **HOME 덱 2개**: 크기는 적절하나 **사이드 카드가 입체적으로 보이지 않는다** → 최대한 3D로.
2. **메인 화면(TS·STUDY) 덱**: **너무 와이드하게 퍼져 있다** → 조금 모으고, 마찬가지로 입체적으로.

---

## Task 1 — 3D 입체감 강화 (양쪽 덱 공통)
현재 카드 변환은 `translateX(...) scale(...) rotateY(...)` 뿐이라 평면적으로 보인다. **원근(depth)을 실제로 부여**한다.

- **무대(stage)**: `perspective`를 **1200px → 820px**로 줄여 원근을 강하게. `perspective-origin: 50% 45%`. 무대에 **`transform-style: preserve-3d`** 추가(필수 — 없으면 translateZ가 무시된다). `overflow:hidden`이 3D를 잘라 평면처럼 보이게 하므로, 잘림이 필요하면 안쪽 래퍼에만 적용하고 3D 무대에는 걸지 말 것.
- **카드 변환 순서 고정**: `translateX(...) translateZ(...) rotateY(...) scale(...)` — translateZ가 rotateY 앞에 와야 깊이가 자연스럽다. 카드에도 `transform-style: preserve-3d`, `backface-visibility: hidden`.
- **거리 `k`(중앙 기준 연속 오프셋)별 값**:
  - `rotateY = -sign(k) * min(|k|, 3) * 42deg` (중앙 0°, 바깥 최대 ±42°) — 기존보다 확실히 크게.
  - `translateZ = -min(|k|, 3) * 90px` (중앙 0, 바깥으로 갈수록 뒤로 밀림) ← **입체감의 핵심**.
  - `scale = 1 - min(|k|, 3) * 0.10` (translateZ가 이미 축소 효과를 주므로 scale 감쇠는 완화).
  - `opacity`: 중앙 1, 그 외 **0.6 유지**(사용자 요구), 표시 범위 밖은 0으로 페이드.
  - `z-index`: 중앙 최상단, 거리순 하강(기존 유지).
- **그림자로 깊이 보강**: 중앙 카드는 진한 그림자, 사이드 카드는 옅게. 사이드 카드에 아주 옅은 어둠 오버레이(예 `rgba(0,0,0,0.06)`)를 얹어 뒤로 물러난 느낌을 줘도 좋다(과하지 않게).

## Task 2 — 메인(TS·STUDY) 덱: 간격 축소
현재 좌우로 과하게 퍼져 있다. **카드를 중앙으로 모은다.**
- X 간격(`CARD_PITCH` 등)을 줄여 인접 카드가 **더 많이 겹치도록** 한다(현재 대비 약 **60~70% 수준**).
- 표시 장수 **7장 유지**. 겹침이 늘어도 각 카드의 제목이 보일 정도는 유지.
- 무대 폭을 억지로 꽉 채우려 하지 말 것 — 중앙 집중형 코버플로우가 되도록.
- 카드 폭은 현재 유지하거나 소폭만 조정.

## Task 3 — HOME 덱: 크기 유지, 3D만 강화
- `CoverflowGallery`의 **카드 크기·무대 높이는 현재 값 유지**(사용자: 크기는 적절).
- Task 1의 3D 파라미터만 적용하되, 5장 기준이라 각도·translateZ를 소폭 축소해도 무방(예 `rotateY` 최대 ±38deg, `translateZ` 단계 -80px).
- HOME은 좁은 레일이므로 겹침이 과해 카드가 안 보이지 않도록 확인.

## 금지사항
- 새 npm 패키지 금지. `dt > 0` 가드 제거 금지. `setInterval` 한 칸 이동 부활 금지.
- 표시 장수(TS·STUDY 7 / HOME 5) 변경 금지. 사이드 카드 불투명도 0.6 유지(내용이 보여야 함).
- 배경 그라데이션·중앙 넘버링 부활 금지(R53에서 삭제됨).
- `TS.tsx`·`Study.tsx`·`Home.tsx` 및 export 시그니처 변경 금지. `prefers-reduced-motion` 대응 유지. 커밋 금지.

## 검증(구현 후 자기점검)
1. `tsc --noEmit && vite build` 통과.
2. `#/study`: 사이드 카드가 **눈에 띄게 기울고 뒤로 물러나 보인다**(평면 나열 아님). 카드가 중앙으로 모여 있고 과하게 퍼지지 않는다.
3. `#/`(HOME): 덱 2개의 크기는 그대로이면서 사이드 카드가 입체적으로 보인다.
4. 마우스를 무대 좌/우에 두면 **연속 자동 넘김이 정상 동작**한다(회귀 없음). 중앙에서 정지.
5. 사이드 카드 내용(제목·요약·날짜)이 0.6 불투명도로 보인다.
