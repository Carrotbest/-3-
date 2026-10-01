# R269 원사 자동 채움과 표기 확장

상태: **미착수.** R267(계산 코어)과 R268(저장·팝업)은 구현·검증 완료다.

R268 팝업에서 원사를 손으로 넣게 되어 있다. DD의 `tech.yarnDetail`에 이미 원사가 적혀 있으므로
그것을 읽어 행을 만든다. 그리고 **현재 파서가 실무 표기를 못 읽는다.** 그것부터 고친다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/yarn-blend.ts` | `parseYarnSpec` 표기 확장, `splitYarnDetail` 추가 |
| `src/components/dd/CostSheetDialog.tsx` | `yarnDetail`에서 원사 행 자동 생성, 결과에 혼용율 표시 |

이 둘 외에는 수정하지 마라.

---

## 1. 지금 무엇이 안 되나

실측 결과다. 추정이 아니다.

| 입력 | 현재 |
|---|---|
| `T/R 70/30 30S/1 Siro` | OK |
| `T/R 70/30 30's/1` | **null** |
| `T/R 70/30 30'S/1` | **null** |
| `T/R 70/30 30’S/1 SIRO COMPACT` | **null** |
| `CVC 60/40 30's/1` | **null** |
| `Span 20D` | **null** |
| `T/R 70/30 30's/1 + Span 20D` | **null** |
| `cvr sp/pe 20/40` | OK |

원인 둘이다.

1. 번수 정규식이 `(?:S)?`라 **아포스트로피를 못 받는다.** 방적사는 보통 `30's/1`로 적는다.
   6085 엑셀 원본에는 굽은 아포스트로피 `30’S/1`도 들어 있다. `'`(U+0027)와 `’`(U+2019) 둘 다다.
2. **단독 섬유 표기 형식이 없다.** `Span 20D` 처럼 혼방 표기 없이 섬유와 굵기만 적는 경우가 많다.

---

## 2. `src/data/yarn-blend.ts`

### 2-1. 아포스트로피

방적사 번수 부분을 이렇게 받는다. 대소문자를 무시한다.

```
숫자 [ ' | ’ | ´ ]? [ S ]? [ /1 ]?
```

정규식 조각으로는 `(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?` 이다.
`30`, `30S`, `30/1`, `30S/1`, `30's/1`, `30'S/1`, `30’S/1`, `30’s` 가 전부 같은 Ne 30 이다.

기존 (가) 혼방 표기 형식의 번수 부분을 이것으로 갈아 끼운다.
**형식 (가)와 (나)의 나머지 구조는 바꾸지 마라.**

### 2-2. 형식 (다) 단독 섬유

새 형식 하나를 더한다.

```
(다) 단독 섬유   "<섬유> <굵기>"
     Span 20D,  SPAN 20D,  Poly 75D/36F,  Nylon 40D,  Cotton 30's/1,  Modal 30's/1
```

- 섬유는 `FIBER_ALIASES`를 거친다. 없는 약어면 `null`을 돌려준다.
- 굵기 판정은 **접미사로만** 한다. 맨숫자는 받지 않는다.

| 굵기 표기 | 단위 |
|---|---|
| `20D`, `20d`, `30de`, `40den`, `75 D` | `D` |
| `30S`, `30/1`, `30's/1`, `30’S/1` | `Ne` |
| `50tex`, `50dtex`, `50Nm` | 각각 `tex`, `dtex`, `Nm` |

`75D/36F` 처럼 뒤에 `/숫자F`가 붙으면 **필라멘트 수이므로 버린다.** nominal 은 75 다.

`D`도 `S`도 `/1`도 없는 맨숫자(`Span 20`)는 방적사인지 필라멘트인지 가를 수 없다.
**`null`을 돌려준다. 추측하지 마라.** 라벨이 조용히 틀리는 것이 파싱 실패보다 나쁘다.

결과는 성분 1개다.

```ts
{ raw, components: [{ fiber, nominal, unit, mode: "plain" }] }
```

**`mode`는 `plain`이다.** 맨 스판덱스를 플레이팅으로 먹이는 경우라 드래프트를 걸지 마라.
드래프트는 커버링사(형식 나) 안에서만 쓴다.

### 2-3. `splitYarnDetail`

```ts
/**
 * DD 의 `tech.yarnDetail` 을 원사 단위로 가른다.
 * 작지 파서가 원본의 `*` 를 `+` 로 바꿔 넣지만 손으로 적은 값에는 `*` 가 남아 있다.
 * 둘 다 받는다.
 */
export function splitYarnDetail(raw: string): string[]
```

`+` 와 `*` 로 가르고, 각 조각을 `trim` 하고, 빈 조각은 버린다.
**`/` 로 가르지 마라.** `T/R`, `30S/1`, `20/40` 이 전부 슬래시를 쓴다.

`cvr sp/pe 20/40` 처럼 조각 안에 슬래시가 있어도 그대로 한 덩어리로 남아야 한다.

### 2-4. 회귀

아래가 전부 통과해야 한다.

| 입력 | 기대 |
|---|---|
| `T/R 70/30 30S/1 Siro` | Ne 30, blend Polyester 70 / Rayon 30 |
| `T/R 70/30 30's/1` | 같음 |
| `T/R 70/30 30’S/1 SIRO COMPACT` | 같음 |
| `CVC 60/40 30's/1` | Ne 30, blend Cotton 60 / Polyester 40 |
| `cvr sp/pe 20/40` | Spandex 20D draft 3 + Polyester 40D plain |
| `Span 20D` | Spandex 20D, unit `D`, mode `plain` |
| `Poly 75D/36F` | Polyester 75D. 36F 는 버린다 |
| `Cotton 30's/1` | Cotton, Ne 30 |
| `Span 20` | `null` |
| `MYSTERY 12/34` | `null` |
| `splitYarnDetail("T/R 70/30 30's/1 + Span 20D")` | 2조각 |
| `splitYarnDetail("T/R 70/30 30's/1 * Span 20D")` | 2조각 |
| `splitYarnDetail("cvr sp/pe 20/40")` | 1조각 |

**R267 기준값이 그대로 나와야 한다.** 아래가 깨지면 계산 쪽을 건드린 것이다.

```
computeFabricCost  6085 입력 -> grPerYd 451, netPerKg 7.84, netPerYd 3.5358, netKrwPerYd 4243
composeBlend  T/R 70/30 95% + Spandex 5%  -> "67% Polyester 28% Rayon 5% Spandex"
composeBlend  T/R 70/30 30% + Modal 30% + cvr sp/pe 20/40 40%
              -> "55% Polyester 39% Rayon 6% Spandex"
```

`composeBlend`, `toDenier`, `computeFabricCost` 의 **계산 로직을 고치지 마라.**
이번 작업은 파싱과 화면뿐이다.

---

## 3. `src/components/dd/CostSheetDialog.tsx`

### 3-1. 원사 행 자동 생성

팝업이 열릴 때(또는 BODY 탭을 바꿀 때) 그 행의 `tech.yarnDetail`을 읽는다.

```
splitYarnDetail(row.tech?.yarnDetail ?? "")  →  조각마다 원사 행 1개
조각마다 parseYarnSpec 을 돌려 spec 을 채운다. null 이면 raw 만 넣고 사람이 고친다.
```

`yarnDetail`이 비어 있으면 지금처럼 빈 행 하나로 시작한다.

**이미 저장된 계산서를 여는 경우에는 자동 채움을 하지 마라.** 저장된 입력이 진실이다.
자동 채움은 그 행에 계산서가 없을 때만 한다.

### 3-2. 투입비는 채우지 않는다

`yarnDetail`에 투입 중량비가 없다.

- 조각이 1개면 `ratio` 100 을 넣는다.
- 조각이 2개 이상이면 **`ratio`를 비워 둔다.** 추측하지 마라. 원가와 라벨이 같이 틀어진다.

합이 100이 아니면 결과 위에 경고를 띄우고 저장 버튼을 막는다.
경고 문구는 `원사 투입비 합이 100%가 되어야 저장할 수 있습니다. 현재 N%` 다.

### 3-3. 성분 줄도 같이 채운다

`parseYarnSpec` 이 성공하면 그 원사의 성분 줄(섬유, 굵기, 단위, mode, factor)을 그대로 펼쳐 보인다.
접어 두지 말고 처음부터 펼친 상태로 둔다. 자동으로 들어온 값이라 사람이 바로 봐야 한다.

파싱에 성공한 행 옆에 `자동` 표시를 작게 붙인다. 사람이 고치면 그 표시를 지운다.

### 3-4. 결과에 전체 혼용율

결과 구역, `netPerKg` 줄 **위**에 혼용율 한 줄을 더한다.

```
혼용율   55% Polyester 39% Rayon 6% Spandex
```

`composeBlend(...).labelText` 를 그대로 쓴다. 원사 구역에 이미 보이는 것과 같은 값이며,
결과만 보고 옮겨 적는 일이 많아 두 곳에 둔다.

값이 없거나(원사 미입력) 경고가 있으면 회색으로 `산출 불가` 를 적는다.
`warnings` 가 있으면 줄 옆에 경고 아이콘을 붙이고 `title` 에 내용을 넣는다.

---

## 4. 하지 말 것

- `composeBlend`, `toDenier`, `computeFabricCost` 의 **계산 로직을 고치지 마라.**
  기준값이 깨진다. 이번 작업은 파싱과 화면뿐이다.
- 형식 (가)와 (나)의 구조를 바꾸지 마라. 번수 부분만 아포스트로피를 받게 넓힌다.
- 맨숫자 굵기(`Span 20`)를 추측해서 받지 마라. `null` 이다.
- `splitYarnDetail` 에서 `/` 로 가르지 마라.
- 투입비를 추측해서 채우지 마라.
- 저장된 계산서를 열 때 자동 채움으로 덮어쓰지 마라.
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- **`ref` 콜백 안에서 `setState` 하지 마라.** 무한 렌더로 화면이 백지가 된다(R119 사고).
- COST SHEET 목록 화면, 원사 시세표, 엑셀 내보내기를 만들지 마라. R270 이다.
- `src/data/cost-sheets.ts`, `schema.ts`, `firestore.rules`, `DevelopmentMasterSheet.tsx` 를
  건드리지 마라. R268 에서 끝났다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 5. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라.** 통과를 본 뒤에 보고해라.
R268 에서 실패한 채로 보고가 올라왔다. 같은 일을 반복하지 마라.

`git status --short` 에 위 표의 두 파일과 이 문서만 더 보여야 한다.

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
