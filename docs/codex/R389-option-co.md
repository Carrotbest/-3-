# R389 — DEVELOPMENT REQUEST 옵션에 CO(개발처) 열

상태: **미착수.** 설계는 2026-11-06 박향근 확정. 아래 그대로 시공한다.

## 무엇을 하는가

`/request` 옵션 밴드에 **CO**(개발처) 열 하나를 더한다. 자리는 **Remark 오른쪽, 공정 왼쪽**이다.

**스타일이 아니라 옵션 단위다.** 2026 OCT EU MARKET 차트 실측에서 34건 중 6건이 한 스타일 안에서 옵션마다 갈렸다(`1-4 국내 / 5 GD`, `1-2GD / 3-4국내`, `1~5 국내 / 6 GD`). 스타일 단위로 두면 그 값을 한 칸에 눌러 담게 된다. 엑셀에서 눌러 담던 것을 라인으로 푸는 것이 이 화면의 핵심이라 거꾸로 가는 것이다.

**값 목록은 `dd-workflow.ts`의 `DD_COMPANY_OPTIONS`(`GD`, `국내`, `생산`) 하나를 공유한다.** 새 목록을 만들지 말 것. 옵션 하나가 DD 행 하나와 짝이 되므로 목록이 갈라지면 연결할 때 값이 어긋난다.

## 하지 말 것

- 스타일 단위(`RequestStyle`)에 넣지 마라. 옵션 단위(`RequestOption`)다.
- `DD_COMPANY_OPTIONS`를 복사해 새 상수를 만들지 마라. import 해서 쓴다.
- `co`에 `undefined`를 넣지 마라. 생성 지점에서 늘 `""`다(R340).
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. **한글 문구를 영어로 바꾸지 마라.** `GD`, `국내`, `생산`, `개발처`, `선택 안함` 글자를 그대로 쓴다.
- 기존 열의 `id`와 `key`를 바꾸지 마라.

---

## 파일별 조치

### 1. `src/data/dd-workflow.ts`

43행의 `DD_COMPANY_OPTIONS` 바로 아래에 매처를 더한다. DD와 REQUEST가 같은 판정을 쓰게 하려는 것이다.

```ts
const companyKey = (value: string): string => value.trim().toLocaleLowerCase("en-US").replace(/[\s\-_]+/g, "")
const COMPANY_BY_KEY = new Map(DD_COMPANY_OPTIONS.map((name) => [companyKey(name), name]))

/**
 * 사람이 친 개발처를 목록 표기로 맞춘다. 대소문자와 공백 차이는 같은 값으로 본다.
 * 빈 값은 `""`(지정 해제), 목록에 없으면 `null`이다. `matchConstruction`과 같은 약속이다.
 */
export function matchCompany(raw: string): string | null {
  const text = raw.trim()
  if (!text) return ""
  return COMPANY_BY_KEY.get(companyKey(text)) ?? null
}
```

### 2. `src/data/schema.ts`

`RequestOption`의 `weight` 아래에 한 필드를 더한다. 지금 코드:

```ts
  /** W'T. 목표 중량(g/m2). 분리 전 데이터에는 없다. */
  weight?: number | ""
```

이렇게 바꾼다:

```ts
  /** W'T. 목표 중량(g/m2). 분리 전 데이터에는 없다. */
  weight?: number | ""
  /**
   * CO. 이 옵션의 개발처(R389). `DD_COMPANY_OPTIONS` 값만 받는다.
   * 한 스타일 안에서도 옵션마다 다를 수 있어 스타일이 아니라 옵션에 둔다.
   */
  co?: string
```

### 3. `src/routes/FabricRequest.tsx`

#### 3-1. import

`CONSTRUCTIONS`, `matchConstruction`을 가져오는 줄을 찾아 그 근처에 더한다.

```ts
import { DD_COMPANY_OPTIONS, matchCompany } from "@/data/dd-workflow"
```

이미 `dd-workflow`에서 무언가를 가져오고 있으면 그 줄에 합쳐라.

#### 3-2. `COLUMN_GROUPS`의 옵션 그룹 (107행 근처)

지금 코드:

```ts
    // R291에서 스타일 단위로 옮겼다. 옵션 사이에 세로로 병합된 한 칸이 되고, 여러 줄 기록을 받는다.
    { id: "remark", label: "Remark", width: 220, scope: "style" },
```

바로 아래에 한 줄을 끼운다(`ddStage` 앞이다):

```ts
    // R389. 옵션마다 개발처가 다를 수 있어 스타일이 아니라 옵션 단위다. 목록은 DD와 공유한다.
    { id: "co", label: "CO", width: 76, scope: "option", align: "center" },
```

#### 3-3. `blankOption` (244행 근처)

`weight: "",` 아래에 더한다.

```ts
  weight: "",
  co: "",
```

#### 3-4. 신규 의뢰 창 `setOption` 타입 (451행)

지금 코드:

```ts
  const setOption = (index: number, key: "yarnDetail" | "construction" | "color" | "dyeingMethod", next: string) =>
```

이렇게 바꾼다:

```ts
  const setOption = (index: number, key: "yarnDetail" | "construction" | "color" | "dyeingMethod" | "co", next: string) =>
```

#### 3-5. 신규 의뢰 창 옵션 줄에 CO 칸 (567행 근처)

옵션 줄 `div`의 `className`이 지금 이렇다:

```tsx
                  <div key={option.optId} className="grid grid-cols-[36px_minmax(0,1.4fr)_140px_64px_minmax(0,1fr)_90px_44px] items-center gap-2 px-3 py-2">
```

칸을 하나 늘린다(`90px`를 하나 더 끼운다):

```tsx
                  <div key={option.optId} className="grid grid-cols-[36px_minmax(0,1.4fr)_140px_64px_minmax(0,1fr)_90px_90px_44px] items-center gap-2 px-3 py-2">
```

그리고 Dyeing 입력칸과 삭제 버튼 사이에 CO 선택칸을 넣는다. Dyeing 칸을 찾아 그 **바로 다음**에 아래를 붙인다.

```tsx
                    <Select value={option.co || "__none"} onValueChange={(next) => setOption(index, "co", next === "__none" ? "" : next)}>
                      <SelectTrigger className="h-8 text-xs" aria-label={`옵션 ${option.no} CO`}><SelectValue placeholder="CO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">선택 안함</SelectItem>
                        {DD_COMPANY_OPTIONS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
```

#### 3-6. `EditKind`와 `editKindOf` (634행, 650행 근처)

타입에 `"company"`를 더한다.

```ts
type EditKind = "text" | "area" | "number" | "member" | "construction" | "company" | "result" | "toggle" | null
```

`editKindOf`의 `case "construction": return "construction"` 아래에 더한다.

```ts
    case "co":
      return "company"
```

#### 3-7. `CellEditor`에 드롭다운 분기 (701~717행 근처)

`if (kind === "construction") { … }` 블록 **바로 다음**에 더한다.

```tsx
  if (kind === "company") {
    // 개발처는 세 값뿐이다. DD와 같은 목록을 쓴다.
    return (
      <Select
        defaultOpen
        value={value || "__none"}
        onValueChange={(next) => { done.current = true; onCommit(next === "__none" ? "" : next) }}
      >
        <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">선택 안함</SelectItem>
          {value && !DD_COMPANY_OPTIONS.includes(value as (typeof DD_COMPANY_OPTIONS)[number]) ? <SelectItem value={value}>(목록 외) {value}</SelectItem> : null}
          {DD_COMPANY_OPTIONS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }
```

#### 3-8. 붙여넣기·채우기 검증 (1435~1444행, 1468~1471행)

`SkipReason`과 `SkipCounts`에 `company`를 더한다.

```ts
  type SkipReason = false | "number" | "construction" | "company" | "result"
  type SkipCounts = { number: number; construction: number; company: number; result: number }
```

`noticeSkips`의 `parts` 배열에서 조직 줄 다음에 한 줄을 더한다.

```ts
      counts.company ? `개발처 목록에 없는 ${counts.company}칸` : "",
```

**`SkipCounts`를 만드는 자리가 네 곳이다**(1483, 1497, 1778행 근처). 전부 `company: 0`을 더해야 타입이 맞는다. `{ number: 0, construction: 0, result: 0 }`을 `{ number: 0, construction: 0, company: 0, result: 0 }`으로 바꾼다.

`updateCell`의 옵션 분기에서 `construction` 가드 바로 아래에 더한다. 지금 코드:

```ts
      if (column.id === "construction") {
        const matched = matchConstruction(raw)
        if (matched === null) return { next: list, skipped: "construction" }
        optionValue = matched
      }
```

아래를 그 뒤에 붙인다:

```ts
      if (column.id === "co") {
        const matched = matchCompany(raw)
        if (matched === null) return { next: list, skipped: "company" }
        optionValue = matched
      }
```

#### 3-9. `commitCell`의 옵션 분기 (1662행 근처)

지금 코드:

```ts
    if (columnId === "construction") {
      const matched = matchConstruction(raw)
      if (matched === null) return
      optionValue = matched
    }
```

아래를 그 뒤에 붙인다:

```ts
    if (columnId === "co") {
      const matched = matchCompany(raw)
      if (matched === null) return
      optionValue = matched
    }
```

#### 3-10. 셀 렌더 (1939행 근처)

지금 코드:

```ts
      case "construction": return option.construction ?? ""
```

아래에 더한다:

```ts
      case "co": return option.co ?? ""
```

### 4. `src/data/request-template.ts`

#### 4-1. import

파일 위쪽 import에 더한다.

```ts
import { DD_COMPANY_OPTIONS, matchCompany } from "./dd-workflow"
```

#### 4-2. `TEMPLATE_COLUMNS`

REMARK 줄이 옵션 밴드 마지막이다. 지금 코드:

```ts
  // R291에서 스타일 단위로 옮겼다. 열 위치와 이름은 옛 양식 파일을 계속 읽기 위해 그대로 둔다.
  { band: "옵션", head: "REMARK", width: 26, scope: "style", key: "remark", screenWidth: 220 },
```

그 **아래**에 한 줄을 더한다(화면 열 순서와 같아야 한다).

```ts
  // R389. 옵션마다 다를 수 있어 scope가 option이다. 목록은 DD와 공유한다.
  { band: "옵션", head: "CO", width: 9, scope: "option", key: "co", optional: true, screenWidth: 76 },
```

#### 4-3. `cellOf`

`case "dyeingMethod"` 아래에 더한다.

```ts
    case "co": return option ? option.co || null : null
```

#### 4-4. 엑셀 드롭다운

파일 끝 쪽 `LISTS` 시트를 만드는 곳이 지금 이렇다.

```ts
  const lists = workbook.addWorksheet("LISTS", { state: "hidden" })
  CONSTRUCTIONS.forEach((name, index) => { lists.getCell(index + 1, 1).value = name })
```

B열에 개발처 목록을 더한다.

```ts
  const lists = workbook.addWorksheet("LISTS", { state: "hidden" })
  CONSTRUCTIONS.forEach((name, index) => { lists.getCell(index + 1, 1).value = name })
  DD_COMPANY_OPTIONS.forEach((name, index) => { lists.getCell(index + 1, 2).value = name })
```

그리고 CONS 검증을 거는 `for` 루프 안에서 같은 행에 CO 검증도 건다. 지금 코드:

```ts
  const consColumn = columnIndex(columns, "construction") + 1
  const lastRow = Math.max(rowIndex, 3) + 500
  for (let row = 3; row < lastRow; row += 1) {
    ws.getCell(row, consColumn).dataValidation = {
```

`consColumn` 선언 아래에 한 줄을 더하고, 루프 안 CONS 검증 **뒤**에 CO 검증을 붙인다.

```ts
  const consColumn = columnIndex(columns, "construction") + 1
  const coColumn = columnIndex(columns, "co") + 1
```

루프 안, CONS `dataValidation` 블록이 끝난 직후:

```ts
    if (coColumn > 0) {
      ws.getCell(row, coColumn).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`LISTS!$B$1:$B$${DD_COMPANY_OPTIONS.length}`],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "CO",
        error: "목록에서 개발처를 고르세요.",
      }
    }
```

#### 4-5. 「작성 안내」 시트

`lines` 배열 마지막 줄 뒤에 두 줄을 더한다.

```ts
    "10. CO는 그 옵션의 개발처입니다. 셀의 드롭다운에서 GD / 국내 / 생산 중 하나를 고릅니다.",
    "    한 스타일 안에서도 옵션마다 다를 수 있어 옵션 줄마다 따로 적습니다.",
```

#### 4-6. 파서 `optionKeys`

지금 코드:

```ts
  const optionKeys = ["yarnDetail", "construction", "weight", "color", "dyeingMethod"]
```

이렇게 바꾼다. CO만 적힌 줄도 옵션으로 읽게 하려는 것이다.

```ts
  const optionKeys = ["yarnDetail", "construction", "weight", "color", "dyeingMethod", "co"]
```

#### 4-7. `readOption`

지금 코드(마지막 `return` 부분):

```ts
  return {
    optId: `${reqId}#${no}`,
    lineId: crypto.randomUUID(),
    no,
    yarnDetail: asText(at(row, "yarnDetail")),
    construction: construction ?? consRaw,
    weight: asNumber(at(row, "weight")),
    color: asText(at(row, "color")),
    dyeingMethod: asText(at(row, "dyeingMethod")),
  }
```

`return` 앞에 CO 매칭을 더하고 필드를 붙인다.

```ts
  const coRaw = asText(at(row, "co"))
  const co = matchCompany(coRaw)
  if (co === null) warn(`CO "${coRaw}"는 개발처 목록에 없어 그대로 넣었습니다. 웹에서 목록 값으로 바꿔 주세요.`)
  return {
    optId: `${reqId}#${no}`,
    lineId: crypto.randomUUID(),
    no,
    yarnDetail: asText(at(row, "yarnDetail")),
    construction: construction ?? consRaw,
    weight: asNumber(at(row, "weight")),
    color: asText(at(row, "color")),
    dyeingMethod: asText(at(row, "dyeingMethod")),
    co: co ?? coRaw,
  }
```

#### 4-8. 옵션 열도 "없으면 지키기"에 넣는다

R388이 스타일 열에만 걸어 둔 보존을 옵션 열에도 건다. **이것이 없으면 CO 열이 없는 옛 양식으로 한 번만 올려도 적어 둔 CO가 전부 빈다.**

`PRESERVE_IF_ABSENT` 아래에 짝을 하나 더 만든다.

```ts
/** 옵션 열 판(R389). 같은 자리(index)의 옛 값을 지킨다. */
const PRESERVE_OPTION_IF_ABSENT = new Set(
  TEMPLATE_COLUMNS.filter((column) => column.scope === "option" && column.optional).map((column) => column.key),
)
```

`mergeRequestStyles`의 `options` 매핑을 바꾼다. 지금 코드:

```ts
      options: style.options.map((option, index) => ({
        ...option,
        no: index + 1,
        optId: `${previous.reqId}#${index + 1}`,
        lineId: previous.options[index]?.lineId ?? option.lineId,
      })),
```

이렇게 바꾼다:

```ts
      options: style.options.map((option, index) => {
        const prior = previous.options[index]
        const next: RequestOption = {
          ...option,
          no: index + 1,
          optId: `${previous.reqId}#${index + 1}`,
          lineId: prior?.lineId ?? option.lineId,
        }
        // 파일에 그 열이 없으면 같은 자리의 옛 값을 지킨다(R389).
        if (prior) {
          for (const key of missingColumns) {
            if (!PRESERVE_OPTION_IF_ABSENT.has(key)) continue
            ;(next as unknown as Record<string, unknown>)[key] = (prior as unknown as Record<string, unknown>)[key]
          }
        }
        return next
      }),
```

### 5. `src/data/analysis-to-request.ts`

`buildRequestStyleFromAnalysis`의 옵션 생성에서 `weight: "",` 아래에 더한다.

```ts
    weight: "",
    co: "",
```

---

## 검증

```
npm run build
```

`tsc --noEmit`을 포함한다. 한 번만 돌린다.

끝난 뒤 `git status --short`로 위 다섯 파일만 바뀌었는지 본다.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다. 바꾼 코드를 다시 붙이지 마라.
