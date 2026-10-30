# R373 실측 Balance를 퍼센트 숫자로 통일한다

상태: 미착수. 원인 규명까지 끝났다.

## 증상

DD MASTER의 실측 Balance 열이 어떤 행이든 `+0.0%`, `-0.0%`, `-0.1%` 언저리로만 나온다. Target weight 대비 실측 중량의 차이가 아무리 벌어져도 값이 움직이지 않는다. 2026-10-30에 박향근이 화면에서 확인했다.

## 원인

`src/data/dd-workflow.ts:147`이 비율을 **소수**로 만드는데, 표시하는 쪽은 100을 곱하지 않고 `%`를 붙인다.

실측 232, Target 258이면 `(232 - 258) / 258 = -0.1008`이다. 화면은 `toFixed(1)`로 잘라 `-0.1%`로 쓴다. 실제 값은 **-10.1%**다. 100배가 통째로 빠져 있다.

바로 옆 축률 L/W는 퍼센트 숫자(`-3.3`, `-6.8`)로 저장된다. Balance만 단위가 다르다. 그 단위 차이가 이 버그의 뿌리다.

`-0.0%`는 음수인데 `balance >= 0`이 거짓이라 `+`가 안 붙고 반올림으로 0이 된 값이다. 같은 원인이다.

## 결정

2026-10-30에 박향근이 **저장 단위 통일**로 정했다. 저장값을 퍼센트 숫자로 바꾼다. 축률 L/W와 같은 단위가 된다.

같이 정한 것이 하나 더 있다. **폴백을 없앤다.** 지금은 Target이나 실측 중량이 비면 `record.tech?.actual?.balance`로 옛 값을 그대로 쓴다. 단위를 바꾸면 그 옛 소수값이 새 퍼센트값과 섞인다. Balance는 Target 대비 비율이라 둘 중 하나가 없으면 뜻이 없다. DD MASTER는 2026-09-14 결정대로 엑셀을 파싱하지 않으므로 파서가 넣어 둔 옛 값을 지킬 이유도 없다.

## 파일별 조치

| 파일 | 줄 | 조치 |
|---|---|---|
| `src/data/dd-workflow.ts` | 145~147 | 100을 곱한다. 폴백을 `null`로 바꾼다 |
| `src/data/dd-workflow.ts` | 104 | 함수 주석에 단위를 적는다 |
| `src/data/schema.ts` | 57 | `balance` 필드에 단위 주석을 단다 |
| `src/routes/Development.tsx` | 1326 | Balance에 단위 `" %"`를 붙인다 |
| `src/data/dd-export.ts` | 105 | 열 이름을 `Balance%`로 바꾼다 |
| `src/routes/DevelopmentMasterSheet.tsx` | 383 | **고치지 않는다.** 이미 `toFixed(1)`에 `%`를 붙이고 있어 단위를 바꾸면 그대로 맞는다 |

### 1. `src/data/dd-workflow.ts` 145~147

현재:

```ts
    const targetWeight = typeof record.weight === "number" ? record.weight : Number(record.weight)
    const actualWeight = record.tech?.actual?.weight
    const balance = targetWeight && typeof actualWeight === "number" ? (actualWeight - targetWeight) / targetWeight : record.tech?.actual?.balance
```

교체:

```ts
    const targetWeight = typeof record.weight === "number" ? record.weight : Number(record.weight)
    const actualWeight = record.tech?.actual?.weight
    // Target 대비 실측 중량의 차이를 퍼센트 숫자로 둔다. 축률 L/W와 같은 단위다.
    // 둘 중 하나가 없으면 뜻이 없으므로 null이다. undefined를 두면 Firestore가 저장을 거부한다.
    const balance = Number.isFinite(targetWeight) && targetWeight !== 0 && typeof actualWeight === "number"
      ? ((actualWeight - targetWeight) / targetWeight) * 100
      : null
```

### 2. `src/data/dd-workflow.ts` 104

현재:

```ts
 * C열 옵션순번, AN열 완료/전체, AR열 실측 Balance와 공정 도달 상태를 매 저장 때 다시 계산한다.
```

교체:

```ts
 * C열 옵션순번, AN열 완료/전체, AR열 실측 Balance(퍼센트 숫자)와 공정 도달 상태를 매 저장 때 다시 계산한다.
```

### 3. `src/data/schema.ts` 57

현재:

```ts
    balance?: number | null
```

교체:

```ts
    balance?: number | null // Target 대비 실측 중량 차이. 퍼센트 숫자다(-10.1 = -10.1%). 소수 비율이 아니다
```

### 4. `src/routes/Development.tsx` 1326

그 줄의 `DetailPairs` 배열 안에서 Balance 항목 하나만 바꾼다. `DetailPairs`는 `Array<[string, unknown, string?]>`를 받고 세 번째가 단위다.

현재:

```
["Balance", tech.actual.balance]
```

교체:

```
["Balance", tech.actual.balance, " %"]
```

같은 줄의 다른 항목은 건드리지 않는다.

### 5. `src/data/dd-export.ts` 105

현재:

```ts
  { head: "Actual", sub: "Balance", width: 12.2, value: (r) => num(r.tech?.actual?.balance) },
```

교체:

```ts
  { head: "Actual", sub: "Balance%", width: 12.2, value: (r) => num(r.tech?.actual?.balance) },
```

바로 아래 축률 두 열이 `축률(L)%`, `축률(W)%`로 머리에 `%`를 적는 방식이다. 거기에 맞춘다.

## 하지 말 것

- `src/routes/DevelopmentMasterSheet.tsx:383`의 `render`를 고치지 마라. 거기서 100을 또 곱하면 100배가 된다.
- `src/data/xlsx-parsers.ts`의 `actualBalance`를 고치지 마라. DD MASTER는 엑셀을 파싱하지 않는다. 그 파서는 쓰이지 않는 경로다.
- 폴백을 `record.tech?.actual?.balance`로 되살리지 마라. 단위가 다른 옛 값이 섞인다.
- 폴백을 `undefined`로 두지 마라. `{ ...record.tech.actual, balance }`가 값 없는 키를 만들고, Firestore가 그 문서를 통째로 거부한다. COST SHEET가 이것 하나로 한 달 넘게 저장에 실패했다.
- `src/data/firebase.ts`의 `ignoreUndefinedProperties`를 켜지 마라.
- 기존 저장 데이터를 바꾸는 마이그레이션 코드를 쓰지 마라. Target과 실측 중량이 둘 다 있는 행은 다음 저장 때 재계산으로 덮인다.

## 검증

`npm run build` 한 번. 타입 오류가 없고 빌드가 끝나면 된다.

그다음 `git status --short`로 위 표의 다섯 파일 외에 바뀐 것이 없는지 본다.

화면 확인은 박향근이 한다.
