# R324 1팀 창고 Rack No.를 V74에서 V-7-4 형태로 일괄 정리

상태: **미착수.** 2026-10-08 박향근 요청.

## 배경

1팀 창고 화면의 Rack No.가 `V74`, `V73`, `V72`처럼 영문과 숫자가 붙어 있다. 3팀 rack 형식(`K-1-1`)과 맞지 않아 읽기 어렵다. 가운데에 대시를 넣어 `V-7-4`로 바꾼다.

`normalizeRackNo`(`src/data/warehouse-rack.ts`)는 rack과 칸 사이에 구분자가 있어야 형식을 맞춘다. `V74`는 구분자가 없어 정규식에 안 걸리고 대문자로만 바뀌어 그대로 저장된다. `V`는 `RACK_ROWS`(K, L)에 없는 열이라 `V-7-4`도 규칙 검사에 안 걸리고 글자 그대로 저장된다. 그래서 이 작업은 **코드 수정이 아니라 데이터 변환**이다.

## 변환 규칙

**영문 한 글자 + 숫자 정확히 두 자리인 값만 바꾼다.**

```
^([A-Za-z])(\d)(\d)$   →   {대문자}-{숫자}-{숫자}
```

| 지금 값 | 결과 |
|---|---|
| `V74` | `V-7-4` |
| `V72` | `V-7-2` |
| `v74` | `V-7-4` |
| `V-7-4` | **건너뜀** (이미 대시가 있어 정규식에 안 걸린다) |
| `V7` | **건너뜀** (숫자가 하나라 어디서 끊을지 모른다) |
| `V123` | **건너뜀** (`V-1-23`인지 `V-12-3`인지 모른다) |
| `K-1-1` | **건너뜀** |

**숫자가 두 자리가 아닌 값을 추측해서 끊지 마라.** 틀리게 끊으면 실물 위치와 장부가 어긋난다. 건너뛴 값은 사용자에게 몇 건인지 알리고 사람이 손으로 고치게 둔다.

이 규칙은 **여러 번 돌려도 같은 결과**다. 이미 바뀐 값은 정규식에 안 걸린다.

## 절대 어기면 안 되는 두 가지 (2026-10-08 박향근 추가 지시)

**1. Rack No. 말고는 아무것도 바꾸지 않는다.**

`saveFabricRackNos`(`src/store/useAppStore.ts` 1241~1255행)는 override를 새로 만들 때 `status`, `storageNo`, `yds`, `roll`, `note`, `fields`, `locks`를 전부 `previous`에서 물려받고 `rackNo` 하나만 바꾼다. 그리고 저장 직전에 `blockedByWarehouseDrift`가 창고 장부 지문을 대조해, 그 밖의 값이 하나라도 달라지면 저장을 거부한다(R289).

**그래서 이 함수를 그대로 쓰는 한 다른 자료는 흐트러지지 않는다. 다른 저장 경로를 만들면 이 보호가 전부 사라진다.** 새 함수를 만들거나 `fabricOverrides`를 직접 조립하지 마라.

**2. 미지정은 미지정으로 남긴다.**

Rack No.가 비어 있는 행은 **건드리지 않는다.** 대상 목록에 넣지도 마라.

```ts
const current = (item.rackNo ?? "").trim()
if (!current) continue   // 미지정은 그대로 둔다
```

`saveFabricRackNos`에 `rackNo: ""`인 항목을 넘기면 그건 **지정 해제 동작**이다(1573행과 1594행의 Delete 키 처리가 그 용도로 쓴다). 이번 작업에서 빈 문자열을 넘기는 일이 있어서는 안 된다. 변환 대상은 **값이 있고 정규식에 걸리는 행뿐**이다.

"미지정", "-", "선택 안함" 같은 글자가 들어 있는 행도 `dashedRackNo`가 null을 돌려주므로 자동으로 제외된다. 따로 처리하지 마라.

## 하지 말 것과 그 이유

- **`saveFabricRackNos`(`src/store/useAppStore.ts` 1221행) 말고 다른 경로로 저장하지 마라.** 그 함수가 창고 권한 검사(`firstWarehouseDenial`), 창고팀 잠금(`locks.rackNo`), 새 배열 한 번 만들기를 전부 한다. 원단마다 따로 저장하면 앞 저장을 뒤 저장이 덮는다.
- **`fabricOverrides`를 직접 만들거나 `setAppState`로 밀어 넣지 마라.** 2026-10-02에 창고보관 3건이 사라진 사고가 이 계열이다(R287~R290).
- **`src/data/warehouse-rack.ts`의 `normalizeRackNo`를 고치지 마라.** 2026-09-22에 "형식을 강제하지 않는다"로 정했다. 입력 동작은 그대로 둔다. 이번 작업은 이미 저장된 값만 바꾼다.
- **`RACK_ROWS`에 `V`를 더하지 마라.** 그러면 `RACK_SLOTS`와 배치도(`RackMap`)에 V열이 생긴다. 1팀 rack은 3팀 배치도에 없는 선반이다.
- **3팀 원단을 건드리지 마라.** `teamScope === "team1"`이고 `isFabric1Item`이 true인 행만 대상이다.
- **창고보관(`status === "WAREHOUSE"`) 행만 대상이다.** 이력으로 간 행의 rack은 건드리지 않는다.
- **확인 없이 바꾸지 마라.** 몇 건이 바뀌고 몇 건이 건너뛰는지 보이고 사람이 누르게 한다.
- **Rack No.가 빈 행(미지정)을 대상에 넣지 마라.** 위 "절대 어기면 안 되는 두 가지" 2번을 보라.
- **`rackNo`가 아닌 어떤 필드도 건드리지 마라.** 원단 상세, 재고, 확인, 롤, R&D No.는 이 작업과 무관하다.
- **워킹트리에 R321 미완성 작업이 있다. 건드리지 마라.** `src/routes/TechnicalReferences.tsx`, `src/data/reference-schema.ts`, `src/data/reference-demo.ts`, `src/App.tsx`, 삭제된 `src/routes/Study.tsx`다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/warehouse-rack.ts` | 변환 함수 하나 추가 |
| `src/routes/Warehouse.tsx` | 버튼과 핸들러 추가 |

## 1. `src/data/warehouse-rack.ts`

파일 맨 아래에 함수 하나를 더한다. 기존 함수는 고치지 않는다.

```ts
/**
 * `V74`처럼 영문 한 글자에 숫자 두 자리가 붙은 rack 번호에 대시를 넣는다(`V-7-4`).
 * 1팀 선반이 이 형태라 3팀 형식(K-1-1)과 맞추려고 만든 일회성 정리용이다.
 * 숫자가 두 자리가 아니면 어디서 끊을지 알 수 없으므로 건드리지 않고 null을 돌려준다.
 * 이미 대시가 있는 값도 정규식에 안 걸려 null이다. 여러 번 돌려도 결과가 같다.
 */
export function dashedRackNo(raw: string): string | null {
  const match = /^([A-Za-z])(\d)(\d)$/.exec(raw.trim())
  if (!match) return null
  return `${match[1].toUpperCase()}-${match[2]}-${match[3]}`
}
```

## 2. `src/routes/Warehouse.tsx`

### 2-1. 대상 계산

`useMemo`로 둔다. 1팀 스코프이고 창고보관인 행 중 `dashedRackNo`가 값을 돌려주는 것만 모은다. 함께 건너뛸 값도 센다.

```ts
const rackDashTargets = useMemo(() => {
  if (teamScope !== "team1") return { convert: [] as { item: FabricLedgerItem; rackNo: string }[], skipped: [] as string[] }
  const convert: { item: FabricLedgerItem; rackNo: string }[] = []
  const skipped: string[] = []
  for (const item of /* 1팀 창고보관 행 목록 */) {
    const current = (item.rackNo ?? "").trim()
    if (!current) continue   // 미지정은 그대로 둔다. 대상에 넣지 않는다.
    const dashed = dashedRackNo(current)
    if (dashed) convert.push({ item, rackNo: dashed })
    else if (!current.includes("-")) skipped.push(current)
  }
  return { convert, skipped }
}, [/* 의존성 */])
```

행 목록은 이 파일이 이미 들고 있는 원장 배열을 쓴다. `visibleRows`는 필터와 검색에 걸려 있으므로 **쓰지 마라.** 화면에 안 보이는 행도 바뀌어야 한다. `isFabric1Item`과 `status === "WAREHOUSE"`로 직접 거른 전체 목록을 쓴다.

`skipped`는 대시가 없는데 변환도 안 되는 값만 센다. 이미 `V-7-4`인 값은 건너뛴 것이 아니라 끝난 것이라 세지 않는다.

### 2-2. 버튼

1990행 근처 `신규 입고` 버튼 옆에 둔다. 조건은 이렇다.

```
teamScope === "team1" && tab === "WAREHOUSE" && canEditScope && rackDashTargets.convert.length > 0
```

**변환할 값이 없으면 버튼이 사라진다.** 도구줄의 `끊어진 연결 N` 버튼과 같은 방식이다. 정리가 끝나면 저절로 없어진다.

라벨은 `Rack No. 정리 {건수}`다. `title`은 `V74 형태의 Rack No.에 대시를 넣어 V-7-4로 바꿉니다`로 한다.

### 2-3. 핸들러

누르면 먼저 확인을 받는다. 이 파일에서 쓰는 확인 방식(`window.confirm` 또는 기존 확인 창)을 그대로 쓴다. 문구는 이렇다.

```
Rack No. {n}건을 V-7-4 형태로 바꿀까요?
예: {예시 최대 3개를 "V74 → V-7-4" 로 나열}
```

건너뛸 값이 있으면 줄을 하나 더 붙인다.

```
숫자가 두 자리가 아닌 {m}건은 그대로 둡니다. 직접 고쳐야 합니다.
```

확인하면 `saveFabricRackNos(rackDashTargets.convert)`를 **한 번** 부른다. 돌아온 건수로 안내한다.

```ts
const count = await saveFabricRackNos(rackDashTargets.convert)
setSelectionNotice(count ? `Rack No. ${count}건을 정리했습니다.` : "바뀐 값이 없습니다.")
```

`saveFabricRackNos`가 권한 거부를 스스로 알리고 0을 돌려준다. 그 경우 위 문구가 "바뀐 값이 없습니다"로 나가는데 그대로 둔다. 권한 안내는 그 함수가 이미 띄운다.

## 검증

1. `npm run build` 한 번. 모든 수정을 마친 뒤에 돌린다.
2. `git status --short`로 위 표의 두 파일과 이 문서만 바뀌었는지 본다.

화면 확인은 하지 마라. 박향근이 직접 본다.
