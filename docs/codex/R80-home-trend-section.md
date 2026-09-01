# R80. HOME 정리와 TREND 전용 섹션 신설

상태: **설계 완료, 구현 미착수**. Codex가 구현한다.

R76~R79는 완료·검증 끝났다. 이 문서는 그 위에 얹는다.

`npm run build` 통과를 유지한다. 커밋과 푸시는 하지 않는다. 파일 삭제는 없다.

대상은 `src/routes/Home.tsx`와 신규 컴포넌트 파일들이다.
`TrendFabric.tsx`, `TrendMacro.tsx`, 파이썬, `public/data/trend/*.json`은 건드리지 마라.

---

# 1. HOME에서 지울 것

## 1-1. Work report 아래 두 카드

`Home.tsx` 1053~1086행 부근. `Reveal delay={150}`으로 감싼 **FABRIC ANALYSIS 분석 의뢰 보드**와
`Reveal delay={225}`로 감싼 **CALENDAR 미니 카드**를 지운다.

Work report 섹션 자체는 남는다. 첫 줄의 `TS 관리`와 `TECHNICAL REFERENCES` 덱 두 장은 그대로다.
격자가 `lg:grid-cols-2` 한 줄로 줄어든다.

지운 뒤 `Microscope`, `Plus` 같은 아이콘 import가 다른 곳에서 안 쓰이면 함께 정리한다.

## 1-2. Quick access와 팀 일정

1103~1109행의 `grid gap-6 xl:grid-cols-12` 블록 전체를 지운다.
`QuickAccessGrid` 컴포넌트 정의(146행 부근), `QUICK_ACCESS` 상수(396행 부근),
`QUICK_ACCESS_ACCENTS` 상수(135행 부근), `TeamSchedule` import까지 함께 정리한다.
다른 곳에서 안 쓰는 것만 지운다. 쓰는 곳이 있으면 남긴다.

### 기능이 사라지지 않는 것을 확인했다

- **내비게이션.** `src/components/layout/AppSidebar.tsx`와 `route-config.ts`에 전체 경로가 있다.
  Quick access는 사이드바의 중복 입구였다
- **팀 일정.** `/calendar` 라우트(`src/routes/Calendar.tsx`)가 따로 있고
  `route-config.ts:101`에 사이드바 항목도 있다. `TeamSchedule`은 HOME에서만 쓰이므로
  컴포넌트 파일 자체는 남겨 두고 HOME에서의 사용만 걷어낸다
- **FABRIC ANALYSIS.** `/fabric-analysis` 라우트와 사이드바 항목이 있다

## 1-3. 기능성 포트폴리오 탭에서 트렌드 두 개를 뺀다

`TREND_TABS`(407행)에서 `MACRO`와 `FABRIC`을 지우고 `PORTFOLIO`만 남긴다.
탭이 하나면 탭 UI가 의미 없으므로 `Tabs` 껍데기를 걷어내고
`기능성 포트폴리오` 섹션이 `PortfolioPreview`를 바로 그리게 한다.

`demoTrendCards`(931행)와 `DemoTrendGrid`(706행 부근)는 이 탭들에서만 쓰였다.
`PORTFOLIO` 탭이 쓰지 않으면 둘 다 지운다.

**여기가 중요하다.** 지금 HOME의 MACRO/FABRIC 탭은 **실제 수집 데이터가 아니라 데모 카드**를 그린다.
`public/data/trend/feed.json`을 읽지 않는다. 새 섹션은 실데이터를 읽는다. 그게 이번 작업의 핵심 이득이다.

---

# 2. TREND 섹션 신설

## 위치

`Work report` 섹션과 `기능성 포트폴리오` 섹션 **사이**다. 1087행 부근이다.

껍데기는 `TS 관리` / `TECHNICAL REFERENCES`가 속한 Work report 섹션과 같은 문법을 쓴다.

```
<section aria-labelledby="trend-home-title">
  <div className="mb-5"> ... h2 + 설명 문장 ... </div>
  ... 내용 ...
</section>
```

제목은 `TREND`, 설명은 `소재 기술 동향과 시장 거시 지표를 함께 봅니다` 정도.
우측에 `전체 보기` 버튼 두 개(`/trend/fabric`, `/trend/macro`)를 둔다.

## 데이터

`src/data/trend.ts`의 `loadTrendFeed()`와 `loadTrendKpi()`를 쓴다. 이미 있는 함수다.
HOME은 지금 이걸 안 읽으므로 `useEffect`로 한 번 불러온다.

**로딩과 실패를 반드시 처리한다.** 두 JSON은 GitHub Actions가 커밋해야 생긴다.
아직 없거나 fetch가 실패하면 섹션이 통째로 깨지면 안 된다.
데이터가 없으면 섹션을 조용히 감추거나 한 줄 안내만 남긴다. HOME은 첫 화면이라 여기서 에러가 나면 안 된다.

## 레이아웃

`grid gap-5 xl:grid-cols-12`. 좌측 `xl:col-span-7`이 FABRIC, 우측 `xl:col-span-5`가 MACRO다.
기사 썸네일이 자리를 더 먹으므로 좌측을 넓게 준다.

---

# 3. FABRIC 블록: 썸네일 카드 스택

## 무엇을 보여 주나

`feed.json`의 `articles`에서 최근 것 중 이미지(`i`)가 있는 기사 5건.
`h > 1`(여러 매체가 같이 다룬 기사)을 우선으로 고르면 무게가 있다.

카드에 담을 것은 썸네일, 분류 배지, 제목(`t`, `line-clamp-2`), `날짜 · 매체`다.
`TrendFabric.tsx`의 `ArticleThumbnail`과 같은 처리를 쓴다.
`referrerPolicy="no-referrer"`, `loading="lazy"`, `onError` 숨김이 필요하다. 외부 이미지다.
컴포넌트를 그대로 import하기 어려우면 같은 처리를 복제하되, 이 세 가지는 반드시 넣는다.

## HOME에 없는 UX: 카드 스택

Home의 `DemoTrendGrid`는 격자로 늘어놓는다. 여기서는 **겹쳐 쌓았다가 넘기는** 형태로 만든다.

- 카드 5장을 서로 조금씩 어긋나게 겹쳐 쌓는다.
  뒤 카드일수록 `scale`을 줄이고 `translateY`를 더하고 `opacity`를 낮춘다
- 맨 앞 카드를 누르거나 좌우 화살표를 누르면 다음 장이 올라온다
- 6초마다 자동으로 한 장 넘어간다. **포인터가 올라가 있으면 멈춘다**
- 하단에 몇 번째인지 점으로 표시한다

자동 넘김은 `useEffect`의 `setInterval`로 하고 언마운트에서 반드시 `clearInterval`한다.
탭이 백그라운드일 때 타이머가 쌓이지 않도록 `document.visibilityState`도 본다.

## HOME에 없는 모션: 이미지 와이프

카드가 앞으로 올라올 때 이미지를 `clip-path: inset(...)`으로 위에서 아래로 닦아 내듯 드러낸다.
Home은 `scale`과 `opacity`만 쓴다. 결이 다른 모션이라 새롭게 보인다.

`transition`은 `[--e-soft]`와 `[--t-lift]` 토큰을 쓴다. Home이 쓰는 것과 같은 곡선이어야 톤이 맞는다.

---

# 4. MACRO 블록: 지표 티커

## 무엇을 보여 주나

`kpi.json`의 `cards` 중 `group === "gov"` 6개다.
`usdkrw`, `us_real_gdp`, `cotton_a_index`, `crude_brent`, `us_apparel_cpi`, `us_apparel_inventory_ratio`.

각 항목에 라벨, 값, 전년 대비, 미니 스파크라인을 담는다.

색은 `TrendMacro.tsx`의 `METRIC_GROUP_COLOR`와 **같은 그룹 규칙**을 쓴다.
환율·GDP가 한 색, 면화·유가가 한 색, CPI·재고율이 한 색이다.
이 맵을 `src/lib/`로 빼서 두 화면이 공유하게 한다. 복사해 두면 나중에 색이 어긋난다.

## HOME에 없는 UX: 세로 티커

Home에 흐르는 UI가 없다. 여기에 하나 둔다.

- 6개 항목이 세로로 천천히 순환한다. 한 번에 3개가 보인다
- 4초마다 한 칸씩 올라간다
- **포인터가 올라가면 멈춘다.** 읽는 중에 움직이면 안 된다
- 항목을 누르면 `/trend/macro`로 간다

무한 순환은 목록을 두 벌 이어 붙이고 `translateY`를 되감는 방식이 간단하다.
`aria-live`는 쓰지 마라. 스크린리더에 계속 읽히면 방해가 된다.
대신 티커 컨테이너에 `aria-label`로 "거시 지표 6개"라고 알리고, 항목은 링크로 접근 가능하게 둔다.

## HOME에 없는 모션: 스파크라인 그리기

스파크라인 선을 `stroke-dasharray`와 `stroke-dashoffset`으로 왼쪽부터 그려 낸다.
섹션이 뷰포트에 들어올 때 한 번만 실행한다. `src/lib/useInView.ts`(`once: true`)를 쓴다.

값은 `NumberTicker`에 `startOnView`를 줘서 같이 올라가게 한다.

---

# 5. 모션 공통 규칙

**`prefers-reduced-motion`을 반드시 존중한다.** 감소 설정에서는

- 자동 넘김과 티커 순환을 멈춘다. 첫 화면 상태로 고정한다
- 와이프와 선 그리기를 건너뛰고 완성 상태로 그린다
- 수동 조작(화살표, 점)은 그대로 동작한다

`Reveal`과 `NumberTicker`는 이미 처리하고 있으니 새로 만드는 부분만 챙기면 된다.

**화려하되 읽기를 방해하지 않는다.** 자동으로 움직이는 것은 전부 호버에서 멈춰야 한다.
사용자가 읽으려고 시선을 둔 순간 콘텐츠가 바뀌면 그건 화려한 게 아니라 고장이다.

---

# 6. 검증

```
npm run build
```

1. `QuickAccessGrid`, `QUICK_ACCESS`, `QUICK_ACCESS_ACCENTS`, `demoTrendCards`, `DemoTrendGrid`가
   정의까지 사라졌는가. 죽은 코드가 남으면 안 된다
2. `TREND_TABS`에 `PORTFOLIO`만 남았는가. 탭 껍데기가 걷혔는가
3. HOME이 `loadTrendFeed`, `loadTrendKpi`를 실제로 부르는가
4. `feed.json`을 일부러 없는 경로로 바꿔도 HOME이 렌더되는가.
   이건 코드를 읽어 판단해도 된다. 실제 파일을 지우지는 마라
5. `setInterval`이 언마운트에서 정리되는가
6. 새 컴포넌트가 `prefers-reduced-motion`을 보는가

dev 서버 실행이나 로그인이 필요한 확인은 하지 마라. 사람이 한다.

## 하지 말 것

- `TrendFabric.tsx`, `TrendMacro.tsx` 수정. 이 작업은 HOME만 건드린다
- 파이썬과 `public/data/trend/*.json` 수정
- `Calendar.tsx`, `TeamSchedule.tsx`, `AppSidebar.tsx` 파일 삭제.
  HOME에서의 사용만 걷어낸다
- 자동 순환을 호버에서 멈추지 않는 것
- 기존 KPI 카드, Overall status, RDDA 등록 현황, 담당자별 진행 현황 손대는 것.
  이번에 지우는 것은 1번 절에 적은 것뿐이다
