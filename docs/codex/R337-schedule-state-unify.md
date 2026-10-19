# R337 지연·임박 판정을 HOME 기준으로 통일

상태: 미착수. 설계 확정, 사전 측정 완료, 코드 미수정.

데이터 안전 보완 3묶음의 3-2다. 선행 작업 R336(동기화 빈 값 보호)은 커밋 `8ad3272`로 끝났다.

고치는 파일은 둘이다. `src/data/derive.ts`와 `src/routes/Development.tsx`.

## 무엇이 어긋나 있나

같은 행을 두 기준이 다르게 읽는다.

- HOME 기준은 `derive.ts`의 `isScheduleOpen`(324행 부근)이다. **Received date(실물 행거 도착)가 있으면 일정이 닫힌 것으로 본다.** HOLD·DROP·REJECT는 뺀다. 임박은 D-0에서 D-7, 지연은 기한 경과다(`homeKpiRecordDetails`, 995행 부근).
- DEVELOPMENT 하위 목록과 담당 레인은 `statusOf`(450행)를 쓴다. 완료를 **FL# 존재**로 보고 Received date를 안 본다. 임박 창도 D-0에서 D-3으로 좁다.

그래서 Received date가 들어왔는데 FL 채번 전인 행이 HOME에서는 끝난 건인데 하위 목록에서는 계속 지연으로 뜬다. 반대로 FL#만 있고 실물이 안 온 행은 하위 목록에서 완료로 빠진다.

## 설계

**`statusOf`의 완료 규칙은 그대로 둔다.** 화면 완료 기준은 FL#이라는 팀 결정이 있다. 대신 일정 판정을 **별도 함수로 분리**해서 업무 상태와 일정 상태를 독립적으로 계산한다.

`statusOf` 안에 일정 게이트를 끼워 넣는 식으로 고치지 마라. `statusOf`는 FL#과 완료 상태에서 먼저 반환하므로, 그 아래에 무엇을 붙여도 **FL# 있음·Received 없음** 행은 계속 일정에서 빠진다.

## 조치 1. `derive.ts`에 일정 판정 함수 두 개 추가

`statusOf`(450행) 바로 아래에 둔다. 둘 다 `export`한다.

```ts
export type ScheduleState = "closed" | "late" | "due" | "open"

/**
 * 일정 상태. HOME 임박·지연과 같은 기준 하나다(R337).
 * 완료 판정(`statusOf`)과 독립이다. FL#이 있어도 실물이 안 왔으면 일정은 열려 있다.
 * 임박 창은 D-0에서 D-7이다. HOME(`homeKpiRecordDetails`)과 같은 창을 쓴다.
 */
export function scheduleStateOf(record: DevRecord, today = new Date()): ScheduleState {
  if (!isScheduleOpen(record)) return "closed"
  const remaining = daysLeft(record.dueDate, today)
  if (remaining === null) return "open"
  if (remaining < 0) return "late"
  if (remaining <= 7) return "due"
  return "open"
}

/**
 * 화면 뱃지와 상태 필터가 함께 쓰는 한 단어 판정(R337).
 * 우선순위는 멈춤, 지연, 임박, 완료, 진행이다.
 * **지연이 완료보다 앞선다.** FL#이 찍혔다고 완료로 보이면 실물이 안 온 지연 건을 놓친다.
 */
export function displayStatusOf(record: DevRecord, today = new Date()): StatusKey {
  const base = statusOf(record, today)
  if (base === "hold") return "hold"
  const schedule = scheduleStateOf(record, today)
  if (schedule === "late") return "late"
  if (schedule === "due") return "due"
  return base === "done" ? "done" : "progress"
}
```

`isScheduleOpen`은 같은 파일 안의 모듈 지역 함수다. **export로 바꾸지 말고 그대로 쓴다.** `daysLeft`는 이미 `./format`에서 가져와 있다. `StatusKey`도 이미 가져와 있다.

## 조치 2. `kpis`의 지연·임박을 일정 기준으로 바꾸기

`derive.ts` 603행 `kpis`다. 현재는 `statusOf` 하나로 네 값을 다 센다.

바꾼 뒤 모습이다.

```ts
export function kpis(records: readonly DevRecord[], today = new Date()): KpiSummary {
  let progress = 0
  let done = 0
  let late = 0
  let dueSoon = 0
  for (const record of records) {
    // 업무 상태와 일정 상태를 따로 센다(R337). 한 행이 완료이면서 지연일 수 있다.
    if (statusOf(record, today) === "done") done++
    else progress++
    const schedule = scheduleStateOf(record, today)
    if (schedule === "late") late++
    else if (schedule === "due") dueSoon++
  }
  return { total: records.length, progress, done, late, dueSoon }
}
```

`total = progress + done`은 그대로 성립한다. `late`와 `dueSoon`은 이제 그 둘과 겹칠 수 있는 별도 집계다.

**`progress`의 현재 셈법을 고치지 마라.** 지금 `progress`는 HOLD·DROP·REJECT까지 센다. 별개 문제이고 이번 범위가 아니다.

이 변경이 `subpageCardStats`(655행, `kpis`를 재사용)와 `weeklyLines`(1713행, HOME 주간보고 2줄)에 같이 반영된다. 그 두 함수는 직접 고치지 않는다.

## 조치 3. `laneUrgency`를 같은 기준으로

`derive.ts` 500행 부근이다.

```ts
function laneUrgency(record: DevRecord, today: Date): LaneUrgency {
  // 일정 판정 하나만 본다(R337). 예전에는 statusOf의 late와 D-0을 danger로 묶었다.
  const schedule = scheduleStateOf(record, today)
  if (schedule === "late") return "danger"
  if (schedule === "due") return "soon"
  return "normal"
}
```

D-0이 danger에서 soon으로 옮겨진다. 측정일 기준 해당 건이 0건이라 당장 눈에 띄는 변화는 없다.

`ownerLaneBoard`가 `isInProgress`로 대상을 먼저 거르는 것은 **그대로 둔다.** 레인 대상 범위를 넓히는 것은 다음 단계다.

## 조치 4. `Development.tsx`

`src/routes/Development.tsx`다.

**4-1. 상태 필터**(134행 부근 `matchesStatusFilter`).

```ts
const matchesStatusFilter = (row: DevRecord, filter: StatusFilter, today: Date): boolean => {
  if (filter === "all") return true
  if (filter === "done") return isDoneThisYear(row, today)
  return displayStatusOf(row, today) === filter
}
```

`statusOf`를 `displayStatusOf`로 바꾸는 것이 전부다. 완료 분기는 손대지 않는다.

**4-2. 상태 뱃지 네 곳.** 649행, 1438행(표 열 정의 두 곳), 1260행, 1295행(상세 패널)의 `statusOf(` 호출을 `displayStatusOf(`로 바꾼다. 인자와 나머지 코드는 그대로다. 1295행은 `resolvedRecord.devStatus || STATUS[...]` 형태라 `||` 왼쪽을 건드리지 않는다.

**4-3. 임박 카드 문구**(1496행). `caption="납기까지 3일 이내"`를 `caption="납기까지 7일 이내"`로 바꾼다. 같은 줄 `info` 문구는 이미 D-7 분포를 말하고 있으므로 그대로 둔다.

`Development.tsx`의 import 줄에 `displayStatusOf`를 더한다. `statusOf` import는 남는 호출이 없으면 지운다. 남아 있으면 그대로 둔다.

## 하지 말 것

- `statusOf`의 본문을 고치지 마라. 완료 판정이 바뀌면 완료 라이브러리, 공정 분포, HOME 분포, 담당 할 일 목록까지 한꺼번에 움직인다.
- `isDoneThisYear`를 고치지 마라. 당해년도 완료 카드는 지금 기준 그대로다.
- `src/data/weekly-report.ts`를 열지 마라. 거기 `statusOf`는 같은 이름의 **파일 안 지역 함수**이고 `derive.ts`와 무관하다. DD MASTER 주간 보고 숫자는 이번 변경에 영향받지 않아야 한다.
- `homeKpiRecordDetails`, `scheduleAlerts`, `isScheduleOpen`을 고치지 마라. 이쪽이 기준이다.
- `fiveStageIndex`, `completedLibrary`, `homeKpiDetails`, 담당 할 일 목록(1640행 부근)의 `statusOf` 호출은 전부 완료 여부만 보는 자리다. 손대지 마라.
- `ownerLaneBoard`의 `isInProgress` 거르기를 없애지 마라.
- 새 UI 컴포넌트나 칩을 만들지 마라. 뱃지는 기존 `StatusBadge` 그대로다.

## 검증

```
npm run build
git status --short
```

- 빌드가 통과해야 한다(`tsc --noEmit` 포함).
- `git status --short`에 `src/data/derive.ts`와 `src/routes/Development.tsx` 두 줄만 보여야 한다.
- 화면 숫자 대조는 지시자가 따로 한다. 측정용 스크립트를 만들지 마라.

### 참고용 기준값(지시자가 2026-10-19 데이터로 미리 쟀다)

| 항목 | 현재 | 변경 후 기대 |
|---|---|---|
| 임박 | 3 | 7 |
| 지연 | 2 | 2 |
| DD 전체 행 | 198 | 198 |
| 당해년도 완료 | 87 | 87 |
| 레인 대상(`isInProgress`) | 85 | 85 |

아래 셋은 바뀌면 안 된다. 바뀌면 완료 판정을 건드린 것이다.

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
