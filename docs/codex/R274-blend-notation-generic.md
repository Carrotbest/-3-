# R274 혼방 표기를 일반 규칙으로 파싱

상태: **미착수.** R273 까지 구현 완료.
실사용 중 `CM/Polyester 60/40 30'S/1` 이 해석되지 않아 성분을 손으로 채우고 있다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/data/yarn-blend.ts` | `parseYarnSpec` 혼방 분기를 고정 목록에서 일반 규칙으로 넓힌다 |

이 파일 하나만 고친다. `fabric-cost.ts`, `CostSheetDialog.tsx`, `cost-*.ts` 를 건드리지 마라.

---

## 1. 지금 무엇이 막혀 있나

`parseYarnSpec` 135행 혼방 분기의 정규식이다.

```ts
const spun = /^(CVC|T\/C|T\/R|C\/R|R\/C|C\/P\/R|T\/C\/R)\s+(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)\s+(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?(?:\s+.*)?$/i.exec(text)
```

머리 토큰이 `BLEND_NOTATIONS` 일곱 개 중 하나일 때만 걸린다.
`CM/Polyester`, `Cotton/Rayon`, `C/T` 같은 표기는 목록에 없어 통째로 `null` 이 된다.

**그런데 그 일곱 개 중 `CVC` 를 뺀 여섯 개는 전부 약어를 순서대로 읽은 것이다.**
`T/C` 는 `t`→Polyester, `c`→Cotton 이고 `C/P/R` 은 `c`,`p`,`r` 이다. 전부 `FIBER_ALIASES` 에 있다.
`CVC` 만 슬래시가 없고 이름에서 섬유를 못 읽는 진짜 예외다.

## 2. 바꾸는 것

머리 토큰을 **슬래시로 이어진 알파벳 토큰 2개 이상**으로 받고, 섬유 결정은 두 단계로 한다.

1. 토큰 전체를 대문자로 만든 값이 `BLEND_NOTATIONS` 에 있으면 **그 표를 먼저 쓴다.**
2. 없으면 토큰을 `/` 로 갈라 `normalizeFiber` 로 하나씩 푼다. 하나라도 못 풀면 `null`.

**1번이 먼저다.** 기존 일곱 개의 동작이 조금도 달라지면 안 된다.
특히 `T/C` 는 표에서 `[Polyester, Cotton]` 이고 일반 규칙으로 풀어도 같지만,
`CVC` 는 일반 규칙으로는 못 푼다. 순서를 뒤집지 마라.

### 2-1. 교체할 코드

135~159행 `spun` 블록 전체를 바꾼다. 정규식의 **머리 토큰 부분만** 넓히고
퍼센트, 번수, 꼬리 부분은 **한 글자도 바꾸지 마라.**

```ts
  const spun = /^([A-Za-z]+(?:\s*\/\s*[A-Za-z]+)+)\s+(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)\s+(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?(?:\s+.*)?$/i.exec(text)
    ?? /^(CVC)\s+(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*)\s+(\d+(?:\.\d+)?)\s*['’´]?\s*[Ss]?\s*(?:\/\s*1)?(?:\s+.*)?$/i.exec(text)
  if (spun) {
    const notation = spun[1].toUpperCase().replace(/\s+/g, "")
    const fibers = BLEND_NOTATIONS[notation]
      ?? notation.split("/").map(normalizeFiber).filter((fiber): fiber is string => fiber !== null)
    const tokenCount = BLEND_NOTATIONS[notation] ? fibers.length : notation.split("/").length
    const percentages = spun[2].split("/").map(Number)
    const nominal = Number(spun[3])
    if (
      fibers.length !== tokenCount
      || fibers.length < 2
      || percentages.length !== fibers.length
      || percentages.some((pct) => !Number.isFinite(pct) || pct < 0)
      || Math.abs(percentages.reduce((sum, pct) => sum + pct, 0) - 100) > 1e-9
      || !Number.isFinite(nominal)
      || nominal <= 0
    ) return null

    return {
      raw,
      components: [{
        fiber: fibers[0],
        nominal,
        unit: "Ne",
        mode: "plain",
        blend: fibers.map((fiber, index) => ({ fiber, pct: percentages[index] })),
      }],
    }
  }
```

핵심은 `tokenCount` 비교다. `normalizeFiber` 가 `null` 을 내면 `filter` 가 그 토큰을 버리는데,
버린 채로 넘어가면 `A/Unknown/B 50/30/20` 이 2성분으로 조용히 통과한다.
토큰 수와 푼 섬유 수가 다르면 `null` 을 내보낸다.

`\s*\/\s*` 로 받으므로 `CM / Polyester` 처럼 띄어 쓴 것도 들어온다.
`replace(/\s+/g, "")` 가 표 조회 전에 공백을 지운다.

### 2-2. `BLEND_NOTATIONS` 와 `FIBER_ALIASES`

**둘 다 기존 항목을 지우거나 바꾸지 마라.** 더하기만 한다.
이번 건에서 더할 것은 없다. `cotton`, `polyester`, `rayon`, `modal`, `lyocell`, `tencel`,
`spandex`, `nylon`, `acrylic`, `wool`, `linen`, `viscose`, `polyamide` 가 이미 다 들어 있다.
목록에 없는 섬유를 추측해서 넣지 마라.

---

## 3. 기준값

바꾼 뒤 이렇게 나와야 한다. **클로드가 직접 대조하므로 너는 검증하지 마라.**

| 입력 | 기대 |
|---|---|
| `CM/Polyester 60/40 30'S/1` | 성분 1개, fiber `Cotton`, 30 `Ne`, blend `Cotton 60` `Polyester 40` |
| `Cotton/Rayon/Spandex 60/35/5 30's/1` | blend 3개, 순서대로 60/35/5 |
| `CVC 60/40 30's/1` | blend `Cotton 60` `Polyester 40` (표 그대로) |
| `T/C 60/40 30's/1` | blend `Polyester 60` `Cotton 40` (**표가 이긴다**) |
| `T/R 70/30 30's/1 Siro` | blend `Polyester 70` `Rayon 30` (기존 동작 유지) |
| `CM/Unknown 60/40 30's/1` | `null` |
| `CM/Polyester 60/30 30's/1` | `null` (합이 100이 아님) |
| `CM26's/1` | 단독, `Cotton` 26 `Ne` (기존 동작 유지) |
| `cvr sp/pe 20/40` | 커버링 (기존 동작 유지) |
| `SP30D` | 단독, `Spandex` 30 `D` (기존 동작 유지) |
| `Span 20` | `null` (기존 동작 유지) |

---

## 4. 하지 말 것

- **표 조회를 일반 규칙보다 뒤에 두지 마라.** `CVC` 가 깨진다.
- `BLEND_NOTATIONS`, `FIBER_ALIASES`, `FTC_LABEL_NAME` 의 기존 항목을 지우거나 바꾸지 마라.
- 커버링 분기(`^cvr …`)와 단독 분기(`filament`, `singleSpun`)를 건드리지 마라.
- 정규식의 퍼센트, 번수, 꼬리 부분을 바꾸지 마라. 아포스트로피 세 종류(`'` `’` `´`)와 꼬리 무시가 거기 있다.
- 퍼센트 합 100 검사와 개수 일치 검사를 빼지 마라.
- **맨숫자 굵기(`Span 20`)를 받지 마라.** 여전히 `null` 이다. 방적사인지 필라멘트인지 추측하지 마라.
- `composeBlend`, `toDenier`, `guessCountUnit`, `splitYarnDetail` 을 건드리지 마라.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 5. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
