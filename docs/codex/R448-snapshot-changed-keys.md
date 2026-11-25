# R448 — 스냅샷에서 바뀐 키만 다시 조립한다

상태: 미착수. R446, R447 이 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

고치는 파일은 `src/data/firestore-sync.ts` 하나다. 다른 파일은 열지 마라.

---

## 0. 무엇이 문제인가

`applySnapshot`(308행)은 스냅샷이 올 때마다 **중앙의 모든 키를 전부 다시 조립한다.** 어느 키가 바뀌었는지 보지 않는다. 키 하나마다 청크를 이어 붙이고, `JSON.parse` 하고, `mergeForKey` 로 병합하고, 마지막에 `JSON.stringify(nextValue) === JSON.stringify(localValue)` 로 같은지 본다.

```ts
      if (JSON.stringify(nextValue) === JSON.stringify(localValue)) return
```

**안 바뀐 키는 여기서 전부 걸러진다.** 즉 그 앞의 파싱과 병합과 직렬화 두 번이 통째로 헛일이다.

팀원 한 명이 셀 하나를 고치면 모두의 브라우저가 25개 키를 전부 이렇게 돈다. `completed` 키 하나만으로도 직렬화 두 번에 20.5ms 다(2026-11-25 실측, Node 기준. 브라우저는 더 느리다). 사람이 많이 쓰는 시간대에 화면이 끊기는 자리다.

## 1. 고칠 것

`snap.docChanges()` 가 이번 스냅샷에서 바뀐 문서만 준다. 그 문서 id 에서 키를 뽑아, **그 키만 조립한다.**

### 1-1. `applySnapshot` 에 인자를 하나 더한다 (308행)

```ts
function applySnapshot(
  docs: { id: string; data: () => Record<string, unknown> }[],
  touched: ReadonlySet<string> | null = null,
): Set<string> {
```

`touched` 가 `null` 이면 지금처럼 전부 돈다. 기본값을 `null` 로 둬서 호출부를 안 고쳐도 동작이 같게 한다.

### 1-2. `metas.forEach` 안에 한 줄을 더한다 (330행대)

지금:

```ts
  metas.forEach((n, key) => {
    if (!CACHE_KEY_SET.has(key)) return
    if (SKIP_SYNC_KEYS.has(key)) return
    lastChunkCount.set(key, n)
    const parts = chunks.get(key)
```

바꿀 것:

```ts
  metas.forEach((n, key) => {
    if (!CACHE_KEY_SET.has(key)) return
    if (SKIP_SYNC_KEYS.has(key)) return
    lastChunkCount.set(key, n)
    // 이번 스냅샷에서 안 바뀐 키는 조립하지 않는다. 어차피 아래 JSON.stringify 비교에서
    // 똑같다고 걸러질 값이라, 파싱과 병합과 직렬화 두 번이 통째로 헛일이다(R448).
    if (touched && !touched.has(key)) return
    const parts = chunks.get(key)
```

**`lastChunkCount.set(key, n)` 보다 뒤에 넣어야 한다.** 청크 수는 모든 키에 대해 최신이어야 한다. 낡은 청크를 지우는 `pushCacheNow` 가 그 값을 본다.

`metas` 와 `chunks` 를 만드는 위쪽 `for (const d of docs)` 루프는 **그대로 둔다.** 청크를 이어 붙이려면 바뀐 조각만이 아니라 그 키의 조각 전부가 필요하다. 그 루프는 문자열을 옮겨 담기만 해서 비싸지 않다.

`return new Set(metas.keys())` 도 그대로 둔다. `autoSeedMissingKeys` 가 중앙에 있는 키 **전부**를 알아야 한다. 여기를 바꾸면 소유자 첫 로그인 때 이미 중앙에 있는 키를 다시 올려 팀 데이터를 덮을 수 있다.

### 1-3. 문서 id 에서 키를 뽑는 함수 (`applySnapshot` 바로 위)

```ts
/** `records__3` 같은 청크 문서 id 에서 키 이름(`records`)을 뽑는다. */
function keyOfDocId(id: string): string {
  const sep = id.lastIndexOf("__")
  return sep >= 0 && /^\d+$/.test(id.slice(sep + 2)) ? id.slice(0, sep) : id
}
```

판정 방식은 `applySnapshot` 안의 기존 루프와 똑같다. 그 루프를 이 함수로 바꿔 쓰지는 마라. 거기는 `index` 숫자도 필요하다.

### 1-4. 호출부 (421행)

지금:

```ts
        const remoteKeys = applySnapshot(snap.docs)
```

바꿀 것:

```ts
        const changes = snap.docChanges()
        // 첫 스냅샷은 모든 문서가 added 로 와서 전 키가 들어온다. 그다음부터는 바뀐 키만 조립한다.
        const touched = new Set(changes.map((change) => keyOfDocId(change.doc.id)))
        const remoteKeys = applySnapshot(snap.docs, touched)
```

오류 콜백은 그대로 둔다.

## 2. 왜 이것이 안전한가

**안 바뀐 키를 건너뛰어도 결과가 같다.** 그 키는 지금도 아래 두 줄에서 걸러진다.

```ts
      if (JSON.stringify(nextValue) === JSON.stringify(localValue)) return
```

원격 값이 그대로면 `baseline` 도 그대로고, `mergeForKey(key, local, 원격)` 은 `base === theirs` 인 병합이라 내 로컬 값을 그대로 돌려준다. 그래서 `nextValue` 가 `localValue` 와 같아 `patch` 에 안 담긴다. 건너뛰는 것과 결과가 같다.

**첫 스냅샷은 전부 돈다.** `docChanges()` 가 처음에는 모든 문서를 `added` 로 준다. 로그아웃 뒤 다시 로그인할 때도 구독이 새로 서므로 마찬가지다.

**청크 문서만 바뀐 경우도 잡힌다.** `records__3` 이 바뀌면 `keyOfDocId` 가 `records` 를 준다.

`lastRemoteValue`, `lastRemote`, `baseline` 은 건너뛴 키에 대해 직전 값이 그대로 남는다. 원격이 안 바뀌었으니 그 값이 맞다.

## 3. 막다른 길 — 다시 시도하지 마라

- **`chunks` 를 `docChanges()` 로만 만들지 마라.** 청크를 이어 붙이려면 그 키의 조각이 전부 있어야 한다. 바뀐 조각만 모으면 `json` 이 중간에 끊겨 `JSON.parse` 가 터지고, 그 키가 조용히 통째로 넘어간다.
- **`return new Set(metas.keys())` 를 바뀐 키만으로 바꾸지 마라.** 자동 시딩이 중앙에 있는 키를 "없다"고 보고 덮어쓴다.
- **`onSnapshot` 에 `includeMetadataChanges` 를 붙이지 마라.** 스냅샷이 더 자주 오게 된다.
- **쿼리를 키별로 쪼개지 마라.** 구독이 25개로 늘어난다.
- `CHUNK_CHARS`, `MERGE_IDS`, `LIST_MERGE_IDS`, `NEVER_EMPTY_KEYS`, `wouldWipeLocalData` 를 고치지 마라.
- `JSON.stringify` 비교 줄을 지우지 마라. 건너뛰기는 그 비교를 **덜 부르게** 할 뿐 대신하지 않는다. 바뀐 키에는 그 비교가 여전히 필요하다.
- `ts` 키의 `isTsWellFormed` 보호 블록을 고치지 마라.

## 4. 하지 말 것

- **동기화 동작을 바꾸지 마라.** 팀원이 올린 값이 내 화면에 반영되는 결과가 전과 같아야 한다.
- `pushCache`, `pushCacheNow`, `autoSeedMissingKeys`, `stopStateSync` 를 고치지 마라.
- 다른 파일을 고치지 마라. `src/data/dd-workflow.ts`, `src/data/audit.ts`, `src/App.tsx`, `src/routes/*` 는 손대지 마라. 워킹트리에 R446 과 R447 변경이 들어 있다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라.
- Firestore 에 접속하거나 자격증명이 필요한 명령을 돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 5. 성공 기준

- `npm run build` 가 통과한다(`tsc --noEmit` 포함).
- `git status --short` 에 `src/data/firestore-sync.ts` 한 줄이 더 뜬다. R446 과 R447 의 네 줄은 그대로 있다.
- `applySnapshot` 의 두 번째 인자가 `touched: ReadonlySet<string> | null = null` 이다.
- `if (touched && !touched.has(key)) return` 이 `lastChunkCount.set(key, n)` **뒤에** 있다.
- `return new Set(metas.keys())` 가 그대로다.
- 호출부에서 `snap.docChanges()` 를 쓴다.
- `keyOfDocId` 가 있다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
