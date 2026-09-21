# R233 채번 규칙: 빈 번호를 남기지 않는다

## 상태

미착수. R224~R232가 워킹트리에 들어가 있고 빌드까지 통과했다. **되돌리거나 다시 만들지 마라.**

고칠 파일은 `src/routes/Warehouse.tsx` 하나다.

## 규칙 (사용자 확정)

**R&D No.는 순서대로 빠짐없이 나간다. 중간에 번호가 비는 경우는 그 원단이 이력(소진·폐기)으로 넘어간 경우뿐이다.** 번호가 왜 없어졌는지 다른 사람이 알 수 없으면 안 된다.

## 지금 무엇이 틀렸나 (백업 데이터로 확인)

- 창고보관 683건. 같은 번호를 쓰는 원단은 없다.
- 현재 주기(1000~1326)에서 비어 있는 번호는 **1324 하나뿐**이고, 나머지 빈자리는 전부 이력으로 간 번호다.
- 1324는 번호를 받기 전에 입고대기에서 숨겨졌고 그 사이 1325와 1326이 나갔다.
- 지금 채번은 `lastIssuedStorageNumber + 1`부터 올라가므로 **1324를 영영 건너뛴다.** 실제 계산 결과 다음 번호는 1327이다.

## 1. 점유 판정 (`occupiedStorageNumbers`, 245행)

지금은 창고보관만 점유로 센다. 이력으로 간 번호까지 점유로 본다. 이력 번호를 다시 쓰면 그 자리가 메워져, 빈자리를 보고 "이 번호는 이력으로 갔구나"를 알 수 없게 된다.

```ts
/**
 * 지금 쓰이고 있는 번호. 창고보관과 이력(소진·폐기)을 모두 센다.
 * 이력 번호를 다시 쓰지 않는 이유는 빈자리의 뜻을 지키기 위해서다.
 * 빈자리는 '이력으로 간 번호'만이어야 사람이 목록만 보고 판단할 수 있다.
 */
function occupiedStorageNumbers(items: readonly FabricLedgerItem[]): Set<number> {
  const used = new Set<number>()
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE" && item.status !== "EXHAUSTED" && item.status !== "DISPOSED") return
    const matched = item.storageNo.trim().match(/^\d{1,5}(?!\d)/)?.[0]
    if (matched) used.add(Number(matched))
  })
  return used
}
```

## 2. 채번 (`nextStorageNumbers`, 266행)

3팀 분기(281-283행)를 바꾼다. 1팀 분기는 그대로 둔다.

```ts
  // 살아 있는 가장 낮은 번호부터 훑어 비어 있는 자리를 먼저 채운다.
  // 입고 취소나 목록 숨김으로 풀린 번호가 구멍으로 남지 않게 하는 것이 목적이다.
  const liveNumbers = scoped.filter((item) => item.status === "WAREHOUSE")
    .map((item) => Number(item.storageNo.trim().match(/^\d{1,5}(?!\d)/)?.[0] ?? 0))
    .filter((value) => value >= 1 && value <= STORAGE_NO_MAX)
  const origin = liveNumbers.length ? Math.min(...liveNumbers) : 1
  for (let offset = 0; offset < STORAGE_NO_MAX && picked.length < count; offset += 1) {
    take(((origin - 1 + offset) % STORAGE_NO_MAX) + 1)
  }
  if (picked.length < count) {
    // 1부터 7999까지 모두 찼다. 그때만 이력 번호를 다시 쓴다. 주기가 한 바퀴 돈 것이다.
    const live = new Set(liveNumbers)
    for (let candidate = 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) {
      if (!live.has(candidate) && !picked.includes(candidate)) picked.push(candidate)
    }
  }
  return picked
```

`take`는 `used`를 보고 거르는 기존 도우미다(270-274행). 그대로 쓴다.

실제 데이터로 계산한 결과, 이 규칙의 다음 다섯 번호는 `1324, 1327, 1328, 1329, 1330`이다. **1324가 먼저 나와야 맞다.**

## 3. 수동 수정의 중복 검사 (R232 `commitStorageNo`)

지금은 창고보관 원단만 보고 중복을 막는다. 이력 번호도 막아야 한다. `taken` 계산을 점유 집합으로 바꾼다.

```ts
  const next = teamScope === "team3" ? value.padStart(4, "0") : value
  const scoped = ledger.filter((other) => other.key !== item.key && isFabric1Item(other) === (teamScope === "team1"))
  if (occupiedStorageNumbers(scoped).has(number)) {
    setSelectionNotice(`R&D No. ${value} 는 이미 쓰이고 있습니다. 이력으로 간 번호도 다시 쓸 수 없습니다.`)
    return
  }
```

기존 `taken` 블록과 그 아래 `const next = ...` 줄을 위 코드로 바꾼다. 순서가 바뀌므로 `next` 선언이 한 번만 남게 하라.

## 4. 안내 문구

입고 등록 창(1772행 근처) 안내문 `창고에 없는 가장 낮은 번호부터 채웁니다.` 를 바꾼다.

```
비어 있는 가장 낮은 번호부터 채웁니다. 소진·폐기로 이력에 간 번호는 다시 쓰지 않습니다.
```

## 하지 말 것

- 1팀(8000번대) 분기를 건드리지 마라. 되감지 않고 계속 올라가는 규칙 그대로다.
- `warehouseSequenceStart`, `warehouseOrderKey`를 채번에 쓰지 마라. 그것은 폐기 라운드 정렬용이다. 실제로 그 값으로 계산하면 다음 번호가 5731이 나온다. 틀린 값이다.
- `src/data/fabric-ledger.ts`와 `src/store/useAppStore.ts`를 고치지 마라.
- 입고 취소가 번호를 푸는 동작 자체는 그대로 둔다. 푼 번호를 다음 채번이 먼저 쓰게 하는 것이 이번 작업이다.

## 검증

`npm run build` 한 번. `git status --short`로 `src/routes/Warehouse.tsx` 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `occupiedStorageNumbers`가 `EXHAUSTED`와 `DISPOSED`를 센다.
3. 3팀 채번이 살아 있는 최소 번호부터 훑는다.
4. 수동 수정 중복 검사가 같은 점유 집합을 쓴다.
