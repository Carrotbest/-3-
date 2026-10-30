# R377 납기 종류는 접수 때 두 칸으로 받는다

상태: 미착수. 설계는 확정됐다.

## 배경

R375가 Due Date 오른쪽에 「납기 구분」 열을 만들었다. 2026-10-30에 박향근이 뒤집었다. **표에 열이 느는 것이 싫다.** 입력 칸이 많으면 혼선이 생긴다는 R374 때와 같은 이유다.

대신 **신규 작지 접수 창에서 지정 납기와 일반 납기를 갈라 받는다.** 어느 칸에 적었는지가 곧 구분이다. 표에는 Due Date 한 칸만 남는다.

## 설계

접수 창의 Due Date 자리에 칸 둘을 세운다.

| 칸 | 적으면 |
|---|---|
| 지정 납기 | `dueDate`에 날짜가 들어가고 `tech.dueDateFixed`가 `"지정"`이 된다 |
| 일반 납기 | `dueDate`에 날짜가 들어가고 `tech.dueDateFixed`가 지워진다 |

둘은 같은 `dueDate` 하나를 본다. 한쪽에 적으면 다른 쪽은 저절로 빈다. 둘 다 비면 저장이 막힌다.

표에서는 Due Date 한 칸이고, 지정 납기면 글자가 굵다. R375에서 넣은 표시 그대로다.

**접수 뒤에는 구분을 바꿀 수 없다.** 그래도 되는 이유가 있다. 구분이 하는 일은 사유 창을 띄울지 정하는 것 하나인데, 원사가 입고되면 R376 잠금이 걸려 **구분과 무관하게** 관리자만 고치고 사유가 남는다. 입고 전이면 납기가 아직 유동적이라 사유를 받을 자리가 아니다.

## 파일별 조치

고칠 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다.

| 줄 | 조치 |
|---|---|
| 318 | 「납기 구분」 열을 지운다 |
| 821 | `TECH_PATHS`에서 `dueDateFixed`를 지운다 |
| 906 근처 | `updateRecordCell`에 접수 전용 칸 둘을 더한다 |
| 549 | `INTAKE_REQUEST`에서 `dueDate`를 빼고 새 칸 둘을 끼운다 |
| 558 | `INTAKE_REQUIRED_IDS`에서 `dueDate`를 뺀다 |
| 3081 근처 | `saveIntake`에 납기 검사를 따로 더한다 |
| 566 근처 | `applySharedFields`가 `dueDateFixed`를 옮긴다 |

### 1. 「납기 구분」 열 삭제 (318행)

이 줄을 통째로 지운다.

```tsx
      { id: "dueDateFixed", label: "납기 구분", width: 64, align: "center", value: (row) => row.tech?.dueDateFixed ?? "", options: ["", "지정"] },
```

317행 Due Date 열은 그대로 둔다. 굵은 글씨 표시와 `title`이 거기 있다.

### 2. `TECH_PATHS`에서 제거 (821행)

이 줄을 지운다. 새 칸이 `tech`를 직접 만들기 때문에 경로가 필요 없다.

```ts
  dueDateFixed: ["dueDateFixed"],
```

### 3. 접수 전용 칸 둘 (549행 앞, `INTAKE_CORE` 근처에 둔다)

```tsx
/**
 * 접수 창 전용 납기 칸 둘(R377). 표에는 서지 않는다.
 *
 * 어느 칸에 적었는지가 곧 납기 종류다. 둘은 같은 `dueDate` 하나를 보고,
 * 한쪽에 적으면 다른 쪽은 저절로 빈다. `GROUPS`에 넣지 말 것. 표에 열이 는다.
 */
const INTAKE_DUE_COLUMNS: MasterColumn[] = [
  { id: "intakeDueGiven", label: "지정 납기", width: 76, date: true, value: (row) => row.tech?.dueDateFixed === "지정" ? row.dueDate : "" },
  { id: "intakeDueOwn", label: "일반 납기", width: 76, date: true, value: (row) => row.tech?.dueDateFixed === "지정" ? "" : row.dueDate },
]
```

### 4. `INTAKE_REQUEST` 조립 (549행)

현재:

```ts
const INTAKE_REQUEST = groupByKey("request").columns.filter((column) => column.id !== "opt")
```

교체:

```ts
// Due Date는 접수 창에서 종류별 칸 둘로 받는다(R377). 그 자리에 끼워 넣는다.
const INTAKE_REQUEST = groupByKey("request").columns
  .filter((column) => column.id !== "opt")
  .flatMap((column) => column.id === "dueDate" ? INTAKE_DUE_COLUMNS : [column])
```

`INTAKE_DUE_COLUMNS`를 그 위에 두어야 참조가 선다.

### 5. `updateRecordCell`에 case 둘 (906행 `case "dueDate"` 바로 아래)

```ts
    // 접수 창 납기 칸 둘(R377). 적은 칸이 종류를 정한다.
    // `undefined`를 넣지 말고 키를 지운다. 값 없는 키는 Firestore가 거부한다(R340).
    case "intakeDueGiven": {
      const tech = { ...(record.tech ?? {}) }
      if (input.trim()) tech.dueDateFixed = "지정"
      else delete tech.dueDateFixed
      return { ...record, dueDate: input, tech }
    }
    case "intakeDueOwn": {
      const tech = { ...(record.tech ?? {}) }
      delete tech.dueDateFixed
      return { ...record, dueDate: input, tech }
    }
```

### 6. 필수 목록에서 제거 (558행)

`dueDate`를 뺀다. 그 열이 접수 목록에 없어서 `fieldValueOf`가 값을 못 읽고, 두면 저장이 늘 막힌다.

```ts
const INTAKE_REQUIRED_IDS = new Set(["owner", "styleNo", "season", "category", "buyer", "planner"])
```

위 주석 블록의 Due Date 설명은 지우지 말고, 검사 자리가 옮겨졌다는 한 줄을 더한다.

### 7. `saveIntake`에 납기 검사 (3081행 `missing` 검사 바로 뒤)

```ts
    // 납기는 종류별 칸 둘 중 하나로 받는다(R377). 둘 다 비면 막는다.
    // Due Date가 비면 HOME 스케줄 임박과 지연에서 그 건이 통째로 빠진다.
    if (!String(sharedDraft.dueDate ?? "").trim()) {
      setIntakeError("납기를 입력하세요. 지정 납기나 일반 납기 중 한 칸에 적습니다.")
      return
    }
```

### 8. `applySharedFields` (566행 근처)

지금은 `dueDate`만 옮기고 `tech.dueDateFixed`는 옮기지 않는다. 옵션 행마다 종류가 따라가야 한다.

현재:

```ts
    tech: { ...to.tech, original: { ...from.tech?.original } },
```

함수 본문을 이렇게 바꾼다.

```ts
  const tech = { ...to.tech, original: { ...from.tech?.original } }
  if (from.tech?.dueDateFixed) tech.dueDateFixed = from.tech.dueDateFixed
  else delete tech.dueDateFixed
  return {
    ...to,
    owner: from.owner, styleNo: from.styleNo, season: from.season, buyer: from.buyer,
    category: from.category, planner: from.planner, requestDate: from.requestDate, dueDate: from.dueDate,
    tech,
  }
```

## 하지 말 것

- **`INTAKE_DUE_COLUMNS`를 `GROUPS`에 넣지 마라.** 표에 열이 늘어 이번 변경이 무의미해진다.
- 317행 Due Date 열의 `render`와 `title`을 지우지 마라. 지정 납기를 굵게 보이는 자리다.
- `tech.dueDateFixed` 필드 자체를 `schema.ts`에서 지우지 마라. 값은 그대로 쓴다.
- `undefined`를 넣어 지우려 하지 마라. `{ ...tech, dueDateFixed: undefined }`는 값 없는 키를 만들고 Firestore가 그 문서를 거부한다(R340). `delete`를 쓴다.
- R375 사유 창(`askDelayReason`)과 R376 잠금(`isLockedCell`, `isDueDateLocked`)을 건드리지 마라. 둘 다 그대로 돈다.
- `dd-export.ts`와 `request-template.ts`를 건드리지 마라.
- 기존 행을 고치는 마이그레이션 코드를 쓰지 마라. 구분이 빈 행은 일반 납기로 선다.

## 검증

`npm run build` 한 번. 타입 오류가 없고 빌드가 끝나면 된다.

그다음 `git status --short`로 `src/routes/DevelopmentMasterSheet.tsx` 외에 바뀐 것이 없는지 본다.

화면 확인은 박향근이 한다.
