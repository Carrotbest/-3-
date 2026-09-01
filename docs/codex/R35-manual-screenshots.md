# R35 — 사용 매뉴얼: 실제 화면 스크린샷 + 주석 삽입

## 목표
기존 사용 안내서(`docs/manual/manual.base.html`)의 각 화면 설명 카드에, **실제 웹 화면을 캡처하고 그 위에 번호·박스 주석(포인트아웃)을 그려 넣은 이미지**를 삽입한다. 최종 결과물은 이미지를 base64로 인라인한 **자체 완결형 HTML** 한 개다. 문서는 길어져도 된다.

## 절대 지켜야 할 제약
- **데모 데이터만 사용**한다. 실제 팀 데이터(담당자 실명·거래처 등)를 캡처하거나 커밋·로그에 남기지 않는다. 캡처는 앱 내장 데모 데이터로만 채운다.
- **DATA·SETTING(관리자 전용) 화면은 스크린샷을 찍지 않는다.** 매뉴얼에서 이 두 카드는 글 설명 그대로 둔다.
- 로그인 우회는 **환경변수 `VITE_CAPTURE=1`일 때만** 동작해야 한다. 이 플래그가 없으면(=배포/일반 실행) 앱 동작은 **완전히 그대로**여야 한다. GitHub Pages 빌드에는 이 값이 없으므로 프로덕션은 계속 로그인 게이트가 걸린다.
- **커밋하지 않는다.** 브랜치는 `redesign/v2`. `git reset --hard`/`git checkout --` 로 사용자 변경 되돌리기 금지.
- 작업 OS는 Windows. 셸은 PowerShell 또는 bash. 시스템 Chrome 경로: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- 새 npm 의존성은 **devDependency**로만. 무거운 크로미움 다운로드 금지 → **시스템 Chrome를 재사용**한다(아래 참조).

## 대상 화면(해시 라우트) — 9개
| 순서 | 라우트 | 화면 |
|---|---|---|
| 1 | `#/` | HOME |
| 2 | `#/development` | DEVELOPMENT |
| 3 | `#/development/workspace` | DD MASTER |
| 4 | `#/warehouse` | WAREHOUSE |
| 5 | `#/ts` | TROUBLE SHOOTING |
| 6 | `#/study` | FABRIC STUDY |
| 7 | `#/rdda` | RDDA REPORT |
| 8 | `#/trend/portfolio` | PORTFOLIO |
| 9 | `#/calendar` | CALENDAR |

기본 URL은 `http://localhost:5175/-3-/` (Vite dev, base `/-3-/`, 해시 라우터). 즉 HOME은 `http://localhost:5175/-3-/#/`.

---

## Phase 1 — 로그인 우회(환경변수 가드)
목적: `VITE_CAPTURE=1`일 때만 게이트를 건너뛰고, 모든 화면을 소유자 권한으로 보이게 한다.

1. 새 파일 `src/data/capture.ts`:
```ts
// 스크린샷 캡처 전용 플래그. VITE_CAPTURE=1 로 dev 서버를 띄웠을 때만 true.
// 프로덕션(GitHub Pages) 빌드에는 이 값이 없으므로 항상 false → 앱 동작 불변.
export const CAPTURE = import.meta.env.VITE_CAPTURE === "1"
```
2. `src/components/auth/AuthExperience.tsx` 의 `LoginGate` 최상단에서 우회:
```ts
import { CAPTURE } from "@/data/capture"
export function LoginGate({ children }: { children: ReactNode }) {
  if (CAPTURE) return <>{children}</>   // ← 캡처 모드: 게이트/Firebase 없이 바로 앱 렌더
  const status = useAuthStore(...)      // 기존 코드 그대로
  ...
}
```
   - 주의: `if (CAPTURE) return` 을 훅 호출보다 **앞**에 두면 훅 순서 규칙 위반이다. 대신 아래처럼 처리:
     - `useEffect(() => { if (!CAPTURE) initAuth() }, [])` 로 바꾸고,
     - 훅들 뒤 분기 시작 지점에서 `if (CAPTURE) return <>{children}</>` 를 첫 줄로 둔다(모든 `useAuthStore`/`useEffect` 호출 **뒤**, 다른 `if (status===...)` **앞**).
3. `src/App.tsx` `AppLayout`:
   - `import { CAPTURE } from "@/data/capture"`
   - `const isOwnerRaw = useAuthStore((s) => s.isOwner)` 로 두고 `const isOwner = CAPTURE || isOwnerRaw` 로 사용(권한 체크 전부 통과 → 모든 화면 접근 가능).
   - Firestore 동기화 훅에서 캡처 모드면 건너뛰기: `useEffect(() => { if (CAPTURE) return; void startStateSync(); return () => stopStateSync() }, [])`. (캡처 땐 내장 데모/로컬 데이터만 쓰면 됨.)
4. 검증: `tsc --noEmit` 통과. `VITE_CAPTURE` 없이 `npm run build` 시 기존과 동일하게 로그인 게이트가 살아 있어야 한다(코드상 CAPTURE=false).

---

## Phase 2 — 캡처 + 주석 스크립트
`playwright-core`(브라우저 미다운로드)를 devDependency로 설치하고 **시스템 Chrome**를 실행 파일로 지정한다.

설치:
```
npm i -D playwright-core
```

`scripts/capture-manual.mjs` 를 생성한다. 요구사항:
- 시스템 Chrome로 실행: `chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true })`.
- 뷰포트 `1440x1024`, `deviceScaleFactor: 2`(선명하게).
- 각 라우트로 이동 → `waitForLoadState('networkidle')` → **추가 1800ms 대기**(Recharts/KPI 애니메이션이 rAF로 올라오므로). 헤드리스라도 탭은 visible 취급되어 KPI가 0에서 실제값으로 채워진다. 채워졌는지 확인하려면 KPI 요소의 `aria-label` 을 읽어 0이 아닌 값이 있는지 로그로 남긴다.
- **주석 오버레이는 페이지 안에서 그린다**(별도 이미지 편집 불필요). 아래 헬퍼를 `page.evaluate` 로 주입:
  - 전체 화면을 덮는 `pointer-events:none` 오버레이 div 생성.
  - 각 콜아웃 `{ n, selector?, findText?, label }` 에 대해 대상 엘리먼트의 `getBoundingClientRect()`(스크롤 포함 문서 좌표)를 구해:
    - 대상 둘레에 **테두리 박스**(2.5px solid `#0D9488`, radius 10px, 반투명 teal 글로우) 를 그린다.
    - 박스 좌상단에 **번호 뱃지**(원형, 배경 `#0D9488`, 흰 숫자, 26px, IBM Plex Mono 느낌의 sans, 그림자) 를 붙인다.
  - 대상 못 찾으면 그 콜아웃은 **건너뛴다(에러 아님)**. 최소한 깨끗한 스크린샷은 항상 나오게 한다.
- 엘리먼트 탐색은 견고하게: 우선 `document.querySelector(selector)`, 실패 시 `findText`(주어지면) 로 "텍스트를 포함하는 가장 가까운 카드/헤더" 를 찾는 헬퍼(모든 요소 순회하며 textContent 부분일치 → 가장 작은 매칭 블록) 사용. 화면마다 클래스가 난독화돼 있으니 **aria-label·제목 텍스트 기반**이 안전하다.
- 캡처 범위: `fullPage: false` 로 두되, 콜아웃 대상들이 뷰포트에 들어오도록 필요 시 스크롤. 화면 상단 주요 UI 위주로 1~2장. 표가 가로로 넓은 DD MASTER/WAREHOUSE는 좌측 고정열이 보이는 상단 뷰포트만.
- 저장: `docs/manual/shots/<n>-<slug>.png` (예: `1-home.png`). 각 이미지에 대응하는 콜아웃 범례(번호→설명)를 `docs/manual/shots/callouts.json` 에 함께 기록.

**콜아웃 설계(화면별, 텍스트 앵커 기준 — 실제 DOM 확인 후 최종 조정할 것):**
- HOME: ①기간 설정(‘기간 설정’) ②완료/접수/납기 요약 숫자 카드 영역 ③공정 누적 도달률 ④하단 바로가기 그리드
- DEVELOPMENT: ①공정별 누적 현황 그래프 ②담당자 카드 ③최근 월별 FL 등록 추이
- DD MASTER: ①좌측 고정열(담당·Status·Style) ②편집 가능한 셀 영역 ③‘신규 접수’ 버튼 ④담당 칸 ⤢(전체수정) 아이콘
- WAREHOUSE: ①탭(입고대기·창고보관·소진·폐기) ②상단 요약 KPI ③행 목록(드래그로 상태 이동) ④입고/출고 액션 버튼
- TS: ①‘신규 접수 입력’ 폼 ②단계 필터(접수·진행·완료) ③목록 ④엑셀 내보내기 버튼
- STUDY: ①팀원별 주차 제출 현황 표 ②분류별 누적 ③미진행 목록 ④자료 라이브러리
- RDDA: ①최신 누적 KPI ②월별 YTD 추이 ③원산지 분포 ④고객별 Pickup
- PORTFOLIO: ①상단 현황 KPI ②기능 카테고리 ③등록 연도 추이 ④자산 카드
- CALENDAR: ①월 달력 ②담당자 필터 ③일정 유형 범례 ④선택 기간 상세

각 화면 콜아웃은 2~4개면 충분. 실제로 못 찾으면 개수를 줄여도 된다.

실행 순서(스크립트 밖, Codex가 수행):
1. 임시로 `.env.local` 에 `VITE_CAPTURE=1` 한 줄 추가(원래 없었으면 작업 후 제거).
2. `npm run dev -- --port 5175` 백그라운드 실행, 서버 뜰 때까지 대기.
3. `node scripts/capture-manual.mjs` 실행 → 9장 + callouts.json 생성.
4. dev 서버 종료.

---

## Phase 3 — 매뉴얼에 이미지 삽입(자체 완결형 HTML)
1. `docs/manual/manual.base.html` 를 읽어 각 `<article class="screen">` 카드(스크린샷 대상 9개)에 **‘화면 미리보기’ figure 블록**을 `.lead` 문단 바로 아래(패널들 위)에 삽입한다.
   - figure: 캡처 이미지(`<img>`, `max-width:100%`, 둥근 모서리·얇은 테두리·부드러운 그림자, 기존 디자인 토큰 재사용) + 그 아래 **번호 범례**(①=…, ②=… 를 작은 mono 뱃지 + 설명 목록으로). callouts.json 내용을 사용.
   - 이미지는 **base64 data URI** 로 인라인한다(자체 완결형이어야 함). 최종 파일: `docs/manual/manual.html`.
   - 기존 색/타이포/레이아웃 토큰과 이질감 없게. figure 캡션 스타일은 기존 `.panel .lbl`/`.mono` 톤을 따른다.
2. DATA·SETTING·준비중 카드에는 이미지 넣지 않는다(그대로 유지).
3. `manual.base.html` 원본은 남겨둔다(참고용).

## Phase 4 — 정리·검증
- `.env.local` 의 `VITE_CAPTURE` 제거(원래 파일이 없었다면 파일 삭제).
- `tsc --noEmit` 통과 확인.
- `git status` 로 바뀐 파일 목록 확인(커밋은 하지 않음).
- 최종 산출물 경로와, 각 화면별로 콜아웃이 몇 개 그려졌는지 요약 로그 출력.

## 완료 기준
- `docs/manual/manual.html` 하나만 열면 9개 화면의 주석 달린 실제 스크린샷이 인라인으로 보인다(오프라인·이동 가능).
- 프로덕션 빌드는 여전히 로그인 게이트가 살아 있다(CAPTURE 가드 확인).
- 실제 팀 데이터가 이미지·코드·로그에 없다.
