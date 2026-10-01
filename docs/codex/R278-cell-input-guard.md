# R278 셀 입력 형식 방어와 입고 대기 판정 보강

상태: **미착수.** R277 까지 구현 완료, `e5e7834` 로 커밋·배포 완료.

사고 보고다. DD MASTER 에서 Ctrl+클릭으로 더해 둔 선택 영역이 남은 채 Ctrl+V 를 한 번 눌러
`GD260915265-01` 한 값이 떨어진 영역 전부에 들어갔다. 담당, Status, 날짜, 숫자 칸을 가리지 않고
들어갔고, YDS 칸에 들어간 그 글자가 창고 **입고 대기**까지 올라왔다.

막는 곳이 세 군데 비어 있다.

1. `updateRecordCell` 에 **열 타입 검사가 없다.** 날짜 열에 글자가 그대로 저장된다.
   `normalizeDateInput` 이 못 읽으면 원문을 돌려주기 때문이다(`format.ts` 57행 `return raw`).
2. 떨어진 영역 여러 곳에 한 값을 붙이는 조작에 **확인 창이 없다.** 화면 밖 영역까지 한 번에 바뀐다.
3. `statusFromRecord` 가 **비어 있지 않으면 READY** 다. 형식을 안 본다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/format.ts` | `isDateValue` 추가 |
| `src/routes/DevelopmentMasterSheet.tsx` | 셀 입력 형식 검사, 다중 영역 확인 창, 건너뛴 칸 알림 |
| `src/data/fabric-ledger.ts` | `statusFromRecord` 를 날짜 형식으로 판정 |
| `src/data/dd-workflow.ts` | 날짜 칸이 날짜가 아니면 경고 |

이 넷 외에는 수정하지 마라. `FabricRequest.tsx` 와 `Warehouse.tsx` 에는 다중 영역 붙여넣기가
없으니 건드리지 마라.

---

## 1. `isDateValue` (`format.ts`)

`normalizeDateInput` 바로 아래에 더한다.

```ts
/**
 * 저장된 값이 날짜인가. 저장 형식은 `YYYY-MM-DD` 하나다.
 * `toDate` 를 쓰지 마라. `new Date("28482")` 를 서기 28481년으로, `"1/1"` 을 2000년으로 읽는다.
 * Style No. 를 날짜 칸에 붙여넣어도 통과해 버린다.
 */
export function isDateValue(value: unknown): boolean {
  const raw = String(value ?? "").trim()
  if (!raw) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDateInput(raw))
}
```

`normalizeDateInput` 과 `toDate` 의 **동작은 바꾸지 마라.** 다른 화면이 전부 쓴다.

---

## 2. 셀 입력 형식 검사 (`DevelopmentMasterSheet.tsx`)

### 2-1. 판정 함수

`updateRecordCell`(669행) **바로 위**에 더한다.

```ts
/**
 * 이 값을 이 열에 써도 되는가. 붙여넣기·아래로 채우기·Ctrl+Enter 가 모두 지난다.
 * 거짓이면 그 칸은 건드리지 않는다. 지우지 않고 원래 값을 그대로 둔다.
 * 빈 값은 늘 허용한다. 지우기 동작이다.
 * `suggest` 열(담당·Buyer)은 목록이 제안일 뿐이라 자유 입력이다. 막지 않는다.
 */
function isAcceptableCellValue(column: MasterColumn, raw: string): boolean {
  const value = raw.trim()
  if (!value) return true
  if (column.date) return isDateValue(value)
  if (column.number) return Number.isFinite(Number(value))
  if (column.options && !column.suggest) return column.options.some((option) => option === value)
  return true
}
```

`@/data/format` 에서 `isDateValue` 를 가져온다(기존 import 를 지우지 마라).

### 2-2. `updateRecordCell` 에 빗장

`updateRecordCell` 첫 줄 `COMPUTED_COLUMN_IDS` 검사 **바로 뒤**에 한 줄 더한다.

```ts
  if (COMPUTED_COLUMN_IDS.has(column.id)) return record
  if (!isAcceptableCellValue(column, raw)) return record
```

이것이 마지막 빗장이다. 아래로 채우기(`fillDown`, 2096행), Ctrl+Enter(2707행 근처),
64열 수정 모달까지 전부 이 함수를 지나므로 한 곳만 막으면 된다.

### 2-3. 붙여넣기에서 건너뛴 칸 알리기

조용히 건너뛰면 사람이 값이 들어간 줄 안다. **몇 칸을 왜 건너뛰었는지 알린다.**

**다중 영역 경로**(2420행 `if (extraRects.length)` 안쪽). `filled` 옆에 `invalid` 를 센다.

```ts
      let filled = 0
      let invalid = 0
      ...
          for (let c = area.left; c <= area.right; c += 1) {
            const column = displayedColumns[c]
            if (!column || isLockedCell(record, column)) continue
            if (!isAcceptableCellValue(column, value)) { invalid += 1; continue }
            const next = updateRecordCell(draft, column, value)
            if (next !== draft) { draft = next; filled += 1 }
          }
```

알림 문구를 바꾼다.

```ts
      notify(invalid
        ? `${filled}개 셀에 붙여넣었습니다. 형식이 맞지 않는 ${invalid}칸은 건너뛰었습니다.`
        : `${filled}개 셀에 붙여넣었습니다.`)
```

**단일 영역 경로**(2472행 `let skipped = 0` 부근)도 같다. `skipped` 는 수정 불가 칸을 세는
기존 변수이니 **건드리지 말고** `invalid` 를 따로 센다.

```ts
        if (isLockedCell(record, column)) { skipped += 1; continue }
        const raw = grid[r % gridHeight][c % gridWidth] ?? ""
        if (!isAcceptableCellValue(column, raw)) { invalid += 1; continue }
        draft = updateRecordCell(draft, column, raw)
        filled += 1
```

마지막 `notify` 두 갈래 끝에 `invalid` 가 있으면 ` 형식이 맞지 않는 ${invalid}칸은 건너뛰었습니다.`
를 덧붙인다. 기존 `수정 불가 ${skipped}개 제외` 문구는 그대로 둔다.

### 2-4. 다중 영역 확인 창

떨어진 영역에 한 값을 채우는 조작은 화면 밖까지 한 번에 바꾼다. **쓰기 전에 묻는다.**

`if (extraRects.length)` 블록에서 값(`value`)을 꺼낸 **직후**, 쓰기 시작 전에 둔다.
먼저 대상 칸 수를 세는 마른 계산을 한 번 돌린다(값은 쓰지 않는다).

```ts
      let targets = 0
      for (const area of allRects) {
        for (let r = area.top; r <= area.bottom; r += 1) {
          const record = filtered[r]
          if (!record) continue
          for (let c = area.left; c <= area.right; c += 1) {
            const column = displayedColumns[c]
            if (!column || isLockedCell(record, column)) continue
            if (!isAcceptableCellValue(column, value)) continue
            targets += 1
          }
        }
      }
      if (!targets) { notify("붙여넣을 수 있는 셀이 없습니다."); return }
      const label = value.length > 20 ? `${value.slice(0, 20)}…` : value
      if (!window.confirm(`떨어진 영역 ${allRects.length}곳 ${targets}개 셀을 "${label}" 로 채웁니다. 계속할까요?`)) return
```

`window.confirm` 을 쓴다. 이 저장소가 이미 쓰는 방식이다(`MonthlyReportDialog`).
**단일 영역 붙여넣기에는 확인 창을 달지 마라.** 보이는 범위라 사고가 안 난다.

---

## 3. 입고 대기 판정 (`fabric-ledger.ts`)

`statusFromRecord`(328행)를 형식으로 판정한다. 주석도 같이 고친다.

```ts
function statusFromRecord(record: DevRecord): FabricLedgerStatus {
  const arrived = isGdRecord(record)
    ? record.tech?.sampleDates?.yds
    : record.receivedDate
  // 비어 있지 않은지가 아니라 날짜인지로 본다. 붙여넣기 사고로 들어온 글자가
  // 수취일로 읽혀 입고 대기까지 올라온 적이 있다(2026-10-01).
  return isDateValue(arrived) ? "READY" : "DEVELOPING"
}
```

`@/data/format` 혹은 `./format` 에서 `isDateValue` 를 가져온다. 기존 import 를 지우지 마라.

**`statusFromSample` 은 건드리지 마라.** 시트 이름으로 판정하는 다른 규칙이다.

---

## 4. 날짜 형식 경고 (`dd-workflow.ts`)

판정이 엄격해지면 날짜가 아닌 값이 든 행은 입고 대기에서 빠진다. **조용히 사라지면 안 된다.**
그 행에 경고를 띄워 사람이 보게 한다.

`ddWarnings`(143행) 안, `process` 경고를 넣기 **전**에 더한다.

```ts
  const dateCells: [string, unknown][] = [
    ["Due Date", record.dueDate],
    ["Received date", record.receivedDate],
    ["FDS", record.tech?.sampleDates?.fds],
    ["YDS", record.tech?.sampleDates?.yds],
  ]
  const badDates = dateCells.filter(([, value]) => String(value ?? "").trim() && !isDateValue(value))
  if (badDates.length) {
    warnings.push({ key: "dateFormat", label: `${badDates.map(([name]) => name).join(", ")} 날짜 형식 아님` })
  }
```

`isDateValue` 를 가져온다. 기존 import 를 지우지 마라.

---

## 5. 하지 말 것

- **`normalizeDateInput` 과 `toDate` 의 동작을 바꾸지 마라.** 화면 전체가 쓴다. `isDateValue` 는 새 함수다.
- `isDateValue` 를 `toDate` 로 만들지 마라. `28482` 와 `1/1` 이 통과한다.
- **`suggest` 열(담당, Buyer)을 막지 마라.** 목록은 제안이고 자유 입력이 설계다.
- 형식이 안 맞는 칸의 **기존 값을 지우지 마라.** 건드리지 않고 넘어간다.
- 빈 값을 막지 마라. 지우기 동작이다.
- `statusFromSample`, `buildFabricLedger`, 채번(`nextStorageNumbers`)을 건드리지 마라.
- 단일 영역 붙여넣기에 확인 창을 달지 마라.
- `FabricRequest.tsx`, `Warehouse.tsx` 를 건드리지 마라. 다중 영역 붙여넣기가 없다.
- 기존 `skipped`(수정 불가 칸) 집계와 문구를 바꾸지 마라. `invalid` 를 따로 센다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 6. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
