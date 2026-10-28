# R354 — 분석 엑셀 차트 전용 배치

**상태: 미착수.** R352(분석 → 의뢰 넘기기)와 R353(Garment Number, 열 이름)은 구현과 빌드를 마쳤다.

## 배경

2026-10-28 박향근 요구 셋이다.

1. 분석 화면에서 받는 엑셀에는 **기본 밴드 세 열(스타일, 차트, 단계)을 빼고** 내보낸다.
2. Garment Number 하나마다 **옵션 행을 4줄**로 만들고, **옵션 밴드가 아닌 열은 그 4줄을 세로 병합**한다.
3. 그 파일을 **DEVELOPMENT REQUEST 화면에서 업로드**할 수 있어야 한다.

FABRIC REQUEST 화면에서 받는 양식(`requestTemplateFileName`)은 **지금 그대로 둔다.** 이번 변경은 분석 화면 내려받기 한 곳에만 건다.

## 지금 코드

`src/data/request-template.ts` 하나에 작성기와 파서가 같이 있다. 열 정의 `TEMPLATE_COLUMNS` 23개를 둘이 공유한다.

- 작성기 `buildRequestWorkbook(styles)` — 1행 밴드 병합, 2행 열 이름, 3행부터 데이터. 스타일 값은 **묶음 첫 행에만** 적고 아래 옵션 행은 비운다.
- 파서 `parseRequestWorkbook(workbook)` — 2행 열 이름으로 열 위치를 찾고, Garment Number가 **채워진 행을 스타일 행**, 그 아래 **빈 행을 옵션 행**으로 읽는다.

**세로 병합은 파서를 이미 통과한다.** SheetJS는 병합 구간에서 왼쪽 위 칸에만 값을 주고 나머지는 빈 칸이라, 병합된 스타일 열은 지금 규칙(아래 행은 비어 있어야 같은 스타일)에 그대로 맞는다. **병합을 받으려고 파서의 스타일 묶기 규칙을 고치지 마라.**

## 1. 작성기에 선택 인자를 둔다

`buildRequestWorkbook`에 두 번째 인자를 더한다. 기본값은 지금 동작 그대로여야 한다.

```ts
export interface RequestWorkbookOptions {
  /** 기본 밴드(스타일·차트·단계)를 빼고 쓴다. 분석 내려받기 전용(R354). */
  dropBasicBand?: boolean
  /** 스타일마다 최소 이만큼 행을 만든다. 남는 줄은 Opt 번호만 적힌 빈 줄이다. */
  minOptionRows?: number
  /** 스타일 밴드(scope가 style인 열)를 그 스타일의 행 수만큼 세로 병합한다. */
  mergeStyleCells?: boolean
  /** 열 너비를 REQUEST 화면 비율로 맞춘다(7절). */
  matchScreenWidths?: boolean
}

export async function buildRequestWorkbook(
  styles: readonly RequestStyle[] = [],
  options: RequestWorkbookOptions = {},
): Promise<Blob> {
```

함수 맨 위에서 쓸 열 목록을 한 번 정한다. **아래 모든 반복문이 `TEMPLATE_COLUMNS`가 아니라 이 목록을 본다.**

```ts
  const columns = options.dropBasicBand ? TEMPLATE_COLUMNS.filter((column) => column.band !== "기본") : TEMPLATE_COLUMNS
```

같이 고칠 곳이 넷이다.

- **열 너비**(133행 근처) `TEMPLATE_COLUMNS.forEach` → `columns.forEach`.
- **밴드 병합**(136행 근처) `bandRanges()`가 `TEMPLATE_COLUMNS`를 직접 읽는다. 인자를 받게 고친다. `function bandRanges(columns: readonly TemplateColumn[])`, 호출은 `bandRanges(columns)`. 다른 호출처는 없다.
- **2행 열 이름**(147행 근처) `TEMPLATE_COLUMNS.forEach` → `columns.forEach`.
- **CONS 드롭다운**(216행) `const consColumn = columnIndex("construction") + 1`. `columnIndex`도 목록을 받게 고친다. `const columnIndex = (columns: readonly TemplateColumn[], key: string) => columns.findIndex((column) => column.key === key)`. 다른 호출처는 없다.

**고정 틀(frozen pane)도 따라가야 한다.** 지금 `xSplit: 4`는 Garment Number까지 얼리려는 값인데 기본 밴드를 빼면 그 열이 1열로 올라온다.

```ts
  const frozen = columnIndex(columns, "garmentNo") + 1
  const ws = workbook.addWorksheet("REQUEST", { views: [{ state: "frozen", xSplit: frozen, ySplit: 2 }] })
```

## 2. 옵션 행을 채우고 스타일 열을 병합한다

지금 데이터 행 루프(160행 근처)다.

```ts
  let rowIndex = 3
  for (const style of styles) {
    const options: (RequestOption | null)[] = style.options.length ? style.options : [null]
    options.forEach((option, offset) => {
```

이것을 이렇게 바꾼다.

```ts
  let rowIndex = 3
  for (const style of styles) {
    const own: (RequestOption | null)[] = style.options.length ? style.options : [null]
    // 모자라는 만큼 빈 줄을 붙인다. 빈 줄에는 Opt 번호만 적힌다(아래 cellOf 설명).
    const pad = Math.max(0, (options.minOptionRows ?? 0) - own.length)
    const lines: (RequestOption | null)[] = [...own, ...Array.from({ length: pad }, () => null)]
    const startRow = rowIndex
    lines.forEach((option, offset) => {
      const row = ws.getRow(rowIndex++)
      columns.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        if (column.scope === "style" && offset > 0) cell.value = null
        else if (column.key === "no") cell.value = offset + 1
        else cell.value = cellOf(style, option, column.key)
        // 글꼴·정렬·테두리는 지금 코드 그대로 둔다.
      })
    })
    const endRow = rowIndex - 1
    if (options.mergeStyleCells && endRow > startRow) {
      columns.forEach((column, index) => {
        if (column.scope !== "style") return
        ws.mergeCells(startRow, index + 1, endRow, index + 1)
      })
    }
  }
```

지켜야 할 것.

- **값을 먼저 쓰고 그다음에 병합한다.** exceljs는 병합할 때 왼쪽 위 칸 값만 남기고 나머지를 거기에 묶는다. 순서를 뒤집으면 값이 사라진다.
- **`Opt` 번호는 빈 줄에도 적는다.** 적지 않으면 그 행이 통째로 비고, 파서가 `sheet_to_json`을 `blankrows: false`로 읽어 **행 자체가 사라진다.** 사람이 2번 옵션부터 적을 자리가 없어진다.
- `cellOf`는 손대지 않는다. 위 분기에서 `no`를 가로채므로 `option`이 `null`이어도 번호가 나간다.
- `mergeStyleCells`를 주지 않으면 `mergeCells`를 한 번도 부르지 않는다. REQUEST 화면 양식은 지금 모양 그대로여야 한다.
- 병합 칸 정렬은 지금 값(`vertical: "top"`)을 그대로 둔다.

## 3. 파서가 기본 밴드 세 열을 없어도 읽게 한다

지금은 `optional`이 아닌 열이 없으면 던진다(286행 근처).

```ts
    else if (!column.optional) throw new Error(`양식이 다릅니다. 2행에 "${column.head}" 열이 없습니다. ...`)
```

`seq`, `chart`, `stage`는 **업로드할 때 보드에서 정해지는 값**이라 파일에 없어도 된다. `TemplateColumn`에 필드를 더한다.

```ts
  /**
   * 파일에 없어도 되는 열(R354). 업로드할 때 활성 보드에서 값이 정해진다.
   * `optional`과 다르다. `optional`은 "옛 양식에 없던 열"이고 이쪽은 "분석 내려받기가 일부러 뺀 열"이다.
   */
  derivable?: boolean
```

`seq`, `chart`, `stage` 세 열에 `derivable: true`를 준다. **`optional: true`를 주지 마라.** 두 뜻이 섞이면 다음 사람이 어느 쪽 이유로 빠진 열인지 알 수 없다.

찾기 루프를 고친다.

```ts
  const derived: string[] = []
  for (const column of TEMPLATE_COLUMNS) {
    const names = [column.head, ...(column.aliases ?? [])]
    const found = header.findIndex((head) => names.includes(head))
    if (found >= 0) indexByKey.set(column.key, found)
    else if (column.derivable) derived.push(column.key)
    else if (!column.optional) throw new Error(`양식이 다릅니다. 2행에 "${column.head}" 열이 없습니다. 내려받은 양식을 그대로 쓰세요.`)
  }
```

`RequestParseResult`에 결과를 싣는다.

```ts
export interface RequestParseResult {
  styles: RequestStyle[]
  /** 사람이 고칠 수 있는 문제만 담는다. 치명적이면 throw 한다. */
  warnings: string[]
  /** 파일에 없어서 화면이 채워야 하는 열(R354). 지금은 seq, chart, stage 셋이다. */
  derivedColumns: string[]
}
```

맨 끝 `return { styles, warnings }`를 `return { styles, warnings, derivedColumns: derived }`로 바꾼다.

**없는 열의 기본값은 이미 맞다.** `at()`이 `indexByKey`에 없는 키에 `null`을 주므로 `chart`는 `""`, `stage`는 `"분석"`, `seq`는 `styles.length + 1`이 된다. 그 세 줄을 고치지 마라.

## 4. 빈 옵션 줄을 조용히 건너뛴다

지금 파서는 Opt 번호만 있는 행에 경고를 남긴다(343행 근처).

```ts
    if (!hasOption) {
      if (!trailingRemark) warnings.push(`${excelRow}행: Garment Number도 옵션 값도 없어 건너뛰었습니다.`)
      continue
    }
```

4줄짜리 양식을 올리면 **스타일마다 경고가 최대 3건** 쌓여 진짜 문제가 묻힌다. Opt 번호만 적힌 줄은 "사람이 안 채운 빈 자리"이지 잘못이 아니다.

`hasOption` 바로 아래에 판정을 하나 더 둔다.

```ts
    // Opt 번호만 적힌 줄은 내려받은 양식의 빈 자리다. 경고 없이 건너뛴다(R354).
    const onlyOptNo = !hasOption && asText(at(row, "no")) !== ""
      && TEMPLATE_COLUMNS.every((column) => column.key === "no" || asText(at(row, column.key)) === "")
```

그리고 경고 줄을 이렇게 바꾼다.

```ts
    if (!hasOption) {
      if (!trailingRemark && !onlyOptNo) warnings.push(`${excelRow}행: Garment Number도 옵션 값도 없어 건너뛰었습니다.`)
      continue
    }
```

**빈 줄에 옵션을 만들지 마라.** 값이 하나도 없는 옵션이 생기면 화면에 빈 줄이 그대로 남고 DD 연결 대상에도 뜬다. 사람이 채운 줄만 옵션이 된다.

## 5. 분석 화면이 새 인자를 쓴다

`src/routes/FabricAnalysis.tsx`의 `downloadRequestChart`(305행).

```ts
      const styles = pick.targets.map((item, index) => buildRequestStyleFromAnalysis(item, { boardId: "", chart: "", seq: index + 1 }))
      const blob = await buildRequestWorkbook(styles)
```

두 번째 줄을 바꾼다.

```ts
      const blob = await buildRequestWorkbook(styles, { dropBasicBand: true, minOptionRows: 4, mergeStyleCells: true, matchScreenWidths: true })
```

첫 줄은 그대로 둔다. `boardId`와 `chart`를 빈 값으로 주는 것이 맞다. 그 열은 이제 파일에 나가지도 않는다.

`buildRequestStyleFromAnalysis`는 **고치지 마라.** 웹으로 바로 넘기는 길은 지금처럼 빈 옵션 1줄이다. 화면에서는 옵션을 한 번 눌러 더하면 되고, 엑셀만 미리 자리를 내줘야 한다.

## 6. 업로드가 스타일 번호를 다시 매긴다

`src/routes/FabricRequest.tsx`의 `ingest`(1781행 근처). 지금은 이렇다.

```ts
      const parsed = parseRequestWorkbook(workbook)
      const ignored = parsed.styles.filter((style) => style.chart.trim() && style.chart.trim() !== activeBoardInfo.name).length
      const incoming = parsed.styles.map((style) => ({ ...style, boardId: activeBoard, chart: activeBoardInfo.name }))
```

`boardId`와 `chart`는 이미 활성 보드 값으로 덮으므로 그 두 열이 없어도 문제가 없다. **`seq`는 덮지 않는다.** 스타일 열이 없는 파일은 파서가 1, 2, 3…으로 매기므로 보드에 이미 있는 번호와 겹친다.

`incoming`을 만드는 줄을 이렇게 바꾼다.

```ts
      // 스타일 열이 없는 파일(분석 내려받기)은 번호를 보드 기준으로 다시 매긴다.
      // 이미 있는 Garment No.는 그 스타일의 번호를 그대로 쓴다. 재업로드로 순서가 흔들리지 않게 하려는 것이다.
      const renumber = parsed.derivedColumns.includes("seq")
      const seqByGarment = new Map(requests
        .filter((style) => style.boardId === activeBoard)
        .map((style) => [style.garmentNo.trim().toLocaleUpperCase("en-US"), style.seq]))
      let nextSeq = nextBoardSeq(requests, activeBoard)
      const incoming = parsed.styles.map((style) => {
        const base = { ...style, boardId: activeBoard, chart: activeBoardInfo.name }
        if (!renumber) return base
        const found = seqByGarment.get(style.garmentNo.trim().toLocaleUpperCase("en-US"))
        return { ...base, seq: found ?? nextSeq++ }
      })
```

`nextBoardSeq`는 이 파일 22행에서 이미 가져오고 있다. 새 import를 더하지 마라.

`ignored` 줄은 그대로 둔다. `chart`가 빈 문자열이면 세지 않으므로 "차트 열 값 N건 무시" 문구가 뜨지 않는다.

## 7. 열 너비를 화면 비율로 맞춘다

2026-10-28 박향근 추가 요구다. 받은 파일을 열었을 때 화면과 같은 폭으로 보여야 어느 열인지 바로 안다.

`TemplateColumn`에 필드를 더한다.

```ts
  /**
   * REQUEST 화면 열 너비(px, R354). `FabricRequest.tsx`의 `FIXED_COLUMNS`·`GROUPS` 값을 그대로 옮긴 것이다.
   * 화면 너비를 고치면 여기도 같이 고친다. 엑셀 폭은 글자 수 단위라 `screenWidth / 7`로 환산한다.
   */
  screenWidth?: number
```

`TEMPLATE_COLUMNS`의 각 열에 아래 값을 준다. **화면에 없는 열(스타일, 차트, 단계)에는 주지 않는다.** 분석 내려받기는 그 세 열을 빼고, 다른 길은 이 인자를 쓰지 않는다.

| key | screenWidth |
|---|---|
| garmentNo | 120 |
| brand | 100 |
| contents | 150 |
| origConstruction | 120 |
| origWeight | 80 |
| yarnAnalysis | 180 |
| devConstruction | 120 |
| comment | 160 |
| analyst | 90 |
| urgent | 64 |
| requester | 90 |
| developer | 90 |
| devPlan | 200 |
| no | 50 |
| yarnDetail | 180 |
| construction | 130 |
| weight | 64 |
| color | 120 |
| dyeingMethod | 90 |
| remark | 220 |

열 너비를 정하는 줄(133행 근처)을 이렇게 바꾼다.

```ts
  // 엑셀 폭 1은 기본 글꼴 숫자 한 자 폭이다. 화면 px를 7로 나누면 두 화면이 거의 같은 비율로 보인다.
  const widthOf = (column: TemplateColumn): number => {
    if (!options.matchScreenWidths || column.screenWidth === undefined) return column.width
    return Math.min(42, Math.max(6, Math.round(column.screenWidth / 7)))
  }
  columns.forEach((column, index) => { ws.getColumn(index + 1).width = widthOf(column) })
```

**`column.width` 값을 고치지 마라.** REQUEST 화면 양식은 지금 폭 그대로 나가야 한다. 이번 환산은 `matchScreenWidths`를 준 길에서만 먹는다.

**상·하한을 빼지 마라.** 화면 열 너비는 사람이 끌어 바꿀 수 있는 값이 아니라 여기 적힌 기본값이지만, 나중에 누가 큰 값을 넣으면 엑셀 열 하나가 화면을 가득 메운다.

## 하지 말 것

- **FABRIC REQUEST 화면의 내려받기를 바꾸지 마라.** `downloadBlob(await buildRequestWorkbook(visible), requestTemplateFileName())`는 인자 없이 그대로다. 기본 밴드도 병합도 그 파일에는 없어야 한다.
- **`TEMPLATE_COLUMNS`의 열 순서와 이름을 바꾸지 마라.** 이번 건은 "쓸 때 거른다"이지 정의를 지우는 것이 아니다. 기존 양식 파일이 계속 읽혀야 한다.
- **`seq`, `chart`, `stage`에 `optional: true`를 주지 마라.** 3절에 쓴 이유다.
- **파서의 스타일 묶기 규칙(Garment No.가 있으면 스타일, 없으면 옵션)을 고치지 마라.** 병합은 이미 이 규칙에 맞는다.
- `mergeRequestStyles`를 고치지 마라. 병합 키는 `boardId + Garment No.` 그대로다.
- `commitRequests` 말고 다른 저장 경로를 만들지 마라.
- 화면 표(`FabricRequest.tsx`의 열 라벨과 그리드)를 고치지 마라. 이번 건은 엑셀 파일 이야기다.

## 검증

```
npm run build
```

통과하면 된다. 다른 검증은 하지 마라. 빌드 뒤 `git status --short`로 명세에 없는 파일이 바뀌지 않았는지 본다.

고칠 파일은 셋이다. `src/data/request-template.ts`, `src/routes/FabricAnalysis.tsx`, `src/routes/FabricRequest.tsx`.

엑셀 실물과 왕복(내려받기 → 업로드) 확인은 클로드가 헤드리스 하네스로 한다. 화면 확인은 박향근이 한다.
