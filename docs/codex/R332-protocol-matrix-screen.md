# R332 BUYER PROTOCOLS 메인 화면을 시험 기준 매트릭스(기술 문서형)로 재구성

상태: 미착수. 데이터, 타입, 도판은 준비됐다(2026-10-13).
- Firestore `protocolMatrix`(소유자 전용, 규칙 배포 완료)에 개정본 4건. 기준본 1건(`kind: "master"`, 2025-08-27, 시험 29개, 바이어 19곳)과 바이어 수정본 3건(1건 반영됨, 2건은 각 2칸 미반영).
- 타입과 구독 훅: `src/data/protocol-matrix.ts`(`useProtocolMatrix`, `methodKey`, `isNotApplicable`). **이 파일을 고치지 말 것.** 필드 의미는 파일 주석 그대로다.
- 기술 도판: `src/components/protocol/TechFigures.tsx`(`GROUP_FIGURES`, `KnitPlate`). **고치지 말 것.** 가져다 쓰기만 한다.
- 원문 매뉴얼 43건은 기존 `useBuyerProtocols()`(`src/data/references.ts`)로 읽는다.

## 인코딩 주의
모든 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 한글 문구를 글자 그대로 쓴다.

## 디자인 원칙 (이 화면만의 톤)
"정확한 기술 매뉴얼, 공학 도면" 느낌이다. 앱의 다른 화면처럼 유리 효과와 그라데이션을 쓰지 않는다.
- 바탕은 `var(--card)` 종이 면, 1px `var(--border)` 실선, 모서리 `rounded-[6px]` 이하. 그림자는 `shadow-[0_1px_0_var(--border)]` 수준까지만. `backdrop-blur`, 그라데이션, 번짐 그림자, 상시 애니메이션 금지.
- 강조색은 도면 청색 하나: `var(--ref-cat-1)`. 경고(불일치, 미반영)는 `var(--warning)`.
- 규격 코드, 번호, 날짜, 수치는 `font-mono tabular-nums`. 영문 라벨은 `uppercase tracking-[0.14em] text-[10px]`.
- 섹션 번호를 붙인다: `§ 1` 시험군, `1.03` 시험 항목. 도판 캡션은 `FIG. 1` 형식.
- 머리말 격자 무늬: `background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size: 16px 16px;` 에 `opacity`를 낮춘 레이어(절대 위치 span, `opacity-[0.35]`, `pointer-events-none`).

## 파일별 조치

### 1. `src/routes/BuyerProtocols.tsx` 전면 재작성
`export function BuyerProtocols()`는 유지한다. 데이터는 `useProtocolMatrix()`와 `useBuyerProtocols()` 둘.

#### 1-1. 머리말 = 도면 표제란(Title block)
한 장의 카드. 왼쪽 열과 오른쪽 열(`lg:grid-cols-[minmax(0,1fr)_320px]`).
- 왼쪽 위: 작은 라벨 `HANSOLL FABRIC R&D  ·  TECHNICAL STANDARD` (mono, 10px, muted). 그 아래 제목 `Buyer Test Protocol Matrix` (`text-2xl font-semibold tracking-tight`), 부제 `바이어별 원단 시험 방법과 기준 (취합본 기준)`.
- 그 아래 표제란 표: 4칸 그리드(`grid-cols-2 sm:grid-cols-4`, 칸마다 1px 경계선, 칸 안 위에 mono 라벨 아래 값):
  - `DOC NO.` / `HTP-MATRIX`
  - `REV.` / 기준본 `revDate` (예 `2025-08-27`)
  - `SCOPE` / `{buyers.length} BUYERS · {tests.length} TESTS`
  - `STATUS` / 미반영 개정본이 있으면 `미반영 수정 {n}건`(warning 색), 없으면 `최신`
- 그 아래 검색 줄: 큰 입력창(h-10, mono placeholder 아님), placeholder `시험 항목, 규격 코드, 기준값 검색 (예: AATCC 135, pilling, 75 ppm)`. 검색은 시험 영문명, 한글명, 모든 칸의 method와 requirement를 대상으로 대소문자 무시.
- 오른쪽 열: `KnitPlate`를 도면 액자에 넣는다(1px 테두리, 안쪽 여백 12px, 텍스트색 `text-[var(--foreground)]/70`). 액자 아래 캡션 `FIG. 0  WEFT KNIT STRUCTURE` (mono 10px muted).
- 머리말 전체 뒤에 격자 무늬 레이어.

#### 1-2. 탭
밑줄형 탭 4개. 라벨 앞에 번호(mono). `01 MATRIX` `02 BY BUYER` `03 REVISIONS` `04 SOURCE MANUALS`. 아래 한글 보조 `기준표`, `바이어별`, `개정 이력`, `원문 매뉴얼`. 선택 탭은 하단 2px `var(--ref-cat-1)` 선. 상태는 `useSearchParams`의 `tab`(기본 `matrix`).

#### 1-3. MATRIX 탭 (메인)
- 필터 줄(sticky 아님):
  - 시험군 세그먼트: `ALL` + 기준본 `groups` 순서대로 `PHYSICAL 물성` 등(라벨과 korean).
  - 바이어 칩 19개(다중 선택, 아무것도 안 고르면 전체). 칩은 mono 11px, 선택 시 `border-[var(--ref-cat-1)] text-[var(--ref-cat-1)] bg-[color-mix(in_oklab,var(--ref-cat-1)_8%,transparent)]`. 끝에 `선택 해제` 텍스트 버튼.
  - 오른쪽에 `모두 펼치기` / `모두 접기`.
- 본문: 시험군마다 섹션.
  - 섹션 머리: 왼쪽에 `§ {index}` (mono, 도면 청색), `{label}` 대문자, `{korean}`, 오른쪽에 항목 수. 그 아래 2열(`xl:grid-cols-[260px_minmax(0,1fr)]`): 왼쪽에 `GROUP_FIGURES[group.id]` 도판(1px 액자, `text-[var(--foreground)]/75`), 오른쪽에 항목 목록.
  - 항목 = 접히는 사양 블록(기본 접힘. 검색어가 있으면 일치 항목만 보이고 펼침).
    - 접힌 줄: `1.03`(mono) · 영문명 · 한글명(muted) · 오른쪽에 방법 분포 요약. 분포는 선택된 바이어들의 첫 조건 `methodKey(method)`를 세어 상위 3개를 `AATCC 135 ×14` 형식 mono 칩으로. 원문 대조 불일치(`verification`)가 이 항목에 있으면 warning 점 하나.
    - 펼친 표: 열 `BUYER` `TEST METHOD` `REQUIREMENT`. 행은 선택된 바이어 순서. 한 바이어에 조건이 여러 개면 행을 나눠 쓰고 BUYER 칸은 첫 행에만.
      - TEST METHOD 칸은 mono. 그 방법의 `methodKey`가 이 항목의 최다 방법과 다르면 칸 왼쪽에 2px `var(--ref-cat-1)` 선과 툴팁 `다수 방법과 다름`.
      - REQUIREMENT는 `whitespace-pre-line` 13px. `isNotApplicable`이면 `N/A`를 muted로.
      - 원문 대조 불일치가 있으면 행 배경 `color-mix(in oklab, var(--warning) 8%, transparent)`, 칸 아래 작은 줄 `원문: {source}  ({doc})` warning 색.
      - 미반영 수정본 diff가 이 바이어, 이 항목에 있으면 칸 아래 작은 줄 `미반영 수정 {revDate}: {value 첫 줄}` 도면 청색.
    - 표 안에 `backdrop-blur` 금지. 가상 스크롤 없이 그린다(펼친 항목만 표를 그리므로 충분하다).
  - 맨 위(섹션들 앞)에 판정 광원 줄: `LIGHT SOURCE` 라벨 뒤에 선택된 바이어별 `Buyer  D65 / CWF` 를 mono 칩으로 가로 나열(줄바꿈 허용).

#### 1-4. BY BUYER 탭
- 왼쪽 목록(`lg:grid-cols-[240px_minmax(0,1fr)]`): 바이어 19곳, 이름과 1차 광원. 선택 상태는 `?buyer=`.
- 오른쪽 바이어 사양서:
  - 머리: 바이어 이름(`text-xl`), `LIGHT SOURCE  D65 / CWF`, 원문 매뉴얼 개수(`manualTopic`이 같은 `useBuyerProtocols` 항목 수) 버튼 `원문 {n}건` 누르면 탭 04로 가며 그 바이어로 거른다(`?tab=manuals&buyer=`).
  - 질의 회신(`notes`)이 있으면 회색 상자 `바이어 질의 회신` 아래 Q, A 쌍.
  - 시험군별 표: 열 `NO.` `TEST` `METHOD` `REQUIREMENT`. 조건이 비어 있는 항목은 `해당 없음` muted 한 줄.
  - 불일치와 미반영 표시는 MATRIX와 같은 규칙.
- 기준본 `pendingBuyers`는 목록 맨 아래 회색 항목 `{name} (본표 미등재)`. 누르면 note와 answers만 보인다.

#### 1-5. REVISIONS 탭
세로 타임라인. 개정본을 `revDate` 내림차순.
- 각 항목: 왼쪽 세로선과 원 표식(기준본은 채운 원, 수정본은 빈 원), `REV. {revDate}` mono, `label`, `sourceFile` muted, 상태 배지(`baseline` -> `기준본`, `merged` -> `반영됨`, `pending` -> `미반영`(warning)).
- 수정본: diff 목록 표. 열 `TEST` `FIELD` `기준본` `수정본`. TEST는 `no + 영문명`, FIELD는 `METHOD`/`REQUIREMENT`. 기준본 칸과 수정본 칸은 `whitespace-pre-line` mono 아님 13px. 바뀐 칸 배경은 수정본 칸에만 연한 도면 청색. diff가 0이면 `기준본과 차이 없음`.
- 기준본: 원문 대조 불일치 목록 표 `TEST` `BUYER` `취합본` `원문` `근거 문서`. 위에 설명 한 줄 `취합본 값과 바이어 원문 매뉴얼이 다른 칸입니다. 원문 기준으로 확인이 필요합니다.`

#### 1-6. SOURCE MANUALS 탭
지금 `BuyerProtocols.tsx`의 바이어 카드 그리드를 그대로 옮긴다. 단 `topic`이 `전 바이어`인 항목(취합본 자체)은 뺀다. `?buyer=`가 있으면 그 바이어(`manualTopic`) 카드만. 카드, 팝업 컴포넌트(`FolderCard`, `FolderDialog`, `ReferenceDialog`)는 지금처럼 `TechnicalReferences.tsx`에서 가져온다.

#### 1-7. 상태 문구
로딩 `기준표를 불러오는 중입니다.`, 훅 오류 문구 그대로, 기준본 없음 `등록된 기준표가 없습니다.`. 푸터 왼쪽 `SOURCE  Buyer별 Test protocols 취합본, Teams Test Protocols 폴더`(mono 10px), 오른쪽 `REV. {revDate}`.

### 2. 다른 파일
- `src/routes/route-config.ts`의 `/protocol` subtitle만 `바이어별 시험 방법과 기준을 한 표에서 비교합니다. 현재 소유자 전용입니다.`로 바꾼다.
- 그 밖의 파일은 고치지 않는다.

## 하지 말 것
- `src/data/protocol-matrix.ts`, `src/components/protocol/TechFigures.tsx`, `firestore.rules`, `references.ts`, `TechnicalReferences.tsx` 수정 금지.
- 실데이터(바이어명, 규격값)를 코드에 넣지 말 것. 모든 값은 Firestore에서 온다. 표시 라벨(`PHYSICAL` 등)도 데이터의 `groups`를 쓴다.
- 차트 라이브러리 추가 금지.
- `DialogContent`에 `relative`, `absolute`, `static` 넘기지 말 것.
- 파일 삭제 금지.

## 검증
- `npm run build` exit 0 한 번(타임아웃 300초).
- `git status --short`에 삭제 없음.
