# R229 DD 행 하나 = 원단 하나 (원장 병합 결함 수정)

## 상태

미착수. R224~R227이 워킹트리에 들어가 있고 빌드까지 통과했다. R228(롤 표기, 창고팀 자료)은 아직 안 넣었다. **어느 것도 되돌리거나 다시 만들지 마라.**

고칠 파일은 `src/data/fabric-ledger.ts` 하나다. 다른 파일은 건드리지 마라.

## 증상 (실제 사례. 재현하지 말고 그대로 믿어라)

DD MASTER에 같은 Style의 옵션 4건이 있고 넷 다 FL#이 `FL26xxxxxx`으로 같다. 넷 다 Received date를 넣었는데 창고에는 3건만 보이고 1건이 아예 없다. 창고보관에 R&D No. 1322, 1323, 1325가 있고 입고대기는 비어 있다. 그 3건은 샘플관리대장에서 온 행이고 각자 Yarn Detail이 다르다. DD 옵션 네 개 중 셋은 그 세 행과 Yarn Detail이 같고, 남은 하나(남은 옵션 한 건)는 짝이 없어 화면 어디에도 안 나온다.

## 원인 (코드에서 확인한 것)

`buildFabricLedger`의 DD 레코드 처리(538-562행).

1. 547-548행. FL#이 있는 DD 행은 **FL# 하나로만** 원장 항목을 찾는다. `resolveKey("", record.flNo, "", fallback)`은 `fl:FL26xxxxxx`을 만들고, 이미 그 FL을 색인에 올린 항목(여기서는 대장 행 `rnd:1322`)이 있으면 그 key를 돌려준다.
2. 556행. `existing ? (existing.record ? existing : mergeRecord(existing, record)) : ...`. 이미 DD 행이 붙어 있는 항목이면 **새 DD 행을 버리고 기존 항목을 그대로 돌려준다.** 경고도 기록도 없다.

그래서 같은 FL을 가진 DD 행 N개가 첫 행 하나로 접힌다. 짝이 될 대장 행이 없는 DD 행은 원장에서 사라진다.

같은 뿌리의 두 번째 결함이 있다. 같은 FL의 DD 행 두 개를 각각 입고 등록하면 두 override가 같은 항목으로 해석되어(566-577행) `updatedAt`이 늦은 쪽만 남는다. 먼저 등록한 R&D No.와 재고가 화면에서 사라진다.

## 원칙

**DD 행 하나는 원단 하나다. DD 행끼리는 어떤 경우에도 서로 흡수하지 않는다.**
대장 행과의 병합은 1대1로만 한다. 한 대장 행에 DD 행 두 개가 붙지 않고, 한 DD 행이 대장 행 두 개를 먹지 않는다.

---

## 1. 대장 행 후보 색인

samples 루프(502-536행) 안에서, 종료 이력(`isClosedHistorySample`)과 1팀(`fabric1`)이 아닌 행에 한해 FL별 후보 목록을 쌓는다. `matchedKey`를 확정한 뒤, `registerIdentities` 호출 근처에 넣는다.

```ts
// FL 하나에 대장 행이 여럿일 수 있다(같은 FL로 여러 실물을 번호 매긴 운영이 실제로 있다).
// DD 행은 이 목록에서 짝이 없는 항목 하나만 가져간다.
const samplePoolByFl = new Map<string, string[]>()
```

```ts
const flKey = normalized(sample.flNo)
if (flKey) {
  const pool = samplePoolByFl.get(flKey) ?? []
  if (!pool.includes(matchedKey)) pool.push(matchedKey)
  samplePoolByFl.set(flKey, pool)
}
```

선언은 `ddRowKeyCounts` 옆(479행 근처)에 둔다.

## 2. DD 레코드 처리 교체

538-562행의 `records.forEach` 본문을 아래 규칙으로 바꾼다. 루프 순서(배열 순서)는 그대로 둔다. 순서가 바뀌면 key가 흔들린다.

### 2-1. 사전 계산 (루프 앞)

```ts
// FL별 DD 행 수. 짝짓기를 자동으로 할지 말지 가르는 기준이다.
const ddCountByFl = new Map<string, number>()
records.forEach((record) => {
  const fl = normalized(record.flNo)
  if (fl) ddCountByFl.set(fl, (ddCountByFl.get(fl) ?? 0) + 1)
})
// 앱이 입고 처리할 때 써 둔 연결이다. 사람이 이미 번호를 매긴 짝이라 무엇보다 먼저 지킨다.
// recordId 가 없는 옛 기록은 여기 넣지 않는다. 그런 기록은 key(`rnd:번호`)로 대장 항목에 그대로 붙어 있다.
const linkedStorageByRecordId = new Map<string, string>()
overrides.forEach((override) => {
  const storage = normalized(override.storageNo ?? "")
  if (override.recordId && storage) linkedStorageByRecordId.set(override.recordId, `rnd:${storage}`)
})
const claimedSampleKeys = new Set<string>()
const flOccurrence = new Map<string, number>()
```

### 2-2. 짝 고르기

```ts
/**
 * DD 행이 붙을 대장 항목을 고른다. 없으면 undefined 를 돌려 DD 행이 제 항목을 갖는다.
 *
 * 우선순위
 *  0. 이미 입고 기록으로 연결된 R&D No. 항목. 지금 화면 상태를 그대로 보존한다.
 *  1. Yarn Detail 이 같은 항목
 *  2. 조직(Cons.)과 컬러가 둘 다 같은 항목
 *  3. FL 안에서 대장 행도 DD 행도 하나뿐일 때만 남은 하나. 애매하면 붙이지 않는다.
 *
 * 3번에 조건을 거는 이유. 같은 FL 에 대장 행과 DD 행이 여럿인데 값이 안 맞는 것을 아무거나 짝지으면
 * 엉뚱한 실물에 R&D No. 가 붙는다. 잘못 붙는 것보다 따로 서는 편이 낫다. 사람이 보고 판단한다.
 */
const takeSampleMatch = (record: DevRecord, fl: string): string | undefined => {
  const pool = (samplePoolByFl.get(fl) ?? []).filter((key) => !claimedSampleKeys.has(key) && !items.get(key)?.record)
  if (!pool.length) return undefined
  const claim = (key: string): string => { claimedSampleKeys.add(key); return key }

  const linked = linkedStorageByRecordId.get(recordIdentity(record))
  if (linked && pool.includes(linked)) return claim(linked)

  const yarn = normalized(record.tech?.yarnDetail ?? "")
  if (yarn) {
    const matched = pool.find((key) => normalized(items.get(key)?.sample?.ledger?.yarnDetail ?? "") === yarn)
    if (matched) return claim(matched)
  }

  const cons = normalized(record.construction)
  const color = normalized(record.color)
  if (cons && color) {
    const matched = pool.find((key) => {
      const item = items.get(key)
      return normalized(item?.construction ?? "") === cons && normalized(item?.color ?? "") === color
    })
    if (matched) return claim(matched)
  }

  if (pool.length === 1 && (ddCountByFl.get(fl) ?? 0) === 1) return claim(pool[0])
  return undefined
}
```

### 2-3. 자기 key

짝이 없으면 DD 행이 제 항목을 갖는다. **FL이 있는 행의 첫 번째는 예전과 똑같이 `fl:{FL}`을 쓴다.** 옛 기록(override·이벤트의 `key`)이 그 key로 저장돼 있어 그대로 이어 붙는다. 두 번째부터 `#2`, `#3`을 단다.

```ts
const ownKeyFor = (record: DevRecord, fl: string, ddBaseKey: string): string => {
  let base: string
  if (fl) {
    const occurrence = (flOccurrence.get(fl) ?? 0) + 1
    flOccurrence.set(fl, occurrence)
    base = occurrence === 1 ? `fl:${fl}` : `fl:${fl}#${occurrence}`
  } else {
    const occurrence = (ddRowKeyCounts.get(ddBaseKey) ?? 0) + 1
    ddRowKeyCounts.set(ddBaseKey, occurrence)
    base = occurrence === 1 ? ddBaseKey : `${ddBaseKey}#${occurrence}`
  }
  // 대장 행이 이미 그 key 를 쓰고 있으면 비켜난다. 같은 항목에 두 행이 앉으면 한 행이 사라진다.
  let key = base
  let suffix = 2
  while (items.has(key)) { key = `${base}@${suffix}`; suffix += 1 }
  return key
}
```

`flOccurrence`는 짝짓기 성공 여부와 무관하게 **FL을 가진 모든 DD 행에서 1씩 올린다.** 짝짓기 결과가 바뀌어도 나머지 행의 key가 흔들리지 않게 하기 위해서다. 그러려면 `ownKeyFor`를 조건 없이 먼저 부르고, 짝이 있으면 그 결과를 버린다.

### 2-4. 루프 본문

```ts
records.forEach((record) => {
  const ddBaseKey = ddRowBaseKey(record)
  const fl = normalized(record.flNo)
  // 순번은 짝짓기와 무관하게 먼저 매긴다. 짝짓기 결과가 바뀌어도 다른 행 key 가 흔들리지 않는다.
  const ownKey = ownKeyFor(record, fl, ddBaseKey)
  const matchedKey = (fl ? takeSampleMatch(record, fl) : undefined) ?? ownKey

  const existing = items.get(matchedKey)
  // DD 행은 서로 흡수하지 않는다. 이 지점에서 레코드를 버리면 그 행이 화면에서 통째로 사라진다(R229 원인).
  const item = existing
    ? (existing.record ? existing : mergeRecord(existing, record))
    : emptyFromRecord(record, matchedKey)
  items.set(matchedKey, item)
  recordKeyIndex.set(recordIdentity(record), matchedKey)
  registerIdentities(item, [...fabricIdentities("", record.flNo, record.styleNo), ddBaseKey])
})
```

`existing.record ? existing : ...` 가지는 남겨 두되, `takeSampleMatch`가 record 있는 항목을 후보에서 빼고 `ownKeyFor`가 빈 key를 고르므로 **정상 경로에서는 도달하지 않는다.** 방어용이다.

## 3. 하지 말 것

- `resolveKey`를 DD 레코드에 다시 쓰지 마라. 그것이 이번 결함의 원인이다. 대장(samples) 쪽에서는 그대로 쓴다.
- 대장 행 쪽 처리(502-536행)의 key 규칙을 바꾸지 마라. R&D No.가 붙은 행은 지금처럼 `rnd:` key를 지켜야 한다.
- 566-577행의 override 해석 순서(`recordId` 우선)를 바꾸지 마라. 이번 수정이 기대는 지점이다.
- 1팀 행(`FABRIC1_INTAKE_SHEET`)과 종료 이력(`isClosedHistorySample`) 처리를 건드리지 마라.
- 짝을 못 찾은 DD 행을 아무 대장 행에나 붙이지 마라. 제 항목으로 세운다.
- `ddRowBaseKey`에서 `opt`를 빼지 마라. 옵션이 구분되지 않는다.
- 다른 파일을 고치지 마라. 화면 코드, store, 내보내기는 이번 범위가 아니다.

## 4. 검증

`npm run build` 한 번. `git status --short`로 `src/data/fabric-ledger.ts` 외에 바뀐 것이 없는지 본다.

성공 기준.

1. 빌드 통과.
2. `records.forEach` 안에서 `resolveKey`를 부르지 않는다.
3. 모든 DD 레코드가 `recordKeyIndex`에 자기 항목 key를 갖는다. 즉 `recordKeyIndex.size`가 `records.length`와 같다(같은 `_src.sheet::_src.row`가 중복되지 않는 한).
4. 같은 key를 두 DD 레코드가 나눠 갖지 않는다.

## 5. 화면 확인 (클로드가 사용자에게 요청한다. Codex는 하지 마라)

- 창고 입고대기에 짝을 못 찾은 그 옵션 한 건이 새로 뜬다.
- 창고보관의 1322, 1323, 1325가 R&D No., 재고, Rack No.를 그대로 지킨다.
- 창고 전체 건수가 수정 전보다 늘 수는 있어도(숨어 있던 DD 행이 드러난다) 줄어서는 안 된다.
