# R232 R&D No. 더블클릭 수정

## 상태

미착수. R224~R231이 워킹트리에 들어가 있고 빌드까지 통과했다. **되돌리거나 다시 만들지 마라.**

고칠 파일은 `src/routes/Warehouse.tsx` 하나다.

## 왜 하는가

대장 엑셀과 웹을 맞춰 보니 1316, 1317, 1318의 번호와 FL 짝이 한 칸씩 어긋나 있다. 입고 취소와 재입고를 오가는 사이 번호가 풀렸다가 다른 건에 붙어서 생긴 일이다. 엑셀 쪽이 맞는데 **웹에는 번호를 고칠 길이 없다.** 지금은 입고를 취소하고 다시 등록하는 수밖에 없고, 그러면 이력이 더 엉킨다.

## 1. 편집 조건

`Warehouse.tsx:1529` `rackEditable` 옆에 더한다.

```tsx
// R&D No.는 채번 기록이라 창고보관 상태에서만, 편집 권한이 있을 때만 고친다.
// 소진·폐기로 넘어간 건은 고치지 않는다. 지난 출고 자료와 어긋난다.
const storageEditable = canEditScope && column.id === "storageNo" && item.status === "WAREHOUSE"
const editable = rackEditable || storageEditable || (Boolean(manualId) && MANUAL_EDITABLE.has(column.id))
```

`storageNo` 칸 더블클릭은 지금 원단 상세를 연다(1532행 `onDoubleClick`의 `else openDetail(item.key)`). `editable`이 참이면 편집이 먼저 잡히므로 **그 분기 순서를 바꾸지 마라.** 편집 권한이 없는 사람은 지금처럼 상세가 열린다.

## 2. 저장

1538행 `onBlur` 안, `rackEditable` 분기 **앞**에 넣는다.

```tsx
if (storageEditable) {
  void commitStorageNo(item, event.target.value)
  setEditCell(null)
  return
}
```

`restoreHiddenRows` 근처에 함수를 둔다.

```tsx
/**
 * R&D No.를 고친다. 채번 기록이라 검사를 통과한 값만 저장하고 이력을 남긴다.
 * 저장은 applyFabricActions 를 지난다. 그래야 rackNo 같은 다른 값이 함께 물려가고
 * Ctrl+Z 되돌리기와 작업 이력이 같이 걸린다. 오버라이드를 직접 만들지 마라.
 */
const commitStorageNo = async (item: FabricLedgerItem, raw: string) => {
  const value = raw.trim()
  const before = item.storageNo.trim()
  if (!value || value === before) return
  const number = Number(value)
  const okTeam3 = /^\d{1,4}$/.test(value) && Number.isInteger(number) && number >= 1 && number <= STORAGE_NO_MAX
  const okTeam1 = /^\d{4,5}$/.test(value) && Number.isInteger(number) && number >= FABRIC1_STORAGE_NO_MIN
  if (teamScope === "team1" ? !okTeam1 : !okTeam3) {
    setSelectionNotice(teamScope === "team1"
      ? `R&D No. 는 ${FABRIC1_STORAGE_NO_MIN} 이상이어야 합니다.`
      : `R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 1팀 대역입니다.`)
    return
  }
  // 창고에 지금 있는 번호와 겹치면 막는다. 숨긴 행과 이력은 보지 않는다(번호가 풀린 상태다).
  const taken = ledger.some((other) => other.key !== item.key
    && other.status === "WAREHOUSE"
    && isFabric1Item(other) === (teamScope === "team1")
    && other.storageNo.trim() === (teamScope === "team3" ? value.padStart(4, "0") : value))
  if (taken) { setSelectionNotice(`R&D No. ${value} 는 이미 창고에 있습니다.`); return }
  const next = teamScope === "team3" ? value.padStart(4, "0") : value
  try {
    rememberUndo(await applyFabricActions([{
      fabricKey: item.key, action: "NOTE",
      fromStatus: item.status, toStatus: item.status,
      storageNo: next,
      note: `R&D No. ${before || "없음"} → ${next}`,
    }]))
    setSelectionNotice(`R&D No. 를 ${next} 로 바꿨습니다. 되돌리려면 Ctrl+Z 입니다.`)
  } catch {
    setSelectionNotice("R&D No. 를 바꾸지 못했습니다.")
  }
}
```

`STORAGE_NO_MAX`, `FABRIC1_STORAGE_NO_MIN`, `isFabric1Item`, `applyFabricActions`, `FabricLedgerItem`은 이 파일이 이미 import 한다. 빠진 것만 기존 import 줄에 더한다.

**번호를 비우는 것은 막는다.** 빈 값이면 아무것도 하지 않는다. 번호를 없애는 길은 입고 취소 하나여야 한다.

## 3. 안내

표 아래 안내 문구(`숨긴 행` 분기가 없는 기본 문구)의 끝에 한 문장을 더한다.

```
창고보관 탭에서는 R&D No. 칸을 더블클릭해 번호를 고칠 수 있습니다.
```

## 하지 말 것

- `src/store/useAppStore.ts`와 `src/data/fabric-ledger.ts`를 고치지 마라.
- 채번 함수(`nextStorageNumbers`, `occupiedStorageNumbers`, `warehouseOrderKey`)를 건드리지 마라.
- 입고대기·이력 탭에서 번호를 고칠 수 있게 하지 마라.
- 오버라이드(`FabricLedgerOverride`)를 직접 만들어 저장하지 마라. `applyFabricActions` 하나만 쓴다.
- 빈 값 저장을 허용하지 마라.

## 검증

`npm run build` 한 번. `git status --short`로 `src/routes/Warehouse.tsx` 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `storageEditable`이 `canEditScope`와 `status === "WAREHOUSE"` 둘 다 볼 것.
3. 저장이 `applyFabricActions`의 `NOTE` 하나를 지날 것.
4. 중복 번호와 범위 밖 번호, 빈 값이 모두 막힐 것.
