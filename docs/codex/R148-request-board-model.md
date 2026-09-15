# R148 FABRIC REQUEST 보드 데이터 모델과 차트 이관

상태: 미착수

## 목적

FABRIC REQUEST를 사용자가 만드는 **보드** 단위로 나누기 위한 데이터 기반을 만든다. 화면(탭, 보드 만들기, 종결, 보관함)은 R149, R150에서 한다. **이번에는 데이터 모델, 저장, 동기화, 백업, 기존 차트 이관만 한다.**

## 사용자가 정한 규칙

1. **스타일 하나는 보드 하나에만 속한다.** 통합원단부 1팀이나 사업부 담당이 각자 보드를 만들고 스타일 샘플을 의뢰한다. Garment No.나 참조 FL이 같은 스타일이 여러 보드에 있을 수 있지만 옵션과 설계 방향이 달라 서로 다른 스타일이다. 그래서 보드 소속은 스타일의 필드(`boardId`)로 둔다. 보드 쪽에 스타일 목록을 따로 두지 않는다.
2. 보드 종결은 만든 사람과 소유자, 삭제는 소유자만이고 빈 보드일 때만이다.
3. 소팀 이름은 자유 입력이다.
4. 기존 차트명(`RequestStyle.chart`, 예: `26.FEB EU MARKET`)은 같은 이름의 보드로 자동 이관한다.

## 확인한 사실(좌표)

- 스타일 타입: `src/data/schema.ts` 110행 `export interface RequestStyle`. `chart: string`이 소속 차트명이다.
- 캐시 키: `src/data/cache.ts` 7행 `CACHE_KEYS`. `loadAllCache`(76행)는 값이 null, undefined인 키를 버리므로 새 키의 초기값 `[]`이 유지된다.
- 동기화 병합: `src/data/firestore-sync.ts` 24~29행 `MERGE_IDS`. `requests: (item) => item.reqId`처럼 id 함수로 3방향 병합한다. 여기에 없는 키는 병합 없이 덮어쓰기라 동시 편집이 사라진다(CLAUDE.md R121 주의).
- 스토어: `src/store/useAppStore.ts` 55~81행 `AppState`, 103~151행 `createInitialAppState`(140행 `requests: []`), 204~209행 `saveRequests`.
  ```ts
  export function saveRequests(requests: RequestStyle[], kind: AuditKind = "edit"): void {
    const before = useAppStore.getState().requests
    setAppState({ requests })
    void saveCache("requests", requests)
    void logAction({ kind, screen: "request", changes: diffRequests(before, requests) })
  }
  ```
- 작업 이력: `src/data/audit.ts` 138행 `diffRequests = (before, after) => diffByKey(before, after, (item) => item.reqId)`.
- 쓰기 권한: `src/data/auth.ts`의 `currentUserCanWrite()`(firestore-sync.ts가 import해 씀). FABRIC REQUEST 화면에는 별도 쓰기 게이트가 없다.
- 로그인 사용자: `useAuthStore((state) => state.user)`는 Firebase `User`(email, displayName), `state.isOwner`.
- 주간 백업: `tools/backup/weekly_backup.py` 27~51행 `KEYS`, `LABELS`, `SHEETS`. 주석대로 `CACHE_KEYS`와 같게 유지한다.
- 화면: `src/routes/FabricRequest.tsx` 644행 근처 `const requests = useAppStore((state) => state.requests)`.

## 데이터 모델 (`src/data/schema.ts`)

`RequestStyle`에 선택 필드를 더한다(옛 데이터에는 없다).

```ts
  /** 소속 보드. R148 이관 전 데이터에는 없다. */
  boardId?: string
  /** 이 보드에서의 결과. 비어 있으면 진행중으로 본다. */
  result?: RequestResult
  /** 결과를 정한 시각(ISO) */
  resultAt?: string
```

새 타입과 상수:

```ts
export const REQUEST_BOARD_KINDS = ["시즌 개발", "바이어 미팅", "소재 시리즈", "기타"] as const
export type RequestBoardKind = (typeof REQUEST_BOARD_KINDS)[number]
export const REQUEST_RESULTS = ["진행중", "완료", "드롭", "보류"] as const
export type RequestResult = (typeof REQUEST_RESULTS)[number]

export interface RequestBoardEvent {
  at: string          // ISO
  by: string          // 이메일, 없으면 uid
  name: string        // 표시 이름
  action: "create" | "update" | "close" | "reopen" | "add" | "remove" | "result"
  target?: string     // reqId 등
  from?: string
  to?: string
}

export interface RequestBoard {
  boardId: string
  name: string
  kind: RequestBoardKind
  /** 소팀. 자유 입력 */
  team: string
  note: string
  status: "진행" | "종결"
  order: number
  createdAt: string
  createdBy: string
  createdByName: string
  closedAt?: string
  closedBy?: string
  closedByName?: string
  updatedAt: string
  /** 몇 년 뒤에도 보는 이력. 작업 이력(auditLog)은 90일만 보관하므로 여기 따로 남긴다. */
  history: RequestBoardEvent[]
}
```

## 보드 도우미 (새 파일 `src/data/request-board.ts`)

```ts
export interface BoardActor { email: string; name: string }
export const UNSORTED_BOARD_NAME = "미분류"
export function legacyBoardId(chart: string): string          // `legacy:${chart.trim() || UNSORTED_BOARD_NAME}`
export function boardEvent(actor: BoardActor, action: RequestBoardEvent["action"], fields?: Partial<Pick<RequestBoardEvent, "target" | "from" | "to">>, now?: string): RequestBoardEvent
export function migrateChartsToBoards(requests: readonly RequestStyle[], boards: readonly RequestBoard[], actor: BoardActor, now?: string): { requests: RequestStyle[]; boards: RequestBoard[]; changed: boolean }
export function canManageBoard(board: RequestBoard, email: string | null | undefined, isOwner: boolean): boolean   // isOwner || board.createdBy === email
export function canDeleteBoard(board: RequestBoard, requests: readonly RequestStyle[], isOwner: boolean): boolean  // isOwner && 그 boardId 스타일 0건
```

`migrateChartsToBoards` 규칙:

- `boardId`가 없는 스타일만 대상이다. 이미 `boardId`가 있는 스타일과 보드는 건드리지 않는다.
- 이름은 `chart.trim()`, 비었으면 `"미분류"`. `boardId`는 `legacyBoardId(chart)`다. **결정적 id라서 두 사람이 동시에 이관해도 보드가 둘로 갈라지지 않고 `boardId` 병합으로 합쳐진다.** randomUUID를 쓰지 마라.
- 그 id의 보드가 `boards`에 없으면 만든다.
  - `kind`: 미분류는 `"기타"`, 나머지는 `"시즌 개발"`
  - `team: ""`, `note: ""`, `status: "진행"`
  - `createdAt`: 그 이름 스타일들의 가장 이른 `createdAt`(없으면 now)
  - `createdBy: "이관"`, `createdByName: "이관"`
  - `order`: 기존 보드 최대 order + 1부터 이름 순(`localeCompare(..., "ko-KR", { numeric: true })`)으로 매긴다
  - `updatedAt: now`
  - `history: [boardEvent(actor, "create", { to: name }, now)]`
- 스타일에는 `boardId`만 넣는다(`updatedAt`은 바꾸지 않는다. 이관은 내용 편집이 아니다). `chart` 값은 지우지 않는다.
- 대상이 없으면 `changed: false`와 입력 배열을 그대로 돌려준다. 두 번 돌려도 결과가 같아야 한다.

## 저장과 동기화

| 파일 | 조치 |
|---|---|
| `src/data/cache.ts` 7행 | `CACHE_KEYS` 끝에 `"requestBoards"` 추가 |
| `src/data/firestore-sync.ts` 24~29행 | `MERGE_IDS`에 `requestBoards: (item: { boardId: string }) => item.boardId` 추가 |
| `src/store/useAppStore.ts` | `AppState`에 `requestBoards: RequestBoard[]`, 초기값 `requestBoards: []`. `saveRequestBoards(boards, kind = "edit")`를 `saveRequests`와 같은 모양으로 추가(`diffRequestBoards` 사용). `saveRequestsAndBoards(requests, boards, kind = "edit")`는 두 저장을 차례로 부른다 |
| `src/data/audit.ts` 138행 아래 | `export const diffRequestBoards = (before, after) => diffByKey(before, after, (item) => item.boardId)` |
| `tools/backup/weekly_backup.py` | `KEYS` 끝에 `"requestBoards"`, `LABELS`에 `"requestBoards": "REQUEST 보드"`, `SHEETS`에 `("REQUEST보드", "requestBoards")` |

## 이관 실행 (`src/routes/FabricRequest.tsx`)

- 644행 근처 `requests` 선언 아래에 `const requestBoards = useAppStore((state) => state.requestBoards)`와 `const authUser = useAuthStore((state) => state.user)`를 둔다.
- `useEffect`(의존성 `requests`, `requestBoards`, `authUser`):
  - `currentUserCanWrite()`가 거짓이면 멈춘다. 읽기 전용 사용자가 저장을 일으키지 않게 한다.
  - `requests.length === 0`이거나 모든 스타일에 `boardId`가 있으면 멈춘다.
  - actor는 `{ email: authUser?.email ?? authUser?.uid ?? "unknown", name: authUser?.displayName?.trim() || authUser?.email?.split("@")[0] || "알 수 없음" }`.
  - `migrateChartsToBoards` 결과가 `changed`면 `saveRequestsAndBoards(result.requests, result.boards, "edit")`.
  - 같은 렌더 사이클에서 두 번 저장하지 않게 `useRef` 플래그로 진행 중을 막는다.
- **화면 모양은 바꾸지 않는다.** 차트 필터, 업로드 병합 키(`차트 + Garment No.`)는 R149에서 바꾼다.

## 하지 말 것

- `RequestStyle.chart` 필드를 지우거나 비우지 마라. 엑셀 양식과 업로드가 아직 그 값을 쓴다(R149에서 정리).
- `firestore.rules`를 바꾸지 마라. `state/{key}`는 승인 사용자가 이미 읽고 쓴다.
- 보드 쪽에 스타일 id 목록을 저장하지 마라. 소속은 스타일 `boardId` 하나로만 표현한다(한 스타일은 한 보드).
- 보관 스냅샷(`requestArchive`)과 종결 화면은 만들지 마라(R150).
- `MERGE_IDS` 등록을 빠뜨리지 마라. 빠지면 두 사람이 다른 보드를 동시에 고칠 때 한쪽이 사라진다.

## 검증

- `npm run build`가 `✓ built`로 끝나면 된다. 이관 함수 동작은 클로드가 따로 확인한다.
