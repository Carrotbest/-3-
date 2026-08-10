# REACT_REBUILD — shadcn 어드민 전면 재구축 (B안)

2026-08-04 결정. 기존 빌드리스 ES 모듈 방식을 접고 React 스택으로 재구축한다.
레퍼런스: shadcnblocks Admin Kit (사용자 제공 스크린샷 5장 + 컴포넌트 코드 + 토큰 CSS).

## 스택 (확정)

- **Vite + React 18 + TypeScript**
- **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme inline`) + `tw-animate-css`
- **shadcn/ui** — 컴포넌트는 `src/components/ui/`
- **라우팅**: react-router-dom, **HashRouter** (GitHub Pages 정적 호스팅 + 새로고침 404 회피)
- **차트**: Recharts (shadcn chart 래퍼). 팔레트는 토큰 `--chart-1`(오렌지) ~ `--chart-5`
- **엑셀 파싱**: `xlsx`(SheetJS) npm 패키지
- **배포**: `vite build` → `dist/` → GitHub Pages. `vite.config.ts`에 `base: '/-3-/'`

## 왜 Vite인가 (레퍼런스는 Next)

우리는 서버가 없고 GitHub Pages 정적 배포다. Next의 서버 기능이 필요 없고,
현재 해시 라우팅 SPA 구조와 Vite가 정확히 맞는다. Next static export보다 단순하고 배포가 확실하다.

## 디자인 기준 (스크린샷에서 추출)

- **사이드바**: 흰색(`--sidebar`), 상단 브랜드(아바타+제목+부제), 그룹 라벨(General / Pages / Other),
  접히는 항목(chevron), 활성 항목은 옅은 회색 배경. 하단 사용자 카드.
- **탑바**: 사이드바 토글, 검색(⌘K), 우측 테마 토글(해/달).
- **페이지 머리**: 제목 + 부제 + 우측 액션 버튼(dark primary + outline).
- **탭 pill**: Overview / Analytics 처럼 알약형 탭(`bg-muted` 위에 활성은 흰 배경+그림자).
- **KPI 카드**: 아이콘 + 라벨 + 우상단 info(ⓘ), 큰 숫자, 하위 캡션, 하단에 Details + 증감%
  (상승 초록/하락 빨강 화살표) + 미니 스파크라인.
- **차트 카드**: 면적(오렌지+틸 그라디언트), 막대(오렌지·틸 페어), 도넛/방사형, 레이더.
- **테이블**: 제목+부제, 필터 input, Columns/View 드롭다운, 체크박스 열, 정렬 헤더,
  상태 배지(Success·Active 초록 / Suspended·Failed 빨강 / New 파랑 / Invited·Processing 회색),
  행 액션(⋯), 페이지네이션(Rows per page / Page 1 of N / 화살표).
- **모노톤 UI + 데이터 시각화에만 오렌지/틸 포인트.** 라운드 8px, Inter.

## 폴더 구조 (목표)

```
/  (repo root)
├─ index.html                 Vite 진입
├─ package.json  vite.config.ts  tsconfig.json  components.json
├─ src/
│  ├─ main.tsx  App.tsx        HashRouter + 레이아웃
│  ├─ index.css                ★ docs/reference/index.css 내용 (토큰)
│  ├─ lib/utils.ts             cn()
│  ├─ components/
│  │  ├─ ui/                   shadcn 컴포넌트 (card·button·tabs·input·label·table·badge·…)
│  │  ├─ layout/               AppSidebar·Topbar·PageHeader
│  │  └─ charts/               AreaCard·BarCard·DonutCard·Sparkline (Recharts 래퍼)
│  ├─ routes/                  화면: Home·Development·Rdda·Ts·Study·Calendar·Sync·Setting (+2·3차)
│  ├─ data/                    schema.ts·reconcile.ts·tds-loader.ts·derive.ts·sample.ts (TS 이식)
│  └─ store/                   전역 상태 (zustand 또는 context)
├─ legacy-vanilla/             기존 빌드리스 8화면 (로직 이식 참고용, 배포 제외)
└─ legacy/                     최초 원본 사이트
```

## 반드시 보존할 업무 로직 (legacy-vanilla/ 에서 이식)

이 4가지는 디자인과 무관한 우리 고유 로직이다. TS로 옮기되 **동작을 바꾸지 마라.**

1. **schema** — 개발 건 16개 항목(FIELDS), 카테고리 4종, 공정 6단계, 팀원 4명, TDS 헤더 매핑.
2. **reconcile** — 합계 대조 5종(담당자별/전체현황/카테고리/시즌/Opt중복). `passed:false`면 렌더 차단.
3. **tds-loader** — SheetJS로 TDS 엑셀 파싱, 헤더 표기 흔들림 흡수. 브라우저 안에서만 처리.
4. **derive** — KPI·분포·납기 판정·주간보고 2줄.
5. **민감 필드** — 단가·협력사명은 TDS를 연 상태(`sensitiveUnlocked`)에서만. 아니면 컬럼 자체를 만들지 않음.

기존 vanilla 소스 위치: `legacy-vanilla/assets/js/data/*.js`, `.../views/*.js`.

## 화면 목록 (라우트)

1차: Home(대시보드) · Development(+서브 5) · RDDA · TS 관리 · STUDY · Calendar · Sync · Setting
2·3차(메뉴만, placeholder 유지): FABRIC ANALYSIS · CONSTRUCTION GUIDE · TREND(Macro/Fabric/Portfolio) · PROCESS INNOVATION

## 단계 (Codex 진행 순서)

- **R0 — 스캐폴드**: Vite+React+TS, Tailwind v4, shadcn init, 제공된 ui 컴포넌트 설치, index.css 토큰 적용,
  vite base 설정. `npm run build` 성공까지. → `docs/codex/R0-scaffold.md`
- **R1 — 앱 셸**: 사이드바(그룹 nav)·탑바·페이지헤더·HashRouter·다크토글. 레퍼런스 레이아웃 재현.
- **R2 — 로직 이식**: data/ TS 이식 + 상태 스토어 + sample 데이터. (동작 보존)
- **R3 — 화면**: Home → Development → 나머지 순. shadcn Card/Table/Tabs/Badge + Recharts.
- **R4 — 배포**: GitHub Pages(Actions 또는 gh-pages). 커밋은 **사용자 지시 시 한 번만.**

## 이미 밟은 지뢰 (재발 금지)

1. **Vite dev "Invalid hook call" (React 중복 사본).** `npm run build`(프로덕션)는 되는데
   dev 서버에서만 크래시하면 이것이다. recharts 등이 dev 사전번들에서 두 번째 React를 물어온다.
   `vite.config.ts` 에 `resolve.dedupe: ['react','react-dom']` + `optimizeDeps.include`(react·react-dom·recharts)로
   해결됨. **이 설정을 지우지 마라.** 새 라이브러리가 훅을 쓰면 optimizeDeps.include 에 추가.
   증상 재현 시 `node_modules/.vite` 캐시 삭제 후 dev 재기동.

2. **shadcn 최신 컴포넌트는 React 19 가정 → React 18에서 "Function components cannot be given refs" 크래시.**
   `npx shadcn add` 로 받은 컴포넌트가 함수형(no forwardRef, `data-slot`)이면 Radix 가 ref 를 넘길 때
   React 18에서 경고가 에러로 번져 화면이 검게 죽는다(sheet.tsx 가 그랬음). 해결: Radix primitive 를 감싸는
   래퍼를 `React.forwardRef` 로 바꾼다(sheet.tsx 참고). 새 shadcn 컴포넌트 추가 시 항상 확인할 것.
   ※ HMR 로 안 고쳐지면 **전체 새로고침**(location.reload) 해야 크래시된 트리가 갈린다.

## 규칙

- 색·폰트·라운드는 index.css 토큰(shadcn 변수)만 쓴다. 임의 hex 금지.
- 기존 `legacy/`·`legacy-vanilla/`는 빌드·배포에서 제외(참고 전용).
- 커밋·푸시는 사용자가 지시할 때만. 자동 커밋 금지.
- 브라우저 확인이 안 되면 `npm run build` 성공 + 타입체크까지가 Codex의 검증 범위. 실제 화면은 사용자가 본다.
