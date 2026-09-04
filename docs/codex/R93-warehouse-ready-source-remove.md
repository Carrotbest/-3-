# R93 — 창고 입고 대기: 소스 한정 + 선택 삭제

상태: 미착수. 조사·설계 완료, 구현 전량 남음.

## 배경과 확인한 사실

창고 입고 대기(READY) 목록이 두 갈래로 채워지고 있다.

1. `src/data/fabric-ledger.ts:117` `statusFromRecord` — DD 레코드의 `tech.sampleDates.yds`에 값이 있으면 READY. **이건 이미 요구사항대로 동작한다. 재구현하지 마라.**
2. `src/data/fabric-ledger.ts:120~127` `statusFromSample` — 샘플관리대장에서 온 행 중
   - 시트명에 `현황`이 들어가면 READY (125행)
   - 그 외에도 `completedAt`이 있으면 READY (126행)

`src/data/xlsx-parsers.ts:789` `parseSamples`는 대장 워크북의 헤더가 맞는 **모든 시트**를 읽는다(현황·창고보관·소진완료·폐기). 그래서 2번 경로로 대장 '현황' 시트 행 전체가 입고 대기에 섞여 들어온다.

요구사항은 "입고 대기는 DD MASTER의 YDS 열에 날짜가 있는 것만 자동으로 가져온다"이다. 즉 2번 경로를 끊어야 한다.

주의: `addManualIntake`(`src/store/useAppStore.ts:523`)가 만드는 웹 등록 행은 `sourceSheet = WEB_INTAKE_SHEET("웹 등록")`, `completedAt = 오늘`이라 지금 126행 경로로 READY가 된다. 이 경로를 끊으면 **직접 추가 버튼이 죽는다.** 반드시 예외 처리해야 한다.

## 사용자가 정한 것

- 삭제한 행이 DD·대장에서 온 건이면 **원본은 그대로 두고 창고 화면에서만 감춘다.** DD의 YDS를 지우거나 DD 행을 삭제하지 않는다.
- 대장 '현황' 시트 행은 입고 대기에서 **뺀다.** 창고보관·소진완료·폐기 시트 행은 그대로 유지한다(R&D No. 보존).

## 하지 말 것

- `statusFromRecord`(117행)를 건드리지 마라. 이미 맞다.
- 시트명 분기 중 `폐기`·`소진`·`창고` 세 줄(122~124행)을 건드리지 마라. 창고 보관과 이력 탭이 여기에 걸려 있다.
- `isClosedHistorySample`(92행)을 건드리지 마라.
- DD 레코드를 수정·삭제하는 코드를 쓰지 마라. `deleteDevelopmentRecord`를 부르지 마라.
- 행 단위 삭제 아이콘 버튼을 추가하지 마라. 체크박스 + 툴바 버튼만이다.
- 삭제 시 `state.completed` 배열에서 항목을 제거하지 마라. 이유는 아래 "왜 오버라이드만 쓰는가"에 있다.

## 왜 오버라이드만 쓰는가 (틀린 접근 차단)

"웹 등록 행은 `completed` 배열에서 지우면 되지 않나"가 자연스러운 접근인데 **위험하다.**

웹 등록 행은 Style·FL·R&D No.가 모두 비어 있어 원장 key가 `source:웹 등록::<배열 인덱스>` 형태로 잡힌다(`fabricLedgerKey`, `emptyFromSample`). 배열에서 한 건을 지우면 뒤에 있는 웹 등록 행들의 인덱스가 하나씩 밀리고, 이미 입고되어 R&D No.를 받은 행이 자기 오버라이드를 잃는다. 채번이 사라진다.

그래서 삭제는 `fabricOverrides`에 `status: "REMOVED"`를 쓰는 것으로만 처리한다. 배열은 손대지 않는다.

같은 이유로 웹 등록 행의 key 자체를 인덱스에서 떼어내는 수정도 함께 한다(아래 3번). 그러지 않으면 대장을 다시 업로드해 행 수가 바뀌는 순간 인덱스가 밀려 **삭제해 둔 행이 되살아난다.**

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `FabricLedgerStatus`에 `"REMOVED"`, `FabricLedgerAction`에 `"REMOVE"` 추가 |
| `src/data/fabric-ledger.ts` | 상태 메타·랭크 추가, `statusFromSample` 규칙 변경, 웹 등록 행 key 안정화, REMOVED 행 출력에서 제외 |
| `src/store/useAppStore.ts` | `removeFabricRows` 신규 |
| `src/routes/Warehouse.tsx` | 입고 대기 탭 "선택 삭제" 버튼 + 확인 팝업 |

### 1. `src/data/schema.ts`

226행:

```ts
export type FabricLedgerStatus = "DEVELOPING" | "READY" | "WAREHOUSE" | "EXHAUSTED" | "DISPOSED" | "REMOVED"
```

228행:

```ts
export type FabricLedgerAction = "COMPLETE" | "RECEIVE" | "UNRECEIVE" | "CONFIRM" | "OUTBOUND" | "EXHAUST" | "DISPOSE" | "RESTORE" | "REMOVE" | "NOTE"
```

### 2. `src/data/fabric-ledger.ts`

`FABRIC_STATUS_META`(49행 상수) 마지막에 추가:

```ts
  REMOVED: { label: "삭제됨", description: "창고 목록에서 뺀 원단", tone: "bg-slate-400" },
```

`statusRank`(129행)에 추가:

```ts
  REMOVED: 5,
```

`statusFromSample`(120~127행) 전체를 교체한다. 현재 코드는 이렇다.

```ts
export function statusFromSample(sample: CompletedSample): FabricLedgerStatus {
  const sheet = normalized(sample.sourceSheet ?? "")
  if (sheet.includes("폐기")) return "DISPOSED"
  if (sheet.includes("소진완료") || sheet.includes("소진")) return "EXHAUSTED"
  if (sheet.includes("창고보관") || sheet.includes("창고")) return "WAREHOUSE"
  if (sheet.includes("현황")) return "READY"
  return sample.completedAt ? "READY" : "DEVELOPING"
}
```

바꾼 뒤:

```ts
export function statusFromSample(sample: CompletedSample): FabricLedgerStatus {
  const sheet = normalized(sample.sourceSheet ?? "")
  if (sheet.includes("폐기")) return "DISPOSED"
  if (sheet.includes("소진완료") || sheet.includes("소진")) return "EXHAUSTED"
  if (sheet.includes("창고보관") || sheet.includes("창고")) return "WAREHOUSE"
  // 입고 대기는 DD MASTER 의 YDS 날짜만 만든다(statusFromRecord).
  // 대장 현황 시트 행은 여기서 올리지 않는다. 창고에서 직접 추가한 행만 예외다.
  if (sample.sourceSheet === WEB_INTAKE_SHEET) return "READY"
  return "DEVELOPING"
}
```

`WEB_INTAKE_SHEET`를 `./schema`에서 import 한다. 지금 이 파일은 `import type { ... } from "./schema"` 하나만 있으므로 값 import 를 따로 추가해야 한다.

웹 등록 행 key 안정화. `emptyFromSample`(173행) 위에 헬퍼를 넣는다.

```ts
/** 웹 등록 행은 배열 위치가 아니라 자기 id 로 식별한다. 대장을 다시 올리면 인덱스가 밀려 웹 기록이 어긋난다. */
function sampleFallback(sample: CompletedSample, index: number): string {
  return sample.sourceSheet === WEB_INTAKE_SHEET && sample.id ? sample.id : `${sample.sourceSheet ?? "sample"}::${index}`
}
```

`emptyFromSample` 첫 줄의 key 계산에서 인라인 문자열을 `sampleFallback(sample, index)`로 바꾼다.

`buildFabricLedger`의 `samples.forEach` 안(295행 부근) `const fallback = ...` 도 `sampleFallback(sample, index)`로 바꾸고, 그 아래 `registerIdentities` 호출에 **예전 인덱스 key 를 함께 등록**한다. 이미 저장된 오버라이드·이력이 새 key 를 찾아가야 한다.

```ts
    registerIdentities(item, [
      ...fabricIdentities(storageNo, sample.flNo, sample.styleNo),
      `source:${sample.sourceSheet ?? "sample"}::${index}`,
    ])
```

REMOVED 행을 출력에서 뺀다. 함수 끝의 `return [...items.values()].map((item) => { ... })` 결과에 `.sort(...)` 앞으로 필터를 끼운다.

```ts
  }).filter((item) => item.status !== "REMOVED").sort((left, right) => {
```

오버라이드가 적용된 뒤여야 하므로 반드시 `map` 다음, `sort` 앞이다.

### 3. `src/store/useAppStore.ts`

`applyFabricAction`(604행) 뒤에 추가한다. `FabricLedgerOverride`·`FabricLedgerEvent`·`FabricLedgerStatus` 는 7행에서 이미 import 되어 있다.

```ts
/**
 * 입고 대기에서 잘못 올라온 행을 목록에서 뺀다.
 * 원본(DD 레코드·대장 행·웹 등록 행)은 지우지 않고 숨김 상태만 덮어쓴다.
 * completed 배열을 건드리면 웹 등록 행의 인덱스 기반 key 가 밀려 채번이 어긋난다.
 */
export async function removeFabricRows(
  entries: ReadonlyArray<{ key: string; fromStatus: FabricLedgerStatus }>,
  actor = "관리자",
): Promise<void> {
  if (!entries.length) return
  const state = useAppStore.getState()
  const occurredAt = new Date().toISOString()
  const keys = new Set(entries.map((entry) => entry.key))

  const overrides: FabricLedgerOverride[] = entries.map((entry) => {
    const previous = state.fabricOverrides.find((item) => item.key === entry.key)
    return {
      key: entry.key,
      status: "REMOVED",
      storageNo: previous?.storageNo,
      yds: previous?.yds,
      note: previous?.note,
      updatedAt: occurredAt,
      updatedBy: actor,
    }
  })
  const events: FabricLedgerEvent[] = entries.map((entry, index) => ({
    id: `remove-${occurredAt}-${index}`,
    fabricKey: entry.key,
    action: "REMOVE",
    fromStatus: entry.fromStatus,
    toStatus: "REMOVED",
    occurredAt,
    actor,
    note: "입고 대기 목록에서 삭제",
  }))

  const fabricOverrides = [...overrides, ...state.fabricOverrides.filter((item) => !keys.has(item.key))]
  const fabricEvents = [...events, ...state.fabricEvents]
  setAppState({ fabricOverrides, fabricEvents })
  await Promise.all([saveCache("fabricOverrides", fabricOverrides), saveCache("fabricEvents", fabricEvents)])
}
```

### 4. `src/routes/Warehouse.tsx`

`ActionKind`(34행)에 `"REMOVE"` 추가.

3행 lucide import 에 `ListX` 추가. **`Trash2` 는 폐기 버튼이 이미 쓰고 있으니 삭제에 재사용하지 마라.** 두 버튼이 같은 화면에 나란히 서므로 아이콘이 갈려야 한다.

29행 store import 에 `removeFabricRows` 추가.

툴바(1073~1081행). `직접 추가` 버튼 줄 바로 다음에 넣는다.

```tsx
        {tab === "READY" ? <Button type="button" size="sm" variant="outline" disabled={!selectedRows.length} onClick={() => openAction("REMOVE", selectedRows)}><ListX />선택 삭제</Button> : null}
```

`actionTitle`(768~775행) 분기에 추가. `: actionDialog?.kind === "REMOVE" ? "선택 삭제"`.

팝업 본문(1163행 DISPOSE 줄 부근)에 안내문 추가.

```tsx
          {actionDialog?.kind === "REMOVE" ? <div className="space-y-2"><p className="text-sm">선택한 {actionItems.length}건을 입고 대기 목록에서 뺍니다.</p><p className="text-xs text-[var(--muted-foreground)]">DD MASTER 원본과 개발 이력은 그대로 둡니다. 창고 화면에서만 감추며 폐기로 기록되지 않습니다. 삭제 기록은 원단 상세의 이력에 남습니다.</p></div> : null}
```

푸터의 확정 버튼 variant 조건(1170행)을 `actionDialog?.kind === "DISPOSE" || actionDialog?.kind === "REMOVE"` 로 넓힌다.

`runAction`(587행~)에 분기 추가. `UNRECEIVE` 분기 앞이나 뒤 어디든 좋다.

```ts
      } else if (actionDialog.kind === "REMOVE") {
        await removeFabricRows(actionItems.map((item) => ({ key: item.key, fromStatus: item.status })))
        setChecked(new Set())
```

## 검증

`npm run build` 하나만 돌린다. 모든 수정을 마친 뒤 한 번이다.

성공 기준은 `tsc --noEmit` 통과다. 특히 다음 세 곳에서 타입 에러가 나기 쉽다.

- `FABRIC_STATUS_META`·`statusRank` 가 `Record<FabricLedgerStatus, ...>` 라 REMOVED 를 빠뜨리면 컴파일이 깨진다.
- `Warehouse.tsx`의 `TAB_STATUSES`는 `Record<WarehouseTab, readonly FabricLedgerStatus[]>` 라 **수정할 필요가 없다.** REMOVED 를 어떤 탭에도 넣지 마라.
- `fabric-ledger.ts`에 `WEB_INTAKE_SHEET` 값 import 를 안 하면 깨진다.

브라우저 확인·데이터 대조는 하지 마라. 요청자가 직접 한다.

## 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset 이나 git checkout 으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터·단가·협력사명·개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
