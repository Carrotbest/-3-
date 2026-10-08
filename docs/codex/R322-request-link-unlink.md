# R322 REQUEST 공정 팝업에서 DD 연결 해제와 변경

상태: **미착수.** 박향근이 2026-10-08에 급히 요청했다.

## 증상

REQUEST 화면에서 옵션을 DD 행에 손으로 연결하는데 잘못 연결되는 경우가 생긴다. 지금은 한 번 연결하면 REQUEST 화면에서 풀 방법이 없다. 공정 칩을 눌러 나오는 팝업에 `닫기`와 `DD MASTER에서 열기` 둘뿐이다.

## 원인 (확인 완료)

`src/data/request-link.ts`의 `applyRequestLinks`(61행)는 `pairs`에 담긴 **그 DD 행만** 고친다. 같은 옵션(`lineId`)에 이미 연결돼 있던 **다른 DD 행은 건드리지 않는다.** 그래서 옵션 하나에 DD 행이 여러 개 붙고, 공정 칩 옆에 `+N`으로만 조용히 드러난다.

DD MASTER 쪽 연결 도우미는 이미 연결된 옵션을 고르지 못하게 막는다. REQUEST 쪽에는 그 가드가 없다. **이 비대칭이 원인이다.**

그래서 버튼 추가와 함께 **연결을 1대1 바꿔치기로 고친다.**

## 하지 말 것과 그 이유

- **`src/data/request-link.ts`의 기존 함수 본문을 고치지 마라.** `applyRequestLinks`, `clearRequestLinksByLineId`, `removeRequestLinks`를 그대로 쓴다. DD MASTER와 연결 도우미와 끊어진 연결 정리가 같은 함수를 본다. 본문을 바꾸면 그쪽이 같이 바뀐다.
- **`writeDevelopmentRecords` 말고 다른 경로로 DD 행을 저장하지 마라.** 그 함수가 작업 이력과 되돌리기와 3-way 병합을 탄다. `records`는 병합 키다(R240).
- **`saveRequests`나 `commitRequests`를 부르지 마라.** 연결은 DD 행의 `tech.requestLink`에만 저장된다. 요청 데이터는 바뀌지 않는다.
- **요청 옵션 쪽에 연결 정보를 저장하지 마라.** 연결의 단일 출처는 DD 행이다.
- **`optId`를 연결 키로 쓰지 마라.** 옵션을 지우면 번호가 밀린다. `lineId`가 키다.
- **공정 칩의 "미연결 더블클릭" 진입점을 없애지 마라.** REQUEST 화면의 유일한 신규 연결 입구다(R316).
- **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.** tailwind-merge가 기본 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다.
- **확인 없이 연결을 해제하지 마라.** 되돌리기가 있지만 사용자가 모르고 누르면 안 된다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/components/request/ProcessStageDialog.tsx` | 버튼 둘 추가, props 넷 추가 |
| `src/routes/FabricRequest.tsx` | `stageTarget`에 style·option 추가, 해제 핸들러 추가, `linkDdRecord` 바꿔치기 보강 |

## 1. `ProcessStageDialog.tsx`

`ProcessStageDialogProps`에 넷을 더한다.

```ts
  /** 이 옵션에 연결된 DD 행 수. 1보다 크면 겹쳐 연결된 상태다. */
  linkedCount: number
  /** DD MASTER 편집 권한. 없으면 두 버튼을 비활성한다. */
  canEdit: boolean
  onUnlink: () => void
  onRelink: () => void
```

`DialogFooter`를 이렇게 바꾼다. 왼쪽에 연결 조작 둘, 오른쪽에 기존 둘이다.

- `연결 해제` — `variant="outline"`, 글자색을 `var(--destructive)`로. `canEdit`이 false면 `disabled`이고 `title`에 `DD MASTER 편집 권한이 필요합니다`를 건다.
- `연결 변경` — `variant="outline"`. 같은 권한 규칙.
- `닫기`, `DD MASTER에서 열기` — 그대로 둔다.

버튼 넷이 한 줄에 들어가지 않으면 `DialogFooter`를 `flex-wrap`으로 두고 왼쪽 묶음과 오른쪽 묶음을 `div` 둘로 나눠 `justify-between`한다.

`linkedCount`가 2 이상이면 **`DialogDescription` 아래에 경고 줄 한 줄**을 보인다. 글자는 이렇다.

```
DD 행 {linkedCount}개가 이 옵션에 함께 연결돼 있습니다. 연결 해제는 전부 풉니다.
```

색은 `var(--destructive)`, 크기는 `text-xs`다. `linkedCount`가 1이면 이 줄을 그리지 않는다.

## 2. `FabricRequest.tsx`

### 2-1. `stageTarget`에 맥락 추가 (768행)

지금은 이렇다.

```ts
const [stageTarget, setStageTarget] = useState<{ stage: ProcessStage; title: string; rowId?: string } | null>(null)
```

`style`과 `option`을 더한다.

```ts
const [stageTarget, setStageTarget] = useState<{ stage: ProcessStage; title: string; rowId?: string; style: RequestStyle; option: RequestOption } | null>(null)
```

797행 `setStageTarget({ stage, title: ..., rowId: status.rowId })` 호출에 `style`과 `option`을 더한다. `renderDdStage`가 둘 다 인자로 받고 있다.

### 2-2. 연결 해제 핸들러 (새로 만든다)

`linkDdRecord`(899행) 바로 아래에 둔다.

```ts
const unlinkOption = async (option: RequestOption): Promise<boolean> => {
  if (!currentUserCanEditKey("records")) { setNotice({ kind: "error", text: "DD MASTER 편집 권한이 필요합니다." }); return false }
  if (!option.lineId) { setNotice({ kind: "error", text: "연결 정보를 찾지 못했습니다." }); return false }
  const before = useAppStore.getState().records
  const { next, removed } = clearRequestLinksByLineId(before, new Set([option.lineId]))
  if (!removed) { setNotice({ kind: "error", text: "해제할 연결이 없습니다." }); return false }
  await writeDevelopmentRecords(next, false, "edit")
  setNotice({ kind: "ok", text: `DD 행 ${removed}개의 연결을 해제했습니다.` })
  return true
}
```

`clearRequestLinksByLineId`를 `@/data/request-link` import 목록에 더한다. **`removeRequestLinks`가 아니다.** 그것은 DD 행 id로 지우는 함수라 같은 옵션에 겹쳐 붙은 다른 행을 놓친다.

### 2-3. `linkDdRecord`를 바꿔치기로 보강 (914행 근처)

지금은 이 한 줄로 끝난다.

```ts
const { next, linked } = applyRequestLinks(before, style, [{ rowId: `${record._src.sheet}::${record._src.row}`, optId: option.optId }], fillEmpty)
```

**앞에 기존 연결 정리를 한 번 넣는다.** 같은 쓰기 안에서 해야 작업 이력과 되돌리기가 한 걸음이 된다.

```ts
const targetRowId = `${record._src.sheet}::${record._src.row}`
// 이 옵션에 이미 붙어 있는 다른 DD 행의 연결을 먼저 푼다. 안 풀면 옵션 하나에 행이 여럿 붙는다.
const cleared = clearRequestLinksByLineId(before, new Set([option.lineId]))
const replaced = cleared.next.filter((row, index) => row !== before[index] && rowIdOf(row) !== targetRowId).length
const { next, linked } = applyRequestLinks(cleared.next, style, [{ rowId: targetRowId, optId: option.optId }], fillEmpty)
```

`rowIdOf`가 `request-link.ts`에서 내보내지지 않으면 **그 파일을 고치지 말고** 여기서 `` `${row._src.sheet}::${row._src.row}` ``로 직접 만들어라.

성공 안내 문구에 바꿔치기 수를 붙인다.

```ts
setNotice({ kind: "ok", text: replaced > 0
  ? `${record.styleNo || "DD 행"} Opt ${record.opt || "-"}에 연결했습니다. 기존 연결 ${replaced}건은 해제했습니다.`
  : `${record.styleNo || "DD 행"} Opt ${record.opt || "-"}에 연결했습니다.` })
```

**`before`를 `cleared.next`로 바꿔 넘기는 것이 핵심이다.** `applyRequestLinks`에 원본 `before`를 그대로 넘기면 정리가 날아간다.

### 2-4. 팝업 연결 (2263행)

```tsx
<ProcessStageDialog
  open={stageTarget !== null}
  onOpenChange={(open) => { if (!open) setStageTarget(null) }}
  stage={stageTarget?.stage ?? null}
  title={stageTarget?.title ?? ""}
  linkedCount={stageTarget ? 1 + requestDdStatus(ddByLine, stageTarget.option).extra : 0}
  canEdit={currentUserCanEditKey("records")}
  onOpenDd={...그대로...}
  onUnlink={() => {
    const target = stageTarget
    if (!target) return
    askConfirm(
      confirmAnchor,
      `${target.title}의 DD 연결을 해제할까요?\n연결된 DD 행 ${linkedCount}개가 모두 풀립니다.`,
      () => { void (async () => { if (await unlinkOption(target.option)) setStageTarget(null) })() },
      { confirmLabel: "연결 해제", danger: true },
    )
  }}
  onRelink={() => {
    const target = stageTarget
    if (!target) return
    setStageTarget(null)
    setDdPick({ style: target.style, option: target.option })
  }}
/>
```

`askConfirm`(819행)은 `anchor: { x, y }`를 받는다. 팝업 안에서 부르므로 화면 가운데쯤을 쓴다. `{ x: window.innerWidth / 2, y: window.innerHeight / 2 }`로 넘겨라.

`onRelink`는 **해제하지 않는다.** 2-3에서 연결이 바꿔치기가 됐으므로 후보 창에서 새 행을 고르면 기존 연결이 자동으로 풀린다. 미리 풀면 사용자가 후보 창을 취소했을 때 연결만 사라진다.

## 검증

1. `npm run build` 한 번. 모든 수정을 마친 뒤에 돌린다.
2. `git status --short`로 위 표의 두 파일과 이 문서만 바뀌었는지 본다.

화면 확인은 하지 마라. 박향근이 직접 본다.
