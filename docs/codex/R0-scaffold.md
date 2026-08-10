# 작업지시 R0 — React 스캐폴드 + 앱 셸

전제: `docs/REACT_REBUILD.md` 를 먼저 읽어라. 스택·폴더구조·디자인 기준이 거기 있다.
작업 폴더는 repo 루트 `C:\Users\hkpark\Desktop\fabric-rnd`.

## 0. 기존 파일 보존 (먼저)

지금 repo 루트에 빌드리스 vanilla 앱이 있다. 지우지 말고 옮겨라.

```
mkdir legacy-vanilla
```
그리고 루트의 다음을 `legacy-vanilla/` 로 이동: `index.html`, `assets/`.
(`legacy/`, `docs/`, `.git`, `.gitignore`, `AGENTS.md`, `wr_data.json`, `Fabric_RND_v3.zip` 은 그대로 둔다.)

`git mv` 를 쓰면 이력이 남아 좋다. 커밋은 하지 마라.

## 1. Vite + React + TS 스캐폴드

루트에서 비대화형으로 생성한다. 이미 파일이 있으니 현재 폴더에 바로 만든다:

```
npm create vite@latest . -- --template react-ts
```
프롬프트가 뜨면 현재 디렉터리에 생성/기존 파일 유지 방향으로 진행한다.
그 뒤 `npm install`.

`vite.config.ts` 에 GitHub Pages 경로를 넣는다:
```ts
base: '/-3-/',
```
그리고 `@/` alias 를 `src/` 로 잡는다 (vite resolve.alias + tsconfig paths).

## 2. Tailwind v4 + shadcn

- Tailwind v4 설치: `npm install tailwindcss @tailwindcss/vite` 후 vite 플러그인 등록.
- `tw-animate-css` 설치.
- `src/index.css` 의 내용을 **`docs/reference/index.css` 파일 내용으로 교체**한다.
  (사용자가 준 토큰이다. 이 파일이 색·폰트·라운드의 기준이다. 값을 바꾸지 마라.)
- 폰트 Inter / Roboto Mono / Roboto Serif 를 `index.html` 에서 Google Fonts 로 로드한다.
- shadcn 초기화: `npx shadcn@latest init` (비대화형 플래그 사용, base color neutral,
  css variables 사용, 경로는 `@/components` 와 `@/lib/utils`).
  `components.json` 이 생성되어야 한다.

## 3. 제공된 shadcn 컴포넌트 설치

사용자가 준 컴포넌트를 `src/components/ui/` 에 넣는다. 아래는 사용자 메시지의 코드 그대로다:
`card.tsx`, `button.tsx`, `tabs.tsx`, `input.tsx`, `label.tsx`, 그리고 `border-beam.tsx`.
`src/lib/utils.ts` 에 `cn()` (clsx + tailwind-merge) 를 만든다.

npm 의존성 설치:
```
npm install @radix-ui/react-slot class-variance-authority @radix-ui/react-tabs @radix-ui/react-label clsx tailwind-merge lucide-react
npm install react-router-dom recharts xlsx
```

추가로 앞으로 쓸 shadcn 컴포넌트도 CLI로 받아 둔다:
```
npx shadcn@latest add table badge dropdown-menu avatar separator tooltip select checkbox
```

## 4. 앱 셸 (레퍼런스 레이아웃 재현)

`src/App.tsx` 에 HashRouter + 2단 레이아웃:

- **AppSidebar** (`src/components/layout/`): 흰 배경(`bg-sidebar`), 상단 브랜드
  (아바타 "F" + "FABRIC R&D" + "통합원단부 3팀"), 그룹 라벨과 메뉴:
  - **General**: Dashboard(HOME), DEVELOPMENT(하위 Overview/EU/Season/Core/Project), RDDA REPORT
  - **Technical Services**: TS 관리, STUDY 과제, (2차: FABRIC ANALYSIS, CONSTRUCTION GUIDE)
  - **Operations**: CALENDAR, 동기화 상태, SETTING
  - **Trend / Process (3차)**: MACRO TREND, FABRIC TREND, PORTFOLIO, PROCESS INNOVATION
  활성 항목은 `bg-sidebar-accent`, 아이콘은 lucide-react. 접기 토글 지원.
- **Topbar**: 사이드바 토글, 검색 input(플레이스홀더 "검색" + ⌘K 표시), 우측 테마 토글(해/달 lucide).
  테마는 `document.documentElement.classList.toggle('dark')` + localStorage 저장.
- **PageHeader** 컴포넌트: 제목 + 부제 + 우측 액션 슬롯.
- 라우트는 8개 1차 화면 + 2·3차. 각 화면은 지금은 **PageHeader + "준비 중" placeholder** 로 둔다
  (내용은 R3에서 채운다). 라우팅과 셸이 레퍼런스처럼 보이면 R0 성공이다.

## 검증 (Codex 범위)

- `npm run build` 가 에러 없이 끝난다.
- `npx tsc --noEmit` 타입 에러 없음.
- 브라우저로 열어보려 하지 마라. 빌드·타입체크까지가 네 범위다.

## 보고

```
DONE: <생성/이동한 것>
BUILD: <npm run build 결과, tsc 결과>
NOTES: <판단 필요 지점>
```
커밋하지 마라. R0 가 끝나면 멈추고 보고한다. R1(로직 이식·화면)은 다음 지시에서 한다.
