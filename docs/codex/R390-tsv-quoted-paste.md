# R390 — 엑셀의 여러 줄 셀을 붙여넣으면 칸이 밀리는 문제

상태: **미착수.** 2026-11-06 박향근 보고. 원인 규명 끝.

## 증상

엑셀에서 줄바꿈이 들어 있는 칸 하나를 복사해 REQUEST 표에 붙이면 **한 칸에 안 들어가고 아래 스타일 행들로 흩어진다.** 따옴표 글자도 그대로 남는다.

2026-11-06 실제 사례. 엑셀 `개발` 칸 하나가 이랬다.

```
aerie lets stretch 원사 사용
1. 1x1 RIB 200G
2. 2X2 RIB 200G
3. THERMAL 210G HMP327121 패턴 참고
```

붙였더니 `"aerie lets stretch 원사 사용`이 22번 스타일, `1. 1x1 RIB 200G`이 23번, `2. 2X2 RIB 200G`이 24번, `3. THERMAL 210G HMP327121 패턴 참고"`가 25번으로 들어갔다. 25번에는 뒤따르던 `soft handfeel`과 `"key point에 따라,`까지 같이 들어갔다.

## 원인

**엑셀은 여러 줄 칸을 클립보드에 따옴표로 감싸서 넣는다**(RFC 4180). 칸 안의 `"`는 `""`로 두 번 쓴다. 위 사례의 클립보드 글자는 이렇다.

```
"aerie lets stretch 원사 사용
1. 1x1 RIB 200G
2. 2X2 RIB 200G
3. THERMAL 210G HMP327121 패턴 참고"	soft handfeel	"key point에 따라,
번수 or 게이지 or 스판 어떤 것을 조정할지 조율 필요"
```

그런데 붙여넣기 파서가 따옴표를 전혀 보지 않고 줄과 탭으로만 쪼갠다.

```ts
const grid = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
```

**복사 쪽도 같은 문제다.** 줄바꿈이 든 칸을 따옴표로 감싸지 않고 그대로 `\t`와 `\n`으로 이어 붙인다. 그래서 웹에서 복사해 엑셀에 붙여도 깨지고, 웹에서 복사해 웹에 붙여도 깨진다.

## 무엇을 하는가

TSV 읽기·쓰기 함수 한 쌍을 `src/data/range-tsv.ts`에 만들고 **복사 3곳, 붙여넣기 4곳**을 전부 그 함수로 바꾼다.

이 파일은 이미 여러 영역 복사 규칙(`combineRangeTsv`)이 사는 자리라 TSV 약속을 여기 모은다.

## 하지 말 것

- 정규식으로 따옴표를 처리하려 들지 마라. 칸 안의 줄바꿈과 `""` 이스케이프가 섞여 있어 정규식으로는 못 가른다. 아래 글자 단위 루프를 그대로 써라.
- 붙여넣기만 고치고 복사를 두지 마라. 둘이 짝이다. 한쪽만 고치면 웹에서 복사한 값을 웹에 다시 붙일 때 깨진다.
- 호출처를 하나라도 빠뜨리지 마라. 아래 일곱 자리가 전부다.
- 파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라.

---

## 파일별 조치

### 1. `src/data/range-tsv.ts`

파일 **맨 아래**에 두 함수를 더한다.

```ts
/**
 * 엑셀 클립보드(TSV)를 격자로 읽는다(R390). RFC 4180 따옴표 규칙을 따른다.
 *
 * 엑셀은 줄바꿈이나 탭이 든 칸을 `"`로 감싸고 칸 안의 `"`는 `""`로 두 번 쓴다.
 * 따옴표를 안 보고 줄과 탭으로만 쪼개면 **여러 줄 칸 하나가 여러 행으로 흩어진다.**
 * 2026-11-06에 REQUEST 표에서 개발요청 한 칸이 스타일 네 개로 퍼졌다.
 *
 * 따옴표는 **칸이 비어 있을 때만** 연다. `abc"def`의 `"`는 그냥 글자다. 엑셀도 그렇게 쓴다.
 * 칸 안의 CRLF는 `\n` 하나로 맞춘다.
 */
export function parseTsvGrid(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let i = 0
  const endField = () => { row.push(field); field = "" }
  const endRow = () => { endField(); rows.push(row); row = [] }
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i += 2; continue }
        quoted = false; i += 1; continue
      }
      if (ch === "\r") { if (text[i + 1] === "\n") i += 1; field += "\n"; i += 1; continue }
      field += ch; i += 1; continue
    }
    if (ch === "\"" && field === "") { quoted = true; i += 1; continue }
    if (ch === "\t") { endField(); i += 1; continue }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      endRow(); i += 1; continue
    }
    field += ch; i += 1
  }
  endRow()
  // 끝의 빈 줄은 버린다. 예전 `.replace(/\n+$/, "")`와 같은 효과다.
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop()
  return rows
}

/**
 * 칸 하나를 TSV 글자로 바꾼다(R390). 탭·줄바꿈·따옴표가 있으면 감싸고 `"`를 두 번 쓴다.
 * 감싸지 않으면 엑셀이 그 칸을 여러 칸으로 읽는다.
 */
export function tsvCell(value: string): string {
  return /["\t\r\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value
}
```

### 2. `src/routes/FabricRequest.tsx`

#### 2-1. import

`combineRangeTsv`를 안 쓰는 파일이므로 새로 가져온다. `@/data/...` import 들 사이에 더한다.

```ts
import { parseTsvGrid, tsvCell } from "@/data/range-tsv"
```

#### 2-2. 복사 (1808행 근처)

지금 코드:

```ts
        values.push(line && (column.scope === "option" || firstSlot) ? column.id === "urgent" ? (line.style.urgent ? "Y" : "") : rawValue(line, column.id) : "")
```

이렇게 바꾼다:

```ts
        values.push(tsvCell(line && (column.scope === "option" || firstSlot) ? column.id === "urgent" ? (line.style.urgent ? "Y" : "") : rawValue(line, column.id) : ""))
```

#### 2-3. 붙여넣기 (1822행)

지금 코드:

```ts
    const grid = value.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
```

이렇게 바꾼다:

```ts
    const grid = parseTsvGrid(value)
```

### 3. `src/routes/DevelopmentMasterSheet.tsx`

이미 `@/data/range-tsv`에서 `combineRangeTsv` 등을 가져오고 있다(30행). **그 줄에 `parseTsvGrid`와 `tsvCell`을 더한다.** 새 import 줄을 만들지 마라.

#### 3-1. 복사 `rangeToTsv` (2422행)

지금 코드:

```ts
        cells.push(column ? rawCellText(record, column, scope) : "")
```

이렇게 바꾼다:

```ts
        cells.push(tsvCell(column ? rawCellText(record, column, scope) : ""))
```

#### 3-2. `insertCopiedRows`의 파싱 (2652행)

지금 코드:

```ts
    const grid = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"))
```

이렇게 바꾼다:

```ts
    const grid = parseTsvGrid(text)
```

#### 3-3. `pasteRange`의 파싱 (2898행)

위와 같은 한 줄이다. 똑같이 바꾼다.

```ts
    const grid = parseTsvGrid(text)
```

### 4. `src/routes/Warehouse.tsx`

이미 43행에서 `@/data/range-tsv`를 가져오고 있다. **그 줄에 `tsvCell`을 더한다.**

복사 `rectTsv` (1733행) 지금 코드:

```ts
        cells.push(column ? cellValue(item, column.id) : "")
```

이렇게 바꾼다:

```ts
        cells.push(tsvCell(column ? cellValue(item, column.id) : ""))
```

`cellValue`가 문자열이 아닌 값을 돌려주면 `String(...)`으로 감싸고 넣어라. 타입 검사에서 걸리면 그때만 고친다.

### 5. `src/components/warehouse/Fabric1IntakeDialog.tsx`

import에 더한다.

```ts
import { parseTsvGrid } from "@/data/range-tsv"
```

`handlePaste` (239~241행) 지금 코드:

```ts
    const lines = text.replace(/\r\n?/g, "\n").split("\n")
    if (lines.at(-1) === "") lines.pop()
    const grid = lines.map((line) => line.split("\t"))
```

세 줄을 한 줄로 바꾼다.

```ts
    const grid = parseTsvGrid(text)
```

그 위의 이른 반환(`if (!text.includes("\t") && !/[\r\n]/.test(text)) return`)은 **그대로 둔다.** 칸 하나짜리 글자는 브라우저 기본 붙여넣기에 맡기는 장치다.

---

## 검증

```
npm run build
```

`tsc --noEmit`을 포함한다. 한 번만 돌린다.

끝난 뒤 `git status --short`로 위 다섯 파일만 바뀌었는지 본다.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다. 바꾼 코드를 다시 붙이지 마라.
