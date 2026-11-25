# R458 — 채우기 핸들에 더블클릭과 연속 채우기를 넣는다

상태: 미착수. 자리와 위험한 열 확인 완료, 시공 대기.

## 요구

2026-11-25 박향근. 엑셀 대비 부족한 점 검토에서 나온 둘이다.

1. **채우기 핸들 더블클릭.** 엑셀은 더블클릭하면 옆 열에 값이 있는 데까지 아래로 채운다. 지금은 `onMouseDown` 만 달려 있어 수백 행을 손으로 끌어야 한다.
2. **연속 채우기.** 지금 `commitFill` 은 원본 값을 되풀이만 한다. `1` 을 끌면 엑셀은 `1, 2, 3`, 여기는 `1, 1, 1` 이다.

## 설계에서 정한 것 둘

### 한 칸만 끌면 그대로 복사한다. 엑셀과 다르다.

엑셀은 **날짜 한 칸**을 끌면 하루씩 올린다. **그 동작을 가져오지 않는다.**

DD 에서 가장 흔한 동작이 **한 Style 의 옵션 여러 행에 같은 날짜를 넣는 것**이다. 수취일, 공정 완료일, 납기가 다 그렇다. 지금 그 칸을 끌면 같은 날짜가 복사되고 팀이 그렇게 쓰고 있다. 하루씩 올라가게 바꾸면 **사람이 같은 값을 기대한 자리에 조용히 다른 날짜가 박힌다.** 틀린 것이 눈에 안 띄는 변경이라 하지 않는다.

**연속은 원본이 두 칸 이상일 때만이다.** `11-25` 와 `11-26` 을 골라 끌면 그것은 사람이 패턴을 보여 준 것이라 이어 세운다. 숫자도 같다. 한 칸이면 복사, 두 칸 이상이고 간격이 일정하면 연속이다.

### FL#, Style No., 선택형 열에는 연속을 걸지 않는다

- **FL# 은 RDDA 원장에서 받는 번호다.** `FL26110004` 다음에 `FL26110005` 를 지어내면 등록된 적 없는 번호가 장부에 들어간다. 창고와 RDDA 집계가 그 번호로 돈다.
- **Style No. 는 REQUEST·샘플대장과 맞추는 키다.** 번호를 올리면 매칭이 조용히 깨진다.
- **선택형 열**(`column.options`)은 이어 세울 것이 없다.

이 셋은 지금처럼 되풀이한다.

## 조치

파일 둘이다. 새 파일 하나와 `src/routes/DevelopmentMasterSheet.tsx`.

### 1. 새 파일 `src/data/fill-series.ts`

순수 함수 하나다. React 를 모르고 저장소 밖 하네스로 검증할 수 있어야 해서 따로 뺀다.

```ts
/**
 * 채우기 핸들이 이어서 넣을 값들(R458). 연속으로 볼 수 없으면 `null` 이고
 * 그때 호출하는 쪽은 지금까지처럼 원본을 되풀이한다.
 *
 * `source` 는 끄는 방향으로 늘어선 원본 칸의 값이고 `count` 는 새로 채울 칸 수다.
 *
 * **한 칸짜리 원본은 언제나 `null` 이다.** 엑셀은 날짜 한 칸을 끌면 하루씩 올리지만
 * DD 는 한 Style 의 옵션 행에 같은 날짜를 넣는 일이 훨씬 흔하다. 하루씩 올리면
 * 사람이 같은 값을 기대한 자리에 다른 날짜가 조용히 박힌다. **되돌리지 말 것.**
 */
export function fillSeriesValues(source: readonly string[], count: number): string[] | null {
  if (count <= 0 || source.length < 2) return null
  const values = source.map((item) => String(item ?? "").trim())
  if (values.some((item) => !item)) return null

  const dates = values.map(dayNumber)
  if (dates.every((item) => item !== null)) {
    const step = stepOf(dates as number[])
    if (step === null) return null
    const last = dates[dates.length - 1] as number
    return Array.from({ length: count }, (_, index) => dateText(last + step * (index + 1)))
  }

  const numbers = values.map(numberValue)
  if (numbers.every((item) => item !== null)) {
    const step = stepOf(numbers as number[])
    if (step === null) return null
    const digits = Math.max(...values.map(decimals))
    const last = numbers[numbers.length - 1] as number
    return Array.from({ length: count }, (_, index) => (last + step * (index + 1)).toFixed(digits))
  }

  return null
}

/** 간격이 일정하면 그 값, 아니면 `null`. 소수 오차는 눈감아 준다. */
function stepOf(values: number[]): number | null {
  const step = values[1] - values[0]
  for (let index = 2; index < values.length; index += 1) {
    if (Math.abs(values[index] - values[index - 1] - step) > 1e-9) return null
  }
  return step
}

/** `YYYY-MM-DD` 만 날짜로 본다. 그 밖에는 `null`. 1970-01-01 부터 센 날수를 돌려준다. */
function dayNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  // 2026-02-31 처럼 달력에 없는 날짜를 거른다.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.round(time / 86400000)
}

/** 날수를 `YYYY-MM-DD` 로 되돌린다. UTC 로만 다뤄 시간대에 흔들리지 않는다. */
function dateText(days: number): string {
  const date = new Date(days * 86400000)
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 숫자 하나로만 된 칸이면 그 값. `12개` 나 `1,200` 은 숫자로 보지 않는다. */
function numberValue(value: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 소수점 아래 자릿수. 원본이 `1.5` 면 결과도 한 자리로 맞춘다. */
function decimals(value: string): number {
  const dot = value.indexOf(".")
  return dot < 0 ? 0 : value.length - dot - 1
}
```

**날짜를 `new Date(문자열)` 로 파싱하지 말 것.** 시간대에 따라 하루가 밀린다. 저장 형식이 `YYYY-MM-DD` 하나뿐이라 직접 쪼개는 것이 맞다.

**`1,200` 같은 쉼표 숫자를 받지 말 것.** 결과를 쉼표 없이 돌려주면 같은 열에 두 표기가 섞인다.

### 2. `src/routes/DevelopmentMasterSheet.tsx` — import

```ts
import { fillSeriesValues } from "@/data/fill-series"
```

다른 `@/data/...` import 들 옆이다.

### 3. 연속을 걸지 않는 열 (모듈 레벨, `COMPUTED_COLUMN_IDS` 근처 888행)

```ts
/**
 * 연속 채우기를 걸지 않는 열(R458). 되풀이는 그대로 된다.
 * **FL# 은 RDDA 원장에서 받는 번호다.** 다음 번호를 지어내면 등록된 적 없는 번호가 장부에 들어간다.
 * **Style No. 는 REQUEST·샘플대장과 맞추는 키다.** 번호를 올리면 매칭이 조용히 깨진다.
 * 선택형 열(`options`)은 이어 세울 것이 없다.
 */
const SERIES_BLOCKED_IDS = new Set(["flNo", "styleNo"])
const seriesAllowed = (column: MasterColumn): boolean => !SERIES_BLOCKED_IDS.has(column.id) && !column.options
```

### 4. `commitFill` 의 두 분기를 바꾼다 (2733행 근처)

`write` 바로 아래에 값 하나를 직접 쓰는 짝을 더한다.

```ts
    /** `write` 와 같되 다른 칸이 아니라 주어진 글자를 넣는다. 연속 채우기가 쓴다(R458). */
    const writeValue = (rowIndex: number, colIndex: number, value: string) => {
      const record = filtered[rowIndex]
      const column = displayedColumns[colIndex]
      if (!record || !column || isLockedCell(record, column, isAdmin)) return
      const identity = recordIdentity(record)
      const draft = edits.get(identity) ?? record
      const next = updateRecordCell(draft, column, value, allowedFor(column, optionsById))
      if (next !== draft) { edits.set(identity, next); changed += 1 }
    }

    /** 그 줄의 원본 값들로 연속 값을 뽑는다. 연속이 아니면 `null` 이고 호출하는 쪽이 되풀이한다. */
    const seriesFor = (colIndex: number, rowIndex: number, vertical: boolean, count: number): string[] | null => {
      const column = displayedColumns[vertical ? colIndex : colIndex]
      if (!column || !seriesAllowed(column)) return null
      const length = vertical ? source.bottom - source.top + 1 : source.right - source.left + 1
      const picked: string[] = []
      for (let index = 0; index < length; index += 1) {
        const record = vertical ? filtered[source.top + index] : filtered[rowIndex]
        const target = vertical ? column : displayedColumns[source.left + index]
        if (!record || !target) return null
        if (!vertical && !seriesAllowed(target)) return null
        picked.push(rawCellText(record, target, scope))
      }
      return fillSeriesValues(picked, count)
    }
```

아래로 끄는 분기를 바꾼다.

```ts
    if (target.bottom > source.bottom) {
      const height = source.bottom - source.top + 1
      const count = target.bottom - source.bottom
      for (let col = source.left; col <= source.right; col += 1) {
        // 세로는 열마다 따로 센다. 한 열의 값만 모아 보고 연속인지 판단한다(R458).
        const series = seriesFor(col, source.top, true, count)
        for (let row = source.bottom + 1; row <= target.bottom; row += 1) {
          if (series) writeValue(row, col, series[row - source.bottom - 1])
          else write(row, col, source.top + ((row - source.top) % height), col)
        }
      }
    } else if (target.right > source.right) {
      const width = source.right - source.left + 1
      const count = target.right - source.right
      for (let row = source.top; row <= source.bottom; row += 1) {
        // 가로는 행마다 따로 센다.
        const series = seriesFor(source.left, row, false, count)
        for (let col = source.right + 1; col <= target.right; col += 1) {
          if (series) writeValue(row, col, series[col - source.right - 1])
          else write(row, col, row, source.left + ((col - source.left) % width))
        }
      }
    }
```

**되풀이 경로(`write`)를 지우지 말 것.** 연속이 아닌 값은 전부 그 길로 간다.

**`scope`(`scopeIdsOf`)를 `rawCellText` 에 계속 넘길 것.** 목표 열이 범위에 함께 있으면 완료 칸이 목표일을 담지 않는 R383 규칙이다. 빠뜨리면 아무도 손대지 않은 공정에 완료일이 생긴다.

### 5. 더블클릭으로 아래 끝까지 채우기 (`startFill` 바로 아래, 2427행 근처)

```ts
  /**
   * 채우기 핸들 더블클릭. 엑셀처럼 **옆 열에 값이 있는 데까지** 아래로 채운다(R458).
   *
   * 기준 열은 선택 범위 **왼쪽 바로 옆**이고, 왼쪽이 없으면(맨 왼쪽 칸이면) 오른쪽이다.
   * 담당·Status·Style No. 가 늘 왼쪽에 고정이라 대개 그 셋 중 하나가 기준이 된다.
   * **행 끝까지 무조건 채우지 말 것.** 담당 탭에 수백 행이 있어 엉뚱한 Style 까지 덮는다.
   */
  const fillToBlockEnd = () => {
    if (!editEnabled) { notify(editDeniedMessage); return }
    if (!rect) return
    const anchor = displayedColumns[rect.left > 0 ? rect.left - 1 : rect.right + 1]
    if (!anchor) { notify("기준이 될 옆 열이 없습니다."); return }
    let bottom = rect.bottom
    while (bottom + 1 < filtered.length) {
      const record = filtered[bottom + 1]
      if (!record || !rawCellText(record, anchor).trim()) break
      bottom += 1
    }
    if (bottom <= rect.bottom) { notify("아래로 채울 행이 없습니다."); return }
    void commitFill(rect, { ...rect, bottom })
  }
```

### 6. `FillHandle` 에 더블클릭을 단다

```ts
function FillHandle({ visible, onMouseDown, onDoubleClick }: { visible: boolean; onMouseDown: (event: ReactMouseEvent<HTMLSpanElement>) => void; onDoubleClick: (event: ReactMouseEvent<HTMLSpanElement>) => void }) {
  if (!visible) return null
  return <span data-fill-handle aria-hidden="true" onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} className="absolute -bottom-1 -right-1 z-30 size-[7px] cursor-crosshair border border-white bg-[var(--grid-selection)]" />
}
```

`GridActions`(1445행)에 한 줄을 더한다.

```ts
  fillDoubleClick: (event: ReactMouseEvent<HTMLSpanElement>) => void
```

`GridCell` 안(1497행 근처)에서 받는다.

```ts
  const onFillDoubleClick = actions.fillDoubleClick
```

`<FillHandle ... />` 호출처는 **셋이다. 하나도 빠뜨리지 말 것.** 1524행, 1547행, 그리고 Status 칸(3968행 근처)이다. 앞 둘은 `onDoubleClick={onFillDoubleClick}`, Status 칸은 컴포넌트 안이라 `onDoubleClick={fillHandleDoubleClick}` 처럼 지역 핸들러를 직접 쓴다.

핸들러 본체는 `gridActions`(3830행 근처)와 Status 칸이 같은 식이다.

```ts
    fillDoubleClick: (event) => {
      event.preventDefault()
      event.stopPropagation()
      gridActionsRef.current.fillToBlockEnd()
    },
```

`gridActionsRef` 가 담는 객체에도 `fillToBlockEnd` 를 더한다(3828~3829행 두 줄 모두).

**`stopPropagation` 을 빼지 말 것.** 핸들이 셀 안에 있고 그 셀의 `onDoubleClick` 이 인라인 편집기를 연다. 막지 않으면 채우기와 편집이 같이 일어난다.

## 하지 말 것

- **한 칸짜리 원본에 연속을 걸지 말 것.** 위 「설계에서 정한 것」 참고. 날짜가 조용히 틀어진다.
- **`flNo`, `styleNo`, 선택형 열에 연속을 걸지 말 것.**
- **되풀이 경로(`write`)를 지우지 말 것.**
- **`rawCellText` 에 `scope` 넘기는 것을 빠뜨리지 말 것**(R383).
- **`Ctrl+D`(`fillDown`)는 건드리지 말 것.** 엑셀도 그것은 복사이고 연속이 아니다.
- **`isLockedCell` 검사를 `writeValue` 에서 빼지 말 것**(R376). `write` 와 같은 가드다.
- **`updateRecordCell` 을 거치지 않는 쓰기를 만들지 말 것.** 값 검증과 R374 공정 날짜 경로가 거기 있다.
- **더블클릭이 행 끝까지 채우게 하지 말 것.** 옆 열이 빈 자리에서 멈춘다.
- **`FillHandle` 호출처 셋 중 하나도 빠뜨리지 말 것.**
- **`stopPropagation` 을 빼지 말 것.** 편집기가 같이 열린다.
- **`src/data/fill-series.ts` 에 React 나 `@/routes` 를 import 하지 말 것.** 저장소 밖 하네스로 검증한다.
- **다른 화면(`FabricRequest.tsx`)의 채우기 핸들은 이번에 고치지 않는다.** 박향근이 DD 를 말했다. 따로 정한다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 파일을 삭제하지 마라. 새로 만드는 파일은 `src/data/fill-series.ts` 하나다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `public/data` 아래 JSON 을 열지 마라.
- 테스트 파일을 저장소 안에 만들지 마라. 검증은 클로드가 저장소 밖에서 한다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build`(`tsc --noEmit` 포함) 한 번. 모든 수정을 마친 뒤에 돌린다.

`fillSeriesValues` 의 값 검증은 클로드가 저장소 밖 하네스로 한다. Codex 는 하지 않는다.

실제 동작은 박향근이 화면에서 본다. 볼 것은 셋이다. 날짜 두 칸(`11-25`, `11-26`)을 골라 끌면 하루씩 이어지는지, 한 칸만 끌면 같은 날짜가 복사되는지, 핸들을 더블클릭하면 옆 열에 값이 있는 데까지 내려가는지다.
