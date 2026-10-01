# R267 국내 원단 원가계산 코어

상태: **미착수.** 이 문서만으로 구현한다. 화면(팝업)은 R268이며 이 작업에 포함하지 않는다.

기존 엑셀 `6085.xlsx`(사내 원가계산서)의 수식을 코드로 옮긴다. 엑셀 수식은 이미 검토를 마쳤고
업계 표준(누적 마크업)과 골격이 같음을 확인했다. 아래 식은 그 검토 결과이며 추정이 아니다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/yarn-blend.ts` | 신규. 원사 표기 파싱, 유효 데니어 합성, 혼용율 산출 |
| `src/data/fabric-cost.ts` | 신규. 원가 계산 순수 함수 |
| `src/data/schema.ts` | `DevTechnical`에 `cost?: FabricCostSheet` 한 줄 추가 |

UI, 라우트, 스토어, 열 정의는 건드리지 않는다. 이 세 파일 외에는 수정하지 않는다.

---

## 1. `src/data/yarn-blend.ts`

### 1-1. 단위 환산

데니어를 기준 단위로 쓴다.

```
denier = 9 × tex
denier = 5314.9 / Ne      (면번수. 5314.9 = 590.54 × 9)
denier = 9000 / Nm        (미터번수)
denier = 0.9 × dtex
```

`5314.9`와 `9`, `9000`, `0.9`를 상수로 선언하고 이 값을 바꾸지 마라.

### 1-2. 섬유 약어와 라벨명

두 층으로 갈린다. 사내 섬유명과 미국 라벨 생성명이 다르다.

```ts
/** 입력 약어 → 사내 섬유명. 대소문자를 무시하고 찾는다. */
export const FIBER_ALIASES: Record<string, string> = {
  t: "Polyester", p: "Polyester", poly: "Polyester", pe: "Polyester",
  polyester: "Polyester",
  c: "Cotton", co: "Cotton", cotton: "Cotton",
  r: "Rayon", ry: "Rayon", rayon: "Rayon", viscose: "Viscose",
  mo: "Modal", modal: "Modal",
  lyocell: "Lyocell", tencel: "Tencel",
  sp: "Spandex", spandex: "Spandex", lycra: "Spandex", elastane: "Spandex",
  na: "Nylon", ny: "Nylon", nylon: "Nylon", polyamide: "Nylon",
  ac: "Acrylic", acrylic: "Acrylic",
  wo: "Wool", wool: "Wool",
  li: "Linen", linen: "Linen",
}

/** 사내 섬유명 → 미국 라벨 생성명(FTC 16 CFR 303.7). 없으면 그대로 쓴다. */
export const FTC_LABEL_NAME: Record<string, string> = {
  Modal: "Rayon",
  Viscose: "Rayon",
  Tencel: "Lyocell",
}

/** 5% 미만이어도 이름을 쓸 수 있는 기능성 섬유. */
export const FUNCTIONAL_FIBERS = new Set(["Spandex", "Nylon"])
```

`pe`는 입력만 받는다. **출력 문자열에 `PE`나 `pe`를 절대 쓰지 마라.** 폴리에틸렌과 혼동된다.
`T`는 항상 Polyester다. Tencel과 Lyocell은 풀네임으로만 들어온다.
`Wool`은 5% 미만이어도 이름과 %를 밝혀야 하므로 `other fiber`로 묶지 마라.

### 1-3. 혼방 표기

표기 순서가 우세 순서다. `CVC`만 슬래시가 없다.

```ts
/** 사내 혼방 표기 → 섬유 순서(우세 순). */
export const BLEND_NOTATIONS: Record<string, string[]> = {
  CVC: ["Cotton", "Polyester"],
  "T/C": ["Polyester", "Cotton"],
  "T/R": ["Polyester", "Rayon"],
  "C/R": ["Cotton", "Rayon"],
  "R/C": ["Rayon", "Cotton"],
  "C/P/R": ["Cotton", "Polyester", "Rayon"],
  "T/C/R": ["Polyester", "Cotton", "Rayon"],
}
```

### 1-4. 타입

```ts
export type CountUnit = "D" | "dtex" | "tex" | "Ne" | "Nm"

/** 성분이 합사에 들어가는 방식. */
export type ComponentMode = "plain" | "draft" | "overfeed"

export interface YarnComponent {
  /** 사내 섬유명. FIBER_ALIASES 를 거친 정규명. */
  fiber: string
  nominal: number
  unit: CountUnit
  mode: ComponentMode
  /** mode="draft" 면 드래프트 배수(기본 3), "overfeed" 면 퍼센트. "plain" 이면 무시. */
  factor?: number
  /** 이 성분이 혼방 방적사일 때 내부 중량비. 합이 100 이어야 한다. */
  blend?: { fiber: string; pct: number }[]
}

export interface YarnSpec {
  /** 사내 표기 원문. 화면에 그대로 보여 준다. */
  raw?: string
  components: YarnComponent[]
  /** 표시 총 번수. */
  total?: { nominal: number; unit: CountUnit }
  /**
   * total 로 마지막 성분을 역산할지.
   * 코어스판 방적사만 true. 커버링·연사·인팅은 false 다. 1-6 참조.
   */
  totalGoverns?: boolean
}

export interface BlendEntry { fiber: string; pct: number }

export interface BlendResult {
  /** 사내 섬유명 기준 정확값. 내림차순. */
  internal: BlendEntry[]
  /** FTC 생성명으로 합산한 정확값. 내림차순. */
  label: BlendEntry[]
  /** 정수화한 라벨 문자열. 예 "55% Polyester 39% Rayon 6% Spandex" */
  labelText: string
  warnings: string[]
}
```

### 1-5. 유효 데니어

성분마다 계수 하나를 곱한다.

```
유효D = denier × k
  k = 1 / factor        (mode="draft",    factor 기본 3)
  k = 1 + factor/100    (mode="overfeed", factor 기본 0)
  k = 1                 (mode="plain")
```

`mode="draft"`에서 `factor < 1`이면 입력 오류다. 계산하지 말고 `warnings`에 담고 그 성분을 버린다.

### 1-6. 총 번수를 언제 믿나

**여기서 틀리기 쉽다. 경우에 따라 반대로 쓴다.**

| 경우 | `totalGoverns` | 처리 |
|---|---|---|
| 코어스판 방적사 | `true` | 총 번수가 관리값이다. 마지막 성분 = 총D − 앞 성분 유효D 합 |
| 커버링 SCY, DCY | `false` | 성분 명목값이 다 있다. 총은 파생값이다 |
| 연사 | `false` | 총 번수에 꼬임 수축이 들어가 부풀어 있다 |
| 인팅 | `false` | 총 번수에 벌크가 들어가 부풀어 있다 |

`totalGoverns === false`면 `total`을 비율 계산에 쓰지 마라. 유효D 합을 총으로 본다.

`totalGoverns === true`이고 역산값이 0 이하면 입력 오류다. `warnings`에 담고 그 원사를 버린다.

### 1-7. 파서

두 형식만 지원한다. 나머지는 `null`을 돌려준다. 사람이 직접 입력한다.
**형식을 추측해 늘리지 마라.** 라벨이 조용히 틀리는 것이 파싱 실패보다 나쁘다.

```
(가) 혼방 방적사   "T/R 70/30 30S/1 Siro"   "CVC 60/40 30S/1"   "C/P/R 50/25/25 30S/1"
     BLEND_NOTATIONS 키 + 공백 + 슬래시로 이은 % + 공백 + 번수
     번수는 "30S/1" 또는 "30/1" 또는 "30S" 형태. 뒤에 붙는 말(Siro, Compact)은 무시한다.
     결과: components 1개. fiber 는 대표섬유(첫 섬유), blend 에 전체 비율.

(나) 커버링       "cvr sp/pe 20/40"        "cvr sp/na 30/40"
     "cvr" + 공백 + 섬유약어를 슬래시로 + 공백 + 데니어를 슬래시로
     앞뒤가 짝이다. sp↔20, pe↔40. 첫 성분이 심사다.
     결과: components 2개 이상. 첫 성분 mode="draft" factor=3, 나머지 mode="plain".
     totalGoverns=false.
```

(가)의 `%` 개수와 섬유 개수가 다르면 `null`을 돌려준다.

**표기 검증.** (가)에서 표기가 선언한 우세 순서와 입력한 `%` 순서가 어긋나면 `warnings`에 담는다.
저장을 막지는 마라. 50/50 같은 동률은 통과시킨다.

```
"T/C 35/65"  →  "표기는 Polyester 우세인데 Cotton 이 더 많습니다. CVC 65/35 아닌지 확인하십시오."
"C/R 30/70"  →  "표기는 Cotton 우세인데 Rayon 이 더 많습니다. R/C 70/30 아닌지 확인하십시오."
```

### 1-8. 합성 함수

```ts
export function composeBlend(
  lines: { ratio: number; spec: YarnSpec }[],
): BlendResult
```

계산 순서를 지켜라. 순서를 바꾸면 결과가 틀린다.

```
1. 성분마다 유효D 산출 (1-5, 1-6)
2. 원사 안에서 성분 비율 = 유효D_i / Σ유효D
3. 성분이 blend 를 가지면 그 안의 섬유 비율을 곱해 펼친다
4. 원사 투입비(ratio)로 가중합 → internal (사내 섬유명 기준)
   ratio 합이 100 이 아니면 합으로 나눠 정규화하고 warnings 에 담는다
5. FTC_LABEL_NAME 으로 매핑하고 같은 라벨명끼리 합산 → label
6. label 에서 5% 미만 판정. 반올림 전 정확값으로 본다
   FUNCTIONAL_FIBERS 이거나 Wool 이면 이름을 남긴다
   아니면 "Other Fiber" 하나로 묶고 맨 뒤에 둔다
7. 내림차순 정렬 (Other Fiber 는 예외로 맨 뒤)
8. 최대잉여법으로 정수화. labelText 생성
```

**5번이 6~8번보다 앞이다.** rayon 을 두 줄 쓸 수 없으므로 먼저 합쳐야 한다.
Modal 3% + Viscose 3% 이 Rayon 6% 가 되어 `Other Fiber` 를 면하는 것도 이 순서라야 잡힌다.

**6번은 정확값 기준이다.** 4.6% 는 반올림하면 5 지만 FTC 판정은 4.6 으로 한다.

**8번 최대잉여법.** 단순 반올림은 쓰지 마라. 합이 100 을 넘는다.

```
각 값을 내림한다. 부족분 = 100 − 내림합.
소수부가 큰 순서로 1 씩 나눠 준다. 소수부가 같으면 원값이 큰 쪽이 먼저다.
예 66.5 / 28.5 / 5.0
   단순 반올림 → 67 + 29 + 5 = 101  (틀림)
   최대잉여법 → 내림 66/28/5 = 99, 부족 1, 소수부 .5/.5/.0 동률이라 원값 큰 66.5 가 받는다
             → 67 / 28 / 5 = 100  (맞음)
```

`labelText` 형식은 `"67% Polyester 28% Rayon 5% Spandex"`다. 값과 이름 사이에 공백 하나,
항목 사이에 공백 하나. 쉼표나 슬래시를 넣지 마라.

---

## 2. `src/data/fabric-cost.ts`

### 2-1. 중량 환산

```
grPerYd = round(gsm × 1.3935 × widthInch / 60)
```

`1.3935`는 1야드 × 60인치의 면적(㎡)이다. 업계 표준 상수다. **바꾸지 마라.**
`round`는 소수점 0자리다. 엑셀 `ROUND(J5*1.3935*L5/60,0)`와 같아야 한다.

### 2-2. 타입

```ts
export type YarnPriceUnit = "USD/kg" | "USD/lb" | "USD/bale" | "KRW/kg"
export type FeeUnit = "KRW/kg" | "KRW/yd" | "USD/kg" | "USD/yd"
export type FeeGroup = "yarnDye" | "knitting" | "dyeing" | "other"

export interface CostYarnLine {
  name: string
  /** 원단 투입 중량비 %. */
  ratio: number
  price: number
  priceUnit: YarnPriceUnit
  /** 이 원사가 선염사인가. true 면 yarnDye 그룹 loss 를 먹는다. */
  yarnDyed?: boolean
  spec?: YarnSpec
}

export interface CostFee {
  group: FeeGroup
  label: string
  mill?: string
  rate: number
  unit: FeeUnit
  /** 공장 지정 loss %. 산출 대비다. */
  loss: number
}

export interface CostInput {
  /** 환율 KRW per USD. */
  fxRate: number
  /** 완성 중량 g/㎡. */
  gsm: number
  /** 완성 폭 inch. */
  widthInch: number
  yarns: CostYarnLine[]
  /** 배열 순서가 공정 순서다. yarnDye 그룹이 맨 앞이어야 한다. */
  fees: CostFee[]
  /** 이익률 %. 원가 대비 마크업. 기본 0. */
  profitPct?: number
}

export interface CostLine { label: string; perKg: number; sharePct: number }

export interface CostResult {
  grPerYd: number
  yarnPerKg: number
  feePerKg: number
  netPerKg: number
  netPerYd: number
  netKrwPerYd: number
  profitPerKg: number
  totalPerKg: number
  totalPerYd: number
  totalKrwPerYd: number
  lines: CostLine[]
  warnings: string[]
}

/** DD 레코드에 저장하는 형태. 입력과 결과를 같이 남긴다. */
export interface FabricCostSheet {
  input: CostInput
  result: CostResult
  /** 계산 시각 ISO 문자열. */
  calculatedAt: string
  /** 계산한 사람. */
  calculatedBy?: string
}
```

### 2-3. 단가 환산

전부 `USD/kg`으로 맞춘다.

```
USD/kg  ← USD/kg    그대로
USD/kg  ← USD/lb    × 2.2046
USD/kg  ← USD/bale  ÷ 181.44        (1 bale = 400 lb = 181.44 kg)
USD/kg  ← KRW/kg    ÷ fxRate
USD/kg  ← KRW/yd    ÷ fxRate ÷ grPerYd × 1000
USD/kg  ← USD/yd            ÷ grPerYd × 1000
```

`181.44`는 **나누기다.** 엑셀 13~14행에 `F*181.44`로 곱하기가 들어가 있었고 그것이 버그였다.
**곱하기로 쓰지 마라.**

### 2-4. 누적 마크업

각 항목은 **자기 뒤 공정의 loss 로만** 마크업된다. 자기 loss 는 자기에게 곱하지 않는다.

```
downstream(j) = Π (1 + fees[k].loss / 100)   for k > j

원사비  = Σ  price_i(USD/kg) × ratio_i/100 × Π (1 + fees[k].loss/100)
          단, fees[k].group === "yarnDye" 인 항목은 yarns[i].yarnDyed 가 true 일 때만 곱한다
          그 외 그룹은 전부 곱한다

공정료  = Σ  rate_j(USD/kg) × downstream(j)

netPerKg = round(원사비 + 공정료, 2)
netPerYd = netPerKg × grPerYd / 1000
netKrwPerYd = round(netPerYd × fxRate)
```

**`÷(1 − loss)`를 쓰지 마라.** 공장이 주는 loss 는 산출 대비이므로 `×(1 + loss)`다.
업계 표준 문헌과 기존 엑셀이 둘 다 이 방식이다. 이 규칙을 바꾸는 판단을 하지 마라.

`round(x, 2)`는 소수 둘째 자리 반올림이다. 엑셀 `ROUND(...,2)`와 같다.

### 2-5. 이익

**한 방식만 쓴다. 마크업이다.**

```
totalPerKg    = netPerKg × (1 + profitPct/100)
totalPerYd    = totalPerKg × grPerYd / 1000
totalKrwPerYd = round(totalPerYd × fxRate)
profitPerKg   = round(totalPerKg − netPerKg, 2)
```

`÷(1 − profitPct/100)` 방식(판가 대비 마진)을 섞지 마라. 엑셀이 두 방식을 섞어 써서
`K` 열과 `M` 열이 갈렸고 원화 결과가 4,351 과 4,356 으로 두 개 나왔다. 그것이 버그였다.
모든 파생값은 `netPerKg` 하나에서 내려온다.

`profitPct`의 기본값은 **0**이다. 팀 산출물은 Net price 까지다.

### 2-6. 경고

`warnings`에 담고 계산은 계속한다. 예외를 던지지 마라.

- `fees` 안에서 `yarnDye` 그룹이 맨 앞이 아니다
- `yarns` 의 `ratio` 합이 100 이 아니다
- `gsm` 또는 `widthInch` 가 0 이하다 (이때 `grPerYd`는 0, yd 환산값은 0)
- `fxRate` 가 0 이하다
- `loss` 가 음수이거나 50 을 넘는다

### 2-7. 함수

```ts
export function computeFabricCost(input: CostInput): CostResult
```

순수 함수다. `Date.now()`, `Math.random()`, 전역 상태, import 한 스토어를 쓰지 마라.
`calculatedAt`은 호출하는 쪽이 채운다.

`lines`는 원사 각 줄, 공정 각 줄을 순서대로 담는다. `sharePct`는 `perKg / netPerKg × 100`이다.

---

## 3. `src/data/schema.ts`

`DevTechnical` 인터페이스 안, `styleHistory?: string` 아래에 한 줄 더한다.

현재 코드(72~74행 근처):

```ts
  passFail?: string
  failReason?: string
  styleHistory?: string
}
```

바꾼 뒤:

```ts
  passFail?: string
  failReason?: string
  styleHistory?: string
  /** 국내 원단 사전 원가계산 결과. 입력값까지 같이 남긴다(R267). */
  cost?: FabricCostSheet
}
```

파일 맨 위 import 구역에 `import type { FabricCostSheet } from "./fabric-cost"` 를 더한다.
`fabric-cost.ts`가 `schema.ts`를 import 하지 않게 하라. 순환 참조가 된다.
`fabric-cost.ts`는 `yarn-blend.ts`만 import 한다.

---

## 4. 기준값

구현 뒤 아래 값이 나와야 한다. **코드에 하드코딩하지 마라.** 대조용 기준이다.

### 4-1. 원가 (`6085.xlsx` 실데이터)

입력

```
fxRate 1200, gsm 270, widthInch 72
yarns
  1) "T/R 70/30 30S/1 Siro"  ratio 95  price 590  USD/bale  yarnDyed false
  2) "SPAN 20D"              ratio  5  price   6  USD/kg    yarnDyed false
fees (배열 순서 그대로)
  1) knitting "편직"           600 KRW/kg  loss 3
  2) dyeing   "DD + WICKING"  2800 KRW/kg  loss 8
  3) other    "SUPER DRY ZONE" 1360 KRW/kg loss 1
profitPct 0
```

기대값

| 항목 | 값 |
|---|---|
| `grPerYd` | 451 |
| 원사 1번 `perKg` | 3.470763 |
| 원사 2번 `perKg` | 0.337057 |
| `yarnPerKg` | 3.807820 |
| 편직 `perKg` | 0.545400 |
| 염색 `perKg` | 2.356667 |
| 기타 `perKg` | 1.133333 |
| `netPerKg` | **7.84** |
| `netPerYd` | **3.5358** |
| `netKrwPerYd` | **4243** |

`profitPct`를 2.6 으로 주면 `totalPerKg` 8.04384, `totalKrwPerYd` **4353**.

### 4-2. 혼용율

| 입력 | 기대 `labelText` |
|---|---|
| `T/R 70/30` 95% + Spandex 5% | `67% Polyester 28% Rayon 5% Spandex` |
| `T/R 70/30` 30% + Modal 30% + `cvr sp/pe 20/40` 40% | `55% Polyester 39% Rayon 6% Spandex` |
| 50Ne 코어스판, Lycra 70D draft 3.25, Cotton 겉사, `totalGoverns` true | `80% Cotton 20% Spandex` |

두 번째가 핵심 검증이다. 사내로는 섬유가 넷(Polyester, Modal, Rayon, Spandex)인데
Modal 이 Rayon 으로 합쳐져 라벨은 세 줄이 된다. 넷이 나오면 5번 단계가 틀린 것이다.

세 번째 중간값. 총 5314.9/50 = 106.298D, 라이크라 70/3.25 = 21.538D, 면 84.760D,
라이크라 20.26%, 면 79.74%.

첫 번째가 최대잉여법 검증이다. `67 28 5`가 아니라 `67 29 5`가 나오면 단순 반올림을 쓴 것이다.

---

## 5. 하지 말 것

- **UI 를 만들지 마라.** 팝업, 열 추가, 라우트, 컴포넌트는 R268 이다.
- `÷(1 − loss)` 로 바꾸지 마라. 산출 대비 loss 다.
- `181.44` 를 곱하지 마라. 나눈다.
- 이익을 마진 방식(`÷(1−p)`)으로 섞지 마라.
- 파서 형식을 늘리지 마라. (가)와 (나) 외에는 `null` 이다.
- `PE` 를 출력 문자열에 쓰지 마라.
- 최대잉여법 대신 단순 반올림을 쓰지 마라.
- 기준값을 코드에 상수로 넣지 마라.
- `fabric-cost.ts` 에서 `schema.ts` 를 import 하지 마라. 순환 참조다.
- 기존 파일을 세 개 외에 수정하지 마라. `dd-export.ts` 와 `xlsx-parsers.ts` 는 건드리지 않는다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.

## 6. 검증

```
npm run build
git status --short
```

`npm run build` 는 모든 수정을 마친 뒤 한 번만 돌린다. `tsc --noEmit` 이 포함돼 있다.
`git status --short` 에 위 표의 세 파일과 이 문서만 보여야 한다.

마지막 보고는 수정한 파일 목록, 빌드 결과, 판단이 필요했던 지점만 적는다.
바꾼 코드를 다시 붙이지 마라.
