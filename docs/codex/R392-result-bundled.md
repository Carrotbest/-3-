# R392 — 결과에 「묶음」을 더하고 그 스타일을 회색으로 덮는다

상태: **미착수.** 2026-11-06 박향근 지시.

**R391과 같은 파일(`FabricRequest.tsx`)을 고친다. R391이 끝난 뒤에 시작할 것.**

## 무엇을 하는가

결과(`result`) 목록에 다섯 번째 값 **「묶음」**을 더한다. 다른 스타일에 묶어서 같이 개발하는 건이라 이 스타일을 따로 좇지 않는다는 표시다. 2026 OCT EU MARKET 차트의 `44번과 묶어서 진행` 같은 건이 여기 해당한다.

결과를 「묶음」으로 고르면 **그 스타일 블럭 전체가 회색으로 덮인다.** 농도는 지금 완료된 스타일이 쓰는 것과 **똑같은 값**이다. 새 색을 만들지 말고 `FabricRequest.tsx`의 **기존 상수 `CLOSED_CELL_BG`를 그대로 쓴다.**

## 하지 말 것

- 새 회색 상수나 새 클래스를 만들지 마라. `CLOSED_CELL_BG` 하나다.
- 결과 자동 완료 effect(`resultOf(style) !== "진행중"`으로 거르는 곳)를 건드리지 마라. 「묶음」은 진행중이 아니라서 자동으로 완료로 바뀌지 않는다. 이미 맞게 돌아간다.
- 「묶음」에 취소선을 긋지 마라. 취소선은 「드롭」만이다. 묶음은 취소가 아니라 다른 건과 합쳐 진행하는 것이다.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라.

---

## 파일별 조치

### 1. `src/data/schema.ts`

204행. 지금 코드:

```ts
export const REQUEST_RESULTS = ["진행중", "완료", "드롭", "보류"] as const
```

이렇게 바꾼다. **맨 뒤에 더한다.** 이 순서가 곧 드롭다운 순서다.

```ts
/** 「묶음」은 다른 스타일에 합쳐 개발하는 건이다(R392). 그 스타일은 표에서 회색으로 덮인다. */
export const REQUEST_RESULTS = ["진행중", "완료", "드롭", "보류", "묶음"] as const
```

엑셀 업로드 파서(`request-template.ts`의 `asResult`)는 이 목록을 보고 판정하므로 **따로 고칠 것이 없다.**

### 2. `src/routes/FabricRequest.tsx`

#### 2-1. 결과 칩 색 (1960행)

지금 코드는 「드롭」이 아니면 전부 앰버(보류 색)로 떨어진다. 그대로 두면 묶음이 보류와 같은 색이 된다.

```ts
          const tone = result === "진행중" ? "bg-[color-mix(in_srgb,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]" : result === "완료" ? "bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]" : result === "드롭" ? "bg-[var(--muted)] text-[var(--muted-foreground)] line-through" : "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]"
```

이렇게 바꾼다. 「묶음」 분기를 「드롭」 뒤에 끼운다.

```ts
          const tone = result === "진행중" ? "bg-[color-mix(in_srgb,var(--chart-1)_14%,transparent)] text-[var(--chart-1)]" : result === "완료" ? "bg-[color-mix(in_srgb,var(--chart-2)_16%,transparent)] text-[var(--chart-2)]" : result === "드롭" ? "bg-[var(--muted)] text-[var(--muted-foreground)] line-through" : result === "묶음" ? "bg-[var(--muted)] text-[var(--muted-foreground)]" : "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]"
```

#### 2-2. 셀 회색 덮기 (2007~2008행)

지금 코드:

```ts
    const closed = closedByStyle.get(line.style.reqId)
    const dimmed = Boolean(closed && (closed.allClosed || (line.kind === "option" && closed.closed.has(line.option.optId))))
```

이렇게 바꾼다.

```ts
    const closed = closedByStyle.get(line.style.reqId)
    // 묶음은 다른 스타일에 합쳐 진행하는 건이라 옵션 공정과 무관하게 블럭 전체를 덮는다(R392).
    const bundled = resultOf(line.style) === "묶음"
    const dimmed = bundled || Boolean(closed && (closed.allClosed || (line.kind === "option" && closed.closed.has(line.option.optId))))
```

#### 2-3. 행 머리와 「옵션 추가」 줄 (2348행)

지금 코드:

```ts
                const blockClosed = closedByStyle.get(style.reqId)?.allClosed ?? false
```

이렇게 바꾼다. 이 값이 행 머리(2392행)와 「옵션 추가」 줄(2421행) 배경을 함께 정한다.

```ts
                const blockClosed = (closedByStyle.get(style.reqId)?.allClosed ?? false) || resultOf(style) === "묶음"
```

### 3. `src/components/request/RequestBoardHeader.tsx`

11행의 손으로 적은 목록이 네 값에 묶여 있다. **목록을 하나로 모은다.** 앞으로 결과 값을 더해도 여기가 따라온다.

지금 코드:

```ts
  const results = Object.fromEntries(["진행중", "완료", "드롭", "보류"].map((key) => [key, styles.filter((style) => resultOf(style) === key).length]))
```

이렇게 바꾼다.

```ts
  const results = Object.fromEntries(REQUEST_RESULTS.map((key) => [key, styles.filter((style) => resultOf(style) === key).length]))
```

6행 import에 `REQUEST_RESULTS`를 더한다. 지금은 타입만 가져오고 있으니 값 import를 따로 쓴다.

```ts
import { REQUEST_RESULTS, type RequestBoard, type RequestOption, type RequestStyle } from "@/data/schema"
```

뱃지는 `flex-wrap`이라 하나 늘어도 줄이 접히기만 한다. 배치를 손대지 마라.

### 4. `src/components/request/RequestBoardCloseDialog.tsx`

27행에 손으로 적은 `["완료", "드롭", "보류"]`가 있다. 종결할 때 남은 진행중 건을 한 결과로 정리하는 목록이다. 묶음도 고를 수 있어야 한다.

그 자리를 이렇게 바꾼다.

```tsx
{REQUEST_RESULTS.filter((result) => result !== "진행중").map((result) => <SelectItem key={result} value={result}>{result}</SelectItem>)}
```

import에 `REQUEST_RESULTS`를 더한다(이미 `RequestResult` 타입을 가져오고 있으면 그 줄에 합친다).

---

## 검증

```
npm run build
```

`tsc --noEmit`을 포함한다. 한 번만 돌린다.

끝난 뒤 `git status --short`로 위 네 파일만 **새로** 바뀌었는지 본다. 이 저장소에는 이미 커밋 안 한 변경이 여럿 있으니 되돌리지 마라.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다. 바꾼 코드를 다시 붙이지 마라.
