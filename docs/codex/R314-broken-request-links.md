# R314 — 끊어진 요청 연결 때문에 DD 행이 후보에서 사라지는 문제

상태: 미착수.

대상 파일 다섯이다. 그 밖에는 열지 않는다.

- `src/data/request-link.ts`
- `src/data/request-link-match.ts`
- `src/components/request/DdCandidateDialog.tsx`
- `src/routes/FabricRequest.tsx`
- `src/routes/DevelopmentMasterSheet.tsx`

**워킹트리는 깨끗하다.** 직전 작업은 `ea2a615`(R313)로 커밋했다.

## 증상

Style No., 조직, 중량, Color가 모두 같은 DD 행이 REQUEST의 "DD 후보에서 연결" 창에
아예 안 뜬다. 그 DD 행의 Style No. 칸에는 `REQ?` 배지가 붙어 있다.

## 원인 (코드에서 확인)

1. `REQ?`는 `resolveRequestLink`가 `"missing"`을 돌려줬다는 뜻이다. `tech.requestLink`는 있는데
   그 `lineId`를 가진 요청 옵션이 지금 원장에 없다. **끊어진 연결이다.**
2. `scoreRowForOption`의 `linkedElsewhere`는 **대상이 살아 있는지 보지 않는다.**
   `record.tech?.requestLink`가 있기만 하면 참이다. 그래서 끊어진 연결도 "다른 요청에 연결됨"이 된다.
3. `DdCandidateDialog`의 `미연결 행만`이 기본 켜짐이라 그 행을 목록에서 통째로 뺀다.
   토글을 꺼도 25점 감점이 붙는다.

### 끊어진 연결이 생기는 이유

`removeRequestLinks`를 부르는 곳이 저장소 전체에서 **DD MASTER 우클릭 "요청 연결 해제" 한 곳뿐**이다.
반대 방향이 없다.

- REQUEST에서 옵션을 지워도(`removeOption`, `changeOptions("delete")`) DD 연결이 남는다.
- REQUEST에서 스타일을 지워도(`remove`) 남는다.
- 엑셀 재업로드로 옵션 수가 줄면 `mergeRequestStyles`가 같은 위치의 `lineId`만 이어받아 나머지가 끊긴다.

지울수록 연결할 수 없는 DD 행이 쌓인다.

## 틀렸던 가설

- "`DdCandidateDialog`가 상태(DROP·REJECT)로 거른다" — **틀렸다.** 거르지 않는다. R312·R313에서 확인했다.
- "점수 산식이 약하다" — **틀렸다.** 이 건은 Style No. 일치 50점이 붙어야 할 건이었다. 숨겨진 것이 문제다.
  점수 산식을 건드리지 마라.

## 할 일

### A. 살아 있는 연결만 "다른 요청에 연결됨"으로 본다

**A-1. `request-link.ts`** — `removeRequestLinks`(97행) 아래에 더한다.

```ts
/** 지금 원장에 살아 있는 옵션 lineId. DD 행의 requestLink 가 이 안에 없으면 끊어진 연결이다. */
export function liveRequestLineIds(requests: readonly RequestStyle[]): Set<string> {
  const ids = new Set<string>()
  for (const style of requests) for (const option of style.options) if (option.lineId) ids.add(option.lineId)
  return ids
}

/**
 * lineId 로 DD 행의 요청 연결을 끊는다. rowId 로 끊는 removeRequestLinks 의 짝이다.
 * 요청 옵션을 지울 때 쓴다. 행과 입력한 값은 건드리지 않는다.
 */
export function clearRequestLinksByLineId(records: readonly DevRecord[], lineIds: ReadonlySet<string>): { next: DevRecord[]; removed: number } {
  let removed = 0
  const next = records.map((record) => {
    const lineId = record.tech?.requestLink?.lineId
    if (!lineId || !lineIds.has(lineId) || !record.tech?.requestLink) return record
    removed += 1
    const { requestLink: _removed, ...tech } = record.tech
    return { ...record, tech }
  })
  return { next, removed }
}
```

**A-2. `request-link-match.ts`** — `scoreRowForOption`에 네 번째 인자를 더한다.

`lineId`는 `crypto.randomUUID()`라 전역에서 고유하므로 `reqId`까지 볼 필요가 없다.
**`request-link.ts`를 import 하지 마라.** `request-link.ts`가 이 파일을 쓰고 있어 순환이 된다.

```ts
export function scoreRowForOption(record: DevRecord, style: RequestStyle, option: RequestOption, liveLineIds?: ReadonlySet<string>): RowMatch {
```

함수 안의 `linkedElsewhere` 한 줄을 바꾼다.
```ts
  // 끊어진 연결(가리키는 옵션이 사라진 것)은 미연결로 본다. 그러지 않으면 그 행이 후보에서 영영 사라진다.
  const link = record.tech?.requestLink
  const linkedElsewhere = Boolean(link && link.lineId !== option.lineId && (!liveLineIds || liveLineIds.has(link.lineId)))
```

**A-3. `DdCandidateDialog.tsx`** — props에 `liveLineIds`를 더하고 그대로 넘긴다.

```ts
  /** 지금 원장에 살아 있는 옵션 lineId. 끊어진 연결을 미연결로 보기 위해 필요하다. */
  liveLineIds: ReadonlySet<string>
```
`scoreRowForOption(record, style, option)` 호출을 `scoreRowForOption(record, style, option, liveLineIds)`로 바꾸고,
`useMemo` 의존성 배열에 `liveLineIds`를 더한다.

**A-4. `FabricRequest.tsx`** — 색인을 만들고 넘긴다.

`ddByLine` 선언 근처에 더한다.
```ts
  const liveLineIds = useMemo(() => liveRequestLineIds(requests), [requests])
```
`<DdCandidateDialog ... records={ddRecords}` 에 `liveLineIds={liveLineIds}`를 더한다.
`request-link` import 줄에 `liveRequestLineIds`를 더한다.

### B. 요청 옵션·스타일을 지울 때 DD 연결도 끊는다

**B-1. `FabricRequest.tsx`** — `remove`(스타일 삭제) 위에 공통 함수를 둔다.

```ts
  /**
   * 요청 옵션을 지울 때 DD 행에 남는 연결을 같이 끊는다.
   * 안 끊으면 그 DD 행은 `REQ?`가 되고, 가리키는 곳이 없는데도 "다른 요청에 연결됨"으로 읽혀
   * 요청 쪽 후보 목록에서 사라진다(R314).
   * DD 쓰기 권한이 없으면 요청 삭제는 그대로 하고 남은 연결만 알린다.
   * 1팀 사용자가 DD 권한 때문에 자기 보드를 못 고치면 안 된다. 남은 것은 DD MASTER에서 정리한다.
   */
  const dropDdLinks = async (lineIds: readonly (string | undefined)[]) => {
    const targets = new Set(lineIds.filter((id): id is string => Boolean(id)))
    if (!targets.size) return
    const before = useAppStore.getState().records
    const hit = before.filter((record) => { const id = record.tech?.requestLink?.lineId; return id ? targets.has(id) : false }).length
    if (!hit) return
    if (!currentUserCanEditKey("records")) {
      setNotice({ kind: "error", text: `DD 연결 ${hit}건이 남았습니다. DD MASTER 편집 권한이 없어 정리하지 못했습니다.` })
      return
    }
    const { next, removed } = clearRequestLinksByLineId(before, targets)
    if (!removed) return
    await writeDevelopmentRecords(next, false, "edit")
    setNotice({ kind: "ok", text: `DD 연결 ${removed}건을 함께 끊었습니다.` })
  }
```

`request-link` import 줄에 `clearRequestLinksByLineId`를 더한다.

**B-2.** `removeOption`의 확인 콜백에서 저장 뒤에 부른다.
```ts
    askConfirm(anchor, `옵션 ${option.no}번을 삭제할까요?${warning}`, () => {
      saveMutation(requests.map((item) => item.reqId === style.reqId ? { ...item, options: renumber(style.reqId, style.options.filter((item) => item.optId !== option.optId)), updatedAt: new Date().toISOString() } : item))
      void dropDdLinks([option.lineId])
    }, { confirmLabel: "삭제", danger: true })
```

**B-3.** `remove`(스타일 삭제)의 확인 콜백에서 그 스타일의 모든 lineId를 넘긴다.
`commitRequests(...)`와 `void deleteRequestImage(...)` 사이에 한 줄 더한다.
```ts
      void dropDdLinks(style.options.map((option) => option.lineId))
```

**B-4.** `changeOptions`의 `mode === "delete"` 경로에서, 지워질 옵션의 lineId를 모아 넘긴다.
`saveMutation(next)` 바로 뒤다. **`targets`는 reqId별 옵션 인덱스 집합이다.**
```ts
      saveMutation(next)
      if (mode === "delete") {
        const gone: (string | undefined)[] = []
        requests.forEach((style) => { const indices = targets.get(style.reqId); if (indices) indices.forEach((index) => gone.push(style.options[index]?.lineId)) })
        void dropDdLinks(gone)
      }
```

### C. DD MASTER에서 끊어진 연결을 한 번에 정리한다

**C-1. `DevelopmentMasterSheet.tsx`** — `unlinkSelectedRequests`(2452행) 아래에 더한다.
`requestIndex`(1215행), `resolveRequestLink`, `removeRequestLinks`, `pushUndoSnapshot`는 이미 있다.

```ts
  /** 가리키는 요청 옵션이 사라진 연결. 그대로 두면 그 행이 요청 쪽 후보에서 사라진다(R314). */
  const brokenLinkRows = useMemo(() => records.filter((record) => resolveRequestLink(requestIndex, record) === "missing"), [records, requestIndex])
  const clearBrokenRequestLinks = async () => {
    if (!editEnabled) { notify(EDIT_DISABLED_MESSAGE); return }
    if (!brokenLinkRows.length) return
    if (!window.confirm(`가리키는 요청 옵션이 사라진 연결 ${brokenLinkRows.length}건을 끊을까요?\n담당과 무관하게 전체에서 정리합니다. 행과 입력한 값은 그대로 둡니다.`)) return
    const before = useAppStore.getState().records
    pushUndoSnapshot(before)
    const { next, removed } = removeRequestLinks(before, new Set(brokenLinkRows.map(recordIdentity)))
    await writeDevelopmentRecords(next, false, "edit")
    notify(`끊어진 연결 ${removed}건을 정리했습니다.`)
  }
```

**C-2.** 도구줄에 칩을 둔다. `숨긴 열 N` 칩 블록(`{hiddenColumnList.length ? <span className="relative shrink-0">` 로 시작해 `</span> : null}` 로 끝나는 덩어리) **바로 뒤**에 더한다.

```tsx
        {brokenLinkRows.length ? <button type="button" onClick={() => void clearBrokenRequestLinks()} title="가리키는 요청 옵션이 사라진 연결입니다. 눌러서 정리하면 그 행이 요청 쪽 후보에 다시 보입니다." className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_10%,var(--background))] px-1.5 py-0.5 text-[11px] font-normal text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_18%,var(--background))]">끊어진 연결 <span className="tabular-nums">{brokenLinkRows.length}</span></button> : null}
```

끊어진 연결이 없으면 칩 자체가 안 보인다.

## 하지 말 것

- **점수 산식을 건드리지 마라.** Style No., Buyer, 담당, Yarn, 조직, Color, 중량, 옵션 번호 항목과 `numberHit` 상한, `MATCH_MIN_SCORE`, `MATCH_STRONG_SCORE` 모두 그대로다.
- **`linkedElsewhere`의 -25 감점을 없애지 마라.** 살아 있는 연결이면 뒤로 미는 것이 맞다.
- **`unlinkedOnly` 기본 켜짐을 바꾸지 마라.**
- **`request-link-match.ts`에서 `request-link.ts`를 import 하지 마라.** 순환이 된다. 네 번째 인자로 받는다.
- **자동으로 끊어진 연결을 지우지 마라.** C는 사람이 누를 때만 돈다. 창고 2026-10-02 사고에서 자동 치유 규칙이 정상 연결 3건까지 지워서 버렸다. 같은 길을 만들지 마라.
- **DD 쓰기 권한이 없다고 요청 옵션 삭제 자체를 막지 마라.** 삭제는 그대로 하고 남은 연결만 알린다.
- **`removeRequestLinks`의 기존 동작과 우클릭 "요청 연결 해제"를 바꾸지 마라.**
- **`mergeRequestStyles`를 건드리지 마라.** 재업로드 연결 유지 규칙은 이번 범위가 아니다.
- `src/routes/Warehouse.tsx`는 열지 않는다.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `liveRequestLineIds`: 저장소 전체 **3번**(선언 1, FabricRequest import 1, 사용 1).
- `clearRequestLinksByLineId`: 저장소 전체 **3번**(선언 1, import 1, 사용 1).
- `dropDdLinks`: `FabricRequest.tsx`에서 **4번**(선언 1, 사용 3).
- `brokenLinkRows`: `DevelopmentMasterSheet.tsx`에서 **4번**.
- `git status --short`에 다섯 파일만 `M`이어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 숫자들, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
