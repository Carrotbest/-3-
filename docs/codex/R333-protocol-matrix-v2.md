# R333 BUYER PROTOCOLS 2차: 버전 선택, 바이어 색, 검색 중심 매트릭스, 실무 카드

상태: 미착수. 데이터와 데이터 모듈은 끝났다(2026-10-13).
- Firestore `protocolMatrix`: 기준표 2개 버전(`ver-1.0` 과거, `ver-1.1` 최신, `kind: "master"`, `version` 필드)과 담당 수정본 3건(`kind: "buyer-copy"`, `mergedVersion`). `ver-1.1.changes`는 1.0 대비 바뀐 4칸이다.
- 바이어마다 `color`(hex), `colorBasis`, `colorName`이 있다.
- `src/data/protocol-matrix.ts`의 `useProtocolMatrix()`가 `versions`, `latest`, `master`(지금 보는 버전), `viewingLatest`, `selectVersion(version | null)`을 준다. 보는 버전은 개인 브라우저 설정(localStorage)이다. **이 파일과 `src/components/protocol/TechFigures.tsx`는 고치지 말 것.**

## 인코딩 주의
모든 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 한글, 영문 문구를 글자 그대로 쓴다.

## 이번 화면의 정리 규칙 (가장 중요)
사용자 지적: "텍스트의 분포가 정리가 안 된 느낌", "클릭 가능한 항목의 크기와 경계를 통일". 아래 규칙을 화면 전체에 예외 없이 적용한다.

1. **글자 크기는 다섯 단계만 쓴다.** 상수로 파일 위에 둔다.
   - `T_LABEL`: `font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]` (영문 라벨, 열 머리)
   - `T_BODY`: `text-[13px] leading-5` (본문, 표 칸)
   - `T_CODE`: `font-mono text-[12.5px] leading-5 tabular-nums` (규격 코드, 버전, 날짜, 수치)
   - `T_TITLE`: `text-[15px] font-semibold leading-6` (카드 제목, 시험 항목명)
   - `T_HEAD`: `text-2xl font-semibold tracking-tight` (화면 제목, 한 번만)
   이 다섯 외의 `text-xs`, `text-sm`, `text-base`, `text-[10px]` 등은 쓰지 않는다.
2. **간격은 4의 배수만.** 카드 안쪽 `p-4`, 카드 사이 `gap-3`, 섹션 사이 `space-y-6`. 라벨과 값 사이 `mt-1`.
3. **클릭 가능 = 테두리 있음, 클릭 불가 = 테두리 없음.** 텍스트, 수치, 라벨에는 테두리, 배경 상자를 씌우지 않는다. 클릭 요소는 아래 세 규격 중 하나만 쓴다.
   - `CTRL_CHIP`: `inline-flex h-8 items-center gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-3 text-[13px] hover:border-[color-mix(in_oklab,var(--foreground)_35%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40`
   - `CTRL_BUTTON`: `CTRL_CHIP`과 같되 `h-10 px-4 font-medium`. 주 버튼만 `bg-[var(--ref-cat-1)] text-white border-transparent hover:opacity-90`.
   - `CTRL_CARD`: 카드 전체가 버튼일 때 `rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-4 text-left hover:border-[color-mix(in_oklab,var(--foreground)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]`. 오른쪽 위에 `ArrowUpRight` size-4 muted 아이콘으로 클릭 가능함을 표시.
4. **선택 상태**는 칩 테두리와 배경을 그 요소의 색으로: `border-color: {color}`, `background: color-mix(in oklab, {color} 10%, var(--card))`. 기본 색은 `var(--ref-cat-1)`, 바이어 요소는 바이어 `color`.
5. 유리 효과, 그라데이션, 번짐 그림자, 상시 애니메이션 금지. 격자 무늬 머리말 레이어(현재 코드)는 유지.

## 바이어 시그니처 색 적용
`BuyerChip` 컴포넌트 하나로 통일한다(같은 파일 안).
```tsx
function BuyerChip({ buyer, selected, disabled, onClick, size = "md" }: { buyer: ProtocolBuyer; selected?: boolean; disabled?: boolean; onClick?: () => void; size?: "md" | "sm" })
```
- `onClick`이 있으면 `CTRL_CHIP` 버튼, 없으면 테두리 없는 span(규칙 3).
- 이름 앞에 8px 정사각 색 견본(`rounded-[2px]`, 배경 `buyer.color ?? "var(--muted-foreground)"`).
- 선택 시 규칙 4를 바이어 `color`로.
- `size="sm"`은 `h-7 px-2`.
- 글자는 항상 `var(--foreground)`. 바이어 색을 글자색으로 쓰지 않는다(대비 부족).
- 표의 바이어 칸, BY BUYER 목록, 개정 이력, 카드 안 바이어 표시는 모두 이 컴포넌트나 같은 색 견본을 쓴다. 표의 바이어 칸은 칸 왼쪽에 3px 세로 색 띠(`box-shadow: inset 3px 0 0 {color}`).

## 1. 머리말 재구성
### 1-1. 제목 줄
- 왼쪽: `T_LABEL` `HANSOLL FABRIC R&D · TECHNICAL STANDARD`, `T_HEAD` `Buyer Test Protocol Matrix`, `T_BODY` muted `바이어별 원단 시험 방법과 기준`.
- 오른쪽: **버전 선택기**. `CTRL_CHIP` 버튼에 `T_CODE` `Ver. {master.version}` + muted `{master.revDate}` + 최신이면 작은 점과 `최신`, 아니면 warning 색 `과거 버전`. 누르면 아래로 목록(버전 내림차순): 각 줄 `Ver. 1.1  2026-10-13  담당 수정본 반영  [최신]`. 고르면 `selectVersion(version)`. 목록 맨 아래 muted 한 줄 `보는 버전은 이 브라우저에만 저장됩니다. 최신 버전은 관리자가 유지합니다.` 바깥 클릭과 Escape로 닫는다.
- `viewingLatest`가 false면 제목 줄 아래 전체 폭 띠: warning 테두리, `과거 버전 Ver. {version} ({revDate})을 보고 있습니다.` + `CTRL_CHIP` `최신 버전으로` (`selectVersion(null)`).

### 1-2. 실무 카드 4장 (기존 DOC NO, REV, SCOPE, STATUS 표제란과 검색창은 지운다)
`grid gap-3 sm:grid-cols-2 xl:grid-cols-4`. 카드 안 구성은 모두 같은 틀: 위 `T_LABEL`, 그 아래 큰 수치 `T_CODE`를 `text-[22px]`로 키운 것 하나만 예외 허용(카드 수치 전용 상수 `T_METRIC`), 그 아래 `T_BODY` 설명, 맨 아래 내용 줄.
1. `SOURCE CHECK` / `원문 대조 주의` — 수치 `verification.length`칸. 내용: 최대 3줄 `BuyerChip size sm` + 시험 no와 영문명(`T_CODE`). `CTRL_CARD`, 누르면 REVISIONS 탭의 `원문 대조 포인트` 구역으로 이동(`?tab=revisions#source-check`).
2. `LATEST UPDATE` / `최근 반영` — 수치 `latest.changes.length`칸, 설명 `Ver. {latest.version} · {latest.revDate}`. 내용: 바뀐 칸의 바이어를 중복 없이 `BuyerChip size sm`(클릭 없음)로 나열. `CTRL_CARD`, 누르면 REVISIONS 탭.
3. `LIGHT SOURCE` / `1차 판정 광원` — 수치는 가장 많은 광원 이름과 곳 수(예 `D65 · 11`). 내용: 1차 광원(`lightSources[0]`)별 곳 수를 한 줄 막대(높이 8px, 조각 사이 2px 틈, 조각 색은 `var(--ref-cat-1)`의 농도 차 `color-mix`로 100%, 70%, 45%, 25%, 그 이하는 muted)와 그 아래 범례 `D65 11  CWF 3  U30 1 ...`(`T_CODE`). 클릭 없음(테두리 없는 카드, 배경만 `var(--card)` + 1px 테두리 대신 상단 1px 선만).
   - 클릭 없는 카드도 다른 카드와 높이, 패딩을 맞춘다. 경계는 `border-t-2 border-[var(--border)]`만 쓴다.
4. `MANUAL COVERAGE` / `원문 매뉴얼 보유` — 수치 `{원문 있는 바이어 수} / {바이어 수}`. 원문 있음은 `useBuyerProtocols()` 항목의 `topic` 집합에 `buyer.manualTopic`이 있는 경우. 내용: 원문 없는 바이어 `BuyerChip size sm`(클릭 없음)와 `pendingBuyers` 이름 + muted `본표 미등재`. `CTRL_CARD`, 누르면 MANUALS 탭.

## 2. 탭
지금 탭 그대로(01 MATRIX 기준표 / 02 BY BUYER 바이어별 / 03 REVISIONS 개정 이력 / 04 SOURCE MANUALS 원문 매뉴얼). 글자만 규칙 1에 맞춘다(번호 `T_LABEL`, 영문 `T_LABEL`에 foreground, 한글 `T_BODY` muted).

## 3. MATRIX 탭: 검색 중심
### 3-1. 검색 패널 (탭 맨 위, 카드 하나)
두 줄 구성. 위 `T_TITLE` `기준 검색`, 오른쪽 muted `T_BODY` `바이어는 최대 4곳까지 나란히 비교합니다.`
- **BUYER** 구역: `T_LABEL` `BUYER` + 오른쪽 `T_CODE` `{선택 수} / 4`. 아래 바이어 19곳 `BuyerChip`을 `flex flex-wrap gap-2`. 4곳이 선택되면 나머지는 `disabled`, `title="최대 4곳까지 비교합니다"`. `선택 해제` `CTRL_CHIP`.
- **STANDARD** 구역: `T_LABEL` `STANDARD`. 입력창(h-10, `T_BODY`, 1px 테두리, rounded-[4px]) placeholder `시험 항목 또는 규격 코드 (예: Pilling, 필링, AATCC 135, pH)`. 입력하면 아래 제안 목록(최대 8줄): 기준표 시험 항목 중 영문명, 한글명, 시험 방법에 입력어가 들어간 것. 줄 형식 `1.06  Pilling  필링` (`T_CODE` no, `T_BODY` 이름). 제안을 고르면 **토큰**으로 입력창 위에 `CTRL_CHIP`(끝에 `X` 아이콘)으로 쌓인다(여러 개). 토큰 없이 글자만 있으면 그 글자를 자유 검색어로 쓴다.
- 오른쪽 아래 `CTRL_BUTTON` 주 버튼 `검색`(아이콘 `Search` size-4)과 `CTRL_CHIP` `초기화`. Enter도 검색.
- **검색을 눌러야 결과가 바뀐다.** 입력 상태(`draft`)와 적용 상태(`applied`)를 나눈다. 적용 상태는 URL `?tab=matrix&b=anf,ua&t=pilling,ph-level&q=...`에 둔다(공유와 뒤로가기용).
- 패널 아래 `T_LABEL` `QUICK` + 빠른 검색 `CTRL_CHIP` 5개: 기준표 `tests` 중 id가 `dimensional-to-home-laundering`, `pilling`, `crocking`, `light`, `ph-level`인 것의 한글명. 누르면 그 항목 토큰 하나로 바로 검색 적용(바이어 선택은 유지).

### 3-2. 결과
- 적용 상태가 비었으면: 빈 상태 상자(테두리 dashed, 가운데 `T_BODY` muted `바이어와 기준을 고르고 검색을 누르면 비교표가 나옵니다.`)와 그 아래 시험군 4개 도판(`GROUP_FIGURES`)을 한 줄에 작게(각 `max-w-[220px]`, 캡션 `§ n  {label}  {korean}  {항목 수}개` `T_LABEL`).
- 결과 대상 항목: 토큰이 있으면 그 항목들, 자유 검색어만 있으면 영문명, 한글명, 모든 칸의 method, requirement에 검색어가 들어간 항목(대소문자 무시). 둘 다 없고 바이어만 있으면 전체 항목.
- 결과 대상 바이어: 선택한 바이어(최대 4). 선택이 없으면 19곳 전부를 보여 주되 표 위에 muted `T_BODY` `바이어를 고르면 최대 4곳을 나란히 비교합니다.`
- 결과 머리: `T_LABEL` `RESULT` + `T_CODE` `{항목 수} TESTS × {바이어 수} BUYERS` + `Ver. {version}`.
- **항목마다 엑셀형 비교표 하나.**
  - 표 위 한 줄: `T_CODE` no, `T_TITLE` 영문명, `T_BODY` muted 한글명, 오른쪽에 그 항목의 시험군 `T_LABEL`.
  - 표는 `<table>`, `table-fixed`, `border-collapse`, 모든 칸 1px `var(--border)` 격자. 열 너비 `BUYER 200px`, `TEST METHOD 260px`, `REQUIREMENT` 나머지. 머리 행 배경 `color-mix(in oklab, var(--muted) 70%, transparent)`, 머리 글자 `T_LABEL`. 칸 안쪽 `px-3 py-2`, 세로 정렬 위.
  - 행 = 바이어. 바이어 칸은 3px 색 띠 + 바이어 이름(`T_BODY` font-medium) + 그 아래 `T_CODE` muted 1차 광원. 한 바이어에 조건이 여러 개면 조건마다 행을 나누고 바이어 칸은 `rowSpan`.
  - METHOD 칸 `T_CODE`. REQUIREMENT 칸 `T_BODY whitespace-pre-line`. `isNotApplicable`이면 `N/A` muted, 빈 칸은 muted `-`.
  - 표시 규칙(칸 아래 작은 줄은 `T_CODE` 11.5px 대신 `T_LABEL` 크기 쓰지 말고 `T_BODY`에 색만):
    - 원문 대조 불일치: 그 바이어 행 칸 배경 `color-mix(in oklab, var(--warning) 9%, transparent)`, 해당 칸 아래 warning 색 `원문: {source} ({doc})`.
    - 지금 보는 버전의 `changes`에 있는 칸: 칸 오른쪽 위 6px 원(`var(--ref-cat-1)`), 칸 아래 `var(--ref-cat-1)` 색 `Ver. {version} 수정`.
    - 다수 방법과 다른 METHOD: 칸 안 코드 뒤에 작은 표시 `다른 방법`(muted, 테두리 없음).
  - 표 머리는 `sticky top-0`(표 컨테이너 안). 가로 스크롤은 컨테이너 `overflow-x-auto`.

## 4. BY BUYER 탭
- 왼쪽 열 240px: 바이어 19곳을 세로로 `BuyerChip`(전체 폭, `justify-start`), 선택은 `?buyer=`. 맨 아래 `pendingBuyers`는 테두리 dashed 칩 `{name}  본표 미등재`.
- 오른쪽: 머리에 큰 색 견본 12px + `T_HEAD`보다 한 단계 작은 `T_TITLE`을 `text-xl`로(이 자리만 예외) 바이어 이름, 그 아래 `T_LABEL` `LIGHT SOURCE` `T_CODE` `D65 / CWF`, `T_LABEL` `SIGNATURE` `T_CODE` `{color} {colorName}`. 오른쪽에 `CTRL_CHIP` `원문 {n}건`(MANUALS 탭으로, 바이어 필터).
- 질의 회신(`notes`)은 테두리 없는 영역, 왼쪽 2px muted 선, `T_LABEL` `BUYER Q&A`, Q는 `T_BODY` font-medium, A는 `T_BODY`.
- 시험군별 엑셀형 표: 열 `NO.` 64px, `TEST` 220px, `METHOD` 240px, `REQUIREMENT`. 3-2 표와 같은 격자, 같은 표시 규칙. 조건 없는 항목은 METHOD, REQUIREMENT 칸에 muted `해당 없음`.

## 5. REVISIONS 탭
- 위: 구역 `VERSIONS` (`T_LABEL`). 기준표 버전들을 내림차순 세로 타임라인. 각 항목: 원 표식(최신은 채운 `var(--ref-cat-1)`, 과거는 빈 원), `T_CODE` `Ver. {version}`, `T_CODE` muted `{revDate}`, `T_BODY` `{label}`, 상태 `최신`(ref-cat-1) 또는 `과거 버전`(muted). 오른쪽 `CTRL_CHIP` `이 버전 보기`(지금 보는 버전이면 disabled + `보는 중`). 아래 바뀐 칸 표(`changes`): 열 `TEST`, `BUYER`(BuyerChip sm, 클릭 없음), `FIELD`, `이전`, `변경`. 이전과 변경은 `T_BODY whitespace-pre-line`, 변경 칸 배경 `color-mix(in oklab, var(--ref-cat-1) 8%, transparent)`. `changes`가 비면 muted `최초 버전`.
- 가운데: 구역 `SOURCE FILES` — 담당 수정본 목록: `BuyerChip sm`(buyerScope로 바이어 찾기), `T_CODE` revDate, `T_BODY` sourceFile, 상태 `Ver. {mergedVersion}에 반영` (diffs 0이면 `기준본과 같음`).
- 아래: 구역 `SOURCE CHECK` (id `source-check`, 카드 1에서 이 위치로 스크롤). 설명 `T_BODY` muted `취합본 값과 바이어 원문 매뉴얼이 다른 칸입니다. 기준표는 취합본 값을 유지하고, 원문 값을 함께 표시합니다.` 표 열 `TEST`, `BUYER`, `취합본`, `원문`, `근거 문서`.

## 6. SOURCE MANUALS 탭
기능은 지금 그대로. `?buyer=`(바이어 id)가 있으면 그 바이어 `manualTopic` 카드만. 위에 바이어 필터를 `BuyerChip` 줄로(원문 있는 바이어만, 하나 선택, 다시 누르면 해제).

## 7. 기타
- 푸터: 왼쪽 `T_LABEL` `SOURCE  Buyer별 Test protocols 취합본 · 담당 수정본 · Teams Test Protocols`, 오른쪽 `T_CODE` `Ver. {version} · {revDate}`.
- 로딩, 오류, 데이터 없음 문구는 지금 것 유지.

## 하지 말 것
- `src/data/protocol-matrix.ts`, `src/components/protocol/TechFigures.tsx`, `firestore.rules`, `references.ts`, `TechnicalReferences.tsx` 수정 금지.
- 바이어 이름, 색, 규격값을 코드에 넣지 말 것. 빠른 검색은 시험 항목 id 다섯 개만 허용.
- 차트 라이브러리 추가 금지. 막대는 div.
- `DialogContent`에 `relative`, `absolute`, `static` 금지.
- 파일 삭제 금지.

## 검증
- `npm run build` exit 0 한 번(타임아웃 300초).
- `git status --short`에 삭제 없음.
