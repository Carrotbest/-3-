# R256 국내 작지(Outsourcing Production Order) 파서 이관

상태: 미착수. 추론 강도 **기본값**(파서·데이터 매핑이다. low로 내리지 마라).

DD MASTER 신규 작지 접수의 "작업지시서 첨부"가 국내 결재 양식을 거부한다. 파이썬 작지변환기에는 이미 국내 파서가 있다. 그것을 웹으로 옮긴다. 덤으로 GD·국내 공통 날짜 버그를 고친다.

## 왜 고치는가

`src/data/zaji.ts` 296행이 국내 양식을 인식해 놓고 일부러 막는다.

```ts
if (fmt === "국내") throw new Error("국내 결재 양식은 아직 지원하지 않습니다. GD 양식(Fabric sample request report)만 지원합니다.")
```

`detectFormat`(192행)은 국내를 이미 판별한다. 파싱 함수만 없다. 원본은 `C:\Users\hkpark\Desktop\업무 자동화\작지변환기_배포\zaji\parser.py`의 `parse_domestic`(392행)이다. 운영 중인 검증된 로직이다. **새로 설계하지 말고 그대로 옮겨라.**

## 확인한 사실

샘플 두 건을 실제로 파싱해 확인했다. 추측이 아니다.

- `C:\Users\hkpark\Downloads\MODAL SUN 작업지시서.xlsx` 시트명 `SA26092808`, 원단 3건
- `C:\Users\hkpark\Downloads\HV100 작업지시서.xlsx` 시트명 `SA26092904`, 원단 4건

국내 양식의 구조는 이렇다.

| 위치 | 내용 |
|---|---|
| A1 | `Outsourcing Production Order Work Sheet` (사염 건은 `Yarn Dyeing Work Sheet`) |
| 시트명 | SA 번호. 셀이 아니라 **시트 이름**에서 가져온다 |
| `Production Order Creater` 오른쪽 | 작성자. `Kim. Ji-Hyun` 처럼 **쉼표가 아니라 마침표**다 |
| `Production Order Created D...` 오른쪽 | 작성일 |
| `Fabric Delivery Date` 오른쪽 | 납기. 샘플 두 건 모두 `~` 뿐이라 빈 값이다 |
| `Part` + `Fabric Content`가 같이 있는 행 | 원단 표 헤더. 이 아래가 옵션이 된다 |
| `Part` + `COLOR`가 같이 있는 행 | 공정 블록 헤더. 바로 아래 행이 업체명 |
| `Remark` 아래 | 공통 비고 |

**원단 표에서 옵션을 만든다.** Part 칸은 비어 있으므로 `B01`, `B02`... 를 순번으로 만든다. 색상 칸(`Color name`)도 비어 있다.

**공정 블록은 첫 블록만 쓴다.** 샘플에는 블록이 3개(MODAL SUN), 4개(HV100) 있고 원단 수와 개수가 같지만 **순서가 대응하지 않는다.** MODAL SUN 세 번째 블록은 편직처가 정우섬유인데, 같은 파일 Yarn Detail 표는 세 번째 원단(Modal 40'S/1)을 송림섬유로 보낸다. 개수만 보고 1:1로 이으면 틀린다. 파이썬과 같이 **첫 블록을 전 옵션에 공통 적용**하라. 순번 매칭을 발명하지 마라.

## A. 날짜가 하루 당겨지는 버그 (GD·국내 공통)

`src/data/zaji.ts` 40~44행.

```ts
function fmtDate(value: Cell): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate()
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
```

SheetJS가 엑셀 일련번호를 Date로 바꿀 때 자정에서 약 52초가 모자라게 나온다. 확인한 값이다.

| 파일 | 셀 | 엑셀 표시 | Date 값 | 지금 결과 |
|---|---|---|---|---|
| GD FSR260901207 | Due date | `10/9/2026` | `2026-10-08T14:59:08Z` | **2026-10-08** |
| GD FSR260901207 | Created date | `2026-09-17` | `2026-09-16T14:59:08Z` | **2026-09-16** |
| MODAL SUN | Created Date | `9/28/26` | `2026-09-27T14:59:08Z` | **2026-09-27** |

**지금 GD 작지를 첨부하면 Due Date가 하루 앞당겨 들어간다.** 위 블록을 아래로 바꿔라.

```ts
function fmtDate(value: Cell): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SheetJS는 엑셀 일련번호를 자정보다 약 52초 이른 Date로 만든다.
    // 그대로 getDate()를 읽으면 날짜가 하루 당겨진다(GD Due date 10/9 → 10-08).
    // 로컬 시각으로 옮긴 뒤 가장 가까운 자정으로 반올림해서 읽는다.
    const shifted = value.getTime() - value.getTimezoneOffset() * 60000
    const day = new Date(Math.round(shifted / 86400000) * 86400000)
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`
  }
```

문자열 분기(45~49행)는 건드리지 마라.

## B. 이름 매칭

`NAME_MAP`(14행)은 `Kim, Ji-Hyun`(쉼표)만 안다. 국내 양식은 `Kim. Ji-Hyun`(마침표)이라 담당이 빈다. `NAME_MAP` 바로 아래에 함수를 더해라.

```ts
/** 작성자 표기를 담당자 이름으로 바꾼다. 국내 결재 양식은 쉼표 대신 마침표를 쓴다. */
function mapName(raw: string): string {
  const key = String(raw ?? "").trim().replace(/\s+/g, " ")
  if (NAME_MAP[key]) return NAME_MAP[key]
  return NAME_MAP[key.replace(/\.\s*/, ", ")] ?? ""
}
```

`parseGd` 안의 `z.developer = NAME_MAP[z.author] ?? ""` 를 `z.developer = mapName(z.author)` 로 바꿔라. 동작은 같다.

## C. Zaji 인터페이스에 두 필드 추가

93행 `export interface Zaji` 에 더한다.

```ts
  /** 국내 양식 공정 블록에서 읽은 (공정명, 업체) 쌍. 화면 표시는 아직 없다. */
  processLabels: [string, string][]
  /** 파일명에서 Style No.를 주웠는지. 사람이 확인해야 한다는 뜻이다. */
  styleFromFilename: boolean
```

`parseGd`의 객체 리터럴(202~207행) 끝에 `processLabels: [], styleFromFilename: false,` 를 더해 타입을 맞춰라.

## D. `makeGrid`에 `millOf` 추가

`makeGrid`의 `belowOf` 바로 뒤, `headerMap` 앞에 넣는다(176행 근처). `return` 객체에도 `millOf`를 더해라.

```ts
  const millOf = (label: string): string => {
    for (const text of [rightOf(label), belowOf(label)]) {
      if (text && !MILL_NOISE.test(text)) return text
    }
    return ""
  }
```

## E. 국내 파서 본체

`parseGd` 끝(287행 `}`) 다음, `// ───── 공개 API` 주석(289행) 앞에 통째로 넣는다.

```ts
// ─────────────────────────────────────────────── 국내 양식
// 원본: 작지변환기_배포/zaji/parser.py 의 parse_domestic. 동작을 바꾸지 말 것.

/** 공정 블록 Color Name 칸에 색상 대신 들어가는 일반 단어. 색상으로 쓰지 않는다. */
const GENERIC_COLOR = /^(color|colour|ground color|color name)$/i

function parseDomestic(rows: Grid, sheetName: string, filename: string): Zaji {
  const g = makeGrid(rows)
  const isYarnDye = /yarn\s*dyeing\s*work\s*sheet/i.test(g.at(0, 0))
  const z: Zaji = {
    fmt: "국내", subFmt: isYarnDye ? "Yarn Dyeing Work Sheet" : "Outsourcing Production Order",
    number: sheetName.trim(), dept: "", created: "", due: "", author: "", developer: "",
    style: "", season: "", brand: "", co: "국내",
    options: [], notes: [], dupRemoved: 0, processLabels: [], styleFromFilename: false,
  }
  z.author = g.rightOf("Production Order Creater")
  z.developer = mapName(z.author)
  z.created = fmtDate(g.rawRightOf("Production Order Created D"))
  z.due = fmtDate(g.rawRightOf("Fabric Delivery Date"))

  // 원단 표 = Part 와 Fabric Content 가 같이 있는 행이 헤더. 빈 행이 나오면 끝이다.
  let header: number | null = null
  for (let r = 0; r < rows.length; r++) {
    const texts = g.rowTexts(r)
    if (texts.includes("Part") && texts.some((t) => t.toLowerCase() === "fabric content")) { header = r; break }
  }
  if (header !== null) {
    const cols = g.headerMap(header)
    const cFabric = cols["Fabric"] ?? 1
    const cGsm = cols["g/㎡"] ?? cols["g/m2"] ?? 22
    for (let r = header + 1; r < rows.length; r++) {
      const fabric = g.at(r, cFabric)
      if (!fabric) break
      const [yarn, cons] = splitYarn(fabric)
      // Part 칸이 비어 있는 양식이라 순번으로 BODY 번호를 만든다.
      z.options.push({
        part: `B0${z.options.length + 1}`, color: g.at(r, cols["Color name"]),
        weight: g.at(r, cGsm), yarn, cons, rawName: fabric, remark: "", dyeing: "",
        mills: { yarn: "", knit: "", dye: "", finish: "" },
      })
    }
  }

  // 공정 블록 = Part 와 COLOR 가 같이 있는 행. 블록이 여럿이어도 첫 블록만 쓴다.
  // 블록 순서와 원단 순서가 대응하지 않는다(MODAL SUN 3번 블록 정우 vs Yarn Detail 송림).
  const mills = { yarn: "", knit: "", dye: "", finish: "" }
  let dyeing = isYarnDye ? "YD" : ""
  let blockColor = ""
  for (let r = 0; r < rows.length; r++) {
    const texts = g.rowTexts(r)
    if (!texts.includes("Part") || !texts.some((t) => t.toUpperCase() === "COLOR")) continue
    texts.forEach((label, i) => {
      if (!label || /^(Part|COLOR|Ground Color|Color Name|OUTPUT|GARMENT)$/i.test(label)) return
      const mill = g.at(r + 1, i)
      if (!mill || MILL_NOISE.test(mill)) return
      z.processLabels.push([label, mill])
    })
    const cColor = texts.findIndex((t) => /^color name$/i.test(t))
    if (cColor >= 0) {
      for (let rr = r + 1; rr < Math.min(r + 5, rows.length); rr++) {
        const value = g.at(rr, cColor)
        if (!value || MILL_NOISE.test(value) || GENERIC_COLOR.test(value)) continue
        blockColor = value
        break
      }
    }
    break
  }

  for (const [label, mill] of z.processLabels) {
    if (/knitting/i.test(label)) mills.knit = mill
    else if (/yarn\s*dyeing/i.test(label)) { mills.yarn = mill; dyeing = "YD" }
    else if (/fabric\s*dyeing/i.test(label)) { mills.dye = mill; dyeing = dyeing || "CSD" }
    else if (/finish|setting|washing|brush|coating|printing/i.test(label)) mills.finish = mill
    else if (!mills.dye) mills.dye = mill
  }

  if (!mills.knit) {
    const v = g.millOf("Knitting Company")
    if (v) { mills.knit = v; z.processLabels.push(["Knitting Company", v]) }
  }
  if (!mills.yarn) {
    const v = g.millOf("Yarn Dyeing Company")
    if (v) { mills.yarn = v; dyeing = dyeing || "YD"; z.processLabels.push(["Yarn Dyeing Company", v]) }
  }

  // 공정 블록이 없는 생지 발주 건은 Yarn Detail 표의 Mill 칸에서 줍는다.
  if (!mills.knit || !mills.yarn) {
    for (let r = 0; r < rows.length; r++) {
      const texts = g.rowTexts(r)
      if (!texts.some((t) => t.toLowerCase() === "yarn detail")) continue
      let hit = false
      texts.forEach((t, i) => {
        if (!/^(Mill\/Knitter|Y\/D Mill)$/i.test(t)) return
        const mill = g.at(r + 1, i)
        if (!mill) return
        if (/Y\/D/i.test(t)) { if (!mills.yarn) { mills.yarn = mill; dyeing = dyeing || "YD" } }
        else if (!mills.knit) mills.knit = mill
        if (!z.processLabels.some(([label, value]) => label === t && value === mill)) z.processLabels.push([t, mill])
        hit = true
      })
      if (hit) break
    }
  }

  // 국내 양식에는 옵션별 Remark 열이 없다. Remark 블록을 공통으로 적용한다.
  const notePos = g.find("Remark")
  if (notePos) {
    for (let r = notePos[0] + 1; r < Math.min(notePos[0] + 6, rows.length); r++) {
      const texts = g.rowTexts(r).filter(Boolean)
      if (!texts.length) continue
      const text = String(cellSafe(texts.join(" ")))
      if (text) z.notes.push(text)
    }
  }
  const commonRemark = z.notes.join(" / ")

  for (const option of z.options) {
    option.mills = { ...mills }
    option.dyeing = dyeing
    if (!option.color) option.color = blockColor
    if (!option.remark) option.remark = commonRemark
  }

  const m = (filename || "").match(/(HMP|FL|AN)\d{6,}/i)
  if (m) { z.style = m[0].toUpperCase(); z.styleFromFilename = true }
  return z
}
```

## F. 공개 API 연결

290~303행을 아래로 바꾼다. 파일명이 필요해서 인자가 하나 늘어난다.

```ts
export function parseZajiBuffer(data: ArrayBuffer | Uint8Array, filename = ""): Zaji {
  const wb = XLSX.read(data, { type: "array", cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, blankrows: true, defval: null })
  const fmt = detectFormat(rows)
  if (fmt === null) throw new Error("작지 양식을 인식하지 못했습니다. GD 양식(Fabric sample request report)과 국내 결재 양식(Outsourcing Production Order / Yarn Dyeing Work Sheet)만 지원합니다.")
  return fmt === "국내" ? parseDomestic(rows, sheetName, filename) : parseGd(rows)
}

export async function parseZaji(file: File): Promise<Zaji> {
  return parseZajiBuffer(await file.arrayBuffer(), file.name)
}
```

305행 `__test` 에 `parseDomestic` 을 더해라.

```ts
export const __test = { convertSeason, splitYarn, matchDyeing, fmtDate, detectFormat, parseGd, parseDomestic }
```

`parseZajiBuffer` 를 부르는 곳은 저장소에 없다. 두 번째 인자는 기본값이 있어 기존 호출이 깨지지 않는다.

## G. SA 번호를 레코드에 넣는다

`applyZajiHeader`(318행)의 반환 객체에 한 줄 더한다. **GD의 FSR 번호를 saNo에 넣지 마라.** 파이썬 `tds.py` 568행과 같은 규칙이다.

```ts
    saNo: z.fmt === "국내" ? (z.number || record.saNo) : record.saNo,
```

`styleNo`, `season`, `dueDate` 줄은 그대로 둔다.

## H. 화면 안내 문구

`src/routes/DevelopmentMasterSheet.tsx` 3106행. 첨부 전에 뜨는 안내다.

지금

```tsx
<span className="text-xs text-[var(--muted-foreground)]">GD 작지(Fabric sample request report .xlsx)를 지원합니다.</span>
```

바꾼 뒤

```tsx
<span className="text-xs text-[var(--muted-foreground)]">GD 작지와 국내 결재 작지(.xlsx)를 지원합니다.</span>
```

이 파일에서 다른 줄은 손대지 마라.

## 기대 결과

이 값이 나와야 한다. 실제로 파싱해 뽑은 값이다.

**MODAL SUN 작업지시서.xlsx** — subFmt `Outsourcing Production Order`, number `SA26092808`, author `Kim. Ji-Hyun`, developer `김지현`, created `2026-09-28`, due 빈 값, style 빈 값, 옵션 3건.

| # | part | cons | weight | yarn | color | dyeing | 편직 | 염색 |
|---|---|---|---|---|---|---|---|---|
| 1 | B01 | 2*2 Rib | 190 | CM/Modal 60/40 40'S/1 + Spandex BRT 20D/1F SDY | (빈 값) | CSD | 송림섬유 | 일신방직(주)반월공장 |
| 2 | B02 | Single Jersey | 160 | CM/Modal 60/40 40'S/1 + Spandex BRT 20D/1F SDY | (빈 값) | CSD | 송림섬유 | 일신방직(주)반월공장 |
| 3 | B03 | Single Jersey | 160 | Modal 40'S/1 + Spandex BRT 20D/1F SDY | (빈 값) | CSD | 송림섬유 | 일신방직(주)반월공장 |

**HV100 작업지시서.xlsx** — number `SA26092904`, developer `김지현`, created `2026-09-29`, 옵션 4건, 색상은 네 건 모두 `WT`, 가공처 `대우섬유`.

| # | part | cons | weight | yarn |
|---|---|---|---|---|
| 1 | B01 | 2*2 Rib | 190 | Lyocell(Standard) 30'S/1 |
| 2 | B02 | Single Jersey | 150 | Lyocell(Standard) 30'S/1 |
| 3 | B03 | 2*2 Rib | 190 | Lyocell(Standard) 40'S/1 + Spandex BRT 20D/1F SDY |
| 4 | B04 | Single Jersey | 160 | Lyocell(Standard) 40'S/1 + Spandex BRT 20D/1F SDY |

두 건 모두 편직 송림섬유, 염색 일신방직(주)반월공장, 원사처는 빈 값이다.

`created`가 `2026-09-27`, `2026-09-28`로 나오면 A를 안 한 것이다.

## 고칠 파일

| 파일 | 범위 |
|---|---|
| `src/data/zaji.ts` | A~G 전부 |
| `src/routes/DevelopmentMasterSheet.tsx` | H, 3106행 한 줄만 |

다른 파일은 열지 않는다. `zaji/parser.py`는 **읽기만** 한다.

## 손대지 말 것

- `parseGd` 본체. B의 `mapName` 한 줄과 C의 필드 두 개 말고는 그대로다
- `detectFormat`. 국내를 이미 맞게 판별한다
- `CONSTRUCTIONS`, `splitYarn`, `findConstruction`, `matchDyeing`
- `INTAKE_REQUIRED_IDS`. 국내 작지에 Style No.·Season·Buyer·Planner가 없다고 필수 목록을 풀지 마라. 사람이 채운다
- `applyZajiOption`의 `intakeSource` 키 계산
- 엑셀 업로드 경로를 새로 만들지 마라. 첨부는 입력 문서라 예외다

## 반복 실수 방지

- **공정 블록을 원단 순서에 1:1로 잇지 마라.** 개수가 같아도 순서가 다르다. 위에 근거를 적었다
- **`z.number`는 셀이 아니라 시트 이름이다.** `Production Requisition No : SA26092808` 문자열을 파싱하려 들지 마라
- **`fmtDate` 문자열 분기를 건드리지 마라.** Date 분기만 바꾼다
- **`parseZajiBuffer`의 두 번째 인자에 기본값을 빼지 마라.** 타입 오류가 난다
- 원단 표는 **빈 행에서 끊는다**(`break`). `continue`로 바꾸면 아래 공정 블록까지 옵션으로 빨려 들어간다

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. `git status --short`에 `src/data/zaji.ts`, `src/routes/DevelopmentMasterSheet.tsx`, 이 문서만 나와야 한다.

화면 확인은 사용자가 한다. 두 샘플 파일을 DD MASTER 신규 작지 접수에서 첨부해 위 표와 맞는지 본다.
