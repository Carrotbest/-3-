# R338 DD 되돌리기를 행 단위 diff로

상태: 미착수. 원인 규명과 설계 완료, 코드 미수정.

데이터 안전 보완 3묶음의 3-1이다. 앞선 두 건은 커밋 `60af5d2`(R336), `f38bfcc`(R337)로 끝났다.

고치는 파일은 둘이다. `src/store/useAppStore.ts`와 `src/routes/DevelopmentMasterSheet.tsx`.

## 무엇이 잘못됐나

`undoStack`이 편집 직전 **DD 전체 배열**을 통째로 쌓고(`DevelopmentMasterSheet.tsx` 1399행, `pushUndoSnapshot` 1424행), `undoLast`(2678행)가 그 배열을 `writeDevelopmentRecords(snapshot, false)`로 통째 다시 쓴다.

`records`는 동기화 병합 키라(`firestore-sync.ts` `MERGE_IDS`, id는 `sheet::row`) 3-way 병합을 탄다. 전체 배열을 내 값으로 쓰면 **모든 행이 "내가 고친 값"으로 선다.** 그래서 스냅샷을 찍은 뒤 팀원이 다른 행에 넣은 편집이 Ctrl+Z 한 번에 같이 되돌아간다.

더 나쁜 경우가 있다. **팀원이 새로 추가한 행이 이미 내 기준선에 들어와 있으면 그 행이 사라진다.** 내 스냅샷에는 그 행이 없고 기준선에는 있으니 `sync-merge.ts` `mergeKeyed`(24행 부근)가 "내가 지웠다"로 읽는다.

## 설계

되돌리기 스택에 **내가 실제로 바꾼 행만** 담고, 되돌릴 때 현재 값이 그 작업의 결과와 같은 행만 손댄다.

셀 단위로 내려가지 않는다. `audit.ts`의 칸 단위 diff는 값을 문자열로 눕히고 추가·삭제를 표지로만 남겨서 복원 자료로 쓸 수 없다. 셀 단위는 별도 건이다.

**전부 아니면 전부다.** 묶음 안에 한 행이라도 어긋나면 아무것도 건드리지 않고 알린다. 부분 적용을 허용하면 잘라내기와 행 이동처럼 여러 행이 한 몸인 작업이 절반만 되돌아가 순서가 깨진다. 대신 붙여넣기 50행 중 1행만 팀원이 고쳐도 그 되돌리기는 거부된다. 그 절충을 택했다.

## 조치 1. `writeDevelopmentRecords`가 적용 결과를 돌려준다

`src/store/useAppStore.ts` 798행이다. 지금은 차단돼도 `Promise<void>`로 끝나 호출한 쪽이 성공을 구분할 수 없다.

반환형을 `Promise<DevRecord[] | null>`로 바꾼다.

- FL 형식 차단(`invalidFl.length`)과 창고 지문 차단(`blockedByWarehouseDrift`)에서 `return null`.
- 마지막에 `return next`. **재계산과 sortOrder 고정이 끝난 실제 저장값**이다.

본문의 다른 줄은 건드리지 않는다. `setAppState`, `scheduleRecordsSave`, `logAction` 순서 그대로다.

기존 호출처는 반환값을 안 쓰므로 그대로 둔다. `FabricRequest.tsx` 세 곳(920, 932, 968행)도 손대지 않는다.

## 조치 2. 스택 자료형과 diff 도우미

`DevelopmentMasterSheet.tsx`다. `recordIdentity`는 같은 파일 671행에 이미 있다.

`pushUndoSnapshot`(1424행) 자리에 아래를 둔다.

```ts
interface UndoRow {
  key: string
  /** 작업 전 값. null이면 그 작업이 새로 만든 행이다. */
  before: DevRecord | null
  /** 작업 후 값. null이면 그 작업이 지운 행이다. */
  after: DevRecord | null
}
interface UndoEntry { rows: UndoRow[] }

/** 적용 전후를 행 단위로 비교해 내가 건드린 행만 추린다(R338).
 *  수식 재계산과 sortOrder 고정이 다른 행도 바꾸므로 **적용 결과**와 비교해야 한다. */
function diffRows(before: readonly DevRecord[], after: readonly DevRecord[]): UndoRow[] {
  const prev = new Map(before.map((record) => [recordIdentity(record), record]))
  const next = new Map(after.map((record) => [recordIdentity(record), record]))
  const rows: UndoRow[] = []
  next.forEach((record, key) => {
    const old = prev.get(key) ?? null
    if (!old) { rows.push({ key, before: null, after: record }); return }
    if (JSON.stringify(old) !== JSON.stringify(record)) rows.push({ key, before: old, after: record })
  })
  prev.forEach((record, key) => { if (!next.has(key)) rows.push({ key, before: record, after: null }) })
  return rows
}
```

스택 선언(1399, 1400행)을 바꾼다.

```ts
const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
```

`pushUndoSnapshot`을 지우고 대신 둔다.

```ts
const pushUndoEntry = (before: readonly DevRecord[], applied: readonly DevRecord[]) => {
  const rows = diffRows(before, applied)
  if (!rows.length) return
  setUndoStack((current) => [...current, { rows }].slice(-50))
  setRedoStack([])
}
```

`slice(-50)`은 그대로다. 묶음이 작아져 메모리는 오히려 준다.

## 조치 3. 호출 6곳을 바꾼다

지금은 전부 `pushUndoSnapshot(before)`를 **쓰기 전에** 부른다. 차단돼도 스택이 쌓인다. 순서를 뒤집는다.

해당 줄은 2193, 2406, 2437, 2446, 2459, 2478행이다. 각각 바로 아래에 `await writeDevelopmentRecords(...)`가 있다.

패턴은 하나다. `pushUndoSnapshot(before)` 줄을 지우고, 쓰기 줄을 아래로 바꾼다.

```ts
const applied = await writeDevelopmentRecords(/* 기존 인자 그대로 */)
if (applied) pushUndoEntry(before, applied)
```

주의할 점이다.

- 인자는 바꾸지 마라. 어떤 곳은 `(next)`, 어떤 곳은 `(next, false, "edit")`, 어떤 곳은 `(merged.map(...))`이다.
- 쓰기 **뒤에** 오는 `notify`와 `setRange` 같은 줄은 자리를 그대로 둔다.
- 2406행과 2478행은 `setCopyMark(null)`이 `pushUndoSnapshot` 다음에 있다. 그 줄은 쓰기 앞에 그대로 남긴다.
- `commitRecords`(2190행 부근)는 `before`를 이미 지역 변수로 들고 있다. 나머지 다섯 곳도 같다.

## 조치 4. `undoLast`와 `redoLast`

2678행부터다. 둘을 공통 함수로 묶는다.

```ts
/** 되돌리기·다시실행 공통. 묶음 전체가 적용 가능할 때만 손댄다(R338). */
const applyUndoEntry = async (entry: UndoEntry, direction: "undo" | "redo"): Promise<boolean> => {
  const current = useAppStore.getState().records
  const byKey = new Map(current.map((record) => [recordIdentity(record), record]))
  const expectOf = (row: UndoRow) => direction === "undo" ? row.after : row.before
  const targetOf = (row: UndoRow) => direction === "undo" ? row.before : row.after

  // 현재 값이 그 작업의 결과와 다르면 그사이 다른 사람이 고친 것이다.
  const conflicts = entry.rows.filter((row) => {
    const expect = expectOf(row)
    const now = byKey.get(row.key) ?? null
    if (expect === null) return now !== null
    if (now === null) return true
    return JSON.stringify(now) !== JSON.stringify(expect)
  })
  if (conflicts.length) {
    notify(`${conflicts.length}행을 그사이 다른 사람이 고쳐 되돌리지 않았습니다.`)
    return false
  }

  const removals = new Set(entry.rows.filter((row) => targetOf(row) === null).map((row) => row.key))
  const replacements = new Map(entry.rows
    .filter((row) => targetOf(row) !== null)
    .map((row) => [row.key, targetOf(row)!]))
  const kept = current
    .filter((record) => !removals.has(recordIdentity(record)))
    .map((record) => replacements.get(recordIdentity(record)) ?? record)
  const restored = [...replacements.entries()]
    .filter(([key]) => !byKey.has(key))
    .map(([, record]) => record)
  const applied = await writeDevelopmentRecords([...kept, ...restored], false, "revert")
  return applied !== null
}
```

되살린 행을 뒤에 붙이는 것으로 충분하다. 화면 순서는 `sortOrder`가 정한다.

`undoLast`와 `redoLast`는 아래가 된다.

```ts
const undoLast = async () => {
  const entry = undoStack[undoStack.length - 1]
  if (!entry) return
  if (!await applyUndoEntry(entry, "undo")) return
  setUndoStack((stack) => stack.slice(0, -1))
  setRedoStack((stack) => [...stack, entry].slice(-50))
  notify(`${entry.rows.length}행을 되돌렸습니다.`)
}

const redoLast = async () => {
  const entry = redoStack[redoStack.length - 1]
  if (!entry) return
  if (!await applyUndoEntry(entry, "redo")) return
  setRedoStack((stack) => stack.slice(0, -1))
  setUndoStack((stack) => [...stack, entry].slice(-50))
  notify(`${entry.rows.length}행을 다시 실행했습니다.`)
}
```

**실패하면 스택을 움직이지 않는다.** 충돌을 사람이 정리한 뒤 다시 누를 수 있어야 한다.

`kind`는 `"revert"`다. `AuditKind`에 이미 있다. `recalculate`는 `false`다. 저장해 둔 값을 그대로 되돌리는 자리라 다시 계산하면 복원이 어긋난다.

도구줄 버튼(3059행)과 우클릭 메뉴(3279행)의 `disabled={!undoStack.length}`는 그대로 둔다.

## 하지 말 것

- 셀 단위 복원을 만들지 마라. 이번은 행 단위다.
- `src/data/audit.ts`의 `planRevert`나 `diffByKey`를 끌어다 쓰지 마라. 값을 문자열로 눕히고 추가·삭제를 표지로만 남겨 복원에 못 쓴다.
- `writeDevelopmentRecords`를 건너뛰고 `setAppState`를 직접 부르지 마라. 창고 지문 검사(`blockedByWarehouseDrift`)와 작업 이력이 그 길목에 있다.
- `recalculate`를 `true`로 바꾸지 마라.
- 서버 트랜잭션에서 기대값을 확인하는 보호는 이번 범위가 아니다. 아직 수신 못 한 팀원의 같은 행 수정은 여전히 덮일 수 있다. 그 한계를 코드 주석에 한 줄 남기되 고치려 들지 마라.
- `Warehouse.tsx`와 `FabricRequest.tsx`에도 각자 `undoStack`이 있다. 이번에 손대지 마라.
- `slice(-50)` 상한을 바꾸지 마라.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과해야 한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/store/useAppStore.ts`와 `src/routes/DevelopmentMasterSheet.tsx` 두 줄만 보여야 한다.
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
