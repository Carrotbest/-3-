# R335 BUYER PROTOCOLS 검토 탭 (원문 매뉴얼 변경 후보 승인, 새 버전 반영)

상태: 미착수. R334 지시서는 버린 R333 화면 기준이라 쓰지 않는다. 이 문서가 대체한다(2026-10-13).

## 전제
- 화면은 배포본 `src/routes/BuyerProtocols.tsx`(R332 최초안 + 바이어 색 + 필터 그리드 + 테두리 탭)다. R333의 `T_LABEL`, `CTRL_CHIP`, `BuyerChip` 같은 상수와 컴포넌트는 **이 파일에 없다. 만들지 말 것.** 지금 파일에 있는 것만 쓴다: `FILTER_BUTTON`, `GROUP_ON`, `Swatch`, `buyerBar`, `buyerColor`, `firstLine`, `fieldLabel`, 그리고 `RevisionsTab`의 표 마크업 모양(테두리 표, `font-mono text-[10px] uppercase tracking-[0.14em]` 머리, `text-[13px]` 본문, `px-3 py-2` 칸).
- 데이터 계약은 `src/data/protocol-review.ts` 그대로다. **이 파일은 고치지 말 것.** 쓰는 것: `useProtocolReviews()`, `liveValue`, `isStale`, `setReviewDecision`, `dismissReviewBatch`, `applyApprovedReviews(latestId, batchIds, label)`, 타입 `ReviewBatch`, `ReviewItem`, `ReviewDecision`.
- 기준표 최신본은 `useProtocolMatrix()`의 `latest`다(이미 `src/data/protocol-matrix.ts`가 반환한다). 화면에는 버전 선택기가 없다. 검토와 반영은 언제나 `latest` 기준이다.
- 배치는 지금 0건이다. 추출 스크립트는 이번 범위가 아니다. 0건일 때도 화면이 정상이어야 한다.

## 인코딩 주의
모든 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 문구를 글자 그대로 쓴다.

## 수정 파일: `src/routes/BuyerProtocols.tsx` 하나

### 1. 탭
- 20행 `type TabId`에 `"review"`를 더한다.
- 23행 `TAB_ITEMS` 끝에 `{ id: "review", no: "05", label: "REVIEW", hint: "검토 대기" }`.
- `BuyerProtocols`의 `active` 판정(363행)에 `"review"`를 더한다. URL은 `?tab=review`.
- `TabNav`(136행): 그리드를 `grid-cols-2 sm:grid-cols-5`로. 칸 테두리 클래스는 index 기준으로 되어 있다(`index > 0`, `index >= 2`, `index === 2`). 5칸에 맞게 고친다: sm 이상은 첫 칸 빼고 모두 `border-l`, 모바일 2열은 홀수 index만 `border-l`, index 2 이상은 모바일에서 `border-t`(sm에서 `sm:border-t-0`). 모양(높이 h-12, 위 3px 강조 막대, 색)은 그대로.
- `TabNav`에 prop `badges?: Partial<Record<TabId, number>>`를 더한다. 값이 1 이상이면 hint 뒤에 `font-mono text-[10px] text-[var(--warning)]` 숫자를 붙인다. 값은 열린 배치(status open)의 `decision === "pending"`이면서 `isStale`가 아닌 칸 수다.

### 2. 훅 위치
- `BuyerProtocols` 최상위에서 `useProtocolMatrix()` 구조분해에 `latest`를 더하고, `useProtocolReviews()`를 한 번만 부른다. 결과를 `TabNav`의 badges와 `ReviewTab`에 내려준다.
- `ReviewTab`은 `latest`가 null이면 `master`를 쓴다(둘 다 null이면 이미 위에서 "등록된 기준표가 없습니다"로 끝난다).

### 3. `ReviewTab` 컴포넌트 (새로, `RevisionsTab` 아래에)
props: `latest: ProtocolRevision`, `batches: ReviewBatch[]`, `loading: boolean`, `error: string`.
`buyersById`, `testsById`는 `latest.buyers`, `latest.tests`로 만든다.

#### 3-1. 머리 줄 (`flex flex-wrap items-end justify-between gap-3`)
- 왼쪽: `h2 text-sm font-semibold` `원문 매뉴얼 검토`, 아래 `text-sm text-[var(--muted-foreground)]` `원문에서 뽑은 값 중 현재 기준표와 다른 칸만 올라옵니다. 승인한 칸만 새 버전에 반영됩니다.`
- 오른쪽: `font-mono text-xs` `대기 {n}  승인 {n}  거절 {n}`(열린 배치 전체 칸 기준, 낡은 칸은 대기에서 빼고 따로 `낡음 {n}`을 붙인다. 0이면 낡음은 생략). 그 오른쪽에 주 버튼 `승인 칸 새 버전으로 반영`:
  `inline-flex h-9 items-center rounded-[4px] border border-transparent bg-[var(--ref-cat-1)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40`. 열린 배치에 `approved`이면서 `isStale` 아닌 칸이 1개 이상일 때만 활성.

#### 3-2. 반영 확인 팝업
`@/components/ui/dialog`의 `Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle`을 쓴다(`TechnicalReferences.tsx`가 같은 것을 쓴다). **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 말 것.** 폭은 `sm:max-w-[480px]`.
- 제목 `Ver. {다음 버전}으로 반영합니다`. 다음 버전은 `latest.version`(없으면 `"1.0"`)의 소수 자리를 1 올린 값을 컴포넌트 안 작은 함수로 계산(`1.1` -> `1.2`).
- 설명 `승인 {n}칸을 반영해 새 버전을 만듭니다. 이전 버전은 과거 버전으로 남습니다.`
- 본문: 라벨 `버전 설명` + `input`(기본값 `원문 매뉴얼 검토 반영`, `h-9 w-full rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-3 text-sm`).
- 버튼: `취소`(FILTER_BUTTON 모양, `w-auto`), `반영`(3-1 주 버튼 모양). 처리 중에는 두 버튼 disabled, `반영` 글자는 `반영 중…`.
- `반영` = `applyApprovedReviews(latest.id, 열린 배치 id 목록, 설명.trim() || "원문 매뉴얼 검토 반영")`.
  - null이면 팝업 안 문구 `반영할 칸이 없습니다.`
  - 성공이면 팝업을 닫고 머리 줄 아래 한 줄 알림(`text-sm text-[var(--ref-cat-1)]`) `Ver. {version} 반영 완료: {applied}칸`, skipped가 1 이상이면 ` (기준표가 바뀐 {skipped}칸 제외)`를 덧붙인다. 알림은 다음 동작 전까지 남는다.
  - 예외면 팝업 안 `text-sm text-[var(--destructive)]`에 `error.message`(없으면 `반영하지 못했습니다.`).

#### 3-3. 배치 카드
정렬: 열린 배치(`open`) 먼저, 그 안에서는 `extractedAt` 내림차순(훅이 이미 그렇게 준다). `applied`와 `dismissed`는 아래 `지난 검토 {n}` 접힘 구역(기본 접힘, `<details>`가 아니라 버튼 토글, FILTER_BUTTON 모양 `w-auto`)에 넣는다.

카드 = `border border-[var(--border)] bg-[var(--card)]`에 왼쪽 바이어 색 띠(`style={buyerBar(buyer)}`).
- 머리(`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] px-4 py-3`):
  `<Swatch buyer={buyer} />` + 바이어 이름(`text-sm font-semibold`, 바이어를 못 찾으면 `buyerId` 그대로), `text-xs` `sourceFile`, `font-mono text-[11px] text-[var(--muted-foreground)]` `원문 {sourceDate ?? "-"}`, `추출 {extractedAt 앞 10자} {extractedBy}`, `기준 Ver. {baseVersion}`.
  오른쪽 끝(`ml-auto`): open이면 `배치 버리기` 버튼(FILTER_BUTTON 모양, `w-auto`). 누르면 `window.confirm("이 배치를 버립니다. 판정 기록은 남지만 반영 대상에서 빠집니다.")` 후 `dismissReviewBatch(batch)`. applied면 `text-xs text-[var(--ref-cat-1)]` `Ver. {appliedVersion}에 반영됨`, dismissed면 `text-xs text-[var(--muted-foreground)]` `버림`.
- 열린 배치는 머리 아래 일괄 줄(`flex flex-wrap gap-2 px-4 py-2 border-b border-[var(--border)]`): `신뢰도 높음 모두 승인`, `남은 칸 모두 거절`(둘 다 FILTER_BUTTON 모양 `w-auto`).
  - 대상: 앞 버튼은 `confidence === "high"`이고 `decision === "pending"`이고 낡지 않은 칸. 뒤 버튼은 `decision === "pending"`인 칸 전부(낡은 칸 포함).
  - **`setReviewDecision`은 배치 문서의 items 배열 전체를 덮어쓴다.** 그러니 칸마다 한 번씩 부르되 **순서대로 await**하고, 매번 직전 결과를 로컬에서 반영한 배치 객체(`{ ...batch, items: 갱신한 items }`)로 부른다. `Promise.all`로 동시에 부르지 말 것. 앞 쓰기가 뒤 쓰기에 지워진다. 진행 중에는 그 카드의 모든 판정 버튼을 disabled.
- 표(`overflow-x-auto`, `table-fixed w-full min-w-[960px] border-collapse text-left text-[13px]`, 머리는 `RevisionsTab` 표 머리와 같은 클래스). 열과 `<colgroup>` 폭: `TEST` 220px, `FIELD` 110px, `현재 값`(나머지), `원문 값`(나머지), `근거` 220px, `판정` 150px.
  - TEST: `font-mono text-xs` `{test.no} {test.name}`, 아래 `text-xs text-[var(--muted-foreground)]` `{test.korean}`. `variant > 0`이면 그 아래 `font-mono text-[11px] text-[var(--muted-foreground)]` `조건 {variant + 1}`. 시험을 못 찾으면 `testId` 그대로.
  - FIELD: `fieldLabel(item.field)`, `font-mono text-xs`.
  - 현재 값: `liveValue(latest, batch.buyerId, item)`, `whitespace-pre-line`. 빈 값이면 muted `-`. `isStale`이면 칸 배경 `color-mix(in oklab, var(--warning) 9%, transparent)`, 아래 `text-xs text-[var(--warning)]` `추출 이후 기준표가 바뀌었습니다. 다시 추출하거나 거절하십시오.`
  - 원문 값: `item.editedValue ?? item.proposed`, `whitespace-pre-line`, 칸 배경 `color-mix(in oklab, var(--ref-cat-1) 8%, transparent)`. `editedValue`가 있으면 아래 `text-xs text-[var(--muted-foreground)]` `수정함 (원문: {firstLine(item.proposed)})`.
  - 근거: `font-mono text-[11px] text-[var(--muted-foreground)]` `p.{page}`(없으면 `-`), 아래 `text-xs` `“{quote}”`(`line-clamp-4`, `title`에 전문, quote 없으면 생략), 아래 `font-mono text-[10px] uppercase tracking-[0.14em]` `CONFIDENCE {HIGH|MEDIUM|LOW}`, low만 `text-[var(--warning)]`, 나머지 muted. `note`가 있으면 맨 아래 `text-xs text-[var(--muted-foreground)]`.
  - 판정(열린 배치): 세로로 버튼 셋, 각각 FILTER_BUTTON 모양(이미 `w-full`): `승인`, `거절`, `값 고쳐 승인`.
    - 현재 판정 버튼은 선택 모양: 승인은 `GROUP_ON` 클래스, 거절은 `border-[var(--muted-foreground)] bg-[var(--muted)]/40`. 선택된 버튼을 다시 누르면 `pending`으로 되돌린다.
    - 낡은 칸은 `승인`, `값 고쳐 승인` disabled(`disabled:opacity-40` 추가). 거절만 된다.
    - `값 고쳐 승인`은 그 칸 안에 `textarea`(rows 3, 기본값 `editedValue ?? proposed`, `w-full rounded-[4px] border border-[var(--border)] bg-[var(--card)] p-2 text-[13px]`)와 `저장`, `취소` 버튼을 펼친다. `저장` = `setReviewDecision(batch, item.id, "approved", 값)`.
    - 쓰기 실패는 카드 머리 아래 `text-xs text-[var(--destructive)]` 한 줄 `판정을 저장하지 못했습니다.`
  - 판정(닫힌 배치): `text-sm` `승인` / `거절` / `대기` 글자만.
  - 행 정렬: 낡지 않은 pending, approved, rejected, 낡은 칸 순. 같은 그룹 안은 `test.no` 숫자 순, 그다음 variant, field(method 먼저).

#### 3-4. 빈 상태, 로딩, 오류
- 로딩: `text-sm text-[var(--muted-foreground)]` `검토 목록을 불러오는 중입니다.`
- 오류: `text-sm text-[var(--destructive)]` 훅의 `error`.
- 배치 0건(열린 것과 지난 것 모두): `border border-dashed border-[var(--border)] px-5 py-12 text-center`에 두 줄 muted `검토할 원문 매뉴얼이 없습니다.` / `새 매뉴얼을 Teams 바이어 폴더에 넣고 Claude Code에서 추출을 요청하면 여기에 올라옵니다.`
- 열린 배치 0건이고 지난 검토만 있으면 위 빈 상자 대신 한 줄 muted `열린 검토가 없습니다.` 후 지난 검토 토글.

### 4. 연결
`BuyerProtocols`의 탭 본문(`aria-live` div)에 `{active === "review" ? <ReviewTab latest={latest ?? master} batches={reviews.batches} loading={reviews.loading} error={reviews.error} /> : null}`.

## 하지 말 것
- `src/data/protocol-review.ts`, `src/data/protocol-matrix.ts`, `src/components/protocol/TechFigures.tsx`, `firestore.rules`, `src/routes/TechnicalReferences.tsx`, `src/data/references.ts` 수정 금지.
- R333 상수나 컴포넌트(`T_LABEL`, `T_BODY`, `CTRL_CHIP`, `BuyerChip`, `selectedStyle` 등)를 새로 만들지 말 것. 버전 선택기, 실무 카드, 검색 패널을 만들지 말 것. 박향근이 그 화면을 버렸다.
- 바이어 이름, 색, 규격값을 코드에 넣지 말 것. 공개 저장소다.
- MATRIX, BY BUYER, REVISIONS, SOURCE MANUALS 탭의 동작과 모양을 바꾸지 말 것(TabNav 5칸 조정만 예외).
- 표 칸 안에 `backdrop-filter`, 번짐 그림자, 상시 애니메이션 금지.
- 파일 삭제 금지. 커밋, 푸시 금지.

## 검증
- `npm run build` 한 번, exit 0(타임아웃 300초).
- `git status --short`에 `M src/routes/BuyerProtocols.tsx`와 이 문서만.
