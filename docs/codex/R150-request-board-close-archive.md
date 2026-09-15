# R150 FABRIC REQUEST 보드 종결, 기록 스냅샷, 보관함

상태: 미착수. R148(보드 모델), R149(보드 탭 화면) 구현, 검증 완료 위에서 한다.

## 목적

개발이 끝난 보드를 **종결**하고, 그 순간의 스타일, 옵션, 공정 단계를 **스냅샷으로 고정 저장**한다. 종결 보드는 탭에서 빠지고 **보관함**에서 연도별로 몇 년 뒤에도 열어 본다. 필요하면 다시 연다.

## 사용자가 정한 규칙

- 종결과 다시 열기는 `canManageBoard`(만든 사람 또는 소유자).
- 스타일 결과는 진행중, 완료, 드롭, 보류. 종결 전 진행중(결과 미정)은 사람이 정해야 한다.
- 이력은 몇 년 뒤에도 본다. 작업 이력(auditLog)은 90일 보관이라 쓸 수 없다.

## 이미 있는 것(좌표)

- `src/data/schema.ts`: `RequestBoard`(status "진행" | "종결", closedAt/closedBy/closedByName, history), `RequestBoardEvent`(action에 "close", "reopen" 있음), `RequestStyle.result/resultAt`, `REQUEST_RESULTS`
- `src/data/request-board.ts`: `ALL_BOARDS`, `boardEvent`, `appendRequestHistory(before, after, boards, actor, now)`, `canManageBoard`, `resultOf`, `boardKindColor`
- `src/data/request-process-stage.ts`: `requestProcessStage(byLine, option)`, `ProcessStepKey`, `processStepColor(key)`
- `src/data/request-link.ts`: `requestDdStatus(byLine, option)` (`.flNo`)
- `src/data/request-template.ts`: `buildRequestWorkbook(styles)`, `requestTemplateFileName()`
- `src/data/cache.ts` 7행 `CACHE_KEYS`, `src/data/firestore-sync.ts` 24~30행 `MERGE_IDS`
- `src/store/useAppStore.ts` 72행 `requestBoards`, 142행 초기값, 206행 `saveRequests`, 213행 `saveRequestBoards`, 220행 `saveRequestsAndBoards`
- `tools/backup/weekly_backup.py` 27~52행 `KEYS`, `LABELS`, `SHEETS`
- `src/components/request/RequestBoardHeader.tsx`: props `board, styles, stageOf, canManage, onEdit`, 26행 오른쪽 끝 `보드 정보` 버튼
- `src/routes/FabricRequest.tsx`
  - 718행 `activeBoard` 상태(localStorage `fabric.request.activeBoard`), 719행 `boardDialog`
  - 745~750행 `openBoards`, `activeBoardInfo`, `readOnly = activeBoard === ALL_BOARDS`, 749행 활성 보드 되돌림 effect, `scoped`
  - 770~780행 근처 `actor`, `commitRequests`, `saveMutation`, `pushSnapshot`, `undoStack/redoStack`
  - 1363행 근처 전체 탭 `보드` 열 칩(보드를 찾으면 그 탭으로 이동)
  - 1472~1487행 `submitBoard`, `deleteBoard`
  - 1491~1496행 탭 줄(전체, 진행 보드, `새 보드`)
  - 1517행 `RequestBoardHeader` 사용, 1519행부터 표 카드

## 1. 데이터

### schema.ts

```ts
export interface RequestArchiveStage {
  reqId: string
  optId: string
  lineId?: string
  linked: boolean
  /** 종결 시점 칩 문구(단계 이름 또는 보류, 드롭, 반려, 대기) */
  label: string
  stepKey?: ProcessStepKey   // 현재 단계 key. 미연결이면 없음
  halted?: "보류" | "드롭" | "반려"
  currentIndex: number
  total: number
  flNo?: string
}

export interface RequestArchive {
  /** `${boardId}@${closedAt}`. 같은 보드를 다시 열고 또 종결하면 새 기록이 쌓인다. */
  archiveId: string
  boardId: string
  /** 종결 처리 직후의 보드 복사본(history 포함) */
  board: RequestBoard
  /** 종결 시점 소속 스타일의 깊은 복사본 */
  styles: RequestStyle[]
  stages: RequestArchiveStage[]
  closedAt: string
  closedBy: string
  closedByName: string
}
```

`ProcessStepKey`는 `request-process-stage.ts`에서 type import 한다(순환이 생기면 schema에 문자열 유니온으로 같은 값을 적는다).

### 저장 키

| 파일 | 조치 |
|---|---|
| `cache.ts` | `CACHE_KEYS` 끝에 `"requestArchive"` |
| `firestore-sync.ts` | `MERGE_IDS`에 `requestArchive: (item: { archiveId: string }) => item.archiveId` |
| `useAppStore.ts` | `AppState.requestArchive: RequestArchive[]`, 초기값 `[]`. `saveRequestArchive(list)`는 `setAppState` + `saveCache`만 한다. **`logAction`을 부르지 마라.** 스냅샷 전체가 변경점으로 펴져 작업 이력 문서가 수백 KB가 된다. 종결 기록은 보드 `history`에 남는다 |
| `weekly_backup.py` | `KEYS` 끝에 `"requestArchive"`, `LABELS`에 `"requestArchive": "REQUEST 보관함"`. `SHEETS`에는 넣지 않는다(중첩이 깊어 JSON 백업으로만 보관) |

### request-board.ts 추가

```ts
export const ARCHIVE_VIEW = "__archive"
export function unresolvedStyles(styles: readonly RequestStyle[]): RequestStyle[]   // resultOf === "진행중"
export function closeBoard(boards: readonly RequestBoard[], boardId: string, actor: BoardActor, memo: string, now?: string): RequestBoard[]
// status "종결", closedAt now, closedBy actor.email, closedByName actor.name, updatedAt now,
// history에 boardEvent(actor, "close", { to: memo.trim() || undefined })
export function reopenBoard(boards: readonly RequestBoard[], boardId: string, actor: BoardActor, now?: string): RequestBoard[]
// status "진행", closedAt/closedBy/closedByName 제거(undefined), updatedAt now, history에 "reopen"
// order는 진행 보드 최대 order + 1로 맨 뒤에 붙인다
export function buildBoardArchive(
  board: RequestBoard, styles: readonly RequestStyle[],
  stageOf: (option: RequestOption) => ProcessStage, flNoOf: (option: RequestOption) => string | undefined,
): RequestArchive
// styles는 JSON.parse(JSON.stringify())로 깊은 복사, stages는 모든 옵션마다 한 줄
// archiveId `${board.boardId}@${board.closedAt}`, closedAt/By/ByName은 board 값
export function actionText(event: RequestBoardEvent, styleName: (reqId: string) => string): string
```

`actionText` 문구(화살표 문자 금지):

| action | 문구 |
|---|---|
| create | `보드를 만듦` |
| update | `{필드명} 수정: {from}에서 {to}로` (필드명 name 이름, kind 종류, team 소팀, note 메모, createdBy 담당 이메일, createdByName 담당 이름) |
| close | `보드 종결` + to 있으면 `, 메모 {to}` |
| reopen | `보드 다시 엶` |
| add | `{스타일} 추가` (+ from 있으면 ` ({from}에서 옮겨 옴)`) |
| remove | `{스타일} 뺌` (+ to 있으면 ` ({to}로 옮김)`) |
| result | `{스타일} 결과 {from}에서 {to}로` |

`{스타일}`은 `styleName(target)`, 못 찾으면 event의 from 또는 to, 그것도 없으면 `스타일`.

## 2. 종결 흐름

### 머리 카드 (`RequestBoardHeader.tsx`)

props에 `onCloseBoard: () => void`를 더하고, `보드 정보` 버튼 옆에 `보드 종결` 버튼(outline, lucide `Archive`). `canManage`가 거짓이면 비활성과 같은 title.

### 종결 창 (새 파일 `src/components/request/RequestBoardCloseDialog.tsx`)

- props: `open`, `board`, `styles`(scoped), `onConfirm({ memo, fillResult })`, `onOpenChange`
- 본문
  - 결과 칩 4개 건수(`resultOf` 기준)
  - `unresolvedStyles(styles)`가 있으면 경고 상자: "결과가 정해지지 않은 스타일 {n}건이 있습니다." + Garment No. 목록(최대 8개, 넘으면 `외 n건`) + Select `남은 {n}건을 이 결과로 정리`(완료, 드롭, 보류). **고르기 전에는 종결 버튼 비활성.**
  - 종결 메모 textarea(선택)
  - 안내: "종결하면 보드가 탭에서 빠지고 지금 상태가 보관함에 기록으로 고정됩니다. 보드를 만든 사람과 소유자는 보관함에서 다시 열 수 있습니다."
- 버튼: 취소, `종결`

### FabricRequest.tsx 처리 `closeActiveBoard({ memo, fillResult })`

1. `activeBoardInfo`가 없거나 `canManageBoard`가 거짓이면 멈춘다.
2. `now` 한 번 만든다. `nextRequests`: 이 보드 스타일 중 `resultOf === "진행중"`이고 `fillResult`가 있으면 `{ result: fillResult, resultAt: now, updatedAt: now }`.
3. `history = appendRequestHistory(requests, nextRequests, requestBoards, actor, now)`로 결과 변경 이력을 붙인 보드 목록을 받는다.
4. `boards = closeBoard(history.boards, boardId, actor, memo, now)`
5. `closed = boards.find(...)`, `archive = buildBoardArchive(closed, nextRequests.filter(boardId), (option) => requestProcessStage(ddByLine, option), (option) => requestDdStatus(ddByLine, option).flNo)`
6. 저장: `saveRequestsAndBoards(nextRequests, boards, "edit")` 뒤 `saveRequestArchive([...requestArchive, archive])`. **`commitRequests`를 거치지 않는다**(이력을 3에서 이미 붙였다. 두 번 붙이지 마라). `undoStack`, `redoStack`을 비운다(종결은 Ctrl+Z로 되돌리지 않는다).
7. `setActiveBoard(ARCHIVE_VIEW)`, 보관함에서 방금 기록을 선택 상태로 연다.

## 3. 보관함

### 탭 줄 (1491~1496행)

`새 보드` 버튼 뒤에 `보관함` 버튼(lucide `Archive`, 배지는 종결 보드 수). 누르면 `setActiveBoard(ARCHIVE_VIEW)`, 선택 중이면 강조.

### 활성 보드 상태 (745~750행)

- `readOnly = activeBoard === ALL_BOARDS || activeBoard === ARCHIVE_VIEW`
- 749행 되돌림 effect 조건에 `activeBoard !== ARCHIVE_VIEW`를 더한다.
- `ARCHIVE_VIEW`면 `RequestBoardHeader`와 표 카드(1517행부터 표 카드 끝까지) 대신 `RequestArchiveView`를 그린다. `양식 내려받기` 버튼도 숨긴다(보관함 안에 따로 있다).
- `const [archiveSelected, setArchiveSelected] = useState<string | null>(null)`

### 새 파일 `src/components/request/RequestArchiveView.tsx`

- props: `archives: RequestArchive[]`, `boards: RequestBoard[]`(현재 상태, 다시 열기 판단용), `selectedId`, `onSelect(id | null)`, `canManage(board) => boolean`, `onReopen(boardId)`, `onDownload(archive)`
- 레이아웃: 카드 하나(표 카드와 같은 테두리, 상단 4px `var(--muted-foreground)`), 안에서 왼쪽 목록(너비 320px, 좁은 화면이면 위아래로 쌓음) + 오른쪽 상세.
- **왼쪽 목록**
  - 검색 Input(보드 이름, 소팀)
  - `closedAt` 연도 내림차순으로 묶고 연도 제목(`2026년`, 건수). 안에서는 최신 종결순.
  - 항목: 보드 이름(종류 색 점), 소팀, `M/D 종결`, 종결한 사람, 스타일 수, 결과 요약(`완료 n, 드롭 n, 보류 n`). 같은 보드의 기록이 여럿이면 이름 옆에 `n번째 종결`.
  - 기록이 없으면 "아직 종결한 보드가 없습니다."
- **오른쪽 상세**(선택 없으면 "왼쪽에서 보드를 고르세요.")
  - 머리: 이름, 종류 배지, 소팀, 만든 사람, 만든 날, 종결한 날과 사람, 메모(close 이벤트 to)
  - 버튼: `엑셀 내려받기`(`onDownload`), `다시 열기`(그 보드가 현재 `boards`에서 status "종결"이고, 이 기록이 그 보드의 가장 최근 기록이며, `canManage`일 때만 활성. 누르면 confirm "보드를 다시 열까요? 탭에 다시 나타나고 편집할 수 있습니다.")
  - 결과 칩 4개 건수
  - **스냅샷 표**(보기 전용, 가로 스크롤 상자 안): 옵션마다 한 줄, 옵션이 없는 스타일은 한 줄. 열: Garment No., Brand, 결과(칩), Opt, Yarn Detail, Cons., W'T, Color, Dyeing, Remark, 공정(종결 시점 `label`, 점 색은 `stepKey`면 `processStepColor`, 보류는 `var(--warning)`, 드롭과 반려와 대기는 `var(--muted-foreground)`), FL#. 같은 스타일 줄은 Garment No., Brand, 결과 칸을 첫 줄에만 적는다. 머리 sticky, 글자 11px, 줄 높이 촘촘하게.
  - **이력**: 접을 수 있는 구역 `이력 {n}건`, 최신순. 줄마다 `YYYY-MM-DD HH:mm`, 이름, `actionText(event, styleName)`. styleName은 기록 styles에서 reqId로 Garment No.를 찾는다.

### FabricRequest.tsx 연결

- `const requestArchive = useAppStore((state) => state.requestArchive)`
- `onReopen(boardId)`: `saveRequestBoards(reopenBoard(requestBoards, boardId, actor))`, `setActiveBoard(boardId)`
- `onDownload(archive)`: `downloadBlob(await buildRequestWorkbook(archive.styles), requestTemplateFileName())`, 실패하면 notice
- `canManage`: `(board) => canManageBoard(board, authUser?.email, isOwner)`
- 전체 탭 `보드` 열 칩(1363행 근처): 보드가 `종결`이면 이름 뒤에 muted `종결`을 붙이고, 누르면 `setArchiveSelected(그 보드 최근 기록 id)` 후 `setActiveBoard(ARCHIVE_VIEW)`.
- 종결 창 상태 `const [closeOpen, setCloseOpen] = useState(false)`, `RequestBoardHeader`에 `onCloseBoard={() => setCloseOpen(true)}`.

## 하지 말 것

- 스냅샷을 만든 뒤 고치거나 지우는 기능을 만들지 마라. 기록은 고정이다.
- 종결 보드의 스타일을 `requests`에서 지우지 마라. 다시 열면 그대로 이어서 쓴다.
- `saveRequestArchive`에서 작업 이력(`logAction`)을 남기지 마라.
- 종결 처리에서 `commitRequests`나 `saveMutation`을 쓰지 마라(이력 중복, 되돌리기 스택 오염).
- R147~R149의 판정(`requestProcessStage`, `requestDdStatus`, `appendRequestHistory`)을 바꾸지 마라.
- 표 `<colgroup>`을 지우지 마라. 행과 셀에 transform을 걸지 마라. `ref` 콜백 안에서 setState 하지 마라.
- 화면 문구와 주석에 `→ · — ⇒ ↔` 문자를 쓰지 마라.

## 검증

- `npx tsc --noEmit`이 오류 없이 끝나면 된다. `npm run build`는 돌리지 마라(명령 제한 2분). 전체 빌드와 동작 확인은 클로드가 한다.
