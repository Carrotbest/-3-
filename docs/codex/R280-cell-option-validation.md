# R280 DD MASTER 선택형 셀의 표시 목록과 검증 목록 불일치 수정

상태: **미착수.** R279 까지 구현 완료, `e235875` 로 커밋·배포 완료. 워킹트리 깨끗함.

## 증상

DD MASTER `Dyeing Side` 열에서 드롭다운에 `CSD` 가 보이는데 고르면 값이 안 바뀐다. 오류 메시지도 없다.
`SD`, `DD`, `PSD` 같은 값은 정상이다.

## 원인 (확인 완료, 추측 아님)

표시 목록과 검증 목록이 다르다.

- 표시: `src/routes/DevelopmentMasterSheet.tsx:1315` `optionsById` 가 `union(상수, 데이터의 실제 값)` 으로 목록을 넓힌다. `dyeing` 은 1324 행.
- 검증: 같은 파일 `675` 행 `isAcceptableCellValue` 가 `column.options`(상수)만 본다.

```ts
if (column.options && !column.suggest) return column.options.some((option) => option === value)
```

`DD_DYEING_OPTIONS` 에 `CSD` 가 없으므로 거부된다. `updateRecordCell`(684 행)이 `record` 를 그대로 돌려주고,
`commitCell`(2776 행)은 `next !== record` 일 때만 저장하므로 아무 일도 안 일어난다. 에디터는 이미 닫혀 있어 사용자는 이유를 모른다.

근거: `src/data/zaji.ts:95` `matchDyeing` 이 `SINGLE DYE`, `CSD`, `SD` 를 전부 `"CSD"` 로, 다른 경우 `"CPB"` 로 변환해 레코드에 넣는다.
둘 다 `DD_DYEING_OPTIONS` 에 없다. 작지로 들어온 값을 웹에서 다시 선택할 수 없는 상태였다.

`IntakeCell`(491 행)과 `EditorField`(854 행)의 `set` 도 같은 `updateRecordCell` 을 타므로
그리드 인라인, 64열 수정 모달, 신규 접수 그리드가 전부 같이 막혀 있다.

### 같은 결함이 걸린 열

`optionsById` 에 키가 있으면서 `column.options` 도 가진 열 전부다.

| 열 id | 상수 | 정의 위치 |
|---|---|---|
| `season` | `DD_SEASON_OPTIONS` | 204 행 |
| `category` | `DD_CATEGORY_OPTIONS` | 206 행 |
| `co` | `DD_COMPANY_OPTIONS` | 224 행 |
| `dyeing` | `DD_DYEING_OPTIONS` | 231 행 |
| `passFail` | `DD_PASS_FAIL_OPTIONS` | 286 행 |

`status`(194 행)는 `optionsById` 에 키가 없어 양쪽이 일치한다. **건드리지 마라.**
`owner`, `project`, `buyer`, `planner` 는 `suggest: true` 라 자유 입력이다. 이미 막히지 않는다.

## 틀렸던 가설

없음. 다만 다음을 **다시 시도하지 마라.**

- `isAcceptableCellValue` 를 통째로 없애고 전부 허용하게 만들기. 붙여넣기와 아래로 채우기가 날짜 열에 글자를, 숫자 열에 문자를 꽂는 것을 이 함수가 막고 있다. 가드 자체는 살려 둔다.
- `optionsById` 에서 데이터 값 합치기(`union`)를 빼기. 과거 데이터 값이 드롭다운에서 통째로 사라진다.
- `status` 열을 `optionsById` 에 추가하기. 정규 5개로 제한하는 것이 의도다.

## 조치

### 1. `src/data/dd-workflow.ts` — 43 행

현재:
```ts
export const DD_DYEING_OPTIONS = ["SD", "DD", "PSD", "YD", "SOAP", "PFD", "기타"] as const
```

교체:
```ts
export const DD_DYEING_OPTIONS = ["SD", "CSD", "DD", "PSD", "YD", "CPB", "SOAP", "PFD", "기타"] as const
```

`CSD` 와 `CPB` 만 더한다. 기존 값은 하나도 빼지 마라. 옛 데이터가 그 값을 쓰고 있다.

### 2. `src/routes/DevelopmentMasterSheet.tsx` — 검증 함수에 목록 주입

`675` 행 함수를 아래로 교체한다. 주석 블록(669~674 행)은 그대로 두고 마지막 줄에 한 줄 더한다.

현재:
```ts
function isAcceptableCellValue(column: MasterColumn, raw: string): boolean {
  const value = raw.trim()
  if (!value) return true
  if (column.date) return isDateValue(value)
  if (column.number) return Number.isFinite(Number(value))
  if (column.options && !column.suggest) return column.options.some((option) => option === value)
  return true
}
```

교체:
```ts
function isAcceptableCellValue(column: MasterColumn, raw: string, allowed?: readonly string[]): boolean {
  const value = raw.trim()
  if (!value) return true
  if (column.date) return isDateValue(value)
  if (column.number) return Number.isFinite(Number(value))
  // 드롭다운에 띄운 목록을 그대로 받는다. 상수만 보면 데이터에만 있는 값(CSD 등)이 소리 없이 버려진다(R280).
  const list = allowed ?? column.options
  if (list && !column.suggest) return list.some((option) => option === value)
  return true
}
```

주석 블록 675 행 위에 다음 한 줄을 더한다.
```
 * 목록은 `allowed`(드롭다운이 실제로 띄운 값)가 우선이다. 없으면 열 상수를 쓴다.
```

### 3. 같은 파일 — `updateRecordCell` 에 인자 통과

`684`~`686` 행. 현재:
```ts
function updateRecordCell(record: DevRecord, column: MasterColumn, raw: string): DevRecord {
  if (COMPUTED_COLUMN_IDS.has(column.id)) return record
  if (!isAcceptableCellValue(column, raw)) return record
```

교체:
```ts
function updateRecordCell(record: DevRecord, column: MasterColumn, raw: string, allowed?: readonly string[]): DevRecord {
  if (COMPUTED_COLUMN_IDS.has(column.id)) return record
  if (!isAcceptableCellValue(column, raw, allowed)) return record
```

나머지 본문은 손대지 마라.

### 4. 같은 파일 — 모듈 상단에 헬퍼 추가

`isAcceptableCellValue` 정의 **바로 앞**(669 행 주석 블록 위)에 넣는다.

```ts
/** 이 열의 드롭다운이 실제로 띄우는 목록. 표시와 검증이 반드시 같은 것을 봐야 한다(R280). */
const allowedFor = (column: MasterColumn, optionsById: Record<string, readonly string[]>): readonly string[] | undefined =>
  optionsById[column.id] ?? column.options
```

### 5. 같은 파일 — `IntakeCell` 491 행

현재:
```ts
  const set = (raw: string) => onChange(updateRecordCell(record, column, raw))
```
교체:
```ts
  const set = (raw: string) => onChange(updateRecordCell(record, column, raw, allowedFor(column, optionsById)))
```

### 6. 같은 파일 — `EditorField` 854 행

현재:
```ts
  const set = (raw: string) => onChange(updateRecordCell(draft, column, raw))
```
교체:
```ts
  const set = (raw: string) => onChange(updateRecordCell(draft, column, raw, allowedFor(column, optionsById)))
```

### 7. 같은 파일 — 컴포넌트 안 호출부 전부

`optionsById` 가 스코프에 있는 메인 컴포넌트 안의 호출을 전부 바꾼다. **아래 줄 번호의 호출만** 손대고 로직은 바꾸지 마라.

| 행 | 현재 호출 | 조치 |
|---|---|---|
| 2065 | `updateRecordCell(draft, column, value)` | 4번째 인자 `allowedFor(column, optionsById)` 추가 |
| 2092 | `updateRecordCell(draft, column, rawCellText(fromRecord, fromColumn))` | 동일 |
| 2144 | `updateRecordCell(draft, column, rawCellText(source, column))` | 동일 |
| 2170 | `updateRecordCell(draft, column, after)` | 동일 |
| 2207 | `updateRecordCell(draft, column, value)` | 동일 |
| 2422 | `updateRecordCell(draft, column, "")` | 빈 문자열은 항상 통과하므로 **그대로 둔다** |
| 2453 | `isAcceptableCellValue(column, value)` | 3번째 인자 `allowedFor(column, optionsById)` 추가 |
| 2474 | `isAcceptableCellValue(column, value)` | 동일 |
| 2475 | `updateRecordCell(draft, column, value)` | 4번째 인자 추가 |
| 2501 | `updateRecordCell(draft, column, "")` | **그대로 둔다** |
| 2527 | `isAcceptableCellValue(column, raw)` | 3번째 인자 추가 |
| 2528 | `updateRecordCell(draft, column, raw)` | 4번째 인자 추가 |
| 2663 | `updateRecordCell(record, column, after)` | 4번째 인자 추가 |
| 2766 | `updateRecordCell(draft, targetColumn, raw)` | `allowedFor(targetColumn, optionsById)` 추가. **열 변수 이름이 `targetColumn` 이다. 틀리지 마라** |
| 2776 | `updateRecordCell(record, column, raw)` | 4번째 인자 추가 |

줄 번호는 수정하면서 밀린다. 번호가 아니라 **호출 모양**으로 찾아라.
`optionsById` 가 스코프에 없는 곳이 있으면 거기는 손대지 말고 보고해라.

### 8. 같은 파일 — 거부 시 알림 추가 (`commitCell`, 2776 행 근처)

지금은 값이 거부되면 아무 표시가 없어 사용자가 버그인지 모른다.

현재:
```ts
    const next = updateRecordCell(record, column, raw)
    if (next !== record) {
      const identity = recordIdentity(record)
      await commitRecords((records) => records.map((item) => recordIdentity(item) === identity ? next : item))
    }
    if (move) moveSelection(move, false, move === "left" || move === "right", origin)
```

교체:
```ts
    if (!isAcceptableCellValue(column, raw, allowedFor(column, optionsById))) {
      notify(`${column.label} 열에 넣을 수 없는 값입니다: ${raw.trim()}`)
      if (move) moveSelection(move, false, move === "left" || move === "right", origin)
      return
    }
    const next = updateRecordCell(record, column, raw, allowedFor(column, optionsById))
    if (next !== record) {
      const identity = recordIdentity(record)
      await commitRecords((records) => records.map((item) => recordIdentity(item) === identity ? next : item))
    }
    if (move) moveSelection(move, false, move === "left" || move === "right", origin)
```

`notify` 는 이 컴포넌트에서 이미 쓰고 있다(2749 행 `notify(EDIT_DISABLED_MESSAGE)`). 새로 import 하지 마라.

### 9. 같은 파일 — `StatusChip` 875 행

정규 5개에 없는 상태값이면 칩이 빈칸으로 보인다. 값이 있는데 없는 것처럼 보인다.

현재:
```ts
  const selected = DD_STATUS_OPTIONS.includes(current as (typeof DD_STATUS_OPTIONS)[number]) ? current : undefined
```
```tsx
    <SelectContent>{DD_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
```

교체:
```ts
  const known = DD_STATUS_OPTIONS.includes(current as (typeof DD_STATUS_OPTIONS)[number])
  // 정규 목록에 없는 옛 상태값도 칩에 그대로 보여 준다. 안 그러면 값이 있는데 빈칸으로 보인다(R280).
  const selected = current ? current : undefined
```
```tsx
    <SelectContent>{(known || !current ? DD_STATUS_OPTIONS : [current, ...DD_STATUS_OPTIONS]).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
```

`style` 과 `change` 는 그대로 둔다.

## 하지 말 것

- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- `git reset`, `git checkout --` 으로 기존 변경을 되돌리지 마라.
- `DD_DYEING_OPTIONS` 에서 기존 값을 빼지 마라. `SD` 와 `CSD` 를 하나로 합치지 마라. 사용자가 아직 안 정했다.
- `src/data/zaji.ts` 의 `matchDyeing` 을 고치지 마라. 이번 범위가 아니다.
- `optionsById` 의 `union`/`distinct` 로직을 고치지 마라.
- `status` 열을 `optionsById` 에 추가하지 마라.
- `src/routes/Warehouse.tsx` 를 열지 마라. 거기 `dyeing` 은 읽기 전용이라 무관하다.
- `public/data` 아래 JSON 을 열지 마라. `archive.json` 은 2.5MB 다.
- `legacy/`, `legacy-vanilla/`, `backup/` 을 읽지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.

## 검증

`npm run build` 를 **모든 수정을 마친 뒤 한 번** 돌린다.
**실패하면 고치고 다시 돌려라.** 통과할 때까지 반복한다. 실패한 채로 보고하지 마라.

성공 기준.
- `tsc --noEmit` 오류 0, `vite build` 성공.
- `grep -n "updateRecordCell(" src/routes/DevelopmentMasterSheet.tsx` 결과에서 4번째 인자가 없는 호출은 684 행 정의부와 `""` 를 넣는 두 곳(2422, 2501 근처)뿐이다.
- `grep -n "isAcceptableCellValue(" src/routes/DevelopmentMasterSheet.tsx` 결과에서 3번째 인자가 없는 호출은 정의부와 `updateRecordCell` 안의 호출뿐이다.

같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

마지막 보고는 수정 파일 목록, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
