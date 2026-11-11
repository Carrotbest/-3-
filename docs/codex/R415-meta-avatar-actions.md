# R415 META 아바타 행동 표시

상태: 구현 완료. 2026-11-11 커밋.

박향근 요구(2026-11-10): "각 사용자가 해당 화면에서 어떤 작업을 하는지 아바타의 액션으로 표시", "아바타들의 액션은 해당 룸에서의 특정 1가지 행동이 아닌 기능별로 여러 가지 행동을 할 수 있도록".

## 무엇을 만드는가

지금 presence에는 "어느 화면"(`path`)만 있고 "무엇을 하는 중"이 없다. 그 한 조각을 더하고, 아바타가 그에 맞는 동작을 하게 한다.

## 설계 판단: 본인이 스스로 보고한다

**작업 이력(`auditLog`)을 구독해서 알아내려 하지 마라.** 이유가 둘이다.

1. 비용이다. 리스너를 하나 더 붙이면 Firestore 읽기가 사람 수에 비례해 또 는다. `presence` 하트비트가 60초인 것도 같은 이유다(R320: 6명 60초면 하루 읽기 17,280회, 무료 한도 50,000회). 여기에 이력 리스너를 더하면 한도를 넘본다.
2. 정확도다. 이력은 저장이 끝난 뒤에만 남는다. 지금 무엇을 하는 중인지는 본인 브라우저만 안다.

**그래서 쓰는 쪽이 자기 presence 문서에 한 줄 더 쓴다.** 저장 한 번에 쓰기 한 번이 는다. 리스너는 안 는다.

`logAction`(`src/data/audit.ts` 161행)이 저장 길목 다섯 곳을 모두 지나므로 거기 한 곳만 손대면 된다. 화면마다 계측할 필요가 없다.

## 파일별 조치

| 파일 | 할 일 |
|---|---|
| `src/data/presence.ts` | `activity` 필드와 `writePresenceActivity` 추가 |
| `src/data/audit.ts` | `logAction`에서 `kind`를 행동으로 옮겨 적는다 |
| `src/components/meta/usePresencePeople.ts` | `activity`를 `PresencePerson`에 싣는다 |
| `src/components/meta/OfficeScene.tsx` | `peopleKey`에 더하고, 아바타 동작과 소품을 만든다 |
| `src/routes/Meta.tsx` | 접속 목록 줄에 행동 글자를 적는다 |

---

## 1. `src/data/presence.ts`

(가) 타입을 더한다. `PresenceMood` 선언 아래다.

```ts
/** 지금 무엇을 하는 중인지. 본인 브라우저가 스스로 적는다. */
export type PresenceActivity = "view" | "edit" | "paste" | "intake" | "upload" | "warehouse" | "revert" | "idle"

/** 이 시간이 지난 행동은 보는 쪽이 무시하고 "view"로 친다. 되돌리는 쓰기를 안 하려는 장치다. */
export const ACTIVITY_TTL_MS = 90_000
```

`PresenceEntry`에 두 줄 더한다.

```ts
  /** 지금 하는 중인 일. 옛 문서에는 없다. */
  activity?: PresenceActivity
  /** 행동을 적은 시각(Date.now()). 오래되면 버린다. */
  activityAt?: number
```

(나) 쓰기 함수를 더한다. `writePresenceMood` 아래가 좋다.

```ts
let lastActivity = ""
let lastActivityAt = 0
const ACTIVITY_THROTTLE_MS = 15_000

/**
 * 행동은 저장할 때마다 바뀌므로 던지기 제한을 둔다.
 * 같은 행동이 15초 안에 또 오면 쓰지 않는다. 하트비트(60초)와 따로 돈다.
 */
export async function writePresenceActivity(activity: PresenceActivity): Promise<void> {
  const user = auth.currentUser
  const { approval, isOwner } = useAuthStore.getState()
  if (!user || (!isOwner && approval !== "approved")) return
  const now = Date.now()
  if (activity === lastActivity && now - lastActivityAt < ACTIVITY_THROTTLE_MS) return
  lastActivity = activity
  lastActivityAt = now
  try {
    await setDoc(doc(db, "presence", user.uid), { activity, activityAt: now }, { merge: true })
  } catch {
    // 접속 표시는 보조 기능이므로 실패해도 본 작업을 막지 않는다.
  }
}
```

(다) 자리 비움 판정. 하트비트를 돌리는 자리에서 같이 본다. `subscribePresence`나 하트비트를 세우는 곳을 찾아, 마지막 입력 시각을 기억했다가 **5분 넘게 입력이 없으면 `writePresenceActivity("idle")`**, 다시 입력이 오면 `writePresenceActivity("view")`를 부른다. 입력은 `window`의 `pointerdown`과 `keydown`으로 본다. **`pointermove`로 보지 마라.** 마우스가 스쳐도 깨어난 것으로 쳐서 의미가 없다.

---

## 2. `src/data/audit.ts`

`logAction`(161행) 안, 권한 검사를 통과한 **직후**에 한 줄 넣는다. 거부된 작업은 행동으로도 적지 않는다.

```ts
  // 저장 길목이 여기 하나뿐이라 화면마다 계측하지 않아도 된다.
  void writePresenceActivity(ACTIVITY_OF_KIND[input.kind] ?? "edit")
```

같은 파일 위쪽에 표를 둔다.

```ts
const ACTIVITY_OF_KIND: Record<AuditKind, PresenceActivity> = {
  edit: "edit",
  paste: "paste",
  fill: "paste",
  replace: "edit",
  clear: "edit",
  intake: "intake",
  upload: "upload",
  warehouse: "warehouse",
  revert: "revert",
}
```

`import { writePresenceActivity, type PresenceActivity } from "./presence"`를 더한다. **순환 참조가 생기는지 확인해라.** `presence.ts`는 `firebase`, `auth`, `route-config`만 본다. 지금은 안 생긴다.

---

## 3. `src/components/meta/usePresencePeople.ts`

`PresencePerson`에 `activity?: PresenceActivity`를 더한다. `others`를 만드는 자리에서 이렇게 싣는다.

```ts
        activity: entry.activityAt && now - entry.activityAt < ACTIVITY_TTL_MS ? entry.activity : "view",
```

**본인 항목에도 실어야 한다.** 본인은 `subscribePresence`가 거르므로 구독으로 안 온다. `usePresencePeople`에 `selfActivity` 인자를 더하고 호출하는 쪽(`Meta.tsx`)이 넘긴다. Meta.tsx는 자기 행동을 모르므로 **`"view"` 고정으로 둔다.** 본인 아바타가 자기 타자를 흉내 내는 것은 이번 범위가 아니다.

---

## 4. `src/components/meta/OfficeScene.tsx`

### (가) `peopleKey`에 더한다

258행 근처 `peopleKey` 배열에 `person.activity ?? ""`를 더한다. **빠뜨리면 행동이 바뀌어도 `syncPeople`이 안 돌아 화면이 안 바뀐다.** 2026-11-10에 `status`, `mood`, `spot`이 빠져 같은 일이 있었다.

### (나) `PersonVisual`에 팔과 소품을 싣는다

지금 팔은 `createPerson` 안에서 `avatarBox(0.12, 0.46, 0.16, shirtMaterial, ±0.31, 0.96)`로 만들고 어디에도 안 담는다. 담아야 움직인다.

```ts
  leftArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
  rightArm: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
  propGroup: THREE.Group
  props: Record<PropKind, THREE.Object3D>
  activity: PresenceActivity
```

**팔은 어깨에서 돌아야 한다.** 지금 상자는 중심이 가운데라 그대로 돌리면 어깨가 파고든다. `avatarBox`로 만든 뒤 `mesh.geometry`를 건드리지 말고, **팔을 빈 `THREE.Group`(어깨 피벗)에 담고 그 그룹을 돌려라.** 피벗은 어깨 높이 `y = 1.19`, 좌우 `x = ±0.31`에 두고 팔 상자는 그룹 안에서 `y = -0.23`에 둔다.

### (다) 소품

`propGroup`을 `rig` 안에 두고, 아래 넷을 만들어 전부 `visible = false`로 시작한다. 한 번에 하나만 켠다.

| 이름 | 생김새 | 자리 |
|---|---|---|
| `swatch` | 0.28 × 0.02 × 0.2 판, `FABRIC_PALETTE`에서 uid 해시로 고른 색 | 두 손 앞 `(0, 1.0, 0.3)` |
| `roll` | 반지름 0.1, 길이 0.5 원통을 눕힌 것, `materials.paper` | `(0, 1.05, 0.34)` |
| `tablet` | 0.3 × 0.02 × 0.22 판, `screenOf("grid")` | `(0, 1.05, 0.3)` |
| `box` | 0.26 정육면체, `materials.wood` | `(0, 0.95, 0.33)` |

### (라) 행동표

**한 방에 한 동작이 아니다. 행동과 방을 같이 보고 고른다.**

```ts
type PropKind = "none" | "swatch" | "roll" | "tablet" | "box"
type Motion = "still" | "type" | "lift" | "carry" | "shake"

// 방마다 "작업 중"의 모습이 다르다. 없는 방은 기본값을 쓴다.
const ROOM_WORK: Record<string, { motion: Motion; prop: PropKind }> = {
  "/fabric-analysis": { motion: "lift", prop: "swatch" },
  "/warehouse": { motion: "carry", prop: "roll" },
  "/request": { motion: "lift", prop: "swatch" },
  "/study": { motion: "lift", prop: "tablet" },
  "/trend/fabric": { motion: "lift", prop: "tablet" },
  "/trend/macro": { motion: "lift", prop: "tablet" },
  "/rdda": { motion: "lift", prop: "tablet" },
}
const DEFAULT_WORK = { motion: "type" as Motion, prop: "none" as PropKind }

const actionOf = (activity: PresenceActivity, path: string) => {
  if (activity === "idle") return { motion: "still" as Motion, prop: "none" as PropKind }
  if (activity === "revert") return { motion: "shake" as Motion, prop: "none" as PropKind }
  if (activity === "upload" || activity === "intake") return { motion: "lift" as Motion, prop: "box" as PropKind }
  if (activity === "warehouse") return { motion: "carry" as Motion, prop: "roll" as PropKind }
  if (activity === "view") return { motion: "still" as Motion, prop: "none" as PropKind }
  return ROOM_WORK[path] ?? DEFAULT_WORK
}
```

### (마) `tick`에서 동작을 그린다

사람 루프 안, **걷는 중이 아닐 때만** 동작을 그린다. 걷기가 우선이다.

- `still`: 팔 피벗을 0으로 수렴시킨다(`lerp 0.2`). 몸통이 `Math.sin(elapsed * 0.8 + phase) * 0.02`만큼 아주 느리게 흔들린다.
- `type`: 두 팔 피벗 `rotation.x`를 `-0.5 + Math.sin(elapsed * 7 + 좌우 * 1.6) * 0.18`. 몸통을 `0.06` 앞으로 기울인다.
- `lift`: 두 팔 피벗 `rotation.x = -1.15 + Math.sin(elapsed * 1.6) * 0.07`. 소품이 손 앞에 뜬다.
- `carry`: 두 팔 피벗 `rotation.x = -1.35`, 소품(롤)이 가슴 앞. 몸통이 `Math.sin(elapsed * 2.2) * 0.03`으로 좌우로 흔들린다.
- `shake`: 머리 `rotation.y = Math.sin(elapsed * 6) * 0.35`. 팔은 `still`과 같다.

**`reducedMotion.matches`면 흔들지 말고 자세만 잡아라.**

**앉은 자세(`visual.seated`)에서는 `carry`를 쓰지 않는다.** 앉아서 롤을 안고 있으면 이상하다. 앉아 있으면 `carry`를 `type`으로 바꿔라.

### (바) 호버 글자와 이름표

`showHoverStatus`가 만드는 글자에 행동을 한 마디 더한다. 표를 둔다.

```ts
const ACTIVITY_TEXT: Record<string, string> = {
  view: "보는 중",
  edit: "작성 중",
  paste: "붙여넣는 중",
  intake: "접수 중",
  upload: "올리는 중",
  warehouse: "창고 작업",
  revert: "되돌리는 중",
  idle: "자리 비움",
}
```

**이름표(`updatePersonTag`)는 건드리지 마라.** 이름만 쓰기로 2026-11-10에 정했다.

---

## 5. `src/routes/Meta.tsx`

접속 목록의 사람 줄에서 지금 화면 이름 아래에 행동 글자를 작게 적는다. `ACTIVITY_TEXT`와 같은 표가 필요하면 `presence.ts`에 `activityLabel(activity)`로 하나만 두고 양쪽이 쓰게 해라. **표를 두 벌 만들지 마라.**

`usePresencePeople`에 넘기는 `selfActivity`는 `"view"` 고정이다.

---

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 파일을 지우지 마라.
- **`auditLog` 컬렉션에 리스너를 붙이지 마라.** 위에 적은 비용 때문이다.
- **presence 하트비트(60초)를 줄이지 마라.**
- `presence`를 `CACHE_KEYS`에 넣지 마라.
- 이름표 글자를 바꾸지 마라.
- 아바타 몸체 비례와 `rig`의 1.55배 확대를 건드리지 마라. 이름표와 기분 공은 바깥 그룹에 있어야 같이 안 커진다.
- 걷기 애니메이션을 고치지 마라. 걷는 중에는 행동 동작을 그리지 않는 것으로 충분하다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON을 열지 마라.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

- 모든 수정을 마친 뒤 `npm run build`를 한 번만 돌린다.
- 개발 서버는 띄우지 마라. 화면 확인은 클로드가 한다.
- 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만.
