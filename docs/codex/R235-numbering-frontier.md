# R235 채번 규칙 정정: 프론티어와 빈자리 (R233 수정)

## 상태

미착수. R224~R234가 워킹트리에 들어가 있고 빌드까지 통과했다. **되돌리거나 다시 만들지 마라.**

고칠 파일은 `src/routes/Warehouse.tsx` 하나다. **R233에서 넣은 규칙 두 가지를 고친다.**

## R233이 틀린 이유 (사용자 확인)

R233은 "이력(소진·폐기)으로 간 번호는 다시 쓰지 않는다"로 만들었다. 그것이 틀렸다.

- 오래된 이력을 R&D No.로 찾는 일은 없다. **이력 조회는 FL No.로 한다.** 번호가 겹쳐도 문제가 없다.
- 진짜 약속은 **번호에 빈칸을 만들지 않고 순서대로 입고 등록하는 것**이다. 창고팀 담당과의 약속이고 그렇게 익숙하다.
- R233 규칙대로 가면 3173번부터 옛 폐기 번호를 건너뛰느라 **오히려 번호가 띄엄띄엄해진다.** 목적과 반대다. 실제 데이터에서 3000~5999 구간은 대부분 옛 이력이라 건너뛰기가 거의 매 번호가 된다.

## 바른 규칙

1. **막는 것은 지금 창고에 있는 번호뿐이다.** 이력 번호는 다시 쓸 수 있다.
2. **현재 주기 안에 생긴 빈자리를 먼저 메운다.** 입고 취소나 숨김으로 풀려 아무 기록도 없는 번호다.
3. 빈자리가 없으면 **마지막 채번(프론티어) 다음부터** 순서대로 올라간다.
4. 7999를 넘기면 1부터 되감는다.

실제 데이터로 검증한 결과다.

- 프론티어 1326, 현재 주기 밴드 1000~1326, 밴드 안 빈자리는 1324 하나.
- 이 규칙의 다음 여덟 번호: `1324, 1327, 1328, 1329, 1330, 1331, 1332, 1333`.
- 3173은 옛 폐기 이력이 있지만 창고에 없으므로 그냥 쓴다.

## 1. 점유 판정을 되돌린다 (`occupiedStorageNumbers`)

R233이 `EXHAUSTED`와 `DISPOSED`를 점유로 더했다. 그것을 빼고 **창고보관만** 센다.

```ts
/**
 * 지금 창고에 있어서 쓸 수 없는 번호. 창고보관만 센다.
 * 소진·폐기로 이력에 간 번호는 다시 쓴다. 오래된 이력은 FL No.로 찾지 R&D No.로 찾지 않는다.
 * 번호를 아껴 쓰는 것보다 빈칸 없이 순서대로 나가는 것이 창고팀과의 약속이다.
 */
function occupiedStorageNumbers(items: readonly FabricLedgerItem[]): Set<number> {
  const used = new Set<number>()
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE") return
    const matched = item.storageNo.trim().match(/^\d{1,5}(?!\d)/)?.[0]
    if (matched) used.add(Number(matched))
  })
  return used
}
```

## 2. 채번 (`nextStorageNumbers` 3팀 분기)

R233이 넣은 "살아 있는 최소 번호부터 훑기"와 그 아래 되감기 블록을 아래로 통째로 바꾼다. 1팀 분기는 건드리지 마라.

```ts
  const numberOf = (value: string): number | null => {
    const matched = value.trim().match(/^\d{1,5}(?!\d)/)?.[0]
    return matched ? Number(matched) : null
  }
  // 어떤 상태로든 그 번호를 쓰는 항목이 있으면 '기록 있음'이다. 빈자리 판정에만 쓴다.
  const recorded = new Set<number>()
  scoped.forEach((item) => {
    const value = numberOf(item.storageNo)
    if (value !== null) recorded.add(value)
  })
  // 프론티어 = 웹에서 마지막으로 입고 등록한 번호. 원장 항목의 입고일(intakeAt)로 찾는다.
  // 대장에서 이관된 옛 항목은 intakeAt 이 없다. 그래서 옛 주기에 남은 높은 번호에 끌려가지 않는다.
  const stockedItems = scoped.filter((item) => item.status === "WAREHOUSE")
  const latestIntake = stockedItems.filter((item) => item.intakeAt)
    .sort((left, right) => left.intakeAt.localeCompare(right.intakeAt)).at(-1)
  const frontier = numberOf(latestIntake?.storageNo ?? "")
    ?? Math.max(0, ...stockedItems.map((item) => numberOf(item.storageNo) ?? 0))
  // 현재 주기 밴드. 프론티어에서 아래로 내려가다 기록 없는 번호가 20개 이어지면 옛 주기다.
  const GAP_BREAK = 20
  let band = frontier
  let run = 0
  for (let candidate = frontier; candidate >= 1; candidate -= 1) {
    if (recorded.has(candidate)) { run = 0; band = candidate; continue }
    run += 1
    if (run >= GAP_BREAK) break
  }
  // 1) 주기 안에 생긴 빈자리부터 메운다. 입고 취소나 숨김으로 풀린 번호다.
  for (let candidate = band; candidate <= frontier && picked.length < count; candidate += 1) {
    if (!recorded.has(candidate)) take(candidate)
  }
  // 2) 프론티어 다음부터 순서대로. 창고에 있는 번호만 건너뛴다(이력 번호는 그냥 쓴다).
  for (let candidate = frontier + 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  // 3) 7999 를 넘기면 1 부터 되감는다.
  for (let candidate = 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  return picked
```

`take`(270-274행)는 `used`(창고보관 번호)를 보고 거르는 기존 도우미다. 그대로 쓴다.

## 3. 수동 수정 중복 검사 (R232 `commitStorageNo`)

R233이 "이력으로 간 번호도 다시 쓸 수 없습니다"로 막아 두었다. 그 제한을 푼다. **창고에 지금 있는 번호만 막는다.**

```ts
  if (occupiedStorageNumbers(scoped).has(number)) {
    setSelectionNotice(`R&D No. ${value} 는 이미 창고에 있습니다.`)
    return
  }
```

`occupiedStorageNumbers`가 창고보관만 세도록 1번에서 바뀌므로 호출은 그대로 두고 **문구만** 바꾼다.

## 4. 안내 문구

입고 등록 창 안내문을 바꾼다. R233에서 `비어 있는 가장 낮은 번호부터 채웁니다. 소진·폐기로 이력에 간 번호는 다시 쓰지 않습니다.` 로 넣은 문장이다.

```
빠진 번호를 먼저 메우고 마지막 번호 다음으로 이어 갑니다. 이력으로 간 번호는 다시 씁니다.
```

## 하지 말 것

- 1팀(8000번대) 분기를 건드리지 마라.
- `warehouseSequenceStart`, `warehouseOrderKey`를 채번에 쓰지 마라. 폐기 라운드 정렬용이다.
- R234(예약 트랜잭션)를 건드리지 마라. 후보 계산만 바뀌고 예약 흐름은 그대로다.
- `src/data/fabric-ledger.ts`와 `src/store/useAppStore.ts`를 고치지 마라.

## 검증

`npm run build` 한 번. `git status --short`로 `src/routes/Warehouse.tsx` 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `occupiedStorageNumbers`가 `WAREHOUSE`만 센다.
3. 채번이 프론티어를 `intakeAt`으로 찾고, 밴드 빈자리를 먼저 쓴다.
4. 수동 수정 중복 검사 문구에서 이력 이야기가 빠진다.
