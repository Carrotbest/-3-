# R272 원가계산서 팝업 재설계와 원사 공정 전체 중량 적용

상태: **미착수.** R267~R271 구현 완료, 워킹트리 미커밋, `npm run build` 통과 확인함.

두 가지다. 하나는 **계산 규칙 변경**이고 하나는 **팝업 전면 재설계**다.
실사용 화면을 보고 나온 수정이다. 박향근이 "입력칸이 너무 크고 벌어져 있다"고 했다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/fabric-cost.ts` | 원사 그룹 공정료를 원단 전체 중량에 물린다. 배열 순서 경고 수정. 경고 문구 |
| `src/components/dd/CostSheetDialog.tsx` | 레이아웃 전면 재설계. 공정 그룹 라벨과 공정명 드롭다운 |

이 둘 외에는 수정하지 마라. `cost-sheets.ts`, `cost-export.ts`, `CostSheets.tsx`,
`yarn-blend.ts`, `DevelopmentMasterSheet.tsx` 는 R267~R271 에서 끝났다.

---

## 1. 원사 공정료를 전체 중량에 (계산 변경)

### 1-1. 무엇을 바꾸나

R271 에서 "선염 공정료는 선염 원사 투입 비중에만 물린다"로 고쳤다. **그것을 되돌린다.**
원본 `6085.xlsx` 의 `K17` 이 실제로 전체 중량 기준이다. 박향근이 2026-10-01 에 전체 중량으로 확정했다.

**loss 는 그대로 원사별로 걸린다.** 엑셀 `K10` 의 `IF($O10="Y", (1+$J$17/100)*(1+$J$18/100), 1)` 이
선염 체크된 원사에만 원사 공정 loss 를 물리는 부분이다. **이 동작은 건드리지 마라.**
바뀌는 것은 공정료 한 곳뿐이다.

### 1-2. 정확한 교체

`computeFabricCost` 안 `feeValues` (126~133행). 현재 코드:

```ts
  const feeValues = input.fees.map((fee, index) => {
    let downstream = 1
    for (let later = index + 1; later < input.fees.length; later += 1) {
      downstream *= 1 + input.fees[later].loss / 100
    }
    const appliedShare = fee.group === "yarnDye" ? dyedSharePct / 100 : 1
    return feeRatePerKg(fee.rate, fee.unit, input.fxRate, grPerYd) * appliedShare * downstream
  })
```

교체 후:

```ts
  const feeValues = input.fees.map((fee, index) => {
    let downstream = 1
    for (let later = index + 1; later < input.fees.length; later += 1) {
      downstream *= 1 + input.fees[later].loss / 100
    }
    return feeRatePerKg(fee.rate, fee.unit, input.fxRate, grPerYd) * downstream
  })
```

`appliedShare` 줄만 없앤다. `dyedSharePct` 변수는 **지우지 마라.** 118~124행 `yarnValues` 의
loss 게이트와 화면 표시가 계속 쓴다.

### 1-3. 배열 순서 경고 (105~107행)

원사 그룹에 선염 말고 연사, 인팅이 들어올 수 있게 되므로 `index !== 0` 판정이 오작동한다.
원사 공정이 둘이면 두 번째가 무조건 경고를 띄운다. 현재 코드:

```ts
  if (input.fees.some((fee, index) => fee.group === "yarnDye" && index !== 0)) {
    warnings.push("선염 공정은 공정료 배열의 맨 앞에 있어야 합니다.")
  }
```

교체 후:

```ts
  const firstOtherIndex = input.fees.findIndex((fee) => fee.group !== "yarnDye")
  if (firstOtherIndex >= 0 && input.fees.some((fee, index) => fee.group === "yarnDye" && index > firstOtherIndex)) {
    warnings.push("원사 공정(선염·연사·인팅)은 편직보다 앞에 있어야 합니다.")
  }
```

### 1-4. 경고 문구 두 개 (112~113행)

그룹 이름이 화면에서 "원사"가 되므로 문구를 맞춘다. 판정식은 그대로 두고 문자열만 바꾼다.

```ts
  if (hasYarnDyeRate && dyedSharePct <= 0) warnings.push("원사 공정 단가가 있는데 선염 체크된 원사가 없습니다. loss가 아무 원사에도 걸리지 않습니다.")
  if (dyedSharePct > 0 && !hasYarnDyeRate) warnings.push("선염 체크된 원사가 있는데 원사 공정 단가가 비어 있습니다.")
```

`CostResult.dyedSharePct` 의 주석(46행)도 고친다.
현재 "화면에 그대로 보인다" → "이 비중의 원사에만 원사 그룹 loss 가 걸린다. 공정료는 전체 중량 기준이다."

### 1-5. 기준값

바꾼 뒤 이 두 값이 나와야 한다. 클로드가 직접 대조하므로 **너는 검증하지 마라.**

| 입력 | 기대 |
|---|---|
| 환율 1200, 270gsm, 72인치, 원사 $590/bale 95% + $6/kg 5%, 편직 600원/kg loss3, 염색 2800원/kg loss8, 기타 1360원/kg loss1 | `grPerYd 451`, `netPerKg 7.84`, `netKrwPerYd 4243` (변화 없음) |
| 환율 1200, 270gsm, 72인치, 원사 A $590/bale 55% 선염체크 + B $6/kg 45%, 선염 1200원/kg loss5, 편직 600원/kg loss3 | `netPerKg 6.25` (바꾸기 전 값은 5.78) |

---

## 2. 공정 그룹 라벨과 공정명 드롭다운

### 2-1. 그룹 라벨

`CostSheetDialog.tsx` 25~28행 `FEE_GROUPS`. **`value` 문자열은 절대 바꾸지 마라.**
Firestore `costSheets` 에 저장된 문서와 `fabric-cost.ts` 판정이 `"yarnDye"` 를 쓴다.
바꾸는 것은 `label` 하나다.

```ts
const FEE_GROUPS: { value: FeeGroup; label: string }[] = [
  { value: "yarnDye", label: "원사" }, { value: "knitting", label: "편직" },
  { value: "dyeing", label: "염색" }, { value: "other", label: "기타" },
]
```

### 2-2. 공정명 프리셋

`FEE_GROUPS` 아래에 더한다.

```ts
const FEE_LABEL_PRESETS: Record<FeeGroup, string[]> = {
  yarnDye: ["선염", "연사", "인팅"],
  knitting: ["편직"],
  dyeing: ["염색"],
  other: ["워싱", "기모", "컴팩"],
}
```

공정명 칸은 **`<input list>` 와 `<datalist>`** 로 만든다. 드롭다운에서 고를 수도 있고 직접 칠 수도 있다.
`<select>` 로 만들지 마라. 목록 밖 공정명(`DD + WICKING`, `SUPER DRY ZONE`)이 실제로 쓰인다.
`datalist` id 는 `cost-fee-${group}` 처럼 그룹마다 하나씩 만들어 재사용한다.

그룹을 바꾸면 공정명을 새 그룹의 첫 프리셋으로 바꾼다. **단 현재 값이 비었거나 어느 그룹의 프리셋과
정확히 같을 때만이다.** 사람이 직접 친 이름(`DD + WICKING`)은 그룹을 바꿔도 지우지 마라.

```ts
const ALL_PRESETS = new Set(Object.values(FEE_LABEL_PRESETS).flat())
const changeFeeGroup = (index: number, group: FeeGroup) => {
  const fee = input.fees[index]
  const keep = fee.label.trim() && !ALL_PRESETS.has(fee.label.trim())
  setFee(index, { group, ...(keep ? {} : { label: FEE_LABEL_PRESETS[group][0] }) })
}
```

### 2-3. 기본 공정 줄

`defaultInput` (58~72행)의 네 번째 줄 label 을 `"가공"` 에서 `"워싱"` 으로 바꾼다.
나머지 세 줄(`선염`, `편직`, `염색`)은 그대로다. `blankFee()` 의 기본 그룹도 `other` 그대로이고,
`행 추가` 버튼은 `blankFee("other")` 에 label `"워싱"` 을 넣어 만든다.

---

## 3. 레이아웃 재설계

지금 화면이 큰 이유는 셋이다. 이 셋을 없애는 것이 이 항목의 전부다.

1. **성분 표가 원사 줄마다 항상 펼쳐져 있다.** 원사 2개면 표가 네 겹이 된다.
2. Card 4개가 각각 머리말, 설명문, 버튼을 갖는다.
3. 혼용율과 선염 %가 두 곳씩 중복으로 나온다.

기준은 원본 엑셀 `6085.xlsx` 다. **세로 한 장짜리 표**다. 섹션 머리줄, 항목 한 줄씩, 소계 줄.

### 3-0. 껍데기

`DialogContent` className 을 바꾼다.

```
"flex max-h-[92vh] w-[96vw] max-w-none flex-col xl:w-[1120px]"
```

`Card`, `CardHeader`, `CardContent`, `CardTitle` 을 전부 걷어낸다. 대신 섹션마다
얇은 머리줄 하나(`text-xs font-semibold` + 아래 `border-b`)를 둔다. import 도 지운다.
**`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**

`DialogDescription` 의 설명문("입력값을 바꾸면 결과가 즉시 갱신됩니다")과
원사 섹션의 안내문("DD 의 Yarn Detail 에서 자동으로 불러옵니다…") 두 줄을 지운다. 자리만 먹는다.

### 3-1. 상단 정보 바

지금은 6칸짜리 읽기 전용 상자가 라벨을 위에 이고 2줄을 먹는다. **한 줄짜리 칩 나열**로 바꾼다.

```
Style No. #25168 · Project ··· · Buyer ··· · Season ··· · Color ··· · 조직 ···
```

`text-[11px]`, 라벨은 `text-[var(--muted-foreground)]`, 값은 기본색, `flex flex-wrap gap-x-4 gap-y-1`.
버전 select 는 이 줄 오른쪽 끝에 그대로 둔다.

그 아래 입력 4칸을 좁은 격자로 붙인다. `grid gap-2 md:grid-cols-[repeat(4,minmax(0,150px))]`.
환율(KRW/USD), 완성 중량(g/㎡), 완성 폭(inch), gr/yd(읽기 전용, `font-semibold tabular-nums`).

### 3-2. 원사 표

`<table className="w-full text-xs">` 하나로 만든다. `<colgroup>` 을 넣어 열 너비를 고정한다.

| 열 | 폭 | 내용 |
|---|---|---|
| # | 32px | `1`, `2` |
| 원사 표기 | 남는 폭 | Input. **아래 줄에 해석 결과**(`describeSpec`)를 `text-[10px]` 회색으로. 자동 파싱되면 뒤에 `자동` |
| 투입 % | 84px | number, 우측 정렬 |
| 단가 | 100px | number, 우측 정렬 |
| 단위 | 104px | select |
| 선염 | 52px | checkbox 만. 라벨 글자 제거(열 머리가 이름이다) |
| | 32px | 성분 펼침 버튼(`ChevronRight`/`ChevronDown`) |
| | 32px | 삭제 |

**해석 결과 전용 칸(219행)을 없앤다.** 원사 표기 칸 아래 작은 글씨로 내린다.

**성분 편집을 접는다.** 이것이 이 항목의 핵심이다.
펼친 원사 index 를 `useState<number[]>` 나 `Set` 으로 들고, 펼친 행만 바로 아래에
`<tr><td colSpan={8}>` 로 성분 표를 그린다. 배경 `bg-[var(--muted)]/20`.

- **기본은 접힘이다.**
- 단 `autoYarns[index]` 가 `false` 인 행(표기가 자동 해석되지 않은 행)은 처음에 펼쳐 둔다.
  성분을 손으로 채워야 하는 행이라 접어 두면 사람이 못 찾는다.
- 표기를 고쳐 파싱에 성공하면(`parseYarnSpec` 이 값을 주면) 접어도 된다. 강제로 접지는 마라.

성분 표 자체는 지금 구조(섬유 / 굵기 / 단위 / 삭제 + `성분 추가`)를 그대로 쓰되 열 머리를 붙인다.

표 마지막에 **소계 줄**을 둔다. `<tfoot>` 이나 마지막 `<tr>`.
왼쪽에 `투입 합계 {n}%`(100이 아니면 `text-[var(--destructive)]`), 오른쪽에 혼용율 한 줄.
**혼용율 블록(230행)을 여기로 합친다.** 지금은 원사 카드 아래에 큰 상자로 있고 결과 카드에 또 있다.
혼용율은 이 한 곳에만 둔다.

### 3-3. 공정 표

지금 공정 줄에는 **열 머리가 아예 없다.** 어느 칸이 단가고 어느 칸이 로스인지 알 수 없다.
박향근이 지적한 지점이다. 열 머리를 붙이고 단가와 LOSS 를 눈으로 갈라 놓는다.

| 열 | 폭 | 내용 |
|---|---|---|
| 그룹 | 96px | select (원사/편직/염색/기타) |
| 공정명 | 남는 폭 | `input list` + `datalist` |
| 업체 | 160px | Input |
| 단가 | 110px | number, 우측 정렬 |
| 단위 | 104px | select |
| LOSS % | 92px | number, 우측 정렬 |
| | 96px | 위/아래/삭제 |

- **단가와 LOSS 를 갈라 보이게 한다.** `단가`+`단위` 두 열을 한 묶음으로 보이도록 `LOSS %` 열의
  `<th>` 와 `<td>` 에 `border-l border-[var(--border)]` 를 건다. LOSS 입력칸 오른쪽에는
  `%` 를 `text-[10px]` 회색으로 붙인다. 단가 열 머리는 `단가`, 그 오른쪽이 `단위`다.
- **그룹이 바뀌는 자리에 밴드 줄을 넣는다.** `fee.group !== input.fees[index - 1]?.group` 이면
  그 앞에 `<tr>` 하나를 `colSpan` 으로 깔고 그룹 한글 이름을 `bg-[var(--muted)]/40 text-[10px]` 로 적는다.
  엑셀의 `Materials` / `Yarn Dyed` / `Knitting` / `DYEING` / `Others` 머리줄이 이것이다.
  배열 순서가 공정 순서라는 계약은 그대로다. 그룹으로 정렬하지 마라.
- 원사 그룹 줄 아래 보조 문구(234행)는 남기되 문구를 바꾼다.
  `선염 원사 {n}%` → `선염 loss 적용 {n}%`. 공정료는 이제 전체 중량이라 옛 문구가 오해를 부른다.

### 3-4. 결과

- 경고는 **한 곳에만** 모은다. 결과 섹션 맨 위다. 지금 원사 카드와 결과 카드에 나뉘어 있다.
- 큰 숫자 3개(Net USD/kg, Net USD/yd, Net KRW/yd)와 이익률 입력은 지금 구조를 쓰되
  `Net KRW/yd` 를 제일 크게(`text-2xl`) 한다. 팀이 보는 값이다.
- **항목별 표(242행)와 이전 버전 대비(248행)를 `<details>` 로 접는다.** 기본 접힘.
  `<summary>` 는 각각 `항목별 원가 {n}건`, `이전 버전 대비`.
- 선염 % 줄(244행)은 지운다. 공정 표 안 보조 문구와 중복이다.
- 메모 textarea 는 `rows={2}` 그대로 둔다.

### 3-5. 전체 톤

- 입력칸 높이는 지금 `field` 상수(`h-8 px-2 text-xs`)를 그대로 쓴다. 더 키우지 마라.
- 표 셀 padding 은 `px-1.5 py-1`. 표 사이 간격은 `space-y-3`.
- 숫자 입력은 전부 `text-right tabular-nums`.
- 읽기 전용 값은 `bg-[var(--muted)]/30`.

---

## 4. 하지 말 것

- **`FeeGroup` 의 `"yarnDye"` 문자열을 바꾸지 마라.** 저장된 Firestore 문서와 계산 판정이 쓴다. 화면 라벨만 "원사"다.
- **`CostYarnLine.yarnDyed` 필드명을 바꾸지 마라.** 같은 이유다.
- **`yarnValues` 의 per-yarn loss 게이트(121행)를 건드리지 마라.** 엑셀 `K10` 이 그렇게 되어 있다.
- `dyedSharePct` 계산과 반환을 지우지 마라.
- 공정 배열 순서가 공정 순서라는 계약을 바꾸지 마라. 그룹으로 정렬하지 마라.
- 공정명을 `<select>` 로 만들지 마라. 목록 밖 이름이 실제로 쓰인다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- `saveNew`, `overwrite`, `loadVersion`, `buildSheet`, `refOf` 의 동작을 바꾸지 마라. 저장 경로다.
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
