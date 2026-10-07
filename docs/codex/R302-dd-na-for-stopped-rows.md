# R302 — DD MASTER 멈춘 행의 FDS·YDS·FL#을 N/A로, "해당 없음" 표기 통일

상태: 미착수

## 배경

2026-10-07 박향근 요청이다. HOLD·DROP·REJECT 행은 FDS·YDS·FL#에 N/A를 보이고 색은 보통 검정이다. 기존 `해당 없음` 글자도 모두 N/A로 바꾼다.

멈춘 행은 받을 것도 채울 것도 없다. 지금은 FL# 칸이 빈칸이라 아직 채번 전인 행과 구분이 안 된다. R296에서 경고 아이콘을 끈 것과 같은 취지다.

**표시만 바꾼다. 저장 값은 손대지 않는다.** `N/A`를 셀에 써 넣지 마라. FL# 칸은 R297에서 `F`·`L`·숫자만 받게 막아 두었고, 자리표시자를 값으로 저장하지 않는 것이 이 화면의 규칙이다(CLAUDE.md `Dyeing Side`, `COLOR_PLACEHOLDERS`).

**워킹트리에 아직 커밋 안 된 R300·R301 변경이 있다.** `git reset`, `git checkout`, `git stash`, `git restore` 로 되돌리지 마라.

## 파일

`src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일을 고치지 마라.

---

## 1. import (23행)

현재 `@/data/dd-workflow` import 에 `isStoppedRecord` 를 더한다. 현재 줄 끝부분:
```ts
..., ddWarnings, isCompletedFlNo, isGdRecord } from "@/data/dd-workflow"
```
교체:
```ts
..., ddWarnings, isCompletedFlNo, isGdRecord, isStoppedRecord } from "@/data/dd-workflow"
```
나열된 다른 이름을 지우거나 순서를 바꾸지 마라.

## 2. `DEAD_STATUSES` 제거 (50행)

현재:
```ts
const DEAD_STATUSES = new Set(["DROP", "REJECT", "HOLD"])
```
이 줄을 **지운다.** 쓰는 곳은 150행 하나뿐이고 아래 4번에서 `isStoppedRecord` 로 바꾼다.

`isStoppedRecord` 는 `HOLD`·`보류`·`DROP`·`REJECT` 를 보고 공백도 지운 뒤 비교한다. `DEAD_STATUSES` 는 한글 `보류` 를 놓쳤다. 판정 어휘를 한 곳으로 모으는 것이 `dd-workflow.ts` 주석에 적힌 규칙이다. **되살리지 마라.**

## 3. N/A 조각 추가

`const dateText = ...` 줄(129행) 바로 아래에 넣는다.

```tsx
/**
 * 받을 것도 채울 것도 없는 칸. 멈춘 행(HOLD·DROP·REJECT)과 공정 자체가 없는 국내 FDS·YDS 다.
 * 색을 죽이지 않는다(2026-10-07 박향근 지시). 같은 글자가 칸마다 다른 색이면 결함으로 보인다.
 * 표시 전용이다. 이 글자를 셀 값으로 저장하지 마라.
 */
const NotApplicable = () => <span>N/A</span>
```

## 4. FDS·YDS 렌더 (131~138행)

현재:
```tsx
/**
 * FDS·YDS 전용. 국내 작업은 이 공정 자체가 없으므로 미수취로 몰아세우지 않고 해당 없음으로 비운다.
 * 셀 편집도 `isLockedCell`에서 함께 막는다.
 */
const gdReceiptDateRender = (value: (record: DevRecord) => CellValue): NonNullable<MasterColumn["render"]> => (record) => {
  if (!isGdRecord(record)) return <span className="text-[var(--muted-foreground)]">해당 없음</span>
  const date = value(record)
  return date ? dateText(date) : <span className="text-[var(--destructive)]">미수취</span>
}
```
교체:
```tsx
/**
 * FDS·YDS 전용. 국내 작업은 이 공정 자체가 없으므로 미수취로 몰아세우지 않고 N/A로 비운다.
 * 멈춘 행도 같다. 날짜가 이미 있으면 그 값을 그대로 보인다. 멈추기 전에 받은 기록이다.
 * 셀 편집도 `isLockedCell`에서 함께 막는다.
 */
const gdReceiptDateRender = (value: (record: DevRecord) => CellValue): NonNullable<MasterColumn["render"]> => (record) => {
  if (!isGdRecord(record)) return <NotApplicable />
  const date = value(record)
  if (date) return dateText(date)
  if (isStoppedRecord(record)) return <NotApplicable />
  return <span className="text-[var(--destructive)]">미수취</span>
}
```

**`isGdRecord` 검사를 맨 앞에서 옮기지 마라.** 국내 행은 날짜가 있든 없든 N/A다. 순서를 바꾸면 국내 행 동작이 지금과 달라진다.

## 5. Received date 렌더 (140~153행)

현재 본문:
```tsx
const receiptDateRender = (value: (record: DevRecord) => CellValue): NonNullable<MasterColumn["render"]> => (record) => {
  const date = value(record)
  if (date) return dateText(date)
  if (DEAD_STATUSES.has(String(record.devStatus || record.stage || "").trim().toUpperCase())) {
    return <span className="text-[var(--muted-foreground)]">해당 없음</span>
  }
  return <span className="text-[var(--destructive)]">미수취</span>
}
```
교체:
```tsx
const receiptDateRender = (value: (record: DevRecord) => CellValue): NonNullable<MasterColumn["render"]> => (record) => {
  const date = value(record)
  if (date) return dateText(date)
  if (isStoppedRecord(record)) return <NotApplicable />
  return <span className="text-[var(--destructive)]">미수취</span>
}
```
바로 위 주석 블록(142~146행 `Received date 전용.` ~ `국내 입고 판정이 ...`)은 그대로 둔다. 다만 그 안의 `해당 없음` 이라는 표현이 본문에 있으면 `N/A` 로 고친다.

## 6. FL# 렌더 (257행)

257행은 `{ id: "flNo", ... }` 한 줄이다. 그 안의 `render:` 값만 바꾼다. 다른 속성(`id`, `label`, `width`, `mono`, `value`)은 손대지 마라.

현재 `render`:
```tsx
render: (row) => row.flNo.trim() ? <span className={`inline-flex items-center font-mono ${isCompletedFlNo(row.flNo) ? "" : "text-[var(--destructive)]"}`} title={isCompletedFlNo(row.flNo) ? undefined : "FL + 숫자 8자리 형식만 완료로 인정합니다"}>{row.flNo}{isCompletedFlNo(row.flNo) ? <FlPerfMark flNo={row.flNo} /> : null}</span> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미등록</span> : ""
```
교체:
```tsx
render: (row) => row.flNo.trim() ? <span className={`inline-flex items-center font-mono ${isCompletedFlNo(row.flNo) ? "" : "text-[var(--destructive)]"}`} title={isCompletedFlNo(row.flNo) ? undefined : "FL + 숫자 8자리 형식만 완료로 인정합니다"}>{row.flNo}{isCompletedFlNo(row.flNo) ? <FlPerfMark flNo={row.flNo} /> : null}</span> : isStoppedRecord(row) ? <NotApplicable /> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미등록</span> : ""
```

값이 있으면 그 값이 먼저다. 멈춘 행이어도 FL#을 이미 딴 건은 번호를 그대로 보인다. **값을 N/A로 덮지 마라.** 반려 전에 채번한 건의 번호가 화면에서 사라진다.

`ddWarnings` 는 멈춘 행에서 이미 빈 배열을 돌려주므로(`isStoppedRecord` 가드) `FL 미등록` 과 겹치지 않는다. 가드를 믿지 말고 위 순서대로 `isStoppedRecord` 를 앞에 둬라.

---

## 하지 말 것

- `N/A` 를 셀 값으로 저장하지 마라. 표시만이다. `updateRecordCell`, `isAcceptableCellValue`, `sanitizeFlTyping`, `COLOR_PLACEHOLDERS` 를 건드리지 마라.
- `DEAD_STATUSES` 를 되살리지 마라.
- 이미 값이 있는 칸을 N/A로 덮지 마라.
- `dd-export.ts` 내보내기와 `dd-workflow.ts` 경고 로직을 건드리지 마라. 화면 표시만 바꾼다.
- `src/routes/DevelopmentMasterSheet.tsx` 외의 파일을 고치지 마라.
- 워킹트리의 R300·R301 변경을 git 명령으로 되돌리지 마라.
- `firestore.rules`, `public/data` 아래 JSON, `legacy/`, `backup/` 을 열지 마라.

## 성공 기준

- `npm run build` 통과(`tsc --noEmit` 포함). 실패하면 고치고 다시 돌려라.
- `grep -n "해당 없음\|해당없음" src/routes/DevelopmentMasterSheet.tsx` 결과가 0건이다.
- `grep -rn "DEAD_STATUSES" src/` 결과가 0건이다.
- `git status --short` 에 이번에 새로 바뀐 파일이 `src/routes/DevelopmentMasterSheet.tsx` 하나다. R300·R301로 이미 바뀐 파일들은 그대로 남아 있어야 한다.
