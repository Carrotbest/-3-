# R198 — 폐기 라운드 3단계 수명주기와 이력 일괄 이동

상태: 미착수. 설계 확정됨. 이 문서대로만 구현한다.

## 배경

폐기 라운드는 최종 리스트가 확정되면 창고팀이 실물을 옮기고 컷팅한다. 그 과정에서 실물이 없거나 재고가 달라서
창고팀이 판정을 한 번 더 고쳐야 하는 경우가 있다. 그다음 최종 확정을 하면 폐기가 확정된 원단을
창고 보관에서 이력으로 한 번에 옮긴다. 지금은 그 전환과 이동이 화면에 없다.

**스키마는 이미 준비되어 있다. 화면과 저장 함수만 없다.** 새 타입을 만들지 말고 아래 기존 정의를 쓴다.

- `DisposalRoundStatus = "검토" | "창고 전달" | "완료"` (`src/data/schema.ts:516`)
- `DisposalRoundEvent["action"]`에 `send`, `reopen`, `complete`가 이미 있다 (`src/data/schema.ts:558`)
- `DisposalItem`에 `cutDoneAt`, `cutDoneBy`, `disposedAt`, `disposedBy`가 이미 있다 (`src/data/schema.ts:547~550`)
- `DisposalRound`에 `sentAt`, `sentBy`, `completedAt`이 이미 있다 (`src/data/schema.ts:577~579`)
- `lastRoundDecision`(`src/data/disposal-round.ts:124`)이 이미 `완료`·`창고 전달` 라운드를 골라 쓴다.
  전환이 생기면 이 함수가 비로소 동작한다. 이 함수는 건드리지 않는다.

## 확정된 규칙

| 항목 | 결정 |
|---|---|
| 이력으로 보낼 대상 | 활성 항목 중 **보관이 아닌 전부**(폐기 + 컷팅). 요약의 `finalDispose`와 같은 집합이다 |
| 컷팅 건 | 1yd만 스와치로 남기고 원단은 폐기하므로 **이력으로 보낸다** |
| 보관 건 | 창고 보관에 그대로 남는다. 손대지 않는다 |
| 실물 없음 | 판정은 폐기 그대로 두고 메모 칸에 적는다. **새 판정을 만들지 않는다** |
| 창고 전달 단계 편집 | 판정(보관/폐기)·컷팅·메모만. 제목·범위·파일 업로드·목록 붙여넣기·제외 포함은 검토에서만 |
| 완료 단계 | 전부 읽기 전용 |

## 하지 말 것

- **`applyFabricAction`을 건마다 반복 호출하지 마라.** 이 함수는 호출마다 `fabricOverrides`·`fabricEvents`
  전체 배열을 새로 만들고 `saveCache`를 부른다. 라운드는 수백 건이라 그만큼 저장이 반복되고 팀 공유 동기화도
  같은 횟수로 올라간다. `confirmWarehouseBaseline`(`src/store/useAppStore.ts:735`)처럼 모아서 한 번만 쓴다.
- `DisposalItem`·`DisposalRound`·`FabricLedgerOverride`·`FabricLedgerEvent`에 새 필드를 만들지 마라.
- `Warehouse.tsx`의 기존 `DISPOSE` 액션 다이얼로그(`src/routes/Warehouse.tsx:775~783`)는 그대로 둔다.
  개별 폐기 경로이고 라운드와 별개다.
- `buildDisposalWorkbook`, `disposalSummary`, `isKept`, `isCut`, `itemVerdict`의 판정 규칙을 바꾸지 마라.
- 커밋·푸시하지 마라.

---

## 1. `src/data/disposal-round.ts`

### 1-1. import에 `FabricLedgerStatus` 추가

현재 3행:

```ts
import type { DisposalItem, DisposalRound, DisposalRoundEvent } from "./schema"
```

바꾼다:

```ts
import type { DisposalItem, DisposalRound, DisposalRoundEvent, FabricLedgerStatus } from "./schema"
```

### 1-2. `itemVerdict` 정의 바로 아래(현재 62행 다음)에 추가

```ts
/** 최종 확정에서 창고를 떠나는 건. 보관만 창고에 남고 폐기·컷팅은 이력으로 간다. */
export const isFinalDispose = (item: DisposalItem): boolean => isActiveItem(item) && !isKept(item)

/** 폐기 사유. 창고 개별 폐기와 라운드 최종 확정이 같은 목록을 쓴다. */
export const DISPOSAL_REASONS = ["용량 초과", "품질 불량", "개발 중단"] as const
export type DisposalReason = (typeof DISPOSAL_REASONS)[number]

/** 최종 확정에서 이력으로 옮길 한 건. 창고 저장 함수에 그대로 넘긴다. */
export interface DisposalCompletionEntry {
  key: string
  storageNo: string
  fromStatus: FabricLedgerStatus
  note: string
}
```

---

## 2. `src/store/useAppStore.ts`

`confirmWarehouseBaseline` 함수가 끝나는 곳(752행 `}`) 다음, `const numberOrNull`(757행) 앞에 함수를 하나 추가한다.

```ts
/**
 * 폐기 라운드 최종 확정. 폐기·컷팅으로 판정된 원단을 창고 보관에서 이력(DISPOSED)으로 한 번에 옮긴다.
 * applyFabricAction 을 건마다 부르면 라운드 건수만큼 전체 저장이 반복되므로
 * confirmWarehouseBaseline 처럼 오버라이드와 이벤트를 모아 한 번만 쓴다.
 */
export async function applyDisposalRoundCompletion(
  entries: ReadonlyArray<DisposalCompletionEntry>,
  options: { reason: string; actor: string },
): Promise<number> {
  if (entries.length === 0) return 0
  const state = useAppStore.getState()
  const occurredAt = new Date().toISOString()
  const actor = options.actor.trim() || "관리자"
  const byKey = new Map(state.fabricOverrides.map((entry) => [entry.key, entry]))
  const overrides: FabricLedgerOverride[] = []
  const events: FabricLedgerEvent[] = []
  entries.forEach((entry, index) => {
    const previous = byKey.get(entry.key)
    const storageNo = entry.storageNo.trim() || previous?.storageNo
    overrides.push({
      key: entry.key,
      status: "DISPOSED",
      storageNo,
      yds: previous?.yds,
      // 창고를 떠나므로 rack 칸을 비운다. applyFabricAction 과 같은 규칙이다.
      rackNo: undefined,
      note: previous?.note,
      fields: previous?.fields,
      updatedAt: occurredAt,
      updatedBy: actor,
    })
    events.push({
      id: `disposal-round-${occurredAt}-${index}`,
      fabricKey: entry.key,
      action: "DISPOSE",
      fromStatus: entry.fromStatus,
      toStatus: "DISPOSED",
      occurredAt,
      recordedAt: occurredAt,
      actor,
      note: entry.note,
      storageNo,
      reason: options.reason,
    })
  })
  const touched = new Set(entries.map((entry) => entry.key))
  const fabricOverrides = [...overrides, ...state.fabricOverrides.filter((entry) => !touched.has(entry.key))]
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([
    saveCache("fabricOverrides", fabricOverrides),
    saveCache("fabricEvents", fabricEvents),
  ])
  return entries.length
}
```

`DisposalCompletionEntry` 타입 import를 파일 상단에 더한다. 7행의 `fabric-ledger` import 줄 아래
아무 곳이나 기존 `@/data/...` import 근처에 넣으면 된다.

```ts
import type { DisposalCompletionEntry } from "@/data/disposal-round"
```

`FabricLedgerOverride`, `FabricLedgerEvent` 타입은 8행에서 이미 import되어 있다. 다시 import하지 마라.

---

## 3. `src/components/warehouse/DisposalRoundPanel.tsx`

### 3-1. import 정리

lucide-react import(2행)에 `Send`, `Undo2`, `PackageOpen`, `Loader2`를 더한다. 알파벳 순서를 유지한다.

`@/data/disposal-round` import(9행)에 `DISPOSAL_REASONS`, `isFinalDispose`, 타입 `DisposalCompletionEntry`,
`DisposalReason`을 더한다.

### 3-2. Props에 완료 콜백 추가

`interface Props`(15~23행)에 한 줄 더한다.

```ts
  /** 최종 확정에서 이력으로 옮긴다. 옮긴 건수를 돌려준다. */
  onCompleteDisposal: (entries: ReadonlyArray<DisposalCompletionEntry>, reason: string) => Promise<number>
```

함수 시그니처의 구조 분해에도 `onCompleteDisposal`을 더한다(32행).

### 3-3. 편집 권한 두 갈래로 나누기

현재 36행:

```ts
  const editable = !!selected && selected.status === "검토" && canWrite
```

바꾼다:

```ts
  // 검토는 1팀 판정 단계, 창고 전달은 창고팀 실물 작업 단계다.
  // 라운드 자체(제목·범위·파일·제외)는 검토에서만 고치고, 판정·컷팅·메모는 창고 전달에서도 고친다.
  // 실물이 없거나 재고가 달라 창고팀이 판정을 되돌리는 일이 있어서다. 완료는 전부 읽기 전용이다.
  const editable = !!selected && selected.status === "검토" && canWrite
  const verdictEditable = !!selected && (selected.status === "검토" || selected.status === "창고 전달") && canWrite
```

### 3-4. 상태 추가

`const [showUnmatched, setShowUnmatched] = useState(false)`(50행) 아래에 더한다.

```ts
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeReason, setCompleteReason] = useState<DisposalReason>("용량 초과")
  const [completeError, setCompleteError] = useState("")
  const [completing, setCompleting] = useState(false)
```

### 3-5. `patchItem` 교체

현재 66~69행 전체:

```ts
  const patchItem = (fabricKey: string, patch: Partial<DisposalItem>) => {
    if (!selected || !editable) return
    replaceRound({ ...selected, items: selected.items.map((item) => item.fabricKey === fabricKey ? { ...item, ...patch } : item) })
  }
```

바꾼다:

```ts
  const patchItem = (fabricKey: string, patch: Partial<DisposalItem>) => {
    if (!selected || !verdictEditable) return
    const before = selected.items.find((item) => item.fabricKey === fabricKey)
    const items = selected.items.map((item) => item.fabricKey === fabricKey ? { ...item, ...patch } : item)
    const after = items.find((item) => item.fabricKey === fabricKey)
    // 창고 전달 뒤 판정이 바뀌는 것은 창고팀이 실물을 보고 고친 결과다. 근거가 남아야 해서 이력에 적는다.
    // 검토 단계는 판정을 자주 뒤집는 자리라 적지 않는다. 적으면 이력이 수백 줄이 된다.
    const changed = selected.status === "창고 전달" && before && after && itemVerdict(before) !== itemVerdict(after)
    if (!changed || !before || !after) { replaceRound({ ...selected, items }); return }
    replaceRound({ ...selected, items, history: [...selected.history, disposalEvent(actor, "update", { target: `${numberOf(after)} ${after.flNo}`, from: itemVerdict(before), to: itemVerdict(after) })] })
  }
```

### 3-6. 키보드 조작 권한

현재 105행 `const handleKeys = ...` 안의 첫 줄:

```ts
    if (!editable || createOpen || markOpen || (event.target as HTMLElement).matches("input, textarea, select, button")) return
```

`!editable` 을 `!verdictEditable` 로, `markOpen` 뒤에 `|| completeOpen` 을 더한다.

### 3-7. 최종 확정 대상 계산

`const summary = selected ? disposalSummary(selected) : null`(82행) 아래에 더한다.

```ts
  // 라운드를 만든 뒤 개별 폐기나 소진으로 이미 창고를 떠난 건이 있을 수 있다. 그런 건은 건너뛰고 건수만 알린다.
  const completionTargets = useMemo(() => {
    const move: DisposalItem[] = []
    const skipped: DisposalItem[] = []
    selected?.items.filter(isFinalDispose).forEach((item) => {
      if (ledgerByKey.get(item.fabricKey)?.status === "WAREHOUSE") move.push(item)
      else skipped.push(item)
    })
    return { move, skipped }
  }, [ledgerByKey, selected])
```

### 3-8. 확정 실행 함수

`const exportWorkbook = ...`(110행) 위에 더한다.

```ts
  const runCompletion = async () => {
    if (!selected || completing) return
    setCompleting(true)
    setCompleteError("")
    try {
      const now = new Date().toISOString()
      const moving = new Set(completionTargets.move.map((item) => item.fabricKey))
      const moved = await onCompleteDisposal(completionTargets.move.map((item) => ({
        key: item.fabricKey,
        storageNo: item.storageNo,
        fromStatus: "WAREHOUSE" as const,
        note: `폐기 라운드 ${selected.title}${isCut(item) ? " (1yd 컷팅 후 폐기)" : ""}`,
      })), completeReason)
      const items = selected.items.map((item) => moving.has(item.fabricKey)
        ? { ...item, disposedAt: now, disposedBy: actor.email, ...(isCut(item) ? { cutDoneAt: now, cutDoneBy: actor.email } : {}) }
        : item)
      const keeping = disposalSummary(selected).keeping
      const skippedNote = completionTargets.skipped.length ? `, 건너뜀 ${completionTargets.skipped.length}건` : ""
      replaceRound({ ...selected, status: "완료", completedAt: now, items, history: [...selected.history, disposalEvent(actor, "complete", { to: `이력 이동 ${moved}건, 보관 유지 ${keeping}건${skippedNote}` }, now)] })
      setCompleteOpen(false)
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : "이력으로 옮기지 못했습니다.")
    } finally {
      setCompleting(false)
    }
  }
```

### 3-9. 헤더 버튼 줄

170행의 버튼 줄에서 `최종 리스트 내려받기` 버튼과 `라운드 삭제` 조건 사이에 아래 두 덩어리를 끼워 넣는다.
기존 버튼은 그대로 둔다.

```tsx
{canWrite && selected.status === "검토" ? <Button size="sm" onClick={() => { if (window.confirm(`최종 리스트를 창고팀에 전달합니다.\n폐기 ${summary.finalDispose}건, 보관 ${summary.keeping}건입니다.\n전달 뒤에는 판정·컷팅·메모만 고칠 수 있습니다.`)) replaceRound({ ...selected, status: "창고 전달", sentAt: new Date().toISOString(), sentBy: actor.email, history: [...selected.history, disposalEvent(actor, "send", { to: `폐기 ${summary.finalDispose} / 보관 ${summary.keeping}` })] }) }}><Send className="size-4" />창고 전달</Button> : null}
{canWrite && selected.status === "창고 전달" ? <><Button size="sm" variant="outline" onClick={() => { if (window.confirm("검토 단계로 되돌립니다. 창고팀이 실물 작업 중이면 되돌리지 마세요.")) replaceRound({ ...selected, status: "검토", history: [...selected.history, disposalEvent(actor, "reopen")] }) }}><Undo2 className="size-4" />검토로 되돌리기</Button><Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => { setCompleteReason("용량 초과"); setCompleteError(""); setCompleteOpen(true) }}><PackageOpen className="size-4" />최종 확정 · 이력 이동</Button></> : null}
```

### 3-10. 헤더 정보 줄에 전달·완료 시각

167행의 `<span className="text-xs text-[var(--muted-foreground)]">범위 ... 만든 사람 {selected.createdByName}</span>` 에서
`{selected.createdByName}` 바로 뒤, `</span>` 앞에 더한다.

```tsx
{selected.sentAt ? ` / 창고 전달 ${uploadTime(selected.sentAt)}` : ""}{selected.completedAt ? ` / 완료 ${uploadTime(selected.completedAt)}` : ""}
```

### 3-11. 셀 편집 권한 교체

아래 네 군데의 `editable` 을 `verdictEditable` 로 바꾼다. **이 네 곳만이다.** 파일 전체 치환을 하지 마라.

| 위치 | 현재 코드 조각 |
|---|---|
| 보관 버튼 | `<button type="button" disabled={!editable} aria-pressed={kept} title="보관"` |
| 폐기 버튼 | `<button type="button" disabled={!editable} aria-pressed={!kept} title="폐기"` |
| 컷팅 버튼 | `disabled={!editable \|\| kept} title={kept ? "보관 원단은 컷팅하지 않습니다"` |
| 메모 입력 | `placeholder="메모" defaultValue={item.memo ?? ""} disabled={!editable}` |

M/P 입력, 제외 `포함` 버튼, `다시 제외` 버튼, 파일 업로드 버튼, 목록 붙여넣기 버튼, 제목 더블클릭은
`editable` 그대로 둔다. 창고 전달 단계에서 잠겨야 하는 것들이다.

### 3-12. 최종 확정 다이얼로그

파일 끝, `markOpen` Dialog 다음·닫는 `</div>` 앞에 넣는다.

```tsx
<Dialog open={completeOpen} onOpenChange={(open) => { if (!completing) setCompleteOpen(open) }}><DialogContent><DialogHeader><DialogTitle>최종 확정 · 이력 이동</DialogTitle></DialogHeader><DialogBody className="space-y-3">
  <p className="text-sm">폐기가 확정된 원단을 창고 보관에서 <strong>이력</strong>으로 옮깁니다. 되돌리려면 이력 탭에서 건별로 창고 보관으로 되돌려야 합니다.</p>
  <div className="rounded-md border border-[var(--border)] p-3 text-sm">
    <div className="flex justify-between"><span>이력으로 이동</span><strong>{completionTargets.move.length}건</strong></div>
    <div className="mt-1 flex justify-between text-[var(--muted-foreground)]"><span>창고 보관 유지</span><span>{selected ? disposalSummary(selected).keeping : 0}건</span></div>
    {completionTargets.skipped.length ? <div className="mt-1 flex justify-between text-[var(--muted-foreground)]"><span>이미 창고를 떠난 건(건너뜀)</span><span>{completionTargets.skipped.length}건</span></div> : null}
  </div>
  <div className="space-y-1"><label className="text-xs text-[var(--muted-foreground)]" htmlFor="disposal-complete-reason">폐기 사유</label><select id="disposal-complete-reason" className="h-9 w-full rounded-md border bg-[var(--background)] px-2 text-sm" value={completeReason} onChange={(event) => setCompleteReason(event.target.value as DisposalReason)}>{DISPOSAL_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select><p className="text-xs text-[var(--muted-foreground)]">이동하는 {completionTargets.move.length}건에 같은 사유가 기록됩니다.</p></div>
  {completeError ? <p className="text-xs text-[var(--destructive)]">{completeError}</p> : null}
</DialogBody><DialogFooter><Button variant="outline" disabled={completing} onClick={() => setCompleteOpen(false)}>취소</Button><Button disabled={completing || !completionTargets.move.length} onClick={() => void runCompletion()}>{completing ? <Loader2 className="size-4 animate-spin" /> : null}확정하고 이력으로 옮기기</Button></DialogFooter></DialogContent></Dialog>
```

---

## 4. `src/routes/Warehouse.tsx`

### 4-1. 중복 상수 제거

43행 `type DisposalReason = "용량 초과" | "품질 불량" | "개발 중단"` 과
145행 `const DISPOSAL_REASONS: DisposalReason[] = ["용량 초과", "품질 불량", "개발 중단"]` 를 지운다.
대신 `@/data/disposal-round` 에서 `DISPOSAL_REASONS` 와 타입 `DisposalReason` 을 import한다.
524행 `useState<DisposalReason | "">("")` 등 나머지 사용처는 그대로 둔다.

### 4-2. store import

40행 import 목록에 `applyDisposalRoundCompletion` 을 더한다.

### 4-3. 패널에 콜백 연결

1405행 `<DisposalRoundPanel ... onSave={saveDisposalRounds} />` 의 `onSave` 뒤에 더한다.

```tsx
onCompleteDisposal={async (entries, reason) => {
  const moved = await applyDisposalRoundCompletion(entries, { reason, actor: authUser?.displayName || authUser?.email || "관리자" })
  setChecked(new Set())
  setTab("HISTORY")
  setDisposalView(false)
  return moved
}}
```

---

## 검증

`npm run build` 한 번만 돌린다. `tsc --noEmit` 이 포함되어 있다. 다른 검증은 하지 않는다.

성공 기준: 빌드 통과, `git status --short` 에 아래 네 파일만 M으로 보인다.

```
 M src/components/warehouse/DisposalRoundPanel.tsx
 M src/data/disposal-round.ts
 M src/routes/Warehouse.tsx
 M src/store/useAppStore.ts
```

(이 문서 `docs/codex/R198-disposal-round-lifecycle.md` 는 새 파일이라 `??` 로 보인다. 지우지 마라.)
