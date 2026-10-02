# R289 — 저장 직전 창고 장부 검사

추론 강도: 기본값(high). 데이터 계약을 지키는 방어 장치다. 파일 4개.

## 상태

미착수. 워킹트리에 R282~R286, R288 변경이 있다. **되돌리지 마라.** R288이 `useAppStore.ts`에 넣은 `currentActorName`, `currentActorEmail`, `actorEmail`, `updatedByEmail`은 그대로 둔다.

## 왜

2026-10-02 사고. DD MASTER에서 FL 칸 4개를 `DROP`으로 붙여넣자 창고보관 1322, 1323, 1325, 1157이 목록에서 사라지고 1324가 다른 원단 재고(8/24)로 보였다. 저장은 아무 경고 없이 끝났고 사흘 뒤에 발견됐다. 원장 결함은 R287로 고쳤다. 이번 작업은 **같은 종류의 결함이 또 있어도 저장 순간에 막는** 장치다.

원칙: DD MASTER, 원단 상세, 직접 추가 원단 편집은 창고보관 장부를 바꿀 수 없다. 창고 처리(입고, 출고, Rack 등)는 처리한 원단의 번호만 바꿀 수 있다. 그 밖의 번호가 사라지거나, 생기거나, 재고, 잔량, Rack, 확인, 롤 값이 바뀌면 저장하지 않고 알린다.

실측: 실데이터(DD 176행, 샘플 5,502, 상태 1,014, 이력 1,710)에서 `buildFabricLedger` 1회 약 23ms. 저장마다 2회면 체감 지연 없다.

## 1. `src/data/fabric-ledger.ts` 파일 끝에 추가

```ts
/**
 * 창고보관 장부 지문(R289). R&D No.마다 [보유 재고, 잔량, Rack No., 실물 확인 여부, 롤]을 모은다.
 * DD MASTER, 원단 상세, 직접 추가 원단 편집으로는 이 값이 바뀌면 안 된다.
 * 같은 번호가 둘이면 둘 다 담는다. 개수가 바뀌어도 변화로 잡힌다.
 */
export function warehouseFingerprint(items: readonly FabricLedgerItem[]): Map<string, string> {
  const faces = new Map<string, string[]>()
  items.forEach((item) => {
    if (item.status !== "WAREHOUSE") return
    const no = item.storageNo.trim() || "(번호 없음)"
    const list = faces.get(no) ?? []
    list.push(JSON.stringify([item.yds, item.balance, item.rackNo ?? "", Boolean(item.confirmedAt), Boolean(item.roll)]))
    faces.set(no, list)
  })
  return new Map([...faces].map(([no, list]) => [no, list.sort().join("|")]))
}

export interface WarehouseDrift {
  removed: string[]
  added: string[]
  changed: string[]
}

/** 두 지문을 비교한다. allowed 에 든 번호의 변화는 세지 않는다(그 처리가 바꾸기로 한 원단). */
export function warehouseDrift(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string> = new Set(),
): WarehouseDrift {
  const removed: string[] = []
  const added: string[] = []
  const changed: string[] = []
  before.forEach((face, no) => {
    if (allowed.has(no)) return
    const next = after.get(no)
    if (next === undefined) removed.push(no)
    else if (next !== face) changed.push(no)
  })
  after.forEach((_face, no) => {
    if (!allowed.has(no) && !before.has(no)) added.push(no)
  })
  const order = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true })
  return { removed: removed.sort(order), added: added.sort(order), changed: changed.sort(order) }
}

export const hasWarehouseDrift = (drift: WarehouseDrift): boolean =>
  drift.removed.length + drift.added.length + drift.changed.length > 0
```

## 2. `src/store/useAppStore.ts`

### 2-1. 상태

- `AppState`(90행 `recordsSaveState` 아래)에 `integrityNotice: IntegrityNotice | null`을 더하고, 초기값(165행 근처 `recordsSaveState: "idle",` 아래)에 `integrityNotice: null,`.
- 파일 위쪽 export 타입으로 둔다.

```ts
/** 저장 직전 창고 검사가 막은 저장. 전역 알림 창이 보여 준다(R289). */
export interface IntegrityNotice {
  action: string
  lines: string[]
  hint?: string
  at: string
}
```

- `fabric-ledger` import에 `warehouseFingerprint`, `warehouseDrift`, `hasWarehouseDrift`, `type FabricLedgerItem`(이미 있음)을 더한다.

### 2-2. 도우미 (`type FabricState` 정의 바로 아래)

```ts
let ledgerCache: { inputs: readonly unknown[]; items: FabricLedgerItem[] } | null = null

/** 같은 배열로 다시 부르면 다시 계산하지 않는다. 저장 직전 검사가 셀마다 돌기 때문이다. */
function ledgerOf(state: FabricState): FabricLedgerItem[] {
  const inputs = [state.records, state.completed, state.fabricOverrides, state.fabricEvents]
  if (ledgerCache && ledgerCache.inputs.every((value, index) => value === inputs[index])) return ledgerCache.items
  const items = buildFabricLedger(state.records, state.completed, state.fabricOverrides, state.fabricEvents)
  ledgerCache = { inputs, items }
  return items
}

/** 처리 대상 원단(key)의 처리 전후 R&D No.. 창고 처리가 바꿔도 되는 번호다. */
function storageNumbersOf(states: readonly FabricState[], keys: Iterable<string>, extra: Iterable<string | undefined> = []): Set<string> {
  const wanted = new Set(keys)
  const numbers = new Set<string>()
  states.forEach((state) => ledgerOf(state).forEach((item) => {
    if (wanted.has(item.key) && item.storageNo.trim()) numbers.add(item.storageNo.trim())
  }))
  for (const value of extra) if (value?.trim()) numbers.add(value.trim())
  return numbers
}

/**
 * 저장 직전 창고 장부 검사(R289). 바뀌면 안 되는 번호가 바뀌면 true 를 돌려주고 알림을 띄운다. 부른 쪽은 저장하지 않는다.
 * 2026-10-02 사고: DD FL 칸을 DROP으로 바꾸자 창고보관 3건이 사라지고 1건이 다른 원단으로 보였다. 아무 경고가 없었다.
 */
function blockedByWarehouseDrift(
  before: FabricState,
  after: FabricState,
  action: string,
  options: { allowed?: ReadonlySet<string>; hint?: string; silent?: boolean } = {},
): boolean {
  const drift = warehouseDrift(warehouseFingerprint(ledgerOf(before)), warehouseFingerprint(ledgerOf(after)), options.allowed)
  if (!hasWarehouseDrift(drift)) return false
  console.warn("[warehouse-guard]", action, drift)
  if (options.silent) return true
  const lines = [
    drift.removed.length ? `창고보관에서 빠지는 번호: ${drift.removed.join(", ")}` : "",
    drift.added.length ? `창고보관에 새로 생기는 번호: ${drift.added.join(", ")}` : "",
    drift.changed.length ? `재고, Rack, 확인 값이 바뀌는 번호: ${drift.changed.join(", ")}` : "",
  ].filter(Boolean)
  useAppStore.setState({ integrityNotice: { action, lines, hint: options.hint, at: new Date().toISOString() } })
  return true
}

export function dismissIntegrityNotice(): void {
  useAppStore.setState({ integrityNotice: null })
}
```

`FabricState`의 네 배열 중 바뀌지 않은 것은 기존 state 값을 그대로 넘긴다. 예: `{ ...stateSlice, records: next }`.

### 2-3. 검사를 거는 곳

각 함수에서 **`setAppState` 또는 `saveCache`를 부르기 직전**에 검사한다. 막히면 상태를 바꾸지 않는다.

| 함수 | 비교 | allowed | 막혔을 때 |
|---|---|---|---|
| `saveDevelopmentRecord` | records `current` → `next` | 없음 | `return` |
| `saveDevelopmentIntakeRecords` | records `current` → `[...additions, ...current]` 재계산값 | 없음 | 추가 0건으로 `return { added: 0, skipped, addedIdentities: [] }` |
| `deleteDevelopmentRecord` | records `current` → `next` | 없음 | `return`. hint `창고보관 중인 원단의 DD 행은 지울 수 없습니다. 먼저 출고, 소진, 폐기로 창고에서 빼 주세요.` |
| `writeDevelopmentRecords` | records `before` → `next` | 없음 | `return` |
| `applyAuditRevert` | records 되돌리기 전 → 후 | 없음 | 아무것도 적용하지 않고 `{ applied: 0, conflicted: actions.length }` |
| `saveFabricFields` DD 없는 분기 | fabricOverrides 전 → 후 | 없음 | `return` |
| `updateManualIntake` | completed 전 → 후 | 없음 | `return` |
| `clearFabric1Cells` | 바뀌는 배열 전 → 후 | 없음 | `return 0` |
| `applyFabricActions` | 네 배열 전 → 후 | `storageNumbersOf([before, after], inputs.map(i => i.fabricKey), inputs.map(i => i.storageNo))` | 알림 후 `throw new Error("창고 장부 검사에 걸려 저장하지 않았습니다.")` |
| `saveFabricRackNos`, `saveFabricRolls` | fabricOverrides 전 → 후 | 대상 `item.key` | `return 0` |
| `removeFabricRows` | 전 → 후 | 대상 `entry.key` | `return` |
| `applyDisposalRoundCompletion` | 전 → 후 | 대상 `entry.key`와 `entry.storageNo` | `throw` 위와 같은 문구 |
| `confirmWarehouseBaseline` | fabricEvents 전 → 후 | 대상 `entry.key`, `entry.storageNo` | `return 0` |
| `undoFabricEntry` | 전 → 후 | `entry.overrides`의 `key`와 `before?.storageNo`, `after?.storageNo` | 적용 0건으로 반환 |
| `addFabric1Intake` | 전 → 후 | 이번에 매긴 R&D No. 전부 | `throw` 위와 같은 문구 |
| `backfillFabricRecordIds` | 전 → 후 | 없음 | `silent: true`로 검사하고 걸리면 저장 없이 `return 0` |

`replaceFabric1Ledger`(설정 화면의 1팀 대장 통째 교체)는 검사하지 않는다. 함수 위에 `// R289: 1팀 대장 통째 교체라 창고 장부 검사를 걸지 않는다. 소유자 전용.` 한 줄을 단다.

`action` 문구는 짧게 한국어로: `DD 수정`, `DD 신규 접수`, `DD 행 삭제`, `DD 붙여넣기`, `작업 되돌리기`, `원단 정보 수정`, `직접 추가 원단 수정`, `1팀 칸 지우기`, `창고 처리`, `Rack No. 저장`, `롤 표시`, `목록 숨김`, `폐기 라운드 확정`, `기존 재고 확인`, `창고 되돌리기`, `1팀 신규 입고`.

## 3. 새 파일 `src/components/layout/IntegrityNoticeDialog.tsx`

- `useAppStore((state) => state.integrityNotice)`를 읽는다. null이면 아무것도 그리지 않는다.
- 기존 `@/components/ui/dialog`(`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogBody`, `DialogFooter`)와 `Button`을 쓴다. 다른 화면의 Dialog 사용법을 따른다.
- 제목 `저장하지 않았습니다`. 본문:
  - 첫 줄 `작업: {action}`
  - `lines`를 줄마다
  - `hint`가 있으면 그 문장
  - 마지막 줄 `이 저장을 그대로 하면 창고 장부가 바뀌어 저장을 멈췄습니다. 이 창을 캡처해 원단 R&D팀에 알려 주세요.`
- 버튼 `확인` 하나. 누르면 `dismissIntegrityNotice()`.
- 위험 톤: 제목 옆에 lucide `ShieldAlert` 아이콘, 색은 `text-rose-600`.

`src/App.tsx` 196행 `<UpdateBanner />` 바로 위에 `<IntegrityNoticeDialog />`를 마운트하고 import한다.

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 공개 저장소다. 실데이터, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `buildFabricLedger` 본문, `resolveEntryKey`, `takeSampleMatch`, `firestore-sync.ts`는 건드리지 마라.
- 검사에 걸린 저장을 우회하는 옵션(관리자 강제 저장 등)을 만들지 마라.
- 검사는 `buildFabricLedger`를 `includeRemoved` 없이 부른다. 숨긴 행은 창고보관이 아니다.
- public/data 아래 JSON을 열지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라. 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 통과. 실데이터 대조는 클로드가 한다.

마지막 보고는 수정 파일, 검사를 건 함수 목록, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
