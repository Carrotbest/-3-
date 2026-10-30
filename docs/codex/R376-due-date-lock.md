# R376 원사가 들어오면 Due Date를 잠근다

상태: 미착수. 설계는 확정됐다.

## 배경

2026-10-30 박향근 결정이다. **Due Date는 보통 원사가 입고되면 확정된다.** 그 뒤로는 담당자가 납기를 못 바꾸게 하고, 바꿔야 하면 관리자에게 얘기해 관리자가 바꾼다.

R375가 납기 구분과 사유 기록을 만들었지만 수정 자체는 막지 않았다. 이번에 막는다.

## 규칙

**원사 완료일이 있고 Due Date에도 값이 있으면 Due Date를 고칠 수 없다.** 관리자(소유자)는 예외이고, 고칠 때 R375 사유 창을 지난다.

판정은 `tech.processDates.yarn`에 값이 있는지로 본다. R374부터 그 칸은 첫 입력이 목표로 빠지므로, 값이 있다는 것은 실제 입고일이 들어갔다는 뜻이다.

**Due Date가 비어 있으면 잠그지 않는다.** Due Date는 접수 필수 항목이지만 엑셀 업로드 경로에는 그 검사가 걸리지 않는다. 과거 시트에서 들어온 행 중 Due Date가 비고 원사 완료일만 있는 건이 있을 수 있다. 조건 없이 잠그면 그런 행은 영영 납기를 못 채운다.

잠금은 **납기 구분과 무관하게 모든 행에 건다.** 원사가 들어오면 납기가 굳는 것은 지정이든 자체든 같다. R375의 「납기 구분」은 사유 창을 띄울지 정하는 데 계속 쓴다.

## 파일별 조치

고칠 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다.

| 줄 | 조치 |
|---|---|
| 1186 | `isDueDateLocked` 헬퍼 추가, `isLockedCell`에 인자와 조건 추가 |
| 1327 | `GridCell`의 `fixed` 계산에 `canEditLocked` 넘김 |
| `GridCellProps`(1308 근처) | `canEditLocked: boolean` 추가 |
| 1346 | 잠긴 Due Date 칸의 `title` 문구 |
| 3524 | `<GridCell>`에 `canEditLocked={isAdmin}` 전달 |
| 1142 근처 `EditorField` | 모달에서도 잠근다 |
| 2323, 2424, 2458, 2511, 2531, 2727, 2758, 2779, 2806, 2831, 3130 | `isLockedCell` 호출에 `isAdmin` 전달 |
| 3166 근처 `askDelayReason` | 잠긴 건도 사유를 받는다 |

### 1. `isLockedCell`(1186행)

현재:

```ts
const isLockedCell = (record: DevRecord, column: MasterColumn): boolean =>
  isFixedColumn(column) || (GD_ONLY_COLUMN_IDS.has(column.id) && !isGdRecord(record))
```

교체(위 주석 블록은 그대로 두고 함수만 바꾼다. 헬퍼는 그 앞에 둔다):

```ts
/**
 * 납기가 굳었는가(R376). 원사가 입고되면 Due Date가 확정된다는 2026-10-30 결정이다.
 *
 * **Due Date가 비어 있으면 잠그지 않는다.** 엑셀 업로드 경로에는 접수 필수 검사가 걸리지
 * 않아, 과거 시트에서 온 행 중 Due Date가 비고 원사 완료일만 있는 건이 있다.
 * 조건 없이 잠그면 그런 행은 영영 납기를 못 채운다.
 */
const isDueDateLocked = (record: DevRecord): boolean =>
  Boolean(String(record.tech?.processDates?.yarn ?? "").trim()) && Boolean(String(record.dueDate ?? "").trim())

const isLockedCell = (record: DevRecord, column: MasterColumn, canEditLocked = false): boolean =>
  isFixedColumn(column)
  || (GD_ONLY_COLUMN_IDS.has(column.id) && !isGdRecord(record))
  || (column.id === "dueDate" && !canEditLocked && isDueDateLocked(record))
```

기본값 `false`라 인자를 안 넘긴 호출은 잠긴 쪽으로 판정한다. 안전한 방향이다.

### 2. `isLockedCell` 호출처에 `isAdmin`을 넘긴다

아래 줄들은 모두 `isAdmin`(1415행 `useAuthStore((state) => state.isOwner)`)이 스코프에 있는 자리다. 세 번째 인자로 `isAdmin`을 넘긴다.

2323, 2424, 2458, 2511, 2531, 2727, 2758, 2779, 2806, 2831, 3130

예: `isLockedCell(record, column)` → `isLockedCell(record, column, isAdmin)`

**2424행만 모양이 다르다.** `isFixedColumn(sourceColumn) || isLockedCell(targetRecord, targetColumn)`인데 뒤쪽에만 넘긴다.

### 3. `GridCell`(1327행)

`GridCellProps`에 `editEnabled: boolean` 옆으로 한 줄 더한다.

```ts
  canEditLocked: boolean
```

구조 분해 인자 목록에도 `editEnabled` 옆에 `canEditLocked`를 더하고, 1327행을 바꾼다.

```ts
  const fixed = isLockedCell(record, column, canEditLocked)
```

**`GridCell`에서 `useAuthStore`를 부르지 마라.** 이 컴포넌트는 `memo`이고 74열 × 수백 행으로 수천 개가 그려진다. 셀마다 store 구독이 생기면 memo가 무의미해진다. `canEditLocked`는 boolean이라 memo를 깨지 않는다.

3524행 `<GridCell ...>`에 `canEditLocked={isAdmin}`을 더한다.

### 4. 잠긴 칸 안내(1346행)

지금 `title`은 `typeof displayedContent === "string" ? displayedContent : undefined`다. Due Date가 잠긴 경우만 문구를 바꾼다.

```tsx
title={column.id === "dueDate" && fixed && isDueDateLocked(record)
  ? "원사가 입고되어 납기가 확정됐습니다. 바꾸려면 관리자에게 요청하세요."
  : typeof displayedContent === "string" ? displayedContent : undefined}
```

칸이 회색으로 보이는 것은 `fixed`가 이미 처리한다. 색을 새로 주지 마라.

### 5. 74열 수정 모달(`EditorField`, 1142행 근처)

`EditorField`는 모듈 레벨 컴포넌트라 `isAdmin`이 스코프에 없다. **여기서는 `useAuthStore`를 직접 부른다.** 모달 안 74개라 구독 수가 적어 `GridCell`과 사정이 다르다.

컴포넌트 안에서 `const canEditLocked = useAuthStore((state) => state.isOwner)`를 만들고, `disabled` 계산에 더한다. 현재 `const disabled = readOnly || computed` 꼴이므로 뒤에 `|| isLockedCell(draft, column, canEditLocked)`를 잇는다.

`useAuthStore`는 이 파일에 이미 import되어 있다.

### 6. 사유 창을 잠긴 건까지 넓힌다(`askDelayReason`, 3166행 근처)

현재 Due Date 분기는 `record.tech?.dueDateFixed !== "지정"`이면 그냥 돌아간다. 관리자가 잠금을 뚫고 고칠 때도 기록이 남아야 하므로 조건을 넓힌다.

```ts
      if (record.tech?.dueDateFixed !== "지정" && !isDueDateLocked(record)) return
```

나머지(기본 사유 `other`, 뒤로 미룰 때만, 앞당기거나 처음 채우면 안 뜸)는 그대로다.

## 하지 말 것

- **`isLockedCell`을 거치지 않는 새 저장 경로를 만들지 마라.** 그 함수 주석대로 붙여넣기, 채우기, 지우기가 전부 같은 판정을 본다. 한 곳만 막으면 다른 경로로 값이 들어간다.
- `isDueDateLocked`에서 Due Date가 비었는지 보는 조건을 빼지 마라. 옛 행이 영영 막힌다.
- `reached()`나 `processReached`로 판정하지 마라. 그 둘은 `날짜 <= 오늘`과 FL# 완료를 섞어 본다. 잠금은 입고일을 적었는지만 본다.
- `processDates.yarn`의 의미를 바꾸지 마라. 완료(실행)일이다.
- `GridCell`에 store 구독을 넣지 마라.
- 잠긴 칸에 새 색을 주지 마라. `fixed`가 이미 회색으로 그린다.
- 납기 구분(`dueDateFixed`)으로 잠금 대상을 가르지 마라. 모든 행에 건다.
- 접수 창의 Due Date 필수 검사(`INTAKE_REQUIRED_IDS`)를 건드리지 마라. 새 행은 원사 완료일이 없어 잠기지 않는다.

## 검증

`npm run build` 한 번. 타입 오류가 없고 빌드가 끝나면 된다.

그다음 `git status --short`로 `src/routes/DevelopmentMasterSheet.tsx` 외에 바뀐 것이 없는지 본다.

화면 확인은 박향근이 한다.
