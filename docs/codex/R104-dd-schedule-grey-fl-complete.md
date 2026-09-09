# R104 — DD MASTER 공정 지난 날짜 회색 처리와 완료 판정 기준 변경

상태: 미착수. 두 건은 서로 독립이다. 파일도 겹치지 않는다.

## 하지 말 것

- FL 채번 규칙이나 RDDA 집계를 건드리지 마라. 이번은 "완료로 볼지" 판정만 바꾼다.
  `rddaMonthFromFlNo`, `mergedFlRegistrations`, `src/data/derive.ts`를 열지 마라.
- 64열 수정 모달의 색을 바꾸지 마라. 그리드 셀만이다.
- `src/routes/Warehouse.tsx`와 `src/routes/FabricRequest.tsx`를 건드리지 마라.
- 새 상태값을 만들지 마라. `DD_STATUS_OPTIONS`는 그대로다.

---

## 1. 공정 SCHEDULE 지난 날짜 회색 처리

파일 `src/routes/DevelopmentMasterSheet.tsx` 하나만 고친다.

공정 SCHEDULE 그룹의 완료일 4열(`yarnStatus`, `knittingStatus`, `dyeingStatus`, `finishingStatus`)에서
값이 오늘보다 이전 날짜면 그 셀 배경을 회색으로 덮는다. 업체 열은 건드리지 않는다.

### 1-1. 상수 추가

266행 `COMPANY_COLOR_COLUMN_IDS` 선언 **바로 아래**에 넣는다. 현재 코드:

```ts
const COMPANY_COLOR_COLUMN_IDS = new Set(["co", "yarnMill", "knittingMill", "dyeingMill", "finishingMill"])
```

추가할 코드:

```ts
/** 공정 SCHEDULE 완료일 열. 오늘보다 이전이면 지나간 공정으로 보고 셀을 회색으로 덮는다. */
const SCHEDULE_DATE_COLUMN_IDS = new Set(["yarnStatus", "knittingStatus", "dyeingStatus", "finishingStatus"])
/** 회색 농도 50%. 30행 DIMMED_ROW_BG(24%)보다 진하다. 글자는 그대로 두고 배경만 덮는다. */
const PAST_SCHEDULE_BG = "color-mix(in srgb, var(--muted-foreground) 50%, var(--card))"
```

### 1-2. 셀 배경 적용

같은 파일 745행 근처, 스크롤 영역 셀 컴포넌트 안이다. 현재 코드:

```ts
  const companyValue = COMPANY_COLOR_COLUMN_IDS.has(column.id) ? String(column.value(record, ledger) ?? "").trim() : ""
  const companyColorStyle = companyValue && !sel.inRange
    ? { backgroundColor: `color-mix(in srgb, ${/gd/i.test(companyValue) ? "#a78bfa" : "#6ee7b7"} 18%, var(--card))` }
    : null
  const selectionStyle = { width, minWidth: width, boxShadow: selectionShadow(sel), cursor: sel.moveEdge ? "move" : undefined, ...moveStyle, ...companyColorStyle, ...dimStyle }
```

이렇게 바꾼다. `companyColorStyle` 다음, `dimStyle` 앞에 끼운다.
행 전체 회색(`dimStyle`)이 이겨야 하므로 순서를 지킨다.

```ts
  const companyValue = COMPANY_COLOR_COLUMN_IDS.has(column.id) ? String(column.value(record, ledger) ?? "").trim() : ""
  const companyColorStyle = companyValue && !sel.inRange
    ? { backgroundColor: `color-mix(in srgb, ${/gd/i.test(companyValue) ? "#a78bfa" : "#6ee7b7"} 18%, var(--card))` }
    : null
  // 공정 완료일이 오늘보다 이전이면 지나간 공정이다. 남은 공정만 눈에 들어오게 회색으로 덮는다.
  const scheduleDate = SCHEDULE_DATE_COLUMN_IDS.has(column.id) ? toDate(column.value(record, ledger)) : null
  const pastScheduleStyle = scheduleDate && !sel.inRange
    && scheduleDate.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)
    ? { backgroundColor: PAST_SCHEDULE_BG }
    : null
  const selectionStyle = { width, minWidth: width, boxShadow: selectionShadow(sel), cursor: sel.moveEdge ? "move" : undefined, ...moveStyle, ...companyColorStyle, ...pastScheduleStyle, ...dimStyle }
```

`toDate`는 16행에서 이미 import되어 있다. 새로 import하지 마라.

**주의.** `Date.prototype.setHours`는 값을 바꾸면서 타임스탬프를 돌려준다.
`scheduleDate`는 이 줄에서 버려지는 지역 변수라 문제가 없지만, 다른 곳에서 재사용하도록 고치지 마라.

---

## 2. 완료 판정을 유효 FL# 기준으로

파일 `src/data/dd-workflow.ts` 하나만 고친다.

지금은 `record.flNo`에 아무 글자나 있으면 완료로 본다. "확인중", "FL 대기" 같은 메모가 들어간 칸도 완료가 된다.
앞으로는 **`FL` + 숫자 8자리** 형식만 완료로 인정한다. 한글이나 다른 글자가 섞이면 완료가 아니다.

### 2-1. 판정 함수 추가

`DD_PASS_FAIL_OPTIONS` 선언(44행) 아래에 넣는다.

```ts
/**
 * 완료로 인정하는 FL 번호인지 본다. 공백을 걷고 대문자로 맞춘 뒤 FL + 숫자 8자리만 통과시킨다.
 * "확인중", "FL 대기" 같은 메모가 들어간 칸을 완료로 올리지 않기 위한 것이다.
 * 채번 규칙(`FL+YY+MM+4자리`)과 자릿수가 같다. RDDA 집계 기준은 건드리지 않는다.
 */
export function isCompletedFlNo(flNo: string | undefined): boolean {
  return /^FL\d{8}$/.test(String(flNo ?? "").replace(/\s+/g, "").toUpperCase())
}
```

### 2-2. `recalculateDevelopmentRecords` 안의 판정 교체

`records.map((record) => {` 블록 안이다. 현재 코드:

```ts
    const hasStyleNo = Boolean(record.styleNo.normalize("NFKC").trim())
    const processDates = record.tech?.processDates
    const processReached = {
      yarn: Boolean(record.flNo) || reached(processDates?.yarn, today),
      knitting: Boolean(record.flNo) || reached(processDates?.knitting, today),
      dyeing: Boolean(record.flNo) || reached(processDates?.dyeing, today),
      finishing: Boolean(record.flNo) || reached(processDates?.finishing, today),
    }
    const stage = hasStyleNo
      ? record.flNo
        ? "완료"
```

이렇게 바꾼다.

```ts
    const hasStyleNo = Boolean(record.styleNo.normalize("NFKC").trim())
    // 완료 판정은 결과 RESULT의 FL#이 형식에 맞을 때만이다. 메모가 적힌 칸은 완료가 아니다.
    const flDone = isCompletedFlNo(record.flNo)
    const processDates = record.tech?.processDates
    const processReached = {
      yarn: flDone || reached(processDates?.yarn, today),
      knitting: flDone || reached(processDates?.knitting, today),
      dyeing: flDone || reached(processDates?.dyeing, today),
      finishing: flDone || reached(processDates?.finishing, today),
    }
    const stage = hasStyleNo
      ? flDone
        ? "완료"
```

그 아래 `: processReached.finishing ? "가공"` 부터는 그대로 둔다.

### 2-3. devStatus 자동 판정 교체

같은 함수 끝부분이다. 현재 코드:

```ts
    // FDS 수취 날짜가 들어오면 완료로 올린다. HOLD·DROP·REJECT는 사람이 정한 상태라 유지한다.
    const currentStatus = normalizedStatus(record)
    const devStatus = String(record.tech?.sampleDates?.fds ?? "").trim() && (!currentStatus || currentStatus === "진행중")
      ? "완료"
      : record.devStatus
```

이렇게 바꾼다. **올리는 것과 내리는 것 양쪽 다 FL# 기준이다.**

```ts
    // 완료 판정 기준은 결과 RESULT의 FL# 하나다. FDS 날짜로 올리던 규칙을 대신한다.
    // HOLD·DROP·REJECT는 사람이 정한 상태라 손대지 않는다.
    const currentStatus = normalizedStatus(record)
    const autoStatus = !currentStatus || currentStatus === "진행중" || currentStatus === "완료"
    const devStatus = autoStatus
      ? flDone ? "완료" : currentStatus === "완료" ? "진행중" : record.devStatus
      : record.devStatus
```

### 2-4. FL 미입력 경고를 같은 기준으로

같은 파일 `ddWarnings` 안이다. 현재 코드:

```ts
  if (record.receivedDate && !record.flNo.trim() && status !== "DROP") warnings.push({ key: "fl", label: "FL 미입력" })
```

이렇게 바꾼다.

```ts
  if (record.receivedDate && !isCompletedFlNo(record.flNo) && status !== "DROP") {
    warnings.push({ key: "fl", label: record.flNo.trim() ? "FL 형식 확인" : "FL 미입력" })
  }
```

### 2-5. FL# 셀에 형식 오류 표시

파일 `src/routes/DevelopmentMasterSheet.tsx` 219행이다. 왜 완료가 안 되는지 화면에서 보이게 한다. 현재 코드:

```ts
      { id: "flNo", label: "FL#", width: 81, mono: true, value: (row) => row.flNo, render: (row) => row.flNo ? <span className="font-mono">{row.flNo}</span> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미입력</span> : "" },
```

이렇게 바꾼다.

```ts
      { id: "flNo", label: "FL#", width: 81, mono: true, value: (row) => row.flNo, render: (row) => row.flNo.trim() ? <span className={`font-mono ${isCompletedFlNo(row.flNo) ? "" : "text-[var(--destructive)]"}`} title={isCompletedFlNo(row.flNo) ? undefined : "FL + 숫자 8자리 형식만 완료로 인정합니다"}>{row.flNo}</span> : ddWarnings(row).some((item) => item.key === "fl") ? <span className="text-[var(--destructive)]">FL 미입력</span> : "" },
```

`isCompletedFlNo`를 이 파일의 `@/data/dd-workflow` import 목록에 더한다.
그 import 줄은 `ddCategoryTextClass`, `ddWarnings`, `DD_STATUS_OPTIONS` 등이 있는 곳이다.

---

## 검증

```
npm run build
git status --short
```

성공 기준.

1. `npm run build` 통과. `tsc --noEmit`이 포함되어 있다.
2. `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx`, `src/data/dd-workflow.ts`,
   그리고 이 지시서만 새로 뜬다. 이미 수정 상태인 다른 파일은 그대로 둔다.
3. `src/data/derive.ts`와 `src/data/fabric-ledger.ts`가 수정 목록에 없다.

화면 확인은 사용자가 한다.
