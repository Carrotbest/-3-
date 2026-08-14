# R36 — DEVELOPMENT Overview: 스크롤 인뷰 모션 전환 + 담당자 그래프를 홈 RDDA 차트형(축 포함·압축)으로

대상: `/development` = `src/routes/Development.tsx`의 **`DevelopmentOverview`** 및 이 화면 전용 컴포넌트(`OwnerMonthlyChart`, `RadialKpi` 등). 참고 원본: `src/routes/Home.tsx`의 **`RddaTrendChart`**(456~488행 부근).

배경: 직전 R35까지 반영된 상태. 이번엔 사용자 피드백 2건.
1. 이 화면의 모든 모션이 **페이지 로드 시 한꺼번에** 재생된다 → **각 요소가 스크롤로 뷰포트 중앙권에 들어올 때 재생**되도록 바꾼다.
2. 담당자별 현황의 월별 라인차트에 **x/y축이 없다** → **홈 `RddaTrendChart`와 동일한 형태(축·그리드·툴팁·라인 그려짐 모션)** 로, 단 **크기는 압축**해서 카드에 맞춘다. 모션도 홈 RDDA와 동일.

> 범위 원칙: 변경은 `DevelopmentOverview`와 이 화면 전용 컴포넌트에 한정. 전역 `--chart-*`/`--gradient-*` 토큰·다른 라우트 **수정 금지**. 공용 `NumberTicker`는 **하위호환 옵트인 prop 추가만** 허용(아래 Task 1-D 참조). `Reveal`/`Tilt3D` 내부 로직 변경 금지.

---

## Task 1 — 스크롤 인뷰 트리거로 모션 전환

현재 `Reveal`(컨테이너 페이드/슬라이드)은 이미 IntersectionObserver 기반이라 문제없다. 문제는 **게이지·카운트업·바 애니메이션이 컴포넌트 마운트 시점에 즉시 실행**된다는 점(긴 페이지라 로드 시 화면 밖 요소까지 전부 소진됨). 이들을 **인뷰 진입 시 1회 재생**으로 바꾼다.

### 1-A. 공용 인뷰 훅 신설
`src/lib/useInView.ts`(신규) 로 추가:
```ts
import { useEffect, useRef, useState } from "react"
export function useInView<T extends HTMLElement = HTMLDivElement>(options?: { threshold?: number; rootMargin?: string; once?: boolean }) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setInView(true); return }
    if (!("IntersectionObserver" in window)) { setInView(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); if (options?.once ?? true) observer.disconnect() }
      else if (!(options?.once ?? true)) setInView(false)
    }, { threshold: options?.threshold ?? 0.35, rootMargin: options?.rootMargin })
    observer.observe(node)
    return () => observer.disconnect()
  }, [options?.threshold, options?.rootMargin, options?.once])
  return { ref, inView }
}
```
- 기본 threshold 0.35 = "해당 위치가 화면 중앙권에 들어왔을 때" 느낌(홈 RDDA는 0.3). 필요시 `rootMargin`으로 중앙 밴드 보정 가능.
- reduce-motion / IO 미지원이면 즉시 `inView=true`(= 최종 상태 즉시).

### 1-B. 원형 게이지 `RadialKpi`(이 화면 전용) — 인뷰 시 시작
`src/components/charts/RadialKpi.tsx`:
- 컴포넌트 최상위 `<div>`에 `useInView`의 `ref`를 달고, `useAnimatedValue`가 **inView가 true가 된 뒤에만** 0→1 진행을 시작하도록 게이트한다(현재는 마운트 즉시 시작). inView 이전엔 progress=0(빈 게이지·0.0%·0/0건) 유지.
- reduce-motion이면 즉시 최종값(기존 로직 유지).
- 각 게이지가 각자 스크롤 진입 시점에 재생된다(4개가 동시에 화면에 들어오면 함께 재생되는 건 자연스러움).

### 1-C. 진행 바류 — 인뷰 시 채움
이 화면의 폭 애니메이션 바(`useAnimatedPercent` 소비처 전부: `AnimatedBar`, `AccentGradientBar`, 히어로 GD/국내 스택바, `TeamProcessBar` 세그먼트, `ProcessSegment`/`ProcessStatus` 스택바)가 **인뷰 진입 시** 0(또는 접힌 상태)→목표폭으로 차오르게 한다.
- 권장: `useAnimatedPercent(target: number, active: boolean)` 로 시그니처를 확장해, `active`가 false면 0을 반환하고 true가 되는 순간부터 CSS 트랜지션으로 목표폭으로 이동. 각 소비 컴포넌트는 자체 `useInView` ref로 `active`를 넘긴다.
- 또는 카드/섹션 단위로 하나의 `useInView`를 두고 그 `inView`를 자식 바들에 prop으로 내려도 됨(관찰자 수 절감). 구현 방식은 Codex 재량이나, **로드 시 화면 밖 바는 채워지지 않고, 스크롤로 들어올 때 차오를 것**을 반드시 만족.
- 트랜지션 duration/easing은 R35에서 정한 `GAUGE_BAR`(1500ms, easeInOutCubic) 유지.

### 1-D. 카운트업 `NumberTicker`(공용) — 옵트인 prop 추가
공용 컴포넌트라 **하위호환 유지**하며 기능만 추가:
- prop `startOnView?: boolean`(기본 `false` → 기존 동작 불변, 타 페이지 영향 없음) 추가.
- `true`면: 자체 DOM 노드를 IntersectionObserver로 관찰(위 훅 재사용 가능), **인뷰 진입 시점부터** 0→value 카운트 시작. 인뷰 이전엔 0(또는 최소값) 표시. reduce-motion이면 즉시 최종값.
- 이 화면(`DevelopmentOverview`)의 모든 `NumberTicker` 호출부에 `startOnView`를 켠다. (히어로 4타일·담당자 총건수·접수현황·전체공정분포 등 전부.)

> 목표 UX: 홈 RDDA 차트처럼, **해당 섹션이 스크롤되어 눈에 들어오는 순간** 숫자·게이지·바·라인이 함께 살아나야 한다. 이미 본 섹션으로 다시 스크롤해도 재생 반복은 하지 않는다(once).

---

## Task 2 — 담당자별 현황 라인차트를 홈 RDDA 차트형(축 포함)·압축 사이즈로 교체

현재 `OwnerMonthlyChart`는 축 없는 미니 라인이다. 이를 **홈 `RddaTrendChart`와 동일한 형태**로 다시 만들되 담당자 카드에 맞게 **압축**한다. 담당자 데이터는 단일 시계열(`{ month, count }[]`, `ownerMonthlyTrend` 최근 6개월)이므로 홈의 다중 Bar 스택은 제외하고 **TOTAL 라인 표현을 그대로 차용**한다.

### 형태(홈과 동일 요소)
- `ResponsiveContainer` 안에 `LineChart`(또는 `ComposedChart`) 사용.
- `CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5"`.
- `XAxis dataKey="month"` — tickFormatter로 `YY.MM월`(홈과 동일: `value.slice(2,4)`.`value.slice(5)`월), `tick={{ fill: "var(--muted-foreground)", fontSize: 9~10 }}`, `axisLine={false}`, `tickLine={false}`, 라벨 겹치면 `interval`로 솎기.
- `YAxis allowDecimals={false}` 정수, `tick fontSize 9~10`, `axisLine/tickLine={false}`, 폭 좁게(`width={24~28}` 또는 margin으로 조절).
- `Tooltip` — 홈 톤의 간단 버전(월·건수). 홈 `RddaTrendTooltip`을 그대로 쓰긴 형태가 다르니, 담당자용 경량 툴팁을 만들거나 recharts 기본 툴팁에 `contentStyle`(카드색/보더/라운드)만 입혀도 됨.
- `Line type="natural" dataKey="count"` — 색은 담당자 액센트(`ACCENT[...].fg`) 또는 `--chart-2`. `strokeWidth≈1.75`, `dot={{ r: 2, ... }}`, `activeDot`, `LabelList dataKey="count" position="top" fontSize 9~10`(포인트가 많아 겹치면 생략 가능).

### 크기(압축)
- 카드 안 높이 **약 9~11rem(≈150~176px)**. 마진 축소(예: `margin={{ top: 16, right: 8, bottom: 0, left: -12 }}`). 폰트 9~10px. 카드 폭에서 반응형.

### 모션(홈 RDDA와 동일)
- **인뷰 게이트**: 홈 `RddaTrendChart`의 `started` 패턴과 동일하게, 카드/차트가 뷰포트에 들어오기 전엔 차트를 마운트하지 않다가(또는 라인 애니메이션을 시작하지 않다가) 진입 시 렌더 → **라인이 그려지는** 모션. Task 1-A의 `useInView` 재사용 권장.
- 라인 애니메이션: `isAnimationActive={!reduceMotion}`, `animationDuration≈1950`, `animationEasing="linear"`(홈과 동일 값).
- reduce-motion이면 애니메이션 없이 즉시 최종.
- 데이터 전무(모든 count 0)면 기존처럼 "데이터 없음" placeholder.

### 접근성
- 컨테이너 `role="img"` + 월별 수치를 담은 `aria-label` 유지.

---

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0. (개발 중 HMR 중간상태 에러는 무시하되, **하드 리로드 후** 콘솔 클린 확인.)
- 전역 토큰·다른 라우트 수정 금지. `NumberTicker`는 **옵트인 prop 추가만**(기본 동작·타 호출부 불변). `Reveal`/`Tilt3D` 내부 변경 금지. `ownerMonthlyTrend` 등 기존 derive 시그니처 변경 금지.
- git 커밋·푸시 금지(사용자 일괄 푸시). 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R36-last.txt`에 남기고, 변경 파일·인뷰 게이트 적용 지점·NumberTicker prop 확산 범위를 기록.
