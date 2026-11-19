# R439 — 창고 표에 GD#/SA#와 Arrange# 열을 더한다

상태: 미착수

## 배경

창고 표에 GD#/SA# 열이 없다. 2026-11-19 박향근 요청이다.

**데이터를 옮길 필요가 없다.** 창고 원장 항목(`FabricLedgerItem`)이 짝이 되는 DD 행을
`record` 로 통째로 들고 있다. Yarn, Color, Dyeing Side 가 이미 그렇게 DD 에서 끌어와 보인다.
열만 더하면 기존 값이 그대로 나온다.

**DD 행이 없는 행은 빈칸이다.** 옛 샘플관리대장에서만 온 행과 1팀 8000번대가 그렇다.
대장 원문(`sample.ledger`)에는 GD#/SA# 에 해당하는 칸이 아예 없다. **빈칸을 다른 값으로
메우려 들지 마라.** 모르는 값을 넣느니 빈칸이다.

## 고치는 파일 넷

- `src/data/dd-workflow.ts` (읽는 식을 한 곳으로 모은다)
- `src/data/dd-export.ts` (그 식을 쓰게 바꾼다)
- `src/data/fds-yds-request.ts` (같음)
- `src/routes/Warehouse.tsx` (열 추가)

`src/routes/DevelopmentMasterSheet.tsx` 도 한 줄 바꾼다(아래 1-4).

**워킹트리에 R437·R438 변경이 이미 들어 있다. 되돌리지 마라.** `git reset` 과
`git checkout` 을 쓰지 마라. 아래에 적힌 자리만 고친다.

## 1. 읽는 식을 한 곳으로 모은다

### 1-1. `src/data/dd-workflow.ts`

`isGdRecord` 함수(약 82행) **바로 뒤**에 둘을 더한다.

```ts
/**
 * GD#/SA# 한 값. `tech.development.developmentNo` 가 먼저고, 없으면 엑셀 업로드 경로가
 * 개발처에 따라 갈라 넣는 `gdNo`·`saNo` 를 본다.
 * **DD 표, 엑셀 내보내기, FDS/YDS 요청서, 창고 표가 같은 값을 보여야 한다.**
 * 식을 각자 들고 있으면 한 곳만 고치고 지나가기 쉽다.
 */
export function developmentNoOf(record: DevRecord | null | undefined): string {
  if (!record) return ""
  return String(record.tech?.development?.developmentNo || record.gdNo || record.saNo || "")
}

/** Arrange#. DD 표의 `arrangeNo` 열과 같은 값이다. 폴백이 없다. */
export function arrangeNoOf(record: DevRecord | null | undefined): string {
  return String(record?.tech?.arrangeNo ?? "")
}
```

`DevRecord` 타입은 이 파일이 이미 가져오고 있다. import 를 더하지 마라.

### 1-2. `src/data/dd-export.ts`

3~4행 import 아래에 한 줄을 더한다.

```ts
import { developmentNoOf } from "./dd-workflow"
```

76행이 지금 이렇다.

```ts
  { head: "GD#/SA#", width: 9.2, value: (r) => str(r.tech?.development?.developmentNo || r.gdNo || r.saNo) },
```

이렇게 바꾼다. **`head` 와 `width` 는 건드리지 마라.** 담당자 DD 양식을 재현하는 자리다.

```ts
  { head: "GD#/SA#", width: 9.2, value: (r) => str(developmentNoOf(r)) },
```

### 1-3. `src/data/fds-yds-request.ts`

2행 import 에 `developmentNoOf` 를 더한다.

```ts
import { developmentNoOf, isCompletedFlNo } from "@/data/dd-workflow"
```

52행이 지금 이렇다.

```ts
  text(record.tech?.development?.developmentNo || record.gdNo || record.saNo)
```

이렇게 바꾼다.

```ts
  text(developmentNoOf(record))
```

### 1-4. `src/routes/DevelopmentMasterSheet.tsx`

23행 import 목록에 `developmentNoOf` 를 더한다(알파벳 순서상 `ddWarnings` 뒤, `isCompletedFlNo` 앞).

331행 열 정의가 지금 이렇다.

```ts
      { id: "developmentNo", label: "GD#/SA#", width: 108, mono: true, value: (row) => row.tech?.development?.developmentNo || row.gdNo || row.saNo },
```

이렇게 바꾼다.

```ts
      { id: "developmentNo", label: "GD#/SA#", width: 108, mono: true, value: (row) => developmentNoOf(row) },
```

**332행 `arrangeNo` 열은 건드리지 마라.** 폴백이 없어 지금 식이 이미 한 줄이다.

## 2. 창고 표에 열을 더한다

`src/routes/Warehouse.tsx`.

### 2-1. 열 id 타입 (73행)

지금 첫 줄이 이렇다.

```ts
type WarehouseColumnId = "storageNo" | "styleNo" | "flNo" | "millRef" | "owner" | "stock" | "confirm" | "lifecycle" | "rackNo"
```

`"styleNo"` 뒤에 둘을 끼운다. 나머지 줄은 건드리지 마라.

```ts
type WarehouseColumnId = "storageNo" | "styleNo" | "developmentNo" | "arrangeNo" | "flNo" | "millRef" | "owner" | "stock" | "confirm" | "lifecycle" | "rackNo"
```

### 2-2. 대장 묶음에 열 추가 (약 114행)

`COLUMN_GROUPS` 의 `ledger` 묶음에서 `styleNo` 줄 **바로 아래**에 둘을 넣는다.

```ts
    { id: "styleNo", label: "Style/#", width: 108 },
    { id: "developmentNo", label: "GD#/SA#", width: 108 },
    { id: "arrangeNo", label: "Arrange#", width: 100 },
    { id: "flNo", label: "FL.#", width: 100 },
```

폭은 DD 표와 같은 값이다.

**`TEAM1_COLUMN_GROUPS`(약 171행부터)에는 넣지 마라.** 1팀 원단에는 GD#/SA# 가 없다.
1팀 표는 열 목록이 따로라 `COLUMN_GROUPS` 만 고치면 저절로 갈린다.

### 2-3. `cellValue` 에 분기 추가 (모듈 레벨, 약 377행)

**이 함수가 필터·정렬·복사(TSV)·열 머리 ▼ 목록을 모두 먹인다.** 빠뜨리면 그 열로
거르거나 정렬할 수 없고 복사하면 빈 칸이 나간다.

`case "styleNo": return item.styleNo` 줄 **바로 아래**에 둘을 넣는다.

```ts
    case "developmentNo": return developmentNoOf(record)
    case "arrangeNo": return arrangeNoOf(record)
```

`record` 는 이 함수 첫 줄에서 이미 `const record = item.record` 로 잡아 두었다.
새로 만들지 마라.

36행 import 에 둘을 더한다.

```ts
import { arrangeNoOf, developmentNoOf, stoppedStatusLabel } from "@/data/dd-workflow"
```

### 2-4. `coreCell` 에 분기 추가 (컴포넌트 안, 약 1248행부터)

**`coreCell` 의 마지막 줄은 `return <TextCell value={item.note} />` 다.**
분기를 안 넣으면 새 열 두 개에 **Remark 내용이 찍힌다.** 타입 검사로는 안 잡힌다.
반드시 넣어라.

`if (id === "styleNo") return <TextCell value={item.styleNo} mono />` 줄 **바로 아래**에 둘을 넣는다.

```tsx
    if (id === "developmentNo") return <TextCell value={cellValue(item, "developmentNo")} mono />
    if (id === "arrangeNo") return <TextCell value={cellValue(item, "arrangeNo")} mono />
```

`mono` 는 번호 열이라 DD 표와 맞춘 것이다.

### 2-5. 검색에 더한다 (약 749~757행)

지금 목록이 이렇다.

```ts
      .filter((item) => !query || [
      item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner,
      item.fields.millRef,
```

첫 줄의 `item.styleNo` 뒤에 둘을 끼운다. 나머지 줄은 건드리지 마라.

```ts
      item.storageNo, item.styleNo, developmentNoOf(item.record), arrangeNoOf(item.record), item.flNo, item.season, item.category, item.buyer, item.owner,
```

## 하지 말 것

- **두 열을 편집 가능하게 만들지 마라.** 창고는 DD 값을 비추기만 한다. 수정은 DD MASTER 에서 한다
  (CLAUDE.md 창고 항목). `FABRIC1_SAMPLE_EDITABLE`, `FABRIC1_OVERRIDE_EDITABLE`,
  `MANUAL_EDITABLE` 어디에도 넣지 마라. 넣지 않으면 `editable` 판정이 저절로 거짓이 된다.
- `cellRawValue` 는 건드리지 마라. 편집 초기값을 만드는 자리라 읽기 전용 열은 쓰지 않는다.
- `TEAM1_COLUMN_GROUPS` 에 열을 넣지 마라.
- `warehouse-export.ts`(창고팀 보고 자료)를 건드리지 마라. 창고팀 양식은 원본을 행 단위로
  재현하는 자리다. 열을 더하면 그쪽 파일이 어긋난다.
- 빈칸을 다른 값으로 메우지 마라. 대장 전용 행과 1팀 행은 빈칸이 맞다.
- `dd-export.ts` 의 `head` 와 `width` 를 바꾸지 마라.
- 워킹트리에 이미 있는 R437·R438 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 삭제하지 마라.
- 한글 문구를 영어로 바꾸지 마라. 파일은 `Get-Content -Encoding UTF8` 로 읽어라.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 를 **모든 수정을 마친 뒤 한 번만** 돌린다. 통과하면 끝이다.
다른 검증은 하지 마라.

## 보고

수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
