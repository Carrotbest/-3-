# R273 원사 행 한 줄로 합치기와 결과 단가 3종

상태: **미착수.** R272 까지 구현 완료, 워킹트리 미커밋, `npm run build` 통과 확인함.
실사용 화면을 보고 나온 수정이다. 원사 입력부가 아직 크다고 박향근이 지적했다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/fabric-cost.ts` | `CostResult` 에 `netPerLb`, `totalPerLb` 추가 |
| `src/components/dd/CostSheetDialog.tsx` | 원사 행에 성분을 인라인으로 합침. 결과 단가 3종 순서와 이익률 자리 |

이 둘 외에는 수정하지 마라.

---

## 1. `netPerLb` 추가 (`fabric-cost.ts`)

엑셀 `K34` 가 `=ROUND(K33/2.2046,2)` 다. 상수 `LB_PER_KG`(73행)이 이미 있다.

`CostResult` 인터페이스에 두 줄을 더한다. 위치는 `netPerKg` 바로 뒤, `totalPerKg` 바로 뒤다.

```ts
  netPerKg: number
  netPerLb: number
  ...
  totalPerKg: number
  totalPerLb: number
```

`computeFabricCost` 안에서 계산하고 반환 객체에 넣는다.

```ts
  const netPerLb = round(netPerKg / LB_PER_KG, 2)
  const totalPerLb = totalPerKg / LB_PER_KG
```

**기존 필드를 하나도 지우지 마라.** `netKrwPerYd` 와 `totalKrwPerYd` 는 화면에서 빠져도
DD MASTER `COST` 열, `/cost` 자료실 표, `cost-export.ts` 엑셀, `cost-sheets.ts` 버전 비교가
계속 쓴다. 값은 그대로 계산해서 반환한다.

---

## 2. 원사 행을 한 줄로 (`CostSheetDialog.tsx`)

### 2-1. 지금 무엇이 문제인가

원사 한 줄 아래에 성분 표가 `<tr colSpan={8}>` 로 통째로 붙는다. 성분이 하나뿐이어도
머리줄, 번호 칸, 성분 추가 버튼까지 세 줄을 더 먹는다. 원사 표기가 파싱되지 않으면
이 표가 기본으로 펼쳐지므로 실사용에서는 거의 항상 펼쳐져 있다.

**성분은 보통 1~2개, 많아야 4개다.** 가로로 붙이면 한 줄에 들어간다.

### 2-2. 바꾸는 것

**성분 전용 열을 하나 만들어 원사 행 안에 넣는다.** 펼침 행(`expandedYarns` 가 그리는
`<tr className="bg-[var(--muted)]/20">` 블록)을 통째로 없앤다.

새 열 구성이다. `<colgroup>` 도 같이 고친다.

| 열 | 폭 | 내용 |
|---|---|---|
| # | `w-8` | 번호 |
| 원사 표기 | `w-[200px]` | Input. 아래 줄 해석 결과는 **지운다**(아래 2-3) |
| 성분 | 남는 폭(`<col />`) | 성분들을 가로로 나열 |
| 투입 % | `w-[76px]` | 그대로 |
| 단가 | `w-[92px]` | 그대로 |
| 단위 | `w-[100px]` | 그대로 |
| 선염 | `w-[44px]` | 그대로 |
| 삭제 | `w-8` | 그대로 |

**성분 펼침 버튼 열을 없앤다.** `expandedYarns`, `toggleYarn`, `ChevronDown`, `ChevronRight`
import 와 상태를 전부 지운다. 행 추가 때 `setExpandedYarns` 를 부르던 자리도 지운다.

성분 칸 안쪽은 이렇게 그린다.

```tsx
<td className="px-1.5 py-1">
  <div className="flex flex-wrap items-center gap-1">
    {(yarn.spec?.components ?? [blankComponent()]).map((component, componentIndex) => (
      <div key={componentIndex} className="flex items-center gap-0.5">
        <Input aria-label="섬유명" placeholder="cotton" disabled={!canEdit}
          value={component.fiber}
          onChange={(event) => setComponent(index, componentIndex, normalizeComponentMode({ ...component, fiber: event.target.value }))}
          className={`${field} w-[104px]`} />
        <Input aria-label="번수" placeholder="굵기" type="number" disabled={!canEdit}
          value={component.nominal || ""}
          onChange={(event) => setComponent(index, componentIndex, { nominal: numberValue(event.target.value) })}
          className={`${field} w-[56px] text-right tabular-nums`} />
        <select aria-label="번수 단위" disabled={!canEdit} value={component.unit}
          onChange={(event) => setComponent(index, componentIndex, { unit: event.target.value as CountUnit })}
          className="h-8 w-[62px] rounded border border-[var(--input)] bg-[var(--background)] px-1 text-xs">
          {COUNT_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
        </select>
        {/* 성분이 2개 이상일 때만 삭제 */}
      </div>
    ))}
    {/* 성분 추가 버튼 */}
  </div>
</td>
```

- 성분 삭제는 **성분이 2개 이상일 때만** 보인다. 아이콘 버튼(`Trash2`)을 그 성분 묶음 끝에
  `size="icon"` `variant="ghost"` 로 붙이되 `className="size-6"` 로 줄인다.
  하나뿐일 때는 버튼 자체를 그리지 마라. 비활성 버튼이 자리를 먹는다.
- `성분 추가` 는 `+` 아이콘만 있는 `size="icon"` 버튼(`className="size-6"`)으로 줄인다.
  글자 `성분 추가` 를 빼고 `aria-label="성분 추가"` 와 `title="성분 추가"` 를 단다.
  **성분이 4개면 그리지 마라.** 4개가 상한이다.
- 성분이 넷이면 `flex-wrap` 으로 두 줄이 된다. 그대로 둔다. 흔한 경우가 아니다.
- 열 머리 `성분` 아래에 작은 보조 머리를 만들지 마라. 칸이 좁아진다.

### 2-3. 해석 결과 줄

원사 표기 칸 아래 `describeSpec` 줄을 **지운다.** 성분이 바로 옆에 보이므로 같은 말을 두 번 한다.
`describeSpec` 함수가 다른 데서 안 쓰이면 함수도 지운다.

대신 **파싱 실패 표시만 남긴다.** `parseYarnSpec(yarn.name)` 이 `null` 이면 원사 표기 Input 에
`border-amber-500` 을 더하고 `title="표기를 해석하지 못했습니다. 성분을 직접 채우십시오."` 를 단다.
`autoYarns[index]` 가 `true` 면 Input 오른쪽 끝에 `자동` 을 `text-[10px]` 로 띄운다.
**`autoYarns` 상태와 `editYarn` 의 동작은 그대로 둔다.**

---

## 3. 결과 단가 (`CostSheetDialog.tsx` 267~268행 부근)

### 3-1. 지금

```
[이익률 % 입력] [Net USD/kg] [Net USD/yd] [Net KRW/yd]
```

이익률 입력이 결과 네 칸 중 첫 칸을 차지해 결과를 가린다.

### 3-2. 바꾼 뒤

큰 숫자는 **세 개, 이 순서**다. `KRW` 는 화면에서 뺀다.

| 자리 | 라벨 | 값 |
|---|---|---|
| 1 | `Net USD/yd` | `result.netPerYd` |
| 2 | `Net USD/lb` | `result.netPerLb` |
| 3 | `Net USD/kg` | `result.netPerKg` |

`grid gap-2 md:grid-cols-3` 로 세 칸을 채운다. 셋 다 `text-2xl font-semibold tabular-nums`.
**`Net USD/yd` 를 제일 앞에 둔다.** 팀이 보는 값이다.

이익률 입력은 이 격자 **아래로 내린다.** 한 줄짜리 가로 배치다.

```tsx
<div className="flex flex-wrap items-center gap-2 text-xs">
  <Label className="text-[11px]">이익률 %</Label>
  <Input type="number" disabled={!canEdit} value={input.profitPct ?? 0}
    onChange={(event) => setInput({ ...input, profitPct: numberValue(event.target.value) })}
    className={`${field} w-[80px] text-right tabular-nums`} />
  <span className="text-[10px] text-[var(--muted-foreground)]">비워 두어도 Net 단가는 계산됩니다. 팀 산출물은 Net price 까지입니다.</span>
</div>
```

이익 포함 줄(268행)도 같은 순서로 바꾸고 KRW 를 뺀다.

```
이익 포함: USD/yd {totalPerYd} · USD/lb {totalPerLb} · USD/kg {totalPerKg}
```

`(input.profitPct ?? 0) !== 0` 일 때만 보이는 조건은 그대로 둔다.

---

## 4. 하지 말 것

- **`netKrwPerYd`, `totalKrwPerYd` 를 `CostResult` 에서 지우지 마라.** DD 열, 자료실, 엑셀, 버전 비교가 쓴다. 화면에서만 뺀다.
- `refOf` 가 `tech.costRef` 에 넣는 `netKrwPerYd`, `netPerYd` 를 바꾸지 마라. DD `COST` 열이 읽는다.
- `cost-export.ts`, `cost-sheets.ts`, `CostSheets.tsx`, `yarn-blend.ts` 를 건드리지 마라.
- 원사 표기 파서(`parseYarnSpec`)를 손대지 마라. 별건이다.
- `autoYarns`, `editYarn`, `setComponent`, `normalizeComponentMode` 의 동작을 바꾸지 마라.
- `blankComponent()` 기본 단위를 `D` 로 두지 마라. `Ne` 다.
- 성분 상한 4개를 계산이나 저장에서 막지 마라. **`성분 추가` 버튼만 안 그린다.** 과거 데이터에 5개가 있을 수 있다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- `saveNew`, `overwrite`, `loadVersion`, `buildSheet` 의 동작을 바꾸지 마라. 저장 경로다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 5. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**
기준값 대조는 클로드가 한다. 너는 하지 마라.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
