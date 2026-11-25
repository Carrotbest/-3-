# R452 — DD 옵션 진행률이 한 패스에서 수렴하게 만들기

상태: 구현 완료. `npm run build` 통과, 저장소 밖 하네스 8건 전부 통과. 화면 확인 대기.

## 무엇이 틀렸나

`src/data/dd-workflow.ts` 의 `recalculateDevelopmentRecords` 가 한 번 돌아서는 수렴하지 않는다. 그래서 DD MASTER 의 옵션 진행률(`tech.optionProgress`, 화면의 "완료 수 / 전체")이 한 박자 늦게 맞는다.

같은 함수 안에서 두 가지가 같은 패스에 일어난다.

1. 함수 앞부분(163행)에서 Style No. 별로 묶은 뒤 `done = sorted.filter((record) => normalizedStatus(record) === "완료").length` 로 완료 수를 세고 `optionProgress` 를 `${done} / ${sorted.length}` 로 만든다.
2. 함수 뒷부분 `records.map` 안(202~205행)에서 유효한 FL# 이 들어온 행의 `devStatus` 를 "완료" 로 올린다.

1번이 2번보다 먼저 돌아서 **이번 패스에 완료로 올라간 행이 완료 수에 안 들어간다.** FL# 을 처음 넣어 저장한 직후에는 "0 / 2" 로 보이다가, 그 Style 을 다시 저장할 때가 되어야 "1 / 2" 가 된다.

R447 이전부터 있던 문제다. R447 이 만든 것이 아니다.

## 재현 근거 수치 (수정 전 실측)

입력 5행. ST-1 두 행(1행은 유효 FL# + Status 진행중, 2행은 FL 없음 + 진행중), ST-2 세 행(HOLD + 유효 FL#, DROP + 유효 FL#, 사람이 고른 완료 + FL 없음).

```
1회 optionProgress: 0 / 2 | 0 / 2 | 1 / 3 | 1 / 3 | 1 / 3
2회 optionProgress: 1 / 2 | 1 / 2 | 1 / 3 | 1 / 3 | 1 / 3
1회 devStatus     : 완료 | 진행중 | HOLD | DROP | 완료
2회 devStatus     : 완료 | 진행중 | HOLD | DROP | 완료
```

`devStatus` 는 1회에 이미 맞다. 틀리는 것은 `optionProgress` 하나다. ST-2 가 양쪽 다 `1 / 3` 인 것은 그 완료가 **원래부터 있던** 사람이 고른 완료라 1번이 이미 세기 때문이다. 즉 어긋나는 것은 **그 패스에서 올라간 완료**뿐이다.

수정 후 기대값은 1회와 2회가 모두 `1 / 2 | 1 / 2 | 1 / 3 | 1 / 3 | 1 / 3` 이다.

## 조치

파일 하나다. `src/data/dd-workflow.ts`.

### 1. 상태 정규화를 두 갈래로 연다 (106행)

지금:

```ts
const normalizedStatus = (record: DevRecord): string => String(record.devStatus ?? "").trim().toUpperCase()
```

바꿀 것:

```ts
const normalizedStatusText = (status: string | undefined): string => String(status ?? "").trim().toUpperCase()
const normalizedStatus = (record: DevRecord): string => normalizedStatusText(record.devStatus)
```

레코드가 아니라 상태 문자열만 들고 정규화할 자리가 생겨서다. **정규화 규칙을 복사해 쓰지 말 것.** 두 곳이 되면 어긋난다.

### 2. 완료 판정을 함수 하나로 뽑는다 (`recalculateDevelopmentRecords` 바로 위, 147행 근처)

`records.map` 안에 펴져 있던 Status 올리기 식을 모듈 레벨 함수로 올린다. **지금 `recalculateDevelopmentRecords` 안 199~201행에 있는 주석 세 줄("자동으로는 올리기만 한다" 로 시작하는 것)을 글자 그대로 이 함수의 주석으로 옮긴다. 지우지 말 것.** R298 규칙의 근거다.

```ts
/**
 * 이번 계산에서 정해질 DD Status. 그룹을 묶기 전에 한 번 돌려 각 행의 최종 값을 먼저 정한다(R452).
 * 옵션 진행률이 그 패스에서 올라간 완료까지 세야 해서다.
 *
 * 자동으로는 올리기만 한다. 유효한 FL#이 들어오면 완료로 올린다.
 * **사람이 고른 상태는 절대 내리지 않는다.** FL 없이 YDS만 입고해 두는 경우가 있어
 * 수동 완료를 그대로 둬야 한다. HOLD·DROP·REJECT도 같은 이유로 유지한다.
 */
function resolvedDevStatus(record: DevRecord): string | undefined {
  const currentStatus = normalizedStatus(record)
  return isCompletedFlNo(record.flNo) && (!currentStatus || currentStatus === "진행중")
    ? "완료"
    : record.devStatus
}
```

판정식은 **지금 코드와 글자까지 같다.** 자리만 옮기는 것이다. 조건을 손보지 말 것.

### 3. 그룹을 묶기 전에 한 패스 돌린다

`const groups = new Map...` 바로 앞(149행)에 넣는다.

```ts
  // 완료 판정을 그룹보다 먼저 돌린다(R452). 예전에는 그룹에서 done을 센 뒤 아래 map에서 완료로 올려,
  // FL#을 처음 넣어 저장한 직후에는 "0 / 2"로 보이다가 그 Style을 다시 저장할 때에야 "1 / 2"가 됐다.
  // 같은 입력으로 두 번 불러야 수렴했다. **순서를 되돌리지 말 것.**
  const statuses = new Map<string, string | undefined>()
  records.forEach((record) => statuses.set(identity(record), resolvedDevStatus(record)))
```

### 4. `done` 을 그 값으로 센다 (163행)

지금:

```ts
    const done = sorted.filter((record) => normalizedStatus(record) === "완료").length
```

바꿀 것:

```ts
    const done = sorted.filter((record) => normalizedStatusText(statuses.get(identity(record))) === "완료").length
```

### 5. `records.map` 안의 Status 식을 교체한다 (199~205행)

지금:

```ts
    // 자동으로는 올리기만 한다. 유효한 FL#이 들어오면 완료로 올린다.
    // **사람이 고른 상태는 절대 내리지 않는다.** FL 없이 YDS만 입고해 두는 경우가 있어
    // 수동 완료를 그대로 둬야 한다. HOLD·DROP·REJECT도 같은 이유로 유지한다.
    const currentStatus = normalizedStatus(record)
    const devStatus = flDone && (!currentStatus || currentStatus === "진행중")
      ? "완료"
      : record.devStatus
```

바꿀 것(주석 세 줄은 2번 함수로 옮겨 갔으므로 여기서는 뺀다):

```ts
    // 판정은 위 resolvedDevStatus 하나다. 여기서 다시 세우지 말 것(R452).
    const devStatus = statuses.get(identity(record)) ?? record.devStatus
```

`flDone` 변수 자체는 그대로 둔다. 바로 위 `processReached` 와 `stage` 가 쓰고 있다.

## 하지 말 것

- **R298 규칙을 깨지 말 것.** `stage` 와 `devStatus` 는 자동으로 내려가지 않는다. 유효한 FL# 이 들어오면 완료로 **올리기만** 하고, 사람이 고른 완료, HOLD, DROP, REJECT 는 그대로 둔다. 판정식(`isCompletedFlNo(record.flNo)` 와 `(!currentStatus || currentStatus === "진행중")`)을 손보지 말 것. 자리만 옮긴다.
- **R447 빠른 경로(`if (unchanged) return record`)를 건드리지 말 것.** 안 바뀐 행은 입력 객체를 그대로 돌려줘야 DD MASTER 의 `GridCell` memo 가 산다. 그 비교에 있는 `record.processReached !== undefined` 와 `record.tech !== undefined` 두 줄도 반드시 남긴다. 지금 코드가 그런 행에 두 객체를 새로 붙여 주기 때문이다.
- **`normalizedStatus` 를 지우지 말 것.** 같은 파일 `ddWarnings` 와 `stoppedStatusLabel` 이 쓴다.
- **`done` 을 `normalizedStatus(record)` 와 "이번 패스에서 완료가 될 행" 두 조건의 OR 로 세는 방식을 쓰지 말 것.** 판정이 두 곳이 되어 한쪽만 고치고 지나가기 쉽다. 이 지시서는 그래서 전자(먼저 정하고 그 값으로 세기)를 고른 것이다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라. 이 워킹트리에는 커밋되지 않은 성능 수정(R446~R451)이 11개 파일에 걸쳐 들어 있다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 파일을 삭제하지 마라. 고치는 파일은 `src/data/dd-workflow.ts` 하나다.
- 테스트 파일을 저장소 안에 만들지 마라. 검증은 클로드가 저장소 밖에서 한다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다.

그 밖의 검증(수렴, 빠른 경로, R298 유지)은 클로드가 저장소 밖 하네스로 한다. Codex 는 하지 않는다.
