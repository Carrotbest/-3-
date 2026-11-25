# R449 — 창고 대장 한 번만 만들기, 요청 표의 제곱 탐색 없애기

상태: 미착수. R446, R447, R448 이 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

고치는 파일은 둘이다.

| 파일 | 조치 |
|---|---|
| `src/routes/Warehouse.tsx` | 같은 입력으로 두 번 만들던 대장을 한 번만 만들고 둘로 가른다 |
| `src/routes/FabricRequest.tsx` | 스타일마다 돌던 `findIndex` 를 색인 한 번으로 바꾸고, 스타일과 무관한 계산 둘을 밖으로 꺼낸다 |

다른 파일은 열지 마라.

---

## 1. `Warehouse.tsx` — 대장을 한 번만 만든다

### 지금 (547행과 567행)

```ts
  const ledger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents), [fabricEvents, overrides, records, samples])
```

```ts
  const hiddenLedger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents, { includeRemoved: true })
    .filter((item) => item.status === "REMOVED" && isFabric1Item(item) === (teamScope === "team1")),
  [fabricEvents, overrides, records, samples, teamScope])
```

**같은 입력으로 같은 계산을 두 번 한다.** `records`, `samples`, `overrides`, `fabricEvents` 가 전부 같다. 샘플이 5,000건대라 두 번째가 통째로 낭비다.

### 왜 한 번으로 줄여도 되나

`src/data/fabric-ledger.ts` 761행이다.

```ts
  }).filter((item) => options.includeRemoved || item.status !== "REMOVED").sort((left, right) => {
```

`includeRemoved` 는 **다 만든 뒤 마지막에 거르기만 한다.** 그 앞의 계산은 두 호출이 완전히 같다. 그러니 `includeRemoved: true` 로 한 번 만들어 둘로 가르면 결과가 같다. 거르기가 정렬보다 앞이지만, 정렬된 목록에서 일부를 빼도 남은 것들의 상대 순서는 그대로다.

### 바꿀 것

```ts
  // 같은 입력으로 두 번 만들던 것을 한 번만 만들고 가른다(R449).
  // includeRemoved 는 fabric-ledger.ts 761행에서 마지막에 거르기만 해서, 가르기와 결과가 같다.
  const fullLedger = useMemo(() => buildFabricLedger(records, samples, overrides, fabricEvents, { includeRemoved: true }), [fabricEvents, overrides, records, samples])
  const ledger = useMemo(() => fullLedger.filter((item) => item.status !== "REMOVED"), [fullLedger])
```

`hiddenLedger` 는 그 자리에 그대로 두고 안쪽만 바꾼다. 주석도 그대로 둔다.

```ts
  /**
   * 목록에서 숨긴(REMOVED) 항목. 되살리기 화면에서만 쓴다.
   * 채번과 통계는 위 `ledger` 를 그대로 보게 두어야 한다. 숨긴 번호까지 점유로 세면 채번이 달라진다.
   */
  const hiddenLedger = useMemo(() => fullLedger
    .filter((item) => item.status === "REMOVED" && isFabric1Item(item) === (teamScope === "team1")),
  [fullLedger, teamScope])
```

### 반드시 지킬 것

**`ledger` 는 지금과 똑같이 REMOVED 가 빠진 목록이어야 한다.** 이것이 채번(`nextStorageNumbers`)과 통계가 보는 값이다. 숨긴 번호까지 점유로 세면 다음 번호가 달라진다. `fullLedger` 를 `ledger` 자리에 그대로 쓰지 마라. 그것이 이 수정에서 유일하게 위험한 실수다.

`scopedLedger`, `rackDashTargets`, `team3Ledger`, `suggestFabric1Numbers` 는 전부 `ledger` 를 보게 그대로 둔다. `fullLedger` 로 바꾸지 마라.

`buildFabricLedger` 자체(`src/data/fabric-ledger.ts`)는 열지 마라.

## 2. `FabricRequest.tsx` — 스타일마다 전체를 훑지 않는다

### 2-1. 제곱 탐색 (2456행)

```ts
                const styleStart = slots.findIndex((slot) => slot.style.reqId === style.reqId)
```

`visible.flatMap` 안이다. 스타일마다 `slots` 전체를 처음부터 훑는다. 스타일이 n 개면 비교가 n 곱하기 n 번이다.

`slots` 는 1245행에서 `visible` 로 만든다. 그래서 각 스타일의 시작 위치는 한 번에 다 구할 수 있다. `slots` 선언 바로 아래에 색인을 만든다.

```ts
  // 스타일별 시작 슬롯 번호. 렌더당 한 번만 만든다.
  // 스타일마다 slots.findIndex 를 돌면 비교가 스타일 수의 제곱으로 는다(R449).
  const styleStartByReqId = new Map<string, number>()
  slots.forEach((slot, index) => {
    if (!styleStartByReqId.has(slot.style.reqId)) styleStartByReqId.set(slot.style.reqId, index)
  })
```

그리고 2456행을 바꾼다.

```ts
                const styleStart = styleStartByReqId.get(style.reqId) ?? -1
```

`?? -1` 을 빼지 마라. `findIndex` 는 못 찾으면 `-1` 을 준다. 그 값을 그대로 유지해야 `data-row-start` 와 `selectWholeRow` 가 전과 같이 움직인다.

### 2-2. 스타일과 무관한 계산 둘을 밖으로 (2446, 2447, 2459행)

`visible.flatMap` 안에 있는 이 셋은 `visibleColumns` 만 보고 `style` 을 전혀 안 본다. 스타일마다 다시 만들 이유가 없다.

```ts
                const optionColumns = visibleColumns.filter((column) => column.scope === "option")
                const hasOptionColumns = optionColumns.length > 0
```

```ts
                const addRowSpans = visibleColumns.reduce<number[]>((runs, column) => {
                  if (column.scope === "option") runs.push((runs.pop() ?? 0) + 1)
                  else if (runs.at(-1) !== 0) runs.push(0)
                  return runs
                }, []).filter((run) => run > 0)
```

세 선언을 `flatMap` 밖으로, 위 `styleStartByReqId` 아래로 그대로 옮긴다. **식은 한 글자도 바꾸지 마라.** `addRowSpans` 위의 주석(`// 옵션 사이에 세로 병합된...`)도 같이 옮긴다.

이름 충돌은 없다. 세 이름 모두 이 `flatMap` 안에서만 쓰인다(`optionColumns` 2446·2529행, `hasOptionColumns` 2447·2449·2451·2453·2454·2468·2524행, `addRowSpans` 2459·2537행). 쓰는 자리는 하나도 고치지 마라.

## 3. 하지 말 것

- **동작을 바꾸지 마라.** 창고 번호 매기기, 숨김 목록, 요청 표의 행 선택과 칸 병합이 전과 같아야 한다.
- `ledger` 에 REMOVED 를 섞지 마라. 채번이 달라진다.
- `src/data/fabric-ledger.ts` 를 열지 마라.
- `visibleGroups`, `visibleColumns`, `slots` 를 `useMemo` 로 감싸지 마라. 이번 범위가 아니고 의존성을 잘못 잡으면 표가 멈춘다.
- 가상 스크롤을 넣지 마라.
- `renderDataCell`, `selectWholeRow`, `rowMenu`, 열 너비 조절을 고치지 마라.
- `src/data/firestore-sync.ts`, `src/data/dd-workflow.ts`, `src/data/audit.ts`, `src/App.tsx`, `src/routes/DevelopmentMasterSheet.tsx` 를 고치지 마라. R446 부터 R448 변경이 워킹트리에 들어 있다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 4. 성공 기준

- `npm run build` 가 통과한다(`tsc --noEmit` 포함).
- `git status --short` 에 `src/routes/Warehouse.tsx` 와 `src/routes/FabricRequest.tsx` 두 줄이 더 뜬다. 앞선 다섯 파일의 변경은 그대로 있다.
- `Warehouse.tsx` 에 `buildFabricLedger` 호출이 **한 번만** 있다.
- `Warehouse.tsx` 의 `ledger` 가 `fullLedger.filter((item) => item.status !== "REMOVED")` 다.
- `FabricRequest.tsx` 에 `slots.findIndex` 가 없다.
- `FabricRequest.tsx` 의 `optionColumns`, `hasOptionColumns`, `addRowSpans` 선언이 `visible.flatMap` 밖에 있다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
