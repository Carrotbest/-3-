# 작업지시 R7 — 공용 동적 툴킷 + 전 화면 적용 (모더레이트 강도)

전제: `docs/REACT_REBUILD.md` + `docs/reference/design-inspiration.md`. 8개 화면 동작 중.
검증 `npx tsc --noEmit` + `npm run build`. 강도는 **모더레이트**: 세련·절제. 네온·과한 3D·배경 남발 금지.

## 1. 공용 동적 부품 (src/components/motion/) — 새로 만든다

- **`NumberTicker.tsx`** — 숫자 카운트업. props `{ value:number, duration?, decimals?, suffix? }`.
  마운트/값 변경 시 0(또는 이전값)→value 로 부드럽게. `prefers-reduced-motion` 이면 즉시 최종값.
  requestAnimationFrame 사용. `tabular-nums`.
- **`Reveal.tsx`** — 스크롤 진입 페이드+살짝 상승. IntersectionObserver, 한 번만 트리거. 감속 이징.
  reduced-motion 이면 애니메이션 없이 바로 보이게. `<Reveal delay={n}>children</Reveal>`.
- **호버 상승 유틸**: 카드에 붙일 tailwind 클래스 조합을 `src/lib/motion.ts` 의 상수로 정리
  (`export const hoverLift = "transition-transform transition-shadow duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"` 수준). 토큰 그림자 사용.

## 2. Border Beam — 핵심 카드 1개에만

- 이미 있는 `src/components/ui/border-beam.tsx` 를 쓴다. 색은 하드코딩 hex 대신
  토큰(`--chart-1`/`--chart-2`)을 CSS 변수로 넘겨라(colorFrom/colorTo).
- **HOME 의 최우선 알림/대표 KPI 카드 딱 하나**에만 적용. 다른 화면·다른 카드에 남발 금지.

## 3. 전 화면 적용 (기존 로직·데이터 건드리지 말고 표시층만)

각 화면에서 **KPI/통계 숫자를 `NumberTicker` 로 교체**, 카드 그리드에 `Reveal`(순차 delay)과 `hoverLift` 적용.

- **Home.tsx**: StatCard 숫자 → NumberTicker. 카드들을 **Bento 그리드**로 재배치(크기 대비: 큰 차트 카드 + 작은 KPI + 목록).
  최우선 알림 카드 하나에 Border Beam. 섹션 진입 Reveal.
- **Development.tsx (Overview)**: 상단 요약·4공정 게이지 %·담당자 건수에 NumberTicker(게이지 채움과 동기).
  카드 Reveal + hoverLift.
- **Rdda.tsx**: KPI 4장 NumberTicker, 차트 카드 Reveal.
- **TS.tsx**: KPI·발주량 기입률 % NumberTicker, 카드 hoverLift.
- **Sync.tsx**: KPI(대조 n/5·건수·경과일) NumberTicker.
- **Study.tsx / Setting.tsx / Calendar.tsx**: 숫자 지표에 NumberTicker, 카드 hoverLift(있으면).

## 4. StatCard 공통 강화

`src/components/dashboard/StatCard.tsx` 의 값 표시를 NumberTicker 로 바꾸면 전 화면이 함께 적용된다.
증감%(deltaPct) 화살표는 그대로. 카드 자체에 hoverLift 기본 적용.

## 규칙 (엄수 — 지난 사고 재발 금지)

- **shadcn 컴포넌트 추가 시 React 18 forwardRef 확인**(REACT_REBUILD 지뢰 2번). Radix 래퍼는 forwardRef.
- 색·폰트·그림자·라운드는 **토큰만**. 임의 hex 금지(Border Beam 색도 토큰 CSS 변수로).
- MutationObserver 로 표 DOM 감시 금지.
- 집계·데이터 로직(src/data, src/store) 변경 금지. 표시층만.
- 새 npm 설치 금지(모든 동적 요소는 자체 구현 + 기존 recharts/border-beam 로). 필요하면 보고.
- reduced-motion 존중. 과하지 않게(모더레이트).
- 커밋 금지.

## 검증
`npx tsc --noEmit` + `npm run build`. 브라우저 확인은 Claude 가 한다.

## 보고
```
DONE: <파일>
MOTION: <NumberTicker/Reveal 적용한 화면들>
BUILD: <결과>
NOTES: <forwardRef 확인 여부, 판단 필요 지점>
```
