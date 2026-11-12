# R432 — 묶음 담당 행 정리 도구

상태: 미착수. 설계와 좌표는 이 문서에 전부 있다. 저장소를 넓게 탐색하지 마라.

## 왜 필요한가

DD MASTER 에 담당이 `변재휘/김지현` 인 행이 남아 있다. 의뢰 불러오기가 의뢰의 개발 담당을
DD 행 담당으로 그대로 복사하던 버그 때문이다. 그 버그는 R431 에서 고쳤고, 새 행은 더 이상
생기지 않는다. 그러나 **이미 저장된 행은 그대로 남아** 두 사람의 탭에 겹쳐 뜬다(R430 이
묶음 담당을 사람 단위로 보기 때문이다).

### 확인한 사실 — 이 행들은 중복 행이 아니다

`RequestPickerDialog` 의 불러오기 모드는 이미 DD 행에 연결된 옵션의 체크박스를 비활성으로
막는다(`disabled={isLinked}`, "연결됨" 배지). 그래서 **같은 의뢰 옵션이 두 번 들어올 수 없다.**
묶음 담당 행은 전부 서로 다른 옵션이고, 틀린 것은 담당 값 하나뿐이다.
**행을 지우는 기능은 만들지 마라.** 담당만 바꾼다.

### 누가 넣었는지는 감사 로그가 안다

`src/data/audit.ts` 가 작업 단위로 로그를 남긴다. 행이 새로 생기면 `diffByKey` 가
`{ k: "<sheet>::<row>", c: "*", b: "", a: "(추가)" }` 를 남기고, 그 문서에 `name`(접수자)과
`at`(시각)이 함께 들어간다. 이 둘을 행 키로 이어 붙이면 접수자를 알 수 있다.

## 만들 것

관리자 전용 대화상자 하나. DD MASTER 툴바의 버튼으로 연다. 묶음 담당 행을 모아
접수자를 붙여 보여 주고, 확인하면 그 행들의 담당만 한 사람으로 바꾼다.

## 파일별 조치

### 1. `src/data/owner-cleanup.ts` — 새 파일

순수 함수만 둔다. React 도 Firestore 도 쓰지 않는다.

```ts
import type { AuditAction } from "./audit"
import { ownerIncludes, ownerNames, type DevRecord } from "./schema"
```

`DevRecord` 는 `schema.ts` 에서, `AuditAction` 은 `audit.ts` 에서 **타입으로만** 가져온다.

#### 행 키

```ts
/** 감사 로그의 `k` 와 같은 값이어야 한다. 다르면 접수자를 못 찾는다. */
const rowKey = (record: DevRecord): string => `${record._src.sheet}::${record._src.row}`
```

#### 내보낼 타입

```ts
export type OwnerCleanupReason = "ok" | "no-audit" | "creator-outside"

export interface OwnerCleanupRow {
  /** `sheet::row` */
  key: string
  styleNo: string
  opt: string
  flNo: string
  /** 지금 담당. 묶음 값이다. */
  current: string
  /** 이 행을 고를 수 있는 사람 목록. `ownerNames(current)` 와 같다. */
  choices: string[]
  /** 감사 로그가 말하는 접수자. 못 찾으면 "" */
  creator: string
  /** 접수 시각 ISO. 못 찾으면 "" */
  at: string
  /** 기본 제안. 정할 수 없으면 "" */
  proposed: string
  reason: OwnerCleanupReason
}
```

#### 내보낼 함수 셋

```ts
/** 담당이 두 사람 이상인 행만 추린다. */
export function multiOwnerRecords(records: readonly DevRecord[]): DevRecord[]
```

`ownerNames(record.owner).length > 1` 인 것만 남긴다.

```ts
/**
 * 감사 로그에서 행이 처음 생긴 작업을 뽑는다.
 * 같은 키가 여러 번 나오면 **가장 이른 것**을 쓴다. 그것이 접수다.
 */
export function creatorsByRowKey(actions: readonly AuditAction[]): Map<string, { name: string; at: string }>
```

각 `action` 의 `action.ch` 를 돌며 `change.c === "*" && change.a === "(추가)"` 인 것만 본다.
이미 담긴 키인데 `action.at` 이 더 이르면 덮어쓴다.

```ts
/** 감사 로그를 조회할 날짜 창. 웹 접수 행의 `_src.row` 가 마이크로초 타임스탬프다. */
export function cleanupAuditWindow(records: readonly DevRecord[]): { from?: string; to?: string }
```

`createBlankDevRecord` 가 `_src.row` 를 `Date.now() * 1000 + seq` 로 만든다. 그래서
`_src.row / 1000` 이 생성 시각(ms)이다. 대상 행 중 `_src.sheet === "웹 접수"` 인 것들의
최소·최대 시각을 구해 앞뒤로 하루씩 넓힌 `yyyy-mm-dd` 를 돌려준다.
해당하는 행이 없으면 `{}` 를 돌려준다(부르는 쪽이 기본 보관 기간을 쓴다).
`_src.row` 가 터무니없는 값일 수 있으니 2020-01-01 이전이나 지금보다 뒤인 값은 버린다.

```ts
/** 정리 계획. styleNo, opt 순으로 정렬해 돌려준다. */
export function buildOwnerCleanupPlan(
  records: readonly DevRecord[],
  actions: readonly AuditAction[],
): OwnerCleanupRow[]
```

행마다:
- `choices = ownerNames(record.owner)`
- 접수자를 찾았고 `ownerIncludes(record.owner, creator)` 면 `proposed = creator`, `reason = "ok"`
- 접수자를 찾았지만 담당 목록 밖이면 `proposed = ""`, `reason = "creator-outside"`
  (관리자가 남 대신 접수한 경우다. 사람이 직접 골라야 한다)
- 못 찾으면 `proposed = ""`, `reason = "no-audit"`

정렬은 `styleNo` 를 `localeCompare(..., "ko-KR")`, 같으면 `opt` 를 숫자로 비교한다.

### 2. `src/components/dd/OwnerCleanupDialog.tsx` — 새 파일

`src/components/dd/RequestPickerDialog.tsx` 의 import 와 Dialog 구성(`Dialog`,
`DialogContent`, `DialogHeader`, `DialogTitle`, `DialogBody`, `DialogFooter`, `Button`,
`Checkbox`, `Badge`)을 그대로 본떠라. 새 UI 원시 요소를 만들지 마라.

```ts
interface OwnerCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: readonly DevRecord[]
  /** 키 → 새 담당. 부르는 쪽이 저장한다. */
  onApply: (picks: Map<string, string>) => Promise<void>
}
```

동작:

1. `open` 이 `true` 로 바뀌면 한 번 읽는다. `const targets = multiOwnerRecords(records)`.
   비어 있으면 조회하지 않고 바로 빈 상태를 보인다.
2. `const { from, to } = cleanupAuditWindow(targets)` 로 창을 정하고
   `listActions({ screen: "dd", from, to, max: 1000 })` 를 부른다.
   **`max` 를 더 키우지 마라.** 감사 문서 하나에 셀 변경이 2000개까지 들어가 용량이 크다.
3. `buildOwnerCleanupPlan(targets, actions)` 로 표를 만든다.
4. 상태 둘을 둔다. `checked: Set<string>`(기본값은 `reason === "ok"` 인 행의 키)와
   `picks: Map<string, string>`(기본값은 `proposed` 가 있는 행만).

표 열: 체크박스 | Style No. | Opt | FL# | 현재 담당 | 접수자 | 접수 일시 | 바꿀 담당

- 접수 일시는 `yyyy-mm-dd HH:mm` 으로 짧게 쓴다.
- 접수자가 없으면 `reason` 에 따라 배지를 단다.
  `no-audit` → `기록 없음`, `creator-outside` → `담당 밖`. 둘 다 `variant="outline"`.
- "바꿀 담당" 은 그 행의 `choices` 로 만든 `<select>` 다. 빈 항목(`"— 고르세요 —"`)을 맨 앞에 둔다.
  고르면 `picks` 에 넣고 체크도 켠다. 빈 항목을 고르면 `picks` 에서 빼고 체크를 끈다.
- 머리글에 "모두 선택" 체크박스를 둔다. 켜면 `picks` 에 값이 있는 행만 켜진다.

머리말 한 줄: `담당이 두 사람으로 적힌 행입니다. 접수자는 작업 이력에서 찾았습니다. 담당 칸만 바뀝니다.`

바닥:
- 왼쪽에 `전체 N행 · 바꿀 M행` 을 적는다.
- 취소 버튼.
- `M행 담당 바꾸기` 버튼. `M === 0` 이면 비활성. 누르면 체크되고 `picks` 에 값이 있는 행만
  모아 `onApply` 를 `await` 하고 `onOpenChange(false)` 한다. 진행 중에는 `Loader2` 를 돌린다.

조회 중에는 `Loader2` 와 `작업 이력을 읽는 중입니다.` 를 보인다.
대상이 없으면 `담당이 두 사람으로 적힌 행이 없습니다.` 를 보인다.

### 3. `src/routes/DevelopmentMasterSheet.tsx` — 세 군데

#### (가) import 추가

파일 위쪽 import 묶음에 더한다.

```ts
import { OwnerCleanupDialog } from "@/components/dd/OwnerCleanupDialog"
```

아이콘은 `lucide-react` 에서 `Users` 를 가져온다. 이미 있는 import 줄에 이름만 더해라.

#### (나) 상태와 적용 함수

`const importRequest = (style: RequestStyle, ...)` 바로 **위**에 넣는다.

```ts
  const [ownerCleanupOpen, setOwnerCleanupOpen] = useState(false)
  /**
   * 묶음 담당 행의 담당만 한 사람으로 바꾼다(R432). 담당 외의 칸은 건드리지 않는다.
   * 저장과 이력, 되돌리기는 `commitRecords` 가 전부 맡는다.
   */
  const applyOwnerCleanup = async (picks: Map<string, string>) => {
    if (!picks.size) return
    await commitRecords((rows) => rows.map((row) => {
      const name = picks.get(recordIdentity(row))
      return name && name !== row.owner ? { ...row, owner: name } : row
    }))
    notify(`담당 ${picks.size}행을 한 사람으로 바꿨습니다.`)
  }
```

`commitRecords`, `recordIdentity`, `notify` 는 이 파일에 이미 있다. 새로 만들지 마라.
`recordIdentity` 는 이 파일 799행의 것이다(`sheet::row` 를 만든다).

#### (다) 툴바 버튼과 대화상자

3558행 `FDS/YDS 요청` 버튼 **바로 앞**에 넣는다.

```tsx
        {isAdmin ? <Button type="button" size="sm" variant="outline" title="담당이 두 사람으로 적힌 행을 접수자 기준으로 한 사람씩 정리합니다" onClick={() => setOwnerCleanupOpen(true)}><Users className="size-4" />담당 묶음 정리</Button> : null}
```

대화상자는 이 파일에 이미 있는 다른 Dialog 들과 같은 자리에 둔다.
`<RequestPickerDialog ... />` 를 그리는 줄을 찾아 그 바로 뒤에 넣어라.

```tsx
    <OwnerCleanupDialog open={ownerCleanupOpen} onOpenChange={setOwnerCleanupOpen} records={records} onApply={applyOwnerCleanup} />
```

## 손대지 말 것

- **`optionsById` 의 `owner` 줄.** 담당은 선택형 열이고 R280 에 따라 드롭다운 목록과 저장
  검증 목록이 같아야 한다. 거기서 묶음 값을 빼면 `변재휘/김지현` 행을 고칠 수 없게 된다.
  정리가 끝나야 뺄 수 있고, 그것은 이 작업이 아니다.
- **R430 의 집계 규칙.** `ownerNames`, `ownerIncludes`, `ownerStats`, `derive.ts`,
  `weekly-report.ts` 를 건드리지 마라.
- **R431 의 `requestToIntakeRecords`.** 이미 고쳐져 있다.
- 행 삭제 기능. 만들지 마라.
- 비관리자에게 버튼을 보이지 마라.

## 검증

`npm run build` 한 번. 그 외의 검증은 하지 마라.

---

# R432-2 보완 — 남의 작업을 되돌리지 않는다

상태: 1차 시공 완료. 아래만 더한다.

박향근 지시(2026-11-12): "두 담당의 변경·추가 이력이 있다면 그것까지 확인하고 반영해야 한다.
애써 적어 놓은 게 돌아가면 안 된다. 수정할 것만 찾아서 건드려야 한다."

지금 구조는 담당 칸만 바꾸므로 다른 칸이 되돌아가지는 않는다. 그러나 구멍이 둘 있다.

1. **계획이 낡을 수 있다.** 대화상자를 열어 둔 사이에 누가 그 행의 담당을 고치면,
   적용이 그 손질을 덮어쓴다.
2. **접수 뒤에 누가 그 행을 키웠는지 안 보인다.** 변재휘가 접수했지만 김지현이 쭉 채워 온
   행이라면 접수자만 보고 정하면 안 된다. 사람이 보고 정할 수 있게 깔아 줘야 한다.

## 1. `src/data/owner-cleanup.ts`

### `OwnerCleanupRow` 에 세 칸 추가

```ts
  /** 접수 뒤에 이 행을 고친 사람들. 접수자는 뺀다. 최근 순. */
  editors: string[]
  /** 마지막으로 고친 시각 ISO. 없으면 "" */
  lastEditAt: string
  /**
   * 접수자 말고 **묶음 안의 다른 사람**이 이 행을 고친 적이 있는가.
   * 참이면 접수자만 보고 정하면 안 된다. 기본 선택에서 뺀다.
   */
  conflict: boolean
```

### 새 함수 둘

```ts
/** 같은 작업이 두 조회에 겹쳐 들어올 수 있다. id 로 한 번만 남긴다. */
export function mergeAuditActions(...lists: readonly (readonly AuditAction[])[]): AuditAction[]
```

`action.id` 로 중복을 걷어내고 `at` 내림차순으로 정렬해 돌려준다.

```ts
/**
 * 접수 뒤의 편집자. 행이 생긴 작업(`c === "*"`)은 빼고 셀을 고친 작업만 본다.
 * 같은 사람은 한 번만 담고 최근 순으로 둔다.
 */
export function editorsByRowKey(actions: readonly AuditAction[]): Map<string, { names: string[]; at: string }>
```

`at` 내림차순으로 훑는다. `change.c !== "*"` 인 변경마다 `change.k` 버킷에 `action.name` 을
아직 없을 때만 밀어 넣는다. `at` 은 그 키에서 처음 만난 값(= 가장 최근)을 쓴다.

### `buildOwnerCleanupPlan` 수정

```ts
const editorsOf = editorsByRowKey(actions)
```

행마다:
- `const seen = editorsOf.get(key)`
- `editors = (seen?.names ?? []).filter((name) => name !== creator)`
- `lastEditAt = seen?.at ?? ""`
- `conflict = editors.some((name) => ownerIncludes(record.owner, name))`

`reason` 계산은 그대로 둔다. `conflict` 는 따로 둔다.

## 2. `src/components/dd/OwnerCleanupDialog.tsx`

### 조회를 둘로 나눈다

한 번만 부르면 둘 중 하나를 잃는다. 접수는 옛날이고 편집은 최근인데 `listActions` 가
최신순으로 잘라 오기 때문이다.

```ts
      const { from, to } = cleanupAuditWindow(targets)
      const [created, edited] = await Promise.all([
        // 접수한 때. 좁은 창이라 잘릴 일이 없다.
        listActions({ screen: "dd", from, to, max: 1000 }),
        // 접수 뒤 지금까지. 최신순이라 최근 편집이 들어온다.
        listActions({ screen: "dd", from, max: 1000 }),
      ])
      const plan = buildOwnerCleanupPlan(targets, mergeAuditActions(created, edited))
```

`max` 를 더 키우지 마라. 감사 문서 하나에 셀 변경이 2000개까지 들어가 용량이 크다.

### 기본 선택에서 `conflict` 를 뺀다

```ts
      setChecked(new Set(plan.filter((row) => row.reason === "ok" && !row.conflict).map((row) => row.key)))
```

`picks` 기본값은 그대로 `proposed` 기준이다. 체크만 빠지고 드롭다운에는 접수자가 찍혀 있어,
박향근이 보고 그대로 켜면 된다.

### 열 하나 추가

`접수 일시` 와 `바꿀 담당` 사이에 `접수 뒤 편집` 열을 넣는다.

- `row.editors` 가 비면 `-` 를 쓴다(`text-[var(--muted-foreground)]`).
- 있으면 이름을 ` · ` 로 이어 쓰고, 그 아래 줄에 `shortDateTime(row.lastEditAt)` 를
  `text-[11px] text-[var(--muted-foreground)]` 로 쓴다.
- `row.conflict` 면 이름 옆에 `<Badge variant="outline">편집자 다름</Badge>` 를 단다.

### 접수자 칸의 배지를 고친다

지금은 접수자 이름이 있으면 배지가 안 뜬다. 그래서 `creator-outside` 행이 왜 안 켜지는지
안 보인다. 이렇게 바꾼다.

```tsx
              <td className="px-2 py-1.5">{row.creator ? <span className="flex items-center gap-1.5">{row.creator}{row.reason === "creator-outside" ? <Badge variant="outline">담당 밖</Badge> : null}</span> : <Badge variant="outline">기록 없음</Badge>}</td>
```

### `onApply` 가 받는 모양을 바꾼다

적용 시점에 대조할 수 있도록 **계획이 본 담당 값**을 같이 넘긴다.

```ts
  /** 키 → { from: 계획이 본 담당, to: 바꿀 담당 }. 부르는 쪽이 저장한다. */
  onApply: (picks: Map<string, { from: string; to: string }>) => Promise<void>
```

`apply` 안:

```ts
    const chosen = new Map(selected.map((row) => [row.key, { from: row.current, to: picks.get(row.key)! }]))
```

### 바닥에 못 정한 행 수를 적는다

```tsx
<span className="mr-auto text-xs text-[var(--muted-foreground)]">전체 {rows.length}행 · 바꿀 {selected.length}행{rows.length - selectable.length ? ` · 못 정한 ${rows.length - selectable.length}행` : ""}</span>
```

## 3. `src/routes/DevelopmentMasterSheet.tsx`

`applyOwnerCleanup` 을 통째로 아래로 바꾼다.

```ts
  /**
   * 묶음 담당 행의 담당만 한 사람으로 바꾼다(R432). 담당 외의 칸은 건드리지 않는다.
   *
   * **계획을 세운 뒤 담당이 바뀐 행은 건너뛴다.** 대화상자를 열어 둔 사이에 누가 손봤다는
   * 뜻이고, 그냥 덮으면 그 손질이 사라진다. 바꿀 것이 하나도 없으면 저장도 하지 않는다.
   * 순서 고정(`freezeOrder`)은 끈다. 담당은 정렬에 쓰이지 않아 건드릴 이유가 없고,
   * 켜 두면 손대지도 않은 행의 `sortOrder` 까지 다시 쓴다.
   */
  const applyOwnerCleanup = async (picks: Map<string, { from: string; to: string }>) => {
    if (!picks.size) return
    let changed = 0
    let skipped = 0
    await commitRecords((rows) => {
      const next = rows.map((row) => {
        const pick = picks.get(recordIdentity(row))
        if (!pick) return row
        if (row.owner !== pick.from) { skipped += 1; return row }
        if (row.owner === pick.to) return row
        changed += 1
        return { ...row, owner: pick.to }
      })
      return changed ? next : rows
    }, false)
    notify(skipped
      ? `담당 ${changed}행을 바꿨습니다. ${skipped}행은 그 사이 담당이 바뀌어 건너뛰었습니다.`
      : `담당 ${changed}행을 한 사람으로 바꿨습니다.`)
  }
```

## 손대지 말 것

1차와 같다. `optionsById` 의 `owner` 줄, R430 집계 함수들, R431 의
`requestToIntakeRecords` 는 건드리지 마라. 행 삭제 기능은 만들지 마라.

## 검증

`npm run build` 한 번. 그 외의 검증은 하지 마라.
