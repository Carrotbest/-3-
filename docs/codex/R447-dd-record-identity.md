# R447 — 재계산이 안 바뀐 행은 같은 객체로 돌려준다

상태: 미착수. R446(성능 즉시 3건)이 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

고치는 파일은 둘이다.

| 파일 | 조치 |
|---|---|
| `src/data/dd-workflow.ts` | `recalculateDevelopmentRecords` 의 `records.map` 끝에서, 계산값이 전과 같으면 **입력 `record` 를 그대로** 돌려준다 |
| `src/data/audit.ts` | `diffByKey` 에 `old === item` 조기 반환을 넣는다 |

다른 파일은 열지 마라.

---

## 0. 무엇이 문제인가

`src/data/dd-workflow.ts` 의 `recalculateDevelopmentRecords` 가 마지막에 이렇게 끝난다.

```ts
    return { ...record, devStatus, opt: hasStyleNo ? formula?.opt ?? record.opt : "", stage, processReached, tech }
```

**조건 없이 모든 행을 새 객체로 만든다.** `processReached` 와 `tech` 도 새 객체다.

이 함수는 셀 하나를 고칠 때마다 전체 행에 대해 돈다(`src/store/useAppStore.ts` 의 `writeDevelopmentRecords`, `recalculateDevelopmentRecords(records)`). 그래서 셀 하나를 고치면 **안 건드린 행까지 전부 참조가 바뀐다.**

DD MASTER 표는 셀마다 `React.memo` 로 감싼 `GridCell` 을 쓴다. 그 memo 는 `record` 참조가 같아야 걸린다. 지금은 편집할 때마다 모든 행의 참조가 바뀌어서 **memo 가 통째로 무력하다.** 800행 곱하기 74열이면 약 59,000칸이 한 칸도 안 빠지고 다시 그려진다. 선택을 한 칸 옮길 때는 `record` 가 그대로라 memo 가 제대로 걸린다. 설계는 맞는데 전제가 깨져 있다.

감사 기록의 `diffByKey` 도 같은 이유로 모든 행을 두 번씩 평평하게 편다. 참조가 다르니 같은 행인 줄 모른다.

## 1. 고칠 것 — `dd-workflow.ts`

### 바꾸지 않을 것부터

**`records.map` 안의 계산 로직은 한 글자도 바꾸지 마라.** `flDone`, `processReached`, `stage`, `formula`, `balance`, `tech`, `devStatus` 를 구하는 코드는 지금 그대로 둔다. 특히 이 주석과 그 아래 `devStatus` 식은 건드리지 마라.

```ts
    // 자동으로는 올리기만 한다. 유효한 FL#이 들어오면 완료로 올린다.
    // **사람이 고른 상태는 절대 내리지 않는다.** FL 없이 YDS만 입고해 두는 경우가 있어
    // 수동 완료를 그대로 둬야 한다. HOLD·DROP·REJECT도 같은 이유로 유지한다.
```

이것은 R298 규칙이다. `stage` 와 `devStatus` 는 자동으로 내려가지 않는다. 이번 수정은 **다 계산한 뒤 돌려줄 객체를 고르는 것**뿐이다.

### 더할 것

지금의 `return { ...record, ... }` 한 줄을 아래로 바꾼다. 그 위의 계산 코드는 전부 그대로다.

```ts
    const nextOpt = hasStyleNo ? formula?.opt ?? record.opt : ""
    const nextOptionProgress = hasStyleNo ? formula?.optionProgress ?? record.tech?.optionProgress : ""
    // 계산 결과가 전과 같으면 입력 객체를 그대로 돌려준다.
    // 새 객체를 만들면 셀 하나를 고칠 때 안 건드린 행까지 참조가 바뀌고,
    // DD MASTER 의 GridCell memo 가 전부 무력해진다(R447).
    const unchanged =
      record.devStatus === devStatus
      && record.opt === nextOpt
      && record.stage === stage
      && record.processReached !== undefined
      && record.processReached.yarn === processReached.yarn
      && record.processReached.knitting === processReached.knitting
      && record.processReached.dyeing === processReached.dyeing
      && record.processReached.finishing === processReached.finishing
      && record.tech !== undefined
      && record.tech.optionProgress === nextOptionProgress
      && (!record.tech.actual || record.tech.actual.balance === balance)
    if (unchanged) return record
    return { ...record, devStatus, opt: nextOpt, stage, processReached, tech }
```

`nextOptionProgress` 를 따로 빼는 이유는, 위에서 `tech` 를 만들 때 쓴 식과 **똑같은 식**을 비교에도 써야 하기 때문이다. `tech` 를 만드는 줄은 그대로 두고 식만 한 번 더 적는다. 원한다면 `tech` 만드는 줄에서 `nextOptionProgress` 를 쓰도록 바꿔도 된다. 값이 같기만 하면 된다.

### 왜 이 비교로 충분한가

`{ ...record, devStatus, opt, stage, processReached, tech }` 가 바꾸는 필드는 다섯이다. 다섯이 전부 전과 같으면 새 객체는 `record` 의 얕은 복사본이다. 그러면 `record` 를 그대로 주는 것이 같다.

- `processReached` 는 늘 새 객체라 네 불리언을 하나씩 본다.
- `tech` 는 `{ ...record.tech, optionProgress, actual }` 다. 나머지 필드는 `record.tech` 에서 그대로 왔으니 `optionProgress` 와 `actual` 만 보면 된다.
- `actual` 은 `record.tech.actual ? { ...record.tech.actual, balance } : record.tech.actual` 이다. `record.tech.actual` 이 없으면 **같은 값이 그대로** 나오므로 볼 것이 없다. 있으면 `balance` 만 본다.

### 반드시 지킬 조건 둘

**`record.processReached` 나 `record.tech` 가 `undefined` 면 빠른 경로로 가지 마라.** 위 식의 `!== undefined` 두 줄이 그 일을 한다. 지금 코드는 그런 행에도 `processReached` 와 `tech` 객체를 새로 **붙여 준다.** 빠른 경로로 보내면 그 필드가 안 붙어서 동작이 달라진다. 엑셀에서 갓 올라온 행이 여기에 해당한다. 두 줄을 지우거나 `?.` 로 바꾸지 마라.

**돌려주는 것은 `map` 이 받은 입력 `record` 다.** 저장소의 옛 행이 아니다. 호출부는 이미 고친 행이 든 배열을 넘기므로(`useAppStore.ts` 의 `records.map(...)`), 입력을 그대로 주면 사람이 친 값은 그대로 살아 있다. 여기서 다른 객체를 찾아 돌려주면 편집이 사라진다.

### 막다른 길 — 다시 시도하지 마라

- **배열까지 같은 것으로 돌려주려 하지 마라.** `return records` 같은 것을 넣지 마라. 편집이 있으면 입력 배열 자체가 이미 새 배열이라 아무 이득이 없고, 호출부가 배열을 고칠 때 저장소를 직접 건드리게 된다.
- **깊은 비교(`JSON.stringify` 대조)를 쓰지 마라.** 그 비용이 아끼려는 비용보다 크다.
- `identity`, `normalizedStatus`, `isCompletedFlNo`, `reached`, `dayValue` 를 고치지 마라.
- 그룹 묶기(`groups`, `calculated`) 부분을 고치지 마라.

## 2. 고칠 것 — `audit.ts`

`diffByKey` 의 `next.forEach` 안이다. 지금:

```ts
  next.forEach((item, key) => {
    const old = prev.get(key)
    if (!old) {
      changes.push({ k: key, c: "*", b: "", a: "(추가)" })
      return
    }
    const flatOld = flatten(old)
```

`if (!old) { ... }` 블록 **바로 아래**에 한 줄을 넣는다.

```ts
    // 같은 객체면 바뀐 것이 없다. R447 이후 안 바뀐 행은 참조가 그대로 온다.
    if (old === item) return
```

`flatten` 과 그 아래 비교는 손대지 마라. 삭제를 잡는 `prev.forEach` 쪽도 그대로 둔다.

## 3. 하지 말 것

- **동작을 바꾸지 마라.** 저장되는 값, 완료 판정, 옵션 순번, 감사 기록 내용이 전과 같아야 한다.
- R298 규칙을 건드리지 마라. `stage` 와 `devStatus` 는 자동으로 내려가지 않는다.
- `processReached` 와 `tech` 의 `undefined` 검사 두 줄을 빼지 마라.
- `src/store/useAppStore.ts` 를 고치지 마라. 이번 범위가 아니다.
- `src/routes/DevelopmentMasterSheet.tsx` 를 고치지 마라. `GridCell` 과 `memo` 는 이미 제대로 돼 있다. 이번 수정이 그것을 살린다.
- `React.memo`, `useMemo`, 가상 스크롤을 새로 넣거나 떼지 마라.
- `src/data/firestore-sync.ts`, `src/routes/Warehouse.tsx`, `src/routes/FabricRequest.tsx` 는 다음 차례다. 열지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라. R446 변경이 워킹트리에 있다.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 4. 성공 기준

- `npm run build` 가 통과한다(`tsc --noEmit` 포함).
- `git status --short` 에 `src/data/dd-workflow.ts` 와 `src/data/audit.ts` 두 줄이 더 뜬다. R446 의 두 줄은 그대로 있다.
- `dd-workflow.ts` 에 `if (unchanged) return record` 가 있고, 그 조건에 `record.processReached !== undefined` 와 `record.tech !== undefined` 가 들어 있다.
- `audit.ts` 의 `diffByKey` 에 `if (old === item) return` 이 있다.
- `recalculateDevelopmentRecords` 안의 `devStatus` 계산식과 그 위 세 줄 주석이 그대로다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
