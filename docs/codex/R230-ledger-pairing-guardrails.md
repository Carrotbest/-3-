# R230 원장 짝짓기 보정 (R229 후속)

## 상태

미착수. R229가 워킹트리에 들어가 있고 빌드까지 통과했다. **R229를 되돌리지 마라.** 이 문서는 그 위에 세 군데를 고친다.

고칠 파일은 `src/data/fabric-ledger.ts` 하나다. 다른 파일은 건드리지 마라.

## 무엇이 잘못됐나 (실제 결과로 확인한 것)

R229 적용 뒤 창고 입고대기에 없던 10건이 한꺼번에 올라왔다. 그 행들의 FL# 칸에는 번호가 아니라 메모가 들어 있다. `미등록`, `부속으로 body 2차 진행`, `컬러 잘못염색됨`, `등록 holding/초기 발수`, `미등록:기계테스트` 같은 글자다.

R229는 `normalized(record.flNo)`가 비어 있지 않으면 전부 FL 식별자로 본다. 그래서 이런 메모 글자가 원단 번호 노릇을 하고, 예전에 그 글자로 한 덩어리에 뭉쳐 있던 행들이 각자 떨어져 나와 화면에 올라왔다. **FL 형식이 아닌 글자를 식별자로 쓰면 안 된다.**

같은 작업에서 목표였던 건(`FL26xxxxxx`의 옵션 4건)은 여전히 3건만 보인다. 네 번째 행이 창고 세 탭 어디에도 없다. 원인 후보가 둘이고 둘 다 아래에서 막는다.

## 1. FL 형식일 때만 FL로 본다

`src/data/dd-workflow.ts`의 `isCompletedFlNo`가 판정 기준이다(`/^FL\d{8}$/`). 이미 있는 함수이고 DD 화면이 쓰는 것과 같다. `fabric-ledger.ts` 상단에 `import { isGdRecord } from "./dd-workflow"`가 있으니 거기에 더한다.

records 루프(612행)에서 FL 판정을 이렇게 바꾼다.

```ts
// FL# 칸에는 번호 대신 메모가 들어 있는 행이 많다(미등록, 컬러 잘못염색됨 …).
// 그런 글자를 원단 식별자로 쓰면 뜻이 없는 글자로 행이 묶이거나 갈라진다.
// 형식이 맞는 번호일 때만 FL 로 본다.
const fl = isCompletedFlNo(record.flNo) ? normalized(record.flNo) : ""
```

`fl`이 빈 문자열이면 짝짓기를 건너뛰는 것은 R229 그대로다. 다만 **형식이 아닌 글자가 적힌 행은 R229 이전 동작을 그대로 돌려준다.** 즉 자기 key를 새로 만들지 말고 예전 경로를 탄다.

```ts
records.forEach((record) => {
  const ddBaseKey = ddRowBaseKey(record)
  const fl = isCompletedFlNo(record.flNo) ? normalized(record.flNo) : ""
  // FL 형식이 아닌 글자가 적힌 행은 R229 이전 규칙 그대로 둔다.
  // 근거 없는 병합이지만 오래 그렇게 굴러왔고, 지금 푸는 것은 이 작업의 범위가 아니다.
  const legacyText = !fl && normalized(record.flNo) ? normalized(record.flNo) : ""
  let matchedKey: string
  if (legacyText) {
    matchedKey = resolveKey("", record.flNo, "", recordIdentity(record))
  } else {
    const ownKey = ownKeyFor(record, fl, ddBaseKey)
    matchedKey = (fl ? takeSampleMatch(record, fl) : undefined) ?? ownKey
  }
  ...
})
```

나머지(`existing`, `items.set`, `recordKeyIndex.set`, `registerIdentities`)는 R229 그대로 둔다.

`ownKeyFor`의 `fl`이 빈 문자열인 분기(`ddRowKeyCounts`)는 FL 칸이 완전히 빈 행 전용으로 남는다. 그대로 둔다.

## 2. 조직과 컬러 일치 우선순위를 뺀다

`takeSampleMatch`(561행)의 세 번째 블록(578-586행, `const cons = normalized(record.construction)` 부터 그 `if` 블록 끝까지)을 **통째로 지운다.**

옵션 네 개가 모두 같은 조직(`Flat Back Rib`)에 같은 컬러인 경우가 흔하다. 그러면 첫 DD 행이 엉뚱한 대장 행을 먼저 차지하고, 정작 그 대장 행의 주인인 행이 밀려난다. **Yarn Detail 이 맞을 때만 붙이고, 아니면 따로 세운다.** 잘못 붙는 것보다 낫다.

남는 우선순위는 셋이다.
1. 이미 입고 기록으로 연결된 R&D No. 항목(`linkedStorageByRecordId`)
2. Yarn Detail 일치
3. 대장 행도 DD 행도 하나뿐일 때만 남은 하나

## 3. 숨긴 행에는 붙이지 않는다

`buildFabricLedger`는 override를 맨 마지막에 적용한다. 그래서 짝짓기 시점에는 그 대장 행이 목록에서 숨겨진(`REMOVED`) 행인지 알 수 없다. 숨긴 행에 DD 행이 붙으면 상태가 `REMOVED`로 굳어(`mergeRecord`의 상태 비교에서 `REMOVED`가 가장 높다) **그 DD 행까지 화면에서 통째로 사라진다.** 지금 찾는 네 번째 행이 이 경우일 수 있다.

`ddCountByFl` 계산(547행) 근처에 넣는다.

```ts
// 목록에서 숨긴 행이다. 여기에 DD 행을 붙이면 그 DD 행까지 화면에서 사라진다.
const removedKeys = new Set(overrides.filter((override) => override.status === "REMOVED").map((override) => override.key))
```

`takeSampleMatch`의 pool 필터에 조건을 더한다.

```ts
const pool = (samplePoolByFl.get(fl) ?? []).filter((key) =>
  !claimedSampleKeys.has(key) && !items.get(key)?.record && !removedKeys.has(key))
```

## 하지 말 것

- R229의 1대1 짝짓기 구조를 되돌리지 마라. 같은 FL 을 가진 DD 행이 서로 잡아먹는 것을 막는 것이 그 작업의 목적이다.
- `isCompletedFlNo`를 새로 만들지 마라. `dd-workflow.ts`에 있다.
- 대장(samples) 루프의 key 규칙을 바꾸지 마라.
- 짝을 못 찾은 DD 행을 아무 대장 행에나 붙이지 마라.
- 다른 파일을 고치지 마라.

## 검증

`npm run build` 한 번. `git status --short`로 `src/data/fabric-ledger.ts` 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `takeSampleMatch`에 조직·컬러 비교가 남아 있지 않다.
3. records 루프에서 FL 판정이 `isCompletedFlNo`를 지난다.
4. pool 필터에 `removedKeys`가 들어 있다.
