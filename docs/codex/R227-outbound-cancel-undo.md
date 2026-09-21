# R227 출고 취소와 창고 되돌리기(Ctrl+Z)

## 상태

미착수. R224, R225, R226이 워킹트리에 들어가 있고 빌드까지 통과했다. **그 작업을 되돌리거나 다시 만들지 마라.**

이번 작업은 데이터 계약에 닿는다. 잔량 계산과 창고팀 보고서가 함께 바뀐다.

## 무엇을 만드나

두 가지다. 성격이 달라 방식도 다르다.

| 기능 | 쓰는 때 | 방식 |
|---|---|---|
| 출고 취소 버튼 | 확정한 출고가 나중에 틀렸다고 알았을 때 | **취소 이벤트를 덧붙인다.** 원래 출고 기록은 지우지 않는다 |
| Ctrl+Z | 방금 누른 창고 동작을 바로 되돌릴 때 | **방금 추가한 이벤트를 지우고 상태를 되돌린다** |

출고 취소는 기록이 남아야 한다. 창고팀과 주고받은 일이라 나중에 무엇이 취소됐는지 봐야 한다. Ctrl+Z는 잘못 누른 것을 없던 일로 만드는 용도라 지운다. 지운 사실은 작업 이력(`logAction`)에 `revert`로 남는다.

## 이미 확인한 것

- `FabricLedgerEvent`(`src/data/schema.ts` 377행 근처)에 `id`가 있다. 취소 대상은 이 `id`로 가리킨다
- 팀 공유 병합(`src/data/sync-merge.ts` `mergeKeyed`)은 3-way다. baseline에 있던 항목을 내가 지우면 병합 결과에서 빠진다. **그러므로 Ctrl+Z에서 이벤트를 지워도 다른 사람 화면에서 되살아나지 않는다.** 다시 검토하지 마라
- 창고 동작은 이미 `logAction({ kind: "warehouse", screen: "warehouse", ... })`으로 이력에 남는다(`src/store/useAppStore.ts` 1071행)
- DD MASTER의 되돌리기(`src/routes/DevelopmentMasterSheet.tsx` 2360행 `undoLast`)는 화면 안에 스택을 두는 방식이다. 창고도 같은 자리에 둔다

---

## A. 출고 취소

### A-1. 데이터 계약

`src/data/schema.ts`

- `FabricLedgerAction`에 `"UNOUTBOUND"`를 더한다
- `FabricLedgerEvent`에 선택 필드 `targetEventId?: string`을 더한다. 주석에 `UNOUTBOUND가 무효로 만드는 OUTBOUND 이벤트의 id`라고 적는다

기존 이벤트는 이 필드가 없다. 없어도 동작해야 한다.

### A-2. 취소된 출고를 가려내는 함수 하나

`src/data/fabric-ledger.ts`에 둔다.

```ts
export function canceledOutboundIds(events: readonly FabricLedgerEvent[]): Set<string>
```

`UNOUTBOUND` 이벤트의 `targetEventId`를 모은다. **출고를 합산하는 모든 곳이 이 함수 하나를 쓴다.** 곳마다 따로 걸러내지 마라. 기준이 갈리면 화면 잔량과 보고서 잔량이 어긋난다.

적용할 곳은 이렇다. 먼저 `src/data`와 `src/store`에서 `"OUTBOUND"`를 검색해 이 목록과 대조하라. 목록에 없는 합산 지점이 나오면 거기도 적용하고 마지막 보고에 적어라.

| 파일 | 위치 | 할 일 |
|---|---|---|
| `src/data/fabric-ledger.ts` | 582행 `outboundMap` 집계 | 취소된 출고는 넣지 않는다 |
| `src/store/useAppStore.ts` | 1006행 `outboundTotals` 집계 | 취소된 출고는 더하지 않는다 |
| `src/data/warehouse-export.ts` | 출고 완료 목록 | 취소된 출고와 `UNOUTBOUND` 자체를 목록에서 뺀다 |

### A-3. 취소 대상 고르기

원단마다 **취소되지 않은 가장 최근 `OUTBOUND` 하나**다. 최근의 기준은 `recordedAt`이고 없으면 `occurredAt`이다. 배열 순서를 쓰지 마라. `schema.ts` 주석대로 병합이 순서를 바꾼다.

이 판정도 `fabric-ledger.ts`에 함수 하나로 둔다.

```ts
export function latestActiveOutbound(events: readonly FabricLedgerEvent[], fabricKey: string, recordId?: string): FabricLedgerEvent | null
```

원단 식별은 `useAppStore.ts`가 이미 쓰는 방식(`recordId` 우선, 없으면 `fabricKey`)을 따른다.

### A-4. 상태 되돌리기

`useAppStore.ts` `applyFabricActions`에 `UNOUTBOUND` 처리를 더한다.

- 잔량은 A-2 덕분에 저절로 돌아온다. 따로 계산하지 마라
- 그 원단이 지금 `EXHAUSTED`면 `WAREHOUSE`로 돌린다. 그 출고로 잔량이 0이 되어 자동 소진된 경우다
- 사람이 `소진` 버튼으로 직접 소진한 원단도 `EXHAUSTED`다. 출고 취소는 그것까지 되돌린다. 출고를 되돌리면 잔량이 생기므로 창고에 있어야 맞다
- `EXHAUSTED`가 아니면 상태는 그대로 둔다
- 창고로 돌아오면 실물 확인 표시는 무효가 된다. `fabric-ledger.ts` 581행이 `RESTORE`와 `UNRECEIVE`에 하는 것처럼 `UNOUTBOUND`로 창고에 돌아온 경우도 확인 표시를 지운다
- Rack No.는 `applyFabricAction`이 창고보관 도착 시 이전 값을 물려주는 규칙을 탄다. 새로 손대지 마라

`UNOUTBOUND` 입력에는 `targetEventId`가 반드시 있어야 한다. 없거나, 대상이 `OUTBOUND`가 아니거나, 이미 취소된 것이면 `throw` 한다.

### A-5. 화면

`src/routes/Warehouse.tsx`

**버튼.** `출고 취소`를 둔다. R226이 만든 확정 묶음 안, `출고 확정` 바로 뒤다. 테두리 버튼(`variant="outline"`)이고 색을 입히지 않는다. 조건은 `출고 확정`과 같다(`canEditScope`).

`이력` 탭에도 같은 버튼을 둔다. 자동 소진된 원단은 창고보관 탭에서 빠져 이력 탭에 있기 때문이다. 이력 탭 버튼 줄의 끝에 두고 조건은 그 탭의 다른 버튼과 같다.

골라 둔 원단 중 취소할 출고가 하나도 없으면 버튼을 끈다.

**여러 건을 한 번에 받는다.** `ActionKind`에 `"UNOUTBOUND"`를 더하고 `openAction`으로 창을 연다. 창에는 원단마다 한 줄씩 취소될 출고를 보인다. 출고일, 받는 곳, 수량이다. 취소할 출고가 없는 원단은 `취소할 출고 없음`으로 흐리게 보이고 저장에서 뺀다.

창 문구는 이렇게 한다.

- 제목 `출고 취소`
- 설명 `원단마다 가장 최근 출고 한 건을 취소합니다. 잔량이 돌아오고, 소진된 원단은 창고 보관으로 돌아갑니다. 출고 기록은 지우지 않고 취소 기록을 덧붙입니다.`

저장은 `applyFabricActions` 한 번이다.

**알림.** 저장이 끝난 뒤 Teams에 `출고 취소` 카드를 보낸다. R225가 출고 확정에 붙인 것과 같은 모양이다. `try`와 `catch`로 감싸고 실패 문구는 `출고는 취소했지만 Teams 알림을 보내지 못했습니다.`

### A-6. 카드

`src/data/teams-notify.ts`에 `buildOutboundCancelCard`를 더한다. 기존 `buildCard`를 쓴다.

- 종류 `출고 취소`, 색 `Attention`. `CardOptions`의 `color`에 `"Attention"`을 더한다
- 설명 `원단 N건의 출고가 취소되었습니다.`
- 항목 `취소자`, `취소일`, `건수`
- 목록 한 줄 `{R&D No.}  FL {FL#}  취소 {qty} yds  원래 출고일 {출고일}`
- 맺음말 `컷팅 전이면 작업을 멈춰 주십시오.`

---

## B. Ctrl+Z

### B-1. 되돌리기 한 칸

`applyFabricActions`가 되돌리기에 필요한 것을 돌려준다. 지금은 `Promise<void>`다. 이것으로 바꾼다.

```ts
export interface FabricUndoEntry {
  /** 이 동작이 추가한 이벤트 id */
  eventIds: string[]
  /** 이 동작이 바꾼 원단별 상태. before가 undefined면 이 동작이 새로 만든 것 */
  overrides: { key: string; before: FabricLedgerOverride | undefined; after: FabricLedgerOverride }[]
  /** 이 동작이 바꾼 DD 행. 입고 등록이 채번을 행에 쓰는 경우다 */
  records: { id: string; before: DevelopmentRecord; after: DevelopmentRecord }[]
  /** 알림을 보낸 동작이면 무엇이었는지. 되돌릴 때 쓴다 */
  kind: FabricLedgerAction
}
```

`records`의 식별은 이 파일이 행을 가리킬 때 이미 쓰는 방식을 따른다. `DevelopmentRecord` 타입 이름이 다르면 실제 이름을 쓴다.

`applyFabricAction`(단수)도 같은 값을 돌려준다.

**기존 호출부는 반환값을 무시해도 동작해야 한다.** 창고 외 화면(폐기 라운드, 원단 상세 등)에서 부르는 곳은 고치지 마라.

### B-2. 되돌리기 실행

`useAppStore.ts`에 둔다.

```ts
export async function undoFabricEntry(entry: FabricUndoEntry): Promise<{ applied: number; conflicted: number }>
```

**충돌을 먼저 본다.** `src/data/audit.ts` 11행 주석과 같은 원칙이다. 내가 되돌리려는 원단을 그 사이 다른 사람이 바꿨으면 건너뛴다. 그러지 않으면 되돌리기가 남의 작업을 지운다.

- 원단 상태: 지금 값이 `after`와 같을 때만 `before`로 되돌린다. `before`가 `undefined`면 지운다. 다르면 건너뛰고 충돌로 센다. 비교는 `JSON.stringify`로 한다
- 이벤트: `eventIds`에 있는 것을 지운다. 이미 없으면 건너뛴다
- DD 행: 원단 상태와 같은 규칙이다
- 저장은 `applyFabricActions`가 하는 것과 같은 `saveCache` 세 개다
- `logAction({ kind: "revert", screen: "warehouse", changes })`로 남긴다

원단 하나의 상태가 충돌이면 그 원단의 이벤트도 지우지 마라. 상태와 이벤트가 어긋나면 잔량이 틀어진다.

### B-3. 화면의 스택

`Warehouse.tsx`에 DD MASTER와 같은 방식으로 둔다.

- `undoStack` 상태 하나. 최대 50칸이다. 새로고침하면 비워진다
- 이 화면에서 부르는 `applyFabricAction`과 `applyFabricActions`의 반환값을 전부 스택에 쌓는다. **호출이 여러 군데라 하나라도 빠지면 그 동작만 되돌려지지 않는다.** 파일 안의 호출을 전부 찾아 확인하라
- Redo(Ctrl+Shift+Z)는 만들지 않는다. 사용자가 요청하지 않았다

**키.** 1118행 근처에 이미 Delete와 Backspace를 받는 키 처리가 있다. 거기에 Ctrl+Z와 ⌘+Z를 더한다.

- 입력 칸, 글상자, 편집 가능한 요소에 초점이 있으면 받지 않는다. 브라우저의 글자 되돌리기를 뺏으면 안 된다
- 창(다이얼로그)이 열려 있으면 받지 않는다
- 권한은 `canEditScope`다

되돌린 뒤 `setSelectionNotice`로 결과를 한 줄 알린다. 충돌이 있으면 몇 건을 건너뛰었는지 적는다.

### B-4. 되돌리기와 알림

Teams 알림은 이미 나갔다. 되돌려도 채널 글은 안 지워진다.

- **출고 확정을 되돌리면 `출고 취소` 카드를 보낸다.** A-6의 카드를 그대로 쓴다. 창고팀이 컷팅을 시작하기 전에 알아야 한다
- 입고 등록을 되돌리면 카드를 보내지 않는다. 대신 안내 문구에 `Teams 알림은 이미 나갔습니다. 필요하면 채널에 따로 알려 주십시오.`를 붙인다
- 나머지 동작은 알림이 없었으니 아무것도 하지 않는다

B-1의 `kind`가 이 판단에 쓰인다.

---

## 하지 말 것

- 출고 취소에서 원래 `OUTBOUND` 이벤트를 지우지 마라. 취소 이벤트를 덧붙인다
- 출고 합산 지점마다 따로 거르지 마라. `canceledOutboundIds` 하나를 쓴다
- 최근 출고를 배열 순서로 고르지 마라. `recordedAt`, 없으면 `occurredAt`이다
- 충돌 검사 없이 되돌리지 마라
- Redo를 만들지 마라
- 창고 외 화면의 `applyFabricAction` 호출부를 고치지 마라
- R224, R225, R226이 만든 코드를 되돌리지 마라
- 웹훅 주소를 코드, 주석, 문서에 넣지 마라. 공개 저장소다
- 새 저장 키를 만들지 마라. 되돌리기 스택은 화면 상태다
- 화살표(`→`)와 가운뎃점(`·`)을 화면 문구에 쓰지 마라

## 검증

```
npm run build
git status --short
```

빌드가 통과하면 된다. 바뀐 파일은 `schema.ts`, `fabric-ledger.ts`, `useAppStore.ts`, `warehouse-export.ts`, `teams-notify.ts`, `Warehouse.tsx`다. 그 외 파일이 바뀌었으면 왜 바꿨는지 보고에 적어라.

## 마지막 보고

수정한 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.

반드시 적을 것은 셋이다.

1. A-2 목록 외에 출고 합산 지점을 더 찾았는지
2. B-3에서 스택에 연결한 `applyFabricAction` 호출이 몇 곳인지
3. `records` 되돌리기에서 행 식별을 무엇으로 했는지
