# R149 FABRIC REQUEST 보드 탭 화면

상태: 미착수. R148(보드 데이터 모델과 차트 이관) 구현, 검증 완료 위에서 한다.

## 목적

FABRIC REQUEST를 보드 탭으로 나눈다. 맨 앞 **전체 탭은 보기 전용**으로 모든 스타일을 모으고, 뒤에 사용자가 만든 보드 탭이 온다. 보드 탭에서만 편집한다. 보드 종결과 보관함은 R150이다(이번에 만들지 말 것).

## 사용자가 정한 규칙(R148과 같음)

- 스타일 하나는 보드 하나에만 속한다. 소속은 `RequestStyle.boardId`.
- 보드는 누구나 만든다. 보드 정보 수정은 `canManageBoard`(만든 사람 또는 소유자), 삭제는 `canDeleteBoard`(소유자, 빈 보드).
- 소팀은 자유 입력.

## R148에서 이미 있는 것(좌표)

- `src/data/schema.ts`: `RequestBoard`, `RequestBoardEvent`, `REQUEST_BOARD_KINDS`, `REQUEST_RESULTS`, `RequestResult`, `RequestStyle.boardId/result/resultAt`
- `src/data/request-board.ts`: `BoardActor`, `UNSORTED_BOARD_NAME`, `legacyBoardId`, `boardEvent`, `migrateChartsToBoards`, `canManageBoard`, `canDeleteBoard`
- `src/store/useAppStore.ts`: `requestBoards` 상태, `saveRequestBoards(boards, kind)`, `saveRequestsAndBoards(requests, boards, kind)`
- `src/routes/FabricRequest.tsx` 650~668행: `requestBoards`, `authUser`, 이관 useEffect(그대로 둔다)

## 현재 화면 좌표(`src/routes/FabricRequest.tsx`)

- 715~741행 상태. 718행 `const [chart, setChart] = useState("전체")`
- 743~746행 `chartOptions`, 753~765행 `visible`(stage, urgentOnly, chart로 거름)
- 769~777행 `upsert`, `patchStyle`(직접 `saveRequests` 호출), 779행 `remove`, 788행 `addOption`, 800행 `removeOption`
- 813~838행 `?focus=reqId` 효과(824~826행에서 stage, chart, urgentOnly를 풂)
- 847~848행 `pushSnapshot`, `saveMutation = (next) => { if (next === requests) return; pushSnapshot(); saveRequests(next) }`
- 849행 `appendBlankStyles`: `chart === "전체" ? "" : chart`, seq는 같은 chart 최대 + 1
- 1308~1315행 `downloadTemplate`(`buildRequestWorkbook(visible)`), 1317~1330행 `ingest`(`parseRequestWorkbook`, `mergeRequestStyles(requests, parsed.styles)`, `saveRequests(merged)`)
- 1444~1458행 단계 Tabs(전체, 분석, 개발), 1467~1475행 양식 내려받기, 업로드, 신규 의뢰 버튼
- 1481행 표 카드 상단 색(`stage` 기준)
- 1492~1498행 차트 `Select`
- 1537~1544행 빈 상태(`requests.length === 0`)
- 1725~1749행 셀 우클릭 메뉴, 1751~1760행 빈 곳 우클릭 메뉴
- 1787~1794행 `RequestEditor`(`chartOptions`, `onSave={upsert}`), 332행 `RequestEditor` 정의(차트 입력칸과 datalist)
- 그 밖에 `saveRequests(`를 직접 부르는 곳이 더 있다(`commitCell`, 되돌리기, 사진 올리기 콜백 등). **컴포넌트 안의 모든 직접 호출을 아래 `commitRequests`로 바꾼다.**

## 1. 보드 도우미 추가 (`src/data/request-board.ts`)

```ts
export const ALL_BOARDS = "__all"
export function nextBoardSeq(requests: readonly RequestStyle[], boardId: string): number   // 그 보드 최대 seq + 1
export function boardKindColor(kind: RequestBoardKind): string
// 시즌 개발 var(--chart-1), 바이어 미팅 var(--chart-3), 소재 시리즈 var(--chart-2), 기타 var(--muted-foreground)
export function resultOf(style: RequestStyle): RequestResult  // style.result ?? "진행중"
export function appendRequestHistory(
  before: readonly RequestStyle[], after: readonly RequestStyle[],
  boards: readonly RequestBoard[], actor: BoardActor, now?: string,
): { boards: RequestBoard[]; changed: boolean }
```

`appendRequestHistory` 규칙(reqId 기준 비교, 보드가 `boards`에 있을 때만 기록, 기록한 보드는 `updatedAt = now`):

- after에만 있고 boardId 있음: 그 보드에 `add`(`target: reqId`, `to: garmentNo`)
- before에만 있고 boardId 있음: 그 보드에 `remove`(`target: reqId`, `from: garmentNo`)
- 둘 다 있고 boardId가 다름: 옛 보드에 `remove`(`to: 새 보드 이름`), 새 보드에 `add`(`from: 옛 보드 이름`)
- 둘 다 있고 `resultOf`가 다름: after 보드에 `result`(`target: reqId`, `from`, `to`)
- 기록할 것이 없으면 `changed: false`와 입력 `boards` 그대로

## 2. 공정 색 공유 (`src/data/request-process-stage.ts`)

`export const PROCESS_STEP_ORDER: readonly ProcessStepKey[]`(GD 9단계 순서)와 `export function processStepColor(key: ProcessStepKey): string`(9단계 기준 `stepColor(인덱스, 9)`)를 더한다. 기존 함수 동작은 바꾸지 않는다.

## 3. 업로드 병합 키 (`src/data/request-template.ts` `mergeRequestStyles`, 383행)

`keyOf`를 `${style.boardId ?? legacyBoardId(style.chart)}::${garmentNo 대문자}`로 바꾼다. 같은 Garment No.가 다른 보드에 있어도 다른 스타일이다. 나머지 병합 규칙(reqId, 사진, lineId 이어받기)은 그대로.

## 4. 화면 (`src/routes/FabricRequest.tsx`)

### 활성 보드

- `const [activeBoard, setActiveBoard] = useState<string>(...)`. 초기값은 localStorage `fabric.request.activeBoard`(try/catch). 없거나 그 보드가 없거나 `status === "종결"`이면 `ALL_BOARDS`. 바뀔 때 저장한다.
- `openBoards` = `requestBoards.filter(status === "진행")`를 `order`, 이름 순 정렬.
- `activeBoardInfo` = 활성 보드 객체(전체면 null). 활성 보드가 사라지면(삭제, 동기화) `ALL_BOARDS`로 돌린다.
- `readOnly = activeBoard === ALL_BOARDS`.
- `scoped` = 전체면 `requests`, 보드면 `requests.filter(boardId === activeBoard)`.
- `visible`은 `scoped`에서 stage, urgentOnly로 거른다. **`chart` 상태, 차트 Select, `chartOptions`의 필터 용도는 없앤다.**

### 저장 길목

```ts
const actor = { email: authUser?.email ?? authUser?.uid ?? "unknown", name: authUser?.displayName?.trim() || authUser?.email?.split("@")[0] || "알 수 없음" }
const commitRequests = (next: RequestStyle[], kind: AuditKind = "edit"): boolean => {
  if (readOnly) { setNotice({ kind: "error", text: "전체 탭은 보기 전용입니다. 보드 탭에서 수정하세요." }); return false }
  if (next === requests) return false
  const history = appendRequestHistory(requests, next, requestBoards, actor)
  if (history.changed) saveRequestsAndBoards(next, history.boards, kind)
  else saveRequests(next, kind)
  return true
}
const saveMutation = (next: RequestStyle[]) => { if (next === requests || readOnly) { if (readOnly) commitRequests(next); return } pushSnapshot(); commitRequests(next) }
```

- 컴포넌트 안에서 `saveRequests(`를 직접 부르는 곳을 모두 `commitRequests(`로 바꾼다. 셀 편집 시작(`beginCellEdit`), 더블클릭 편집, URGENT 토글, 우클릭 삽입과 삭제, 붙여넣기, 잘라내기, 지우기, 채우기, 찾기 바꾸기, 되돌리기, 사진 올리기가 전부 이 길목을 지나야 한다. `beginCellEdit`는 readOnly면 편집기를 열지 않고 같은 안내를 띄운다. 복사는 전체 탭에서도 된다.

### 탭 줄 (1444~1458행 자리)

- 단계 Tabs 대신 **보드 탭 줄**을 둔다. `overflow-x-auto`로 가로 스크롤.
  - 첫 탭 `전체`: 배지 `requests.length`, 점 색 `var(--primary)`, 제목 옆 작은 글씨 "보기 전용"
  - 보드 탭: `openBoards` 순서, 점 색 `boardKindColor(kind)`, 배지는 그 보드 스타일 수, 탭 title에 "종류, 소팀"
  - 끝에 `새 보드` 버튼(Plus). `currentUserCanWrite()`가 거짓이면 비활성
- 오른쪽 버튼: `양식 내려받기`는 항상, `업로드`와 `신규 의뢰`는 readOnly면 숨긴다.
- 표 카드 상단 색(1481행)은 전체면 `var(--primary)`, 보드면 `boardKindColor`.

### 단계 필터 (1492~1498행 차트 Select 자리)

차트 Select를 지우고 그 자리에 작은 3칸 토글 `전체 / 분석 / 개발`(각 칸에 `scoped` 기준 건수)을 둔다. 기존 `stage` 상태를 그대로 쓴다.

### 보드 머리 카드 (새 파일 `src/components/request/RequestBoardHeader.tsx`)

보드 탭일 때만 탭 줄과 표 카드 사이에 둔다. props: `board`, `styles`(scoped), `stageOf: (option) => ProcessStage`, `canManage`, `onEdit`.

- 왼쪽: 보드 이름(굵게), 종류 배지(`boardKindColor`), 소팀, `만든 사람 {createdByName}`, 생성일 M/D, 메모 한 줄 말줄임
- 가운데: 결과 칩 4개 `진행중 n`, `완료 n`, `드롭 n`, `보류 n`(`resultOf` 기준)
- 오른쪽: 옵션 공정 분포 막대. 보드 모든 옵션의 `stageOf(option)`을 세어 `PROCESS_STEP_ORDER` 순서로 가로 누적 막대(높이 8px, rounded-full)를 그리고 색은 `processStepColor(key)`, 미연결(대기)은 `var(--muted)`, 멈춤(보류, 드롭, 반려)은 `var(--warning)`과 `var(--muted-foreground)`로 따로 센다. 아래에 건수가 있는 단계만 작은 범례(점 + 이름 + 수). 막대 조각 title은 "{단계} {n}건".
- `보드 정보` 버튼: `canManage`가 거짓이면 비활성, title "보드를 만든 사람과 소유자만 고칠 수 있습니다."

### 보드 만들기와 수정 (새 파일 `src/components/request/RequestBoardDialog.tsx`)

- props: `open`, `mode: "create" | "edit"`, `board?: RequestBoard`, `boards`, `teams: string[]`, `isOwner`, `canDelete`, `onSubmit(values)`, `onDelete()`, `onOpenChange`
- 입력: 이름(필수, 앞뒤 공백 제거, **진행 중 보드와 이름이 같으면 저장 막음**), 종류 Select(`REQUEST_BOARD_KINDS`), 소팀 Input + datalist(`teams`), 메모 textarea
- 수정 모드이고 `isOwner`면 `보드 담당` 두 칸(담당 이메일 `createdBy`, 담당 이름 `createdByName`)을 보인다. 이관 보드(`createdBy === "이관"`)를 담당자에게 넘기기 위한 것이다.
- 수정 모드이고 `canDelete`면 왼쪽 아래 `보드 삭제`(destructive, confirm)
- FabricRequest 쪽 처리
  - 만들기: `{ boardId: crypto.randomUUID(), status: "진행", order: 진행 보드 최대 order + 1, createdAt/updatedAt: now, createdBy: actor.email, createdByName: actor.name, history: [boardEvent(actor, "create", { to: name })], team, note, kind, name }`를 `saveRequestBoards`로 저장하고 그 보드로 탭을 옮긴다.
  - 수정: 바뀐 필드마다 `boardEvent(actor, "update", { target: 필드명, from, to })`. **이름이 바뀌면 그 보드 스타일의 `chart`도 새 이름으로 바꿔** `saveRequestsAndBoards`로 한 번에 저장한다(엑셀 양식 차트 열이 보드 이름을 따라가게).
  - 삭제: `requestBoards`에서 빼고 `saveRequestBoards`, 탭은 전체로.

### 보드 안의 스타일

- `appendBlankStyles`: `boardId = activeBoard`, `chart = activeBoardInfo.name`, `seq = nextBoardSeq(requests, activeBoard)`부터. readOnly면 안내만.
- `upsert`: 새 스타일이면 `boardId`, `chart`, `seq`(0이면 `nextBoardSeq`)를 활성 보드로 채운다. 기존 스타일은 boardId를 바꾸지 않는다.
- `RequestEditor`: `chartOptions` prop과 차트 입력칸, datalist를 없애고 읽기 전용 `보드` 표시(`boardName` prop)로 바꾼다.
- 빈 상태(1537행): 조건을 `scoped.length === 0`으로. 보드 탭이면 "이 보드에 아직 스타일이 없습니다. 신규 의뢰나 빈 곳 우클릭으로 추가하세요.", 전체 탭이면 기존 문구에 "보드 탭에서 추가하세요."를 붙인다.

### 결과 열

- `COLUMN_GROUPS`의 `request` 그룹 맨 앞에 `{ id: "result", label: "결과", width: 76, scope: "style", align: "center" }`.
- `editKindOf("result")`는 새 kind `"result"`. `CellEditor`에 `REQUEST_RESULTS` Select 분기(construction 분기와 같은 모양, `__none` 없이 네 값).
- 표시(`cellValue`): 칩. 진행중 `var(--chart-1)` 연한 배경, 완료 `var(--chart-2)`, 드롭 muted + line-through, 보류 `var(--warning)`. `resultOf`로 비어 있으면 진행중.
- `updateCell` 스타일 분기: `result`면 값이 `REQUEST_RESULTS`에 없으면(빈 값은 진행중으로 본다) `skipped: "result"`, 맞으면 `{ result: 값, resultAt: now }`. `SkipReason`, `SkipCounts`, `noticeSkips`에 `result`("결과 목록에 없는 n칸")를 더한다.
- 이력은 `commitRequests`의 `appendRequestHistory`가 남긴다. 따로 쓰지 마라.

### 다른 보드로 옮기기

- 셀 우클릭 메뉴(1747행 스타일 수정 버튼 앞)에 보드 탭일 때만 `다른 보드로 옮기기` 항목.
- 누르면 작은 Dialog(같은 `RequestBoardDialog.tsx`에 `MoveStyleDialog` export): 현재 보드를 뺀 진행 보드 Select, `옮기기` 버튼.
- 처리: 그 스타일 `boardId = 대상`, `chart = 대상 이름`, `seq = nextBoardSeq(requests, 대상)`, `updatedAt = now`로 `saveMutation`. 옵션 `lineId`는 그대로라 DD 연결이 유지된다.

### 전체 탭 전용

- `visibleColumns`에서 전체 탭이면 `garmentNo` 뒤에 보기 전용 열 `{ id: "boardName", label: "보드", width: 120, scope: "style" }`을 끼운다(FIXED 아님, editKind null). 칸에는 보드 이름 칩(`boardKindColor` 점), 누르면 그 보드 탭으로 이동. boardId가 없거나 보드를 못 찾으면 `미분류` muted.
- 셀 우클릭 메뉴는 전체 탭에서 `복사`, `줄 전체 선택`, 그리고 `보드 탭에서 열기`만 보인다. 빈 곳 우클릭 메뉴는 열지 않는다.

### 업로드와 내려받기

- `ingest`: readOnly면 안내만. 파싱한 스타일 전부에 `boardId = activeBoard`, `chart = 보드 이름`을 넣은 뒤 `mergeRequestStyles`. 원래 차트 열 값이 보드 이름과 다른 스타일이 있으면 알림 뒤에 "차트 열 값 n건은 무시하고 현재 보드로 올렸습니다."를 붙인다. 저장은 `commitRequests(merged, "upload")`.
- `downloadTemplate`: 지금처럼 `visible`을 내보낸다(보드 탭이면 그 보드, 전체면 전체). 파일명 앞에 보드 이름을 붙이지 않는다(파일명 규칙 유지).

### focus 효과 (813~838행)

`chart` 해제 대신: 스타일에 `boardId`가 있고 그 보드가 진행 중이면 `setActiveBoard(style.boardId)`, 아니면 `ALL_BOARDS`. stage, urgentOnly 해제와 스크롤, 강조는 그대로.

## 하지 말 것

- 보드 종결, 결과 미정 확인, 보관 스냅샷(`requestArchive`), 보관함 화면을 만들지 마라(R150).
- `RequestStyle.chart` 필드와 엑셀 양식의 차트 열을 지우지 마라. 차트 값은 보드 이름을 따라가게만 한다.
- R148 이관 useEffect(650~668행)를 바꾸지 마라.
- `requestDdStatus`, `requestProcessStage`의 기존 판정을 바꾸지 마라.
- 보드 쪽에 스타일 id 목록을 저장하지 마라.
- 표 `<colgroup>`을 지우지 마라(CLAUDE.md 규칙). 행과 셀에 transform을 걸지 마라.
- 화면 문구에 `→ · — ⇒ ↔` 문자를 쓰지 마라.
- `ref` 콜백 안에서 setState 하지 마라.

## 검증

- `npx tsc --noEmit`이 오류 없이 끝나면 된다. **`npm run build`는 돌리지 마라.** 도구 명령 제한 2분에 걸려 지난번 실행이 끊겼다. 전체 빌드와 동작 확인은 클로드가 한다.
