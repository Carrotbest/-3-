# R287 — 창고 원장: FL 칸 글자로 다른 원단에 합쳐지는 결함

추론 강도: **medium**. 파일 2개. 데이터 계약(원장 key)을 건드리지만 바꿀 코드는 확정돼 있다.

## 상태

미착수. 워킹트리에 R282~R286 변경이 있다. **되돌리지 마라.**

## 사고 (2026-10-02, 실데이터로 확인)

- DD 행 `전체현황::630~633`(Style `FL23122573`, 옵션 1~4)은 9/21 창고보관 1324, 1323, 1325, 1322다. 당시 FL 칸에 R&D No.를 글자로 적어 두었다.
- 9/28 뒤 네 행의 FL 칸이 `DROP`으로 바뀌었다.
- `buildFabricLedger`는 FL 형식이 아닌 글자 행을 `resolveKey("", record.flNo, ...)`로 처리한다. `fl:DROP` 색인은 옛 대장 샘플 1157(`#28411`, FL `Drop`)이 이미 잡고 있다. 그래서 네 DD 행이 **전부 샘플 1157 항목으로 합쳐졌다.**
- 결과: 창고보관에 1324 하나만 남았다. 그 행은 1157 원단 정보를 보이고 재고는 네 원단 출고가 합쳐진 8/24다. 1322, 1323, 1325, 1157은 사라졌다. 같은 결함으로 `미등록` 글자 DD 행 7개도 한 항목으로 뭉쳐 6행이 안 보인다.
- 창고 화면을 열 때 도는 `backfillFabricRecordIds`가 이 잘못 합쳐진 원장을 믿었다. 그래서 `rnd:1157` 상태 기록과 그 확인 이력에 `recordId: "전체현황::630"`을 영구 저장했다. 데이터 정리는 클로드가 따로 한다. **코드로 데이터를 고치지 마라.**

## 틀린 시도. 다시 하지 말 것

- 백필에서 "자기 key 항목에 DD 행이 없는데 남의 DD 행을 가리키는 recordId를 지운다"는 자동 치유 규칙을 검토했다. 9/21 백업에서 정상 연결 3건(`rnd:1276`, `rnd:1279`, `rnd:1286` 확인 이력)까지 지웠다. 과도기 상태를 오염으로 읽는다. **자동 치유를 넣지 마라.**

## 1. `src/data/fabric-ledger.ts` `buildFabricLedger` 안 `records.forEach` (638~652행)

현재:

```ts
    // FL# 칸에는 번호 대신 메모가 들어 있는 행이 많다(미등록, 컬러 잘못염색됨 …).
    // 그런 글자를 원단 식별자로 쓰면 뜻이 없는 글자로 행이 묶이거나 갈라진다.
    // 형식이 맞는 번호일 때만 FL 로 본다.
    const fl = isCompletedFlNo(record.flNo) ? normalized(record.flNo) : ""
    // FL 형식이 아닌 글자가 적힌 행은 R229 이전 규칙 그대로 둔다.
    // 근거 없는 병합이지만 오래 그렇게 굴러왔고, 지금 푸는 것은 이 작업의 범위가 아니다.
    const legacyText = !fl && normalized(record.flNo) ? normalized(record.flNo) : ""
    let matchedKey: string
    if (legacyText) {
      matchedKey = resolveKey("", record.flNo, "", recordIdentity(record))
    } else {
      // Allocate every DD row's own key first so match success cannot shift later keys.
      const ownKey = ownKeyFor(record, fl, ddBaseKey)
      matchedKey = (fl ? takeSampleMatch(record, fl) : undefined) ?? ownKey
    }
```

교체:

```ts
    // FL# 칸에는 번호 대신 메모가 들어 있는 행이 많다(미등록, DROP, 컬러 잘못염색됨 …).
    // 그런 글자를 원단 식별자로 쓰면 뜻이 없는 글자로 행이 묶이거나 갈라진다.
    // 형식이 맞는 번호일 때만 FL 로 보고, 글자만 있는 행은 FL 이 빈 행과 똑같이 자기 key 를 갖는다.
    // R287: 예전에는 글자로 색인을 찾아 합쳤다. 'DROP'으로 바꾼 DD 행 4개가 FL 'Drop'인 옛 대장 샘플에
    // 통째로 흡수되어 창고보관 3건이 사라지고 1건이 다른 원단으로 보였다. 글자로 합치지 말 것.
    const fl = isCompletedFlNo(record.flNo) ? normalized(record.flNo) : ""
    // Allocate every DD row's own key first so match success cannot shift later keys.
    const ownKey = ownKeyFor(record, fl, ddBaseKey)
    const matchedKey = (fl ? takeSampleMatch(record, fl) : undefined) ?? ownKey
```

그 아래 `registerIdentities(item, [...fabricIdentities("", record.flNo, record.styleNo), ddBaseKey])`는 **그대로 둔다.** 예전 `fl:<글자>` key로 저장된 기록이 색인으로 이어 붙는 길이다.

`resolveKey`는 샘플 처리에서 계속 쓴다. 지우지 마라.

## 2. `src/store/useAppStore.ts` `backfillFabricRecordIds` (1557행)

다른 key의 상태 기록이 이미 쓰는 DD 행 번호는 새로 채우지 않는다. DD 행 하나에 상태 기록 하나가 계약이다. 채우지 않으면 예전처럼 key로 찾으므로 손해가 없다.

현재(1563~1578행):

```ts
  const fabricOverrides = state.fabricOverrides.map((entry) => {
    if (entry.recordId) return entry
    const recordId = recordIds.get(entry.key)
    if (!recordId) return entry
    filled += 1
    overridesChanged = true
    return { ...entry, recordId }
  })
  const fabricEvents = state.fabricEvents.map((event) => {
    if (event.recordId) return event
    const recordId = recordIds.get(event.fabricKey)
    if (!recordId) return event
    filled += 1
    eventsChanged = true
    return { ...event, recordId }
  })
```

교체:

```ts
  // DD 행 하나에 상태 기록 하나다. 다른 key 의 상태 기록이 이미 쓰는 행 번호는 채우지 않는다(R287).
  // 원장이 잘못 합쳐진 순간에 채우면 그 연결이 영구 저장되어, 고친 뒤에도 기록이 엉뚱한 행으로 간다.
  const carriedBy = new Map<string, string>()
  state.fabricOverrides.forEach((entry) => { if (entry.recordId) carriedBy.set(entry.recordId, entry.key) })
  const ownOverrideKeys = new Set(state.fabricOverrides.map((entry) => entry.key))
  const claimedElsewhere = (recordId: string, key: string): boolean => {
    const holder = carriedBy.get(recordId)
    return holder !== undefined && holder !== key
  }
  const fabricOverrides = state.fabricOverrides.map((entry) => {
    if (entry.recordId) return entry
    const recordId = recordIds.get(entry.key)
    if (!recordId || claimedElsewhere(recordId, entry.key)) return entry
    filled += 1
    overridesChanged = true
    return { ...entry, recordId }
  })
  const fabricEvents = state.fabricEvents.map((event) => {
    if (event.recordId) return event
    const recordId = recordIds.get(event.fabricKey)
    if (!recordId) return event
    // 이 이력의 원단이 자기 상태 기록을 따로 갖고 있는데 행 번호는 남이 쓰고 있으면 다른 원단이다.
    if (ownOverrideKeys.has(event.fabricKey) && claimedElsewhere(recordId, event.fabricKey)) return event
    filled += 1
    eventsChanged = true
    return { ...event, recordId }
  })
```

함수 위 주석 `/** 기존 창고 기록 중 현재 원장에서 확실히 찾을 수 있는 DD 행에만 고유번호를 보충한다. */`는 그대로 둔다.

## 근거 수치 (클로드가 같은 데이터로 다시 대조한다)

수정 코드 + 정리 데이터에서 창고보관 변화는 정확히 다음뿐이다.

| R&D No. | 원단 | 재고/잔량 | Rack |
|---|---|---|---|
| 1322, 1323, 1324, 1325 | Style FL23122573 옵션 4, 2, 1, 3 | 24 / 20 | K-1-3 |
| 1157 | #28411 (FL Drop) | 미입력 | 없음 |

부수 변화: `미등록` 글자 DD 행이 각자 항목으로 갈라진다. 입고대기에 `HMP127149` 옵션 4(`전체현황::935`) 한 행이 새로 보인다. 나머지는 개발 진행 상태라 창고 탭에 안 뜬다.

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 협력사명, 개인 메일을 코드나 문서에 넣지 마라. 위 주석 문구 외에 사례 값을 더 넣지 마라.
- `applyFabricActions`의 `replacedRecordIds` 필터, `resolveEntryKey`, `takeSampleMatch`, 샘플 처리 블록은 건드리지 마라.
- public/data 아래 JSON을 열지 마라.
- npm run build는 모든 수정을 마친 뒤 한 번만 돌려라. 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.

## 검증

`npm run build` 통과. 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
