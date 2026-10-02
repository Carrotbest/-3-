# R290 — 창고 처리 권한과 DD FL 형식

추론 강도: 기본값(high). 파일 6개. 권한 판단을 저장 함수와 화면 양쪽에 건다.

## 상태

미착수. R288(기록자 실명 `actorEmail`, `updatedByEmail`, `currentActorName`, `currentActorEmail`)과 R289(`ledgerOf`, `blockedByWarehouseDrift`, `integrityNotice`, `IntegrityNoticeDialog`)가 워킹트리에 있다. **되돌리지 마라.** 그 위에 쌓는다.

## 정책 (2026-10-02 박향근 확정)

소유자(`useAuthStore` `isOwner`)는 모든 규칙에서 예외다. 부서는 `useAuthStore` `department`(`settlement`=창고팀, `fabric3`=3팀, `fabric1`=1팀). 승인 계정 17개 모두 부서가 있다.

| 규칙 | 할 수 있는 사람 |
|---|---|
| `confirm` 입고 확인, 확인 취소 | 창고팀 |
| `outbound` 출고 등록, 출고 취소 | 창고팀. 다른 부서는 기존 출고 요청 메일 |
| `lifecycle` 폐기, 소진, 입고 대기로 되돌리기, 복구 | 3팀 원단은 3팀, 1팀 원단은 1팀 |
| `storageNo` R&D No. 수정 | 그 원단의 입고 등록자 본인. 등록자를 모르면(옛 기록) 소유자만 |
| `yds` 보유 재고 수정 | 창고팀이 넣은 값이면 창고팀만. 아니면 입고 등록자와 창고팀 |
| `rack` Rack No. 입력, 수정, 지우기 | 위 `yds`와 같은 규칙 |

입고 등록(RECEIVE), 1팀 신규 입고, 목록 숨김(REMOVE), 직접 추가는 지금처럼 화면 편집 권한(`canEditScope`)만 본다.

## 1. `src/data/schema.ts`

`FabricLedgerOverride`의 `rackNo` 아래에 더한다.

```ts
  /**
   * 창고팀이 넣은 값의 잠금(R290). 값은 넣은 창고팀 계정 메일이다.
   * 잠긴 값은 창고팀과 소유자만 고친다. 입고 대기로 내려가면 지운다.
   */
  locks?: { rackNo?: string; yds?: string }
```

## 2. `src/data/fabric-ledger.ts`

- `FabricLedgerItem`의 `intakeAt` 아래에 `intakeByEmail: string`(입고 등록자 메일, 모르면 빈 문자열), `rackNo` 아래에 `locks: { rackNo?: string; yds?: string }`를 더한다. 빈 항목을 만드는 두 곳(지금 392행, 430행 근처 `intakeAt: "",`)에 `intakeByEmail: "",`와 `locks: {},`를 더한다.
- 이력 순회(`intakeMap`을 채우는 루프)에 `intakeByMap`을 나란히 둔다. `toStatus === "READY"`에서 `intakeMap`과 함께 지우고, `RECEIVE`에서 `intakeMap`을 갱신하는 바로 그 조건일 때 `event.actorEmail ?? ""`를 넣는다.
- 결과 매핑(지금 723행 `rackNo: override.rackNo,` 근처)에 `locks: override?.locks ?? {}`, 731행 `stocked`에 `intakeByEmail: intakeByMap.get(item.key) ?? ""`.

## 3. 새 파일 `src/data/warehouse-policy.ts`

```ts
import type { FabricLedgerItem } from "./fabric-ledger"

/** 창고 처리 권한 판단(R290). 소유자는 예외. 화면과 저장 함수가 같은 판단을 쓴다. */
export interface WarehouseActor {
  email: string
  department: string | null
  isOwner: boolean
}

export type WarehouseRule = "confirm" | "outbound" | "lifecycle" | "storageNo" | "yds" | "rack"

const sameEmail = (left: string | undefined, right: string): boolean =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())

/** 막히면 사람에게 보일 이유를, 허용이면 null 을 돌려준다. fabric1 은 1팀 원단 여부. */
export function warehouseDenial(actor: WarehouseActor, rule: WarehouseRule, item: FabricLedgerItem, fabric1: boolean): string | null {
  if (actor.isOwner) return null
  const settlement = actor.department === "settlement"
  switch (rule) {
    case "confirm":
      return settlement ? null : "입고 확인과 확인 취소는 창고팀만 할 수 있습니다."
    case "outbound":
      return settlement ? null : "출고 등록과 출고 취소는 창고팀만 할 수 있습니다. 출고 요청 메일을 보내 주세요."
    case "lifecycle":
      if (actor.department === (fabric1 ? "fabric1" : "fabric3")) return null
      return fabric1
        ? "1팀 원단의 폐기, 소진, 복구는 1팀만 할 수 있습니다."
        : "폐기, 소진, 입고 대기로 되돌리기, 복구는 원단 R&D팀(3팀)만 할 수 있습니다."
    case "storageNo":
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return item.intakeByEmail
        ? "R&D No.는 입고를 등록한 사람만 고칠 수 있습니다."
        : "등록자 기록이 없는 원단이라 R&D No.는 관리자만 고칠 수 있습니다."
    case "yds":
    case "rack": {
      const label = rule === "yds" ? "보유 재고" : "Rack No."
      if (settlement) return null
      if (rule === "yds" ? item.locks.yds : item.locks.rackNo) return `${label}는 창고팀이 입력한 값이라 창고팀만 고칠 수 있습니다.`
      if (sameEmail(item.intakeByEmail, actor.email)) return null
      return `${label}는 입고를 등록한 사람과 창고팀만 고칠 수 있습니다.`
    }
  }
}

/** 여러 원단 중 처음 걸리는 이유. 모두 허용이면 null. */
export function firstWarehouseDenial(
  actor: WarehouseActor,
  rule: WarehouseRule,
  items: readonly FabricLedgerItem[],
  isFabric1: (item: FabricLedgerItem) => boolean,
): string | null {
  for (const item of items) {
    const reason = warehouseDenial(actor, rule, item, isFabric1(item))
    if (reason) return reason
  }
  return null
}
```

## 4. `src/store/useAppStore.ts`

### 4-1. 알림 종류

R289의 `IntegrityNotice`에 `kind?: "drift" | "permission" | "format"`를 더한다. `blockedByWarehouseDrift`는 `kind: "drift"`를 넣는다. 도우미를 더한다.

```ts
function noticeBlocked(kind: "permission" | "format", action: string, lines: string[], hint?: string): void {
  useAppStore.setState({ integrityNotice: { kind, action, lines, hint, at: new Date().toISOString() } })
}
```

### 4-2. 행위자와 1팀 판정

```ts
import { useAuthStore } from "@/data/auth"
import { firstWarehouseDenial, type WarehouseActor, type WarehouseRule } from "@/data/warehouse-policy"

function currentWarehouseActor(): WarehouseActor {
  const state = useAuthStore.getState()
  return { email: auth.currentUser?.email ?? "", department: state.department, isOwner: state.isOwner }
}
const isFabric1Ledger = (item: FabricLedgerItem): boolean => item.sample?.sourceSheet === FABRIC1_INTAKE_SHEET
```

### 4-3. `applyFabricActions`에서 막기

루프 전에, 상태를 바꾸기 전에 입력마다 규칙을 정해 검사한다. 원단은 `ledgerOf(state)`에서 `input.fabricKey`로 찾는다. 못 찾으면 검사하지 않는다.

| 입력 | 규칙 |
|---|---|
| `CONFIRM`, `UNCONFIRM` | `confirm` |
| `OUTBOUND`, `UNOUTBOUND` | `outbound` |
| `DISPOSE`, `EXHAUST`, `UNRECEIVE`, `RESTORE` | `lifecycle` |
| `NOTE`이고 `input.storageNo?.trim()`이 있고 원단의 지금 `storageNo`와 다름 | `storageNo` |
| `RECEIVE`가 아니고, `input.yds !== undefined`이며 원단의 `yds`와 다르거나, `input.clearYds`이고 원단 `yds !== null` | `yds` |

한 입력에 규칙이 둘이면 둘 다 본다. 걸리면 `noticeBlocked("permission", "창고 처리", [이유])` 후 `throw new Error(이유)`.

### 4-4. 잠금 기록

- `applyFabricActions`의 `override` 리터럴에 `locks`를 더한다. 계산:
  - 도착 상태가 `READY`면 `undefined`.
  - 아니면 `previous?.locks`에서 시작. 행위자가 창고팀(`department === "settlement"`)이고 이 입력이 재고를 바꿨으면(4-3의 `yds` 조건과 같고 `RECEIVE`도 포함) `yds: 행위자 메일`.
  - 결과가 빈 객체면 `undefined`.
- `saveFabricRackNos`, `saveFabricRackNo`(있으면 내부적으로 같은 함수를 쓰는지 확인하지 말고 두 곳 모두): 입력마다 `rack` 규칙 검사. 걸린 원단이 하나라도 있으면 `noticeBlocked` 후 저장 없이 `return 0`(`saveFabricRackNo`는 `return`). 통과하면 `locks`는 `previous?.locks`에서 시작해 창고팀이면 `rackNo: 행위자 메일`, 값을 지우는 경우(`nextRack` 없음)에도 창고팀이면 그대로 둔다.
- **이 파일에서 `FabricLedgerOverride`를 새로 만드는 모든 곳**(`updatedByEmail:`가 있는 곳)에 `locks: previous?.locks`(이전 값을 가리키는 변수 이름은 그 함수의 것을 쓴다)를 빠뜨리지 않는다. 빠뜨리면 다른 처리 한 번에 잠금이 풀린다. 이전 값이 없는 신규 생성(1팀 신규 입고 등)은 넣지 않는다.

### 4-5. 폐기 라운드 확정

`applyDisposalRoundCompletion` 맨 앞에서 대상 원단(`entry.key`)에 `lifecycle` 검사. 걸리면 `noticeBlocked` 후 `throw`.

### 4-6. DD FL 형식

- `import { isCompletedFlNo } from "../data/dd-workflow"`(이미 `recalculateDevelopmentRecords`를 그 파일에서 가져온다).
- 도우미:

```ts
/** FL#를 FL 형식이 아닌 글자로 새로 바꾼 행. 원래 값 그대로인 옛 글자는 문제 삼지 않는다(R290). */
function invalidFlEdits(before: readonly DevRecord[], after: readonly DevRecord[]): string[] {
  const previous = new Map(before.map((record) => [recordIdentity(record), String(record.flNo ?? "").trim()]))
  const values: string[] = []
  after.forEach((record) => {
    const value = String(record.flNo ?? "").trim()
    if (!value || isCompletedFlNo(value)) return
    if (previous.get(recordIdentity(record)) === value) return
    values.push(value)
  })
  return values
}
```

- `saveDevelopmentRecord`, `saveDevelopmentIntakeRecords`, `writeDevelopmentRecords`(단 `recalculate === false`인 되돌리기는 건너뛴다)에서 R289 검사 **앞에** 부른다. 걸리면 `noticeBlocked("format", "DD 수정", [\`FL#에 넣을 수 없는 값: ${[...new Set(values)].join(", ")}\`], "FL#는 FL과 숫자 8자리만 넣을 수 있습니다. DROP은 Status 칸, 메모는 비고 칸에 적어 주세요.")` 후 각 함수가 R289에서 막혔을 때와 같은 방식으로 빠져나간다.

## 5. `src/components/layout/IntegrityNoticeDialog.tsx`

`kind`에 따라 제목 아래 마지막 안내 줄만 바꾼다.

- `drift` 또는 없음: 지금 문장 그대로.
- `permission`: `권한이 필요한 작업입니다. 담당 부서에 요청해 주세요.` 아이콘은 lucide `Lock`, 색 `text-amber-600`.
- `format`: 안내 줄 없음(`hint`가 안내다). 아이콘 `Info`, 색 `text-sky-600`.

## 6. `src/routes/DevelopmentMasterSheet.tsx`

`isAcceptableCellValue`(680행) `if (!value) return true` 다음 줄에 `if (column.id === "flNo") return isCompletedFlNo(value)`. `isCompletedFlNo`는 이미 이 파일에서 쓰고 있다. 셀 입력이 거부될 때 띄우는 기존 `notify` 문구(2788행 근처) 앞에 FL 열이면 `FL#는 FL과 숫자 8자리만 넣을 수 있습니다. DROP은 Status 칸, 메모는 비고 칸에 적어 주세요.`를 띄우는 분기를 둔다.

## 7. `src/routes/Warehouse.tsx` 화면

`authUser`와 `useAuthStore` 값으로 `const warehouseActor = useMemo<WarehouseActor>(...)`을 만든다(`email`, `department`, `isOwner`). `const denialFor = (rule: WarehouseRule, items: readonly FabricLedgerItem[]) => firstWarehouseDenial(warehouseActor, rule, items, isFabric1Item)`.

버튼은 숨기지 않고 **비활성화하고 이유를 `title`로** 보인다. 기존 `disabled` 조건에 `|| Boolean(denialFor(...))`를 더하고, 걸리면 `title`을 그 이유로 바꾼다.

| 버튼 (지금 위치) | 규칙 |
|---|---|
| 입고 확인 `openAction("CONFIRM"`, 확인 취소 `openAction("UNCONFIRM"` | `confirm`, 선택 행 |
| 출고 `openAction("OUTBOUND"`, 출고 취소 `openAction("UNOUTBOUND"` 두 곳 | `outbound`, 선택 행 |
| 소진 `EXHAUST`, 폐기 `DISPOSE`, 입고 대기로 `UNRECEIVE`, 창고 보관으로와 입고 대기로 `RESTORE` 두 곳 | `lifecycle`, 선택 행 |

칸 편집:

- R&D No. 칸(`storageEditable`, 1826행 근처): 조건에 `&& !denialFor("storageNo", [item])`. 걸린 칸을 더블클릭하면 `setSelectionNotice(이유)`.
- Rack No. 칸(`rackEditable`, 1823행 근처): `&& !denialFor("rack", [item])`. Delete와 Backspace로 지우는 두 경로(1521행, 1549행, 1570행 근처)는 걸린 원단을 빼고, 빠진 것이 있으면 `setSelectionNotice(이유)`.
- 재고 칸 더블클릭(`openAction("STOCK", [item])`): `denialFor("yds", [item])`가 있으면 열지 않고 `setSelectionNotice(이유)`.

## 8. `src/routes/FabricDetail.tsx`

원단 상세의 R&D No.와 보유 재고 입력 칸은 같은 판단(`warehouseDenial`)으로 읽기 전용으로 만들고, 칸 옆에 이유를 작은 글씨로 보인다. 저장 함수가 어차피 막으므로 화면은 안내 목적이다. 칸이 어떻게 그려지는지(`draft.storageNo`, `stockTotal`)는 그 파일의 편집 칸 정의를 따른다.

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터, 협력사명, 개인 메일을 코드나 문서에 넣지 마라. 정책 문구에 사람 이름을 넣지 마라.
- 소유자 예외 외의 우회 경로(강제 저장 버튼 등)를 만들지 마라.
- `firestore.rules`, `auth.ts`, `firestore-sync.ts`, `buildFabricLedger`의 key 계산은 건드리지 마라.
- R289의 `blockedByWarehouseDrift` 검사 위치와 동작을 바꾸지 마라.
- public/data 아래 JSON을 열지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라. 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 통과. 실데이터 대조와 정책 모의는 클로드가 한다.

마지막 보고는 수정 파일, 규칙을 건 곳 목록, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
