# R49 — TS·STUDY 자료 덱을 circular-carousel 스타일로 개편 (화이트 테마 · 마우스 위치 자동 넘김)

대상(쓰기): `src/components/cards/MaterialDeck.tsx`(덱 부분만: `useCoverflowMotion` 훅 + 덱 카드 렌더).
읽기전용/무변경: `src/routes/TS.tsx`·`src/routes/Study.tsx`·`src/routes/Home.tsx`(호출부 그대로), `MaterialDeckSection` **시그니처·export명 유지**, `MATERIAL_CARD_PALETTES`(액센트로 재사용).

## 배경
현재 TS/STUDY 자료 덱(`MaterialDeckSection` → 내부 coverflow 훅 `useCoverflowMotion`)은 컬러 그라데이션 카드가 3D coverflow로 배치되고, **휠·드래그·화살표**로 넘긴다. 사용자가 첨부한 circular-carousel 레퍼런스처럼 바꾼다:
- 원형 궤도 배치 + 중앙 큰 인덱스 번호(예 `03` / `of 06`) + **dot indicator**.
- **화이트/라이트 테마** 카드(현재 다크 컬러 카드 → 흰 카드 + 팔레트는 액센트로만).
- **넘기는 방식 교체**: 휠·드래그 제거 → **마우스 위치 기반 자동 넘김**(카드 무대에서 마우스가 가운데보다 **왼쪽이면 이전 방향, 오른쪽이면 다음 방향으로 자동 진행**).

**framer-motion 등 새 패키지 도입 금지** — 기존 CSS transform/transition(현재 `cardTransform`)으로 재현한다. `MaterialDeckSection` props와 TS/Study/Home 호출은 건드리지 않는다.

## Task 1 — 넘기는 방식: 마우스 위치 기반 자동 넘김
`useCoverflowMotion`에서 **휠 핸들러(`onWheel`)와 포인터 드래그(onPointerDown/Move/Up 드래그 로직)를 제거**하고, 다음으로 대체한다.
- 카드 무대(덱 트랙 컨테이너)에 `onPointerMove`로 커서의 **상대 X**(`(clientX - rect.left) / rect.width`, 0~1)를 추적한다.
- 존 판정: `x < 0.40` = **왼쪽 존(prev 방향)**, `x > 0.60` = **오른쪽 존(next 방향)**, `0.40~0.60` = **중앙 dead zone(정지)**.
- 존에 있으면 `setInterval`로 그 방향으로 한 칸씩 자동 이동(`move(-1)`/`move(1)`). dead zone·`onPointerLeave`·`onBlur` 시 정지(interval clear).
- **속도**: 기본 간격 900ms. 가장자리에 가까울수록 빠르게(선택): 예 `x<0.15`나 `x>0.85`이면 ≈450ms. 위치→간격을 선형 보간해도 좋다.
- 경계: 처음/끝에서는 그 방향 정지(현재처럼 clamp, 순환 안 함). 화살표 disabled 로직 유지.
- **접근성/모션**: 자동 넘김은 마우스 전용. 키보드 포커스 시(`onFocus`)·`prefers-reduced-motion: reduce`에서는 **자동 넘김 비활성**, 아래 수동 컨트롤(화살표·dot)로만 이동. 마우스가 무대 밖이면 항상 정지.
- 카드 클릭(`onClick`)은 그대로 `onOpen(item)` 동작 유지(드래그 판정 `wasDragged`는 이제 불필요하니 정리).

## Task 2 — 화이트/라이트 테마 카드
현재 카드 클래스(`border-white/20`, `palette.background`, `text-white`, 어두운 무대 그라데이션)를 라이트로 교체:
- 카드 배경 = `var(--card)`, 테두리 = `var(--border)`, 제목 = `var(--foreground)`, 요약/날짜 = `var(--muted-foreground)`. 그림자로 부양감(활성 카드 진한 그림자, 비활성 옅게).
- **팔레트(`MATERIAL_CARD_PALETTES`)는 액센트로만**: 카드 상단 얇은 컬러 바(`linear-gradient(90deg, from, to)`) 또는 태그 배지·좌상단 아이콘 배경·활성 카드 외곽 글로우 정도. 카드 본문은 흰색 유지.
- 무대(트랙) 배경: 어두운 무대 제거, 투명/흰색. 중앙 배경 글로우는 활성 팔레트의 **아주 옅은** radial(`...12%`)로만.
- 중앙 인덱스 오버레이(현재 `active+1 / length`)는 유지하되 **레퍼런스처럼 크게**: 큰 숫자(예 `text-5xl`, `var(--muted-foreground)` 또는 활성 팔레트색 옅게) + 하단 `of 06` 작은 라벨. 카드 뒤(z-index 낮게), `pointer-events-none`.

## Task 3 — 원형 배치 + dot indicator
- 카드 배치(`cardTransform`)는 현재 coverflow를 유지하되 라이트 테마에 맞게(그림자·불투명도) 다듬는다. 거리별 scale/opacity/z-index로 가운데 활성 카드가 크게, 양옆이 작아지는 부채꼴이면 충분(레퍼런스의 sin/cos 원호를 새로 구현할 필요는 없음 — 기존 것으로 근사).
- 하단 컨트롤: 기존 화살표(이전/다음) 유지 + **dot indicator 추가**(카드 수만큼 점, 활성 점 강조/확장, 클릭 시 `goTo(i)`). 기존 슬라이더 바는 dot으로 대체하거나 병기.
- 접근성: dot은 `role="tab"`/`aria-selected`, 화살표 `aria-label` 유지. 무대 `role="region" aria-roledescription="carousel"`.

## 금지사항
- **새 npm 패키지 금지**(framer-motion 등). 기존 CSS transform/transition·lucide 아이콘만.
- `MaterialDeckSection`·`MaterialSearchSection` export명·props 시그니처 변경 금지. `TS.tsx`·`Study.tsx`·`Home.tsx` 변경 금지.
- `MaterialItem` 스키마·데이터 로직 변경 금지(표현만). `prefers-reduced-motion` 미대응 금지. 커밋 금지.

## 검증(구현 후 자기점검)
1. `tsc --noEmit && vite build` 통과.
2. `#/ts`·`#/study`: 자료 덱이 **흰 카드**로 원형 배치, 중앙 큰 인덱스 번호(NN / of 06), 하단 dot indicator.
3. 카드 무대에서 마우스를 **왼쪽에 두면 이전 방향, 오른쪽에 두면 다음 방향으로 자동**으로 넘어가고, 가운데(±dead zone)·무대 밖에서는 멈춘다. 휠은 더 이상 덱을 넘기지 않는다.
4. 화살표·dot로 수동 이동 가능. 카드 클릭 시 상세 열림(`onOpen`).
5. `prefers-reduced-motion` 시 자동 넘김 비활성(수동만). 라이트/다크 모두 카드 대비 확보. Home의 자료 관련 화면 정상.
