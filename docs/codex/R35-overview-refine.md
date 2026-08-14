# R35 — DEVELOPMENT Overview 다듬기 (그라데이션 제거 · 모션 저속화 · 담당자 카드 그래프 교체 · 순서/캘린더 보완)

대상 화면: `/development` = `src/routes/Development.tsx`의 **`DevelopmentOverview`** (그리고 그 안에서만 쓰는 `RadialKpi`).
직전 R-리디자인(히어로 4타일·담당자 2열 카드·Categories 액센트)이 이미 반영돼 있다. 이번엔 그 위에 사용자 피드백 6건을 반영한다.

> **범위 원칙**: 변경은 `DevelopmentOverview`와 이 화면 전용 컴포넌트에 한정한다. 전역 `--chart-*`, `--gradient-*` 토큰, `NumberTicker`·`Reveal`·`Tilt3D` 공용 컴포넌트의 내부 구현, 다른 라우트는 **건드리지 않는다**. `RadialKpi`는 이 화면에서만 쓰이므로 수정 허용.

---

## Task 1 — 최상단 히어로 4타일: 그라데이션 전부 제거

`AccentKpiTile`(Development.tsx 내부 컴포넌트)에서 **그라데이션 3종을 모두 삭제**하고 평면(flat)으로 바꾼다.

- 상단 컬러 라인 `linear-gradient(90deg, from, to)` (`<span ... top-0 h-[3px]>`) → **삭제**.
- 카드 배경 소프트 워시 `radial-gradient(... a.soft ...)` (`<span ... absolute inset-0 ...>`) → **삭제**.
- 아이콘칩 `background: linear-gradient(135deg, from, to)` + `boxShadow` → **평면으로 교체**: 배경 `var(--muted)`, 아이콘 색 `var(--foreground)`, box-shadow 없음. (직전 리디자인 이전의 기본 아이콘칩과 동일한 톤: `bg-[var(--muted)] text-[var(--foreground)]`.)
- **유지**: 카드 자체의 hover-lift·Tilt3D 미세 모션, 레이아웃, 숫자/라벨/뱃지/풋노트. 즉 "색 그라데이션"만 걷어내고 구조·모션은 그대로.
- 결과적으로 `AccentKpiTile`의 `accent` prop이 시각에 영향 없게 되면, prop은 남겨두되(호출부 변경 최소화) 미사용 그라데이션 관련 style만 제거한다. `ACCENT` 상수 자체는 담당자 카드/카테고리에서 계속 쓰므로 삭제 금지.

---

## Task 2 — 이 화면 전체 게이지/바 모션: 약 2배 느리게 + 부드러운 가속·감속(ease-in-out)

현재 이 화면의 진행 바·원형 게이지·카운트업은 대략 700~900ms, `ease-out`이다. 이를 **약 2배(≈1500~1800ms)** 로 늘리고 **easeInOutCubic**(부드러운 가속→감속)으로 바꾼다.

### 2-1. 공용 상수 도입 (Development.tsx 상단, 이 파일 안에서만)
```ts
// 이 화면 전용 게이지 모션 표준
const GAUGE_MS = 1500
const EASE_INOUT = "cubic-bezier(0.65, 0, 0.35, 1)" // easeInOutCubic
const GAUGE_BAR = `duration-[1500ms] [transition-timing-function:cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none`
function easeInOutCubic(p: number) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2 }
```

### 2-2. CSS 트랜지션 바 전부 교체
이 화면 안의 진행 바에서 `transition-[width] duration-700 ease-out motion-reduce:transition-none` (및 유사 `duration-700 ease-out`)을 **`transition-[width] ${GAUGE_BAR}`** 로 교체한다. 대상 예:
- 히어로 2번 타일 GD/국내 스택바, `TeamProcessBar` 세그먼트
- `AnimatedBar`, `AccentGradientBar`
- 담당자 카드의 워크로드/GD·국내 바 → (Task 4에서 대체되지만 남는 바가 있으면 동일 규칙)
- `ProcessSegment`·`ProcessStatus`의 세그먼트 트랜지션(`transition-[width,filter,box-shadow] duration-700 ...`)의 duration/easing도 동일 기준으로.

### 2-3. `useAnimatedPercent`
현재 rAF 1프레임 뒤 target으로 점프 → 실제 이징은 CSS가 담당. 2-2로 CSS만 바꾸면 이 훅은 그대로 둬도 된다(구현 변경 불필요). 단 CSS 교체를 빠짐없이 적용할 것.

### 2-4. 카운트업 숫자(NumberTicker) — prop만 조정
공용 `NumberTicker` 내부는 **수정 금지**. 이 화면에서 호출하는 곳의 `duration`만 약 2배로(예: 700 → 1500) 올려 게이지와 호흡을 맞춘다. `suffix`/`decimals` 등은 유지.

---

## Task 3 — 4공정 KPI(`RadialKpi`): 퍼센트 숫자를 게이지와 함께 상승 + 그림자 삭제 + 저속 이징

`src/components/charts/RadialKpi.tsx`:
- **그림자 삭제**: 진행 arc `<circle>`의 `style={{ filter: 'drop-shadow(...)' }}` 를 **제거**한다(직전에 추가된 glow). 그라데이션 스트로크(`url(#gradient)`)는 **유지**해도 되나, 그림자만 확실히 제거.
- **동기화**: arc 채움과 **중앙 % 숫자**와 **done/total 카운트**가 **하나의 이징 진행값으로 함께** 오르도록 한다.
  - `useAnimatedValue`의 지속시간을 약 2배(≈1800ms)로 늘리고 이징을 **easeInOutCubic**으로 교체(현재 `1 - pow(1-p,3)` 이므로 `easeInOutCubic(p)`로).
  - 중앙 % 텍스트: 기존 `<NumberTicker value={pct} duration={900} decimals={1} suffix="%" />` 를 **animatedPct 기반 표시로 교체**하여 arc와 완전히 같은 값·타이밍으로 오르게 한다. (예: `{animatedPct.toFixed(1)}%` — 단, 접근성 라벨의 최종값은 실제 `pct` 유지.)
  - done/total 카운트도 진행값에 비례해 오르게: `Math.round(done * progress)` 형태로 함께 상승(최종값은 정확히 done/total). total도 동일 진행 비율로. reduce-motion이면 즉시 최종값.
  - 즉 하나의 rAF 루프(progress 0→1, easeInOutCubic)에서 arc dashoffset·중앙 %·done·total을 **모두 같은 progress로 렌더**한다. NumberTicker 중복 사용을 제거해 타이밍 어긋남을 없앤다.
- 게이지 크기·라벨·"공정 도달 기준" 캡션·`TONE_GRADIENT`는 유지.

---

## Task 4 — 담당자별 현황: 컬러 바 2줄 → 다른 형태의 그래프 1개로 교체(라인 클러터 감소)

`OwnerCard`에서 현재 담당자마다 **① 워크로드 바(팀 내 물량 비중)** + **② GD/국내 컬러 스택바** 2줄이 색이 많아 복잡하다. 이 **두 바를 제거**하고, **월별 샘플 접수 건수 라인 그래프 1개**로 대체한다(홈의 라인 그래프 톤과 동일 계열, 단색·미니멀).

- **데이터**: `src/data/derive.ts`에 담당자별 월별 시계열 헬퍼를 신설한다.
  - 예: `export function ownerMonthlyTrend(records: readonly DevRecord[], months = 6): Record<string, { month: string; count: number }[]>` — 담당자(`record.owner`)별로 최근 `months`개월의 월별 접수 건수. 월 산정 기준은 **기존 `monthlyDevelopmentTrend`가 쓰는 날짜 기준과 동일한 규칙**을 재사용(Received/Request 우선순위·`XLSX.SSF` 파싱 하루밀림 방지 규칙 준수). MEMBERS 로스터 순서를 따르되, 반환은 이름 키 맵으로.
  - `DevelopmentOverview`에서 `active`(진행중)만이 아니라 **전체 `records` 기준 월별 추이**가 더 의미 있으면 그쪽을 쓴다(판단은 Codex, 단 근거를 result에 적을 것). 데이터가 비면 빈 배열 → 카드에선 "데이터 없음" 처리.
- **차트**: 홈의 라인 차트(`RddaTrendChart`)·`Sparkline`을 참고해 **작은 라인/에어리어 미니차트**로 구현. 단색(예: 담당자 액센트 `ACCENT[...].fg` 1색 또는 `--chart-2`), dot 없음, 부드러운 `type="monotone"`, 높이 ≈ 48~64px, 반응형 `ResponsiveContainer`. recharts 사용(이미 의존성 있음). 애니메이션은 Task 2 기준(저속·easeInOutCubic)과 이질감 없게(정적이어도 무방하나, 살리면 부드럽게).
- **GD/국내 수치는 유지**: 컬러 바만 없애고, GD·국내 건수는 헤더 근처에 **작은 무채색 텍스트**(예: `GD 9 · 국내 2`, 점 마커 없이 muted)로 남겨 정보 손실을 막는다.
- **PROCESS STATUS는 그대로 유지**(스택바 + 4범례). 이번 교체 대상 아님.
- 카드 세로 리듬: 헤더(아바타·이름·역할·총건수·GD/국내 텍스트) → 월별 라인 미니차트 → PROCESS STATUS 순. 담당자 식별 아바타는 유지하되, 아바타 배경 그라데이션은 과하면 완화 가능(필수 아님).

> 참고: 아바타/카테고리에서 쓰는 `ACCENT` 팔레트는 존치. "라인이 너무 많다"는 피드백의 핵심은 **가로 컬러 바의 남발**이므로, 바 색을 줄이고 미니 라인차트 1개로 정리하는 게 목표.

---

## Task 5 — 섹션 순서 변경: Categories를 4공정 KPI 바로 아래로

`DevelopmentOverview`의 섹션 순서를 다음으로 재배치한다:
1. 히어로 4타일
2. **4공정 KPI**
3. **Categories**  ← (기존엔 담당자별 아래) 여기로 이동
4. **담당자별 현황**
5. 완료 캘린더
6. 전체 완료 샘플

JSX 블록 위치만 옮기며 내용/props는 유지. `revealDelay` 등 애니메이션 순서 자연스럽게.

---

## Task 6 — 완료 캘린더: 각 완료 샘플 칩에 담당자 표기 추가

완료 캘린더(달력) 셀의 각 샘플 칩(현재: 출처 점 + `styleNo`/`flNo` + 출처 라벨)에 **담당자(`item.owner`)를 추가로 노출**한다.

- `item.owner`는 이미 `CompletedLibraryItem`에 존재.
- 칩이 좁으므로: 스타일No는 굵게 유지하고, 그 아래(또는 옆)에 **담당자 이름을 작은 muted 텍스트**로 표기(예: 2줄 칩 — 1행 styleNo, 2행 `담당 · {owner}`). 출처 점 색은 유지. 폭이 부족하면 우측 출처 텍스트 라벨을 담당자로 대체하고 출처는 점/aria로만 표기해도 됨(판단 Codex).
- 빈 담당자면 "미지정".
- 우측 "전체 완료 샘플" 테이블엔 이미 담당 컬럼이 있으므로 그대로 둔다(캘린더만 보완).

---

## 검증 · 금지사항

- `npm run build`(= `tsc --noEmit && vite build`) **무오류** 필수. 콘솔 에러 0.
- 전역 토큰(`--chart-*`, `--gradient-*`, `--radius` 등)·다른 라우트·공용 `NumberTicker`/`Reveal`/`Tilt3D` 내부 **수정 금지**.
- 데이터 파이프라인(store·derive 기존 함수 시그니처) 변경 금지. Task 4의 `ownerMonthlyTrend`는 **신규 추가만**(기존 함수 수정 금지).
- 실데이터·캐시 내용을 로그/커밋에 남기지 말 것. **git 커밋·푸시 금지**(사용자가 나중에 일괄 푸시).
- 접근성: 기존 `role="img"`/`aria-label` 유지·보완. reduce-motion에서 즉시 최종값.
- 결과 요약을 `.codex-runs/R35-last.txt`에 남기고, 변경 파일 목록·판단 근거(특히 Task 4 데이터 기준)를 간단히 기록.
