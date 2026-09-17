# R207 · 창고 기록을 DD 행 고유번호에 고정 (DD 값 수정 시 창고 기록 이탈 방지)

상태: 미착수

## 문제 (시뮬레이션으로 확인됨)

창고 웹 기록(`fabricOverrides`, `fabricEvents`)은 저장 당시의 원장 key(`override.key`, `event.fabricKey`)로 원단을 찾는다.
DD 원단의 key는 FL이 있으면 `fl:{FL}`, 없으면 `ddRowBaseKey`(`fabric-ledger.ts` 212행: owner, styleNo, season, color, construction, weight, dyeing, opt)다.
그래서 입고 뒤 DD에서 그 값을 고치면 기록이 원단을 못 찾는다.

`buildFabricLedger`에 DD 레코드 1건 + 입고 override(`WAREHOUSE`, R&D No. 1234)로 돌린 결과:

| 입고 뒤 DD 수정 | 결과 |
|---|---|
| FL 없던 행에 FL 추가 | 정상 (WAREHOUSE, 1234) |
| FL 있는 행 Style No. 수정 | 정상 |
| FL 없는 행 Style No. 수정 | **READY, R&D No. 빈 값** |
| FL 없는 행 Cons. 수정 | **READY, R&D No. 빈 값** |
| FL 오타 수정 FL26090001 → FL26090002 | **READY, R&D No. 빈 값** |

기록은 지워지지 않는다. 값을 되돌리면 다시 붙는다. 하지만 화면에서는 창고 원단이 입고대기로 떨어진다.

## 해결

DD 원단 기록에 DD 행 고유번호(`recordIdentity` = `${_src.sheet}::${_src.row}`)를 함께 저장하고, 원장을 만들 때 그 번호를 key보다 먼저 본다.
이 번호는 `firestore-sync.ts` `MERGE_IDS.records`의 병합 id와 같아 행 수정·순서 변경에 바뀌지 않는다.

**사용자 결정: 고유번호는 데이터로만 저장한다. 화면에 열, 배지, 툴팁, 상세 항목 어디에도 표시하지 마라.**

## 데이터 계약

`src/data/schema.ts`:

```ts
export interface FabricLedgerOverride {
  // 기존 필드 유지
  /** DD 원단이면 DD 행 고유번호(`_src.sheet::_src.row`). 화면에 표시하지 않는다. 원장 연결에만 쓴다. */
  recordId?: string
}
export interface FabricLedgerEvent {
  // 기존 필드 유지
  /** 위와 같다. */
  recordId?: string
}
```

대장 전용·창고 직접 추가 원단(`item.record` 없음)은 `recordId`를 넣지 않는다. 지금 동작 그대로다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | 위 두 필드 추가 |
| `src/data/fabric-ledger.ts` | `buildFabricLedger` 수정(아래). `export function fabricRecordIdOf(item: FabricLedgerItem): string \| undefined` 추가 = `item.record ? recordIdentity(item.record) : undefined` (226행 `recordIdentity` 재사용) |
| `src/store/useAppStore.ts` | override·event를 새로 만드는 모든 곳에 `recordId` 채움(아래 목록). 이전 override 찾기 보강 |
| `src/routes/Warehouse.tsx` | 쓰기 권한 사용자가 화면을 열면 세션당 1회 `backfillFabricRecordIds()` 호출(useRef 가드). 화면 표시는 바꾸지 않는다 |

### `buildFabricLedger` (406행~)

1. records 루프(473행 근처)에서 `recordKeyIndex: Map<string, string>`에 `recordIdentity(record) → matchedKey`를 저장한다.
2. 530행 근처 `resolveStoredKey`를 쓰는 두 곳(overrides, fabricEvents)을 바꾼다:
   ```ts
   const resolveEntryKey = (key: string, recordId?: string): string | undefined =>
     (recordId ? recordKeyIndex.get(recordId) : undefined) ?? resolveStoredKey(key)
   ```
   overrides는 `resolveEntryKey(override.key, override.recordId)`, events는 `resolveEntryKey(event.fabricKey, event.recordId)`.
3. `recordId`가 있는데 그 DD 행이 없으면(삭제 등) 지금처럼 key로 찾는다.
4. 같은 항목에 여러 override가 붙으면 `updatedAt` 늦은 것이 이기는 기존 규칙(533행 근처)을 유지한다.

### 스토어 쓰기 지점

아래 함수가 override 또는 event를 만든다. 전부 `recordId`를 채운다.

- `confirmWarehouseBaseline` (753행)
- `applyDisposalRoundCompletion` (780행)
- `saveFabricFields` (871행, `item.record` 없는 분기만 override를 만든다. 그 분기는 recordId 없음이 정상. `previous?.recordId`는 물려준다)
- `saveFabricRackNo` / `saveFabricRackNos` (911, 919행)
- `applyFabricActions` (953행)
- `removeFabricRows` (1027행)
- 그 밖에 `fabricOverrides` 또는 `fabricEvents` 배열에 새 항목을 넣는 곳이 있으면 같은 방식

규칙:
- 입력이 `FabricLedgerItem`이면 `fabricRecordIdOf(item)`.
- 입력이 key 문자열뿐이면 도우미 `recordIdForFabricKey(state, key)`를 만든다: `buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents, { includeRemoved: true })`에서 `item.key === key`인 항목의 `fabricRecordIdOf`. 한 함수 호출 안에서 원장은 **한 번만** 만들고 Map으로 찾는다(루프마다 만들지 마라).
- 이전 override를 찾을 때(`previous`, `byKey`, `overrideMap`) key가 같은 것이 없으면 **같은 `recordId`를 가진 override**를 찾아 이어받는다(status, storageNo, yds, rackNo, note, fields). 이어받은 옛 key의 override는 새 key override로 **교체**한다(배열에서 옛 항목을 빼고 새 항목을 넣는다). 안 그러면 R&D No.·Rack No.를 잃은 새 override가 생긴다.
- `previous`에 `recordId`가 있으면 물려준다.

### `backfillFabricRecordIds()` (신규, `useAppStore.ts`)

기존 기록에 번호를 채운다. 한 번 채우면 끝나는 작업이다.

1. 원장을 한 번 만든다(`includeRemoved: true`).
2. `recordId`가 없는 override: `override.key`를 지금 규칙(`items` key 또는 색인)으로 찾은 항목에 `record`가 있으면 `recordId`를 넣는다.
3. `recordId`가 없는 event: 같은 방식으로 `event.fabricKey`.
4. 바뀐 것이 없으면 저장하지 않는다. 있으면 `fabricOverrides`, `fabricEvents`를 각각 한 번 저장한다.
5. `updatedAt`, `recordedAt` 등 다른 값은 건드리지 않는다. 작업 이력(`logAction`)을 남기지 않는다.
6. 반환값은 채운 건수. 콘솔 출력하지 마라.

주의: 이미 DD 수정으로 떨어져 나간 기록(지금 key로 못 찾는 기록)은 자동 복구하지 않는다. 짝을 추정하지 마라.

## 하지 말 것

- 고유번호를 화면에 표시하지 마라(사용자 결정).
- `override.key`, `event.fabricKey`를 새 key로 일괄 바꾸는 마이그레이션을 하지 마라. `MERGE_IDS.fabricOverrides`가 key라 다른 사용자 기기의 옛 항목과 중복이 생긴다. backfill은 `recordId` 필드만 더한다.
- `ddRowBaseKey`, `fabricLedgerKey`, `resolveKey`의 규칙을 바꾸지 마라.
- 대장 전용·직접 추가 원단에 recordId를 만들지 마라.
- `firestore-sync.ts`를 고치지 마라.
- DD 레코드(`records`)에 창고 정보를 쓰지 마라. 흐름은 DD에서 창고 한 방향이다.

## 검증

`npm run build` 통과. 원장 동작 확인은 클로드가 한다.
