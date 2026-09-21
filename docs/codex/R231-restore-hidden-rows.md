# R231 숨긴 행 되살리기와 DD 숨김 표시

## 상태

미착수. R224~R230이 워킹트리에 들어가 있고 빌드까지 통과했다. **되돌리거나 다시 만들지 마라.**

고칠 파일은 둘이다. `src/store/useAppStore.ts`는 건드리지 않는다.
- `src/routes/Warehouse.tsx`
- `src/routes/DevelopmentMasterSheet.tsx`

## 왜 하는가 (백업 데이터로 확인한 사실)

창고 입고대기의 **선택 삭제**는 원단별 상태를 `REMOVED`로 덮어 목록에서 감춘다(`removeFabricRows`). 그런데 **감춘 행을 화면에서 되살리는 길이 없다.** 창고 세 탭 어디에도 안 나오고, DD MASTER에서는 원장 연결이 끊긴 것처럼 `미연결`로 보인다. 사람이 원인을 알 방법이 없다.

실제 사례. 입고대기에 있던 DD 행 하나가 2026-09-09에 `REMOVE`(READY→REMOVED) 처리됐다. 그래서 입고 대기에 올라오지 않는다. 지금 숨겨진 항목은 열 건이고 그중 다섯은 DD 행에 걸려 있다.

## 1. 창고: 숨긴 행 보기와 되살리기 (`src/routes/Warehouse.tsx`)

### 1-1. 숨긴 행 목록

454행의 `ledger` 메모는 **그대로 둔다.** 채번(`nextStorageNumbers`, `occupiedStorageNumbers`)과 되감기 지점이 이 값을 보고 있어서, 숨긴 항목을 섞으면 번호 계산이 달라진다.

455행 `scopedLedger` 아래에 따로 만든다.

```tsx
/**
 * 목록에서 숨긴(REMOVED) 항목. 되살리기 화면에서만 쓴다.
 * 채번과 통계는 위 `ledger` 를 그대로 보게 두어야 한다. 숨긴 번호까지 점유로 세면 채번이 달라진다.
 */
const hiddenLedger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents, { includeRemoved: true })
  .filter((item) => item.status === "REMOVED" && isFabric1Item(item) === (teamScope === "team1")),
[fabricEvents, overrides, records, samples, teamScope])
const hiddenCount = hiddenLedger.length
```

`const [hiddenOnly, setHiddenOnly] = useState(false)` 를 `unconfirmedOnly` 상태 옆에 더한다.

### 1-2. 표에 태우기

618행 `rows` 메모의 시작을 바꾼다. 검색은 숨긴 목록에도 그대로 건다.

```tsx
const rows = useMemo(() => {
  const query = search.trim().toLocaleLowerCase("ko-KR")
  const base = hiddenOnly ? hiddenLedger : scopedLedger.filter((item) => TAB_STATUSES[tab].includes(item.status))
  return base
    .filter((item) => !(unconfirmedOnly && tab === "WAREHOUSE" && !hiddenOnly) || !item.confirmedAt)
    ...
```

의존성 배열에 `hiddenOnly`, `hiddenLedger`를 더한다.

688행 `ledgerByKey`는 선택한 행을 되찾는 색인이다. 숨긴 행을 골라야 하므로 같이 담는다.

```tsx
const ledgerByKey = useMemo(() => new Map([...scopedLedger, ...hiddenLedger].map((item) => [item.key, item])), [scopedLedger, hiddenLedger])
```

탭을 바꾸면 숨김 보기를 끈다. `changeTab` 안에 `setHiddenOnly(false)` 한 줄을 더한다.

### 1-3. 버튼

1638행 `미확인 {unconfirmedCount}건` 버튼 바로 뒤에 같은 모양으로 넣는다. **새 묶음을 만들지 마라**(R226에서 정리한 줄이다).

```tsx
{tab === "READY" && hiddenCount > 0 ? <Button type="button" size="sm" variant={hiddenOnly ? "default" : "outline"} aria-pressed={hiddenOnly} title="선택 삭제로 목록에서 감춘 행입니다" onClick={() => setHiddenOnly((current) => !current)}>숨긴 행 {hiddenCount}건</Button> : null}
{hiddenOnly && canEditScope ? <Button type="button" size="sm" disabled={!selectedRows.length} onClick={() => void restoreHiddenRows()}><PackageCheck />되살리기</Button> : null}
```

1612-1614행의 입고대기 버튼 세 개(`선택 입고`, `직접 추가`, `선택 삭제`)는 숨김 보기일 때 감춘다. 조건 `tab === "READY" && canEditScope` 를 `tab === "READY" && !hiddenOnly && canEditScope` 로 바꾼다. 감춘 행에 다시 삭제나 입고를 걸 이유가 없다.

### 1-4. 되살리기

`undoLastWarehouseAction`(1161행) 근처에 넣는다.

```tsx
/**
 * 숨긴 행을 감추기 직전 상태로 되돌린다.
 * 목표 상태는 그 행의 마지막 REMOVE 기록의 `fromStatus` 다. 창고보관에서 감춘 건은
 * 번호를 지킨 채 창고보관으로 돌아가고, 입고대기에서 감춘 건은 입고대기로 돌아간다.
 */
const restoreHiddenRows = async () => {
  if (!selectedRows.length || saving) return
  setSaving(true)
  try {
    const recordIdOf = (item: FabricLedgerItem) => fabricRecordIdentity(item.record)
    const inputs: ApplyFabricActionInput[] = selectedRows.map((item) => {
      const recordId = recordIdOf(item)
      const removal = [...fabricEvents]
        .filter((event) => event.action === "REMOVE"
          && (recordId && event.recordId ? event.recordId === recordId : event.fabricKey === item.key))
        .sort((left, right) => (left.recordedAt ?? left.occurredAt).localeCompare(right.recordedAt ?? right.occurredAt))
        .at(-1)
      const target = removal?.fromStatus === "WAREHOUSE" ? "WAREHOUSE" as const : "READY" as const
      return {
        fabricKey: item.key, action: "RESTORE" as const,
        fromStatus: "REMOVED" as const, toStatus: target,
        storageNo: target === "WAREHOUSE" ? item.storageNo : undefined,
        note: "목록 숨김 해제",
      }
    })
    rememberUndo(await applyFabricActions(inputs))
    setSelectionNotice(`${inputs.length}건을 목록으로 되돌렸습니다.`)
    if (hiddenCount - inputs.length <= 0) setHiddenOnly(false)
  } catch {
    setSelectionNotice("되살리기에 실패했습니다.")
  } finally { setSaving(false) }
}
```

`FabricLedgerItem`, `fabricRecordIdentity`, `ApplyFabricActionInput`은 이 파일이 이미 import 한다. 없으면 기존 import 줄에 더한다.

표 아래 안내 문구(1642행)는 숨김 보기일 때 바꾼다.

```tsx
{hiddenOnly ? "선택 삭제로 감춘 행입니다. 골라서 되살리면 감추기 직전 상태로 돌아갑니다." : `체크박스로 여러 건을 고른 뒤 위 버튼으로 처리합니다. · ${TAB_META[tab].description}`}
```

빈 목록 문구(1641행 `renderGrid` 세 번째 인자)도 숨김 보기일 때 `숨긴 행이 없습니다.` 로 바꾼다.

## 2. DD: 숨김을 숨김으로 보인다 (`src/routes/DevelopmentMasterSheet.tsx`)

1067행을 바꾼다.

```tsx
// 숨긴 항목까지 받는다. 빼면 창고에서 감춘 행이 DD 에서 '미연결'로 보여
// 사람이 원인을 알 방법이 없다. '삭제됨'으로 보여야 창고에서 되살리면 된다는 것을 안다.
const ledger = useMemo(() => buildFabricLedger(records, samples, overrides, [], { includeRemoved: true }), [overrides, records, samples])
```

`FABRIC_STATUS_META.REMOVED`의 라벨이 `삭제됨`이라 대장 상태 열은 그대로 두면 된다. 다른 곳은 고치지 마라.

## 하지 말 것

- 454행 `ledger` 메모에 `includeRemoved`를 넣지 마라. 채번이 달라진다.
- `removeFabricRows`나 `applyFabricActions`(`src/store/useAppStore.ts`)를 고치지 마라. 이번에는 화면만 고친다.
- 숨긴 행을 입고대기 탭 본목록에 섞지 마라. 토글을 켰을 때만 보인다.
- 창고 툴바에 새 버튼 묶음을 만들지 마라.
- 다른 파일을 고치지 마라.

## 검증

`npm run build` 한 번. `git status --short`로 위 두 파일 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. 입고대기 탭에 `숨긴 행 N건` 토글이 있고, 켜면 `되살리기` 버튼이 나온다.
3. `hiddenLedger`가 `includeRemoved: true`로 따로 계산되고, 454행 `ledger`는 그대로다.
4. DD의 `buildFabricLedger` 호출이 `includeRemoved: true`를 받는다.
