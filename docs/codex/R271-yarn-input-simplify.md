# R271 원사 입력 단순화와 선염 단가 배분

상태: **미착수.** R267~R270 완료. 실사용 화면을 보고 나온 수정이다.

두 가지다. 하나는 **계산 버그**이고 하나는 **입력 화면 정리**다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/fabric-cost.ts` | 선염 공정료를 선염 원사 비중에만 물린다 |
| `src/data/yarn-blend.ts` | 약어 보강, 띄어쓰기 없는 표기, 단일 성분 규칙 |
| `src/components/dd/CostSheetDialog.tsx` | 표 헤더와 안내 문구, mode 컨트롤 제거 |

이 셋 외에는 수정하지 마라.

---

## 1. 선염 공정료 배분 (계산 버그)

### 1-1. 지금 무엇이 틀렸나

`fabric-cost.ts` **113행**은 맞다. 선염 loss 는 `yarnDyed` 원사만 먹는다.

```ts
if (fee.group !== "yarnDye" || yarn.yarnDyed) downstream *= 1 + fee.loss / 100
```

**119~125행이 틀렸다.** 선염 공정료를 원단 전체 중량에 그대로 곱한다.

```ts
const feeValues = input.fees.map((fee, index) => {
  let downstream = 1
  for (let later = index + 1; later < input.fees.length; later += 1) {
    downstream *= 1 + input.fees[later].loss / 100
  }
  return feeRatePerKg(fee.rate, fee.unit, input.fxRate, grPerYd) * downstream
})
```

전체 stripe 가 아니라 **여러 사종 중 일부만 선염**인 경우가 흔하다.
55% 만 선염인데 100% 치 선염료를 낸다. 원가가 과대 계상된다.

### 1-2. 고칠 것

선염 공정료에만 **선염 원사의 투입 중량비 합**을 곱한다.

```
dyedShare = Σ (yarn.ratio / 100)   for yarn where yarn.yarnDyed === true

fee.group === "yarnDye" 이면
  perKg = feeRatePerKg(...) × dyedShare × downstream
그 밖의 그룹이면
  perKg = feeRatePerKg(...) × downstream          // 지금 그대로
```

**`yarnDye` 그룹에만 적용한다.** 편직, 염색, 가공은 원단 전체를 거치므로 손대지 마라.

### 1-3. 경고

- `yarnDye` 공정료가 0보다 큰데 `yarnDyed` 원사가 하나도 없으면
  `선염 단가가 있는데 선염으로 표시된 원사가 없습니다.`
- `yarnDyed` 원사가 있는데 `yarnDye` 공정료가 없거나 0이면
  `선염 원사가 있는데 선염 단가가 비어 있습니다.`

둘 다 `warnings`에 담고 계산은 계속한다. 저장을 막지 마라.

### 1-4. `CostResult`에 한 줄 더한다

```ts
  /** 선염으로 표시된 원사의 투입 중량비 합(%). 화면에 그대로 보인다. */
  dyedSharePct: number
```

### 1-5. 회귀

**6085 기준값은 그대로여야 한다.** 6085 에는 선염 공정이 없으므로 영향이 없다.

```
grPerYd 451, netPerKg 7.84, netPerYd 3.5358, netKrwPerYd 4243
```

**새 기준값.** 이것으로 고쳐졌는지 가른다.

```
fxRate 1200, gsm 270, widthInch 72
yarns
  A ratio 55  price 3 USD/kg  yarnDyed true
  B ratio 45  price 3 USD/kg  yarnDyed false
fees (순서대로)
  yarnDye  "선염"  1200 KRW/kg  loss 5
  knitting "편직"   600 KRW/kg  loss 3
profitPct 0
```

| 항목 | 기대 |
|---|---|
| 원사 A | 3 × 0.55 × 1.05 × 1.03 = `1.784475` |
| 원사 B | 3 × 0.45 × 1.03 = `1.390500` |
| 선염료 | 1 × **0.55** × 1.03 = `0.566500` |
| 편직료 | 0.5 × 1 = `0.500000` |
| `dyedSharePct` | `55` |
| `netPerKg` | **`4.24`** |

**지금 코드로는 `4.70`이 나온다.** 선염료를 `1 × 1.03 = 1.03` 으로 잡기 때문이다.
`4.70`이 나오면 안 고쳐진 것이다.

---

## 2. 파서 보강

### 2-1. 실측 실패 사례

실제 DD `yarnDetail` 값이다. 전부 파싱에 실패한다.

| 입력 | 지금 | 기대 |
|---|---|---|
| `CM26'S/1` | null | Cotton, Ne 26 |
| `CM26'S/1 SLUB (ISL504) 3:1` | null | Cotton, Ne 26 |
| `SP30D (1:1)` | null | Spandex, 30D |

원인 셋이다.

1. `CM`, `SP` 약어가 `FIBER_ALIASES`에 없다.
2. 형식 (다)가 `<섬유> <굵기>` 로 **띄어쓰기를 요구한다.** `CM26'S/1` 은 붙어 있다.
3. 뒤에 붙는 말(`SLUB (ISL504) 3:1`, `(1:1)`)을 못 버린다.

### 2-2. 약어 추가

`FIBER_ALIASES`에 더한다.

```ts
  cm: "Cotton",   // 코마사(combed)
  cd: "Cotton",   // 카드사(carded)
```

`sp: "Spandex"` 는 이미 있다. **기존 항목을 지우거나 바꾸지 마라.**

### 2-3. 띄어쓰기 없는 표기

형식 (다)에서 섬유와 굵기 사이 공백을 **0개 이상**으로 받는다.

```
^([A-Za-z]+)\s*(굵기)(\s.*)?$
```

앞의 알파벳 덩어리를 섬유 약어로, 뒤를 굵기로 읽는다.
`CM26'S/1` → `CM` + `26'S/1`, `SP30D` → `SP` + `30D` 다.

**형식 (가)와 (나)를 먼저 시도하고 (다)를 마지막에 본다.** 순서를 바꾸지 마라.
`T/R 70/30 30's/1` 이 (다)로 먼저 걸리면 안 된다.

### 2-4. 꼬리 무시

굵기 뒤에 공백으로 이어지는 말은 전부 버린다.
`SLUB (ISL504) 3:1`, `(1:1)`, `SIRO COMPACT` 가 여기 해당한다.

**`3:1` 과 `(1:1)` 을 해석하려 들지 마라.** 합사비인지 슬러브 주기인지 알 수 없다.
사람이 표기 원문을 보고 판단한다.

### 2-5. 단일 성분 규칙

**성분이 하나뿐인 원사는 굵기가 혼용율에 아무 영향이 없다.**
그 원사의 투입 중량비 전부가 그 섬유다. 굵기는 여러 성분을 나눌 때만 쓰인다.

`composeBlend`에서 성분이 1개인 원사는 **굵기를 보지 말고** 그 섬유에 `ratio` 전부를 준다.
지금은 굵기가 0이면 유효 데니어가 0이라 그 원사가 통째로 사라진다.

실제로 화면에서 스판 행 굵기가 `0`으로 남아 혼용율이 `100% Cotton` 으로 나왔다.
스판덱스가 결과에서 통째로 빠졌다. **이 회귀를 반드시 고쳐라.**

회귀 케이스.

```
[{ ratio: 95, spec: { components: [{ fiber: "Cotton", nominal: 0, unit: "D", mode: "plain" }] } },
 { ratio: 5,  spec: { components: [{ fiber: "Spandex", nominal: 0, unit: "D", mode: "plain" }] } }]
  -> "95% Cotton 5% Spandex"
```

성분이 2개 이상인 원사에서 굵기가 0이거나 비면 그 성분만 버리고 `warnings`에 담는다.
지금 동작 그대로다.

### 2-6. 기본 단위 판정

```ts
/** 표기에서 번수 단위를 읽는다. 읽을 수 없으면 null. */
export function guessCountUnit(raw: string): CountUnit | null
```

- `'s/1`, `’S/1`, `S/1`, `/1`, `S` 가 있으면 `"Ne"`
- `D`, `de`, `den` 이 있으면 `"D"`
- `tex`, `dtex`, `Nm` 이 있으면 각각
- 아무것도 없으면 `null`

화면이 이것으로 성분 기본 단위를 정한다. 방적사는 `Ne` 로 떨어진다.

### 2-7. 회귀

| 입력 | 기대 |
|---|---|
| `CM26'S/1` | Cotton, Ne 26 |
| `CM26'S/1 SLUB (ISL504) 3:1` | Cotton, Ne 26 |
| `SP30D (1:1)` | Spandex, 30D |
| `CD20'S/1` | Cotton, Ne 20 |
| `T/R 70/30 30's/1` | Polyester Ne 30, blend Polyester 70 / Rayon 30 (**바뀌면 안 된다**) |
| `cvr sp/pe 20/40` | Spandex 20D draft3 + Polyester 40D (**바뀌면 안 된다**) |
| `Span 20` | `null` (맨숫자는 그대로 거부) |
| `guessCountUnit("CM26'S/1")` | `"Ne"` |
| `guessCountUnit("SP30D")` | `"D"` |
| `guessCountUnit("cotton")` | `null` |

R269 회귀 22건이 전부 그대로 통과해야 한다.

---

## 3. 화면 정리

지금 입력칸만 나열돼 있어 **무엇을 넣는 칸인지 알 수 없다.** 헤더도 안내도 없다.

### 3-1. 표 헤더를 넣는다

원사 구역과 성분 줄 둘 다 헤더 행을 단다. 이게 가장 큰 개선이다.

```
원사   | 표기 | 해석 | 투입% | 단가 | 단위 | 선염 |
성분   | 섬유 | 굵기 | 단위 |
```

성분 줄은 원사 줄보다 들여쓰고 배경을 한 단계 연하게 해서 종속 관계를 보인다.

### 3-2. mode 컨트롤을 없앤다

`일반 / 드래프트 / 오버피드` 드롭다운과 `factor` 입력칸을 **화면에서 지운다.**
자리만 차지하고 대부분 손댈 일이 없다.

대신 자동으로 정한다.

```
섬유가 Spandex 면  mode = "draft", factor = 3
그 밖이면          mode = "plain"
```

`YarnComponent` 타입은 그대로 둔다. 화면만 감춘다. 저장 값에는 위 규칙대로 들어간다.

드래프트 3은 원사 업체 통상값이다. 성분이 하나뿐인 원사에서는 결과에 영향이 없고,
커버링사처럼 성분이 둘 이상일 때만 비율을 가른다.

### 3-3. 성분 기본값

`blankComponent()` 의 `nominal: 0, unit: "D"` 가 문제다. 스판 행이 0 으로 남아 결과에서 빠졌다.

```ts
const blankComponent = (unit: CountUnit = "Ne"): YarnComponent => ({ fiber: "", nominal: 0, unit, mode: "plain" })
```

파싱이 실패한 원사의 성분 기본 단위는 `guessCountUnit(표기) ?? "Ne"` 로 정한다.
**`D` 를 기본값으로 쓰지 마라.** 국내 방적사가 대부분이다.

굵기 입력칸은 값이 0이면 **빈 칸으로 보인다.** `0` 을 찍어 두지 마라.
성분이 하나면 굵기 칸 `placeholder` 에 `선택` 을 넣는다. 안 채워도 된다는 뜻이다.

### 3-4. 안내 문구

원사 구역 머리 아래 한 줄.

```
DD 의 Yarn Detail 에서 자동으로 불러옵니다. 해석이 안 되면 아래 성분을 직접 채우십시오.
성분이 하나면 굵기는 비워 두어도 됩니다.
```

`placeholder` 를 이렇게 준다.

| 칸 | placeholder |
|---|---|
| 표기 | `CM26's/1` |
| 투입% | `%` |
| 단가 | `단가` |
| 섬유 | `cotton` |
| 굵기(성분 1개) | `선택` |
| 굵기(성분 2개 이상) | `굵기` |

해석 칸은 파싱 성공이면 해석 문장, 실패면 **`직접 입력` 대신** 회색으로
`아래 성분을 채우세요` 로 바꾼다.

모든 입력칸에 `aria-label` 을 남긴다. 지금 있는 것을 지우지 마라.

### 3-5. 선염 체크박스

라벨을 `선염` 그대로 두되 `title` 에 설명을 단다.

```
이 원사만 선염(Yarn Dye)합니다. 선염 단가와 loss 가 이 원사의 투입 비중에만 적용됩니다.
```

공정 구역의 `선염` 줄 옆에 `선염 원사 N%` 를 보인다. `dyedSharePct` 를 그대로 쓴다.
0% 면 회색으로, 0보다 크면 보통 글자색으로 둔다.

### 3-6. 결과

결과 구역 혼용율 줄 아래에 `선염 N%` 를 한 줄 더한다. `dyedSharePct` 가 0이면 감춘다.

---

## 4. 하지 말 것

- `yarnDye` 외의 공정료에 비중을 곱하지 마라. 편직·염색·가공은 원단 전체를 거친다.
- 형식 (가)와 (나)의 우선순위를 바꾸지 마라. (다)는 마지막이다.
- `3:1`, `(1:1)` 같은 꼬리를 해석하려 들지 마라. 버린다.
- 맨숫자 굵기(`Span 20`)를 받지 마라. 여전히 `null` 이다.
- `FIBER_ALIASES` 의 기존 항목을 지우거나 바꾸지 마라. 더하기만 하라.
- `YarnComponent` 타입에서 `mode` 나 `factor` 를 지우지 마라. 화면만 감춘다.
- 성분 굵기 기본 단위를 `D` 로 두지 마라. `Ne` 다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- **긴 목록을 `SectionCard` 로 감싸지 마라.** `Card` 를 직접 쓴다.
- `src/data/cost-sheets.ts`, `src/data/cost-export.ts`, `src/routes/CostSheets.tsx`,
  `src/routes/DevelopmentMasterSheet.tsx` 를 건드리지 마라. R268 과 R270 에서 끝났다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라.
- 파일을 삭제하지 마라.

## 5. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

보고에 1-5 의 새 기준값 `netPerKg` 가 `4.24` 로 나오는지 한 줄로 적어라.
`4.70` 이면 선염 배분이 안 고쳐진 것이다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
