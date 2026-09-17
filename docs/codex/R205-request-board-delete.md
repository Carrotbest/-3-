# R205 · FABRIC REQUEST 보드 삭제 (스타일 포함, 소유자 전용)

상태: 미착수

## 무엇을 하는가

진행 중 보드를 통째로 지운다. 보드에 속한 스타일(`RequestStyle.boardId === board.boardId`)과 그 옵션까지 함께 지운다.
삭제 권한은 소유자(`isOwner`)만 갖는다.

## 지금 코드 (확인됨)

- `src/data/request-board.ts` 145행 `canDeleteBoard(board, requests, isOwner)` = `isOwner && 보드에 스타일이 없음`.
- `src/routes/FabricRequest.tsx` 1492행 `deleteBoard`: 보드만 `saveRequestBoards`로 빼고 전체 탭으로 간다. 스타일은 건드리지 않는다.
- `src/components/request/RequestBoardDialog.tsx`: 보드 정보 창 하단에 `canDelete`일 때만 "보드 삭제" 버튼, `window.confirm("빈 보드를 삭제할까요?")`.
- `src/components/request/RequestBoardHeader.tsx`: 보드 머리 카드. `onEdit`, `onCloseBoard` 버튼이 있다. 삭제 버튼은 없다.
- 결과: 스타일이 하나라도 있으면 버튼이 안 보여서 사용자는 삭제 기능이 없다고 느낀다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/request-board.ts` | `canDeleteBoard`를 `(board, isOwner) => isOwner`로 바꾼다. 빈 보드 조건 삭제. 호출부 인자도 맞춘다. 순수 함수 `removeBoardWithStyles(requests, boards, boardId): { requests: RequestStyle[]; boards: RequestBoard[]; removedStyles: number; removedOptions: number }` 추가 |
| `src/routes/FabricRequest.tsx` | `deleteBoard`를 다시 쓴다(아래 처리 순서). `RequestBoardHeader`에 `canDelete`, `onDelete` 전달 |
| `src/components/request/RequestBoardHeader.tsx` | `canDelete`일 때 종결 버튼 옆에 destructive 스타일 "보드 삭제" 버튼(휴지통 아이콘, lucide `Trash2`). 누르면 `onDelete` 대신 확인 창을 연다 |
| `src/components/request/BoardDeleteDialog.tsx` | 신규. 확인 창 |
| `src/components/request/RequestBoardDialog.tsx` | 기존 삭제 버튼도 같은 확인 창을 열게 한다(`window.confirm` 제거). `canDelete` 의미가 바뀐 것에 맞춘다 |

## 확인 창 (`BoardDeleteDialog`)

- 제목 `보드 삭제`
- 본문: 보드 이름, 지울 스타일 N건, 옵션 M건, 그중 DD MASTER에 연결된 옵션 K건.
  K는 `records`에서 `tech.requestLink.reqId`가 지울 스타일에 속한 DD 행 수다.
- 안내 문구(그대로):
  - `스타일과 옵션이 함께 삭제되며 되돌릴 수 없습니다.`
  - `DD MASTER 행은 지워지지 않습니다. 연결 표시만 REQ?로 바뀝니다.`
  - `보관함에 남은 종결 기록은 지워지지 않습니다.`
- 입력칸: 보드 이름을 똑같이 입력해야 "삭제" 버튼이 켜진다(앞뒤 공백 무시).
- 버튼: 취소, 삭제(destructive).

## 처리 순서 (`deleteBoard`)

1. `activeBoardInfo`가 없거나 `isOwner`가 아니면 아무것도 하지 않는다.
2. `removeBoardWithStyles`로 새 `requests`, `boards`를 만든다.
3. `saveRequestsAndBoards(nextRequests, nextBoards, "clear")`로 **한 번에** 저장한다. 작업 이력(auditLog)에 지운 스타일 값이 남는다.
4. `setUndoStack([])`, `setRedoStack([])`. 종결과 같은 이유로 되돌리기 스택을 비운다(되돌리기로 보드 없는 스타일이 부활하면 안 된다).
5. `setActiveBoard(ALL_BOARDS)`, 창 닫기, 안내 `보드 "{이름}"와 스타일 N건을 삭제했습니다.`

## 하지 말 것

- `commitRequests`를 거치지 마라. `appendRequestHistory`가 지워질 보드 history에 기록을 붙이고, 전체 탭 저장 차단과 되돌리기 스택이 끼어든다. 종결(`closeActiveBoard`)과 같은 이유다.
- `requestArchive`(보관함)를 건드리지 마라. 고치거나 지우는 기능을 만들지 않는 것이 확정 규칙이다.
- Firebase Storage 사진(`requests/{reqId}/...`)을 지우지 마라. Storage 삭제는 되돌릴 수 없고 이번 범위가 아니다.
- DD MASTER 행의 `tech.requestLink`를 지우지 마라. 사람이 다시 연결할 단서다.
- 종결 보드(탭에 안 보임)에 삭제 경로를 만들지 마라. 진행 중 보드만.
- `firestore-sync.ts`를 고치지 마라. `requests`, `requestBoards`는 3방향 병합이라 삭제가 전파된다.

## 검증

`npm run build` 통과.
