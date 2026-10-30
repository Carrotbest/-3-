# R374 공정 날짜는 한 칸에서 목표와 완료를 순서대로 받는다

상태: 미착수. 규칙은 확정됐다.

## 배경

R369가 공정 일정을 목표일과 완료일 두 열로 갈랐다. 목표 열 넷은 기본 숨김이고 도구줄 「목표일 펼치기」로 편다.

2026-10-30에 박향근이 입력 방식을 바꾸기로 했다. **입력 칸이 둘이면 혼선이 생긴다.** 작지를 등록하거나 행을 추가하고 날짜를 적을 때, 목표 열을 따로 펴서 적게 하지 말고 평소 보이는 완료 칸 하나로 끝내자는 것이다. 처음 적은 날짜가 목표가 되고 그 다음부터 완료로 들어간다.

## 규칙

공정 완료 열(`yarnStatus`, `knittingStatus`, `dyeingStatus`, `finishingStatus`)에 값을 쓸 때 어디로 들어갈지 그 행의 현재 상태가 정한다.

| 그 공정의 현재 상태 | 새 날짜가 들어가는 곳 |
|---|---|
| 목표와 완료가 모두 빈다 | `targetDates` (첫 입력이 목표다) |
| 목표만 있다 | `processDates` |
| 완료가 있다 | `processDates` |

한 줄로 하면 **목표와 완료가 모두 비어 있을 때 친 첫 날짜만 목표가 되고, 나머지는 전부 완료다.**

세 번째 줄이 중요하다. R369 전에 생긴 행은 `targetDates`가 아예 없고 `processDates`에만 날짜가 있다. 완료 여부를 먼저 보지 않으면 그런 행의 완료일을 고치려 할 때마다 값이 목표로 새어 들어간다.

지우기는 채운 역순이다. 완료가 있으면 완료를 지우고, 완료가 없고 목표만 있으면 목표를 지운다.

## 고칠 곳

`src/routes/DevelopmentMasterSheet.tsx`의 `updateRecordCell` 하나다. 인라인 편집, 74열 수정 모달, 접수 창, 붙여넣기, 아래로 채우기, Delete가 모두 이 함수를 지나므로 여기만 고치면 전부 같은 규칙을 탄다.

### 1. 상수를 더한다

`TARGET_PROCESS_BY_COLUMN`(452행) 바로 아래에 둔다.

```ts
/** 공정 완료 열 넷. 이 칸은 한 칸으로 목표와 완료를 순서대로 받는다(R374). */
const PROCESS_BY_STATUS_COLUMN: Record<string, DdProcess> = {
  yarnStatus: "yarn", knittingStatus: "knitting", dyeingStatus: "dyeing", finishingStatus: "finishing",
}
```

### 2. `updateRecordCell`에 분기를 넣는다

현재(909~912행):

```ts
  const path = TECH_PATHS[column.id]
  if (!path) return record
  const tech = structuredClone(record.tech ?? {}) as DevTechnical
  setNested(tech as unknown as Record<string, unknown>, path, value === "" ? undefined : value)
```

교체:

```ts
  const path = TECH_PATHS[column.id]
  if (!path) return record
  const tech = structuredClone(record.tech ?? {}) as DevTechnical
  const next = value === "" ? undefined : value
  // 공정 완료 칸은 한 칸으로 목표와 완료를 순서대로 받는다(R374).
  // 목표와 완료가 모두 비어 있을 때 친 첫 날짜만 목표다. 나머지는 완료다.
  // 완료를 먼저 보는 이유는 R369 전 행에 targetDates가 없기 때문이다.
  // 목표부터 보면 그 행의 완료일을 고칠 때마다 값이 목표로 샌다.
  // 지우기는 채운 역순이다. 완료가 있으면 완료부터 지운다.
  const statusProcess = PROCESS_BY_STATUS_COLUMN[column.id]
  const schedulePath = statusProcess
    ? [String(record.tech?.processDates?.[statusProcess] ?? "").trim() || String(record.tech?.targetDates?.[statusProcess] ?? "").trim()
        ? "processDates"
        : "targetDates",
       statusProcess]
    : null
  const deletePath = statusProcess && next === undefined
    ? [String(record.tech?.processDates?.[statusProcess] ?? "").trim() ? "processDates" : "targetDates", statusProcess]
    : null
  setNested(tech as unknown as Record<string, unknown>, deletePath ?? schedulePath ?? path, next)
```

위 식이 읽기 어려우면 작은 도우미 함수로 빼도 된다. **동작만 표의 세 줄과 같으면 된다.** 판정에 쓰는 값은 `record`(바꾸기 전 상태)에서 읽어야 한다. `tech`는 이미 복제본이라 상관없지만 순서를 뒤집어 쓰고 나서 읽지 마라.

## 하지 말 것

- **`processDates`의 의미를 바꾸지 마라.** 완료(실행)일이다. `dd-workflow.ts`의 `reached()`가 `날짜 <= 오늘`로 읽고 `processReached`, `stage`, HOME 공정 카운트, 주간 보고, DD 내보내기가 전부 그 값을 완료로 센다.
- **목표일을 `processDates`에 복사하지 마라**(R372). 목표일이 지나는 순간 아무도 손대지 않은 공정이 도달로 잡힌다.
- `scheduleCellRender`와 `scheduleToneOf`를 고치지 마라. 완료가 비면 목표를 기울임꼴로 보여 주고 목표일이 지난 빈 완료를 붉게 잡는 동작이 이미 이 규칙과 맞는다.
- 목표 열 넷(`yarnTarget` 등)과 `TARGET_PROCESS_BY_COLUMN`, `askDelayReason`을 고치지 마라. 목표 열을 직접 고칠 때 사유 창이 뜨는 동작은 그대로 둔다. 완료 칸 첫 입력은 처음 채우는 것이라 사유 대상이 아니다.
- 목표 열의 기본 숨김(`DEFAULT_HIDDEN`)을 풀지 마라.
- 접수 창의 목표 칸과 가공 목표 필수 검사를 건드리지 마라.
- 마이그레이션 코드를 쓰지 마라. 기존 행의 날짜를 목표와 완료로 자동으로 가르지 마라. 과거 날짜가 실제 완료인지 목표였는지 알 수 없다.

## 검증

`npm run build` 한 번. 타입 오류가 없고 빌드가 끝나면 된다.

그다음 `git status --short`로 `src/routes/DevelopmentMasterSheet.tsx` 외에 바뀐 것이 없는지 본다.

화면 확인은 박향근이 한다.
