# R50 — 자료 덱 2차: 연속 스크롤 자동 넘김 · 카드 전량 표시 · 높이 축소/와이드 · 화면별 비율 분리

대상(쓰기): `src/components/cards/MaterialDeck.tsx`(핵심), `src/components/cards/CoverflowGallery.tsx`(HOME 덱 비율만).
무변경: `src/routes/TS.tsx`·`src/routes/Study.tsx`·`src/routes/Home.tsx` — 호출부 그대로. `MaterialDeckSection`·`MaterialSearchSection`·`CoverflowGallery` export명·props 유지.

## 배경
R49로 자료 덱을 circular-carousel + 마우스 위치 자동 넘김으로 바꿨다. 사용자 피드백 4가지를 반영한다.

---

## Task 1 ★핵심 — 자동 넘김을 "연속 스크롤"로 (현재 방식 폐기)
**현재(문제)**: `setInterval(() => move(±1), delay)` 로 **한 칸씩 이동(discrete)**. 카드가 한 장씩 멈췄다 가서 뚝뚝 끊긴다. 사용자가 원한 형태가 아니다.

**변경**: 인터벌 기반 `move(±1)` 호출을 **완전히 제거**하고, **rAF 기반 연속 위치 누적**으로 바꾼다.
- 상태: 이미 있는 `posRef`(연속 위치, 소수 허용)를 그대로 활용. 자동 넘김 중에는 `settle()`(스냅 애니메이션) 호출 금지.
- 새 루프: 마우스가 좌/우 존에 있는 동안 매 프레임
  ```
  posRef.current = clamp(posRef.current + velocity * dt)
  paint()
  setActive(Math.round(posRef.current))   // 인덱스 표시·dot 동기화용(값 바뀔 때만)
  ```
  - `dt` = 이전 프레임과의 경과 시간(초). `requestAnimationFrame(t)`의 타임스탬프 차이 사용, 첫 프레임·탭 복귀 시 튀지 않게 `dt`를 0.05초 상한으로 clamp.
- **속도(velocity, 단위: 카드/초)**: 커서가 중앙에서 멀수록 빠르게. 
  - `x` = 무대 내 상대 X(0~1), `d = (x - 0.5) * 2` (-1~1).
  - dead zone: `|d| < 0.12` → velocity 0(정지).
  - 그 밖: `t = (|d| - 0.12) / 0.88` (0~1), **`velocity = sign(d) * (MIN_V + (MAX_V - MIN_V) * t²)`**. 제곱으로 가장자리에서 확 빨라지게.
  - 권장 상수: `MIN_V = 1.2`(카드/초), `MAX_V = 9`(카드/초). **R49의 900ms/450ms 인터벌 상수(AUTO_SLOW_MS·AUTO_FAST_MS·AUTO_INTERVAL_STEP_MS)는 삭제.**
- **부드러움**: velocity를 급변시키지 말고 현재 속도 → 목표 속도로 **보간**(예 매 프레임 `v += (targetV - v) * 0.18`). 마우스가 멈추거나 중앙으로 오면 속도가 0으로 자연 감속.
- **정지 조건**: dead zone 진입 / `pointerleave` / 무대 밖 / 포커스 이동 / `prefers-reduced-motion`. 정지 시 velocity를 0으로 감속시킨 뒤, **가장 가까운 카드로 부드럽게 스냅**(`settle(Math.round(posRef.current))`). 즉 "계속 흐르다가 중앙으로 오면 멈추고 한 장에 정렬".
- **경계**: 처음/끝에서 `clamp`로 멈춤(순환 없음). 끝에 닿으면 velocity 0.
- 화살표·dot 클릭 등 수동 이동은 기존 `settle()` 스냅 방식 유지(자동 루프와 충돌하지 않게, 수동 조작 시 자동 루프 중단).

## Task 2 — 카드 개수 제한 해제
- `const DECK_LIMIT = 6` 및 `items.slice(0, DECK_LIMIT)` **제거** → 덱에 **전체 자료**를 올린다.
- 인덱스 표기(`NN / 총개수`)와 하단 **dot indicator가 항목 수만큼** 늘어난다. 자료가 많을 때 dot이 넘치지 않도록: dot 개수가 12개를 넘으면 dot을 **현재 위치 주변 창(예 최대 12개)만 표시**하거나, dot 대신 **얇은 진행 바**로 자동 전환한다(둘 중 택1, 레이아웃 깨짐 금지).
- `paint()`에서 화면 밖 카드는 이미 `visibility:hidden`·`pointerEvents:none` 처리 중 — 항목이 많아도 **보이는 범위(±3장 내외)만 렌더 비용**이 들도록 유지/강화한다(성능).

## Task 3 — 덱 높이 축소 + 와이드 (여백 축소, 꽉 찬 화면)
현재 `MaterialDeck`(TS/STUDY용) 크기 기준을 **세로 60~70% 수준**으로 줄이고 가로를 넓힌다.
- 무대 높이: `min-h-[27rem]` → **`min-h-[17rem]` 내외**(≈63%). 내부 절대배치 값(`top-[9.5rem] h-[17.5rem]`, 카드 `top-16`)도 **비례 재계산**해 잘림·빈틈 없게.
- 카드 크기: 활성 `h-48` → **`h-32`**, 비활성 `h-28` → **`h-20`** 내외. 카드 폭 `clamp(168px,34%,224px)` → **`clamp(190px,26%,260px)`** 처럼 **더 넓고 낮은 비율**로.
- 여백: 상단 텍스트 블록 `min-h-[8.75rem] px-5 pb-3 pt-5` → 높이·패딩 축소(예 `min-h-[6rem] px-4 pb-2 pt-3`). 좌우 패딩을 줄여 카드가 무대 폭을 더 채우게.
- 카드 간격(`CARD_PITCH = 0.66`)을 조정해 **화면 폭을 꽉 채우도록** 양옆 카드가 더 많이/넓게 보이게 한다(잘리는 건 무방, 겹침 과다는 금지).
- 결과: 덱이 **낮고 넓은 띠** 형태로, 상하 빈 공간이 눈에 띄게 줄어야 한다.

## Task 4 — HOME 덱과 메인메뉴(TS/STUDY) 덱의 비율 분리
**중요**: HOME은 `CoverflowGallery`(`src/components/cards/CoverflowGallery.tsx`), TS/STUDY는 `MaterialDeckSection`(MaterialDeck.tsx)으로 **이미 다른 컴포넌트**다. 데이터는 같아도 **보여지는 비율은 각각 최적화**한다.
- **TS/STUDY(메인메뉴)**: Task 3 기준(낮고 와이드, 페이지를 꽉 채움).
- **HOME**: 홈은 여러 섹션이 함께 있는 좁은 영역이므로 **더 컴팩트**하게. `CoverflowGallery`의 무대 높이·카드 크기를 홈 레일 폭에 맞춰 조정(예 무대 높이 `min-h-[13~15rem]`, 카드 폭 비율을 홈 컨테이너에 맞게). TS/STUDY와 **같은 수치를 그대로 쓰지 말 것**.
- 두 덱의 톤(흰 카드·팔레트 액센트·중앙 인덱스)은 일관되게 유지하되 **치수만 분리**한다.
- HOME 덱에도 Task 1의 연속 스크롤·Task 2의 전량 표시를 적용할지: **HOME은 기존 동작 유지**(홈은 좁아 자동 넘김이 방해될 수 있음). 단 Task 3의 "여백 축소" 취지에 맞게 높이만 컴팩트하게 조정한다. → **HOME은 치수만 변경, 동작 변경 없음.**

## 금지사항
- 새 npm 패키지 금지(framer-motion 등). 기존 rAF/CSS transform만.
- `TS.tsx`·`Study.tsx`·`Home.tsx` 및 export 시그니처 변경 금지.
- `MaterialItem` 스키마·데이터 로직 변경 금지(표현/모션만). `prefers-reduced-motion` 미대응 금지.
- 자동 넘김에서 `setInterval`로 한 칸씩 이동하는 방식 **재사용 금지**(반드시 rAF 연속 누적).
- 커밋 금지.

## 검증(구현 후 자기점검)
1. `tsc --noEmit && vite build` 통과.
2. `#/study`: 마우스를 무대 좌/우로 옮기면 카드가 **끊김 없이 연속으로** 흐르고, 가장자리에 가까울수록 눈에 띄게 빨라진다. 중앙으로 오면 감속 후 한 장에 스냅되어 멈춘다.
3. dot/인덱스 총 개수가 **전체 자료 수**와 같다(6개 제한 없음). dot이 많아도 레이아웃이 깨지지 않는다.
4. 덱 세로 길이가 이전의 60~70% 수준이고, 카드가 더 넓으며 상하 여백이 줄어 꽉 차 보인다.
5. HOME의 덱은 TS/STUDY보다 **더 컴팩트한 치수**로 보이고, 홈 레이아웃이 깨지지 않는다.
6. 화살표·dot 수동 이동, 카드 클릭 상세 열림 정상. `prefers-reduced-motion` 시 자동 넘김 비활성.
