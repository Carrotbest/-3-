# R121 저장한 값이 중앙에 안 올라가고 스냅샷에 덮이던 문제

상태: 구현 완료, 빌드 통과. 화면 확인 대기.

## 증상

TROUBLE SHOOTING(`/ts`) 신규 등록에서 다 입력하고 등록을 누르면 입력 폼은 접히는데 목록에 안 뜬다.
검증도 통과했고 저장 함수도 돌았는데 결과가 남지 않는다.

## 원인

`src/data/firestore-sync.ts` 의 쓰기 경로가 내 값 대신 원격 값을 다시 올리고 있었다.

3-way 병합 대상은 `MERGE_IDS` 네 개뿐이다.

```ts
const MERGE_IDS = { records, fabricOverrides, fabricEvents, requests }
```

`mergeForKey` 는 병합 대상이 아니면 `theirs` 를 돌려준다.

```ts
function mergeForKey(key, mine, theirs) {
  const idOf = mergeIdOf(key)
  if (!idOf || !Array.isArray(mine) || !Array.isArray(theirs)) return theirs
```

읽기 방향(`applySnapshot`)에서는 `mergeForKey(key, 로컬, 원격)` 이라 `theirs` = 원격이 맞다.
그런데 쓰기 방향(`pushCacheNow`)은 인자가 `(내 값, 원격 값)` 이다.

```ts
const remote = lastRemote.get(key)
const merged = (remote === undefined ? value : mergeForKey(key, value, remote))
```

여기서 `theirs` 는 원격이다. 병합 대상이 아닌 키는 **방금 저장한 것이 빠진 예전 원격 값을 그대로 다시 올린다.**
그 뒤 스냅샷이 그 값을 그대로 내려보내 로컬 화면까지 덮는다. 저장이 통째로 사라진다.

`lastRemote` 가 아직 비어 있는 첫 스냅샷 이전에는 `value` 가 올라가므로, 로그인 직후 한동안은 정상이다.
그래서 증상이 들쭉날쭉했다.

## 범위

TS 만의 문제가 아니다. `MERGE_IDS` 네 개를 뺀 **모든 키**가 같은 경로였다.

`ts`, `completed`, `study`, `studyFiles`, `events`, `rdda`, `fabricAnalysis`, `orgMembers`,
`materials`, `materialsManual`, `materialDiagnostics`, `chemical`, `chemicalManual`, `chemicalLinks`, `meta`

화면에서는 저장된 것처럼 보이고 IndexedDB 에도 남기 때문에, 다음 스냅샷이 올 때까지는 멀쩡해 보인다.
새로고침하거나 팀원이 뭔가 저장하면 그때 사라진다. TS 데이터 손실 이력의 뿌리가 여기일 가능성이 크다.

## 조치

`pushCacheNow` 에서 병합 키가 아니면 합치지 않고 내 값을 그대로 올린다.

```ts
const remote = mergeIdOf(key) ? lastRemote.get(key) : undefined
const merged = (remote === undefined ? value : mergeForKey(key, value, remote)) as AppState[K]
```

읽기 방향은 건드리지 않았다. 병합 대상이 아닌 키를 원격 값으로 덮는 것은 그쪽에서는 맞다.

## 달라지는 것

**이제 TS 의 수정과 삭제가 실제로 팀에 전파된다.** 지금까지는 쓰기가 사실상 무효라 전파되지 않았다.
"TS 전체삭제는 전파되지 않는다" 는 그 버그의 부작용이었지 설계가 아니다.
TS 화면에서 전체삭제 UI 는 이미 없앴으므로 행 단위 삭제만 전파된다.

## 검증

- `npm run build` 통과.
- 화면 확인 필요: TS 신규 등록 후 목록 최상단에 뜨는지, 새로고침해도 남는지, 다른 PC 에서 보이는지.

## 남겨 둔 것

`ts` 를 `MERGE_IDS` 에 넣어 3-way 병합을 붙이는 것은 이번에 하지 않았다.
두 사람이 동시에 TS 를 고칠 때 서로 덮는 것을 막으려면 필요하지만, 전체삭제 전파 성격이 또 바뀐다.
별건으로 판단한다. `TsRecord.id` 가 안정적이라 붙이는 것 자체는 어렵지 않다.

## 하지 말 것

- `mergeForKey` 의 `return theirs` 를 바꾸지 마라. 읽기 방향에서는 그게 맞다. 쓰기 쪽에서 부르는 방법을 고친 것이다.
- `MERGE_IDS` 에 `id` 가 없을 수 있는 항목(`events` 의 옛 seed 등)을 넣지 마라. 키가 겹쳐 행이 뭉친다.
- `wouldWipeLocalData` 와 `isTsWellFormed` 방어를 빼지 마라. 다른 사고를 막는 장치다.
