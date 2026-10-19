# R339 작은 목록의 마지막 항목 삭제를 전파한다

상태: 미착수. 원인 규명과 전파 경로 추적 완료, 코드 미수정.

데이터 안전 보완 3묶음의 3-3 본편이다. 선행 보완은 커밋 `60af5d2`(R336)로 끝났다. 3묶음의 나머지 둘은 `f38bfcc`(R337), `5db3243`(R338)이다.

고치는 파일은 `src/data/firestore-sync.ts` 하나와 문서 `CLAUDE.md` 한 줄이다.

## 무엇이 잘못됐나

`wouldWipeLocalData`(273행)가 **원격이 빈 배열인데 로컬에 항목이 있으면 그 키의 스냅샷을 통째로 건너뛴다.** `applySnapshot`(334행)에서 `return`으로 빠진다.

중앙에 아직 시딩되지 않았거나 잘못 비워진 값이 화면의 실데이터를 지우지 못하게 막는 장치인데, **사람이 마지막 항목을 지운 정상 삭제까지 같이 막는다.** 그래서 A가 폐기 라운드나 보드의 마지막 하나를 지워도 B 화면에는 그 항목이 그대로 남는다.

## 설계

빈 배열을 정당한 값으로 받는 키를 **명시한 목록으로만** 연다. 처음에는 둘이다.

`disposalRounds`(폐기 라운드)와 `requestBoards`(DEVELOPMENT REQUEST 보드)다. 둘 다 마지막 항목 삭제가 정상인 작은 목록이고, 둘 다 병합 키라(`MERGE_IDS`) 3-way 병합이 삭제를 제대로 읽는다.

**`meta` 문서가 있다는 사실로 판단하지 마라.** 누군가 그 키를 쓴 적이 있다는 뜻일 뿐이고, 잘못 저장된 빈 배열과 정상 삭제를 구별하지 못한다. `updatedAt`과 `updatedBy`도 작성 흔적일 뿐이라 같다. 최초 스냅샷에서만 가드를 거는 방식도 쓰지 마라. 그 뒤의 사고를 못 막고, 재접속했을 때 정상 삭제도 놓친다.

### 전파가 되는지 확인한 경로

A가 `disposalRounds`의 마지막 라운드를 지운다. A의 `pushMergedNow`가 3-way 병합으로 `[]`를 쓴다. 서버가 빈 배열이 된다.

B가 그 스냅샷을 받는다. 가드를 통과하면 `mergeForKey(key, 로컬, [])`가 돈다. `sync-merge.ts` `mergeKeyed`는 기준선에 있고 내 값이 기준선과 같은 항목을 "상대가 지웠다"로 읽어 뺀다. 결과가 `[]`가 되고 B 화면에서도 사라진다.

B가 그 라운드를 **고쳐 놓고 아직 안 올렸으면** 내 값이 기준선과 달라 살아남는다. 3-way 병합의 정상 동작이다. 그대로 둔다.

## 조치 1. 빈 배열 허용 키

`NEVER_EMPTY_KEYS`(56행) 바로 아래에 둔다.

```ts
/**
 * 마지막 항목을 지우는 것이 정상인 작은 목록(R339). 빈 배열을 정당한 값으로 받는다.
 * **키를 함부로 늘리지 말 것.** 여기 들어온 키는 서버가 비면 전원 화면이 같이 빈다.
 * 병합 키여야 하고(`MERGE_IDS`), 사람이 화면에서 마지막 하나까지 지울 수 있는 목록이어야 한다.
 */
const EMPTY_ALLOWED_KEYS = new Set<string>(["disposalRounds", "requestBoards"])
```

`wouldWipeLocalData`(273행)에 한 줄을 더한다.

```ts
  if (!Array.isArray(value) || value.length > 0) return false
  // 정상 삭제가 전파되어야 하는 키다. 빈 배열을 받는다(R339).
  if (EMPTY_ALLOWED_KEYS.has(key)) return false
  return Array.isArray(local) && local.length > 0
```

`null`·`undefined` 가드(그 위 세 줄 주석이 붙은 분기)는 **그대로 둔다.** 그 값은 어떤 키에서도 받지 않는다.

## 조치 2. `CLAUDE.md` 한 줄

219행 `- \`records\`, \`completed\`, \`fabricOverrides\`, \`fabricEvents\`는 병합 결과가 비면 쓰지 않는다(\`NEVER_EMPTY_KEYS\`).` 바로 아래에 같은 들여쓰기로 더한다.

```
  - **빈 배열 수신은 `EMPTY_ALLOWED_KEYS`(`disposalRounds`, `requestBoards`)만 받는다**(R339). 나머지 키는 원격이 비면 `wouldWipeLocalData`가 그 스냅샷을 건너뛴다. 아직 시딩 안 된 값이 화면의 실데이터를 지우지 못하게 막는 장치다. **`meta` 문서 존재나 `updatedAt`으로 정상 삭제를 판단하지 말 것.** 잘못 저장된 빈 배열과 구별되지 않는다. 키를 더하려면 병합 키여야 하고 사람이 마지막 하나까지 지울 수 있는 목록이어야 한다.
```

## 하지 말 것

- `baseline`과 `lastRemote` 갱신 위치를 옮기지 마라. 허용한 값도 **옛 기준선으로 병합한 다음** 원격 값으로 기준선을 갱신해야 한다. 먼저 빈 배열로 바꾸면 로컬에 남은 항목이 신규 추가로 읽혀 되살아난다.
- `NEVER_EMPTY_KEYS` 목록과 201행 쓰기 가드를 건드리지 마라. R336에서 고친 자리다.
- `EMPTY_ALLOWED_KEYS`에 키를 더 넣지 마라. 특히 `records`, `completed`, `fabricOverrides`, `fabricEvents`는 절대 안 된다.
- 병합 키가 아닌 배열 키(`study`, `events`, `materials`, `chemical` 등)를 병합 키로 옮기지 마라. 고유 키와 중복과 삭제 충돌 정책을 따로 검토해야 하고 이번 범위가 아니다. 그 키들은 여전히 마지막 항목 삭제가 전파되지 않는다.
- `ts`를 넣지 마라. `ts-health.ts`의 `isTsWellFormed`가 빈 배열을 비정상으로 판정해서 가드만 풀어도 동작이 달라지지 않는다.
- 삭제 표식(tombstone)이나 항목 수 기록 같은 새 구조를 만들지 마라.
- `applySnapshot`의 다른 분기와 `pushMergedNow`를 건드리지 마라.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과해야 한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/data/firestore-sync.ts`와 `CLAUDE.md` 두 줄만 보여야 한다.
- 코드 수정 줄 수는 10줄 안쪽이다. 그보다 크면 범위를 넘은 것이니 멈추고 보고해라.
- 화면 확인은 지시자가 따로 요청한다.

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
