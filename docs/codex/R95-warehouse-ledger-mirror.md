# R95 — 창고 화면을 샘플관리대장 미러로 되돌린다

상태: 미착수. 조사 완료, 편집 지점과 교체 코드까지 확정.

추론 강도: **기본값**. 데이터 계약(`CompletedSample.ledger`)과 병합 규칙을 건드린다.

## 배경과 확인한 사실

창고 화면(`/warehouse`)이 샘플관리대장과 다른 값을 보여준다. 실데이터로 대조해 원인을 넷으로 특정했다.

### 1. Style/# 자리에 FL 번호가 뜬다

두 파일에서 열의 뜻이 다르다. 1265행 실측이다.

| 열 | 값 |
|---|---|
| 대장 `Original Ref#` (col 4) | FL26049006 |
| DD `Style No.` (col 2) | FL26049006 |
| 대장 `Style/#` (col 7) | 28166-3 |
| DD `GD#/SA#` (col 18) | 28166-3 |

DD의 `Style No.` 칸에는 팀이 원본 FL을 적는다. 대장 `Style/#`에 대응하는 DD 열은 `GD#/SA#`이고, 파서는 이미 `record.gdNo` / `record.saNo`로 읽고 있다. 그런데 `mergeRecord`가 `record.styleNo`(col 2)를 그대로 써서 FL 번호가 Style 칸에 보인다. DD와 병합된 33행 전부에서 틀린다.

### 2. 병합 우선순위가 DD 편이다

`mergeRecord`는 `record.X || target.X`, `cellValue`와 `coreCell`은 `(DD, 대장)` 순서다. 그래서 대장에 값이 있어도 DD가 덮는다. 실측 불일치는 병합 33행 기준으로 이렇다. 염색 Status 30, 가공 Status 29, 편직 Status 25, Original Ref# 23, Dyeing Side 21, Request Date 17, 원사 Status 16, Yarn 15, Cons. 15, Finish Date 14, Color 13, Target wt' 9.

### 3. 시즌과 카테고리는 파싱 단계에서 값이 바뀐다

`normalizeSeason`이 `SP27`을 `SS'27`로, `normalizeCategory`가 `SEASON DEV`를 `SEASON`으로 만든다. 창고보관 650행 전부에 걸린다.

### 4. FL 없는 DD 레코드가 Style 값만으로 대장 실물에 붙는다

`resolveKey`가 `style:` 색인으로 되돌아간다. 지금 DD에 `Style No.`가 `TBA`인 행이 둘 있고(김지현, SS28, AERIE), 대장 창고보관 1106행(SS27, Style TBA)에 붙어 무관한 값으로 덮는다.

## 사용자가 정한 것

창고 화면은 **샘플관리대장 미러**다. 대장에서 온 행은 대장 값이 기준이고, DD는 대장이 비운 칸만 채운다. Season과 Category도 대장 원문(`FW27`, `SP27`, `SEASON DEV`)을 그대로 보인다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `CompletedSample.ledger`에 `seasonRaw`, `categoryRaw` 추가 |
| `src/data/xlsx-parsers.ts` | 대장 파서가 두 원문을 싣는다 |
| `src/data/fabric-ledger.ts` | `mergeRecord` 우선순위 반전, Style 출처 교정, `emptyFromSample` 보강, DD 레코드는 FL로만 병합 |
| `src/routes/Warehouse.tsx` | `cellValue`와 `coreCell` 우선순위 반전, 시즌과 카테고리 원문 표시, 검색 대상 보강 |
| `src/routes/FabricDetail.tsx` | 시즌과 카테고리 원문 표시 |

---

## 편집 1. `src/data/schema.ts` (198행)

현재

```ts
  ledger?: {
    originalRef?: string
```

교체

```ts
  ledger?: {
    /** 대장 원문. 창고 화면은 정규화 값이 아니라 이 값을 보여준다. */
    seasonRaw?: string
    categoryRaw?: string
    originalRef?: string
```

## 편집 2. `src/data/xlsx-parsers.ts` (764행, `parseSampleSheet` 안)

현재

```ts
      ledger: {
        originalRef: text(row[columns.originalRef]),
```

교체

```ts
      ledger: {
        seasonRaw: text(row[columns.season]),
        categoryRaw: text(row[columns.category]),
        originalRef: text(row[columns.originalRef]),
```

## 편집 3. `src/data/fabric-ledger.ts` — `mergeRecord` 전체 교체 (247행부터 함수 끝까지)

현재

```ts
function mergeRecord(target: FabricLedgerItem, record: DevRecord): FabricLedgerItem {
  const recordStatus = statusFromRecord(record)
  return {
    ...target,
    styleNo: record.styleNo || target.styleNo,
    flNo: record.flNo || target.flNo,
    season: record.season || target.season,
    category: record.category || target.category,
    buyer: record.buyer || target.buyer,
    owner: record.owner || target.owner,
    planner: record.planner || target.planner,
    construction: record.construction || target.construction,
    weight: record.weight || target.weight,
    color: record.color || target.color,
    dyeing: record.dyeing || target.dyeing,
    requestDate: record.requestDate || target.requestDate,
    dueDate: record.dueDate || target.dueDate,
    completedAt: record.receivedDate || target.completedAt,
    status: statusRank[recordStatus] > statusRank[target.status] ? recordStatus : target.status,
    note: record.note || target.note,
    record: target.record ?? record,
  }
}
```

교체

```ts
/**
 * 창고는 샘플관리대장 미러다. 대장 값이 기준이고 DD는 대장이 비운 칸만 채운다.
 * buildFabricLedger는 target에 record가 없을 때만 이 함수를 부른다. 즉 target은 항상 대장에서 온 행이다.
 * Style/#은 DD의 'Style No.'(record.styleNo)가 아니다. 그 칸에는 원본 FL이 들어 있어
 * 그대로 쓰면 Style 자리에 FL 번호가 보인다. 대장 Style/#에 대응하는 DD 열은 'GD#/SA#'(gdNo, saNo)다.
 */
function mergeRecord(target: FabricLedgerItem, record: DevRecord): FabricLedgerItem {
  const recordStatus = statusFromRecord(record)
  return {
    ...target,
    styleNo: target.styleNo || record.gdNo || record.saNo,
    flNo: target.flNo || record.flNo,
    season: target.season || record.season,
    category: target.category || record.category,
    buyer: target.buyer || record.buyer,
    owner: target.owner || record.owner,
    planner: target.planner || record.planner,
    construction: target.construction || record.construction,
    weight: target.weight || record.weight,
    color: target.color || record.color,
    dyeing: target.dyeing || record.dyeing,
    requestDate: target.requestDate || record.requestDate,
    dueDate: target.dueDate || record.dueDate,
    completedAt: target.completedAt || record.receivedDate,
    status: statusRank[recordStatus] > statusRank[target.status] ? recordStatus : target.status,
    note: target.note || record.note,
    record: target.record ?? record,
  }
}
```

## 편집 4. `src/data/fabric-ledger.ts` — `emptyFromSample` 네 값 (183행 부근)

`item.planner`, `item.color`, `item.dyeing`, `item.dueDate`는 지금 빈 문자열로 시작한다. 대장 원본이 `sample.ledger`에 있는데 싣지 않아 FabricDetail이 DD 값으로 채워진다.

현재

```ts
    planner: "",
```

교체

```ts
    planner: sample.ledger?.planner ?? "",
```

현재

```ts
    color: "",
    dyeing: "",
```

교체

```ts
    color: sample.ledger?.color ?? "",
    dyeing: sample.ledger?.dyeingSide ?? "",
```

현재

```ts
    dueDate: "",
```

교체

```ts
    dueDate: sample.ledger?.dueDate ?? "",
```

`weight`는 손대지 않는다. 창고 화면의 `Target wt'`는 `led.targetWeight`를 따로 읽고, `item.weight`는 대장 Final 중량이다.

## 편집 5. `src/data/fabric-ledger.ts` — `records.forEach` 매칭 (330행)

현재

```ts
  records.forEach((record) => {
    const fallback = recordIdentity(record)
    const matchedKey = resolveKey("", record.flNo, record.styleNo, fallback)
```

교체

```ts
  records.forEach((record) => {
    const fallback = recordIdentity(record)
    // DD의 'Style No.'는 대장의 Style/#과 뜻이 다르다. 원본 FL이 들어 있어 실물 식별에 쓰면 남의 행에 붙는다.
    // 그래서 DD 레코드는 FL로만 대장 실물에 붙인다. FL이 없으면 지금까지처럼 자기 style 키로 남는다.
    const matchedKey = normalized(record.flNo)
      ? resolveKey("", record.flNo, "", fallback)
      : fabricLedgerKey("", record.styleNo, fallback)
```

`registerIdentities` 호출은 그대로 둔다. 예전 `style:` 키로 저장된 오버라이드와 이벤트가 계속 풀려야 한다.

## 편집 6. `src/routes/Warehouse.tsx` — `cellValue` 헬퍼 (219행)

현재

```ts
  const first = (...values: Array<unknown>): string => {
    for (const value of values) {
      if (value === undefined || value === null) continue
      const text = String(value).trim()
      if (text) return text
    }
    return ""
  }
```

교체

```ts
  // 창고는 대장 미러다. 호출부는 (DD 값, 대장 값) 순서로 넘기고 여기서 대장 값을 먼저 고른다.
  const first = (fromRecord: unknown, fromLedger?: unknown): string => {
    for (const value of [fromLedger, fromRecord]) {
      if (value === undefined || value === null) continue
      const text = String(value).trim()
      if (text) return text
    }
    return ""
  }
```

호출부 27곳은 건드리지 않는다. 인자 순서가 이미 `(DD, 대장)`이라 이 한 곳만 바꾸면 전부 대장 우선이 된다. `first(record?.tech?.knitSpec?.loopT)`처럼 인자가 하나인 호출이 두 곳 있으므로 두 번째 인자는 반드시 선택 인자로 둔다.

## 편집 7. `src/routes/Warehouse.tsx` — 시즌과 카테고리 원문 (230행 부근, `cellValue` 안)

현재

```ts
    case "season": return item.season
    case "buyer": return item.buyer
    case "category": return item.category
```

교체

```ts
    case "season": return first(item.season, led?.seasonRaw)
    case "buyer": return item.buyer
    case "category": return first(item.category, led?.categoryRaw)
```

## 편집 8. `src/routes/Warehouse.tsx` — `coreCell`의 시즌과 카테고리 (721행 부근)

현재

```ts
    if (id === "season") return <TextCell value={item.season} />
    if (id === "buyer") return <TextCell value={item.buyer} />
    if (id === "category") return <TextCell value={item.category} />
```

교체

```ts
    if (id === "season") return <TextCell value={cellValue(item, "season")} />
    if (id === "buyer") return <TextCell value={item.buyer} />
    if (id === "category") return <TextCell value={cellValue(item, "category")} />
```

`coreCell`의 `led`는 730행에서야 선언되므로 여기서 직접 읽지 말고 `cellValue`를 부른다.

## 편집 9. `src/routes/Warehouse.tsx` — `coreCell`의 `pick` (732행)

현재

```ts
    const pick = <T,>(fromRecord: T | undefined | null, fromLedger: T | undefined | null): T | undefined =>
      (fromRecord === undefined || fromRecord === null || fromRecord === "" ? undefined : fromRecord)
      ?? (fromLedger === undefined || fromLedger === null || fromLedger === "" ? undefined : fromLedger)
      ?? undefined
```

교체

```ts
    const pick = <T,>(fromRecord: T | undefined | null, fromLedger: T | undefined | null): T | undefined =>
      (fromLedger === undefined || fromLedger === null || fromLedger === "" ? undefined : fromLedger)
      ?? (fromRecord === undefined || fromRecord === null || fromRecord === "" ? undefined : fromRecord)
      ?? undefined
```

바로 위 주석 `// DD 원본이 있으면 그 값을, 없으면(과거 대장 행) 대장에서 읽은 원본을 그대로 쓴다.`는 이제 틀린 말이다. `// 대장 값이 기준이다. DD는 대장이 비운 칸만 채운다.`로 고친다. 호출부 25곳은 건드리지 않는다.

## 편집 10. `src/routes/Warehouse.tsx` — 검색 대상 (431행)

현재

```ts
      item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner,
```

교체

```ts
      item.storageNo, item.styleNo, item.flNo, item.season, item.category, item.buyer, item.owner,
      item.sample?.ledger?.seasonRaw, item.sample?.ledger?.categoryRaw, item.sample?.ledger?.originalRef,
```

## 편집 11. `src/routes/FabricDetail.tsx` (154행과 156행)

현재

```tsx
            <Field label="Season">{item.season}</Field>
            <Field label="Buyer">{item.buyer}</Field>
            <Field label="Category">{item.category}</Field>
```

교체

```tsx
            <Field label="Season">{item.sample?.ledger?.seasonRaw || item.season}</Field>
            <Field label="Buyer">{item.buyer}</Field>
            <Field label="Category">{item.sample?.ledger?.categoryRaw || item.category}</Field>
```

---

## 하지 말 것

- `emptyFromRecord`를 고치지 않는다. 여기 `styleNo`를 바꾸면 `fabricLedgerKey`가 만드는 키가 달라져 저장된 오버라이드와 이벤트가 끊긴다. DD 단독 행은 `DEVELOPING`이라 창고 화면에 뜨지도 않는다.
- `mergeSample`을 고치지 않는다. 이미 대장 우선이다.
- `normalizeSeason`과 `normalizeCategory` 자체를 고치지 않는다. RDDA, HOME, DEVELOPMENT 집계가 정규화 값을 쓴다. 원문은 창고와 원단 상세에서만 쓴다.
- `cellValue`와 `coreCell`의 호출부 인자 순서를 바꾸지 않는다. 헬퍼 한 곳만 고친다.
- `registerIdentities` 인자를 바꾸지 않는다.
- 실데이터를 저장소에 쓰지 않는다. 커밋하지 않는다.

## 성공 기준

1. `npm run build` 통과.
2. 창고보관 1265행이 이렇게 보인다. Season `FW27`, Category `SEASON DEV`, Original Ref# `FL26049006`, Style/# `28166-3`, FL.# `FL26089046`, Yarn `CVC 60/40 30'S/1 + SP30D w/back brush CBB`, Cons. `RIB THERMAL`, Dyeing Side `CSD`, Remark 빈칸.
3. 1266행 Season이 `SP27`, Style/#이 `28466-2`.
4. 대장에 빈칸인 칸은 웹에서도 빈칸이다. Finish Date, Due Date, Final 폭, Final 중량, Shrinkage가 여기 해당한다.
5. 1106행(Style TBA)에 김지현, SS28, AERIE 값이 섞이지 않는다.
6. DD와 안 이어진 617행의 표시가 이번 변경 전후로 같다. 시즌과 카테고리 원문 표기만 달라진다.

## 검증

```
npm run build
git status --short
```

끝나면 바꾼 파일 목록과 빌드 결과만 보고한다. 스크린샷과 임시 서버는 만들지 않는다.
