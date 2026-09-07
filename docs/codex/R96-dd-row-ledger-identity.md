# R96 — YDS 입력 행이 창고에 안 뜨는 문제와 FDS 완료 표시

상태: 구현 완료(클로드 직접 시공, Codex 한도 소진). 화면 확인만 남음.

번호 주의: `R95`는 창고 대장 미러 작업이 이미 쓰고 있다. 이 문서는 그 위에 얹는 별개 건이다.

## 확인한 사실

DD MASTER에서 FDS·YDS에 09-07을 넣은 네 행(Style `Sam's Supima`, FL 미입력) 중 첫 행만 "입고 대기"로 뜨고 나머지 세 행은 "미연결"이다. 창고 화면에도 첫 행만 있다.

YDS 판정 자체는 정상이다. `src/data/fabric-ledger.ts:117` `statusFromRecord`는 `tech.sampleDates.yds`에 값이 있으면 READY를 돌려준다. **이 함수는 건드리지 마라.**

원인은 원장 key다. `buildFabricLedger`의 records 루프(336~347행)에서 FL이 없는 DD 행은 이렇게 묶인다.

```ts
    const matchedKey = normalized(record.flNo)
      ? resolveKey("", record.flNo, "", fallback)
      : fabricLedgerKey("", record.styleNo, fallback)
```

`fabricLedgerKey("", styleNo, fallback)`는 Style이 있으면 `style:<STYLE>`을 돌려준다. 그래서 Style이 같고 FL이 없는 DD 행이 전부 한 key에 모인다. 바로 다음 줄이 결정타다.

```ts
    const item = existing ? (existing.record ? existing : mergeRecord(existing, record)) : emptyFromRecord(record)
```

이미 record가 붙은 항목이면 새 record를 **그냥 버린다.** 병합도 하지 않는다. 그래서 같은 Style의 두 번째 행부터는 원장에 아예 존재하지 않는다. `DevelopmentMasterSheet.tsx:796`의 `ledgerByRecord`가 그 행을 못 찾아 "미연결"로 그리고, 창고 목록에도 나오지 않는다.

같은 화면의 `SAMES` 두 행(2행 연결, 3행 미연결)도 같은 이유다.

## 사용자가 정한 것

- FDS에 날짜가 들어가면 완료로 표시한다.
- YDS에 날짜가 들어가면 자동으로 창고 입고 대기에 뜬다. 행마다 각각 떠야 한다.
- 샘플관리대장과의 기존 연결이 깨지면 안 된다.

## 설계

### 왜 Style로 묶으면 안 되는가

DD의 `Style No.`는 대장의 `Style/#`과 뜻이 다르다. 같은 파일 안 `mergeRecord` 주석(250행)에 이미 적혀 있다. DD의 그 칸에는 원본 FL이 들어 있고, 대장 `Style/#`에 대응하는 DD 값은 `gdNo`/`saNo`다. 그래서 Style은 DD 행끼리 묶는 기준이 될 수 없다. 옵션이 다른 별개 원단이 같은 Style 문자열을 공유한다.

### 무엇으로 바꾸는가

FL이 없는 DD 행은 **자기 내용으로 만든 key로 각자 한 항목**을 갖는다. 행 번호를 쓰지 않는다. 엑셀을 다시 올려 행이 밀려도 채번과 오버라이드가 따라와야 하기 때문이다. 같은 파일의 `closedHistoryBaseKey`(96행)가 쓰는 방식을 그대로 따른다. 값 길이를 앞에 붙여 구분자 충돌을 막고, 완전히 같은 조합이 겹칠 때만 `#2`부터 순번을 붙인다.

대장과는 FL로만 붙인다. Style로 붙이는 경로는 R95(창고 대장 미러)에서 이미 잘못된 연결로 판정해 끊었다. 여기서 되살리지 않는다.

기존 오버라이드(채번·입고 상태)는 `resolveStoredKey`(350행)가 `identityIndex`로 옛 `style:` key를 풀어 준다. `registerIdentities` 호출을 그대로 두면 같은 Style의 첫 행이 계속 그 key를 받으므로, 이미 채번된 행은 자기 R&D No.를 유지한다. **`registerIdentities` 호출을 지우거나 옮기지 마라.**

### FDS 완료 표시

`recalculateDevelopmentRecords`(`src/data/dd-workflow.ts:62`)에 규칙을 넣는다. 이 함수는 업로드 파싱(`xlsx-parsers.ts:666`)과 모든 저장(`useAppStore.ts:421`)에서 돈다. 그래서 두 경로가 한 번에 덮인다.

규칙은 하나다. **FDS에 값이 있고 현재 Status가 비었거나 `진행중`이면 `완료`로 올린다.** `HOLD`·`DROP`·`REJECT`·이미 `완료`인 행은 그대로 둔다. `receivedDate`는 건드리지 마라. RDDA 등록 집계가 그 값을 기준으로 삼는다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/fabric-ledger.ts` | FL 없는 DD 행에 내용 기반 key 부여 |
| `src/data/dd-workflow.ts` | FDS 날짜가 있으면 devStatus를 완료로 |

### 1. `src/data/fabric-ledger.ts`

**1-1.** `closedHistoryBaseKey`(96~106행) 아래에 DD 행 key 함수를 추가한다.

```ts
/** FL이 없는 DD 행의 원장 key. 행 번호를 쓰지 않아 엑셀을 다시 올려도 같은 항목을 가리킨다. */
function ddRowBaseKey(record: DevRecord): string {
  const values = [
    record.owner,
    record.styleNo,
    record.season,
    record.color,
    record.construction,
    String(record.weight ?? ""),
    record.dyeing,
    record.opt,
  ].map(normalized)
  return `dd:${values.map((value) => `${value.length}:${value}`).join("|")}`
}
```

**1-2.** `buildFabricLedger` 안, `closedHistoryKeyCounts` 선언(272행 부근) 옆에 카운터를 하나 더 만든다.

```ts
  const ddRowKeyCounts = new Map<string, number>()
```

**1-3.** records 루프(336~347행)를 다음으로 교체한다.

```ts
  records.forEach((record) => {
    const fallback = recordIdentity(record)
    // DD의 'Style No.'는 대장의 Style/#과 뜻이 다르고 원본 FL이 들어 있다.
    // 그래서 DD 레코드는 FL로만 대장에 붙인다.
    let matchedKey: string
    if (normalized(record.flNo)) {
      matchedKey = resolveKey("", record.flNo, "", fallback)
    } else {
      const style = normalized(record.styleNo)
      const styleKey = style ? identityIndex.get(`style:${style}`) : undefined
      const styleTarget = styleKey ? items.get(styleKey) : undefined
      if (styleTarget && !styleTarget.record) {
        // 대장에서 온 항목이 아직 DD와 안 붙었으면 기존처럼 거기에 붙인다.
        matchedKey = styleKey!
      } else {
        // FL 없는 DD 행은 각자 한 항목이다. Style이 같다고 묶으면 뒤 행이 통째로 사라진다.
        const baseKey = ddRowBaseKey(record)
        const occurrence = (ddRowKeyCounts.get(baseKey) ?? 0) + 1
        ddRowKeyCounts.set(baseKey, occurrence)
        matchedKey = occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`
      }
    }
    const existing = items.get(matchedKey)
    const item = existing ? (existing.record ? existing : mergeRecord(existing, record)) : emptyFromRecord(record)
    items.set(matchedKey, item)
    registerIdentities(item, fabricIdentities("", record.flNo, record.styleNo))
  })
```

**1-4.** `emptyFromRecord`(146행)의 key도 같은 규칙을 따라야 한다. 지금은 `fabricLedgerKey(record.flNo, record.styleNo, recordIdentity(record))`라 위에서 정한 key와 어긋난다. 항목의 key는 `items` 맵의 key와 반드시 같아야 오버라이드와 이벤트가 붙는다. `emptyFromRecord`에 key를 인자로 받게 고친다.

```ts
function emptyFromRecord(record: DevRecord, key: string): FabricLedgerItem {
  return {
    key,
```

호출부는 1-3의 `emptyFromRecord(record, matchedKey)` 하나뿐이다. 다른 호출부가 있으면 같이 고친다.

### 2. `src/data/dd-workflow.ts`

`recalculateDevelopmentRecords`(62행)의 `return records.map(...)` 안, `stage` 계산 다음에 Status 규칙을 넣는다. 반환 객체에 `devStatus`를 추가한다.

```ts
    // FDS 수취 날짜가 들어오면 완료로 올린다. HOLD·DROP·REJECT는 사람이 정한 상태라 유지한다.
    const currentStatus = normalizedStatus(record)
    const devStatus = String(record.tech?.sampleDates?.fds ?? "").trim() && (!currentStatus || currentStatus === "진행중")
      ? "완료"
      : record.devStatus
```

그리고 마지막 반환에 `devStatus`를 넣는다.

```ts
    return { ...record, devStatus, opt: hasStyleNo ? formula?.opt ?? record.opt : "", stage, processReached, tech }
```

`normalizedStatus`는 대문자로 정규화하지만 한글은 그대로다. `"진행중"` 비교는 그대로 동작한다.

## 하지 말 것

- `statusFromRecord`(117행)를 고치지 마라. YDS 판정은 이미 맞다.
- `statusFromSample`(120~127행)의 시트 분기를 고치지 마라. R93에서 확정한 규칙이다.
- FL이 있는 DD 행의 병합 규칙을 바꾸지 마라. 같은 FL은 1건이 계약이다.
- `registerIdentities` 호출과 `resolveStoredKey`를 지우거나 순서를 바꾸지 마라. 기존 채번이 끊긴다.
- `receivedDate`를 자동으로 채우지 마라.
- `fabricLedgerKey`의 시그니처와 우선순위(rnd → fl → style → source)를 바꾸지 마라. 대장·웹 등록 행이 그대로 쓴다.
- 동기화(`firestore-sync.ts`, `sync-merge.ts`)와 창고 화면(`Warehouse.tsx`)은 이번 범위가 아니다.
- 새 필드를 `schema.ts`에 추가하지 마라.

## 검증

```
npm run build
git status --short
```

`tsc --noEmit`이 통과하고 수정 파일이 위 두 개뿐이면 된다. 화면 확인은 사용자가 한다.
