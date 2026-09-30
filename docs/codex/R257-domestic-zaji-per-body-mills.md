# R257 국내 작지 공정 업체를 BODY별로 파싱

상태: 미착수. 추론 강도 **기본값**(파서다. low로 내리지 마라).

국내 결재 작지를 DD MASTER 신규 작지 접수에 첨부하면 옵션이 몇 개든 편직·염색·가공 업체가 **첫 공정 블록 값으로 전부 같게** 들어간다. 공정 블록 하나가 BODY 하나이므로 순서대로 이어야 한다.

## 틀렸던 가설 (R256) — 다시 시도하지 말 것

R256은 "블록 순서와 원단 순서가 대응하지 않는다"고 적고 첫 블록을 전 옵션에 공통 적용했다. **이 판단이 틀렸다.**

근거로 삼았던 것은 Yarn Detail 표였다. `MODAL SUN` 세 번째 블록 편직처는 `(주)정우섬유`인데 Yarn Detail 세 번째 칸은 `Modal 40'S/1 / 송림섬유`라서 어긋난다고 봤다. **Yarn Detail 표는 BODY 표가 아니라 원사 박스 배분표다.** 같은 원사가 두 업체로 나뉘어 나가므로 줄 수도 순서도 BODY와 무관하다. `MODAL SUN` Remark가 이것을 그대로 적어 두었다. CM/MODAL 60/40 40S/1 1BOX는 송림, 1BOX는 정우다.

BODY 대응은 공정 블록 순서가 맞다. 2026-09-30에 박향근이 `MODAL SUN`의 B03 편직처는 `(주)정우섬유`라고 확인했다. 세 번째 블록 값과 같다.

**Yarn Detail 표의 업체 순서를 옵션에 잇지 마라.** 공정 블록이 없을 때 빈 칸을 채우는 마지막 수단으로만 쓴다(지금 코드가 이미 그렇게 한다).

## 확인한 사실

두 파일을 실제로 파싱해 뽑았다. 추측이 아니다.

`MODAL SUN 작업지시서.xlsx` 시트 `SA26092808`. 원단 3건, 공정 블록 3개.

| 블록 | 헤더 행 | Knitting | Fabric Dyeing |
|---|---|---|---|
| 1 | 16 | 송림섬유 | 일신방직(주)반월공장 |
| 2 | 21 | 송림섬유 | 일신방직(주)반월공장 |
| 3 | 26 | (주)정우섬유 | 일신방직(주)반월공장 |

`HV100 작업지시서.xlsx` 시트 `SA26092904`. 원단 4건, 공정 블록 4개.

| 블록 | 헤더 행 | Knitting | Fabric Dyeing | Spray Washing |
|---|---|---|---|---|
| 1 | 19 | 송림섬유 | 일신방직(주)반월공장 | 대우섬유 |
| 2 | 24 | 송림섬유 | 일신방직(주)반월공장 | (없음) |
| 3 | 29 | (주)정우섬유 | 일신방직(주)반월공장 | 대우섬유 |
| 4 | 34 | (주)정우섬유 | 일신방직(주)반월공장 | (없음) |

블록 1·3에만 Spray Washing이 있고, 원단 표에서 1·3번 원단만 `2*2 Rib`다(2·4번은 `Single Jersey`). 블록과 원단이 순서대로 붙는다는 두 번째 근거다.

## 고칠 파일

| 파일 | 범위 |
|---|---|
| `src/data/zaji.ts` | 편집 1~6 전부 |

다른 파일은 열지 않는다. 화면 코드(`src/routes/DevelopmentMasterSheet.tsx`)는 손대지 않는다. 옵션 그리드의 `knittingMill` 열이 이미 레코드별 `tech.mills.knitting`을 읽고, `applySharedFields`는 `tech.mills`를 건드리지 않는다. 파서만 고치면 화면이 따라온다.

## 편집 1. `ZajiOption`에 `processLabels` 추가 (105~116행)

`mills` 줄 다음에 한 줄 더한다.

```ts
  mills: { yarn: string; knit: string; dye: string; finish: string }
  /** 이 BODY에 걸린 공정 블록의 (공정명, 업체) 쌍. 화면 표시는 아직 없다. */
  processLabels: [string, string][]
```

## 편집 2. `Zaji`에 `processBlockMismatch` 추가 (133~137행)

`processLabels` 주석과 필드 아래에 더한다.

```ts
  /** 국내 양식 공정 블록에서 읽은 (공정명, 업체) 쌍 전량. 중복은 뺀다. 화면 표시는 아직 없다. */
  processLabels: [string, string][]
  /** 공정 블록이 둘 이상인데 원단 수와 달라 BODY별로 잇지 못했다는 뜻. 첫 블록을 공통 적용했다. */
  processBlockMismatch: boolean
```

## 편집 3. `parseGd` 두 곳에 필드 채우기

228행.

```ts
    options: [], notes: [], dupRemoved: 0, processLabels: [], styleFromFilename: false,
```

이것을 아래로 바꾼다.

```ts
    options: [], notes: [], dupRemoved: 0, processLabels: [], processBlockMismatch: false, styleFromFilename: false,
```

301~305행.

```ts
    z.options.push({
      part: o.part, color: o.color, weight: pt.weight, yarn, cons, rawName: pt.name, remark,
      dyeing: matchDyeing(o.color, pt.dyeing),
      mills: { yarn: z.co, knit: z.co, dye: z.co, finish: z.co },
    })
```

마지막 속성 뒤에 `processLabels: [],` 만 더한다.

```ts
    z.options.push({
      part: o.part, color: o.color, weight: pt.weight, yarn, cons, rawName: pt.name, remark,
      dyeing: matchDyeing(o.color, pt.dyeing),
      mills: { yarn: z.co, knit: z.co, dye: z.co, finish: z.co },
      processLabels: [],
    })
```

`parseGd`의 다른 줄은 손대지 마라.

## 편집 4. `parseDomestic` 리터럴 두 곳

323행을 아래로 바꾼다.

```ts
    options: [], notes: [], dupRemoved: 0, processLabels: [], processBlockMismatch: false, styleFromFilename: false,
```

345~349행 원단 표 옵션 push에 `processLabels: [],` 를 더한다.

```ts
      z.options.push({
        part: `B0${z.options.length + 1}`, color: g.at(r, cols["Color name"]),
        weight: g.at(r, cGsm), yarn, cons, rawName: fabric, remark: "", dyeing: "",
        mills: { yarn: "", knit: "", dye: "", finish: "" }, processLabels: [],
      })
```

## 편집 5. 공정 블록 수집을 전량으로 바꾼다 (353~413행 교체)

353행 `// 공정 블록 = Part 와 COLOR 가 같이 있는 행. 블록이 여럿이어도 첫 블록만 쓴다.` 부터 413행(Yarn Detail 폴백 `if (hit) break }` 를 닫는 곳, 415행 `// 국내 양식에는 옵션별 Remark 열이 없다.` 바로 앞)까지를 통째로 아래로 바꾼다.

```ts
  // 공정 블록 = Part 와 COLOR 가 같이 있는 행. 블록 하나가 BODY 하나이고 행 순서가 원단 표 순서다.
  // 근거 1: 사용자 확인. MODAL SUN 3번 블록 (주)정우섬유가 B03 편직처다(2026-09-30).
  // 근거 2: HV100은 블록 1·3에만 Spray Washing이 있고 원단 1·3만 2*2 Rib다.
  // Yarn Detail 표는 원사 박스 배분표라 BODY 순서와 무관하다. 거기 순서를 옵션에 잇지 마라.
  type ProcessBlock = {
    mills: { yarn: string; knit: string; dye: string; finish: string }
    dyeing: string
    color: string
    labels: [string, string][]
  }
  const blocks: ProcessBlock[] = []
  for (let r = 0; r < rows.length; r++) {
    const texts = g.rowTexts(r)
    if (!texts.includes("Part") || !texts.some((t) => t.toUpperCase() === "COLOR")) continue
    const labels: [string, string][] = []
    texts.forEach((label, i) => {
      if (!label || /^(Part|COLOR|Ground Color|Color Name|OUTPUT|GARMENT)$/i.test(label)) return
      const mill = g.at(r + 1, i)
      if (!mill || MILL_NOISE.test(mill)) return
      labels.push([label, mill])
    })
    const mills = { yarn: "", knit: "", dye: "", finish: "" }
    let blockDyeing = isYarnDye ? "YD" : ""
    for (const [label, mill] of labels) {
      if (/knitting/i.test(label)) mills.knit = mill
      else if (/yarn\s*dyeing/i.test(label)) { mills.yarn = mill; blockDyeing = "YD" }
      else if (/fabric\s*dyeing/i.test(label)) { mills.dye = mill; blockDyeing = blockDyeing || "CSD" }
      else if (/finish|setting|washing|brush|coating|printing/i.test(label)) mills.finish = mill
      else if (!mills.dye) mills.dye = mill
    }
    let color = ""
    const cColor = texts.findIndex((t) => /^color name$/i.test(t))
    if (cColor >= 0) {
      for (let rr = r + 1; rr < Math.min(r + 5, rows.length); rr++) {
        const value = g.at(rr, cColor)
        if (!value || MILL_NOISE.test(value) || GENERIC_COLOR.test(value)) continue
        color = value
        break
      }
    }
    blocks.push({ mills, dyeing: blockDyeing, color, labels })
  }

  // 블록 수가 원단 수와 같으면 순서대로 잇는다. 블록이 하나면 전 옵션 공통이다.
  // 개수가 다르고 블록이 여럿이면 순서를 믿을 수 없으니 첫 블록을 공통 적용하고 표시만 남긴다.
  const perBody = blocks.length > 0 && blocks.length === z.options.length
  z.processBlockMismatch = blocks.length > 1 && !perBody
  const blockFor = (index: number): ProcessBlock | undefined => (perBody ? blocks[index] : blocks[0])

  // 블록에서 못 얻은 공정만 문서 전체에서 줍는다. 블록 값을 덮어쓰지 않는다.
  const fallback = { yarn: "", knit: "", dye: "", finish: "" }
  let fallbackDyeing = isYarnDye ? "YD" : ""
  const fallbackLabels: [string, string][] = []
  const haveKnit = blocks.some((b) => b.mills.knit)
  const haveYarn = blocks.some((b) => b.mills.yarn)
  if (!haveKnit) {
    const v = g.millOf("Knitting Company")
    if (v) { fallback.knit = v; fallbackLabels.push(["Knitting Company", v]) }
  }
  if (!haveYarn) {
    const v = g.millOf("Yarn Dyeing Company")
    if (v) { fallback.yarn = v; fallbackDyeing = fallbackDyeing || "YD"; fallbackLabels.push(["Yarn Dyeing Company", v]) }
  }

  // 공정 블록이 없는 생지 발주 건은 Yarn Detail 표의 Mill 칸에서 줍는다. 첫 표만 본다.
  if ((!haveKnit && !fallback.knit) || (!haveYarn && !fallback.yarn)) {
    for (let r = 0; r < rows.length; r++) {
      const texts = g.rowTexts(r)
      if (!texts.some((t) => t.toLowerCase() === "yarn detail")) continue
      let hit = false
      texts.forEach((t, i) => {
        if (!/^(Mill\/Knitter|Y\/D Mill)$/i.test(t)) return
        const mill = g.at(r + 1, i)
        if (!mill) return
        if (/Y\/D/i.test(t)) { if (!haveYarn && !fallback.yarn) { fallback.yarn = mill; fallbackDyeing = fallbackDyeing || "YD" } }
        else if (!haveKnit && !fallback.knit) fallback.knit = mill
        if (!fallbackLabels.some(([label, value]) => label === t && value === mill)) fallbackLabels.push([t, mill])
        hit = true
      })
      if (hit) break
    }
  }
```

## 편집 6. 옵션 적용 루프를 블록별로 바꾼다 (427~432행 교체)

지금 코드다(425행 `const commonRemark` 다음).

```ts
  for (const option of z.options) {
    option.mills = { ...mills }
    option.dyeing = dyeing
    if (!option.color) option.color = blockColor
    if (!option.remark) option.remark = commonRemark
  }
```

아래로 바꾼다.

```ts
  for (let i = 0; i < z.options.length; i++) {
    const option = z.options[i]
    const block = blockFor(i)
    option.mills = {
      yarn: block?.mills.yarn || fallback.yarn,
      knit: block?.mills.knit || fallback.knit,
      dye: block?.mills.dye || fallback.dye,
      finish: block?.mills.finish || fallback.finish,
    }
    option.dyeing = block?.dyeing || fallbackDyeing
    option.processLabels = [...(block?.labels ?? [])]
    for (const [label, mill] of fallbackLabels) {
      if (!option.processLabels.some(([l, v]) => l === label && v === mill)) option.processLabels.push([label, mill])
    }
    if (!option.color) option.color = block?.color ?? ""
    if (!option.remark) option.remark = commonRemark
  }

  // 문서 단위 목록은 블록 전량을 중복 없이 모은 것이다.
  z.processLabels = []
  for (const pairs of [...blocks.map((b) => b.labels), fallbackLabels]) {
    for (const [label, mill] of pairs) {
      if (!z.processLabels.some(([l, v]) => l === label && v === mill)) z.processLabels.push([label, mill])
    }
  }
```

편집 5·6을 하면 옛 변수 `mills`, `dyeing`, `blockColor`가 없어진다. 남겨 두면 `tsc`가 잡는다. 두 편집을 한 번에 끝내라.

## 기대 결과

`MODAL SUN 작업지시서.xlsx` 옵션 3건.

| # | part | g/㎡ | 조직 | 편직 | 염색 | 가공 | dyeing |
|---|---|---|---|---|---|---|---|
| 1 | B01 | 190 | 2*2 Rib | 송림섬유 | 일신방직(주)반월공장 | (빈 값) | CSD |
| 2 | B02 | 160 | Single Jersey | 송림섬유 | 일신방직(주)반월공장 | (빈 값) | CSD |
| 3 | B03 | 160 | Single Jersey | **(주)정우섬유** | 일신방직(주)반월공장 | (빈 값) | CSD |

`HV100 작업지시서.xlsx` 옵션 4건. 색상은 네 건 모두 `WT`.

| # | part | g/㎡ | 조직 | 편직 | 염색 | 가공 |
|---|---|---|---|---|---|---|
| 1 | B01 | 190 | 2*2 Rib | 송림섬유 | 일신방직(주)반월공장 | 대우섬유 |
| 2 | B02 | 150 | Single Jersey | 송림섬유 | 일신방직(주)반월공장 | (빈 값) |
| 3 | B03 | 190 | 2*2 Rib | (주)정우섬유 | 일신방직(주)반월공장 | 대우섬유 |
| 4 | B04 | 160 | Single Jersey | (주)정우섬유 | 일신방직(주)반월공장 | (빈 값) |

R256 문서의 HV100 기대표는 "가공처 네 건 모두 대우섬유"라고 적었다. 그것이 틀렸다. 2·4번은 블록에 Spray Washing이 없어 빈 값이 맞다. 원사처는 두 파일 모두 네 건 다 빈 값이다.

헤더 값은 R256과 같다. `number`는 시트 이름, `developer`는 김지현, `created`는 `2026-09-28`(MODAL SUN)과 `2026-09-29`(HV100)다.

## 손대지 말 것

- `parseGd` 본체. 편집 3의 필드 두 개 말고는 그대로다
- `fmtDate`, `detectFormat`, `splitYarn`, `matchDyeing`, `CONSTRUCTIONS`, `millOf`
- 원단 표 파싱 부분(330~350행). 빈 행 `break`를 `continue`로 바꾸지 마라. 공정 블록까지 옵션으로 빨려 들어간다
- `applyZajiHeader`, `applyZajiOption`, `zajiToRecord`. 옵션별 `mills`를 이미 그대로 넘긴다
- `src/routes/DevelopmentMasterSheet.tsx`. 이번에는 고칠 것이 없다
- `MILL_NOISE`, `GENERIC_COLOR` 정규식
- 엑셀 업로드 경로를 새로 만들지 마라

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. `git status --short`에 `src/data/zaji.ts`와 이 문서만 나와야 한다.

화면 확인은 사용자가 한다. DD MASTER 신규 작지 접수에서 두 파일을 첨부해 위 표와 맞는지 본다.
