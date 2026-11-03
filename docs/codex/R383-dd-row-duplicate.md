# R383 — DD MASTER 행 복제와 공정 날짜 복사

대상 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일은 고치지 않는다.

파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 주석도 한글로 쓴다.

## 배경

공정 SCHEDULE은 공정마다 업체·목표·완료 세 칸이고 목표 열 넷은 기본 숨김이다(R369).
완료 칸 하나로 목표와 완료를 순서대로 받는다(R374). 완료 칸에 적은 첫 날짜는 그 공정의
목표와 완료가 모두 비어 있을 때만 `targetDates`로 가고, 나머지는 `processDates`로 간다.

화면은 완료일이 비면 목표일을 기울임꼴로 보여 준다(`scheduleCellRender`).
그런데 복사는 `column.value` = `processDates`만 읽는다. 그래서 **목표일만 적힌 칸은
화면에 날짜가 보이는데 복사하면 빈 칸이 나간다.** 이것이 고칠 증상이다.

## 작업 A — 공정 완료 열 복사가 목표일을 담는다

### A-1. 역방향 매핑 상수를 더한다

451~458줄의 `TARGET_COLUMN_IDS` / `TARGET_PROCESS_BY_COLUMN` / `PROCESS_BY_STATUS_COLUMN`
세 상수 바로 아래에 다음을 더한다.

```ts
/** 공정 → 목표 열 id. 복사할 때 목표 열이 같은 범위에 있는지 보려고 쓴다(R383). */
const TARGET_COLUMN_BY_PROCESS: Record<DdProcess, string> = {
  yarn: "yarnTarget", knitting: "knittingTarget", dyeing: "dyeingTarget", finishing: "finishingTarget",
}
```

### A-2. `rawCellText`를 고친다

2375~2380줄의 현재 코드는 이렇다.

```ts
  /** 복사·붙여넣기에 쓰는 원본 값(화면 표기 "—" 가 아닌 실제 값). */
  const rawCellText = (record: DevRecord, column: MasterColumn): string => {
    const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
    const value = column.value(record, linked)
    return value === null || value === undefined ? "" : String(value)
  }
```

이것으로 바꾼다.

```ts
  /**
   * 복사·붙여넣기에 쓰는 원본 값(화면 표기 "—" 가 아닌 실제 값).
   *
   * 공정 완료 칸은 완료일이 비면 **목표일을 대신 담는다**(R383). 화면이 그 칸에 목표일을
   * 기울임꼴로 보여 주고 있어서, 완료일만 읽으면 보이는 날짜가 복사에서 통째로 빠진다.
   *
   * 단 `scopeIds`에 그 공정의 목표 열이 함께 있으면 폴백하지 않는다. 목표 열을 펼쳐 둔
   * 채로 범위를 복사하면 목표 열이 제 값을 따로 나르는데, 완료 칸까지 같은 날짜를 담으면
   * 붙여넣는 쪽에서 목표가 먼저 채워진 뒤 완료 칸이 `processDates`로 가서 **아무도 손대지
   * 않은 공정에 완료일이 생긴다.** R372가 막아 둔 바로 그 사고다.
   */
  const rawCellText = (record: DevRecord, column: MasterColumn, scopeIds?: ReadonlySet<string>): string => {
    const linked = ledgerByRecord.get(recordIdentity(record)) ?? null
    const value = column.value(record, linked)
    const text = value === null || value === undefined ? "" : String(value)
    if (text.trim()) return text
    const process = PROCESS_BY_STATUS_COLUMN[column.id]
    if (!process) return text
    if (scopeIds?.has(TARGET_COLUMN_BY_PROCESS[process])) return text
    return String(record.tech?.targetDates?.[process] ?? "")
  }
```

### A-3. 호출처 네 곳에 범위를 넘긴다

범위의 열 id 집합을 만드는 작은 도우미를 `rawCellText` 바로 아래에 둔다.

```ts
  /** 복사·이동·채우기가 훑는 열 구간의 id 집합. `rawCellText`의 목표일 폴백 판단에 쓴다. */
  const scopeIdsOf = (left: number, right: number): ReadonlySet<string> => {
    const ids = new Set<string>()
    for (let col = left; col <= right; col += 1) {
      const column = displayedColumns[col]
      if (column) ids.add(column.id)
    }
    return ids
  }
```

그리고 네 곳을 고친다. **네 곳 전부 고쳐야 한다.** 한 곳이라도 빠지면 복사와 채우기가
서로 다른 값을 내보낸다.

1. `rangeToTsv`(2382줄 근처). 루프 바깥에서 `const scope = scopeIdsOf(box.left, box.right)`를
   만들고 `rawCellText(record, column)` → `rawCellText(record, column, scope)`.
2. 잘라내기 이동(2469줄 `moves.push({ ... value: rawCellText(sourceRecord, sourceColumn) })`).
   `moves` 선언 위에서 `const scope = scopeIdsOf(source.left, source.right)`를 만들고 넘긴다.
3. 채우기 핸들 `commitFill`의 `write`(2505줄 `rawCellText(fromRecord, fromColumn)`).
   `commitFill` 안에서 `const scope = scopeIdsOf(source.left, source.right)`를 만들고 넘긴다.
4. 아래로 채우기(2557줄 `rawCellText(source, column)`). 그 `for (const area of allRects)`
   루프 안, `area`가 정해진 뒤에 `const scope = scopeIdsOf(area.left, area.right)`를 만들고 넘긴다.

## 작업 B — 선택 행 복제

같은 작지의 다른 색상 옵션을 새 행으로 세우는 자리다. 지금은 클립보드 TSV를 거치는
`insertCopiedRows`뿐이라 **화면에 안 보이는 열(목표일 넷)과 TSV에 담기지 않는 값이
전부 유실된다.** 레코드 객체를 통째로 복사해서 그 문제를 없앤다.

### B-1. `duplicateSelectedRows`를 더한다

`insertBlankRows`(2693줄) 바로 위에 넣는다. `insertBlankRows`의 정렬·삽입·Undo 흐름을
그대로 따른다.

```ts
  /**
   * 선택 행을 그대로 복제해 아래에 세운다(R383, 2026-11-03 박향근 확정).
   *
   * 클립보드를 거치지 않으므로 숨긴 목표일 열과 TSV에 안 담기는 값까지 그대로 따라온다.
   * 업체·목표일·완료일·납기·스펙은 남기고 **결과 RESULT 그룹만 비운다.**
   * - `flNo`: 번호는 원장에서 하나뿐이다. 복제하면 창고와 원장이 같은 번호를 두 행에서 본다.
   * - `receivedDate`, `sampleDates`: 새 행은 아직 받은 것이 없다.
   * - `requestLink`: 한 요청 옵션에는 DD 행 하나만 붙는다. 복제하면 요청 쪽 후보에서 사라진다.
   * - `costRef`: 원가계산서 포인터다. 계산하지 않은 행이 남의 계산서를 가리키면 안 된다.
   * - `optionProgress`: 옵션 완료 집계값이다.
   * `devStatus`는 `진행중`으로 되돌린다. 완료·DROP 행을 복제해 그 상태가 따라오면
   * HOME 카드와 주간 보고가 하지도 않은 건을 센다.
   */
  const duplicateSelectedRows = async () => {
    if (!editEnabled) { notify(editDeniedMessage); return }
    const rows = selectedRows()
    if (!rows.length) { notify("복제할 행을 고르세요."); return }

    const created = rows.map((row) => {
      const blank = createBlankDevRecord(row.owner)
      const tech = structuredClone(row.tech ?? {}) as DevTechnical
      // 값 없는 키를 남기지 말고 지운다. Firestore 가 `undefined` 가 든 문서를 거부한다(R340).
      delete tech.requestLink
      delete tech.costRef
      delete tech.sampleDates
      delete tech.optionProgress
      delete tech.intakeSource
      return {
        ...row,
        tech,
        flNo: "",
        receivedDate: "",
        devStatus: "진행중",
        // 새 행의 고유 식별자. 원본과 같은 `_src` 를 쓰면 두 행이 한 행으로 취급된다.
        _src: blank._src,
      }
    })

    const before = useAppStore.getState().records
    const rank = rankOf(before)
    const sorted = [...before].sort((a, b) => (rank.get(recordIdentity(a)) ?? 0) - (rank.get(recordIdentity(b)) ?? 0))
    const anchor = rows[rows.length - 1]
    const anchorIndex = sorted.findIndex((record) => recordIdentity(record) === recordIdentity(anchor))
    const at = anchorIndex === -1 ? sorted.length : anchorIndex + 1
    const merged = [...sorted.slice(0, at), ...created, ...sorted.slice(at)]

    setCopyMark(null)
    const applied = await writeDevelopmentRecords(merged.map((record, index) => ({ ...record, sortOrder: index })))
    if (applied) pushUndoEntry(before, applied)
    const first = displayedColumns[0], last = displayedColumns[displayedColumns.length - 1]
    if (first && last) {
      const firstCell = { row: recordIdentity(created[0]), col: first.id }
      setRange({ anchor: firstCell, focus: { row: recordIdentity(created[created.length - 1]), col: last.id } })
      scrollCellIntoView(firstCell)
    }
    notify(`${created.length}개 행을 복제했습니다. FL#과 수취일은 비웁니다.`)
  }
```

`selectedRows`는 2641줄에 이미 있다. `DevTechnical` 타입은 34줄에서 이미 import 하고 있다.
새 import 를 만들지 마라.

### B-2. 우클릭 메뉴에 항목을 더한다

3607줄 `{ key: "insert", label: "복사한 행 삽입", ... }` **바로 위**에 넣는다.

```tsx
            { key: "duplicate", label: "선택 행 복제", hint: "아래에 추가", icon: <Rows3 className="size-3.5" />, run: () => void duplicateSelectedRows(), disabled: !editEnabled },
```

## 작업 C — `insertCopiedRows`가 담당을 채운다

2617줄의 `let draft = createBlankDevRecord()`는 담당을 비운 채 행을 만든다.
담당 열이 복사 범위에 없으면 **담당이 빈 행이 생겨 담당 탭 어디에도 안 뜬다.**
바로 아래 `insertBlankRows`는 이미 현재 담당을 넣고 있다. 같게 맞춘다.

`insertCopiedRows` 안, `const grid = ...` 줄 위에 다음을 넣는다.

```ts
    // 담당 열이 복사 범위에 없으면 담당이 빈 행이 생겨 담당 탭 어디에도 안 뜬다.
    const blankOwner = owner === ALL ? "" : owner
```

그리고 `let draft = createBlankDevRecord()` → `let draft = createBlankDevRecord(blankOwner)`.

## 하지 말 것

- `column.value`를 고치지 마라. 정렬·검색·엑셀 내보내기·`processReached`가 그 값을 쓴다.
  목표일이 거기 섞이면 R372 사고가 그대로 되살아난다. 고치는 것은 `rawCellText` 하나다.
- `updateRecordCell`의 목표/완료 순서 판정(952~958줄)을 건드리지 마라. 완료를 먼저 보는
  순서를 뒤집으면 R369 전에 생긴 행의 완료일이 목표로 샌다.
- `isLockedCell`을 우회하는 저장 경로를 만들지 마라. 복제는 새 레코드를 만드는 것이라
  셀 잠금과 무관하고, 기존 `writeDevelopmentRecords` 하나만 쓴다.
- 새 파일을 만들지 마라. 커밋하지 마라. 푸시하지 마라. 어떤 파일도 지우지 마라.
- `git reset --hard`나 `git checkout --`를 쓰지 마라.
- 명세에 적힌 파일 `src/routes/DevelopmentMasterSheet.tsx` 하나만 고쳐라.

## 성공 기준

1. `npm run build`가 통과한다(`tsc --noEmit && vite build`).
2. `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx` 한 줄만 뜬다.
3. `rawCellText` 호출처가 네 곳 모두 세 번째 인자를 넘긴다.
4. 우클릭 메뉴에 `선택 행 복제`가 `복사한 행 삽입` 위에 선다.
5. 화면 문구가 영어로 바뀐 곳이 없다.

## 작업 B-3 (추가) — 복제 행은 BODY 번호를 물려받지 않는다

`duplicateSelectedRows`의 `delete tech.optionProgress` 아래에 한 줄을 더한다.

```ts
      // FDS/YDS 요청서의 BODY 값. 표에 없는 숨은 값이라 사람이 보고 고칠 수 없다.
      // 물려받으면 요청서에 같은 BODY 가 두 줄 나간다. 지우면 `bodyLabel` 이 `opt` 로 다시 만든다.
      delete tech.bodyNo
```

다른 줄은 건드리지 마라. 그 함수 밖은 손대지 마라.
