# R375 납기가 받은 약속인지 우리가 정한 것인지 가른다

상태: 미착수. 설계는 확정됐다.

## 배경

Due Date는 두 종류인데 지금 한 칸에 섞여 있다. 자체 개발은 우리가 임의로 정한다. 사업부나 통합원단부 1팀 샘플은 **지정된 납기가 있다.** 적고 나면 어느 쪽인지 구별할 길이 없다.

2026-10-30에 박향근에게 확인했다. 지정 납기는 **의뢰서가 아니라 메일이나 구두로** 온다. 그래서 REQUEST 양식(`request-template.ts`)에 납기 열을 더하는 길은 쓰지 않는다. 더해도 비어 있을 칸이다. DD에서 담당자가 고른다.

## 설계

Due Date 오른쪽에 좁은 구분 칸 하나를 둔다. 값은 빈칸과 `지정` 둘이다. 비어 있으면 자체 설정이다.

구분해서 하는 일은 하나다. **지정 납기를 뒤로 미루면 사유 창을 띄우고 `scheduleLog`에 남긴다.** 자체 납기는 지금처럼 그냥 바뀐다.

사유 기록 자리는 이미 있다. R368이 만든 `DdScheduleChange.field`가 `"dueDate" | DdProcess`인데 `"dueDate"`로 부르는 곳이 없어 놀고 있다. 공정 목표일이 쓰는 `appendScheduleChange`를 그대로 재사용한다.

## 파일별 조치

| 파일 | 줄 | 조치 |
|---|---|---|
| `src/data/schema.ts` | `DevTechnical` | `dueDateFixed?: string` 필드 추가 |
| `src/routes/DevelopmentMasterSheet.tsx` | 317 | Due Date `render`에 굵게 표시 |
| `src/routes/DevelopmentMasterSheet.tsx` | 317 다음 줄 | `dueDateFixed` 열 추가 |
| `src/routes/DevelopmentMasterSheet.tsx` | 818~ | `TECH_PATHS`에 경로 추가 |
| `src/routes/DevelopmentMasterSheet.tsx` | 3155 | `reasonPrompt` 타입을 `field`로 넓힘 |
| `src/routes/DevelopmentMasterSheet.tsx` | 3166~3175 | `askDelayReason`에 납기 분기 |
| `src/routes/DevelopmentMasterSheet.tsx` | 3179~3193 | `saveReason`이 `field`를 넘김 |
| `src/routes/DevelopmentMasterSheet.tsx` | 3696~3698 | 사유 창 제목과 문구 분기 |

### 1. `src/data/schema.ts`의 `DevTechnical`

`project?: string`이 있는 자리 근처, 같은 최상위 깊이에 더한다.

```ts
  /** 납기 구분(R375). `"지정"`이면 사업부나 1팀이 준 납기다. 비면 우리가 정한 값이다. */
  dueDateFixed?: string
```

### 2. Due Date 열 `render` (317행)

현재:

```tsx
      { id: "dueDate", label: "Due Date", width: 76, date: true, value: (row) => row.dueDate, render: (row) => <span className={ddWarnings(row).some((item) => item.key === "due") ? "text-[var(--destructive)]" : ""}>{dateText(row.dueDate)}</span> },
```

교체(이 줄을 아래 두 줄로 바꾼다):

```tsx
      { id: "dueDate", label: "Due Date", width: 76, date: true, value: (row) => row.dueDate, render: (row) => <span className={`${ddWarnings(row).some((item) => item.key === "due") ? "text-[var(--destructive)]" : ""} ${row.tech?.dueDateFixed === "지정" ? "font-semibold" : ""}`} title={row.tech?.dueDateFixed === "지정" ? "지정 납기입니다" : undefined}>{dateText(row.dueDate)}</span> },
      { id: "dueDateFixed", label: "납기 구분", width: 64, align: "center", value: (row) => row.tech?.dueDateFixed ?? "", options: ["", "지정"] },
```

**색을 새로 주지 마라.** 그 칸의 빨강은 이미 납기 경과 경고(`ddWarnings`의 `due`)다. 겹치면 둘 다 안 읽힌다. 굵게만 한다.

`request` 그룹에 넣는 것이 중요하다. `INTAKE_REQUEST`(548행)가 그 그룹의 열을 그대로 쓰므로 신규 작지 접수 창에도 자동으로 따라온다. 접수 때 납기를 치면서 같이 고르는 자리다.

### 3. `TECH_PATHS` (818행 블록)

`project: ["project"],` 줄 옆에 더한다.

```ts
  dueDateFixed: ["dueDateFixed"],
```

### 4. `reasonPrompt` 타입 (3155행)

현재:

```ts
  const [reasonPrompt, setReasonPrompt] = useState<{ rowKey: string; process: DdProcess; before: string; after: string } | null>(null)
```

교체:

```ts
  const [reasonPrompt, setReasonPrompt] = useState<{ rowKey: string; field: "dueDate" | DdProcess; before: string; after: string } | null>(null)
```

### 5. `askDelayReason` (3166~3175행)

현재:

```ts
  const askDelayReason = (record: DevRecord, column: MasterColumn, raw: string) => {
    const process = TARGET_PROCESS_BY_COLUMN[column.id]
    if (!process) return
    const before = String(record.tech?.targetDates?.[process] ?? "").trim()
    const after = normalizeDateInput(raw).trim()
    if (!before || !after || after <= before) return
    setReasonCode(`${process}Late` as DdDelayReason)
    setReasonMemo("")
    setReasonPrompt({ rowKey: scheduleRowKey(record), process, before, after })
  }
```

교체:

```ts
  const askDelayReason = (record: DevRecord, column: MasterColumn, raw: string) => {
    const after = normalizeDateInput(raw).trim()
    // 지정 납기를 뒤로 미룰 때만 묻는다(R375). 자체 납기는 우리가 정한 값이라 그냥 바뀐다.
    if (column.id === "dueDate") {
      if (record.tech?.dueDateFixed !== "지정") return
      const before = String(record.dueDate ?? "").trim()
      if (!before || !after || after <= before) return
      // 납기에 맞는 기본 사유가 없다. `other`로 열어 메모를 받는다.
      // 지정 납기를 미루는 일은 드물고, 그때는 설명이 남는 편이 맞다.
      setReasonCode("other")
      setReasonMemo("")
      setReasonPrompt({ rowKey: scheduleRowKey(record), field: "dueDate", before, after })
      return
    }
    const process = TARGET_PROCESS_BY_COLUMN[column.id]
    if (!process) return
    const before = String(record.tech?.targetDates?.[process] ?? "").trim()
    if (!before || !after || after <= before) return
    setReasonCode(`${process}Late` as DdDelayReason)
    setReasonMemo("")
    setReasonPrompt({ rowKey: scheduleRowKey(record), field: process, before, after })
  }
```

### 6. `saveReason` (3186행 근처)

`field: prompt.process`를 `field: prompt.field`로 바꾼다. 나머지는 그대로다.

### 7. 사유 창 제목과 문구 (3696~3698행)

현재:

```tsx
          <DialogTitle>목표일을 미룬 사유</DialogTitle>
          <DialogDescription>
            {reasonPrompt ? `${SCHEDULE_PROCESS_LABEL[reasonPrompt.process]} 목표를 ${dateText(reasonPrompt.before)}에서 ${dateText(reasonPrompt.after)}로 미뤘습니다.` : ""}
          </DialogDescription>
```

교체:

```tsx
          <DialogTitle>{reasonPrompt?.field === "dueDate" ? "납기를 미룬 사유" : "목표일을 미룬 사유"}</DialogTitle>
          <DialogDescription>
            {reasonPrompt
              ? reasonPrompt.field === "dueDate"
                ? `지정 납기를 ${dateText(reasonPrompt.before)}에서 ${dateText(reasonPrompt.after)}로 미뤘습니다.`
                : `${SCHEDULE_PROCESS_LABEL[reasonPrompt.field]} 목표를 ${dateText(reasonPrompt.before)}에서 ${dateText(reasonPrompt.after)}로 미뤘습니다.`
              : ""}
          </DialogDescription>
```

`SCHEDULE_PROCESS_LABEL[reasonPrompt.field]`는 `field`가 `"dueDate"`가 아닌 가지 안에 있어야 타입이 맞는다.

## 하지 말 것

- **`dd-export.ts`에 `dueDateFixed`를 넣지 마라.** 담당자 DD 양식을 재현하는 자리다. `Project`, COST 3열, FDS·YDS 날짜, 목표일과 같은 웹 전용 값이다.
- `request-template.ts`(의뢰 양식)를 건드리지 마라. 지정 납기는 의뢰서를 타지 않는다.
- `INTAKE_REQUIRED_IDS`에 `dueDateFixed`를 더하지 마라. 구분은 선택이다. 필수로 만들면 자체 개발 건까지 매번 고르게 된다.
- Due Date 칸에 새 색을 주지 마라. 빨강은 납기 경과 경고가 쓴다.
- 납기를 **앞당길 때** 사유를 묻지 마라. 공정 목표일과 같은 규칙이다. 처음 채우는 것도 묻지 않는다.
- 저장을 막지 마라. 날짜는 먼저 저장되고 사유는 뒤따르는 기록이다.
- `appendScheduleChange`와 `scheduleRowKey`의 구현을 고치지 마라. 부르기만 한다.
- `dd-schedule.ts`의 `DdDelayReason` 목록에 값을 더하지 마라. 기존 여덟 값으로 받는다.
- 마이그레이션 코드를 쓰지 마라. 기존 행은 구분이 빈 채로 자체 설정으로 선다.

## 검증

`npm run build` 한 번. 타입 오류가 없고 빌드가 끝나면 된다.

그다음 `git status --short`로 위 두 파일 외에 바뀐 것이 없는지 본다.

화면 확인은 박향근이 한다.
