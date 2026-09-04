# R94 — 팀원 쓰기 권한 개방과 3-way 병합 동기화

상태: 미착수. 조사·설계 완료, 구현 전량 남음.

## 배경과 확인한 사실

팀원이 화면에서 값을 고쳐도 저장되지 않는다. 새로고침하면 되돌아간다. 소유자(hkpark@hansoll.com)가 고친 것만 남는다. 확인한 원인은 두 군데다.

1. `firestore.rules`의 `match /state/{docId}`가 `allow write: if isOwner()`다. 서버가 팀원 쓰기를 거부한다.
2. `src/data/firestore-sync.ts:43` `pushCache`가 `if (!currentUserIsOwner()) return`으로 전송 자체를 하지 않는다.

편집 UI 자체는 팀원에게도 열려 있다. `DevelopmentMasterSheet.tsx:973`의 `editEnabled`는 로그인 역할이 아니라 담당 필터 선택 여부다. 즉 팀원은 고칠 수 있고, 화면에도 반영되고, 로컬 IndexedDB에도 저장되는데, 중앙에만 못 올라간다. 그리고 다음 스냅샷이 로컬을 덮는다.

## 사용자가 정한 것

- 대시보드의 최대 목적은 모든 팀원 실시간 화면 공유다. 승인된(approved) 사용자는 편집할 수 있어야 한다.
- 소유자 전용으로 남기는 것은 세 가지다. 전체 밀어넣기(`pushAllToFirestore`), 자동 시딩(`autoSeedMissingKeys`), 가입 승인과 화면 권한.

## 왜 규칙만 열면 안 되는가

지금 동기화는 키 하나를 통째로 JSON 문자열로 만들어 20만 자 청크로 올린다. 쓰는 사람이 한 명일 때만 안전한 구조다. 여러 명이 쓰기 시작하면 두 가지가 깨진다.

- **내 편집이 남의 스냅샷에 지워진다.** `applySnapshot`(91행)은 원격 값을 로컬에 그대로 덮는다. 내가 방금 고친 셀이 아직 안 올라간 상태에서 다른 사람의 스냅샷이 오면 내 편집이 사라진다.
- **내 저장이 남의 편집을 지운다.** 내가 올리는 것은 내 화면의 전체 배열이다. 그 안에는 상대가 방금 고친 행의 옛 값이 들어 있다.

그래서 **양방향 모두 3-way 병합**을 넣는다. 올릴 때도 병합하고, 받을 때도 병합한다. 이 저장소는 과거 TS 데이터 손실 사고가 두 번 있었다. 동기화 판단은 도착 타이밍이 아니라 데이터 형태로 한다는 원칙을 지킨다.

병합 대상은 실제로 여러 명이 동시에 건드리는 세 키뿐이다. 나머지 키는 지금 동작을 그대로 둔다.

| 키 | 식별자 |
|---|---|
| `records` | `_src.sheet` 와 `_src.row` 를 `::` 로 이은 문자열 (`useAppStore.ts:333` `recordIdentity` 와 같은 식) |
| `fabricOverrides` | `override.key` |
| `fabricEvents` | `event.id` |

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/auth.ts` | `currentUserCanWrite()` 신규 export |
| `src/data/sync-merge.ts` | 신규. `mergeKeyed` 한 함수만 |
| `src/data/firestore-sync.ts` | 소유자 게이트 교체, 원격값·기준선 보관, 양방향 병합, 키별 직렬 전송 |
| `src/components/layout/Topbar.tsx` | 권한 배지 판정 변경 |
| `src/routes/Sync.tsx` | 권한 배지와 안내 문구 변경 |
| `firestore.rules` | `state` 쓰기를 승인 사용자로 확대 |

### 1. `src/data/auth.ts`

92행 `currentUserIsOwner` 아래에 추가한다. 기존 함수는 지우지 마라. 여러 곳에서 쓴다.

```ts
/** 중앙 데이터를 쓸 수 있는 사용자인지. 소유자 또는 승인된 팀원. */
export function currentUserCanWrite(): boolean {
  if (currentUserIsOwner()) return true
  const state = useAuthStore.getState()
  return state.status === "signed-in" && state.approval === "approved"
}
```

### 2. `src/data/sync-merge.ts` (신규 파일)

```ts
/**
 * 3-way 병합. baseline은 이 클라이언트가 마지막으로 본 원격 값이다.
 * 내가 고친 항목은 내 값을, 건드리지 않은 항목은 원격 값을 쓴다.
 * 순서는 원격 순서를 따르고, 나만 가진 새 항목을 뒤에 붙인다.
 */
export function mergeKeyed<T>(
  baseline: readonly T[] | null,
  mine: readonly T[],
  theirs: readonly T[],
  idOf: (item: T) => string,
): T[] {
  if (!baseline) return [...theirs]
  const toMap = (list: readonly T[]) => {
    const map = new Map<string, T>()
    list.forEach((item) => map.set(idOf(item), item))
    return map
  }
  const base = toMap(baseline)
  const local = toMap(mine)
  const same = (left: T | undefined, right: T | undefined) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

  const result: T[] = []
  const used = new Set<string>()
  theirs.forEach((item) => {
    const id = idOf(item)
    used.add(id)
    if (!local.has(id)) {
      // 내가 지웠으면 빼고, 상대가 새로 넣었으면 받는다.
      if (base.has(id)) return
      result.push(item)
      return
    }
    // 내가 고쳤으면 내 값, 아니면 원격 값.
    result.push(same(local.get(id), base.get(id)) ? item : local.get(id)!)
  })
  mine.forEach((item) => {
    const id = idOf(item)
    if (used.has(id)) return
    // 원격에 없는 항목. 내가 새로 넣었으면 살리고, 상대가 지운 것이면 뺀다.
    if (base.has(id) && same(local.get(id), base.get(id))) return
    result.push(item)
  })
  return result
}
```

### 3. `src/data/firestore-sync.ts`

**3-1. import 교체.** 12행을 다음 두 줄로 바꾼다.

```ts
import { currentUserIsOwner, currentUserCanWrite } from "./auth"
import { mergeKeyed } from "./sync-merge"
```

**3-2. 병합 대상 정의.** 20행 `CHUNK_CHARS` 선언 아래에 추가한다.

```ts
// 여러 사람이 동시에 건드리는 키만 3-way 병합한다. 나머지는 원격 값을 그대로 쓴다.
const MERGE_IDS: Record<string, (item: never) => string> = {
  records: (item: { _src: { sheet: string; row: number } }) => `${item._src.sheet}::${item._src.row}`,
  fabricOverrides: (item: { key: string }) => item.key,
  fabricEvents: (item: { id: string }) => item.id,
}

/** 이 클라이언트가 마지막으로 본 원격 값. 병합 기준선이다. */
const baseline = new Map<string, unknown[]>()
/** 스냅샷으로 받은 최신 원격 값. 적용 여부와 무관하게 항상 갱신한다. */
const lastRemote = new Map<string, unknown[]>()
/** 키별 전송 직렬화. 같은 키의 푸시가 겹치지 않게 한다. */
const pushChains = new Map<string, Promise<void>>()

function mergeIdOf(key: string): ((item: unknown) => string) | null {
  const fn = (MERGE_IDS as Record<string, ((item: unknown) => string) | undefined>)[key]
  return fn ?? null
}

/** 병합 대상 키이고 양쪽 다 배열일 때만 병합한다. */
function mergeForKey(key: string, mine: unknown, theirs: unknown): unknown {
  const idOf = mergeIdOf(key)
  if (!idOf || !Array.isArray(mine) || !Array.isArray(theirs)) return theirs
  const base = baseline.get(key)
  return mergeKeyed(Array.isArray(base) ? base : null, mine, theirs, idOf)
}
```

**3-3. `pushCache`(42~64행) 전체를 다음으로 교체한다.**

```ts
/** 소유자 또는 승인된 팀원이 값을 Firestore로 반영한다(청크 분할·원자적 배치). */
async function pushCache<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  if (!currentUserCanWrite()) return
  if (SKIP_SYNC_KEYS.has(key)) return
  const previousChain = pushChains.get(key) ?? Promise.resolve()
  const chained = previousChain.then(() => pushCacheNow(key, value)).catch(() => {})
  pushChains.set(key, chained)
  return chained
}

async function pushCacheNow<K extends CacheKey>(key: K, value: AppState[K]): Promise<void> {
  // 올리기 직전에 최신 원격 값과 합친다. 남이 방금 고친 행을 내 화면 값으로 덮지 않는다.
  const remote = lastRemote.get(key)
  const merged = (remote === undefined ? value : mergeForKey(key, value, remote)) as AppState[K]
  const json = JSON.stringify(merged ?? null)
  const chunks = splitChunks(json)
  const batch = writeBatch(db)
  batch.set(metaRef(key), {
    n: chunks.length,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser?.email ?? auth.currentUser?.uid ?? "unknown",
    ts: serverTimestamp(),
  })
  chunks.forEach((c, i) => batch.set(chunkRef(key, i), { c }))
  const previous = lastChunkCount.get(key) ?? 0
  for (let i = chunks.length; i < previous; i += 1) batch.delete(chunkRef(key, i))
  lastChunkCount.set(key, chunks.length)
  try {
    await batch.commit()
    // 올린 값이 곧 원격 값이다. 다음 병합의 기준선으로 삼는다.
    if (Array.isArray(merged)) {
      baseline.set(key, merged as unknown[])
      lastRemote.set(key, merged as unknown[])
    }
    // 병합 결과가 내 화면과 다르면(남의 변경이 섞였으면) 화면에도 반영한다.
    if (merged !== value) {
      setAppState({ [key]: merged } as AppStatePatch)
      void saveCacheLocal(key, merged)
    }
  } catch (error) {
    // 권한 거부·오프라인 등은 조용히 무시한다. 로컬 상태는 유지한다.
    console.warn("[firestore-sync] push 실패:", (error as Error)?.message ?? error)
  }
}
```

**3-4. `applySnapshot`의 값 적용 부분.** 124~142행 `try` 블록을 다음 형태로 바꾼다. `wouldWipeLocalData` 검사와 `ts` 특례는 그 자리에 그대로 둔다.

```ts
    try {
      const value = JSON.parse(json) as AppState[CacheKey]
      if (wouldWipeLocalData(key as CacheKey, value)) return
      // 중앙에 구버전 파서가 만든 낡은 TS가 남아 있을 수 있다.
      // 그 값이 정상 데이터를 덮지 않도록 막고, 소유자면 정상 로컬 값으로 중앙을 고쳐 쓴다.
      if (key === "ts") {
        const incoming = (value ?? []) as TsRecord[]
        const local = useAppStore.getState().ts
        if (!isTsWellFormed(incoming) && isTsWellFormed(local)) {
          if (currentUserIsOwner()) void pushCache("ts", local)
          return
        }
      }
      // 아직 안 올라간 내 편집을 남의 스냅샷이 지우지 못하게 병합한다.
      const localValue = (useAppStore.getState() as unknown as Record<string, unknown>)[key]
      const nextValue = mergeForKey(key, localValue, value) as AppState[CacheKey]
      // 기준선은 병합 결과가 아니라 원격 값이다. 내 편집은 아직 원격에 없다.
      if (Array.isArray(value)) {
        lastRemote.set(key, value as unknown[])
        baseline.set(key, value as unknown[])
      }
      if (JSON.stringify(nextValue) === JSON.stringify(localValue)) return
      ;(patch as Record<string, unknown>)[key] = nextValue
      void saveCacheLocal(key as CacheKey, nextValue)
      changed = true
    } catch {
      // 파싱 실패 시 해당 키는 건너뛴다.
    }
```

**3-5. `stopStateSync`(221행).** `lastChunkCount.clear()` 옆에 `baseline.clear()`, `lastRemote.clear()`, `pushChains.clear()`를 추가한다.

**3-6.** `autoSeedMissingKeys`(156행)와 `pushAllToFirestore`(208행)의 `currentUserIsOwner()` 검사는 그대로 둔다. 전체 밀어넣기는 소유자만이다.

### 4. `src/components/layout/Topbar.tsx`

15행 아래에 승인 상태를 읽고 판정을 만든다.

```ts
  const isOwner = useAuthStore((state) => state.isOwner)
  const approval = useAuthStore((state) => state.approval)
  const canWrite = isOwner || approval === "approved"
```

52~58행의 `isOwner` 네 곳을 `canWrite`로 바꾸고, 툴팁 문구만 다음으로 바꾼다.

```tsx
            title={canWrite ? "편집·업로드 권한" : "읽기 전용(승인 대기)"}
```

### 5. `src/routes/Sync.tsx`

102행 아래에 다음 두 줄을 추가한다.

```ts
  const approval = useAuthStore((state) => state.approval)
  const canWrite = isOwner || approval === "approved"
```

218행 배지와 221~223행 안내 문구를 `canWrite` 기준으로 바꾼다.

```tsx
                  <Badge variant={canWrite ? "outline" : "secondary"}>{canWrite ? "편집 권한" : "읽기 전용"}</Badge>
```

```tsx
                  {canWrite
                    ? `로그인 계정 ${user.email} · 편집 내용이 중앙 서버에 저장되어 팀원 화면에 실시간 반영됩니다.`
                    : `로그인 계정 ${user.email} · 승인 대기 중입니다. 승인되면 편집한 내용이 팀에 공유됩니다.`}
```

226행 "현재 데이터를 중앙에 올리기" 버튼과 239행 가입자 승인 카드의 `isOwner` 조건은 그대로 둔다.

### 6. `firestore.rules`

`match /state/{docId}` 블록의 쓰기 규칙만 바꾼다. 나머지 블록은 손대지 마라.

```
    match /state/{docId} {
      allow read: if isApproved();
      allow write: if isApproved();
    }
```

파일 머리 주석의 `// - 데이터 쓰기: 소유자만` 줄을 `// - 데이터 쓰기: 소유자 또는 승인된 사용자`로 고친다.

## 하지 말 것

- `currentUserIsOwner`를 지우지 마라. `App.tsx`, `Setting.tsx`, `firestore-sync.ts`의 시딩 경로가 쓴다.
- `wouldWipeLocalData`(77행)와 `isTsWellFormed` 특례를 지우거나 우회하지 마라. 과거 TS 데이터 손실을 막는 장치다.
- `SKIP_SYNC_KEYS`에 키를 추가하지 마라. 지금 비어 있는 것이 맞다.
- 청크 크기 `CHUNK_CHARS`와 청크 문서 구조를 바꾸지 마라.
- `runTransaction`이나 새 컬렉션을 도입하지 마라. 이번 범위가 아니다.
- `users/{uid}` 규칙, 가입 승인 흐름, `screen-permissions.ts`를 건드리지 마라.
- `DevelopmentMasterSheet.tsx`의 `editEnabled`를 역할 기반으로 바꾸지 마라. 담당 필터 기준이 맞다.
- Firebase CLI를 실행하지 마라. 규칙 배포는 사용자가 직접 한다.
- 워킹트리에 이미 있는 R93 변경(`Warehouse.tsx`, `fabric-ledger.ts`, `schema.ts`, `useAppStore.ts`, `FabricDetail.tsx`)을 되돌리지 마라.

## 검증

```
npm run build
git status --short
```

`tsc --noEmit`이 통과하고, 수정 파일이 위 표의 여섯 개와 신규 `src/data/sync-merge.ts`뿐이면 성공이다(R93 변경 파일은 그대로 남아 있어야 한다).

화면 확인은 사용자가 한다. 규칙 배포 전에는 팀원 쓰기가 여전히 거부되므로, 빌드까지만 확인하고 보고한다.
