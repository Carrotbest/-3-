# R276 FULL DETAIL, 입력 순서, 공정 REMARK, FL 제목

상태: **미착수.** R275 까지 구현 완료, 워킹트리 미커밋, `npm run build` 통과 확인함.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/fabric-cost.ts` | `CostFee` 에 `remark?: string` 추가 |
| `src/components/dd/CostSheetDialog.tsx` | FULL DETAIL 줄, 입력 순서, REMARK 열, 제목 |
| `src/routes/DevelopmentMasterSheet.tsx` | 팝업에 R&D No. 를 넘기는 prop 하나 |

출력(엑셀, 인쇄)은 **R277 에서 한다. 이번에 손대지 마라.**
`cost-export.ts`, `cost-sheets.ts`, `CostSheets.tsx`, `yarn-blend.ts` 를 건드리지 마라.

---

## 1. 팝업 폭

`DialogContent` className 의 `xl:w-[800px]` 을 **`xl:w-[900px]`** 로.
공정 표에 REMARK 열이 늘어 800px 에서는 REMARK 가 70px 로 떨어진다.

**`relative`, `absolute`, `static` 을 넘기지 마라.**

---

## 2. 상단 정보 바

### 2-1. 칩 줄

지금 `Style No. · Project · Buyer · Season · Color · 조직` 여섯 개를 칩으로 늘어놓는다.
**`조직` 을 뺀다.** 아래 FULL DETAIL 에 들어가 중복이다. 나머지 다섯은 그대로다.

### 2-2. 입력 줄

지금은 `환율`, `완성 중량`, `완성 폭`, `gr/yd` 네 칸이 같은 폭 격자다.
**FULL DETAIL 을 왼쪽에 넓게 두고 입력을 오른쪽에 붙인다.** 순서가 바뀐다.

```
[FULL DETAIL ................................] [완성 폭] [완성 중량] [gr/yd] [환율]
```

```tsx
<div className="flex flex-wrap items-end gap-2">
  <div className="min-w-[200px] flex-1">
    <Label className="text-[11px]">FULL DETAIL</Label>
    <div title={fullDetail} className="mt-1 flex h-8 items-center truncate rounded border border-[var(--border)] bg-[var(--muted)]/30 px-2 text-xs">{fullDetail || "-"}</div>
  </div>
  {/* 완성 폭 (inch), 완성 중량 (g/㎡), gr/yd, 환율 (KRW/USD) 순서로 각각 w-[110px] */}
</div>
```

`fullDetail` 은 컴포넌트 안에서 만든다. DD 의 Yarn Detail 과 조직을 잇는다.

```ts
const fullDetail = [row.tech?.yarnDetail, row.construction].map((value) => (value ?? "").trim()).filter(Boolean).join("  /  ")
```

- `완성 폭 (inch)`, `완성 중량 (g/㎡)`, `환율 (KRW/USD)` 은 지금 Input 을 그대로 옮긴다.
  `value`, `onChange`, `className` 을 바꾸지 마라. 바뀌는 것은 **자리 순서와 폭**뿐이다.
- `gr/yd` 는 지금처럼 읽기 전용 상자다. `<div>` 그대로 쓰되 **비활성으로 보이게**
  `bg-[var(--muted)]/30` 과 `text-[var(--muted-foreground)]` 를 준다. 값은 `money(result.grPerYd)` 그대로.
- 각 입력 칸은 `w-[110px]`, 라벨은 `text-[11px]` 이다.
- 버전 select 는 지금 자리(칩 줄 오른쪽 끝)에 그대로 둔다.

---

## 3. 공정 REMARK 열

### 3-1. 타입

`fabric-cost.ts` 의 `CostFee` 에 한 줄 더한다. **선택 필드다.** 기존 저장 문서에 없어도 된다.

```ts
export interface CostFee {
  group: FeeGroup
  label: string
  mill?: string
  rate: number
  unit: FeeUnit
  /** 공장 지정 loss %. 산출 대비다. */
  loss: number
  /** 공정별 비고. 사람이 적는다. 편직은 DD 편직 사양으로 처음 한 번 채운다. */
  remark?: string
}
```

**`computeFabricCost` 는 건드리지 마라.** `remark` 는 계산에 들어가지 않는다.

### 3-2. 편직 자동 입력

DD 레코드의 `tech.knitSpec` 여섯 항목(`inch`, `gauge`, `needles`, `loopF`, `loopT`, `loopB`)을 잇는다.
`CostSheetDialog.tsx` 파일 위쪽에 만든다.

```ts
const KNIT_SPEC_LABELS: [keyof NonNullable<DevTechnical["knitSpec"]>, string][] = [
  ["inch", "Inch"], ["gauge", "Gauge"], ["needles", "Needles"],
  ["loopF", "Loop F"], ["loopT", "Loop T"], ["loopB", "Loop B"],
]
const knitSpecRemark = (row: DevRecord): string => {
  const spec = row.tech?.knitSpec
  if (!spec) return ""
  return KNIT_SPEC_LABELS
    .map(([key, label]) => [label, (spec[key] ?? "").trim()] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${value}`)
    .join(" / ")
}
```

`defaultInput` 의 편직 줄에만 넣는다.

```ts
{ ...blankFee("knitting", row.tech?.mills?.knitting), label: "편직", remark: knitSpecRemark(row) },
```

**`defaultInput` 에서만 채운다.** `loadVersion` 으로 저장된 버전을 불러올 때는 덮지 마라.
그 계산서가 저장한 remark 가 있다. 사람이 지운 값이 되살아나면 안 된다.

### 3-3. 열

공정 표 `<colgroup>` 과 머리줄에 REMARK 를 **업체 다음, 단가 앞**에 끼운다.

| 열 | `<col>` | 비고 |
|---|---|---|
| # | `w-8` | 그대로 |
| 그룹 | `w-[72px]` | **96 에서 줄인다.** 네 글자뿐이다 |
| 공정명 | `w-[88px]` | 그대로 |
| 업체 | `w-[96px]` | **남는 폭에서 고정으로 바꾼다** |
| REMARK | (없음, 남는 폭) | **새 열** |
| 단가 | `w-[84px]` | 그대로 |
| 단위 | `w-[92px]` | 그대로 |
| LOSS % | `w-[52px]` | 그대로 |
| 액션 | `w-[72px]` | 그대로 |

REMARK 칸은 Input 하나다. 긴 글이 들어가므로 `title` 로 전체를 보인다.

```tsx
<td className="px-1.5 py-1">
  <Input aria-label="비고" disabled={!canEdit} value={fee.remark ?? ""} title={fee.remark || undefined}
    onChange={(event) => setFee(index, { remark: event.target.value })} className={field} />
</td>
```

그룹 밴드 줄의 `colSpan` 을 8에서 **9** 로 고친다.

원사 표의 오른쪽 네 열(`단가 84`, `단위 92`, `선염 52`, `액션 72`)은 그대로다. 줄이 계속 맞는다.

---

## 4. 제목

지금 `<DialogTitle>사전 원가계산서</DialogTitle>` 이다. FL No. 를 앞세운다.

```tsx
<DialogTitle className="flex flex-wrap items-baseline gap-2">
  <span className="text-[10px] font-normal tracking-[0.18em] text-[var(--muted-foreground)]">사전 원가계산서</span>
  <span>{row.flNo?.trim() || "FL 미등록"}</span>
  {storageNo ? <span className="text-xs font-normal text-[var(--muted-foreground)]">R&amp;D No. {storageNo}</span> : null}
</DialogTitle>
```

`storageNo` 는 새 prop 에서 온다. 없으면 아무것도 안 그린다.

계산일 경과 배지(`isCostSheetStale`)는 지금 자리에 그대로 둔다.

### 4-1. prop

`CostSheetDialogProps` 에 더한다.

```ts
  /** 창고 원장에서 찾은 R&D No. 표기. 연결이 없으면 빈 문자열. */
  storageNoFor?: (row: DevRecord) => string
```

컴포넌트 안에서 `const storageNo = props.storageNoFor?.(row) ?? ""` 로 쓴다.
**선택 prop 이다.** 안 넘겨도 동작해야 한다.

### 4-2. DD MASTER 가 넘기는 값

`src/routes/DevelopmentMasterSheet.tsx` 는 이미 **1164행에 `ledger`, 1165행에 `ledgerByRecord`**
(`Map<recordIdentity, FabricLedgerItem>`)를 들고 있다. 그걸 그대로 쓴다.

`@/data/fabric-ledger` import 에 `storageNoLabel` 을 더한다(기존 import 를 지우지 마라).

`<CostSheetDialog … />` 를 그리는 자리에 prop 하나를 더한다.

```tsx
storageNoFor={(target) => {
  const item = ledgerByRecord.get(recordIdentity(target))
  return item?.storageNo ? storageNoLabel(item) : ""
}}
```

**`buildFabricLedger` 를 새로 부르지 마라.** 이미 만든 `ledgerByRecord` 를 쓴다.
`storageNoLabel` 을 채번, 정렬, 중복 검사에 쓰지 마라. 표기 전용이다.

---

## 5. 하지 말 것

- **`computeFabricCost` 를 건드리지 마라.** `remark` 는 계산에 안 들어간다.
- `CostResult` 의 어떤 필드도 지우지 마라. `netKrwPerYd` 는 DD 열, 자료실, 엑셀이 쓴다.
- `loadVersion` 에서 `remark` 를 덮어쓰지 마라. 저장된 값이 이긴다.
- `saveNew`, `overwrite`, `buildSheet`, `refOf` 의 동작을 바꾸지 마라. 저장 경로다.
- 원사 표의 열 폭과 성분 접기(`openSpecRows`, `specSummary`)를 건드리지 마라. R275 에서 끝났다.
- 결과 단가 세 칸과 이익률 줄을 건드리지 마라. R273 에서 끝났다.
- 공정 배열 순서가 공정 순서라는 계약을 바꾸지 마라. 그룹 안 순번은 표시용이다.
- 공정명을 `<select>` 로 바꾸지 마라.
- `DevelopmentMasterSheet.tsx` 에서 prop 추가와 import 한 줄 말고 다른 것을 고치지 마라.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 6. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
