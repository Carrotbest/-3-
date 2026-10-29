# R370 — DEVELOPMENT REQUEST 열 순서, 옵션 기본 4개, 엑셀 양식 화면 일치

상태: **구현 완료, 화면 실물 확인 미완.** 2026-10-29 박향근 확정.
빌드 통과(`npm run build`). 커밋 전이다.

세 가지다. 화면 열 순서를 바꾸고, 새 스타일의 옵션을 4개로 시작하고,
엑셀 내려받기가 화면과 같은 순서·간격으로 나오게 한다.

## 먼저 알아 둘 것

워킹트리에 **R369 미커밋 변경이 이미 있다**(`src/data/schema.ts`, `src/data/dd-schedule.ts`,
`src/routes/DevelopmentMasterSheet.tsx`). **그 세 파일을 건드리지 마라.** 되돌리지도 마라.
이번 작업과 무관하다.

"개발 POINT"는 **새 열이 아니다.** 지금 있는 `devPlan`(화면 라벨 "개발", 200px) 열의
이름을 바꾸고 자리를 옮기는 것이다. 박향근 화면에서 그 열이 숨김 상태라 없는 줄 알았다.
**새 필드를 만들지 마라.** `RequestStyle.devPlan`을 그대로 쓴다.

---

## 1. 화면 열 순서 (`src/routes/FabricRequest.tsx`, `COLUMN_GROUPS` 104~116행)

### 분석 묶음 — Comment와 분석 담당을 맞바꾼다

현재 (104~109행):
```ts
  { key: "analysis", label: "분석", color: "var(--chart-2)", columns: [
    { id: "yarnAnalysis", label: "Yarn analysis", width: 180, scope: "style" },
    { id: "devConstruction", label: "Cons.(개발)", width: 120, scope: "style" },
    { id: "comment", label: "Comment", width: 160, scope: "style" },
    { id: "analyst", label: "분석 담당", width: 90, scope: "style" },
  ] },
```

바꾼 뒤:
```ts
  { key: "analysis", label: "분석", color: "var(--chart-2)", columns: [
    { id: "yarnAnalysis", label: "Yarn analysis", width: 180, scope: "style" },
    { id: "devConstruction", label: "Cons.(개발)", width: 120, scope: "style" },
    { id: "analyst", label: "분석 담당", width: 90, scope: "style" },
    { id: "comment", label: "Comment", width: 160, scope: "style" },
  ] },
```

### 의뢰 묶음 — URGENT는 맨 앞, 결과는 맨 뒤

현재 (110~116행):
```ts
  { key: "request", label: "의뢰", color: "var(--chart-3)", columns: [
    { id: "result", label: "결과", width: 76, scope: "style", align: "center" },
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "devPlan", label: "개발", width: 200, scope: "style" },
  ] },
```

바꾼 뒤:
```ts
  { key: "request", label: "의뢰", color: "var(--chart-3)", columns: [
    { id: "urgent", label: "URGENT", width: 64, scope: "style", align: "center" },
    { id: "requester", label: "의뢰자", width: 90, scope: "style" },
    { id: "devPlan", label: "개발 POINT", width: 200, scope: "style" },
    { id: "developer", label: "개발 담당", width: 90, scope: "style" },
    { id: "result", label: "결과", width: 76, scope: "style", align: "center" },
  ] },
```

**열 `id`는 하나도 바꾸지 마라.** 저장된 열 너비(`fabric.request.colWidths`),
숨김 상태(`fabric.request.hiddenCols`), 선택·복사·붙여넣기가 전부 id로 돈다.
바꾸는 것은 배열 안 **순서**와 `devPlan`의 `label` 하나뿐이다.

화면 다른 곳에 "개발" 라벨이 또 있으면(신규 의뢰 창의 입력 라벨 등) 거기도 "개발 POINT"로
맞춘다. `devPlan`을 라벨로 쓰는 자리만이다. `developer`("개발 담당")는 건드리지 마라.

---

## 2. 새 스타일 옵션 기본 4개 (`src/routes/FabricRequest.tsx`)

`blankOption` 바로 아래(262행 근처)에 상수와 도우미를 만든다.

```ts
/** 새 스타일은 옵션 4줄로 시작한다(R370, 2026-10-29 박향근 확정). */
const DEFAULT_OPTION_COUNT = 4
const blankOptions = (reqId: string, count = DEFAULT_OPTION_COUNT): RequestOption[] =>
  Array.from({ length: count }, (_, index) => blankOption(reqId, index + 1))
```

고칠 자리 둘이다.

| 위치 | 현재 | 바꾼 뒤 |
|---|---|---|
| `blankStyle()` 253행 | `options: [],` | 손대지 않는다. 아래 설명 참조 |
| `appendBlankStyles` 1235행 | `options: renumber(style.reqId, [blankOption(style.reqId, 1)])` | `options: renumber(style.reqId, blankOptions(style.reqId))` |

`blankStyle()`은 `reqId`를 만든 **뒤에** 옵션을 붙여야 `optId`가 맞는다. 객체 리터럴 안에서는
자기 `reqId`를 못 읽으므로 함수 본문을 이렇게 바꾼다.

```ts
const blankStyle = (): RequestStyle => {
  const reqId = newId()
  return {
    reqId,
    chart: "",
    // ... 기존 필드 그대로 ...
    devPlan: "",
    options: blankOptions(reqId),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
```

**1470행 `options = [blankOption(current.reqId, 1)]`은 그대로 둔다.** 붙여넣기가 옵션 없는
스타일의 첫 칸에 값을 넣을 때 한 줄만 만드는 자리다. 여기서 4줄을 만들면 붙여넣기 한 번에
빈 줄 세 개가 따라붙는다.

**업로드 파서(`request-template.ts`)의 옵션 수는 건드리지 마라.** 파일에 적힌 줄 수가 답이다.

---

## 3. 분석에서 넘길 때도 옵션 4개 (`src/data/analysis-to-request.ts` 38~47, 78행)

지금은 옵션 하나(`option`)를 만들어 `options: [option]`로 넣는다.
네 개를 만든다. 값은 전부 빈 칸 그대로다(개발 목표 사양은 사람이 적는다. 이 규칙은 그대로다).

```ts
  const options: RequestOption[] = Array.from({ length: 4 }, (_, index) => ({
    optId: `${reqId}#${index + 1}`,
    lineId: newId(),
    no: index + 1,
    yarnDetail: "",
    construction: "",
    weight: "",
    color: "",
    dyeingMethod: "",
  }))
```

78행 `options: [option],` → `options,`

**`lineId`는 옵션마다 따로 만든다.** 같은 값을 네 번 쓰면 DD 연결 키가 겹친다.

---

## 4. 엑셀 양식 열 순서 (`src/data/request-template.ts`, `TEMPLATE_COLUMNS` 49~74행)

화면과 같은 순서로 맞추고 `결과` 열을 더한다.

분석 밴드 58~61행에서 `Comment`와 `분석 담당` 줄을 맞바꾼다(`head`·`key`·`width` 그대로).

의뢰 밴드 62~65행을 통째로 이렇게 바꾼다.

```ts
  { band: "의뢰", head: "URGENT", width: 8, scope: "style", key: "urgent", screenWidth: 64 },
  { band: "의뢰", head: "의뢰자", width: 11, scope: "style", key: "requester", screenWidth: 90 },
  { band: "의뢰", head: "개발 POINT", aliases: ["개발"], width: 30, scope: "style", key: "devPlan", screenWidth: 200 },
  { band: "의뢰", head: "개발 담당", width: 11, scope: "style", key: "developer", screenWidth: 90 },
  { band: "의뢰", head: "결과", width: 9, scope: "style", key: "result", optional: true, screenWidth: 76 },
```

- `aliases: ["개발"]`을 빠뜨리지 마라. 팀이 이미 받아 쓰고 있는 양식 파일의 열 이름이 "개발"이다.
  빠지면 그 파일을 업로드할 때 개발 POINT 칸이 통째로 빈다.
- `결과`는 **`optional: true`** 다. 이 열이 없는 옛 양식 파일을 계속 읽어야 한다.

### 4-1. 내려쓰기 (`cellOf`, 102~121행)

`case "devPlan"` 아래에 한 줄 더한다.

```ts
    case "result": return style.result ?? null
```

### 4-2. 읽어들이기 (파서, 360~382행 스타일 생성 객체)

`devPlan: asText(at(row, "devPlan")),` 아래에 더한다.

```ts
    ...(asResult(at(row, "result")) ? { result: asResult(at(row, "result")) } : {}),
```

`asResult`는 파일 안 다른 `asText`·`asUrgent` 옆에 만든다.

```ts
/** 결과는 네 값만 받는다. 그 밖의 글자는 빈 값으로 둔다. 경고도 띄우지 않는다. */
const asResult = (value: unknown): RequestResult | undefined => {
  const text = asText(value).trim()
  return (REQUEST_RESULTS as readonly string[]).includes(text) ? (text as RequestResult) : undefined
}
```

`REQUEST_RESULTS`와 `RequestResult`를 `./schema`에서 가져온다(`styleRemarkText`를 가져오는 import 줄에 붙인다).

**키가 없을 때 `result: undefined`를 넣지 마라.** Firestore가 값 없는 키를 거부한다(R340).
위 전개 구문이 그래서 저 모양이다. `result: asResult(...)`로 줄이지 마라.

---

## 5. 엑셀 내려받기 간격을 화면과 맞춘다 (`src/routes/FabricRequest.tsx` 1846행, 2047행)

현재 둘 다 인자 없이 부른다.

```ts
downloadBlob(await buildRequestWorkbook(visible), requestTemplateFileName())
downloadBlob(await buildRequestWorkbook(archive.styles), requestTemplateFileName())
```

둘 다 이렇게 바꾼다.

```ts
buildRequestWorkbook(visible, { minOptionRows: 4, mergeStyleCells: true, matchScreenWidths: true })
buildRequestWorkbook(archive.styles, { minOptionRows: 4, mergeStyleCells: true, matchScreenWidths: true })
```

**`dropBasicBand`는 주지 마라.** 기본 밴드(스타일·차트·단계)는 화면에 없지만 재업로드할 때
순번을 다시 매기는 근거다. 빼면 업로드한 스타일 번호가 0으로 들어간다.

`src/routes/FabricAnalysis.tsx` 315행은 **이미 같은 인자**를 쓰고 있다. 손대지 마라.
4절의 열 순서 변경이 그 파일에도 자동으로 따라간다.

---

## 하지 말 것

- **열 `id`와 `key`를 바꾸지 마라.** 라벨(`label`)과 엑셀 머리글(`head`)만 바꾼다.
- **`RequestStyle`에 새 필드를 만들지 마라.** 개발 POINT는 기존 `devPlan`이다.
- **R369 미커밋 파일 세 개를 건드리거나 되돌리지 마라.**
- `aliases: ["개발"]`을 빼지 마라. 기존 양식 파일이 안 읽힌다.
- `result`를 `optional: true` 없이 넣지 마라. 옛 양식 파일 업로드가 깨진다.
- `{ ...x, result: undefined }`를 쓰지 마라(R340).
- 1470행의 옵션 1줄 생성을 4줄로 바꾸지 마라.
- 파서의 옵션 수를 4로 고정하지 마라. 파일이 정한다.
- 새 npm 의존성을 추가하지 마라.
- 커밋하거나 푸시하지 마라.

## 검증

```
npm run build
```

성공 기준.
- 빌드 통과.
- `git status --short`에 R369 파일 셋(`src/data/schema.ts`, `src/data/dd-schedule.ts`,
  `src/routes/DevelopmentMasterSheet.tsx`)과 이번 파일 셋(`src/routes/FabricRequest.tsx`,
  `src/data/request-template.ts`, `src/data/analysis-to-request.ts`), 그리고 이 문서만 뜬다.
  그 밖의 파일이 뜨면 잘못 건드린 것이다.
