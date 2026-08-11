# 작업지시 R26 — 자료 덱 비주얼 고도화 (검정 무대 · 정사각 코버플로우 · 컬러 그라데이션)

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상: `src/components/cards/MaterialDeck.tsx` (Work report의 TS·STUDY 덱, /ts·/study 상단 덱에서 공용)
참고: `src/components/cards/CoverflowGallery.tsx` (Trend issue) — 동일 언어로 맞춰 함께 개선

## 사용자 요구 (스크린샷 기반)

현재 덱이 밋밋하다. 다음을 반영한다.
1. **동적 움직임을 훨씬 부드럽고 스무스하게** — 스프링 감의 easing, 더 긴 전환, 비활성 카드에 깊이감.
2. **카드별 컬러를 다르게 + 그라데이션** — 카드마다 다른 색의 그라데이션.
3. **배경을 검정으로** — 덱 무대(stage)를 어둡게 해 카드가 떠 보이는 입체 효과.
4. **정사각형 카드** — 지금은 가로로 긴 직사각형(`h-64 w-[76%]`). 정사각으로 줄여 **좌/우 카드가 어느 정도 보이게**(coverflow peek).

## 절대 건드리지 말 것

- 덱의 **동작 로직**(휠 가로채기 양끝 해제, 드래그, 화살표, 키보드, `useDeckControls`)은 유지. 시각만 바꾼다.
- `tsMaterials`/`studyMaterials`/`materialsOf` 등 데이터는 건드리지 않는다.
- HOME 상단(KPI·RDDA), DEVELOPMENT 회귀 금지.
- git commit / reset / checkout 금지. 실제 데이터 값 로그 금지.

## 구현 상세

### 1) 검정 무대(stage)

- 덱 카드가 놓이는 컨테이너(현재 `relative min-h-72 overflow-hidden [perspective:70rem]`)를 **항상 어두운 무대**로 만든다(앱 라이트/다크 테마와 무관하게 고정 — 쇼케이스 성격).
  - 배경: 근사 검정 `#0b0b0f` ~ `#111114` 계열. 살짝 위→아래 어두운 그라데이션 허용.
  - `rounded-[16px]`, 상하 여백을 넉넉히(카드가 회전·확대돼도 안 잘리게 `overflow-hidden` 유지하되 높이 확보).
  - **깊이 글로우**: 무대 중앙 뒤에 활성 카드 색을 흐리게 깐 radial glow(absolute, blur-3xl, opacity 0.25~0.4). 활성 인덱스가 바뀌면 색도 부드럽게 전환.
  - `perspective`를 `1100~1300px`로 키워 회전 입체감 강화.

### 2) 정사각 카드 + coverflow peek

- 카드 크기: **정사각**. `aspect-square`에 폭 `clamp(190px, 44%, 260px)` 정도. `left-1/2` 기준 배치는 유지.
- **좌/우 이웃이 보이도록** `deckPosition(offset)`을 다시 잡는다(값은 목표치, 미세조정 가능):
  | offset | 위치/스케일/회전 | opacity | z | filter |
  |---|---|---|---|---|
  | 0 (활성) | `translateX(-50%) scale(1) rotateY(0)` | 1 | 30 | none |
  | ±1 | 중심에서 ±0.62 카드폭 이동 · `scale(.82)` · `rotateY(∓24deg)` | .92 | 20 | 없음 |
  | ±2 | 중심에서 ±1.08 카드폭 이동 · `scale(.66)` · `rotateY(∓30deg)` | .5 | 10 | `blur(1px)` |
  | \|offset\|>2 | 렌더 안 함 | — | — | — |
  - 오른쪽 이웃은 오른쪽으로, 왼쪽 이웃은 왼쪽으로 나오게(부호 주의). 목표: **이웃 카드 약 40~50%가 무대 안에 보임.**
  - 활성 카드에 약한 부유감: 정지 시 `translateY`로 아주 미세하게 떠 있는 느낌(선택).

### 3) 카드별 컬러 그라데이션

- 6색 그라데이션 팔레트를 상수로 정의하고 **카드 인덱스 기준**으로 배정(결정적, `Math.random` 금지).
  - 예(자유 조정): 인디고`#6366f1→#8b5cf6`, 시안`#0ea5e9→#22d3ee`, 앰버·로즈`#f59e0b→#f43f5e`, 에메랄드`#10b981→#34d399`, 바이올렛·핑크`#8b5cf6→#ec4899`, 오렌지`#fb923c→#f43f5e`.
  - 적용: 카드 배경 `linear-gradient(145deg, c1, c2)`. 살짝 어두운 오버레이/비네트로 하단 텍스트 가독 확보(예: 하단에 `linear-gradient(transparent, rgba(0,0,0,.28))`).
  - 활성 카드 그림자를 **그 카드 색으로 글로우**(`box-shadow: 0 1.5rem 3rem -0.5rem <color>66`). 비활성은 은은하게.
- **텍스트는 밝게 고정**: 이 무대의 카드 위 글자는 앱 테마와 무관하게 흰색 계열이어야 한다.
  - `MaterialCardBody`가 `var(--foreground)`/`var(--muted-foreground)`를 쓰므로, 덱 카드에는 **밝은 텍스트 변형**을 적용한다: 제목 `rgba(255,255,255,.96)`, 요약/메타 `rgba(255,255,255,.7)`.
  - 아이콘 칩·배지도 카드 위에서 보이게 반투명 흰색(`bg-white/15`, 텍스트 흰색) 처리. `SourceBadge`도 무대 위에선 밝은 변형.
  - 태그 Badge도 `bg-white/15 text-white` 계열로.
  - 구현 팁: `MaterialCardBody`에 `tone?: "surface" | "onColor"` prop을 추가해 색상 클래스만 분기. 상세 시트(`MaterialDetailSheet`)는 기존 `surface` 유지.

### 4) 스무스한 모션

- 전환: `transition-[transform,opacity,filter] duration-[560ms]` + `[transition-timing-function:cubic-bezier(.22,1,.36,1)]`(ease-out-quint 느낌). 현재 `duration-300`은 너무 딱딱하다.
- 무대 글로우 색 전환도 `transition-colors duration-500`.
- `prefers-reduced-motion`: 회전·블러·부유 제거, 활성 카드만 정적 표시(기존 정책 유지).

### 5) 컨트롤·카운터

- 하단 화살표·`03 / 06` 카운터는 유지하되 어두운 무대에 맞춰 밝은 색으로. 카운터 글자 흰색 계열.
- 카운터·화살표를 무대 안 하단에 겹쳐 배치할지, 무대 밑에 둘지는 자유. 지금처럼 밑에 둬도 됨(단 색만 조정).

### 6) CoverflowGallery 도 동일 언어로

- Trend issue의 `CoverflowGallery`도 같은 검정 무대·정사각·컬러 그라데이션·스무스 모션으로 맞춘다(코드 공유가 쉬우면 팔레트/무대 스타일을 공용 상수/컴포넌트로 뽑아도 좋다).
- 단, CoverflowGallery의 3건 미만 그리드 폴백·0건 데모 동작은 유지.

## 검증

- `npm run build` 통과.
- 라이트·다크 테마 **양쪽에서** 무대가 검정이고 카드 텍스트가 흰색으로 잘 보이는지.
- 좌/우 이웃 카드가 실제로 40~50% 보이는지(정사각 확인).
- 화살표/휠/드래그로 넘길 때 부드러운지, 양끝에서 페이지 스크롤이 풀리는지(기존 동작 유지).
- 카드마다 색이 다른지, 활성 카드 색 글로우가 무대에 반영되는지.
- 접근성: 활성 카드만 탭 가능, `aria-live` 카운터 유지.
- HOME 상단·DEVELOPMENT 회귀 없음, 콘솔 에러 없음.

## 완료 후 보고

- 무대/카드/모션에 적용한 실제 값
- 밝은 텍스트 변형을 어떻게 분기했는지
- CoverflowGallery에도 반영했는지
