# R296 — DD MASTER 경고 규칙 재정비, REJECT 색 통일, FL 미등록 라벨

상태: 미착수. 설계 확정(2026-10-06 박향근).

경고가 남발돼 진짜 누락 건과 구분이 안 된다. 조건을 좁히고, REJECT를 종료건으로 취급해 색을 DROP과 맞춘다.

## 배경 수치

경고는 `ddWarnings`가 돌려주는 배열 하나로 끝난다. 행에 하나라도 있으면 Style No. 칸에 빨간 삼각형이 뜨고 툴팁에 전부 나열된다(`DevelopmentMasterSheet.tsx:3107`). 경고 7종 중 셋이 정상 상태를 경고로 칠하고 있다.

- `due`: Status만 보고 Received date를 안 본다. 행거가 도착했는데 FL 채번 전인 건이 계속 빨갛다. HOME의 임박·지연은 `derive.ts:324` `isScheduleOpen`에서 Received date가 있으면 닫힌 건으로 보므로 두 화면 기준이 다르다.
- `process`: 업체와 날짜 중 하나만 있으면 경고다. 업체를 먼저 적고 완료일을 나중에 적는 것이 정상 순서라, 공정이 진행되는 동안 늘 켜져 있다.
- `status`와 `fl`: 완료일이 있고 FL#이 없는 같은 상황에서 둘이 같이 뜬다.

## 하지 말 것

- `derive.ts`를 건드리지 마라. HOME 집계가 걸려 있다. `isScheduleOpen`은 그대로 둔다. R296은 `dd-workflow.ts`의 기준을 거기에 맞추는 것뿐이다.
- `DdWarning`의 `key` 유니온을 바꾸지 마라. 7개 그대로다. 라벨 문구만 바뀐다.
- `isAcceptableCellValue`, `updateRecordCell`, `CLOSED_STATUSES`, `DEAD_STATUSES`를 건드리지 마라. R297에서 다룬다.
- `recalculateDevelopmentRecords`를 건드리지 마라. 자동 완료 승격 규칙은 그대로다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/dd-workflow.ts` | `DD_STATUS_STYLE.REJECT` 색 교체, `isStoppedRecord` 추가, `ddWarnings` 본문 교체 |
| `src/routes/DevelopmentMasterSheet.tsx` | 257행 `FL 미입력` 문구를 `FL 미등록`으로 |

## 1. `src/data/dd-workflow.ts` — REJECT 색

14행을 찾는다.

```ts
  REJECT: { label: "REJECT", block: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/30", dot: "bg-rose-500", row: "border-l-rose-500" },
```

다음으로 교체한다. DROP(13행)과 색이 같아지고 글자만 다르다.

```ts
  // REJECT 는 반려로 끝난 종료건이다. 빨강은 "지금 조치가 필요하다"는 뜻이라 DROP 과 같은 회색으로 맞춘다(2026-10-06 박향근 확정).
  REJECT: { label: "REJECT", block: "bg-slate-500/15 text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-500/30", dot: "bg-slate-500", row: "border-l-slate-400" },
```

13행 DROP 은 손대지 않는다.

## 2. `src/data/dd-workflow.ts` — `isStoppedRecord` 추가

64행 `const identity = ...` 바로 아래에 넣는다.

```ts
/**
 * 사람이 멈춘 행인가. HOLD·DROP·REJECT 다.
 * 이 행들은 경고를 띄우지 않는다. 받을 것도 채울 것도 없는데 삼각형이 붙으면
 * 진짜로 빠뜨린 건과 섞여 경고 전체가 무의미해진다(2026-10-06 박향근 확정).
 * 판정 어휘는 `derive.ts` `isScheduleOpen` 과 같게 유지한다.
 */
const STOPPED_STATUSES = new Set(["HOLD", "보류", "DROP", "REJECT"])
export function isStoppedRecord(record: DevRecord): boolean {
  return STOPPED_STATUSES.has(normalizedStatus(record).replace(/\s+/g, ""))
}
```

## 3. `src/data/dd-workflow.ts` — `ddWarnings` 교체

143행부터 178행까지, 즉 `export function ddWarnings(` 부터 그 함수를 닫는 `}` 까지 전체를 다음으로 교체한다. 137행 `export interface DdWarning` 과 142행 주석은 그대로 둔다.

```ts
export function ddWarnings(record: DevRecord, today = new Date()): DdWarning[] {
  const warnings: DdWarning[] = []
  const status = normalizedStatus(record)
  const received = String(record.receivedDate ?? "").trim().length > 0

  // Fail 사유는 종료 행에서도 띄운다. REJECT 는 대개 FAIL 의 결과라, 사유가 비면
  // 왜 반려됐는지 나중에 추적할 길이 없다(2026-10-06 박향근 확정).
  if (record.tech?.passFail === "FAIL" && !record.tech.failReason) warnings.push({ key: "fail", label: "Fail 사유 미입력" })

  // HOLD·DROP·REJECT 는 여기서 끝낸다. 아래 경고는 모두 "지금 조치하라"는 뜻이다.
  if (isStoppedRecord(record)) return warnings

  // Style History 에 사유를 적었으면 FL 경고를 끈다.
  // "Matching RIB으로 등록 불필요"처럼 FL을 안 딴 이유가 기록된 건이다.
  const explained = String(record.tech?.styleHistory ?? "").trim().length > 0
  const flMissing = received && !isCompletedFlNo(record.flNo) && !explained
  if (flMissing) warnings.push({ key: "fl", label: record.flNo.trim() ? "FL 형식 확인" : "FL 미등록" })
  // FL 경고와 뿌리가 같다. 둘 다 띄우면 한 가지 일이 두 줄로 보인다.
  if (received && !flMissing && status !== "완료") warnings.push({ key: "status", label: "완료일 입력 · Status 확인" })

  // 행거가 도착한 건은 일정이 닫힌 것으로 본다. HOME 임박·지연(`derive.ts` `isScheduleOpen`)과 기준을 맞춘다.
  // Status 만 보면 FL 채번 전인 도착 건이 DD MASTER 에서만 계속 빨갛다.
  const due = toDate(record.dueDate)
  if (due && !received && status !== "완료" && dayValue(due) < dayValue(today)) warnings.push({ key: "due", label: "Due Date 경과" })

  if (record.tech?.arrangeNo && record.tech?.development?.co && record.tech.development.co !== "GD") warnings.push({ key: "arrange", label: "Arrange#는 GD만 입력" })

  // 날짜 열 아홉 개 전부를 본다. 예전에는 넷만 봐서 Request Date 와 공정 완료일의 오기재가 지나갔다.
  const dateCells: [string, unknown][] = [
    ["Request Date", record.requestDate],
    ["Due Date", record.dueDate],
    ["원사 완료일", record.tech?.processDates?.yarn],
    ["편직 완료일", record.tech?.processDates?.knitting],
    ["염색 완료일", record.tech?.processDates?.dyeing],
    ["가공 완료일", record.tech?.processDates?.finishing],
    ["Received date", record.receivedDate],
    ["FDS", record.tech?.sampleDates?.fds],
    ["YDS", record.tech?.sampleDates?.yds],
  ]
  const badDates = dateCells.filter(([, value]) => String(value ?? "").trim() && !isDateValue(value))
  if (badDates.length) {
    warnings.push({ key: "dateFormat", label: `${badDates.map(([name]) => name).join(", ")} 날짜 형식 아님` })
  }

  // 날짜가 있는데 업체가 빈 경우만 누락이다. 반대 방향(업체만 있음)은 공정이 진행 중인 정상 상태라
  // 경고로 잡으면 진행 중인 행 대부분에 삼각형이 붙는다(2026-10-06 박향근 확정).
  const pairs = [
    [record.tech?.mills?.yarn, record.tech?.processDates?.yarn],
    [record.tech?.mills?.knitting, record.tech?.processDates?.knitting],
    [record.tech?.mills?.dyeing, record.tech?.processDates?.dyeing],
    [record.tech?.mills?.finishing, record.tech?.processDates?.finishing],
  ]
  if (pairs.some(([mill, date]) => Boolean(date) && !mill)) warnings.push({ key: "process", label: "공정 완료일에 업체 미입력" })
  return warnings
}
```

## 4. `src/routes/DevelopmentMasterSheet.tsx` — FL 미등록

257행 `{ id: "flNo", ...` 안에 `FL 미입력` 이라는 문자열이 한 번 나온다. 그 문자열만 `FL 미등록` 으로 바꾼다. 같은 줄의 나머지는 손대지 않는다.

이 파일에서 다른 줄은 건드리지 않는다.

## 성공 기준

- `npm run build` 가 통과한다.
- `dd-workflow.ts` 에 `FL 미입력` 문자열이 남아 있지 않다. `grep -rn "FL 미입력" src/` 결과가 0건이다.
- `grep -rn "rose-500" src/data/dd-workflow.ts` 결과가 0건이다.
- `ddWarnings` 안에 `Boolean(mill) !== Boolean(date)` 가 남아 있지 않다.
- `git status --short` 에 위 두 파일만 M 으로 나온다.

## 제약

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset 이나 git checkout 으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라. 실패하면 고치고 다시 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- `legacy/`, `legacy-vanilla/`, `backup/` 을 읽지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.
- 마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
