# R334 BUYER PROTOCOLS 검토 대기 탭 (원문 매뉴얼 변경 후보 승인과 새 버전 반영)

상태: 미착수. 데이터 계약과 규칙은 끝났다(2026-10-13).
- Firestore `protocolReview`(소유자 전용, 규칙 배포 완료). 문서 1건 = 원문 매뉴얼 한 권에서 뽑은 변경 후보 묶음(배치).
- 타입, 구독, 저장 함수: `src/data/protocol-review.ts`. **이 파일은 고치지 말 것.** 쓰는 것: `useProtocolReviews()`, `liveValue`, `isStale`, `setReviewDecision`, `dismissReviewBatch`, `applyApprovedReviews(latestId, batchIds, label)`. 의미는 파일 주석 그대로다.
- 추출(후보를 만드는 쪽)은 이번 범위가 아니다. 지금은 Claude Code 세션이 배치를 넣는다. 화면은 배치가 0건일 때도 정상이어야 한다.

## 인코딩 주의
모든 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 문구를 글자 그대로 쓴다.

## 수정 파일: `src/routes/BuyerProtocols.tsx` 하나
이 파일은 R333 정리 규칙(파일 위의 `T_LABEL`, `T_BODY`, `T_CODE`, `T_TITLE`, `T_HEAD`, `T_METRIC`, `CTRL_CHIP`, `CTRL_BUTTON`, `CTRL_PRIMARY`, `CTRL_CARD`, `GRID_CELL`, `GRID_HEAD`, `BuyerChip`, `Swatch`, `selectedStyle`)을 쓴다. **새 요소도 반드시 이 상수와 컴포넌트만 쓴다.** 새 글자 크기, 새 버튼 모양을 만들지 말 것. 클릭 가능 = 테두리, 클릭 불가 = 테두리 없음 규칙 유지.

### 1. 탭 추가
`TabId`에 `"review"`, `TAB_ITEMS` 끝에 `{ id: "review", no: "05", label: "REVIEW", hint: "검토 대기" }`. 열린 배치의 `pending` 칸이 있으면 탭 hint 뒤에 `T_CODE` 숫자(그 칸 수)를 `var(--warning)` 색으로. URL `?tab=review`. `active` 판정에 `"review"` 추가.

### 2. 상단 실무 카드
`LATEST UPDATE` 카드는 그대로 둔다. 바꾸지 않는다. (카드 수를 늘리지 말 것.)

### 3. REVIEW 탭 구성 (`ReviewTab` 컴포넌트)
props: `latest`(최신 기준표, `useProtocolMatrix().latest`), `buyers`(최신의 buyers), `tests`(최신의 tests), `master`(지금 보는 버전).

- 지금 보는 버전이 최신이 아니면(`master.id !== latest.id`) 탭 맨 위 warning 테두리 띠: `검토와 반영은 최신 버전 기준입니다. 최신 버전으로 바꾼 뒤 진행하십시오.` 그 아래 내용은 보이되 승인, 거절, 반영 버튼은 모두 `disabled`.

#### 3-1. 머리 줄
왼쪽 `T_TITLE` `원문 매뉴얼 검토`, 그 아래 `T_BODY` muted `원문에서 뽑은 값 중 현재 기준표와 다른 칸만 올라옵니다. 승인한 칸만 새 버전에 반영됩니다.`
오른쪽 요약 `T_CODE`: `대기 {n}  승인 {n}  거절 {n}` (열린 배치 기준).
그 오른쪽 `CTRL_PRIMARY` `승인 칸 새 버전으로 반영` — 열린 배치의 `approved` 칸이 1개 이상일 때만 활성. 누르면 확인 창(앱에 있는 `askConfirm`이 있으면 그것, 없으면 기존 `Dialog`로 작은 확인 팝업): 제목 `Ver. {다음 버전}으로 반영합니다`, 본문 `승인 {n}칸을 반영해 새 버전을 만듭니다. 이전 버전은 과거 버전으로 남습니다.`, 입력칸 하나 `버전 설명`(기본값 `원문 매뉴얼 검토 반영`), 버튼 `반영`/`취소`. `반영`은 `applyApprovedReviews(latest.id, 열린 배치 id 목록, 설명)`. 결과가 null이면 `반영할 칸이 없습니다.`, 성공이면 `Ver. {version} 반영 완료: {applied}칸` + skipped가 있으면 ` (기준표가 바뀐 {skipped}칸 제외)`. 실패는 에러 메시지. 알림은 앱에 있는 `notify`가 있으면 그것, 없으면 팝업 안 문구로.
  - 다음 버전 번호 표시는 `latest.version`의 소수 자리를 1 올린 값(함수 안에서 계산, `1.1` -> `1.2`).

#### 3-2. 배치 목록 (열린 배치 먼저, 그다음 applied/dismissed를 `지난 검토` 접힘 구역으로)
배치마다 카드(테두리 1px, 클릭 불가 카드이므로 `CTRL_CARD` 아님, `rounded-[6px] border border-[var(--border)] bg-[var(--card)]`):
- 머리: `BuyerChip`(클릭 없음, buyers에서 `buyerId`로 찾기), `T_BODY` `sourceFile`, `T_CODE` muted `원문 {sourceDate ?? "-"}`, `T_CODE` muted `추출 {extractedAt 날짜}  {extractedBy}`, `T_CODE` muted `기준 Ver. {baseVersion}`. 오른쪽 상태: open이면 `CTRL_CHIP` `배치 버리기`(확인 후 `dismissReviewBatch`), applied면 `T_BODY` ref-cat-1 `Ver. {appliedVersion}에 반영됨`, dismissed면 muted `버림`.
- 열린 배치는 일괄 버튼 줄: `CTRL_CHIP` `신뢰도 높음 모두 승인`(confidence high이고 낡지 않은 pending 칸 전부 approved), `CTRL_CHIP` `남은 칸 모두 거절`. 각각 칸마다 `setReviewDecision`을 순서대로 호출(같은 배치 문서를 여러 번 쓰므로 **한 번에 하나씩 await**, 매번 최신 배치 객체로 호출: 직전 결과를 로컬로 반영한 items로 다음 호출).
- 본문 표(엑셀형, `GRID_HEAD`, `GRID_CELL`, `table-fixed`): 열 `TEST` 220px, `FIELD` 120px, `현재 값`, `원문 값`, `근거` 220px, `판정` 168px.
  - TEST: `T_CODE` no + 영문명, 그 아래 `T_BODY` muted 한글명. 조건 순번(variant)이 0이 아니면 `T_CODE` muted `조건 {variant+1}`.
  - FIELD: `METHOD`/`REQUIREMENT` (`T_CODE`).
  - 현재 값: `liveValue(latest, buyerId, item)`를 `T_BODY whitespace-pre-line`. `isStale`이면 칸 배경 warning 9%, 아래 warning `추출 이후 기준표가 바뀌었습니다. 다시 추출하거나 거절하십시오.`
  - 원문 값: `editedValue ?? proposed`, `T_BODY whitespace-pre-line`, 칸 배경 `color-mix(in oklab, var(--ref-cat-1) 8%, transparent)`. `editedValue`가 있으면 아래 muted `수정함 (원문: {proposed 첫 줄})`.
  - 근거: `T_CODE` muted `p.{page}`(없으면 `-`), 그 아래 `T_BODY` `“{quote}”`(최대 4줄, `line-clamp-4`, 전체는 title 속성). 신뢰도는 그 아래 `T_LABEL` `CONFIDENCE HIGH|MEDIUM|LOW`, low는 warning 색.
  - 판정: open 배치면 세로로 `CTRL_CHIP` 두 개(폭 꽉 채움) `승인`, `거절` + 텍스트 버튼 없이 `CTRL_CHIP` `값 고쳐 승인`. 현재 판정 버튼은 `selectedStyle()`(승인은 기본 ref-cat-1, 거절은 `var(--muted-foreground)`)로 표시, 다시 누르면 `pending`으로 되돌림. `값 고쳐 승인`은 칸 안에 textarea(3줄, `T_BODY`, 1px 테두리) + `CTRL_CHIP` `저장`/`취소`로 펼쳐 `setReviewDecision(batch, id, "approved", 값)`. 낡은 칸(`isStale`)은 `승인`과 `값 고쳐 승인`을 disabled(거절만 가능). 닫힌 배치는 판정 글자만 `T_BODY`(`승인`/`거절`/`대기`).
  - 행 정렬: 낡지 않은 pending 먼저, 그다음 approved, rejected, 낡은 칸 순. 같은 그룹 안에서는 TEST no 순.
- 배치가 하나도 없으면: dashed 테두리 상자 가운데 `T_BODY` muted 두 줄 `검토할 원문 매뉴얼이 없습니다.` / `새 매뉴얼을 Teams 바이어 폴더에 넣고 Claude Code에서 추출을 요청하면 여기에 올라옵니다.`

### 4. 기타
- `RevisionsTab`의 `SOURCE FILES`는 그대로 둔다.
- `useProtocolReviews()`는 `BuyerProtocols` 최상위에서 한 번만 부르고 필요한 곳에 내려준다(탭 배지와 ReviewTab).
- 로딩 중이면 탭 본문에 `T_BODY` muted `검토 목록을 불러오는 중입니다.`, 오류면 destructive 색으로 훅 메시지.

## 하지 말 것
- `src/data/protocol-review.ts`, `src/data/protocol-matrix.ts`, `src/components/protocol/TechFigures.tsx`, `firestore.rules`, `TechnicalReferences.tsx`, `references.ts` 수정 금지.
- 바이어 이름, 색, 규격값을 코드에 넣지 말 것.
- `DialogContent`에 `relative`, `absolute`, `static` 금지.
- 다른 탭(MATRIX, BY BUYER, REVISIONS, SOURCE MANUALS)의 동작과 모양을 바꾸지 말 것.
- 파일 삭제 금지.

## 검증
- `npm run build` exit 0 한 번(타임아웃 300초).
- `git status --short`에 삭제 없음.
