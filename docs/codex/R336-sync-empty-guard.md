# R336 동기화 빈 값 보호 구멍 두 곳 막기

상태: 미착수. 원인 규명 완료, 코드 미수정.

데이터 안전 보완 3묶음의 선행 작업이다. 3-3 본편(빈 목록 삭제 전파)은 이 두 건을 막은 뒤에 시작한다.
이번 지시서는 **빈 배열이 화면과 서버로 번지는 두 경로를 막는 것만** 한다. 삭제 전파 동작은 바꾸지 않는다.

파일은 `src/data/firestore-sync.ts` 하나다. 다른 파일을 건드리지 않는다.

## 왜 하는가

`records`, `completed`, `fabricOverrides`, `fabricEvents` 네 키는 화면에서 통째로 비울 일이 없는 원장 데이터다.
`NEVER_EMPTY_KEYS`와 `wouldWipeLocalData`가 그걸 지키는 장치인데, 두 곳에서 새어 나간다.
2026-10-02에 창고 데이터가 소실된 적이 있어 이 경로는 실제 사고 이력이 있는 자리다.

## 조치 1. 거부된 값이 복원값으로 쓰이는 것 막기

`applySnapshot` 안이다. 331행 근처.

현재 코드:

```ts
      const value = JSON.parse(json) as AppState[CacheKey]
      lastRemoteValue.set(key, value)
      if (wouldWipeLocalData(key as CacheKey, value)) return
```

`lastRemoteValue`가 가드보다 **먼저** 갱신된다. 그래서 `wouldWipeLocalData`가 거부한 빈 배열도 거기 들어간다.
`lastRemoteValue`는 `revertBlockedKey`(284행)가 읽는 값이다. 읽기 권한 사용자가 화면에서 뭔가 바꿨을 때
그 사람 화면을 중앙 값으로 되돌리는 데 쓴다. 지금은 거부된 빈 배열로 되돌릴 수 있다.

같은 이유로 바로 아래 `ts` 건강검사(`isTsWellFormed`)가 거부한 값도 복원값이 되면 안 된다.

**할 일.** `lastRemoteValue.set(key, value)` 한 줄을 **두 가드를 모두 통과한 뒤로** 옮긴다.
`ts` 블록이 `return`으로 끝나는 경로 다음, 즉 아래 주석의 `const localValue = ...` 직전이 자리다.

옮긴 뒤 모습(앞뒤 맥락이다. 그대로 복사하지 말고 기존 줄을 살려서 위치만 바꿔라):

```ts
      const value = JSON.parse(json) as AppState[CacheKey]
      if (wouldWipeLocalData(key as CacheKey, value)) return
      // ts 건강검사 블록은 그대로 둔다
      ...
      // 검증을 통과한 값만 복원값으로 쓴다. 거부한 값으로 되돌리면 화면이 그 빈 값이 된다(R336).
      lastRemoteValue.set(key, value)
      const localValue = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
```

`pushMergedNow` 안의 `lastRemoteValue.set(key, merged)`(211행)는 **건드리지 마라.** 거긴 실제로 쓰인 값이라 맞다.

`revertBlockedKey`는 이미 `lastRemoteValue.has(key)`로 감싸고 있다. 값이 없으면 복원을 건너뛰고
`fabric:readonly-blocked` 이벤트만 띄운다. 그 동작이 맞으므로 `revertBlockedKey`는 수정하지 않는다.

## 조치 2. 보호 키 쓰기 가드가 비껴가는 조건 고치기

`pushMergedNow` 안이다. 198행.

현재 코드:

```ts
    if (NEVER_EMPTY_KEYS.has(key) && next.length === 0 && Array.isArray(theirs) && theirs.length > 0) {
      throw new Error(`${key} 병합 결과가 비어 저장을 멈췄습니다.`)
    }
```

조건에 `theirs.length > 0`이 붙어 있다. **서버가 이미 빈 배열이면 가드가 걸리지 않는다.**
기준선과 내 화면에 데이터가 있어도 병합 결과가 비면 그대로 빈 배열을 쓴다.
서버가 한 번 잘못 비워지면 그다음 저장이 그 빈 상태를 굳히는 길이다.

**할 일.** 조건을 아래로 바꾼다.

```ts
    // 지킬 값이 있었는데 결과가 비면 멈춘다. 서버가 이미 비어 있어도 마찬가지다(R336).
    // 예전 조건은 `theirs.length > 0`이라, 서버가 잘못 비워진 뒤의 저장이 그 빈 상태를 굳혔다.
    const hadRows = mine.length > 0 || (base?.length ?? 0) > 0 || (Array.isArray(theirs) && theirs.length > 0)
    if (NEVER_EMPTY_KEYS.has(key) && next.length === 0 && hadRows) {
      throw new Error(`${key} 병합 결과가 비어 저장을 멈췄습니다.`)
    }
```

`mine`과 `base`는 이 함수 위쪽에 이미 선언돼 있다. `mine`은 배열이고 `base`는 `unknown[] | null`이다.
새 변수를 트랜잭션 콜백 안, `next` 계산 바로 다음에 둔다.

**`hadRows`를 빼고 `next.length === 0`만으로 막지 마라.** 세 쪽이 다 비어 있는 상태는 지킬 것이 없는데,
그때까지 막으면 저장 실패 경고가 헛되이 뜬다.

## 하지 말 것

- `wouldWipeLocalData` 자체를 고치지 마라. 어느 키를 열지는 3-3 본편에서 정한다.
- `NEVER_EMPTY_KEYS` 목록에 키를 더하거나 빼지 마라.
- `baseline`이나 `lastRemote` 갱신 위치를 옮기지 마라. 허용한 값은 옛 기준선으로 병합한 뒤에 기준선을 갱신해야 한다.
  먼저 빈 배열로 바꾸면 로컬에 남은 항목이 신규 추가로 읽혀 되살아난다.
- `pushCacheNow`, `mergeForKey`, `sync-merge.ts`를 건드리지 마라.
- 재시도 로직(`handlePushFailure`)과 알림 이벤트를 손대지 마라. 이번 범위가 아니다.
- 저장된 데이터를 변환하거나 이관하는 코드를 넣지 마라.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과해야 한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/data/firestore-sync.ts` 한 줄만 보여야 한다.
- 수정 줄 수는 10줄 안쪽이다. 그보다 크면 범위를 넘은 것이니 멈추고 보고해라.

## 공통 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 주석과 문구를 영어로 바꾸지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON을 열지 마라.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 검증 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
