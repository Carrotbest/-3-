# R221 · 통합원단부 1팀 입고 대장 흡수 (1단계: 데이터 계약)

상태: **미착수.**

## 배경

통합원단부 1팀(디자인·마케팅 소싱)이 쓰던 자체 원단 입고 엑셀을 이 앱 WAREHOUSE 안으로 옮긴다.
1팀은 3팀(원단 R&D, 이 앱 운영팀)과 업무가 다르다. 원사·공정 데이터가 없고 완사입이 다수다.

이 지시서는 **데이터 계약과 채번만** 다룬다. 입고 등록 다이얼로그와 붙여넣기 이관은 R222다.

### 실측 근거 (`8000번대 원단 리스트.xlsx`, 302행, R&D No. 8437~8979)

| 항목 | 값 |
|---|---|
| Ref. No(FL) 기입률 | 302/302 |
| FL 개발처 | 완사입 65%, 생산팀 22%, GD개발 13% |
| Remark | 숫자+YDS 260건, "전량" 11건. **숫자는 현재 잔량이고, "전량"은 수량 미상이다** |
| 위치 열 | 0/302 (미사용) |
| 폐기 열 | 0/302 (미사용) |
| 공급처 | 31/302 |
| 같은 FL 중복 입고 | 2건 (FL25102111, FL26022127). **동일 원단의 다른 컬러다** |

## 확정 규칙 (사용자와 1팀이 정했다. 코드가 어긋나면 코드를 고친다)

1. **입고 대기 단계를 만들지 않는다.** 1팀은 실물이 온 뒤 번호를 매긴다. 등록이 곧 창고 보관이다.
2. **Remark 숫자는 현재 잔량이다.** 입고량은 원본에 없다. 이관 시점을 기초 재고 확정일로 보고, 잔량을 `yds`에 넣고 출고 이력 0으로 시작한다.
   **"전량" 11건은 수량 미상이다.** 업체에서 받은 전량을 넣었다는 뜻이고 재고 확인이 안 됐다. `yds`를 `null`로 두고 0을 넣지 마라. 재고 칸에는 "미상"으로 그린다.
3. **채번은 3팀과 완전히 분리한다.** 3팀은 1~7999 순환(현행 유지). 1팀은 8000부터 상한 없이 순증하고 순환하지 않는다. 8999 다음은 9000, 9999 다음은 10000이다. 8000번대를 쓰는 다른 부서는 없다.
4. **1팀 행은 FL 원장과 RDDA 집계에 넣지 않는다.** 1팀은 같은 FL에 컬러별로 R&D No.를 따로 매긴다. FL 대 R&D No.가 1:N이라 3팀 계약("고유 FL 1개 = 개발 등록 1건")과 충돌한다.
5. **1팀 행은 FL이나 Style로 다른 행과 병합되면 안 된다.** 위 4번의 귀결이다. 자세한 것은 아래 "3-2. 병합 격리"를 보라.
6. **공급처는 완사입만이 아니다.** GD(자체 vertical 공장) 원단이 많다. 열 이름을 "완사입 업체"로 짓지 마라. "공급처"다.
7. **Price는 필수값이 아니다.** 가격 확인이 안 된 원단이 있다. 0으로 채워진 28건은 미확인이라는 뜻이므로 빈칸으로 다룬다.
8. **Rack No.는 창고팀이 관리한다.** 1팀은 입력하지 않는다. 1팀 원단도 3팀과 같은 K/L 선반 체계를 쓴다.
9. **출고 이력은 남긴다.** 1팀도 3팀과 같은 출고 등록을 쓴다. 잔량만 고치는 단순 모드는 만들지 않는다.

## 팀 스코프를 어떻게 표시하는가

**새 저장소를 만들지 않는다.** 기존 `CompletedSample.sourceSheet`를 스코프 표시로 쓴다.
웹 직접 등록이 이미 `WEB_INTAKE_SHEET = "웹 등록"`으로 구분되고 있고, 이 값이 `buildFabricLedger`를 타고 `FabricLedgerItem.sourceSheet`까지 그대로 흐른다. 동기화·캐시·병합 경로를 손대지 않아도 된다.

## 파일별 조치

### 1. `src/data/schema.ts`

307행 `export const WEB_INTAKE_SHEET = "웹 등록"` 바로 아래에 추가한다.

```ts
/** 통합원단부 1팀(디자인·마케팅 소싱) 입고 대장 행. 3팀 원단과 채번·집계를 분리하는 표시다. */
export const FABRIC1_INTAKE_SHEET = "1팀 입고"
```

### 2. `src/data/fabric-ledger.ts`

61행 `export const STORAGE_NO_MAX = 7999` 아래에 추가한다. 기존 상수는 그대로 둔다(3팀 전용이다).

```ts
/** 1팀 대역 시작 번호. 1팀은 여기서부터 상한 없이 순증하고 되감지 않는다. */
export const FABRIC1_STORAGE_NO_MIN = 8000

export function isFabric1Item(item: FabricLedgerItem): boolean {
  return item.sourceSheet === FABRIC1_INTAKE_SHEET
}
```

`FABRIC1_INTAKE_SHEET`를 `./schema`에서 import 한다.

63행 `storageNumberOf`의 정규식을 `/^\d{1,4}(?!\d)/` 에서 `/^\d{1,5}(?!\d)/` 로 바꾼다. 1팀이 5자리로 넘어갈 수 있다.

68행 `warehouseSequenceStart`와 83행 `warehouseOrderKey`는 3팀 순환 정렬 전용이다. 시그니처를 바꾸지 말고 JSDoc 첫 줄에 "3팀(1~7999) 순환 정렬 전용. 1팀 행을 넣지 마라."를 적는다.

90행 `FABRIC_FIELD_IDS` 배열 끝에 네 개를 더한다.

```ts
"content", "priceYd", "priceLb", "supplier",
```

`supplier`는 공급처다. 완사입 업체만이 아니라 GD 자체 공장도 들어간다. 식별자나 라벨에 "완사입"을 쓰지 마라.

99행 `CORE_FIELD_IDS`에는 **넣지 않는다.** 원장 본문 필드가 아니라 `fields` 안에만 사는 값이다.

108행 `deriveFields`가 돌려주는 객체에 네 키를 빈 문자열 기본값으로 더한다. 1팀 값은 override.fields에서만 온다.

```ts
content: "",
priceYd: "",
priceLb: "",
supplier: "",
```

**`CompletedSample`이나 `DevRecord`의 기존 타입을 넓히지 마라.** 네 값은 `override.fields`에서만 온다.

### 2-2. `src/data/fabric-ledger.ts` — 병합 격리 (중요)

1팀은 같은 FL에 컬러별로 R&D No.를 따로 매긴다. 지금 `buildFabricLedger`는 FL을 병합 색인으로 쓰기 때문에 그대로 두면 두 가지가 깨진다.

첫째, 1팀 행끼리는 452~455행의 방어가 이미 막아 준다.

```ts
    // R&D No.가 있는 행은 같은 FL이나 Style의 다른 실물에 흡수하지 않는다.
    if (normalized(storageNo)) return directKey
```

1팀 행은 등록 시점에 R&D No.가 반드시 있으므로 서로 흡수되지 않는다. **이 줄을 건드리지 마라.**

둘째가 진짜 문제다. 486행 `registerIdentities`가 `fl:FL26012345`를 1팀 행 key로 색인에 올린다. 그러면 **같은 FL을 쓰는 3팀 DD 레코드가 1팀 입고 행에 병합된다.** 1팀 FL 중 13%가 GD개발이라 3팀 DD에도 같은 FL이 있을 수 있다. 병합되면 한 항목이 되어 팀 스코프 어느 한쪽에서 사라진다.

**막는 방법.** 476행의 종료 이력 처리가 쓰는 방식을 그대로 따른다. 그 자리 주석이 선례다.

```ts
      // 종료 이력은 다른 항목과 병합되지 않도록 완성된 자기 key만 등록하고 FL/Style은 색인하지 않는다.
```

483~490행의 일반 sample 처리에서, 1팀 행이면 `fl:`과 `style:` 색인을 올리지 않는다.

```ts
    const fallback = sampleFallback(sample, index)
    const storageNo = sample.storageNo ?? ""
    const fabric1 = sample.sourceSheet === FABRIC1_INTAKE_SHEET
    const matchedKey = fabric1
      ? fabricLedgerKey(sample.flNo, sample.styleNo, fallback, storageNo)
      : resolveKey(storageNo, sample.flNo, sample.styleNo, fallback)
    const existing = items.get(matchedKey)
    const item = existing ? mergeSample(existing, sample, index) : emptyFromSample(sample, index)
    items.set(matchedKey, item)
    if (fabric1) {
      // 1팀은 같은 FL에 컬러별로 R&D No.를 따로 매긴다. FL·Style 색인을 올리면
      // 같은 FL 의 3팀 DD 레코드가 1팀 입고 행에 병합된다. 자기 key 만 등록한다.
      identityIndex.set(matchedKey, matchedKey)
      return
    }
    // R&D No.가 key여도 FL을 함께 등록해야 뒤의 DD 레코드가 같은 항목을 찾는다.
    registerIdentities(item, [
      ...fabricIdentities(storageNo, sample.flNo, sample.styleNo),
      `source:${sample.sourceSheet ?? "sample"}::${index}`,
    ])
```

`forEach` 콜백 안이므로 `return`이 곧 continue다.

`fabricLedgerKey`(169행)는 `storageNo`가 있으면 `rnd:<번호>`를 먼저 돌려준다. 1팀 행은 R&D No.가 항상 있으므로 key가 `rnd:8913` 형태로 안정적이다. **`fabricLedgerKey`를 고치지 마라.**

### 3. `src/data/derive.ts` — FL 집계 배제

1284행 `for (const sample of samples) {` 바로 다음 줄에 넣는다.

```ts
    // 1팀 입고 행은 FL 대 R&D No.가 1:N 이라 단일 원장 계약을 깬다. 집계에서 뺀다.
    if (sample.sourceSheet === FABRIC1_INTAKE_SHEET) continue
```

`FABRIC1_INTAKE_SHEET`를 `./schema`에서 import 한다.
`mergedFlRegistrations` 외의 다른 함수는 이 함수를 타고 가므로 여기 한 곳만 막으면 된다.

### 4. `src/routes/Warehouse.tsx` — 채번 분리

236행 `occupiedStorageNumbers`, 247행 `lastIssuedStorageNumber`, 257행 `nextStorageNumbers` 세 함수에 `scope: "team3" | "team1"` 인자를 더한다.

현재 `nextStorageNumbers`(257~269행)는 이렇다.

```ts
function nextStorageNumbers(items: readonly FabricLedgerItem[], count: number): number[] {
  const used = occupiedStorageNumbers(items)
  const picked: number[] = []
  const take = (candidate: number) => {
    if (used.has(candidate)) return
    picked.push(candidate)
    used.add(candidate)
  }
  // 마지막 채번 다음부터 위로 채우고, 7999 를 넘기면 비어 있는 낮은 번호로 되감는다.
  for (let candidate = lastIssuedStorageNumber(items) + 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  for (let candidate = 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  return picked
}
```

이렇게 바꾼다.

```ts
function nextStorageNumbers(items: readonly FabricLedgerItem[], count: number, scope: "team3" | "team1" = "team3"): number[] {
  const scoped = items.filter((item) => isFabric1Item(item) === (scope === "team1"))
  const used = occupiedStorageNumbers(scoped)
  const picked: number[] = []
  const take = (candidate: number) => {
    if (used.has(candidate)) return
    picked.push(candidate)
    used.add(candidate)
  }
  if (scope === "team1") {
    // 1팀은 되감지 않는다. 마지막 번호 다음부터 계속 올린다. 상한이 없다.
    const last = Math.max(FABRIC1_STORAGE_NO_MIN - 1, ...[...used])
    for (let candidate = last + 1; picked.length < count; candidate += 1) take(candidate)
    return picked
  }
  // 3팀은 마지막 채번 다음부터 위로 채우고, 7999 를 넘기면 비어 있는 낮은 번호로 되감는다.
  for (let candidate = lastIssuedStorageNumber(scoped) + 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  for (let candidate = 1; candidate <= STORAGE_NO_MAX && picked.length < count; candidate += 1) take(candidate)
  return picked
}
```

`occupiedStorageNumbers`와 `lastIssuedStorageNumber`는 인자로 받은 목록만 보므로 시그니처를 바꾸지 말고 그대로 둔다. 위처럼 `scoped`를 넘기면 된다.

**왜 필요한가.** 지금은 세 함수가 상태 `WAREHOUSE`인 모든 행을 훑는다. 1팀 8xxx가 같은 저장소에 들어오면 `lastIssuedStorageNumber`가 8979를 돌려주고, 첫 루프 조건 `candidate <= 7999`가 한 건도 못 뽑아 되감기 루프로 넘어간다. 그 결과 3팀에 1번부터 다시 발급한다. 이게 이번 작업에서 가장 위험한 지점이다.

571행 `sequenceStart`는 3팀 순환 정렬용이다. `.filter((item) => item.status === "WAREHOUSE")` 를 `.filter((item) => item.status === "WAREHOUSE" && !isFabric1Item(item))` 로 바꾼다.

621행 정렬은 1팀 스코프일 때 `warehouseOrderKey` 대신 번호 오름차순을 쓴다.

```ts
      if (teamScope === "team1") {
        return [...filtered].sort((left, right) => (storageNumberOf(left) ?? Number.MAX_SAFE_INTEGER) - (storageNumberOf(right) ?? Number.MAX_SAFE_INTEGER))
      }
```

672행, 788행, 1025행의 `nextStorageNumbers(ledger, n)` 호출에 현재 스코프를 세 번째 인자로 넘긴다. 672행의 `.padStart(4, "0")`은 1팀에서 5자리를 깎지 않도록 3팀일 때만 적용한다.

794~795행의 수동 입력 검증은 지금 이렇다.

```ts
          if (!/^\d{1,4}$/.test(raw) || !Number.isInteger(num) || num < 1 || num > STORAGE_NO_MAX) {
            throw new Error(`R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 타 사업부 대역입니다.`)
```

스코프별로 나눈다.

```ts
          const okTeam3 = /^\d{1,4}$/.test(raw) && Number.isInteger(num) && num >= 1 && num <= STORAGE_NO_MAX
          const okTeam1 = /^\d{4,5}$/.test(raw) && Number.isInteger(num) && num >= FABRIC1_STORAGE_NO_MIN
          if (teamScope === "team1" ? !okTeam1 : !okTeam3) {
            throw new Error(teamScope === "team1"
              ? `R&D No. 는 ${FABRIC1_STORAGE_NO_MIN} 이상이어야 합니다.`
              : `R&D No. 는 1부터 ${STORAGE_NO_MAX} 사이여야 합니다. 8000번대는 1팀 대역입니다.`)
```

### 5. `src/routes/Warehouse.tsx` — 팀 전환과 탭

400행 `export function Warehouse()` 안에 상태를 더한다.

```ts
  const [teamScope, setTeamScope] = useState<"team3" | "team1">("team3")
```

`ledger`를 쓰는 화면 목록은 `isFabric1Item(item) === (teamScope === "team1")`으로 먼저 거른다. 채번 계산에 넘기는 `ledger`는 **거르지 않은 전체**를 그대로 넘긴다(위 4번이 안에서 거른다).

156행 `TAB_ORDER`는 1팀에서 `["WAREHOUSE", "HISTORY"]`만 쓴다. 상수를 지우지 말고 화면에서 걸러라.

```ts
const TAB_ORDER_TEAM1: WarehouseTab[] = ["WAREHOUSE", "HISTORY"]
```

`teamScope`가 `team1`로 바뀔 때 현재 탭이 `READY`면 `WAREHOUSE`로 옮긴다.

1428행의 "직접 추가" 버튼은 `tab === "READY"` 조건이라 1팀에서는 자동으로 사라진다. 그대로 둔다. 1팀 등록 버튼은 R222에서 만든다.

팀 전환 UI는 탭 줄 왼쪽에 세그먼트 버튼 두 개로 둔다. 라벨은 `3팀 원단`과 `1팀 원단`이다. 새 컴포넌트 파일을 만들지 말고 `Warehouse.tsx` 안에서 기존 탭 버튼 마크업을 따라 그린다.

### 6. `src/routes/Warehouse.tsx` — 열 4개 추가

63행 `WarehouseColumnId` 유니온에 `"content" | "priceYd" | "priceLb" | "supplier" | "flSource"` 를 더한다.

86행 `COLUMN_GROUPS`의 `ledger` 그룹에서 `construction` 다음에 `content`를, `dyeing` 다음에 나머지를 넣는다.

```ts
    { id: "content", label: "Content", width: 200 },
    { id: "flSource", label: "구분", width: 84 },
    { id: "supplier", label: "공급처", width: 150 },
    { id: "priceYd", label: "Price ($/YD)", width: 88 },
    { id: "priceLb", label: "Price ($/LB)", width: 88 },
```

288행 `cellValue`에 분기를 더한다. `content`, `supplier`, `priceYd`, `priceLb`는 `item.fields.<id>`에서 읽는다.

`flSource`는 **저장하지 않는 파생 열**이다. `src/data/derive.ts`의 `rddaProductionType(item.flNo)`(1158행)을 불러 한글 라벨로 바꾼다. 1팀은 FL 기입률이 100%라 공짜로 채워지는 값이다.

```ts
    case "flSource": {
      if (!item.flNo.trim()) return ""
      const type = rddaProductionType(item.flNo)
      return type === "gd" ? "GD개발" : type === "purchase" ? "완사입" : type === "production" ? "생산팀" : type === "domestic" ? "자체개발" : "기타"
    }
```

151행 `MANUAL_EDITABLE` 집합에 `"content", "priceYd", "priceLb", "supplier"` 네 개를 더한다. **`flSource`는 넣지 마라.** 파생 값이라 고칠 수 없다.

**3팀 스코프에서는 이 다섯 열을 감춘다.** 3팀 원단에는 값이 없다. 열 목록을 만드는 자리에서 `teamScope === "team1"`일 때만 포함한다.

거꾸로 **1팀 스코프에서는 `process` 그룹과 `rdda` 그룹 전체를 감춘다.** 1팀에는 원사·공정 데이터가 없고 RDDA 성과는 3팀 FL만 수치가 있다.

## 하지 말 것

- **새 Zustand 스토어나 새 Firestore 컬렉션을 만들지 마라.** 팀 구분은 `sourceSheet` 한 값으로 끝난다.
- **`CompletedSample` 이나 `DevRecord` 타입을 넓히지 마라.** 신규 4개 필드는 `override.fields`에만 산다.
- **`STORAGE_NO_MAX` 값을 바꾸지 마라.** 3팀 순환 규칙이 여기 걸려 있다. 1팀은 별도 상수를 쓴다.
- **`src/data/disposal-round.ts`를 손대지 마라.** 폐기 라운드는 R223에서 팀 분리한다. 이번에는 3팀 동작이 지금과 같기만 하면 된다.
- **452~455행의 `if (normalized(storageNo)) return directKey` 를 지우지 마라.** 1팀 행끼리 같은 FL로 합쳐지는 것을 이 줄이 막는다.
- **잔량이 없는 행에 0을 넣지 마라.** `yds`가 `null`이면 수량 미상이다. 0은 소진을 뜻한다. `isFabricBalanceExhausted`(165행)가 이미 `null`을 소진으로 보지 않게 돼 있다.
- **`supplier` 를 "완사입 업체"로 부르지 마라.** GD 자체 공장 원단이 많다.
- **엑셀 업로드 파서를 만들지 마라.** 2026-09-14에 창고는 엑셀을 파싱하지 않기로 정했다. 이관은 R222의 붙여넣기로 한다.
- **기존 3팀 동작을 바꾸지 마라.** `teamScope` 기본값이 `team3`이고, 그 상태에서 화면과 채번이 지금과 완전히 같아야 한다.

## 검증

```bash
cd C:\Users\hkpark\Desktop\fabric-rnd
npm run build
git status --short
```

빌드가 통과하고, `git status --short`에 아래 파일만 `M`으로 뜨면 된다.

```
 M src/data/schema.ts
 M src/data/fabric-ledger.ts
 M src/data/derive.ts
 M src/routes/Warehouse.tsx
```

`teamScope` 기본값이 `team3`이므로, 이 작업을 마친 뒤 창고 화면의 3팀 동작은 지금과 완전히 같아야 한다. 열도 지금과 같아야 한다. 1팀 데이터는 아직 하나도 없으므로 1팀 스코프는 빈 표가 정상이다.

`src/routes/Calendar.tsx`에 사용자가 만든 변경이 있다. 건드리지 마라.

## R222에서 할 것 (이번에 하지 마라)

- 1팀 입고 등록 다이얼로그. Rack No.는 넣지 않는다(창고팀이 채운다).
- 기존 302행 붙여넣기 이관. "전량" 11건은 `yds = null`, Price 0인 28건은 빈칸.
- FL 입력 시 3팀 원장·DD 자동 채움
- FABRIC REQUEST 연결
- `departments.ts`의 `fabric1` 부서에 창고 편집 권한. 단 1팀 스코프만 고칠 수 있게 막는다. 1팀 팀원이 각자 등록한다.
- `fabric-rnd/CLAUDE.md` 첫 줄 정정. 지금 "통합원단부 1팀(원단 R&D팀)"으로 적혀 있는데 거꾸로다. 우리 팀은 3팀이고 1팀은 디자인·마케팅 소싱이다. `src/data/departments.ts`가 맞다.
