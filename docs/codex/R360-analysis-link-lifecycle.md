# R360 — 분석과 의뢰 링크 수명주기

**상태: 미착수.** R352~R359는 구현과 빌드를 마쳤다.

## 무엇이 잘못됐나

R352에서 분석 건을 의뢰로 넘기면 분석 쪽 `AnalysisRequest.requestReqId`에 만들어진 스타일의 `reqId`를 적는다. **끊는 쪽을 만들지 않았다.**

그래서 의뢰 보드에서 그 스타일을 지워도 분석 화면에 `REQ` 딱지가 그대로 남는다. 2026-10-28에 박향근이 화면에서 확인했다. 딱지만 남는 것이 아니다. `pickTransferable`이 `requestReqId`가 있으면 "이미 넘긴 건"으로 빼기 때문에 **그 분석 건을 다시 넘길 수 없다.** 사람이 손으로 풀 수단도 없다.

## 링크가 생기고 사라지는 자리를 전부 센다

| 자리 | 링크 | 지금 |
|---|---|---|
| 분석에서 의뢰로 넘기기(`importFromAnalysis`) | 생김 | 맞다 |
| 의뢰 스타일 삭제(`removeStyles`) | 끊겨야 함 | **빠졌다** |
| 보드 삭제(`deleteBoard` → `removeBoardWithStyles`) | 끊겨야 함 | **빠졌다** |
| 보드 종결·보관 | 그대로 | 스타일이 `requests`에 남는다. 맞다 |
| 다른 보드로 옮기기 | 그대로 | `reqId`가 그대로다. 맞다 |
| 엑셀 업로드 병합 | 그대로 | 더하고 갱신만 한다. 스타일을 지우지 않는다. 맞다 |
| 되돌리기(Ctrl+Z) | 끊길 수 있음 | 넘기기 전 스냅샷으로 돌아가면 스타일이 사라진다. 아래 2절이 받는다 |

## 1. 지울 때 끊는다

`src/routes/FabricRequest.tsx`에 도우미를 하나 둔다. `removeStyles`(1048행 근처) 바로 위가 좋다.

```ts
  /**
   * 지워진 스타일을 가리키던 분석 건의 `requestReqId`를 끊는다(R360).
   * 안 끊으면 분석 화면에 REQ 딱지가 남고 그 건을 다시 넘길 수 없다.
   * 분석 편집 권한이 없으면 조용히 넘어간다. 분석 화면은 살아 있는 스타일만 REQ로 치므로(2절)
   * 끊지 못한 값이 남아도 사람에게는 잘못 보이지 않는다.
   */
  const unlinkAnalysis = (reqIds: readonly string[]) => {
    const gone = new Set(reqIds)
    if (!gone.size || !currentUserCanEditKey("analysisRequests")) return
    const now = new Date().toISOString()
    let changed = false
    const next = useAppStore.getState().analysisRequests.map((item) => {
      if (!item.requestReqId || !gone.has(item.requestReqId)) return item
      changed = true
      const { requestReqId: _unused, ...rest } = item
      return { ...rest, updatedAt: now }
    })
    if (changed) saveAnalysisRequests(next)
  }
```

**`requestReqId: undefined`로 적지 마라.** Firestore는 값이 `undefined`인 키를 거부한다(CLAUDE.md R340). 위처럼 키를 통째로 빼야 한다. `{ ...item, requestReqId: undefined }`는 키를 지우는 것이 아니라 값 없는 키를 만든다.

`currentUserCanEditKey`, `saveAnalysisRequests`, `useAppStore`는 이 파일에 이미 들어와 있다. 새 import를 더하지 마라.

### 1-1. 스타일 삭제

`removeStyles`의 `askConfirm` 콜백 안, `commitRequests(...)` 다음 줄에 더한다.

```ts
      commitRequests(requests.filter((item) => !ids.has(item.reqId)))
      unlinkAnalysis(targets.map((style) => style.reqId))
```

### 1-2. 보드 삭제

`deleteBoard`(2026행)다. 지워질 스타일의 `reqId`를 **지우기 전에** 모아 둬야 한다.

```ts
  const deleteBoard = () => {
    if (!activeBoardInfo || !isOwner) return
    const boardName = activeBoardInfo.name
    const removedReqIds = requests.filter((style) => style.boardId === activeBoardInfo.boardId).map((style) => style.reqId)
    const next = removeBoardWithStyles(requests, requestBoards, activeBoardInfo.boardId)
    saveRequestsAndBoards(next.requests, next.boards, "clear")
    unlinkAnalysis(removedReqIds)
    setUndoStack([]); setRedoStack([]); setActiveBoard(ALL_BOARDS); setBoardDialog(null); setDeleteOpen(false)
    setNotice({ kind: "ok", text: `보드 "${boardName}"와 스타일 ${next.removedStyles}건을 삭제했습니다.` })
  }
```

## 2. 살아 있는 스타일만 REQ로 친다

끊는 쪽을 만들어도 **이미 끊긴 채 저장된 값이 남아 있다.** 권한이 없어 못 끊는 경우도 있고, 되돌리기로 스타일이 사라지는 길도 있다. 그래서 보는 쪽에서도 확인한다.

### 2-1. `src/data/analysis-to-request.ts`

판정 규칙을 한 곳에 둔다. `pickTransferable` 바로 위에 더한다.

```ts
/**
 * 이 분석 건이 살아 있는 의뢰 스타일과 이어져 있는가(R360).
 * `requestReqId`가 적혀 있어도 그 스타일이 지워졌으면 거짓이다.
 * REQ 딱지와 "이미 넘긴 건" 판정이 이 함수 하나를 본다. 두 곳이 달라지면 안 된다.
 */
export function hasLiveRequestLink(item: AnalysisRequest, liveReqIds: ReadonlySet<string>): boolean {
  return Boolean(item.requestReqId && liveReqIds.has(item.requestReqId))
}
```

`pickTransferable`의 인자와 판정을 바꾼다.

```ts
export function pickTransferable(
  list: readonly AnalysisRequest[],
  ids: ReadonlySet<string>,
  opts?: { allowLinked?: boolean; liveReqIds?: ReadonlySet<string> },
): TransferablePick {
  const chosen = list.filter((item) => ids.has(item.id))
  const finished = chosen.filter((item) => item.state === "완료")
  // 넘긴 적이 있어도 그 스타일이 지워졌으면 다시 넘길 수 있다(R360).
  const linked = opts?.allowLinked
    ? []
    : finished.filter((item) => opts?.liveReqIds ? hasLiveRequestLink(item, opts.liveReqIds) : Boolean(item.requestReqId))
  …
```

아래 세 줄(`linkedIds`, `return`)은 그대로다.

`liveReqIds`를 주지 않으면 옛 동작 그대로다. 호출처를 빠뜨려도 조용히 망가지지 않게 하려는 것이다.

### 2-2. `src/routes/FabricAnalysis.tsx`

의뢰 원장을 읽는다. 51행 `const rows = useAppStore((state) => state.analysisRequests)` 다음 줄에 더한다.

```ts
  const requestStyles = useAppStore((state) => state.requests)
  /** 살아 있는 의뢰 스타일의 id. 지워진 스타일을 가리키는 REQ 딱지를 걸러낸다(R360). */
  const liveReqIds = useMemo(() => new Set(requestStyles.map((style) => style.reqId)), [requestStyles])
```

`pickTransferable`을 부르는 두 곳(282행 `transferToRequest`, 299행 `downloadRequestChart`)에 넘긴다.

```ts
    const pick = pickTransferable(rows, selected, { liveReqIds })
```
```ts
    const pick = pickTransferable(rows, selected, { allowLinked: true, liveReqIds })
```

REQ 딱지를 고친다. 358행 근처다.

```tsx
{item.requestReqId ? <span className="ml-1.5 rounded-sm bg-sky-500/15 …" title="개발 의뢰로 넘긴 건입니다">REQ</span> : null}
```

조건을 바꾼다. className과 title은 그대로다.

```tsx
{hasLiveRequestLink(item, liveReqIds) ? <span className="ml-1.5 rounded-sm bg-sky-500/15 …" title="개발 의뢰로 넘긴 건입니다">REQ</span> : null}
```

import 줄(21행)에 `hasLiveRequestLink`를 더한다. `useMemo`가 import에 없으면 `react`에서 더한다.

## 하지 말 것

- **분석 화면에서 `requestReqId`를 지우는 저장을 걸지 마라.** 화면을 여는 것만으로 남의 데이터가 바뀌면 안 되고, 읽기 권한자 화면에서 저장과 되돌림이 끝없이 반복된다. 보는 쪽은 거르기만 한다.
- `requestReqId`를 `undefined`로 덮지 마라. 키를 빼라.
- `REQ?` 같은 새 표시를 만들지 마라. 끊긴 링크는 아무 딱지도 없는 것이 맞다. 넘긴 적이 없는 것과 같은 상태다.
- 보드 종결과 보관함은 건드리지 마라. 거기 스타일은 `requests`에 그대로 살아 있다.
- `importFromAnalysis`를 고치지 마라. 다시 넘기면 새 `reqId`로 덮어쓴다.
- DD 연결(`tech.requestLink`)은 이번 건과 다른 이야기다. 건드리지 마라.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 셋이다. `src/data/analysis-to-request.ts`, `src/routes/FabricAnalysis.tsx`, `src/routes/FabricRequest.tsx`.

화면 확인은 박향근이 한다. 의뢰 보드에서 넘겨 온 스타일을 지우고 분석 화면으로 가서 REQ 딱지가 사라졌는지, 그 건을 다시 넘길 수 있는지 본다. 이미 끊긴 채 남아 있던 건들도 딱지가 바로 사라진다.
